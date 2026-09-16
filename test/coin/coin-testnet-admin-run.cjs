'use strict';

// Explicit opt-in extension of the already funded campaign. All five raw
// transactions (baseline, three negatives, positive) are durable before send.
const assert = require('node:assert/strict');
const tbc = require('tbc-lib-js');
const { Campaign, withCampaignLock, coins, ownerId } = require('./coin-testnet-production.cjs');
const { silent } = require('../pool3/pool3-testnet-runner.cjs');
const { CoinTBC20: Coin } = require('../../lib/util/coin/coinTbc20Code.js');
const { buildCoinTBC20UnlockScriptWithSignature } = require('../../lib/util/coin/coinTbc20unlock.js');
const { validateCoinTransaction } = require('./coin-testnet-adversarial.cjs');
const { prepareCoinAdminAdversarial, prepareCoinAdminControllerChange, COIN_ADMIN_ADVERSARIAL_CASES } = require('./coin-testnet-admin-adversarial.cjs');
const LABEL = 'admin-adversarial';
const SOURCE_LABEL = 'admin-is-owner:early-thaw';
const SCRIPT_REJECTION = /(?:mandatory|non-mandatory)-script-verify-flag-failed|script (?:verification )?failed|SCRIPT_ERR_/i;

function load(c, txid) {
  assert(/^[0-9a-f]{64}$/.test(txid), 'saved transaction identifier');
  const tx = c.load(txid);
  assert.equal(tx.id, txid, 'saved raw must match its planned transaction id');
  c.j.attach(tx);
  return tx;
}

function feeBounds(c, tx) {
  const feeSat = tx.inputs.reduce((n, input) => n + BigInt(input.output.satoshis), 0n)
    - tx.outputs.reduce((n, output) => n + BigInt(output.satoshis), 0n);
  const minimum = BigInt(Math.max(80, Math.ceil(tx.toBuffer().length * 80 / 1000)));
  assert(feeSat >= minimum && feeSat <= 10000n, 'administrator probe final raw fee bounds');
  const spent = c.j.events.filter(event => event.type === 'accepted').reduce((n, event) => n + BigInt(event.feeSat), 0n);
  assert(spent + feeSat <= 500000n, 'campaign fee ceiling');
  return feeSat;
}

function assertScriptRejection(event, txid) {
  assert(event && event.txid === txid && event.type === 'rejected', 'durable node rejection required');
  assert.equal(event.body?.error, 'BROADCAST_REJECTED');
  const reason = event.body?.data?.error || '';
  assert(/^RPC error -26: /.test(reason) && SCRIPT_REJECTION.test(reason),
    'node must report script rejection, not missing input, conflict, fee, dust or finality');
  assert(!/missing.inputs|inputs.missing|mempool.conflict|insufficient fee|dust|non-final|nonfinal/i.test(reason));
  return reason;
}

function baseline(c, source, funding) {
  const tx = new tbc.Transaction().from(source.utxo).from(funding);
  tx.inputs[0].sequenceNumber = 0xfffffffe;
  tx.nLockTime = 0;
  tx.addOutput(new tbc.Transaction.Output({ script: source.tx.outputs[source.vout].script, satoshis: 500 }));
  tx.addOutput(new tbc.Transaction.Output({ script: Coin.setLockTime(Coin.replaceTapeAmounts(
    source.tx.outputs[source.vout + 1].script, [source.balance, 0n, 0n, 0n, 0n, 0n]), 0), satoshis: 0 }));
  // Fixed values eliminate fee/change callbacks during the external ceremony.
  // 1500 sat also leaves ample relay margin for the small negative mutations.
  tx.addOutput(new tbc.Transaction.Output({ script: tbc.Script.buildPublicKeyHashOut(c.key.toAddress()),
    satoshis: funding.satoshis - 1500 }));
  c.j.attach(tx);
  const sighash = tbc.crypto.Hash.sha256sha256(Buffer.from(tx.getPreimage(0, 0x41), 'hex'));
  const signature = c.signAdminMessage({ inputIndex: 0, sighash }, `${LABEL}:baseline`);
  tx.inputs[0].setScript(buildCoinTBC20UnlockScriptWithSignature({ currentTx: tx, inputIndex: 0,
    preTx: source.tx, preTxVout: source.vout, ancestorTransactions: c.j.chain,
    outputGroups: [{ codeVout: 0, tapeVout: 1 }, { codeVout: 2 }], publicKey: c.admin,
    signature: Buffer.concat([signature, Buffer.from([0x41])]) }));
  const fee = tx.inputs[1].output;
  const feeSignature = tbc.Transaction.Sighash.sign(tx, c.key, 0x41, 1, fee.script, fee.satoshisBN);
  tx.inputs[1].setScript(new tbc.Script().add(feeSignature.toTxFormat()).add(c.key.publicKey.toBuffer()));
  assert.equal(validateCoinTransaction(tx).success, true, 'unbroadcast administrator baseline');
  feeBounds(c, tx);
  return tx;
}

async function runAdmin(c) {
  const init = c.j.events.find(event => event.type === 'campaign-init');
  assert(init && c.j.events.some(event => event.type === 'accepted' && event.label === 'funding-split'),
    'administrator probes only extend the existing funded campaign');
  assert.equal(c.j.unresolved.size, 0, 'reconcile unknown broadcasts before administrator probes');
  await c.fund(); // Revalidates source/artifact/signer fingerprints; existing split is reused.
  const acceptedSource = c.j.events.find(event => event.type === 'accepted' && event.label === SOURCE_LABEL);
  assert(acceptedSource, 'accepted admin-is-owner:early-thaw source required');
  const sourceTx = c.j.chain.get(acceptedSource.txid), source = coins(sourceTx).find(coin => coin.vout === 0);
  assert(source && source.balance === 7000000n && source.lockTime === 0, 'source must be the thawed seven-unit main Coin');
  const sourceCode = Coin.parseCode(sourceTx.outputs[0].script);
  const adminHash = tbc.crypto.Hash.sha256ripemd160(c.admin);
  assert(sourceCode.adminPubKeyHash.equals(adminHash));
  assert(sourceCode.controller.equals(Buffer.concat([adminHash, Buffer.from([0])])), 'aggregate administrator is the input holder');
  const basic = c.j.events.find(event => event.type === 'basic-complete');
  assert(basic, 'main Coin issuance evidence required');
  const mainCoin = coins(c.j.chain.get(basic.mainCoinId))[0];
  assert(mainCoin && Coin.getCodeIdentity(mainCoin.tx.outputs[mainCoin.vout].script).equals(sourceCode.identity),
    'source must belong to the main issued Coin');
  const ownerController = Buffer.from(ownerId(c.key), 'hex');
  let plan = c.j.events.find(event => event.type === 'admin-adversarial-plan' && event.label === LABEL);
  if (!plan) {
    assert(!c.j.spent.has(`${sourceTx.id}:0`), 'administrator source already spent');
    const funding = c.fee();
    const valid = await silent(() => baseline(c, source, funding));
    const options = { validTransaction: valid,
      coinInputs: [{ inputIndex: 0, parentTx: sourceTx, outputIndex: 0 }],
      adminSigner: { publicKey: c.admin, sign: request => c.signAdminMessage(request, `${LABEL}:candidate`) },
      fee: { inputIndex: 1, privateKey: c.key } };
    const probes = await prepareCoinAdminAdversarial(options);
    const positive = await prepareCoinAdminControllerChange({ ...options, controller: ownerController });
    const all = [valid, ...probes.map(probe => probe.transaction), positive.transaction];
    all.forEach(tx => { feeBounds(c, tx); c.j.saveRaw(tx); });
    plan = c.j.append({ type: 'admin-adversarial-plan', label: LABEL, source: `${sourceTx.id}:0`,
      administrator: c.admin.toString('hex'), ownerController: ownerController.toString('hex'),
      baseline: valid.id, control: positive.txid,
      inputs: valid.inputs.map(input => `${input.prevTxId.toString('hex')}:${input.outputIndex}`),
      probes: probes.map(probe => ({ label: probe.label, txid: probe.txid, expectedLocalFailures: probe.expectedLocalFailures })) });
  }
  assert.equal(plan.source, `${sourceTx.id}:0`);
  assert.equal(plan.administrator, c.admin.toString('hex'));
  assert.equal(plan.ownerController, ownerController.toString('hex'));
  assert.deepEqual(plan.probes.map(probe => probe.label), COIN_ADMIN_ADVERSARIAL_CASES.map(name => `negative/${name}`));
  // Use the existing durable outpoint reservation mechanism. A crash followed
  // by another campaign entry point cannot reuse this pending plan's fee UTXO.
  if (!c.j.events.some(event => event.type === 'future-reservation' && event.label === `${LABEL}:reserved`))
    c.j.append({ type: 'future-reservation', label: `${LABEL}:reserved`, kind: 'admin-probe',
      txid: plan.control, lockTime: 0, inputs: plan.inputs });
  const valid = load(c, plan.baseline), control = load(c, plan.control);
  assert.equal(validateCoinTransaction(valid).success, true);
  const controlValidation = validateCoinTransaction(control);
  assert.equal(controlValidation.success, true, JSON.stringify(controlValidation.inputs));
  assert.deepEqual(control.inputs.map(input => `${input.prevTxId.toString('hex')}:${input.outputIndex}`), plan.inputs);
  assert(Coin.parseCode(control.outputs[0].script).controller.equals(ownerController));
  assert.equal(Coin.parseTape(control.outputs[1].script).balance, source.balance);
  for (const probe of plan.probes) {
    assert.deepEqual(probe.expectedLocalFailures, [0]);
    assert(!c.j.events.some(event => event.type === 'accepted' && event.txid === probe.txid), 'negative unexpectedly accepted; stop');
    const tx = load(c, probe.txid), validation = validateCoinTransaction(tx);
    assert.deepEqual(tx.inputs.map(input => `${input.prevTxId.toString('hex')}:${input.outputIndex}`), plan.inputs);
    assert.deepEqual(validation.inputs.map(input => input.success), [false, true]);
    feeBounds(c, tx);
    let rejected = c.j.events.findLast(event => event.type === 'rejected' && event.txid === probe.txid);
    if (!rejected) {
      assert(!c.j.events.some(event => event.type === 'accepted' && event.txid === plan.control), 'positive cannot precede all rejection evidence');
      assert.equal(await c.j.broadcast(tx, `${LABEL}:${probe.label}`,
        { allowReject: true, expectedLocalFailures: probe.expectedLocalFailures }), false);
      rejected = c.j.events.findLast(event => event.type === 'rejected' && event.txid === probe.txid);
    }
    assertScriptRejection(rejected, probe.txid);
  }
  if (!c.j.events.some(event => event.type === 'accepted' && event.txid === plan.control)) {
    feeBounds(c, control);
    assert.equal(await c.j.broadcast(control, `${LABEL}:positive/admin-controller-change`), true);
  }
  if (!c.j.events.some(event => event.type === 'admin-adversarial-complete')) c.j.append({
    type: 'admin-adversarial-complete', label: LABEL, source: plan.source, control: plan.control,
    rejected: plan.probes.map(probe => probe.txid), destinationController: ownerController.toString('hex'), amountRaw: source.balance.toString(),
  });
  return { control: plan.control, rejected: plan.probes.map(probe => probe.txid) };
}

if (require.main === module) {
  assert(process.argv.includes('--testnet'), 'explicit --testnet required; spends only the existing campaign testnet inputs');
  withCampaignLock(() => runAdmin(new Campaign())).then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.stack); process.exitCode = 1; });
}
module.exports = { runAdmin, assertScriptRejection, LABEL, SOURCE_LABEL };
