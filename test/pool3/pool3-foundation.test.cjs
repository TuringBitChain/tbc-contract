'use strict';

// Offline only: npm run build && node --test test/pool3/pool3-foundation.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const tbc = require('tbc-lib-js');
const artifacts = require('../../lib/util/poolnft3/artifacts');
const auth = require('../../lib/util/poolnft3/authorization');
const tape = require('../../lib/util/poolnft3/tape');
const math = require('../../lib/util/poolnft3/math');
const fees = require('../../lib/util/poolnft3/fees');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const keys = Array.from({ length: 6 }, (_, i) => new tbc.PrivateKey(String(i + 1).padStart(64, '0')));
const hashes = keys.map(key => key.toAddress().hashBuffer.toString('hex'));
const parameters = authorization => ({ originalUTXO: Buffer.from('01'.repeat(32) + '03000000', 'hex'),
  tbcFeeScriptHash: fees.deriveFeeRecipient(fees.resolveSwapFeePolicy().serviceFeeAddress).feeScriptHash32,
  ftTapeSize: 66, authorization });
const fields = (locked = false, timed = false) => ({ ftLpPartialHash: Buffer.alloc(32, 0x11), ftLpCodeSize: 2659,
  ftAPartialHash: Buffer.alloc(32, 0x22), ftACodeSize: 2660, ftLpAmount: 3n, ftAAmount: 5n, tbcAmount: 7n,
  ftAContractId: '0123456789abcdef'.repeat(4), serviceFeeRate: 35, lpPlan: 1,
  withSwapHashLock: locked, withLpLocktime: timed, withLpHashLock: locked });
const initial = { ftLpAmount: 0n, ftAAmount: 0n, tbcAmount: 0n, poolValue: 1500n };
const funded = { ftLpAmount: 100000000n, ftAAmount: 200000000n, tbcAmount: 100000000n, poolValue: 100001500n };

test('frozen JSON and template checksums match the published manifest', () => {
  assert.equal(artifacts.POOL3_ARTIFACT_MANIFEST.sourceCommit, null);
  assert.equal(artifacts.POOL3_ARTIFACT_MANIFEST.sourceRevision, 'worktree');
  assert.match(artifacts.POOL3_ARTIFACT_MANIFEST.sourceBaseCommit, /^[0-9a-f]{40}$/);
  assert.deepEqual(artifacts.POOL3_ARTIFACT_MANIFEST.sourceChanges, ['src/pool_hash_lock.ct']);
  for (const name of ['pool', 'pool_hash_lock', 'ftlp_tbc20', 'ftlp_tbc20_locktime']) {
    const artifact = artifacts.getPool3Artifact(name);
    const manifest = artifacts.POOL3_ARTIFACT_MANIFEST.artifacts[name];
    const bytes = fs.readFileSync(path.join(__dirname, '../../lib/util/poolnft3/artifacts', name + '.json'));
    assert.equal(sha(bytes), manifest.artifactSha256);
    assert.equal(sha(JSON.stringify(artifact)), manifest.canonicalArtifactSha256);
    assert.equal(sha(artifact.lock.hex), manifest.templateSha256);
    assert.equal(artifact.metadata.git_commit_hash, artifacts.POOL3_ARTIFACT_MANIFEST.compiler.commit);
    assert(Object.isFrozen(artifact.lock));
    assert(Object.isFrozen(artifact.constructorParams));
  }
  assert.throws(() => artifacts.getPool3Artifact('constructor'), /unknown artifact/);
});

test('ordinary and 1-5-controller Pool templates round-trip all supported Tape sizes', () => {
  for (const size of [61, 66, 127]) {
    for (let count = 0; count <= 5; count++) {
      const authorization = count === 0 ? { kind: 'public' } : { kind: 'controller', controllerPubKeyHashes: hashes.slice(0, count) };
      const params = { ...parameters(authorization), ftTapeSize: size };
      const code = artifacts.instantiatePoolCode(params);
      const parsed = artifacts.parsePoolCode(code);
      const template = artifacts.POOL3_ARTIFACT_MANIFEST.artifacts[count === 0 ? 'pool' : 'pool_hash_lock'];
      assert.equal(code.toBuffer().length, template.codeBytes + 27 * Math.max(0, count - 1));
      assert.deepEqual(parsed.originalUTXO, params.originalUTXO);
      assert.deepEqual(parsed.tbcFeeScriptHash, params.tbcFeeScriptHash);
      assert.equal(parsed.ftTapeSize, size);
      assert.equal(parsed.poolCodeHash.toString('hex'), sha(code.toBuffer()));
      assert.deepEqual(parsed.authorization, auth.normalizePoolAuthorization(authorization));
      assert.deepEqual(artifacts.instantiatePoolCode(parsed).toBuffer(), code.toBuffer());
    }
  }
});

test('single controller is byte-identical to the unexpanded compiler template', () => {
  const params = parameters({ kind: 'controller', controllerPubKeyHashes: [hashes[0]] });
  const raw = artifacts.getPool3Artifact('pool_hash_lock').lock.hex
    .replaceAll('<self.OriginalUTXO36>', '24' + params.originalUTXO.toString('hex'))
    .replaceAll('<self.TbcFeeScriptHash32>', '20' + params.tbcFeeScriptHash.toString('hex'))
    .replaceAll('<self.FtTapeSize1>', '0142').replaceAll('<self.Controller20>', '14' + hashes[0]);
  assert.equal(artifacts.instantiatePoolCode(params).toHex(), raw);
});

test('whitelist generation is canonical, does not mutate inputs, and binds final Code hashes', () => {
  const input = hashes.slice(0, 5).reverse().map(hash => hash.toUpperCase());
  const before = [...input];
  const one = artifacts.instantiatePoolCode(parameters({ kind: 'controller', controllerPubKeyHashes: input }));
  const two = artifacts.instantiatePoolCode(parameters({ kind: 'controller', controllerPubKeyHashes: hashes.slice(0, 5) }));
  assert.deepEqual(input, before);
  assert.equal(one.toHex(), two.toHex());
  const changed = artifacts.instantiatePoolCode(parameters({ kind: 'controller', controllerPubKeyHashes: hashes.slice(1, 6) }));
  assert.notEqual(sha(one.toBuffer()), sha(changed.toBuffer()));
  for (const invalid of [[], hashes, [hashes[0], hashes[0].toUpperCase()], ['gg'.repeat(20)], ['aa'.repeat(19)], [keys[0].publicKey.toString()]]) {
    assert.throws(() => auth.normalizeControllerPubKeyHashes(invalid));
  }
  assert.throws(() => auth.normalizePoolAuthorization({ kind: 'public', controllerPubKeyHashes: [] }));
  assert.throws(() => auth.normalizePoolAuthorization({ kind: 'arbitrary' }));
});

test('template parser rejects changed body, inconsistent constructors, noncanonical branches and extra data', () => {
  const params = parameters({ kind: 'controller', controllerPubKeyHashes: hashes.slice(0, 3) });
  const code = artifacts.instantiatePoolCode(params).toBuffer();
  const mutations = [Buffer.concat([code, Buffer.from('51', 'hex')]), Buffer.from(code)];
  mutations[1][0] ^= 1;
  const hex = code.toString('hex');
  const singleTapeChanged = hex.replace('0142', '0143');
  mutations.push(Buffer.from(singleTapeChanged, 'hex'));
  const canonical = auth.normalizeControllerPubKeyHashes(hashes.slice(0, 3));
  const member = auth.buildControllerMembershipScript(canonical).toString('hex');
  mutations.push(Buffer.from(hex.replace(member, member.replace('14' + canonical[0], '4c14' + canonical[0])), 'hex'));
  mutations.push(Buffer.from(hex.replace(member, member.replace('14' + canonical[0], '14' + canonical[1])), 'hex'));
  mutations.push(Buffer.from(hex.replace(member, member + '51'), 'hex'));
  mutations.push(Buffer.from(hex.replace('ad516a09504f4f4c434f444532', '75516a09504f4f4c434f444532'), 'hex'));
  for (const bytes of mutations) assert.throws(() => artifacts.parsePoolCode(bytes), /supported canonical/);
  assert.throws(() => artifacts.instantiatePoolCode({ ...params, tbcFeeScriptHash: Buffer.alloc(20) }), /32 bytes/);
  for (const size of [0, 60, 128, 1.5]) assert.throws(() => artifacts.instantiatePoolCode({ ...params, ftTapeSize: size }));
});

function checkAuth(memberHashes, key, options = {}) {
  const lock = auth.buildControllerAuthorizationScript(memberHashes).add(tbc.Opcode.OP_1);
  const tx = new tbc.Transaction();
  tx.version = 10;
  tx.from({ txId: '11'.repeat(32), outputIndex: 0, script: lock.toHex(), satoshis: 10000 });
  tx.addOutput(new tbc.Transaction.Output({ script: tbc.Script.buildPublicKeyHashOut(key.toAddress()), satoshis: 9000 }));
  const signature = options.emptySignature ? Buffer.alloc(0) : tbc.Transaction.sighash.sign(tx, options.signatureKey || key, 0x41, 0, lock, tx.inputs[0].output.satoshisBN).toTxFormat();
  if (options.changeOutput) tx.outputs[0].satoshis = 8999;
  const unlock = new tbc.Script().add(signature).add(options.emptyPublicKey ? Buffer.alloc(0) : key.publicKey.toBuffer());
  const vm = new tbc.Script.Interpreter();
  const log = console.log;
  console.log = () => {};
  let ok;
  try { ok = vm.verify(unlock, lock, tx, 0, tbc.Script.Interpreter.DEFAULT_FLAGS, tx.inputs[0].output.satoshisBN); }
  finally { console.log = log; }
  return { ok, vm };
}
for (let count = 1; count <= 5; count++) {
  test(`${count}-member whitelist executes every member path and rejects invalid authorizations`, () => {
    const whitelist = hashes.slice(0, count);
    assert.equal(auth.buildControllerAuthorizationScript(whitelist).toBuffer().length, 25 + 27 * (count - 1));
    assert.deepEqual(auth.parseControllerMembershipScript(auth.buildControllerMembershipScript(whitelist)), [...whitelist].sort());
    for (const key of keys.slice(0, count)) {
      auth.assertPoolControllerPublicKey({ kind: 'controller', controllerPubKeyHashes: whitelist }, key.publicKey);
      const { ok, vm } = checkAuth(whitelist, key);
      assert(ok, vm.errstr);
      assert.deepEqual(vm.stack.stack, [Buffer.from([1])]);
      assert.deepEqual(vm.altstack.stack, []);
    }
    for (const [key, options] of [[keys[5], {}], [keys[0], { signatureKey: keys[5] }], [keys[0], { emptySignature: true }], [keys[0], { emptyPublicKey: true }], [keys[0], { changeOutput: true }]]) {
      assert.equal(checkAuth(whitelist, key, options).ok, false);
    }
    assert.throws(() => auth.assertPoolControllerPublicKey({ kind: 'controller', controllerPubKeyHashes: whitelist }, keys[5].publicKey), /not a member/);
  });
}

test('143-byte Tape offsets, flags, display txid and uint16LE fee are exact', () => {
  for (const locked of [false, true]) for (const timed of [false, true]) {
    const input = fields(locked, timed);
    const encoded = tape.encodePoolTape(input);
    assert.equal(encoded.length, 143);
    assert.equal(encoded.subarray(0, 4).toString('hex'), '006a4c82');
    assert.deepEqual(encoded.subarray(4, 36), input.ftLpPartialHash);
    assert.equal(encoded.subarray(36, 38).toString('hex'), '630a');
    assert.deepEqual(encoded.subarray(38, 70), input.ftAPartialHash);
    assert.equal(encoded.readUInt16LE(70), input.ftACodeSize);
    assert.equal(encoded.readBigUInt64LE(72), input.ftLpAmount);
    assert.equal(encoded.readBigUInt64LE(80), input.ftAAmount);
    assert.equal(encoded.readBigUInt64LE(88), input.tbcAmount);
    assert.equal(encoded.subarray(96, 128).toString('hex'), input.ftAContractId);
    assert.equal(encoded.subarray(128, 131).toString('hex'), '230001');
    assert.deepEqual([...encoded.subarray(131, 134)], [Number(locked), Number(timed), Number(locked)]);
    assert.equal(encoded.subarray(134).toString('hex'), '08504f4f4c54415045');
    const decoded = tape.decodePoolTape(encoded);
    assert.equal(decoded.suffixData.length, 38);
    assert.deepEqual(tape.encodePoolTape(decoded), encoded);
    const changed = tape.replacePoolTapeAmounts(encoded, { ftLpAmount: 10n, ftAAmount: 20n, tbcAmount: 30n });
    tape.assertPoolTapeConfigurationUnchanged(encoded, changed);
    assert.deepEqual(tape.decodePoolTape(changed).suffixData, decoded.suffixData);
    const extraKeys = tape.replacePoolTapeAmounts(encoded, { ftLpAmount: 10n, ftAAmount: 20n, tbcAmount: 30n, serviceFeeRate: 0, ftAContractId: 'ff'.repeat(32) });
    assert.deepEqual(extraKeys, changed);
  }
});

test('Pool Tape uses push-only data after OP_FALSE OP_RETURN and rejects the obsolete OP_SIZE framing', () => {
  const encoded = tape.encodePoolTape(fields());
  const script = tbc.Script.fromBuffer(encoded);
  assert.equal(script.chunks.length, 4);
  assert.equal(script.chunks[0].opcodenum, tbc.Opcode.OP_FALSE);
  assert.equal(script.chunks[1].opcodenum, tbc.Opcode.OP_RETURN);
  assert.equal(script.chunks[2].opcodenum, tbc.Opcode.OP_PUSHDATA1);
  assert.equal(script.chunks[2].buf.length, 130);
  assert.deepEqual(script.chunks[2].buf, encoded.subarray(4, 134));
  assert.equal(script.chunks[3].buf.toString('ascii'), 'POOLTAPE');
  const data = tbc.Script.fromBuffer(encoded.subarray(2));
  assert.equal(data.isPushOnly(), true);
  assert.equal(script.isSafeDataOut(), true);
  assert.deepEqual(tape.encodePoolTape(tape.decodePoolTape(script)), encoded);
  const obsolete = Buffer.concat([Buffer.from('006a82', 'hex'), encoded.subarray(4)]);
  assert.equal(obsolete.length, 142);
  assert.throws(() => tape.decodePoolTape(obsolete), /143 bytes/);
  // OP_PUSHDATA2 is push-only but still fails the exact canonical contract header.
  const nonminimal = Buffer.concat([Buffer.from('006a4d8200', 'hex'), encoded.subarray(4)]);
  assert.equal(tbc.Script.fromBuffer(nonminimal.subarray(2)).isPushOnly(), true);
  assert.throws(() => tape.decodePoolTape(nonminimal), /canonical/);
});

test('Tape parser rejects truncation, padding, invalid headers, invalid flags and signed high-bit amounts', () => {
  const encoded = tape.encodePoolTape(fields());
  const mutants = [encoded.subarray(0, 142), Buffer.concat([encoded, Buffer.from([0])])];
  for (const [offset, value] of [[2, 0x82], [3, 0x81], [131, 2], [132, 2], [133, 1], [134, 9], [36, 0], [37, 0]]) {
    const bytes = Buffer.from(encoded); bytes[offset] = value;
    // An individual valid code-size change is not a framing violation.
    if (offset === 36 || offset === 37) bytes[36] = bytes[37] = 0;
    mutants.push(bytes);
  }
  const signed = Buffer.from(encoded); signed.writeBigUInt64LE(1n << 63n, 72); mutants.push(signed);
  for (const bytes of mutants) assert.throws(() => tape.decodePoolTape(bytes));
  assert.throws(() => tape.encodePoolTape({ ...fields(), ftAAmount: -1n }));
  assert.throws(() => tape.encodePoolTape({ ...fields(), tbcAmount: 1n << 63n }));
  const changedConfig = tape.encodePoolTape({ ...fields(), serviceFeeRate: 135 });
  assert.throws(() => tape.assertPoolTapeConfigurationUnchanged(encoded, changedConfig), /cannot change/);
});

test('all Pool variants reject extra bytes between the state and marker even with valid framing at both ends', () => {
  for (const locked of [false, true]) for (const timed of [false, true]) {
    const encoded = tape.encodePoolTape(fields(locked, timed));
    const padded = Buffer.concat([encoded.subarray(0, 134), Buffer.from([0]), encoded.subarray(134)]);
    assert.equal(padded.length, 144);
    assert.deepEqual(padded.subarray(0, 134), encoded.subarray(0, 134));
    assert.deepEqual(padded.subarray(-9), encoded.subarray(-9));
    assert.throws(() => tape.decodePoolTape(padded), /exactly 143 bytes/);
    assert.throws(() => tape.decodePoolTape(tbc.Script.fromBuffer(padded)), /exactly 143 bytes/);
  }
});

test('AddLP preserves first-mint FT input and prices subsequent LP against old reserves', () => {
  const first = math.quoteAddLP(initial, 100000000n, 200000000n);
  assert(first.isFirstAddLP);
  assert.equal(first.ftLpIncrementRaw, 100000000n);
  assert.equal(first.ftAIncrementRaw, 200000000n);
  assert.equal(first.tbcReserveIncrementSat, 100000000n);
  assert.deepEqual(first.nextState, funded);
  const lower = math.quoteAddLP(funded, 100000000n);
  assert.equal(lower.ftLpIncrementRaw, 100000000n);
  assert.equal(lower.ftAIncrementRaw, 200000000n);
  const upper = math.quoteAddLP(funded, 200000000n);
  assert.equal(upper.ftLpIncrementRaw, 200000000n);
  assert.equal(upper.ftAIncrementRaw, 400000000n);
  assert.equal(Object.hasOwn(upper, 'ratio'), false);
  assert.throws(() => math.quoteAddLP(initial, 1n), /initial FT/);
  assert.equal(math.quoteAddLP(funded, 1n).ftLpIncrementRaw, 1n);
  assert.throws(() => math.quoteAddLP(initial, 0n, 10n));
  assert.throws(() => math.quoteAddLP({ ...initial, poolValue: 1501n }, 1n, 10n), /exactly 1500 sat/);
  assert.throws(() => math.quoteAddLP(funded, 100n, 10n), /only accepted/);
});

test('AddLP single-asset budgets buy the same LP with unused budget excluded from Pool outputs', () => {
  const state = { ftLpAmount: 100n, ftAAmount: 200n, tbcAmount: 100n, poolValue: 1720n };
  const byTbc = math.quoteAddLP(state, { incrementSat: 24n });
  const byFt = math.quoteAddLP(state, { incrementFtRaw: 21n });
  assert.deepEqual(byTbc, byFt);
  assert.equal(byTbc.ftLpIncrementRaw, 10n);
  assert.equal(byTbc.tbcIncrementSat, 22n);
  assert.equal(byTbc.ftAIncrementRaw, 20n);
  assert.equal(byTbc.tbcReserveIncrementSat, 10n);
  assert.deepEqual(byTbc.nextState, { ftLpAmount: 110n, ftAAmount: 220n, tbcAmount: 110n, poolValue: 1742n });
  assert.equal(24n - byTbc.tbcIncrementSat, 2n, 'TBC budget remainder is not donated');
  assert.equal(21n - byFt.ftAIncrementRaw, 1n, 'FT budget remainder is not donated');
  assert.deepEqual(math.quoteAddLP(state, 24n), byTbc, 'legacy bigint input is a TBC budget');
});

test('AddLP charges for retained-fee rights without feeding the entire payment into pricing reserves', () => {
  const state = { ftLpAmount: 100n, ftAAmount: 100n, tbcAmount: 100n, poolValue: 1610n };
  const q = math.quoteAddLP(state, { incrementSat: 11n });
  assert.deepEqual(q, math.quoteAddLP(state, { incrementFtRaw: 10n }));
  assert.equal(q.ftLpIncrementRaw, 10n);
  assert.equal(q.tbcReserveIncrementSat, 10n);
  assert.equal(q.nextState.poolValue - 1500n - q.nextState.tbcAmount, 11n);
  assert.equal((q.nextState.poolValue - 1500n - q.nextState.tbcAmount) * state.ftLpAmount,
    (state.poolValue - 1500n - state.tbcAmount) * q.nextState.ftLpAmount,
    'old holders retain their proportional fee rights in this exactly divisible example');
});

test('AddLP rejects ambiguous budgets, zero-LP budgets and inactive or underfunded reserves', () => {
  for (const input of [{}, { incrementSat: 10n, incrementFtRaw: 10n }, { incrementSat: 0n },
    { incrementFtRaw: 0n }, { incrementSat: -1n }, { incrementFtRaw: 1.5 }]) {
    assert.throws(() => math.quoteAddLP(funded, input));
  }
  assert.throws(() => math.quoteAddLP(initial, { incrementFtRaw: 100n }, 100n));
  const tiny = { ...funded, ftLpAmount: 1n };
  assert.throws(() => math.quoteAddLP(tiny, { incrementSat: 1n }));
  assert.throws(() => math.quoteAddLP(tiny, { incrementFtRaw: 1n }));
  for (const state of [{ ...funded, ftLpAmount: 0n }, { ...funded, ftAAmount: 0n },
    { ...funded, tbcAmount: 0n }, { ...funded, poolValue: funded.tbcAmount + 1499n }]) {
    assert.throws(() => math.quoteAddLP(state, 100n));
  }
});

test('AddLP has no reciprocal-ratio overminting or independently rounded FT underpayment', () => {
  const state = { ftLpAmount: 1000000000000n, ftAAmount: 1000000000000n,
    tbcAmount: 1000000000000n, poolValue: 1000000001500n };
  const budget = 999999000001n;
  const q = math.quoteAddLP(state, budget);
  assert.equal(q.ftLpIncrementRaw, budget, 'no old precision-ratio jump to 1000000000000 LP');
  assert.equal(q.ftAIncrementRaw, budget);
  const small = { ftLpAmount: 500000n, ftAAmount: 1000n, tbcAmount: 1000n, poolValue: 2501n };
  const rounded = math.quoteAddLP(small, 2n);
  assert.equal(rounded.ftLpIncrementRaw, 999n);
  assert.equal(rounded.ftAIncrementRaw, 2n, 'ceil charges enough FT for all 999 LP');
  assert(rounded.ftAIncrementRaw * small.ftLpAmount >= rounded.ftLpIncrementRaw * small.ftAAmount);
});

test('AddLP integer budgets reproduce contract LP recovery and never dilute existing asset claims', () => {
  const ceil = (n, d) => (n + d - 1n) / d;
  for (let supply = 1n; supply <= 9n; supply++) for (let reserve = 1n; reserve <= 9n; reserve++) {
    const state = { ftLpAmount: supply, ftAAmount: 11n - reserve, tbcAmount: reserve,
      poolValue: 1500n + reserve + 3n };
    for (let budget = 1n; budget <= 13n; budget++) for (const side of ['incrementSat', 'incrementFtRaw']) {
      const base = side === 'incrementSat' ? reserve + 3n : state.ftAAmount;
      const lp = budget * supply / base;
      if (lp === 0n) continue;
      const q = math.quoteAddLP(state, { [side]: budget });
      assert.equal(q.ftLpIncrementRaw, lp);
      assert.equal(q.tbcIncrementSat, ceil((reserve + 3n) * lp, supply));
      assert.equal(q.ftAIncrementRaw, ceil(state.ftAAmount * lp, supply));
      assert.equal(q.tbcReserveIncrementSat, ceil(reserve * lp, supply));
      const tbcLp = q.tbcIncrementSat * supply / (reserve + 3n);
      const ftLp = q.ftAIncrementRaw * supply / state.ftAAmount;
      assert.equal(tbcLp < ftLp ? tbcLp : ftLp, lp, 'contract independently recovers SDK LP');
      assert((side === 'incrementSat' ? q.tbcIncrementSat : q.ftAIncrementRaw) <= budget);
      assert((q.nextState.poolValue - 1500n) * supply >= (reserve + 3n) * q.nextState.ftLpAmount);
      assert(q.nextState.ftAAmount * supply >= state.ftAAmount * q.nextState.ftLpAmount);
      assert(q.nextState.poolValue - 1500n >= q.nextState.tbcAmount);
    }
  }
});

test('RemoveLP pays real Code balance with one floor and supports full exit', () => {
  const state = { ...funded, poolValue: funded.poolValue + 1000000n };
  const quote = math.quoteRemoveLP(state, 50000000n);
  assert.equal(Object.hasOwn(quote, 'ratio'), false);
  assert.equal(quote.tbcDecrementSat, 50000000n);
  assert.equal(quote.poolValueDecrementSat, 50500000n);
  const full = math.quoteRemoveLP(state, state.ftLpAmount);
  assert.deepEqual(full.nextState, initial);
  for (const amount of [1000002n, 1000000000002n, tape.POOL3_MAX_AMOUNT - 1500n]) {
    const rounding = math.quoteRemoveLP({ ftLpAmount: amount, ftAAmount: amount,
      tbcAmount: amount, poolValue: amount + 1500n }, amount - 1n);
    assert.deepEqual(rounding.nextState, { ftLpAmount: 1n, ftAAmount: 1n, tbcAmount: 1n, poolValue: 1501n });
    assert.equal(rounding.ftADecrementRaw, amount - 1n);
    assert.equal(rounding.tbcDecrementSat, amount - 1n);
    assert.equal(rounding.poolValueDecrementSat, amount - 1n);
  }
  assert.throws(() => math.quoteRemoveLP(state, state.ftLpAmount + 1n));
  assert.throws(() => math.quoteRemoveLP(state, 0n));
});

test('RemoveLP quotes reject sub-10-sat payouts, including otherwise valid tiny full exits', () => {
  for (const payout of [0n, 1n, 9n]) {
    const state = { ftLpAmount: 10n, ftAAmount: 10n, tbcAmount: payout, poolValue: 1500n + payout };
    assert.throws(() => math.quoteRemoveLP(state, 10n), /at least 10 sat/);
  }
  const state = { ftLpAmount: 10n, ftAAmount: 20n, tbcAmount: 10n, poolValue: 1510n };
  assert.equal(math.quoteRemoveLP(state, 10n).poolValueDecrementSat, 10n);
});

test('SwapTBC quotes reject 9 sat at the dust guard but allow 10 sat through to the retained-fee guard', () => {
  const state = { ftLpAmount: 100n, ftAAmount: 100n, tbcAmount: 100n, poolValue: 1600n };
  assert.throws(() => math.quoteSwapTBC(state, 10n, fees.resolveSwapFeePolicy()), /at least 10 sat/);
  // A 10-sat payout satisfies dust; this tiny default-plan quote still retains no fee.
  assert.throws(() => math.quoteSwapTBC(state, 12n, fees.resolveSwapFeePolicy()), /strictly positive retained pool fee/);
});

test('BigInt quotes never lose precision above Number.MAX_SAFE_INTEGER and reject 2^63 overflow', () => {
  const large = { ...funded, ftAAmount: (1n << 62n) - 1n };
  const quote = math.quoteAddLP(large, 100000000n);
  assert.equal(quote.ftAIncrementRaw, large.ftAAmount);
  assert.equal(quote.nextState.ftAAmount, large.ftAAmount * 2n);
  assert.throws(() => math.quoteAddLP({ ...large, ftAAmount: tape.POOL3_MAX_AMOUNT }, 100000000n), /2\^63/);
  assert.throws(() => math.quoteAddLP(initial, 1n << 63n, 1n));
  assert.throws(() => math.quoteAddLP(funded, { incrementFtRaw: 1n << 63n }));
  assert.throws(() => math.quoteAddLP({ ...funded, ftLpAmount: tape.POOL3_MAX_AMOUNT }, 100000000n), /2\^63/);
  assert.throws(() => math.quoteAddLP({ ...funded, poolValue: tape.POOL3_MAX_AMOUNT },
    { incrementFtRaw: funded.ftAAmount }), /2\^63/);
});

test('Swap quotes floor the amount paid out, preserve fee bases and enforce contract strictness', () => {
  const policy = fees.resolveSwapFeePolicy();
  const outFt = math.quoteSwapFT(funded, 1000000n, policy);
  assert.equal(outFt.effectiveTbcIncrementSat, 996500n);
  assert.equal(outFt.poolValueIncrementSat, 999000n);
  assert.equal(outFt.nextState.ftAAmount, funded.ftAAmount - funded.ftAAmount * 996500n / 100996500n);
  assert.equal(outFt.ftOutRaw, funded.ftAAmount - outFt.nextState.ftAAmount);
  assert.equal(outFt.ftOutRaw, 1973335n);
  const outTbc = math.quoteSwapTBC(funded, 1000000n, policy);
  const gross = funded.tbcAmount * 1000000n / (funded.ftAAmount + 1000000n);
  assert.equal(outTbc.grossTbcOutSat, gross);
  assert.equal(gross, 497512n);
  assert.equal(outTbc.fees.baseTbcSat, gross);
  assert.equal(outTbc.poolValueDecrementSat, outTbc.tbcOutSat + outTbc.fees.serviceFeePaidSat);
  assert(outTbc.poolValueDecrementSat < gross);
  assert.throws(() => math.quoteSwapFT(funded, 1n, policy), /retained pool fee/);
  assert.throws(() => math.quoteSwapFT(funded, 1000000n, policy, outFt.ftOutRaw + 1n), /minFtOutRaw/);
  assert.throws(() => math.quoteSwapTBC(funded, 1000000n, policy, outTbc.tbcOutSat + 1n), /minTbcOutSat/);
  assert.throws(() => math.quoteSwapTBC(funded, funded.ftAAmount, policy), /strictly below/);
  assert.throws(() => math.quoteSwapFT(funded, funded.tbcAmount * 2n, policy), /strictly below/);
});

test('Swap rounding cannot buy a whole expensive FT raw unit with a sub-unit payment', () => {
  const policy = fees.resolveSwapFeePolicy();
  const expensiveFt = { ftLpAmount: 1000000n, ftAAmount: 10n, tbcAmount: 1000000n, poolValue: 1001500n };
  assert.throws(() => math.quoteSwapFT(expensiveFt, 1000n, policy), /FT output.*positive/);
  const tinyTbc = { ftLpAmount: 1000000n, ftAAmount: 1000000n, tbcAmount: 10n, poolValue: 1510n };
  assert.throws(() => math.quoteSwapTBC(tinyTbc, 1n, policy), /positive/);
});

test('both Swap directions preserve pricing k and account for retained fees using integer output floors', () => {
  const states = [funded, { ...funded, poolValue: funded.poolValue + 123456n },
    { ftLpAmount: 1000000000000n, ftAAmount: 2000000000000n,
      tbcAmount: 1000000000000n, poolValue: 1000000009999n }];
  for (const state of states) for (let plan = 1; plan <= 6; plan++) {
    const policy = fees.resolveSwapFeePolicy(plan);
    for (const input of [10000n, 20000n, 1000000n, state.tbcAmount / 3n]) {
      for (const direction of ['FT', 'TBC']) {
        const q = direction === 'FT' ? math.quoteSwapFT(state, input, policy) : math.quoteSwapTBC(state, input, policy);
        assert(q.nextState.tbcAmount * q.nextState.ftAAmount >= state.tbcAmount * state.ftAAmount);
        assert.equal(q.nextState.ftLpAmount, state.ftLpAmount);
        assert.equal(q.nextState.poolValue - q.nextState.tbcAmount,
          state.poolValue - state.tbcAmount + q.fees.poolFeeRetainedSat);
        if (direction === 'FT') assert.equal(q.ftOutRaw,
          state.ftAAmount * q.effectiveTbcIncrementSat / (state.tbcAmount + q.effectiveTbcIncrementSat));
        else assert.equal(q.grossTbcOutSat, state.tbcAmount * input / (state.ftAAmount + input));
      }
    }
  }
});

test('Swap and RemoveLP reject invalid amounts and resulting signed-63-bit overflow', () => {
  const policy = fees.resolveSwapFeePolicy();
  for (const amount of [-1n, 0n, 1n << 63n]) {
    assert.throws(() => math.quoteRemoveLP(funded, amount));
    assert.throws(() => math.quoteSwapFT(funded, amount, policy));
    assert.throws(() => math.quoteSwapTBC(funded, amount, policy));
  }
  assert.throws(() => math.quoteSwapFT({ ...funded, poolValue: tape.POOL3_MAX_AMOUNT }, 10000n, policy), /2\^63/);
  assert.throws(() => math.quoteSwapFT({ ...funded, tbcAmount: tape.POOL3_MAX_AMOUNT - 1500n,
    ftAAmount: tape.POOL3_MAX_AMOUNT,
    poolValue: tape.POOL3_MAX_AMOUNT }, 10000n, policy), /2\^63/);
  assert.throws(() => math.quoteSwapTBC({ ...funded, ftAAmount: tape.POOL3_MAX_AMOUNT },
    tape.POOL3_MAX_AMOUNT / 2n, policy), /2\^63/);
});

test('six immutable fee plans reproduce legacy Pool2 integer fee decomposition', () => {
  for (let plan = 1; plan <= 6; plan++) {
    const policy = fees.resolveSwapFeePolicy(plan);
    assert(Object.isFrozen(policy));
    for (let base = 0n; base <= 20000n; base++) {
      const total = base * BigInt(policy.totalFeeBps) / 10000n;
      const lpRate = plan === 1 ? 25n : plan === 6 ? 80n : 5n;
      const lp = base * lpRate / 10000n;
      const service = total - lp;
      const paid = service >= 10n ? service : 0n;
      const result = fees.calculateSwapFees(base, policy);
      assert.equal(result.totalFeeSat, total);
      assert.equal(result.lpFeeSat, lp);
      assert.equal(result.serviceFeeAccruedSat, service);
      assert.equal(result.serviceFeePaidSat, paid);
      assert.equal(result.poolFeeRetainedSat, total - paid);
      assert.equal(result.netAmountSat, base - total);
    }
    for (const base of [1000000n, 10n ** 16n, tape.POOL3_MAX_AMOUNT]) {
      const result = fees.calculateSwapFees(base, policy);
      assert.equal(result.totalFeeSat, base * BigInt(policy.totalFeeBps) / 10000n);
      assert.equal(result.netAmountSat + result.poolFeeRetainedSat + result.serviceFeePaidSat, base);
    }
    assert.throws(() => fees.resolveSwapFeePolicy(plan, policy.totalFeeBps + 1));
    assert.throws(() => fees.calculateSwapFees(100n, { ...policy, servicePayoutThresholdSat: 42n }));
  }
  assert.throws(() => fees.resolveSwapFeePolicy(0));
  assert.throws(() => fees.resolveSwapFeePolicy(7));
});

test('service fee floor-difference, payout threshold 9/10 and fixed output placeholder are preserved', () => {
  const policy = fees.resolveSwapFeePolicy();
  const recipient = fees.deriveFeeRecipient(policy.serviceFeeAddress);
  const sample = fees.calculateSwapFees(399n, policy);
  assert.equal(sample.serviceFeeAccruedSat, 1n);
  assert.equal(399n * 10n / 10000n, 0n);
  for (const [base, service, paid] of [[9000n, 9n, 0n], [10000n, 10n, 10n], [41000n, 41n, 41n]]) {
    const result = fees.calculateSwapFees(base, policy);
    assert.equal(result.serviceFeeAccruedSat, service);
    assert.equal(result.serviceFeePaidSat, paid);
    const output = fees.buildPoolServiceFeeOutput(result, recipient);
    assert.equal(output.satoshis, Number(paid));
    assert.equal(output.script.toHex(), paid === 0n ? '006a' : recipient.feeP2pkhScript25.toHex());
  }
  assert.throws(() => fees.buildPoolServiceFeeOutput({ ...sample, serviceFeePaidSat: 9n }, recipient), /at least 10 sat/);
});

test('fee recipient is full P2PKH SHA256, never the 20-byte address hash', () => {
  const policy = fees.resolveSwapFeePolicy();
  const recipient = fees.deriveFeeRecipient(policy.serviceFeeAddress);
  assert.equal(recipient.feePubKeyHash20.toString('hex'), '1eacc275e83741a10d19f139e191d1fe360055e8');
  assert.equal(recipient.feeP2pkhScript25.toHex(), '76a9141eacc275e83741a10d19f139e191d1fe360055e888ac');
  assert.equal(recipient.feeScriptHash32.toString('hex'), 'e47f4ab48dbe9c5f273c09ad622820835538a488c126ee144d6281ac42fd7200');
  fees.assertPoolFeeRecipient(recipient.feeScriptHash32, policy);
  for (const wrong of [recipient.feePubKeyHash20, tbc.crypto.Hash.sha256(recipient.feePubKeyHash20), Buffer.alloc(32)]) assert.throws(() => fees.assertPoolFeeRecipient(wrong, policy));
  for (let plan = 1; plan <= 6; plan++) {
    const selected = fees.resolveSwapFeePolicy(plan);
    assert.equal(fees.deriveFeeRecipient(selected.serviceFeeAddress).feeP2pkhScript25.toBuffer().length, 25);
  }
});
