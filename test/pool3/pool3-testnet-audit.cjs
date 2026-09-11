'use strict';

// Independent, offline audit of persisted testnet evidence. Never load wallet
// keys, contact an indexer/node, sign, or broadcast. The optional CLI report is
// the only write: node test/pool3/pool3-testnet-audit.cjs --write-report
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const tbc = require('tbc-lib-js');
const TBC20 = require('../../lib/contract/tbc20.js');
const { FTLPTBC20: LP } = require('../../lib/contract/ftlpTbc20.js');
const { parsePoolCode } = require('../../lib/util/poolnft3/artifacts.js');
const { decodePoolTape } = require('../../lib/util/poolnft3/tape.js');
const { getTBC20CodeIdentity } = require('../../lib/util/tbc20unlock.js');
const { resolveSwapFeePolicy, calculateSwapFees, deriveFeeRecipient } = require('../../lib/util/poolnft3/fees.js');
const { validatePool3Transaction } = require('../../lib/validator/poolnft3.js');

const DIRECTORY = path.resolve(__dirname, '../pool3-preprod-20260911-r2');
const BURN_CONTROLLER = '759d6677091e973b9e9d99f19c68fbf43e3f05f900';
const json = value => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item, 2);
const sum = values => values.reduce((total, value) => total + value, 0n);
const marker = (script, text) => script.toBuffer().subarray(-text.length).toString('ascii') === text;

function auditJournal(directory = DIRECTORY) {
  assert(fs.statSync(directory).isDirectory(), 'an existing evidence directory is required');
  const text = fs.readFileSync(path.join(directory, 'journal.jsonl'), 'utf8');
  // Snapshot a concurrently appended journal at its last complete record.
  const completeLength = text.lastIndexOf('\n') + 1;
  assert(completeLength > 0, 'journal has no complete records');
  const events = text.slice(0, completeLength).trim().split('\n').map(JSON.parse);
  const accepted = events.filter(event => event.type === 'accepted');
  const parentEvents = events.filter(event => event.type === 'parent');
  const config = events.find(event => event.type === 'campaign-init');
  assert(config && accepted.length > 0);
  assert.equal(config.endpoint, 'https://api.tbcdev.org/api/tbc/');
  assert.equal(BigInt(config.allocatedSat), 381_900_000n);
  assert(BigInt(config.allocatedSat) <= 400_000_000n);
  const transactions = new Map();
  const ids = new Set(events.filter(event => ['parent', 'prepared', 'broadcast-attempt', 'accepted'].includes(event.type)).map(event => event.txid));
  for (const id of ids) {
    assert(/^[0-9a-f]{64}$/.test(id));
    const raw = fs.readFileSync(path.join(directory, `${id}.raw`), 'utf8');
    const tx = new tbc.Transaction(raw);
    assert.equal(tx.id, id, 'saved raw must hash to its filename');
    assert.equal(tx.uncheckedSerialize(), raw, 'saved raw must round-trip exactly');
    transactions.set(id, tx);
  }
  assert.equal(new Set(accepted.map(event => event.txid)).size, accepted.length, 'accepted records must not double-count replays');
  const known = new Set(parentEvents.map(event => event.txid));
  const spent = new Set(), coverage = new Map(), plans = {};
  let minerFeesSat = 0n, acceptedInputs = 0, swapCount = 0, serviceFeesSat = 0n;
  const log = console.log;
  console.log = () => {};
  try {
    for (const event of accepted) {
      const tx = transactions.get(event.txid);
      let inputSat = 0n;
      for (const input of tx.inputs) {
        const parentId = input.prevTxId.toString('hex'), outpoint = `${parentId}:${input.outputIndex}`;
        assert(known.has(parentId), 'a child must follow its accepted parent');
        assert(!spent.has(outpoint), 'two accepted transactions spend the same outpoint');
        const previous = transactions.get(parentId).outputs[input.outputIndex];
        assert(previous, 'previous output exists');
        input.output = new tbc.Transaction.Output({ satoshis: previous.satoshis,
          script: tbc.Script.fromBuffer(Buffer.from(previous.script.toBuffer())) });
        inputSat += BigInt(previous.satoshis); spent.add(outpoint); acceptedInputs++;
      }
      const feeSat = inputSat - sum(tx.outputs.map(output => BigInt(output.satoshis)));
      assert(feeSat >= 0n && feeSat <= 100_000n, 'per-transaction miner fee budget');
      assert.equal(feeSat, BigInt(event.feeSat)); minerFeesSat += feeSat;
      known.add(event.txid);
      assert(validatePool3Transaction(tx).success, `${event.label}: full-input raw revalidation`);
      if (!marker(tx.inputs[0].output.script, 'POOLCODE2')) continue;
      const pool = parsePoolCode(tx.inputs[0].output.script);
      const chunks = tx.inputs[0].script.chunks, optionChunk = chunks[chunks.length - 15];
      // Six ancestor leaves plus eight parent leaves follow the option.
      const option = optionChunk.buf ? Number(tbc.crypto.BN.fromScriptNumBuffer(optionChunk.buf, true)) : optionChunk.opcodenum - 0x50;
      assert(option >= 1 && option <= 4); assert.equal(tx.inputs.length, option === 3 ? 3 : 4);
      if (pool.authorization.kind === 'controller') {
        const pub = chunks[1].buf, members = pool.authorization.controllerPubKeyHashes;
        assert.equal(pub.length, 33);
        const member = tbc.crypto.Hash.sha256ripemd160(pub).toString('hex');
        assert(members.includes(member), 'actual signing public key is whitelisted');
        assert(tx.verifySignature(tbc.crypto.Signature.fromTxFormat(chunks[0].buf), tbc.PublicKey.fromBuffer(pub),
          0, tx.inputs[0].output.script, tx.inputs[0].output.satoshisBN, 0x10000));
        const lane = Number(/^lane(\d+):/.exec(event.label)[1]);
        if (!coverage.has(lane)) coverage.set(lane, { members, byOption: { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() },
          transactions: { 1: 0, 2: 0, 3: 0, 4: 0 } });
        const entry = coverage.get(lane); entry.byOption[option].add(member); entry.transactions[option]++;
      }
      if (option !== 3 && option !== 4) continue;
      const parent = transactions.get(tx.inputs[0].prevTxId.toString('hex'));
      const previous = decodePoolTape(parent.outputs[1].script), next = decodePoolTape(tx.outputs[1].script);
      const feeOutput = tx.outputs[option === 3 ? 4 : 3], paid = BigInt(feeOutput.satoshis);
      const base = option === 3 ? BigInt(tx.outputs[0].satoshis) - BigInt(parent.outputs[0].satoshis) + paid : previous.tbcAmount - next.tbcAmount;
      const policy = resolveSwapFeePolicy(previous.lpPlan, previous.serviceFeeRate);
      const expected = calculateSwapFees(base, policy), recipient = deriveFeeRecipient(policy.serviceFeeAddress);
      assert.equal(paid, expected.serviceFeePaidSat);
      assert(pool.tbcFeeScriptHash.equals(recipient.feeScriptHash32), 'Code binds full P2PKH script SHA256');
      assert.equal(feeOutput.script.toHex(), paid > 0n ? recipient.feeP2pkhScript25.toHex() : '006a');
      if (option === 3) assert.equal(next.tbcAmount - previous.tbcAmount, expected.netAmountSat);
      else assert.equal(BigInt(tx.outputs[2].satoshis), expected.netAmountSat);
      plans[previous.lpPlan] ??= { paidOutputs: 0, zeroOutputs: 0, paidSat: 0n };
      plans[previous.lpPlan][paid ? 'paidOutputs' : 'zeroOutputs']++;
      plans[previous.lpPlan].paidSat += paid; serviceFeesSat += paid; swapCount++;
    }
  } finally { console.log = log; }

  const liveOutputs = [], ftAmounts = new Map(), lpAmounts = new Map(), livePools = [];
  let liveSat = 0n;
  for (const event of accepted) {
    const tx = transactions.get(event.txid);
    for (const [vout, output] of tx.outputs.entries()) {
      if (spent.has(`${tx.id}:${vout}`)) continue;
      liveSat += BigInt(output.satoshis);
      if (output.script.toHex().startsWith('006a')) { assert.equal(output.satoshis, 0); continue; }
      let family = 'p2pkh-or-other', amountRaw;
      // LP must come first: its marker also ends with the ordinary FT marker.
      if (marker(output.script, 'LPTBC20CODE2')) {
        const code = LP.parseCode(output.script), tape = LP.parseTape(tx.outputs[vout + 1].script,
          { tapeSize: code.tapeSize, timelocked: code.timelocked });
        const burned = code.controller.toString('hex') === BURN_CONTROLLER, id = code.poolCodeHash.toString('hex');
        const entry = lpAmounts.get(id) || { burned: 0n, active: 0n, burnedOutputs: 0, activeOutputs: 0 };
        entry[burned ? 'burned' : 'active'] += tape.balance;
        entry[burned ? 'burnedOutputs' : 'activeOutputs']++; lpAmounts.set(id, entry);
        family = burned ? 'burned-lp' : 'owned-lp'; amountRaw = tape.balance;
      } else if (marker(output.script, 'TBC20CODE2')) {
        const tape = TBC20.parseTape(tx.outputs[vout + 1].script);
        TBC20.validateCode(output.script, tape.size);
        const id = getTBC20CodeIdentity(output.script).toString('hex');
        ftAmounts.set(id, (ftAmounts.get(id) || 0n) + tape.balance);
        family = 'tbc20'; amountRaw = tape.balance;
      } else if (marker(output.script, 'POOLCODE2')) {
        const code = parsePoolCode(output.script), tape = decodePoolTape(tx.outputs[vout + 1].script);
        livePools.push({ txid: tx.id, poolCodeHash: code.poolCodeHash.toString('hex'), satoshis: output.satoshis,
          ftLpAmount: tape.ftLpAmount, ftAAmount: tape.ftAAmount, tbcAmount: tape.tbcAmount }); family = 'pool';
      }
      liveOutputs.push({ txid: tx.id, vout, family, satoshis: output.satoshis, amountRaw });
    }
  }
  assert.equal(liveSat + minerFeesSat, BigInt(config.funding.value), 'global satoshi conservation, including root change and all asset Code outputs');
  const ftSupplies = accepted.filter(event => /^lane\d+:tbc20-genesis$/.test(event.label)).map(event => {
    const tx = transactions.get(event.txid), identity = getTBC20CodeIdentity(tx.outputs[0].script).toString('hex');
    const mintedRaw = TBC20.parseTape(tx.outputs[1].script).balance, remainingRaw = ftAmounts.get(identity);
    assert.equal(mintedRaw, 2_000_000_000n); assert.equal(remainingRaw, mintedRaw, `${event.label}: FT supply conservation`);
    return { label: event.label, genesis: event.txid, identity, mintedRaw, remainingRaw };
  });
  const completed = events.filter(event => ['scenario-complete', 'fee-plan-complete',
    'future-lock-complete', 'fee-boundaries-complete'].includes(event.type) && event.poolHead);
  const latestCompletionByPool = new Map();
  for (const event of completed) {
    const tx = transactions.get(event.poolHead);
    assert(tx && known.has(event.poolHead), 'completed Pool head must have been accepted');
    const poolHash = parsePoolCode(tx.outputs[0].script).poolCodeHash.toString('hex');
    latestCompletionByPool.set(poolHash, event);
  }
  // A later campaign phase may legitimately continue an already completed
  // Pool. Keep historical completions, but only assert terminal state against
  // a completion head which is still live in this exact journal snapshot.
  const supersededCompletionHeads = [...latestCompletionByPool].filter(([, event]) => spent.has(`${event.poolHead}:0`))
    .map(([poolCodeHash, event]) => ({ poolCodeHash, type: event.type, lane: event.lane, poolHead: event.poolHead,
      reason: 'a later accepted transaction continues this Pool; no current completion event yet' }));
  const terminalPools = [...latestCompletionByPool.values()].filter(event => !spent.has(`${event.poolHead}:0`)).map(event => {
    const tx = transactions.get(event.poolHead), tape = decodePoolTape(tx.outputs[1].script);
    assert(!spent.has(`${event.poolHead}:0`)); assert.equal(tx.outputs[0].satoshis, 1500);
    assert.equal(tape.ftLpAmount, 0n); assert.equal(tape.ftAAmount, 0n); assert.equal(tape.tbcAmount, 0n);
    return { type: event.type, lane: event.lane, poolHead: event.poolHead, retainedSat: 1500 };
  });
  for (const pool of livePools) assert.equal(lpAmounts.get(pool.poolCodeHash)?.active || 0n, pool.ftLpAmount, 'active LP excludes burns and matches live Pool supply');
  const attempts = events.filter(event => event.type === 'broadcast-attempt');
  let maxRollingSecondBroadcasts = 0, minimumBroadcastIntervalMs = Infinity;
  for (let start = 0, end = 0; start < attempts.length; start++) {
    while (end < attempts.length && attempts[end].epochMs < attempts[start].epochMs + 1000) end++;
    maxRollingSecondBroadcasts = Math.max(maxRollingSecondBroadcasts, end - start);
    if (start) minimumBroadcastIntervalMs = Math.min(minimumBroadcastIntervalMs, attempts[start].epochMs - attempts[start - 1].epochMs);
  }
  assert(maxRollingSecondBroadcasts <= 5); assert(minimumBroadcastIntervalMs >= 250);
  const unresolved = new Set();
  for (const event of events) {
    if (event.type === 'broadcast-attempt') unresolved.add(event.txid);
    else if (['accepted', 'rejected', 'replay-verified'].includes(event.type)) unresolved.delete(event.txid);
  }
  const whitelistCoverage = Object.fromEntries([...coverage].map(([lane, entry]) => [lane, {
    members: entry.members.length, memberPubKeyHashes: entry.members,
    byOption: Object.fromEntries(Object.entries(entry.byOption).map(([option, members]) => [option, members.size])),
    memberIndices: Object.fromEntries(Object.entries(entry.byOption).map(([option, members]) => [option, [...members].map(member => entry.members.indexOf(member))])),
    transactions: entry.transactions,
  }]));
  return { auditAt: new Date().toISOString(), snapshotLastEvent: events.at(-1).at, eventCount: events.length,
    ignoredIncompleteTrailingBytes: text.length - completeLength, accepted: accepted.length,
    rejected: events.filter(event => event.type === 'rejected').length,
    replayVerified: events.filter(event => event.type === 'replay-verified').length,
    attempts: attempts.length, rawFilesValidated: transactions.size, acceptedInputsRevalidated: acceptedInputs,
    allRawInputScriptsPassed: true, acceptedDoubleSpends: 0, unresolved: [...unresolved],
    maximumRollingSecondBroadcasts: maxRollingSecondBroadcasts, minimumBroadcastIntervalMs,
    globalSatoshis: { initialSat: BigInt(config.funding.value), allocatedSat: BigInt(config.allocatedSat), liveSat, minerFeesSat, conserved: true },
    swaps: { count: swapCount, serviceFeesSat, plans }, ftSupplies,
    historicalCompletionEvents: completed.length, distinctCompletedPools: latestCompletionByPool.size,
    supersededCompletionHeads, terminalPools, livePools,
    lpByPool: Object.fromEntries(lpAmounts), whitelistCoverage,
    actualWhitelistMemberOptionCells: Object.values(whitelistCoverage).reduce((total, entry) => total + Object.values(entry.byOption).reduce((n, count) => n + count, 0), 0),
    fullWhitelistMemberOptionCells: 120, liveOutputs,
    scope: 'Local journal/raw audit only; no fresh node, UTXO-set or confirmation claims. Running phases are reported as snapshots, not failures.' };
}

module.exports = { auditJournal, DIRECTORY };
if (require.main === module) {
  try {
    assert(process.argv.slice(2).every(arg => arg === '--write-report'), 'only --write-report is supported');
    const report = auditJournal();
    if (process.argv.includes('--write-report')) {
      const fd = fs.openSync(path.join(DIRECTORY, 'audit.json'), 'w', 0o600);
      try { fs.writeSync(fd, json(report) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    }
    process.stdout.write(json({ snapshot: report.snapshotLastEvent, accepted: report.accepted, rejected: report.rejected,
      rawInputsPassed: report.acceptedInputsRevalidated, maxTps: report.maximumRollingSecondBroadcasts,
      satoshis: report.globalSatoshis, ftAssets: report.ftSupplies.length, terminalPools: report.terminalPools.length,
      whitelistCells: `${report.actualWhitelistMemberOptionCells}/${report.fullWhitelistMemberOptionCells}` }) + '\n');
  } catch (error) { process.stderr.write(error.stack + '\n'); process.exitCode = 1; }
}
