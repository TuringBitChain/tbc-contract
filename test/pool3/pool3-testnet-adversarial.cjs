'use strict';

// Test-only invalid-transaction construction. This module has no networking,
// wallet discovery, key loading or broadcasting. All previous transactions and
// signing adapters must be supplied by the testnet runner. Run these candidates
// BEFORE the corresponding valid transaction consumes their shared inputs.
const assert = require('node:assert/strict');
const tbc = require('tbc-lib-js');
const TBC20 = require('../../lib/contract/tbc20.js');
const { buildTBC20UnlockScriptWithSignature, replaceTBC20TapeAmounts } = require('../../lib/util/tbc20/tbc20unlock.js');
const { buildPoolUnlockScript } = require('../../lib/util/poolnft3/witness.js');
const { decodePoolTape, replacePoolTapeAmounts } = require('../../lib/util/poolnft3/tape.js');
const { parsePoolCode } = require('../../lib/util/poolnft3/artifacts.js');
const { validatePool3Transaction } = require('../../lib/validator/poolnft3.js');

const DEFAULT_CASES = Object.freeze([
  'reserve-tamper', 'ft-slot-misalignment', 'ft-tape-length',
  'pool-tape-length', 'wrong-fee-address',
]);

function copyTransaction(tx) {
  const clone = new tbc.Transaction(tx.uncheckedSerialize());
  tx.inputs.forEach((input, vin) => {
    assert(input.output, `input ${vin} requires authenticated previous output`);
    clone.inputs[vin].output = new tbc.Transaction.Output({
      script: tbc.Script.fromBuffer(Buffer.from(input.output.script.toBuffer())),
      satoshis: input.output.satoshis,
    });
  });
  return clone;
}

function publicKeyOf(signer) {
  assert(signer && typeof signer.sign === 'function', 'a signing callback is required');
  const bytes = Buffer.isBuffer(signer.publicKey) ? Buffer.from(signer.publicKey) : Buffer.from(signer.publicKey, 'hex');
  assert.equal(bytes.length, 33, 'compressed public key required');
  tbc.PublicKey.fromBuffer(bytes);
  return bytes;
}

async function signInput(tx, inputIndex, signer, role) {
  const publicKey = publicKeyOf(signer), input = tx.inputs[inputIndex];
  const request = {
    inputIndex, role,
    outpoint: { txId: input.prevTxId.toString('hex'), outputIndex: input.outputIndex },
    amountSat: BigInt(input.output.satoshis), lockingScriptHex: input.output.script.toHex(),
    publicKey: Buffer.from(publicKey), publicKeyHash: tbc.crypto.Hash.sha256ripemd160(publicKey),
    sighashType: 0x41, transaction: copyTransaction(tx),
  };
  const supplied = await signer.sign(request);
  assert(Buffer.isBuffer(supplied) || typeof supplied === 'string', 'signature callback must return Buffer or hex');
  if (typeof supplied === 'string') assert(/^(?:[0-9a-fA-F]{2})+$/.test(supplied), 'invalid signature hex');
  const signature = Buffer.isBuffer(supplied) ? Buffer.from(supplied) : Buffer.from(supplied, 'hex');
  assert(signature.length <= 72 && signature.length !== 65 && tbc.crypto.Signature.isTxDER(signature), 'canonical ECDSA signature required');
  const parsed = tbc.crypto.Signature.fromTxFormat(signature);
  assert(parsed.hasLowS() && parsed.nhashtype === 0x41, 'low-S SIGHASH_ALL | FORKID signature required');
  assert(tx.verifySignature(parsed, tbc.PublicKey.fromBuffer(publicKey), inputIndex,
    input.output.script, input.output.satoshisBN, 0x10000), `fresh signature for vin ${inputIndex} is invalid`);
  return { signature, publicKey };
}

function assertReference(tx, inputIndex, reference, localTransactions) {
  const input = tx.inputs[inputIndex], parent = reference.parentTx;
  assert(parent instanceof tbc.Transaction);
  assert.equal(input.prevTxId.toString('hex'), parent.id, `vin ${inputIndex} parent txid`);
  assert.equal(input.outputIndex, reference.outputIndex, `vin ${inputIndex} parent output index`);
  assert.equal(localTransactions.get(parent.id)?.uncheckedSerialize(), parent.uncheckedSerialize(), 'parent must be present in local ledger');
  const output = parent.outputs[reference.outputIndex];
  assert.equal(input.output.satoshis, output.satoshis);
  assert.equal(input.output.script.toHex(), output.script.toHex());
}

async function rebuildSwapFT(tx, common, localTransactions, controllerSigner) {
  // FORKID signs outputs and prevouts, not current scriptSigs. It is safe to
  // collect each fresh signature before installing the reconstructed proofs.
  const controller = controllerSigner ? await signInput(tx, 0, controllerSigner, 'pool-controller') : {};
  const funding = await signInput(tx, 1, common.funding.signer, 'funding');
  const poolFt = await signInput(tx, 2, common.poolFT.signer, 'pool-ft');
  tx.inputs[0].setScript(buildPoolUnlockScript({
    tx, preTx: common.pool.parentTx, prePreTx: common.pool.ancestorTx,
    inputTxs: [common.funding.parentTx, common.poolFT.parentTx], option: 3, ...controller,
  }));
  tx.inputs[1].setScript(new tbc.Script().add(funding.signature).add(funding.publicKey));
  const groups = [{ codeVout: 0, tapeVout: 1 }, { codeVout: 2, tapeVout: 3 },
    { codeVout: 4 }, { codeVout: 5, tapeVout: 6 }];
  if (tx.outputs.length === 8) groups.push({ codeVout: 7 });
  tx.inputs[2].setScript(buildTBC20UnlockScriptWithSignature({
    currentTx: tx, inputIndex: 2, preTx: common.poolFT.parentTx,
    preTxVout: common.poolFT.outputIndex, ancestorTransactions: localTransactions,
    outputGroups: groups, ...poolFt,
    contractController: { transaction: common.pool.parentTx, currentInputIndex: 0 },
  }));
  return tx;
}

/**
 * @param {object} options
 * @param {object} options.validResult Unbroadcast, fully signed SDK swapFT result.
 * @param {object} options.common Original {pool, poolFT, funding, controllerSigner?}.
 * @param {Map<string, object>} options.localTransactions All actual parent ancestry.
 * @param {object} [options.nonMemberSigner] Required to test a hash Pool outsider.
 * @param {string[]} [options.cases] Optional explicit subset of exported case names.
 * @returns {Promise<Array<{transaction: object, label: string,
 *   expectedLocalFailures: number[], validation: object, txraw: string,
 *   txid: string, signaturesVerified: boolean}>>}
 *
 * Every output mutation gets NEW Pool proof data, NEW FT proof data, and NEW
 * mathematically valid signatures. Thus a rejection is not a stale-signature
 * or stale-hashOutputs test. The funding input must always succeed locally.
 * Throws on an unexpectedly successful local contract spend; do not broadcast
 * candidates if preparation throws. Node rejection remains the caller's test.
 */
async function prepareSwapFTAdversarial({ validResult, common, localTransactions, nonMemberSigner, cases }) {
  assert.equal(validResult?.layout?.operation, 'swapFT');
  assert.equal(validResult.validation?.success, true, 'start from a locally valid candidate');
  assert(localTransactions instanceof Map, 'local transactions must be a Map');
  assert(common?.pool?.ancestorTx && common.poolFT && common.funding);
  const original = validResult.transaction;
  assert.equal(original.inputs.length, 3);
  assert(original.outputs.length === 7 || original.outputs.length === 8);
  assert.equal(validResult.txraw, original.uncheckedSerialize(), 'valid result was mutated');
  const originalRaw = original.uncheckedSerialize();
  assertReference(original, 0, { parentTx: common.pool.parentTx, outputIndex: 0 }, localTransactions);
  assertReference(original, 1, common.funding, localTransactions);
  assertReference(original, 2, common.poolFT, localTransactions);
  const authorization = parsePoolCode(common.pool.parentTx.outputs[0].script).authorization;
  const hashLocked = authorization.kind === 'controller';
  assert.equal(Boolean(common.controllerSigner), hashLocked, 'Controller signer must match Pool mode');
  const selected = cases ?? [...DEFAULT_CASES, ...(hashLocked && nonMemberSigner ? ['controller-nonmember'] : [])];
  assert(Array.isArray(selected) && selected.length > 0 && new Set(selected).size === selected.length);
  const known = new Set([...DEFAULT_CASES, 'controller-nonmember']);
  for (const name of selected) assert(known.has(name), `unknown adversarial case ${name}`);
  const results = [];
  for (const name of selected) {
    const tx = copyTransaction(original);
    let signer = common.controllerSigner;
    let expectedLocalFailures = [0];
    if (name === 'reserve-tamper') {
      const state = decodePoolTape(tx.outputs[1].script);
      tx.outputs[1].setScript(tbc.Script.fromBuffer(replacePoolTapeAmounts(tx.outputs[1].script,
        { ...state, tbcAmount: state.tbcAmount + 1n })));
    } else if (name === 'ft-slot-misalignment') {
      const amounts = TBC20.parseTape(tx.outputs[3].script).amounts.slice();
      assert(amounts[2] > 0n && amounts[1] === 0n);
      amounts[1] = amounts[2]; amounts[2] = 0n;
      tx.outputs[3].setScript(replaceTBC20TapeAmounts(tx.outputs[3].script, amounts));
      expectedLocalFailures = [0, 2];
    } else if (name === 'ft-tape-length') {
      // Insert a valid OP_0 immediately before the marker push. The amount
      // slots and marker stay intact; only the contract-fixed Tape size differs.
      const tape = tx.outputs[3].script.toBuffer();
      const markerLength = Buffer.from('TBC20TAPE', 'ascii').length + 1;
      tx.outputs[3].setScript(tbc.Script.fromBuffer(Buffer.concat([
        tape.subarray(0, tape.length - markerLength), Buffer.from([0]), tape.subarray(tape.length - markerLength),
      ])));
      expectedLocalFailures = [0, 2];
    } else if (name === 'pool-tape-length') {
      tx.outputs[1].setScript(tbc.Script.fromBuffer(Buffer.concat([tx.outputs[1].script.toBuffer(), Buffer.from([0])])));
    } else if (name === 'wrong-fee-address') {
      assert(tx.outputs[4].satoshis > 0, 'fee-address negative case requires a paid (nonzero) service fee');
      const script = Buffer.from(tx.outputs[4].script.toBuffer());
      assert.equal(script.length, 25); assert.equal(script.subarray(0, 3).toString('hex'), '76a914');
      // Redirect only the pubkey hash; preserve standard P2PKH shape and value.
      const replacement = tbc.crypto.Hash.sha256ripemd160(publicKeyOf(common.funding.signer));
      assert(!script.subarray(3, 23).equals(replacement), 'funding address must differ from the service recipient');
      replacement.copy(script, 3);
      tx.outputs[4].setScript(tbc.Script.fromBuffer(script));
    } else if (name === 'controller-nonmember') {
      assert(hashLocked && nonMemberSigner, 'Controller outsider test requires a hash Pool and an outsider signer');
      const hash = tbc.crypto.Hash.sha256ripemd160(publicKeyOf(nonMemberSigner)).toString('hex');
      assert(!authorization.controllerPubKeyHashes.includes(hash), 'provided outsider is actually a whitelist member');
      signer = nonMemberSigner;
    }
    await rebuildSwapFT(tx, common, localTransactions, signer);
    const validation = validatePool3Transaction(tx);
    assert.equal(validation.valueConserved, true, `${name}: value accounting must remain valid`);
    assert.equal(validation.inputs[1].success, true, `${name}: funding signature must pass`);
    assert.deepEqual(validation.inputs.filter(input => !input.success).map(input => input.inputIndex),
      expectedLocalFailures, `${name}: unexpected local failure set; stop before broadcasting`);
    assert.equal(validation.success, false, `${name}: unexpected contract acceptance`);
    assert.equal(original.uncheckedSerialize(), originalRaw, 'adversarial preparation mutated the valid candidate');
    results.push({ transaction: tx, label: `negative/${name}`, expectedLocalFailures,
      validation, txraw: tx.uncheckedSerialize(), txid: tx.id, signaturesVerified: true });
  }
  return results;
}

module.exports = { prepareSwapFTAdversarial, SWAP_FT_ADVERSARIAL_CASES: Object.freeze([...DEFAULT_CASES, 'controller-nonmember']) };
