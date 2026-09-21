'use strict';

// Offline codec/witness tests. OP_TRUE is only the explicit issuance-certificate
// fixture; Coin inputs always execute the frozen real contract and real signatures.
const test = require('node:test');
const assert = require('node:assert/strict');
const tbc = require('tbc-lib-js');
const { CoinTBC20: Coin } = require('../lib/util/coin/coinTbc20Code.js');
const { buildCoinTBC20UnlockScript: unlock, buildCoinTBC20UnlockScriptWithSignature: unlockSigned } =
  require('../lib/util/coin/coinTbc20unlock.js');
const key = n => new tbc.PrivateKey(n.toString(16).padStart(64, '0'));
const owner = key(501), admin = key(502), recipient = key(503);
const hash160 = b => tbc.crypto.Hash.sha256ripemd160(b);
const sha = b => tbc.crypto.Hash.sha256(b);
const controller = k => Buffer.concat([hash160(k.publicKey.toBuffer()), Buffer.from([0])]);
const out = (script, satoshis) => new tbc.Transaction.Output({ script, satoshis });
const amounts = (amount = 1000n, slot = 0) => Array.from({ length: 6 }, (_, i) => i === slot ? amount : 0n);
function input(tx, parent, vout) {
  tx.from({ txId: parent.id, outputIndex: vout, script: parent.outputs[vout].script.toHex(),
    satoshis: parent.outputs[vout].satoshis });
}
function fixture({ lockTime = 0, metadata = Buffer.from('03414243', 'hex'), holder = controller(owner),
  adminHash = hash160(admin.publicKey.toXOnly()), sourceVout = 0, sourceVin = 0 } = {}) {
  const certificate = new tbc.Script().add(tbc.Opcode.OP_TRUE);
  const root = new tbc.Transaction();
  root.uncheckedAddInput(new tbc.Transaction.Input({ prevTxId: Buffer.alloc(32, 0x11), outputIndex: 0,
    sequenceNumber: 0xffffffff, script: new tbc.Script() }));
  root.addOutput(out(certificate, 100000));
  root.addOutput(out(certificate, 100000));
  const options = { coinNftCodeHash: sha(certificate.toBuffer()), adminPubKeyHash: adminHash,
    tapeSize: 66 + metadata.length, controller: holder };
  const code = Coin.instantiateCode(options);
  const mint = new tbc.Transaction();
  if (sourceVin !== 0) input(mint, root, 1);
  input(mint, root, sourceVout);
  mint.addOutput(out(code, 500));
  mint.addOutput(out(Coin.buildTape({ amounts: amounts(1000n, sourceVin), tapeSize: options.tapeSize,
    lockTime, metadata }), 0));
  const tx = new tbc.Transaction();
  input(tx, mint, 0);
  tx.inputs[0].sequenceNumber = 0xfffffffe;
  tx.nLockTime = lockTime;
  tx.addOutput(out(Coin.replaceController(code, controller(recipient)), 500));
  tx.addOutput(out(Coin.setLockTime(mint.outputs[1].script, 0), 0));
  return { tx, mint, root, code, options, args: { currentTx: tx, inputIndex: 0, preTx: mint, preTxVout: 0,
    outputGroups: [{ codeVout: 0, tapeVout: 1 }], ancestorTransactions: [root], privateKey: owner } };
}
function execute(f, script = unlock(f.args), vin = 0) {
  // Use the SDK's public TBC entrypoint: Input.verify configures TBC number and
  // element sizes, whereas a bare Interpreter starts with Bitcoin's 4-byte cap.
  f.tx.inputs[vin].setScript(script);
  const log = console.log; console.log = () => {};
  let result;
  try { result = f.tx.verifyScript(vin); }
  finally { console.log = log; }
  assert.equal(result.success, true, result.error);
  return script;
}

test('Coin frozen template is 2981 bytes with immutable 34-byte identity', () => {
  const f = fixture();
  const d = Coin.parseCode(f.code);
  assert.equal(d.codeSize, 2981);
  assert.equal(d.identity.length, 34);
  assert(f.code.toBuffer().subarray(-14).equals(Buffer.from('COINTBC20CODE2')));
  assert(Coin.getCodeIdentity(Coin.replaceController(f.code, controller(recipient))).equals(d.identity));
  for (const change of [{ adminPubKeyHash: Buffer.alloc(20) }, { coinNftCodeHash: Buffer.alloc(32) }, { tapeSize: 71 }])
    assert(!Coin.getCodeIdentity(Coin.instantiateCode({ ...f.options, ...change })).equals(d.identity));
  const altered = f.code.toBuffer(); altered[0] ^= 1;
  assert.throws(() => Coin.parseCode(altered), /template/);
});

test('Coin variable metadata and lockTime use the tail, preserving exact Tape bytes', () => {
  for (const size of [66, 70, 100, 127]) {
    const metadata = size >= 70 ? Buffer.from('03414243', 'hex') : Buffer.alloc(0);
    const tape = Coin.buildTape({ tapeSize: size, amounts: amounts(), metadata, lockTime: 0xffffffff });
    const bytes = tape.toBuffer(), parsed = Coin.parseTape(tape, { tapeSize: size });
    assert.equal(bytes.length, size); assert.equal(bytes[size - 15], 4);
    assert.equal(bytes.readUInt32LE(size - 14), 0xffffffff);
    assert.equal(parsed.balance, 1000n); assert.equal(parsed.lockTime, 0xffffffff);
    assert(parsed.metadata.subarray(0, metadata.length).equals(metadata));
    assert(tbc.Script.fromBuffer(bytes).isSafeDataOut());
    const updated = Coin.replaceTapeAmounts(Coin.setLockTime(tape, 500), amounts(12n, 5));
    assert(Coin.parseTape(updated).metadata.equals(parsed.metadata));
    assert.equal(Coin.parseTape(updated).lockTime, 500);
    assert.deepEqual(Coin.parseTape(updated).amounts, amounts(12n, 5));
  }
  assert.throws(() => Coin.buildTape({ tapeSize: 66, amounts: amounts(1n << 63n), lockTime: 0 }), /signed-63/);
  assert.throws(() => Coin.buildTape({ tapeSize: 65, amounts: amounts(), lockTime: 0 }), /66-127/);
  assert.throws(() => Coin.buildTape({ tapeSize: 70, amounts: amounts(), lockTime: 0, metadata: Buffer.from('04ff', 'hex') }), /complete script pushes/);
  assert.throws(() => Coin.buildTape({ tapeSize: 66, amounts: amounts(), lockTime: 0x100000000 }), /unsigned 32/);
});

test('Coin owner transfer and its successor execute all 123 ABI fields', () => {
  const f = fixture({ lockTime: 100 });
  const script = execute(f);
  assert.equal(script.chunks.length, 123);
  f.tx.inputs[0].setScript(script);
  const next = new tbc.Transaction(); input(next, f.tx, 0);
  next.inputs[0].sequenceNumber = 0xfffffffe;
  next.addOutput(out(Coin.replaceController(f.tx.outputs[0].script, controller(owner)), 500));
  next.addOutput(out(f.tx.outputs[1].script, 0));
  execute({ tx: next, args: { currentTx: next, inputIndex: 0, preTx: f.tx, preTxVout: 0,
    outputGroups: [{ codeVout: 0, tapeVout: 1 }], ancestorTransactions: [f.mint], privateKey: recipient } });
});

test('Coin normal authorization supports height, timestamp and full unsigned lock boundaries', () => {
  for (const lockTime of [1, 499999999, 500000000, 0x7fffffff, 0x80000000, 0xffffffff]) {
    const f = fixture({ lockTime });
    execute(f);
    f.tx.nLockTime = lockTime - 1;
    assert.throws(() => unlock(f.args), /parent Coin lock|different height\/timestamp/);
  }
});

test('Coin parent ancestry retains physical vin slots after two empty amount slots', () => {
  const f = fixture();
  const middle = new tbc.Transaction(); input(middle, f.root, 0); input(middle, f.root, 1); input(middle, f.mint, 0);
  middle.inputs[2].sequenceNumber = 0xfffffffe;
  middle.addOutput(out(Coin.replaceController(f.code, controller(recipient)), 500));
  middle.addOutput(out(Coin.replaceTapeAmounts(f.mint.outputs[1].script, amounts(1000n, 2)), 0));
  execute({ tx: middle, args: { ...f.args, currentTx: middle, inputIndex: 2 } },
    unlock({ ...f.args, currentTx: middle, inputIndex: 2 }), 2);
  const tx = new tbc.Transaction(); input(tx, middle, 0); tx.inputs[0].sequenceNumber = 0xfffffffe;
  tx.addOutput(out(Coin.replaceController(f.code, controller(owner)), 500));
  tx.addOutput(out(f.mint.outputs[1].script, 0));
  execute({ tx, args: { ...f.args, currentTx: tx, preTx: middle, ancestorTransactions: [f.mint], privateKey: recipient } });
});

test('Coin x-only administrator can thaw before maturity, including when also the holder', () => {
  for (const holder of [controller(owner), Buffer.concat([hash160(admin.publicKey.toXOnly()), Buffer.from([0])]),
    Buffer.concat([Buffer.alloc(20, 0x19), Buffer.from([1])])]) {
    const f = fixture({ lockTime: 0xffffffff, holder });
    f.tx.nLockTime = 0;
    f.args.privateKey = admin;
    const script = execute(f);
    assert.equal(script.chunks[98].buf.length, 65);
    assert.equal(script.chunks[99].buf.length, 32);
    assert(script.chunks.slice(100, 107).every(c => c.opcodenum === 0));
    f.tx.inputs[0].sequenceNumber = 0xffffffff;
    assert.throws(() => unlock(f.args), /nonfinal/);
  }
});

test('Coin private-key builder prioritizes compressed administrator over x-only ownership', () => {
  const f = fixture({ lockTime: 0xffffffff, adminHash: hash160(admin.publicKey.toBuffer()),
    holder: Buffer.concat([hash160(admin.publicKey.toXOnly()), Buffer.from([0])]) });
  f.tx.nLockTime = 0; f.args.privateKey = admin;
  const script = execute(f);
  assert.equal(script.chunks[99].buf.length, 33);
  assert.notEqual(script.chunks[98].buf.length, 65);
});

test('Coin ordinary contract controller proof executes with Coin in physical vin 1', () => {
  const controlling = new tbc.Transaction();
  controlling.uncheckedAddInput(new tbc.Transaction.Input({ prevTxId: Buffer.alloc(32, 0x29), outputIndex: 0,
    sequenceNumber: 0xffffffff, script: new tbc.Script() }));
  controlling.addOutput(out(new tbc.Script().add(tbc.Opcode.OP_TRUE), 500));
  const holder = Buffer.concat([hash160(sha(controlling.outputs[0].script.toBuffer())), Buffer.from([1])]);
  const f = fixture({ holder, lockTime: 100 });
  const tx = new tbc.Transaction(); input(tx, controlling, 0); input(tx, f.mint, 0);
  tx.nLockTime = 100; tx.inputs[1].sequenceNumber = 0xfffffffe;
  tx.addOutput(out(Coin.replaceController(f.code, controller(recipient)), 500));
  tx.addOutput(out(Coin.buildTape({ amounts: amounts(1000n, 1), tapeSize: f.options.tapeSize, lockTime: 0,
    metadata: Coin.parseTape(f.mint.outputs[1].script).metadata }), 0));
  const args = { ...f.args, currentTx: tx, inputIndex: 1,
    contractController: { transaction: controlling, currentInputIndex: 0 } };
  execute({ tx, args }, unlock(args), 1);
  assert.throws(() => unlock({ ...args, contractController: undefined }), /explicit controlling-contract/);
  assert.throws(() => unlock({ ...args, contractController: { transaction: controlling, currentInputIndex: 1 } }), /own controlling/);
});

test('Coin rejects wrong owner, immature and cross-domain locks, and zero-lock final sequences', () => {
  const f = fixture({ lockTime: 100 });
  execute(f);
  assert.throws(() => unlock({ ...f.args, privateKey: recipient }), /Coin owner/);
  f.tx.nLockTime = 99;
  assert.throws(() => unlock(f.args), /parent Coin lock/);
  f.tx.nLockTime = 500000000;
  assert.throws(() => unlock(f.args), /different height\/timestamp/);
  const zero = fixture(); zero.tx.inputs[0].sequenceNumber = 0xffffffff;
  assert.throws(() => unlock(zero.args), /nonfinal/);
  assert.equal(Coin.getRequiredLockTime([0, 1, 100]), 100);
  assert.equal(Coin.getRequiredLockTime([0, 500000000, 0xffffffff]), 0xffffffff);
  assert.throws(() => Coin.getRequiredLockTime([100, 500000000]), /cannot combine/);
});

test('Coin rejects wrong issuance source, wrong output identity and amount inflation', () => {
  execute(fixture());
  for (const option of [{ sourceVout: 1 }, { sourceVin: 1 }]) {
    const f = fixture(option);
    f.tx.outputs[1].setScript(Coin.replaceTapeAmounts(f.tx.outputs[1].script, amounts()));
    assert.throws(() => unlock(f.args), /issuance source/);
  }
  const inflation = fixture();
  inflation.tx.outputs[1].setScript(Coin.replaceTapeAmounts(inflation.tx.outputs[1].script, amounts(1001n)));
  assert.throws(() => unlock(inflation.args), /conserve/);
  const identity = fixture();
  identity.tx.outputs[0].setScript(Coin.instantiateCode({ ...identity.options, adminPubKeyHash: Buffer.alloc(20) }));
  assert.throws(() => unlock(identity.args), /adminPubKeyHash/);
});

test('Coin WithSignature checks Schnorr public-key width and sighash flags', () => {
  const f = fixture(); f.args.privateKey = admin;
  const good = execute(f);
  const sig = Buffer.from(good.chunks[98].buf), publicKey = good.chunks[99].buf;
  execute(f, unlockSigned({ ...f.args, signature: sig, publicKey }));
  sig[64] = 0x42;
  assert.throws(() => unlockSigned({ ...f.args, signature: sig, publicKey }), /ending in 41/);
  assert.throws(() => unlockSigned({ ...f.args, signature: good.chunks[98].buf, publicKey: admin.publicKey }), /x-only/);
});
