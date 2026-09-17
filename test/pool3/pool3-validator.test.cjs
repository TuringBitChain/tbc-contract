'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

// Run each ordering in a genuinely fresh process. Other SDK calls intentionally
// mutate interpreter statics, so an in-process reset would conceal regressions.
function isolatedNumericChecks(warmInputVerify) {
  // The interpreter logs rejected script stacks. Keep this child process's
  // stdout reserved for its structured result, including expected rejections.
  const originalLog = console.log;
  console.log = () => {};
  const assert = require('node:assert/strict');
  const tbc = require('tbc-lib-js');
  const { validatePool3Transaction } = require('./lib/validator/poolnft3');
  const Interpreter = tbc.Script.Interpreter;
  const asNumber = value => new tbc.crypto.BN(value.toString()).toScriptNumBuffer();
  const transaction = (value, lockingASM = 'OP_BIN2NUM OP_DROP OP_TRUE') => {
    const tx = new tbc.Transaction().addDummyInput(tbc.Script.fromASM(lockingASM), 1000);
    tx.version = 10;
    tx.inputs[0].setScript(new tbc.Script().add(value));
    tx.addOutput(new tbc.Transaction.Output({ script: tbc.Script.fromASM('OP_TRUE'), satoshis: 900 }));
    return tx;
  };
  assert.equal(Interpreter.MAXIMUM_ELEMENT_SIZE, 4);
  assert.equal(Interpreter.MAX_SCRIPT_ELEMENT_SIZE, 520);
  if (warmInputVerify) {
    const tx = transaction(asNumber(1n));
    tx.inputs[0].verify(tx, 0);
    assert.equal(Interpreter.MAXIMUM_ELEMENT_SIZE, Number.MAX_SAFE_INTEGER);
    assert.equal(Interpreter.MAX_SCRIPT_ELEMENT_SIZE, Number.MAX_SAFE_INTEGER);
  }
  const previousNumeric = Interpreter.MAXIMUM_ELEMENT_SIZE;
  const previousBytes = Interpreter.MAX_SCRIPT_ELEMENT_SIZE;
  let count = 0;
  for (const [tx, accepted] of [
    [transaction(asNumber(1n << 31n)), true],
    [transaction(asNumber((1n << 63n) - 1n)), true],
    [transaction(asNumber(1n << 63n)), false],
    // Products stay arbitrary precision; only explicit BIN2NUM conversion is capped.
    [transaction(asNumber((1n << 63n) - 1n), 'OP_BIN2NUM OP_DUP OP_MUL OP_DROP OP_TRUE'), true],
    [transaction(asNumber((1n << 63n) - 1n), 'OP_BIN2NUM OP_DUP OP_MUL OP_BIN2NUM OP_DROP OP_TRUE'), false],
    [transaction(Buffer.alloc(1024, 0x01), 'OP_DROP OP_TRUE'), true],
  ]) {
    const report = validatePool3Transaction(tx);
    assert.equal(report.success, accepted, JSON.stringify(report));
    if (!accepted) assert.match(report.inputs[0].error, /INVALID_NUMBER_RANGE/);
    assert.equal(Interpreter.MAXIMUM_ELEMENT_SIZE, previousNumeric);
    assert.equal(Interpreter.MAX_SCRIPT_ELEMENT_SIZE, previousBytes);
    count++;
  }
  const originalVerify = Interpreter.prototype.verify;
  try {
    Interpreter.prototype.verify = function () {
      assert.equal(Interpreter.MAXIMUM_ELEMENT_SIZE, 8);
      assert.equal(Interpreter.MAX_SCRIPT_ELEMENT_SIZE, Number.MAX_SAFE_INTEGER);
      throw new Error('forced interpreter exception');
    };
    assert.throws(() => validatePool3Transaction(transaction(asNumber(1n))), /forced interpreter exception/);
  } finally {
    Interpreter.prototype.verify = originalVerify;
  }
  assert.equal(Interpreter.MAXIMUM_ELEMENT_SIZE, previousNumeric);
  assert.equal(Interpreter.MAX_SCRIPT_ELEMENT_SIZE, previousBytes);
  console.log = originalLog;
  console.log(JSON.stringify({ count, warmInputVerify }));
}

for (const warm of [false, true]) {
  test(`Pool3 numeric and byte-string limits are isolated and restored: prior Input.verify=${warm}`, () => {
    const output = execFileSync(process.execPath, ['-e', `(${isolatedNumericChecks.toString()})(${warm})`], {
      cwd: path.resolve(__dirname, '../..'), encoding: 'utf8',
    });
    assert.deepEqual(JSON.parse(output), { count: 6, warmInputVerify: warm });
  });
}
