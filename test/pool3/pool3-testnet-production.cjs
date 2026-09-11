'use strict';

// Opt-in real TESTNET campaign. This file is not matched by node:test.
// Keys remain in memory; every signed transaction and state checkpoint is local.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const tbc = require('tbc-lib-js');
const TBC20 = require('../../lib/contract/tbc20.js');
const { PoolNFT3 } = require('../../lib/contract/poolNFT3.0.js');
const { FTLPTBC20: LP } = require('../../lib/contract/ftlpTbc20.js');
const { POOL3_CODE_DUST } = require('../../lib/util/poolnft3/math.js');
const { POOL3_TAPE_BYTES } = require('../../lib/util/poolnft3/tape.js');
const { POOL3_ARTIFACT_MANIFEST } = require('../../lib/util/poolnft3/artifacts.js');
const { privateKeySigner, PreparedPool3Transaction, p2pkhInputPlan } = require('../../lib/util/poolnft3/transaction.js');
const { TestnetJournal, localKey, silent, BASE, ADDRESS } = require('./pool3-testnet-runner.cjs');
const { runScenario } = require('./pool3-testnet-scenarios.cjs');
const { prepareSwapFTAdversarial } = require('./pool3-testnet-adversarial.cjs');

const DIRECTORY = path.resolve(__dirname, '../pool3-preprod-20260911-r2');
const stringify = value => JSON.stringify(value, (_k, v) => typeof v === 'bigint' ? v.toString() : v);
const emit = value => process.stdout.write(stringify(value) + '\n');
const variants = [
  { timelocked: false, controllerCount: 0 }, { timelocked: true, controllerCount: 0 },
  { timelocked: false, controllerCount: 5 }, { timelocked: true, controllerCount: 5 },
  ...[1, 2, 3, 4].flatMap(controllerCount => [false, true].map(timelocked => ({ timelocked, controllerCount }))),
];
const P2PKH = () => tbc.Script.buildPublicKeyHashOut(ADDRESS);
const utxo = (tx, vout) => ({ txId: tx.id, outputIndex: vout, script: tx.outputs[vout].script.toHex(), satoshis: tx.outputs[vout].satoshis });
const sum = amounts => amounts.reduce((s, n) => s + n, 0n);

function campaignSigners(key, count = 5) {
  // tbc-lib-js treats a raw 32-byte Buffer as an UNCOMPRESSED key. Its hex
  // constructor retains the same scalar while selecting the 33-byte profile.
  const derived = label => new tbc.PrivateKey(crypto.createHmac('sha256', key.toBuffer()).update(`pool3-preprod-r2:${label}`).digest('hex'));
  return { owner: privateKeySigner(key), funding: privateKeySigner(key), lpOwner: privateKeySigner(derived('lp-owner')),
    recipient: privateKeySigner(derived('lp-recipient')), poolFt: privateKeySigner(derived('pool-ft')),
    controllers: Array.from({ length: count }, (_, i) => privateKeySigner(derived(`controller-${i}`))) };
}

async function commit(journal, result, label, options = {}) {
  const tx = result.transaction || result;
  const completed = journal.events.find(e => ['accepted', 'rejected', 'replay-verified'].includes(e.type) && e.label === label);
  if (completed) {
    assert.equal(tx.id, completed.txid, `${label}: resumed signing must reproduce the saved transaction`);
    assert.equal(fs.readFileSync(path.join(journal.directory, `${tx.id}.raw`), 'utf8'), tx.uncheckedSerialize());
    return completed.type !== 'rejected';
  }
  const accepted = await journal.broadcast(result, label, options);
  emit({ label, txid: tx.id, accepted, negative: !!options.expectedLocalFailures, replay: !!options.replay });
  return accepted;
}

async function initialize(journal, key) {
  assert.equal(POOL3_CODE_DUST, 1500n, 'new user-compiled CodeDust is required');
  assert.equal(POOL3_TAPE_BYTES, 143, 'do not broadcast old Pool framing');
  const previous = journal.events.find(e => e.type === 'campaign-init');
  if (previous) {
    assert.equal(previous.poolTemplate, POOL3_ARTIFACT_MANIFEST.artifacts.pool.templateSha256);
    assert.equal(previous.hashTemplate, POOL3_ARTIFACT_MANIFEST.artifacts.pool_hash_lock.templateSha256);
    const rootEvent = journal.events.find(e => e.type === 'accepted' && e.label === 'campaign:funding-split');
    if (rootEvent) return { config: previous, root: journal.chain.get(rootEvent.txid) };
  }
  assert.equal(journal.unresolved.size, 0, 'reconcile any unknown broadcast first');
  const node = await journal.read('nodeinfo');
  const list = await journal.read(`utxo/address/${ADDRESS}`);
  // 12 whitelist/LP scenarios + six fee plans + one true future-lock scenario.
  // Each has 20 TBC principal/fees plus 0.1 TBC for its FT creation: 381.9 TBC.
  // Everything not explicitly allocated returns to the same authorized wallet.
  const lanes = 19, principalSat = 20_000_000n, mintSat = 100_000n;
  const allocatedSat = BigInt(lanes) * (principalSat + mintSat);
  assert(allocatedSat <= 400_000_000n, 'hard campaign allocation cap: 400 TBC');
  const selected = previous?.funding || list.utxos.filter(u => u.height > 0 && Number.isSafeInteger(u.value)
    && BigInt(u.value) > allocatedSat + 10000n).sort((a, b) => a.value - b.value)[0];
  assert(selected, 'a sufficient confirmed P2PKH funding output is required');
  const parent = await journal.parent(selected.txid), output = parent.outputs[selected.index];
  assert.equal(output.satoshis, selected.value); assert.equal(output.script.toHex(), P2PKH().toHex());
  const config = previous || journal.append({ type: 'campaign-init', node, network: 'testnet', endpoint: BASE, wallet: ADDRESS,
    funding: selected, allocatedSat, principalSat, mintSat, lanes, matureLockTime: node.blocks - 2,
    poolTemplate: POOL3_ARTIFACT_MANIFEST.artifacts.pool.templateSha256,
    hashTemplate: POOL3_ARTIFACT_MANIFEST.artifacts.pool_hash_lock.templateSha256,
    artifactManifest: POOL3_ARTIFACT_MANIFEST, variants, maxBroadcastTps: 4,
    signingDerivation: 'HMAC-SHA256 authorized test key with pool3-preprod-r2:<role>; never serialize private keys' });
  const outputs = Array.from({ length: lanes }, () => [
    new tbc.Transaction.Output({ script: P2PKH(), satoshis: Number(principalSat) }),
    new tbc.Transaction.Output({ script: P2PKH(), satoshis: Number(mintSat) }),
  ]).flat();
  const result = await silent(() => new PreparedPool3Transaction({ inputs: [p2pkhInputPlan({ parentTx: parent,
    outputIndex: selected.index, signer: privateKeySigner(key) })], outputs, changeAddress: ADDRESS }).sign());
  assert.equal(result.changeVout, lanes * 2);
  await commit(journal, result, 'campaign:funding-split');
  return { config, root: result.transaction };
}

async function tokenForLane(journal, root, key, lane, tapeSize = 66) {
  const extensionData = tapeSize === 61 ? Buffer.from([9])
    : Buffer.concat([Buffer.from([tapeSize - 62]), Buffer.alloc(tapeSize - 62, 0x2a), Buffer.from([9])]);
  const token = new TBC20({ extensionData });
  const mint = await silent(() => token.mint(key, ADDRESS, 2_000_000_000n, utxo(root, lane * 2 + 1)));
  await commit(journal, mint.sourceTransaction, `lane${lane}:tbc20-source`);
  await commit(journal, mint.transaction, `lane${lane}:tbc20-genesis`);
  return { token, mint };
}

function commonForSwap(journal, result, signers, controlled) {
  const inputs = result.transaction.inputs;
  const parent = journal.chain.get(inputs[0].prevTxId.toString('hex'));
  return { pool: { parentTx: parent, ancestorTx: journal.chain.get(parent.inputs[0].prevTxId.toString('hex')) },
    funding: { parentTx: journal.chain.get(inputs[1].prevTxId.toString('hex')), outputIndex: inputs[1].outputIndex, signer: signers.funding },
    poolFT: { parentTx: journal.chain.get(inputs[2].prevTxId.toString('hex')), outputIndex: inputs[2].outputIndex,
      signer: signers.poolFt, ancestors: journal.chain }, ...(controlled ? { controllerSigner: signers.controllers[0] } : {}) };
}

async function matrix(journal, key) {
  const { config, root } = await initialize(journal, key);
  for (const [lane, variant] of variants.entries()) {
    if (journal.events.some(e => e.type === 'scenario-complete' && e.lane === lane)) continue;
    const { mint } = await tokenForLane(journal, root, key, lane);
    const signers = campaignSigners(key, variant.controllerCount);
    const result = await silent(() => runScenario({ variant, ftGenesisTx: mint.transaction,
      userFT: { parentTx: mint.transaction, outputIndex: 0, signer: signers.owner, ancestors: journal.chain },
      funding: { parentTx: root, outputIndex: lane * 2, signer: signers.funding }, signers, localTransactions: journal.chain,
      options: { firstTbcSat: 1_000_000n, firstFtRaw: 20_000_000n, matureLockTime: config.matureLockTime },
      commit: async (built, label) => {
        const fullLabel = `lane${lane}:${label}`;
        if ([0, 3].includes(lane) && label.endsWith('/swap-ft-paid-service')) {
          const common = commonForSwap(journal, built, signers, variant.controllerCount > 0);
          const negatives = await prepareSwapFTAdversarial({ validResult: built, common,
            localTransactions: journal.chain, nonMemberSigner: signers.owner });
          for (const negative of negatives) {
            const accepted = await commit(journal, negative, `lane${lane}:negative:${negative.label}`,
              { allowReject: true, expectedLocalFailures: negative.expectedLocalFailures });
            assert.equal(accepted, false, 'CRITICAL: node accepted an invalid Pool transition; stop all testing');
            const rejection = journal.events.find(e => e.type === 'rejected' && e.txid === negative.txid);
            assert(/script|EQUALVERIFY|VERIFY|opcode/i.test(rejection.body.data.error), 'negative must fail script rules, not missing parents or funding');
          }
          let competitor;
          if (lane === 0) {
            const pool = PoolNFT3.fromPool(common.pool.parentTx, mint.transaction);
            competitor = await pool.swapFT({ ...common, inputTbcSat: 110_000n, receiverAddress: ADDRESS, minFtOutRaw: 1n });
          }
          await commit(journal, built, fullLabel);
          if (lane === 0) {
            assert.equal(await commit(journal, built, 'campaign:identical-raw-replay', { replay: true }), true);
            const accepted = await commit(journal, competitor, 'campaign:stale-state-competitor', { allowReject: true, conflict: true });
            assert.equal(accepted, false, 'a second spend of the same Pool must not be accepted');
          }
        } else await commit(journal, built, fullLabel);
      },
    }));
    const refs = items => items.map(i => ({ txid: i.parentTx.id, vout: i.outputIndex, amountRaw: i.amountRaw, amountSat: i.amountSat, role: i.role }));
    journal.append({ type: 'scenario-complete', lane, variant, poolGenesis: result.history[1].result.txid,
      poolHead: result.currentPool.txid, state: { poolValue: result.currentPool.nextState.poolValue, ftLpAmount: result.currentPool.nextState.ftLpAmount,
        ftAAmount: result.currentPool.nextState.ftAAmount, tbcAmount: result.currentPool.nextState.tbcAmount },
      totals: result.totals, negativeChecks: result.negativeChecks,
      recovery: { ft: refs(result.recoverableOutputs.ft), lp: refs(result.recoverableOutputs.lp), tbc: refs(result.recoverableOutputs.tbc) } });
    emit({ lane, scenarioComplete: true, variant, totals: result.totals });
  }
}

async function feePlans(journal, key) {
  const { runFeePlan } = require('./pool3-testnet-fee-plans.cjs');
  const { root } = await initialize(journal, key);
  for (let lpPlan = 1; lpPlan <= 6; lpPlan++) {
    const lane = 11 + lpPlan, tapeSize = [61, 66, 127][(lpPlan - 1) % 3];
    if (journal.events.some(e => e.type === 'fee-plan-complete' && e.lpPlan === lpPlan)) continue;
    const { mint } = await tokenForLane(journal, root, key, lane, tapeSize);
    const signers = campaignSigners(key, 0);
    const result = await silent(() => runFeePlan({ lane, lpPlan, tapeSize, ftGenesisTx: mint.transaction,
      userFT: { parentTx: mint.transaction, outputIndex: 0, signer: signers.owner, ancestors: journal.chain },
      funding: { parentTx: root, outputIndex: lane * 2, signer: signers.funding }, signers,
      localTransactions: journal.chain, commit: (built, label) => commit(journal, built, `lane${lane}:${label}`) }));
    journal.append({ type: 'fee-plan-complete', lane, lpPlan, tapeSize, poolGenesis: result.history[1].result.txid,
      poolHead: result.currentPool.txid, totals: result.totals,
      state: { poolValue: result.currentPool.nextState.poolValue, ftLpAmount: result.currentPool.nextState.ftLpAmount,
        ftAAmount: result.currentPool.nextState.ftAAmount, tbcAmount: result.currentPool.nextState.tbcAmount } });
    emit({ feePlanComplete: true, lane, lpPlan, tapeSize, totals: result.totals });
  }
}

async function feeBoundaries(journal, key) {
  if (journal.events.some(e => e.type === 'fee-boundaries-complete')) return;
  assert(journal.events.some(e => e.type === 'fee-plan-complete' && e.lpPlan === 1), 'complete fee plan 1 before boundary tests');
  const { runFeePlan } = require('./pool3-testnet-fee-plans.cjs');
  const { runFeeBoundaries } = require('./pool3-testnet-fee-boundaries.cjs');
  const { root } = await initialize(journal, key);
  const lane = 12, { mint } = await tokenForLane(journal, root, key, lane, 61), signers = campaignSigners(key, 0);
  const commitLane = (built, label) => commit(journal, built, `lane${lane}:${label}`);
  // Reconstruct the accepted eight-transaction lane using exact-label/raw
  // resume checks. It must not rebroadcast or spend its historical inputs.
  const completedFeePlan = await silent(() => runFeePlan({ lane, lpPlan: 1, tapeSize: 61, ftGenesisTx: mint.transaction,
    userFT: { parentTx: mint.transaction, outputIndex: 0, signer: signers.owner, ancestors: journal.chain },
    funding: { parentTx: root, outputIndex: lane * 2, signer: signers.funding }, signers,
    localTransactions: journal.chain, commit: commitLane }));
  const result = await silent(() => runFeeBoundaries({ lane, completedFeePlan, signers,
    localTransactions: journal.chain, commit: commitLane }));
  journal.append({ type: 'fee-boundaries-complete', lane, lpPlan: 1, poolHead: result.currentPool.txid,
    boundaries: result.boundaries, totals: result.totals,
    state: { poolValue: result.currentPool.nextState.poolValue, ftLpAmount: result.currentPool.nextState.ftLpAmount,
      ftAAmount: result.currentPool.nextState.ftAAmount, tbcAmount: result.currentPool.nextState.tbcAmount } });
  emit({ feeBoundariesComplete: true, lane, poolHead: result.currentPool.txid, boundaries: result.boundaries, totals: result.totals });
}

async function futureSetup(journal, key) {
  const { buildFutureLockSetup } = require('./pool3-testnet-locktime.cjs');
  const { root } = await initialize(journal, key);
  const lane = 18, { mint } = await tokenForLane(journal, root, key, lane);
  let target = journal.events.find(e => e.type === 'future-lock-target');
  if (!target) {
    const node = await journal.read('nodeinfo');
    target = journal.append({ type: 'future-lock-target', targetLockTime: node.blocks + 1, observedNode: node });
  }
  const signers = campaignSigners(key, 0);
  const setup = await silent(() => buildFutureLockSetup({ ftGenesisTx: mint.transaction,
    userFT: { parentTx: mint.transaction, outputIndex: 0, signer: signers.owner, ancestors: journal.chain },
    funding: { parentTx: root, outputIndex: lane * 2, signer: signers.funding }, signers,
    localTransactions: journal.chain, targetLockTime: target.targetLockTime,
    commit: (built, label) => commit(journal, built, `lane18:${label}`) }));
  return { setup, target };
}

async function futureStart(journal, key) {
  const { setup, target } = await futureSetup(journal, key);
  if (journal.events.some(e => e.type === 'future-immature-observation')) return;
  const before = await journal.read('nodeinfo');
  assert(before.blocks < target.targetLockTime, 'target height already matured before the early-spend experiment');
  let accepted = false;
  try { accepted = await commit(journal, setup.unlock, 'future:unlock-before-maturity', { allowReject: true }); }
  catch (error) {
    // A non-final queue may acknowledge but not expose raw via normal mempool
    // APIs. Preserve the unresolved reservation and record it; never fabricate
    // a rejection or spend either parent until read-only resolution succeeds.
    if (!journal.unresolved.has(setup.unlock.txid)) throw error;
    journal.append({ type: 'future-visibility-pending', txid: setup.unlock.txid, error: error.message });
  }
  const after = await journal.read('nodeinfo'), mempool = await journal.read('mempooltxs');
  let detail;
  try { detail = await journal.read(`decode/txid/${setup.unlock.txid}`); } catch { /* May be a policy rejection or a private non-final queue. */ }
  if (after.blocks < target.targetLockTime) {
    assert(!detail?.confirmations, 'CRITICAL: a non-final LP unlock was confirmed too early');
    assert(!Array.isArray(mempool) || !mempool.includes(setup.unlock.txid), 'non-final unlock must not appear in ordinary mempool before maturity');
  }
  journal.append({ type: 'future-immature-observation', txid: setup.unlock.txid, targetLockTime: target.targetLockTime,
    before, after, acceptedResponse: accepted, rawVisibilityPending: journal.unresolved.has(setup.unlock.txid),
    confirmations: detail?.confirmations || 0, ordinaryMempool: Array.isArray(mempool) && mempool.includes(setup.unlock.txid) });
  emit({ futureImmatureChecked: true, txid: setup.unlock.txid, targetLockTime: target.targetLockTime,
    currentHeight: after.blocks, acceptedResponse: accepted, unresolved: [...journal.unresolved] });
}

async function futureFinish(journal, key) {
  const target = journal.events.find(e => e.type === 'future-lock-target');
  assert(target && journal.events.some(e => e.type === 'future-immature-observation'), 'run the immature probe first');
  const node = await journal.read('nodeinfo');
  assert(node.blocks >= target.targetLockTime, `LP still immature: height ${node.blocks}, target ${target.targetLockTime}`);
  // Resolve an acknowledgement-hidden non-final candidate using the exact
  // saved raw after the node's clock admits it to the normal mempool.
  for (const txid of [...journal.unresolved]) {
    const raw = await journal.read(`txraw/txid/${txid}`);
    const tx = new tbc.Transaction(fs.readFileSync(path.join(journal.directory, `${txid}.raw`), 'utf8'));
    assert.equal(raw.txraw, tx.uncheckedSerialize());
    const prepared = journal.events.find(e => e.type === 'prepared' && e.txid === txid);
    journal.chain.set(txid, tx);
    for (const input of tx.inputs) journal.spent.add(`${input.prevTxId.toString('hex')}:${input.outputIndex}`);
    journal.append({ type: 'accepted', label: 'future:unlock-before-maturity', txid, feeSat: prepared.feeSat, rawRetrieved: true, resolvedAfterMaturity: true });
    journal.unresolved.delete(txid);
  }
  const { setup } = await futureSetup(journal, key);
  const previouslyAccepted = journal.events.some(e => e.type === 'accepted' && e.txid === setup.unlock.txid);
  await commit(journal, setup.unlock, 'future:unlock-after-maturity', { replay: previouslyAccepted });
  const removal = await silent(() => setup.pool.removeLP({ ...setup.common, userLP: setup.unlockedLP,
    funding: setup.fundingAfterUnlock, burnAmountRaw: setup.unlockedLP.amountRaw, receiverAddress: setup.ownerAddress }));
  await commit(journal, removal, 'future:cleanup-remove-all');
  assert.equal(removal.nextState.poolValue, 1500n); assert.equal(removal.nextState.ftLpAmount, 0n);
  const detail = await journal.read(`decode/txid/${setup.unlock.txid}`);
  if (detail.confirmations) assert(detail.blockheight > target.targetLockTime, 'unlock must be mined strictly after its height lock');
  journal.append({ type: 'future-lock-complete', unlockTxid: setup.unlock.txid, poolHead: removal.txid,
    targetLockTime: target.targetLockTime, matureNode: node, observedConfirmations: detail.confirmations || 0,
    poolValue: removal.nextState.poolValue, ftLpAmount: removal.nextState.ftLpAmount,
    ftAAmount: removal.nextState.ftAAmount, tbcAmount: removal.nextState.tbcAmount });
  emit({ futureLockComplete: true, unlockTxid: setup.unlock.txid, poolHead: removal.txid, targetLockTime: target.targetLockTime });
}

async function summary(journal) {
  const config = journal.events.find(e => e.type === 'campaign-init');
  assert(config, 'campaign not initialized');
  const node = await journal.read('nodeinfo');
  const accepted = journal.events.filter(e => e.type === 'accepted');
  const ids = new Set(accepted.map(e => e.txid));
  assert.equal(ids.size, accepted.length, 'replays must not count as additional fees or transactions');
  const attempts = journal.events.filter(e => e.type === 'broadcast-attempt');
  let maxTps = 0;
  for (const e of attempts) maxTps = Math.max(maxTps, attempts.filter(x => x.epochMs >= e.epochMs && x.epochMs < e.epochMs + 1000).length);
  assert(maxTps <= 5);
  const live = [];
  for (const e of accepted) {
    const tx = journal.chain.get(e.txid);
    for (const [vout, out] of tx.outputs.entries()) {
      if (journal.spent.has(`${tx.id}:${vout}`) || out.script.toHex().startsWith('006a')) continue;
      let family = 'other', amountRaw;
      const prepared = journal.events.find(x => x.type === 'prepared' && x.txid === tx.id);
      if (out.script.toHex() === P2PKH().toHex()) family = 'wallet-p2pkh';
      else if (out.script.toBuffer().subarray(-12).toString() === 'LPTBC20CODE2') {
        const code = LP.parseCode(out.script);
        family = code.controller.toString('hex') === '759d6677091e973b9e9d99f19c68fbf43e3f05f900' ? 'burned-lp' : 'owned-lp';
        amountRaw = LP.parseTape(tx.outputs[vout + 1].script, { tapeSize: code.tapeSize, timelocked: code.timelocked }).balance;
      } else if (out.script.toBuffer().subarray(-10).toString() === 'TBC20CODE2') {
        family = 'tbc20'; amountRaw = TBC20.parseTape(tx.outputs[vout + 1].script).balance;
      } else if (out.script.toBuffer().subarray(-9).toString() === 'POOLCODE2') family = 'pool';
      if (prepared?.layout?.serviceFeeVout === vout) family = 'service-fee-payment';
      live.push({ txid: tx.id, vout, satoshis: out.satoshis, family, amountRaw });
    }
  }
  const fees = sum(accepted.map(e => BigInt(e.feeSat)));
  const remaining = sum(live.map(o => BigInt(o.satoshis)));
  assert.equal(remaining + fees, BigInt(config.funding.value), 'all test funds including source change must reconcile');
  // This is a transaction-graph balance, not a spendable wallet balance:
  // retained outputs include service payments to other parties and burned LP.
  const liveOutputTotals = Object.fromEntries([...new Set(live.map(o => o.family))].sort().map(family => {
    const outputs = live.filter(o => o.family === family);
    return [family, { count: outputs.length, satoshis: sum(outputs.map(o => BigInt(o.satoshis))) }];
  }));
  const confirmations = [];
  const matureUnlock = journal.events.find(e => e.type === 'future-lock-complete');
  for (const e of accepted) {
    const detail = await journal.read(`decode/txid/${e.txid}`);
    assert.equal(detail.txid, e.txid);
    if (detail.hex) assert.equal(detail.hex, journal.chain.get(e.txid).uncheckedSerialize());
    if (matureUnlock?.unlockTxid === e.txid && detail.confirmations) {
      assert(detail.blockheight > matureUnlock.targetLockTime, 'confirmed LP unlock must be mined strictly after its height lock');
    }
    confirmations.push({ txid: e.txid, label: e.label, confirmations: detail.confirmations || 0,
      blockheight: detail.blockheight ?? null, blockhash: detail.blockhash ?? null });
  }
  const report = { at: new Date().toISOString(), node, config, attempts: attempts.length, accepted: accepted.length,
    rejected: journal.events.filter(e => e.type === 'rejected').length,
    replays: journal.events.filter(e => e.type === 'replay-verified').length, unknown: [...journal.unresolved], maxBroadcastsPerSecond: maxTps,
    minimumBroadcastIntervalMs: attempts.length > 1 ? Math.min(...attempts.slice(1).map((e, i) => e.epochMs - attempts[i].epochMs)) : null,
    minerFeesSat: fees, remainingSat: remaining, remainingSatMeaning: 'Unconsumed campaign-graph outputs, including service payments and burned LP; not wallet spendable balance',
    liveOutputTotals, liveOutputs: live, confirmations,
    scenarios: journal.events.filter(e => e.type === 'scenario-complete'), feePlans: journal.events.filter(e => e.type === 'fee-plan-complete'),
    feeBoundaries: journal.events.filter(e => e.type === 'fee-boundaries-complete'),
    futureLock: journal.events.filter(e => ['future-immature-observation', 'future-lock-complete'].includes(e.type)) };
  const fd = fs.openSync(path.join(journal.directory, 'report.json'), 'w', 0o600);
  try { fs.writeSync(fd, stringify(report) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  emit({ summary: true, accepted: report.accepted, rejected: report.rejected, replays: report.replays, scenarios: report.scenarios.length,
    confirmed: confirmations.filter(c => c.confirmations > 0).length, pending: confirmations.filter(c => !c.confirmations).length,
    feesSat: fees, maxTps, unknown: report.unknown, report: path.join(journal.directory, 'report.json') });
  return report;
}

async function main() {
  const command = process.argv[2];
  assert(['matrix', 'fees', 'fee-boundaries', 'future-start', 'future-finish', 'summary'].includes(command), 'usage: node test/pool3/pool3-testnet-production.cjs matrix|fees|fee-boundaries|future-start|future-finish|summary');
  fs.mkdirSync(DIRECTORY, { recursive: true, mode: 0o700 });
  const lockPath = path.join(DIRECTORY, 'runner.lock'), fd = fs.openSync(lockPath, 'wx', 0o600);
  fs.writeSync(fd, stringify({ pid: process.pid, at: new Date().toISOString() }));
  try {
    const journal = new TestnetJournal(DIRECTORY);
    if (command === 'summary') await summary(journal);
    else {
      const key = localKey();
      if (command === 'matrix') await matrix(journal, key);
      else if (command === 'fees') await feePlans(journal, key);
      else if (command === 'fee-boundaries') await feeBoundaries(journal, key);
      else if (command === 'future-start') await futureStart(journal, key);
      else await futureFinish(journal, key);
    }
  }
  finally { fs.closeSync(fd); fs.unlinkSync(lockPath); }
}

module.exports = { initialize, tokenForLane, campaignSigners, commit, summary, DIRECTORY, variants, utxo, emit };
if (require.main === module) main().catch(error => { emit({ stopped: true, error: error.message }); process.exitCode = 1; });
