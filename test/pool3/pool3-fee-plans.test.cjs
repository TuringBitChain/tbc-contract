'use strict';

// CI-only, entirely offline. The synthetic funding parent is the sole trusted
// boundary. Keys are public fixture scalars, never a deployment wallet. Every
// descendant is signed and executed against the actual frozen contract scripts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const tbc = require('tbc-lib-js');
const TBC20 = require('../../lib/contract/tbc20.js');
const { PoolNFT3 } = require('../../lib/contract/poolNFT3.0.js');
const { privateKeySigner } = require('../../lib/util/poolnft3/transaction.js');
const { validatePool3Transaction } = require('../../lib/validator/poolnft3.js');
const { runFeePlan } = require('./pool3-testnet-fee-plans.cjs');
const { prepareSwapFTAdversarial } = require('./pool3-testnet-adversarial.cjs');

async function quiet(fn) {
  const log = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = log; }
}
const fixtureKey = scalar => new tbc.PrivateKey(scalar.toString(16).padStart(64, '0'));
const addressOf = signer => tbc.PublicKey.fromBuffer(signer.publicKey).toAddress().toString();

function fixture(tapeSize, nonce) {
  const calls = [], chain = new Map();
  const ownerKey = fixtureKey(901), fundingKey = fixtureKey(902);
  function signer(key, label) {
    const delegate = privateKeySigner(key);
    return { publicKey: delegate.publicKey, sign: async request => {
      calls.push({ label, inputIndex: request.inputIndex, role: request.role });
      // Keep this adapter asynchronous to exercise external-wallet semantics.
      await Promise.resolve();
      return delegate.sign(request);
    } };
  }
  const signers = { owner: signer(ownerKey, 'owner'), funding: signer(fundingKey, 'funding'),
    lpOwner: signer(fixtureKey(903), 'lp-owner'), poolFt: signer(fixtureKey(904), 'pool-ft'),
    controllers: Array.from({ length: 5 }, (_, index) => signer(fixtureKey(911 + index), `member-${index}`)),
  };
  const root = new tbc.Transaction();
  root.nLockTime = nonce;
  root.uncheckedAddInput(new tbc.Transaction.Input({ prevTxId: Buffer.alloc(32, 0x49), outputIndex: nonce,
    sequenceNumber: 0xffffffff, script: new tbc.Script() }));
  for (const key of [ownerKey, fundingKey]) root.addOutput(new tbc.Transaction.Output({
    script: tbc.Script.buildPublicKeyHashOut(key.toAddress()), satoshis: 20_000_000,
  }));
  chain.set(root.id, root);
  const token = new TBC20({ extensionData: Buffer.concat([Buffer.alloc(tapeSize - 61), Buffer.from([9])]) });
  const mint = token.mint(ownerKey, ownerKey.toAddress().toString(), 2_000_000_000n, {
    txId: root.id, outputIndex: 0, script: root.outputs[0].script.toHex(), satoshis: root.outputs[0].satoshis,
  });
  for (const tx of [mint.sourceTransaction, mint.transaction]) {
    assert.equal(validatePool3Transaction(tx).success, true, 'real FT source/genesis scripts execute');
    chain.set(tx.id, tx);
  }
  assert.equal(TBC20.parseTape(mint.transaction.outputs[1].script).size, tapeSize);
  return { calls, chain, signers, ftGenesisTx: mint.transaction,
    userFT: { parentTx: mint.transaction, outputIndex: 0, signer: signers.owner, ancestors: chain },
    funding: { parentTx: root, outputIndex: 1, signer: signers.funding } };
}

for (let lpPlan = 1; lpPlan <= 6; lpPlan += 1) {
  const tapeSize = [61, 66, 127][(lpPlan - 1) % 3];
  test(`offline production fee lane: plan ${lpPlan}, Tape ${tapeSize}, eight real-input transactions`,
    { concurrency: false }, () => quiet(async () => {
      const f = fixture(tapeSize, lpPlan), committed = [];
      const result = await runFeePlan({ lane: 11 + lpPlan, lpPlan, tapeSize,
        ftGenesisTx: f.ftGenesisTx, userFT: f.userFT, funding: f.funding,
        signers: f.signers, localTransactions: f.chain,
        commit: async (candidate, label) => {
          assert(!f.chain.has(candidate.txid), 'scenario must not register an unaccepted candidate');
          assert.equal(validatePool3Transaction(candidate.transaction).success, true);
          assert.equal(candidate.validation.nodeAcceptanceChecked, false);
          for (const input of candidate.transaction.inputs) assert(f.chain.has(input.prevTxId.toString('hex')));
          await Promise.resolve();
          assert(!f.chain.has(candidate.txid), 'state remains unchanged until commit resolves');
          committed.push({ txid: candidate.txid, label });
        },
      });
      assert.equal(committed.length, 8);
      assert.equal(new Set(committed.map(item => item.txid)).size, 8);
      assert.deepEqual(committed.map(item => item.label.split('/').at(-1)), [
        'mint-source', 'mint-pool', 'first-add', 'swap-ft-paid', 'swap-tbc-paid',
        'swap-ft-zero-service', 'swap-tbc-zero-service', 'remove-all',
      ]);
      assert.equal(result.smallInputTbcSat, [286n, 286n, 81n, 83n, 87n, 81n][lpPlan - 1]);
      assert.equal(result.totals.initialFTBalance, 2_000_000_000n);
      assert.equal(result.totals.recoveredFTBalance, 2_000_000_000n);
      assert.equal(result.totals.poolCodeLockedSat, 1500n);
      assert.equal(result.recoverableOutputs.lp.length, 0);
      assert.equal(result.currentPool.nextState.ftLpAmount, 0n);
      assert.equal(result.currentPool.nextState.ftAAmount, 0n);
      assert.equal(result.currentPool.nextState.tbcAmount, 0n);
      assert(result.totals.serviceFeesSat > 0n);
      assert(result.totals.minerFeesSat > 0n);
      assert(committed.every(item => f.chain.has(item.txid)));
    }));
}

test('fee lane stops without registering the rejected transaction when commit returns false',
  { concurrency: false }, () => quiet(async () => {
    const f = fixture(61, 70), originalSize = f.chain.size;
    let attempts = 0, rejectedTxid;
    await assert.rejects(runFeePlan({ lane: 12, lpPlan: 1, tapeSize: 61,
      ftGenesisTx: f.ftGenesisTx, userFT: f.userFT, funding: f.funding,
      signers: f.signers, localTransactions: f.chain,
      commit: async result => {
        attempts += 1;
        if (attempts < 3) return true;
        rejectedTxid = result.txid;
        assert(!f.chain.has(rejectedTxid));
        return false;
      },
    }), /commit explicitly rejected/);
    assert.equal(attempts, 3, 'no swap or cleanup is submitted after rejected AddLP');
    assert.equal(f.chain.size, originalSize + 2, 'only accepted source and genesis enter the ledger');
    assert(!f.chain.has(rejectedTxid), 'the rejected AddLP must not advance local state');
  }));

for (const controllerCount of [0, 5]) {
  test(`offline adversarial Pool ${controllerCount ? 'hash5' : 'public'}: fresh proofs and independently valid signatures`,
    { concurrency: false }, () => quiet(async () => {
      const f = fixture(66, 100 + controllerCount);
      const authorization = controllerCount ? { kind: 'controller', controllerPubKeyHashes: f.signers.controllers
        .map(signer => tbc.crypto.Hash.sha256ripemd160(signer.publicKey).toString('hex')) } : { kind: 'public' };
      const pool = new PoolNFT3({ ftGenesisTx: f.ftGenesisTx, authorization, lp: { kind: 'plain' }, lpPlan: 1 });
      const minted = await pool.mintPoolNFT({ funding: f.funding });
      for (const tx of minted.transactions) f.chain.set(tx.id, tx);
      const fundingFrom = result => ({ parentTx: result.transaction, outputIndex: result.changeVout, signer: f.signers.funding });
      const poolFtFrom = result => ({ parentTx: result.transaction,
        outputIndex: result.layout.assetOutputs.find(output => output.role === 'pool-ft').codeVout,
        signer: f.signers.poolFt, ancestors: f.chain });
      const auth = controllerCount ? { controllerSigner: f.signers.controllers[0] } : {};
      const added = await pool.addLP({ pool: { parentTx: minted.transaction, ancestorTx: minted.source.transaction },
        poolFT: poolFtFrom(minted), funding: fundingFrom(minted), userFT: f.userFT,
        incrementSat: 1_000_000n, firstFtAmountRaw: 20_000_000n,
        lpReceiverAddress: addressOf(f.signers.lpOwner), minLpOutRaw: 1n, ...auth });
      f.chain.set(added.txid, added.transaction);
      const common = { pool: { parentTx: added.transaction, ancestorTx: minted.transaction },
        poolFT: poolFtFrom(added), funding: fundingFrom(added), ...auth };
      const valid = await pool.swapFT({ ...common, inputTbcSat: 100_000n,
        receiverAddress: addressOf(f.signers.owner), minFtOutRaw: 1n });
      const originalRaw = valid.txraw, beforeCalls = f.calls.length, beforeChainSize = f.chain.size;
      const cases = await prepareSwapFTAdversarial({ validResult: valid, common,
        localTransactions: f.chain, nonMemberSigner: f.signers.owner });
      assert.equal(cases.length, controllerCount ? 6 : 5);
      assert.equal(f.calls.length - beforeCalls, cases.length * (controllerCount ? 3 : 2),
        'each case requests a fresh asynchronous signature from every required input');
      for (const candidate of cases) {
        assert.equal(candidate.signaturesVerified, true);
        assert.equal(candidate.validation.success, false);
        assert.equal(candidate.validation.inputs[1].success, true, 'new funding signature passes');
        const report = validatePool3Transaction(candidate.transaction);
        assert.deepEqual(report.inputs.filter(input => !input.success).map(input => input.inputIndex), candidate.expectedLocalFailures);
        // Independently validate every signature leaf, including the non-member
        // whose signature is valid but whose pubkey hash is not authorized.
        for (const vin of controllerCount ? [0, 1, 2] : [1, 2]) {
          const tx = candidate.transaction, input = tx.inputs[vin];
          const signatureLeaves = input.script.chunks.flatMap((chunk, index) => {
            const next = input.script.chunks[index + 1];
            return chunk.buf && next?.buf?.length === 33 && tbc.crypto.Signature.isTxDER(chunk.buf)
              ? [{ signature: tbc.crypto.Signature.fromTxFormat(chunk.buf), publicKey: tbc.PublicKey.fromBuffer(next.buf) }] : [];
          });
          assert.equal(signatureLeaves.length, 1, `vin ${vin} must contain exactly one signature/pubkey pair`);
          assert(tx.verifySignature(signatureLeaves[0].signature, signatureLeaves[0].publicKey, vin,
            input.output.script, input.output.satoshisBN, 0x10000));
        }
      }
      assert.equal(valid.transaction.uncheckedSerialize(), originalRaw);
      assert.equal(validatePool3Transaction(valid.transaction).success, true, 'valid sibling remains executable');
      assert.equal(f.chain.size, beforeChainSize, 'negative construction does not advance the ledger');
      assert(cases.every(candidate => !f.chain.has(candidate.txid)));
    }));
}
