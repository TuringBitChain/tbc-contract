'use strict';

// Runner safety tests are completely offline. Never call localKey or smoke.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tbc = require('tbc-lib-js');
const { TestnetJournal, BASE, silent } = require('./pool3-testnet-runner.cjs');
const { campaignSigners } = require('./pool3-testnet-production.cjs');
const { PreparedPool3Transaction, p2pkhInputPlan } = require('../../lib/util/poolnft3/transaction.js');

function fixture() {
  return new TestnetJournal(fs.mkdtempSync(path.join(os.tmpdir(), 'pool3-journal-test-')));
}

test('campaign derived signers use deterministic compressed public keys and sign valid transactions offline', async () => {
  // Public deterministic fixture scalar only; never load a deployment wallet.
  const key = new tbc.PrivateKey('91'.padStart(64, '0'));
  const flatten = signers => [signers.owner, signers.funding, signers.lpOwner,
    signers.recipient, signers.poolFt, ...signers.controllers];
  const first = flatten(campaignSigners(key));
  const restored = flatten(campaignSigners(key));
  assert.equal(first.length, 10);
  await silent(async () => {
    for (const [index, signer] of first.entries()) {
      assert.equal(signer.publicKey.length, 33, `signer ${index} must be compressed`);
      assert.deepEqual(signer.publicKey, restored[index].publicKey, 'restart preserves the derived identity');
      const address = tbc.PublicKey.fromBuffer(signer.publicKey).toAddress().toString();
      const script = tbc.Script.buildPublicKeyHashOut(address);
      const parent = new tbc.Transaction();
      parent.uncheckedAddInput(new tbc.Transaction.Input({ prevTxId: Buffer.alloc(32, 0x91), outputIndex: index,
        sequenceNumber: 0xffffffff, script: new tbc.Script() }));
      parent.addOutput(new tbc.Transaction.Output({ script, satoshis: 10000 }));
      const prepared = new PreparedPool3Transaction({
        inputs: [p2pkhInputPlan({ parentTx: parent, outputIndex: 0, signer })],
        outputs: [new tbc.Transaction.Output({ script, satoshis: 1000 })], changeAddress: address,
      });
      const result = await prepared.sign();
      assert.equal(result.validation.success, true, `signer ${index} produces a valid signature`);
      assert.equal(result.validation.nodeAcceptanceChecked, false);
      assert.deepEqual(result.transaction.inputs[0].script.chunks[1].buf, signer.publicKey);
    }
  });
});

test('testnet runner pins endpoint and rejects arbitrary URL input offline', async () => {
  assert.equal(BASE, 'https://api.tbcdev.org/api/tbc/');
  const journal = fixture();
  for (const endpoint of ['https://other.invalid', '../broadcasttx', '/broadcasttx', 'txraw?network=mainnet']) {
    await assert.rejects(journal.read(endpoint), /relative testnet path only/);
  }
});

test('testnet journal serializes concurrently requested broadcasts', async () => {
  const journal = fixture(), events = [];
  let active = 0, peak = 0;
  journal.broadcastOne = async (_tx, label) => {
    active++; peak = Math.max(peak, active); events.push(`start:${label}`);
    await new Promise(resolve => setTimeout(resolve, 5));
    events.push(`end:${label}`); active--; return true;
  };
  await Promise.all([journal.broadcast({}, 'parent'), journal.broadcast({}, 'child'), journal.broadcast({}, 'grandchild')]);
  assert.equal(peak, 1);
  assert.deepEqual(events, ['start:parent', 'end:parent', 'start:child', 'end:child', 'start:grandchild', 'end:grandchild']);
});

test('failed broadcast stops already queued children', async () => {
  const journal = fixture(); let calls = 0;
  journal.broadcastOne = async () => { calls++; throw new Error('ack unknown'); };
  const results = await Promise.allSettled([journal.broadcast({}, 'parent'), journal.broadcast({}, 'child')]);
  assert(results.every(result => result.status === 'rejected'));
  assert.equal(calls, 1);
});

test('journal restart freezes unresolved attempt and preserves throttle timestamp', async () => {
  const journal = fixture(), txid = '12'.repeat(32), epochMs = Date.now();
  journal.append({ type: 'broadcast-attempt', txid, epochMs });
  journal.append({ type: 'unknown', txid, error: 'test acknowledgement loss' });
  const restored = new TestnetJournal(journal.directory);
  assert.equal(restored.lastBroadcast, epochMs);
  assert(restored.unresolved.has(txid));
  await assert.rejects(restored.broadcast({}, 'must-not-send'), /unresolved prior broadcasts/);
});

test('journal restart restores accepted raw and consumed outpoints with private permissions', () => {
  const journal = fixture();
  const tx = new tbc.Transaction();
  tx.uncheckedAddInput(new tbc.Transaction.Input({ prevTxId: Buffer.alloc(32, 9), outputIndex: 3, sequenceNumber: 0xffffffff, script: new tbc.Script() }));
  tx.addOutput(new tbc.Transaction.Output({ satoshis: 0, script: tbc.Script.fromHex('006a') }));
  journal.saveRaw(tx);
  journal.append({ type: 'broadcast-attempt', txid: tx.id, epochMs: 123 });
  journal.append({ type: 'accepted', txid: tx.id, feeSat: '80' });
  const restored = new TestnetJournal(journal.directory);
  assert.equal(restored.chain.get(tx.id).uncheckedSerialize(), tx.uncheckedSerialize());
  assert(restored.spent.has(`${'09'.repeat(32)}:3`));
  assert.equal(restored.unresolved.size, 0);
  assert.equal(fs.statSync(journal.directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(journal.file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(journal.directory, `${tx.id}.raw`)).mode & 0o777, 0o600);
  journal.append({ type: 'broadcast-attempt', txid: tx.id, epochMs: 456 });
  journal.append({ type: 'unknown', txid: tx.id, error: 'later replay acknowledgement lost' });
  const replayRestart = new TestnetJournal(journal.directory);
  assert(replayRestart.unresolved.has(tx.id), 'an old accepted event cannot clear a later unknown replay');
});
