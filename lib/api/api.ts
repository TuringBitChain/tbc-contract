import * as tbc from 'tbc-lib-js';
import { getPrePreTxdata } from '../util/ftunlock';
import { findMinFiveSum, findMinFourSum, findMinThreeSum, findMinTwoSum } from '../util/utxoSelect';

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

interface FtInfo {
    contractTxid?: string;
    codeScript: string;
    tapeScript: string;
    totalSupply: number;
    decimal: number;
    name: string;
    symbol: string;
}

interface FTUnspentOutput {
    utxoId: string;
    utxoVout: number;
    utxoBalance: number;
    ftContractId: string;
    ftBalance: bigint;
}

class API {
    /**
     * Get the base URL for the specified network.
     *
     * @param {("testnet" | "mainnet")} network - The network type.
     * @returns {string} The base URL for the specified network.
     */
    private static getBaseURL(network: "testnet" | "mainnet"): string {
        const url_testnet = `https://tbcdev.org/v1/tbc/main/`;
        const url_mainnet = `https://turingwallet.xyz/v1/tbc/main/`;
        const base_url = network == "testnet" ? url_testnet : url_mainnet;
        return base_url;
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
    static async getFTbalance(contractTxid: string, addressOrHash: string, network?: "testnet" | "mainnet"): Promise<bigint> {
        let base_url = "";
        if (network) {
            base_url = API.getBaseURL(network)
        } else {
            base_url = API.getBaseURL("mainnet")
        }
        let hash = '';
        if (tbc.Address.isValid(addressOrHash)) {
            // If the recipient is an address
            const publicKeyHash = tbc.Address.fromString(addressOrHash).hashBuffer.toString('hex');
            hash = publicKeyHash + '00';
        } else {
            // If the recipient is a hash
            if (addressOrHash.length !== 40) {
                throw new Error('Invalid address or hash');
            }
            hash = addressOrHash + '01';
        }
        const url = base_url + `ft/balance/combine/script/${hash}/contract/${contractTxid}`;
        try {
            const response = await (await fetch(url)).json();
            const ftBalance = response.ftBalance;
            return ftBalance;
        } catch (error) {
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
    static async fetchFtUTXO(contractTxid: string, addressOrHash: string, amount: bigint, codeScript: string, network?: "testnet" | "mainnet"): Promise<tbc.Transaction.IUnspentOutput> {
        let base_url = "";
        if (network) {
            base_url = API.getBaseURL(network)
        } else {
            base_url = API.getBaseURL("mainnet")
        }
        let hash = '';
        if (tbc.Address.isValid(addressOrHash)) {
            // If the recipient is an address
            const publicKeyHash = tbc.Address.fromString(addressOrHash).hashBuffer.toString('hex');
            hash = publicKeyHash + '00';
        } else {
            // If the recipient is a hash
            if (addressOrHash.length !== 40) {
                throw new Error('Invalid address or hash');
            }
            hash = addressOrHash + '01';
        }
        const url = base_url + `ft/utxo/combine/script/${hash}/contract/${contractTxid}`;
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch from URL: ${url}, status: ${response.status}`);
            }
            const responseData = await response.json();
            if (responseData.ftUtxoList.length === 0) {
                throw new Error('The ft balance in the account is zero.');
            }
            let data = responseData.ftUtxoList[0];
            for (let i = 0; i < responseData.ftUtxoList.length; i++) {
                if (responseData.ftUtxoList[i].ftBalance >= amount) {
                    data = responseData.ftUtxoList[i];
                    break;
                }
            }
            if (data.ftBalance < amount) {
                const totalBalance = await API.getFTbalance(contractTxid, addressOrHash, network);
                if (totalBalance >= amount) {
                    throw new Error('Insufficient FTbalance, please merge FT UTXOs');
                } else {
                    throw new Error('FTbalance not enough!');
                }
            }
            const fttxo: tbc.Transaction.IUnspentOutput = {
                txId: data.utxoId,
                outputIndex: data.utxoVout,
                script: codeScript,
                satoshis: data.utxoBalance,
                ftBalance: data.ftBalance
            }
            return fttxo;
        } catch (error) {
            throw new Error(error.message);
        }
    }

    static async fetchFtUTXOs(contractTxid: string, addressOrHash: string, codeScript: string, network?: "testnet" | "mainnet", amount?: bigint): Promise<tbc.Transaction.IUnspentOutput[]> {
        let base_url = "";
        if (network) {
            base_url = API.getBaseURL(network)
        } else {
            base_url = API.getBaseURL("mainnet")
        }
        let hash = '';
        if (tbc.Address.isValid(addressOrHash)) {
            // If the recipient is an address
            const publicKeyHash = tbc.Address.fromString(addressOrHash).hashBuffer.toString('hex');
            hash = publicKeyHash + '00';
        } else {
            // If the recipient is a hash
            if (addressOrHash.length !== 40) {
                throw new Error('Invalid address or hash');
            }
            hash = addressOrHash + '01';
        }
        const url = base_url + `ft/utxo/combine/script/${hash}/contract/${contractTxid}`;
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch from URL: ${url}, status: ${response.status}`);
            }
            const responseData = await response.json();
            if (responseData.ftUtxoList.length === 0) {
                throw new Error('The ft balance in the account is zero.');
            }
            let sortedData: FTUnspentOutput[] = responseData.ftUtxoList.sort((a: FTUnspentOutput, b: FTUnspentOutput) => b.ftBalance - a.ftBalance);
            let sumBalance = BigInt(0);
            let ftutxos: tbc.Transaction.IUnspentOutput[] = [];
            if (!amount) {
                for (let i = 0; i < sortedData.length && i < 5; i++) {
                    sumBalance += BigInt(sortedData[i].ftBalance);
                    ftutxos.push({
                        txId: sortedData[i].utxoId,
                        outputIndex: sortedData[i].utxoVout,
                        script: codeScript,
                        satoshis: sortedData[i].utxoBalance,
                        ftBalance: sortedData[i].ftBalance
                    });
                }
            } else {
                for (let i = 0; i < sortedData.length && i < 5; i++) {
                    sumBalance += BigInt(sortedData[i].ftBalance);
                    ftutxos.push({
                        txId: sortedData[i].utxoId,
                        outputIndex: sortedData[i].utxoVout,
                        script: codeScript,
                        satoshis: sortedData[i].utxoBalance,
                        ftBalance: sortedData[i].ftBalance
                    });
                    if (sumBalance >= amount) {
                        break;
                    }
                }
                if (sumBalance < amount) {
                    const totalBalance = await API.getFTbalance(contractTxid, addressOrHash, network);
                    if (totalBalance >= amount!) {
                        throw new Error('Insufficient FTbalance, please merge FT UTXOs');
                    } else {
                        throw new Error('FTbalance not enough!');
                    }
                }
            }
            return ftutxos;
        } catch (error) {
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
    static async fetchFtInfo(contractTxid: string, network?: "testnet" | "mainnet"): Promise<FtInfo> {
        let base_url = "";
        if (network) {
            base_url = API.getBaseURL(network)
        } else {
            base_url = API.getBaseURL("mainnet")
        }
        const url = base_url + `ft/info/contract/id/${contractTxid}`;
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch from URL: ${url}, status: ${response.status}`);
            }
            const data = await response.json();
            const ftInfo: FtInfo = {
                codeScript: data.ftCodeScript,
                tapeScript: data.ftTapeScript,
                totalSupply: data.ftSupply,
                decimal: data.ftDecimal,
                name: data.ftName,
                symbol: data.ftSymbol
            }
            return ftInfo;
        } catch (error) {
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
    static async fetchFtPrePreTxData(preTX: tbc.Transaction, preTxVout: number, network?: "testnet" | "mainnet"): Promise<string> {
        const preTXtape = preTX.outputs[preTxVout + 1].script.toBuffer().subarray(3, 51).toString('hex');
        let prepretxdata = '';
        for (let i = preTXtape.length - 16; i >= 0; i -= 16) {
            const chunk = preTXtape.substring(i, i + 16);
            if (chunk != '0000000000000000') {
                const inputIndex = i / 16;
                const prepreTX = await API.fetchTXraw(preTX.inputs[inputIndex].prevTxId.toString('hex'), network);
                prepretxdata = prepretxdata + getPrePreTxdata(prepreTX, preTX.inputs[inputIndex].outputIndex);
            }
        }
        prepretxdata = '57' + prepretxdata;
        return prepretxdata;
    }

    /**
     * Fetches the TBC balance for a given address.
     *
     * @param {string} address - The address to fetch the TBC balance for.
     * @param {("testnet" | "mainnet")} [network] - The network type. Defaults to "mainnet" if not specified.
     * @returns {Promise<number>} Returns a Promise that resolves to the TBC balance.
     * @throws {Error} Throws an error if the request fails.
     */
    static async getTBCbalance(address: string, network?: "testnet" | "mainnet"): Promise<number> {
        if (!tbc.Address.isValid(address)) {
            throw new Error('Invalid address input');
        }
        let base_url = "";
        if (network) {
            base_url = API.getBaseURL(network)
        } else {
            base_url = API.getBaseURL("mainnet")
        }
        const url = base_url + `address/${address}/get/balance/`;
        try {
            const response = await (await fetch(url)).json();
            return response.data.balance;
        } catch (error) {
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
    static async fetchUTXO(privateKey: tbc.PrivateKey, amount: number, network?: "testnet" | "mainnet"): Promise<tbc.Transaction.IUnspentOutput> {
        let base_url = "";
        if (network) {
            base_url = API.getBaseURL(network)
        } else {
            base_url = API.getBaseURL("mainnet")
        }
        const address = privateKey.toAddress().toString();
        const url = base_url + `address/${address}/unspent/`;
        const scriptPubKey = tbc.Script.buildPublicKeyHashOut(address).toBuffer().toString('hex');
        const amount_bn = Math.ceil(amount * Math.pow(10, 6));
        try {
            const response = await (await fetch(url)).json();
            if (response.length === 0) {
                throw new Error('The balance in the account is zero.');
            }
            if (response.length === 1 && response[0].value > amount_bn) {
                const utxo: tbc.Transaction.IUnspentOutput = {
                    txId: response[0].tx_hash,
                    outputIndex: response[0].tx_pos,
                    script: scriptPubKey,
                    satoshis: response[0].value
                }
                return utxo;
            } else if (response.length === 1 && response[0].value <= amount_bn) {
                throw new Error('Insufficient balance');
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
                    throw new Error('Insufficient balance');
                } else {
                    console.log('Please merge UTXO!');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    await API.mergeUTXO(privateKey, network);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    return await API.fetchUTXO(privateKey, amount, network);
                }
            }
            const utxo: tbc.Transaction.IUnspentOutput = {
                txId: data.tx_hash,
                outputIndex: data.tx_pos,
                script: scriptPubKey,
                satoshis: data.value
            }
            return utxo;
        } catch (error) {
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
    static async mergeUTXO(privateKey: tbc.PrivateKey, network?: "testnet" | "mainnet"): Promise<boolean> {
        let base_url = "";
        if (network) {
            base_url = API.getBaseURL(network)
        } else {
            base_url = API.getBaseURL("mainnet")
        }
        const address = tbc.Address.fromPrivateKey(privateKey).toString();
        const url = base_url + `address/${address}/unspent/`;
        const scriptPubKey = tbc.Script.buildPublicKeyHashOut(address).toBuffer().toString('hex');
        try {
            const response = await (await fetch(url)).json();
            let sumAmount = 0;
            let utxo: tbc.Transaction.IUnspentOutput[] = [];
            if (response.length === 0) {
                throw new Error('No UTXO available');
            }
            if (response.length === 1) {
                console.log('Merge Success!');
                return true;
            } else {
                for (let i = 0; i < response.length; i++) {
                    sumAmount += response[i].value;
                    utxo.push({
                        txId: response[i].tx_hash,
                        outputIndex: response[i].tx_pos,
                        script: scriptPubKey,
                        satoshis: response[i].value
                    });
                }
            }
            const tx = new tbc.Transaction()
                .from(utxo)
                .to(address, sumAmount - 500)
                .fee(500)
                .change(address)
                .sign(privateKey)
                .seal();
            const txraw = tx.uncheckedSerialize();
            await API.broadcastTXraw(txraw, network);
            await new Promise(resolve => setTimeout(resolve, 3000));
            await API.mergeUTXO(privateKey, network);
            return true;
        } catch (error) {
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
    static async fetchTXraw(txid: string, network?: "testnet" | "mainnet"): Promise<tbc.Transaction> {
        let base_url = "";
        if (network) {
            base_url = API.getBaseURL(network)
        } else {
            base_url = API.getBaseURL("mainnet")
        }
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
        } catch (error) {
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
    static async broadcastTXraw(txraw: string, network?: "testnet" | "mainnet"): Promise<string> {
        let base_url = "";
        if (network) {
            base_url = API.getBaseURL(network)
        } else {
            base_url = API.getBaseURL("mainnet")
        }
        const url = base_url + `broadcast/tx/raw`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    txHex: txraw
                })
            });
            if (!response.ok) {
                throw new Error(`Failed to broadcast TXraw: ${response.statusText}`);
            }
            const data = await response.json();
            console.log('txid:', data.result);
            if (data.error) {
                console.log('error:', data.error);
            }
            return data.result;
        } catch (error) {
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
    private static async fetchUTXOs(address: string, network?: "testnet" | "mainnet"): Promise<tbc.Transaction.IUnspentOutput[]> {
        let base_url = "";
        if (network) {
            base_url = API.getBaseURL(network)
        } else {
            base_url = API.getBaseURL("mainnet")
        }
        const url = base_url + `address/${address}/unspent/`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error("Failed to fetch UTXO: ".concat(response.statusText));
            }
            const data: { tx_hash: string; tx_pos: number; height: number; value: number; }[] = await response.json();
            if (data.length === 0) {
                throw new Error('The balance in the account is zero.');
            }
            const scriptPubKey = tbc.Script.buildPublicKeyHashOut(address).toBuffer().toString('hex');

            return data.map((utxo) => ({
                txId: utxo.tx_hash,
                outputIndex: utxo.tx_pos,
                script: scriptPubKey,
                satoshis: utxo.value
            }));
        } catch (error) {
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
    static async getUTXOs(address: string, amount_tbc: number, network?: "testnet" | "mainnet"): Promise<tbc.Transaction.IUnspentOutput[]> {
        try {
            let utxos: tbc.Transaction.IUnspentOutput[] = [];
            if (network) {
                utxos = await this.fetchUTXOs(address, network);
            } else {
                utxos = await this.fetchUTXOs(address);
            }
            utxos.sort((a, b) => a.satoshis - b.satoshis);
            const amount_satoshis = amount_tbc * Math.pow(10, 6);
            const closestUTXO = utxos.find(utxo => utxo.satoshis >= amount_satoshis + 100000);
            if (closestUTXO) {
                return [closestUTXO];
            }

            let totalAmount = 0;
            const selectedUTXOs: tbc.Transaction.IUnspentOutput[] = [];

            for (const utxo of utxos) {
                totalAmount += utxo.satoshis;
                selectedUTXOs.push(utxo);

                if (totalAmount >= amount_satoshis) {
                    break;
                }
            }

            if (totalAmount < amount_satoshis) {
                throw new Error("Insufficient balance");
            }

            return selectedUTXOs;
        } catch (error) {
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
    static async fetchNFTTXO(params: { script: string, tx_hash?: string, network?: "testnet" | "mainnet" }): Promise<tbc.Transaction.IUnspentOutput> {
        const { script, tx_hash, network } = params;
        let base_url = "";
        if (network) {
            base_url = API.getBaseURL(network)
        } else {
            base_url = API.getBaseURL("mainnet")
        }
        const script_hash = Buffer.from(tbc.crypto.Hash.sha256(Buffer.from(script, "hex")).toString("hex"), "hex").reverse().toString("hex");
        const url = base_url + `script/hash/${script_hash}/unspent`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error("Failed to fetch UTXO: ".concat(response.statusText));
            }
            const data: { tx_hash: string; tx_pos: number; height: number; value: number; }[] = await response.json();
            if (tx_hash) {
                const filteredUTXOs = data.filter(item => item.tx_hash === tx_hash);

                if (filteredUTXOs.length === 0) {
                    throw new Error('No matching UTXO found.');
                }

                const min_vout_utxo = filteredUTXOs.reduce((prev, current) =>
                    prev.tx_pos < current.tx_pos ? prev : current
                );

                return {
                    txId: min_vout_utxo.tx_hash,
                    outputIndex: min_vout_utxo.tx_pos,
                    script: script,
                    satoshis: min_vout_utxo.value
                }
            } else {
                return {
                    txId: data[0].tx_hash,
                    outputIndex: data[0].tx_pos,
                    script: script,
                    satoshis: data[0].value
                }
            }

        } catch (error) {
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
    static async fetchNFTInfo(contract_id: string, network?: "testnet" | "mainnet"): Promise<NFTInfo> {
        let base_url = "";
        if (network) {
            base_url = API.getBaseURL(network)
        } else {
            base_url = API.getBaseURL("mainnet")
        }
        const url = base_url + "nft/infos/contract_ids"
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    if_icon_needed: true,
                    nft_contract_list: [contract_id]
                })
            });
            if (!response.ok) {
                if (!response.ok) {
                    throw new Error("Failed to fetch NFTInfo: ".concat(response.statusText));
                }
            }
            const data = await response.json();

            const nftInfo: NFTInfo = {
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
                nftIcon: data.nftInfoList[0].nftIcon
            }

            return nftInfo;
        } catch (error) {
            throw new Error(error.message);
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
    static async fetchUMTXO(script_asm: string, network?: "testnet" | "mainnet"): Promise<tbc.Transaction.IUnspentOutput> {
        const multiScript = tbc.Script.fromASM(script_asm).toHex();

        const script_hash = Buffer.from(tbc.crypto.Hash.sha256(Buffer.from(multiScript, "hex")).toString("hex"), "hex").reverse().toString("hex");
        let base_url = "";
        if (network) {
            base_url = API.getBaseURL(network)
        } else {
            base_url = API.getBaseURL("mainnet")
        }
        const url = base_url + `script/hash/${script_hash}/unspent/`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch UTXO: ${response.statusText}`);
            }
            const data = await response.json();
            if (data.length === 0) {
                throw new Error('The balance in the account is zero.');
            }
            let selectedUTXO = data[0];
            for (let i = 0; i < data.length; i++) {
                if (data[i].value > 10000 && data[i].value < 3200000000) {
                    selectedUTXO = data[i];
                    break;
                }
            }

            if (selectedUTXO.value < 10000) {
                let balance = 0;
                for (let i = 0; i < data.length; i++) {
                    balance += data[i].value;
                }
                if (balance < 10000) {
                    throw new Error('Insufficient balance');
                } else {
                    throw new Error('Please mergeUTXO');
                }
            }

            const umtxo: tbc.Transaction.IUnspentOutput = {
                txId: selectedUTXO.tx_hash,
                outputIndex: selectedUTXO.tx_pos,
                script: multiScript,
                satoshis: selectedUTXO.value
            };
            return umtxo;
        } catch (error) {
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
    private static async fetchUMTXOs(script_asm: string, network?: "testnet" | "mainnet"): Promise<tbc.Transaction.IUnspentOutput[]> {
        const multiScript = tbc.Script.fromASM(script_asm).toHex();

        const script_hash = Buffer.from(tbc.crypto.Hash.sha256(Buffer.from(multiScript, "hex")).toString("hex"), "hex").reverse().toString("hex");
        let base_url = "";
        if (network) {
            base_url = API.getBaseURL(network);
        } else {
            base_url = API.getBaseURL("mainnet");
        }
        const url = base_url + `script/hash/${script_hash}/unspent/`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch UTXO: ${response.statusText}`);
            }
            const data = await response.json();
            if (data.length === 0) {
                throw new Error('The balance in the account is zero.');
            }
            const umtxos = data.map((utxo) => {
                return {
                    txId: utxo.tx_hash,
                    outputIndex: utxo.tx_pos,
                    script: multiScript,
                    satoshis: utxo.value
                } as tbc.Transaction.IUnspentOutput;
            });

            return umtxos;
        } catch (error) {
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
    static async getUMTXOs(script_asm: string, amount_tbc: number, network?: "testnet" | "mainnet"): Promise<tbc.Transaction.IUnspentOutput[]> {
        try {
            let umtxos: tbc.Transaction.IUnspentOutput[] = [];
            if (network) {
                umtxos = await this.fetchUMTXOs(script_asm, network);
            } else {
                umtxos = await this.fetchUMTXOs(script_asm);
            }
            umtxos.sort((a, b) => a.satoshis - b.satoshis);
            const amount_satoshis = amount_tbc * Math.pow(10, 6);
            const closestUMTXO = umtxos.find(umtxo => umtxo.satoshis >= amount_satoshis + 100000);
            if (closestUMTXO) {
                return [closestUMTXO];
            }

            let totalSatoshis = 0;
            let selectedUMTXOs: tbc.Transaction.IUnspentOutput[] = [];

            for (const umtxo of umtxos) {
                totalSatoshis += umtxo.satoshis;
                selectedUMTXOs.push(umtxo);

                if (totalSatoshis >= amount_satoshis) {
                    break;
                }
            }

            if (totalSatoshis < amount_satoshis) {
                throw new Error("Insufficient balance");
            }

            return selectedUMTXOs;
        } catch (error) {
            throw new Error(error.message);
        }
    }

    /**
     * Fetches the UMTXOs for a given contract and address.
     *
     * @param {string} contractTxid - The contract TXID.
     * @param {string} addressOrHash - The address or hash to fetch UMTXOs for.
     * @param {string} codeScript - The code script.
     * @param {bigint} amount - The amount to fetch UMTXOs for.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of UMTXOs.
     * @throws {Error} Throws an error if the request fails.
     */
    static async fetchFtUTXOS_multiSig(contractTxid: string, addressOrHash: string, codeScript: string, amount: bigint, network?: "testnet" | "mainnet"): Promise<tbc.Transaction.IUnspentOutput[]> {
        let base_url = network ? API.getBaseURL(network) : API.getBaseURL("mainnet");
        let hash = '';
        if (tbc.Address.isValid(addressOrHash)) {
            const publicKeyHash = tbc.Address.fromString(addressOrHash).hashBuffer.toString('hex');
            hash = publicKeyHash + '00';
        } else {
            if (addressOrHash.length !== 40) {
                throw new Error('Invalid address or hash');
            }
            hash = addressOrHash + '01';
        }
        try {
            const url = base_url + `ft/utxo/combine/script/${hash}/contract/${contractTxid}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch from URL: ${url}, status: ${response.status}`);
            }
            const responseData = await response.json();
            if (responseData.ftUtxoList.length === 0) {
                throw new Error('The ft balance in the account is zero.');
            }
            let sortedData: FTUnspentOutput[] = responseData.ftUtxoList.sort((a: FTUnspentOutput, b: FTUnspentOutput) => a.ftBalance - b.ftBalance);
            let ftutxos: tbc.Transaction.IUnspentOutput[] = [];
            for (let i = 0; i < sortedData.length; i++) {
                ftutxos.push({
                    txId: sortedData[i].utxoId,
                    outputIndex: sortedData[i].utxoVout,
                    script: codeScript,
                    satoshis: sortedData[i].utxoBalance,
                    ftBalance: sortedData[i].ftBalance
                });
            }
            const ftBalanceArray: bigint[] = ftutxos.map(item => BigInt(item.ftBalance));
            switch (ftBalanceArray.length) {
                case 1:
                    if (ftBalanceArray[0] >= amount) {
                        return [ftutxos[0]];
                    } else {
                        throw new Error('Insufficient FT balance');
                    }
                case 2:
                    if (ftBalanceArray[0] + ftBalanceArray[1] < amount) {
                        throw new Error('Insufficient FT balance');
                    } else if (ftBalanceArray[0] >= amount) {
                        return [ftutxos[0]];
                    } else if (ftBalanceArray[1] >= amount) {
                        return [ftutxos[1]];
                    } else {
                        return [ftutxos[0], ftutxos[1]];
                    }
                case 3:
                    if (ftBalanceArray[0] + ftBalanceArray[1] + ftBalanceArray[2] < amount) {
                        throw new Error('Insufficient FT balance');
                    } else if (findMinTwoSum(ftBalanceArray, amount)) {
                        const result = findMinTwoSum(ftBalanceArray, amount);
                        if (ftBalanceArray[result[0]] >= amount) {
                            return [ftutxos[result[0]]];
                        } else if (ftBalanceArray[result[1]] >= amount) {
                            return [ftutxos[result[1]]];
                        } else {
                            return [ftutxos[result[0]], ftutxos[result[1]]];
                        }
                    } else {
                        return [ftutxos[0], ftutxos[1], ftutxos[2]];
                    }
                case 4:
                    if (ftBalanceArray[0] + ftBalanceArray[1] + ftBalanceArray[2] + ftBalanceArray[3] < amount) {
                        throw new Error('Insufficient FT balance');
                    } else if (findMinThreeSum(ftBalanceArray, amount)) {
                        const result_three = findMinThreeSum(ftBalanceArray, amount);
                        if (findMinTwoSum([ftBalanceArray[result_three[0]], ftBalanceArray[result_three[1]], ftBalanceArray[result_three[2]]], amount)) {
                            const result_two = findMinTwoSum([ftBalanceArray[result_three[0]], ftBalanceArray[result_three[1]], ftBalanceArray[result_three[2]]], amount);
                            if (ftBalanceArray[result_two[0]] >= amount) {
                                return [ftutxos[result_two[0]]];
                            } else if (ftBalanceArray[result_two[1]] >= amount) {
                                return [ftutxos[result_two[1]]];
                            } else {
                                return [ftutxos[result_two[0]], ftutxos[result_two[1]]];
                            }
                        } else {
                            return [ftutxos[result_three[0]], ftutxos[result_three[1]], ftutxos[result_three[2]]];
                        }
                    } else {
                        return [ftutxos[0], ftutxos[1], ftutxos[2], ftutxos[3]];
                    }
                case 5:
                    if (ftBalanceArray[0] + ftBalanceArray[1] + ftBalanceArray[2] + ftBalanceArray[3] + ftBalanceArray[4] < amount) {
                        throw new Error('Insufficient FT balance');
                    } else if (findMinFourSum(ftBalanceArray, amount)) {
                        const result_four = findMinFourSum(ftBalanceArray, amount);
                        if (findMinThreeSum([ftBalanceArray[result_four[0]], ftBalanceArray[result_four[1]], ftBalanceArray[result_four[2]], ftBalanceArray[result_four[3]]], amount)) {
                            const result_three = findMinThreeSum([ftBalanceArray[result_four[0]], ftBalanceArray[result_four[1]], ftBalanceArray[result_four[2]], ftBalanceArray[result_four[3]]], amount);
                            if (findMinTwoSum([ftBalanceArray[result_three[0]], ftBalanceArray[result_three[1]], ftBalanceArray[result_three[2]]], amount)) {
                                const result_two = findMinTwoSum([ftBalanceArray[result_three[0]], ftBalanceArray[result_three[1]], ftBalanceArray[result_three[2]]], amount);
                                if (ftBalanceArray[result_two[0]] >= amount) {
                                    return [ftutxos[result_two[0]]];
                                } else if (ftBalanceArray[result_two[1]] >= amount) {
                                    return [ftutxos[result_two[1]]];
                                } else {
                                    return [ftutxos[result_two[0]], ftutxos[result_two[1]]];
                                }
                            } else {
                                return [ftutxos[result_three[0]], ftutxos[result_three[1]], ftutxos[result_three[2]]];
                            }
                        } else {
                            return [ftutxos[result_four[0]], ftutxos[result_four[1]], ftutxos[result_four[2]], ftutxos[result_four[3]]];
                        }
                    } else {
                        return [ftutxos[0], ftutxos[1], ftutxos[2], ftutxos[3], ftutxos[4]];
                    }
                default:
                    if (findMinFiveSum(ftBalanceArray, amount)) {
                        const result_five = findMinFiveSum(ftBalanceArray, amount);
                        if (findMinFourSum([ftBalanceArray[result_five[0]], ftBalanceArray[result_five[1]], ftBalanceArray[result_five[2]], ftBalanceArray[result_five[3]], ftBalanceArray[result_five[4]]], amount)) {
                            const result_four = findMinFourSum([ftBalanceArray[result_five[0]], ftBalanceArray[result_five[1]], ftBalanceArray[result_five[2]], ftBalanceArray[result_five[3]], ftBalanceArray[result_five[4]]], amount);
                            if (findMinThreeSum([ftBalanceArray[result_four[0]], ftBalanceArray[result_four[1]], ftBalanceArray[result_four[2]], ftBalanceArray[result_four[3]]], amount)) {
                                const result_three = findMinThreeSum([ftBalanceArray[result_four[0]], ftBalanceArray[result_four[1]], ftBalanceArray[result_four[2]], ftBalanceArray[result_four[3]]], amount);
                                if (findMinTwoSum([ftBalanceArray[result_three[0]], ftBalanceArray[result_three[1]], ftBalanceArray[result_three[2]]], amount)) {
                                    const result_two = findMinTwoSum([ftBalanceArray[result_three[0]], ftBalanceArray[result_three[1]], ftBalanceArray[result_three[2]]], amount);
                                    if (ftBalanceArray[result_two[0]] >= amount) {
                                        return [ftutxos[result_two[0]]];
                                    } else if (ftBalanceArray[result_two[1]] >= amount) {
                                        return [ftutxos[result_two[1]]];
                                    } else {
                                        return [ftutxos[result_two[0]], ftutxos[result_two[1]]];
                                    }
                                } else {
                                    return [ftutxos[result_three[0]], ftutxos[result_three[1]], ftutxos[result_three[2]]];
                                }
                            } else {
                                return [ftutxos[result_four[0]], ftutxos[result_four[1]], ftutxos[result_four[2]], ftutxos[result_four[3]]];
                            }
                        } else {
                            return [ftutxos[result_five[0]], ftutxos[result_five[1]], ftutxos[result_five[2]], ftutxos[result_five[3]], ftutxos[result_five[4]]];
                        }
                    } else {
                        throw new Error('Insufficient FT balance');
                    }
            }
        } catch (error) {
            throw new Error(error.message);
        }
    }
}


module.exports = API