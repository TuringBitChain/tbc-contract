'use strict';

// Entirely offline audit adversarial tests. Deterministic, public fixture keys;
// no deployed wallet, runner, HTTP request, or broadcast is imported.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const tbc = require('tbc-lib-js');
const StableCoin = require('../../lib/contract/stableCoin.js');
const { CoinTBC20: Coin } = require('../../lib/contract/coinTbc20.js');
const { buildCoinTBC20UnlockScript } = require('../../lib/util/coinTbc20unlock.js');
const { buildUTXO } = require('../../lib/util/util.js');
const { auditCoinJournal } = require('./coin-testnet-audit.cjs');
const ROOT = path.resolve(__dirname, '../..');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const key = n => new tbc.PrivateKey(n.toString(16).padStart(64, '0'));
const owner = key(9101), admin = key(9102), recipient = key(9103);
const publicKey = admin.publicKey.toXOnly();
const endpoint = 'https://api.tbcdev.org/api/tbc/';
const json = value => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item);
function quiet(fn) { const log = console.log; console.log = () => {}; try { return fn(); } finally { console.log = log; } }

function fixture(t, { transfer = true } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'coin-evidence-audit-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const root = new tbc.Transaction();
  root.uncheckedAddInput(new tbc.Transaction.Input({ prevTxId: Buffer.alloc(32, 0x7a), outputIndex: 0,
    sequenceNumber: 0xffffffff, script: new tbc.Script() }));
  root.addOutput(new tbc.Transaction.Output({ script: tbc.Script.buildPublicKeyHashOut(owner.toAddress()), satoshis: 1000000 }));
  const sdk = new StableCoin({ name: 'Audit USD', symbol: 'AUD', amount: '100.25', decimal: 2 });
  const chain = new Map([[root.id, root]]), events = [], accepted = [];
  let epochMs = 1800000000000;
  const append = event => events.push({ at: new Date(epochMs).toISOString(), ...event });
  const save = tx => fs.writeFileSync(path.join(directory, `${tx.id}.raw`), tx.uncheckedSerialize(), { mode: 0o600 });
  const write = () => fs.writeFileSync(path.join(directory, 'journal.jsonl'), events.map(json).join('\n') + '\n');
  const signatures = prepared => prepared.sighashes.map(({ inputIndex }) => tbc.Transaction.sighash.signSchnorr(
    prepared.tx, admin, 0x41, inputIndex, prepared.tx.inputs[inputIndex].output.script,
    prepared.tx.inputs[inputIndex].output.satoshisBN).schnorrSig);
  const record = (tx, label, { reject = false, expectedLocalFailures, reason = 'mandatory-script-verify-flag-failed' } = {}) => {
    save(tx);
    const inputSat = tx.inputs.reduce((total, input) => total + chain.get(input.prevTxId.toString('hex')).outputs[input.outputIndex].satoshis, 0);
    const feeSat = inputSat - tx.outputs.reduce((total, output) => total + output.satoshis, 0);
    append({ type: 'prepared', txid: tx.id, label, feeSat, bytes: tx.uncheckedSerialize().length / 2, expectedLocalFailures });
    epochMs += 300;
    append({ type: 'broadcast-attempt', txid: tx.id, label, endpoint: endpoint + 'broadcasttx', epochMs });
    const body = reject ? { error: 'BROADCAST_REJECTED', data: { error: 'RPC error -26: ' + reason } }
      : { code: 200, data: { txid: tx.id } };
    append({ type: 'broadcast-response', txid: tx.id, label, status: 200, body });
    append({ type: reject ? 'rejected' : 'accepted', txid: tx.id, label, ...(reject ? { body } : { feeSat, rawRetrieved: true }) });
    if (!reject) { chain.set(tx.id, tx); accepted.push(tx); }
    write(); return tx;
  };
  save(root); append({ type: 'parent', txid: root.id });
  append({ type: 'campaign-init', network: 'testnet', endpoint, wallet: owner.toAddress().toString(),
    funding: { txid: root.id, index: 0, value: 1000000 }, allocatedSat: 1000000,
    artifactSHA: sha(fs.readFileSync(path.join(ROOT, 'lib/util/coin_tbc20.json'))),
    sdkFiles: Object.fromEntries(['lib/contract/stableCoin.js', 'lib/contract/coinTbc20.js'].map(file => [file, sha(fs.readFileSync(path.join(ROOT, file)))])),
    signerPublicKeys: { administrator: publicKey.toString('hex'), owner: owner.publicKey.toString() } });
  const prepared = quiet(() => sdk.createCoin(publicKey, owner, owner.toAddress().toString(), buildUTXO(root, 0), root, 'audit fixture'));
  const [sourceRaw, mintRaw] = quiet(() => prepared.finalize(signatures(prepared)));
  const source = record(new tbc.Transaction(sourceRaw), 'create-issuer');
  const mint = record(new tbc.Transaction(mintRaw), 'initial-mint');
  const transferTx = () => quiet(() => new tbc.Transaction(sdk.transfer(owner, recipient.toAddress().toString(), '1.25',
    [buildUTXO(mint, 3, true)], buildUTXO(mint, mint.outputs.length - 1), [mint], chain)));
  if (transfer) record(transferTx(), 'owner-transfer');
  write();
  return { directory, sdk, root, source, mint, transferTx, chain, events, accepted, record, append, save, write };
}

test('offline audit executes real Coin/NFT/Hold/fee inputs and reconciles atomic and native supply', t => {
  const h = fixture(t), report = auditCoinJournal(h.directory);
  assert.equal(report.accepted, 3); assert.equal(report.acceptedInputsRevalidated, 6);
  assert.equal(report.coin.codeBytes, 2981); assert.equal(report.coin.supplies.length, 1);
  assert.equal(report.coin.supplies[0].issuedRaw, '10025'); assert.equal(report.coin.supplies[0].liveRaw, '10025');
  assert.equal(report.coin.branches.address, 1); assert.equal(report.issuers[0].supply, '10025');
  assert.equal(report.globalSatoshis.conserved, true);
  assert.equal(BigInt(report.globalSatoshis.liveSat) + BigInt(report.globalSatoshis.minerFeesSat), 1000000n);
  assert.equal(report.nodeObservations.confirmed, 0); assert.equal(report.nodeObservations.unobserved.length, 3);
  assert.equal(fs.existsSync(path.join(h.directory, 'audit-report.json')), false, 'API is read-only');
});

test('audit sets TBC VM limits temporarily and restores caller configuration', t => {
  const h = fixture(t), I = tbc.Script.Interpreter;
  I.MAX_SCRIPT_ELEMENT_SIZE = 520; I.MAXIMUM_ELEMENT_SIZE = 4;
  assert.equal(auditCoinJournal(h.directory).allAcceptedRawInputScriptsPassed, true);
  assert.equal(I.MAX_SCRIPT_ELEMENT_SIZE, 520); assert.equal(I.MAXIMUM_ELEMENT_SIZE, 4);
});

test('audit derives fee inputs from actual prevouts when fee precedes Coin', t => {
  const h = fixture(t, { transfer: false }), tx = h.transferTx();
  tx.inputs.reverse();
  for (const input of tx.inputs) input.output = h.chain.get(input.prevTxId.toString('hex')).outputs[input.outputIndex];
  for (const vout of [1, 3]) {
    const tape = Coin.parseTape(tx.outputs[vout].script);
    tx.outputs[vout].setScript(Coin.replaceTapeAmounts(tx.outputs[vout].script, [0n, tape.balance, 0n, 0n, 0n, 0n]));
  }
  tx.inputs[1].setScript(buildCoinTBC20UnlockScript({ currentTx: tx, inputIndex: 1, preTx: h.mint, preTxVout: 3,
    outputGroups: [{ codeVout: 0, tapeVout: 1 }, { codeVout: 2, tapeVout: 3 }, { codeVout: 4 }],
    ancestorTransactions: h.chain, privateKey: owner }));
  tx.inputs[0].setScript(new tbc.Script().add(Buffer.from(tx.getSignature(0, owner), 'hex')).add(owner.publicKey.toBuffer()));
  h.record(tx, 'fee-vin0-coin-vin1');
  const report = auditCoinJournal(h.directory);
  assert.equal(report.accepted, 3); assert.equal(report.coin.branches.address, 1);
});

test('audit re-executes negative Coin proof and requires the fee input to remain valid', t => {
  const h = fixture(t, { transfer: false }), tx = h.transferTx();
  const bytes = tx.inputs[0].script.chunks[98].buf; bytes[0] ^= 1;
  tx.inputs[0].setScript(tbc.Script.fromBuffer(tx.inputs[0].script.toBuffer()));
  for (const input of tx.inputs) input.output = h.chain.get(input.prevTxId.toString('hex')).outputs[input.outputIndex];
  tx.inputs[1].setScript(new tbc.Script().add(Buffer.from(tx.getSignature(1, owner), 'hex')).add(owner.publicKey.toBuffer()));
  h.record(tx, 'wrong-coin-signature', { reject: true, expectedLocalFailures: [0] });
  const report = auditCoinJournal(h.directory);
  assert.equal(report.rejected, 1); assert.equal(report.rejections[0].kind, 'script');
  assert.deepEqual(report.rejections[0].failures, [0]); assert.equal(report.rejections[0].inputs[1].success, true);
  h.events.find(event => event.type === 'prepared' && event.txid === tx.id).expectedLocalFailures = [1]; h.write();
  assert.throws(() => auditCoinJournal(h.directory), /failing input indices/);
});

test('non-final rejection remains a node policy outcome when every script passes', t => {
  const h = fixture(t, { transfer: false });
  const tx = new tbc.Transaction().from(buildUTXO(h.mint, h.mint.outputs.length - 1));
  tx.nLockTime = 0xffffffff; tx.inputs[0].sequenceNumber = 0xfffffffe;
  tx.addOutput(new tbc.Transaction.Output({ satoshis: tx.inputs[0].output.satoshis - 80,
    script: tbc.Script.buildPublicKeyHashOut(owner.toAddress()) })); tx.sign(owner);
  h.record(tx, 'future-lock', { reject: true, expectedLocalFailures: [], reason: 'non-final' });
  const report = auditCoinJournal(h.directory);
  assert.equal(report.rejections[0].kind, 'policy-or-conflict'); assert.deepEqual(report.rejections[0].failures, []);
  assert(report.coin.attemptedTransactionLockTimes.includes(0xffffffff));
});

test('audit rejects a fabricated negative result when the recorded raw actually passes', t => {
  const h = fixture(t, { transfer: false });
  h.record(h.transferTx(), 'fake-script-failure', { reject: true, expectedLocalFailures: [0] });
  assert.throws(() => auditCoinJournal(h.directory), /failing input indices/);
});

test('negative evidence cannot substitute an invalid fee signature for a contract rejection', t => {
  const h = fixture(t, { transfer: false }), tx = h.transferTx();
  tx.inputs[1].script.chunks[0].buf[0] ^= 1;
  tx.inputs[1].setScript(tbc.Script.fromBuffer(tx.inputs[1].script.toBuffer()));
  h.record(tx, 'bad-fee-signature', { reject: true, expectedLocalFailures: [1] });
  assert.throws(() => auditCoinJournal(h.directory), /fee input must pass/);
});

test('a real local Coin failure plus a node policy rejection is insufficient script-negative evidence', t => {
  const h = fixture(t, { transfer: false }), tx = h.transferTx();
  tx.inputs[0].script.chunks[98].buf[0] ^= 1;
  tx.inputs[0].setScript(tbc.Script.fromBuffer(tx.inputs[0].script.toBuffer()));
  for (const input of tx.inputs) input.output = h.chain.get(input.prevTxId.toString('hex')).outputs[input.outputIndex];
  tx.inputs[1].setScript(new tbc.Script().add(Buffer.from(tx.getSignature(1, owner), 'hex')).add(owner.publicKey.toBuffer()));
  h.record(tx, 'wrong-coin-signature', { reject: true, expectedLocalFailures: [0] });
  assert.equal(auditCoinJournal(h.directory).rejections[0].kind, 'script');
  const response = h.events.find(event => event.type === 'broadcast-response' && event.txid === tx.id);
  const rejection = h.events.find(event => event.type === 'rejected' && event.txid === tx.id);
  // Keep the exact raw, correct local-failure expectation and valid fee input.
  // Only the saved node response changes: early policy checks cannot establish
  // that the node ever executed the deliberately invalid Coin script.
  for (const policyReason of ['min relay fee not met', 'txn-mempool-conflict', 'non-final-pool-full', 'missing-inputs']) {
    response.body.data.error = 'RPC error -26: ' + policyReason;
    rejection.body.data.error = response.body.data.error; h.write();
    assert.throws(() => auditCoinJournal(h.directory), /script negative requires explicit node script-failure evidence/);
  }
  response.body.data.error = 'RPC error -26: 16: Script failed an OP_EQUALVERIFY operation';
  rejection.body.data.error = response.body.data.error; h.write();
  assert.equal(auditCoinJournal(h.directory).rejections[0].kind, 'script');
});

test('audit rejects altered artifact and SDK provenance', t => {
  const h = fixture(t), init = h.events.find(event => event.type === 'campaign-init');
  const original = init.artifactSHA; init.artifactSHA = '00'.repeat(32); h.write();
  assert.throws(() => auditCoinJournal(h.directory), /artifact SHA256/);
  init.artifactSHA = original; init.sdkFiles['lib/contract/stableCoin.js'] = '00'.repeat(32); h.write();
  assert.throws(() => auditCoinJournal(h.directory), /recorded SDK file differs/);
});

test('audit rejects raw substitution and missing prevout evidence', t => {
  const h = fixture(t);
  fs.writeFileSync(path.join(h.directory, `${h.mint.id}.raw`), h.source.uncheckedSerialize());
  assert.throws(() => auditCoinJournal(h.directory), /filename matches transaction id/);
  h.save(h.mint); fs.unlinkSync(path.join(h.directory, `${h.root.id}.raw`));
  assert.throws(() => auditCoinJournal(h.directory), /ENOENT/);
});

test('audit requires temporal parent acceptance, not merely a raw file on disk', t => {
  const h = fixture(t);
  const sourceEvents = h.events.filter(event => event.txid === h.source.id), rest = h.events.filter(event => event.txid !== h.source.id);
  h.events.splice(0, h.events.length, ...rest, ...sourceEvents); h.write();
  assert.throws(() => auditCoinJournal(h.directory), /before its accepted parent/);
});

test('audit prevents duplicate acceptance and forged confirmed observations', t => {
  const h = fixture(t), tx = h.accepted.at(-1);
  h.record(tx, 'duplicate-acceptance');
  assert.throws(() => auditCoinJournal(h.directory), /counted twice/);
  h.events.splice(-4); h.append({ type: 'chain-observation', txid: tx.id, rawMatches: true, confirmations: 1, blockhash: null }); h.write();
  assert.throws(() => auditCoinJournal(h.directory), /recorded block identity/);
});

test('audit snapshots complete JSONL records and reports unresolved broadcasts honestly', t => {
  const h = fixture(t, { transfer: false }), tx = h.transferTx();
  h.save(tx); h.append({ type: 'prepared', txid: tx.id });
  h.append({ type: 'broadcast-attempt', txid: tx.id, epochMs: 1800000010000, endpoint: endpoint + 'broadcasttx' }); h.write();
  fs.appendFileSync(path.join(h.directory, 'journal.jsonl'), '{"type":"unknown"');
  const report = auditCoinJournal(h.directory);
  assert.deepEqual(report.unresolved, [tx.id]); assert(report.ignoredIncompleteTrailingBytes > 0);
});

function ceremony(index) {
  const participants = [owner, recipient].map(signer => signer.publicKey.toString());
  const M = tbc.crypto.MuSig2, publicKeys = participants.map(publicKey => Buffer.from(publicKey, 'hex'));
  return { type: 'musig2-signature', label: `offline-ceremony-${index}`, inputIndex: 0,
    sighash: sha(`offline-message-${index}`), participants,
    aggregatePublicKey: M.getAggPubkey(M.keyAgg(M.keySort(publicKeys))).toString('hex'),
    publicNonces: [0, 1].map(member => Buffer.concat([key(9200 + index * 4 + member * 2).publicKey.toBuffer(),
      key(9201 + index * 4 + member * 2).publicKey.toBuffer()]).toString('hex')),
    partialVerified: true, aggregateVerified: true };
}

test('MuSig2 audit counts fresh public nonces and distinguishes recorded verification flags', t => {
  const h = fixture(t); h.append(ceremony(0)); h.append(ceremony(1)); h.write();
  const report = auditCoinJournal(h.directory);
  assert.equal(report.musig2.messages, 2); assert.equal(report.musig2.participants, 2);
  assert.equal(report.musig2.participations, 4); assert.equal(report.musig2.duplicatePublicNonces, 0);
  assert.equal(report.musig2.aggregateKeysIndependentlyRecomputed, true);
  assert.match(report.musig2.verificationScope, /runner-reported booleans/);
  h.events.at(-1).partialVerified = false; h.write();
  assert.throws(() => auditCoinJournal(h.directory), /runner records successful partial verification/);
});

test('MuSig2 audit rejects one participant reusing its nonce across calls and messages', t => {
  const h = fixture(t), first = ceremony(0), second = ceremony(1);
  second.publicNonces[0] = first.publicNonces[0];
  h.append(first); h.append(second); h.write();
  assert.throws(() => auditCoinJournal(h.directory), /participant reused a public nonce/);
  h.events.at(-1).sighash = first.sighash; h.write();
  assert.throws(() => auditCoinJournal(h.directory), /participant reused a public nonce/);
});
