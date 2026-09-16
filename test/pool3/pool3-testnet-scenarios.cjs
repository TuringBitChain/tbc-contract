'use strict';

// Transaction construction and local accounting only. This module deliberately
// contains no network, wallet discovery, private-key loading or broadcast code.
// The caller supplies real, previously accepted parents and a serial commit
// callback. A successful commit is the only point at which local state advances.
const assert = require('node:assert/strict');
const tbc = require('tbc-lib-js');
const { PoolNFT3 } = require('../../lib/contract/poolNFT3.0.js');
const TBC20 = require('../../lib/contract/tbc20.js');
const { FTLPTBC20: LP } = require('../../lib/contract/ftlpTbc20.js');
const { getTBC20Controller } = require('../../lib/util/tbc20/tbc20unlock.js');
const { getPoolUnlockLeafCount } = require('../../lib/util/poolnft3/witness.js');

const PRECISION = 1_000_000n;
// Independent oracle constant, pinned to both current Pool source contracts.
const DUST = 1500n;
const OPTIONS = { addLP: 1, removeLP: 2, swapFT: 3, swapTBC: 4 };
const BURN_CONTROLLER = '759d6677091e973b9e9d99f19c68fbf43e3f05f900';
const publicKey = signer => Buffer.isBuffer(signer.publicKey) ? signer.publicKey : Buffer.from(signer.publicKey, 'hex');
const addressOf = signer => tbc.PublicKey.fromBuffer(publicKey(signer)).toAddress().toString();
const controllerOf = signer => Buffer.concat([tbc.crypto.Hash.sha256ripemd160(publicKey(signer)), Buffer.from([0])]);
const referenceId = (tx, index) => `${tx.id}:${index}`;
const sum = values => values.reduce((total, value) => total + value, 0n);

function mathState(state) {
  return Object.fromEntries(['ftLpAmount', 'ftAAmount', 'tbcAmount', 'poolValue'].map(name => [name, state[name]]));
}

/** An independent BigInt oracle, intentionally matching the frozen contract. */
function expectedOperation(operation, previous, args) {
  const s = mathState(previous), expected = { ...s };
  let deltas = {};
  if (operation === 'addLP') {
    const d = args.incrementSat;
    const first = s.ftLpAmount === 0n && s.ftAAmount === 0n && s.tbcAmount === 0n;
    const ratio = first ? undefined : d <= s.tbcAmount
      ? (s.poolValue + d - DUST) * PRECISION / d
      : d * PRECISION / (s.poolValue + d - DUST);
    const lp = first ? d : d <= s.tbcAmount ? s.ftLpAmount * PRECISION / ratio : s.ftLpAmount * ratio / PRECISION;
    const ft = first ? args.firstFtAmountRaw : d <= s.tbcAmount ? s.ftAAmount * PRECISION / ratio : s.ftAAmount * ratio / PRECISION;
    Object.assign(expected, { poolValue: s.poolValue + d, tbcAmount: s.tbcAmount + d,
      ftLpAmount: s.ftLpAmount + lp, ftAAmount: s.ftAAmount + ft });
    deltas = { ftLpIncrementRaw: lp, ftAIncrementRaw: ft, isFirstAddLP: first, ratio };
  } else if (operation === 'removeLP') {
    const ratio = s.ftLpAmount * PRECISION / args.burnAmountRaw;
    const ft = s.ftAAmount * PRECISION / ratio;
    const reserve = s.tbcAmount * PRECISION / ratio;
    const payout = (s.poolValue - DUST) * PRECISION / ratio;
    Object.assign(expected, { poolValue: s.poolValue - payout, tbcAmount: s.tbcAmount - reserve,
      ftLpAmount: s.ftLpAmount - args.burnAmountRaw, ftAAmount: s.ftAAmount - ft });
    deltas = { ratio, ftADecrementRaw: ft, tbcDecrementSat: reserve, poolValueDecrementSat: payout };
  } else {
    // This scenario uses plan 1: total 35 bps, LP 25 bps. The service
    // component is the difference of two floors, not floor(base * 10 bps).
    const base = operation === 'swapFT' ? args.inputTbcSat
      : s.tbcAmount - s.tbcAmount * s.ftAAmount / (s.ftAAmount + args.inputFtRaw);
    const total = base * 35n / 10000n, lp = base * 25n / 10000n;
    const service = total - lp >= 10n ? total - lp : 0n;
    if (operation === 'swapFT') {
      expected.poolValue += base - service;
      expected.tbcAmount += base - total;
      expected.ftAAmount = s.tbcAmount * s.ftAAmount / expected.tbcAmount;
      deltas.ftOutRaw = s.ftAAmount - expected.ftAAmount;
    } else {
      expected.poolValue -= base - total + service;
      expected.tbcAmount -= base;
      expected.ftAAmount += args.inputFtRaw;
      deltas.tbcOutSat = base - total;
    }
    deltas.serviceFeePaidSat = service;
  }
  return { state: expected, deltas };
}

/**
 * Run one accepted-parent lifecycle (call four times for the four variants).
 *
 * Required:
 *   variant: { timelocked: boolean, controllerCount: 0..5 }
 *   ftGenesisTx: real canonical TBC20 genesis Transaction
 *   userFT, funding: Pool3 input references with signing identities
 *   signers: { owner, lpOwner, recipient, poolFt, controllers: [] }
 *   localTransactions: Map<txid, Transaction>, including every ancestor
 *   commit: async (result, label) => void -- persist, enforce <=5 TPS, submit,
 *           and establish acceptance before resolving; implemented by caller
 * Optional:
 *   options: { firstTbcSat=10_000_000n, firstFtRaw=200_000_000n,
 *              matureLockTime, feePolicy, cleanup=true }
 *
 * Timelocked scenarios require an explicit already-mature positive lock height
 * or timestamp from the caller. Node finality/non-finality tests belong to the
 * caller; an interpreter-only rejection must not be reported as node rejection.
 * Every remaining owned FT/LP/TBC output is returned in recoverableOutputs.
 */
async function runScenario({ variant, ftGenesisTx, userFT: initialUserFT, funding: initialFunding,
  signers, localTransactions, commit, options = {} }) {
  assert(variant && typeof variant.timelocked === 'boolean');
  const { timelocked, controllerCount } = variant;
  assert(Number.isInteger(controllerCount) && controllerCount >= 0 && controllerCount <= 5);
  assert(localTransactions instanceof Map, 'all ancestry must be supplied as a local Map');
  assert.equal(typeof commit, 'function');
  for (const name of ['owner', 'lpOwner', 'recipient', 'poolFt']) assert(signers[name], `missing ${name} signer`);
  assert.equal(signers.controllers?.length ?? 0, controllerCount);
  assert(initialFunding?.signer && initialUserFT?.signer);
  assert(controllerOf(initialUserFT.signer).equals(controllerOf(signers.owner)), 'user FT signer must be owner');
  const firstTbcSat = options.firstTbcSat ?? 10_000_000n;
  const firstFtRaw = options.firstFtRaw ?? 200_000_000n;
  assert(typeof firstTbcSat === 'bigint' && firstTbcSat >= 1_000_000n);
  assert(typeof firstFtRaw === 'bigint' && firstFtRaw >= firstTbcSat);
  const matureLockTime = options.matureLockTime;
  if (timelocked) assert(Number.isInteger(matureLockTime) && matureLockTime > 1 && matureLockTime <= 0xffffffff,
    'timelocked scenario requires an explicitly confirmed mature lockTime');
  const mode = `${controllerCount ? `hash${controllerCount}` : 'public'}-${timelocked ? 'locked' : 'plain'}`;
  const ownerAddress = addressOf(signers.owner), lpAddress = addressOf(signers.lpOwner);
  const recipientAddress = addressOf(signers.recipient);
  const chain = localTransactions, history = [], negativeChecks = [], consumed = new Set();
  const ownedAssets = new Map(), ownedTbc = new Map(), burnedLP = [];
  const authorization = controllerCount ? { kind: 'controller', controllerPubKeyHashes: signers.controllers
    .map(signer => tbc.crypto.Hash.sha256ripemd160(publicKey(signer)).toString('hex')) } : { kind: 'public' };
  const pool = new PoolNFT3({ ftGenesisTx, authorization, lp: { kind: timelocked ? 'timelocked' : 'plain' }, lpPlan: 1 });
  assert(chain.has(ftGenesisTx.id), 'FT genesis must already be accepted and registered');
  let currentFunding = initialFunding, currentPool, userFT = { ...initialUserFT, ancestors: chain };
  let controllerStep = 0;
  const initialFTBalance = TBC20.parseTape(userFT.parentTx.outputs[userFT.outputIndex + 1].script).balance;
  ownedAssets.set(referenceId(userFT.parentTx, userFT.outputIndex), { ...userFT, family: 'tbc20', role: 'initial-user-ft', amountRaw: initialFTBalance });

  function asset(result, role, signer) {
    const output = result.layout.assetOutputs.find(item => item.role === role);
    assert(output, `${result.layout.operation} has ${role}`);
    return { parentTx: result.transaction, outputIndex: output.codeVout, signer, ancestors: chain, amountRaw: output.amountRaw };
  }

  function common() {
    const ancestorTx = chain.get(currentPool.transaction.inputs[0].prevTxId.toString('hex'));
    assert(ancestorTx, 'Pool ancestor is present locally');
    return { pool: { parentTx: currentPool.transaction, ancestorTx }, poolFT: asset(currentPool, 'pool-ft', signers.poolFt),
      funding: currentFunding, feePolicy: options.feePolicy,
      ...(controllerCount ? { controllerSigner: signers.controllers[controllerStep++ % controllerCount] } : {}) };
  }

  function parseAsset(output, code, tape) {
    if (output.family === 'tbc20') return TBC20.parseTape(tape.script);
    LP.validateCode(code.script, { tapeSize: pool.tapeSize, timelocked, poolCodeHash: currentPool.nextState.poolCodeHash });
    return LP.parseTape(tape.script, { tapeSize: pool.tapeSize, timelocked });
  }

  function assertResult(result, label) {
    const tx = result.transaction;
    assert.equal(result.validation.success, true, label);
    assert.equal(result.validation.valueConserved, true, label);
    assert.equal(result.validation.nodeAcceptanceChecked, false, 'SDK must not claim node acceptance');
    assert.equal(result.validation.inputs.length, tx.inputs.length);
    assert(result.validation.inputs.every(input => input.success && input.stackDepth === 1), label);
    assert.equal(result.txid, tx.id); assert.equal(result.txraw, tx.uncheckedSerialize());
    assert(result.reservedBytes >= result.txraw.length / 2);
    if (result.nextState) {
      const tape = tx.outputs[1].script;
      assert.equal(tape.toBuffer().length, 143, `${label}: canonical Pool Tape size`);
      assert.equal(tape.toHex().slice(0, 8), '006a4c82', `${label}: standard OP_PUSHDATA1 framing`);
      assert.equal(tape.chunks[2].opcodenum, tbc.Opcode.OP_PUSHDATA1);
      assert.equal(tape.chunks[2].buf.length, 130);
      assert(result.nextState.poolValue >= DUST, `${label}: retained Pool Code value`);
      assert.equal(BigInt(tx.outputs[0].satoshis), result.nextState.poolValue);
    }
    const previousValue = sum(tx.inputs.map(input => {
      const parent = chain.get(input.prevTxId.toString('hex'));
      assert(parent, `${label}: missing accepted parent ${input.prevTxId.toString('hex')}`);
      const output = parent.outputs[input.outputIndex];
      assert(output); assert.equal(input.output.satoshis, output.satoshis);
      assert.equal(input.output.script.toHex(), output.script.toHex());
      assert(!consumed.has(referenceId(parent, input.outputIndex)), `${label}: locally repeated spend`);
      return BigInt(output.satoshis);
    }));
    assert.equal(result.feeSat, previousValue - sum(tx.outputs.map(output => BigInt(output.satoshis))));
    assert(result.feeSat > 0n);
    for (const output of result.layout?.assetOutputs ?? []) {
      const code = tx.outputs[output.codeVout], tape = tx.outputs[output.tapeVout];
      assert.equal(output.tapeVout, output.codeVout + 1);
      assert.equal(code.satoshis, 500); assert.equal(tape.satoshis, 0);
      const decoded = parseAsset(output, code, tape);
      assert.deepEqual(decoded.amounts, output.amountsByInput, `${label} ${output.role} absolute vin slots`);
      assert.equal(decoded.balance, output.amountRaw);
      if (output.role === 'pool-ft') assert(getTBC20Controller(code.script).equals(Buffer.concat([
        tbc.crypto.Hash.sha256ripemd160(result.nextState.poolCodeHash), Buffer.from([1])])));
      if (output.role === 'lp-burn') assert.equal(LP.parseCode(code.script).controller.toString('hex'), BURN_CONTROLLER);
    }
    const operation = result.layout?.operation, option = OPTIONS[operation];
    if (option) {
      assert.equal(tx.inputs.length, option === 3 ? 3 : 4);
      assert.equal(tx.inputs[0].script.chunks.length, getPoolUnlockLeafCount(option, controllerCount > 0));
      assert.equal(result.nextState.outpoint.txId, result.txid);
    }
    for (let vin = 0; vin < tx.inputs.length; vin++) {
      const role = result.layout?.inputRoles[vin];
      if (!['user-ft', 'pool-ft', 'lp-owner'].includes(role)) continue;
      assert.equal(tx.inputs[vin].script.chunks.length, 123, `${label}: full asset ABI`);
      const input = tx.inputs[vin], parent = chain.get(input.prevTxId.toString('hex'));
      const family = role === 'lp-owner' ? 'ftlp' : 'tbc20';
      const old = family === 'ftlp' ? LP.parseTape(parent.outputs[input.outputIndex + 1].script, { tapeSize: pool.tapeSize, timelocked })
        : TBC20.parseTape(parent.outputs[input.outputIndex + 1].script);
      assert.equal(sum(result.layout.assetOutputs.filter(a => a.family === family).map(a => a.amountsByInput[vin])), old.balance,
        `${label}: exact conservation for vin ${vin}`);
    }
  }

  async function accept(result, shortLabel) {
    const label = `${mode}/${shortLabel}`;
    assertResult(result, label);
    // Do not register parents, consume local outputs or advance the head until
    // the caller has persisted and established acceptance of this exact raw.
    await commit(result, label);
    for (const input of result.transaction.inputs) {
      const ref = `${input.prevTxId.toString('hex')}:${input.outputIndex}`;
      consumed.add(ref); ownedAssets.delete(ref); ownedTbc.delete(ref);
    }
    chain.set(result.txid, result.transaction);
    history.push({ label, result });
    return result;
  }

  function ownerForOutput(result, output) {
    const code = result.transaction.outputs[output.codeVout].script;
    const controller = output.family === 'tbc20' ? getTBC20Controller(code) : LP.parseCode(code).controller;
    return [signers.owner, signers.lpOwner, signers.recipient].find(signer => controller.equals(controllerOf(signer)));
  }

  function updateWallet(result) {
    for (const output of result.layout?.assetOutputs ?? []) {
      if (output.role === 'lp-burn') { burnedLP.push({ txid: result.txid, outputIndex: output.codeVout, amountRaw: output.amountRaw }); continue; }
      const signer = ownerForOutput(result, output);
      if (signer) ownedAssets.set(referenceId(result.transaction, output.codeVout), {
        ...asset(result, output.role, signer), family: output.family, role: output.role,
      });
    }
    if (result.layout?.userTbcVout !== undefined) {
      const outputIndex = result.layout.userTbcVout;
      ownedTbc.set(referenceId(result.transaction, outputIndex), { parentTx: result.transaction, outputIndex,
        signer: signers.owner, amountSat: BigInt(result.transaction.outputs[outputIndex].satoshis), role: 'user-tbc' });
    }
    assert.notEqual(result.changeVout, undefined, 'scenario funding must leave a live fee/principal output');
    currentFunding = { parentTx: result.transaction, outputIndex: result.changeVout, signer: initialFunding.signer };
    if (result.nextState) currentPool = result;
    const ftChange = result.layout?.assetOutputs.find(output => output.role === 'ft-change');
    // Preserve the main FT inventory when a swap uses a separate received FT
    // output. Never silently substitute that small change for the inventory.
    if (ftChange && result.transaction.inputs.some(input => input.prevTxId.toString('hex') === userFT.parentTx.id && input.outputIndex === userFT.outputIndex)) {
      userFT = asset(result, 'ft-change', signers.owner);
    }
  }

  async function run(method, args, label) {
    const old = currentPool.nextState;
    const expected = OPTIONS[method] ? expectedOperation(method, old, args) : undefined;
    const result = await pool[method](args);
    if (expected) {
      assert.deepEqual(mathState(result.nextState), expected.state, `${label}: independent state oracle`);
      for (const [field, value] of Object.entries(expected.deltas)) {
        assert.equal(field === 'serviceFeePaidSat' ? result.quote.fees[field] : result.quote[field], value, `${label}: ${field}`);
      }
      if (method === 'swapFT' || method === 'swapTBC') {
        const feeOutput = result.transaction.outputs[result.layout.serviceFeeVout];
        assert.equal(BigInt(feeOutput.satoshis), expected.deltas.serviceFeePaidSat);
        if (feeOutput.satoshis === 0) assert.equal(feeOutput.script.toHex(), '006a');
        else assert(feeOutput.script.isPublicKeyHashOut());
      }
    } else assert.equal(result.nextState, undefined, 'LP transfer cannot mutate Pool state');
    await accept(result, label);
    updateWallet(result);
    return result;
  }

  const minted = await pool.mintPoolNFT({ funding: initialFunding, feePolicy: options.feePolicy });
  await accept(minted.source, 'mint-source');
  await accept(minted, 'mint-pool'); updateWallet(minted);
  assert.equal(pool.tapeSize, TBC20.parseTape(ftGenesisTx.outputs[1].script).size);
  assert.deepEqual(mathState(minted.nextState), { ftLpAmount: 0n, ftAAmount: 0n, tbcAmount: 0n, poolValue: DUST });

  async function add(incrementSat, firstFtAmountRaw, label, lockTime = matureLockTime) {
    const args = { ...common(), userFT, incrementSat, firstFtAmountRaw,
      lpReceiverAddress: lpAddress, minLpOutRaw: 1n, ...(timelocked ? { lpLockTime: lockTime } : {}) };
    return run('addLP', args, label);
  }

  const first = await add(firstTbcSat, firstFtRaw, 'add-first');
  assert.equal(first.quote.ftLpIncrementRaw, firstTbcSat);
  assert.equal(first.quote.ftAIncrementRaw, firstFtRaw);
  const firstLP = asset(first, 'new-lp', signers.lpOwner);
  const smallIncrementSat = firstTbcSat / 10n;
  assert(smallIncrementSat <= currentPool.nextState.tbcAmount);
  const second = await add(smallIncrementSat, undefined, 'add-small-branch', timelocked ? matureLockTime - 1 : undefined);
  const secondLP = asset(second, 'new-lp', signers.lpOwner);
  const largeIncrementSat = currentPool.nextState.tbcAmount * 2n;
  assert(largeIncrementSat > currentPool.nextState.tbcAmount);
  const third = await add(largeIncrementSat, undefined, 'add-large-branch');
  const thirdLP = asset(third, 'new-lp', signers.lpOwner);
  const lpTotal = currentPool.nextState.ftLpAmount;

  const positiveFT = await run('swapFT', { ...common(), inputTbcSat: firstTbcSat / 10n,
    receiverAddress: ownerAddress, minFtOutRaw: 1n }, 'swap-ft-paid-service');
  assert(positiveFT.quote.fees.serviceFeePaidSat >= 10n);
  const positiveSwapFT = asset(positiveFT, 'user-ft', signers.owner);
  const positiveTBC = await run('swapTBC', { ...common(), userFT: positiveSwapFT,
    inputFtRaw: positiveSwapFT.amountRaw / 2n, receiverAddress: ownerAddress, minTbcOutSat: 1n }, 'swap-tbc-paid-service-with-change');
  assert(positiveTBC.quote.fees.serviceFeePaidSat >= 10n);
  assert(positiveTBC.layout.assetOutputs.some(output => output.role === 'ft-change'));
  const zeroFT = await run('swapFT', { ...common(), inputTbcSat: 1000n,
    receiverAddress: ownerAddress, minFtOutRaw: 1n }, 'swap-ft-zero-service');
  assert.equal(zeroFT.quote.fees.serviceFeePaidSat, 0n);
  const smallSwapFT = asset(zeroFT, 'user-ft', signers.owner);
  const zeroTBC = await run('swapTBC', { ...common(), userFT: smallSwapFT,
    inputFtRaw: smallSwapFT.amountRaw, receiverAddress: ownerAddress, minTbcOutSat: 1n }, 'swap-tbc-zero-service-without-change');
  assert.equal(zeroTBC.quote.fees.serviceFeePaidSat, 0n);
  assert(!zeroTBC.layout.assetOutputs.some(output => output.role === 'ft-change'));
  assert.equal(currentPool.nextState.ftLpAmount, lpTotal);

  // Safe negative checks: rejected locally and NEVER passed to commit. The
  // record explicitly distinguishes these from a node rejection experiment.
  const negative = (label, fn, pattern) => { assert.throws(fn, pattern); negativeChecks.push({ label, layer: 'sdk-local', rejected: true }); };
  const swapArgs = { ...common(), inputTbcSat: 1000n, receiverAddress: ownerAddress, minFtOutRaw: 1n };
  negative('stale Pool snapshot', () => pool.prepareSwapFT({ ...swapArgs, expectedSnapshotHash: '00'.repeat(32) }), /STALE_POOL_STATE/);
  negative('slippage protection', () => pool.prepareSwapFT({ ...swapArgs, minFtOutRaw: currentPool.nextState.ftAAmount }), /below minFtOutRaw/);
  if (controllerCount) {
    negative('missing Controller', () => pool.prepareSwapFT({ ...swapArgs, controllerSigner: undefined }), /Controller signer/);
    const ownerHash = controllerOf(signers.owner).subarray(0, 20).toString('hex');
    if (!authorization.controllerPubKeyHashes.includes(ownerHash)) negative('non-whitelist Controller',
      () => pool.prepareSwapFT({ ...swapArgs, controllerSigner: signers.owner }), /whitelist/);
  }
  if (timelocked) {
    await assert.rejects(pool.transferLP({ inputs: [firstLP], funding: currentFunding, receiverAddress: recipientAddress,
      amountRaw: firstLP.amountRaw / 2n, lockTime: matureLockTime - 1, feePolicy: options.feePolicy }), /lock|validation|matur|time/i);
    negativeChecks.push({ label: 'LP spend below embedded maturity', layer: 'sdk-local', rejected: true });
    if (lpAddress !== recipientAddress) negative('unlock cannot redirect owner', () => pool.prepareUnlockLP({ inputs: [firstLP],
      funding: currentFunding, receiverAddress: recipientAddress, feePolicy: options.feePolicy }), /preserves ownership/);
  } else {
    negative('plain LP cannot unlock', () => pool.prepareUnlockLP({ inputs: [firstLP], funding: currentFunding,
      receiverAddress: lpAddress, feePolicy: options.feePolicy }), /timelocked/);
  }

  const poolHeadBeforeTransfers = currentPool.txid;
  const split1 = await run('transferLP', { inputs: [firstLP], funding: currentFunding,
    receiverAddress: recipientAddress, amountRaw: firstLP.amountRaw / 2n, feePolicy: options.feePolicy }, 'lp-transfer-owner-a-to-b');
  const split2 = await run('transferLP', { inputs: [secondLP], funding: currentFunding,
    receiverAddress: recipientAddress, amountRaw: secondLP.amountRaw / 3n, feePolicy: options.feePolicy }, 'lp-transfer-second-split');
  const mergeInputs = [asset(split1, 'lp-transfer', signers.recipient), asset(split1, 'lp-change', signers.lpOwner),
    asset(split2, 'lp-transfer', signers.recipient), asset(split2, 'lp-change', signers.lpOwner), thirdLP];
  const merged = await run('transferLP', { inputs: mergeInputs, funding: currentFunding,
    receiverAddress: lpAddress, amountRaw: lpTotal, feePolicy: options.feePolicy }, 'lp-merge-five-inputs-two-owners');
  assert.equal(merged.transaction.inputs.length, 6);
  assert.deepEqual(merged.layout.assetOutputs[0].amountsByInput, [...mergeInputs.map(input => input.amountRaw), 0n]);
  assert.equal(currentPool.txid, poolHeadBeforeTransfers, 'all independent LP operations leave Pool unspent');
  let heldLP = asset(merged, 'lp-transfer', signers.lpOwner);
  if (timelocked) {
    const unlocked = await run('unlockLP', { inputs: [heldLP], funding: currentFunding,
      receiverAddress: lpAddress, feePolicy: options.feePolicy }, 'lp-unlock-mature');
    heldLP = asset(unlocked, 'lp-transfer', signers.lpOwner);
    assert.equal(LP.parseTape(heldLP.parentTx.outputs[heldLP.outputIndex + 1].script, { timelocked, tapeSize: pool.tapeSize }).lockTime, 0);
    assert.equal(unlocked.transaction.nLockTime, matureLockTime);
    assert.equal(unlocked.transaction.inputs[0].sequenceNumber, 0xfffffffe);
  }
  const partial = await run('removeLP', { ...common(), userLP: heldLP, burnAmountRaw: lpTotal / 4n,
    receiverAddress: ownerAddress, minFtOutRaw: 1n, minTbcOutSat: 1n }, 'remove-partial');
  const remainder = asset(partial, 'lp-change', signers.lpOwner);
  const removed = await run('removeLP', { ...common(), userLP: remainder, burnAmountRaw: remainder.amountRaw,
    receiverAddress: ownerAddress }, 'remove-all');
  assert.deepEqual(mathState(removed.nextState), { ftLpAmount: 0n, ftAAmount: 0n, tbcAmount: 0n, poolValue: DUST });
  assert.equal(asset(removed, 'pool-ft', signers.poolFt).amountRaw, 0n);

  const reinit = await add(firstTbcSat / 10n, firstFtRaw / 10n, 'reinitialize-empty-pool', timelocked ? 0 : undefined);
  assert.equal(reinit.quote.isFirstAddLP, true);
  assert.equal(reinit.transaction.outputs[0].script.toHex(), minted.transaction.outputs[0].script.toHex());
  let remainingLP = asset(reinit, 'new-lp', signers.lpOwner);
  if (options.cleanup !== false) {
    const cleanup = await run('removeLP', { ...common(), userLP: remainingLP, burnAmountRaw: remainingLP.amountRaw,
      receiverAddress: ownerAddress }, 'cleanup-remove-all');
    assert.deepEqual(mathState(cleanup.nextState), { ftLpAmount: 0n, ftAAmount: 0n, tbcAmount: 0n, poolValue: DUST });
    remainingLP = undefined;
  }
  const restored = PoolNFT3.fromPool(currentPool.transaction, ftGenesisTx);
  assert.equal(restored.readPoolState(currentPool.transaction).snapshotHash, currentPool.nextState.snapshotHash);
  const recoverableOutputs = { ft: [...ownedAssets.values()].filter(item => item.family === 'tbc20'),
    lp: [...ownedAssets.values()].filter(item => item.family === 'ftlp'), tbc: [...ownedTbc.values(), {
      ...currentFunding, amountSat: BigInt(currentFunding.parentTx.outputs[currentFunding.outputIndex].satoshis), role: 'funding-change',
    }] };
  assert.equal(sum(recoverableOutputs.ft.map(item => item.amountRaw)) + currentPool.nextState.ftAAmount, initialFTBalance,
    'all owned FT fragments plus Pool reserve reconcile to the original FT input');
  assert.equal(sum(recoverableOutputs.lp.map(item => item.amountRaw)), currentPool.nextState.ftLpAmount,
    'all unburned LP outputs reconcile to current LP supply');
  return { mode, pool, history, negativeChecks, currentPool, funding: currentFunding, userFT, remainingLP,
    localTransactions: chain, recoverableOutputs, burnedLP,
    totals: { transactionCount: history.length, minerFeesSat: sum(history.map(item => item.result.feeSat)),
      serviceFeesSat: sum(history.map(item => item.result.quote?.fees?.serviceFeePaidSat ?? 0n)), initialFTBalance,
      recoveredFTBalance: sum(recoverableOutputs.ft.map(item => item.amountRaw)), poolCodeLockedSat: currentPool.nextState.poolValue } };
}

module.exports = { runScenario, expectedOperation };
