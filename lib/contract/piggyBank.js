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
const API = require("../api/api");
class piggyBank {
    static getPiggyBankCode(address, lockTime) {
        const pubkeyHash = tbc.Address.fromString(address).hashBuffer.toString('hex');
        const BufferWriter = new tbc.encoding.BufferWriter();
        BufferWriter.writeUInt32LE(lockTime);
        const lockTimeHex = BufferWriter.toBuffer().toString('hex');
        const code = tbc.Script.fromASM(`OP_DUP OP_HASH160 ${pubkeyHash} OP_EQUALVERIFY OP_CHECKSIGVERIFY OP_6 OP_PUSH_META 24 OP_SPLIT OP_NIP OP_BIN2NUM ffffffff OP_BIN2NUM OP_NUMNOTEQUAL OP_1 OP_EQUALVERIFY ${lockTimeHex} OP_BIN2NUM OP_2 OP_PUSH_META OP_BIN2NUM OP_LESSTHANOREQUAL OP_1 OP_EQUAL`);
        return code;
    }
    static freezeTBC(address, tbcNumber, lockTime, utxos) {
        const tbcAmount = Math.ceil(tbcNumber * Math.pow(10, 6));
        const tx = new tbc.Transaction();
        tx.from(utxos);
        const txSize = tx.getEstimateSize();
        const fee = txSize < 1000 ? 80 : Math.ceil(txSize / 1000 * 80);
        tx.addOutput(new tbc.Transaction.Output({
            script: piggyBank.getPiggyBankCode(address, lockTime),
            satoshis: tbcAmount,
        }));
        tx.fee(fee)
            .change(address);
        return tx.uncheckedSerialize();
    }
    static async unfreezeTBC(address, utxos, network) {
        let sumAmount = 0;
        for (const utxo of utxos) {
            sumAmount += utxo.satoshis;
        }
        const tx = new tbc.Transaction();
        tx.from(utxos);
        const txSize = tx.getEstimateSize() + 100;
        const fee = txSize < 1000 ? 80 : Math.ceil(txSize / 1000 * 80);
        tx.to(address, sumAmount - fee)
            .fee(fee)
            .change(address);
        for (let i = 0; i < utxos.length; i++) {
            tx.setInputSequence(i, 4294967294);
        }
        tx.setLockTime((await API.fetchBlockHeaders(network ?? "mainnet"))[0].height);
        return tx.uncheckedSerialize();
    }
    static _freezeTBC(privateKey, tbcNumber, lockTime, utxos) {
        const address = privateKey.toAddress().toString();
        const tbcAmount = Math.ceil(tbcNumber * Math.pow(10, 6));
        const tx = new tbc.Transaction();
        tx.from(utxos);
        const txSize = tx.getEstimateSize();
        const fee = txSize < 1000 ? 80 : Math.ceil(txSize / 1000 * 80);
        tx.addOutput(new tbc.Transaction.Output({
            script: piggyBank.getPiggyBankCode(address, lockTime),
            satoshis: tbcAmount,
        }));
        tx.fee(fee)
            .change(address)
            .sign(privateKey)
            .seal();
        return tx.uncheckedSerialize();
    }
    static async _unfreezeTBC(privateKey, utxos, network) {
        const address = privateKey.toAddress().toString();
        let sumAmount = 0;
        for (const utxo of utxos) {
            sumAmount += utxo.satoshis;
        }
        const tx = new tbc.Transaction();
        tx.from(utxos);
        const txSize = tx.getEstimateSize() + 100;
        const fee = txSize < 1000 ? 80 : Math.ceil(txSize / 1000 * 80);
        console.log("sumAmount:", sumAmount);
        tx.to(address, sumAmount - fee)
            .fee(fee)
            .change(address);
        for (let i = 0; i < utxos.length; i++) {
            tx.setInputSequence(i, 4294967294);
            tx.setInputScript({
                inputIndex: i,
                privateKey,
            }, (tx) => {
                const sig = tx.getSignature(i);
                const publickey = privateKey.toPublicKey().toBuffer().toString("hex");
                return tbc.Script.fromASM(`${sig} ${publickey}`);
            });
        }
        tx.setLockTime((await API.fetchBlockHeaders(network ?? "mainnet"))[0].height);
        tx.sign(privateKey)
            .seal();
        // console.log(tx.verify());
        // console.log(tx.uncheckedSerialize());
        return tx.uncheckedSerialize();
    }
    static fetchTBCLockTime(utxo) {
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
