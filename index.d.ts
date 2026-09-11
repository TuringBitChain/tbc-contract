import { PrivateKey, Address, Transaction, Script } from "tbc-lib-js";

// PoolNFT 3.0: offline construction, signing and validation. TBC amounts use
// integer satoshis; FT and LP amounts use raw minimum units. Nothing broadcasts.

/** Immutable configuration; each operation consumes an explicit Pool snapshot. */
export class PoolNFT3 {
  constructor(options: PoolNFT3Config);
  readonly tapeSize: number;
  static fromPool(poolTx: Transaction, ftGenesisTx: Transaction): PoolNFT3;
  readPoolState(poolTx: Transaction): Pool3State;
  quoteAddLP(
    poolTx: Transaction,
    incrementSat: bigint,
    firstFtAmountRaw?: bigint,
  ): AddLPQuote & Pick<Pool3State, "outpoint" | "snapshotHash">;
  quoteRemoveLP(
    poolTx: Transaction,
    burnRaw: bigint,
  ): RemoveLPQuote & Pick<Pool3State, "outpoint" | "snapshotHash">;
  quoteSwapFT(
    poolTx: Transaction,
    inputTbcSat: bigint,
    minFtOutRaw?: bigint,
  ): SwapFTQuote & Pick<Pool3State, "outpoint" | "snapshotHash">;
  quoteSwapTBC(
    poolTx: Transaction,
    inputFtRaw: bigint,
    minTbcOutSat?: bigint,
  ): SwapTBCQuote & Pick<Pool3State, "outpoint" | "snapshotHash">;
  /** Uses an already selected mint root; unlike mintPoolNFT, creates no Source. */
  prepareMintPoolNFT(options: Pool3MintOptions): PreparedPool3Operation;
  mintPoolNFT(options: Pool3MintOptions): Promise<Pool3MintResult>;
  prepareAddLP(options: Pool3AddLPOptions): PreparedPool3Operation;
  addLP(options: Pool3AddLPOptions): Promise<Pool3BuildResult>;
  prepareRemoveLP(options: Pool3RemoveLPOptions): PreparedPool3Operation;
  removeLP(options: Pool3RemoveLPOptions): Promise<Pool3BuildResult>;
  prepareSwapFT(options: Pool3SwapFTOptions): PreparedPool3Operation;
  swapFT(options: Pool3SwapFTOptions): Promise<Pool3BuildResult>;
  prepareSwapTBC(options: Pool3SwapTBCOptions): PreparedPool3Operation;
  swapTBC(options: Pool3SwapTBCOptions): Promise<Pool3BuildResult>;
  prepareTransferLP(options: Pool3TransferLPOptions): PreparedPool3Operation;
  transferLP(options: Pool3TransferLPOptions): Promise<Pool3BuildResult>;
  prepareUnlockLP(options: Pool3UnlockLPOptions): PreparedPool3Operation;
  unlockLP(options: Pool3UnlockLPOptions): Promise<Pool3BuildResult>;
}

export { PoolNFT3 as poolNFT3 };

export type PoolAuthorization =
  | { readonly kind: "public" }
  | {
      readonly kind: "controller";
      readonly controllerPubKeyHashes: readonly string[];
    };

export interface PoolNFT3Config {
  /** Canonical TBC20 genesis transaction with Code/Tape at vout 0/1. */
  ftGenesisTx: Transaction;
  authorization?: PoolAuthorization;
  lp?: { kind: "plain" | "timelocked" };
  lpPlan?: number;
  serviceFeeRate?: number;
}

// Signing and input references.

export type Pool3TransactionResolver =
  | ReadonlyMap<string, Transaction>
  | readonly Transaction[]
  | ((txid: string) => Transaction | undefined);

export type Pool3SignerRole =
  | "funding"
  | "pool-controller"
  | "pool-ft"
  | "user-ft"
  | "lp-owner";

export interface Pool3InputReference {
  parentTx: Transaction;
  outputIndex: number;
}

export interface Pool3SigningRequest {
  inputIndex: number;
  role: Pool3SignerRole;
  outpoint: { txId: string; outputIndex: number };
  amountSat: bigint;
  lockingScriptHex: string;
  publicKey: Buffer;
  publicKeyHash: Buffer;
  sighashType: 0x41;
  /** Isolated final-output view with previous outputs attached for signing. */
  transaction: Transaction;
}

export interface Pool3SigningIdentity {
  publicKey: string | Buffer;
  /** Called once per input, after amounts, outputs and miner fee are fixed. */
  sign?: (
    request: Pool3SigningRequest,
  ) => Buffer | string | Promise<Buffer | string>;
}

export function privateKeySigner(key: PrivateKey): Pool3SigningIdentity;

export interface Pool3SignedInput extends Pool3InputReference {
  signer: Pool3SigningIdentity;
}

export interface Pool3AssetInput extends Pool3SignedInput {
  ancestors: Pool3TransactionResolver;
}

export interface Pool3PoolInput {
  parentTx: Transaction;
  /** Transaction spent by parentTx.vin0, including mint Source for first AddLP. */
  ancestorTx: Transaction;
}

export interface Pool3FeePolicy {
  satoshisPerKb?: bigint;
  minimumFeeSat?: bigint;
  changeDustSat?: bigint;
}

export interface Pool3Signature {
  inputIndex: number;
  signature: Buffer | string;
  publicKey: Buffer | string;
}

/** Obtained through prepare* methods, never constructed directly. */
export interface PreparedPool3Operation {
  readonly layout: Pool3Layout;
  readonly quote: Pool3Quote | undefined;
  readonly transaction: Transaction;
  readonly signingRequests: readonly Pool3SigningRequest[];
  readonly feeSat: bigint;
  readonly changeVout: number | undefined;
  finalize(signatures: readonly Pool3Signature[]): Pool3BuildResult;
  sign(): Promise<Pool3BuildResult>;
}

// Operation inputs.

export interface Pool3OperationOptions {
  pool: Pool3PoolInput;
  poolFT: Pool3AssetInput;
  funding: Pool3SignedInput;
  controllerSigner?: Pool3SigningIdentity;
  /** Residual miner-funding change; defaults to the funding signer's address. */
  changeAddress?: string;
  feePolicy?: Pool3FeePolicy;
  /** Optional optimistic-concurrency guard from an earlier quote. */
  expectedSnapshotHash?: string;
}

export interface Pool3MintOptions {
  funding: Pool3SignedInput;
  changeAddress?: string;
  feePolicy?: Pool3FeePolicy;
}

export interface Pool3AddLPOptions extends Pool3OperationOptions {
  userFT: Pool3AssetInput;
  incrementSat: bigint;
  firstFtAmountRaw?: bigint;
  lpReceiverAddress: string;
  /** Required for timelocked pools, including an explicit zero. */
  lpLockTime?: number;
  minLpOutRaw?: bigint;
  maxFtInRaw?: bigint;
}

export interface Pool3RemoveLPOptions extends Pool3OperationOptions {
  userLP: Pool3AssetInput;
  burnAmountRaw: bigint;
  receiverAddress: string;
  minFtOutRaw?: bigint;
  minTbcOutSat?: bigint;
  /** Defaults to the consumed LP lock; node maturity must be checked separately. */
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
    "amountRaw" | "receiverAddress" | "lpChangeAddress" | "outputLockTime"
  > {
  /** Every input must belong to this owner; unlocking does not transfer ownership. */
  receiverAddress: string;
}

// Transaction results and Pool state.

export interface Pool3TransactionResult {
  transaction: Transaction;
  txraw: string;
  txid: string;
  feeSat: bigint;
  reservedBytes: number;
  changeVout?: number;
  consumedOutpoints: readonly { txId: string; outputIndex: number }[];
  validation: Pool3ValidationReport;
}

export interface Pool3AssetOutput {
  role:
    | "pool-ft"
    | "user-ft"
    | "ft-change"
    | "new-lp"
    | "lp-burn"
    | "lp-change"
    | "lp-transfer";
  family: "tbc20" | "ftlp";
  codeVout: number;
  tapeVout: number;
  amountRaw: bigint;
  amountsByInput: readonly bigint[];
}

export interface Pool3Layout {
  operation:
    | "mint"
    | "addLP"
    | "removeLP"
    | "swapFT"
    | "swapTBC"
    | "transferLP"
    | "unlockLP";
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
  transactions: readonly Transaction[];
}

export interface Pool3State extends PoolMathState {
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

export type Pool3Quote =
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

export type FTLPScriptLike = Script | Buffer | string;

export interface FTLPCodeOptions {
  poolCodeHash: Buffer;
  tapeSize: number;
  controller: Buffer;
  timelocked: boolean;
}

export interface FTLPCodeDescriptor extends FTLPCodeOptions {
  /** SHA256 intermediate state of the immutable prefix followed by ScriptNum size. */
  identity: Buffer;
  codeSize: number;
}

export interface FTLPTapeOptions {
  amounts: readonly bigint[];
  tapeSize: number;
  timelocked: boolean;
  /** Required for timelocked LP, including an explicit zero. */
  lockTime?: number;
}

export interface FTLPTapeDescriptor {
  amounts: readonly bigint[];
  balance: bigint;
  tapeSize: number;
  timelocked: boolean;
  lockTime: number;
}

export class FTLPTBC20 {
  static readonly codeSatoshis: 500;
  static readonly maxSlotAmount: bigint;
  static readonly lockTimeThreshold: 500000000;
  static instantiateCode(options: FTLPCodeOptions): Script;
  static parseCode(value: FTLPScriptLike): FTLPCodeDescriptor;
  static validateCode(
    value: FTLPScriptLike,
    expected?: Partial<FTLPCodeOptions>,
  ): FTLPCodeDescriptor;
  static getCodeIdentity(value: FTLPScriptLike): Buffer;
  static replaceController(value: FTLPScriptLike, controller: Buffer): Script;
  static buildTape(options: FTLPTapeOptions): Script;
  static parseTape(
    value: FTLPScriptLike,
    profile: { timelocked: boolean; tapeSize?: number },
  ): FTLPTapeDescriptor;
  /** Script-level requirement only; node/chain finality is a separate check. */
  static getRequiredLockTime(lockTimes: readonly number[]): number;
  static verifyInputLock(
    tx: Transaction,
    inputIndex: number,
    tape: FTLPScriptLike,
    profile: Pick<FTLPCodeOptions, "timelocked" | "tapeSize">,
  ): void;
}

export interface Pool3InputValidation {
  inputIndex: number;
  success: boolean;
  error: string;
  stackDepth: number;
  altStackDepth: number;
}

export interface Pool3ValidationReport {
  success: boolean;
  inputs: readonly Pool3InputValidation[];
  valueConserved: boolean;
  /** Local execution does not establish UTXO availability or node finality. */
  nodeAcceptanceChecked: false;
}

/** Every input must have its trusted previous output attached. */
export function validatePool3Transaction(
  tx: Transaction,
): Pool3ValidationReport;

export class API {
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

export interface FtInfo {
  contractTxid?: string;
  codeScript: string;
  tapeScript: string;
  totalSupply: bigint;
  decimal: number;
  name: string;
  symbol: string;
}

/** Canonical SDK/indexer metadata embedded in the TBC20 Tape extension. */
export interface TBC20Metadata {
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

export interface TBC20Definition {
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
export interface TBC20ExistingToken {
  codeScript: string | Buffer | Script;
  tapeScript: string | Buffer | Script;
  contractTxid?: string;
}

export type TBC20ExistingConfig = TBC20ExistingToken &
  (
    | TBC20Definition
    | {
        name?: never;
        symbol?: never;
        supply?: never;
        decimal?: never;
      }
  );

export type TBC20Config = TBC20Definition | TBC20ExistingConfig;

export type TBC20AncestorResolver =
  | ReadonlyMap<string, Transaction>
  | readonly Transaction[]
  | ((txid: string) => Transaction | undefined);

export interface TBC20MintOptions {
  /** Runs local script verification by default. */
  verify?: boolean;
}

export interface TBC20TransferOptions {
  tbcChangeAddress?: string;
  /** Runs local script verification by default. */
  verify?: boolean;
}

export interface TBC20MergeOptions extends TBC20TransferOptions {
  /** Defaults to the signing key's P2PKH address. */
  controller?: string;
}

export interface TBC20TokenOutput {
  codeVout: number;
  tapeVout: number;
  /** Raw smallest-unit token amount. */
  amount: bigint;
}

export interface TBC20BuildResult {
  transaction: Transaction;
  txraw: string;
  feeSatoshis: number;
  tokenOutputs: readonly TBC20TokenOutput[];
}

export interface TBC20MintResult extends TBC20BuildResult {
  sourceTransaction: Transaction;
  sourceTxraw: string;
  sourceFeeSatoshis: number;
  originalUTXO: {
    txId: string;
    outputIndex: number;
  };
}

/**
 * High-level TBC20 API. Low-level ABI and custom-controller builders remain
 * available only from the deep contract module.
 */
export class TBC20 {
  readonly metadata?: Readonly<TBC20Metadata>;
  readonly name?: string;
  readonly symbol?: string;
  readonly supply?: string;
  readonly decimal?: number;
  readonly declaredSupplyRaw?: bigint;
  codeScript: string;
  tapeScript: string;
  contractTxid: string;

  constructor(config: TBC20Config);

  /** Uses the supply declared by the constructor metadata. */
  mint(
    privateKey: PrivateKey,
    recipientAddress: string,
    fundingUTXO: Transaction.IUnspentOutput,
    options?: TBC20MintOptions,
  ): TBC20MintResult;

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
    ancestorResolvers: readonly TBC20AncestorResolver[],
    options?: TBC20TransferOptions,
  ): TBC20BuildResult;

  /** Merges 2-5 address-controlled token UTXOs into as few outputs as slot limits permit. */
  merge(
    privateKey: PrivateKey,
    tokenUTXOs: readonly Transaction.IUnspentOutput[],
    feeUTXO: Transaction.IUnspentOutput,
    parentTxs: readonly Transaction[],
    ancestorResolvers: readonly TBC20AncestorResolver[],
    options?: TBC20MergeOptions,
  ): TBC20BuildResult;
}

export type TokenProtocolDescriptor =
  | Readonly<{ family: "TBC20"; version: 1 }>
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
  | "UNSUPPORTED_TBC20_ARTIFACT"
  | "INVALID_TBC20_CODE"
  | "EMPTY_LOCKING_SCRIPT"
  | "TBC20_CODE_WITHOUT_TAPE"
  | "ORPHAN_TBC20_TAPE"
  | "INVALID_TBC20_TAPE"
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
        kind: "TBC20" | "FT";
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
    kind: "TBC20" | "FT" | "ORDINARY";
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
export type PoolServiceFeeRate = 35 | 130 | 135 | 335 | 535;

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

export class piggyBank {
  static freezeTBC(
    address: string,
    tbcNumber: number,
    lockTime: number,
    utxos: Transaction.IUnspentOutput[],
  ): string;
  static unfreezeTBC(
    address: string,
    utxos: Transaction.IUnspentOutput[],
    network?: "testnet" | "mainnet" | string,
  ): string;
  static fetchTBCLockTime(utxo: Transaction.IUnspentOutput): number;
}

export class orderBook {
  type: "buy" | "sell";
  hold_address: string;
  sale_volume: bigint;
  fee_rate: bigint;
  unit_price: bigint;
  sale_volume_number: number;
  fee_rate_number: number;
  unit_price_number: number;
  ft_a_contract_partialhash: string;
  ft_a_contract_id: string;
  ft_b_contract_partialhash: string;
  ft_b_contract_id: string;
  contract_version: number;

  buildSellOrderTX(
    holdAddress: string,
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftID: string,
    ftCodeScript: string,
    utxos: Transaction.IUnspentOutput[],
  ): string;
  buildCancelSellOrderTX(
    sellutxo: Transaction.IUnspentOutput,
    utxos: Transaction.IUnspentOutput[],
  ): string;
  fillSigsSellOrder(
    sellOrderTxRaw: string,
    sigs: string[],
    publicKey: string,
    type: "make" | "cancel",
  ): string;
  buildBuyOrderTX(
    holdAddress: string,
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftID: string,
    utxos: Transaction.IUnspentOutput[],
    ftutxos: Transaction.IUnspentOutput[],
    preTXs: Transaction[],
  ): string;
  buildCancelBuyOrderTX(
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
    prepreTxData: string[],
  ): string;
  fillSigsCancelBuyOrder(
    buyOrderTxRaw: string,
    sigs: string[],
    publicKey: string,
    buyPreTX: Transaction,
    ftPreTX: Transaction,
    ftPrePreTxData: string,
  ): string;
  matchOrder(
    privateKey: PrivateKey,
    buyutxo: Transaction.IUnspentOutput,
    buyPreTX: Transaction,
    ftutxo: Transaction.IUnspentOutput,
    ftPreTX: Transaction,
    ftPrePreTxData: string,
    sellutxo: Transaction.IUnspentOutput,
    sellPreTX: Transaction,
    utxos: Transaction.IUnspentOutput[],
    ftFeeAddress: string,
    tbcFeeAddress: string,
  ): string;
  makeSellOrder_privateKeyOnline(
    privateKey: PrivateKey,
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftID: string,
  ): Promise<string>;
  cancelSellOrder_privateKeyOnline(
    privateKey: PrivateKey,
    sellutxo: Transaction.IUnspentOutput,
  ): Promise<string>;
  makeBuyOrder_privateKeyOnline(
    privateKey: PrivateKey,
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftID: string,
  ): Promise<string>;
  cancelBuyOrder_privateKeyOnline(
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
  buildTokenSellOrderTX(
    holdAddress: string,
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftaID: string,
    ftbID: string,
    ftaCodeScript: string,
    ftbCodeScript: string,
    utxos: Transaction.IUnspentOutput[],
    ftutxos: Transaction.IUnspentOutput[],
    preTXs: Transaction[],
  ): string;
  buildTokenBuyOrderTX(
    holdAddress: string,
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftaID: string,
    ftbID: string,
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
    prepreTxData: string[],
  ): string;
  fillSigsMakeTokenBuyOrder(
    buyOrderTxRaw: string,
    sigs: string[],
    publicKey: string,
    preTXs: Transaction[],
    prepreTxData: string[],
  ): string;
  buildCancelTokenSellOrderTX(
    sellutxo: Transaction.IUnspentOutput,
    ftutxo: Transaction.IUnspentOutput,
    ftPreTX: Transaction,
    utxos: Transaction.IUnspentOutput[],
  ): string;
  buildCancelTokenBuyOrderTX(
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
    ftPrePreTxData: string,
  ): string;
  fillSigsCancelTokenBuyOrder(
    cancelBuyOrderTxRaw: string,
    sigs: string[],
    publicKey: string,
    buyPreTX: Transaction,
    ftPreTX: Transaction,
    ftPrePreTxData: string,
  ): string;
  matchTokenOrder(
    privateKey: PrivateKey,
    buyutxo: Transaction.IUnspentOutput,
    buyPreTX: Transaction,
    buyFtUtxo: Transaction.IUnspentOutput,
    buyFtPreTX: Transaction,
    buyFtPrePreTxData: string,
    sellutxo: Transaction.IUnspentOutput,
    sellPreTX: Transaction,
    sellFtUtxo: Transaction.IUnspentOutput,
    sellFtPreTX: Transaction,
    sellFtPrePreTxData: string,
    utxos: Transaction.IUnspentOutput[],
    ftaFeeAddress: string,
    ftbFeeAddress: string,
  ): string;
  makeTokenSellOrder_privateKeyOnline(
    privateKey: PrivateKey,
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftaID: string,
    ftbID: string,
  ): Promise<string>;
  cancelTokenSellOrder_privateKeyOnline(
    privateKey: PrivateKey,
    sellutxo: Transaction.IUnspentOutput,
  ): Promise<string>;
  makeTokenBuyOrder_privateKeyOnline(
    privateKey: PrivateKey,
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftaID: string,
    ftbID: string,
  ): Promise<string>;
  cancelTokenBuyOrder_privateKeyOnline(
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
  getTokenSellOrderCode(taxAddress: string): Script;
  getTokenBuyOrderCode(taxAddress: string): Script;
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
    ftID: string;
  };
  static getTokenOrderData(codeScript: string): {
    holdAddress: string;
    saleVolume: bigint;
    ftaPartialHash: string;
    ftbPartialHash: string;
    feeRate: bigint;
    unitPrice: bigint;
    ftaID: string;
    ftbID: string;
  };
}

export namespace HTLC {
  export function deployHTLC(
    sender: string,
    receiver: string,
    hashlock: string,
    timelock: number,
    amount: number | string,
    utxo: Transaction.IUnspentOutput,
  ): string;

  export function withdraw(
    receiver: string,
    htlcutxo: Transaction.IUnspentOutput,
  ): string;

  export function refund(
    sender: string,
    htlcutxo: Transaction.IUnspentOutput,
    timelock: number,
  ): string;

  export function fillSigDepoly(
    deployHTLCTxRaw: string,
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

  export function deployHTLCWithSign(
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
    htlcutxo: Transaction.IUnspentOutput,
    secret: string,
  ): string;

  export function refundWithSign(
    sender: string,
    htlcutxo: Transaction.IUnspentOutput,
    privateKey: string,
    timelock: number,
  ): string;

  export function deployHTLCToken(
    sender: string,
    receiver: string,
    hashlock: string,
    timelock: number,
    ftAmount: number | string,
    ftutxos: Transaction.IUnspentOutput[],
    utxo: Transaction.IUnspentOutput,
    preTX: Transaction[],
    prepreTxData: string[],
  ): string;

  export function fillSigDeployHTLCToken(
    deployRaw: string,
    sigs: string[],
    publicKey: string,
    preTX: Transaction[],
    prepreTxData: string[],
  ): string;

  export function withdrawHTLCToken(
    receiver: string,
    htlcutxo: Transaction.IUnspentOutput,
    ftutxo: Transaction.IUnspentOutput,
    deployTX: Transaction,
    utxo: Transaction.IUnspentOutput,
  ): string;

  export function fillSigWithdrawHTLCToken(
    withdrawRaw: string,
    sigs: string[],
    publicKey: string,
    secret: string,
    deployTX: Transaction,
    prepreTxData: string,
  ): string;

  export function refundHTLCToken(
    sender: string,
    htlcutxo: Transaction.IUnspentOutput,
    ftutxo: Transaction.IUnspentOutput,
    deployTX: Transaction,
    utxo: Transaction.IUnspentOutput,
    timelock: number,
  ): string;

  export function fillSigRefundHTLCToken(
    refundRaw: string,
    sigs: string[],
    publicKey: string,
    deployTX: Transaction,
    prepreTxData: string,
  ): string;

  export function deployHTLCTokenWithSign(
    sender: string,
    receiver: string,
    hashlock: string,
    timelock: number,
    ftAmount: number | string,
    ftutxos: Transaction.IUnspentOutput[],
    utxo: Transaction.IUnspentOutput,
    preTX: Transaction[],
    prepreTxData: string[],
    privateKey: string,
  ): string;

  export function withdrawHTLCTokenWithSign(
    privateKey: string,
    receiver: string,
    htlcutxo: Transaction.IUnspentOutput,
    ftutxo: Transaction.IUnspentOutput,
    deployTX: Transaction,
    prepreTxData: string,
    utxo: Transaction.IUnspentOutput,
    secret: string,
  ): string;

  export function refundHTLCTokenWithSign(
    privateKey: string,
    sender: string,
    htlcutxo: Transaction.IUnspentOutput,
    ftutxo: Transaction.IUnspentOutput,
    deployTX: Transaction,
    prepreTxData: string,
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
 * Returned by admin-gated `stableCoin` methods. Callers run an external
 * MuSig2 ceremony to produce one 64-byte Schnorr signature per entry in
 * `sighashes`, then call `finalize(sigs)` to get the serialized tx(s).
 */
export interface AdminPrepared<R> {
  tx: Transaction;
  sighashes: AdminSighash[];
  finalize: (schnorrSigs64: Buffer[]) => R;
}

export class stableCoin extends FT {
  constructor(
    txidOrParams:
      | string
      | { name: string; symbol: string; amount: number; decimal: number },
  );
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
    localTX: Transaction[],
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
    data: coinNftData,
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
