'use strict';
// Read-only acceptance check. Derives addresses from public keys in the journal.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const tbc = require('tbc-lib-js');
const API = require('../../lib/api/api.js');
const { CoinTBC20 } = require('../../lib/util/coinTbc20Code.js');
const { TestnetJournal } = require('../pool3/pool3-testnet-runner.cjs');
const { DIRECTORY, BASE, coins } = require('./coin-testnet-production.cjs');
const json = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item, 2);

async function inspectIndexer() {
  const j = new TestnetJournal(DIRECTORY), init = j.events.find(e => e.type === 'campaign-init');
  assert(init && init.endpoint === BASE);
  const started = new Date().toISOString(), accepted = j.events.filter(e => e.type === 'accepted');
  const first = ['usd:create:1', 'bigint:create:1', 'boundary18:create:1'].map(label => {
    const event = accepted.find(e => e.label === label); assert(event); return j.chain.get(event.txid);
  });
  const addresses = Object.fromEntries(['owner', 'bob', 'carol'].map(role => [role, new tbc.PublicKey(init.signerPublicKeys[role]).toAddress().toString()]));
  const results = [];
  async function call(fn) {
    try { const value = await fn(); return { ok: true, type: typeof value, value }; }
    catch (error) { return { ok: false, error: error.message, code: error.code, status: error.status, requestId: error.requestId }; }
  }
  async function http(endpoint) {
    const response = await fetch(BASE + endpoint, { redirect: 'error', signal: AbortSignal.timeout(20000) });
    return { endpoint: BASE + endpoint, status: response.status, bodyText: await response.text() };
  }
  for (const mint of first) {
    const coin = coins(mint)[0], identity = CoinTBC20.getCodeIdentity(mint.outputs[coin.vout].script);
    const descriptor = CoinTBC20.parseCode(mint.outputs[coin.vout].script);
    const issuer = accepted.map(e => j.chain.get(e.txid)).findLast(tx => tx.outputs[0] &&
      tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()).equals(descriptor.coinNftCodeHash));
    assert(issuer);
    const metadata = JSON.parse(issuer.outputs[2].script.chunks.at(-2).buf.toString());
    const live = accepted.flatMap(e => coins(j.chain.get(e.txid))).filter(c => !j.spent.has(`${c.tx.id}:${c.vout}`)
      && CoinTBC20.getCodeIdentity(c.tx.outputs[c.vout].script).equals(identity));
    const decode = await j.read(`decode/txid/${mint.id}`);
    const info = await call(() => API.fetchCoinInfo(mint.id, 'testnet'));
    let metadataMatches = false;
    if (info.ok) {
      try {
        metadataMatches = info.value.nftTXID === issuer.id && info.value.coinInfo.totalSupply === BigInt(metadata.coinTotalSupply)
          && info.value.coinInfo.decimal === metadata.coinDecimal
          && info.value.coinInfo.name + ' NFT' === metadata.nftName && info.value.coinInfo.symbol + ' NFT' === metadata.nftSymbol
          && CoinTBC20.getCodeIdentity(info.value.coinInfo.codeScript).equals(identity);
      } catch { metadataMatches = false; }
    }
    const report = { coinId: mint.id, confirmations: decode.confirmations || 0, blockheight: decode.blockheight, latestIssuer: issuer.id, metadataMatches,
      rawLiveSupply: live.reduce((n, c) => n + c.balance, 0n), info, httpInfo: await http(`stablecoin/info/stablecoinid/${mint.id}`), holders: [] };
    for (const [role, address] of Object.entries(addresses)) {
      const controller = tbc.Address.fromString(address).hashBuffer.toString('hex') + '00';
      const expected = live.filter(c => c.controller === controller);
      const expectedBalance = expected.reduce((n, c) => n + c.balance, 0n);
      const code = CoinTBC20.replaceController(mint.outputs[coin.vout].script, Buffer.from(controller, 'hex')).toHex();
      const balance = await call(() => API.getCoinbalance(mint.id, address, 'testnet'));
      const utxos = await call(() => API.fetchCoinUTXOList(mint.id, address, code, 'testnet'));
      const selected = expectedBalance > 0n ? await call(() => API.fetchCoinUTXOs(mint.id, address, 1n, code, 'testnet')) : null;
      const expectedRefs = expected.map(c => `${c.tx.id}:${c.vout}:${c.balance}:${c.lockTime}`).sort();
      const returnedRefs = utxos.ok ? utxos.value.map(u => `${u.txId}:${u.outputIndex}:${u.ftBalance}:${u.lockTime}`).sort() : [];
      const utxosMatch = expectedRefs.join() === returnedRefs.join() && (expected.length === 0 || utxos.ok);
      const selectionMatches = expectedBalance === 0n || (selected?.ok && selected.value.length > 0 &&
        selected.value.every(u => expected.some(c => c.tx.id === u.txId && c.vout === u.outputIndex && c.balance === u.ftBalance && c.lockTime === u.lockTime)) &&
        selected.value.reduce((n, u) => n + u.ftBalance, 0n) >= 1n);
      report.holders.push({ role, address, expectedBalance, expectedUTXOs: expected.map(c => ({ txid: c.tx.id, vout: c.vout, amount: c.balance, lockTime: c.lockTime })),
        balance, balanceMatches: balance.ok && typeof balance.value === 'bigint' && balance.value === expectedBalance,
        utxos, utxosMatch, selection: selected, selectionMatches,
        httpBalance: await http(`stablecoin/tokenbalance/combinescript/${controller}/stablecoinid/${mint.id}`),
        httpUTXOs: await http(`stablecoin/utxo/combinescript/${controller}/stablecoinid/${mint.id}`) });
    }
    results.push(report);
  }
  const current = new TestnetJournal(DIRECTORY).events.filter(e => e.type === 'accepted');
  const unchanged = current.map(e => e.txid).join() === accepted.map(e => e.txid).join();
  assert(unchanged, 're-run indexer comparison if the accepted ledger changed during queries');
  const report = { observedAt: started, finishedAt: new Date().toISOString(), endpoint: BASE, acceptedSetUnchangedDuringQueries: unchanged,
    acceptedTransactions: accepted.length, results, ready: results.every(r => r.info.ok && r.metadataMatches && r.holders.every(h => h.balanceMatches && h.utxosMatch && h.selectionMatches)) };
  fs.writeFileSync(path.join(DIRECTORY, 'indexer-report.json'), json(report) + '\n', { mode: 0o600 });
  console.log(json({ observedAt: started, ready: report.ready, coins: results.map(r => ({ coinId: r.coinId, confirmations: r.confirmations, info: r.info.ok ? 'ok' : r.info.code,
    balanceMismatches: r.holders.filter(h => !h.balanceMatches).map(h => h.role) })) }));
  return report;
}
if (require.main === module) inspectIndexer().catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { inspectIndexer };
