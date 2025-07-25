"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const tbc = __importStar(require("tbc-lib-js"));
const ftunlock_1 = require("../util/ftunlock");
const utxoSelect_1 = require("../util/utxoSelect");
class API {
    static mainnetURL = 'https://turingwallet.xyz/v1/tbc/main/';
    static testnetURL = 'https://tbcdev.org/v1/tbc/main/';
    /**
     * Get the base URL for the specified network.
     *
     * @param {("testnet" | "mainnet" | string)} network - The network type or custom URL.
     * @returns {string} The base URL for the specified network.
     */
    static getBaseURL(network) {
        if (network === "testnet") {
            return this.testnetURL;
        }
        else if (network === "mainnet") {
            return this.mainnetURL;
        }
        else {
            return network.endsWith('/') ? network : (network + '/');
        }
    }
    /**
     * Fetches the TBC balance for a given address.
     *
     * @param {string} address - The address to fetch the TBC balance for.
     * @param {("testnet" | "mainnet" | string)} [network] - The network type or custom URL. Defaults to "mainnet" if not specified.
     * @returns {Promise<number>} Returns a Promise that resolves to the TBC balance.
     * @throws {Error} Throws an error if the request fails.
     */
    static async getTBCbalance(address, network) {
        if (!tbc.Address.isValid(address)) {
            throw new Error("Invalid address input");
        }
        let base_url = API.getBaseURL(network || "mainnet");
        const url = base_url + `address/${address}/get/balance/`;
        try {
            const response = await (await fetch(url)).json();
            return response.data.balance;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * Fetches a UTXO that satisfies the required amount.
     *
     * @param {tbc.PrivateKey} privateKey - The private key object.
     * @param {number} amount - The required amount.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<tbc.Transaction.IUnspentOutput>} Returns a Promise that resolves to the UTXO.
     * @throws {Error} Throws an error if the request fails or if the balance is insufficient.
     */
    static async fetchUTXO(privateKey, amount, network) {
        let base_url = network
            ? API.getBaseURL(network)
            : API.getBaseURL("mainnet");
        const address = privateKey.toAddress().toString();
        const url = base_url + `address/${address}/unspent/`;
        const scriptPubKey = tbc.Script.buildPublicKeyHashOut(address)
            .toBuffer()
            .toString("hex");
        const amount_bn = Math.floor(amount * Math.pow(10, 6));
        try {
            const response = await (await fetch(url)).json();
            if (response.length === 0) {
                throw new Error("The tbc balance in the account is zero.");
            }
            if (response.length === 1 && response[0].value > amount_bn) {
                const utxo = {
                    txId: response[0].tx_hash,
                    outputIndex: response[0].tx_pos,
                    script: scriptPubKey,
                    satoshis: response[0].value,
                };
                return utxo;
            }
            else if (response.length === 1 && response[0].value <= amount_bn) {
                throw new Error("Insufficient tbc balance");
            }
            let data = response[0];
            for (let i = 0; i < response.length; i++) {
                if (response[i].value > amount_bn) {
                    data = response[i];
                    break;
                }
            }
            if (data.value < amount_bn) {
                const totalBalance = await this.getTBCbalance(address, network);
                if (totalBalance <= amount_bn) {
                    throw new Error("Insufficient tbc balance");
                }
                else {
                    console.log("Merge UTXO");
                    await API.mergeUTXO(privateKey, network);
                    await new Promise((resolve) => setTimeout(resolve, 3000));
                    return await API.fetchUTXO(privateKey, amount, network);
                }
            }
            const utxo = {
                txId: data.tx_hash,
                outputIndex: data.tx_pos,
                script: scriptPubKey,
                satoshis: data.value,
            };
            return utxo;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * Merges UTXOs for a given private key.
     *
     * @param {tbc.PrivateKey} privateKey - The private key object.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<boolean>} Returns a Promise that resolves to a boolean indicating whether the merge was successful.
     * @throws {Error} Throws an error if the merge fails.
     */
    static async mergeUTXO(privateKey, network) {
        let base_url = network
            ? API.getBaseURL(network)
            : API.getBaseURL("mainnet");
        const address = tbc.Address.fromPrivateKey(privateKey).toString();
        const url = base_url + `address/${address}/unspent/`;
        const scriptPubKey = tbc.Script.buildPublicKeyHashOut(address)
            .toBuffer()
            .toString("hex");
        try {
            const response = await (await fetch(url)).json();
            let sumAmount = 0;
            let utxo = [];
            if (response.length === 0) {
                throw new Error("No UTXO available");
            }
            if (response.length === 1) {
                console.log("Merge Success!");
                return true;
            }
            else {
                for (let i = 0; i < response.length; i++) {
                    sumAmount += response[i].value;
                    utxo.push({
                        txId: response[i].tx_hash,
                        outputIndex: response[i].tx_pos,
                        script: scriptPubKey,
                        satoshis: response[i].value,
                    });
                }
            }
            const tx = new tbc.Transaction().from(utxo);
            const txSize = tx.getEstimateSize() + 100;
            const fee = txSize < 1000 ? 80 : Math.ceil(txSize / 1000) * 80;
            tx.to(address, sumAmount - fee)
                .fee(fee)
                .change(address)
                .sign(privateKey)
                .seal();
            const txraw = tx.uncheckedSerialize();
            await API.broadcastTXraw(txraw, network);
            await new Promise((resolve) => setTimeout(resolve, 5000));
            await API.mergeUTXO(privateKey, network);
            return true;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * Get the FT balance for a specified contract transaction ID and address or hash.
     *
     * @param {string} contractTxid - The contract transaction ID.
     * @param {string} addressOrHash - The address or hash.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<bigint>} Returns a Promise that resolves to the FT balance.
     * @throws {Error} Throws an error if the address or hash is invalid, or if the request fails.
     */
    static async getFTbalance(contractTxid, addressOrHash, network) {
        let base_url = network
            ? API.getBaseURL(network)
            : API.getBaseURL("mainnet");
        let hash = "";
        if (tbc.Address.isValid(addressOrHash)) {
            // If the recipient is an address
            const publicKeyHash = tbc.Address.fromString(addressOrHash).hashBuffer.toString("hex");
            hash = publicKeyHash + "00";
        }
        else {
            // If the recipient is a hash
            if (addressOrHash.length !== 40) {
                throw new Error("Invalid address or hash");
            }
            hash = addressOrHash + "01";
        }
        const url = base_url + `ft/balance/combine/script/${hash}/contract/${contractTxid}`;
        try {
            const response = await (await fetch(url)).json();
            const ftBalance = response.ftBalance;
            return ftBalance;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * Fetches a list of FT UTXOs for a specified contract transaction ID and address or hash.
     *
     * @param {string} contractTxid - The contract transaction ID.
     * @param {string} addressOrHash - The recipient's address or hash.
     * @param {string} codeScript - The code script.
     * @param {("testnet" | "mainnet")} [network] - The network type. Defaults to "mainnet" if not specified.
     * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of FT UTXOs.
     * @throws {Error} Throws an error if the request fails or if no UTXOs are found.
     */
    static async fetchFtUTXOList(contractTxid, addressOrHash, codeScript, network) {
        let base_url = network
            ? API.getBaseURL(network)
            : API.getBaseURL("mainnet");
        let hash = "";
        if (tbc.Address.isValid(addressOrHash)) {
            // If the recipient is an address
            const publicKeyHash = tbc.Address.fromString(addressOrHash).hashBuffer.toString("hex");
            hash = publicKeyHash + "00";
        }
        else {
            // If the recipient is a hash
            if (addressOrHash.length !== 40) {
                throw new Error("Invalid address or hash");
            }
            hash = addressOrHash + "01";
        }
        const url = base_url + `ft/utxo/combine/script/${hash}/contract/${contractTxid}`;
        try {
            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch from URL: ${url}, status: ${response.status}`);
            }
            const responseData = await response.json();
            if (responseData.ftUtxoList.length === 0) {
                throw new Error("The ft balance in the account is zero.");
            }
            let ftutxos = [];
            for (let i = 0; i < responseData.ftUtxoList.length; i++) {
                const data = responseData.ftUtxoList[i];
                ftutxos.push({
                    txId: data.utxoId,
                    outputIndex: data.utxoVout,
                    script: codeScript,
                    satoshis: data.utxoBalance,
                    ftBalance: data.ftBalance,
                });
            }
            return ftutxos;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * Fetches an FT UTXO that satisfies the required amount.
     *
     * @param {string} contractTxid - The contract transaction ID.
     * @param {string} addressOrHash - The recipient's address or hash.
     * @param {bigint} amount - The required amount.
     * @param {string} codeScript - The code script.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<tbc.Transaction.IUnspentOutput>} Returns a Promise that resolves to the FT UTXO.
     * @throws {Error} Throws an error if the request fails or if the FT balance is insufficient.
     */
    static async fetchFtUTXO(contractTxid, addressOrHash, amount, codeScript, network) {
        try {
            const ftutxolist = await API.fetchFtUTXOList(contractTxid, addressOrHash, codeScript, network);
            let ftutxo = ftutxolist[0];
            for (let i = 0; i < ftutxolist.length; i++) {
                if (ftutxolist[i].ftBalance >= amount) {
                    ftutxo = ftutxolist[i];
                    break;
                }
            }
            if (ftutxo.ftBalance < amount) {
                const totalBalance = await API.getFTbalance(contractTxid, addressOrHash, network);
                if (totalBalance >= amount) {
                    throw new Error("Insufficient FTbalance, please merge FT UTXOs");
                }
                else {
                    throw new Error("FTbalance not enough!");
                }
            }
            return ftutxo;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * Fetches FT UTXOs for a specified contract transaction ID and address or hash.
     *
     * @param {string} contractTxid - The contract transaction ID.
     * @param {string} addressOrHash - The recipient's address or hash.
     * @param {string} codeScript - The code script.
     * @param {("testnet" | "mainnet")} [network] - The network type. Defaults to "mainnet" if not specified.
     * @param {bigint} [amount] - The required amount. If not specified, fetches up to 5 UTXOs.
     * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of FT UTXOs.
     * @throws {Error} Throws an error if the request fails or if the FT balance is insufficient.
     */
    static async fetchFtUTXOs(contractTxid, addressOrHash, codeScript, network, amount) {
        try {
            const ftutxolist = await API.fetchFtUTXOList(contractTxid, addressOrHash, codeScript, network);
            ftutxolist.sort((a, b) => (b.ftBalance > a.ftBalance ? 1 : -1));
            let sumBalance = BigInt(0);
            let ftutxos = [];
            if (!amount) {
                for (let i = 0; i < ftutxolist.length && i < 5; i++) {
                    ftutxos.push(ftutxolist[i]);
                }
            }
            else {
                for (let i = 0; i < ftutxolist.length && i < 5; i++) {
                    sumBalance += BigInt(ftutxolist[i].ftBalance);
                    ftutxos.push(ftutxolist[i]);
                    if (sumBalance >= amount)
                        break;
                }
                if (sumBalance < amount) {
                    const totalBalance = await API.getFTbalance(contractTxid, addressOrHash, network);
                    if (totalBalance >= amount) {
                        throw new Error("Insufficient FTbalance, please merge FT UTXOs");
                    }
                    else {
                        throw new Error("FTbalance not enough!");
                    }
                }
            }
            return ftutxos;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * Fetches a specified number of FT UTXOs that satisfy the required amount for a pool.
     *
     * @param {string} contractTxid - The contract transaction ID.
     * @param {string} addressOrHash - The recipient's address or hash.
     * @param {bigint} amount - The required amount.
     * @param {number} number - The number of FT UTXOs to fetch.
     * @param {string} codeScript - The code script.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of FT UTXOs.
     * @throws {Error} Throws an error if the request fails or if the FT balance is insufficient.
     */
    static async fetchFtUTXOsforPool(contractTxid, addressOrHash, amount, number, codeScript, network) {
        if (number <= 0 || !Number.isInteger(number)) {
            throw new Error("Number must be a positive integer greater than 0");
        }
        try {
            const ftutxolist = await API.fetchFtUTXOList(contractTxid, addressOrHash, codeScript, network);
            ftutxolist.sort((a, b) => (b.ftBalance > a.ftBalance ? 1 : -1));
            let sumBalance = BigInt(0);
            let ftutxos = [];
            for (let i = 0; i < ftutxolist.length && i < number; i++) {
                sumBalance += BigInt(ftutxolist[i].ftBalance);
                ftutxos.push(ftutxolist[i]);
                if (sumBalance >= amount && i >= 1)
                    break;
            }
            if (sumBalance < amount) {
                const totalBalance = await API.getFTbalance(contractTxid, addressOrHash, network);
                if (totalBalance >= amount) {
                    throw new Error("Insufficient FTbalance, please merge FT UTXOs");
                }
                else {
                    throw new Error("FTbalance not enough!");
                }
            }
            return ftutxos;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * Fetches the FT information for a given contract transaction ID.
     *
     * @param {string} contractTxid - The contract transaction ID.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<FtInfo>} Returns a Promise that resolves to an FtInfo object containing the FT information.
     * @throws {Error} Throws an error if the request to fetch FT information fails.
     */
    static async fetchFtInfo(contractTxid, network) {
        let base_url = network
            ? API.getBaseURL(network)
            : API.getBaseURL("mainnet");
        const url = base_url + `ft/info/contract/id/${contractTxid}`;
        try {
            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch from URL: ${url}, status: ${response.status}`);
            }
            const data = await response.json();
            const ftInfo = {
                codeScript: data.ftCodeScript,
                tapeScript: data.ftTapeScript,
                totalSupply: data.ftSupply,
                decimal: data.ftDecimal,
                name: data.ftName,
                symbol: data.ftSymbol,
            };
            return ftInfo;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * Fetches the pre-pre transaction data for a given transaction.
     *
     * @param {tbc.Transaction} preTX - The previous transaction.
     * @param {number} preTxVout - The output index of the previous transaction.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<string>} Returns a Promise that resolves to the pre-pre transaction data.
     * @throws {Error} Throws an error if the request fails.
     */
    static async fetchFtPrePreTxData(preTX, preTxVout, network) {
        const preTXtape = Buffer.from(preTX.outputs[preTxVout + 1].script.toBuffer().subarray(3, 51)).toString("hex");
        let prepretxdata = "";
        for (let i = preTXtape.length - 16; i >= 0; i -= 16) {
            const chunk = preTXtape.substring(i, i + 16);
            if (chunk != "0000000000000000") {
                const inputIndex = i / 16;
                const prepreTX = await API.fetchTXraw(preTX.inputs[inputIndex].prevTxId.toString("hex"), network);
                prepretxdata =
                    prepretxdata +
                        (0, ftunlock_1.getPrePreTxdata)(prepreTX, preTX.inputs[inputIndex].outputIndex);
            }
        }
        prepretxdata = "57" + prepretxdata;
        return prepretxdata;
    }
    /**
     * Fetches the Pool NFT information for a given contract transaction ID.
     *
     * @param {string} contractTxid - The contract transaction ID.
     * @param {("testnet" | "mainnet")} [network] - The network type. Defaults to "mainnet" if not specified.
     * @returns {Promise<PoolNFTInfo>} Returns a Promise that resolves to a PoolNFTInfo object containing the Pool NFT information.
     * @throws {Error} Throws an error if the request to fetch Pool NFT information fails.
     */
    static async fetchPoolNftInfo(contractTxid, network) {
        let base_url = network
            ? API.getBaseURL(network)
            : API.getBaseURL("mainnet");
        const url = base_url + `ft/pool/nft/info/contract/id/${contractTxid}`;
        try {
            const response = await (await fetch(url)).json();
            let data = response;
            const poolNftInfo = {
                ft_lp_amount: data.ft_lp_balance,
                ft_a_amount: data.ft_a_balance,
                tbc_amount: data.tbc_balance,
                ft_lp_partialhash: data.ft_lp_partial_hash,
                ft_a_partialhash: data.ft_a_partial_hash,
                ft_a_contractTxid: data.ft_a_contract_txid,
                service_fee_rate: data.pool_service_fee_rate,
                service_provider: data.pool_service_provider,
                poolnft_code: data.pool_nft_code_script,
                pool_version: data.pool_version,
                currentContractTxid: data.current_pool_nft_txid,
                currentContractVout: data.current_pool_nft_vout,
                currentContractSatoshi: data.current_pool_nft_balance,
            };
            return poolNftInfo;
        }
        catch (error) {
            throw new Error("Failed to fetch PoolNFTInfo.");
        }
    }
    /**
     * Fetches the Pool NFT UTXO for a given contract transaction ID.
     *
     * @param {string} contractTxid - The contract transaction ID.
     * @param {("testnet" | "mainnet")} [network] - The network type. Defaults to "mainnet" if not specified.
     * @returns {Promise<tbc.Transaction.IUnspentOutput>} Returns a Promise that resolves to a Pool NFT UTXO.
     * @throws {Error} Throws an error if the request to fetch Pool NFT UTXO fails.
     */
    static async fetchPoolNftUTXO(contractTxid, network) {
        try {
            const poolNftInfo = await API.fetchPoolNftInfo(contractTxid, network);
            const poolnft = {
                txId: poolNftInfo.currentContractTxid,
                outputIndex: poolNftInfo.currentContractVout,
                script: poolNftInfo.poolnft_code,
                satoshis: poolNftInfo.currentContractSatoshi,
            };
            return poolnft;
        }
        catch (error) {
            throw new Error("Failed to fetch PoolNFT UTXO.");
        }
    }
    /**
     * Fetches the FT LP balance for a given FT LP code.
     *
     * @param {string} ftlpCode - The FT LP code.
     * @param {("testnet" | "mainnet")} [network] - The network type. Defaults to "mainnet" if not specified.
     * @returns {Promise<bigint>} Returns a Promise that resolves to the FT LP balance.
     * @throws {Error} Throws an error if the request to fetch FT LP balance fails.
     */
    static async fetchFtlpBalance(ftlpCode, network) {
        const ftlpHash = tbc.crypto.Hash.sha256(Buffer.from(ftlpCode, "hex"))
            .reverse()
            .toString("hex");
        let base_url = network
            ? API.getBaseURL(network)
            : API.getBaseURL("mainnet");
        const url = base_url + `ft/lp/unspent/by/script/hash${ftlpHash}`;
        try {
            const response = await (await fetch(url)).json();
            let ftlpBalance = BigInt(0);
            for (let i = 0; i < response.ftUtxoList.length; i++) {
                ftlpBalance += BigInt(response.ftUtxoList[i].ftBalance);
            }
            return ftlpBalance;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * Fetches an FT LP UTXO that satisfies the required amount for a given FT LP code.
     *
     * @param {string} ftlpCode - The FT LP code.
     * @param {bigint} amount - The required amount.
     * @param {("testnet" | "mainnet")} [network] - The network type. Defaults to "mainnet" if not specified.
     * @returns {Promise<tbc.Transaction.IUnspentOutput>} Returns a Promise that resolves to an FT LP UTXO.
     * @throws {Error} Throws an error if the request to fetch FT LP UTXO fails or if no suitable UTXO is found.
     */
    static async fetchFtlpUTXO(ftlpCode, amount, network) {
        const ftlpHash = tbc.crypto.Hash.sha256(Buffer.from(ftlpCode, "hex"))
            .reverse()
            .toString("hex");
        let base_url = network
            ? API.getBaseURL(network)
            : API.getBaseURL("mainnet");
        const url = base_url + `ft/lp/unspent/by/script/hash${ftlpHash}`;
        try {
            const response = await (await fetch(url)).json();
            let data = response.ftUtxoList[0];
            for (let i = 0; i < response.ftUtxoList.length; i++) {
                if (response.ftUtxoList[i].ftBalance >= amount) {
                    data = response.ftUtxoList[i];
                    break;
                }
            }
            let ftlpBalance = BigInt(0);
            if (data.ftBalance < amount) {
                for (let i = 0; i < response.ftUtxoList.length; i++) {
                    ftlpBalance += BigInt(response.ftUtxoList[i].ftBalance);
                }
                if (ftlpBalance < amount) {
                    throw new Error("Insufficient FT-LP amount");
                }
                else {
                    throw new Error("Please merge FT-LP UTXOs");
                }
            }
            const ftlp = {
                txId: data.utxoId,
                outputIndex: data.utxoVout,
                script: ftlpCode,
                satoshis: data.utxoBalance,
                ftBalance: data.ftBalance,
            };
            return ftlp;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * Fetches the raw transaction data for a given transaction ID.
     *
     * @param {string} txid - The transaction ID to fetch.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<tbc.Transaction>} Returns a Promise that resolves to the transaction object.
     * @throws {Error} Throws an error if the request fails.
     */
    static async fetchTXraw(txid, network) {
        let base_url = network
            ? API.getBaseURL(network)
            : API.getBaseURL("mainnet");
        const url = base_url + `tx/hex/${txid}`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch TXraw: ${response.statusText}`);
            }
            const rawtx = await response.json();
            const tx = new tbc.Transaction();
            tx.fromString(rawtx);
            return tx;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * Broadcasts the raw transaction to the network.
     *
     * @param {string} txraw - The raw transaction hex.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<string>} Returns a Promise that resolves to the response from the broadcast API.
     * @throws {Error} Throws an error if the request fails.
     */
    static async broadcastTXraw(txraw, network) {
        let base_url = network
            ? API.getBaseURL(network)
            : API.getBaseURL("mainnet");
        const url = base_url + `broadcast/tx/raw`;
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    txHex: txraw,
                }),
            });
            if (!response.ok) {
                throw new Error(`Failed to broadcast TXraw: ${response.statusText}`);
            }
            const data = await response.json();
            console.log("txid:", data.result);
            if (data.error && data.error.message) {
                throw new Error(data.error.message);
            }
            return data.result;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * Broadcast multiple raw transactions in batch.
     *
     * @param {Array<{ txHex: string }>} txrawList - An array containing multiple transactions in the format [{ txHex: "string" }].
     * @param {("testnet" | "mainnet")} [network] - The network type, either "testnet" or "mainnet".
     * @returns {Promise<string[]>} Returns a Promise that resolves to a list of successfully broadcasted transaction IDs.
     * @throws {Error} Throws an error if the broadcast fails.
     */
    static async broadcastTXsraw(txrawList, network) {
        let base_url = network
            ? API.getBaseURL(network)
            : API.getBaseURL("mainnet");
        const url = base_url + `broadcast/txs/raw`;
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(txrawList),
            });
            if (!response.ok) {
                throw new Error(`Failed to broadcast transactions: ${response.statusText}`);
            }
            const data = await response.json();
            if (!data.result.invalid) {
                console.log("Broadcast success!");
            }
            else {
                throw new Error(`Broadcast failed!\n ${JSON.stringify(data.result.invalid)}`);
            }
            // console.log("txid:", data.result);
            if (data.error && data.error.message) {
                throw new Error(data.error.message);
            }
            return data.result;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * Fetches the UTXOs for a given address.
     *
     * @param {string} address - The address to fetch UTXOs for.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of UTXOs.
     * @throws {Error} Throws an error if the request fails.
     */
    static async fetchUTXOs(address, network) {
        let base_url = network
            ? API.getBaseURL(network)
            : API.getBaseURL("mainnet");
        const url = base_url + `address/${address}/unspent/`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error("Failed to fetch UTXO: ".concat(response.statusText));
            }
            const data = await response.json();
            if (data.length === 0) {
                throw new Error("The balance in the account is zero.");
            }
            const scriptPubKey = tbc.Script.buildPublicKeyHashOut(address)
                .toBuffer()
                .toString("hex");
            return data.map((utxo) => ({
                txId: utxo.tx_hash,
                outputIndex: utxo.tx_pos,
                script: scriptPubKey,
                satoshis: utxo.value,
            }));
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * Get UTXOs for a given address and amount.
     *
     * @param {string} address - The address to fetch UTXOs for.
     * @param {number} amount_tbc - The required amount in TBC.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of selected UTXOs.
     * @throws {Error} Throws an error if the balance is insufficient.
     */
    static async getUTXOs(address, amount_tbc, network) {
        try {
            let utxos = [];
            if (network) {
                utxos = await this.fetchUTXOs(address, network);
            }
            else {
                utxos = await this.fetchUTXOs(address);
            }
            const amount_satoshis = amount_tbc * Math.pow(10, 6);
            let totalAmount = 0;
            for (const utxo of utxos) {
                totalAmount += utxo.satoshis;
            }
            if (totalAmount < amount_satoshis) {
                throw new Error("Insufficient tbc balance");
            }
            return utxos;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * Fetches an NFT UTXO based on the provided script and optional transaction hash.
     *
     * @param {Object} params - The parameters for fetching the NFT UTXO.
     * @param {string} params.script - The script to fetch the UTXO for.
     * @param {string} [params.tx_hash] - The optional transaction hash to filter the UTXOs.
     * @param {("testnet" | "mainnet")} [params.network] - The network type.
     * @returns {Promise<tbc.Transaction.IUnspentOutput>} Returns a Promise that resolves to the NFT UTXO.
     * @throws {Error} Throws an error if the request fails or no matching UTXO is found.
     */
    static async fetchNFTTXO(params) {
        const { script, tx_hash, network } = params;
        let base_url = network
            ? API.getBaseURL(network)
            : API.getBaseURL("mainnet");
        const script_hash = Buffer.from(tbc.crypto.Hash.sha256(Buffer.from(script, "hex")).toString("hex"), "hex")
            .reverse()
            .toString("hex");
        const url = base_url + `script/hash/${script_hash}/unspent`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error("Failed to fetch UTXO: ".concat(response.statusText));
            }
            const data = await response.json();
            if (tx_hash) {
                const filteredUTXOs = data.filter((item) => item.tx_hash === tx_hash);
                if (filteredUTXOs.length === 0) {
                    throw new Error("No matching UTXO found.");
                }
                const min_vout_utxo = filteredUTXOs.reduce((prev, current) => prev.tx_pos < current.tx_pos ? prev : current);
                return {
                    txId: min_vout_utxo.tx_hash,
                    outputIndex: min_vout_utxo.tx_pos,
                    script: script,
                    satoshis: min_vout_utxo.value,
                };
            }
            else {
                return {
                    txId: data[0].tx_hash,
                    outputIndex: data[0].tx_pos,
                    script: script,
                    satoshis: data[0].value,
                };
            }
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * Fetches the NFT UTXOs for a given script and transaction hash.
     *
     * @param {Object} params - The parameters for fetching the NFT UTXOs.
     * @param {string} params.script - The script to fetch the UTXOs for.
     * @param {string} params.tx_hash - The transaction hash to filter the UTXOs.
     * @param {("testnet" | "mainnet")} [params.network] - The network type.
     * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of NFT UTXOs.
     * @throws {Error} Throws an error if the request fails or no matching UTXO is found.
     */
    static async fetchNFTTXOs(params) {
        const { script, tx_hash, network } = params;
        let base_url = network
            ? API.getBaseURL(network)
            : API.getBaseURL("mainnet");
        const script_hash = Buffer.from(tbc.crypto.Hash.sha256(Buffer.from(script, "hex")).toString("hex"), "hex")
            .reverse()
            .toString("hex");
        const url = base_url + `script/hash/${script_hash}/unspent`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error("Failed to fetch UTXO: ".concat(response.statusText));
            }
            const data = await response.json();
            const filteredUTXOs = data.filter((item) => item.tx_hash === tx_hash);
            if (filteredUTXOs.length === 0) {
                throw new Error("The collection supply has been exhausted.");
            }
            const sortedUTXOs = filteredUTXOs.sort((a, b) => a.tx_pos - b.tx_pos);
            return sortedUTXOs.map((utxo) => ({
                txId: utxo.tx_hash,
                outputIndex: utxo.tx_pos,
                script: script,
                satoshis: utxo.value,
            }));
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * Fetches the NFT information for a given contract ID.
     *
     * @param {string} contract_id - The contract ID to fetch NFT information for.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<NFTInfo>} Returns a Promise that resolves to an NFTInfo object containing the NFT information.
     * @throws {Error} Throws an error if the request to fetch NFT information fails.
     */
    static async fetchNFTInfo(contract_id, network) {
        let base_url = network
            ? API.getBaseURL(network)
            : API.getBaseURL("mainnet");
        const url = base_url + "nft/infos/contract_ids";
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    if_icon_needed: true,
                    nft_contract_list: [contract_id],
                }),
            });
            if (!response.ok) {
                if (!response.ok) {
                    throw new Error("Failed to fetch NFTInfo: ".concat(response.statusText));
                }
            }
            const data = await response.json();
            const nftInfo = {
                collectionId: data.nftInfoList[0].collectionId,
                collectionIndex: data.nftInfoList[0].collectionIndex,
                collectionName: data.nftInfoList[0].collectionName,
                nftCodeBalance: data.nftInfoList[0].nftCodeBalance,
                nftP2pkhBalance: data.nftInfoList[0].nftP2pkhBalance,
                nftName: data.nftInfoList[0].nftName,
                nftSymbol: data.nftInfoList[0].nftSymbol,
                nft_attributes: data.nftInfoList[0].nft_attributes,
                nftDescription: data.nftInfoList[0].nftDescription,
                nftTransferTimeCount: data.nftInfoList[0].nftTransferTimeCount,
                nftIcon: data.nftInfoList[0].nftIcon,
            };
            return nftInfo;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * Fetches the NFTs for a given collection ID and address.
     *
     * @param {string} collection_id - The collection ID to fetch NFTs for.
     * @param {string} address - The address to filter NFTs by.
     * @param {number} number - The number of NFTs to fetch.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<string[]>} Returns a Promise that resolves to an array of NFT contract IDs.
     * @throws {Error} Throws an error if the request fails.
     */
    static async fetchNFTs(collection_id, address, number, network) {
        let base_url = network
            ? API.getBaseURL(network)
            : API.getBaseURL("mainnet");
        const url = base_url + `nft/collection/id/${collection_id}/page/0/size/${number}`;
        try {
            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch NFTs: ${response.statusText}`);
            }
            const data = await response.json();
            if (data.nftList && Array.isArray(data.nftList)) {
                const filteredNFTs = data.nftList.filter((nft) => nft.nftHolder === address);
                return filteredNFTs.map((nft) => nft.nftContractId);
            }
            return [];
        }
        catch (error) {
            throw new Error(`Error fetching NFTs: ${error.message}`);
        }
    }
    /**
     * Fetches the UMTXO for a given script.
     *
     * @param {string} script_asm - The script to fetch the UMTXO for.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<tbc.Transaction.IUnspentOutput>} Returns a Promise that resolves to the UMTXO.
     * @throws {Error} Throws an error if the request fails.
     */
    static async fetchUMTXO(script_asm, tbc_amount, network) {
        const multiScript = tbc.Script.fromASM(script_asm).toHex();
        const amount_satoshis = Math.floor(tbc_amount * Math.pow(10, 6));
        const script_hash = Buffer.from(tbc.crypto.Hash.sha256(Buffer.from(multiScript, "hex")).toString("hex"), "hex")
            .reverse()
            .toString("hex");
        let base_url = network
            ? API.getBaseURL(network)
            : API.getBaseURL("mainnet");
        const url = base_url + `script/hash/${script_hash}/unspent/`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch UTXO: ${response.statusText}`);
            }
            const data = await response.json();
            if (data.length === 0) {
                throw new Error("The balance in the account is zero.");
            }
            let selectedUTXO = data[0];
            for (let i = 0; i < data.length; i++) {
                if (data[i].value > amount_satoshis && data[i].value < 3200000000) {
                    selectedUTXO = data[i];
                    break;
                }
            }
            if (selectedUTXO.value < amount_satoshis) {
                let balance = 0;
                for (let i = 0; i < data.length; i++) {
                    balance += data[i].value;
                }
                if (balance < amount_satoshis) {
                    throw new Error("Insufficient tbc balance");
                }
                else {
                    throw new Error("Please mergeUTXO");
                }
            }
            const umtxo = {
                txId: selectedUTXO.tx_hash,
                outputIndex: selectedUTXO.tx_pos,
                script: multiScript,
                satoshis: selectedUTXO.value,
            };
            return umtxo;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * Fetches all UMTXOs for a given script.
     *
     * @param {string} script_asm - The script to fetch UMTXOs for.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of UMTXOs.
     * @throws {Error} Throws an error if the request fails.
     */
    static async fetchUMTXOs(script_asm, network) {
        const multiScript = tbc.Script.fromASM(script_asm).toHex();
        const script_hash = Buffer.from(tbc.crypto.Hash.sha256(Buffer.from(multiScript, "hex")).toString("hex"), "hex")
            .reverse()
            .toString("hex");
        let base_url = network
            ? API.getBaseURL(network)
            : API.getBaseURL("mainnet");
        const url = base_url + `script/hash/${script_hash}/unspent/`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch UTXO: ${response.statusText}`);
            }
            const data = await response.json();
            if (data.length === 0) {
                throw new Error("The balance in the account is zero.");
            }
            const umtxos = data.map((utxo) => {
                return {
                    txId: utxo.tx_hash,
                    outputIndex: utxo.tx_pos,
                    script: multiScript,
                    satoshis: utxo.value,
                };
            });
            return umtxos;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * Get UMTXOs for a given address and amount.
     *
     * @param {string} address - The address to fetch UMTXOs for.
     * @param {number} amount_tbc - The required amount in TBC.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of selected UMTXOs.
     * @throws {Error} Throws an error if the balance is insufficient.
     */
    static async getUMTXOs(script_asm, amount_tbc, network) {
        try {
            let umtxos = [];
            if (network) {
                umtxos = await this.fetchUMTXOs(script_asm, network);
            }
            else {
                umtxos = await this.fetchUMTXOs(script_asm);
            }
            const amount_satoshis = amount_tbc * Math.pow(10, 6);
            let totalSatoshis = 0;
            for (const umtxo of umtxos) {
                totalSatoshis += umtxo.satoshis;
            }
            if (totalSatoshis < amount_satoshis) {
                throw new Error("Insufficient tbc balance");
            }
            return umtxos;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * Fetches the FT UTXOs for a given contract and multiSig address.
     *
     * @param {string} contractTxid - The contract TXID.
     * @param {string} addressOrHash - The address or hash to fetch UMTXOs for.
     * @param {string} codeScript - The code script.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of UMTXOs.
     * @throws {Error} Throws an error if the request fails.
     */
    static async fetchFtUTXOS_multiSig(contractTxid, addressOrHash, codeScript, network) {
        let base_url = network
            ? API.getBaseURL(network)
            : API.getBaseURL("mainnet");
        let hash = "";
        if (tbc.Address.isValid(addressOrHash)) {
            const publicKeyHash = tbc.Address.fromString(addressOrHash).hashBuffer.toString("hex");
            hash = publicKeyHash + "00";
        }
        else {
            if (addressOrHash.length !== 40) {
                throw new Error("Invalid address or hash");
            }
            hash = addressOrHash + "01";
        }
        try {
            const url = base_url + `ft/utxo/combine/script/${hash}/contract/${contractTxid}`;
            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch from URL: ${url}, status: ${response.status}`);
            }
            const responseData = await response.json();
            if (responseData.ftUtxoList.length === 0) {
                throw new Error("The ft balance in the account is zero.");
            }
            let sortedData = responseData.ftUtxoList.sort((a, b) => {
                if (a.ftBalance < b.ftBalance)
                    return -1;
                if (a.ftBalance > b.ftBalance)
                    return 1;
                return 0;
            });
            let ftutxos = [];
            for (let i = 0; i < sortedData.length; i++) {
                ftutxos.push({
                    txId: sortedData[i].utxoId,
                    outputIndex: sortedData[i].utxoVout,
                    script: codeScript,
                    satoshis: sortedData[i].utxoBalance,
                    ftBalance: sortedData[i].ftBalance,
                });
            }
            return ftutxos;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * Fetches the FT UTXOs for a given contract and multiSig address.
     *
     * @param {string} contractTxid - The contract TXID.
     * @param {string} addressOrHash - The address or hash to fetch UMTXOs for.
     * @param {string} codeScript - The code script.
     * @param {bigint} amount - The amount to fetch UMTXOs for.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of UMTXOs.
     * @throws {Error} Throws an error if the request fails.
     */
    static async getFtUTXOS_multiSig(contractTxid, addressOrHash, codeScript, amount, network) {
        let base_url = network
            ? API.getBaseURL(network)
            : API.getBaseURL("mainnet");
        let hash = "";
        if (tbc.Address.isValid(addressOrHash)) {
            const publicKeyHash = tbc.Address.fromString(addressOrHash).hashBuffer.toString("hex");
            hash = publicKeyHash + "00";
        }
        else {
            if (addressOrHash.length !== 40) {
                throw new Error("Invalid address or hash");
            }
            hash = addressOrHash + "01";
        }
        try {
            const url = base_url + `ft/utxo/combine/script/${hash}/contract/${contractTxid}`;
            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch from URL: ${url}, status: ${response.status}`);
            }
            const responseData = await response.json();
            if (responseData.ftUtxoList.length === 0) {
                throw new Error("The ft balance in the account is zero.");
            }
            let sortedData = responseData.ftUtxoList.sort((a, b) => {
                if (a.ftBalance < b.ftBalance)
                    return -1;
                if (a.ftBalance > b.ftBalance)
                    return 1;
                return 0;
            });
            let ftutxos = [];
            for (let i = 0; i < sortedData.length; i++) {
                ftutxos.push({
                    txId: sortedData[i].utxoId,
                    outputIndex: sortedData[i].utxoVout,
                    script: codeScript,
                    satoshis: sortedData[i].utxoBalance,
                    ftBalance: sortedData[i].ftBalance,
                });
            }
            const ftBalanceArray = ftutxos.map((item) => BigInt(item.ftBalance));
            const totalBalance = ftBalanceArray.reduce((sum, balance) => sum + balance, 0n);
            if (totalBalance < amount) {
                throw new Error("Insufficient FT balance");
            }
            if (ftutxos.length <= 5) {
                return ftutxos;
            }
            const result_five = (0, utxoSelect_1.findMinFiveSum)(ftBalanceArray, amount);
            if (result_five) {
                return [
                    ftutxos[result_five[0]],
                    ftutxos[result_five[1]],
                    ftutxos[result_five[2]],
                    ftutxos[result_five[3]],
                    ftutxos[result_five[4]],
                ];
            }
            else {
                throw new Error("Please merge MultiSig UTXO");
            }
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
}
module.exports = API;
