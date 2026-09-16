'use strict';
const assert = require('node:assert/strict');
const tbc = require('tbc-lib-js');
const { Campaign, run, coins, human, addr, BASE, withCampaignLock } = require('./coin-testnet-production.cjs');
const { prepareCoinAdversarial, validateCoinTransaction } = require('./coin-testnet-adversarial.cjs');
const { CoinTBC20 } = require('../../lib/util/coinTbc20Code.js');
const Coin = require('../../lib/contract/coinTbc20.js');
const { silent } = require('../pool3/pool3-testnet-runner.cjs');
const sha = b => tbc.crypto.Hash.sha256(b);
const hash160 = b => tbc.crypto.Hash.sha256ripemd160(b);
const output = (script, satoshis) => new tbc.Transaction.Output({ script, satoshis });

async function probe(c, label, sdk, inputs, cases, conflict = false) {
  let plan = c.j.events.find(e => e.type === 'adversarial-plan' && e.label === label);
  if (!plan) {
    const fee = c.fee(), amount = human(inputs.reduce((n, x) => n + x.balance, 0n), sdk.decimal);
    const build = recipient => new tbc.Transaction(sdk.transfer(c.key, recipient, amount, inputs.map(x => x.utxo), fee, inputs.map(x => x.tx), c.j.chain));
    const valid = await silent(() => build(addr(c.key))); c.j.attach(valid); c.j.saveRaw(valid);
    const probes = prepareCoinAdversarial({ validTransaction: valid,
      coinInputs: inputs.map((x, inputIndex) => ({ inputIndex, parentTx: x.tx, outputIndex: x.vout, signingKey: c.key, ancestors: c.j.chain })),
      fee: { inputIndex: inputs.length, privateKey: c.key }, ...(cases ? { cases } : {}) });
    probes.forEach(p => c.j.saveRaw(p.transaction));
    const competitor = conflict ? await silent(() => build(addr(c.keys.bob))) : undefined;
    if (competitor) { c.j.attach(competitor); assert(validateCoinTransaction(competitor).success); c.j.saveRaw(competitor); }
    plan = c.j.append({ type: 'adversarial-plan', label, control: valid.id, conflict: competitor?.id,
      probes: probes.map(p => ({ label: p.label, txid: p.txid, expectedLocalFailures: p.expectedLocalFailures })) });
  }
  for (const p of plan.probes) {
    const fullLabel = `${label}:${p.label}`;
    if (c.j.events.some(e => e.type === 'rejected' && e.txid === p.txid)) continue;
    assert.equal(await c.j.broadcast(c.load(p.txid), fullLabel, { allowReject: true, expectedLocalFailures: p.expectedLocalFailures }), false);
    const result = c.j.events.findLast(e => e.type === 'rejected' && e.txid === p.txid);
    assert(/script|VERIFY|EQUAL|stack|opcode/i.test(result.body.data.error), 'node must reject the target script, not missing inputs/funding/finality');
  }
  const control = await c.step(`${label}:valid-control`, () => c.load(plan.control));
  if (plan.conflict && !c.j.events.some(e => e.type === 'rejected' && e.txid === plan.conflict)) {
    assert.equal(await c.j.broadcast(c.load(plan.conflict), `${label}:double-spend`, { allowReject: true, conflict: true }), false);
    const result = c.j.events.findLast(e => e.type === 'rejected' && e.txid === plan.conflict);
    assert(/conflict|spent|missing-input/i.test(result.body.data.error), 'valid competing spend must receive an input-conflict rejection');
  }
  if (!c.j.events.some(e => e.type === 'replay-verified' && e.txid === control.id))
    await c.j.broadcast(control, `${label}:exact-replay`, { replay: true });
  return control;
}

function contractSpend(c, sdk, coin) {
  const fee = c.fee(), funding = c.j.chain.get(fee.txId);
  const tx = new tbc.Transaction().from(fee);
  tx.addInputFromPrevTx(coin.tx, coin.vout); tx.setInputSequence(1, 0xfffffffe);
  tx.setLockTime(coin.lockTime);
  tx.addOutput(output(Coin.buildFTtransferCode(sdk.codeScript, addr(c.key)), 500));
  tx.addOutput(output(CoinTBC20.setLockTime(CoinTBC20.replaceTapeAmounts(coin.tx.outputs[coin.vout + 1].script,
    [0n, coin.balance, 0n, 0n, 0n, 0n]), 0), 0));
  const feeSat = 1500;
  tx.addOutput(output(tbc.Script.buildPublicKeyHashOut(c.key.toAddress()), fee.satoshis - feeSat));
  tx.fee(feeSat); tx.seal();
  tx.inputs[1].setScript(Coin.getUnlockScript({ currentTx: tx, inputIndex: 1, preTx: coin.tx, preTxVout: coin.vout,
    ancestorTransactions: c.j.chain, outputGroups: [{ codeVout: 0, tapeVout: 1 }, { codeVout: 2 }],
    contractController: { transaction: funding, currentInputIndex: 0 }, privateKey: c.key }));
  const sig = tbc.Transaction.sighash.sign(tx, c.key, 0x41, 0, tx.inputs[0].output.script, tx.inputs[0].output.satoshisBN).toTxFormat();
  tx.inputs[0].setScript(new tbc.Script().add(sig).add(c.key.publicKey.toBuffer()));
  return tx;
}

async function futurePrepare(c, sdk, inputs, label, kind) {
  let target = c.j.events.find(e => e.type === 'future-target' && e.label === label);
  if (!target) {
    const node = await c.j.read('nodeinfo');
    target = c.j.append({ type: 'future-target', label, kind, lockTime: kind === 'height' ? node.blocks + 1 : node.mediantime + 1, node });
  }
  const frozen = await c.lock(`${label}:freeze`, sdk, inputs, target.lockTime);
  let saved = c.j.events.find(e => e.type === 'future-reservation' && e.label === label);
  if (!saved) {
    const input = coins(frozen)[0];
    const tx = new tbc.Transaction(await silent(() => sdk.transfer(c.key, addr(c.key), human(input.balance, sdk.decimal), [input.utxo], c.fee(), [frozen], c.j.chain)));
    c.j.attach(tx); const validation = validateCoinTransaction(tx); assert(validation.success);
    c.j.saveRaw(tx);
    saved = c.j.append({ type: 'future-reservation', label, kind, txid: tx.id, lockTime: target.lockTime,
      feeSat: validation.feeSat, validation, inputs: tx.inputs.map(i => `${i.prevTxId.toString('hex')}:${i.outputIndex}`) });
  }
  return saved;
}

async function futureBroadcast(c, saved) {
  if (c.j.events.some(e => e.type === 'future-submitted' && e.txid === saved.txid)) return;
  // Future lanes are prepared first and spend pairwise-disjoint, reserved inputs.
  // Nothing else may broadcast until both exact raw transactions are reconciled.
  assert.equal(c.j.unresolved.size, 0);
  const tx = c.load(saved.txid); c.j.attach(tx); assert(validateCoinTransaction(tx).success);
  const before = await c.j.read('nodeinfo');
  if (!(saved.kind === 'height' ? before.blocks < saved.lockTime : before.mediantime <= saved.lockTime)) {
    c.j.append({ type: 'future-target-already-mature', label: saved.label, txid: tx.id, before,
      note: 'This invocation cannot count as a before-maturity probe.' });
    await c.step(`${saved.label}:after-maturity`, () => tx);
    return;
  }
  c.j.append({ type: 'future-before', label: saved.label, txid: tx.id, before });
  let accepted = false;
  try { accepted = await c.j.broadcast(tx, `${saved.label}:before-maturity`, { allowReject: true }); }
  catch (error) {
    c.j.append({ type: 'future-unknown', label: saved.label, txid: tx.id, error: error.message });
    throw error; // Keep the durable unresolved input reservation and stop.
  }
  const response = c.j.events.findLast(e => e.type === 'broadcast-response' && e.txid === tx.id);
  const body = response.body;
  if (!accepted) assert(/non-final|nonfinal/i.test(body.data?.error), 'only an explicit finality/pool-capacity rejection is expected');
  const after = await c.j.read('nodeinfo');
  const mempool = await c.j.read('mempooltxs');
  let rawVisible = false, confirmations = 0;
  try { const raw = await c.j.read(`txraw/txid/${tx.id}`); rawVisible = raw.txraw === tx.uncheckedSerialize(); } catch {}
  try { const decode = await c.j.read(`decode/txid/${tx.id}`); confirmations = decode.confirmations || 0; } catch {}
  const immature = saved.kind === 'height' ? after.blocks < saved.lockTime : after.mediantime <= saved.lockTime;
  const inMempool = JSON.stringify(mempool).includes(tx.id);
  if (immature) { assert(!inMempool); assert.equal(confirmations, 0); }
  c.j.append({ ...saved, at: new Date().toISOString(), type: 'future-submitted', before, after, body, rawVisible, inMempool, confirmations, immature, accepted });
  console.log(JSON.stringify({ label: saved.label, txid: tx.id, accepted, immature, rawVisible, inMempool }));
}

async function advanced(c) {
  const h = await run(c);
  let control = await probe(c, 'negative:single', h.sdk, coins(h.timeSpent), undefined, true);
  const many = await probe(c, 'negative:multi-input', h.sdk, [coins(h.second)[0], coins(h.third)[0]]);
  const node = await c.j.read('nodeinfo');
  let target = c.j.events.find(e => e.type === 'adversarial-lock-targets');
  if (!target) target = c.j.append({ type: 'adversarial-lock-targets', height: node.blocks - 1, timestamp: node.mediantime - 1 });
  const hf = await c.lock('negative:height:freeze', h.sdk, coins(control), target.height);
  control = await probe(c, 'negative:height', h.sdk, coins(hf), ['locktime-cross-domain', 'locktime-immature']);
  const tf = await c.lock('negative:time:freeze', h.sdk, coins(control), target.timestamp);
  control = await probe(c, 'negative:time', h.sdk, coins(tf), ['locktime-cross-domain', 'locktime-immature']);
  const controllerHash = hash160(sha(tbc.Script.buildPublicKeyHashOut(c.key.toAddress()).toBuffer())).toString('hex');
  const held = await c.send('contract:receive', h.sdk, coins(control), c.key, controllerHash, '7');
  const frozen = await c.lock('contract:admin-freeze', h.sdk, coins(held), 0xffffffff);
  const thawed = await c.thaw('contract:admin-thaw', h.sdk, coins(frozen));
  const spent = await c.step('contract:ordinary-spend-vin1', () => contractSpend(c, h.sdk, coins(thawed)[0]));
  assert.deepEqual(coins(spent)[0].amounts, [0n, 7000000n, 0n, 0n, 0n, 0n]);
  // Aggregate administrator is also the holder. Frozen Coin must use admin priority.
  const aggregateAddress = tbc.Address.fromPublicKeyHash(hash160(c.admin)).toString();
  const adminOwned = await c.send('admin-is-owner:receive', h.sdk, coins(spent), c.key, aggregateAddress, '7');
  const adminFrozen = await c.lock('admin-is-owner:freeze', h.sdk, coins(adminOwned), 0xffffffff);
  await c.thaw('admin-is-owner:early-thaw', h.sdk, coins(adminFrozen));
  // Use two independent ordinary-owned holdings for chain maturity experiments.
  const futureH = await futurePrepare(c, h.sdk, coins(many), 'future:height', 'height');
  const futureT = await futurePrepare(c, h.sdk, coins(h.merged.at(-1)), 'future:timestamp', 'timestamp');
  await futureBroadcast(c, futureH);
  await futureBroadcast(c, futureT);
  if (c.j.chain.has(futureH.txid) && c.j.chain.has(futureT.txid)) {
    const h2 = await futurePrepare(c, h.sdk, coins(c.j.chain.get(futureH.txid)), 'future-v2:height', 'height');
    const t2 = await futurePrepare(c, h.sdk, coins(c.j.chain.get(futureT.txid)), 'future-v2:timestamp', 'timestamp');
    await futureBroadcast(c, h2); await futureBroadcast(c, t2);
  }
  c.j.append({ type: 'advanced-submitted', future: [futureH.txid, futureT.txid] });
}

if (require.main === module) {
  assert(process.argv.includes('--testnet'), 'explicit --testnet required');
  withCampaignLock(() => advanced(new Campaign())).catch(error => { console.error(error.stack); process.exitCode = 1; });
}
module.exports = { advanced, probe, contractSpend, futurePrepare, futureBroadcast };
