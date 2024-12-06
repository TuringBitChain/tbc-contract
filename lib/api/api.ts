import * as tbc from 'tbc-lib-js'
class API {
    /**sda
     * Get the FT balance for a specified contract transaction ID and address or hash.
     *
     * @param {string} contractTxid - The contract transaction ID.
     * @param {string} addressOrHash - The address or hash.
     * @returns {Promise<bigint>} Returns a Promise that resolves to the FT balance.
     * @throws {Error} Throws an error if the address or hash is invalid, or if the request fails.
     */
    static async getFTbalance(contractTxid: string, addressOrHash: string, network?: "testnet" | "mainnet"): Promise<bigint> {
        if (network) {
            network = network;
        } else {
            network = "mainnet";
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
        const url_testnet = `http://tbcdev.org:5000/v1/tbc/main/ft/balance/combine/script/${hash}/contract/${contractTxid}`;
        const url_mainnet = `https://turingwallet.xyz/v1/tbc/main/ft/balance/combine/script/${hash}/contract/${contractTxid}`;
        let url = network == "testnet" ? url_testnet : url_mainnet;
        try {
            const response = await (await fetch(url)).json();
            const ftBalance = response.ftBalance;
            return ftBalance;
        } catch (error) {
            throw new Error("Failed to get ftBalance.");
        }
    }

    static async fetchUTXO(privateKey: tbc.PrivateKey, amount: number, network?: "testnet" | "mainnet"): Promise<tbc.Transaction.IUnspentOutput> {
        if (network) {
            network = network;
        } else {
            network = "mainnet";
        }
        const address = privateKey.toAddress().toString();
        const url_testnet = `http://tbcdev.org:5000/v1/tbc/main/address/${address}/unspent/`;
        const url_mainnet = `https://turingwallet.xyz/v1/tbc/main/address/${address}/unspent/`;
        let url = network == "testnet" ? url_testnet : url_mainnet;
        const scriptPubKey = tbc.Script.buildPublicKeyHashOut(address).toBuffer().toString('hex');
        const amount_bn = amount * Math.pow(10, 6);
        try {
            const response = await (await fetch(url)).json();
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
            // Select a UTXO with value greater than 5000
            for (let i = 0; i < response.length; i++) {
                if (response[i].value > amount_bn) {
                    data = response[i];
                    break;
                }
            }
            if (data.value < amount_bn) {
                console.log('Please merge UTXO!');
                await new Promise(resolve => setTimeout(resolve, 3000));
                await API.mergeUTXO(privateKey, network);
                await new Promise(resolve => setTimeout(resolve, 5000));
                return await API.fetchUTXO(privateKey, amount, network);
            }
            const utxo: tbc.Transaction.IUnspentOutput = {
                txId: data.tx_hash,
                outputIndex: data.tx_pos,
                script: scriptPubKey,
                satoshis: data.value
            }
            return utxo;
        } catch (error) {
            throw new Error("Failed to fetch UTXO.");
        }
    }

    static async mergeUTXO(privateKey: tbc.PrivateKey, network?: "testnet" | "mainnet"): Promise<boolean> {
        if (network) {
            network = network;
        } else {
            network = "mainnet";
        }
        const address = tbc.Address.fromPrivateKey(privateKey).toString();
        const url_testnet = `http://tbcdev.org:5000/v1/tbc/main/address/${address}/unspent/`;
        const url_mainnet = `https://turingwallet.xyz/v1/tbc/main/address/${address}/unspent/`;
        let url = network == "testnet" ? url_testnet : url_mainnet;
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
            throw new Error("Failed to merge UTXO.");
        }
    }

    /**
     * Fetches the raw transaction data for a given transaction ID.
     * @param txid - The transaction ID to fetch.
     * @returns The transaction object.
     */
    static async fetchTXraw(txid: string, network?: "testnet" | "mainnet"): Promise<tbc.Transaction> {
        if (network) {
            network = network;
        } else {
            network = "mainnet";
        }
        const url_testnet = `http://tbcdev.org:5000/v1/tbc/main/tx/hex/${txid}`;
        const url_mainnet = `https://turingwallet.xyz/v1/tbc/main/tx/hex/${txid}`;
        let url = network == "testnet" ? url_testnet : url_mainnet;
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
            throw new Error("Failed to fetch TXraw.");
        }
    }

    /**
     * Broadcasts the raw transaction to the network.
     * @param txraw - The raw transaction hex.
     * @returns The response from the broadcast API.
     */
    static async broadcastTXraw(txraw: string, network?: "testnet" | "mainnet"): Promise<string> {
        if (network) {
            network = network;
        } else {
            network = "mainnet";
        }
        const url_testnet = 'http://tbcdev.org:5000/v1/tbc/main/broadcast/tx/raw';
        const url_mainnet = 'https://turingwallet.xyz/v1/tbc/main/broadcast/tx/raw';
        let url = network == "testnet" ? url_testnet : url_mainnet;
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
            throw new Error("Failed to broadcast TXraw.");
        }
    }
}

module.exports = API