import { PrivateKey, Transaction, Script } from "tbc-lib-js";
declare module 'tbc-contract' {
    export class API {
        static getFTbalance(contractTxid: string, addressOrHash: string, network?: "testnet" | "mainnet"): Promise<bigint>;
        static fetchUTXO(privateKey: PrivateKey, amount: number, network?: "testnet" | "mainnet"): Promise<Transaction.IUnspentOutput>;
        static mergeUTXO(privateKey: PrivateKey, network?: "testnet" | "mainnet"): Promise<boolean>;
        static fetchTXraw(txid: string, network?: "testnet" | "mainnet"): Promise<Transaction>;
        static broadcastTXraw(txraw: string, network?: "testnet" | "mainnet"): Promise<string>;
    }

    export namespace FT {
        interface FtInfo {
            contractTxid?: string;
            codeScript: string;
            tapeScript: string;
            totalSupply: number;
            decimal: number;
            name: string;
            symbol: string;
        }
    }

    export class FT {
        name: string;
        symbol: string;
        decimal: number;
        totalSupply: number;
        codeScript: string;
        tapeScript: string;
        contractTxid: string;
        network: "testnet" | "mainnet"

        constructor(txidOrParams: string | { name: string, symbol: string, amount: number, decimal: number }, network?: "testnet" | "mainnet");
        initialize(): Promise<void>;
        MintFT(privateKey_from: PrivateKey, address_to: string): Promise<string>;
        transfer(privateKey_from: PrivateKey, address_to: string, amount: number): Promise<string>;
        fetchFtTXO(contractTxid: string, addressOrHash: string, amount: bigint): Promise<Transaction.IUnspentOutput>;
        fetchFtInfo(contractTxid: string): Promise<FT.FtInfo>;
        mergeFT(privateKey_from: PrivateKey): Promise<boolean>;
        getFTunlock(privateKey_from: PrivateKey, currentTX: Transaction, currentUnlockIndex: number, preTxId: string, preVout: number): Promise<Script>;
        getFTunlockSwap(privateKey_from: PrivateKey, currentTX: Transaction, currentUnlockIndex: number, preTxId: string, preVout: number): Promise<Script>;
        getFTmintCode(txid: string, vout: number, address: string, tapeSize: number): Script;
        static buildFTtransferCode(code: string, addressOrHash: string): Script;
        static buildFTtransferTape(tape: string, amountHex: string): Script;
        static buildTapeAmount(amountBN: bigint, tapeAmountSet: bigint[], ftInputIndex?: number): { amountHex: string, changeHex: string };
        static getFTbalance(contractTxid: string, addressOrHash: string, network?: "testnet" | "mainnet"): Promise<bigint>;
        static fetchUTXO(privateKey: PrivateKey, amount: number, network?: "testnet" | "mainnet"): Promise<Transaction.IUnspentOutput>;
        static mergeUTXO(privateKey: PrivateKey, network?: "testnet" | "mainnet"): Promise<boolean>;
        static fetchTXraw(txid: string, network?: "testnet" | "mainnet"): Promise<Transaction>;
        static broadcastTXraw(txraw: string, network?: "testnet" | "mainnet"): Promise<string>;
    }

    export namespace poolNFT {
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

        constructor(txidOrParams?: string | {ftContractTxid: string, tbc_amount: number, ft_a: number}, network?: "testnet" | "mainnet");
        initCreate(ftContractTxid?: string): Promise<void>;
        initfromContractId(): Promise<void>;
        createPoolNFT(privateKey_from: PrivateKey): Promise<string>;
        initPoolNFT(privateKey_from: PrivateKey, address_to: string, tbc_amount?: number, ft_a?: number): Promise<string>;
        increaseLP(privateKey_from: PrivateKey, address_to: string, amount_tbc: number): Promise<string>;
        consumLP(privateKey_from: PrivateKey, address_to: string, amount_lp: number): Promise<string>;
        swaptoToken(privateKey_from: PrivateKey, address_to: string, amount_token: number): Promise<string>;
        swaptoTBC(privateKey_from: PrivateKey, address_to: string, amount_tbc: number): Promise<string>;
        fetchPoolNFTInfo(contractTxid: string): Promise<poolNFT.PoolNFTInfo>;
        fetchPoolNftUTXO(contractTxid: string): Promise<Transaction.IUnspentOutput>;
        fetchFtlpUTXO(ftlpCode: string, amount: bigint): Promise<Transaction.IUnspentOutput>;
        mergeFTLP(privateKey_from: PrivateKey): Promise<boolean>;
        mergeFTinPool(privateKey_from: PrivateKey): Promise<boolean>;
        updatePoolNFT(increment: number, ft_a_decimal: number, option: 1 | 2 | 3): poolNFT.poolNFTDifference;
        getPoolNFTunlock(privateKey_from: PrivateKey, currentTX: Transaction, currentUnlockIndex: number, preTxId: string, preVout: number, option: 1 | 2 | 3 | 4, swapOption?: 1 | 2): Promise<Script>;
        getPoolNftCode(txid: string, vout: number): Script;
        getFTLPcode(poolNftCodeHash: string, address: string, tapeSize: number): Script;

    }
}