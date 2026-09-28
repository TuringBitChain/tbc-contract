import { assertPoolAmount } from './tape';
import { calculateSwapFees, TBC_AMM_MIN_TBC_OUTPUT_SAT } from './fees';
import type { PoolTapeAmounts } from './tape';
import type { SwapFeeBreakdown, SwapFeePolicy } from './fees';
import type { TBCAMMAddLPAmount } from './types';

export const TBC_AMM_CODE_DUST = 1_500n;
export interface PoolMathState extends PoolTapeAmounts {
  readonly poolValue: bigint;
}
export interface AddLPQuote {
  readonly nextState: PoolMathState;
  readonly isFirstAddLP: boolean;
  /** Actual contribution to the Pool Code, not the caller's maximum budget. */
  readonly tbcIncrementSat: bigint;
  /** Pricing-reserve increment; retained TBC earnings are not added to this reserve. */
  readonly tbcReserveIncrementSat: bigint;
  readonly ftAIncrementRaw: bigint;
  readonly ftLpIncrementRaw: bigint;
}
export interface RemoveLPQuote {
  readonly nextState: PoolMathState;
  readonly ftLpBurnRaw: bigint;
  readonly ftADecrementRaw: bigint;
  readonly tbcDecrementSat: bigint;
  readonly poolValueDecrementSat: bigint;
}
export interface SwapFTQuote {
  readonly nextState: PoolMathState;
  readonly inputTbcSat: bigint;
  readonly effectiveTbcIncrementSat: bigint;
  readonly poolValueIncrementSat: bigint;
  readonly ftOutRaw: bigint;
  readonly fees: SwapFeeBreakdown;
}
export interface SwapTBCQuote {
  readonly nextState: PoolMathState;
  readonly inputFtRaw: bigint;
  readonly grossTbcOutSat: bigint;
  readonly tbcOutSat: bigint;
  readonly poolValueDecrementSat: bigint;
  readonly fees: SwapFeeBreakdown;
}

export function assertPoolMathState(state: PoolMathState): void {
  if (!state || typeof state !== 'object') throw new Error('TBC AMM: Pool math state is required');
  for (const key of ['ftLpAmount', 'ftAAmount', 'tbcAmount', 'poolValue'] as const)
    assertPoolAmount(state[key], key);
  if (state.poolValue < TBC_AMM_CODE_DUST)
    throw new Error(`TBC AMM: Pool Code value is below the ${TBC_AMM_CODE_DUST} sat retained amount`);
}
function positive(value: bigint, label: string): void {
  assertPoolAmount(value, label);
  if (value === 0n) throw new Error(`TBC AMM: ${label} must be positive`);
}
function active(state: PoolMathState): void {
  assertPoolMathState(state);
  positive(state.ftLpAmount, 'LP supply');
  positive(state.ftAAmount, 'FT reserve');
  positive(state.tbcAmount, 'TBC reserve');
}
function checkedState(state: PoolMathState, requireActive: boolean): PoolMathState {
  if (requireActive) active(state);
  else assertPoolMathState(state);
  return Object.freeze(state);
}

/** Round positive proportional contributions up without an intermediate fixed-point ratio. */
function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

/** Quote the maximum whole LP amount supported by one asset budget. */
export function quoteAddLP(
  state: PoolMathState,
  amount: bigint | TBCAMMAddLPAmount,
  firstFtAmountRaw?: bigint
): AddLPQuote {
  assertPoolMathState(state);
  if (typeof amount !== 'bigint' && firstFtAmountRaw !== undefined)
    throw new Error('TBC AMM: specify firstFtAmountRaw inside the AddLP amount object');
  const input = typeof amount === 'bigint' ? { incrementSat: amount, firstFtAmountRaw } : amount;
  if (!input || typeof input !== 'object')
    throw new Error('TBC AMM: AddLP requires a TBC or FT budget');
  const useTbc = input.incrementSat !== undefined;
  if (useTbc === (input.incrementFtRaw !== undefined))
    throw new Error('TBC AMM: specify exactly one of incrementSat or incrementFtRaw');
  if (!useTbc && input.firstFtAmountRaw !== undefined)
    throw new Error('TBC AMM: firstFtAmountRaw requires a TBC budget');
  const budget = useTbc ? input.incrementSat! : input.incrementFtRaw!;
  positive(budget, useTbc ? 'TBC increment' : 'FT increment');
  const isFirstAddLP = state.ftLpAmount === 0n && state.ftAAmount === 0n && state.tbcAmount === 0n;
  let tbcIncrementSat: bigint;
  let tbcReserveIncrementSat: bigint;
  let ftLpIncrementRaw: bigint;
  let ftAIncrementRaw: bigint;
  if (isFirstAddLP) {
    if (state.poolValue !== TBC_AMM_CODE_DUST)
      throw new Error('TBC AMM: first AddLP requires exactly 1500 sat in the old Pool Code');
    if (!useTbc)
      throw new Error('TBC AMM: first AddLP requires a TBC budget and explicit initial FT amount');
    if (input.firstFtAmountRaw === undefined)
      throw new Error('TBC AMM: first AddLP requires explicit initial FT amount');
    positive(input.firstFtAmountRaw, 'initial FT amount');
    tbcIncrementSat = budget;
    tbcReserveIncrementSat = budget;
    ftLpIncrementRaw = budget;
    ftAIncrementRaw = input.firstFtAmountRaw;
  } else {
    if (input.firstFtAmountRaw !== undefined)
      throw new Error('TBC AMM: firstFtAmountRaw is only accepted for a fully empty pool');
    active(state);
    const redeemableTbc = state.poolValue - TBC_AMM_CODE_DUST;
    if (redeemableTbc < state.tbcAmount)
      throw new Error('TBC AMM: actual TBC reserve is below the pricing reserve');
    ftLpIncrementRaw = (budget * state.ftLpAmount) / (useTbc ? redeemableTbc : state.ftAAmount);
    positive(ftLpIncrementRaw, 'LP increment');
    tbcIncrementSat = ceilDiv(redeemableTbc * ftLpIncrementRaw, state.ftLpAmount);
    ftAIncrementRaw = ceilDiv(state.ftAAmount * ftLpIncrementRaw, state.ftLpAmount);
    tbcReserveIncrementSat = ceilDiv(state.tbcAmount * ftLpIncrementRaw, state.ftLpAmount);
  }
  positive(ftLpIncrementRaw, 'LP increment');
  positive(ftAIncrementRaw, 'FT increment');
  const nextState = checkedState(
    {
      poolValue: state.poolValue + tbcIncrementSat,
      tbcAmount: state.tbcAmount + tbcReserveIncrementSat,
      ftAAmount: state.ftAAmount + ftAIncrementRaw,
      ftLpAmount: state.ftLpAmount + ftLpIncrementRaw,
    },
    true
  );
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
export function quoteRemoveLP(state: PoolMathState, burnRaw: bigint): RemoveLPQuote {
  assertPoolMathState(state);
  positive(burnRaw, 'LP burn amount');
  if (burnRaw > state.ftLpAmount) throw new Error('TBC AMM: LP burn amount exceeds Pool LP supply');
  const ftADecrementRaw = (state.ftAAmount * burnRaw) / state.ftLpAmount;
  const tbcDecrementSat = (state.tbcAmount * burnRaw) / state.ftLpAmount;
  const poolValueDecrementSat = ((state.poolValue - TBC_AMM_CODE_DUST) * burnRaw) / state.ftLpAmount;
  if (poolValueDecrementSat < TBC_AMM_MIN_TBC_OUTPUT_SAT)
    throw new Error('TBC AMM: RemoveLP TBC payout must be at least 10 sat');
  const nextState = checkedState(
    {
      poolValue: state.poolValue - poolValueDecrementSat,
      ftLpAmount: state.ftLpAmount - burnRaw,
      ftAAmount: state.ftAAmount - ftADecrementRaw,
      tbcAmount: state.tbcAmount - tbcDecrementSat,
    },
    false
  );
  return Object.freeze({
    nextState,
    ftLpBurnRaw: burnRaw,
    ftADecrementRaw,
    tbcDecrementSat,
    poolValueDecrementSat,
  });
}

/** TBC -> FT. Round the FT output down before subtracting it from the old reserve. */
export function quoteSwapFT(
  state: PoolMathState,
  inputTbcSat: bigint,
  feePolicy: SwapFeePolicy,
  minFtOutRaw: bigint = 0n
): SwapFTQuote {
  active(state);
  positive(inputTbcSat, 'Swap TBC input');
  assertPoolAmount(minFtOutRaw, 'minimum FT output');
  const fees = calculateSwapFees(inputTbcSat, feePolicy);
  const effectiveTbcIncrementSat = fees.netAmountSat;
  const poolValueIncrementSat = inputTbcSat - fees.serviceFeePaidSat;
  if (effectiveTbcIncrementSat <= 0n || effectiveTbcIncrementSat >= state.tbcAmount)
    throw new Error(
      'TBC AMM: effective Swap TBC increment must be positive and strictly below the old TBC reserve'
    );
  if (poolValueIncrementSat <= effectiveTbcIncrementSat)
    throw new Error('TBC AMM: Swap requires a strictly positive retained pool fee');
  const tbcAmount = state.tbcAmount + effectiveTbcIncrementSat;
  const ftOutRaw = (state.ftAAmount * effectiveTbcIncrementSat) / tbcAmount;
  positive(ftOutRaw, 'Swap FT output');
  const ftAAmount = state.ftAAmount - ftOutRaw;
  if (ftOutRaw < minFtOutRaw) throw new Error('TBC AMM: FT output is below minFtOutRaw');
  const nextState = checkedState(
    {
      poolValue: state.poolValue + poolValueIncrementSat,
      tbcAmount,
      ftAAmount,
      ftLpAmount: state.ftLpAmount,
    },
    true
  );
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
export function quoteSwapTBC(
  state: PoolMathState,
  inputFtRaw: bigint,
  feePolicy: SwapFeePolicy,
  minTbcOutSat: bigint = 0n
): SwapTBCQuote {
  active(state);
  positive(inputFtRaw, 'Swap FT input');
  assertPoolAmount(minTbcOutSat, 'minimum TBC output');
  if (inputFtRaw >= state.ftAAmount)
    throw new Error('TBC AMM: Swap FT increment must be strictly below the old FT reserve');
  const ftAAmount = state.ftAAmount + inputFtRaw;
  const grossTbcOutSat = (state.tbcAmount * inputFtRaw) / ftAAmount;
  positive(grossTbcOutSat, 'Swap gross TBC output');
  const tbcAmount = state.tbcAmount - grossTbcOutSat;
  const fees = calculateSwapFees(grossTbcOutSat, feePolicy);
  const tbcOutSat = fees.netAmountSat;
  if (tbcOutSat < TBC_AMM_MIN_TBC_OUTPUT_SAT)
    throw new Error('TBC AMM: Swap TBC payout must be at least 10 sat');
  const poolValueDecrementSat = tbcOutSat + fees.serviceFeePaidSat;
  if (poolValueDecrementSat <= 0n || poolValueDecrementSat >= grossTbcOutSat)
    throw new Error(
      'TBC AMM: Swap requires a positive payout and strictly positive retained pool fee'
    );
  positive(tbcOutSat, 'Swap TBC output');
  if (tbcOutSat < minTbcOutSat) throw new Error('TBC AMM: TBC output is below minTbcOutSat');
  const nextState = checkedState(
    {
      poolValue: state.poolValue - poolValueDecrementSat,
      tbcAmount,
      ftAAmount,
      ftLpAmount: state.ftLpAmount,
    },
    true
  );
  return Object.freeze({
    nextState,
    inputFtRaw,
    grossTbcOutSat,
    tbcOutSat,
    poolValueDecrementSat,
    fees,
  });
}
