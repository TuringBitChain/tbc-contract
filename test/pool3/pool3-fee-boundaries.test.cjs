'use strict';

// Fully offline reproducible evidence. Public deterministic fixture scalars and
// one synthetic funding transaction are used; no real wallet or runner import.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const tbc = require('tbc-lib-js');
const TBC20 = require('../../lib/contract/tbc20.js');
const { privateKeySigner } = require('../../lib/util/poolnft3/transaction.js');
const { validatePool3Transaction } = require('../../lib/validator/poolnft3.js');
const { runFeePlan } = require('./pool3-testnet-fee-plans.cjs');
const { runFeeBoundaries } = require('./pool3-testnet-fee-boundaries.cjs');

async function quiet(fn) {
  const log = console.log; console.log = () => {};
  try { return await fn(); } finally { console.log = log; }
}

async function completedFixture() {
    const key = scalar => new tbc.PrivateKey(scalar.toString(16).padStart(64, '0'));
    const owner = key(1001), funder = key(1002);
    const signers = { owner: privateKeySigner(owner), funding: privateKeySigner(funder),
      lpOwner: privateKeySigner(key(1003)), poolFt: privateKeySigner(key(1004)) };
    const root = new tbc.Transaction();
    root.uncheckedAddInput(new tbc.Transaction.Input({ prevTxId: Buffer.alloc(32, 0x51), outputIndex: 0,
      sequenceNumber: 0xffffffff, script: new tbc.Script() }));
    for (const k of [owner, funder]) root.addOutput(new tbc.Transaction.Output({
      script: tbc.Script.buildPublicKeyHashOut(k.toAddress()), satoshis: 20_000_000,
    }));
    const token = new TBC20();
    const mint = token.mint(owner, owner.toAddress().toString(), 2_000_000_000n, {
      txId: root.id, outputIndex: 0, script: root.outputs[0].script.toHex(), satoshis: root.outputs[0].satoshis,
    });
    const chain = new Map([[root.id, root]]);
    for (const tx of [mint.sourceTransaction, mint.transaction]) {
      assert.equal(validatePool3Transaction(tx).success, true);
      chain.set(tx.id, tx);
    }
    const committed = [];
    const commit = async (result, label) => {
      assert.equal(result.validation.nodeAcceptanceChecked, false, 'CI never claims real node acceptance');
      assert.equal(validatePool3Transaction(result.transaction).success, true);
      assert(!chain.has(result.txid), 'unaccepted transaction must not enter local ledger');
      await Promise.resolve();
      assert(!chain.has(result.txid), 'state remains unchanged while acceptance is pending');
      committed.push({ label, txid: result.txid });
    };
    const completedFeePlan = await runFeePlan({ lane: 12, lpPlan: 1, tapeSize: 61,
      ftGenesisTx: mint.transaction,
      userFT: { parentTx: mint.transaction, outputIndex: 0, signer: signers.owner, ancestors: chain },
      funding: { parentTx: root, outputIndex: 1, signer: signers.funding },
      signers, localTransactions: chain, commit });
    return { completedFeePlan, signers, chain, committed, commit };
}

test('plan-1 real Pool fee boundaries 9/10/41 in both directions retain exact fees and fully clear',
  { concurrency: false }, () => quiet(async () => {
    const { completedFeePlan, signers, chain, committed, commit } = await completedFixture();
    const originalRaws = completedFeePlan.history.map(item => item.result.transaction.uncheckedSerialize());
    const originalHead = completedFeePlan.currentPool.txid;
    const boundaries = await runFeeBoundaries({ lane: 12, completedFeePlan, signers,
      localTransactions: chain, commit });
    assert.equal(committed.length, 16, 'eight original fee-plan txs plus eight boundary extension txs');
    assert.equal(boundaries.history.length, 8);
    assert.equal(new Set(committed.map(item => item.txid)).size, 16);
    assert.deepEqual(boundaries.boundaries.map(item => item.operation), ['swapFT', 'swapTBC', 'swapFT', 'swapTBC', 'swapFT', 'swapTBC']);
    assert.deepEqual(boundaries.boundaries.map(item => item.nominalServiceFeeSat), [9n, 9n, 10n, 10n, 41n, 41n]);
    assert.deepEqual(boundaries.boundaries.map(item => item.serviceFeePaidSat), [0n, 0n, 10n, 10n, 41n, 41n]);
    for (const boundary of boundaries.boundaries) {
      const result = boundaries.history.find(item => item.result.txid === boundary.txid).result;
      assert.equal(result.quote.fees.serviceFeeAccruedSat, boundary.nominalServiceFeeSat);
      const output = result.transaction.outputs[boundary.feeVout];
      assert.equal(BigInt(output.satoshis), boundary.serviceFeePaidSat);
      assert.equal(result.quote.fees.serviceFeeRetainedSat, boundary.nominalServiceFeeSat === 9n ? 9n : 0n);
      if (boundary.serviceFeePaidSat === 0n) assert.equal(output.script.toHex(), '006a');
      else assert.equal(output.script.toBuffer().length, 25);
    }
    assert.equal(boundaries.totals.serviceFeesSat, 102n);
    assert.equal(boundaries.totals.initialFTBalance, 2_000_000_000n);
    assert.equal(boundaries.totals.recoveredFTBalance, 2_000_000_000n);
    assert.equal(boundaries.totals.poolCodeLockedSat, 1500n);
    assert.equal(boundaries.recoverableOutputs.lp.length, 0);
    assert.equal(boundaries.currentPool.nextState.ftLpAmount, 0n);
    assert.equal(boundaries.currentPool.nextState.ftAAmount, 0n);
    assert.equal(boundaries.currentPool.nextState.tbcAmount, 0n);
    assert.notEqual(boundaries.currentPool.txid, originalHead);
    assert.equal(completedFeePlan.currentPool.txid, originalHead, 'completed fee-plan context is not mutated');
    assert.deepEqual(completedFeePlan.history.map(item => item.result.transaction.uncheckedSerialize()), originalRaws,
      'original eight accepted transactions remain byte-identical');
  }));

test('fee boundary lane fail-stops on false acceptance without advancing rejected Swap state',
  { concurrency: false }, () => quiet(async () => {
    const { completedFeePlan, signers, chain } = await completedFixture();
    const originalSize = chain.size, originalHead = completedFeePlan.currentPool.txid;
    let attempts = 0, acceptedAddTxid, rejectedSwapTxid;
    await assert.rejects(runFeeBoundaries({ lane: 12, completedFeePlan, signers, localTransactions: chain,
      commit: async result => {
        attempts += 1;
        assert(!chain.has(result.txid));
        if (attempts === 1) { acceptedAddTxid = result.txid; return true; }
        rejectedSwapTxid = result.txid;
        return false;
      },
    }), /commit explicitly rejected/);
    assert.equal(attempts, 2, 'no reverse swap or cleanup follows the rejected forward swap');
    assert.equal(chain.size, originalSize + 1, 'only the accepted re-add enters the local ledger');
    assert(chain.has(acceptedAddTxid));
    assert(!chain.has(rejectedSwapTxid), 'rejected swap must never be registered');
    assert.equal(completedFeePlan.currentPool.txid, originalHead, 'caller context remains unchanged');
  }));
