'use strict';

// This suite tests Pool ABI/ancestry and executes the real Pool input. Auxiliary
// asset inputs are deliberately unsigned; full all-input lifecycles are tested
// by the PoolNFT3 integration suite, not claimed by these focused fixtures.
const test = require('node:test');
const assert = require('node:assert/strict');
const tbc = require('tbc-lib-js');
const TBC20 = require('../../lib/contract/tbc20.js');
const { buildPoolUnlockScript, getPoolOutputLayout, getPoolUnlockLeafCount } =
  require('../../lib/util/poolnft3/witness.js');
const { getTBC20PartialScriptData } = require('../../lib/util/tbc20/tbc20unlock.js');
const { instantiatePoolCode } = require('../../lib/util/poolnft3/artifacts.js');
const { POOL3_CODE_DUST } = require('../../lib/util/poolnft3/math.js');
const artifacts = {
  pool: require('../../lib/util/poolnft3/artifacts/pool.json'),
  locked: require('../../lib/util/poolnft3/artifacts/pool_hash_lock.json'),
  lp: require('../../lib/util/poolnft3/artifacts/ftlp_tbc20.json'),
};
const key = new tbc.PrivateKey('1'.padStart(64, '0'));
const stranger = new tbc.PrivateKey('2'.padStart(64, '0'));
const publicKey = key.publicKey.toBuffer();
const ownerHash = tbc.crypto.Hash.sha256ripemd160(publicKey);
const p2pkh = tbc.Script.buildPublicKeyHashOut(key.toAddress());
const cat = (...parts) => Buffer.concat(parts);
const sha = b => tbc.crypto.Hash.sha256(b);
const u64 = value => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(value)); return b; };
const u32 = value => { const b = Buffer.alloc(4); b.writeUInt32LE(value); return b; };
const E = Buffer.alloc(0);
const out = (amount, script) => new tbc.Transaction.Output({ satoshis: Number(amount), script });
const records = (tx, start = 0, end = tx.outputs.length) => cat(...tx.outputs.slice(start, end)
  .map(o => cat(u64(o.satoshis), sha(o.script.toBuffer()))));
const inputs = tx => cat(...tx.inputs.map(i => cat(Buffer.from(i.prevTxId).reverse(), u32(i.outputIndex), u32(i.sequenceNumber))));
const header = tx => cat(u32(tx.version), u32(tx.nLockTime), u32(tx.inputs.length), u32(tx.outputs.length));
const scriptHashes = tx => sha(cat(...tx.inputs.map(i => sha(i.script.toBuffer()))));
const inputHashes = tx => cat(sha(inputs(tx)), scriptHashes(tx));
const amountTape = slots => TBC20.buildTape(Array.from({ length: 6 }, (_, i) => BigInt(slots[i] || 0)));
function instantiate(artifact, values) {
  const hex = artifact.lock.hex.replace(/<self\.([^>]+)>/g, (_, placeholder) => {
    const [, name, width] = /^([A-Za-z]+)(\d+)$/.exec(placeholder);
    assert.equal(values[name].length, Number(width));
    return new tbc.Script().add(values[name]).toHex();
  });
  return tbc.Script.fromHex(hex);
}
function addInput(tx, parent, vout) {
  tx.from({ txId: parent.id, outputIndex: vout, script: parent.outputs[vout].script.toHex(),
    satoshis: parent.outputs[vout].satoshis });
}
function addPair(tx, code, slots) { tx.addOutput(out(500, code)); tx.addOutput(out(0, amountTape(slots))); }
function identity(code) {
  const p = getTBC20PartialScriptData(code);
  assert.equal(p.partialHash.length + p.size.length, 34);
  return cat(p.partialHash, p.size);
}
function signature(tx, signingKey = key) {
  const previous = tx.inputs[0].output;
  return tbc.Transaction.sighash.sign(tx, signingKey, 0x41, 0, previous.script, previous.satoshisBN).toTxFormat();
}
function scenario(option, { locked = false, tokenChange = false, tbcChange = false, first = false, zeroFee = true,
  sourceVout = 0, controllerKeys, controllerIndex = 0 } = {}) {
  const funding = new tbc.Transaction();
  funding.uncheckedAddInput(new tbc.Transaction.Input({ prevTxId: Buffer.alloc(32, 0x11), outputIndex: 0,
    sequenceNumber: 0xffffffff, script: new tbc.Script().add(tbc.Opcode.OP_1) }));
  for (let n = 0; n < 4; n++) funding.addOutput(out(10000000, p2pkh));
  const artifact = locked ? artifacts.locked : artifacts.pool;
  const poolCode = controllerKeys ? instantiatePoolCode({
    originalUTXO: cat(Buffer.from(funding.id, 'hex').reverse(), u32(sourceVout)),
    tbcFeeScriptHash: sha(p2pkh.toBuffer()), ftTapeSize: 61,
    authorization: { kind: 'controller', controllerPubKeyHashes: controllerKeys.map(k =>
      tbc.crypto.Hash.sha256ripemd160(k.publicKey.toBuffer()).toString('hex')) },
  }) : instantiate(artifact, { OriginalUTXO: cat(Buffer.from(funding.id, 'hex').reverse(), u32(sourceVout)),
    TbcFeeScriptHash: sha(p2pkh.toBuffer()), FtTapeSize: Buffer.from([61]), Controller: ownerHash });
  const poolHash = sha(poolCode.toBuffer());
  const userFt = TBC20.instantiateCode({ originalUTXO: { txId: funding.id, outputIndex: 1 },
    tapeSize: 61, controller: cat(ownerHash, Buffer.from([0])) });
  const poolFt = TBC20.replaceController(userFt, cat(tbc.crypto.Hash.sha256ripemd160(poolHash), Buffer.from([1])));
  const makeLp = hash => instantiate(artifacts.lp, { PoolCodeHash: poolHash, ConstTapeSize: Buffer.from([61]),
    Controller: cat(hash, Buffer.from([0])) });
  const lp = makeLp(ownerHash), burnLp = makeLp(Buffer.from('759d6677091e973b9e9d99f19c68fbf43e3f05f9', 'hex'));
  const tape = (L, A, T) => tbc.Script.fromBuffer(cat(Buffer.from('006a4c82', 'hex'), identity(lp), identity(userFt),
    u64(L), u64(A), u64(T), Buffer.alloc(38, 0x23), Buffer.from([8]), Buffer.from('POOLTAPE')));
  const old = first ? { L: 0n, A: 0n, T: 0n, V: POOL3_CODE_DUST }
    : { L: 100000n, A: 200000n, T: 100000n, V: 100000n + POOL3_CODE_DUST };
  const preTx = new tbc.Transaction(); addInput(preTx, funding, sourceVout);
  preTx.addOutput(out(old.V, poolCode)); preTx.addOutput(out(0, tape(old.L, old.A, old.T))); addPair(preTx, poolFt, [old.A]);
  const userTx = new tbc.Transaction(); addInput(userTx, funding, 1);
  addPair(userTx, option === 2 ? lp : userFt, [500000]);
  const tx = new tbc.Transaction(); addInput(tx, preTx, 0);
  if (option === 3) addInput(tx, funding, 2); else addInput(tx, userTx, 0);
  addInput(tx, preTx, 2);
  if (option !== 3) addInput(tx, funding, 2);
  let next, dA, dL, payment;
  const fee = zeroFee ? 0n : 10n;
  if (option === 1) {
    const dT = 10000n, newV = old.V + dT;
    dL = first ? dT : dT * old.L / (old.V - POOL3_CODE_DUST);
    dA = first ? 20000n : (old.A * dL + old.L - 1n) / old.L;
    next = { L: old.L + dL, A: old.A + dA, T: old.T + dT, V: newV };
  } else if (option === 2) {
    dL = 10000n; dA = 20000n; payment = 10000n;
    next = { L: old.L - dL, A: old.A - dA, T: old.T - payment, V: old.V - payment };
  } else if (option === 3) {
    const newT = old.T + 10000n;
    dA = old.A * 10000n / newT;
    const newA = old.A - dA;
    next = { ...old, A: newA, T: newT, V: old.V + 10001n };
  } else {
    dA = 10000n;
    const newT = old.T - old.T * dA / (old.A + dA), codeDecrease = old.T - newT - 1n;
    payment = codeDecrease - fee;
    next = { ...old, A: old.A + dA, T: newT, V: old.V - codeDecrease };
  }
  tx.addOutput(out(next.V, poolCode)); tx.addOutput(out(0, tape(next.L, next.A, next.T)));
  const feeOutput = () => tx.addOutput(out(fee, fee ? p2pkh : tbc.Script.fromHex('006a')));
  if (option === 1) {
    addPair(tx, poolFt, [0, dA, old.A]); addPair(tx, lp, [dL]);
    if (tokenChange) addPair(tx, userFt, [0, 500000n - dA]);
  } else if (option === 2) {
    tx.addOutput(out(payment, p2pkh)); addPair(tx, userFt, [0, 0, dA]); addPair(tx, burnLp, [0, dL]);
    addPair(tx, poolFt, [0, 0, next.A]);
    if (tokenChange) addPair(tx, lp, [0, 500000n - dL]);
  } else if (option === 3) {
    addPair(tx, userFt, [0, 0, dA]); feeOutput(); addPair(tx, poolFt, [0, 0, next.A]);
  } else {
    tx.addOutput(out(payment, p2pkh)); feeOutput(); addPair(tx, poolFt, [0, dA, old.A]);
    if (tokenChange) addPair(tx, userFt, [0, 500000n - dA]);
  }
  if (tbcChange) tx.addOutput(out(100, p2pkh));
  const args = { tx, preTx, prePreTx: funding, inputTxs: option === 3 ? [funding, preTx] : [userTx, preTx, funding], option };
  if (locked) {
    const signingKey = controllerKeys?.[controllerIndex] || key;
    args.signature = signature(tx, signingKey); args.publicKey = signingKey.publicKey.toBuffer();
  }
  return { args, artifact, poolCode, funding, userTx };
}
function verifyPool(fixture, unlock = buildPoolUnlockScript(fixture.args)) {
  const { tx } = fixture.args, previous = tx.inputs[0].output;
  const vm = new tbc.Script.Interpreter();
  const log = console.log; console.log = () => {};
  let ok;
  try { ok = vm.verify(unlock, previous.script, tx, 0, tbc.Script.Interpreter.DEFAULT_FLAGS, previous.satoshisBN); }
  finally { console.log = log; }
  return { ok: ok && vm.stack.length === 1 && vm.altstack.length === 0, error: vm.errstr,
    stack: vm.stack.length, alt: vm.altstack.length };
}
function push(script, value) {
  if (value.length === 1 && value[0] >= 1 && value[0] <= 16) script.add(tbc.Opcode.smallInt(value[0]));
  else script.add(value);
}
function expectedFromCompilerABI(fixture) {
  const { args, artifact } = fixture, { tx, preTx, prePreTx, inputTxs, option } = args;
  const names = ['', 'AddLP', 'RemoveLP', 'SwapToken', 'SwapTbc'];
  const describe = script => { const p = getTBC20PartialScriptData(script); return { SuffixData: p.suffixData, PartialHash: p.partialHash, Size: p.size }; };
  const output = (tx, v) => v === undefined ? { Value: E, LockingScript: { SuffixData: E, PartialHash: E, Size: E } }
    : { Value: u64(tx.outputs[v].satoshis), LockingScript: describe(tx.outputs[v].script) };
  const pair = (tx, v) => ({ Code: output(tx, v), Tape: v === undefined ? { Value: E, LockingScript: E }
    : { Value: u64(tx.outputs[v + 1].satoshis), LockingScript: tx.outputs[v + 1].script.toBuffer() } });
  const count = tx.outputs.length, base = option === 2 ? 9 : 6, hasPair = option !== 3 && count >= base + 2;
  const hasTbc = option === 3 ? count === 8 : (count - base) % 2 === 1;
  const ctx = { CodeValue: u64(tx.outputs[0].satoshis), CodeHash: sha(tx.outputs[0].script.toBuffer()),
    TapeValue: u64(0), TapeScript: tx.outputs[1].script.toBuffer(), TBC_Change: output(tx, hasTbc ? count - 1 : undefined) };
  if (option === 1) Object.assign(ctx, { FT_Pool: pair(tx, 2), FT_Lp: pair(tx, 4), FT_Change: pair(tx, hasPair ? 6 : undefined) });
  if (option === 2) Object.assign(ctx, { TBC: output(tx, 2), FT: pair(tx, 3), FT_Lp_Burn: pair(tx, 5),
    FT_Pool_Change: pair(tx, 7), FT_Lp_Change: pair(tx, hasPair ? 9 : undefined) });
  if (option === 3) Object.assign(ctx, { FT: pair(tx, 2), TBC_Fee: output(tx, 4), FT_Pool_Change: pair(tx, 5) });
  if (option === 4) Object.assign(ctx, { TBC: output(tx, 2), TBC_Fee: output(tx, 3), FT_Pool: pair(tx, 4), FT_Change: pair(tx, hasPair ? 6 : undefined) });
  const v = preTx.inputs[0].outputIndex;
  const data = { ctx: { [names[option]]: ctx }, sig: args.signature, publicKey: args.publicKey, inputsData: inputs(tx), option: Buffer.from([option]),
    prepreTX: { VLIO: header(prePreTx), InputsHashData: inputHashes(prePreTx), OutputsFirstPart: records(prePreTx, 0, v),
      CodeValue: u64(prePreTx.outputs[v].satoshis), CodeHash: sha(prePreTx.outputs[v].script.toBuffer()), OutputsLastPart: records(prePreTx, v + 1) },
    preTX: { VLIO: header(preTx), Inputs: inputs(preTx), UnlockingScriptHash: scriptHashes(preTx),
      CodeValue: u64(preTx.outputs[0].satoshis), CodeHash: sha(preTx.outputs[0].script.toBuffer()), TapeValue: u64(0),
      TapeScript: preTx.outputs[1].script.toBuffer(), OutputsLastPart: records(preTx, 2) } };
  data[option === 3 ? 'swapInputTX' : 'inputTX'] = inputTxs.map((parent, i) => {
    const vout = tx.inputs[i + 1].outputIndex;
    return { VLIO: header(parent), TxInputsHashData: inputHashes(parent), OutputsFirstPart: records(parent, 0, vout),
      OutputsMiddlePart: output(parent, vout), OutputsLastPart: records(parent, vout + 1) };
  });
  const script = new tbc.Script();
  for (const [, field] of artifact.unlock.main.matchAll(/<([^>]+)>/g)) {
    if (field.startsWith('ctx.') && !field.startsWith(`ctx.${names[option]}.`)) continue;
    if (field.startsWith(option === 3 ? 'inputTX[' : 'swapInputTX[')) continue;
    const path = field.replace(/\[0x([0-9a-f]+)\]/g, (_, h) => `.${parseInt(h, 16) === 0 ? 0 : parseInt(h, 16) - 0x50}`).split('.');
    const leaf = path.reduce((value, key) => value?.[key], data);
    assert(Buffer.isBuffer(leaf), field);
    push(script, leaf);
  }
  return script;
}

for (const locked of [false, true]) for (const option of [1, 2, 3, 4]) {
  for (const tokenChange of option === 3 ? [false] : [false, true]) for (const tbcChange of [false, true]) {
    test(`Pool witness option ${option}, locked=${locked}, tokenChange=${tokenChange}, tbcChange=${tbcChange}`, () => {
      const f = scenario(option, { locked, tokenChange, tbcChange });
      const before = f.args.tx.uncheckedSerialize(), unlock = buildPoolUnlockScript(f.args);
      assert.equal(unlock.chunks.length, getPoolUnlockLeafCount(option, locked));
      assert.equal(unlock.toHex(), expectedFromCompilerABI(f).toHex());
      assert.equal(f.args.tx.uncheckedSerialize(), before, 'builder is read-only');
      assert.deepEqual(verifyPool(f, unlock), { ok: true, error: '', stack: 1, alt: 0 });
    });
  }
}
test('first AddLP accepts FT increment different from TBC/LP increment', () => {
  for (const locked of [false, true]) assert.equal(verifyPool(scenario(1, { locked, first: true })).ok, true);
});
for (const option of [1, 2, 3, 4]) for (let count = 1; count <= 5; count++) {
  test(`whole Pool input option ${option} accepts every member of a ${count}-member whitelist`, () => {
    const controllerKeys = Array.from({ length: count }, (_, index) =>
      new tbc.PrivateKey((index + 10).toString(16).padStart(64, '0')));
    for (let controllerIndex = 0; controllerIndex < count; controllerIndex++) {
      const f = scenario(option, { locked: true, controllerKeys, controllerIndex });
      const unlock = buildPoolUnlockScript(f.args);
      assert.equal(unlock.chunks.length, getPoolUnlockLeafCount(option, true));
      assert.equal(unlock.toHex(), expectedFromCompilerABI(f).toHex());
      assert.equal(verifyPool(f, unlock).ok, true);
    }
  });
}
test('positive service-fee outputs retain their mandatory slots', () => {
  for (const option of [3, 4]) assert.equal(verifyPool(scenario(option, { zeroFee: false })).ok, true);
});
test('wrong array size/order, Pool vout, missing prevout, and missing ancestor are rejected', () => {
  const f = scenario(3);
  assert.throws(() => buildPoolUnlockScript({ ...f.args, inputTxs: [...f.args.inputTxs, f.funding] }), /exactly 2 inputTxs/);
  assert.throws(() => buildPoolUnlockScript({ ...f.args, inputTxs: f.args.inputTxs.slice().reverse() }), /supplied parent/);
  assert.throws(() => buildPoolUnlockScript({ ...f.args, prePreTx: f.userTx }), /supplied parent/);
  f.args.tx.inputs[0].outputIndex = 1;
  assert.throws(() => buildPoolUnlockScript(f.args), /metadata|Pool Code/);
  const other = scenario(1); other.args.tx.inputs[1].output = undefined;
  assert.throws(() => buildPoolUnlockScript(other.args), /missing authenticated/);
});
test('malformed authorization and unknown option are rejected before serialization', () => {
  const f = scenario(1);
  assert.throws(() => buildPoolUnlockScript({ ...f.args, signature: Buffer.alloc(0) }), /supplied together/);
  assert.throws(() => buildPoolUnlockScript({ ...f.args, signature: Buffer.alloc(0), publicKey }), /canonical DER/);
  assert.throws(() => buildPoolUnlockScript({ ...f.args, option: 0 }), /option must/);
  assert.throws(() => getPoolUnlockLeafCount(5), /option must/);
});
test('full ABI padding, wrong Controller, and changed output signature do not authorize Pool', () => {
  const f = scenario(1, { locked: true });
  const unlock = buildPoolUnlockScript(f.args), padded = new tbc.Script();
  padded.add(tbc.Opcode.OP_0); padded.add(unlock);
  assert.equal(verifyPool(f, padded).ok, false);
  assert.equal(verifyPool(f, buildPoolUnlockScript({ ...f.args, signature: signature(f.args.tx, stranger),
    publicKey: stranger.publicKey.toBuffer() })).ok, false);
  const replay = scenario(1, { locked: true, tbcChange: true });
  replay.args.tx.outputs.at(-1).satoshis += 1;
  assert.equal(verifyPool(replay).ok, false);
});
test('cached parent txid cannot hide mutated parent fields', () => {
  const f = scenario(1);
  void f.args.preTx.id;
  f.args.preTx.inputs[0].setScript(new tbc.Script().add(tbc.Opcode.OP_2));
  assert.throws(() => buildPoolUnlockScript(f.args), /supplied parent/);
});
test('nonzero genesis source vout and deserialized parents use their real ancestry positions', () => {
  const f = scenario(1, { first: true, sourceVout: 3 });
  f.args.preTx = new tbc.Transaction(f.args.preTx.uncheckedSerialize());
  f.args.prePreTx = new tbc.Transaction(f.args.prePreTx.uncheckedSerialize());
  f.args.inputTxs = f.args.inputTxs.map(tx => new tbc.Transaction(tx.uncheckedSerialize()));
  assert.equal(verifyPool(f).ok, true);
  assert.equal(buildPoolUnlockScript(f.args).toHex(), expectedFromCompilerABI(f).toHex());
});
test('layout count inference rejects extra outputs rather than silently ignoring them', () => {
  const f = scenario(3);
  assert.equal(getPoolOutputLayout(f.args.tx, 3).feeVout, 4);
  f.args.tx.addOutput(out(1, p2pkh)); f.args.tx.addOutput(out(1, p2pkh));
  assert.throws(() => getPoolOutputLayout(f.args.tx, 3), /7 or 8 outputs/);
});
