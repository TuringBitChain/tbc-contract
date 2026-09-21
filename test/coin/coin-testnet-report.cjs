'use strict';
// Builds the portable public evidence snapshot after all transactions confirm.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { auditCoinJournal } = require('./coin-testnet-audit.cjs');
const { DIRECTORY } = require('./coin-testnet-production.cjs');
const ROOT = path.resolve(__dirname, '../..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function report() {
  const audit = auditCoinJournal(DIRECTORY);
  assert.equal(audit.unresolved.length, 0);
  assert.equal(audit.nodeObservations.confirmed, audit.accepted, 'every accepted transaction must have a recorded confirmation');
  assert.equal(audit.nodeObservations.unobserved.length, 0);
  const journal = fs.readFileSync(path.join(DIRECTORY, 'journal.jsonl'));
  const events = journal.toString().trim().split('\n').map(JSON.parse);
  const indexer = JSON.parse(fs.readFileSync(path.join(DIRECTORY, 'indexer-report.json')));
  const verification = JSON.parse(fs.readFileSync(path.join(DIRECTORY, 'verification-summary.json')));
  assert.equal(indexer.acceptedTransactions, audit.accepted);
  assert(indexer.acceptedSetUnchangedDuringQueries);
  assert(indexer.results.every(r => r.confirmations > 0));
  const latest = new Map(audit.nodeObservations.latest.map(e => [e.txid, e]));
  const prepared = new Map(events.filter(e => e.type === 'prepared').map(e => [e.txid, e]));
  const accepted = events.filter(e => e.type === 'accepted').map(e => ({ label: e.label, txid: e.txid,
    feeSat: e.feeSat, bytes: prepared.get(e.txid).bytes, confirmations: latest.get(e.txid).confirmations,
    blockheight: latest.get(e.txid).blockheight, blockhash: latest.get(e.txid).blockhash }));
  // Include the extracted codec when recording the current implementation.
  // Archived reports and their historical source-hash keys remain unchanged.
  const artifactFiles = ['lib/api/api.ts', 'lib/api/api.js', 'lib/contract/stableCoin.ts', 'lib/contract/stableCoin.js',
    'lib/contract/coinTbc20.ts', 'lib/contract/coinTbc20.js',
    'lib/util/coin/coinTbc20Code.ts', 'lib/util/coin/coinTbc20Code.js',
    'lib/util/coin/coinTbc20unlock.ts', 'lib/util/coin/coinTbc20unlock.js', 'lib/util/coin/artifacts/coin_tbc20.json'];
  const value = { generatedAt: new Date().toISOString(), network: 'testnet', endpoint: audit.endpoint,
    acceptance: { contractScenariosPassed: true, allAcceptedTransactionsConfirmed: true, indexerPassed: indexer.ready,
      productionReleasePassed: false, blockers: ['Stablecoin indexer does not return the confirmed new assets'],
      nonfinalQueue: 'Both premature requests returned non-final-pool-full; exact-raw retries succeeded after maturity. Automatic queue promotion was not validated.' },
    sourceHashes: Object.fromEntries(artifactFiles.map(file => [file, hash(fs.readFileSync(path.join(ROOT, file)))])),
    journalSHA256: hash(journal), verification, accepted,
    rawFiles: Object.fromEntries(fs.readdirSync(DIRECTORY).filter(f => /^[0-9a-f]{64}\.raw$/.test(f)).sort().map(file => [file,
      hash(fs.readFileSync(path.join(DIRECTORY, file)))])),
    maturity: events.filter(e => ['future-submitted', 'future-maturity-complete'].includes(e.type)),
    recovery: events.filter(e => e.type === 'restart-idempotency-verified'),
    audit, indexer,
  };
  const file = path.join(ROOT, 'docs/StableCoin测试网证据-20260916.json');
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
  const blocks = [...new Set(accepted.map(e => e.blockheight))].sort((a, b) => a - b);
  console.log(JSON.stringify({ file, accepted: audit.accepted, confirmed: audit.nodeObservations.confirmed, blocks,
    rejected: audit.rejected, indexerReady: indexer.ready, feeSat: audit.globalSatoshis.minerFeesSat }));
  return value;
}
if (require.main === module) report();
module.exports = { report };
