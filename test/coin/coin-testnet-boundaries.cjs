'use strict';
const assert = require('node:assert/strict');
const { Campaign, withCampaignLock, coins, addr } = require('./coin-testnet-production.cjs');
const { CoinTBC20 } = require('../../lib/util/coinTbc20Code.js');
const { silent } = require('../pool3/pool3-testnet-runner.cjs');

async function boundaries(c) {
  await c.fund();
  const h = await c.create('boundary18', { name: 'T'.repeat(51), symbol: 'BND18X', decimal: 18, amount: '9.223372036854775807' });
  assert.equal(h.first.outputs[4].script.toBuffer().length, 127);
  assert.equal(coins(h.first)[0].balance, (1n << 63n) - 1n);
  const extra = await c.mint('boundary18:mint-one-atomic-unit', h.sdk, h.first, h.issuer, '0.000000000000000001');
  const merged = await c.bundle('boundary18:merge-over-signed63-total', () => h.sdk.mergeCoin(c.key,
    [coins(h.first)[0].utxo, coins(extra)[0].utxo], c.fee(), [h.first, extra], c.j.chain, [...c.j.chain.values()]));
  const total = coins(merged.at(-1))[0];
  assert.equal(total.balance, 1n << 63n);
  assert.deepEqual(total.amounts, [(1n << 63n) - 1n, 1n, 0n, 0n, 0n, 0n]);
  const sent = await c.send('boundary18:split-max-slot-and-one', h.sdk, [total], c.key, addr(c.keys.bob), '9.223372036854775807');
  assert.deepEqual(coins(sent).map(x => x.balance), [(1n << 63n) - 1n, 1n]);
  const paid = await c.send('boundary18:spend-one-atomic-unit', h.sdk, [coins(sent)[1]], c.key, addr(c.keys.carol), '0.000000000000000001');
  assert.equal(coins(paid)[0].balance, 1n);
  const invalidCases = [
    ['negative-amount', '-1'], ['zero-amount', '0'], ['over-precision', '0.0000000000000000001'],
    ['exponent-notation', '1e-18'], ['unsafe-number', Number.MAX_SAFE_INTEGER + 1], ['insufficient-balance', '99'],
  ];
  if (!c.j.events.some(e => e.type === 'boundary-sdk-checks')) {
    const coin = coins(sent)[0], fee = c.fee(c.keys.bob);
    for (const [, value] of invalidCases) assert.throws(() => h.sdk.transfer(c.keys.bob, addr(c.key), value, [coin.utxo], fee, [sent], c.j.chain));
    assert.throws(() => CoinTBC20.buildTape({ amounts: [1n << 63n, 0n, 0n, 0n, 0n, 0n], tapeSize: 66, lockTime: 0 }));
    c.j.append({ type: 'boundary-sdk-checks', localOnly: true, cases: [...invalidCases.map(([name]) => name), 'slot-overflow'], passed: true });
  }
  c.j.append({ type: 'boundary-complete', coinId: h.first.id, latestIssuer: extra.id, decimal: 18, tapeBytes: 127,
    supply: (1n << 63n).toString(), maximumSlot: ((1n << 63n) - 1n).toString() });
  console.log(JSON.stringify({ boundaryCoinId: h.first.id, supply: (1n << 63n).toString(), tapeBytes: 127 }));
}
if (require.main === module) {
  assert(process.argv.includes('--testnet'), 'explicit --testnet required');
  withCampaignLock(() => boundaries(new Campaign())).catch(error => { console.error(error.stack); process.exitCode = 1; });
}
module.exports = { boundaries };
