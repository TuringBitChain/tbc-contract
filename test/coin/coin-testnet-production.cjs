'use strict';

// Opt-in real testnet campaign. Public evidence is durable before any broadcast.
// Local fixture secrets are never serialized; the funding ceiling is one TBC.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const tbc = require('tbc-lib-js');
const Coin = require('../../lib/contract/coinTbc20.js');
const { CoinTBC20 } = require('../../lib/util/coin/coinTbc20Code.js');
const { buildUTXO } = require('../../lib/util/common/util.js');
const { TestnetJournal, localKey, silent, BASE, ADDRESS } = require('../pool3/pool3-testnet-runner.cjs');
const { validatePool3Transaction } = require('../../lib/validator/poolnft3.js');

const ROOT = path.resolve(__dirname, '../..');
const RUN = 'coin-testnet-20260916-r1';
const DIRECTORY = path.join(ROOT, 'test', RUN);
const MARKER = Buffer.from('COINTBC20CODE2');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const json = data => JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v);
const addr = key => key.toAddress().toString();
const ownerId = key => tbc.crypto.Hash.sha256ripemd160(key.publicKey.toBuffer()).toString('hex') + '00';
const human = (raw, decimal) => decimal ? `${raw / 10n ** BigInt(decimal)}.${(raw % 10n ** BigInt(decimal)).toString().padStart(decimal, '0')}` : String(raw);
const coins = tx => tx.outputs.flatMap((out, vout) => out.script.toBuffer().subarray(-MARKER.length).equals(MARKER)
  ? [{ tx, vout, utxo: Coin.buildUTXO(tx, vout), ...CoinTBC20.parseTape(tx.outputs[vout + 1].script),
    controller: CoinTBC20.parseCode(out.script).controller.toString('hex') }] : []);
const supply = tx => BigInt(JSON.parse(tx.outputs[2].script.chunks.at(-2).buf.toString()).coinTotalSupply);

async function withCampaignLock(fn, directory = DIRECTORY) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, 'writer.lock');
  for (;;) {
    try { fs.writeFileSync(file, JSON.stringify({ pid: process.pid, started: new Date().toISOString() }), { flag: 'wx', mode: 0o600 }); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const prior = JSON.parse(fs.readFileSync(file, 'utf8'));
      let alive = true;
      try { process.kill(prior.pid, 0); } catch (check) { if (check.code === 'ESRCH') alive = false; else throw check; }
      assert(!alive, 'another campaign writer is running');
      fs.unlinkSync(file);
    }
  }
  try { return await fn(); } finally { fs.unlinkSync(file); }
}

class Campaign {
  constructor(directory = DIRECTORY) {
    tbc.Script.Interpreter.MAX_SCRIPT_ELEMENT_SIZE = Number.MAX_SAFE_INTEGER;
    tbc.Script.Interpreter.MAXIMUM_ELEMENT_SIZE = Number.MAX_SAFE_INTEGER;
    this.j = new TestnetJournal(directory);
    this.key = localKey();
    this.keys = { owner: this.key };
    for (const role of ['bob', 'carol', 'xonly', 'admin1', 'admin2']) this.keys[role] = new tbc.PrivateKey(
      crypto.createHmac('sha256', this.key.toBuffer()).update(`${RUN}:${role}`).digest('hex'));
    this.adminKeys = [this.keys.admin1, this.keys.admin2];
    this.M = tbc.crypto.MuSig2;
    this.adminPubkeys = this.adminKeys.map(k => this.M.pubkeyFromSk(k.toBuffer()));
    this.adminContext = this.M.keyAgg(this.M.keySort(this.adminPubkeys));
    this.admin = this.M.getAggPubkey(this.adminContext);
  }
  load(txid) {
    assert(/^[0-9a-f]{64}$/.test(txid));
    const tx = new tbc.Transaction(fs.readFileSync(path.join(this.j.directory, `${txid}.raw`), 'utf8'));
    assert.equal(tx.id, txid, 'saved raw must hash to its journal identity');
    return tx;
  }
  async bundle(label, build, options = {}) {
    let saved = this.j.events.find(e => e.type === 'signed-bundle' && e.label === label);
    if (!saved) {
      const raw = await silent(build);
      const txs = (Array.isArray(raw) ? raw : [raw]).map(item => item instanceof tbc.Transaction ? item : new tbc.Transaction(item.txraw || item));
      for (const tx of txs) this.j.saveRaw(tx);
      saved = this.j.append({ type: 'signed-bundle', label, txids: txs.map(tx => tx.id) });
    }
    const txs = saved.txids.map(id => this.load(id));
    for (const [i, tx] of txs.entries()) {
      if (this.j.events.some(e => e.type === 'accepted' && e.txid === tx.id)) continue;
      this.j.attach(tx);
      const fee = tx.inputs.reduce((n, input) => n + input.output.satoshis, 0) - tx.outputs.reduce((n, output) => n + output.satoshis, 0);
      assert(fee >= Math.max(80, Math.ceil(tx.toBuffer().length * 80 / 1000)) && fee <= 10000, `${label}: fee bounds`);
      const spentFees = this.j.events.filter(e => e.type === 'accepted').reduce((n, e) => n + Number(e.feeSat), 0);
      assert(spentFees + fee <= 500000, 'campaign fee ceiling');
      assert.equal(await this.j.broadcast(tx, txs.length === 1 ? label : `${label}:${i}`, options), true);
    }
    return txs;
  }
  async step(label, build) { return (await this.bundle(label, build))[0]; }
  fee(key = this.key, minimum = 12000) {
    const script = tbc.Script.buildPublicKeyHashOut(key.toAddress()).toHex();
    const candidates = [];
    const reserved = new Set(this.j.events.filter(e => e.type === 'future-reservation').flatMap(e => e.inputs));
    // Every durable signed plan reserves its inputs, including a crash before
    // the first broadcast. Other entry points cannot repurpose those fee UTXOs.
    for (const event of this.j.events) {
      const ids = event.type === 'signed-bundle' ? event.txids
        : ['adversarial-plan', 'issuance-negative-plan', 'admin-adversarial-plan'].includes(event.type) ? [event.control] : [];
      for (const id of ids) for (const input of this.load(id).inputs)
        reserved.add(`${input.prevTxId.toString('hex')}:${input.outputIndex}`);
    }
    for (const e of this.j.events.filter(e => e.type === 'accepted')) {
      const tx = this.j.chain.get(e.txid);
      tx.outputs.forEach((out, vout) => {
        const ref = `${tx.id}:${vout}`;
        if (out.satoshis >= minimum && out.script.toHex() === script && !this.j.spent.has(ref) && !reserved.has(ref))
          candidates.push({ tx, vout, satoshis: out.satoshis });
      });
    }
    candidates.sort((a, b) => a.satoshis - b.satoshis);
    assert(candidates.length, 'funded campaign fee output available');
    return buildUTXO(candidates[0].tx, candidates[0].vout);
  }
  signAdminMessage({ inputIndex, sighash }, label) {
    assert(Number.isInteger(inputIndex) && inputIndex >= 0);
    assert(Buffer.isBuffer(sighash) && sighash.length === 32);
    const msg = Buffer.from(sighash), nonces = [];
    try {
      for (const [i, key] of this.adminKeys.entries()) {
        const secret = key.toBuffer();
        try { nonces.push(this.M.nonceGen({ pk: this.adminPubkeys[i], sk: secret, aggpk: this.admin, msg })); }
        finally { secret.fill(0); }
      }
      const session = this.M.buildSession(this.adminContext, this.M.nonceAgg(nonces.map(n => n.pubnonce)), msg);
      const partials = this.adminKeys.map((key, i) => {
        const secret = key.toBuffer();
        try { return this.M.partialSign(nonces[i].secnonce, secret, session); }
        finally { secret.fill(0); nonces[i].secnonce.fill(0); }
      });
      partials.forEach((sig, i) => assert(this.M.partialVerify(sig, nonces[i].pubnonce, this.adminPubkeys[i], session)));
      const signature = this.M.partialSigAgg(partials, session);
      assert(tbc.crypto.Schnorr.verify(msg, signature, this.admin));
      this.j.append({ type: 'musig2-signature', label, inputIndex, sighash: msg.toString('hex'),
        participants: this.adminPubkeys.map(p => p.toString('hex')), aggregatePublicKey: this.admin.toString('hex'),
        publicNonces: nonces.map(n => n.pubnonce.toString('hex')), partialVerified: true, aggregateVerified: true });
      return signature;
    } finally { nonces.forEach(n => n.secnonce.fill(0)); }
  }
  finalize(prepared, label) {
    return prepared.finalize(prepared.sighashes.map(item => this.signAdminMessage(item, label)));
  }
  async fund() {
    if (!this.j.events.some(e => e.type === 'campaign-init')) {
      const node = await this.j.read('nodeinfo');
      const list = await this.j.read(`utxo/address/${ADDRESS}`);
      const selected = list.utxos.find(u => u.value === 1000000 && u.height > 0);
      assert(selected, 'one confirmed 1 TBC fixture output required');
      const parent = await this.j.parent(selected.txid);
      assert.equal(parent.outputs[selected.index].satoshis, 1000000);
      assert.equal(parent.outputs[selected.index].script.toHex(), tbc.Script.buildPublicKeyHashOut(ADDRESS).toHex());
      // Record the current implementation, including the extracted codec.
      // Existing journal fingerprints remain unchanged; the frozen SDK
      // archive is required to reproduce the historical r1 campaign.
      const files = ['lib/contract/stableCoin.js', 'lib/contract/coinTbc20.js', 'lib/util/coin/coinTbc20unlock.js',
        'lib/util/coin/coinTbc20Code.ts', 'lib/util/coin/coinTbc20Code.js'];
      this.j.append({ type: 'campaign-init', network: 'testnet', endpoint: BASE, funding: selected, allocatedSat: 1000000,
        wallet: ADDRESS, node, artifactFile: 'lib/util/coin/artifacts/coin_tbc20.json', artifactSHA: sha(fs.readFileSync(path.join(ROOT, 'lib/util/coin/artifacts/coin_tbc20.json'))),
        sdkFiles: Object.fromEntries(files.map(f => [f, sha(fs.readFileSync(path.join(ROOT, f)))])),
        signerPublicKeys: Object.fromEntries(Object.entries(this.keys).map(([r, k]) => [r, k.publicKey.toString()])),
        aggregateAdmin: this.admin.toString('hex'), derivationNamespace: RUN, maximumFeeSat: 500000, maximumBroadcastTps: 4 });
    }
    const init = this.j.events.find(e => e.type === 'campaign-init');
    assert.equal(init.endpoint, BASE); assert.equal(init.allocatedSat, 1000000);
    assert.equal(init.derivationNamespace, RUN); assert.equal(init.aggregateAdmin, this.admin.toString('hex'));
    assert.equal(init.artifactSHA, sha(fs.readFileSync(path.join(ROOT, init.artifactFile))), 'same contract artifact on resume');
    for (const [file, expected] of Object.entries(init.sdkFiles)) assert.equal(sha(fs.readFileSync(path.join(ROOT, file))), expected, `same SDK on resume: ${file}`);
    for (const [role, publicKey] of Object.entries(init.signerPublicKeys)) assert.equal(this.keys[role].publicKey.toString(), publicKey, `same signer on resume: ${role}`);
    return this.step('funding-split', () => {
      const tx = new tbc.Transaction().from(buildUTXO(this.j.chain.get(init.funding.txid), init.funding.index));
      for (let i = 0; i < 2; i++) tx.to(ADDRESS, 60000);
      for (const [role, count] of [['owner', 28], ['bob', 6], ['carol', 4], ['xonly', 2]])
        for (let i = 0; i < count; i++) tx.to(addr(this.keys[role]), 20000);
      tx.feePerKb(80).change(ADDRESS).sign(this.key);
      return tx;
    });
  }
  async create(label, definition) {
    const [issuer, first] = await this.bundle(`${label}:create`, () => {
      const sdk = new Coin(definition), fee = this.fee(this.key, 50000);
      return this.finalize(sdk.createCoin(this.admin, this.key, ADDRESS, fee, this.j.chain.get(fee.txId), `${RUN} ${label}`), `${label}:create`);
    });
    const sdk = new Coin(first.id);
    sdk.initialize({ ...definition, contractTxid: first.id, totalSupply: supply(first), codeScript: first.outputs[3].script.toHex(), tapeScript: first.outputs[4].script.toHex() });
    return { sdk, issuer, first };
  }
  async mint(label, sdk, parent, grandparent, amount) {
    return this.step(label, () => this.finalize(sdk.mintCoin(this.admin, this.key, ADDRESS, amount, this.fee(), parent, grandparent, label), label));
  }
  async send(label, sdk, inputs, key, recipient, amount, extra) {
    return this.step(label, () => extra instanceof Buffer
      ? sdk.transferWithAdditionalInfo(key, recipient, amount, inputs.map(c => c.utxo), this.fee(key), inputs.map(c => c.tx), this.j.chain, extra)
      : sdk.transfer(key, recipient, amount, inputs.map(c => c.utxo), this.fee(key), inputs.map(c => c.tx), this.j.chain, extra));
  }
  async lock(label, sdk, inputs, lockTime) {
    return this.step(label, () => this.finalize(sdk.freezeCoinUTXO(this.admin, this.key, lockTime, inputs.map(c => c.utxo), this.fee(), inputs.map(c => c.tx), this.j.chain), label));
  }
  async thaw(label, sdk, inputs) {
    return this.step(label, () => this.finalize(sdk.unfreezeCoinUTXO(this.admin, this.key, inputs.map(c => c.utxo), this.fee(), inputs.map(c => c.tx), this.j.chain), label));
  }
}

async function run(c, stage = 'basic') {
  await c.fund();
  const main = await c.create('usd', { name: 'Testnet USD 20260916', symbol: 'TUSD26', decimal: 6, amount: '10000.123456' });
  const { sdk, first, issuer } = main;
  const second = await c.mint('usd:mint-2', sdk, first, issuer, '0.000001');
  const third = await c.mint('usd:mint-3', sdk, second, first, '25.876543');
  assert.equal(supply(third), 10026000000n);
  const received = await c.send('usd:transfer-with-tbc', sdk, coins(first), c.key, addr(c.keys.bob), '125.123456', '0.001');
  const bob = coins(received)[0];
  const memo = Buffer.from(JSON.stringify({ invoice: RUN, description: '测试网稳定币付款说明' }));
  const carolTx = await c.send('usd:transfer-memo', sdk, [bob], c.keys.bob, addr(c.keys.carol), '25.123456', memo);
  const returned = await c.send('usd:exact-no-change', sdk, [coins(carolTx)[0]], c.keys.carol, ADDRESS, '25.123456');
  assert.equal(coins(returned).length, 1);
  const batch = await c.bundle('usd:batch-12', () => sdk.batchTransfer(c.key,
    Array.from({ length: 12 }, () => ({ address: ADDRESS, amount: '1.25' })), [coins(received)[1].utxo], c.fee(), [received], c.j.chain));
  assert.equal(batch.length, 3);
  const fragments = batch.flatMap(coins).filter(x => x.balance === 1250000n);
  assert.equal(fragments.length, 12);
  const merged = await c.bundle('usd:merge-12', () => sdk.mergeCoin(c.key, fragments.map(x => x.utxo), c.fee(), fragments.map(x => x.tx), c.j.chain, [...c.j.chain.values()]));
  assert.equal(coins(merged.at(-1))[0].balance, 15000000n);
  const xonly = c.keys.xonly.publicKey.toBuffer().subarray(1);
  const xaddr = tbc.Address.fromPublicKeyHash(tbc.crypto.Hash.sha256ripemd160(xonly)).toString();
  const toX = await c.send('usd:receive-xonly', sdk, coins(returned), c.key, xaddr, '25.123456');
  const fromX = await c.send('usd:spend-xonly', sdk, coins(toX), c.keys.xonly, ADDRESS, '25.123456');
  const distribution = await c.bundle('usd:multi-owner-distribution', () => sdk.batchTransfer(c.key,
    [{ address: addr(c.keys.bob), amount: '3' }, { address: addr(c.keys.bob), amount: '4' }, { address: addr(c.keys.carol), amount: '5' }],
    [coins(fromX)[0].utxo], c.fee(), [fromX], c.j.chain));
  const foreignOwners = coins(distribution[0]).filter(x => x.controller !== ownerId(c.key));
  const frozen = await c.lock('usd:freeze-multi-owner-uint32max', sdk, foreignOwners, 0xffffffff);
  assert.equal(coins(frozen).length, 2); assert(coins(frozen).every(x => x.lockTime === 0xffffffff));
  const refrozen = await c.lock('usd:refreeze-height', sdk, coins(frozen), 499999999);
  const thawed = await c.thaw('usd:unfreeze-before-maturity', sdk, coins(refrozen));
  assert(coins(thawed).every(x => x.lockTime === 0));
  const bobReturned = await c.send('usd:holder-after-unfreeze', sdk, [coins(thawed).find(x => x.controller === ownerId(c.keys.bob))], c.keys.bob, ADDRESS, '7');
  const node = await c.j.read('nodeinfo');
  // Recorded targets keep restart behavior deterministic even when the tip advances.
  let targets = c.j.events.find(e => e.type === 'mature-lock-targets');
  if (!targets) targets = c.j.append({ type: 'mature-lock-targets', height: node.blocks - 1, timestamp: node.mediantime - 1, node });
  const heightFrozen = await c.lock('usd:lock-mature-height', sdk, coins(bobReturned), targets.height);
  const heightSpent = await c.send('usd:spend-mature-height', sdk, coins(heightFrozen), c.key, ADDRESS, '7');
  const timeFrozen = await c.lock('usd:lock-mature-timestamp', sdk, coins(heightSpent), targets.timestamp);
  const timeSpent = await c.send('usd:spend-mature-timestamp', sdk, coins(timeFrozen), c.key, ADDRESS, '7');
  const boundary = await c.create('bigint', { name: 'Precision Boundary 26', symbol: 'BIG26', decimal: 0, amount: '9007199254740993' });
  const bigSent = await c.send('bigint:exact-over-max-safe', boundary.sdk, coins(boundary.first), c.key, addr(c.keys.bob), '9007199254740992');
  assert.deepEqual(coins(bigSent).map(x => x.balance), [9007199254740992n, 1n]);
  if (!c.j.events.some(e => e.type === 'basic-complete')) c.j.append({ type: 'basic-complete', mainCoinId: first.id, latestIssuer: third.id, boundaryCoinId: boundary.first.id,
    mainSupply: supply(third), boundarySupply: supply(boundary.first), lastLockSpend: timeSpent.id });
  console.log(json({ stage, accepted: c.j.events.filter(e => e.type === 'accepted').length, mainCoinId: first.id, boundaryCoinId: boundary.first.id }));
  return { ...main, second, third, timeSpent, batch, merged, distribution: distribution[0], thawed, boundary, bigSent };
}

if (require.main === module) {
  assert(process.argv.includes('--testnet'), 'explicit --testnet required; this script spends real testnet funds');
  withCampaignLock(() => run(new Campaign())).catch(error => { console.error(error.stack); process.exitCode = 1; });
}
module.exports = { Campaign, run, coins, human, ownerId, addr, DIRECTORY, RUN, BASE, withCampaignLock };
