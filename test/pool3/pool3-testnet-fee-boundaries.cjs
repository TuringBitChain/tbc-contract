'use strict';

// Local-only extension of an accepted, fully cleared plan-1 fee lane. No key
// loading, network, indexer or broadcasting. commit owns durable acceptance.
const assert = require('node:assert/strict');
const tbc = require('tbc-lib-js');
const TBC20 = require('../../lib/contract/tbc20.js');
const { FTLPTBC20: LP } = require('../../lib/contract/ftlpTbc20.js');
const { parsePoolCode } = require('../../lib/util/poolnft3/artifacts.js');
const { getTBC20Controller } = require('../../lib/util/tbc20/tbc20unlock.js');
const { validatePool3Transaction } = require('../../lib/validator/poolnft3.js');

const DUST = 1500n, FIRST_TBC = 1_000_000n, FIRST_FT = 20_000_000n;
const FEE_ADDRESS = '13oCEJaqyyiC8iRrfup6PDL2GKZ3xQrsZL';
const keyBytes = signer => Buffer.isBuffer(signer.publicKey) ? Buffer.from(signer.publicKey) : Buffer.from(signer.publicKey, 'hex');
const ownerHash = signer => tbc.crypto.Hash.sha256ripemd160(keyBytes(signer));
const addressOf = signer => tbc.PublicKey.fromBuffer(keyBytes(signer)).toAddress().toString();
const outpoint = (tx, vout) => `${tx.id}:${vout}`;
const sum = values => values.reduce((total, value) => total + value, 0n);
const mathState = state => Object.fromEntries(['ftLpAmount', 'ftAAmount', 'tbcAmount', 'poolValue'].map(key => [key, state[key]]));

// Independent plan-1 fee oracle: the nominal service component is the
// difference of two floors, never floor(base * (totalBps - lpBps) / 10000).
function feeOracle(base) {
  const total = base * 35n / 10_000n, lp = base * 25n / 10_000n;
  const accrued = total - lp, paid = accrued >= 10n ? accrued : 0n;
  return { baseTbcSat: base, totalFeeSat: total, lpFeeSat: lp,
    serviceFeeAccruedSat: accrued, serviceFeePaidSat: paid,
    serviceFeeRetainedSat: accrued - paid, poolFeeRetainedSat: total - paid,
    netAmountSat: base - total };
}
function oracle(state, operation, input) {
  const next = mathState(state);
  if (operation === 'swapFT') {
    const fees = feeOracle(input);
    next.poolValue += input - fees.serviceFeePaidSat;
    next.tbcAmount += fees.netAmountSat;
    next.ftAAmount = state.tbcAmount * state.ftAAmount / next.tbcAmount;
    return { nextState: next, fees, output: state.ftAAmount - next.ftAAmount };
  }
  next.ftAAmount += input;
  next.tbcAmount = state.tbcAmount * state.ftAAmount / next.ftAAmount;
  const fees = feeOracle(state.tbcAmount - next.tbcAmount);
  next.poolValue -= fees.netAmountSat + fees.serviceFeePaidSat;
  return { nextState: next, fees, output: fees.netAmountSat };
}

function selectInput(state, operation, target, availableFt) {
  // floor(35B/10000)-floor(25B/10000) differs from B/1000 by
  // strictly less than one. Search only the exact 2000-sat enclosing band.
  const start = (target - 1n) * 1000n, end = (target + 1n) * 1000n;
  for (let base = start > 0n ? start : 1n; base <= end; base += 1n) {
    if (feeOracle(base).serviceFeeAccruedSat !== target) continue;
    let input = base;
    if (operation === 'swapTBC') {
      // Search FT raw units against the exact contract gross TBC function.
      // The fee function itself is NOT monotone at every integer, so it must
      // not be used as a binary-search predicate.
      let low = 1n, high = availableFt < state.ftAAmount ? availableFt : state.ftAAmount - 1n;
      if (high < low) continue;
      const gross = quantity => state.tbcAmount - state.tbcAmount * state.ftAAmount / (state.ftAAmount + quantity);
      if (gross(high) < base) continue;
      while (low < high) {
        const middle = (low + high) / 2n;
        if (gross(middle) >= base) high = middle;
        else low = middle + 1n;
      }
      input = low;
    }
    const expected = oracle(state, operation, input);
    if (expected.fees.serviceFeeAccruedSat !== target || expected.fees.poolFeeRetainedSat <= 0n || expected.output <= 0n) continue;
    if (operation === 'swapFT' && expected.fees.netAmountSat >= state.tbcAmount) continue;
    if (operation === 'swapTBC' && expected.output < 80n) continue;
    return { input, expected };
  }
  throw new Error(`No exact ${operation} nominal service fee ${target} sat candidate`);
}

/**
 * Extend runFeePlan's fully-cleared public/plain plan-1 result by eight txs:
 * re-add 1 TBC / 20m raw FT, both swap directions at nominal fee 9/10/41,
 * then full RemoveLP. All new FT/LP/TBC ownership remains with supplied owners.
 *
 * completedFeePlan is the actual runFeePlan return value, not a stale snapshot.
 * Its original eight transaction bytes and return object are not modified.
 * commit(result,label) must resolve only after acceptance; throw or return false
 * to reject a candidate without advancing local state.
 */
async function runFeeBoundaries({ lane = 12, completedFeePlan, signers, localTransactions, commit, feePolicy }) {
  assert(completedFeePlan?.lpPlan === 1 && completedFeePlan.pool, 'requires the completed plan-1 lane');
  assert(localTransactions instanceof Map && typeof commit === 'function');
  assert(signers?.owner && signers.poolFt);
  const chain = localTransactions, pool = completedFeePlan.pool, tapeSize = completedFeePlan.tapeSize;
  const lpSigner = signers.lpOwner ?? signers.owner;
  let currentPool = completedFeePlan.currentPool, funding = { ...completedFeePlan.funding };
  let userFT = { ...completedFeePlan.userFT, ancestors: chain };
  assert.deepEqual(mathState(currentPool.nextState), { ftLpAmount: 0n, ftAAmount: 0n, tbcAmount: 0n, poolValue: DUST });
  assert.equal(chain.get(currentPool.txid)?.uncheckedSerialize(), currentPool.txraw);
  assert.equal(currentPool.nextState.tape.withSwapHashLock, false);
  assert.equal(currentPool.nextState.tape.withLpLocktime, false);
  assert.equal(currentPool.nextState.tape.lpPlan, 1);
  assert.equal(addressOf(userFT.signer), addressOf(signers.owner));
  const history = [], boundaries = [], consumed = new Set();
  const ownedAssets = new Map([...completedFeePlan.recoverableOutputs.ft, ...completedFeePlan.recoverableOutputs.lp]
    .map(item => [outpoint(item.parentTx, item.outputIndex), { ...item, ancestors: chain }]));
  const ownedTbc = new Map(completedFeePlan.recoverableOutputs.tbc
    .map(item => [outpoint(item.parentTx, item.outputIndex), { ...item }]));
  const initialFTBalance = sum([...ownedAssets.values()].filter(item => item.family === 'tbc20').map(item => item.amountRaw));
  assert(ownedAssets.has(outpoint(userFT.parentTx, userFT.outputIndex)), 'FT inventory must be unspent in completed lane');
  assert(TBC20.parseTape(userFT.parentTx.outputs[userFT.outputIndex + 1].script).balance > FIRST_FT);
  const feeScript = tbc.Script.buildPublicKeyHashOut(FEE_ADDRESS), feeHash = tbc.crypto.Hash.sha256(feeScript.toBuffer());
  const mode = `lane${lane}-plan1-fee-boundaries`;

  function asset(result, role, signer = signers.owner) {
    const output = result.layout.assetOutputs.find(item => item.role === role);
    assert(output, `missing ${role}`);
    return { parentTx: result.transaction, outputIndex: output.codeVout, signer, ancestors: chain,
      amountRaw: output.amountRaw, family: output.family, role };
  }
  function common() {
    const ancestorTx = chain.get(currentPool.transaction.inputs[0].prevTxId.toString('hex'));
    assert(ancestorTx);
    return { pool: { parentTx: currentPool.transaction, ancestorTx },
      poolFT: asset(currentPool, 'pool-ft', signers.poolFt), funding, feePolicy };
  }
  function verify(result) {
    const tx = result.transaction;
    assert.equal(result.validation.success, true);
    assert.equal(result.validation.nodeAcceptanceChecked, false);
    assert.equal(validatePool3Transaction(tx).success, true, 'execute all actual previous scripts and signatures');
    assert.equal(result.txraw, tx.uncheckedSerialize()); assert.equal(result.txid, tx.id);
    const inputSum = sum(tx.inputs.map(input => {
      const parent = chain.get(input.prevTxId.toString('hex'));
      assert(parent && !consumed.has(outpoint(parent, input.outputIndex)));
      assert.equal(input.output.satoshis, parent.outputs[input.outputIndex].satoshis);
      assert.equal(input.output.script.toHex(), parent.outputs[input.outputIndex].script.toHex());
      return BigInt(input.output.satoshis);
    }));
    assert.equal(result.feeSat, inputSum - sum(tx.outputs.map(output => BigInt(output.satoshis))));
    assert(result.feeSat > 0n);
    assert(parsePoolCode(tx.outputs[0].script).tbcFeeScriptHash.equals(feeHash));
    for (const output of result.layout.assetOutputs) {
      const code = tx.outputs[output.codeVout], tape = tx.outputs[output.tapeVout];
      assert.equal(code.satoshis, 500); assert.equal(tape.satoshis, 0);
      assert.equal(tape.script.toBuffer().length, tapeSize);
      const parsed = output.family === 'tbc20' ? TBC20.parseTape(tape.script)
        : LP.parseTape(tape.script, { timelocked: false, tapeSize });
      assert.deepEqual(parsed.amounts, output.amountsByInput); assert.equal(parsed.balance, output.amountRaw);
      const controller = output.family === 'tbc20' ? getTBC20Controller(code.script) : LP.parseCode(code.script).controller;
      if (output.role === 'pool-ft') assert(controller.equals(Buffer.concat([
        tbc.crypto.Hash.sha256ripemd160(result.nextState.poolCodeHash), Buffer.from([1]),
      ])));
      else if (output.role !== 'lp-burn') assert(controller.equals(Buffer.concat([
        ownerHash(output.family === 'tbc20' ? signers.owner : lpSigner), Buffer.from([0]),
      ])));
    }
    for (let vin = 0; vin < tx.inputs.length; vin += 1) {
      const role = result.layout.inputRoles[vin];
      if (!['user-ft', 'pool-ft', 'lp-owner'].includes(role)) continue;
      const input = tx.inputs[vin], parent = chain.get(input.prevTxId.toString('hex'));
      const tape = parent.outputs[input.outputIndex + 1].script, family = role === 'lp-owner' ? 'ftlp' : 'tbc20';
      const old = family === 'ftlp' ? LP.parseTape(tape, { timelocked: false, tapeSize }) : TBC20.parseTape(tape);
      assert.equal(sum(result.layout.assetOutputs.filter(output => output.family === family).map(output => output.amountsByInput[vin])), old.balance);
    }
  }
  async function accept(result, label) {
    verify(result);
    const accepted = await commit(result, `${mode}/${label}`);
    assert.notEqual(accepted, false, `${mode}/${label}: commit explicitly rejected the transaction`);
    // Nothing below is allowed to happen before the caller establishes ACK.
    for (const input of result.transaction.inputs) {
      const id = `${input.prevTxId.toString('hex')}:${input.outputIndex}`;
      consumed.add(id); ownedAssets.delete(id); ownedTbc.delete(id);
    }
    chain.set(result.txid, result.transaction); history.push({ label: `${mode}/${label}`, result });
    for (const output of result.layout.assetOutputs) {
      if (output.role === 'pool-ft' || output.role === 'lp-burn') continue;
      ownedAssets.set(outpoint(result.transaction, output.codeVout), asset(result, output.role,
        output.family === 'ftlp' ? lpSigner : signers.owner));
    }
    if (result.layout.userTbcVout !== undefined) {
      const outputIndex = result.layout.userTbcVout;
      ownedTbc.set(outpoint(result.transaction, outputIndex), { parentTx: result.transaction, outputIndex,
        signer: signers.owner, amountSat: BigInt(result.transaction.outputs[outputIndex].satoshis), role: 'user-tbc' });
    }
    if (result.layout.assetOutputs.some(output => output.role === 'ft-change') && result.transaction.inputs.some(input =>
      input.prevTxId.toString('hex') === userFT.parentTx.id && input.outputIndex === userFT.outputIndex)) userFT = asset(result, 'ft-change');
    assert.notEqual(result.changeVout, undefined);
    funding = { parentTx: result.transaction, outputIndex: result.changeVout, signer: completedFeePlan.funding.signer };
    currentPool = result;
    return result;
  }

  const added = await pool.addLP({ ...common(), userFT, incrementSat: FIRST_TBC, firstFtAmountRaw: FIRST_FT,
    lpReceiverAddress: addressOf(lpSigner), minLpOutRaw: FIRST_TBC });
  assert.deepEqual(mathState(added.nextState), { ftLpAmount: FIRST_TBC, ftAAmount: FIRST_FT,
    tbcAmount: FIRST_TBC, poolValue: FIRST_TBC + DUST });
  await accept(added, 're-add-first');
  const heldLP = asset(added, 'new-lp', lpSigner);
  for (const target of [9n, 10n, 41n]) for (const operation of ['swapFT', 'swapTBC']) {
    const availableFt = TBC20.parseTape(userFT.parentTx.outputs[userFT.outputIndex + 1].script).balance;
    const { input, expected } = selectInput(currentPool.nextState, operation, target, availableFt);
    const options = { ...common(), receiverAddress: addressOf(signers.owner),
      ...(operation === 'swapFT' ? { inputTbcSat: input, minFtOutRaw: 1n }
        : { userFT, inputFtRaw: input, minTbcOutSat: 80n }) };
    const result = await pool[operation](options);
    assert.deepEqual(mathState(result.nextState), expected.nextState);
    assert.deepEqual(result.quote.fees, expected.fees);
    assert.equal(result.nextState.ftLpAmount, FIRST_TBC);
    const fee = result.transaction.outputs[result.layout.serviceFeeVout];
    const paid = target === 9n ? 0n : target;
    assert.equal(BigInt(fee.satoshis), paid);
    assert.equal(fee.script.toHex(), paid === 0n ? '006a' : feeScript.toHex());
    if (paid) assert(tbc.crypto.Hash.sha256(fee.script.toBuffer()).equals(feeHash));
    if (operation === 'swapFT') assert.equal(asset(result, 'user-ft').amountRaw, expected.output);
    else assert.equal(BigInt(result.transaction.outputs[result.layout.userTbcVout].satoshis), expected.output);
    await accept(result, `${operation}-nominal-${target}`);
    boundaries.push({ operation, nominalServiceFeeSat: target, serviceFeePaidSat: paid,
      inputAmount: input, baseTbcSat: expected.fees.baseTbcSat, feeVout: result.layout.serviceFeeVout, txid: result.txid });
  }
  const old = mathState(currentPool.nextState);
  const removed = await pool.removeLP({ ...common(), userLP: heldLP, burnAmountRaw: FIRST_TBC,
    receiverAddress: addressOf(signers.owner), minFtOutRaw: 1n, minTbcOutSat: 80n });
  assert.equal(asset(removed, 'user-ft').amountRaw, old.ftAAmount);
  assert.equal(BigInt(removed.transaction.outputs[removed.layout.userTbcVout].satoshis), old.poolValue - DUST);
  assert.deepEqual(mathState(removed.nextState), { ftLpAmount: 0n, ftAAmount: 0n, tbcAmount: 0n, poolValue: DUST });
  await accept(removed, 'remove-all');
  const recoverableOutputs = {
    ft: [...ownedAssets.values()].filter(item => item.family === 'tbc20'),
    lp: [...ownedAssets.values()].filter(item => item.family === 'ftlp'),
    tbc: [...ownedTbc.values(), { ...funding, amountSat: BigInt(funding.parentTx.outputs[funding.outputIndex].satoshis), role: 'funding-change' }],
  };
  assert.equal(sum(recoverableOutputs.ft.map(item => item.amountRaw)), initialFTBalance);
  assert.equal(recoverableOutputs.lp.length, 0);
  assert.equal(history.length, 8);
  assert.equal(sum(boundaries.map(item => item.serviceFeePaidSat)), 102n);
  return { mode, lane, lpPlan: 1, tapeSize, pool, history, currentPool, funding, userFT, boundaries,
    recoverableOutputs, localTransactions: chain,
    totals: { transactionCount: history.length, minerFeesSat: sum(history.map(item => item.result.feeSat)),
      serviceFeesSat: 102n, initialFTBalance, recoveredFTBalance: sum(recoverableOutputs.ft.map(item => item.amountRaw)),
      poolCodeLockedSat: DUST } };
}

module.exports = { runFeeBoundaries };
