'use strict';

// Test-only construction of deliberately invalid Coin transactions. This file
// never discovers keys, fetches transactions, calls RPC, or broadcasts. Probe
// these candidates before their valid counterpart consumes the shared inputs.
const assert = require('node:assert/strict');
const tbc = require('tbc-lib-js');
const { CoinTBC20: Coin } = require('../../lib/contract/coinTbc20.js');
const artifact = require('../../lib/util/coin_tbc20.json');
const {
  encodeTBC20UnsignedLE,
  getTBC20CurrentInputsData,
  getTBC20CurrentOutputData,
  getTBC20PrePreTxArray,
  getTBC20PreTxData,
} = require('../../lib/util/tbc20unlock.js');

const ABI = [...artifact.unlock.main.matchAll(/<([^>]+)>/g)].map(match => match[1]);
assert.equal(ABI.length, 123, 'unsupported Coin ABI');
const INDEX = ['0x00', '0x51', '0x52', '0x53', '0x54', '0x55', '0x56', '0x57'];
const DEFAULT_CASES = Object.freeze([
  'amount-inflation', 'amount-slot-misalignment', 'foreign-identity',
  'output-locktime-header', 'output-tape-length', 'parent-proof-txid',
  'ancestor-proof-txid', 'wrong-owner', 'final-sequence',
]);
const CASES = Object.freeze([...DEFAULT_CASES, 'locktime-cross-domain', 'locktime-immature']);
const HASH_TYPE = 0x41;
const hash160 = value => tbc.crypto.Hash.sha256ripemd160(value);

function copyTransaction(tx) {
  const clone = new tbc.Transaction(tx.uncheckedSerialize());
  tx.inputs.forEach((input, vin) => {
    assert(input.output, `vin ${vin} requires authenticated previous-output metadata`);
    clone.inputs[vin].output = new tbc.Transaction.Output({
      script: tbc.Script.fromBuffer(Buffer.from(input.output.script.toBuffer())),
      satoshis: input.output.satoshis,
    });
  });
  return clone;
}

function validateCoinTransaction(tx) {
  // Match Input.verify's TBC limits, including script numbers wider than four
  // bytes. Restore globals so importing this test utility changes no settings.
  const Interpreter = tbc.Script.Interpreter;
  const prior = [Interpreter.MAX_SCRIPT_ELEMENT_SIZE, Interpreter.MAXIMUM_ELEMENT_SIZE];
  const log = console.log;
  Interpreter.MAX_SCRIPT_ELEMENT_SIZE = Number.MAX_SAFE_INTEGER;
  Interpreter.MAXIMUM_ELEMENT_SIZE = Number.MAX_SAFE_INTEGER;
  console.log = () => {};
  try {
    const seen = new Set();
    const inputs = tx.inputs.map((input, inputIndex) => {
      assert(input.output, `vin ${inputIndex} previous output missing`);
      const outpoint = `${input.prevTxId.toString('hex')}:${input.outputIndex}`;
      assert(!seen.has(outpoint), 'duplicate input'); seen.add(outpoint);
      const vm = new Interpreter();
      const ok = vm.verify(input.script, input.output.script, tx, inputIndex,
        Interpreter.DEFAULT_FLAGS, input.output.satoshisBN);
      return { inputIndex, success: ok && vm.stack.length === 1,
        error: vm.errstr || (ok && vm.stack.length !== 1 ? 'non-clean final main stack' : ''),
        stackDepth: vm.stack.length, altStackDepth: vm.altstack.length };
    });
    const feeSat = tx.inputs.reduce((sum, input) => sum + BigInt(input.output.satoshis), 0n)
      - tx.outputs.reduce((sum, output) => sum + BigInt(output.satoshis), 0n);
    return { success: feeSat >= 0n && inputs.every(input => input.success), inputs,
      valueConserved: feeSat >= 0n, feeSat: feeSat.toString(), nodeAcceptanceChecked: false };
  } finally {
    [Interpreter.MAX_SCRIPT_ELEMENT_SIZE, Interpreter.MAXIMUM_ELEMENT_SIZE] = prior;
    console.log = log;
  }
}

function outputGroups(tx) {
  const groups = [];
  for (let vout = 0; vout < tx.outputs.length; vout += 1) {
    const bytes = tx.outputs[vout].script.toBuffer();
    if (bytes.subarray(-14).equals(Buffer.from('COINTBC20CODE2'))) {
      assert(vout + 1 < tx.outputs.length, 'Coin Code must have an adjacent Tape');
      groups.push({ codeVout: vout, tapeVout: ++vout });
    } else groups.push({ codeVout: vout });
  }
  return groups;
}

function add(script, bytes) {
  assert(Buffer.isBuffer(bytes), 'ABI leaf must be bytes');
  if (bytes.length === 1 && bytes[0] >= 1 && bytes[0] <= 16) script.add(tbc.Opcode.smallInt(bytes[0]));
  else if (bytes.length === 1 && bytes[0] === 0x81) script.add(tbc.Opcode.OP_1NEGATE);
  else script.add(bytes);
}

function putOutput(fields, path, output) {
  fields[`${path}.Value`] = output.value;
  fields[`${path}.LockingScript.SuffixData`] = output.lockingScript.suffixData;
  fields[`${path}.LockingScript.PartialHash`] = output.lockingScript.partialHash;
  fields[`${path}.LockingScript.Size`] = output.lockingScript.size;
}

function putGroup(fields, path, group) {
  putOutput(fields, `${path}.Code`, group.code);
  fields[`${path}.Tape.Value`] = group.tape.value;
  fields[`${path}.Tape.LockingScript`] = group.tape.lockingScript;
}

function sign(tx, vin, privateKey, schnorr = false) {
  assert(privateKey instanceof tbc.PrivateKey, `vin ${vin} signingKey must be a PrivateKey`);
  const previous = tx.inputs[vin].output;
  const signature = tbc.Transaction.Sighash[schnorr ? 'signSchnorr' : 'sign'](
    tx, privateKey, HASH_TYPE, vin, previous.script, previous.satoshisBN,
    tbc.Script.Interpreter.DEFAULT_FLAGS);
  assert(tx.verifySignature(signature, privateKey.publicKey, vin, previous.script,
    previous.satoshisBN, tbc.Script.Interpreter.DEFAULT_FLAGS), `vin ${vin}: fresh signature is invalid`);
  return { signature: signature.toTxFormat(), publicKey: schnorr
    ? privateKey.publicKey.toXOnly() : privateKey.publicKey.toBuffer() };
}

function isAdministrator(reference, privateKey = reference.signingKey) {
  const descriptor = Coin.parseCode(reference.parentTx.outputs[reference.outputIndex].script);
  return [privateKey.publicKey.toBuffer(), privateKey.publicKey.toXOnly()]
    .some(publicKey => hash160(publicKey).equals(descriptor.adminPubKeyHash));
}

function makeWitness(tx, reference, groups, privateKey, mutate) {
  const { inputIndex: vin, parentTx: parent, outputIndex: vout, ancestors } = reference;
  const descriptor = Coin.parseCode(parent.outputs[vout].script);
  const compressedAdmin = hash160(privateKey.publicKey.toBuffer()).equals(descriptor.adminPubKeyHash);
  const xOnlyHash = hash160(privateKey.publicKey.toXOnly());
  const schnorr = xOnlyHash.equals(descriptor.adminPubKeyHash) || (!compressedAdmin &&
    descriptor.controller[20] === 0 && xOnlyHash.equals(descriptor.controller.subarray(0, 20)));
  const signed = sign(tx, vin, privateKey, schnorr);
  const fields = Object.create(null);
  const outputs = getTBC20CurrentOutputData(tx, groups);
  outputs.forEach((output, i) => putGroup(fields, `currentTX.Outputs[${INDEX[i]}]`, output));
  fields.currentInputsData = getTBC20CurrentInputsData(tx);
  fields.currentUnlockingVinIndex = encodeTBC20UnsignedLE(vin);
  const preceding = getTBC20PrePreTxArray(parent, vout, ancestors);
  preceding.forEach((ancestor, i) => {
    const path = `prepreTX[${INDEX[i]}]`;
    fields[`${path}.VLIO`] = ancestor.vlio;
    fields[`${path}.TxInputsHashData`] = ancestor.txInputsHashData;
    fields[`${path}.OutputsFirstPart`] = ancestor.outputsFirstPart;
    putOutput(fields, `${path}.OutputsVerifiedData`, ancestor.outputsVerifiedData);
    fields[`${path}.OutputsLastPart`] = ancestor.outputsLastPart;
  });
  fields.sig = signed.signature; fields.publicKey = signed.publicKey;
  for (const name of ABI.filter(name => name.startsWith('contractTX'))) fields[name] = Buffer.alloc(0);
  const preData = getTBC20PreTxData(parent, vout);
  fields['preTX.VLIO'] = preData.vlio;
  preData.inputs.forEach((data, i) => { fields[`preTX.Inputs[${INDEX[i]}].Data`] = data; });
  fields['preTX.UnlockingScriptHash'] = preData.unlockingScriptHash;
  fields['preTX.OutputsFirstPart'] = preData.outputsFirstPart;
  putGroup(fields, 'preTX.OutputsGotData', preData.outputsGotData);
  fields['preTX.OutputsLastPart'] = preData.outputsLastPart;
  if (mutate) mutate(fields);
  const script = new tbc.Script();
  ABI.forEach(name => { assert(Buffer.isBuffer(fields[name]), `missing ABI field ${name}`); add(script, fields[name]); });
  assert.equal(script.chunks.length, 123);
  return script;
}

function wrongOwnerKey(reference) {
  const descriptor = Coin.parseCode(reference.parentTx.outputs[reference.outputIndex].script);
  // A disposable deterministic outsider is sufficient: this key never owns
  // funds, and its mathematically valid signature must fail authorization.
  for (let number = 7001; ; number += 1) {
    const key = new tbc.PrivateKey(number.toString(16).padStart(64, '0'));
    if ([key.publicKey.toBuffer(), key.publicKey.toXOnly()].every(bytes =>
      !hash160(bytes).equals(descriptor.adminPubKeyHash) &&
      !hash160(bytes).equals(descriptor.controller.subarray(0, 20)))) return key;
  }
}

/**
 * Build unbroadcast negatives from an authenticated, fully signed valid spend.
 * coinInputs supplies every Coin input with its actual parent, private signing
 * key and Map/array/resolver of ancestor transactions. fee supplies the sole
 * remaining P2PKH input and its key. The first Coin input is the attack target.
 * Ordinary address holders and administrator spends are supported; controlling
 * contract inputs are intentionally outside this transfer-only test utility.
 *
 * All signatures (including the wrong-owner signature) are mathematically
 * verified after reconstruction. Every Coin's complete 123-field proof is built
 * directly from the frozen ABI and low-level serializers, bypassing the SDK's
 * authorization/output/lock prechecks without substituting a thrown SDK error
 * for VM rejection. The exact failed input set is asserted before returning.
 */
function prepareCoinAdversarial({ validTransaction, coinInputs, fee, cases = DEFAULT_CASES }) {
  assert(validTransaction instanceof tbc.Transaction, 'validTransaction must be a Transaction');
  assert(Array.isArray(coinInputs) && coinInputs.length > 0, 'coinInputs required');
  assert.equal(validTransaction.inputs.length, coinInputs.length + 1, 'only Coin inputs and one fee input supported');
  assert(Array.isArray(cases) && cases.length > 0 && new Set(cases).size === cases.length);
  cases.forEach(name => assert(CASES.includes(name), `unknown adversarial case ${name}`));
  const indices = new Set();
  for (const reference of coinInputs) {
    const { inputIndex, parentTx, outputIndex, signingKey } = reference;
    assert(Number.isSafeInteger(inputIndex) && inputIndex >= 0 && inputIndex < 6);
    assert(!indices.has(inputIndex), 'duplicate Coin input'); indices.add(inputIndex);
    assert(parentTx instanceof tbc.Transaction); assert(signingKey instanceof tbc.PrivateKey);
    const input = validTransaction.inputs[inputIndex];
    assert.equal(input.prevTxId.toString('hex'), parentTx.id, `vin ${inputIndex}: wrong parent`);
    assert.equal(input.outputIndex, outputIndex, `vin ${inputIndex}: wrong parent vout`);
    assert.equal(input.output.script.toHex(), parentTx.outputs[outputIndex].script.toHex());
    assert.equal(input.output.satoshis, parentTx.outputs[outputIndex].satoshis);
    const descriptor = Coin.parseCode(input.output.script);
    assert(descriptor.controller[20] === 0 || isAdministrator(reference),
      'contract-held Coin is supported only with its administrator signing key');
  }
  assert(fee && Number.isSafeInteger(fee.inputIndex) && fee.inputIndex >= 0 &&
    fee.inputIndex < validTransaction.inputs.length && !indices.has(fee.inputIndex));
  assert(fee.privateKey instanceof tbc.PrivateKey);
  assert(validTransaction.inputs[fee.inputIndex].output.script.equals(
    tbc.Script.buildPublicKeyHashOut(fee.privateKey.toAddress())), 'fee key does not own the authenticated P2PKH input');
  const originalRaw = validTransaction.uncheckedSerialize();
  const baseline = validateCoinTransaction(validTransaction);
  assert.equal(baseline.success, true, `valid baseline failed: ${JSON.stringify(baseline.inputs)}`);
  const target = coinInputs[0], targetVin = target.inputIndex;
  const groups = outputGroups(validTransaction);
  const targetGroup = groups.find(group => group.tapeVout !== undefined &&
    Coin.parseTape(validTransaction.outputs[group.tapeVout].script).amounts[targetVin] > 0n);
  assert(targetGroup, 'target input must contribute a positive amount to a Coin output');
  const incomingLock = reference => Coin.parseTape(reference.parentTx.outputs[reference.outputIndex + 1].script).lockTime;
  const results = [];
  for (const name of cases) {
    const tx = copyTransaction(validTransaction);
    let expectedLocalFailures = [targetVin];
    const targetTape = tx.outputs[targetGroup.tapeVout];
    const originalTape = Coin.parseTape(targetTape.script);
    const contributors = coinInputs.filter(reference => originalTape.amounts[reference.inputIndex] > 0n)
      .map(reference => reference.inputIndex).sort((a, b) => a - b);
    let mutate;
    if (name === 'amount-inflation' || name === 'amount-slot-misalignment') {
      const amounts = [...originalTape.amounts];
      if (name === 'amount-inflation') amounts[targetVin] += 1n;
      else {
        assert.equal(amounts[fee.inputIndex], 0n);
        amounts[fee.inputIndex] = amounts[targetVin]; amounts[targetVin] = 0n;
      }
      targetTape.setScript(Coin.replaceTapeAmounts(targetTape.script, amounts));
    } else if (name === 'foreign-identity') {
      const descriptor = Coin.parseCode(tx.outputs[targetGroup.codeVout].script);
      const adminPubKeyHash = Buffer.from(descriptor.adminPubKeyHash); adminPubKeyHash[0] ^= 1;
      tx.outputs[targetGroup.codeVout].setScript(Coin.instantiateCode({ ...descriptor, adminPubKeyHash }));
      expectedLocalFailures = contributors;
    } else if (name === 'output-locktime-header') {
      const tape = Buffer.from(targetTape.script.toBuffer());
      tape.fill(0, tape.length - 15, tape.length - 10);
      targetTape.setScript(tbc.Script.fromBuffer(tape));
      assert(targetTape.script.isSafeDataOut(), 'bad lock header still has a standard push-only Tape');
      expectedLocalFailures = contributors;
    } else if (name === 'output-tape-length') {
      const tape = targetTape.script.toBuffer();
      targetTape.setScript(tbc.Script.fromBuffer(Buffer.concat([
        tape.subarray(0, -15), Buffer.from([0]), tape.subarray(-15),
      ])));
      expectedLocalFailures = contributors;
    } else if (name === 'parent-proof-txid') {
      mutate = fields => {
        fields['preTX.UnlockingScriptHash'] = Buffer.from(fields['preTX.UnlockingScriptHash']);
        fields['preTX.UnlockingScriptHash'][0] ^= 1;
      };
    } else if (name === 'ancestor-proof-txid') {
      mutate = fields => {
        const name = ABI.find(field => field.startsWith('prepreTX[') &&
          field.endsWith('.TxInputsHashData') && fields[field].length > 0);
        assert(name, 'positive ancestor proof required');
        fields[name] = Buffer.from(fields[name]); fields[name][0] ^= 1;
      };
    } else if (name === 'wrong-owner') {
      assert.equal(Coin.parseCode(target.parentTx.outputs[target.outputIndex].script).controller[20], 0,
        'wrong-owner case requires address-held Coin');
    } else if (name === 'final-sequence') {
      tx.inputs[targetVin].sequenceNumber = 0xffffffff;
      tx.inputs[fee.inputIndex].sequenceNumber = 0xfffffffe;
    } else if (name === 'locktime-cross-domain' || name === 'locktime-immature') {
      const lock = incomingLock(target);
      assert(lock > 0 && !isAdministrator(target), 'lock negative requires a nonzero lock and ordinary holder');
      // Both cross-domain replacements are already mature on a live testnet:
      // 500000000 is a 1985 timestamp; height 1 is long past. Using height
      // 499999999 would let node finality reject before executing Coin script.
      tx.nLockTime = name === 'locktime-immature' ? lock - 1 : lock < 500000000 ? 500000000 : 1;
      expectedLocalFailures = coinInputs.filter(reference => {
        if (isAdministrator(reference)) return false;
        const lock = incomingLock(reference);
        return tx.nLockTime < lock || (lock > 0 && (lock < 500000000) !== (tx.nLockTime < 500000000));
      }).map(reference => reference.inputIndex).sort((a, b) => a - b);
    }
    for (const reference of coinInputs) {
      const targetInput = reference.inputIndex === targetVin;
      const signingKey = targetInput && name === 'wrong-owner' ? wrongOwnerKey(reference) : reference.signingKey;
      tx.inputs[reference.inputIndex].setScript(makeWitness(tx, reference, groups, signingKey, targetInput ? mutate : undefined));
    }
    const funding = sign(tx, fee.inputIndex, fee.privateKey);
    tx.inputs[fee.inputIndex].setScript(new tbc.Script().add(funding.signature).add(funding.publicKey));
    const validation = validateCoinTransaction(tx);
    assert.equal(validation.valueConserved, true, `${name}: native value accounting`);
    assert.equal(validation.inputs[fee.inputIndex].success, true, `${name}: fee signature must succeed`);
    assert.deepEqual(validation.inputs.filter(input => !input.success).map(input => input.inputIndex),
      expectedLocalFailures, `${name}: unexpected VM failure set; do not probe the network`);
    assert.equal(validation.success, false, `${name}: contract unexpectedly accepted mutation`);
    assert.equal(validTransaction.uncheckedSerialize(), originalRaw, 'valid candidate was mutated');
    results.push({ label: `negative/${name}`, transaction: tx, txraw: tx.uncheckedSerialize(), txid: tx.id,
      expectedLocalFailures, validation, signaturesVerified: true });
  }
  return results;
}

module.exports = { prepareCoinAdversarial, validateCoinTransaction, COIN_ADVERSARIAL_CASES: CASES };
