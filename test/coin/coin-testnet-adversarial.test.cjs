'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const tbc = require('tbc-lib-js');
const Coin = require('../../lib/contract/coinTbc20.js');
const { CoinTBC20: CoinCodec } = require('../../lib/util/coin/coinTbc20Code.js');
const { buildUTXO } = require('../../lib/util/common/util.js');
const {
  prepareCoinAdversarial, validateCoinTransaction, COIN_ADVERSARIAL_CASES,
} = require('./coin-testnet-adversarial.cjs');

const key = number => new tbc.PrivateKey(number.toString(16).padStart(64, '0'));
const owner = key(601), admin = key(602), bob = key(603);
const address = privateKey => privateKey.toAddress().toString();
const adminPublicKey = admin.publicKey.toXOnly();
const coinOutputs = tx => tx.outputs.flatMap((output, outputIndex) =>
  output.script.toBuffer().subarray(-14).equals(Buffer.from('COINTBC20CODE2'))
    ? [{ parentTx: tx, outputIndex, utxo: buildUTXO(tx, outputIndex, true) }] : []);

function fixture(options) {
  const log = console.log;
  console.log = () => {};
  try { return createFixture(options); } finally { console.log = log; }
}

function createFixture({ multiple = false, lockTime = 0 } = {}) {
  const chain = new Map();
  const root = new tbc.Transaction();
  root.uncheckedAddInput(new tbc.Transaction.Input({ prevTxId: Buffer.alloc(32, 0x62),
    outputIndex: 0, sequenceNumber: 0xffffffff, script: new tbc.Script() }));
  for (let i = 0; i < 4; i += 1) root.addOutput(new tbc.Transaction.Output({
    script: tbc.Script.buildPublicKeyHashOut(owner.toAddress()), satoshis: 1000000,
  }));
  chain.set(root.id, root);
  const sdk = new Coin({ name: 'Adversarial offline fixture', symbol: 'ADF', amount: '100', decimal: 0 });
  let nextFee = 0;
  const funding = () => buildUTXO(root, nextFee++);
  const attach = raw => {
    const tx = typeof raw === 'string' ? new tbc.Transaction(raw) : raw;
    for (const input of tx.inputs) {
      const parent = chain.get(input.prevTxId.toString('hex'));
      assert(parent, 'fixture parent missing'); input.output = parent.outputs[input.outputIndex];
    }
    const validation = validateCoinTransaction(tx);
    assert.equal(validation.success, true, JSON.stringify(validation.inputs));
    chain.set(tx.id, tx);
    return tx;
  };
  const finalize = prepared => {
    const signatures = prepared.sighashes.map(({ inputIndex }) => {
      const previous = prepared.tx.inputs[inputIndex].output;
      return tbc.Transaction.Sighash.signSchnorr(prepared.tx, admin, 0x41, inputIndex,
        previous.script, previous.satoshisBN).schnorrSig;
    });
    const raw = prepared.finalize(signatures);
    return Array.isArray(raw) ? raw.map(attach) : attach(raw);
  };
  const [, first] = finalize(sdk.createCoin(adminPublicKey, owner, address(owner), funding(), root, 'offline test'));
  let selected = coinOutputs(first);
  if (multiple) {
    const batch = sdk.batchTransfer(owner, [
      { address: address(owner), amount: '40' }, { address: address(owner), amount: '60' },
    ], selected.map(coin => coin.utxo), funding(), selected.map(coin => coin.parentTx), chain);
    assert.equal(batch.length, 1);
    selected = coinOutputs(attach(batch[0].txraw));
    assert.equal(selected.length, 2);
  }
  if (lockTime) {
    selected = coinOutputs(finalize(sdk.freezeCoinUTXO(adminPublicKey, owner, lockTime,
      selected.map(coin => coin.utxo), funding(), selected.map(coin => coin.parentTx), chain)));
  }
  const validTransaction = attach(sdk.transfer(owner, address(bob), '100',
    selected.map(coin => coin.utxo), funding(), selected.map(coin => coin.parentTx), chain));
  return { validTransaction, coinInputs: selected.map((coin, inputIndex) => ({ ...coin, inputIndex,
    signingKey: owner, ancestors: chain })), fee: { inputIndex: selected.length, privateKey: owner } };
}

function verifyFreshSignatures(candidate, feeVin) {
  candidate.transaction.inputs.forEach((input, vin) => {
    const signatureChunk = input.script.chunks[vin === feeVin ? 0 : 98];
    const keyChunk = input.script.chunks[vin === feeVin ? 1 : 99];
    const signature = tbc.crypto.Signature.fromTxFormat(signatureChunk.buf);
    const publicKey = tbc.PublicKey.fromBuffer(keyChunk.buf);
    assert(candidate.transaction.verifySignature(signature, publicKey, vin, input.output.script,
      input.output.satoshisBN, tbc.Script.Interpreter.DEFAULT_FLAGS), `fresh signature ${vin}`);
  });
}

test('nine Coin negatives fail the intended VM input while fresh owner and fee signatures verify', () => {
  const options = fixture();
  const original = options.validTransaction.uncheckedSerialize();
  const candidates = prepareCoinAdversarial(options);
  assert.equal(candidates.length, 9);
  assert.equal(COIN_ADVERSARIAL_CASES.length, 11);
  assert.equal(new Set(candidates.map(candidate => candidate.txid)).size, 9);
  for (const candidate of candidates) {
    assert.deepEqual(candidate.expectedLocalFailures, [0]);
    assert.deepEqual(candidate.validation.inputs.map(input => input.success), [false, true]);
    assert.equal(candidate.signaturesVerified, true);
    verifyFreshSignatures(candidate, options.fee.inputIndex);
    assert.equal(candidate.txraw, candidate.transaction.uncheckedSerialize());
    assert(candidate.validation.inputs[0].error.startsWith('SCRIPT_ERR_'));
  }
  const final = candidates.find(candidate => candidate.label === 'negative/final-sequence').transaction;
  assert.equal(final.inputs[0].sequenceNumber, 0xffffffff);
  assert.equal(final.inputs[1].sequenceNumber, 0xfffffffe, 'a nonfinal fee input cannot substitute for the Coin input');
  const header = candidates.find(candidate => candidate.label === 'negative/output-locktime-header').transaction;
  assert.equal(header.outputs[1].script.toBuffer().length, options.validTransaction.outputs[1].script.toBuffer().length);
  assert.equal(header.outputs[1].script.isSafeDataOut(), true, 'standardness does not explain rejection');
  assert.equal(options.validTransaction.uncheckedSerialize(), original);
});

test('multi-input negatives rebuild every Coin witness and distinguish shared outputs from per-input proof failures', () => {
  const options = fixture({ multiple: true });
  const candidates = prepareCoinAdversarial(options);
  for (const candidate of candidates) {
    const sharedOutput = ['foreign-identity', 'output-locktime-header', 'output-tape-length']
      .some(name => candidate.label === `negative/${name}`);
    assert.deepEqual(candidate.expectedLocalFailures, sharedOutput ? [0, 1] : [0]);
    assert.deepEqual(candidate.validation.inputs.map(input => input.success), sharedOutput
      ? [false, false, true] : [false, true, true]);
    assert(candidate.transaction.inputs.slice(0, 2).every(input => input.script.chunks.length === 123));
    verifyFreshSignatures(candidate, options.fee.inputIndex);
  }
});

for (const lockTime of [650000, 1800000000]) {
  test(`holder maturity negatives reach the VM for ${lockTime < 500000000 ? 'height' : 'timestamp'} locks`, () => {
    const options = fixture({ lockTime });
    assert.equal(options.validTransaction.nLockTime, lockTime);
    const candidates = prepareCoinAdversarial({ ...options, cases: ['locktime-cross-domain', 'locktime-immature'] });
    assert.equal(candidates.length, 2);
    for (const candidate of candidates) {
      assert.deepEqual(candidate.validation.inputs.map(input => input.success), [false, true]);
      verifyFreshSignatures(candidate, options.fee.inputIndex);
      assert.equal(candidate.transaction.inputs[0].sequenceNumber, 0xfffffffe);
    }
    assert.equal(candidates[1].transaction.nLockTime, lockTime - 1);
    assert.notEqual(candidates[0].transaction.nLockTime < 500000000, lockTime < 500000000);
  });
}

test('negative preparation fails closed on invalid baselines, references, fee keys and case selection', () => {
  const options = fixture();
  assert.throws(() => prepareCoinAdversarial({ ...options, cases: ['unknown'] }), /unknown/);
  assert.throws(() => prepareCoinAdversarial({ ...options, cases: ['wrong-owner', 'wrong-owner'] }));
  assert.throws(() => prepareCoinAdversarial({ ...options, cases: ['locktime-cross-domain'] }), /nonzero lock/);
  assert.throws(() => prepareCoinAdversarial({ ...options, fee: { ...options.fee, privateKey: bob } }), /fee key/);
  assert.throws(() => prepareCoinAdversarial({ ...options,
    coinInputs: options.coinInputs.map(input => ({ ...input, outputIndex: 0 })) }), /wrong parent vout/);
  options.validTransaction.inputs[0].setScript(new tbc.Script());
  assert.throws(() => prepareCoinAdversarial(options), /valid baseline failed/);
});
