'use strict';
const assert = require('node:assert/strict');
const tbc = require('tbc-lib-js');
const { Campaign, run, withCampaignLock } = require('./coin-testnet-production.cjs');
const { validateCoinTransaction } = require('./coin-testnet-adversarial.cjs');
const { silent } = require('../pool3/pool3-testnet-runner.cjs');

async function issuance(c) {
  const h = await run(c);
  let plan = c.j.events.find(e => e.type === 'issuance-negative-plan' && e.version === 2);
  if (!plan) {
    const prior = c.j.events.find(e => e.type === 'issuance-negative-plan');
    let valid;
    if (prior) {
      assert(!c.j.events.some(e => e.type === 'broadcast-attempt' && e.txid === prior.control));
      valid = c.load(prior.control);
      c.j.append({ type: 'test-harness-correction', label: 'issuance-negative-plan', note: 'Unbroadcast v1 chunks mutation left serialized script unchanged. Reused exact signed control and reconstructed scripts with Script.fromChunks; raw round-trip is mandatory.' });
    } else {
      const prepared = await silent(() => h.sdk.mintCoin(c.admin, c.key, c.key.toAddress().toString(), '0.000001', c.fee(), h.third, h.second, 'issuance authorization controls'));
      assert.throws(() => prepared.finalize([]), /expected.*signatures/);
      assert.throws(() => prepared.finalize(prepared.sighashes.map(() => Buffer.alloc(64))), /invalid administrator signature/);
      valid = new tbc.Transaction(await silent(() => c.finalize(prepared, 'issuance:renewal-control')));
    }
    c.j.attach(valid); assert(validateCoinTransaction(valid).success); c.j.saveRaw(valid);
    const probes = [];
    for (const indexes of [[0], [1], [0, 1]]) {
      const tx = new tbc.Transaction(valid.uncheckedSerialize()); c.j.attach(tx);
      for (const vin of indexes) {
        const signature = tbc.Transaction.sighash.signSchnorr(tx, c.keys.carol, 0x41, vin, tx.inputs[vin].output.script, tx.inputs[vin].output.satoshisBN).schnorrSig;
        const digest = tbc.crypto.Hash.sha256sha256(Buffer.from(tx.getPreimage(vin, 0x41), 'hex'));
        const publicKey = c.keys.carol.publicKey.toBuffer().subarray(1);
        assert(tbc.crypto.Schnorr.verify(digest, signature, publicKey));
        const script = tbc.Script.fromBuffer(tx.inputs[vin].script.toBuffer());
        assert.equal(script.chunks[0].buf.length, 65); assert.equal(script.chunks[1].buf.length, 32);
        script.chunks[0] = new tbc.Script().add(Buffer.concat([signature, Buffer.from([0x41])])).chunks[0];
        script.chunks[1] = new tbc.Script().add(publicKey).chunks[0];
        tx.inputs[vin].setScript(tbc.Script.fromChunks(script.chunks));
      }
      const roundTrip = new tbc.Transaction(tx.uncheckedSerialize()); c.j.attach(roundTrip);
      const validation = validateCoinTransaction(roundTrip);
      assert.deepEqual(validation.inputs.filter(i => !i.success).map(i => i.inputIndex), indexes);
      assert.notEqual(tx.id, valid.id);
      assert(validation.inputs[2].success); c.j.saveRaw(tx);
      probes.push({ label: `issuance:wrong-admin-vin-${indexes.join('-')}`, txid: tx.id, expectedLocalFailures: indexes });
    }
    plan = c.j.append({ type: 'issuance-negative-plan', version: 2, control: valid.id, probes, finalSupply: '10026000001',
      localChecks: ['missing-administrator-signatures', 'invalid-administrator-signatures'] });
  }
  for (const p of plan.probes) {
    if (c.j.events.some(e => e.type === 'rejected' && e.txid === p.txid)) continue;
    assert.equal(await c.j.broadcast(c.load(p.txid), p.label, { allowReject: true, expectedLocalFailures: p.expectedLocalFailures }), false);
    const rejection = c.j.events.findLast(e => e.type === 'rejected' && e.txid === p.txid);
    assert(/mandatory-script-verify-flag-failed|Script failed/i.test(rejection.body.data.error));
  }
  const tx = await c.step('issuance:valid-renewal-control', () => c.load(plan.control));
  assert.equal(JSON.parse(tx.outputs[2].script.chunks.at(-2).buf.toString()).coinTotalSupply, plan.finalSupply);
  c.j.append({ type: 'issuance-negative-complete', latestIssuer: tx.id, finalSupply: plan.finalSupply, rejected: 3 });
  console.log(JSON.stringify({ latestIssuer: tx.id, finalSupply: plan.finalSupply }));
}
if (require.main === module) {
  assert(process.argv.includes('--testnet'), 'explicit --testnet required');
  withCampaignLock(() => issuance(new Campaign())).catch(error => { console.error(error.stack); process.exitCode = 1; });
}
module.exports = { issuance };
