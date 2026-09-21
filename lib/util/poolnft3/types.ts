import type * as tbc from 'tbc-lib-js';
import type { TBC20TransactionResolver } from '../tbc20/tbc20unlock';
import type { PoolAuthorization } from './authorization';
import type { PoolMathState } from './math';
import type { Pool3Quote } from '../../contract/poolNFT3.0';
import type { DecodedPoolTape } from './tape';
import type {
  Pool3FeePolicy,
  Pool3SignedInput,
  Pool3SigningIdentity,
  Pool3TransactionResult,
} from './transaction';

export interface PoolNFT3Config {
  /** Canonical TBC20 genesis transaction; its Code/Tape pair must be vout 0/1. */
  ftGenesisTx: tbc.Transaction;
  authorization?: PoolAuthorization;
  lp?: { kind: 'plain' | 'timelocked' };
  lpPlan?: number;
  serviceFeeRate?: number;
}
export interface Pool3AssetInput extends Pool3SignedInput {
  ancestors: TBC20TransactionResolver;
}
export interface Pool3PoolInput {
  parentTx: tbc.Transaction;
  /** Transaction spent by parentTx.vin0, including mint Source for the first operation. */
  ancestorTx: tbc.Transaction;
}
export interface Pool3State extends PoolMathState {
  tape: DecodedPoolTape;
  poolCodeHash: Buffer;
  codeScript: tbc.Script;
  outpoint: { txId: string; outputIndex: 0 };
  snapshotHash: string;
  controllerPubKeyHashes: readonly string[];
}
export interface Pool3OperationOptions {
  pool: Pool3PoolInput;
  poolFT: Pool3AssetInput;
  funding: Pool3SignedInput;
  controllerSigner?: Pool3SigningIdentity;
  /** P2PKH address for residual miner-funding change; defaults to funding signer. */
  changeAddress?: string;
  feePolicy?: Pool3FeePolicy;
  /** Optional optimistic-concurrency guard from an earlier quote. */
  expectedSnapshotHash?: string;
}
/** Select exactly one asset budget; the other asset is quoted automatically. */
export type Pool3AddLPAmount =
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
export type Pool3AddLPOptions = Pool3OperationOptions & Pool3AddLPAmount & {
  userFT: Pool3AssetInput;
  lpReceiverAddress: string;
  /** Required for timelocked pools, including explicit zero. */
  lpLockTime?: number;
  minLpOutRaw?: bigint;
  maxFtInRaw?: bigint;
  /** Maximum actual TBC contribution, excluding miner fees and output funding. */
  maxTbcInSat?: bigint;
};
export interface Pool3RemoveLPOptions extends Pool3OperationOptions {
  userLP: Pool3AssetInput;
  burnAmountRaw: bigint;
  receiverAddress: string;
  minFtOutRaw?: bigint;
  minTbcOutSat?: bigint;
  /** Transaction lockTime; defaults to the consumed LP lock. Node maturity is a separate check. */
  lockTime?: number;
}
export interface Pool3SwapFTOptions extends Pool3OperationOptions {
  inputTbcSat: bigint;
  receiverAddress: string;
  minFtOutRaw: bigint;
}
export interface Pool3SwapTBCOptions extends Pool3OperationOptions {
  userFT: Pool3AssetInput;
  inputFtRaw: bigint;
  receiverAddress: string;
  minTbcOutSat: bigint;
}
export interface Pool3TransferLPOptions {
  inputs: readonly Pool3AssetInput[];
  funding: Pool3SignedInput;
  receiverAddress: string;
  amountRaw: bigint;
  lpChangeAddress?: string;
  changeAddress?: string;
  outputLockTime?: number;
  lockTime?: number;
  feePolicy?: Pool3FeePolicy;
}
export interface Pool3UnlockLPOptions
  extends Omit<
    Pool3TransferLPOptions,
    'amountRaw' | 'receiverAddress' | 'lpChangeAddress' | 'outputLockTime'
  > {
  /** All inputs must belong to this owner; no ownership transfer is hidden in unlockLP. */
  receiverAddress: string;
}
export interface Pool3MintOptions {
  funding: Pool3SignedInput;
  changeAddress?: string;
  feePolicy?: Pool3FeePolicy;
}
export interface Pool3AssetOutput {
  role: 'pool-ft' | 'user-ft' | 'ft-change' | 'new-lp' | 'lp-burn' | 'lp-change' | 'lp-transfer';
  family: 'tbc20' | 'ftlp';
  codeVout: number;
  tapeVout: number;
  amountRaw: bigint;
  amountsByInput: readonly bigint[];
}
export interface Pool3Layout {
  operation: 'mint' | 'addLP' | 'removeLP' | 'swapFT' | 'swapTBC' | 'transferLP' | 'unlockLP';
  inputRoles: readonly string[];
  assetOutputs: readonly Pool3AssetOutput[];
  serviceFeeVout?: number;
  userTbcVout?: number;
  poolCodeVout?: 0;
}
export interface Pool3BuildResult extends Pool3TransactionResult {
  layout: Pool3Layout;
  nextState?: Pool3State;
  quote?: Pool3Quote;
}
export interface Pool3MintResult extends Pool3BuildResult {
  source: Pool3TransactionResult;
  transactions: readonly tbc.Transaction[];
}
