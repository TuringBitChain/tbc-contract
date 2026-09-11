'use strict';

// CI regression for the testnet scenario builder, NOT a testnet acceptance test.
// Only the initial funding transaction is a synthetic trusted fixture boundary.
// All later FT/Pool/LP transactions use signed, actual contract templates and
// locally retained parents. The commit callback simulates acceptance by running
// the local interpreter; it never connects to a node or claims node acceptance.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const tbc = require('tbc-lib-js');
const TBC20 = require('../../lib/contract/tbc20.js');
const { privateKeySigner } = require('../../lib/util/poolnft3/transaction.js');
const { validatePool3Transaction } = require('../../lib/validator/poolnft3.js');
const { runScenario } = require('./pool3-testnet-scenarios.cjs');

// Public, deterministic fixture keys: unsafe for real funds and used ONLY in
// these offline tests. Never load a deployment wallet, environment secret or
// testnet journal here.
const fixtureKey = value => new tbc.PrivateKey(value.toString(16).padStart(64, '0'));
const sum = values => values.reduce((total, value) => total + value, 0n);

async function offlineOnly(callback) {
  const originals = [
    [http, 'request'], [http, 'get'], [https, 'request'], [https, 'get'],
    [net, 'connect'], [net, 'createConnection'], [net.Socket.prototype, 'connect'],
    [globalThis, 'fetch'],
  ].map(([target, name]) => [target, name, target[name]]);
  const log = console.log;
  let networkAttempts = 0;
  const forbidden = () => {
    networkAttempts++;
    throw new Error('Pool3 scenario CI tests must never access the network');
  };
  for (const [target, name] of originals) target[name] = forbidden;
  // The current local interpreter logs its stack; suppress that noise only
  // inside this serial, isolated test file, and always restore console output.
  console.log = () => {};
  try {
    await callback();
    assert.equal(networkAttempts, 0, 'all ancestry and commit validation stay local');
  } finally {
    console.log = log;
    for (const [target, name, original] of originals) target[name] = original;
  }
}

for (const timelocked of [false, true]) for (const controllerCount of [0, 5]) {
  test(`offline scenario CI: LP lock=${timelocked}, whitelist=${controllerCount}; no node acceptance`,
    { concurrency: false }, () => offlineOnly(async () => {
      const owner = fixtureKey(811), funder = fixtureKey(812);
      const signers = {
        owner: privateKeySigner(owner), lpOwner: privateKeySigner(fixtureKey(813)),
        recipient: privateKeySigner(fixtureKey(814)), poolFt: privateKeySigner(fixtureKey(815)),
        controllers: Array.from({ length: controllerCount }, (_, index) => privateKeySigner(fixtureKey(820 + index))),
      };
      const root = new tbc.Transaction();
      root.nLockTime = (timelocked ? 10 : 0) + controllerCount;
      root.uncheckedAddInput(new tbc.Transaction.Input({ prevTxId: Buffer.alloc(32, 0x81), outputIndex: 0,
        sequenceNumber: 0xffffffff, script: new tbc.Script() }));
      root.addOutput(new tbc.Transaction.Output({ script: tbc.Script.buildPublicKeyHashOut(owner.toAddress()), satoshis: 1_000_000 }));
      root.addOutput(new tbc.Transaction.Output({ script: tbc.Script.buildPublicKeyHashOut(funder.toAddress()), satoshis: 100_000_000 }));

      // A valid five-byte extension push makes this FT Tape 66 bytes, so it is
      // genuinely compatible with both LP templates without rewriting FT data.
      const token = new TBC20({ extensionData: Buffer.from('040102030409', 'hex') });
      const ft = token.mint(owner, owner.toAddress().toString(), 2_000_000_000n, {
        txId: root.id, outputIndex: 0, script: root.outputs[0].script.toHex(), satoshis: root.outputs[0].satoshis,
      });
      for (const tx of [ft.sourceTransaction, ft.transaction]) {
        const validation = validatePool3Transaction(tx);
        assert.equal(validation.success, true, 'signed FT setup passes local full-input validation');
        assert.equal(validation.nodeAcceptanceChecked, false);
      }
      const localTransactions = new Map([root, ft.sourceTransaction, ft.transaction].map(tx => [tx.id, tx]));
      const acceptedLocally = new Set(localTransactions.keys());
      const spentByScenario = new Set(), commitLabels = [];
      const result = await runScenario({
        variant: { timelocked, controllerCount }, ftGenesisTx: ft.transaction,
        userFT: { parentTx: ft.transaction, outputIndex: 0, signer: signers.owner },
        funding: { parentTx: root, outputIndex: 1, signer: privateKeySigner(funder) },
        signers, localTransactions, options: { matureLockTime: 100 },
        commit: async (built, label) => {
          assert(!localTransactions.has(built.txid), 'harness must not advance local state before commit');
          assert(!acceptedLocally.has(built.txid), 'commit is called once per transaction');
          for (const input of built.transaction.inputs) {
            const parentId = input.prevTxId.toString('hex');
            assert(acceptedLocally.has(parentId), `${label}: a parent must be accepted first`);
            assert(localTransactions.has(parentId), `${label}: parent raw is retained locally`);
            const reference = `${parentId}:${input.outputIndex}`;
            assert(!spentByScenario.has(reference), `${label}: no repeated input spend`);
            spentByScenario.add(reference);
          }
          // This is the simulated commit boundary, not an RPC or broadcast.
          const validation = validatePool3Transaction(built.transaction);
          assert.equal(validation.success, true, label);
          assert.equal(validation.valueConserved, true, label);
          assert.equal(validation.inputs.length, built.transaction.inputs.length);
          assert(validation.inputs.every(input => input.success && input.stackDepth === 1), label);
          assert.equal(validation.nodeAcceptanceChecked, false);
          acceptedLocally.add(built.txid);
          commitLabels.push(label);
        },
      });

      const expectedCount = timelocked ? 17 : 16;
      assert.equal(result.history.length, expectedCount);
      assert.equal(result.totals.transactionCount, expectedCount);
      assert.deepEqual(commitLabels, result.history.map(item => item.label));
      assert.equal(localTransactions.size, 3 + expectedCount);
      assert(commitLabels[0].endsWith('/mint-source'));
      assert(commitLabels[1].endsWith('/mint-pool'));
      assert(commitLabels.at(-1).endsWith('/cleanup-remove-all'));

      const byLabel = suffix => result.history.find(item => item.label.endsWith(`/${suffix}`)).result;
      const first = byLabel('add-first'), small = byLabel('add-small-branch'), large = byLabel('add-large-branch');
      assert.equal(first.quote.isFirstAddLP, true);
      assert.equal(first.quote.ftLpIncrementRaw, 10_000_000n);
      assert.equal(first.quote.ftAIncrementRaw, 200_000_000n);
      assert(small.quote.tbcIncrementSat <= first.nextState.tbcAmount);
      assert(large.quote.tbcIncrementSat > small.nextState.tbcAmount);
      for (const direction of ['ft', 'tbc']) {
        const paid = byLabel(direction === 'ft' ? 'swap-ft-paid-service' : 'swap-tbc-paid-service-with-change');
        const zero = byLabel(direction === 'ft' ? 'swap-ft-zero-service' : 'swap-tbc-zero-service-without-change');
        assert(paid.quote.fees.serviceFeePaidSat >= 10n);
        assert.equal(zero.quote.fees.serviceFeePaidSat, 0n);
        assert.equal(zero.transaction.outputs[zero.layout.serviceFeeVout].script.toHex(), '006a');
      }
      assert.equal(byLabel('lp-merge-five-inputs-two-owners').transaction.inputs.length, 6);
      assert.equal(result.history.some(item => item.result.layout?.operation === 'unlockLP'), timelocked);
      assert(result.negativeChecks.length >= 3);
      assert(result.negativeChecks.every(check => check.layer === 'sdk-local' && check.rejected));

      assert.equal(result.currentPool.nextState.ftLpAmount, 0n);
      assert.equal(result.currentPool.nextState.ftAAmount, 0n);
      assert.equal(result.currentPool.nextState.tbcAmount, 0n);
      assert.equal(result.currentPool.nextState.poolValue, 1500n);
      assert.equal(result.remainingLP, undefined);
      assert.equal(result.recoverableOutputs.lp.length, 0);
      assert.equal(result.recoverableOutputs.ft.length, 5);
      assert.equal(result.recoverableOutputs.tbc.length, 6);
      assert.equal(sum(result.recoverableOutputs.ft.map(output => output.amountRaw)), 2_000_000_000n);
      assert.equal(result.totals.initialFTBalance, result.totals.recoveredFTBalance);
      assert(result.totals.minerFeesSat > 0n);
      for (const output of [...result.recoverableOutputs.ft, ...result.recoverableOutputs.tbc]) {
        assert(!spentByScenario.has(`${output.parentTx.id}:${output.outputIndex}`), 'recovery inventory contains only unspent outputs');
      }
    }));
}
