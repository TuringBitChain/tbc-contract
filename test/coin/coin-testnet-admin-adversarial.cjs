'use strict';

// Pure construction/validation utility. Keys and the aggregate administrator
// signing callback are supplied by the caller; no key discovery, RPC or send.
const assert = require('node:assert/strict');
const tbc = require('tbc-lib-js');
const { CoinTBC20: Coin } = require('../../lib/contract/coinTbc20.js');
const { getTBC20CurrentOutputData, getTBC20CurrentInputsData } = require('../../lib/util/tbc20unlock.js');
const { validateCoinTransaction } = require('./coin-testnet-adversarial.cjs');
const ABI = [...require('../../lib/util/coin_tbc20.json').unlock.main.matchAll(/<([^>]+)>/g)].map(match => match[1]);
const CASES = Object.freeze(['wrong-admin', 'admin-amount-inflation', 'admin-final-sequence']);
assert.equal(ABI.length, 123);
assert.equal(ABI.indexOf('sig'), 98);
assert.equal(ABI.indexOf('publicKey'), 99);

function copy(tx) {
  const cloned = new tbc.Transaction(tx.uncheckedSerialize());
  tx.inputs.forEach((input, i) => {
    assert(input.output, `vin ${i} needs authenticated prevout`);
    cloned.inputs[i].output = new tbc.Transaction.Output({
      script: tbc.Script.fromBuffer(Buffer.from(input.output.script.toBuffer())), satoshis: input.output.satoshis,
    });
  });
  return cloned;
}

function push(value) {
  const script = new tbc.Script();
  if (value.length === 1 && value[0] >= 1 && value[0] <= 16) script.add(tbc.Opcode.smallInt(value[0]));
  else if (value.length === 1 && value[0] === 0x81) script.add(tbc.Opcode.OP_1NEGATE);
  else script.add(value);
  return script.chunks[0];
}

function outputs(tx) {
  const groups = [];
  for (let i = 0; i < tx.outputs.length; i += 1) {
    if (tx.outputs[i].script.toBuffer().subarray(-14).equals(Buffer.from('COINTBC20CODE2'))) {
      groups.push({ codeVout: i, tapeVout: ++i });
    } else groups.push({ codeVout: i });
  }
  return groups;
}

function validateOptions({ validTransaction: tx, coinInputs, adminSigner, fee }) {
  assert(tx instanceof tbc.Transaction);
  assert(Array.isArray(coinInputs) && coinInputs.length > 0);
  assert.equal(tx.inputs.length, coinInputs.length + 1, 'only Coin inputs and one P2PKH fee input supported');
  assert(adminSigner && Buffer.isBuffer(adminSigner.publicKey) && adminSigner.publicKey.length === 32);
  assert.equal(typeof adminSigner.sign, 'function');
  const seen = new Set();
  for (const { inputIndex, parentTx, outputIndex } of coinInputs) {
    assert(Number.isInteger(inputIndex) && inputIndex >= 0 && inputIndex < tx.inputs.length && !seen.has(inputIndex));
    seen.add(inputIndex);
    assert(parentTx instanceof tbc.Transaction);
    const input = tx.inputs[inputIndex];
    assert.equal(input.prevTxId.toString('hex'), parentTx.id);
    assert.equal(input.outputIndex, outputIndex);
    assert.equal(input.output.script.toHex(), parentTx.outputs[outputIndex].script.toHex());
    assert.equal(input.output.satoshis, parentTx.outputs[outputIndex].satoshis);
    assert.equal(input.script.chunks.length, ABI.length);
    const descriptor = Coin.parseCode(input.output.script);
    assert(tbc.crypto.Hash.sha256ripemd160(adminSigner.publicKey).equals(descriptor.adminPubKeyHash), 'aggregate public key must be the actual administrator');
    assert(input.script.chunks[99].buf.equals(adminSigner.publicKey), 'baseline must be an administrator spend');
  }
  assert(fee && Number.isInteger(fee.inputIndex) && fee.inputIndex >= 0 && fee.inputIndex < tx.inputs.length && !seen.has(fee.inputIndex));
  assert(fee.privateKey instanceof tbc.PrivateKey);
  assert(tx.inputs[fee.inputIndex].output.script.equals(tbc.Script.buildPublicKeyHashOut(fee.privateKey.toAddress())));
  const validation = validateCoinTransaction(tx);
  assert.equal(validation.success, true, `administrator baseline must pass: ${JSON.stringify(validation.inputs)}`);
}

function digest(tx, vin) {
  return tbc.crypto.Hash.sha256sha256(Buffer.from(tx.getPreimage(vin, 0x41), 'hex'));
}

async function rebuild(tx, options, outsiderVin) {
  // Parent/ancestor proofs are unchanged because their authenticated historical
  // transactions and current outpoints remain unchanged. Replace every current
  // output proof, current input record and signature in the frozen 123-leaf ABI.
  const current = getTBC20CurrentOutputData(tx, outputs(tx)).flatMap(group => [
    group.code.value, group.code.lockingScript.suffixData, group.code.lockingScript.partialHash,
    group.code.lockingScript.size, group.tape.value, group.tape.lockingScript,
  ]);
  for (const { inputIndex: vin } of options.coinInputs) {
    const message = digest(tx, vin);
    let publicKey = options.adminSigner.publicKey;
    let signature;
    if (vin === outsiderVin) {
      let outsider;
      for (let n = 7101; ; n += 1) {
        outsider = new tbc.PrivateKey(n.toString(16).padStart(64, '0'));
        publicKey = outsider.publicKey.toXOnly();
        const descriptor = Coin.parseCode(tx.inputs[vin].output.script);
        const hash = tbc.crypto.Hash.sha256ripemd160(publicKey);
        if (!hash.equals(descriptor.adminPubKeyHash) && !hash.equals(descriptor.controller.subarray(0, 20))) break;
      }
      signature = tbc.crypto.Schnorr.sign(message, outsider.toBuffer());
    } else {
      const before = tx.uncheckedSerialize();
      signature = await options.adminSigner.sign({ transaction: copy(tx), inputIndex: vin, sighash: Buffer.from(message) });
      assert.equal(tx.uncheckedSerialize(), before, 'signer mutated transaction');
    }
    assert(Buffer.isBuffer(signature) && signature.length === 64, 'signer returns 64-byte BIP340 signature');
    assert(tbc.crypto.Schnorr.verify(message, signature, publicKey), 'fresh administrator/outsider signature must be mathematically valid');
    const script = tbc.Script.fromBuffer(tx.inputs[vin].script.toBuffer());
    current.forEach((bytes, i) => { script.chunks[i] = push(bytes); });
    script.chunks[ABI.indexOf('currentInputsData')] = push(getTBC20CurrentInputsData(tx));
    script.chunks[98] = push(Buffer.concat([signature, Buffer.from([0x41])]));
    script.chunks[99] = push(publicKey);
    // tbc-lib-js caches serialized Script.buffer independently from chunks.
    // Rebuild the buffer after replacing leaves; a chunks-only edit passes the
    // in-memory VM while broadcasting the stale original signature/proofs.
    tx.inputs[vin].setScript(tbc.Script.fromChunks(script.chunks));
  }
  const vin = options.fee.inputIndex, previous = tx.inputs[vin].output;
  const signature = tbc.Transaction.Sighash.sign(tx, options.fee.privateKey, 0x41, vin,
    previous.script, previous.satoshisBN, tbc.Script.Interpreter.DEFAULT_FLAGS);
  assert(tx.verifySignature(signature, options.fee.privateKey.publicKey, vin,
    previous.script, previous.satoshisBN, tbc.Script.Interpreter.DEFAULT_FLAGS));
  tx.inputs[vin].setScript(new tbc.Script().add(signature.toTxFormat()).add(options.fee.privateKey.publicKey.toBuffer()));
}

function result(tx, label, expectedLocalFailures, feeVin) {
  // Judge the exact serialized transaction that a node will receive.
  tx = copy(tx);
  const validation = validateCoinTransaction(tx);
  assert(validation.valueConserved);
  assert.equal(validation.inputs[feeVin].success, true, 'fee input must succeed');
  assert.deepEqual(validation.inputs.filter(input => !input.success).map(input => input.inputIndex),
    expectedLocalFailures, `${label}: unexpected VM result`);
  return { label, transaction: tx, txraw: tx.uncheckedSerialize(), txid: tx.id,
    validation, expectedLocalFailures, signaturesVerified: true };
}

/** The signer can perform an actual external MuSig2 ceremony for every message. */
async function prepareCoinAdminAdversarial(options) {
  validateOptions(options);
  const { validTransaction, coinInputs, fee, cases = CASES } = options;
  assert(Array.isArray(cases) && cases.length > 0 && new Set(cases).size === cases.length);
  cases.forEach(name => assert(CASES.includes(name), `unknown administrator negative ${name}`));
  const original = validTransaction.uncheckedSerialize(), vin = coinInputs[0].inputIndex;
  const candidates = [];
  for (const name of cases) {
    const tx = copy(validTransaction);
    if (name === 'admin-amount-inflation') {
      const group = outputs(tx).find(group => group.tapeVout !== undefined && Coin.parseTape(tx.outputs[group.tapeVout].script).amounts[vin] > 0n);
      assert(group, 'target Coin must have an allocated output');
      const tape = tx.outputs[group.tapeVout], amounts = [...Coin.parseTape(tape.script).amounts];
      amounts[vin] += 1n; tape.setScript(Coin.replaceTapeAmounts(tape.script, amounts));
    } else if (name === 'admin-final-sequence') {
      tx.inputs[vin].sequenceNumber = 0xffffffff;
      tx.inputs[fee.inputIndex].sequenceNumber = 0xfffffffe;
    }
    await rebuild(tx, options, name === 'wrong-admin' ? vin : undefined);
    candidates.push(result(tx, `negative/${name}`, [vin], fee.inputIndex));
    assert.equal(validTransaction.uncheckedSerialize(), original, 'baseline mutated');
  }
  return candidates;
}

/** Positive control: full administrator authority explicitly permits changing
 * the holder, including before maturity. SDK freeze preserves the holder as a
 * product choice, not an additional on-chain restriction. Never label this a
 * negative security expectation. The caller chooses the destination. */
async function prepareCoinAdminControllerChange(options) {
  validateOptions(options);
  assert(Buffer.isBuffer(options.controller) && options.controller.length === 21);
  const tx = copy(options.validTransaction);
  const group = outputs(tx).find(group => group.tapeVout !== undefined);
  assert(group);
  assert(!Coin.parseCode(tx.outputs[group.codeVout].script).controller.equals(options.controller), 'positive control must actually change Controller');
  tx.outputs[group.codeVout].setScript(Coin.replaceController(tx.outputs[group.codeVout].script, options.controller));
  await rebuild(tx, options);
  return result(tx, 'positive/admin-controller-change', [], options.fee.inputIndex);
}

module.exports = { prepareCoinAdminAdversarial, prepareCoinAdminControllerChange,
  COIN_ADMIN_ADVERSARIAL_CASES: CASES };
