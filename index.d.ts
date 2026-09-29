import { PrivateKey, Address, Transaction, Script } from "tbc-lib-js";

// Offline Code-template recognition. Unknown/malformed scripts return null.
/** The locking script of a Code output, never a txid, raw transaction, Hold or Tape. */
export type ContractCodeScript = Script | Buffer | string;

type CodeSize = { readonly codeBytes: number };
export type PoolVersionInfo = CodeSize & (
  | { readonly family: 'pool'; readonly version: 1; readonly sdk: 'poolNFT' }
  | { readonly family: 'pool'; readonly version: 2; readonly sdk: 'poolNFT2' }
  | { readonly family: 'pool'; readonly version: 3; readonly sdk: 'TBCAMM' }
);
export type FTVersionInfo = CodeSize & (
  | { readonly family: 'ft'; readonly version: 'legacy'; readonly sdk: 'FT'; readonly legacyVersion: 1 | 2 | 3 | 4 }
  | { readonly family: 'ft'; readonly version: 'tbc20-standard'; readonly sdk: 'TBC20Standard' }
);
export type StableCoinVersionInfo = CodeSize & (
  | { readonly family: 'stablecoin'; readonly version: 'legacy'; readonly sdk: 'stableCoin'; readonly legacyVersion: 1 | 2 | 3 | 4 }
  | { readonly family: 'stablecoin'; readonly version: 'tbc20-stablecoin'; readonly sdk: 'TBC20Stablecoin' }
);
export type NFTVersionInfo = CodeSize & (
  | { readonly family: 'nft'; readonly version: 'legacy'; readonly sdk: 'NFT'; readonly legacyVersion: 0 | 1 | 2 }
  | { readonly family: 'nft'; readonly version: 'tbc721-standard'; readonly sdk: 'TBC721Standard' }
);
export type ContractVersionInfo = PoolVersionInfo | FTVersionInfo | StableCoinVersionInfo | NFTVersionInfo;

export function detectContractVersion(codeScript: ContractCodeScript): ContractVersionInfo | null;
export function detectPoolVersion(codeScript: ContractCodeScript): PoolVersionInfo | null;
export function detectFTVersion(codeScript: ContractCodeScript): FTVersionInfo | null;
export function detectStableCoinVersion(codeScript: ContractCodeScript): StableCoinVersionInfo | null;
export function detectNFTVersion(codeScript: ContractCodeScript): NFTVersionInfo | null;


// TBC AMM: offline construction, signing and validation. TBC amounts use
// integer satoshis; FT and LP amounts use raw minimum units. Nothing broadcasts.

/** Immutable configuration; each operation consumes an explicit Pool snapshot. */
export class TBCAMM {
  constructor(options: TBCAMMConfig);
  readonly tapeSize: number;
  static fromPool(poolTx: Transaction, ftGenesisTx: Transaction): TBCAMM;
  readPoolState(poolTx: Transaction): TBCAMMState;
  quoteAddLP(
    poolTx: Transaction,
    incrementSat: bigint,
    firstFtAmountRaw?: bigint,
  ): AddLPQuote & Pick<TBCAMMState, "outpoint" | "snapshotHash">;
  quoteAddLP(
    poolTx: Transaction,
    amount: TBCAMMAddLPAmount,
  ): AddLPQuote & Pick<TBCAMMState, "outpoint" | "snapshotHash">;
  quoteRemoveLP(
    poolTx: Transaction,
    burnRaw: bigint,
  ): RemoveLPQuote & Pick<TBCAMMState, "outpoint" | "snapshotHash">;
  quoteSwapFT(
    poolTx: Transaction,
    inputTbcSat: bigint,
    minFtOutRaw?: bigint,
  ): SwapFTQuote & Pick<TBCAMMState, "outpoint" | "snapshotHash">;
  quoteSwapTBC(
    poolTx: Transaction,
    inputFtRaw: bigint,
    minTbcOutSat?: bigint,
  ): SwapTBCQuote & Pick<TBCAMMState, "outpoint" | "snapshotHash">;
  /** Uses an already selected mint root; unlike mintTbcAmm, creates no Source. */
  prepareMintTbcAmm(options: TBCAMMMintOptions): PreparedTBCAMMOperation;
  mintTbcAmm(options: TBCAMMMintOptions): Promise<TBCAMMMintResult>;
  prepareAddLP(options: TBCAMMAddLPOptions): PreparedTBCAMMOperation;
  addLP(options: TBCAMMAddLPOptions): Promise<TBCAMMBuildResult>;
  prepareRemoveLP(options: TBCAMMRemoveLPOptions): PreparedTBCAMMOperation;
  removeLP(options: TBCAMMRemoveLPOptions): Promise<TBCAMMBuildResult>;
  prepareSwapFT(options: TBCAMMSwapFTOptions): PreparedTBCAMMOperation;
  swapFT(options: TBCAMMSwapFTOptions): Promise<TBCAMMBuildResult>;
  prepareSwapTBC(options: TBCAMMSwapTBCOptions): PreparedTBCAMMOperation;
  swapTBC(options: TBCAMMSwapTBCOptions): Promise<TBCAMMBuildResult>;
  prepareTransferLP(options: TBCAMMTransferLPOptions): PreparedTBCAMMOperation;
  transferLP(options: TBCAMMTransferLPOptions): Promise<TBCAMMBuildResult>;
  prepareUnlockLP(options: TBCAMMUnlockLPOptions): PreparedTBCAMMOperation;
  unlockLP(options: TBCAMMUnlockLPOptions): Promise<TBCAMMBuildResult>;
}


export type PoolAuthorization =
  | { readonly kind: "public" }
  | {
      readonly kind: "controller";
      readonly controllerPubKeyHashes: readonly string[];
    };

export interface TBCAMMConfig {
  /** Canonical TBC20 Standard genesis transaction with Code/Tape at vout 0/1. */
  ftGenesisTx: Transaction;
  authorization?: PoolAuthorization;
  lp?: { kind: "plain" | "timelocked" };
  lpPlan?: number;
  serviceFeeRate?: number;
}

// Signing and input references.

export type TBCAMMTransactionResolver =
  | ReadonlyMap<string, Transaction>
  | readonly Transaction[]
  | ((txid: string) => Transaction | undefined);

export type TBCAMMSignerRole =
  | "funding"
  | "pool-controller"
  | "pool-ft"
  | "user-ft"
  | "lp-owner";

export interface TBCAMMInputReference {
  parentTx: Transaction;
  outputIndex: number;
}

export interface TBCAMMSigningRequest {
  inputIndex: number;
  role: TBCAMMSignerRole;
  outpoint: { txId: string; outputIndex: number };
  amountSat: bigint;
  lockingScriptHex: string;
  publicKey: Buffer;
  publicKeyHash: Buffer;
  sighashType: 0x41;
  /** Isolated final-output view with previous outputs attached for signing. */
  transaction: Transaction;
}

export interface TBCAMMSigningIdentity {
  publicKey: string | Buffer;
  /** Called once per input, after amounts, outputs and miner fee are fixed. */
  sign?: (
    request: TBCAMMSigningRequest,
  ) => Buffer | string | Promise<Buffer | string>;
}

export function privateKeySigner(key: PrivateKey): TBCAMMSigningIdentity;

export interface TBCAMMSignedInput extends TBCAMMInputReference {
  signer: TBCAMMSigningIdentity;
}

export interface TBCAMMAssetInput extends TBCAMMSignedInput {
  ancestors: TBCAMMTransactionResolver;
}

export interface TBCAMMPoolInput {
  parentTx: Transaction;
  /** Transaction spent by parentTx.vin0, including mint Source for first AddLP. */
  ancestorTx: Transaction;
}

export interface TBCAMMFeePolicy {
  satoshisPerKb?: bigint;
  minimumFeeSat?: bigint;
  /** Defaults to 10 sat; may be increased, but never lowered below 10 sat. */
  changeDustSat?: bigint;
}

export interface TBCAMMSignature {
  inputIndex: number;
  signature: Buffer | string;
  publicKey: Buffer | string;
}

/** Obtained through prepare* methods, never constructed directly. */
export interface PreparedTBCAMMOperation {
  readonly layout: TBCAMMLayout;
  readonly quote: TBCAMMQuote | undefined;
  readonly transaction: Transaction;
  readonly signingRequests: readonly TBCAMMSigningRequest[];
  readonly feeSat: bigint;
  readonly changeVout: number | undefined;
  finalize(signatures: readonly TBCAMMSignature[]): TBCAMMBuildResult;
  sign(): Promise<TBCAMMBuildResult>;
}

// Operation inputs.

export interface TBCAMMOperationOptions {
  pool: TBCAMMPoolInput;
  poolFT: TBCAMMAssetInput;
  funding: TBCAMMSignedInput;
  controllerSigner?: TBCAMMSigningIdentity;
  /** Residual miner-funding change; defaults to the funding signer's address. */
  changeAddress?: string;
  feePolicy?: TBCAMMFeePolicy;
  /** Optional optimistic-concurrency guard from an earlier quote. */
  expectedSnapshotHash?: string;
}

export interface TBCAMMMintOptions {
  funding: TBCAMMSignedInput;
  changeAddress?: string;
  feePolicy?: TBCAMMFeePolicy;
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
  /** Required for timelocked pools, including an explicit zero. */
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
  /** Defaults to the consumed LP lock; node maturity must be checked separately. */
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
    "amountRaw" | "receiverAddress" | "lpChangeAddress" | "outputLockTime"
  > {
  /** Every input must belong to this owner; unlocking does not transfer ownership. */
  receiverAddress: string;
}

// Transaction results and Pool state.

export interface TBCAMMTransactionResult {
  transaction: Transaction;
  txraw: string;
  txid: string;
  feeSat: bigint;
  reservedBytes: number;
  changeVout?: number;
  consumedOutpoints: readonly { txId: string; outputIndex: number }[];
  validation: TBCAMMValidationReport;
}

export interface TBCAMMAssetOutput {
  role:
    | "pool-ft"
    | "user-ft"
    | "ft-change"
    | "new-lp"
    | "lp-burn"
    | "lp-change"
    | "lp-transfer";
  family: "tbc20-standard" | "tbc20-lp";
  codeVout: number;
  tapeVout: number;
  amountRaw: bigint;
  amountsByInput: readonly bigint[];
}

export interface TBCAMMLayout {
  operation:
    | "mint"
    | "addLP"
    | "removeLP"
    | "swapFT"
    | "swapTBC"
    | "transferLP"
    | "unlockLP";
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
  transactions: readonly Transaction[];
}

export interface TBCAMMState extends PoolMathState {
  tape: DecodedPoolTape;
  poolCodeHash: Buffer;
  codeScript: Script;
  outpoint: { txId: string; outputIndex: 0 };
  snapshotHash: string;
  controllerPubKeyHashes: readonly string[];
}

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

export type TBCAMMQuote =
  | AddLPQuote
  | RemoveLPQuote
  | SwapFTQuote
  | SwapTBCQuote;

// Tape decoding and Swap service fees.

export interface PoolTapeAmounts {
  readonly ftLpAmount: bigint;
  readonly ftAAmount: bigint;
  readonly tbcAmount: bigint;
}

export interface PoolTapeFields extends PoolTapeAmounts {
  readonly ftLpPartialHash: Buffer;
  readonly ftLpCodeSize: number;
  readonly ftAPartialHash: Buffer;
  readonly ftACodeSize: number;
  /** Display txid byte order, not reversed outpoint encoding. */
  readonly ftAContractId: string;
  /** Total Swap fee rate, despite the legacy field name. */
  readonly serviceFeeRate: number;
  readonly lpPlan: number;
  readonly withSwapHashLock: boolean;
  readonly withLpLocktime: boolean;
  readonly withLpHashLock: boolean;
}

export interface DecodedPoolTape extends PoolTapeFields {
  readonly suffixData: Buffer;
  readonly flag: "POOLTAPE";
  readonly variant:
    | "public"
    | "public-timelocked"
    | "controller"
    | "controller-timelocked";
}

export function decodePoolTape(tape: Buffer | Script): DecodedPoolTape;

export type TBCAMMFeePlan = 1 | 2 | 3 | 4 | 5 | 6;

export interface SwapFeePolicy {
  readonly lpPlan: TBCAMMFeePlan;
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

export interface FeeRecipient {
  readonly address: string;
  readonly feePubKeyHash20: Buffer;
  readonly feeP2pkhScript25: Script;
  readonly feeScriptHash32: Buffer;
}

export function resolveSwapFeePolicy(
  lpPlan?: number,
  serviceFeeRate?: number,
): SwapFeePolicy;
export function calculateSwapFees(
  baseTbcSat: bigint,
  supplied: SwapFeePolicy,
): SwapFeeBreakdown;
export function deriveFeeRecipient(address: string): FeeRecipient;

// LP Code/Tape inspection and lock requirements.

export type TBC20LPScriptLike = Script | Buffer | string;

export interface TBC20LPCodeOptions {
  poolCodeHash: Buffer;
  tapeSize: number;
  controller: Buffer;
  timelocked: boolean;
}

export interface TBC20LPCodeDescriptor extends TBC20LPCodeOptions {
  /** SHA256 intermediate state of the immutable prefix followed by ScriptNum size. */
  identity: Buffer;
  codeSize: number;
}

export interface TBC20LPTapeOptions {
  amounts: readonly bigint[];
  tapeSize: number;
  timelocked: boolean;
  /** Required for timelocked LP, including an explicit zero. */
  lockTime?: number;
}

export interface TBC20LPTapeDescriptor {
  amounts: readonly bigint[];
  balance: bigint;
  tapeSize: number;
  timelocked: boolean;
  lockTime: number;
}

export class TBC20LP {
  static readonly codeSatoshis: 500;
  static readonly maxSlotAmount: bigint;
  static readonly lockTimeThreshold: 500000000;
  static instantiateCode(options: TBC20LPCodeOptions): Script;
  static parseCode(value: TBC20LPScriptLike): TBC20LPCodeDescriptor;
  static validateCode(
    value: TBC20LPScriptLike,
    expected?: Partial<TBC20LPCodeOptions>,
  ): TBC20LPCodeDescriptor;
  static getCodeIdentity(value: TBC20LPScriptLike): Buffer;
  static replaceController(value: TBC20LPScriptLike, controller: Buffer): Script;
  static buildTape(options: TBC20LPTapeOptions): Script;
  static parseTape(
    value: TBC20LPScriptLike,
    profile: { timelocked: boolean; tapeSize?: number },
  ): TBC20LPTapeDescriptor;
  /** Script-level requirement only; node/chain finality is a separate check. */
  static getRequiredLockTime(lockTimes: readonly number[]): number;
  static verifyInputLock(
    tx: Transaction,
    inputIndex: number,
    tape: TBC20LPScriptLike,
    profile: Pick<TBC20LPCodeOptions, "timelocked" | "tapeSize">,
  ): void;
}

export interface TBCAMMInputValidation {
  inputIndex: number;
  success: boolean;
  error: string;
  stackDepth: number;
  altStackDepth: number;
}

export interface TBCAMMValidationReport {
  success: boolean;
  inputs: readonly TBCAMMInputValidation[];
  valueConserved: boolean;
  /** Local execution does not establish UTXO availability or node finality. */
  nodeAcceptanceChecked: false;
}

/** Every input must have its trusted previous output attached. */
export function validateTbcAmmTransaction(
  tx: Transaction,
): TBCAMMValidationReport;

/** Indexed token values use raw minimum units. */
export interface TBC20StandardInfo extends FtInfo {
  contractTxid: string;
  supply: string;
}
export interface TBC20StablecoinInfo extends FtInfo {
  contractTxid: string;
  issuanceTxid: string;
}
export interface TBC20StandardUtxo extends Transaction.IUnspentOutput {
  ftBalance: bigint;
  parentTx: Transaction;
  tapeScript: string;
}
export interface TBC20StablecoinUtxo extends TBC20StandardUtxo {
  lockTime: number;
}
export interface TBC20LPUtxo extends TBC20StandardUtxo {
  timelocked: boolean;
  lockTime: number;
}
export interface TBCAMMInfo {
  contractTxid: string;
  parentTx: Transaction;
  codeScript: string;
  tapeScript: string;
  poolCodeHash: Buffer;
  tape: DecodedPoolTape;
  authorization: PoolAuthorization;
  poolVersion: 3;
  serviceProvider: string;
  currentContractTxid: string;
  currentContractVout: 0;
  currentContractSatoshi: number;
}
export interface TBCAMMUtxo extends Transaction.IUnspentOutput {
  parentTx: Transaction;
  tapeScript: string;
}
export interface TBC721StandardInfo {
  collectionId: string;
  collectionIndex: number;
  collectionName: string;
  nftName: string;
  nftSymbol: string;
  nftAttributes: string;
  nftDescription: string;
  nftTransferTimeCount: number;
  nftIcon: string;
}

export class API {
  /** Reads indexed metadata and validates the contract Code/Tape family. */
  static fetchTbc20StandardInfo(contractTxid: string, network?: string): Promise<TBC20StandardInfo>;
  /** Returns the indexed balance in raw minimum units. */
  static getTbc20StandardBalance(contractTxid: string, addressOrHash: string, network?: string): Promise<bigint>;
  /** Returns indexed outputs with their checked parent transactions and Tape data. */
  static fetchTbc20StandardUtxoList(contractTxid: string, addressOrHash: string, codeScript: string, network?: string): Promise<TBC20StandardUtxo[]>;
  /** Selects one token output covering amountRaw. */
  static fetchTbc20StandardUtxo(contractTxid: string, addressOrHash: string, amountRaw: bigint, codeScript: string, network?: string): Promise<TBC20StandardUtxo>;
  /** Selects at most maxInputs (1-5); undefined amountRaw selects the largest compatible set. */
  static fetchTbc20StandardUtxos(contractTxid: string, addressOrHash: string, amountRaw: bigint | undefined, codeScript: string, network?: string, maxInputs?: number): Promise<TBC20StandardUtxo[]>;
  /** Fetches complete ancestor transactions for the nonzero parent Tape slots. */
  static fetchTbc20StandardAncestors(parentTx: Transaction, codeVout: number, network?: string): Promise<Transaction[]>;
  /** Reads indexed metadata and validates the contract Code/Tape family. */
  static fetchTbc20StablecoinInfo(contractTxid: string, network?: string): Promise<TBC20StablecoinInfo>;
  /** Returns the indexed balance in raw minimum units. */
  static getTbc20StablecoinBalance(contractTxid: string, addressOrHash: string, network?: string): Promise<bigint>;
  /** Returns indexed outputs with their checked parent transactions and Tape data. */
  static fetchTbc20StablecoinUtxoList(contractTxid: string, addressOrHash: string, codeScript: string, network?: string): Promise<TBC20StablecoinUtxo[]>;
  /** Selects one token output covering amountRaw. */
  static fetchTbc20StablecoinUtxo(contractTxid: string, addressOrHash: string, amountRaw: bigint, codeScript: string, network?: string): Promise<TBC20StablecoinUtxo>;
  /** Selects at most maxInputs (1-5); undefined amountRaw selects the largest compatible set. */
  static fetchTbc20StablecoinUtxos(contractTxid: string, addressOrHash: string, amountRaw: bigint | undefined, codeScript: string, network?: string, maxInputs?: number): Promise<TBC20StablecoinUtxo[]>;
  /** Fetches complete ancestor transactions for the nonzero parent Tape slots. */
  static fetchTbc20StablecoinAncestors(parentTx: Transaction, codeVout: number, network?: string): Promise<Transaction[]>;
  static fetchTbcAmmInfo(contractTxid: string, network?: string): Promise<TBCAMMInfo>;
  static fetchTbcAmmUtxo(contractTxid: string, network?: string): Promise<TBCAMMUtxo>;
  static fetchTbcAmmInput(contractTxid: string, network?: string): Promise<TBCAMMPoolInput>;
  static getTbc20LpBalance(codeScript: string, network?: string): Promise<bigint>;
  static fetchTbc20LpUtxoList(codeScript: string, network?: string): Promise<TBC20LPUtxo[]>;
  static fetchTbc20LpUtxo(codeScript: string, amountRaw: bigint, network?: string): Promise<TBC20LPUtxo>;
  static fetchTbc20LpUtxos(codeScript: string, amountRaw?: bigint, network?: string, maxInputs?: number): Promise<TBC20LPUtxo[]>;
  static fetchTbc20LpAncestors(parentTx: Transaction, codeVout: number, network?: string): Promise<Transaction[]>;
  static fetchTbc721StandardInfo(contractId: string, network?: string): Promise<TBC721StandardInfo>;
  static fetchTbc721StandardNfts(collectionId: string, address: string, start: number, end: number, network?: string): Promise<string[]>;
  static fetchTbc721StandardTxo(params: { script: string; txId?: string; network?: string }): Promise<Transaction.IUnspentOutput>;
  static fetchTbc721StandardTxos(params: { script: string; txId: string; network?: string }): Promise<Transaction.IUnspentOutput[]>;

  static getTBCbalance(
    address: string,
    network?: "testnet" | "mainnet" | string,
  ): Promise<number>;
  static fetchUTXOList(
    address: string,
    network?: "testnet" | "mainnet" | string,
  ): Promise<Transaction.IUnspentOutput[]>;
  static fetchUTXO(
    privateKey: PrivateKey,
    amount: number,
    network?: "testnet" | "mainnet" | string,
  ): Promise<Transaction.IUnspentOutput>;
  static mergeUTXO(
    privateKey: PrivateKey,
    network?: "testnet" | "mainnet" | string,
  ): Promise<boolean>;
  static getFTbalance(
    contractTxid: string,
    addressOrHash: string,
    network?: "testnet" | "mainnet" | string,
  ): Promise<bigint>;
  static fetchFtUTXOList(
    contractTxid: string,
    addressOrHash: string,
    codeScript: string,
    network?: "testnet" | "mainnet" | string,
  ): Promise<Transaction.IUnspentOutput[]>;
  static fetchFtUTXO(
    contractTxid: string,
    addressOrHash: string,
    amount: bigint,
    codeScript: string,
    network?: "testnet" | "mainnet" | string,
  ): Promise<Transaction.IUnspentOutput>;
  static fetchFtUTXOs(
    contractTxid: string,
    addressOrHash: string,
    codeScript: string,
    network?: "testnet" | "mainnet" | string,
    amount?: bigint,
  ): Promise<Transaction.IUnspentOutput[]>;
  static fetchFtUTXOsforPool(
    contractTxid: string,
    addressOrHash: string,
    amount: bigint,
    number: number,
    codeScript: string,
    network?: "testnet" | "mainnet" | string,
  ): Promise<Transaction.IUnspentOutput[]>;
  static fetchFtInfo(
    contractTxid: string,
    network?: "testnet" | "mainnet" | string,
  ): Promise<FtInfo>;
  static fetchFtPrePreTxData(
    preTX: Transaction,
    preTxVout: number,
    network?: "testnet" | "mainnet" | string,
  ): Promise<string>;
  static fetchPoolNftInfo(
    contractTxid: string,
    network?: "testnet" | "mainnet" | string,
  ): Promise<PoolNFTInfo>;
  static fetchPoolNftUTXO(
    contractTxid: string,
    network?: "testnet" | "mainnet" | string,
  ): Promise<Transaction.IUnspentOutput>;
  static fetchFtlpBalance(
    ftlpCode: string,
    network?: "testnet" | "mainnet" | string,
  ): Promise<bigint>;
  static fetchFtlpUTXO(
    ftlpCode: string,
    amount: bigint,
    network?: "testnet" | "mainnet" | string,
  ): Promise<Transaction.IUnspentOutput>;
  static fetchTXraw(
    txid: string,
    network?: "testnet" | "mainnet" | string,
  ): Promise<Transaction>;
  static broadcastTXraw(
    txraw: string,
    network?: "testnet" | "mainnet" | string,
  ): Promise<string>;
  static broadcastTXsraw(
    txrawList: Array<{ txraw: string }>,
    network?: "testnet" | "mainnet" | string,
  ): Promise<string>;
  static fetchUTXOs(
    address: string,
    network?: "testnet" | "mainnet" | string,
  ): Promise<Transaction.IUnspentOutput[]>;
  static getUTXOs(
    address: string,
    amount_tbc: number,
    network?: "testnet" | "mainnet" | string,
  ): Promise<Transaction.IUnspentOutput[]>;
  static fetchNFTTXO(params: {
    script: string;
    tx_hash?: string;
    network?: "testnet" | "mainnet" | string;
  }): Promise<Transaction.IUnspentOutput>;
  static fetchNFTTXOs(params: {
    script: string;
    tx_hash: string;
    network?: "testnet" | "mainnet" | string;
  }): Promise<Transaction.IUnspentOutput[]>;
  static fetchNFTInfo(
    contract_id: string,
    network?: "testnet" | "mainnet" | string,
  ): Promise<NFTInfo>;
  static fetchNFTs(
    collection_id: string,
    address: string,
    start: number,
    end: number,
    network?: "testnet" | "mainnet" | string,
  ): Promise<string[]>;
  static fetchUMTXO(
    script_asm: string,
    tbc_amount: number,
    network?: "testnet" | "mainnet" | string,
  ): Promise<Transaction.IUnspentOutput>;
  static fetchUMTXOs(
    script_asm: string,
    network?: "testnet" | "mainnet" | string,
  ): Promise<Transaction.IUnspentOutput[]>;
  static getUMTXOs(
    script_asm: string,
    amount_tbc: number,
    network?: "testnet" | "mainnet" | string,
  ): Promise<Transaction.IUnspentOutput[]>;
  static fetchFtUTXOS_multiSig(
    contractTxid: string,
    addressOrHash: string,
    codeScript: string,
    network?: "testnet" | "mainnet" | string,
  ): Promise<Transaction.IUnspentOutput[]>;
  static getFtUTXOS_multiSig(
    contractTxid: string,
    addressOrHash: string,
    codeScript: string,
    amount: bigint,
    network?: "testnet" | "mainnet" | string,
  ): Promise<Transaction.IUnspentOutput[]>;
  static fetchBlockHeaders(network?: "testnet" | "mainnet" | string): Promise<
    Array<{
      hash: string;
      confirmations: number;
      height: number;
      version: number;
      versionHex: string;
      merkleroot: string;
      time: number;
      nonce: number;
      bits: string;
      difficulty: number;
      previousblockhash?: string;
      nextblockhash?: string;
    }>
  >;
  static fetchFrozenTBCBalance(
    address: string,
    network?: "testnet" | "mainnet" | string,
  ): Promise<number>;
  static fetchUnfrozenUTXOList(
    address: string,
    network?: "testnet" | "mainnet" | string,
  ): Promise<Transaction.IUnspentOutput[]>;
  static fetchFrozenUTXOList(
    address: string,
    network?: "testnet" | "mainnet" | string,
  ): Promise<Transaction.IUnspentOutput[]>;
  static fetchCoinInfo(
    contractTxid: string,
    network?: "testnet" | "mainnet" | string,
  ): Promise<{ coinInfo: FtInfo; nftTXID: string }>;
  static getCoinbalance(
    contractTxid: string,
    addressOrHash: string,
    network?: "testnet" | "mainnet" | string,
  ): Promise<bigint>;
  static fetchCoinUTXOList(
    contractTxid: string,
    addressOrHash: string,
    codeScript: string,
    network?: "testnet" | "mainnet" | string,
  ): Promise<Transaction.IUnspentOutput[]>;
  static fetchCoinUTXOs(
    contractTxid: string,
    addressOrHash: string,
    amount: bigint,
    codeScript: string,
    network?: "testnet" | "mainnet" | string,
    number?: number,
  ): Promise<Transaction.IUnspentOutput[]>;
}

export interface CollectionData {
  collectionName: string;
  description: string;
  supply: number;
  file: string;
}

export interface NFTInfo {
  collectionId: string;
  collectionIndex: number;
  collectionName: string;
  nftName: string;
  nftSymbol: string;
  nft_attributes: string;
  nftDescription: string;
  nftTransferTimeCount: number;
  nftIcon: string;
}

export interface NFTData {
  nftName: string;
  symbol: string;
  description: string;
  attributes: string;
  file?: string;
}

export class NFT {
  collection_id: string;
  collection_index: number;
  collection_name: string;
  transfer_count: number;
  contract_id: string;
  nftData: NFTData;
  constructor(contract_id: string);
  initialize(nftInfo: NFTInfo): void;
  static createCollection(
    address: string,
    privateKey: PrivateKey,
    data: CollectionData,
    utxos: Transaction.IUnspentOutput[],
  ): string;
  static createNFT(
    collection_id: string,
    address: string,
    privateKey: PrivateKey,
    data: NFTData,
    utxos: Transaction.IUnspentOutput[],
    nfttxo: Transaction.IUnspentOutput,
  ): string;
  static batchCreateNFT(
    collection_id: string,
    address: string,
    privateKey: PrivateKey,
    datas: NFTData[],
    utxos: Transaction.IUnspentOutput[],
    nfttxos: Transaction.IUnspentOutput[],
  ): Array<{ txraw: string }>;
  transferNFT(
    address_from: string,
    address_to: string,
    privateKey: PrivateKey,
    utxos: Transaction.IUnspentOutput[],
    pre_tx: Transaction,
    pre_pre_tx: Transaction,
    batch?: boolean,
  ): string;
  transferNFT_v0(
    address_from: string,
    address_to: string,
    privateKey: PrivateKey,
    utxos: Transaction.IUnspentOutput[],
    pre_tx: Transaction,
    pre_pre_tx: Transaction,
  ): string;
  transferNFT_v1(
    address_from: string,
    address_to: string,
    privateKey: PrivateKey,
    utxos: Transaction.IUnspentOutput[],
    pre_tx: Transaction,
    pre_pre_tx: Transaction,
    batch?: boolean,
  ): string;
  transferNFTWithTBC(
    address_from: string,
    address_to_nft: string,
    address_to_tbc: string,
    privateKey: PrivateKey,
    utxos: Transaction.IUnspentOutput[],
    pre_tx: Transaction,
    pre_pre_tx: Transaction,
    tbc_amount: number,
  ): string;
  transferNFTWithTBC_v1(
    address_from: string,
    address_to_nft: string,
    address_to_tbc: string,
    privateKey: PrivateKey,
    utxos: Transaction.IUnspentOutput[],
    pre_tx: Transaction,
    pre_pre_tx: Transaction,
    tbc_amount: number,
  ): string;
  static buildUnlockScript(
    privateKey_from: PrivateKey,
    currentTX: Transaction,
    preTX: Transaction,
    prepreTxData: Transaction,
    currentUnlockIndex: number,
  ): Script;
  static buildCodeScript_v0(tx_hash: string, outputIndex: number): Script;
  static getCurrentTxdata_v0(tx: Transaction): string;
  static getPreTxdata_v0(tx: Transaction): string;
  static getPrePreTxdata_v0(tx: Transaction): string;
  static buildCodeScript(tx_hash: string, outputIndex: number): Script;
  static buildCodeScript_v1(tx_hash: string, outputIndex: number): Script;
  static getNFTVersion(codeScript: string | Script): 0 | 1 | 2 | -1;
  static buildHoldScript(address: string): Script;
  static buildMintScript(address: string): Script;
  static buildTapeScript(data: CollectionData | NFTData): Script;
  static decodeNFTDataFromHex(hex: string): any;
  static encodeNFTDataToHex(data: any): string;
}

/** TBC721 Standard NFT API for the TBC721CODE3 template. */
export class TBC721Standard {
  collectionId: string;
  collectionIndex: number;
  collectionName: string;
  transferCount: number;
  contractId: string;
  nftData: NFTData;
  constructor(contractId: string);
  initialize(nftInfo: NFTInfo | TBC721StandardInfo): void;
  static createCollection(address: string, privateKey: PrivateKey, data: CollectionData,
    utxos: Transaction.IUnspentOutput[]): string;
  static createNft(collectionId: string, address: string, privateKey: PrivateKey, data: NFTData,
    utxos: Transaction.IUnspentOutput[], nfttxo: Transaction.IUnspentOutput): string;
  static batchCreateNft(collectionId: string, address: string, privateKey: PrivateKey, datas: NFTData[],
    utxos: Transaction.IUnspentOutput[], nfttxos: Transaction.IUnspentOutput[]): Array<{ txraw: string }>;
  transferNft(senderAddress: string, recipientAddress: string, privateKey: PrivateKey,
    utxos: Transaction.IUnspentOutput[], preTx: Transaction, prePreTx: Transaction, batch?: boolean): string;
  transferNftWithTbc(senderAddress: string, nftRecipientAddress: string, tbcRecipientAddress: string,
    privateKey: PrivateKey, utxos: Transaction.IUnspentOutput[], preTx: Transaction,
    prePreTx: Transaction, tbcAmount: number | string): string;
  static buildCodeScript(txid: string, outputIndex: number): Script;
  static getNftCode(txid: string, outputIndex: number): Script;
  static parseCode(script: Script | string): { originalUTXO: Buffer; txid: string; outputIndex: number };
  static isTbc721StandardCode(script: Script | string): boolean;
  static getNftVersion(script: Script | string): 3 | -1;
  static buildUnlockScript(privateKey: PrivateKey, currentTX: Transaction, preTX: Transaction,
    prepreTX: Transaction, currentUnlockIndex?: number): Script;
  /** The externally supplied signature includes its SIGHASH byte. */
  static buildUnlockScript(signature: Buffer, publicKey: Buffer, currentTX: Transaction,
    preTX: Transaction, prepreTX: Transaction, currentUnlockIndex?: number): Script;
  static buildUnlockScriptSchnorr(signature64: Buffer, publicKey32: Buffer, currentTX: Transaction,
    preTX: Transaction, prepreTX: Transaction, currentUnlockIndex?: number): Script;
  static getHoldScriptFromHash(pubKeyHashHex: string, flag: string): Script;
  static buildHoldScript(address: string): Script;
  static buildMintScript(address: string): Script;
  static buildTapeScript(data: CollectionData | NFTData): Script;
  static decodeNftDataFromHex(hex: string): any;
  static encodeNftDataToHex(data: any): string;
}

export interface FtInfo {
  contractTxid?: string;
  codeScript: string;
  tapeScript: string;
  totalSupply: bigint;
  decimal: number;
  name: string;
  symbol: string;
}

/** Canonical SDK/indexer metadata embedded in the TBC20 Standard Tape extension. */
export interface TBC20StandardMetadata {
  name: string;
  symbol: string;
  /**
   * Exact human-readable SDK/indexer declaration. It is not a consensus
   * supply cap. Use a decimal string, never a number.
   */
  supply: string;
  /** Display precision in the range 0-18. */
  decimal: number;
}

export interface TBC20StandardDefinition {
  name: string;
  symbol: string;
  /** Exact human-readable declaration. Use a decimal string, never a number. */
  supply: string;
  /** Defaults to zero. */
  decimal?: number;
}

/**
 * Safely restores an existing token from a trusted adjacent Code/Tape pair.
 * contractTxid is informational; codeScript is the token identity anchor.
 */
export interface TBC20StandardExistingToken {
  codeScript: string | Buffer | Script;
  tapeScript: string | Buffer | Script;
  contractTxid?: string;
}

export type TBC20StandardExistingConfig = TBC20StandardExistingToken &
  (
    | TBC20StandardDefinition
    | {
        name?: never;
        symbol?: never;
        supply?: never;
        decimal?: never;
      }
  );

export type TBC20StandardConfig = TBC20StandardDefinition | TBC20StandardExistingConfig;

export type TBC20StandardAncestorResolver =
  | ReadonlyMap<string, Transaction>
  | readonly Transaction[]
  | ((txid: string) => Transaction | undefined);

export interface TBC20StandardMintOptions {
  /** Runs local script verification by default. */
  verify?: boolean;
}

export interface TBC20StandardTransferOptions {
  tbcChangeAddress?: string;
  /** Runs local script verification by default. */
  verify?: boolean;
}

export interface TBC20StandardMergeOptions extends TBC20StandardTransferOptions {
  /** Defaults to the signing key's P2PKH address. */
  controller?: string;
}

export interface TBC20StandardTokenOutput {
  codeVout: number;
  tapeVout: number;
  /** Raw smallest-unit token amount. */
  amount: bigint;
}

export interface TBC20StandardBuildResult {
  transaction: Transaction;
  txraw: string;
  feeSatoshis: number;
  tokenOutputs: readonly TBC20StandardTokenOutput[];
}

export interface TBC20StandardMintResult extends TBC20StandardBuildResult {
  sourceTransaction: Transaction;
  sourceTxraw: string;
  sourceFeeSatoshis: number;
  originalUTXO: {
    txId: string;
    outputIndex: number;
  };
}

/**
 * High-level TBC20 Standard API. Low-level ABI and custom-controller builders remain
 * available only from the deep contract module.
 */
export class TBC20Standard {
  readonly metadata?: Readonly<TBC20StandardMetadata>;
  readonly name?: string;
  readonly symbol?: string;
  readonly supply?: string;
  readonly decimal?: number;
  readonly declaredSupplyRaw?: bigint;
  codeScript: string;
  tapeScript: string;
  contractTxid: string;

  constructor(config: TBC20StandardConfig);

  /** Uses the supply declared by the constructor metadata. */
  mint(
    privateKey: PrivateKey,
    recipientAddress: string,
    fundingUTXO: Transaction.IUnspentOutput,
    options?: TBC20StandardMintOptions,
  ): TBC20StandardMintResult;

  /**
   * Transfers a human-readable amount. tokenUTXOs[i], parentTxs[i], and
   * ancestorResolvers[i] must describe the same token input.
   */
  transfer(
    privateKey: PrivateKey,
    recipientAddress: string,
    humanAmount: string,
    tokenUTXOs: readonly Transaction.IUnspentOutput[],
    feeUTXO: Transaction.IUnspentOutput,
    parentTxs: readonly Transaction[],
    ancestorResolvers: readonly TBC20StandardAncestorResolver[],
    options?: TBC20StandardTransferOptions,
  ): TBC20StandardBuildResult;

  /** Merges 2-5 address-controlled token UTXOs into as few outputs as slot limits permit. */
  merge(
    privateKey: PrivateKey,
    tokenUTXOs: readonly Transaction.IUnspentOutput[],
    feeUTXO: Transaction.IUnspentOutput,
    parentTxs: readonly Transaction[],
    ancestorResolvers: readonly TBC20StandardAncestorResolver[],
    options?: TBC20StandardMergeOptions,
  ): TBC20StandardBuildResult;
}

export type TokenProtocolDescriptor =
  | Readonly<{ family: "TBC20Standard"; version: 1 }>
  | Readonly<{ family: "FT"; version: 1 | 2 | 3 | 4 }>;

export type TokenValidationErrorCode =
  | "INVALID_POLICY"
  | "ROOT_RAW_INVALID"
  | "INVALID_TRANSACTION_VERSION"
  | "NO_TOKEN_OUTPUT"
  | "PARENT_FETCH_FAILED"
  | "ANCESTOR_FETCH_FAILED"
  | "VALIDATOR_INTERNAL_ERROR"
  | "VALIDATOR_INTERNAL_INCOMPLETE"
  | "DUPLICATE_INPUT_OUTPOINT"
  | "INPUT_LIMIT_EXCEEDED"
  | "OUTPUT_LIMIT_EXCEEDED"
  | "PARENT_VOUT_OUT_OF_RANGE"
  | "UNSUPPORTED_TOKEN_PROTOCOL"
  | "MIXED_TOKEN_PROTOCOLS"
  | "INVALID_TOKEN_CODE"
  | "INVALID_TOKEN_TAPE"
  | "TOKEN_CODE_WITHOUT_TAPE"
  | "ORPHAN_TOKEN_TAPE"
  | "UNSUPPORTED_TBC20_STANDARD_ARTIFACT"
  | "INVALID_TBC20_STANDARD_CODE"
  | "EMPTY_LOCKING_SCRIPT"
  | "TBC20_STANDARD_CODE_WITHOUT_TAPE"
  | "ORPHAN_TBC20_STANDARD_TAPE"
  | "INVALID_TBC20_STANDARD_TAPE"
  | "INVALID_CODE_VALUE"
  | "INVALID_TAPE_VALUE"
  | "AMOUNT_SLOT_WITHOUT_INPUT"
  | "AMOUNT_SLOT_WITHOUT_TOKEN_INPUT"
  | "OUTPUT_INPUT_IDENTITY_MISMATCH"
  | "OUTPUT_IDENTITY_WITHOUT_INPUT"
  | "ZERO_IDENTITY_WITNESS_UNRESOLVED"
  | "ZERO_IDENTITY_WITNESS_CAPACITY_EXCEEDED"
  | "VIN_AMOUNT_NOT_CONSERVED"
  | "IDENTITY_AMOUNT_NOT_CONSERVED"
  | "TAPE_ENVELOPE_MISMATCH"
  | "PARENT_SLOT_WITHOUT_VIN"
  | "ANCESTOR_VOUT_OUT_OF_RANGE"
  | "ANCESTOR_EMPTY_LOCKING_SCRIPT"
  | "ANCESTOR_IDENTITY_MISMATCH"
  | "ORIGINAL_UTXO_MISMATCH";

export interface TokenValidationPolicy {
  /** Defaults to strict. relaxed-metadata only relaxes extension equality. */
  preset?: "strict" | "relaxed-metadata";
  /** Strict mode requires byte-identical Tape envelopes for one identity. */
  requireExactTapeEnvelope?: boolean;
}

export interface TokenValidationOptions {
  /** The caller asserts that this transaction is already on chain. */
  transaction: Transaction | string | Buffer;
  /** Passed through to API.fetchTXraw without an independent chain check. */
  network: string;
  policy?: TokenValidationPolicy;
}

export interface TokenValidationIssue {
  code: TokenValidationErrorCode;
  severity: "error" | "warning";
  stage: "SOURCE" | "ROOT" | "PARENT" | "OUTPUT_SCAN" | "MATRIX" | "ANCESTOR";
  message: string;
  vin?: number;
  vout?: number;
  slot?: number;
  txid?: string;
  identity?: string;
}

export interface TokenValidationResult {
  status: "VALID" | "INVALID" | "UNKNOWN";
  txid?: string;
  kind: "TRANSITION" | "NON_TOKEN" | "UNDETERMINED";
  protocol?: TokenProtocolDescriptor;
  assurances: readonly (
    | "OUTPUT_SOURCE_GRAPH_RESOLVED"
    | "STRUCTURE"
    | "TRANSITION"
    | "OUTPUT_SOURCE_LINEAGE"
  )[];
  issues: readonly TokenValidationIssue[];
  inputs: readonly (
    | {
        vin: number;
        prevTxid: string;
        prevVout: number;
        kind: "UNRESOLVED";
        resolution: "NOT_REQUESTED" | "UNAVAILABLE" | "INVALID";
      }
    | {
        vin: number;
        prevTxid: string;
        prevVout: number;
        kind: "ORDINARY";
        resolution: "RESOLVED";
        parentTxid: string;
      }
    | {
        vin: number;
        prevTxid: string;
        prevVout: number;
        kind: "TBC20Standard" | "FT";
        resolution: "RESOLVED";
        sourceRole?: "POSITIVE_SOURCE" | "ZERO_IDENTITY_WITNESS";
        parentTxid: string;
        codeVout: number;
        tapeVout: number;
        identity: string;
        slots: readonly [bigint, bigint, bigint, bigint, bigint, bigint];
        balanceRaw: bigint;
        protocol: TokenProtocolDescriptor;
      }
  )[];
  outputGroups: readonly {
    logicalIndex: number;
    kind: "TBC20Standard" | "FT" | "ORDINARY";
    firstVout: number;
    /** Number of consecutive physical outputs represented by this ABI group. */
    physicalVoutCount: 1 | 2;
    codeVout?: number;
    tapeVout?: number;
    identity?: string;
    slots?: readonly [bigint, bigint, bigint, bigint, bigint, bigint];
    balanceRaw?: bigint;
    protocol?: TokenProtocolDescriptor;
    recognizedContract?: {
      family: "FT" | "STABLE_COIN";
      version: 1 | 2 | 3 | 4;
    };
  }[];
  assets: readonly {
    identity: string;
    protocol: TokenProtocolDescriptor;
    inputVins: readonly number[];
    outputGroups: readonly number[];
    inputRaw: bigint;
    outputRaw: bigint;
    envelopeHash?: string;
  }[];
  matrix: readonly (readonly bigint[])[];
  ancestorEdges: readonly {
    currentVin: number;
    parentTxid: string;
    parentCodeVout: number;
    parentSlot: number;
    parentVin: number;
    /** Always 5 - parentSlot. */
    abiPrepreIndex: number;
    ancestorTxid: string;
    ancestorVout: number;
    parentIdentity: string;
    ancestorIdentity?: string;
    resolution: "SAME_IDENTITY" | "ORIGINAL_UTXO";
  }[];
  source?: {
    network: string;
    api: "API.fetchTXraw";
    trustModel: "API_FETCH_TXRAW_FULLY_TRUSTED";
    rootTrustModel: "CALLER_ASSERTED_ON_CHAIN_AND_INPUT_SCRIPTS_VALID";
    queriedTxids: readonly string[];
    resolvedTxids: readonly string[];
    requiredSourceTxids: readonly string[];
  };
  resolvedTransactions: number;
  parentsChecked: number;
  ancestorsChecked: number;
  originalUTXOBoundaries: number;
  /** Recursively converts bigint values to decimal strings. */
  toJSON(): Record<string, unknown>;
}

export class TokenValidationError extends Error {
  readonly report: TokenValidationResult;
  constructor(report: TokenValidationResult);
}

export class TokenValidator {
  private constructor();
  static validateOnChainTransaction(
    options: TokenValidationOptions,
  ): Promise<TokenValidationResult>;
  static assertValidOnChainTransaction(
    options: TokenValidationOptions,
  ): Promise<TokenValidationResult>;
}

export class FT {
  name: string;
  symbol: string;
  decimal: number;
  totalSupply: bigint;
  codeScript: string;
  tapeScript: string;
  contractTxid: string;
  constructor(
    txidOrParams:
      | string
      | { name: string; symbol: string; amount: number; decimal: number },
  );
  initialize(ftInfo: FtInfo): void;
  MintFT(
    privateKey_from: PrivateKey,
    address_to: string,
    utxo: Transaction.IUnspentOutput,
  ): string[];
  transfer(
    privateKey_from: PrivateKey,
    address_to: string,
    ft_amount: number | string,
    ftutxo_a: Transaction.IUnspentOutput[],
    utxo: Transaction.IUnspentOutput,
    preTX: Transaction[],
    prepreTxData: string[],
    tbc_amount?: number | string,
  ): string;
  transferWithAdditionalInfo(
    privateKey_from: PrivateKey,
    address_to: string,
    amount: number | string,
    ftutxo_a: Transaction.IUnspentOutput[],
    utxo: Transaction.IUnspentOutput,
    preTX: Transaction[],
    prepreTxData: string[],
    additionalInfo: Buffer,
  ): string;
  batchTransfer(
    privateKey_from: PrivateKey,
    receivers: { address: string; amount: number | string }[],
    ftutxo: Transaction.IUnspentOutput[],
    utxo: Transaction.IUnspentOutput,
    preTX: Transaction[],
    prepreTxData: string[],
  ): Array<{ txraw: string }>;
  mergeFT(
    privateKey_from: PrivateKey,
    ftutxo: Transaction.IUnspentOutput[],
    utxo: Transaction.IUnspentOutput,
    preTX: Transaction[],
    prepreTxData: string[],
    localTX: Transaction[],
  ): Array<{ txraw: string }>;
  getFTunlock(
    privateKey_from: PrivateKey,
    currentTX: Transaction,
    preTX: Transaction,
    prepreTxData: string,
    currentUnlockIndex: number,
    preTxVout: number,
    isCoin?: boolean,
  ): Script;
  getFTunlockSwap(
    privateKey_from: PrivateKey,
    currentTX: Transaction,
    preTX: Transaction,
    prepreTxData: string,
    contractTX: Transaction,
    currentUnlockIndex: number,
    preTxVout: number,
    ftVersion?: 1 | 2 | 3 | 4,
    isCoin?: boolean,
    isContractTXs?: boolean,
  ): Script;
  static getFTunlock(
    sigs: string,
    pubKey: string,
    currentTX: Transaction,
    preTX: Transaction,
    prepreTxData: string,
    currentUnlockIndex: number,
    preTxVout: number,
    isCoin?: boolean,
  ): Script;
  static getFTunlockSwap(
    sigs: string,
    pubKey: string,
    currentTX: Transaction,
    preTX: Transaction,
    prepreTxData: string,
    contractTX: Transaction,
    currentUnlockIndex: number,
    preTxVout: number,
    ftVersion?: 1 | 2 | 3 | 4,
    isCoin?: boolean,
    isContractTXs?: boolean,
  ): Script;
  getFTmintCode(
    txid: string,
    vout: number,
    address: string,
    tapeSize: number,
  ): Script;
  static buildFTtransferCode(code: string, addressOrHash: string): Script;
  static buildFTtransferTape(tape: string, amountHex: string): Script;
  static buildTapeAmount(
    amountBN: bigint,
    tapeAmountSet: bigint[],
    ftInputIndex?: number,
  ): { amountHex: string; changeHex: string };
  static buildMultiTapeAmounts(
    outputAmounts: bigint[],
    tapeAmountSetIn: bigint[],
  ): string[];
  static getBalanceFromTape(tape: string): bigint;
}

export interface PoolNFTInfo {
  ft_lp_amount: bigint;
  ft_a_amount: bigint;
  tbc_amount: bigint;
  ft_lp_partialhash: string;
  ft_a_partialhash: string;
  ft_a_contractTxid: string;
  service_fee_rate: number;
  service_provider: string;
  poolnft_code: string;
  pool_version: number;
  currentContractTxid: string;
  currentContractVout: number;
  currentContractSatoshi: number;
}

export interface poolNFTDifference {
  ft_lp_difference: bigint;
  ft_a_difference: bigint;
  tbc_amount_difference: bigint;
}

export class poolNFT {
  ft_lp_amount: bigint;
  ft_a_amount: bigint;
  tbc_amount: bigint;
  ft_lp_partialhash: string;
  ft_a_partialhash: string;
  ft_a_contractTxid: string;
  poolnft_code: string;
  contractTxid: string;
  private ft_a_number: number;
  network: "testnet" | "mainnet" | string;

  constructor(config?: {
    txidOrParams?:
      | string
      | { ftContractTxid: string; tbc_amount: number; ft_a: number };
    network?: "testnet" | "mainnet" | string;
  });
  initCreate(ftContractTxid?: string): Promise<void>;
  initfromContractId(): Promise<void>;
  createPoolNFT(
    privateKey_from: PrivateKey,
    utxo: Transaction.IUnspentOutput,
  ): Promise<string[]>;
  createPoolNftWithLock(
    privateKey_from: PrivateKey,
    utxo: Transaction.IUnspentOutput,
  ): Promise<string[]>;
  initPoolNFT(
    privateKey_from: PrivateKey,
    address_to: string,
    utxo: Transaction.IUnspentOutput,
    tbc_amount?: number,
    ft_a?: number,
  ): Promise<string>;
  increaseLP(
    privateKey_from: PrivateKey,
    address_to: string,
    utxo: Transaction.IUnspentOutput,
    amount_tbc: number,
  ): Promise<string>;
  consumeLP(
    privateKey_from: PrivateKey,
    address_to: string,
    utxo: Transaction.IUnspentOutput,
    amount_lp: number,
  ): Promise<string>;
  swaptoToken(
    privateKey_from: PrivateKey,
    address_to: string,
    utxo: Transaction.IUnspentOutput,
    amount_token: number,
  ): Promise<string>;
  swaptoToken_baseTBC(
    privateKey_from: PrivateKey,
    address_to: string,
    utxo: Transaction.IUnspentOutput,
    amount_tbc: number,
  ): Promise<string>;
  swaptoTBC(
    privateKey_from: PrivateKey,
    address_to: string,
    utxo: Transaction.IUnspentOutput,
    amount_tbc: number,
  ): Promise<string>;
  swaptoTBC_baseToken(
    privateKey_from: PrivateKey,
    address_to: string,
    utxo: Transaction.IUnspentOutput,
    amount_token: number,
  ): Promise<string>;
  fetchPoolNFTInfo(contractTxid: string): Promise<PoolNFTInfo>;
  fetchPoolNftUTXO(contractTxid: string): Promise<Transaction.IUnspentOutput>;
  fetchFtlpUTXO(
    ftlpCode: string,
    amount: bigint,
  ): Promise<Transaction.IUnspentOutput>;
  mergeFTLP(
    privateKey_from: PrivateKey,
    utxo: Transaction.IUnspentOutput,
  ): Promise<boolean | string>;
  mergeFTinPool(
    privateKey_from: PrivateKey,
    utxo: Transaction.IUnspentOutput,
  ): Promise<boolean | string>;
  updatePoolNFT(
    increment: number,
    ft_a_decimal: number,
    option: 1 | 2 | 3,
  ): poolNFTDifference;
  getPoolNFTunlock(
    privateKey_from: PrivateKey,
    currentTX: Transaction,
    currentUnlockIndex: number,
    preTxId: string,
    preVout: number,
    option: 1 | 2 | 3 | 4,
    swapOption?: 1 | 2,
  ): Promise<Script>;
  getPoolNftCode(txid: string, vout: number): Script;
  getPoolNftCodeWithLock(txid: string, vout: number): Script;
  getFTLPcode(
    poolNftCodeHash: string,
    address: string,
    tapeSize: number,
  ): Script;
}

export type PoolLpPlan = 1 | 2 | 3 | 4 | 5 | 6;
export type PoolServiceFeeRate = 35 | 330 | 135 | 335 | 535;

export class poolNFT2 {
  ft_lp_amount: bigint;
  ft_a_amount: bigint;
  tbc_amount: bigint;
  ft_lp_partialhash: string;
  ft_a_partialhash: string;
  ft_a_contractTxid: string;
  poolnft_code: string;
  pool_version: number;
  contractTxid: string;
  network: "testnet" | "mainnet" | string;
  service_fee_rate: number;
  service_provider: string;
  lp_plan: number;
  with_lock: boolean;
  with_lock_time: boolean;

  constructor(config?: {
    txid?: string;
    network?: "testnet" | "mainnet" | string;
  });
  initCreate(ftContractTxid: string): void;
  initfromContractId(): Promise<void>;
  createPoolNFT(
    privateKey_from: PrivateKey,
    utxo: Transaction.IUnspentOutput,
    tag: string,
    serviceFeeRate?: PoolServiceFeeRate,
    lpPlan?: PoolLpPlan,
    withLockTime?: boolean,
  ): Promise<string[]>;
  createPoolNftWithLock(
    privateKey_from: PrivateKey,
    utxo: Transaction.IUnspentOutput,
    tag: string,
    lpCostAddress: Address | string,
    lpCostTBC: number,
    pubKeyLock: string[],
    serviceFeeRate?: PoolServiceFeeRate,
    lpPlan?: PoolLpPlan,
    withLockTime?: boolean,
  ): Promise<string[]>;
  initPoolNFT(
    privateKey_from: PrivateKey,
    address_to: string,
    utxo: Transaction.IUnspentOutput,
    tbc_amount: number | string,
    ft_a: number | string,
    lock_time?: number,
  ): Promise<string>;
  initPoolNFTWithLockTime(
    privateKey_from: PrivateKey,
    address_to: string,
    utxo: Transaction.IUnspentOutput,
    tbc_amount: number,
    ft_a: number,
    lock_time: number,
  ): Promise<string>;
  increaseLP(
    privateKey_from: PrivateKey,
    address_to: string,
    utxo: Transaction.IUnspentOutput,
    amount_tbc: number | string,
    lock_time?: number,
  ): Promise<string>;
  increaseLpWithLockTime(
    privateKey_from: PrivateKey,
    address_to: string,
    utxo: Transaction.IUnspentOutput,
    amount_tbc: number,
    lock_time: number,
  ): Promise<string>;
  consumeLP(
    privateKey_from: PrivateKey,
    address_to: string,
    utxo: Transaction.IUnspentOutput,
    amount_lp: number | string,
    lock_time?: number,
  ): Promise<string>;
  consumeLpWithLockTime(
    privateKey_from: PrivateKey,
    address_to: string,
    utxo: Transaction.IUnspentOutput,
    amount_lp: number,
  ): Promise<string>;
  swaptoToken_baseTBC(
    privateKey_from: PrivateKey,
    address_to: string,
    utxo: Transaction.IUnspentOutput,
    amount_tbc: number | string,
    lpPlan?: PoolLpPlan,
  ): Promise<string>;
  swaptoTBC_baseToken(
    privateKey_from: PrivateKey,
    address_to: string,
    utxo: Transaction.IUnspentOutput,
    amount_token: number | string,
    lpPlan?: PoolLpPlan,
  ): Promise<string>;
  swaptoTBC_baseToken_local(
    privateKey_from: PrivateKey,
    address_to: string,
    ftutxo: Transaction.IUnspentOutput,
    ftPreTX: Transaction[],
    ftPrePreTxData: string[],
    amount_token: number | string,
    lpPlan?: PoolLpPlan,
    utxo?: Transaction.IUnspentOutput,
  ): Promise<string>;
  fetchPoolNftInfo(contractTxid: string): Promise<PoolNFTInfo>;
  fetchPoolNftUTXO(contractTxid: string): Promise<Transaction.IUnspentOutput>;
  fetchFtlpUTXO(
    address: string,
    amount: bigint,
  ): Promise<Transaction.IUnspentOutput>;
  fetchFtlpBalance(address: string): Promise<bigint>;
  fetchFtlpUTXOList(address: string): Promise<Transaction.IUnspentOutput[]>;
  fetchFtlpLockTime(
    address: string,
  ): Promise<Array<{ ftBalance: bigint; lockTime: number }>>;
  getLpIncome(address: string, recordData: bigint): Promise<bigint>;
  mergeFTLP(
    privateKey_from: PrivateKey,
    utxo: Transaction.IUnspentOutput,
    lock_time?: number,
  ): Promise<boolean | string>;
  burnFTLP(
    privateKey_from: PrivateKey,
    utxo: Transaction.IUnspentOutput,
  ): Promise<string>;
  unlockFTLP(
    privateKey_from: PrivateKey,
    utxo: Transaction.IUnspentOutput,
    lock_time?: number,
  ): Promise<string>;
  mergeFTinPool(
    privateKey_from: PrivateKey,
    utxo: Transaction.IUnspentOutput,
    times?: number,
  ): Promise<Array<{ txraw: string }>>;
  updatePoolNFT(
    increment: number | string,
    ft_a_decimal: number,
    option: 1 | 2 | 3,
  ): poolNFTDifference;
  getPoolNftUnlockOffLine(
    privateKey_from: PrivateKey,
    currentTX: Transaction,
    currentUnlockIndex: number,
    poolnftPreTX: Transaction,
    poolnftPrePreTX: Transaction,
    inputsTXs: Transaction[],
    withLock: 0 | 1,
    option: 1 | 2 | 3 | 4,
    swapOption?: 1 | 2,
  ): Script;
  getPoolNftUnlock(
    privateKey_from: PrivateKey,
    currentTX: Transaction,
    currentUnlockIndex: number,
    preTxId: string,
    preVout: number,
    withLock: 0 | 1,
    option: 1 | 2 | 3 | 4,
    swapOption?: 1 | 2,
  ): Promise<Script>;
  getPoolNftExtraInfo(): Promise<{
    serviceFeeRate: number | null;
    lpPlan: number | null;
    withLock: boolean | null;
    withLockTime: boolean | null;
  }>;
  getPoolNftCode(
    txid: string,
    vout: number,
    lpPlan: PoolLpPlan,
    ftVersion: 1 | 2 | 3 | 4,
    tag?: string,
    isCoin?: boolean,
  ): Script;
  getPoolNftCodeWithLock(
    txid: string,
    vout: number,
    lpPlan: PoolLpPlan,
    lpCostAddress: Address | string,
    lpCostTBC: number,
    pubKeyLock: string[],
    ftVersion: 1 | 2 | 3 | 4,
    tag?: string,
    isCoin?: boolean,
  ): Script;
  getFtlpCode(
    poolNftCodeHash: string,
    address: string,
    tapeSize: number,
    isCoin: boolean,
    ftVersion?: 1 | 2 | 3 | 4,
  ): Script;
  getFtlpCodeWithLockTime(
    poolNftCodeHash: string,
    address: string,
    tapeSize: number,
    isCoin: boolean,
    ftVersion?: 1 | 2 | 3 | 4,
  ): Script;
}

export interface MultiSigTxRaw {
  txraw: string;
  amounts: number[];
}

export class MultiSig {
  static createMultiSigWallet(
    address_from: string,
    pubKeys: string[],
    signatureCount: number,
    publicKeyCount: number,
    tbc_amount: number,
    utxos: Transaction.IUnspentOutput[],
    privateKey: PrivateKey,
  ): string;
  static p2pkhToMultiSig_sendTBC(
    address_from: string,
    address_to: string,
    amount_tbc: number,
    utxos: Transaction.IUnspentOutput[],
    privateKey: PrivateKey,
  ): string;
  static buildMultiSigTransaction_sendTBC(
    address_from: string,
    address_to: string,
    amount_tbc: number,
    utxos: Transaction.IUnspentOutput[],
  ): MultiSigTxRaw;
  static signMultiSigTransaction_sendTBC(
    address_from: string,
    multiSigTxraw: MultiSigTxRaw,
    privateKey: PrivateKey,
  ): string[];
  static batchSignMultiSigTransaction_sendTBC(
    address_from: string,
    multiSigTxraws: MultiSigTxRaw[],
    privateKey: PrivateKey,
  ): string[][];
  static finishMultiSigTransaction_sendTBC(
    txraw: string,
    sigs: string[][],
    pubKeys: string[],
  ): string;
  static batchFinishMultiSigTransaction_sendTBC(
    txraws: string[],
    sigs: string[][][],
    pubKeys: string[],
  ): string[];
  static p2pkhToMultiSig_transferFT(
    address_from: string,
    address_to: string,
    ft: FT,
    ft_amount: number | string,
    utxo: Transaction.IUnspentOutput,
    ftutxos: Transaction.IUnspentOutput[],
    preTXs: Transaction[],
    prepreTxDatas: string[],
    privateKey: PrivateKey,
    tbc_amount?: number,
  ): string;
  static buildMultiSigTransaction_transferFT(
    address_from: string,
    address_to: string,
    ft: any,
    ft_amount: number | string,
    utxo: Transaction.IUnspentOutput,
    ftutxos: Transaction.IUnspentOutput[],
    preTXs: Transaction[],
    prepreTxDatas: string[],
    contractTX: Transaction,
    privateKey: PrivateKey,
  ): MultiSigTxRaw;
  static signMultiSigTransaction_transferFT(
    address_from: string,
    multiSigTxraw: MultiSigTxRaw,
    privateKey: PrivateKey,
  ): string[];
  static batchSignMultiSigTransaction_transferFT(
    multiSig_address: string,
    multiSigTxraws: MultiSigTxRaw[],
    privateKey: PrivateKey,
  ): string[][];
  static finishMultiSigTransaction_transferFT(
    txraw: string,
    sigs: string[][],
    pubKeys: string[],
  ): string;
  static batchFinishMultiSigTransaction_transferFT(
    txraws: string[],
    sigs: string[][][],
    pubKeys: string[],
  ): string[];
  static getMultiSigAddress(
    pubKeys: string[],
    signatureCount: number,
    publicKeyCount: number,
  ): string;
  static getSignatureAndPublicKeyCount(address: string): {
    signatureCount: number;
    publicKeyCount: number;
  };
  static verifyMultiSigAddress(pubKeys: string[], address: string): boolean;
  static validateMultiSigAddress(address: string): boolean;
  static getMultiSigLockScript(address: string): string;
  static getCombineHash(address: string): string;
}

export class TBCTimelock {
  static getTimelockCode(address: string, lockTime: number): Script;
  static freezeTbc(
    address: string,
    tbcNumber: number,
    lockTime: number,
    utxos: Transaction.IUnspentOutput[],
  ): string;
  static unfreezeTbc(
    address: string,
    utxos: Transaction.IUnspentOutput[],
    network?: "testnet" | "mainnet" | string,
  ): Promise<string>;
  static freezeTbcWithSign(
    privateKey: PrivateKey,
    tbcNumber: number,
    lockTime: number,
    utxos: Transaction.IUnspentOutput[],
  ): string;
  static unfreezeTbcWithSign(
    privateKey: PrivateKey,
    utxos: Transaction.IUnspentOutput[],
    network?: "testnet" | "mainnet" | string,
  ): Promise<string>;
  static fetchTbcLockTime(utxo: Transaction.IUnspentOutput): number;
}

/** Legacy proof hex, or authenticated ancestor transactions for TBC20 Standard / TBC20 Stablecoin. */
export type TBCLOPTokenProof = string | ReadonlyMap<string, Transaction> | readonly Transaction[] | ((txid: string) => Transaction | undefined);

export class TBCLOP {
  static placeHolderP2pkhOutput(): Script;
  type: "buy" | "sell";
  holdAddress: string;
  saleVolume: bigint;
  feeRate: bigint;
  unitPrice: bigint;
  saleVolumeNumber: number;
  feeRateNumber: number;
  unitPriceNumber: number;
  ftAContractPartialHash: string;
  ftAContractId: string;
  ftBContractPartialHash: string;
  ftBContractId: string;
  contractVersion: number;

  buildSellOrderTx(
    holdAddress: string,
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftId: string,
    ftCodeScript: string,
    utxos: Transaction.IUnspentOutput[],
  ): string;
  buildCancelSellOrderTx(
    sellutxo: Transaction.IUnspentOutput,
    utxos: Transaction.IUnspentOutput[],
  ): string;
  fillSigsSellOrder(
    sellOrderTxRaw: string,
    sigs: string[],
    publicKey: string,
    type: "make" | "cancel",
  ): string;
  buildBuyOrderTx(
    holdAddress: string,
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftId: string,
    utxos: Transaction.IUnspentOutput[],
    ftutxos: Transaction.IUnspentOutput[],
    preTXs: Transaction[],
  ): string;
  buildCancelBuyOrderTx(
    buyutxo: Transaction.IUnspentOutput,
    ftutxo: Transaction.IUnspentOutput,
    ftPreTX: Transaction,
    utxos: Transaction.IUnspentOutput[],
  ): string;
  fillSigsMakeBuyOrder(
    buyOrderTxRaw: string,
    sigs: string[],
    publicKey: string,
    preTXs: Transaction[],
    prepreTxData: TBCLOPTokenProof[],
  ): string;
  fillSigsCancelBuyOrder(
    buyOrderTxRaw: string,
    sigs: string[],
    publicKey: string,
    buyPreTX: Transaction,
    ftPreTX: Transaction,
    ftPrePreTxData: TBCLOPTokenProof,
  ): string;
  matchOrder(
    privateKey: PrivateKey,
    buyutxo: Transaction.IUnspentOutput,
    buyPreTX: Transaction,
    ftutxo: Transaction.IUnspentOutput,
    ftPreTX: Transaction,
    ftPrePreTxData: TBCLOPTokenProof,
    sellutxo: Transaction.IUnspentOutput,
    sellPreTX: Transaction,
    utxos: Transaction.IUnspentOutput[],
    ftFeeAddress: string,
    tbcFeeAddress: string,
  ): string;
  makeSellOrderWithPrivateKeyOnline(
    privateKey: PrivateKey,
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftId: string,
  ): Promise<string>;
  cancelSellOrderWithPrivateKeyOnline(
    privateKey: PrivateKey,
    sellutxo: Transaction.IUnspentOutput,
  ): Promise<string>;
  makeBuyOrderWithPrivateKeyOnline(
    privateKey: PrivateKey,
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftId: string,
  ): Promise<string>;
  cancelBuyOrderWithPrivateKeyOnline(
    privateKey: PrivateKey,
    buyutxo: Transaction.IUnspentOutput,
  ): Promise<string>;
  matchOrderOnline(
    privateKey: PrivateKey,
    buyutxo: Transaction.IUnspentOutput,
    sellutxo: Transaction.IUnspentOutput,
    ftFeeAddress: string,
    tbcFeeAddress: string,
  ): Promise<string>;
  buildTokenSellOrderTx(
    holdAddress: string,
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftAId: string,
    ftBId: string,
    ftaCodeScript: string,
    ftbCodeScript: string,
    utxos: Transaction.IUnspentOutput[],
    ftutxos: Transaction.IUnspentOutput[],
    preTXs: Transaction[],
  ): string;
  buildTokenBuyOrderTx(
    holdAddress: string,
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftAId: string,
    ftBId: string,
    ftaCodeScript: string,
    ftbCodeScript: string,
    utxos: Transaction.IUnspentOutput[],
    ftutxos: Transaction.IUnspentOutput[],
    preTXs: Transaction[],
  ): string;
  fillSigsMakeTokenSellOrder(
    sellOrderTxRaw: string,
    sigs: string[],
    publicKey: string,
    preTXs: Transaction[],
    prepreTxData: TBCLOPTokenProof[],
  ): string;
  fillSigsMakeTokenBuyOrder(
    buyOrderTxRaw: string,
    sigs: string[],
    publicKey: string,
    preTXs: Transaction[],
    prepreTxData: TBCLOPTokenProof[],
  ): string;
  buildCancelTokenSellOrderTx(
    sellutxo: Transaction.IUnspentOutput,
    ftutxo: Transaction.IUnspentOutput,
    ftPreTX: Transaction,
    utxos: Transaction.IUnspentOutput[],
  ): string;
  buildCancelTokenBuyOrderTx(
    buyutxo: Transaction.IUnspentOutput,
    ftutxo: Transaction.IUnspentOutput,
    ftPreTX: Transaction,
    utxos: Transaction.IUnspentOutput[],
  ): string;
  fillSigsCancelTokenSellOrder(
    cancelSellOrderTxRaw: string,
    sigs: string[],
    publicKey: string,
    sellPreTX: Transaction,
    ftPreTX: Transaction,
    ftPrePreTxData: TBCLOPTokenProof,
  ): string;
  fillSigsCancelTokenBuyOrder(
    cancelBuyOrderTxRaw: string,
    sigs: string[],
    publicKey: string,
    buyPreTX: Transaction,
    ftPreTX: Transaction,
    ftPrePreTxData: TBCLOPTokenProof,
  ): string;
  matchTokenOrder(
    privateKey: PrivateKey,
    buyutxo: Transaction.IUnspentOutput,
    buyPreTX: Transaction,
    buyFtUtxo: Transaction.IUnspentOutput,
    buyFtPreTX: Transaction,
    buyFtPrePreTxData: TBCLOPTokenProof,
    sellutxo: Transaction.IUnspentOutput,
    sellPreTX: Transaction,
    sellFtUtxo: Transaction.IUnspentOutput,
    sellFtPreTX: Transaction,
    sellFtPrePreTxData: TBCLOPTokenProof,
    utxos: Transaction.IUnspentOutput[],
    ftaFeeAddress: string,
    ftbFeeAddress: string,
  ): string;
  makeTokenSellOrderWithPrivateKeyOnline(
    privateKey: PrivateKey,
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftAId: string,
    ftBId: string,
  ): Promise<string>;
  cancelTokenSellOrderWithPrivateKeyOnline(
    privateKey: PrivateKey,
    sellutxo: Transaction.IUnspentOutput,
  ): Promise<string>;
  makeTokenBuyOrderWithPrivateKeyOnline(
    privateKey: PrivateKey,
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftAId: string,
    ftBId: string,
  ): Promise<string>;
  cancelTokenBuyOrderWithPrivateKeyOnline(
    privateKey: PrivateKey,
    buyutxo: Transaction.IUnspentOutput,
  ): Promise<string>;
  matchTokenOrderOnline(
    privateKey: PrivateKey,
    buyutxo: Transaction.IUnspentOutput,
    sellutxo: Transaction.IUnspentOutput,
    ftaFeeAddress: string,
    ftbFeeAddress: string,
  ): Promise<string>;
  getOrderUnlock(
    currentTX: Transaction,
    preTX: Transaction,
    preTxVout: number,
  ): Script;
  getTokenOrderUnlock(
    currentTX: Transaction,
    preTX: Transaction,
    preTxVout: number,
  ): Script;
  getSellOrderCode(
    isCoin: boolean,
    taxAddress: string,
    ftCodeSize?: string,
  ): Script;
  getBuyOrderCode(
    isCoin: boolean,
    taxAddress: string,
    ftCodeSize?: string,
  ): Script;
  getTokenSellOrderCode(taxAddress: string, modernA?: boolean, modernB?: boolean): Script;
  getTokenBuyOrderCode(taxAddress: string, modernA?: boolean, modernB?: boolean): Script;
  buildOrderData(): Script;
  buildTokenOrderData(): Script;
  static updateSaleVolume(codeScript: string, newSaleVolume: bigint): Script;
  static updateTokenSaleVolume(
    codeScript: string,
    newSaleVolume: bigint,
  ): Script;
  static getOrderData(codeScript: string): {
    holdAddress: string;
    saleVolume: bigint;
    ftPartialHash: string;
    feeRate: bigint;
    unitPrice: bigint;
    ftId: string;
  };
  static getTokenOrderData(codeScript: string): {
    holdAddress: string;
    saleVolume: bigint;
    ftAPartialHash: string;
    ftBPartialHash: string;
    feeRate: bigint;
    unitPrice: bigint;
    ftAId: string;
    ftBId: string;
  };
}

/** Legacy proof hex or authenticated ancestor transactions for modern tokens. */
export type TBCHTLCTokenProof = string | TBC20StandardAncestorResolver;

export namespace TBCHTLC {
  export function deployTbcHtlc(
    sender: string,
    receiver: string,
    hashlock: string,
    timelock: number,
    amount: number | string,
    utxo: Transaction.IUnspentOutput,
  ): string;

  export function withdraw(
    receiver: string,
    htlcUtxo: Transaction.IUnspentOutput,
  ): string;

  export function refund(
    sender: string,
    htlcUtxo: Transaction.IUnspentOutput,
    timelock: number,
  ): string;

  export function fillSigDeploy(
    deployTbcHtlcTxRaw: string,
    sig: string,
    publicKey: string,
  ): string;

  export function fillSigWithdraw(
    withdrawTxRaw: string,
    secret: string,
    sig: string,
    publicKey: string,
  ): string;

  export function fillSigRefund(
    refundTxRaw: string,
    sig: string,
    publicKey: string,
  ): string;

  export function deployTbcHtlcWithSign(
    sender: string,
    receiver: string,
    hashlock: string,
    timelock: number,
    amount: number | string,
    utxo: Transaction.IUnspentOutput,
    privateKey: string,
  ): string;

  export function withdrawWithSign(
    privateKey: string,
    receiver: string,
    htlcUtxo: Transaction.IUnspentOutput,
    secret: string,
  ): string;

  export function refundWithSign(
    sender: string,
    htlcUtxo: Transaction.IUnspentOutput,
    privateKey: string,
    timelock: number,
  ): string;

  export function deployTbcHtlcToken(
    sender: string,
    receiver: string,
    hashlock: string,
    timelock: number,
    ftAmount: number | string,
    ftutxos: Transaction.IUnspentOutput[],
    utxo: Transaction.IUnspentOutput,
    preTX: Transaction[],
    prepreTxData: TBCHTLCTokenProof[],
  ): string;

  export function fillSigDeployTbcHtlcToken(
    deployRaw: string,
    sigs: string[],
    publicKey: string,
    preTX: Transaction[],
    prepreTxData: TBCHTLCTokenProof[],
  ): string;

  export function withdrawTbcHtlcToken(
    receiver: string,
    htlcUtxo: Transaction.IUnspentOutput,
    ftutxo: Transaction.IUnspentOutput,
    deployTX: Transaction,
    utxo: Transaction.IUnspentOutput,
  ): string;

  export function fillSigWithdrawTbcHtlcToken(
    withdrawRaw: string,
    sigs: string[],
    publicKey: string,
    secret: string,
    deployTX: Transaction,
    prepreTxData: TBCHTLCTokenProof,
  ): string;

  export function refundTbcHtlcToken(
    sender: string,
    htlcUtxo: Transaction.IUnspentOutput,
    ftutxo: Transaction.IUnspentOutput,
    deployTX: Transaction,
    utxo: Transaction.IUnspentOutput,
    timelock: number,
  ): string;

  export function fillSigRefundTbcHtlcToken(
    refundRaw: string,
    sigs: string[],
    publicKey: string,
    deployTX: Transaction,
    prepreTxData: TBCHTLCTokenProof,
  ): string;

  export function deployTbcHtlcTokenWithSign(
    sender: string,
    receiver: string,
    hashlock: string,
    timelock: number,
    ftAmount: number | string,
    ftutxos: Transaction.IUnspentOutput[],
    utxo: Transaction.IUnspentOutput,
    preTX: Transaction[],
    prepreTxData: TBCHTLCTokenProof[],
    privateKey: string,
  ): string;

  export function withdrawTbcHtlcTokenWithSign(
    privateKey: string,
    receiver: string,
    htlcUtxo: Transaction.IUnspentOutput,
    ftutxo: Transaction.IUnspentOutput,
    deployTX: Transaction,
    prepreTxData: TBCHTLCTokenProof,
    utxo: Transaction.IUnspentOutput,
    secret: string,
  ): string;

  export function refundTbcHtlcTokenWithSign(
    privateKey: string,
    sender: string,
    htlcUtxo: Transaction.IUnspentOutput,
    ftutxo: Transaction.IUnspentOutput,
    deployTX: Transaction,
    prepreTxData: TBCHTLCTokenProof,
    utxo: Transaction.IUnspentOutput,
    timelock: number,
  ): string;
}

export interface coinNftData {
  nftName: string;
  nftSymbol: string;
  description: string;
  coinDecimal: number;
  coinTotalSupply: string;
}

/**
 * A sighash that must be signed externally by the MuSig2 admin ceremony.
 * `sighash` is the 32-byte BIP340 message (sha256sha256(preimage)).
 */
export interface AdminSighash {
  inputIndex: number;
  sighash: Buffer;
}

/**
 * Returned by admin-gated `TBC20Stablecoin` and `stableCoin` methods. Callers run an external
 * MuSig2 ceremony to produce one 64-byte Schnorr signature per entry in
 * `sighashes`, then call `finalize(sigs)` to get the serialized tx(s).
 */
export interface AdminPrepared<R> {
  tx: Transaction;
  sighashes: AdminSighash[];
  finalize: (schnorrSigs64: Buffer[]) => R;
}

/** TBC20 Stablecoin definition. Decimal amounts should be passed as exact strings. */
export interface TBC20StablecoinDefinition {
  name: string;
  symbol: string;
  amount: number | string;
  /** Integer from 0 to 18. */
  decimal: number;
}

export interface CoinInfo {
  codeScript: string;
  tapeScript: string;
  /** Cumulative supply in raw minimum units, normally obtained from the issuance NFT. */
  totalSupply: bigint | string;
  decimal: number;
  name: string;
  symbol: string;
  contractTxid?: string;
}

/**
 * Current TBC20 Stablecoin inputs accept a shared transaction resolver or one resolver per input.
 * Legacy hex proof strings belong to stableCoin and are not accepted by TBC20Stablecoin.
 */
export type TBC20StablecoinAncestors =
  | TBC20StandardAncestorResolver
  | readonly TBC20StandardAncestorResolver[];

export type TBC20StablecoinScriptLike = Script | Buffer | string;
export interface TBC20StablecoinCodeOptions {
  /** SHA256 of the complete issuance NFT Code at ancestor vout 0. */
  coinNftCodeHash: Buffer;
  /** HASH160 of the exact signing public key bytes; 32-byte x-only for MuSig2. */
  adminPubKeyHash: Buffer;
  /** Integer from 66 to 127. */
  tapeSize: number;
  /** 20-byte HASH160 followed by 00 (address) or 01 (contract). */
  controller: Buffer;
}
export interface TBC20StablecoinCodeDescriptor extends TBC20StablecoinCodeOptions {
  identity: Buffer;
  codeSize: number;
}
export interface TBC20StablecoinTapeOptions {
  /** Exactly six nonnegative bigint values, each at most 2^63 - 1. */
  amounts: readonly bigint[];
  tapeSize: number;
  /** Unsigned uint32: zero, block height or Unix timestamp. */
  lockTime: number;
  /** Complete push-only script fragment; remaining capacity is filled with OP_0. */
  metadata?: Buffer;
}
export interface TBC20StablecoinTapeDescriptor {
  amounts: readonly bigint[];
  balance: bigint;
  tapeSize: number;
  lockTime: number;
  /** Includes OP_0 padding. */
  metadata: Buffer;
}

/** Code/Tape codec tools, separate from the TBC20 Stablecoin business class; never sign or broadcast. */
export class TBC20StablecoinCodec {
  static readonly codeSatoshis: 500;
  static readonly codeSize: 2981;
  static readonly partialOffset: 2944;
  static readonly maxSlotAmount: bigint;
  static readonly lockTimeThreshold: 500000000;
  static instantiateCode(options: TBC20StablecoinCodeOptions): Script;
  static parseCode(value: TBC20StablecoinScriptLike): TBC20StablecoinCodeDescriptor;
  static validateCode(value: TBC20StablecoinScriptLike, expected?: Partial<TBC20StablecoinCodeOptions>): TBC20StablecoinCodeDescriptor;
  static getCodeIdentity(value: TBC20StablecoinScriptLike): Buffer;
  static replaceController(value: TBC20StablecoinScriptLike, controller: Buffer): Script;
  static buildTape(options: TBC20StablecoinTapeOptions): Script;
  static parseTape(value: TBC20StablecoinScriptLike, profile?: { tapeSize?: number }): TBC20StablecoinTapeDescriptor;
  static replaceTapeAmounts(value: TBC20StablecoinScriptLike, amounts: readonly bigint[]): Script;
  static setLockTime(value: TBC20StablecoinScriptLike, lockTime: number): Script;
  /** Rejects mixed nonzero block-height and timestamp locks. */
  static getRequiredLockTime(lockTimes: readonly number[]): number;
  /** Checks script lock requirements; transaction finality needs current chain state. */
  static verifyInputLock(
    tx: Transaction,
    inputIndex: number,
    tape: TBC20StablecoinScriptLike,
    profile?: { tapeSize?: number },
    administrator?: boolean,
  ): void;
}

export interface TBC20StablecoinUnlockCommonOptions {
  currentTx: Transaction;
  inputIndex: number;
  preTx: Transaction;
  preTxVout: number;
  /** Ordered groups must cover every physical output exactly once. */
  outputGroups: readonly { codeVout: number; tapeVout?: number }[];
  ancestorTransactions: TBC20StandardAncestorResolver;
  contractController?: {
    /** Transaction that created the controlling contract UTXO. */
    transaction: Transaction;
    /** Current vin spending that controlling contract UTXO. */
    currentInputIndex: number;
  };
}
export interface TBC20StablecoinUnlockWithPrivateKeyOptions extends TBC20StablecoinUnlockCommonOptions {
  privateKey: PrivateKey;
}
export interface TBC20StablecoinUnlockWithSignatureOptions extends TBC20StablecoinUnlockCommonOptions {
  /** Includes the SIGHASH_ALL | SIGHASH_FORKID byte (0x41). */
  signature: string | Buffer;
  publicKey: string | Buffer | import("tbc-lib-js").PublicKey;
}

/** FT-based stablecoin API with FTape metadata and coinNft issuance. */
export class stableCoin extends FT {
  constructor(
    txidOrParams:
      | string
      | { name: string; symbol: string; amount: number; decimal: number },
  );
  /** Restores FT-based stablecoin metadata and validates its Code template. */
  initialize(info: CoinInfo): void;
  createCoin(
    aggPubkey32: Buffer,
    feePrivateKey: PrivateKey,
    address_to: string,
    utxo: Transaction.IUnspentOutput,
    utxoTX: Transaction,
    mintMessage?: string,
  ): AdminPrepared<string[]>;
  mintCoin(
    aggPubkey32: Buffer,
    feePrivateKey: PrivateKey,
    address_to: string,
    mintAmount: number | string,
    utxo: Transaction.IUnspentOutput,
    nftPreTX: Transaction,
    nftPrePreTX: Transaction,
    mintMessage?: string,
  ): AdminPrepared<string>;
  transfer(
    privateKey_from: PrivateKey,
    address_to: string,
    ft_amount: number | string,
    ftutxo_a: Transaction.IUnspentOutput[],
    utxo: Transaction.IUnspentOutput,
    preTX: Transaction[],
    prepreTxData: string[],
    tbc_amount?: number | string,
  ): string;
  batchTransfer(
    privateKey_from: PrivateKey,
    receivers: { address: string; amount: number | string }[],
    ftutxo: Transaction.IUnspentOutput[],
    utxo: Transaction.IUnspentOutput,
    preTX: Transaction[],
    prepreTxData: string[],
  ): Array<{ txraw: string }>;
  mergeCoin(
    privateKey_from: PrivateKey,
    ftutxo: Transaction.IUnspentOutput[],
    utxo: Transaction.IUnspentOutput,
    preTX: Transaction[],
    prepreTxData: string[],
    localTX?: Transaction[],
  ): Array<{ txraw: string }>;
  freezeCoinUTXO(
    aggPubkey32: Buffer,
    feePrivateKey: PrivateKey,
    lock_time: number,
    ftutxo: Transaction.IUnspentOutput[],
    utxo: Transaction.IUnspentOutput,
    preTX: Transaction[],
    prepreTxData: string[],
  ): AdminPrepared<string>;
  unfreezeCoinUTXO(
    aggPubkey32: Buffer,
    feePrivateKey: PrivateKey,
    ftutxo: Transaction.IUnspentOutput[],
    utxo: Transaction.IUnspentOutput,
    preTX: Transaction[],
    prepreTxData: string[],
  ): AdminPrepared<string>;
  static buildCoinNftOutput(
    nftCodeScript: Script,
    nftHoldScript: Script,
    nftTapeScript: Script,
  ): Transaction.Output[];
  static buildCoinNftTX(
    feePrivateKey: PrivateKey,
    adminPubHashHex: string,
    utxo: Transaction.IUnspentOutput,
    data: coinNftData,
  ): Transaction;
  static getCoinMintCode(
    adminPubHashHex: string,
    receiveAddress: string,
    codeHash: string,
    tapeSize: number,
  ): Script;
  static setLockTimeInTape(tapeScript: Script, lockTime: number): Script;
  static getLockTimeFromTape(tapeScript: Script): number;
  static getAddressFromCode(codeScript: string): {
    address: string;
    type: "address" | "contract";
  };
}

/** TBC20 Stablecoin business API with TBC721 Standard issuance certificates. */
export class TBC20Stablecoin {
  name: string;
  symbol: string;
  decimal: number;
  /** Cumulative supply in raw minimum units. */
  totalSupply: bigint;
  codeScript: string;
  tapeScript: string;
  /** First TBC20 Stablecoin mint transaction ID; unchanged by subsequent issuance. */
  contractTxid: string;
  constructor(
    txidOrParams:
      | string
      | TBC20StablecoinDefinition,
  );
  /** Restores trusted TBC20 Stablecoin Code/Tape only. totalSupply is in raw minimum units. */
  initialize(info: CoinInfo): void;
  createCoin(
    aggPubkey32: Buffer,
    feePrivateKey: PrivateKey,
    recipientAddress: string,
    utxo: Transaction.IUnspentOutput,
    utxoTX: Transaction,
    mintMessage?: string,
  ): AdminPrepared<string[]>;
  mintCoin(
    aggPubkey32: Buffer,
    feePrivateKey: PrivateKey,
    recipientAddress: string,
    mintAmount: number | string,
    utxo: Transaction.IUnspentOutput,
    nftPreTX: Transaction,
    nftPrePreTX: Transaction,
    mintMessage?: string,
  ): AdminPrepared<string>;
  transfer(
    privateKey: PrivateKey,
    recipientAddress: string,
    amount: number | string,
    tokenUtxos: Transaction.IUnspentOutput[],
    utxo: Transaction.IUnspentOutput,
    preTX: Transaction[],
    ancestors: TBC20StablecoinAncestors,
    tbcAmount?: number | string,
  ): string;
  batchTransfer(
    privateKey: PrivateKey,
    receivers: { address: string; amount: number | string }[],
    tokenUtxos: Transaction.IUnspentOutput[],
    utxo: Transaction.IUnspentOutput,
    preTX: Transaction[],
    ancestors: TBC20StablecoinAncestors,
  ): Array<{ txraw: string }>;
  transferWithAdditionalInfo(
    privateKey: PrivateKey,
    recipient: string,
    humanAmount: number | string,
    tokenUTXOs: Transaction.IUnspentOutput[],
    feeUTXO: Transaction.IUnspentOutput,
    parentTxs: Transaction[],
    ancestors: TBC20StablecoinAncestors,
    additionalInfo: Buffer,
  ): string;
  /** Alias for mergeCoin; supports the current TBC20 Stablecoin ancestry format. */
  mergeFt(
    privateKey: PrivateKey,
    tokenUTXOs: Transaction.IUnspentOutput[],
    feeUTXO: Transaction.IUnspentOutput,
    parentTxs: Transaction[],
    ancestors: TBC20StablecoinAncestors,
    localTX?: Transaction[],
  ): Array<{ txraw: string }>;
  /** Accepts a receiver Map and delegates to batchTransfer. */
  batchTransferLegacy(
    privateKey: PrivateKey,
    receivers: Map<string, number | string>,
    tokenUTXOs: Transaction.IUnspentOutput[],
    feeUTXO: Transaction.IUnspentOutput,
    parentTxs: Transaction[],
    ancestors: TBC20StablecoinAncestors,
  ): Array<{ txraw: string }>;
  mergeCoin(
    privateKey: PrivateKey,
    tokenUtxos: Transaction.IUnspentOutput[],
    utxo: Transaction.IUnspentOutput,
    preTX: Transaction[],
    ancestors: TBC20StablecoinAncestors,
    localTX?: Transaction[],
  ): Array<{ txraw: string }>;
  freezeCoinUtxo(
    aggPubkey32: Buffer,
    feePrivateKey: PrivateKey,
    lockTime: number,
    tokenUtxos: Transaction.IUnspentOutput[],
    utxo: Transaction.IUnspentOutput,
    preTX: Transaction[],
    ancestors: TBC20StablecoinAncestors,
  ): AdminPrepared<string>;
  unfreezeCoinUtxo(
    aggPubkey32: Buffer,
    feePrivateKey: PrivateKey,
    tokenUtxos: Transaction.IUnspentOutput[],
    utxo: Transaction.IUnspentOutput,
    preTX: Transaction[],
    ancestors: TBC20StablecoinAncestors,
  ): AdminPrepared<string>;
  static buildCoinNftOutput(
    nftCodeScript: Script,
    nftHoldScript: Script,
    nftTapeScript: Script,
  ): Transaction.Output[];
  static buildCoinNftTx(
    feePrivateKey: PrivateKey,
    adminPubHashHex: string,
    utxo: Transaction.IUnspentOutput,
    data: coinNftData,
  ): Transaction;
  static getCoinMintCode(
    adminPubHashHex: string,
    receiveAddress: string,
    codeHash: string,
    tapeSize: number,
  ): Script;
  static setLockTimeInTape(tapeScript: Script, lockTime: number): Script;
  static getLockTimeFromTape(tapeScript: Script): number;
  static getAddressFromCode(codeScript: string): {
    address: string;
    type: "address" | "contract";
  };
  /** Replaces the controller in a validated TBC20 Stablecoin Code. */
  static buildFtTransferCode(codeScript: string, address: string): Script;
  /** Replaces all six amount slots in a validated TBC20 Stablecoin Tape. */
  static buildFtTransferTape(tapeScript: string, tapeAmountSetHex: string): Script;
  static buildTapeAmount(
    amountBN: bigint,
    tapeAmountSet: bigint[],
    ftInputIndex?: number,
  ): { amountHex: string; changeHex: string };
  static buildMultiTapeAmounts(
    outputAmounts: bigint[],
    tapeAmountSetIn: bigint[],
  ): string[];
  /** Builds a validated current TBC20 Stablecoin UTXO with its authenticated ftBalance. */
  static buildUtxo(tx: Transaction, codeVout: number): Transaction.IUnspentOutput;
  /** Reads raw balance from a validated TBC20 Stablecoin Tape. */
  static getBalanceFromTape(tape: string): bigint;
  /** Builds the fixed 123-field ABI for an address or contract-controlled TBC20Stablecoin. */
  static getUnlockScript(options: TBC20StablecoinUnlockWithPrivateKeyOptions): Script;
  /** Accepts an ECDSA transaction signature or a 65-byte Schnorr signature with 0x41. */
  static getUnlockScriptWithSignature(options: TBC20StablecoinUnlockWithSignatureOptions): Script;
}

export function buildUTXO(
  tx: Transaction,
  vout: number,
  isFT?: boolean,
): Transaction.IUnspentOutput;

export function buildFtPrePreTxData(
  preTX: Transaction,
  preTxVout: number,
  localTXs: Transaction[],
): string;

export function selectTXfromLocal(
  txs: Transaction[],
  txid: string,
): Transaction;

export function fetchInBatches<T, R>(
  items: T[],
  batchSize: number,
  fetchFn: (batch: T[]) => Promise<R[]>,
  context: string,
): Promise<R[]>;

export function fetchWithRetry<T>(
  fn: () => Promise<T>,
  retries?: number,
  delay?: number,
  context?: string,
): Promise<T>;

export function getFtBalanceFromTape(tape: string): bigint;
export function getOpCode(number: number): string;
export function getLpCostAddress(poolCode: string): string;
export function getLpCostAmount(poolCode: string): number;
export function isLock(length: number): 0 | 1;
export function fetchTBCLockTime(utxo: Transaction.IUnspentOutput): number;
export function safeJSONParse(text: any): any;
export function parseDecimalToBigInt(
  amount: number | bigint | string,
  decimal: number,
): bigint;
export function fillCharLengthInFT(codeScript: string): number;
export function isCoinCodeScript(codeScript: string): boolean;
