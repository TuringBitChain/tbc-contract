'use strict';
// Observation loads signed public transactions only; no wallet or signing key.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const tbc = require('tbc-lib-js');
const { TestnetJournal } = require('../pool3/pool3-testnet-runner.cjs');
const { DIRECTORY, withCampaignLock } = require('./coin-testnet-production.cjs');
const { auditCoinJournal } = require('./coin-testnet-audit.cjs');

async function observe({ settle = false } = {}) {
  const j = new TestnetJournal(DIRECTORY);
  const node = await j.read('nodeinfo');
  j.append({ type: 'node-observation', node });
  tbc.Script.Interpreter.MAX_SCRIPT_ELEMENT_SIZE = Number.MAX_SAFE_INTEGER;
  tbc.Script.Interpreter.MAXIMUM_ELEMENT_SIZE = Number.MAX_SAFE_INTEGER;
  const load = id => {
    assert(/^[0-9a-f]{64}$/.test(id));
    const tx = new tbc.Transaction(fs.readFileSync(path.join(DIRECTORY, `${id}.raw`), 'utf8'));
    assert.equal(tx.id, id); return tx;
  };
  for (const saved of j.events.filter(e => e.type === 'future-reservation')) {
    if (j.chain.has(saved.txid)) continue;
    const mature = saved.kind === 'height' ? node.blocks >= saved.lockTime : node.mediantime > saved.lockTime;
    j.append({ type: 'future-maturity-observation', txid: saved.txid, kind: saved.kind, lockTime: saved.lockTime, mature, node });
    if (!mature || !settle) continue;
    const tx = load(saved.txid); j.attach(tx);
    if (j.unresolved.has(tx.id)) {
      // An acknowledged queued transaction is reconciled by exact raw visibility.
      const raw = await j.read(`txraw/txid/${tx.id}`);
      assert.equal(raw.txraw, tx.uncheckedSerialize());
      j.append({ type: 'accepted', label: `${saved.label}:mature-reconciled`, txid: tx.id, feeSat: saved.feeSat, rawRetrieved: true });
      j.chain.set(tx.id, tx); j.unresolved.delete(tx.id);
      tx.inputs.forEach(i => j.spent.add(`${i.prevTxId.toString('hex')}:${i.outputIndex}`));
    } else {
      assert(j.events.some(e => e.type === 'rejected' && e.txid === tx.id), 'only explicitly rejected exact raw may be retried');
      assert.equal(await j.broadcast(tx, `${saved.label}:after-maturity`), true);
    }
    j.append({ type: 'future-maturity-complete', txid: tx.id, rawUnchanged: true, node });
  }
  const blocks = new Map();
  async function block(hash) {
    if (!blocks.has(hash)) {
      const data = await j.read(`blockByHash/hash/${hash}`);
      assert.equal(data.hash, hash);
      blocks.set(hash, data);
    }
    return blocks.get(hash);
  }
  let confirmed = 0, unconfirmed = 0;
  const ids = j.events.filter(e => e.type === 'accepted').map(e => e.txid);
  for (const txid of ids) {
    const [raw, decode] = await Promise.all([j.read(`txraw/txid/${txid}`), j.read(`decode/txid/${txid}`)]);
    const tx = j.chain.get(txid); assert.equal(raw.txraw, tx.uncheckedSerialize()); assert.equal(decode.txid, txid);
    const confirmations = decode.confirmations || 0;
    const record = { type: 'chain-observation', txid, rawMatches: true, confirmations, blockhash: decode.blockhash || null,
      blockheight: decode.blockheight ?? null, observedTip: node.blocks, lockTime: tx.nLockTime };
    if (confirmations > 0) {
      confirmed++;
      const confirmedBlock = await block(decode.blockhash);
      assert(confirmedBlock.tx.includes(txid), 'transaction must actually occur in the identified block');
      assert.equal(confirmedBlock.height, decode.blockheight);
      record.blockMembershipVerified = true;
      record.blockPreviousHash = confirmedBlock.previoushash;
      if (tx.nLockTime > 0 && tx.inputs.some(i => i.sequenceNumber !== 0xffffffff)) {
        if (tx.nLockTime < 500000000) assert(decode.blockheight > tx.nLockTime, 'strict height finality');
        else {
          let previous = confirmedBlock.previoushash;
          const headers = [];
          for (let i = 0; i < 11; i++) {
            const b = await block(previous); headers.push({ hash: b.hash, height: b.height, time: b.time, previoushash: b.previoushash }); previous = b.previoushash;
          }
          const mtp = headers.map(h => h.time).sort((a, b) => a - b)[5];
          assert(tx.nLockTime < mtp, 'strict previous-block median-time finality');
          record.timestampFinality = { previousBlockMTP: mtp, headers, verified: true };
        }
      }
    } else unconfirmed++;
    j.append(record);
  }
  const report = auditCoinJournal(DIRECTORY);
  fs.writeFileSync(path.join(DIRECTORY, 'audit-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  const pending = j.events.filter(e => e.type === 'future-reservation' && !j.chain.has(e.txid)).map(e => ({ txid: e.txid, kind: e.kind, lockTime: e.lockTime }));
  const result = { confirmed, unconfirmed, accepted: ids.length, pending, tip: node.blocks, medianTime: node.mediantime };
  console.log(JSON.stringify(result)); return result;
}

if (require.main === module) {
  const settle = process.argv.includes('--settle-future');
  if (settle) assert(process.argv.includes('--testnet'), 'explicit --testnet required for exact-raw retry');
  withCampaignLock(async () => {
    let previousTip;
    do {
      const j = new TestnetJournal(DIRECTORY), tip = (await j.read('nodeinfo')).bestblockhash;
      if (tip !== previousTip) {
        const result = await observe({ settle }); previousTip = tip;
        if (result.unconfirmed === 0 && result.pending.length === 0) return;
      }
      if (!process.argv.includes('--wait-confirmations')) return;
      await new Promise(resolve => setTimeout(resolve, 30000));
    } while (true);
  }).catch(error => { console.error(error.stack); process.exitCode = 1; });
}
module.exports = { observe };
