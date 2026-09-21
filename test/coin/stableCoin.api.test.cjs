'use strict';

// These tests never use the network. Literal JSON integers exercise the real
// response parser before JavaScript Number can round large atomic amounts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const API = require('../../lib/api/api.js');

const coinId = '11'.repeat(32);
const issuerId = '22'.repeat(32);
const controllerHash = '33'.repeat(20);
const base = 'https://api.tbcdev.org/api/tbc/';
const legacyCode = '00'.repeat(2070) + '0532436f6465';
const info = () => ({ code_script: legacyCode, tape_script: '006a054654617065', supply: '100',
  decimal: 0, name: 'Legacy USD', symbol: 'LUSD', utxo: { txid: issuerId } });
const utxo = (overrides = {}) => ({ txid: '44'.repeat(32), index: 3, tbc_value: 500,
  ft_value: '9007199254740993', lock_time: 0, ...overrides });

function response(t, body, status = 200) {
  return t.mock.method(global, 'fetch', async url => {
    assert(String(url).startsWith(base), 'all calls explicitly select testnet');
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  });
}
function success(t, data) { return response(t, { code: '200', message: 'OK', data }); }
const calls = {
  fetchCoinInfo: () => API.fetchCoinInfo(coinId, 'testnet'),
  getCoinbalance: () => API.getCoinbalance(coinId, controllerHash, 'testnet'),
  fetchCoinUTXOList: () => API.fetchCoinUTXOList(coinId, controllerHash, legacyCode, 'testnet'),
  fetchCoinUTXOs: () => API.fetchCoinUTXOs(coinId, controllerHash, 1n, legacyCode, 'testnet', 5),
};

for (const [method, invoke] of Object.entries(calls)) {
  for (const status of [404, 200]) {
    test(`${method} preserves the service error for HTTP ${status}`, async t => {
      response(t, { code: '404', error: 'STABLECOIN_NOT_FOUND', message: 'stablecoin index has no matching contract',
        data: null, request_id: 'public-test-request' }, status);
      await assert.rejects(invoke(), error => {
        assert.match(error.message, /STABLECOIN_NOT_FOUND.*index has no matching contract/);
        assert.equal(error.code, 'STABLECOIN_NOT_FOUND');
        assert.equal(error.status, status);
        assert.equal(error.requestId, 'public-test-request');
        return true;
      });
    });
  }
}

test('Coin responses reject HTTP failure even with a success envelope', async t => {
  response(t, { code: '200', message: 'upstream unavailable', data: { balance: 0 } }, 503);
  await assert.rejects(calls.getCoinbalance(), /HTTP 503.*upstream unavailable/);
});

test('Coin responses reject absent or malformed data and invalid JSON', async t => {
  for (const body of ['not JSON', '{}', '{"code":"200","data":null}', '{"code":"200","data":[]}']) {
    const mock = response(t, body);
    await assert.rejects(calls.getCoinbalance(), /Coin API/);
    mock.mock.restore();
  }
});

test('Coin info preserves legacy scripts, normalizes supply and keeps decimal zero', async t => {
  success(t, info());
  const result = await calls.fetchCoinInfo();
  assert.equal(result.coinInfo.totalSupply, 100n);
  assert.equal(result.coinInfo.decimal, 0);
  assert.equal(result.coinInfo.codeScript, legacyCode);
  assert.equal(result.coinInfo.tapeScript, info().tape_script);
  assert.equal(result.nftTXID, issuerId);
});

for (const literal of ['"9007199254740993"', '9007199254740993']) {
  test(`Coin info preserves large supply encoded as ${literal}`, async t => {
    response(t, JSON.stringify({ code: 200, data: info() }).replace('"supply":"100"', `"supply":${literal}`));
    assert.equal((await calls.fetchCoinInfo()).coinInfo.totalSupply, 9007199254740993n);
  });
}

test('Coin info rejects malformed metadata and unsafe decoded supply', async t => {
  for (const changes of [{ code_script: 'zz' }, { utxo: null }, { decimal: -1 }, { supply: '-1' }]) {
    const mock = success(t, { ...info(), ...changes });
    await assert.rejects(calls.fetchCoinInfo(), /Coin API/);
    mock.mock.restore();
  }
  response(t, JSON.stringify({ code: '200', data: info() }).replace('"supply":"100"', '"supply":9.007199254740992e15'));
  await assert.rejects(calls.fetchCoinInfo(), /supply.*safe integer/);
});

for (const [literal, expected] of [['0', 0n], ['"0"', 0n], ['42', 42n],
  ['"9007199254740993"', 9007199254740993n], ['9007199254740993', 9007199254740993n],
  ['18446744073709551615', 18446744073709551615n]]) {
  test(`Coin balance returns exact bigint for JSON ${literal}`, async t => {
    const mock = response(t, `{"code":"200","data":{"balance":${literal}}}`);
    assert.equal(await calls.getCoinbalance(), expected);
    assert.equal(mock.mock.calls[0].arguments[0], `${base}stablecoin/tokenbalance/combinescript/${controllerHash}01/stablecoinid/${coinId}`);
  });
}

test('Coin balance rejects absent, fractional, negative and unsafe decoded numbers', async t => {
  for (const literal of ['null', 'false', '1.5', '-1', '"-1"', '"1.5"', '9.007199254740992e15']) {
    const mock = response(t, `{"code":"200","data":{"balance":${literal}}}`);
    await assert.rejects(calls.getCoinbalance(), /balance.*integer/);
    mock.mock.restore();
  }
  success(t, {});
  await assert.rejects(calls.getCoinbalance(), /balance.*integer/);
});

test('Coin UTXOs normalize exact amounts, bounded integers and missing legacy lock', async t => {
  const unlocked = utxo({ index: '3', tbc_value: '500', ft_value: '7', lock_time: undefined });
  const locked = utxo({ index: 5, lock_time: '4294967295' });
  success(t, { utxos: [unlocked, locked] });
  const list = await calls.fetchCoinUTXOList();
  assert.deepEqual(list.map(x => [x.outputIndex, x.satoshis, x.ftBalance, x.lockTime]),
    [[3, 500, 7n, 0], [5, 500, 9007199254740993n, 4294967295]]);
  assert(list.every(x => x.script === legacyCode));
});

test('Coin UTXOs preserve an unquoted JSON integer beyond MAX_SAFE_INTEGER', async t => {
  response(t, JSON.stringify({ code: '200', data: { utxos: [utxo()] } })
    .replace('"ft_value":"9007199254740993"', '"ft_value":9007199254740993'));
  assert.equal((await calls.fetchCoinUTXOList())[0].ftBalance, 9007199254740993n);
});

test('Coin UTXOs reject malformed records, non-integer locks and unsafe numeric fields', async t => {
  for (const changes of [{ txid: 'bad' }, { index: -1 }, { index: 4294967296 }, { tbc_value: '9007199254740993' },
    { ft_value: '-1' }, { lock_time: null }, { lock_time: 1.5 }, { lock_time: -1 }, { lock_time: 4294967296 }]) {
    const mock = success(t, { utxos: [utxo(changes)] });
    await assert.rejects(calls.fetchCoinUTXOList(), /Coin API/);
    mock.mock.restore();
  }
  response(t, JSON.stringify({ code: '200', data: { utxos: [utxo()] } })
    .replace('"ft_value":"9007199254740993"', '"ft_value":9.007199254740992e15'));
  await assert.rejects(calls.fetchCoinUTXOList(), /ft_value.*safe integer/);
});

test('Coin UTXOs distinguish malformed arrays from an empty indexed balance', async t => {
  for (const data of [{}, { utxos: null }, { utxos: {} }]) {
    const mock = success(t, data);
    await assert.rejects(calls.fetchCoinUTXOList(), /UTXO array/);
    mock.mock.restore();
  }
  success(t, { utxos: [] });
  await assert.rejects(calls.fetchCoinUTXOList(), /balance.*zero/);
  await assert.rejects(calls.fetchCoinUTXOs(), /balance.*zero/);
});

test('Coin selection uses precise bigint ordering and distinguishes count limits', async t => {
  success(t, { utxos: [utxo({ index: 0, ft_value: '9007199254740992' }),
    utxo({ index: 2, ft_value: '9007199254740993' }), utxo({ index: 4, ft_value: 1 })] });
  const exact = await API.fetchCoinUTXOs(coinId, controllerHash, 9007199254740993n, legacyCode, 'testnet', 1);
  assert.deepEqual(exact.map(x => x.outputIndex), [2]);
  const two = await API.fetchCoinUTXOs(coinId, controllerHash, 9007199254740994n, legacyCode, 'testnet', 2);
  assert.deepEqual(two.map(x => x.outputIndex), [2, 0]);
  await assert.rejects(API.fetchCoinUTXOs(coinId, controllerHash, 9007199254740994n, legacyCode, 'testnet', 1), /within number limit/);
  await assert.rejects(API.fetchCoinUTXOs(coinId, controllerHash, 999999999999999999n, legacyCode, 'testnet'), /not enough/);
});

test('Coin selection rejects lossy amount or count arguments before requesting', async t => {
  const mock = success(t, { utxos: [utxo()] });
  for (const amount of [0n, -1n, 1, '1', 9007199254740992]) {
    await assert.rejects(API.fetchCoinUTXOs(coinId, controllerHash, amount, legacyCode, 'testnet'), /positive bigint/);
  }
  await assert.rejects(API.fetchCoinUTXOs(coinId, controllerHash, 1n, legacyCode, 'testnet', 9007199254740992), /positive integer/);
  assert.equal(mock.mock.callCount(), 0);
});
