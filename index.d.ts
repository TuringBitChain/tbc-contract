import { PrivateKey, Transaction, Script } from "tbc-lib-js";
declare module 'tbc-contract' {
    export class API {
        static getFTbalance(contractTxid: string, addressOrHash: string, network?: "testnet" | "mainnet"): Promise<bigint>;
        static fetchFtUTXO(contractTxid: string, addressOrHash: string, amount: bigint, codeScript: string, network?: "testnet" | "mainnet"): Promise<Transaction.IUnspentOutput>;
        static fetchFtUTXOs(contractTxid: string, addressOrHash: string, codeScript: string, network?: "testnet" | "mainnet", amount?: bigint): Promise<Transaction.IUnspentOutput[]>;
        static fetchFtInfo(contractTxid: string, network?: "testnet" | "mainnet"): Promise<FtInfo>;
        static fetchFtPrePreTxData(preTX: Transaction, preTxVout: number, network?: "testnet" | "mainnet"): Promise<string>;
        static getTBCbalance(address: string, network?: "testnet" | "mainnet"): Promise<number>;
        static fetchUTXO(privateKey: PrivateKey, amount: number, network?: "testnet" | "mainnet"): Promise<Transaction.IUnspentOutput>;
        static mergeUTXO(privateKey: PrivateKey, network?: "testnet" | "mainnet"): Promise<boolean>;
        static fetchTXraw(txid: string, network?: "testnet" | "mainnet"): Promise<Transaction>;
        static broadcastTXraw(txraw: string, network?: "testnet" | "mainnet"): Promise<string>;
        static getUTXOs(address: string, amount_tbc: number, network?: "testnet" | "mainnet"): Promise<Transaction.IUnspentOutput[]>;
        static fetchNFTTXO(params: { script: string, tx_hash?: string, network?: "testnet" | "mainnet" }): Promise<Transaction.IUnspentOutput>;
        static fetchNFTInfo(contract_id: string, network?: "testnet" | "mainnet"): Promise<NFTInfo>;
        static fetchUMTXO(script_asm: string, network?: "testnet" | "mainnet"): Promise<Transaction.IUnspentOutput>;
        static getUMTXOs(script_asm: string, amount_tbc: number, network?: "testnet" | "mainnet"): Promise<Transaction.IUnspentOutput[]>;
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
        nftIcon: string
    }

    interface NFTData {
        nftName: string;
        symbol: string;
        discription: string;
        attributes: string;
        file?: string;
    }

    export class NFT {
        constructor(contract_id: string);
        initialize(nftInfo: NFTInfo);
        static createCollection(address: string, privateKey: PrivateKey, data: CollectionData, utxos: Transaction.IUnspentOutput[]): string;
        static createNFT(collection_id: string, address: string, privateKey: PrivateKey, data: NFTData, utxos: Transaction.IUnspentOutput[], nfttxo: Transaction.IUnspentOutput): string;
        transferNFT(address_from: string, address_to: string, privateKey: PrivateKey, utxos: Transaction.IUnspentOutput[], pre_tx: Transaction, pre_pre_tx: Transaction): string;
        static buildCodeScript(tx_hash: string, outputIndex: number): Script;
        static buildHoldScript(address: string): Script;
        static buildMintScript(address: string): Script;
        static buildTapeScript(data: CollectionData | NFTData): Script;
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
        contractTxid: string
        constructor(txidOrParams: string | { name: string, symbol: string, amount: number, decimal: number });
        initialize(ftInfo: FtInfo): void;
        MintFT(privateKey_from: PrivateKey, address_to: string, utxo: Transaction.IUnspentOutput): string[];
        transfer(privateKey_from: PrivateKey, address_to: string, amount: number, ftutxo_a: Transaction.IUnspentOutput[], utxo: Transaction.IUnspentOutput, preTX: Transaction[], prepreTxData: string[]): string;
        transferWithAdditionalInfo(privateKey_from: PrivateKey, address_to: string, amount: number, ftutxo_a: Transaction.IUnspentOutput[], utxo: Transaction.IUnspentOutput, preTX: Transaction[], prepreTxData: string[], additionalInfo: Buffer): string;
        mergeFT(privateKey_from: PrivateKey, ftutxo: Transaction.IUnspentOutput[], utxo: Transaction.IUnspentOutput, preTX: Transaction[], prepreTxData: string[]): string | true;
        getFTunlock(privateKey_from: PrivateKey, currentTX: Transaction, preTX: Transaction, prepreTxData: string, currentUnlockIndex: number, preTxVout: number): Script;
        getFTunlockSwap(privateKey_from: PrivateKey, currentTX: Transaction, preTX: Transaction, prepreTxData: string, contractTX: Transaction, currentUnlockIndex: number, preTxId: string, preVout: number): Script;
        getFTmintCode(txid: string, vout: number, address: string, tapeSize: number): Script;
        static buildFTtransferCode(code: string, addressOrHash: string): Script;
        static buildFTtransferTape(tape: string, amountHex: string): Script;
        static buildTapeAmount(amountBN: bigint, tapeAmountSet: bigint[], ftInputIndex?: number): { amountHex: string, changeHex: string };
    }

    interface PoolNFTInfo {
        ft_lp_amount: bigint;
        ft_a_amount: bigint;
        tbc_amount: bigint;
        ft_lp_partialhash: string;
        ft_a_partialhash: string;
        ft_a_contractTxid: string;
        poolnft_code: string;
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
        network: "testnet" | "mainnet"

        constructor(config?: { txidOrParams?: string | { ftContractTxid: string, tbc_amount: number, ft_a: number }, network?: "testnet" | "mainnet" });
        initCreate(ftContractTxid?: string): Promise<void>;
        initfromContractId(): Promise<void>;
        createPoolNFT(privateKey_from: PrivateKey, utxo: Transaction.IUnspentOutput): Promise<string[]>;
        createPoolNftWithLock(privateKey_from: PrivateKey, utxo: Transaction.IUnspentOutput): Promise<string>;
        initPoolNFT(privateKey_from: PrivateKey, address_to: string, utxo: Transaction.IUnspentOutput, tbc_amount?: number, ft_a?: number): Promise<string>;
        increaseLP(privateKey_from: PrivateKey, address_to: string, utxo: Transaction.IUnspentOutput, amount_tbc: number): Promise<string>;
        consumeLP(privateKey_from: PrivateKey, address_to: string, utxo: Transaction.IUnspentOutput, amount_lp: number): Promise<string>;
        swaptoToken(privateKey_from: PrivateKey, address_to: string, utxo: Transaction.IUnspentOutput, amount_token: number): Promise<string>;
        swaptoToken_baseTBC(privateKey_from: PrivateKey, address_to: string, utxo: Transaction.IUnspentOutput, amount_tbc: number): Promise<string>;
        swaptoTBC(privateKey_from: PrivateKey, address_to: string, utxo: Transaction.IUnspentOutput, amount_tbc: number): Promise<string>;
        swaptoTBC_baseToken(privateKey_from: PrivateKey, address_to: string, utxo: Transaction.IUnspentOutput, amount_token: number): Promise<string>;
        fetchPoolNFTInfo(contractTxid: string): Promise<PoolNFTInfo>;
        fetchPoolNftUTXO(contractTxid: string): Promise<Transaction.IUnspentOutput>;
        fetchFtlpUTXO(ftlpCode: string, amount: bigint): Promise<Transaction.IUnspentOutput>;
        mergeFTLP(privateKey_from: PrivateKey, utxo: Transaction.IUnspentOutput): Promise<boolean | string>;
        mergeFTinPool(privateKey_from: PrivateKey, utxo: Transaction.IUnspentOutput): Promise<boolean | string>;
        updatePoolNFT(increment: number, ft_a_decimal: number, option: 1 | 2 | 3): poolNFTDifference;
        getPoolNFTunlock(privateKey_from: PrivateKey, currentTX: Transaction, currentUnlockIndex: number, preTxId: string, preVout: number, option: 1 | 2 | 3 | 4, swapOption?: 1 | 2): Promise<Script>;
        getPoolNftCode(txid: string, vout: number): Script;
        getPoolNftCodeWithLock(txid: string, vout: number): Script;
        getFTLPcode(poolNftCodeHash: string, address: string, tapeSize: number): Script;
    }
}