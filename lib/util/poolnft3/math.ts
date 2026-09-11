import { assertPoolAmount } from './tape';
import { calculateSwapFees } from './fees';
import type { PoolTapeAmounts } from './tape';
import type { SwapFeeBreakdown, SwapFeePolicy } from './fees';

export const POOL3_PRECISION = 1_000_000n;
export const POOL3_CODE_DUST = 1_500n;
export interface PoolMathState extends PoolTapeAmounts {
  readonly poolValue: bigint;
}
export interface AddLPQuote {
  readonly nextState: PoolMathState;
  readonly isFirstAddLP: boolean;
  readonly ratio: bigint | undefined;
  readonly tbcIncrementSat: bigint;
  readonly ftAIncrementRaw: bigint;
  readonly ftLpIncrementRaw: bigint;
}
export interface RemoveLPQuote {
  readonly nextState: PoolMathState;
  readonly ratio: bigint;
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
  if (!state || typeof state !== 'object') throw new Error('Pool3: Pool math state is required');
  for (const key of ['ftLpAmount', 'ftAAmount', 'tbcAmount', 'poolValue'] as const)
    assertPoolAmount(state[key], key);
  if (state.poolValue < POOL3_CODE_DUST)
    throw new Error(`Pool3: Pool Code value is below the ${POOL3_CODE_DUST} sat retained amount`);
}
function positive(value: bigint, label: string): void {
  assertPoolAmount(value, label);
  if (value === 0n) throw new Error(`Pool3: ${label} must be positive`);
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

/** Mirrors current AddLP, intentionally using the NEW Code balance in ratio. */
export function quoteAddLP(
  state: PoolMathState,
  incrementSat: bigint,
  firstFtAmountRaw?: bigint
): AddLPQuote {
  assertPoolMathState(state);
  positive(incrementSat, 'TBC increment');
  const poolValue = state.poolValue + incrementSat;
  assertPoolAmount(poolValue, 'new Pool Code value');
  const isFirstAddLP = state.ftLpAmount === 0n && state.ftAAmount === 0n && state.tbcAmount === 0n;
  let ratio: bigint | undefined;
  let ftLpIncrementRaw: bigint;
  let ftAIncrementRaw: bigint;
  if (isFirstAddLP) {
    if (firstFtAmountRaw === undefined)
      throw new Error('Pool3: first AddLP requires explicit initial FT amount');
    positive(firstFtAmountRaw, 'initial FT amount');
    ftLpIncrementRaw = incrementSat;
    ftAIncrementRaw = firstFtAmountRaw;
  } else {
    if (firstFtAmountRaw !== undefined)
      throw new Error('Pool3: firstFtAmountRaw is only accepted for a fully empty pool');
    if (incrementSat <= state.tbcAmount) {
      ratio = ((poolValue - POOL3_CODE_DUST) * POOL3_PRECISION) / incrementSat;
      if (ratio <= 0n) throw new Error('Pool3: AddLP ratio denominator is zero');
      ftLpIncrementRaw = (state.ftLpAmount * POOL3_PRECISION) / ratio;
      ftAIncrementRaw = (state.ftAAmount * POOL3_PRECISION) / ratio;
    } else {
      ratio = (incrementSat * POOL3_PRECISION) / (poolValue - POOL3_CODE_DUST);
      if (ratio <= 0n) throw new Error('Pool3: AddLP ratio rounds to zero');
      ftLpIncrementRaw = (state.ftLpAmount * ratio) / POOL3_PRECISION;
      ftAIncrementRaw = (state.ftAAmount * ratio) / POOL3_PRECISION;
    }
  }
  positive(ftLpIncrementRaw, 'LP increment');
  positive(ftAIncrementRaw, 'FT increment');
  const nextState = checkedState(
    {
      poolValue,
      tbcAmount: state.tbcAmount + incrementSat,
      ftAAmount: state.ftAAmount + ftAIncrementRaw,
      ftLpAmount: state.ftLpAmount + ftLpIncrementRaw,
    },
    true
  );
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
export function quoteRemoveLP(state: PoolMathState, burnRaw: bigint): RemoveLPQuote {
  assertPoolMathState(state);
  positive(burnRaw, 'LP burn amount');
  if (burnRaw > state.ftLpAmount) throw new Error('Pool3: LP burn amount exceeds Pool LP supply');
  const ratio = (state.ftLpAmount * POOL3_PRECISION) / burnRaw;
  if (ratio <= 0n) throw new Error('Pool3: RemoveLP ratio is zero');
  const ftADecrementRaw = (state.ftAAmount * POOL3_PRECISION) / ratio;
  const tbcDecrementSat = (state.tbcAmount * POOL3_PRECISION) / ratio;
  const poolValueDecrementSat = ((state.poolValue - POOL3_CODE_DUST) * POOL3_PRECISION) / ratio;
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
    ratio,
    ftLpBurnRaw: burnRaw,
    ftADecrementRaw,
    tbcDecrementSat,
    poolValueDecrementSat,
  });
}

/** TBC -> FT. The contract floors the new FT reserve, then subtracts it. */
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
      'Pool3: effective Swap TBC increment must be positive and strictly below the old TBC reserve'
    );
  if (poolValueIncrementSat <= effectiveTbcIncrementSat)
    throw new Error('Pool3: Swap requires a strictly positive retained pool fee');
  const tbcAmount = state.tbcAmount + effectiveTbcIncrementSat;
  const ftAAmount = (state.tbcAmount * state.ftAAmount) / tbcAmount;
  const ftOutRaw = state.ftAAmount - ftAAmount;
  positive(ftOutRaw, 'Swap FT output');
  if (ftOutRaw < minFtOutRaw) throw new Error('Pool3: FT output is below minFtOutRaw');
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

/** FT -> TBC. Fees use the theoretical TBC output, not the input FT amount. */
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
    throw new Error('Pool3: Swap FT increment must be strictly below the old FT reserve');
  const ftAAmount = state.ftAAmount + inputFtRaw;
  const tbcAmount = (state.tbcAmount * state.ftAAmount) / ftAAmount;
  const grossTbcOutSat = state.tbcAmount - tbcAmount;
  const fees = calculateSwapFees(grossTbcOutSat, feePolicy);
  const tbcOutSat = fees.netAmountSat;
  const poolValueDecrementSat = tbcOutSat + fees.serviceFeePaidSat;
  if (poolValueDecrementSat <= 0n || poolValueDecrementSat >= grossTbcOutSat)
    throw new Error(
      'Pool3: Swap requires a positive payout and strictly positive retained pool fee'
    );
  positive(tbcOutSat, 'Swap TBC output');
  if (tbcOutSat < minTbcOutSat) throw new Error('Pool3: TBC output is below minTbcOutSat');
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
