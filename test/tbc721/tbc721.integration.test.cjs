'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const TBC721 = require('../../lib/contract/tbc721.js');
const NFT = require('../../lib/contract/nft.js');
const { tbc, owner, bob, carol, address, inputsData, makeHarness, buildUTXO } = require('./helpers.cjs');

const MARKER = Buffer.from('TBC721CODE3');
const metadata = { nftName: 'Offline TBC721', symbol: '721', description: 'Offline ownership chain', attributes: '{}' };

function fixture(Class = TBC721, mintVout = 5) {
  const h = makeHarness();
  const collection = h.check(Class.createCollection(address(owner), owner,
    { collectionName: 'Local collection', description: 'Offline collection', supply: 6, file: '' }, [h.funding()]), 'collection', Class === NFT ? 0 : 80);
  const minted = h.check(Class.createNFT(collection.id, address(owner), owner, { ...metadata },
    [h.funding()], buildUTXO(collection, mintVout)), 'NFT mint');
  const sdk = new Class(minted.id);
  sdk.initialize({ collectionId: collection.id, collectionIndex: mintVout, collectionName: 'Local collection',
    nftName: metadata.nftName, nftSymbol: metadata.symbol, nft_attributes: metadata.attributes,
    nftDescription: metadata.description, nftTransferTimeCount: 0, nftIcon: '' });
  return { ...h, collection, minted, sdk };
}

function prepare(h, parent = h.minted, grandparent = h.collection, from = owner, to = bob) {
  return h.hydrate(h.sdk.transferNFT(address(from), address(to), from, [h.funding(from)], parent, grandparent));
}

function replaceLeaf(script, index, value) {
  const copy = new tbc.Script(script.toHex());
  copy.chunks[index] = new tbc.Script().add(value).chunks[0];
  return copy;
}

function rejectsCode(h, tx, vin = 0) {
  const results = h.reports(tx);
  assert.equal(results[vin].ok, false, JSON.stringify(results));
  assert.equal(results[vin].error, 'SCRIPT_ERR_EQUALVERIFY', 'authenticated proof or position must reject before CHECKSIG');
  assert(results.filter(result => result.vin !== vin).every(result => result.ok), JSON.stringify(results));
}

test('TBC721 collection mints from a nonzero slot and transfers through three owners', () => {
  const h = fixture();
  assert.equal(h.collection.outputs[0].satoshis, 0);
  for (let slot = 1; slot <= 6; slot++) assert.equal(h.collection.outputs[slot].satoshis, 100);
  assert.equal(h.minted.inputs[0].outputIndex, 5);
  const original = TBC721.parseCode(h.minted.outputs[0].script);
  assert.equal(original.txid, h.collection.id);
  assert.equal(original.outputIndex, 5);
  assert.equal(TBC721.getNFTVersion(h.minted.outputs[0].script), 3);
  assert(h.minted.outputs[0].script.toBuffer().subarray(-MARKER.length).equals(MARKER));
  const first = h.check(prepare(h), 'first owner transfer');
  const second = h.check(prepare(h, first, h.minted, bob, carol), 'second owner transfer');
  const third = h.check(prepare(h, second, first, carol, owner), 'third owner transfer');
  for (const tx of [first, second, third]) {
    assert.equal(tx.inputs[0].outputIndex, 0);
    assert.equal(tx.inputs[0].script.chunks.length, 20, 'compiled TBC721 ABI has twenty leaves');
    assert.equal(tx.outputs[0].script.toHex(), h.minted.outputs[0].script.toHex());
    assert.deepEqual(tx.outputs.slice(0, 3).map(output => output.satoshis), [200, 100, 0]);
    assert.equal(tx.outputs[1].script.chunks.at(-1).buf.toString().includes('NHold'), true);
    assert.equal(tx.outputs[2].script.chunks.at(-1).buf.toString(), 'NTape');
    assert.equal(tx.outputs[2].script.toHex(), h.minted.outputs[2].script.toHex());
  }
  assert.equal(third.outputs[1].script.toHex(), TBC721.buildHoldScript(address(owner)).toHex());
});

test('TBC721 transfers NFT and exact six-decimal TBC amount in one valid transaction', () => {
  const h = fixture();
  const sent = h.check(h.sdk.transferNFTWithTBC(address(owner), address(bob), address(carol), owner,
    [h.funding()], h.minted, h.collection, 0.001234), 'NFT and native TBC');
  assert.equal(sent.outputs[3].satoshis, 1234);
  assert.equal(sent.outputs[3].script.toHex(), tbc.Script.buildPublicKeyHashOut(carol.toAddress()).toHex());
  h.check(prepare(h, sent, h.minted, bob, owner), 'spend NFT after native payment');
});

test('TBC721 batch mints separate nonzero slots with chained fee change and each NFT remains spendable', () => {
  const h = fixture();
  const slots = [1, 3, 6];
  const data = slots.map(slot => ({ ...metadata, nftName: `Offline NFT ${slot}` }));
  const before = JSON.parse(JSON.stringify(data));
  const batch = TBC721.batchCreateNFT(h.collection.id, address(owner), owner, data,
    [h.funding()], slots.map(slot => buildUTXO(h.collection, slot)));
  assert.equal(batch.length, slots.length);
  assert.deepEqual(data, before, 'batch does not rewrite caller metadata');
  let previous;
  for (const [index, item] of batch.entries()) {
    const tx = h.check(item.txraw, `batch mint ${index}`);
    assert.equal(TBC721.parseCode(tx.outputs[0].script).outputIndex, slots[index]);
    if (previous) {
      assert.equal(tx.inputs[1].prevTxId.toString('hex'), previous.id);
      assert.equal(tx.inputs[1].outputIndex, 3);
    }
    h.check(prepare(h, tx, h.collection), `batch NFT ${index} first spend`);
    previous = tx;
  }
});

for (const [name, index, mutate] of [
  ['omitted fee input in current input commitment', 5, bytes => bytes.subarray(0, -40)],
  ['corrupted grandparent output commitment', 11, bytes => { bytes[0] ^= 1; return bytes; }],
  ['corrupted parent Hold owner', 18, bytes => { bytes[3] ^= 1; return bytes; }],
]) {
  test(`TBC721 interpreter rejects ${name} with all other inputs valid`, () => {
    const h = fixture(), tx = prepare(h);
    assert(h.reports(tx).every(result => result.ok), 'unmodified witness control succeeds');
    const original = tx.inputs[0].script.chunks[index].buf;
    assert(original?.length, 'selected compiled ABI leaf contains a proof');
    tx.inputs[0].setScript(replaceLeaf(tx.inputs[0].script, index, mutate(Buffer.from(original))));
    rejectsCode(h, tx);
  });
}

test('TBC721 input-zero contract rule rejects a reordered transaction with fresh authentic proofs and signatures', () => {
  const h = fixture(), authentic = prepare(h);
  assert(h.reports(authentic).every(result => result.ok));
  const tx = h.hydrate(authentic.uncheckedSerialize());
  tx.inputs = [tx.inputs[2], tx.inputs[0], tx.inputs[1]];
  h.signP2PKH(tx, 0);
  h.signP2PKH(tx, 2);
  let witness = replaceLeaf(tx.inputs[1].script, 0, h.sign(tx, 1));
  witness = replaceLeaf(witness, 5, inputsData(tx));
  tx.inputs[1].setScript(witness);
  rejectsCode(h, tx, 1);
});

test('TBC721 SDK rejects mismatched ancestry before producing a transaction', () => {
  const h = fixture();
  const changed = new tbc.Transaction(h.collection.uncheckedSerialize());
  changed.outputs[5].satoshis += 1;
  assert.throws(() => prepare(h, h.minted, changed), /ancestor|grandparent|transaction|txid|match|hash|parent/i);
  const tx = prepare(h);
  assert.throws(() => TBC721.buildUnlockScript(owner, tx, h.minted, h.collection, 1), /input|zero|index|vin/i);
});

test('legacy NFT remains independently usable and retains its original code family', () => {
  const h = fixture(NFT);
  const oldCode = h.minted.outputs[0].script;
  assert.equal(oldCode.toHex(), NFT.buildCodeScript(h.collection.id, 5).toHex());
  assert.notEqual(oldCode.toHex(), TBC721.buildCodeScript(h.collection.id, 5).toHex());
  assert.equal(TBC721.isTBC721Code(oldCode), false);
  assert.equal(TBC721.getNFTVersion(oldCode), -1);
  assert.equal(typeof NFT.prototype.transferNFT_v1, 'function');
});
