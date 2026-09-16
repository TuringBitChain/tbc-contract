'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const StableCoin = require('../../lib/contract/stableCoin.js');
const LegacyStableCoin = require('../../lib/contract/stableCoinLegacy.js');
const TBC721 = require('../../lib/contract/tbc721.js');
const { CoinTBC20 } = require('../../lib/contract/coinTbc20.js');
const { tbc, owner, bob, admin, stranger, address, sha, quiet, makeHarness, buildUTXO } = require('../tbc721/helpers.cjs');

const adminPublicKey = admin.publicKey.toBuffer().subarray(1);
const adminHash = tbc.crypto.Hash.sha256ripemd160(adminPublicKey).toString('hex');
const supply = tx => BigInt(JSON.parse(tx.outputs[2].script.chunks.at(-2).buf.toString()).coinTotalSupply);
const snapshot = sdk => ({ totalSupply: sdk.totalSupply, codeScript: sdk.codeScript,
  tapeScript: sdk.tapeScript, contractTxid: sdk.contractTxid });

function signatures(prepared, k = admin) {
  return prepared.sighashes.map(({ inputIndex, sighash }) => {
    const expected = tbc.crypto.Hash.sha256sha256(Buffer.from(prepared.tx.getPreimage(inputIndex, 0x41), 'hex'));
    assert.deepEqual(sighash, expected, 'administrator digest describes final outputs');
    const previous = prepared.tx.inputs[inputIndex].output;
    return tbc.Transaction.sighash.signSchnorr(prepared.tx, k, 0x41,
      inputIndex, previous.script, previous.satoshisBN).schnorrSig;
  });
}

function finish(h, pending, label) {
  const before = pending.tx.outputs.map(output => [output.satoshis, output.script.toHex()]);
  const result = pending.finalize(signatures(pending));
  assert.deepEqual(pending.tx.outputs.map(output => [output.satoshis, output.script.toHex()]), before,
    'administrator finalization retains all signed outputs');
  return Array.isArray(result) ? result.map((raw, i) => h.check(raw, `${label} ${i}`)) : h.check(result, label);
}

function fixture(Class = StableCoin) {
  const h = makeHarness();
  const sdk = new Class({ name: 'TBC721 USD', symbol: 'TUSD', amount: Class === LegacyStableCoin ? '10' : '10.25', decimal: 2 });
  const fee = h.funding();
  assert.equal(fee.outputIndex, 5, 'first issuer ancestor spends nonzero funding vout');
  const pending = sdk.createCoin(adminPublicKey, owner, address(owner), fee, h.root, 'TBC721 issuance');
  const [source, minted] = finish(h, pending, 'createCoin');
  return { ...h, sdk, source, minted };
}

test('new Coin issuance uses TBC721 from a nonzero funding output and survives consecutive mint and transfer', () => quiet(() => {
  const h = fixture();
  assert.equal(TBC721.isTBC721Code(h.source.outputs[0].script), true);
  assert.deepEqual(TBC721.parseCode(h.source.outputs[0].script).originalUTXO,
    Buffer.concat([Buffer.from(h.root.id, 'hex').reverse(), Buffer.from('05000000', 'hex')]));
  assert.equal(supply(h.source), 0n);
  assert.equal(supply(h.minted), 1025n);
  assert.equal(h.sdk.totalSupply, 1025n);
  assert.equal(h.minted.inputs[0].script.chunks.length, 20);
  assert.equal(h.minted.inputs[0].script.chunks[0].buf.length, 65, 'issuer uses Schnorr signature plus sighash byte');
  assert.deepEqual(h.minted.inputs[0].script.chunks[1].buf, adminPublicKey);
  assert.deepEqual(h.minted.inputs[1].script.chunks[1].buf, adminPublicKey);
  const code = CoinTBC20.parseCode(h.minted.outputs[3].script);
  assert.deepEqual(code.coinNftCodeHash, sha(h.source.outputs[0].script.toBuffer()));

  const pending = h.sdk.mintCoin(adminPublicKey, owner, address(owner), '0.75', h.funding(), h.minted, h.source);
  assert.deepEqual(pending.sighashes.map(entry => entry.inputIndex), [0, 1]);
  assert.equal(h.sdk.totalSupply, 1025n, 'prepared issuance has not committed supply');
  const renewed = finish(h, pending, 'first renewal');
  assert.equal(supply(renewed), 1100n);
  assert.equal(h.sdk.totalSupply, 1100n);
  const again = finish(h, h.sdk.mintCoin(adminPublicKey, owner, address(owner), '1', h.funding(), renewed, h.minted), 'second renewal');
  assert.equal(supply(again), 1200n);
  assert.equal(h.sdk.contractTxid, h.minted.id, 'stable identity survives later issuances');
  for (const tx of [h.minted, renewed, again]) {
    assert.equal(tx.outputs[0].script.toHex(), h.source.outputs[0].script.toHex());
    assert.deepEqual(CoinTBC20.getCodeIdentity(tx.outputs[3].script), code.identity);
    assert.deepEqual(tx.outputs.slice(0, 5).map(output => output.satoshis), [200, 100, 0, 500, 0]);
  }
  const sent = h.check(h.sdk.transfer(owner, address(bob), '1', [buildUTXO(again, 3, true)],
    h.funding(), [again], h.chain), 'spend renewed Coin');
  assert.equal(CoinTBC20.parseTape(sent.outputs[1].script).balance, 100n);
  assert.deepEqual(CoinTBC20.parseCode(sent.outputs[0].script).coinNftCodeHash, code.coinNftCodeHash);
}));

test('TBC721 Coin mint rejects a wrong ancestor and restores committed state', () => quiet(() => {
  const h = fixture(), before = snapshot(h.sdk);
  const wrong = new tbc.Transaction(h.source.uncheckedSerialize());
  wrong.outputs[0].satoshis += 1;
  assert.throws(() => h.sdk.mintCoin(adminPublicKey, owner, address(owner), '1', h.funding(), h.minted, wrong),
    /ancestor|grandparent|transaction|txid|match|hash|parent/i);
  assert.deepEqual(snapshot(h.sdk), before);
  const minted = finish(h, h.sdk.mintCoin(adminPublicKey, owner, address(owner), '1', h.funding(), h.minted, h.source), 'retry after rejected ancestry');
  assert.equal(supply(minted), 1125n);
}));

test('TBC721 Coin mint requires the bound administrator and valid signatures for both issuer inputs', () => quiet(() => {
  const h = fixture(), before = snapshot(h.sdk);
  assert.throws(() => h.sdk.mintCoin(stranger.publicKey.toBuffer().subarray(1), owner, address(owner), '1',
    h.funding(), h.minted, h.source), /admin|public|signature/i);
  assert.deepEqual(snapshot(h.sdk), before);
  const pending = h.sdk.mintCoin(adminPublicKey, owner, address(owner), '1', h.funding(), h.minted, h.source);
  const valid = signatures(pending), invalid = signatures(pending, stranger);
  assert.throws(() => pending.finalize([invalid[0], valid[1]]), /signature|schnorr|admin|verify/i);
  assert.throws(() => pending.finalize([valid[0], invalid[1]]), /signature|schnorr|admin|verify/i);
  assert.equal(h.sdk.totalSupply, before.totalSupply);
  assert.throws(() => h.sdk.mintCoin(adminPublicKey, owner, address(owner), '1', h.funding(), h.minted, h.source), /pending|issuance|finish/i);
  h.check(pending.finalize(valid), 'valid administrator retry');
  assert.equal(h.sdk.totalSupply, 1125n);
  assert.throws(() => pending.finalize(valid), /already|finaliz/i);
}));

test('TBC721 Coin preparation detects mutation of the signed issuer output', () => quiet(() => {
  const h = fixture();
  const pending = h.sdk.mintCoin(adminPublicKey, owner, address(owner), '1', h.funding(), h.minted, h.source);
  const signed = signatures(pending);
  pending.tx.outputs[0].setScript(TBC721.buildCodeScript(h.root.id, 0));
  assert.throws(() => pending.finalize(signed), /chang|signature|transaction|context/i);
  assert.equal(h.sdk.totalSupply, 1025n);
}));

test('initialized Coin TBC20 with an existing coinNft issuer can still mint without changing its identity', () => quiet(() => {
  const h = makeHarness();
  const issuer = h.check(LegacyStableCoin.buildCoinNftTX(owner, adminHash, h.funding(), {
    nftName: 'Existing USD NFT', nftSymbol: 'EUSD NFT', description: 'Existing issuance certificate',
    coinDecimal: 2, coinTotalSupply: '0',
  }), 'legacy issuer source');
  assert.equal(TBC721.isTBC721Code(issuer.outputs[0].script), false);
  const metadata = new tbc.Script().add(Buffer.from([2])).add(Buffer.from('Existing USD')).add(Buffer.from('EUSD')).toBuffer();
  const tape = CoinTBC20.buildTape({ amounts: [0n, 0n, 0n, 0n, 0n, 0n], tapeSize: 66 + metadata.length, lockTime: 0, metadata });
  const code = StableCoin.getCoinMintCode(adminHash, address(owner), sha(issuer.outputs[0].script.toBuffer()).toString('hex'), tape.toBuffer().length);
  const sdk = new StableCoin(issuer.id);
  sdk.initialize({ name: 'Existing USD', symbol: 'EUSD', decimal: 2, totalSupply: 0n,
    codeScript: code.toHex(), tapeScript: tape.toHex() });
  const minted = finish(h, sdk.mintCoin(adminPublicKey, owner, address(owner), '10', h.funding(), issuer, h.root), 'old-certificate Coin issuance');
  assert.equal(minted.outputs[0].script.toHex(), issuer.outputs[0].script.toHex());
  assert.equal(supply(minted), 1000n);
  assert.deepEqual(CoinTBC20.getCodeIdentity(minted.outputs[3].script), CoinTBC20.getCodeIdentity(code));
  const sent = h.check(sdk.transfer(owner, address(bob), '1', [buildUTXO(minted, 3, true)], h.funding(), [minted], h.chain),
    'spend Coin backed by old certificate');
  assert.equal(CoinTBC20.parseTape(sent.outputs[1].script).balance, 100n);
}));

test('legacy stablecoin issuance retains coinNft and remains mintable through the current facade', () => quiet(() => {
  const h = fixture(LegacyStableCoin);
  assert.equal(TBC721.isTBC721Code(h.source.outputs[0].script), false);
  assert.equal(h.source.outputs[0].script.chunks.at(-1).buf.toString(), '3Code');
  assert.equal(h.minted.outputs[3].script.chunks.at(-1).buf.toString(), '2Code');
  const restored = new StableCoin(h.minted.id);
  restored.initialize({ name: 'TBC721 USD', symbol: 'TUSD', decimal: 2, totalSupply: supply(h.minted),
    codeScript: h.minted.outputs[3].script.toHex(), tapeScript: h.minted.outputs[4].script.toHex() });
  const renewed = finish(h, restored.mintCoin(adminPublicKey, owner, address(owner), '1', h.funding(), h.minted, h.source), 'legacy mint through facade');
  assert.equal(renewed.outputs[0].script.toHex(), h.source.outputs[0].script.toHex());
  assert.equal(renewed.outputs[3].script.chunks.at(-1).buf.toString(), '2Code');
  assert.equal(supply(renewed), 1100n);
}));
