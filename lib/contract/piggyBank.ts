import * as tbc from "tbc-lib-js";
const API = require("../api/api");

class piggyBank {
    // network: "testnet" | "mainnet" | string;

    // constructor(network?: "testnet" | "mainnet" | string) {
    //     this.network = network ? network : "mainnet";
    // }

    static getPiggyBankCode(address: string, lockTime: number) {
        const pubkeyHash = tbc.Address.fromString(address).hashBuffer.toString('hex');
        const BufferWriter = new tbc.encoding.BufferWriter();
        BufferWriter.writeUInt32LE(lockTime);
        const lockTimeHex = BufferWriter.toBuffer().toString('hex');
        const code = tbc.Script.fromASM(`OP_DUP OP_HASH160 ${pubkeyHash} OP_EQUALVERIFY OP_CHECKSIGVERIFY OP_6 OP_PUSH_META 24 OP_SPLIT OP_NIP OP_BIN2NUM ffffffff OP_BIN2NUM OP_NUMNOTEQUAL OP_1 OP_EQUALVERIFY ${lockTimeHex} OP_BIN2NUM OP_2 OP_PUSH_META OP_BIN2NUM OP_LESSTHANOREQUAL OP_1 OP_EQUAL`);
        return code;
    }

    static freezeTBC(privateKey:tbc.PrivateKey, tbcNumber: number, lockTime: number, utxos:tbc.Transaction.IUnspentOutput[]) {
        const address = privateKey.toAddress().toString();
        const tbcAmount = Math.ceil(tbcNumber * Math.pow(10, 6));
        const tx = new tbc.Transaction();
        tx.from(utxos);
        const txSize = tx.getEstimateSize();
        const fee = txSize < 1000 ? 80 : Math.ceil(txSize / 1000) * 80;
        tx.addOutput(
            new tbc.Transaction.Output({
                script: piggyBank.getPiggyBankCode(address, lockTime),
                satoshis: tbcAmount,
            })
        )
        tx.fee(fee)
        .change(address)
        .sign(privateKey)
        .seal();
        return tx.uncheckedSerialize();
    }

    static async unfreezeTBC(privateKey:tbc.PrivateKey, utxos:tbc.Transaction.IUnspentOutput[], network?: "testnet" | "mainnet" | string) {
        const address = privateKey.toAddress().toString();
        let sumAmount = 0;
        for(const utxo of utxos) {
            sumAmount += utxo.satoshis;
        }
        const tx = new tbc.Transaction();
        tx.from(utxos);
        const txSize = tx.getEstimateSize() + 100;
        const fee = txSize < 1000 ? 80 : Math.ceil(txSize / 1000) * 80;
        tx.to(address, sumAmount - fee)
        .fee(fee)
        .change(address);
        for (let i = 0; i < utxos.length; i++) {
            tx.setInputSequence(i, 4294967294);
            tx.setInputScript(
                {
                    inputIndex: i,
                    privateKey,
                },
                (tx) => {
                    const sig = tx.getSignature(i);
                    const publickey = privateKey.toPublicKey().toBuffer().toString("hex");
                    return tbc.Script.fromASM(`${sig} ${publickey}`);
                }
            );
        }
        tx.setLockTime((await API.fetchBlockHeaders(network ?? "mainnet"))[0].height);
        tx.sign(privateKey)
        .seal();
        // console.log(tx.verify());
        // console.log(tx.uncheckedSerialize());
        return tx.uncheckedSerialize();
    }

    static fetchTBCLockTime(utxo:tbc.Transaction.IUnspentOutput) {
        if (utxo.script.length != 106) {
            throw new Error("Invalid Piggy Bank script");
        }
        const script = tbc.Script.fromString(utxo.script);
        const lockTimeChunk = script.chunks[script.chunks.length - 8].buf;
        const lockTime = lockTimeChunk.readUInt32LE();
        return lockTime;
    }
}
module.exports = piggyBank;