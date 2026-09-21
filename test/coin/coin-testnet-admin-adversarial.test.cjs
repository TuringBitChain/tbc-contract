'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const tbc = require('tbc-lib-js');
const { CoinTBC20: Coin } = require('../../lib/util/coin/coinTbc20Code.js');
const { buildCoinTBC20UnlockScriptWithSignature } = require('../../lib/util/coin/coinTbc20unlock.js');
const { validateCoinTransaction } = require('./coin-testnet-adversarial.cjs');
const { prepareCoinAdminAdversarial, prepareCoinAdminControllerChange } = require('./coin-testnet-admin-adversarial.cjs');
const M = tbc.crypto.MuSig2;
const key = n => new tbc.PrivateKey(n.toString(16).padStart(64, '0'));
const alice = key(801), bob = key(802), adminKeys = [key(803), key(804)];
const hash160 = value => tbc.crypto.Hash.sha256ripemd160(value);
const controller = privateKey => Buffer.concat([hash160(privateKey.publicKey.toBuffer()), Buffer.from([0])]);

function signer({ corruptPartial = false } = {}) {
  const pubkeys = adminKeys.map(k => M.pubkeyFromSk(k.toBuffer()));
  const context = M.keyAgg(M.keySort(pubkeys)), publicKey = M.getAggPubkey(context);
  const receipts = [], cleared = [];
  return { publicKey, receipts, cleared, async sign({ sighash }) {
    const nonces = adminKeys.map((k, i) => M.nonceGen({ pk: pubkeys[i], sk: k.toBuffer(), aggpk: publicKey, msg: sighash }));
    try {
      const session = M.buildSession(context, M.nonceAgg(nonces.map(n => n.pubnonce)), sighash);
      const partials = adminKeys.map((k, i) => M.partialSign(nonces[i].secnonce, k.toBuffer(), session));
      if (corruptPartial) partials[0][0] ^= 1;
      partials.forEach((partial, i) => assert(M.partialVerify(partial, nonces[i].pubnonce, pubkeys[i], session), 'partial signature verification'));
      const signature = M.partialSigAgg(partials, session);
      assert(tbc.crypto.Schnorr.verify(sighash, signature, publicKey));
      receipts.push({ sighash: Buffer.from(sighash), publicNonces: nonces.map(n => Buffer.from(n.pubnonce)) });
      return signature;
    } finally {
      for (const nonce of nonces) {
        nonce.secnonce.fill(0); cleared.push(nonce.secnonce);
      }
    }
  } };
}

async function fixture() {
  // Only the issuance certificate/funding boundary is synthetic. Baseline and
  // every mutated Coin execute the real 2981-byte Code with actual MuSig2.
  const adminSigner = signer(), certificate = new tbc.Script().add(tbc.Opcode.OP_TRUE);
  const root = new tbc.Transaction();
  root.uncheckedAddInput(new tbc.Transaction.Input({ prevTxId: Buffer.alloc(32, 0x81), outputIndex: 0,
    sequenceNumber: 0xffffffff, script: new tbc.Script() }));
  root.addOutput(new tbc.Transaction.Output({ script: certificate, satoshis: 100000 }));
  root.addOutput(new tbc.Transaction.Output({ script: tbc.Script.buildPublicKeyHashOut(alice.toAddress()), satoshis: 20000 }));
  const code = Coin.instantiateCode({ coinNftCodeHash: tbc.crypto.Hash.sha256(certificate.toBuffer()),
    adminPubKeyHash: hash160(adminSigner.publicKey), controller: controller(alice), tapeSize: 66 });
  const mint = new tbc.Transaction().from({ txId: root.id, outputIndex: 0, script: certificate.toHex(), satoshis: 100000 });
  mint.addOutput(new tbc.Transaction.Output({ script: code, satoshis: 500 }));
  mint.addOutput(new tbc.Transaction.Output({ script: Coin.buildTape({ tapeSize: 66, amounts: [1000n, 0n, 0n, 0n, 0n, 0n], lockTime: 0xffffffff }), satoshis: 0 }));
  const tx = new tbc.Transaction();
  for (const [parent, outputIndex] of [[mint, 0], [root, 1]]) tx.from({ txId: parent.id,
    outputIndex, script: parent.outputs[outputIndex].script.toHex(), satoshis: parent.outputs[outputIndex].satoshis });
  tx.inputs[0].sequenceNumber = 0xfffffffe;
  tx.addOutput(new tbc.Transaction.Output({ script: code, satoshis: 500 }));
  tx.addOutput(new tbc.Transaction.Output({ script: Coin.setLockTime(mint.outputs[1].script, 0), satoshis: 0 }));
  tx.addOutput(new tbc.Transaction.Output({ script: tbc.Script.buildPublicKeyHashOut(alice.toAddress()), satoshis: 19000 }));
  const digest = tbc.crypto.Hash.sha256sha256(Buffer.from(tx.getPreimage(0, 0x41), 'hex'));
  const signature = await adminSigner.sign({ sighash: digest });
  tx.inputs[0].setScript(buildCoinTBC20UnlockScriptWithSignature({ currentTx: tx, inputIndex: 0,
    preTx: mint, preTxVout: 0, ancestorTransactions: [root], outputGroups: [{ codeVout: 0, tapeVout: 1 }, { codeVout: 2 }],
    signature: Buffer.concat([signature, Buffer.from([0x41])]), publicKey: adminSigner.publicKey }));
  const fee = tbc.Transaction.Sighash.sign(tx, alice, 0x41, 1, root.outputs[1].script, root.outputs[1].satoshisBN);
  tx.inputs[1].setScript(new tbc.Script().add(fee.toTxFormat()).add(alice.publicKey.toBuffer()));
  assert.equal(validateCoinTransaction(tx).success, true);
  return { validTransaction: tx, coinInputs: [{ inputIndex: 0, parentTx: mint, outputIndex: 0 }],
    adminSigner, fee: { inputIndex: 1, privateKey: alice } };
}

test('MuSig2 administrator negatives preserve mathematically valid signatures while contract and fee results separate', async () => {
  const options = await fixture(), original = options.validTransaction.uncheckedSerialize();
  const candidates = await prepareCoinAdminAdversarial(options);
  assert.equal(candidates.length, 3);
  for (const candidate of candidates) {
    assert.deepEqual(candidate.expectedLocalFailures, [0]);
    assert.deepEqual(candidate.validation.inputs.map(input => input.success), [false, true]);
    const tx = candidate.transaction, witness = tx.inputs[0].script;
    const digest = tbc.crypto.Hash.sha256sha256(Buffer.from(tx.getPreimage(0, 0x41), 'hex'));
    assert(tbc.crypto.Schnorr.verify(digest, witness.chunks[98].buf.subarray(0, 64), witness.chunks[99].buf));
    assert.equal(witness.chunks.length, 123);
    if (candidate.label.endsWith('wrong-admin')) assert(!witness.chunks[99].buf.equals(options.adminSigner.publicKey));
    else assert(witness.chunks[99].buf.equals(options.adminSigner.publicKey));
    assert.notEqual(candidate.validation.inputs[0].error, 'SCRIPT_ERR_SIG_NULLFAIL');
  }
  assert.equal(options.validTransaction.uncheckedSerialize(), original);
  assert(options.adminSigner.cleared.every(bytes => bytes.every(byte => byte === 0)));
});

test('full administrator authority permits changing Controller before the holder lock matures', async () => {
  const options = await fixture();
  const candidate = await prepareCoinAdminControllerChange({ ...options, controller: controller(bob) });
  assert.equal(candidate.label, 'positive/admin-controller-change');
  assert.equal(candidate.validation.success, true);
  assert.equal(candidate.transaction.nLockTime, 0);
  assert.equal(Coin.parseTape(options.coinInputs[0].parentTx.outputs[1].script).lockTime, 0xffffffff);
  assert(Coin.parseCode(candidate.transaction.outputs[0].script).controller.equals(controller(bob)));
  assert(Coin.getCodeIdentity(candidate.transaction.outputs[0].script).equals(Coin.getCodeIdentity(options.validTransaction.outputs[0].script)));
  assert.equal(Coin.parseTape(candidate.transaction.outputs[1].script).balance, 1000n);
});

test('MuSig2 retries create fresh nonces and wiped nonces cannot sign again', async () => {
  const adminSigner = signer(), sighash = Buffer.alloc(32, 0x35);
  const first = await adminSigner.sign({ sighash }), second = await adminSigner.sign({ sighash });
  assert(tbc.crypto.Schnorr.verify(sighash, first, adminSigner.publicKey));
  assert(tbc.crypto.Schnorr.verify(sighash, second, adminSigner.publicKey));
  assert(!first.equals(second));
  for (let i = 0; i < 2; i++) assert(!adminSigner.receipts[0].publicNonces[i].equals(adminSigner.receipts[1].publicNonces[i]));
  for (const nonce of adminSigner.cleared) assert.throws(() => M.partialSign(nonce, adminKeys[0].toBuffer(), {}), /k out of range/);
  const changed = Buffer.from(sighash); changed[0] ^= 1;
  assert.equal(tbc.crypto.Schnorr.verify(changed, first, adminSigner.publicKey), false);
});

test('a bad MuSig2 partial aborts preparation and erases every secret nonce on the failure path', async () => {
  const options = await fixture(), broken = signer({ corruptPartial: true });
  const before = options.validTransaction.uncheckedSerialize();
  await assert.rejects(prepareCoinAdminAdversarial({ ...options, adminSigner: broken,
    cases: ['admin-amount-inflation'] }), /partial signature verification/);
  assert.equal(broken.receipts.length, 0);
  assert.equal(broken.cleared.length, 2);
  assert(broken.cleared.every(nonce => nonce.every(byte => byte === 0)));
  assert.equal(options.validTransaction.uncheckedSerialize(), before);
});

test('administrator signer cannot return a stale signature for mutated transaction outputs', async () => {
  const options = await fixture();
  const stale = options.validTransaction.inputs[0].script.chunks[98].buf.subarray(0, 64);
  await assert.rejects(prepareCoinAdminAdversarial({ ...options, cases: ['admin-amount-inflation'],
    adminSigner: { publicKey: options.adminSigner.publicKey, sign: async () => stale } }), /fresh administrator/);
});
