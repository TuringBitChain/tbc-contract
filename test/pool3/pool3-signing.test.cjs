'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const tbc = require('tbc-lib-js');
const { PreparedPool3Transaction, p2pkhInputPlan, privateKeySigner, addPool3Output } = require('../../lib/util/poolnft3/transaction');

const keys = [1, 2, 3].map(n => new tbc.PrivateKey(n.toString(16).padStart(64, '0')));
const p2pkh = key => tbc.Script.buildPublicKeyHashOut(key.toAddress());
let nonce = 0;

async function quiet(callback) {
  const log = console.log;
  console.log = () => {};
  try { return await callback(); } finally { console.log = log; }
}

function parent(script, amount = 100000) {
  const tx = new tbc.Transaction().addDummyInput(tbc.Script.fromASM('OP_TRUE'), amount + 100000);
  tx.inputs[0].prevTxId = tbc.crypto.Hash.sha256(Buffer.from(`signing parent ${nonce++}`));
  tx.addOutput(new tbc.Transaction.Output({ script, satoshis: amount }));
  return tx;
}

function fixture(options = {}) {
  const count = options.count ?? 1;
  const parents = Array.from({ length: count }, (_, i) => parent(p2pkh(keys[i]), options.fundingSat ?? 100000));
  const calls = Array(count).fill(0);
  let unlockCalls = 0;
  let rejectLiveUnlock = false;
  const signers = parents.map((_, i) => ({
    publicKey: keys[i].publicKey.toBuffer(),
    ...(options.missingSigner === i ? {} : {
      sign: request => {
        calls[i] += 1;
        assert.equal(request.sighashType, 0x41);
        assert.equal(request.inputIndex, i);
        return request.transaction.getSignature(i, keys[i]);
      },
    }),
  }));
  const plans = parents.map((tx, i) => {
    const plan = p2pkhInputPlan({ parentTx: tx, outputIndex: 0, signer: signers[i] });
    const original = plan.unlock;
    plan.unlock = (...args) => {
      unlockCalls += 1;
      if (rejectLiveUnlock) throw new Error('live unlock called after prepare');
      return original(...args);
    };
    return plan;
  });
  const outputs = [addPool3Output(p2pkh(keys[2]), options.paymentSat ?? 1000n)];
  const prepared = new PreparedPool3Transaction({ inputs: plans, outputs, changeAddress: keys[0].toAddress().toString(), feePolicy: options.feePolicy });
  return { prepared, parents, plans, signers, calls, outputs,
    unlockCalls: () => unlockCalls, rejectLiveUnlock: () => { rejectLiveUnlock = true; } };
}

function signatures(prepared) {
  return prepared.signingRequests.map(request => ({ inputIndex: request.inputIndex,
    publicKey: request.publicKey,
    signature: Buffer.from(request.transaction.getSignature(request.inputIndex, keys[request.inputIndex]), 'hex') }));
}

function assertFees(result) {
  const input = result.transaction.inputs.reduce((sum, i) => sum + BigInt(i.output.satoshis), 0n);
  const output = result.transaction.outputs.reduce((sum, o) => sum + BigInt(o.satoshis), 0n);
  assert.equal(input - output, result.feeSat);
  assert.equal(result.txraw, result.transaction.uncheckedSerialize());
  assert.equal(result.txid, result.transaction.id);
  assert(result.txraw.length / 2 <= result.reservedBytes);
  assert.equal(result.validation.success, true);
}

test('prepared funding prevout does not alias a subsequently mutated parent', async () => {
  const f = fixture();
  const original = f.parents[0].id;
  const originalScript = f.parents[0].outputs[0].script.toHex();
  const before = f.prepared.signingRequests[0];
  f.parents[0].outputs[0].satoshis += 1000;
  f.parents[0].outputs[0].script.toBuffer().fill(0x61);
  f.parents[0].inputs[0].setScript(new tbc.Script().add(tbc.Opcode.OP_2));
  assert.notEqual(f.parents[0].id, original);
  const after = f.prepared.signingRequests[0];
  assert.equal(after.amountSat, before.amountSat);
  assert.equal(after.lockingScriptHex, originalScript);
  assert.equal(after.outpoint.txId, original);
  f.rejectLiveUnlock();
  const result = await quiet(() => f.prepared.sign());
  assert.equal(result.transaction.inputs[0].output.satoshis, 100000);
  assert.equal(result.transaction.inputs[0].output.script.toHex(), originalScript);
  assert.equal(result.consumedOutpoints[0].txId, original);
  assertFees(result);
});

test('transaction and signing request views isolate raw script buffers and previous-output objects', async () => {
  const f = fixture();
  const expected = f.prepared.transaction.uncheckedSerialize();
  const expectedPrevScript = f.prepared.signingRequests[0].lockingScriptHex;
  const view = f.prepared.transaction;
  view.inputs[0].output.satoshis += 500;
  view.inputs[0].output.script.toBuffer().fill(0x61);
  view.outputs[0].script.toBuffer().fill(0x61);
  view.outputs[0].satoshis += 1;
  view.inputs[0].prevTxId.fill(0);
  view.inputs[0].script.toBuffer().fill(0x61);
  view.nLockTime = 100;
  const request = f.prepared.signingRequests[0];
  request.publicKey.fill(0);
  request.publicKeyHash.fill(0);
  request.outpoint.txId = '00'.repeat(32);
  request.transaction.inputs[0].output.script.toBuffer().fill(0x61);
  request.transaction.outputs[0].script.toBuffer().fill(0x61);
  assert.equal(f.prepared.transaction.uncheckedSerialize(), expected);
  assert.equal(f.prepared.signingRequests[0].lockingScriptHex, expectedPrevScript);
  const result = await quiet(() => f.prepared.sign());
  assertFees(result);
});

test('prepared outputs and signer adapters no longer reference caller-owned mutable objects', async () => {
  const f = fixture();
  const expected = f.prepared.transaction.uncheckedSerialize();
  f.outputs[0].script.toBuffer().fill(0x61);
  f.outputs[0].satoshis = 1;
  f.signers[0].publicKey.fill(0);
  f.signers[0].sign = () => { throw new Error('replaced caller signer must not run'); };
  f.plans[0].role = 'lp-owner';
  f.plans[0].unlock = () => { throw new Error('replaced caller unlock must not run'); };
  assert.equal(f.prepared.transaction.uncheckedSerialize(), expected);
  assert.equal(f.prepared.signingRequests[0].role, 'funding');
  const result = await quiet(() => f.prepared.sign());
  assertFees(result);
});

test('estimation invokes no external signatures, and finalization never rebuilds live witnesses', async () => {
  const f = fixture({ count: 2 });
  assert.deepEqual(f.calls, [0, 0]);
  assert.equal(f.prepared.signingRequests.length, 2);
  assert.deepEqual(f.calls, [0, 0]);
  const preparedUnlockCalls = f.unlockCalls();
  assert(preparedUnlockCalls > 0);
  f.rejectLiveUnlock();
  const result = await quiet(() => f.prepared.sign());
  assert.deepEqual(f.calls, [1, 1]);
  assert.equal(f.unlockCalls(), preparedUnlockCalls);
  assertFees(result);
  const repeats = await quiet(() => f.prepared.finalize(signatures(f.prepared)));
  assert.deepEqual(f.calls, [1, 1]);
  assert.equal(f.unlockCalls(), preparedUnlockCalls);
  assert.equal(repeats.txraw, result.txraw);
});

test('missing callback fails before requesting any other input signature', async () => {
  const f = fixture({ count: 2, missingSigner: 1 });
  await assert.rejects(() => f.prepared.sign(), /no signer/);
  assert.deepEqual(f.calls, [0, 0]);
  const result = await quiet(() => f.prepared.finalize(signatures(f.prepared)));
  assertFees(result);
});

test('finalize rejects wrong public keys, wrong sighash, invalid signatures and missing/duplicate/extraneous inputs', () => {
  const f = fixture({ count: 2 });
  const valid = signatures(f.prepared);
  assert.throws(() => f.prepared.finalize([]), /missing signature/);
  assert.throws(() => f.prepared.finalize([valid[0]]), /missing signature/);
  assert.throws(() => f.prepared.finalize([valid[0], valid[0], valid[1]]), /duplicate/);
  assert.throws(() => f.prepared.finalize([...valid, { ...valid[0], inputIndex: 6 }]), /unexpected/);
  assert.throws(() => f.prepared.finalize([{ ...valid[0], publicKey: keys[1].publicKey.toBuffer() }, valid[1]]), /public key differs/);
  const wrongType = Buffer.from(valid[0].signature); wrongType[wrongType.length - 1] = 0x42;
  assert.throws(() => f.prepared.finalize([{ ...valid[0], signature: wrongType }, valid[1]]), /0x41/);
  assert.throws(() => f.prepared.finalize([{ ...valid[0], signature: Buffer.alloc(0) }, valid[1]]), /DER/);
  const wrongKeySig = f.prepared.transaction.getSignature(0, keys[2]);
  assert.throws(() => f.prepared.finalize([{ ...valid[0], signature: wrongKeySig }, valid[1]]), /invalid transaction signature/);
  assert.deepEqual(f.calls, [0, 0]);
});

test('signatures over modified outputs or forged prevout amounts are not accepted', () => {
  const f = fixture();
  const valid = signatures(f.prepared)[0];
  for (const alter of [
    tx => { tx.outputs[0].satoshis += 1; },
    tx => { tx.inputs[0].output.satoshis += 1; },
    tx => { tx.inputs[0].sequenceNumber = 0xfffffffe; },
    tx => { tx.nLockTime = 100; },
  ]) {
    const view = f.prepared.transaction; alter(view);
    const signature = view.getSignature(0, keys[0]);
    assert.throws(() => f.prepared.finalize([{ ...valid, signature }]), /invalid transaction signature/);
  }
});

test('repeated finalize uses the same prepared bytes despite mutations of a prior result', async () => {
  const f = fixture();
  const supplied = signatures(f.prepared);
  const first = await quiet(() => f.prepared.finalize(supplied));
  const expected = first.txraw;
  first.transaction.inputs[0].output.satoshis += 1000;
  first.transaction.inputs[0].output.script.toBuffer().fill(0x61);
  first.transaction.inputs[0].script.toBuffer().fill(0x61);
  first.transaction.outputs[0].script.toBuffer().fill(0x61);
  first.transaction.outputs[0].satoshis += 1000;
  first.consumedOutpoints[0].txId = '00'.repeat(32);
  const second = await quiet(() => f.prepared.finalize(supplied));
  assert.equal(second.txraw, expected);
  assertFees(second);
  assert(Object.isFrozen(f.prepared.consumedOutpoints));
  assert(Object.isFrozen(f.prepared.consumedOutpoints[0]));
});

test('unsigned witness buffers in finalized results cannot mutate the prepared witness', async () => {
  const unsignedParent = parent(tbc.Script.fromASM('OP_DROP OP_TRUE'));
  const feeParent = parent(p2pkh(keys[0]));
  const prepared = new PreparedPool3Transaction({
    inputs: [
      { reference: { parentTx: unsignedParent, outputIndex: 0 }, role: 'pool-controller', unlock: () => new tbc.Script().add(tbc.Opcode.OP_1) },
      p2pkhInputPlan({ parentTx: feeParent, outputIndex: 0, signer: privateKeySigner(keys[0]) }),
    ],
    outputs: [addPool3Output(p2pkh(keys[0]), 1000n)], changeAddress: keys[0].toAddress().toString(),
  });
  const request = prepared.signingRequests[0];
  assert.equal(request.inputIndex, 1);
  const supplied = [{ inputIndex: 1, publicKey: keys[0].publicKey.toBuffer(), signature: request.transaction.getSignature(1, keys[0]) }];
  const first = await quiet(() => prepared.finalize(supplied));
  const expected = first.txraw;
  first.transaction.inputs[0].script.toBuffer()[0] = 0x52;
  const second = await quiet(() => prepared.finalize(supplied));
  assert.equal(second.transaction.inputs[0].script.toHex(), '51');
  assert.equal(second.txraw, expected);
});

test('fee reservation and dust change preserve the exact TBC ledger', async () => {
  const normal = fixture({ feePolicy: { satoshisPerKb: 123n, minimumFeeSat: 91n, changeDustSat: 42n } });
  const a = await quiet(() => normal.prepared.sign());
  assertFees(a);
  assert(a.feeSat >= 91n);
  assert.equal(a.changeVout, 1);
  const noChange = fixture({ fundingSat: 1089, paymentSat: 1000n });
  const b = await quiet(() => noChange.prepared.sign());
  assertFees(b);
  assert.equal(b.changeVout, undefined);
  assert.equal(b.feeSat, 89n);
  assert.equal(b.transaction.outputs.length, 1);
  assert.throws(() => fixture({ fundingSat: 1050, paymentSat: 1000n }), /insufficient TBC/);
  assert.throws(() => fixture({ feePolicy: { satoshisPerKb: 0n } }), /must be positive/);
});

test('Pool3 ordinary payments and default change use a strict 10-sat minimum', async () => {
  const ten = fixture({ paymentSat: 10n });
  assertFees(await quiet(() => ten.prepared.sign()));
  assert.throws(() => fixture({ paymentSat: 9n }), /at least 10 sat/);
  assert.throws(() => fixture({ paymentSat: 0n }), /at least 10 sat/);
  assert.throws(() => fixture({ feePolicy: { changeDustSat: 9n } }), /at least 10 sat/);
  const exactChange = fixture({ fundingSat: 1090, paymentSat: 1000n });
  const signed = await quiet(() => exactChange.prepared.sign());
  assertFees(signed);
  assert.equal(signed.changeVout, 1);
  assert.equal(signed.transaction.outputs[1].satoshis, 10);
  // Hand-built fixed outputs cannot bypass the shared helper's floor.
  const prior = parent(p2pkh(keys[0]));
  assert.throws(() => new PreparedPool3Transaction({
    inputs: [p2pkhInputPlan({ parentTx: prior, outputIndex: 0, signer: privateKeySigner(keys[0]) })],
    outputs: [new tbc.Transaction.Output({ script: p2pkh(keys[0]), satoshis: 9 })],
    changeAddress: keys[0].toAddress().toString(),
  }), /at least 10 sat/);
});
