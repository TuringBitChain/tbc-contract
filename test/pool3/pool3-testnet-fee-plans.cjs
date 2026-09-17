'use strict';

// Local transaction construction and independent assertions only. The caller
// supplies accepted parents, all ancestry, signers, and a serial commit callback.
// Nothing here reads keys, uses an indexer, contacts a node, or broadcasts.
const assert = require('node:assert/strict');
const tbc = require('tbc-lib-js');
const TBC20 = require('../../lib/contract/tbc20.js');
const { PoolNFT3 } = require('../../lib/contract/poolNFT3.0.js');
const { FTLPTBC20 } = require('../../lib/contract/ftlpTbc20.js');
const { parsePoolCode } = require('../../lib/util/poolnft3/artifacts.js');
const { getTBC20Controller } = require('../../lib/util/tbc20unlock.js');

// Independent Pool2-compatible fixture; deliberately do not import SDK fee or
// quote helpers, so a shared wrong fee mapping cannot make this oracle pass.
const PLANS = Object.freeze({
  1: [35n, 25n, '13oCEJaqyyiC8iRrfup6PDL2GKZ3xQrsZL'],
  2: [35n, 5n, '1Fa6Uy64Ub4qNdB896zX2pNMx4a8zMhtCy'],
  3: [135n, 5n, '125fTLNsraQxTYqT4EeQNF2ggzcqicveKL'],
  4: [335n, 5n, '19DetoaaohQkjFVJ6oGXd83xhZYQSbpE1g'],
  5: [535n, 5n, '15EKrhuD8Yf3SfhjAgbizYqfnBbKh9ZMZ7'],
  6: [130n, 80n, '1N7rf2AuAHB2aCrVgnbQhSWhaUVk3rGhjm'],
});
const DUST = 1500n;
const FIRST_TBC = 1_000_000n;
const FIRST_FT = 20_000_000n;
const keyBytes = signer => Buffer.isBuffer(signer.publicKey) ? Buffer.from(signer.publicKey) : Buffer.from(signer.publicKey, 'hex');
const addressOf = signer => tbc.PublicKey.fromBuffer(keyBytes(signer)).toAddress().toString();
const outpoint = (tx, vout) => `${tx.id}:${vout}`;
const sum = values => values.reduce((total, value) => total + value, 0n);
const stateOf = state => Object.fromEntries(['ftLpAmount', 'ftAAmount', 'tbcAmount', 'poolValue'].map(key => [key, state[key]]));

function fees(base, lpPlan) {
  const [totalBps, lpBps] = PLANS[lpPlan];
  const total = base * totalBps / 10_000n, lp = base * lpBps / 10_000n;
  const accrued = total - lp, paid = accrued >= 10n ? accrued : 0n;
  return { baseTbcSat: base, totalFeeSat: total, lpFeeSat: lp,
    serviceFeeAccruedSat: accrued, serviceFeePaidSat: paid,
    serviceFeeRetainedSat: accrued - paid, poolFeeRetainedSat: total - paid,
    netAmountSat: base - total };
}

function swapOracle(previous, operation, input, lpPlan) {
  const next = stateOf(previous);
  if (operation === 'swapFT') {
    const fee = fees(input, lpPlan);
    next.poolValue += input - fee.serviceFeePaidSat;
    next.tbcAmount += fee.netAmountSat;
    next.ftAAmount = previous.ftAAmount - previous.ftAAmount * fee.netAmountSat / next.tbcAmount;
    return { nextState: next, fees: fee, ftOutRaw: previous.ftAAmount - next.ftAAmount };
  }
  next.ftAAmount += input;
  next.tbcAmount = previous.tbcAmount - previous.tbcAmount * input / next.ftAAmount;
  const gross = previous.tbcAmount - next.tbcAmount, fee = fees(gross, lpPlan);
  next.poolValue -= fee.netAmountSat + fee.serviceFeePaidSat;
  return { nextState: next, fees: fee, tbcOutSat: fee.netAmountSat, grossTbcOutSat: gross };
}

function zeroServiceRoundTrip(previous, lpPlan) {
  // Search in integer satoshis. Both directions must retain a positive fee
  // (a contract requirement), pay no service output, and avoid tiny TBC dust.
  for (let input = 80n; input <= 10_000n; input += 1n) {
    const forward = swapOracle(previous, 'swapFT', input, lpPlan);
    if (forward.fees.serviceFeePaidSat !== 0n || forward.fees.poolFeeRetainedSat <= 0n ||
        forward.fees.netAmountSat >= previous.tbcAmount || forward.ftOutRaw <= 0n) continue;
    const backward = swapOracle(forward.nextState, 'swapTBC', forward.ftOutRaw, lpPlan);
    if (backward.fees.serviceFeePaidSat === 0n && backward.fees.poolFeeRetainedSat > 0n && backward.tbcOutSat >= 80n) return input;
  }
  throw new Error(`Plan ${lpPlan}: no valid small zero-service round trip in search range`);
}

/**
 * Eight sequential accepted transactions for one fee plan and plain-LP Tape S.
 * commit(result, label) must persist the exact raw, enforce <=5 TPS, broadcast,
 * and establish acceptance BEFORE resolving. Throwing or returning false
 * rejects the candidate and stops the lane without advancing local state.
 *
 * signers: { owner, lpOwner?, poolFt }; all are SDK signing identities.
 * funding includes its own signer. userFT must belong to signers.owner.
 * The initial LP is kept untouched until full RemoveLP at the end.
 */
async function runFeePlan({ lane, lpPlan, tapeSize, ftGenesisTx, userFT: initialUserFT,
  funding: initialFunding, signers, localTransactions, commit, feePolicy }) {
  assert(Number.isInteger(lane) && lane >= 0);
  assert(PLANS[lpPlan], 'lpPlan must be 1..6');
  assert([61, 66, 127].includes(tapeSize), 'fee matrix covers Tape sizes 61, 66, 127');
  assert(localTransactions instanceof Map && typeof commit === 'function');
  assert(signers?.owner && signers.poolFt && initialFunding?.signer && initialUserFT?.signer);
  const lpSigner = signers.lpOwner ?? signers.owner;
  const ownerAddress = addressOf(signers.owner), lpAddress = addressOf(lpSigner);
  assert.equal(addressOf(initialUserFT.signer), ownerAddress, 'FT inventory owner mismatch');
  assert.equal(TBC20.parseTape(ftGenesisTx.outputs[1].script).size, tapeSize);
  assert.equal(localTransactions.get(ftGenesisTx.id)?.uncheckedSerialize(), ftGenesisTx.uncheckedSerialize());
  assert(BigInt(initialFunding.parentTx.outputs[initialFunding.outputIndex].satoshis) >= 2_000_000n, 'insufficient lane budget');
  const pool = new PoolNFT3({ ftGenesisTx, authorization: { kind: 'public' }, lp: { kind: 'plain' }, lpPlan });
  assert.equal(pool.tapeSize, tapeSize);
  const mode = `lane${lane}-plan${lpPlan}-s${tapeSize}`;
  const chain = localTransactions, history = [], consumed = new Set(), ownedAssets = new Map(), ownedTbc = new Map();
  const initialFtBalance = TBC20.parseTape(initialUserFT.parentTx.outputs[initialUserFT.outputIndex + 1].script).balance;
  assert(initialFtBalance > FIRST_FT);
  let funding = initialFunding, currentPool, userFT = { ...initialUserFT, ancestors: chain };
  ownedAssets.set(outpoint(userFT.parentTx, userFT.outputIndex), { ...userFT, family: 'tbc20', role: 'initial-ft', amountRaw: initialFtBalance });
  const feeScript = tbc.Script.buildPublicKeyHashOut(tbc.Address.fromString(PLANS[lpPlan][2]));
  const feeHash = tbc.crypto.Hash.sha256(feeScript.toBuffer());
  assert.equal(feeScript.toBuffer().length, 25);

  function asset(result, role, signer = signers.owner) {
    const output = result.layout.assetOutputs.find(item => item.role === role);
    assert(output, `missing ${role} output`);
    return { parentTx: result.transaction, outputIndex: output.codeVout, signer, ancestors: chain,
      amountRaw: output.amountRaw, family: output.family, role };
  }
  function common() {
    const ancestorTx = chain.get(currentPool.transaction.inputs[0].prevTxId.toString('hex'));
    assert(ancestorTx, 'Pool ancestry missing locally');
    return { pool: { parentTx: currentPool.transaction, ancestorTx },
      poolFT: asset(currentPool, 'pool-ft', signers.poolFt), funding, feePolicy };
  }
  function validateResult(result, label) {
    const tx = result.transaction;
    assert.equal(result.validation.success, true, label);
    assert.equal(result.validation.nodeAcceptanceChecked, false, 'local SDK cannot assert node acceptance');
    assert(result.validation.inputs.every(input => input.success && input.stackDepth === 1));
    assert.equal(result.txraw, tx.uncheckedSerialize()); assert.equal(result.txid, tx.id);
    const inputValue = sum(tx.inputs.map(input => {
      const parent = chain.get(input.prevTxId.toString('hex'));
      assert(parent, `${label}: missing accepted input parent`);
      const old = parent.outputs[input.outputIndex];
      assert.equal(input.output.satoshis, old.satoshis);
      assert.equal(input.output.script.toHex(), old.script.toHex());
      assert(!consumed.has(outpoint(parent, input.outputIndex)), 'double spend within fee lane');
      return BigInt(old.satoshis);
    }));
    assert.equal(inputValue - sum(tx.outputs.map(output => BigInt(output.satoshis))), result.feeSat);
    assert(result.feeSat > 0n);
    for (const output of result.layout?.assetOutputs ?? []) {
      const tape = tx.outputs[output.tapeVout];
      assert.equal(tx.outputs[output.codeVout].satoshis, 500); assert.equal(tape.satoshis, 0);
      assert.equal(tape.script.toBuffer().length, tapeSize);
      const parsed = output.family === 'tbc20' ? TBC20.parseTape(tape.script)
        : FTLPTBC20.parseTape(tape.script, { timelocked: false, tapeSize });
      assert.equal(parsed.balance, output.amountRaw);
      assert.deepEqual(parsed.amounts, output.amountsByInput);
      if (output.role === 'pool-ft') {
        assert(getTBC20Controller(tx.outputs[output.codeVout].script).equals(Buffer.concat([
          tbc.crypto.Hash.sha256ripemd160(result.nextState.poolCodeHash), Buffer.from([1]),
        ])));
      } else if (output.role !== 'lp-burn') {
        const controller = output.family === 'tbc20' ? getTBC20Controller(tx.outputs[output.codeVout].script)
          : FTLPTBC20.parseCode(tx.outputs[output.codeVout].script).controller;
        assert(controller.equals(Buffer.concat([tbc.crypto.Hash.sha256ripemd160(
          keyBytes(output.family === 'tbc20' ? signers.owner : lpSigner)), Buffer.from([0])])),
        'recoverable asset output must belong to its recorded signer');
      }
    }
    for (let vin = 0; vin < tx.inputs.length; vin += 1) {
      const role = result.layout?.inputRoles[vin];
      if (!['pool-ft', 'user-ft', 'lp-owner'].includes(role)) continue;
      const parent = chain.get(tx.inputs[vin].prevTxId.toString('hex'));
      const tape = parent.outputs[tx.inputs[vin].outputIndex + 1].script;
      const family = role === 'lp-owner' ? 'ftlp' : 'tbc20';
      const previous = family === 'tbc20' ? TBC20.parseTape(tape)
        : FTLPTBC20.parseTape(tape, { timelocked: false, tapeSize });
      assert.equal(sum(result.layout.assetOutputs.filter(output => output.family === family)
        .map(output => output.amountsByInput[vin])), previous.balance,
      `vin ${vin}: exact amount-source conservation, including burned LP`);
    }
    if (result.nextState) {
      assert.deepEqual(parsePoolCode(tx.outputs[0].script).tbcFeeScriptHash, feeHash,
        'constructor must bind SHA256 of full P2PKH script, not its 20-byte address hash');
      assert.equal(result.nextState.tape.lpPlan, lpPlan);
      assert.equal(result.nextState.tape.serviceFeeRate, Number(PLANS[lpPlan][0]));
    }
  }
  async function accept(result, shortLabel) {
    const label = `${mode}/${shortLabel}`;
    validateResult(result, label);
    // Caller is responsible for ACK/lookup and journal persistence. No local
    // state changes occur on rejected, missing-input, or uncertain broadcasts.
    const accepted = await commit(result, label);
    assert.notEqual(accepted, false, `${label}: commit explicitly rejected the transaction`);
    for (const input of result.transaction.inputs) {
      const id = `${input.prevTxId.toString('hex')}:${input.outputIndex}`;
      consumed.add(id); ownedAssets.delete(id); ownedTbc.delete(id);
    }
    chain.set(result.txid, result.transaction); history.push({ label, result });
    return result;
  }
  function update(result) {
    assert.notEqual(result.changeVout, undefined, 'lane must preserve a funding change output');
    funding = { parentTx: result.transaction, outputIndex: result.changeVout, signer: initialFunding.signer };
    if (result.nextState) currentPool = result;
    for (const output of result.layout?.assetOutputs ?? []) {
      if (output.role === 'pool-ft' || output.role === 'lp-burn') continue;
      const signer = output.family === 'ftlp' ? lpSigner : signers.owner;
      ownedAssets.set(outpoint(result.transaction, output.codeVout), asset(result, output.role, signer));
    }
    if (result.layout?.userTbcVout !== undefined) {
      const outputIndex = result.layout.userTbcVout;
      ownedTbc.set(outpoint(result.transaction, outputIndex), { parentTx: result.transaction, outputIndex,
        signer: signers.owner, amountSat: BigInt(result.transaction.outputs[outputIndex].satoshis), role: 'user-tbc' });
    }
    if (result.layout?.assetOutputs.some(output => output.role === 'ft-change') &&
        result.transaction.inputs.some(input => input.prevTxId.toString('hex') === userFT.parentTx.id && input.outputIndex === userFT.outputIndex)) {
      userFT = asset(result, 'ft-change');
    }
  }
  async function swap(operation, input, inputAsset, shouldPay, label) {
    const previous = currentPool.nextState;
    const expected = swapOracle(previous, operation, input, lpPlan);
    assert.equal(expected.fees.serviceFeePaidSat >= 10n, shouldPay, `${label}: expected fee regime`);
    assert(expected.fees.poolFeeRetainedSat > 0n, `${label}: strictly positive retained Pool fee`);
    const options = { ...common(), receiverAddress: ownerAddress,
      ...(operation === 'swapFT' ? { inputTbcSat: input, minFtOutRaw: 1n }
        : { inputFtRaw: input, userFT: inputAsset, minTbcOutSat: 80n }) };
    const result = await pool[operation](options);
    assert.deepEqual(stateOf(result.nextState), expected.nextState, `${label}: independent state oracle`);
    assert.deepEqual(result.quote.fees, expected.fees, `${label}: independent fee oracle`);
    assert.equal(result.nextState.ftLpAmount, FIRST_TBC, 'swaps cannot modify LP supply');
    const output = result.transaction.outputs[result.layout.serviceFeeVout];
    assert.equal(BigInt(output.satoshis), expected.fees.serviceFeePaidSat);
    if (shouldPay) {
      assert.equal(output.script.toHex(), feeScript.toHex(), 'exact plan fee address');
      assert(tbc.crypto.Hash.sha256(output.script.toBuffer()).equals(feeHash), 'fee script SHA256 must match constructor');
    } else assert.equal(output.script.toHex(), '006a', 'zero service fee keeps fixed empty OP_RETURN output');
    if (operation === 'swapFT') assert.equal(asset(result, 'user-ft').amountRaw, expected.ftOutRaw);
    else assert.equal(BigInt(result.transaction.outputs[result.layout.userTbcVout].satoshis), expected.tbcOutSat);
    await accept(result, label); update(result); return result;
  }

  const minted = await pool.mintPoolNFT({ funding, feePolicy });
  await accept(minted.source, 'mint-source'); await accept(minted, 'mint-pool'); update(minted);
  assert.deepEqual(stateOf(minted.nextState), { ftLpAmount: 0n, ftAAmount: 0n, tbcAmount: 0n, poolValue: DUST });
  const added = await pool.addLP({ ...common(), userFT, incrementSat: FIRST_TBC,
    firstFtAmountRaw: FIRST_FT, lpReceiverAddress: lpAddress, minLpOutRaw: FIRST_TBC });
  assert.deepEqual(stateOf(added.nextState), { ftLpAmount: FIRST_TBC, ftAAmount: FIRST_FT,
    tbcAmount: FIRST_TBC, poolValue: FIRST_TBC + DUST });
  await accept(added, 'first-add'); update(added);
  const heldLP = asset(added, 'new-lp', lpSigner);
  const paidFT = await swap('swapFT', 100_000n, undefined, true, 'swap-ft-paid');
  const paidAsset = asset(paidFT, 'user-ft');
  await swap('swapTBC', paidAsset.amountRaw, paidAsset, true, 'swap-tbc-paid');
  const smallInput = zeroServiceRoundTrip(currentPool.nextState, lpPlan);
  const smallFT = await swap('swapFT', smallInput, undefined, false, 'swap-ft-zero-service');
  const smallAsset = asset(smallFT, 'user-ft');
  await swap('swapTBC', smallAsset.amountRaw, smallAsset, false, 'swap-tbc-zero-service');
  const beforeRemove = stateOf(currentPool.nextState);
  const removed = await pool.removeLP({ ...common(), userLP: heldLP, burnAmountRaw: FIRST_TBC,
    receiverAddress: ownerAddress, minFtOutRaw: 1n, minTbcOutSat: 80n });
  assert.equal(removed.quote.ftLpBurnRaw, beforeRemove.ftLpAmount);
  assert.equal(asset(removed, 'user-ft').amountRaw, beforeRemove.ftAAmount);
  assert.equal(BigInt(removed.transaction.outputs[removed.layout.userTbcVout].satoshis), beforeRemove.poolValue - DUST);
  assert.deepEqual(stateOf(removed.nextState), { ftLpAmount: 0n, ftAAmount: 0n, tbcAmount: 0n, poolValue: DUST });
  await accept(removed, 'remove-all'); update(removed);
  const recoverableOutputs = {
    ft: [...ownedAssets.values()].filter(item => item.family === 'tbc20'),
    lp: [...ownedAssets.values()].filter(item => item.family === 'ftlp'),
    tbc: [...ownedTbc.values(), { ...funding,
      amountSat: BigInt(funding.parentTx.outputs[funding.outputIndex].satoshis), role: 'funding-change' }],
  };
  assert.equal(sum(recoverableOutputs.ft.map(item => item.amountRaw)), initialFtBalance, 'all FT fully reconciles after clearing Pool');
  assert.equal(recoverableOutputs.lp.length, 0, 'all LP burned by full removal');
  assert.equal(history.length, 8);
  return { mode, lane, lpPlan, tapeSize, pool, history, currentPool, funding, userFT,
    recoverableOutputs, localTransactions: chain, smallInputTbcSat: smallInput,
    totals: { transactionCount: history.length, minerFeesSat: sum(history.map(item => item.result.feeSat)),
      serviceFeesSat: sum(history.map(item => item.result.quote?.fees?.serviceFeePaidSat ?? 0n)),
      initialFTBalance: initialFtBalance, recoveredFTBalance: sum(recoverableOutputs.ft.map(item => item.amountRaw)),
      poolCodeLockedSat: currentPool.nextState.poolValue } };
}

module.exports = { runFeePlan };
