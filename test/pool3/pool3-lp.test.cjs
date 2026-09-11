'use strict';

// Offline LP contract tests. OP_TRUE is the trusted issuance fixture boundary;
// every LP input below executes the complete frozen production LP bytecode.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const tbc = require('tbc-lib-js');
const { FTLPTBC20: LP } = require('../../lib/contract/ftlpTbc20');
const { buildFTLPUnlockScript, buildFTLPUnlockScriptWithSignature } = require('../../lib/util/ftlpTbc20unlock');
const { getTBC20CurrentInputsData, buildTBC20UnlockScript } = require('../../lib/util/tbc20unlock');

const key = new tbc.PrivateKey('1'.padStart(64, '0'));
const other = new tbc.PrivateKey('2'.padStart(64, '0'));
const poolScript = tbc.Script.fromASM('OP_TRUE');
const poolCodeHash = tbc.crypto.Hash.sha256(poolScript.toBuffer());
const owner = privateKey => Buffer.concat([privateKey.toAddress().hashBuffer, Buffer.from([0])]);
const six = (...amounts) => [...amounts.map(BigInt), ...Array(6 - amounts.length).fill(0n)];
const out = (tx, satoshis, script) => tx.addOutput(new tbc.Transaction.Output({ satoshis, script }));
let nonce = 0;

function quiet(callback) {
  const log = console.log;
  console.log = () => {};
  try { return callback(); } finally { console.log = log; }
}

function verify(tx, vin, expected = true) {
  const vm = new tbc.Script.Interpreter();
  const previous = tx.inputs[vin].output;
  const ok = quiet(() => vm.verify(tx.inputs[vin].script, previous.script, tx, vin,
    tbc.Script.Interpreter.DEFAULT_FLAGS, previous.satoshisBN));
  assert.equal(ok, expected, `vin ${vin}: ${vm.errstr}`);
  if (ok) {
    assert.equal(vm.stack.length, 1);
    // The frozen LP bytecode deliberately is not rewritten by this SDK: its
    // return leaves vin and prefix identity in altstack (permitted by the VM).
    const isLP = previous.script.toBuffer().subarray(-12).equals(Buffer.from('LPTBC20CODE2'));
    assert.equal(vm.altstack.length, isLP ? 2 : 0);
  }
  return vm;
}

function signFee(tx, vin) {
  tx.inputs[vin].setScript(new tbc.Script().add(Buffer.from(tx.getSignature(vin, key), 'hex')).add(key.publicKey.toBuffer()));
}

function harness(timelocked = false, tapeSize = timelocked ? 66 : 61) {
  const chain = new Map();
  const register = tx => { chain.set(tx.id, tx); return tx; };
  function code(controller = owner(key), boundPool = poolCodeHash) {
    return LP.instantiateCode({ poolCodeHash: boundPool, tapeSize, controller, timelocked });
  }
  const tape = (amounts, lockTime = 0) => LP.buildTape({ amounts, tapeSize, timelocked, lockTime });
  function root() {
    const tx = new tbc.Transaction();
    tx.addDummyInput(poolScript, 2_000_000);
    tx.inputs[0].prevTxId = tbc.crypto.Hash.sha256(Buffer.from(`LP fixture ${nonce++}`));
    out(tx, 1_000_000, poolScript);
    out(tx, 100_000, tbc.Script.buildPublicKeyHashOut(key.toAddress()));
    return register(tx);
  }
  function issue(amount = 1000n, lockTime = 0, controller = owner(key), config = {}) {
    const source = root();
    const tx = new tbc.Transaction();
    tx.addInputFromPrevTx(source, config.sourceVout ?? 0);
    tx.addInputFromPrevTx(source, config.sourceVout === 1 ? 0 : 1);
    out(tx, 999_000, poolScript);
    out(tx, 500, code(controller, config.poolCodeHash ?? poolCodeHash));
    out(tx, 0, tape(config.slots ?? six(amount), lockTime));
    out(tx, 99_000, tbc.Script.buildPublicKeyHashOut(key.toAddress()));
    signFee(tx, config.sourceVout === 1 ? 0 : 1);
    verify(tx, 0); verify(tx, 1);
    register(tx);
    return { tx, vout: 1, amount };
  }
  function transfer(sources, allocations, options = {}) {
    const tx = new tbc.Transaction();
    if (options.contract) tx.addInputFromPrevTx(options.contract, 0);
    for (const source of sources) tx.addInputFromPrevTx(source.tx, source.vout);
    const funding = root();
    tx.addInputFromPrevTx(funding, 1);
    const groups = [];
    for (const allocation of allocations) {
      groups.push({ codeVout: tx.outputs.length, tapeVout: tx.outputs.length + 1 });
      out(tx, 500, allocation.code ?? code(allocation.controller ?? owner(key)));
      out(tx, 0, tape(allocation.slots, allocation.lockTime ?? 0));
    }
    groups.push({ codeVout: tx.outputs.length });
    out(tx, 98_000, tbc.Script.buildPublicKeyHashOut(key.toAddress()));
    tx.nLockTime = options.lockTime ?? 0;
    if (timelocked) sources.forEach((_, i) => { tx.inputs[i + (options.contract ? 1 : 0)].sequenceNumber = 0xfffffffe; });
    return { tx, groups, contract: options.contract };
  }
  function args(operation, vin, signingKey = key) {
    const input = operation.tx.inputs[vin];
    const preTx = chain.get(input.prevTxId.toString('hex'));
    return { currentTx: operation.tx, inputIndex: vin, preTx, preTxVout: input.outputIndex,
      outputGroups: operation.groups, ancestorTransactions: chain, privateKey: signingKey,
      ...(operation.contract ? { contractController: { transaction: operation.contract, currentInputIndex: 0 } } : {}) };
  }
  function sign(operation, vin = 0, signingKey = key) {
    operation.tx.inputs[vin].setScript(buildFTLPUnlockScript(args(operation, vin, signingKey)));
    signFee(operation.tx, operation.tx.inputs.length - 1);
    return operation;
  }
  return { chain, register, code, tape, root, issue, transfer, args, sign };
}

test('both frozen LP templates round-trip and changing only owner preserves identity', () => {
  for (const timelocked of [false, true]) {
    const h = harness(timelocked);
    const script = h.code();
    const parsed = LP.parseCode(script);
    assert.equal(parsed.timelocked, timelocked);
    assert.deepEqual(parsed.poolCodeHash, poolCodeHash);
    assert.equal(parsed.identity.length, 34);
    assert.equal((parsed.codeSize - 35) % 64, 0);
    assert.deepEqual(LP.instantiateCode(parsed).toBuffer(), script.toBuffer());
    const moved = LP.replaceController(script, owner(other));
    assert.deepEqual(LP.getCodeIdentity(moved), parsed.identity);
    assert.deepEqual(LP.parseCode(moved).controller, owner(other));
    const corrupt = Buffer.from(script.toBuffer()); corrupt[0] ^= 1;
    assert.throws(() => LP.parseCode(corrupt), /unsupported or modified/);
    assert.throws(() => LP.validateCode(script, { timelocked: !timelocked }), /timelocked/);
    assert.throws(() => LP.validateCode(script, { poolCodeHash: Buffer.alloc(32) }), /poolCodeHash/);
  }
  assert.notDeepEqual(harness().code().toBuffer(), harness(true).code().toBuffer());
});

test('LP Tape codecs enforce six bigint slots, correct padding and explicit uint32 lock fields', () => {
  for (const timelocked of [false, true]) {
    for (const tapeSize of [timelocked ? 66 : 61, 127]) {
      const amounts = six(1n, (1n << 63n) - 1n, 4n);
      const tape = LP.buildTape({ amounts, tapeSize, timelocked, lockTime: timelocked ? 0xffffffff : 0 });
      const parsed = LP.parseTape(tape, { tapeSize, timelocked });
      assert.deepEqual(parsed.amounts, amounts);
      assert.equal(parsed.balance, amounts.reduce((sum, value) => sum + value, 0n));
      assert.equal(parsed.lockTime, timelocked ? 0xffffffff : 0);
      if (timelocked) { assert.equal(tape.toBuffer()[51], 4); assert.equal(tape.toBuffer().readUInt32LE(52), 0xffffffff); }
    }
  }
  const base = { amounts: six(), tapeSize: 66, timelocked: true };
  assert.throws(() => LP.buildTape(base), /lockTime/);
  for (const lockTime of [-1, 0x100000000, 0.5, NaN]) assert.throws(() => LP.buildTape({ ...base, lockTime }), /lockTime/);
  assert.throws(() => LP.buildTape({ ...base, tapeSize: 61, lockTime: 0 }), /66-127/);
  assert.throws(() => LP.buildTape({ ...base, tapeSize: 128, lockTime: 0 }), /66-127/);
  assert.throws(() => LP.buildTape({ ...base, amounts: six(1n << 63n), lockTime: 0 }), /signed-63/);
  const corrupt = LP.buildTape({ ...base, lockTime: 0 }).toBuffer(); corrupt[51] = 3;
  assert.throws(() => LP.parseTape(corrupt, { timelocked: true }), /offset 51/);
  const padding = LP.buildTape({ ...base, tapeSize: 67, lockTime: 0 }).toBuffer(); padding[56] = 1;
  assert.throws(() => LP.parseTape(padding, { timelocked: true }), /padding/);
});

for (const timelocked of [false, true]) {
  test(`${timelocked ? 'timelocked' : 'ordinary'} LP issuance, owner transfer, merge and burn/change execute full scripts`, () => {
    const h = harness(timelocked);
    const first = h.issue(1000n, timelocked ? 100 : 0);
    const second = h.issue(700n, timelocked ? 150 : 0);
    const a = h.sign(h.transfer([first], [{ slots: six(1000), controller: owner(other) }], { lockTime: timelocked ? 100 : 0 }));
    assert.equal(a.tx.inputs[0].script.chunks.length, 123);
    verify(a.tx, 0); verify(a.tx, 1); h.register(a.tx);
    const merged = h.transfer([{ tx: a.tx, vout: 0 }, second], [{ slots: six(1000, 700) }], { lockTime: timelocked ? 150 : 0 });
    h.sign(merged, 0, other); h.sign(merged, 1);
    [0, 1, 2].forEach(vin => verify(merged.tx, vin)); h.register(merged.tx);
    const eater = Buffer.concat([tbc.Address.fromString('1BitcoinEaterAddressDontSendf59kuE').hashBuffer, Buffer.from([0])]);
    const burned = h.sign(h.transfer([{ tx: merged.tx, vout: 0 }], [
      { slots: six(600), controller: eater }, { slots: six(1100) },
    ]));
    verify(burned.tx, 0); h.register(burned.tx);
    const next = h.sign(h.transfer([{ tx: burned.tx, vout: 2 }], [{ slots: six(1100) }]));
    verify(next.tx, 0);
  });
}

test('LP source validation rejects another Pool, issuance outside vin0/vout0 and missing ancestry', () => {
  for (const config of [
    { poolCodeHash: Buffer.alloc(32, 7) }, { sourceVout: 1 }, { slots: six(0, 1000) },
  ]) {
    const h = harness();
    const issued = h.issue(1000n, 0, owner(key), config);
    const operation = h.transfer([issued], [{ slots: six(1000), code: issued.tx.outputs[1].script }]);
    assert.throws(() => h.sign(operation), /authorized Pool issuance source/);
  }
  const h = harness(); const issued = h.issue();
  const op = h.transfer([issued], [{ slots: six(1000) }]);
  const options = h.args(op, 0); options.ancestorTransactions = new Map();
  assert.throws(() => buildFTLPUnlockScript(options), /missing or mismatched LP ancestor/);
});

test('per-input slot conservation and owner checks reject invalid LP builders', () => {
  const h = harness(); const issued = h.issue();
  for (const slots of [six(999), six(1001), six(0, 1000)]) {
    assert.throws(() => h.sign(h.transfer([issued], [{ slots }])), /conserve/);
  }
  const op = h.transfer([issued], [{ slots: six(1000) }]);
  assert.throws(() => h.sign(op, 0, other), /LP owner/);
  const wrongCode = h.code(owner(key), Buffer.alloc(32, 3));
  assert.throws(() => h.sign(h.transfer([issued], [{ slots: six(1000), code: wrongCode }])), /poolCodeHash/);
  const wrongParent = h.args(op, 0); wrongParent.preTxVout = 0;
  assert.throws(() => buildFTLPUnlockScript(wrongParent), /specified parent/);
  assert.throws(() => buildTBC20UnlockScript(h.args(op, 0)), /TBC20CODE2/);
});

test('locked LP enforces domain, every LP sequence and maximum compatible lock', () => {
  assert.equal(LP.getRequiredLockTime([0, 100, 200]), 200);
  assert.equal(LP.getRequiredLockTime([0, 0x80000000, 0xffffffff]), 0xffffffff);
  assert.throws(() => LP.getRequiredLockTime([100, 500000000]), /cannot combine/);
  const h = harness(true); const issued = h.issue(1000n, 100);
  for (const lockTime of [99, 500000000]) {
    assert.throws(() => h.sign(h.transfer([issued], [{ slots: six(1000) }], { lockTime })), /lock|domains/);
  }
  const op = h.transfer([issued], [{ slots: six(1000) }], { lockTime: 100 });
  op.tx.inputs[0].sequenceNumber = 0xffffffff; op.tx.inputs[1].sequenceNumber = 0xfffffffe;
  assert.throws(() => h.sign(op), /nonfinal/);
  const zero = h.issue(1000n, 0); const unlocked = h.transfer([zero], [{ slots: six(1000) }]);
  unlocked.tx.inputs[0].sequenceNumber = 0xffffffff;
  assert.throws(() => h.sign(unlocked), /including zero/);
});

test('actual LP bytecode rejects early/final-sequence spends with fresh valid signatures', () => {
  const h = harness(true); const issued = h.issue(1000n, 200);
  const op = h.sign(h.transfer([issued], [{ slots: six(1000) }], { lockTime: 200 }));
  verify(op.tx, 0);
  const validWitness = op.tx.inputs[0].script.toBuffer();
  for (const [lockTime, sequence] of [[199, 0xfffffffe], [200, 0xffffffff], [500000000, 0xfffffffe]]) {
    op.tx.nLockTime = lockTime; op.tx.inputs[0].sequenceNumber = sequence;
    const chunks = tbc.Script.fromBuffer(validWitness).chunks.slice();
    chunks[48] = new tbc.Script().add(getTBC20CurrentInputsData(op.tx)).chunks[0];
    const freshSignature = Buffer.from(op.tx.getSignature(0, key), 'hex');
    chunks[98] = new tbc.Script().add(freshSignature).chunks[0];
    const witness = tbc.Script.fromChunks(chunks);
    assert.deepEqual(tbc.Script.fromBuffer(witness.toBuffer()).chunks[98].buf, freshSignature);
    op.tx.inputs[0].setScript(witness);
    const vm = verify(op.tx, 0, false);
    assert.notEqual(vm.errstr, 'SCRIPT_ERR_MINIMALDATA');
  }
});

test('mature LP may be relocked, then zeroed without changing its locked Code identity', () => {
  const h = harness(true); const issued = h.issue(1000n, 100);
  const relock = h.sign(h.transfer([issued], [{ slots: six(1000), lockTime: 200 }], { lockTime: 100 }));
  verify(relock.tx, 0); h.register(relock.tx);
  const reset = h.sign(h.transfer([{ tx: relock.tx, vout: 0 }], [{ slots: six(1000), lockTime: 0 }], { lockTime: 200 }));
  verify(reset.tx, 0); h.register(reset.tx);
  assert.equal(LP.parseTape(reset.tx.outputs[1].script, { timelocked: true }).lockTime, 0);
  assert.equal(LP.parseCode(reset.tx.outputs[0].script).timelocked, true);
  const spent = h.sign(h.transfer([{ tx: reset.tx, vout: 0 }], [{ slots: six(1000) }]));
  verify(spent.tx, 0);
});

test('contract-controlled LP requires the controlling input and cannot bypass lock maturity', () => {
  const h = harness(true); const contract = h.root();
  const hash = tbc.crypto.Hash.sha256ripemd160(poolCodeHash);
  const issued = h.issue(1000n, 100, Buffer.concat([hash, Buffer.from([1])]));
  const early = h.transfer([issued], [{ slots: six(0, 1000) }], { contract, lockTime: 99 });
  assert.throws(() => h.sign(early, 1), /parent LP lock/);
  const op = h.transfer([issued], [{ slots: six(0, 1000) }], { contract, lockTime: 100 });
  const missing = h.args(op, 1); delete missing.contractController;
  assert.throws(() => buildFTLPUnlockScript(missing), /explicit controlling-contract/);
  h.sign(op, 1); [0, 1, 2].forEach(vin => verify(op.tx, vin));
});

test('signature entry point preserves ABI and rejects unsupported signature policies', () => {
  const h = harness(); const issued = h.issue(); const op = h.transfer([issued], [{ slots: six(1000) }]);
  const args = h.args(op, 0);
  const signature = Buffer.from(op.tx.getSignature(0, key), 'hex');
  const explicit = { ...args, signature, publicKey: key.publicKey.toBuffer() };
  assert.equal(buildFTLPUnlockScriptWithSignature(explicit).chunks.length, 123);
  const modified = Buffer.from(signature); modified[modified.length - 1] = 0x42;
  assert.throws(() => buildFTLPUnlockScriptWithSignature({ ...explicit, signature: modified }), /0x41/);
  assert.throws(() => buildFTLPUnlockScriptWithSignature({ ...explicit, signature: Buffer.alloc(0) }), /DER/);
});
