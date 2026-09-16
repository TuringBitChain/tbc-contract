'use strict';

// Transaction construction and local validation only: no networking, wallet
// discovery, private-key loading or broadcasting. The caller supplies signing
// callbacks and advances the local ledger only after establishing acceptance.
const assert = require('node:assert/strict');
const tbc = require('tbc-lib-js');
const TBC20 = require('../../lib/contract/tbc20.js');
const { PoolNFT3 } = require('../../lib/contract/poolNFT3.0.js');
const { FTLPTBC20: LP } = require('../../lib/contract/ftlpTbc20.js');
const { getTBC20Controller } = require('../../lib/util/tbc20/tbc20unlock.js');

const FIRST_TBC_SAT = 1_000_000n;
const FIRST_FT_RAW = 20_000_000n;
const CODE_DUST = 1500n; // Independent fixture constant matching current sources.
const pubkey = signer => Buffer.isBuffer(signer.publicKey)
  ? Buffer.from(signer.publicKey) : Buffer.from(signer.publicKey, 'hex');
const addressOf = signer => tbc.PublicKey.fromBuffer(pubkey(signer)).toAddress().toString();
const controllerOf = signer => Buffer.concat([tbc.crypto.Hash.sha256ripemd160(pubkey(signer)), Buffer.from([0])]);
const sum = values => values.reduce((total, value) => total + value, 0n);

/**
 * Builds a public Pool with time-locked LP, commits its three setup transactions
 * in order, then returns a signed unlock WITHOUT committing/registering it.
 *
 * Required input shape matches runScenario:
 * { ftGenesisTx, userFT, funding, signers: { owner, lpOwner, poolFt },
 *   localTransactions: Map<txid, Transaction>, commit, targetLockTime }
 * Optional feePolicy is passed to every transaction builder.
 *
 * targetLockTime is a positive BLOCK HEIGHT (< 500000000). The caller must
 * choose it relative to a fresh node tip and separately establish finality.
 * In particular, acceptance into a node's non-final pool does not demonstrate
 * spendability or confirmation. Local script validation cannot check either.
 *
 * commit(result, label) must persist and establish acceptance before resolving.
 * It is called ONLY for mint-source, mint-pool and add-future-locked-lp.
 * Returning false or throwing stops construction before advancing local state.
 * The returned common/funding still reference the last accepted addLP output;
 * they must be replaced with unlock's change AFTER unlock is actually accepted.
 * To clean up then, consume unlockedLP in removeLP for its entire amount and
 * pay ownerAddress, without changing the Pool head except through removeLP.
 */
async function buildFutureLockSetup({ ftGenesisTx, userFT: initialUserFT, funding: initialFunding,
  signers, localTransactions, commit, targetLockTime, feePolicy }) {
  assert(localTransactions instanceof Map, 'all ancestry must be supplied as a local Map');
  assert.equal(typeof commit, 'function', 'an acceptance callback is required');
  assert(Number.isInteger(targetLockTime) && targetLockTime > 0 && targetLockTime < 500_000_000,
    'future-lock experiment requires an explicit positive block height');
  for (const role of ['owner', 'lpOwner', 'poolFt']) {
    assert(signers?.[role] && typeof signers[role].sign === 'function', `missing ${role} signing callback`);
    assert.equal(pubkey(signers[role]).length, 33, `${role}: compressed public key required`);
  }
  assert(initialFunding?.signer && initialUserFT?.signer, 'signed FT and funding references are required');
  assert(controllerOf(initialUserFT.signer).equals(controllerOf(signers.owner)), 'user FT signer must be owner');
  const ownerAddress = addressOf(signers.owner), lpAddress = addressOf(signers.lpOwner);
  assert.notEqual(ownerAddress, lpAddress, 'use a distinct LP owner to test ownership-preserving unlock');
  const chain = localTransactions, history = [], consumed = new Set();
  const assertKnown = tx => assert.equal(chain.get(tx.id)?.uncheckedSerialize(), tx.uncheckedSerialize(),
    `parent ${tx.id} must already be accepted and registered locally`);
  for (const tx of [ftGenesisTx, initialUserFT.parentTx, initialFunding.parentTx]) assertKnown(tx);
  const initialBalance = TBC20.parseTape(initialUserFT.parentTx.outputs[initialUserFT.outputIndex + 1].script).balance;
  assert(initialBalance >= FIRST_FT_RAW, 'at least 20,000,000 raw FT required');
  const pool = new PoolNFT3({ ftGenesisTx, authorization: { kind: 'public' }, lp: { kind: 'timelocked' }, lpPlan: 1 });
  let currentPool, funding = initialFunding;

  function asset(result, role, signer) {
    const output = result.layout.assetOutputs.find(item => item.role === role);
    assert(output, `${result.layout.operation}: expected ${role}`);
    return { parentTx: result.transaction, outputIndex: output.codeVout, signer, ancestors: chain, amountRaw: output.amountRaw };
  }

  function assertLocal(result, label) {
    assert.equal(result.txid, result.transaction.id, label);
    assert.equal(result.txraw, result.transaction.uncheckedSerialize(), label);
    assert.equal(result.validation.success, true, label);
    assert.equal(result.validation.valueConserved, true, label);
    assert.equal(result.validation.nodeAcceptanceChecked, false, 'local checks cannot claim node acceptance');
    assert.equal(result.validation.inputs.length, result.transaction.inputs.length);
    assert(result.validation.inputs.every(input => input.success && input.stackDepth === 1), label);
    assert(result.reservedBytes >= result.txraw.length / 2, label);
    const inputTotal = sum(result.transaction.inputs.map(input => {
      const parent = chain.get(input.prevTxId.toString('hex'));
      assert(parent, `${label}: actual parent is not registered`);
      const previous = parent.outputs[input.outputIndex];
      assert(previous, `${label}: invalid output index`);
      assert.equal(input.output.satoshis, previous.satoshis);
      assert.equal(input.output.script.toHex(), previous.script.toHex());
      assert(!consumed.has(`${parent.id}:${input.outputIndex}`), `${label}: repeated local spend`);
      return BigInt(previous.satoshis);
    }));
    assert.equal(inputTotal - sum(result.transaction.outputs.map(output => BigInt(output.satoshis))), result.feeSat);
    assert(result.feeSat > 0n);
  }

  async function accept(result, label) {
    assertLocal(result, label);
    assert.equal(result.transaction.nLockTime, 0, `${label}: setup transactions must not be future-dated`);
    const accepted = await commit(result, `future-lock/${label}`);
    assert.notEqual(accepted, false, `${label}: acceptance callback rejected setup transaction`);
    for (const input of result.transaction.inputs) consumed.add(`${input.prevTxId.toString('hex')}:${input.outputIndex}`);
    chain.set(result.txid, result.transaction);
    history.push({ label: `future-lock/${label}`, result });
  }

  function change(result) {
    assert.notEqual(result.changeVout, undefined, 'future-lock funding must leave a recoverable change output');
    return { parentTx: result.transaction, outputIndex: result.changeVout, signer: initialFunding.signer };
  }

  function common() {
    const ancestorTx = chain.get(currentPool.transaction.inputs[0].prevTxId.toString('hex'));
    assert(ancestorTx, 'Pool grandparent must be present locally');
    return { pool: { parentTx: currentPool.transaction, ancestorTx },
      poolFT: asset(currentPool, 'pool-ft', signers.poolFt), funding, feePolicy };
  }

  const minted = await pool.mintPoolNFT({ funding, feePolicy });
  await accept(minted.source, 'mint-source');
  await accept(minted, 'mint-pool');
  currentPool = minted; funding = change(minted);
  assert.equal(minted.nextState.poolValue, CODE_DUST);
  const first = await pool.addLP({ ...common(), userFT: { ...initialUserFT, ancestors: chain },
    incrementSat: FIRST_TBC_SAT, firstFtAmountRaw: FIRST_FT_RAW, lpReceiverAddress: lpAddress,
    lpLockTime: targetLockTime, minLpOutRaw: FIRST_TBC_SAT, maxFtInRaw: FIRST_FT_RAW });
  assert.equal(first.quote.isFirstAddLP, true);
  assert.equal(first.nextState.ftLpAmount, FIRST_TBC_SAT);
  assert.equal(first.nextState.ftAAmount, FIRST_FT_RAW);
  assert.equal(first.nextState.tbcAmount, FIRST_TBC_SAT);
  assert.equal(first.nextState.poolValue, CODE_DUST + FIRST_TBC_SAT);
  await accept(first, 'add-future-locked-lp');
  currentPool = first; funding = change(first);
  const lockedLP = asset(first, 'new-lp', signers.lpOwner);
  const lpTape = LP.parseTape(first.transaction.outputs[lockedLP.outputIndex + 1].script,
    { timelocked: true, tapeSize: pool.tapeSize });
  assert.equal(lpTape.lockTime, targetLockTime);
  assert.deepEqual(lpTape.amounts, [FIRST_TBC_SAT, 0n, 0n, 0n, 0n, 0n]);
  assert(LP.parseCode(first.transaction.outputs[lockedLP.outputIndex].script).controller.equals(controllerOf(signers.lpOwner)));
  const hasFTChange = first.layout.assetOutputs.some(output => output.role === 'ft-change');
  const userFT = hasFTChange ? asset(first, 'ft-change', signers.owner) : undefined;
  assert.equal((userFT?.amountRaw ?? 0n) + FIRST_FT_RAW, initialBalance);
  if (userFT) assert(getTBC20Controller(userFT.parentTx.outputs[userFT.outputIndex].script).equals(controllerOf(signers.owner)));

  // This signed candidate is deliberately NOT sent to commit or registered.
  // nLockTime can satisfy the LP script while still exceeding chain finality.
  const unlock = await pool.unlockLP({ inputs: [lockedLP], funding, receiverAddress: lpAddress,
    lockTime: targetLockTime, feePolicy });
  assertLocal(unlock, 'future unlock candidate');
  assert.equal(unlock.transaction.nLockTime, targetLockTime);
  assert.equal(unlock.transaction.inputs[0].sequenceNumber, 0xfffffffe);
  assert.equal(unlock.transaction.inputs.length, 2);
  assert.equal(unlock.nextState, undefined);
  assert.equal(unlock.layout.operation, 'unlockLP');
  const unlockedLP = asset(unlock, 'lp-transfer', signers.lpOwner);
  const unlockedTape = LP.parseTape(unlock.transaction.outputs[unlockedLP.outputIndex + 1].script,
    { timelocked: true, tapeSize: pool.tapeSize });
  assert.equal(unlockedTape.lockTime, 0);
  assert.deepEqual(unlockedTape.amounts, lpTape.amounts);
  assert.equal(unlock.transaction.outputs[unlockedLP.outputIndex].script.toHex(),
    first.transaction.outputs[lockedLP.outputIndex].script.toHex(), 'unlock must retain LP Code and ownership');
  assert(!chain.has(unlock.txid), 'unsubmitted unlock must not advance accepted local ledger');
  return { pool, currentPool, common: common(), lockedLP, unlock, unlockedLP,
    funding, fundingAfterUnlock: change(unlock), userFT, history, localTransactions: chain,
    ownerAddress, lpAddress, targetLockTime, unlockSubmitted: false,
    finality: { checkedAgainstNode: false, targetBlockHeight: targetLockTime,
      instruction: 'Check node non-final pool, mature spendability and confirmation separately.' },
    totals: { acceptedSetupCount: history.length, setupMinerFeesSat: sum(history.map(item => item.result.feeSat)),
      initialFTBalance: initialBalance, poolReserveFtRaw: FIRST_FT_RAW, poolReserveTbcSat: FIRST_TBC_SAT,
      heldLpRaw: FIRST_TBC_SAT, unsubmittedUnlockFeeSat: unlock.feeSat } };
}

module.exports = { buildFutureLockSetup };
