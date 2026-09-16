'use strict';

// Deterministic offline transactions. Funding is the only trusted fixture;
// every derived transaction is verified with the library's real interpreter.
const assert = require('node:assert/strict');
const tbc = require('tbc-lib-js');
const { buildUTXO } = require('../../lib/util/util.js');

tbc.Script.Interpreter.MAX_SCRIPT_ELEMENT_SIZE = Number.MAX_SAFE_INTEGER;
tbc.Script.Interpreter.MAXIMUM_ELEMENT_SIZE = Number.MAX_SAFE_INTEGER;

const key = n => new tbc.PrivateKey(n.toString(16).padStart(64, '0'));
const owner = key(721), bob = key(722), carol = key(723), admin = key(724), stranger = key(725);
const address = k => k.toAddress().toString();
const sha = value => tbc.crypto.Hash.sha256(value);
const u32 = value => { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value); return bytes; };
const inputsData = tx => Buffer.concat(tx.inputs.map(input => Buffer.concat([
  Buffer.from(input.prevTxId).reverse(), u32(input.outputIndex), u32(input.sequenceNumber),
])));
let nonce = 721;

function quiet(fn) {
  const previous = console.log;
  console.log = () => {};
  try { return fn(); } finally { console.log = previous; }
}

function makeHarness() {
  const root = new tbc.Transaction();
  root.nLockTime = nonce++;
  root.uncheckedAddInput(new tbc.Transaction.Input({ prevTxId: Buffer.alloc(32, 0x72),
    outputIndex: 0, sequenceNumber: 0xffffffff, script: new tbc.Script() }));
  const available = new Map();
  for (const k of [owner, bob, carol]) {
    const indexes = [];
    for (let i = 0; i < 12; i++) {
      indexes.push(root.outputs.length);
      root.addOutput(new tbc.Transaction.Output({ satoshis: 1_000_000,
        script: tbc.Script.buildPublicKeyHashOut(k.toAddress()) }));
    }
    // Issue from a nonzero funding vout, including the issuer's first ancestor.
    indexes.unshift(indexes.splice(5, 1)[0]);
    available.set(address(k), indexes);
  }
  const chain = new Map([[root.id, root]]), spent = new Set();

  function funding(k = owner) {
    const vout = available.get(address(k)).shift();
    assert.notEqual(vout, undefined, 'fixture funding exhausted');
    return buildUTXO(root, vout);
  }

  function hydrate(raw) {
    const tx = typeof raw === 'string' ? new tbc.Transaction(raw) : raw;
    for (const [vin, input] of tx.inputs.entries()) {
      const parent = chain.get(input.prevTxId.toString('hex'));
      assert(parent, `input ${vin} has an authentic parent`);
      input.output = parent.outputs[input.outputIndex];
      assert(input.output, `input ${vin} has an authentic previous output`);
    }
    return tx;
  }

  function reports(raw) {
    const tx = hydrate(raw);
    return tx.inputs.map((input, vin) => {
      const vm = new tbc.Script.Interpreter();
      const ok = quiet(() => vm.verify(input.script, input.output.script, tx, vin,
        tbc.Script.Interpreter.DEFAULT_FLAGS, input.output.satoshisBN));
      return { vin, ok, error: vm.errstr, stackDepth: vm.stack.length };
    });
  }

  function check(raw, label = 'transaction', minimumFee = 80) {
    const tx = hydrate(raw), results = reports(tx);
    assert(results.every(result => result.ok && result.stackDepth === 1), `${label}: ${JSON.stringify(results)}`);
    const points = tx.inputs.map(input => `${input.prevTxId.toString('hex')}:${input.outputIndex}`);
    assert.equal(new Set(points).size, points.length, `${label}: no duplicate input`);
    for (const point of points) assert(!spent.has(point), `${label}: unspent input ${point}`);
    const fee = tx.inputs.reduce((sum, input) => sum + input.output.satoshis, 0)
      - tx.outputs.reduce((sum, output) => sum + output.satoshis, 0);
    assert(fee >= Math.max(minimumFee, Math.ceil(tx.toBuffer().length * 80 / 1000)), `${label}: sufficient fee for final bytes (${fee})`);
    for (const point of points) spent.add(point);
    chain.set(tx.id, tx);
    return tx;
  }

  function sign(tx, vin, k = owner) {
    const previous = tx.inputs[vin].output;
    return tbc.Transaction.sighash.sign(tx, k, 0x41, vin, previous.script,
      previous.satoshisBN, tbc.Script.Interpreter.DEFAULT_FLAGS).toTxFormat();
  }

  function signP2PKH(tx, vin, k = owner) {
    tx.inputs[vin].setScript(new tbc.Script().add(sign(tx, vin, k)).add(k.publicKey.toBuffer()));
  }

  return { root, chain, funding, hydrate, reports, check, sign, signP2PKH };
}

module.exports = { tbc, owner, bob, carol, admin, stranger, address, sha, u32, inputsData, quiet, makeHarness, buildUTXO };
