"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POOL3_CODE_DUST = void 0;
exports.assertPoolMathState = assertPoolMathState;
exports.quoteAddLP = quoteAddLP;
exports.quoteRemoveLP = quoteRemoveLP;
exports.quoteSwapFT = quoteSwapFT;
exports.quoteSwapTBC = quoteSwapTBC;
const tape_1 = require("./tape");
const fees_1 = require("./fees");
exports.POOL3_CODE_DUST = 1500n;
function assertPoolMathState(state) {
    if (!state || typeof state !== 'object')
        throw new Error('Pool3: Pool math state is required');
    for (const key of ['ftLpAmount', 'ftAAmount', 'tbcAmount', 'poolValue'])
        (0, tape_1.assertPoolAmount)(state[key], key);
    if (state.poolValue < exports.POOL3_CODE_DUST)
        throw new Error(`Pool3: Pool Code value is below the ${exports.POOL3_CODE_DUST} sat retained amount`);
}
function positive(value, label) {
    (0, tape_1.assertPoolAmount)(value, label);
    if (value === 0n)
        throw new Error(`Pool3: ${label} must be positive`);
}
function active(state) {
    assertPoolMathState(state);
    positive(state.ftLpAmount, 'LP supply');
    positive(state.ftAAmount, 'FT reserve');
    positive(state.tbcAmount, 'TBC reserve');
}
function checkedState(state, requireActive) {
    if (requireActive)
        active(state);
    else
        assertPoolMathState(state);
    return Object.freeze(state);
}
/** Round positive proportional contributions up without an intermediate fixed-point ratio. */
function ceilDiv(numerator, denominator) {
    return (numerator + denominator - 1n) / denominator;
}
/** Quote the maximum whole LP amount supported by one asset budget. */
function quoteAddLP(state, amount, firstFtAmountRaw) {
    assertPoolMathState(state);
    if (typeof amount !== 'bigint' && firstFtAmountRaw !== undefined)
        throw new Error('Pool3: specify firstFtAmountRaw inside the AddLP amount object');
    const input = typeof amount === 'bigint' ? { incrementSat: amount, firstFtAmountRaw } : amount;
    if (!input || typeof input !== 'object')
        throw new Error('Pool3: AddLP requires a TBC or FT budget');
    const useTbc = input.incrementSat !== undefined;
    if (useTbc === (input.incrementFtRaw !== undefined))
        throw new Error('Pool3: specify exactly one of incrementSat or incrementFtRaw');
    if (!useTbc && input.firstFtAmountRaw !== undefined)
        throw new Error('Pool3: firstFtAmountRaw requires a TBC budget');
    const budget = useTbc ? input.incrementSat : input.incrementFtRaw;
    positive(budget, useTbc ? 'TBC increment' : 'FT increment');
    const isFirstAddLP = state.ftLpAmount === 0n && state.ftAAmount === 0n && state.tbcAmount === 0n;
    let tbcIncrementSat;
    let tbcReserveIncrementSat;
    let ftLpIncrementRaw;
    let ftAIncrementRaw;
    if (isFirstAddLP) {
        if (state.poolValue !== exports.POOL3_CODE_DUST)
            throw new Error('Pool3: first AddLP requires exactly 1500 sat in the old Pool Code');
        if (!useTbc)
            throw new Error('Pool3: first AddLP requires a TBC budget and explicit initial FT amount');
        if (input.firstFtAmountRaw === undefined)
            throw new Error('Pool3: first AddLP requires explicit initial FT amount');
        positive(input.firstFtAmountRaw, 'initial FT amount');
        tbcIncrementSat = budget;
        tbcReserveIncrementSat = budget;
        ftLpIncrementRaw = budget;
        ftAIncrementRaw = input.firstFtAmountRaw;
    }
    else {
        if (input.firstFtAmountRaw !== undefined)
            throw new Error('Pool3: firstFtAmountRaw is only accepted for a fully empty pool');
        active(state);
        const redeemableTbc = state.poolValue - exports.POOL3_CODE_DUST;
        if (redeemableTbc < state.tbcAmount)
            throw new Error('Pool3: actual TBC reserve is below the pricing reserve');
        ftLpIncrementRaw = (budget * state.ftLpAmount) / (useTbc ? redeemableTbc : state.ftAAmount);
        positive(ftLpIncrementRaw, 'LP increment');
        tbcIncrementSat = ceilDiv(redeemableTbc * ftLpIncrementRaw, state.ftLpAmount);
        ftAIncrementRaw = ceilDiv(state.ftAAmount * ftLpIncrementRaw, state.ftLpAmount);
        tbcReserveIncrementSat = ceilDiv(state.tbcAmount * ftLpIncrementRaw, state.ftLpAmount);
    }
    positive(ftLpIncrementRaw, 'LP increment');
    positive(ftAIncrementRaw, 'FT increment');
    const nextState = checkedState({
        poolValue: state.poolValue + tbcIncrementSat,
        tbcAmount: state.tbcAmount + tbcReserveIncrementSat,
        ftAAmount: state.ftAAmount + ftAIncrementRaw,
        ftLpAmount: state.ftLpAmount + ftLpIncrementRaw,
    }, true);
    return Object.freeze({
        nextState,
        isFirstAddLP,
        tbcIncrementSat,
        tbcReserveIncrementSat,
        ftAIncrementRaw,
        ftLpIncrementRaw,
    });
}
/** Redeem each reserve directly against the burned LP share, rounding payouts down. */
function quoteRemoveLP(state, burnRaw) {
    assertPoolMathState(state);
    positive(burnRaw, 'LP burn amount');
    if (burnRaw > state.ftLpAmount)
        throw new Error('Pool3: LP burn amount exceeds Pool LP supply');
    const ftADecrementRaw = (state.ftAAmount * burnRaw) / state.ftLpAmount;
    const tbcDecrementSat = (state.tbcAmount * burnRaw) / state.ftLpAmount;
    const poolValueDecrementSat = ((state.poolValue - exports.POOL3_CODE_DUST) * burnRaw) / state.ftLpAmount;
    if (poolValueDecrementSat < fees_1.POOL3_MIN_TBC_OUTPUT_SAT)
        throw new Error('Pool3: RemoveLP TBC payout must be at least 10 sat');
    const nextState = checkedState({
        poolValue: state.poolValue - poolValueDecrementSat,
        ftLpAmount: state.ftLpAmount - burnRaw,
        ftAAmount: state.ftAAmount - ftADecrementRaw,
        tbcAmount: state.tbcAmount - tbcDecrementSat,
    }, false);
    return Object.freeze({
        nextState,
        ftLpBurnRaw: burnRaw,
        ftADecrementRaw,
        tbcDecrementSat,
        poolValueDecrementSat,
    });
}
/** TBC -> FT. Round the FT output down before subtracting it from the old reserve. */
function quoteSwapFT(state, inputTbcSat, feePolicy, minFtOutRaw = 0n) {
    active(state);
    positive(inputTbcSat, 'Swap TBC input');
    (0, tape_1.assertPoolAmount)(minFtOutRaw, 'minimum FT output');
    const fees = (0, fees_1.calculateSwapFees)(inputTbcSat, feePolicy);
    const effectiveTbcIncrementSat = fees.netAmountSat;
    const poolValueIncrementSat = inputTbcSat - fees.serviceFeePaidSat;
    if (effectiveTbcIncrementSat <= 0n || effectiveTbcIncrementSat >= state.tbcAmount)
        throw new Error('Pool3: effective Swap TBC increment must be positive and strictly below the old TBC reserve');
    if (poolValueIncrementSat <= effectiveTbcIncrementSat)
        throw new Error('Pool3: Swap requires a strictly positive retained pool fee');
    const tbcAmount = state.tbcAmount + effectiveTbcIncrementSat;
    const ftOutRaw = (state.ftAAmount * effectiveTbcIncrementSat) / tbcAmount;
    positive(ftOutRaw, 'Swap FT output');
    const ftAAmount = state.ftAAmount - ftOutRaw;
    if (ftOutRaw < minFtOutRaw)
        throw new Error('Pool3: FT output is below minFtOutRaw');
    const nextState = checkedState({
        poolValue: state.poolValue + poolValueIncrementSat,
        tbcAmount,
        ftAAmount,
        ftLpAmount: state.ftLpAmount,
    }, true);
    return Object.freeze({
        nextState,
        inputTbcSat,
        effectiveTbcIncrementSat,
        poolValueIncrementSat,
        ftOutRaw,
        fees,
    });
}
/** FT -> TBC. Round the theoretical TBC output down, then apply the unchanged fee policy. */
function quoteSwapTBC(state, inputFtRaw, feePolicy, minTbcOutSat = 0n) {
    active(state);
    positive(inputFtRaw, 'Swap FT input');
    (0, tape_1.assertPoolAmount)(minTbcOutSat, 'minimum TBC output');
    if (inputFtRaw >= state.ftAAmount)
        throw new Error('Pool3: Swap FT increment must be strictly below the old FT reserve');
    const ftAAmount = state.ftAAmount + inputFtRaw;
    const grossTbcOutSat = (state.tbcAmount * inputFtRaw) / ftAAmount;
    positive(grossTbcOutSat, 'Swap gross TBC output');
    const tbcAmount = state.tbcAmount - grossTbcOutSat;
    const fees = (0, fees_1.calculateSwapFees)(grossTbcOutSat, feePolicy);
    const tbcOutSat = fees.netAmountSat;
    if (tbcOutSat < fees_1.POOL3_MIN_TBC_OUTPUT_SAT)
        throw new Error('Pool3: Swap TBC payout must be at least 10 sat');
    const poolValueDecrementSat = tbcOutSat + fees.serviceFeePaidSat;
    if (poolValueDecrementSat <= 0n || poolValueDecrementSat >= grossTbcOutSat)
        throw new Error('Pool3: Swap requires a positive payout and strictly positive retained pool fee');
    positive(tbcOutSat, 'Swap TBC output');
    if (tbcOutSat < minTbcOutSat)
        throw new Error('Pool3: TBC output is below minTbcOutSat');
    const nextState = checkedState({
        poolValue: state.poolValue - poolValueDecrementSat,
        tbcAmount,
        ftAAmount,
        ftLpAmount: state.ftLpAmount,
    }, true);
    return Object.freeze({
        nextState,
        inputFtRaw,
        grossTbcOutSat,
        tbcOutSat,
        poolValueDecrementSat,
        fees,
    });
}
