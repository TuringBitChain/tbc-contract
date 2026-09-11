"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POOL3_CODE_DUST = exports.POOL3_PRECISION = void 0;
exports.assertPoolMathState = assertPoolMathState;
exports.quoteAddLP = quoteAddLP;
exports.quoteRemoveLP = quoteRemoveLP;
exports.quoteSwapFT = quoteSwapFT;
exports.quoteSwapTBC = quoteSwapTBC;
const tape_1 = require("./tape");
const fees_1 = require("./fees");
exports.POOL3_PRECISION = 1000000n;
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
/** Mirrors current AddLP, intentionally using the NEW Code balance in ratio. */
function quoteAddLP(state, incrementSat, firstFtAmountRaw) {
    assertPoolMathState(state);
    positive(incrementSat, 'TBC increment');
    const poolValue = state.poolValue + incrementSat;
    (0, tape_1.assertPoolAmount)(poolValue, 'new Pool Code value');
    const isFirstAddLP = state.ftLpAmount === 0n && state.ftAAmount === 0n && state.tbcAmount === 0n;
    let ratio;
    let ftLpIncrementRaw;
    let ftAIncrementRaw;
    if (isFirstAddLP) {
        if (firstFtAmountRaw === undefined)
            throw new Error('Pool3: first AddLP requires explicit initial FT amount');
        positive(firstFtAmountRaw, 'initial FT amount');
        ftLpIncrementRaw = incrementSat;
        ftAIncrementRaw = firstFtAmountRaw;
    }
    else {
        if (firstFtAmountRaw !== undefined)
            throw new Error('Pool3: firstFtAmountRaw is only accepted for a fully empty pool');
        if (incrementSat <= state.tbcAmount) {
            ratio = ((poolValue - exports.POOL3_CODE_DUST) * exports.POOL3_PRECISION) / incrementSat;
            if (ratio <= 0n)
                throw new Error('Pool3: AddLP ratio denominator is zero');
            ftLpIncrementRaw = (state.ftLpAmount * exports.POOL3_PRECISION) / ratio;
            ftAIncrementRaw = (state.ftAAmount * exports.POOL3_PRECISION) / ratio;
        }
        else {
            ratio = (incrementSat * exports.POOL3_PRECISION) / (poolValue - exports.POOL3_CODE_DUST);
            if (ratio <= 0n)
                throw new Error('Pool3: AddLP ratio rounds to zero');
            ftLpIncrementRaw = (state.ftLpAmount * ratio) / exports.POOL3_PRECISION;
            ftAIncrementRaw = (state.ftAAmount * ratio) / exports.POOL3_PRECISION;
        }
    }
    positive(ftLpIncrementRaw, 'LP increment');
    positive(ftAIncrementRaw, 'FT increment');
    const nextState = checkedState({
        poolValue,
        tbcAmount: state.tbcAmount + incrementSat,
        ftAAmount: state.ftAAmount + ftAIncrementRaw,
        ftLpAmount: state.ftLpAmount + ftLpIncrementRaw,
    }, true);
    return Object.freeze({
        nextState,
        isFirstAddLP,
        ratio,
        tbcIncrementSat: incrementSat,
        ftAIncrementRaw,
        ftLpIncrementRaw,
    });
}
/** Preserves both divisions from the current RemoveLP contract verbatim. */
function quoteRemoveLP(state, burnRaw) {
    assertPoolMathState(state);
    positive(burnRaw, 'LP burn amount');
    if (burnRaw > state.ftLpAmount)
        throw new Error('Pool3: LP burn amount exceeds Pool LP supply');
    const ratio = (state.ftLpAmount * exports.POOL3_PRECISION) / burnRaw;
    if (ratio <= 0n)
        throw new Error('Pool3: RemoveLP ratio is zero');
    const ftADecrementRaw = (state.ftAAmount * exports.POOL3_PRECISION) / ratio;
    const tbcDecrementSat = (state.tbcAmount * exports.POOL3_PRECISION) / ratio;
    const poolValueDecrementSat = ((state.poolValue - exports.POOL3_CODE_DUST) * exports.POOL3_PRECISION) / ratio;
    const nextState = checkedState({
        poolValue: state.poolValue - poolValueDecrementSat,
        ftLpAmount: state.ftLpAmount - burnRaw,
        ftAAmount: state.ftAAmount - ftADecrementRaw,
        tbcAmount: state.tbcAmount - tbcDecrementSat,
    }, false);
    return Object.freeze({
        nextState,
        ratio,
        ftLpBurnRaw: burnRaw,
        ftADecrementRaw,
        tbcDecrementSat,
        poolValueDecrementSat,
    });
}
/** TBC -> FT. The contract floors the new FT reserve, then subtracts it. */
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
    const ftAAmount = (state.tbcAmount * state.ftAAmount) / tbcAmount;
    const ftOutRaw = state.ftAAmount - ftAAmount;
    positive(ftOutRaw, 'Swap FT output');
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
/** FT -> TBC. Fees use the theoretical TBC output, not the input FT amount. */
function quoteSwapTBC(state, inputFtRaw, feePolicy, minTbcOutSat = 0n) {
    active(state);
    positive(inputFtRaw, 'Swap FT input');
    (0, tape_1.assertPoolAmount)(minTbcOutSat, 'minimum TBC output');
    if (inputFtRaw >= state.ftAAmount)
        throw new Error('Pool3: Swap FT increment must be strictly below the old FT reserve');
    const ftAAmount = state.ftAAmount + inputFtRaw;
    const tbcAmount = (state.tbcAmount * state.ftAAmount) / ftAAmount;
    const grossTbcOutSat = state.tbcAmount - tbcAmount;
    const fees = (0, fees_1.calculateSwapFees)(grossTbcOutSat, feePolicy);
    const tbcOutSat = fees.netAmountSat;
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
