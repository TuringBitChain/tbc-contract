'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tbc = require('tbc-lib-js');
const { Campaign } = require('./coin-testnet-production.cjs');
const { TestnetJournal } = require('../pool3/pool3-testnet-runner.cjs');
const { CoinTBC20: Coin } = require('../../lib/contract/coinTbc20.js');
const { buildUTXO } = require('../../lib/util/util.js');
const { validateCoinTransaction } = require('./coin-testnet-adversarial.cjs');
const { runAdmin, assertScriptRejection, SOURCE_LABEL } = require('./coin-testnet-admin-run.cjs');
const key = n => new tbc.PrivateKey(n.toString(16).padStart(64, '0'));

test('durable signed plans reserve fee inputs before their first broadcast', () => {
  const owner = key(1901), root = new tbc.Transaction();
  root.uncheckedAddInput(new tbc.Transaction.Input({ prevTxId: Buffer.alloc(32, 17), outputIndex: 0, script: new tbc.Script() }));
  for (let i = 0; i < 3; i++) root.to(owner.toAddress(), 20000);
  const plans = [0, 1].map(vout => new tbc.Transaction().from(buildUTXO(root, vout)).to(owner.toAddress(), 19000));
  const c = Object.create(Campaign.prototype);
  c.key = owner; c.load = id => plans.find(tx => tx.id === id);
  c.j = { chain: new Map([[root.id, root]]), spent: new Set(), events: [
    { type: 'accepted', txid: root.id },
    { type: 'signed-bundle', txids: [plans[0].id] },
    { type: 'adversarial-plan', control: plans[1].id },
  ] };
  assert.equal(c.fee().outputIndex, 2);
  c.j.spent.add(`${root.id}:2`);
  assert.throws(() => c.fee(), /funded campaign fee output/);
});

function campaign(directory) {
  // Deliberately bypass the deployment constructor and localKey. Only public,
  // deterministic offline fixture keys and a mocked broadcast adapter are used.
  const c = Object.create(Campaign.prototype);
  c.j = new TestnetJournal(directory); c.key = key(901); c.keys = { owner: c.key };
  c.adminKeys = [key(902), key(903)]; c.M = tbc.crypto.MuSig2;
  c.adminPubkeys = c.adminKeys.map(k => c.M.pubkeyFromSk(k.toBuffer()));
  c.adminContext = c.M.keyAgg(c.M.keySort(c.adminPubkeys)); c.admin = c.M.getAggPubkey(c.adminContext);
  c.fund = async () => {};
  c.fee = () => buildUTXO(c.j.chain.get(c.j.events.find(e => e.label === 'funding-split').txid), 1);
  c.calls = [];
  c.j.broadcast = async (tx, label, options = {}) => {
    const plan = c.j.events.find(e => e.type === 'admin-adversarial-plan');
    assert(plan, 'durable plan must exist before the first broadcast');
    for (const txid of [plan.baseline, plan.control, ...plan.probes.map(p => p.txid)])
      assert(fs.existsSync(path.join(directory, `${txid}.raw`)), 'all signed raws must exist before first broadcast');
    assert(c.j.events.some(e => e.type === 'future-reservation' && e.txid === plan.control));
    c.j.attach(tx); c.calls.push(tx.id);
    const validation = validateCoinTransaction(tx);
    if (options.allowReject) {
      assert.deepEqual(validation.inputs.map(input => input.success), [false, true]);
      c.j.append({ type: 'rejected', label, txid: tx.id,
        body: { error: 'BROADCAST_REJECTED', data: { error: c.rejectReason || 'RPC error -26: mandatory-script-verify-flag-failed (Script failed an OP_EQUALVERIFY operation)' } } });
      if (c.crashAfterRejection) throw new Error('simulated process interruption after durable rejection');
      return false;
    }
    assert.equal(validation.success, true);
    c.j.chain.set(tx.id, tx);
    for (const input of tx.inputs) c.j.spent.add(`${input.prevTxId.toString('hex')}:${input.outputIndex}`);
    c.j.append({ type: 'accepted', label, txid: tx.id, feeSat: validation.feeSat });
    return true;
  };
  return c;
}

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'coin-admin-run-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const c = campaign(directory), certificate = new tbc.Script().add(tbc.Opcode.OP_TRUE);
  const root = new tbc.Transaction();
  root.uncheckedAddInput(new tbc.Transaction.Input({ prevTxId: Buffer.alloc(32, 0x91), outputIndex: 0,
    sequenceNumber: 0xffffffff, script: new tbc.Script() }));
  root.addOutput(new tbc.Transaction.Output({ script: certificate, satoshis: 100000 }));
  root.addOutput(new tbc.Transaction.Output({ script: tbc.Script.buildPublicKeyHashOut(c.key.toAddress()), satoshis: 20000 }));
  const adminHash = tbc.crypto.Hash.sha256ripemd160(c.admin);
  const code = Coin.instantiateCode({ coinNftCodeHash: tbc.crypto.Hash.sha256(certificate.toBuffer()),
    adminPubKeyHash: adminHash, controller: Buffer.concat([adminHash, Buffer.from([0])]), tapeSize: 66 });
  const source = new tbc.Transaction().from(buildUTXO(root, 0));
  source.addOutput(new tbc.Transaction.Output({ script: code, satoshis: 500 }));
  source.addOutput(new tbc.Transaction.Output({ script: Coin.buildTape({ tapeSize: 66, lockTime: 0,
    amounts: [7000000n, 0n, 0n, 0n, 0n, 0n] }), satoshis: 0 }));
  for (const tx of [root, source]) { c.j.saveRaw(tx); c.j.chain.set(tx.id, tx); }
  c.j.append({ type: 'campaign-init', allocatedSat: 1000000 });
  c.j.append({ type: 'accepted', label: 'funding-split', txid: root.id, feeSat: '0' });
  c.j.append({ type: 'accepted', label: SOURCE_LABEL, txid: source.id, feeSat: '0' });
  c.j.append({ type: 'basic-complete', mainCoinId: source.id });
  return c;
}

test('admin runner saves all signed candidates before probes and is idempotent after success', async t => {
  const c = fixture(t), result = await runAdmin(c);
  assert.equal(c.calls.length, 4); assert.equal(result.rejected.length, 3);
  assert.equal(c.calls.at(-1), result.control);
  const restarted = campaign(c.j.directory), signatures = restarted.j.events.filter(e => e.type === 'musig2-signature').length;
  assert.deepEqual(await runAdmin(restarted), result);
  assert.equal(restarted.calls.length, 0);
  assert.equal(restarted.j.events.filter(e => e.type === 'musig2-signature').length, signatures, 'restart never resigns the saved plan');
});

test('interruption after a durable rejection reuses raw and only submits remaining probes', async t => {
  const c = fixture(t); c.crashAfterRejection = true;
  await assert.rejects(runAdmin(c), /simulated process interruption/);
  const plan = c.j.events.find(e => e.type === 'admin-adversarial-plan');
  assert.equal(c.calls.length, 1);
  const restarted = campaign(c.j.directory), result = await runAdmin(restarted);
  assert.equal(restarted.calls.length, 3);
  assert(!restarted.calls.includes(plan.probes[0].txid));
  assert.equal(result.control, plan.control);
});

test('a node policy error cannot pass as script rejection, including on resume', async t => {
  const c = fixture(t); c.rejectReason = 'RPC error -26: bad-txns-inputs-missingorspent';
  await assert.rejects(runAdmin(c), /node must report script rejection/);
  assert.equal(c.calls.length, 1);
  const restarted = campaign(c.j.directory);
  await assert.rejects(runAdmin(restarted), /node must report script rejection/);
  assert.equal(restarted.calls.length, 0);
  for (const reason of ['insufficient fee', 'dust', 'non-final', 'txn-mempool-conflict'])
    assert.throws(() => assertScriptRejection({ type: 'rejected', txid: 'id', body: {
      error: 'BROADCAST_REJECTED', data: { error: `RPC error -26: ${reason}` },
    } }, 'id'), /node must report script rejection/);
});

test('unknown acknowledgement and mismatched saved raw both stop before further signing or sending', async t => {
  const c = fixture(t); c.j.unresolved.add('12'.repeat(32));
  await assert.rejects(runAdmin(c), /reconcile unknown/);
  assert.equal(c.calls.length, 0);
  c.j.unresolved.clear(); c.crashAfterRejection = true;
  await assert.rejects(runAdmin(c), /simulated process interruption/);
  const plan = c.j.events.find(e => e.type === 'admin-adversarial-plan');
  fs.copyFileSync(path.join(c.j.directory, `${plan.baseline}.raw`), path.join(c.j.directory, `${plan.control}.raw`));
  const restarted = campaign(c.j.directory);
  await assert.rejects(runAdmin(restarted), /saved raw must (?:match|hash)/);
  assert.equal(restarted.calls.length, 0);
});

test('shared Campaign MuSig2 method clears generated nonces when a later nonce generation fails', t => {
  const c = fixture(t), generated = [];
  const implementation = c.M;
  c.M = { ...implementation, nonceGen(options) {
    if (generated.length) throw new Error('simulated second nonce generation failure');
    const nonce = implementation.nonceGen(options); generated.push(nonce); return nonce;
  } };
  assert.throws(() => c.signAdminMessage({ inputIndex: 0, sighash: Buffer.alloc(32, 2) }, 'nonce-failure'), /second nonce/);
  assert.equal(generated.length, 1);
  assert(generated[0].secnonce.every(byte => byte === 0));
  assert.equal(c.j.events.filter(e => e.type === 'musig2-signature').length, 0);
});
