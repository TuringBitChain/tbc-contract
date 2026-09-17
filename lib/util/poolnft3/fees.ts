import * as tbc from 'tbc-lib-js';
import { assertPoolAmount } from './tape';

/** Pool3 P2PKH outputs, including positive service fees, use the 10-sat floor. */
export const POOL3_MIN_TBC_OUTPUT_SAT = 10n;

export type Pool3FeePlan = 1 | 2 | 3 | 4 | 5 | 6;
export interface SwapFeePolicy {
  readonly lpPlan: Pool3FeePlan;
  readonly totalFeeBps: number;
  readonly lpFeeBps: number;
  readonly serviceFeeAddress: string;
  readonly servicePayoutThresholdSat: 10n;
}
export interface SwapFeeBreakdown {
  readonly baseTbcSat: bigint;
  readonly totalFeeSat: bigint;
  readonly lpFeeSat: bigint;
  readonly serviceFeeAccruedSat: bigint;
  readonly serviceFeePaidSat: bigint;
  readonly serviceFeeRetainedSat: bigint;
  readonly poolFeeRetainedSat: bigint;
  readonly netAmountSat: bigint;
}
const policy = (
  lpPlan: Pool3FeePlan,
  totalFeeBps: number,
  lpFeeBps: number,
  serviceFeeAddress: string
): SwapFeePolicy =>
  Object.freeze({
    lpPlan,
    totalFeeBps,
    lpFeeBps,
    serviceFeeAddress,
    servicePayoutThresholdSat: POOL3_MIN_TBC_OUTPUT_SAT,
  });

export const POOL3_SWAP_FEE_POLICIES: Readonly<Record<Pool3FeePlan, SwapFeePolicy>> = Object.freeze(
  {
    1: policy(1, 35, 25, '13oCEJaqyyiC8iRrfup6PDL2GKZ3xQrsZL'),
    2: policy(2, 35, 5, '1Fa6Uy64Ub4qNdB896zX2pNMx4a8zMhtCy'),
    3: policy(3, 135, 5, '125fTLNsraQxTYqT4EeQNF2ggzcqicveKL'),
    4: policy(4, 335, 5, '19DetoaaohQkjFVJ6oGXd83xhZYQSbpE1g'),
    5: policy(5, 535, 5, '15EKrhuD8Yf3SfhjAgbizYqfnBbKh9ZMZ7'),
    6: policy(6, 130, 80, '1N7rf2AuAHB2aCrVgnbQhSWhaUVk3rGhjm'),
  }
);

export function resolveSwapFeePolicy(lpPlan: number = 1, serviceFeeRate?: number): SwapFeePolicy {
  if (!Number.isSafeInteger(lpPlan) || lpPlan < 1 || lpPlan > 6)
    throw new Error('Pool3: lpPlan must be 1-6');
  const selected = POOL3_SWAP_FEE_POLICIES[lpPlan as Pool3FeePlan];
  if (serviceFeeRate !== undefined && serviceFeeRate !== selected.totalFeeBps)
    throw new Error('Pool3: serviceFeeRate does not match lpPlan');
  return selected;
}
function validatePolicy(supplied: SwapFeePolicy): SwapFeePolicy {
  if (!supplied || typeof supplied !== 'object')
    throw new Error('Pool3: Swap fee policy is required');
  const canonical = resolveSwapFeePolicy(supplied.lpPlan, supplied.totalFeeBps);
  if (
    supplied.lpFeeBps !== canonical.lpFeeBps ||
    supplied.serviceFeeAddress !== canonical.serviceFeeAddress ||
    supplied.servicePayoutThresholdSat !== POOL3_MIN_TBC_OUTPUT_SAT
  ) {
    throw new Error('Pool3: unsupported or modified Swap fee policy');
  }
  return canonical;
}

/** Pool2 semantics: floor(total) - floor(LP), not floor(the difference rate). */
export function calculateSwapFees(baseTbcSat: bigint, supplied: SwapFeePolicy): SwapFeeBreakdown {
  assertPoolAmount(baseTbcSat, 'Swap fee baseTbcSat');
  const selected = validatePolicy(supplied);
  const totalFeeSat = (baseTbcSat * BigInt(selected.totalFeeBps)) / 10_000n;
  const lpFeeSat = (baseTbcSat * BigInt(selected.lpFeeBps)) / 10_000n;
  const serviceFeeAccruedSat = totalFeeSat - lpFeeSat;
  const serviceFeePaidSat =
    serviceFeeAccruedSat >= selected.servicePayoutThresholdSat ? serviceFeeAccruedSat : 0n;
  const serviceFeeRetainedSat = serviceFeeAccruedSat - serviceFeePaidSat;
  return Object.freeze({
    baseTbcSat,
    totalFeeSat,
    lpFeeSat,
    serviceFeeAccruedSat,
    serviceFeePaidSat,
    serviceFeeRetainedSat,
    poolFeeRetainedSat: totalFeeSat - serviceFeePaidSat,
    netAmountSat: baseTbcSat - totalFeeSat,
  });
}

export interface FeeRecipient {
  readonly address: string;
  readonly feePubKeyHash20: Buffer;
  readonly feeP2pkhScript25: tbc.Script;
  readonly feeScriptHash32: Buffer;
}

export function deriveFeeRecipient(address: string): FeeRecipient {
  if (typeof address !== 'string') throw new Error('Pool3: fee recipient must be a P2PKH address');
  const parsed = tbc.Address.fromString(address);
  if (!(parsed as tbc.Address & { isPayToPublicKeyHash(): boolean }).isPayToPublicKeyHash())
    throw new Error('Pool3: fee recipient must be P2PKH, not P2SH');
  const feePubKeyHash20 = Buffer.from(parsed.hashBuffer);
  if (feePubKeyHash20.length !== 20)
    throw new Error('Pool3: fee recipient public-key hash must be 20 bytes');
  const feeP2pkhScript25 = tbc.Script.fromBuffer(
    Buffer.concat([Buffer.from('76a914', 'hex'), feePubKeyHash20, Buffer.from('88ac', 'hex')])
  );
  return {
    address: parsed.toString(),
    feePubKeyHash20,
    feeP2pkhScript25,
    feeScriptHash32: tbc.crypto.Hash.sha256(feeP2pkhScript25.toBuffer()),
  };
}

export function assertPoolFeeRecipient(scriptHash: Buffer, supplied: SwapFeePolicy): FeeRecipient {
  const recipient = deriveFeeRecipient(validatePolicy(supplied).serviceFeeAddress);
  if (
    !Buffer.isBuffer(scriptHash) ||
    scriptHash.length !== 32 ||
    !scriptHash.equals(recipient.feeScriptHash32)
  ) {
    throw new Error(
      "Pool3: TbcFeeScriptHash must equal SHA256 of this fee plan's full P2PKH script"
    );
  }
  return recipient;
}

/** Zero-fee outputs remain present at the operation's fixed vout. */
export function buildPoolServiceFeeOutput(
  fees: SwapFeeBreakdown,
  recipient: FeeRecipient
): tbc.Transaction.Output {
  assertPoolAmount(fees.serviceFeePaidSat, 'serviceFeePaidSat');
  if (fees.serviceFeePaidSat > 0n && fees.serviceFeePaidSat < POOL3_MIN_TBC_OUTPUT_SAT)
    throw new Error('Pool3: positive service fee output must be at least 10 sat');
  if (fees.serviceFeePaidSat > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('Pool3: service fee cannot be represented safely in Transaction.Output');
  const expected = deriveFeeRecipient(recipient.address);
  if (
    !expected.feeP2pkhScript25.toBuffer().equals(recipient.feeP2pkhScript25.toBuffer()) ||
    !expected.feeScriptHash32.equals(recipient.feeScriptHash32)
  )
    throw new Error('Pool3: inconsistent fee recipient');
  return new tbc.Transaction.Output({
    satoshis: Number(fees.serviceFeePaidSat),
    script: fees.serviceFeePaidSat === 0n ? tbc.Script.fromHex('006a') : expected.feeP2pkhScript25,
  });
}
