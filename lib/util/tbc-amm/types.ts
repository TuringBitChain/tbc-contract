import type * as tbc from 'tbc-lib-js';
import type { TBC20StandardTransactionResolver } from '../tbc20-standard/tbc20-standard-unlock';
import type { PoolAuthorization } from './authorization';
import type { PoolMathState } from './math';
import type { TBCAMMQuote } from '../../contract/tbc-amm';
import type { DecodedPoolTape } from './tape';
import type {
  TBCAMMFeePolicy,
  TBCAMMSignedInput,
  TBCAMMSigningIdentity,
  TBCAMMTransactionResult,
} from './transaction';

export interface TBCAMMConfig {
  /** Canonical TBC20Standard genesis transaction; its Code/Tape pair must be vout 0/1. */
  ftGenesisTx: tbc.Transaction;
  authorization?: PoolAuthorization;
  lp?: { kind: 'plain' | 'timelocked' };
  lpPlan?: number;
  serviceFeeRate?: number;
}
export interface TBCAMMAssetInput extends TBCAMMSignedInput {
  ancestors: TBC20StandardTransactionResolver;
}
export interface TBCAMMPoolInput {
  parentTx: tbc.Transaction;
  /** Transaction spent by parentTx.vin0, including mint Source for the first operation. */
  ancestorTx: tbc.Transaction;
}
export interface TBCAMMState extends PoolMathState {
  tape: DecodedPoolTape;
  poolCodeHash: Buffer;
  codeScript: tbc.Script;
  outpoint: { txId: string; outputIndex: 0 };
  snapshotHash: string;
  controllerPubKeyHashes: readonly string[];
}
export interface TBCAMMOperationOptions {
  pool: TBCAMMPoolInput;
  poolFT: TBCAMMAssetInput;
  funding: TBCAMMSignedInput;
  controllerSigner?: TBCAMMSigningIdentity;
  /** P2PKH address for residual miner-funding change; defaults to funding signer. */
  changeAddress?: string;
  feePolicy?: TBCAMMFeePolicy;
  /** Optional optimistic-concurrency guard from an earlier quote. */
  expectedSnapshotHash?: string;
}
/** Select exactly one asset budget; the other asset is quoted automatically. */
export type TBCAMMAddLPAmount =
  | {
      /** Maximum TBC contribution, excluding fees and output funding. First AddLP uses it in full. */
      incrementSat: bigint;
      incrementFtRaw?: never;
      /** Required only for the first AddLP, whose initial price is user-defined. */
      firstFtAmountRaw?: bigint;
    }
  | {
      incrementSat?: never;
      /** Maximum FT contribution in raw units; only available for an active pool. */
      incrementFtRaw: bigint;
      firstFtAmountRaw?: never;
    };
export type TBCAMMAddLPOptions = TBCAMMOperationOptions & TBCAMMAddLPAmount & {
  userFT: TBCAMMAssetInput;
  lpReceiverAddress: string;
  /** Required for timelocked pools, including explicit zero. */
  lpLockTime?: number;
  minLpOutRaw?: bigint;
  maxFtInRaw?: bigint;
  /** Maximum actual TBC contribution, excluding miner fees and output funding. */
  maxTbcInSat?: bigint;
};
export interface TBCAMMRemoveLPOptions extends TBCAMMOperationOptions {
  userLP: TBCAMMAssetInput;
  burnAmountRaw: bigint;
  receiverAddress: string;
  minFtOutRaw?: bigint;
  minTbcOutSat?: bigint;
  /** Transaction lockTime; defaults to the consumed LP lock. Node maturity is a separate check. */
  lockTime?: number;
}
export interface TBCAMMSwapFTOptions extends TBCAMMOperationOptions {
  inputTbcSat: bigint;
  receiverAddress: string;
  minFtOutRaw: bigint;
}
export interface TBCAMMSwapTBCOptions extends TBCAMMOperationOptions {
  userFT: TBCAMMAssetInput;
  inputFtRaw: bigint;
  receiverAddress: string;
  minTbcOutSat: bigint;
}
export interface TBCAMMTransferLPOptions {
  inputs: readonly TBCAMMAssetInput[];
  funding: TBCAMMSignedInput;
  receiverAddress: string;
  amountRaw: bigint;
  lpChangeAddress?: string;
  changeAddress?: string;
  outputLockTime?: number;
  lockTime?: number;
  feePolicy?: TBCAMMFeePolicy;
}
export interface TBCAMMUnlockLPOptions
  extends Omit<
    TBCAMMTransferLPOptions,
    'amountRaw' | 'receiverAddress' | 'lpChangeAddress' | 'outputLockTime'
  > {
  /** All inputs must belong to this owner; no ownership transfer is hidden in unlockLP. */
  receiverAddress: string;
}
export interface TBCAMMMintOptions {
  funding: TBCAMMSignedInput;
  changeAddress?: string;
  feePolicy?: TBCAMMFeePolicy;
}
export interface TBCAMMAssetOutput {
  role: 'pool-ft' | 'user-ft' | 'ft-change' | 'new-lp' | 'lp-burn' | 'lp-change' | 'lp-transfer';
  family: 'tbc20-standard' | 'tbc20-lp';
  codeVout: number;
  tapeVout: number;
  amountRaw: bigint;
  amountsByInput: readonly bigint[];
}
export interface TBCAMMLayout {
  operation: 'mint' | 'addLP' | 'removeLP' | 'swapFT' | 'swapTBC' | 'transferLP' | 'unlockLP';
  inputRoles: readonly string[];
  assetOutputs: readonly TBCAMMAssetOutput[];
  serviceFeeVout?: number;
  userTbcVout?: number;
  poolCodeVout?: 0;
}
export interface TBCAMMBuildResult extends TBCAMMTransactionResult {
  layout: TBCAMMLayout;
  nextState?: TBCAMMState;
  quote?: TBCAMMQuote;
}
export interface TBCAMMMintResult extends TBCAMMBuildResult {
  source: TBCAMMTransactionResult;
  transactions: readonly tbc.Transaction[];
}
