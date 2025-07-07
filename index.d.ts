import { PrivateKey, Address, Transaction, Script } from "tbc-lib-js";
declare module "tbc-contract" {
  export class API {
    static getTBCbalance(
      address: string,
      network?: "testnet" | "mainnet" | string
    ): Promise<number>;
    static fetchUTXO(
      privateKey: PrivateKey,
      amount: number,
      network?: "testnet" | "mainnet" | string
    ): Promise<Transaction.IUnspentOutput>;
    static mergeUTXO(
      privateKey: PrivateKey,
      network?: "testnet" | "mainnet" | string
    ): Promise<boolean>;
    static getFTbalance(
      contractTxid: string,
      addressOrHash: string,
      network?: "testnet" | "mainnet" | string
    ): Promise<bigint>;
    static fetchFtUTXOList(
      contractTxid: string,
      addressOrHash: string,
      codeScript: string,
      network?: "testnet" | "mainnet" | string
    ): Promise<Transaction.IUnspentOutput[]>;
    static fetchFtUTXO(
      contractTxid: string,
      addressOrHash: string,
      amount: bigint,
      codeScript: string,
      network?: "testnet" | "mainnet" | string
    ): Promise<Transaction.IUnspentOutput>;
    static fetchFtUTXOs(
      contractTxid: string,
      addressOrHash: string,
      codeScript: string,
      network?: "testnet" | "mainnet" | string,
      amount?: bigint
    ): Promise<Transaction.IUnspentOutput[]>;
    static fetchFtUTXOsforPool(
      contractTxid: string,
      addressOrHash: string,
      amount: bigint,
      number: number,
      codeScript: string,
      network?: "testnet" | "mainnet" | string
    ): Promise<Transaction.IUnspentOutput[]>;
    static fetchFtInfo(
      contractTxid: string,
      network?: "testnet" | "mainnet" | string
    ): Promise<FtInfo>;
    static fetchFtPrePreTxData(
      preTX: Transaction,
      preTxVout: number,
      network?: "testnet" | "mainnet" | string
    ): Promise<string>;
    static fetchPoolNftInfo(
      contractTxid: string,
      network?: "testnet" | "mainnet" | string
    ): Promise<PoolNFTInfo>;
    static fetchPoolNftUTXO(
      contractTxid: string,
      network?: "testnet" | "mainnet" | string
    ): Promise<Transaction.IUnspentOutput>;
    static fetchFtlpBalance(
      ftlpCode: string,
      network?: "testnet" | "mainnet" | string
    ): Promise<bigint>;
    static fetchFtlpUTXO(
      ftlpCode: string,
      amount: bigint,
      network?: "testnet" | "mainnet" | string
    ): Promise<Transaction.IUnspentOutput>;
    static fetchTXraw(
      txid: string,
      network?: "testnet" | "mainnet" | string
    ): Promise<Transaction>;
    static broadcastTXraw(
      txraw: string,
      network?: "testnet" | "mainnet" | string
    ): Promise<string>;
    static broadcastTXsraw(
      txrawList: Array<{ txHex: string }>,
      network?: "testnet" | "mainnet" | string
    ): Promise<string>;
    static fetchUTXOs(
      address: string,
      network?: "testnet" | "mainnet" | string
    ): Promise<Transaction.IUnspentOutput[]>;
    static getUTXOs(
      address: string,
      amount_tbc: number,
      network?: "testnet" | "mainnet" | string
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
      network?: "testnet" | "mainnet" | string
    ): Promise<NFTInfo>;
    static fetchUMTXO(
      script_asm: string,
      tbc_amount: number,
      network?: "testnet" | "mainnet" | string
    ): Promise<Transaction.IUnspentOutput>;
    static fetchUMTXOs(
      script_asm: string,
      network?: "testnet" | "mainnet" | string
    ): Promise<Transaction.IUnspentOutput[]>;
    static getUMTXOs(
      script_asm: string,
      amount_tbc: number,
      network?: "testnet" | "mainnet" | string
    ): Promise<Transaction.IUnspentOutput[]>;
    static fetchFtUTXOS_multiSig(
      contractTxid: string,
      addressOrHash: string,
      codeScript: string,
      network?: "testnet" | "mainnet" | string
    ): Promise<Transaction.IUnspentOutput[]>;
    static getFtUTXOS_multiSig(
      contractTxid: string,
      addressOrHash: string,
      codeScript: string,
      amount: bigint,
      network?: "testnet" | "mainnet" | string
    ): Promise<Transaction.IUnspentOutput[]>;
  }

  interface CollectionData {
    collectionName: string;
    description: string;
    supply: number;
    file: string;
  }

  interface NFTInfo {
    collectionId: string;
    collectionIndex: number;
    collectionName: string;
    nftCodeBalance: number;
    nftP2pkhBalance: number;
    nftName: string;
    nftSymbol: string;
    nft_attributes: string;
    nftDescription: string;
    nftTransferTimeCount: number;
    nftIcon: string;
  }

  interface NFTData {
    nftName: string;
    symbol: string;
    description: string;
    attributes: string;
    file?: string;
  }

  export class NFT {
    constructor(contract_id: string);
    initialize(nftInfo: NFTInfo);
    static createCollection(
      address: string,
      privateKey: PrivateKey,
      data: CollectionData,
      utxos: Transaction.IUnspentOutput[]
    ): string;
    static createNFT(
      collection_id: string,
      address: string,
      privateKey: PrivateKey,
      data: NFTData,
      utxos: Transaction.IUnspentOutput[],
      nfttxo: Transaction.IUnspentOutput
    ): string;
    static batchCreateNFT(
      collection_id: string,
      address: string,
      privateKey: PrivateKey,
      datas: NFTData[],
      utxos: Transaction.IUnspentOutput[],
      nfttxos: Transaction.IUnspentOutput[],
    ): Array<{ txHex: string }>;
    transferNFT(
      address_from: string,
      address_to: string,
      privateKey: PrivateKey,
      utxos: Transaction.IUnspentOutput[],
      pre_tx: Transaction,
      pre_pre_tx: Transaction
    ): string;
    static buildCodeScript(tx_hash: string, outputIndex: number): Script;
    static buildHoldScript(address: string): Script;
    static buildMintScript(address: string): Script;
    static buildTapeScript(data: CollectionData | NFTData): Script;
    static decodeNFTDataFromHex(hex: string): any;
    static encodeNFTDataToHex(data: any): string;
  }

  interface FtInfo {
    contractTxid?: string;
    codeScript: string;
    tapeScript: string;
    totalSupply: number;
    decimal: number;
    name: string;
    symbol: string;
  }

  export class FT {
    name: string;
    symbol: string;
    decimal: number;
    totalSupply: number;
    codeScript: string;
    tapeScript: string;
    contractTxid: string;
    constructor(
      txidOrParams:
        | string
        | { name: string; symbol: string; amount: number; decimal: number }
    );
    initialize(ftInfo: FtInfo): void;
    MintFT(
      privateKey_from: PrivateKey,
      address_to: string,
      utxo: Transaction.IUnspentOutput
    ): string[];
    transfer(
      privateKey_from: PrivateKey,
      address_to: string,
      ft_amount: number,
      ftutxo_a: Transaction.IUnspentOutput[],
      utxo: Transaction.IUnspentOutput,
      preTX: Transaction[],
      prepreTxData: string[],
      tbc_amount?: number
    ): string;
    transferWithAdditionalInfo(
      privateKey_from: PrivateKey,
      address_to: string,
      amount: number,
      ftutxo_a: Transaction.IUnspentOutput[],
      utxo: Transaction.IUnspentOutput,
      preTX: Transaction[],
      prepreTxData: string[],
      additionalInfo: Buffer
    ): string;
    batchTransfer(
      privateKey_from: PrivateKey,
      receiveAddressAmount: Map<string, number>,
      ftutxo: Transaction.IUnspentOutput[],
      utxo: Transaction.IUnspentOutput,
      preTX: Transaction[],
      prepreTxData: string[]
    ): Array<{ txHex: string }>;
    mergeFT(
      privateKey_from: PrivateKey,
      ftutxo: Transaction.IUnspentOutput[],
      utxo: Transaction.IUnspentOutput,
      preTX: Transaction[],
      prepreTxData: string[],
      localTX: Transaction[]
    ): Array<{ txHex: string }>;
    getFTunlock(
      privateKey_from: PrivateKey,
      currentTX: Transaction,
      preTX: Transaction,
      prepreTxData: string,
      currentUnlockIndex: number,
      preTxVout: number
    ): Script;
    getFTunlockSwap(
      privateKey_from: PrivateKey,
      currentTX: Transaction,
      preTX: Transaction,
      prepreTxData: string,
      contractTX: Transaction,
      currentUnlockIndex: number,
      preVout: number
    ): Script;
    getFTmintCode(
      txid: string,
      vout: number,
      address: string,
      tapeSize: number
    ): Script;
    static buildFTtransferCode(code: string, addressOrHash: string): Script;
    static buildFTtransferTape(tape: string, amountHex: string): Script;
    static buildTapeAmount(
      amountBN: bigint,
      tapeAmountSet: bigint[],
      ftInputIndex?: number
    ): { amountHex: string; changeHex: string };
    static getBalanceFromTape(tape: string): bigint;
  }

  interface PoolNFTInfo {
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

  interface poolNFTDifference {
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
      utxo: Transaction.IUnspentOutput
    ): Promise<string[]>;
    createPoolNftWithLock(
      privateKey_from: PrivateKey,
      utxo: Transaction.IUnspentOutput
    ): Promise<string[]>;
    initPoolNFT(
      privateKey_from: PrivateKey,
      address_to: string,
      utxo: Transaction.IUnspentOutput,
      tbc_amount?: number,
      ft_a?: number
    ): Promise<string>;
    increaseLP(
      privateKey_from: PrivateKey,
      address_to: string,
      utxo: Transaction.IUnspentOutput,
      amount_tbc: number
    ): Promise<string>;
    consumeLP(
      privateKey_from: PrivateKey,
      address_to: string,
      utxo: Transaction.IUnspentOutput,
      amount_lp: number
    ): Promise<string>;
    swaptoToken(
      privateKey_from: PrivateKey,
      address_to: string,
      utxo: Transaction.IUnspentOutput,
      amount_token: number
    ): Promise<string>;
    swaptoToken_baseTBC(
      privateKey_from: PrivateKey,
      address_to: string,
      utxo: Transaction.IUnspentOutput,
      amount_tbc: number
    ): Promise<string>;
    swaptoTBC(
      privateKey_from: PrivateKey,
      address_to: string,
      utxo: Transaction.IUnspentOutput,
      amount_tbc: number
    ): Promise<string>;
    swaptoTBC_baseToken(
      privateKey_from: PrivateKey,
      address_to: string,
      utxo: Transaction.IUnspentOutput,
      amount_token: number
    ): Promise<string>;
    fetchPoolNFTInfo(contractTxid: string): Promise<PoolNFTInfo>;
    fetchPoolNftUTXO(contractTxid: string): Promise<Transaction.IUnspentOutput>;
    fetchFtlpUTXO(
      ftlpCode: string,
      amount: bigint
    ): Promise<Transaction.IUnspentOutput>;
    mergeFTLP(
      privateKey_from: PrivateKey,
      utxo: Transaction.IUnspentOutput
    ): Promise<boolean | string>;
    mergeFTinPool(
      privateKey_from: PrivateKey,
      utxo: Transaction.IUnspentOutput
    ): Promise<boolean | string>;
    updatePoolNFT(
      increment: number,
      ft_a_decimal: number,
      option: 1 | 2 | 3
    ): poolNFTDifference;
    getPoolNFTunlock(
      privateKey_from: PrivateKey,
      currentTX: Transaction,
      currentUnlockIndex: number,
      preTxId: string,
      preVout: number,
      option: 1 | 2 | 3 | 4,
      swapOption?: 1 | 2
    ): Promise<Script>;
    getPoolNftCode(txid: string, vout: number): Script;
    getPoolNftCodeWithLock(txid: string, vout: number): Script;
    getFTLPcode(
      poolNftCodeHash: string,
      address: string,
      tapeSize: number
    ): Script;
  }

  export class poolNFT2 {
    ft_lp_amount: bigint;
    ft_a_amount: bigint;
    tbc_amount: bigint;
    ft_lp_partialhash: string;
    ft_a_partialhash: string;
    ft_a_contractTxid: string;
    poolnft_code: string;
    contractTxid: string;
    network: "testnet" | "mainnet" | string;
    service_fee_rate: number;

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
      serviceFeeRate?: number,
      lpPlan?: 1 | 2
    ): Promise<string[]>;
    createPoolNftWithLock(
      privateKey_from: PrivateKey,
      utxo: Transaction.IUnspentOutput,
      tag: string,
      lpCostAddress: Address | string,
      lpCostTBC: number,
      pubKeyLock: string[],
      serviceFeeRate?: number,
      lpPlan?: 1 | 2
    ): Promise<string[]>;
    initPoolNFT(
      privateKey_from: PrivateKey,
      address_to: string,
      utxo: Transaction.IUnspentOutput,
      tbc_amount: number,
      ft_a: number
    ): Promise<string>;
    increaseLP(
      privateKey_from: PrivateKey,
      address_to: string,
      utxo: Transaction.IUnspentOutput,
      amount_tbc: number
    ): Promise<string>;
    consumeLP(
      privateKey_from: PrivateKey,
      address_to: string,
      utxo: Transaction.IUnspentOutput,
      amount_lp: number
    ): Promise<string>;
    swaptoToken_baseTBC(
      privateKey_from: PrivateKey,
      address_to: string,
      utxo: Transaction.IUnspentOutput,
      amount_tbc: number,
      lpPlan: 1 | 2
    ): Promise<string>;
    swaptoTBC_baseToken(
      privateKey_from: PrivateKey,
      address_to: string,
      utxo: Transaction.IUnspentOutput,
      amount_token: number,
      lpPlan: 1 | 2
    ): Promise<string>;
    swaptoTBC_baseToken_local(
      privateKey_from: PrivateKey,
      address_to: string,
      ftutxo: Transaction.IUnspentOutput,
      ftPreTX: Transaction[],
      ftPrePreTxData: string[],
      amount_token: number,
      lpPlan?: 1 | 2,
      utxo?: Transaction.IUnspentOutput
    ): Promise<string>;
    fetchPoolNftInfo(contractTxid: string): Promise<PoolNFTInfo>;
    fetchPoolNftUTXO(contractTxid: string): Promise<Transaction.IUnspentOutput>;
    fetchFtlpUTXO(
      ftlpCode: string,
      amount: bigint
    ): Promise<Transaction.IUnspentOutput>;
    fetchFtlpBalance(address: string): Promise<bigint>;
    getLpIncome(address: string): Promise<bigint>;
    mergeFTLP(
      privateKey_from: PrivateKey,
      utxo: Transaction.IUnspentOutput
    ): Promise<boolean | string>;
    mergeFTinPool(
      privateKey_from: PrivateKey,
      utxo: Transaction.IUnspentOutput,
      times?: number
    ): Promise<Array<{ txHex: string }>>;
    updatePoolNFT(
      increment: number,
      ft_a_decimal: number,
      option: 1 | 2 | 3
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
      swapOption?: 1 | 2
    ): Script;
    getPoolNftUnlock(
      privateKey_from: PrivateKey,
      currentTX: Transaction,
      currentUnlockIndex: number,
      preTxId: string,
      preVout: number,
      withLock: 0 | 1,
      option: 1 | 2 | 3 | 4,
      swapOption?: 1 | 2
    ): Promise<Script>;
    getPoolNftCode(
      txid: string,
      vout: number,
      lpPlan: 1 | 2,
      tag?: string
    ): Script;
    getPoolNftCodeWithLock(
      txid: string,
      vout: number,
      lpPlan: 1 | 2,
      lpCostAddress: Address | string,
      lpCostTBC: number,
      pubKeyLock: string[],
      tag?: string
    ): Script;
    getFtlpCode(
      poolNftCodeHash: string,
      address: string,
      tapeSize: number
    ): Script;
  }

  interface MultiSigTxRaw {
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
      privateKey: PrivateKey
    ): string;
    static p2pkhToMultiSig_sendTBC(
      address_from: string,
      address_to: string,
      amount_tbc: number,
      utxos: Transaction.IUnspentOutput[],
      privateKey: PrivateKey
    ): string;
    static buildMultiSigTransaction_sendTBCToP2pkh(
      address_from: string,
      address_to: string,
      amount_tbc: number,
      utxos: Transaction.IUnspentOutput[]
    ): MultiSigTxRaw;
    static buildMultiSigTransaction_sendTBCToMultiSig(
      address_from: string,
      address_to: string,
      amount_tbc: number,
      utxos: Transaction.IUnspentOutput[]
    ): MultiSigTxRaw[];
    static signMultiSigTransaction_sendTBC(
      address_from: string,
      multiSigTxraw: MultiSigTxRaw,
      privateKey: PrivateKey
    ): string[];
    static batchSignMultiSigTransaction_sendTBC(
      address_from: string,
      multiSigTxraws: MultiSigTxRaw[],
      privateKey: PrivateKey
    ): string[][];
    static finishMultiSigTransaction_sendTBC(
      txraw: string,
      sigs: string[][],
      pubKeys: string[]
    ): string;
    static batchFinishMultiSigTransaction_sendTBC(
      txraws: string[],
      sigs: string[][][],
      pubKeys: string[]
    ): string[];
    static p2pkhToMultiSig_transferFT(
      address_from: string,
      address_to: string,
      ft: FT,
      ft_amount: number,
      utxo: Transaction.IUnspentOutput,
      ftutxos: Transaction.IUnspentOutput[],
      preTXs: Transaction[],
      prepreTxDatas: string[],
      privateKey: PrivateKey,
      tbc_amount?: number
    ): string;
    static buildMultiSigTransaction_transferFT(
      address_from: string,
      address_to: string,
      ft: any,
      ft_amount: number,
      utxo: Transaction.IUnspentOutput,
      ftutxos: Transaction.IUnspentOutput[],
      preTXs: Transaction[],
      prepreTxDatas: string[],
      contractTX: Transaction,
      privateKey: PrivateKey
    ): MultiSigTxRaw;
    static signMultiSigTransaction_transferFT(
      address_from: string,
      multiSigTxraw: MultiSigTxRaw,
      privateKey: PrivateKey
    ): string[];
    static batchSignMultiSigTransaction_transferFT(
      multiSig_address: string,
      multiSigTxraws: MultiSigTxRaw[],
      privateKey: PrivateKey
    ): string[][];
    static finishMultiSigTransaction_transferFT(
      txraw: string,
      sigs: string[][],
      pubKeys: string[]
    ): string;
    static batchFinishMultiSigTransaction_transferFT(
      txraws: string[],
      sigs: string[][][],
      pubKeys: string[]
    ): string[];
    static getMultiSigAddress(
      pubKeys: string[],
      signatureCount: number,
      publicKeyCount: number
    ): string;
    static getSignatureAndPublicKeyCount(address: string): {
      signatureCount: number;
      publicKeyCount: number;
    };
    static verifyMultiSigAddress(pubKeys: string[], address: string): boolean;
    static getMultiSigLockScript(address: string): string;
    static getCombineHash(address: string): string;
  }

  export function buildUTXO(
    tx: Transaction,
    vout: number,
    isFT?: boolean
  ): Transaction.IUnspentOutput;

  export function buildFtPrePreTxData(
    preTX: Transaction,
    preTxVout: number,
    localTXs: Transaction[]
  ): string;

  export function selectTXfromLocal(
    txs: Transaction[],
    txid: string
  ): Transaction;

  export function fetchInBatches<T, R>(
    items: T[],
    batchSize: number,
    fetchFn: (batch: T[]) => Promise<R[]>,
    context: string
  ): Promise<R[]>;

  export function getOpCode(number: number): string;
  export function getLpCostAddress(poolCode: string): string;
  export function getLpCostAmount(poolCode: string): number;
  export function isLock(length: number): 0 | 1;
}
