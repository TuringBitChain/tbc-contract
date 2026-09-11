'use strict';

// Explicitly opt-in real-testnet test runner. No production SDK network defaults,
// asset indexer, private-key logging, or automatic cross-network fallback.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const tbc = require('tbc-lib-js');
const TBC20 = require('../../lib/contract/tbc20.js');
const { PoolNFT3 } = require('../../lib/contract/poolNFT3.0.js');
const { privateKeySigner, PreparedPool3Transaction, p2pkhInputPlan } = require('../../lib/util/poolnft3/transaction.js');
const { validatePool3Transaction } = require('../../lib/validator/poolnft3.js');

const BASE = 'https://api.tbcdev.org/api/tbc/';
const ADDRESS = '143KgKGcse57nXBnXyJwtQrf2KP4KWto59';
const DEFAULT_DIR = path.resolve(__dirname, '../pool3-preprod-20260911');
const json = value => JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? v.toString() : v);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const silent = async fn => {
  const previous = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = previous; }
};

function localKey() {
  // Read only the existing explicitly testnet signing fixture; never execute it.
  const source = fs.readFileSync(path.resolve(__dirname, '../orderBook.test.ts'), 'utf8');
  for (const match of source.matchAll(/\b[KL5][1-9A-HJ-NP-Za-km-z]{49,51}\b/g)) {
    try {
      const candidate = tbc.PrivateKey.fromWIF(match[0]);
      if (candidate.toAddress().toString() === ADDRESS) return candidate;
    } catch { /* Not a WIF. */ }
  }
  throw new Error('The authorized 143 test-wallet signer was not found locally');
}

class TestnetJournal {
  constructor(directory = DEFAULT_DIR) {
    this.directory = directory;
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = path.join(directory, 'journal.jsonl');
    this.events = fs.existsSync(this.file) ? fs.readFileSync(this.file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
    this.chain = new Map();
    this.spent = new Set();
    this.lastBroadcast = 0;
    this.broadcastQueue = Promise.resolve();
    for (const event of this.events) {
      if (event.type === 'broadcast-attempt') this.lastBroadcast = Math.max(this.lastBroadcast, event.epochMs);
      if (event.type === 'parent' || event.type === 'accepted') {
        const tx = new tbc.Transaction(fs.readFileSync(path.join(directory, `${event.txid}.raw`), 'utf8'));
        assert.equal(tx.id, event.txid);
        this.chain.set(tx.id, tx);
        if (event.type === 'accepted') for (const input of tx.inputs) this.spent.add(`${input.prevTxId.toString('hex')}:${input.outputIndex}`);
      }
    }
    this.unresolved = new Set();
    for (const event of this.events) {
      if (event.type === 'broadcast-attempt') this.unresolved.add(event.txid);
      else if (['accepted', 'rejected', 'replay-verified'].includes(event.type)) this.unresolved.delete(event.txid);
    }
  }
  append(event) {
    const record = { at: new Date().toISOString(), ...event };
    const fd = fs.openSync(this.file, 'a', 0o600);
    try { fs.writeSync(fd, json(record) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    this.events.push(record);
    return record;
  }
  saveRaw(tx) {
    const file = path.join(this.directory, `${tx.id}.raw`), raw = tx.uncheckedSerialize();
    if (fs.existsSync(file)) assert.equal(fs.readFileSync(file, 'utf8'), raw);
    else {
      const fd = fs.openSync(file, 'wx', 0o600);
      try { fs.writeSync(fd, raw); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    }
  }
  async read(endpoint) {
    assert(/^[a-zA-Z0-9/]+$/.test(endpoint) && !endpoint.startsWith('/'), 'relative testnet path only');
    const response = await fetch(BASE + endpoint, { redirect: 'error', signal: AbortSignal.timeout(20000) });
    const body = await response.json();
    if (!response.ok || String(body.code) !== '200') throw new Error(`Testnet read ${endpoint}: ${response.status} ${json(body)}`);
    return body.data;
  }
  async parent(txid) {
    if (this.chain.has(txid)) return this.chain.get(txid);
    const data = await this.read(`txraw/txid/${txid}`);
    const tx = new tbc.Transaction(data.txraw);
    assert.equal(tx.id, txid, 'rawtx must hash to the requested id');
    this.saveRaw(tx); this.append({ type: 'parent', txid }); this.chain.set(txid, tx);
    return tx;
  }
  attach(tx) {
    for (const input of tx.inputs) {
      const parent = this.chain.get(input.prevTxId.toString('hex'));
      assert(parent, 'every input must have a locally persisted real parent');
      const output = parent.outputs[input.outputIndex];
      assert(output);
      input.output = new tbc.Transaction.Output({ satoshis: output.satoshis, script: tbc.Script.fromBuffer(Buffer.from(output.script.toBuffer())) });
    }
  }
  broadcast(result, label, options = {}) {
    const run = this.broadcastQueue.then(() => this.broadcastOne(result, label, options));
    // Fail-stop: a failed/unknown parent must prevent queued child broadcasts.
    this.broadcastQueue = run;
    return run;
  }
  async broadcastOne(result, label, { allowReject = false, expectedLocalFailures, replay = false, conflict = false } = {}) {
    assert.equal(this.unresolved.size, 0, 'unresolved prior broadcasts require read-only reconciliation before any new broadcast');
    const tx = result.transaction || result;
    this.attach(tx);
    const validation = await silent(() => validatePool3Transaction(tx));
    if (expectedLocalFailures !== undefined) {
      assert(allowReject && expectedLocalFailures.length > 0, 'negative scripts require an explicit rejection expectation');
      assert(validation.valueConserved, 'negative probes cannot violate the funding budget');
      assert.deepEqual(validation.inputs.filter(i => !i.success).map(i => i.inputIndex), expectedLocalFailures, 'negative probe fails only the intended inputs');
    } else assert(validation.success, `${label}: local input validation failed`);
    const feeSat = tx.inputs.reduce((s, i) => s + BigInt(i.output.satoshis), 0n) - tx.outputs.reduce((s, o) => s + BigInt(o.satoshis), 0n);
    assert(feeSat >= 0n && feeSat <= 100000n, 'preproduction per-transaction miner fee cap');
    if (replay) {
      assert(this.events.some(e => e.type === 'accepted' && e.txid === tx.id), 'replay requires an already accepted exact transaction');
      assert.equal(this.chain.get(tx.id).uncheckedSerialize(), tx.uncheckedSerialize());
    } else if (conflict) {
      assert(allowReject && tx.inputs.some(i => this.spent.has(`${i.prevTxId.toString('hex')}:${i.outputIndex}`)), 'conflict probe must target an explicitly known consumed input');
    } else for (const input of tx.inputs) assert(!this.spent.has(`${input.prevTxId.toString('hex')}:${input.outputIndex}`), 'local double-spend protection');
    this.saveRaw(tx);
    this.append({ type: 'prepared', label, txid: tx.id, bytes: tx.uncheckedSerialize().length / 2, feeSat,
      validation, layout: result.layout, quote: result.quote, expectedLocalFailures, replay, conflict,
      inputs: tx.inputs.map(i => ({ txid: i.prevTxId.toString('hex'), vout: i.outputIndex, satoshis: i.output.satoshis })),
      outputs: tx.outputs.map((o, vout) => ({ vout, satoshis: o.satoshis, bytes: o.script.toBuffer().length, sha256: crypto.createHash('sha256').update(o.script.toBuffer()).digest('hex') })) });
    // A serialized queue and 250ms spacing is strictly below 5 broadcasts/sec,
    // including retries, rejected probes, and process restarts.
    await pause(Math.max(0, this.lastBroadcast + 250 - Date.now()));
    this.lastBroadcast = Date.now();
    this.append({ type: 'broadcast-attempt', label, txid: tx.id, epochMs: this.lastBroadcast, endpoint: BASE + 'broadcasttx' });
    this.unresolved.add(tx.id);
    let response, body;
    try {
      response = await fetch(BASE + 'broadcasttx', { method: 'POST', redirect: 'error', body: json({ txraw: tx.uncheckedSerialize() }), signal: AbortSignal.timeout(30000) });
      body = await response.json();
    } catch (error) {
      this.append({ type: 'unknown', label, txid: tx.id, error: error.message });
      throw new Error('Broadcast acknowledgement unknown: stop and reconcile saved raw, do not replace transaction');
    }
    this.append({ type: 'broadcast-response', label, txid: tx.id, status: response.status, body });
    if (replay) {
      const known = response.ok && String(body.code) === '200' && body.data?.txid === tx.id;
      const already = body.error === 'BROADCAST_REJECTED' && /already|txn-already-known|mempool/i.test(body.data?.error || '');
      if (known || already) {
        const data = await this.read(`txraw/txid/${tx.id}`);
        assert.equal(data.txraw, tx.uncheckedSerialize());
        this.append({ type: 'replay-verified', label, txid: tx.id, rawMatches: true, body });
        this.unresolved.delete(tx.id);
        console.log(json({ label, txid: tx.id, replayVerified: true }));
        return true;
      }
    }
    if (response.ok && String(body.code) === '200' && body.data?.txid === tx.id) {
      let visible = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        try { const raw = await this.read(`txraw/txid/${tx.id}`); assert.equal(raw.txraw, tx.uncheckedSerialize()); visible = true; break; }
        catch { await pause(1000); }
      }
      if (!visible) { this.append({ type: 'unknown', label, txid: tx.id, error: 'accepted response but raw retrieval unverified' }); throw new Error('Accepted transaction visibility not verified'); }
      this.chain.set(tx.id, tx);
      for (const input of tx.inputs) this.spent.add(`${input.prevTxId.toString('hex')}:${input.outputIndex}`);
      this.append({ type: 'accepted', label, txid: tx.id, feeSat, rawRetrieved: true });
      this.unresolved.delete(tx.id);
      console.log(json({ label, txid: tx.id, accepted: true, feeSat }));
      return true;
    }
    if (body.error !== 'BROADCAST_REJECTED' || !/^RPC error -26: /.test(body.data?.error || '')) {
      this.append({ type: 'unknown', label, txid: tx.id, body });
      throw new Error('Ambiguous broadcast response: reconciliation is required before using these inputs');
    }
    this.append({ type: 'rejected', label, txid: tx.id, body });
    this.unresolved.delete(tx.id);
    console.log(json({ label, txid: tx.id, accepted: false, body }));
    if (!allowReject) throw new Error(`Testnet rejected ${label}: ${json(body)}`);
    return false;
  }
}

async function controls(journal) {
  const done = journal.events.find(e => e.type === 'smoke-complete');
  assert(done && done.outcomes.length === 4 && done.outcomes.every(o => !o.accepted), 'controls require the four recorded Pool genesis rejections');
  assert(!journal.events.some(e => e.label?.startsWith('control:')), 'controls are one-shot');
  const key = localKey(), signer = privateKeySigner(key);
  const sourceId = journal.events.find(e => e.type === 'accepted' && e.label === 'smoke:pool-source').txid;
  let funding = { parentTx: journal.chain.get(sourceId), outputIndex: 0, signer };
  const rejectedPool = new tbc.Transaction(fs.readFileSync(path.join(journal.directory, `${done.outcomes[0].txid}.raw`), 'utf8'));
  const originalTape = rejectedPool.outputs[1].script.toBuffer();
  const canonicalTape = Buffer.concat([Buffer.from('006a4c82', 'hex'), originalTape.subarray(3)]);
  const build = async outputs => silent(() => new PreparedPool3Transaction({ inputs: [p2pkhInputPlan(funding)], outputs, changeAddress: ADDRESS }).sign());
  // Independent diagnostic data transactions only. This does NOT modify the
  // frozen Pool contract or create a usable Pool3 instance.
  const original = await build([new tbc.Transaction.Output({ script: tbc.Script.fromBuffer(originalTape), satoshis: 0 })]);
  assert.equal(await journal.broadcast(original, 'control:raw-006a82-no-pool-code', { allowReject: true }), false);
  const nine = await build([new tbc.Transaction.Output({ script: tbc.Script.buildPublicKeyHashOut(ADDRESS), satoshis: 9 })]);
  assert.equal(await journal.broadcast(nine, 'control:p2pkh-9-sat', { allowReject: true }), false);
  const canonical = await build([
    new tbc.Transaction.Output({ script: tbc.Script.fromBuffer(canonicalTape), satoshis: 0 }),
    new tbc.Transaction.Output({ script: tbc.Script.buildPublicKeyHashOut(ADDRESS), satoshis: 10 }),
    new tbc.Transaction.Output({ script: tbc.Script.buildPublicKeyHashOut(ADDRESS), satoshis: 41 }),
  ]);
  assert.equal(await journal.broadcast(canonical, 'control:canonical-data-and-p2pkh-10-41-sat'), true);
  funding = { parentTx: canonical.transaction, outputIndex: canonical.changeVout, signer };
  const ftId = journal.events.find(e => e.type === 'accepted' && e.label === 'smoke:tbc20-genesis').txid;
  const genesis = journal.chain.get(ftId);
  const token = new TBC20({ codeScript: genesis.outputs[0].script, tapeScript: genesis.outputs[1].script, contractTxid: genesis.id });
  const utxo = (tx, index) => ({ txId: tx.id, outputIndex: index, script: tx.outputs[index].script.toHex(), satoshis: tx.outputs[index].satoshis });
  const transfer = await silent(() => token.transfer({
    inputs: [{ utxo: utxo(genesis, 0), parentTx: genesis, ancestors: journal.chain, signingKey: key }],
    receivers: [{ controller: ADDRESS, amount: 1n }],
    feeInputs: [{ utxo: utxo(funding.parentTx, funding.outputIndex), privateKey: key }],
    tokenChangeController: ADDRESS, tbcChangeAddress: ADDRESS,
  }));
  await journal.broadcast(transfer.transaction, 'control:tbc20-real-contract-spend');
  journal.append({ type: 'controls-complete', originalTapeBytes: originalTape.length, canonicalDataBytes: canonicalTape.length,
    note: 'Canonical Tape diagnostic has no Pool Code; no Pool contract/template has been fixed or validated by this control.' });
}

async function smoke(journal) {
  assert(!journal.events.some(e => e.type === 'broadcast-attempt'), 'smoke is one-shot; use a new directory only for a separately authorized test run');
  const key = localKey(), signer = privateKeySigner(key);
  const blocks = await journal.read('recentblocks/start/0/end/1');
  const list = await journal.read(`utxo/address/${ADDRESS}`);
  const candidates = list.utxos.filter(u => Number.isSafeInteger(u.value) && u.value >= 30000 && u.value <= 200000 && u.height > 0).sort((a, b) => a.value - b.value);
  assert(candidates.length, 'no small confirmed UTXO available; never consume the large wallet balance implicitly');
  const selected = candidates[0], parent = await journal.parent(selected.txid), output = parent.outputs[selected.index];
  assert.equal(output.satoshis, selected.value);
  assert.equal(output.script.toHex(), tbc.Script.buildPublicKeyHashOut(ADDRESS).toHex());
  journal.append({ type: 'preflight', network: 'testnet', endpoint: BASE, address: ADDRESS, latestBlock: blocks[0], funding: selected,
    scope: 'small preflight TBC20 mint + four Pool3 genesis variants; no liquidity until relay gate passes', maximumBroadcastTps: 4 });
  const token = new TBC20({ extensionData: Buffer.from('040102030409', 'hex') });
  const ft = await silent(() => token.mint(key, ADDRESS, 2_000_000_000n, { txId: parent.id, outputIndex: selected.index, script: output.script.toHex(), satoshis: output.satoshis }));
  await journal.broadcast(ft.sourceTransaction, 'smoke:tbc20-source');
  await journal.broadcast(ft.transaction, 'smoke:tbc20-genesis');
  const members = Array.from({ length: 5 }, (_, i) => {
    const secret = crypto.createHmac('sha256', key.toBuffer()).update(`pool3-preprod-controller-${i}`).digest();
    return new tbc.PrivateKey(secret);
  });
  const probe = new PoolNFT3({ ftGenesisTx: ft.transaction });
  const initial = await silent(() => probe.mintPoolNFT({ funding: { parentTx: ft.transaction, outputIndex: 2, signer } }));
  await journal.broadcast(initial.source, 'smoke:pool-source');
  const funding = { parentTx: initial.source.transaction, outputIndex: 0, signer };
  const outcomes = [];
  variants: for (const timelocked of [false, true]) for (const controllerCount of [0, 5]) {
    const name = `${controllerCount ? 'controller5' : 'public'}-${timelocked ? 'timelocked' : 'plain'}`;
    const pool = new PoolNFT3({ ftGenesisTx: ft.transaction, lp: { kind: timelocked ? 'timelocked' : 'plain' },
      authorization: controllerCount ? { kind: 'controller', controllerPubKeyHashes: members.map(k => tbc.crypto.Hash.sha256ripemd160(k.publicKey.toBuffer()).toString('hex')) } : { kind: 'public' } });
    const genesis = await silent(() => pool.prepareMintPoolNFT({ funding }).sign());
    const accepted = await journal.broadcast(genesis, `smoke:pool-${name}`, { allowReject: true });
    outcomes.push({ name, txid: genesis.txid, accepted });
    if (accepted) break variants; // This root is now spent; a lifecycle run needs its own explicit funding split.
  }
  journal.append({ type: 'smoke-complete', outcomes });
  console.log(json({ outcomes, journal: journal.file }));
}

async function reconcile(journal) {
  const node = await journal.read('nodeinfo');
  const mempool = await journal.read('mempooltxs');
  const accepted = journal.events.filter(e => e.type === 'accepted');
  const observations = [];
  for (const event of accepted) {
    const detail = await journal.read(`decode/txid/${event.txid}`);
    assert.equal(detail.txid, event.txid);
    const raw = await journal.read(`txraw/txid/${event.txid}`);
    assert.equal(raw.txraw, journal.chain.get(event.txid).uncheckedSerialize());
    const observation = { type: 'chain-observation', txid: event.txid, label: event.label,
      confirmations: detail.confirmations || 0, blockhash: detail.blockhash || null, blockheight: detail.blockheight ?? null,
      ordinaryMempool: Array.isArray(mempool) && mempool.includes(event.txid), rawMatches: true };
    observations.push(observation); journal.append(observation);
  }
  const wallet = await journal.read(`utxo/address/${ADDRESS}`);
  const walletSet = new Set(wallet.utxos.map(u => `${u.txid}:${u.index}`));
  const liveOutputs = [];
  let walletSat = 0n, tokenCodeSat = 0n, ftRaw = 0n;
  const script = tbc.Script.buildPublicKeyHashOut(ADDRESS).toHex();
  for (const event of accepted) {
    const tx = journal.chain.get(event.txid);
    for (const [vout, output] of tx.outputs.entries()) {
      if (journal.spent.has(`${tx.id}:${vout}`) || output.script.toHex().startsWith('006a')) continue;
      const entry = { txid: tx.id, vout, satoshis: output.satoshis };
      if (output.script.toHex() === script) {
        entry.role = 'wallet-p2pkh'; entry.basicUtxoApiVisible = walletSet.has(`${tx.id}:${vout}`);
        walletSat += BigInt(output.satoshis);
      } else {
        TBC20.validateCode(output.script, 66);
        const parsed = TBC20.parseTape(tx.outputs[vout + 1].script);
        entry.role = 'test-tbc20'; entry.amountRaw = parsed.balance.toString();
        tokenCodeSat += BigInt(output.satoshis); ftRaw += parsed.balance;
      }
      liveOutputs.push(entry);
    }
  }
  const attempts = journal.events.filter(e => e.type === 'broadcast-attempt');
  const intervals = attempts.slice(1).map((e, i) => e.epochMs - attempts[i].epochMs);
  let maxInOneSecond = 0;
  for (const event of attempts) maxInOneSecond = Math.max(maxInOneSecond, attempts.filter(e => e.epochMs >= event.epochMs && e.epochMs < event.epochMs + 1000).length);
  const feeSat = accepted.reduce((sum, e) => sum + BigInt(e.feeSat), 0n);
  const initialSat = BigInt(journal.events.find(e => e.type === 'preflight').funding.value);
  assert.equal(walletSat + tokenCodeSat + feeSat, initialSat, 'all test funding must reconcile exactly');
  assert.equal(ftRaw, 2_000_000_000n, 'test FT supply must reconcile locally, without asset indexer');
  assert(maxInOneSecond <= 5);
  const report = { at: new Date().toISOString(), network: 'testnet', endpoint: BASE, node, wallet: ADDRESS,
    attempts: attempts.length, accepted: accepted.length, rejected: journal.events.filter(e => e.type === 'rejected').length,
    unknown: [...journal.unresolved], minimumBroadcastIntervalMs: Math.min(...intervals), maxBroadcastsInOneSecond: maxInOneSecond,
    initialSat, minerFeeSat: feeSat, walletSat, tokenCodeSat, ftRaw, liveOutputs, observations,
    poolLifecycleGate: 'BLOCKED: all four Pool genesis transactions rejected as dust',
    controlsDoNotFixPool: true };
  const reportFile = path.join(journal.directory, 'report.json');
  const fd = fs.openSync(reportFile, 'w', 0o600);
  try { fs.writeSync(fd, json(report) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  journal.append({ type: 'reconciled', reportFile, minerFeeSat: feeSat, walletSat, tokenCodeSat, ftRaw });
  console.log(json(report));
}

async function main() {
  assert(['smoke', 'controls', 'reconcile'].includes(process.argv[2]), 'usage: node test/pool3/pool3-testnet-runner.cjs smoke|controls|reconcile [journal-directory]');
  const directory = process.argv[3] ? path.resolve(process.argv[3]) : DEFAULT_DIR;
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lockPath = path.join(directory, 'runner.lock');
  const lock = fs.openSync(lockPath, 'wx', 0o600);
  fs.writeSync(lock, json({ pid: process.pid, at: new Date().toISOString() }));
  try {
    const journal = new TestnetJournal(directory);
    if (process.argv[2] === 'smoke') await smoke(journal);
    else if (process.argv[2] === 'controls') await controls(journal);
    else await reconcile(journal);
  } finally { fs.closeSync(lock); fs.unlinkSync(lockPath); }
}
module.exports = { TestnetJournal, localKey, silent, BASE, ADDRESS, DEFAULT_DIR };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
