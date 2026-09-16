'use strict';

// Offline SDK lifecycle coverage. Only the initial P2PKH funding transaction is
// a trusted fixture boundary; every subsequent Coin/NFT/Hold/fee input executes
// the real script interpreter. The deterministic BIP340 key represents the
// administrator's aggregate public key; no wallet, RPC, or broadcast is used.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const tbc = require('tbc-lib-js');
const StableCoin = require('../../lib/contract/stableCoin.js');
const LegacyStableCoin = require('../../lib/contract/stableCoinLegacy.js');
const { CoinTBC20 } = require('../../lib/contract/coinTbc20.js');
const { buildUTXO, buildFtPrePreTxData } = require('../../lib/util/util.js');

// Match tbc-lib-js Transaction.Input.verify: the bare interpreter retains
// legacy 520-byte pushes / four-byte numbers until the transaction entry point
// sets the TBC limits. Direct execution below additionally inspects stack depth.
tbc.Script.Interpreter.MAX_SCRIPT_ELEMENT_SIZE = Number.MAX_SAFE_INTEGER;
tbc.Script.Interpreter.MAXIMUM_ELEMENT_SIZE = Number.MAX_SAFE_INTEGER;

const key = n => new tbc.PrivateKey(n.toString(16).padStart(64, '0'));
const owner = key(301), admin = key(302), bob = key(303), carol = key(304), stranger = key(305);
const address = k => k.toAddress().toString();
const adminPublicKey = admin.publicKey.toBuffer().subarray(1);
const SIGHASH = tbc.crypto.Signature.SIGHASH_ALL | tbc.crypto.Signature.SIGHASH_FORKID;
const CODE_MARKER = Buffer.from('COINTBC20CODE2');
let fixtureNonce = 1;

function quiet(fn) {
  const log = console.log;
  console.log = () => {};
  try { return fn(); } finally { console.log = log; }
}

function controller(script) {
  const bytes = script.toBuffer();
  assert(bytes.subarray(-CODE_MARKER.length).equals(CODE_MARKER));
  return bytes.subarray(-36, -15).toString('hex');
}

function ownedBy(k) {
  return `${tbc.crypto.Hash.sha256ripemd160(k.publicKey.toBuffer()).toString('hex')}00`;
}

function coins(tx) {
  return tx.outputs.flatMap((output, vout) => {
    if (!output.script.toBuffer().subarray(-CODE_MARKER.length).equals(CODE_MARKER)) return [];
    const tape = CoinTBC20.parseTape(tx.outputs[vout + 1].script);
    return [{ tx, vout, ...tape, controller: controller(output.script), utxo: buildUTXO(tx, vout, true) }];
  });
}

function nftSupply(tx) {
  return BigInt(JSON.parse(tx.outputs[2].script.chunks.at(-2).buf.toString('utf8')).coinTotalSupply);
}

function legacyCoins(tx) {
  return tx.outputs.flatMap((output, vout) => {
    if (![2012, 2076].includes(output.script.toBuffer().length) || !output.script.toHex().endsWith('0532436f6465')) return [];
    const utxo = buildUTXO(tx, vout, true);
    return [{ tx, vout, utxo, balance: utxo.ftBalance }];
  });
}

function makeHarness({ amount = '100', decimal = 2, legacy = false } = {}) {
  const chain = new Map(), spent = new Set(), feeIndexes = new Map();
  const root = new tbc.Transaction();
  root.nLockTime = fixtureNonce++;
  root.uncheckedAddInput(new tbc.Transaction.Input({ prevTxId: Buffer.alloc(32, 0x68),
    outputIndex: 0, sequenceNumber: 0xffffffff, script: new tbc.Script() }));
  for (const k of [owner, bob, carol]) {
    feeIndexes.set(address(k), []);
    for (let i = 0; i < 8; i++) {
      feeIndexes.get(address(k)).push(root.outputs.length);
      root.addOutput(new tbc.Transaction.Output({ script: tbc.Script.buildPublicKeyHashOut(k.toAddress()), satoshis: 1_000_000 }));
    }
  }
  chain.set(root.id, root);
  const Class = legacy ? LegacyStableCoin : StableCoin;
  const sdk = new Class({ name: 'Local USD', symbol: 'LUSD', amount, decimal });

  function funding(k = owner) {
    const vout = feeIndexes.get(address(k)).shift();
    assert.notEqual(vout, undefined, 'fixture has a fresh fee output');
    return buildUTXO(root, vout);
  }

  function check(raw, label) {
    const tx = typeof raw === 'string' ? new tbc.Transaction(raw) : raw;
    const inputs = tx.inputs.map((input, vin) => {
      const parent = chain.get(input.prevTxId.toString('hex'));
      assert(parent, `${label}: real parent exists for input ${vin}`);
      input.output = parent.outputs[input.outputIndex];
      assert(input.output, `${label}: previous output exists for input ${vin}`);
      const ref = `${parent.id}:${input.outputIndex}`;
      assert(!spent.has(ref), `${label}: no accidental double spend of ${ref}`);
      const vm = new tbc.Script.Interpreter();
      const ok = quiet(() => vm.verify(input.script, input.output.script, tx, vin,
        tbc.Script.Interpreter.DEFAULT_FLAGS, input.output.satoshisBN));
      return { vin, ok, error: vm.errstr, stackDepth: vm.stack.length, ref };
    });
    assert(inputs.every(input => input.ok && input.stackDepth === 1), `${label}: ${JSON.stringify(inputs)}`);
    const fee = tx.inputs.reduce((sum, input) => sum + input.output.satoshis, 0)
      - tx.outputs.reduce((sum, output) => sum + output.satoshis, 0);
    assert(fee >= Math.max(80, Math.ceil(tx.uncheckedSerialize().length / 2 * 80 / 1000)), `${label}: sufficient fee for final signed bytes`);
    const outputs = coins(tx);
    for (const output of outputs) {
      assert.equal(tx.outputs[output.vout].satoshis, 500, `${label}: Coin Code dust`);
      assert.equal(tx.outputs[output.vout + 1].satoshis, 0);
      assert.equal(tx.outputs[output.vout + 1].script.isSafeDataOut(), true, `${label}: standard Coin Tape`);
      assert.equal(tx.outputs[output.vout + 1].script.chunks.at(-1).buf.toString(), 'TBC20TAPE');
    }
    for (const [vin, input] of tx.inputs.entries()) {
      if (!input.output.script.toBuffer().subarray(-CODE_MARKER.length).equals(CODE_MARKER)) continue;
      const parent = chain.get(input.prevTxId.toString('hex'));
      const incoming = CoinTBC20.parseTape(parent.outputs[input.outputIndex + 1].script);
      assert.equal(input.sequenceNumber, 0xfffffffe, `${label}: Coin input itself is non-final`);
      assert.equal(input.script.chunks.length, 123, `${label}: full 123-leaf Coin ABI`);
      assert.equal(outputs.reduce((sum, output) => sum + output.amounts[vin], 0n), incoming.balance,
        `${label}: Coin conservation uses physical input slot ${vin}`);
    }
    for (const input of inputs) spent.add(input.ref);
    chain.set(tx.id, tx);
    return tx;
  }

  function signatures(prepared, signingKey = admin) {
    return prepared.sighashes.map(({ inputIndex, sighash }) => {
      const expected = tbc.crypto.Hash.sha256sha256(Buffer.from(prepared.tx.getPreimage(inputIndex, SIGHASH), 'hex'));
      assert.deepEqual(sighash, expected, 'external signer receives the final transaction digest');
      const output = prepared.tx.inputs[inputIndex].output;
      return tbc.Transaction.sighash.signSchnorr(prepared.tx, signingKey, SIGHASH,
        inputIndex, output.script, output.satoshisBN).schnorrSig;
    });
  }

  function finalize(prepared, label) {
    const before = prepared.tx.outputs.map(output => `${output.satoshis}:${output.script.toHex()}`);
    const lockTime = prepared.tx.nLockTime;
    const result = prepared.finalize(signatures(prepared));
    assert.deepEqual(prepared.tx.outputs.map(output => `${output.satoshis}:${output.script.toHex()}`), before,
      `${label}: finalization preserves signed outputs and fee change`);
    assert.equal(prepared.tx.nLockTime, lockTime);
    if (Array.isArray(result)) return result.map((raw, index) => check(raw, `${label} ${index}`));
    return check(result, label);
  }

  const prepared = sdk.createCoin(adminPublicKey, owner, address(owner), funding(), root, 'offline initial issuance');
  const [source, first] = finalize(prepared, 'createCoin');
  return { sdk, root, source, first, chain, funding, check, signatures, finalize };
}

test('SDK creates the real issuer NFT, renews issuance, and keeps supply in atomic units', { concurrency: false }, () => quiet(() => {
  const h = makeHarness({ amount: '100.25' });
  assert.equal(nftSupply(h.source), 0n);
  assert.equal(nftSupply(h.first), 10025n);
  assert.equal(h.sdk.totalSupply, 10025n);
  assert.equal(h.sdk.contractTxid, h.first.id);
  assert.equal(h.source.outputs[0].satoshis, 200);
  assert.equal(h.source.outputs[1].satoshis, 100);
  assert.equal(coins(h.first)[0].vout, 3);
  assert.equal(coins(h.first)[0].balance, 10025n);
  const pending = h.sdk.mintCoin(adminPublicKey, owner, address(owner), '0.75', h.funding(), h.first, h.source, 'offline second issuance');
  assert.equal(h.sdk.totalSupply, 10025n, 'preparation does not update committed supply');
  const second = h.finalize(pending, 'mintCoin');
  assert.equal(nftSupply(second), 10100n);
  assert.equal(h.sdk.totalSupply, 10100n);
  assert.equal(h.sdk.contractTxid, h.first.id, 'renewal retains the original mint transaction identifier');
  assert.equal(coins(second)[0].balance, 75n);
  assert.equal(second.outputs[0].script.toHex(), h.source.outputs[0].script.toHex());
  assert.deepEqual(CoinTBC20.getCodeIdentity(second.outputs[3].script), CoinTBC20.getCodeIdentity(h.first.outputs[3].script));
  const inputs = [coins(h.first)[0], coins(second)[0]];
  const merged = h.sdk.mergeCoin(owner, inputs.map(input => input.utxo), h.funding(), inputs.map(input => input.tx), h.chain, [...h.chain.values()]);
  assert.equal(merged.length, 1);
  const result = h.check(merged[0].txraw, 'merge independent issuances');
  assert.equal(coins(result)[0].balance, 10100n);
  assert.deepEqual(coins(result)[0].amounts, [10025n, 75n, 0n, 0n, 0n, 0n]);
}));

test('SDK transfers from nonzero mint vout and resolves ancestry from Map, shared transactions, and callbacks', { concurrency: false }, () => quiet(() => {
  const h = makeHarness();
  const first = coins(h.first)[0];
  const sent = h.check(h.sdk.transfer(owner, address(bob), '12', [first.utxo], h.funding(), [h.first], h.chain, '0.001'), 'owner transfer with native TBC');
  const bobCoin = coins(sent).find(coin => coin.controller === ownedBy(bob));
  assert.equal(bobCoin.balance, 1200n);
  assert(sent.outputs.some(output => output.satoshis === 1000 && output.script.toHex() === tbc.Script.buildPublicKeyHashOut(bob.toAddress()).toHex()));
  const next = h.check(h.sdk.transfer(bob, address(carol), '5', [bobCoin.utxo], h.funding(bob), [sent], [...h.chain.values()]), 'recipient transfer from unconfirmed parent');
  const carolCoin = coins(next).find(coin => coin.controller === ownedBy(carol));
  assert.equal(carolCoin.balance, 500n);
  const last = h.check(h.sdk.transfer(carol, address(owner), '5', [carolCoin.utxo], h.funding(carol), [next], txid => h.chain.get(txid)), 'callback ancestry resolver');
  assert.equal(coins(last)[0].balance, 500n);
}));

test('SDK batches seven duplicate-address receivers then merges more than five UTXOs through valid chains', { concurrency: false }, () => quiet(() => {
  const h = makeHarness();
  const first = coins(h.first)[0];
  const receivers = Array.from({ length: 7 }, () => ({ address: address(owner), amount: '1.25' }));
  const batch = h.sdk.batchTransfer(owner, receivers, [first.utxo], h.funding(), [h.first], [...h.chain.values()]);
  assert.equal(batch.length, 2, 'more than five receivers produce an ordered transaction chain');
  const sent = batch.map((item, index) => h.check(item.txraw, `batch ${index}`));
  assert.equal(sent[1].inputs[0].prevTxId.toString('hex'), sent[0].id);
  const recipients = sent.flatMap(coins).filter(coin => coin.balance === 125n);
  assert.equal(recipients.length, 7, 'duplicate addresses retain all requested outputs');
  const before = recipients.map(coin => coin.utxo.txId);
  const results = h.sdk.mergeCoin(owner, recipients.map(coin => coin.utxo), h.funding(), recipients.map(coin => coin.tx),
    recipients.map(() => txid => h.chain.get(txid)), [...h.chain.values()]);
  assert(results.length >= 2, 'more than five inputs require multiple transactions');
  const merged = results.map((item, index) => h.check(item.txraw, `merge chain ${index}`));
  assert.deepEqual(recipients.map(coin => coin.utxo.txId), before, 'merge does not mutate caller input descriptors');
  assert(merged.every(tx => tx.inputs.length <= 6), 'each merge uses at most five Coin inputs plus fee');
  assert.equal(coins(merged.at(-1))[0].balance, 875n);
  const finalCoin = coins(merged.at(-1))[0];
  const finalSpend = h.check(h.sdk.transfer(owner, address(bob), '8.75', [finalCoin.utxo], h.funding(), [finalCoin.tx], h.chain), 'spend merged chain result');
  assert.equal(coins(finalSpend)[0].balance, 875n);
}));

test('administrator freeze and early unfreeze retain each controller and physical contribution slots', { concurrency: false }, () => quiet(() => {
  const h = makeHarness();
  const first = coins(h.first)[0];
  const batch = h.sdk.batchTransfer(owner, [
    { address: address(bob), amount: '3' }, { address: address(bob), amount: '4' }, { address: address(carol), amount: '5' },
  ], [first.utxo], h.funding(), [h.first], h.chain);
  const sent = h.check(batch[0].txraw, 'multi-owner distribution');
  const inputs = coins(sent).filter(coin => coin.controller !== ownedBy(owner));
  assert.equal(inputs.length, 3);
  const pending = h.sdk.freezeCoinUTXO(adminPublicKey, owner, 1_800_000_000,
    inputs.map(coin => coin.utxo), h.funding(), inputs.map(coin => coin.tx), h.chain);
  assert.equal(pending.tx.nLockTime, 0, 'administrator freeze does not wait for lock maturity');
  const frozen = h.finalize(pending, 'administrator freeze');
  const frozenCoins = coins(frozen);
  assert.equal(frozenCoins.length, 2, 'same-controller inputs merge while different owners remain separate');
  const byController = new Map(frozenCoins.map(coin => [coin.controller, coin]));
  assert.equal(byController.get(ownedBy(bob)).balance, 700n);
  assert.equal(byController.get(ownedBy(carol)).balance, 500n);
  assert.deepEqual(byController.get(ownedBy(bob)).amounts, [300n, 400n, 0n, 0n, 0n, 0n]);
  assert.deepEqual(byController.get(ownedBy(carol)).amounts, [0n, 0n, 500n, 0n, 0n, 0n]);
  assert(frozenCoins.every(coin => coin.lockTime === 1_800_000_000));
  const thaw = h.sdk.unfreezeCoinUTXO(adminPublicKey, owner, frozenCoins.map(coin => coin.utxo), h.funding(),
    frozenCoins.map(coin => coin.tx), [...h.chain.values()]);
  assert.equal(thaw.tx.nLockTime, 0, 'administrator may thaw before the timestamp');
  const thawed = h.finalize(thaw, 'administrator early unfreeze');
  const thawedCoins = coins(thawed);
  assert.deepEqual(thawedCoins.map(coin => [coin.controller, coin.balance, coin.lockTime]),
    frozenCoins.map(coin => [coin.controller, coin.balance, 0]));
  const bobCoin = thawedCoins.find(coin => coin.controller === ownedBy(bob));
  h.check(h.sdk.transfer(bob, address(carol), '7', [bobCoin.utxo], h.funding(bob), [thawed], h.chain), 'holder spends thawed Coin');
}));

test('administrator freezes and thaws contract-controlled Coin without a controlling contract witness', { concurrency: false }, () => quiet(() => {
  const h = makeHarness();
  const first = coins(h.first)[0];
  const contractHash = '36'.repeat(20);
  const batch = h.sdk.batchTransfer(owner, [
    { address: contractHash, amount: '7' }, { address: address(bob), amount: '3' },
  ], [first.utxo], h.funding(), [h.first], h.chain);
  const sent = h.check(batch[0].txraw, 'distribution to contract and address controllers');
  const selected = coins(sent).filter(coin => coin.controller !== ownedBy(owner));
  assert.deepEqual(selected.map(coin => coin.controller), [`${contractHash}01`, ownedBy(bob)]);
  const pending = h.sdk.freezeCoinUTXO(adminPublicKey, owner, 1_800_000_000,
    selected.map(coin => coin.utxo), h.funding(), selected.map(coin => coin.tx), h.chain);
  assert.equal(pending.tx.inputs.length, 3, 'only the two Coin inputs and the real fee input are needed');
  assert.equal(pending.tx.nLockTime, 0);
  const frozen = h.finalize(pending, 'administrator freezes contract-controlled Coin');
  const frozenCoins = coins(frozen);
  assert.deepEqual(frozenCoins.map(coin => [coin.controller, coin.balance, coin.lockTime]),
    selected.map(coin => [coin.controller, coin.balance, 1_800_000_000]));
  const thawed = h.finalize(h.sdk.unfreezeCoinUTXO(adminPublicKey, owner,
    frozenCoins.map(coin => coin.utxo), h.funding(), frozenCoins.map(coin => coin.tx), h.chain),
  'administrator thaws contract-controlled Coin');
  assert.equal(thawed.nLockTime, 0);
  assert.deepEqual(coins(thawed).map(coin => [coin.controller, coin.balance, coin.lockTime]),
    selected.map(coin => [coin.controller, coin.balance, 0]));
}));

for (const lockTime of [650_000, 1_800_000_000]) {
  test(`holder transfer uses the ${lockTime < 500_000_000 ? 'height' : 'timestamp'} lock domain`, { concurrency: false }, () => quiet(() => {
    const h = makeHarness();
    const first = coins(h.first)[0];
    const frozen = h.finalize(h.sdk.freezeCoinUTXO(adminPublicKey, owner, lockTime,
      [first.utxo], h.funding(), [h.first], h.chain), 'freeze lock-domain fixture');
    const input = coins(frozen)[0];
    const spent = h.check(h.sdk.transfer(owner, address(bob), '100', [input.utxo], h.funding(), [frozen], h.chain), 'holder spends at maturity');
    assert.equal(spent.nLockTime, lockTime);
    assert.equal(spent.inputs[0].sequenceNumber, 0xfffffffe);
    assert.equal(coins(spent)[0].lockTime, 0, 'ordinary transfer creates an unlocked output');
  }));
}

test('SDK preserves amounts above Number.MAX_SAFE_INTEGER and decimal-zero initialization', { concurrency: false }, () => quiet(() => {
  const h = makeHarness({ amount: '9007199254740993', decimal: 0 });
  assert.equal(h.sdk.totalSupply, 9007199254740993n);
  assert.equal(nftSupply(h.first), 9007199254740993n);
  const restored = new StableCoin(h.sdk.contractTxid);
  restored.initialize({ name: h.sdk.name, symbol: h.sdk.symbol, decimal: 0, totalSupply: h.sdk.totalSupply.toString(),
    codeScript: h.sdk.codeScript, tapeScript: h.sdk.tapeScript });
  assert.equal(restored.totalSupply, 9007199254740993n);
  const input = coins(h.first)[0];
  const result = h.check(restored.transfer(owner, address(bob), '9007199254740992', [input.utxo], h.funding(), [h.first], h.chain), 'exact bigint transfer');
  assert.deepEqual(coins(result).map(coin => coin.balance), [9007199254740992n, 1n]);
}));

test('administrator preparation rejects incorrect signatures and changes to signed transaction fields', { concurrency: false }, () => quiet(() => {
  const h = makeHarness();
  const input = coins(h.first)[0];
  const args = [adminPublicKey, owner, 1000, [input.utxo], h.funding(), [h.first], h.chain];
  const wrongSig = h.sdk.freezeCoinUTXO(...args);
  assert.throws(() => wrongSig.finalize(h.signatures(wrongSig, stranger)), /signature|schnorr|admin|verify/i);
  const changed = h.sdk.freezeCoinUTXO(...args);
  const signatures = h.signatures(changed);
  changed.tx.outputs.at(-1).satoshis -= 1;
  assert.throws(() => changed.finalize(signatures), /change|modif|signature|schnorr|sighash|transaction/i);
  const valid = h.sdk.freezeCoinUTXO(...args);
  const validSignatures = h.signatures(valid);
  h.check(valid.finalize(validSignatures), 'single-use administrator finalization');
  assert.throws(() => valid.finalize(validSignatures), /already|finaliz/i);
  assert.equal(h.sdk.totalSupply, 10000n);
}));

test('SDK rejects legacy ancestor bytes and a signer who does not control the selected Coin', { concurrency: false }, () => quiet(() => {
  const h = makeHarness();
  const input = coins(h.first)[0];
  assert.throws(() => h.sdk.transfer(owner, address(bob), '1', [input.utxo], h.funding(), [h.first], ['57']), /ancestor|legacy|transaction|resolver|proof/i);
  const changedAncestor = new tbc.Transaction(h.source.uncheckedSerialize());
  changedAncestor.outputs[0].satoshis += 1;
  const wrongAncestors = new Map(h.chain).set(h.source.id, changedAncestor);
  assert.throws(() => h.sdk.transfer(owner, address(bob), '1', [input.utxo], h.funding(), [h.first], wrongAncestors), /ancestor|transaction|txid|match|hash/i);
  assert.throws(() => h.sdk.transfer(bob, address(carol), '1', [input.utxo], h.funding(bob), [h.first], h.chain), /control|owner|public|address|sign|holder/i);
}));

test('new facade spends and administrates initialized legacy stablecoins with legacy ancestry proofs', { concurrency: false }, () => quiet(() => {
  const h = makeHarness({ legacy: true });
  assert.equal(h.first.outputs[3].script.toBuffer().length, 2076);
  assert.equal(h.first.outputs[3].script.chunks.at(-1).buf.toString(), '2Code');
  assert.equal(h.first.outputs[4].script.chunks.at(-1).buf.toString(), 'FTape');
  const restored = new StableCoin(h.first.id);
  restored.initialize({ name: 'Local USD', symbol: 'LUSD', decimal: 2, totalSupply: nftSupply(h.first),
    codeScript: h.first.outputs[3].script.toHex(), tapeScript: h.first.outputs[4].script.toHex() });
  const sent = h.check(restored.transfer(owner, address(bob), '12', [buildUTXO(h.first, 3, true)], h.funding(),
    [h.first], [buildFtPrePreTxData(h.first, 3, [h.source])]), 'legacy transfer through current facade');
  assert.equal(buildUTXO(sent, 0, true).ftBalance, 1200n);
  assert.equal(sent.outputs[0].script.toBuffer().length, 2076, 'legacy spend retains its deployed code family');
  assert.equal(StableCoin.getAddressFromCode(sent.outputs[0].script.toHex()).address, ownedBy(bob).slice(0, 40));
  // The legacy path restricts nonzero freezes to timestamps. A zero-lock
  // administrator renewal verifies compatibility without importing new rules.
  const frozen = h.finalize(restored.freezeCoinUTXO(adminPublicKey, owner, 0, [buildUTXO(sent, 0, true)],
    h.funding(), [sent], [buildFtPrePreTxData(sent, 0, [h.first])]), 'legacy administrator zero-lock renewal');
  const thawed = h.finalize(restored.unfreezeCoinUTXO(adminPublicKey, owner, [buildUTXO(frozen, 0, true)], h.funding(),
    [frozen], [buildFtPrePreTxData(frozen, 0, [sent])]), 'legacy administrator unfreeze');
  assert.equal(StableCoin.getLockTimeFromTape(thawed.outputs[1].script), 0);
  assert.equal(StableCoin.getAddressFromCode(thawed.outputs[0].script.toHex()).address, ownedBy(bob).slice(0, 40));
  const onward = h.check(restored.transfer(bob, address(carol), '12', [buildUTXO(thawed, 0, true)], h.funding(bob),
    [thawed], [buildFtPrePreTxData(thawed, 0, [frozen])]), 'legacy holder spends after administrative renewal');
  assert.equal(buildUTXO(onward, 0, true).ftBalance, 1200n);
  const info = Buffer.from('legacy administrator lifecycle completed');
  const returned = h.check(restored.transferWithAdditionalInfo(carol, address(owner), '12', [buildUTXO(onward, 0, true)], h.funding(carol),
    [onward], [buildFtPrePreTxData(onward, 0, [thawed])], info), 'legacy balance returns with additional information');
  assert(returned.outputs.some(output => output.script.isSafeDataOut() && output.script.chunks.at(-1)?.buf?.equals(info)));
  const merged = restored.mergeFT(owner, [buildUTXO(sent, 2, true), buildUTXO(returned, 0, true)], h.funding(), [sent, returned],
    [buildFtPrePreTxData(sent, 2, [h.first]), buildFtPrePreTxData(returned, 0, [onward])], [...h.chain.values()]);
  assert.equal(merged.length, 1, 'legacy mergeFT alias merges two inputs without recursion');
  const result = h.check(merged[0].txraw, 'legacy two-input mergeFT compatibility alias');
  assert.equal(buildUTXO(result, 0, true).ftBalance, 10000n);
}));

test('legacy facade batches seven receivers and converges a merge of more than five inputs', { concurrency: false }, () => quiet(() => {
  const h = makeHarness({ legacy: true });
  const restored = new StableCoin(h.first.id);
  restored.initialize({ name: 'Local USD', symbol: 'LUSD', decimal: 2, totalSupply: nftSupply(h.first),
    codeScript: h.first.outputs[3].script.toHex(), tapeScript: h.first.outputs[4].script.toHex() });
  const batches = restored.batchTransfer(owner, Array.from({ length: 7 }, () => ({ address: address(owner), amount: '1.25' })),
    [buildUTXO(h.first, 3, true)], h.funding(), [h.first], [buildFtPrePreTxData(h.first, 3, [h.source])]);
  assert.equal(batches.length, 2);
  const sent = batches.map((item, index) => h.check(item.txraw, `legacy batch ${index}`));
  const recipients = sent.flatMap(legacyCoins).filter(coin => coin.balance === 125n);
  assert.equal(recipients.length, 7);
  const merged = restored.mergeFT(owner, recipients.map(coin => coin.utxo), h.funding(), recipients.map(coin => coin.tx),
    recipients.map(coin => buildFtPrePreTxData(coin.tx, coin.vout, [...h.chain.values()])), [...h.chain.values()]);
  assert(merged.length >= 2 && merged.length <= 3, 'seven-input legacy merge converges in a finite chain');
  const results = merged.map((item, index) => h.check(item.txraw, `legacy merge ${index}`));
  assert(results.every(tx => tx.inputs.length <= 6));
  assert.equal(buildUTXO(results.at(-1), 0, true).ftBalance, 875n);
}));

test('failed issuance preparation restores state and pending issuance rejects reinitialization', { concurrency: false }, () => quiet(() => {
  const h = makeHarness();
  const fresh = new StableCoin({ name: 'Retry USD', symbol: 'RETRY', amount: '100.25', decimal: 2 });
  const state = coin => ({ codeScript: coin.codeScript, tapeScript: coin.tapeScript, totalSupply: coin.totalSupply, contractTxid: coin.contractTxid });
  const before = state(fresh);
  const fee = h.funding();
  assert.throws(() => fresh.createCoin(adminPublicKey.subarray(1), owner, address(owner), fee, h.root), /32|public|pubkey/i);
  assert.deepEqual(state(fresh), before, 'failed create does not leave a human-unit supply or partial scripts behind');
  const pending = fresh.createCoin(adminPublicKey, owner, address(owner), fee, h.root);
  const info = { name: h.sdk.name, symbol: h.sdk.symbol, decimal: h.sdk.decimal, totalSupply: h.sdk.totalSupply,
    codeScript: h.sdk.codeScript, tapeScript: h.sdk.tapeScript };
  assert.throws(() => fresh.initialize(info), /pending|issuance|finish/i);
  const [source, minted] = h.finalize(pending, 'successful create after failed preparation');
  assert.equal(fresh.totalSupply, 10025n);
  assert.equal(fresh.contractTxid, minted.id);
  const mint = fresh.mintCoin(adminPublicKey, owner, address(owner), '0.75', h.funding(), minted, source);
  assert.throws(() => fresh.initialize(info), /pending|issuance|finish/i);
  h.finalize(mint, 'successful mint after reinitialization was rejected');
  assert.equal(fresh.totalSupply, 10100n);
}));

test('SDK includes additional information as a separate data output while conserving Coin', { concurrency: false }, () => quiet(() => {
  const h = makeHarness();
  const input = coins(h.first)[0];
  const additionalInfo = Buffer.from(JSON.stringify({ invoice: 'offline-42', description: '付款说明' }), 'utf8');
  const sent = h.check(h.sdk.transferWithAdditionalInfo(owner, address(bob), '42', [input.utxo], h.funding(),
    [h.first], h.chain, additionalInfo), 'transfer with additional information');
  assert.deepEqual(coins(sent).map(coin => coin.balance), [4200n, 5800n]);
  const information = sent.outputs.filter(output => output.script.isSafeDataOut()
    && output.script.chunks.at(-1)?.buf?.equals(additionalInfo));
  assert.equal(information.length, 1);
  assert.equal(information[0].satoshis, 0);
  assert.deepEqual(information[0].script.chunks.at(-1).buf, additionalInfo);
}));

test('SDK pays an x-only public-key address and selects Schnorr when that holder spends', { concurrency: false }, () => quiet(() => {
  const h = makeHarness();
  const input = coins(h.first)[0];
  const xOnly = bob.publicKey.toBuffer().subarray(1);
  const hash = tbc.crypto.Hash.sha256ripemd160(xOnly);
  const xOnlyAddress = tbc.Address.fromPublicKeyHash(hash).toString();
  const received = h.check(h.sdk.transfer(owner, xOnlyAddress, '12', [input.utxo], h.funding(), [h.first], h.chain),
    'payment to x-only holder address');
  const held = coins(received).find(coin => coin.controller === `${hash.toString('hex')}00`);
  assert.equal(held.balance, 1200n);
  const spent = h.check(h.sdk.transfer(bob, address(carol), '12', [held.utxo], h.funding(bob), [received], h.chain),
    'x-only holder private-key transfer');
  assert.equal(coins(spent)[0].balance, 1200n);
  assert(spent.inputs[0].script.chunks.some(chunk => chunk.buf?.equals(xOnly)), 'Coin witness carries the 32-byte signing public key');
  assert(spent.inputs.at(-1).script.chunks.at(-1).buf.equals(bob.publicKey.toBuffer()), 'fee input retains its normal compressed P2PKH public key');
}));

test('new Coin rejects generic FT issuance and invalid input identity, balance, and duplicate outpoints', { concurrency: false }, () => quiet(() => {
  const h = makeHarness();
  const input = coins(h.first)[0];
  assert.throws(() => h.sdk.MintFT(), /Coin|issuance|createCoin|mintCoin/i);
  assert.throws(() => h.sdk.getFTmintCode(), /Coin|issuance|MintCode/i);
  const fee = h.funding();
  assert.throws(() => h.sdk.transfer(owner, address(bob), '1', [{ ...input.utxo, ftBalance: input.balance + 1n }],
    fee, [h.first], h.chain), /balance|Tape/i);
  assert.throws(() => h.sdk.transfer(owner, address(bob), '1', [input.utxo, input.utxo], fee, [h.first, h.first], h.chain), /duplicate/i);
  const duplicateFee = { ...fee, txId: input.utxo.txId, outputIndex: input.utxo.outputIndex };
  assert.throws(() => h.sdk.transfer(owner, address(bob), '1', [input.utxo], duplicateFee, [h.first], h.chain), /duplicate/i);
  const foreign = makeHarness();
  const otherInput = coins(foreign.first)[0];
  assert.throws(() => h.sdk.transfer(owner, address(bob), '1', [input.utxo, otherInput.utxo], fee,
    [h.first, foreign.first], new Map([...h.chain, ...foreign.chain])), /identity|coin/i);
  assert.throws(() => h.sdk.transfer(owner, address(bob), '1', [input.utxo], fee, [h.first], h.chain, '0.000001'), /TBC|range|dust/i);
}));
