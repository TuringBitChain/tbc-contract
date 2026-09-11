'use strict';

// OFFLINE ONLY. The funding parent is a synthetic trusted fixture and the
// commit callback is an explicit in-memory acceptance simulation. No network,
// real wallet, real UTXO, key file, node-finality or confirmation is involved.
// All descendants use actual TBC20/Pool3/LP scripts, signatures and local VM.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const tbc = require('tbc-lib-js');
const TBC20 = require('../../lib/contract/tbc20.js');
const { FTLPTBC20: LP } = require('../../lib/contract/ftlpTbc20.js');
const { privateKeySigner } = require('../../lib/util/poolnft3/transaction.js');
const { buildFutureLockSetup } = require('./pool3-testnet-locktime.cjs');

const TARGET_HEIGHT = 777777;
const fixtureKey = n => new tbc.PrivateKey(n.toString(16).padStart(64, '0'));

// The dependency's interpreter writes debug stacks. Tests in this file run
// serially; silence it only for this offline test and always restore the logger.
async function quiet(fn) {
  const original = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = original; }
}

function fixture() {
  const owner = fixtureKey(8201), lpOwner = fixtureKey(8202);
  const funder = fixtureKey(8203), poolFt = fixtureKey(8204);
  const signers = { owner: privateKeySigner(owner), lpOwner: privateKeySigner(lpOwner),
    poolFt: privateKeySigner(poolFt) };
  const root = new tbc.Transaction();
  root.uncheckedAddInput(new tbc.Transaction.Input({ prevTxId: Buffer.alloc(32, 0x61), outputIndex: 0,
    sequenceNumber: 0xffffffff, script: new tbc.Script() }));
  for (const key of [owner, funder]) root.addOutput(new tbc.Transaction.Output({
    script: tbc.Script.buildPublicKeyHashOut(key.toAddress()), satoshis: 100_000_000 }));
  const token = new TBC20({ extensionData: Buffer.from('040102030409', 'hex') });
  const minted = token.mint(owner, owner.toAddress().toString(), 2_000_000_000n, {
    txId: root.id, outputIndex: 0, script: root.outputs[0].script.toHex(), satoshis: root.outputs[0].satoshis,
  });
  const localTransactions = new Map([root, minted.sourceTransaction, minted.transaction].map(tx => [tx.id, tx]));
  return { signers, ftGenesisTx: minted.transaction, localTransactions, targetLockTime: TARGET_HEIGHT,
    userFT: { parentTx: minted.transaction, outputIndex: 0, signer: signers.owner, ancestors: localTransactions },
    funding: { parentTx: root, outputIndex: 1, signer: privateKeySigner(funder) } };
}

test('future LP setup keeps unlock uncommitted and preserves owner; simulated mature cleanup returns all reserves', () => quiet(async () => {
  const input = fixture(), chain = input.localTransactions, accepted = [];
  const result = await buildFutureLockSetup({ ...input, commit: async (built, label) => {
    assert.equal(built.transaction.nLockTime, 0, 'setup must not be future dated');
    assert.equal(built.validation.success, true);
    assert(!chain.has(built.txid), 'builder must not register before simulated acceptance');
    assert.equal(chain.size, 3 + accepted.length);
    accepted.push({ result: built, label });
    return true; // Synthetic acceptance only; not evidence of node acceptance.
  } });
  assert.deepEqual(accepted.map(item => item.label), ['future-lock/mint-source', 'future-lock/mint-pool',
    'future-lock/add-future-locked-lp']);
  assert.equal(result.history.length, 3);
  assert.equal(chain.size, 6);
  assert.equal(result.unlockSubmitted, false);
  assert.equal(result.finality.checkedAgainstNode, false);
  assert.equal(result.unlock.validation.nodeAcceptanceChecked, false);
  assert.equal(result.unlock.validation.success, true);
  assert(!chain.has(result.unlock.txid), 'signed unlock is not an accepted parent');
  assert.equal(result.unlock.transaction.nLockTime, TARGET_HEIGHT);
  assert.equal(result.unlock.transaction.inputs[0].sequenceNumber, 0xfffffffe);
  assert.equal(result.unlock.transaction.inputs.length, 2);
  assert.equal(result.unlock.nextState, undefined, 'independent LP unlock must not mutate Pool');
  assert.notEqual(result.ownerAddress, result.lpAddress);

  const lockedCode = result.lockedLP.parentTx.outputs[result.lockedLP.outputIndex].script;
  const unlockedCode = result.unlockedLP.parentTx.outputs[result.unlockedLP.outputIndex].script;
  assert.equal(lockedCode.toHex(), unlockedCode.toHex(), 'unlock preserves exact Code and owner');
  const expectedController = Buffer.concat([tbc.crypto.Hash.sha256ripemd160(input.signers.lpOwner.publicKey), Buffer.from([0])]);
  assert(LP.parseCode(unlockedCode).controller.equals(expectedController));
  const tape = ref => LP.parseTape(ref.parentTx.outputs[ref.outputIndex + 1].script,
    { timelocked: true, tapeSize: result.pool.tapeSize });
  assert.equal(tape(result.lockedLP).lockTime, TARGET_HEIGHT);
  assert.equal(tape(result.unlockedLP).lockTime, 0);
  assert.deepEqual(tape(result.unlockedLP).amounts, [1_000_000n, 0n, 0n, 0n, 0n, 0n]);
  assert.equal(result.currentPool.nextState.ftAAmount, 20_000_000n);
  assert.equal(result.currentPool.nextState.tbcAmount, 1_000_000n);
  assert.equal(result.userFT.amountRaw, 1_980_000_000n);
  assert.equal(result.funding.parentTx.id, result.currentPool.txid);
  assert.equal(result.fundingAfterUnlock.parentTx.id, result.unlock.txid);

  // Simulate the caller establishing maturity and accepting unlock. No clock
  // or node is consulted here: this tests cleanup construction, not finality.
  chain.set(result.unlock.txid, result.unlock.transaction);
  const cleanup = await result.pool.removeLP({ ...result.common, userLP: result.unlockedLP,
    funding: result.fundingAfterUnlock, burnAmountRaw: result.unlockedLP.amountRaw,
    receiverAddress: result.ownerAddress });
  assert.equal(cleanup.validation.success, true);
  assert.equal(cleanup.validation.nodeAcceptanceChecked, false);
  assert.deepEqual(['poolValue', 'ftLpAmount', 'ftAAmount', 'tbcAmount'].map(name => cleanup.nextState[name]),
    [1500n, 0n, 0n, 0n]);
  assert.equal(cleanup.transaction.inputs[0].prevTxId.toString('hex'), result.currentPool.txid);
  assert.equal(cleanup.transaction.inputs[1].prevTxId.toString('hex'), result.unlock.txid);
  assert.equal(cleanup.transaction.outputs[cleanup.layout.userTbcVout].script.toHex(),
    tbc.Script.buildPublicKeyHashOut(result.ownerAddress).toHex());
  const returnedFT = cleanup.layout.assetOutputs.find(output => output.role === 'user-ft');
  assert.equal(returnedFT.amountRaw + result.userFT.amountRaw, 2_000_000_000n);
}));

test('false or thrown setup commit never registers the rejected transaction or builds later stages', () => quiet(async () => {
  for (const failAt of [1, 2]) for (const failure of ['false', 'throw']) {
    const input = fixture(), chain = input.localTransactions, candidates = [];
    await assert.rejects(buildFutureLockSetup({ ...input, commit: async (result, label) => {
      assert(!chain.has(result.txid));
      candidates.push({ result, label });
      if (candidates.length === failAt) {
        if (failure === 'throw') throw new Error('synthetic acceptance unavailable');
        return false;
      }
      return true;
    } }), failure === 'throw' ? /synthetic acceptance unavailable/ : /acceptance callback rejected/);
    assert.equal(candidates.length, failAt, 'stop at failed callback');
    assert.equal(chain.size, 3 + failAt - 1, 'only previous successful commits are registered');
    assert(!chain.has(candidates.at(-1).result.txid));
    for (const accepted of candidates.slice(0, -1)) assert(chain.has(accepted.result.txid));
  }
}));

test('future-lock fixture rejects ambiguous lock domains and reused LP owner before committing', () => quiet(async () => {
  const input = fixture();
  let commits = 0;
  const commit = async () => { commits++; return true; };
  for (const targetLockTime of [0, -1, 1.5, 500_000_000, 0xffffffff]) {
    await assert.rejects(buildFutureLockSetup({ ...input, targetLockTime, commit }), /positive block height/);
  }
  await assert.rejects(buildFutureLockSetup({ ...input, commit,
    signers: { ...input.signers, lpOwner: input.signers.owner } }), /distinct LP owner/);
  assert.equal(commits, 0);
  assert.equal(input.localTransactions.size, 3);
}));
