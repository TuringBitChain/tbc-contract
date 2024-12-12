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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const tbc = __importStar(require("tbc-lib-js"));
const fs = require('fs').promises;
const path = require('path');
;
class NFT {
    collection_id = "";
    collection_index = 0;
    collection_name = "";
    code_balance = 0;
    hold_balance = 0;
    transfer_count = 0;
    contract_id = "";
    nftData = {
        nftName: "",
        symbol: "",
        file: "",
        discription: "",
        attributes: "",
    };
    constructor(contract_id) {
        this.contract_id = contract_id;
    }
    initialize(nftInfo) {
        const { collectionId, collectionIndex, collectionName, nftCodeBalance, nftP2pkhBalance, nftName, nftSymbol, nft_attributes, nftDescription, nftTransferTimeCount, nftIcon } = nftInfo;
        let file = "";
        const writer = new tbc.encoding.BufferWriter();
        if (nftIcon === collectionId + writer.writeUInt32LE(collectionIndex).toBuffer().toString("hex")) {
            file = nftIcon;
        }
        else {
            file = this.contract_id + "00000000";
        }
        this.nftData = {
            nftName,
            symbol: nftSymbol,
            discription: nftDescription,
            attributes: nft_attributes,
            file
        };
        this.collection_id = collectionId;
        this.collection_index = collectionIndex;
        this.collection_name = collectionName;
        this.code_balance = nftCodeBalance;
        this.hold_balance = nftP2pkhBalance;
        this.transfer_count = nftTransferTimeCount;
    }
    static createCollection(address, privateKey, data, utxos) {
        const tx = new tbc.Transaction();
        for (let i = 0; i < utxos.length; i++) {
            tx.from(utxos[i]);
        }
        tx.addOutput(new tbc.Transaction.Output({
            script: NFT.buildTapeScript(data),
            satoshis: 0,
        }));
        for (let i = 0; i < data.supply; i++) {
            tx.addOutput(new tbc.Transaction.Output({
                script: NFT.buildMintScript(address),
                satoshis: 100,
            }));
        }
        tx.feePerKb(100)
            .change(address)
            .sign(privateKey);
        return tx.uncheckedSerialize();
    }
    static createNFT(collection_id, address, privateKey, data, utxos, nfttxo) {
        const hold = NFT.buildHoldScript(address);
        if (!data.file) {
            const writer = new tbc.encoding.BufferWriter();
            data.file = collection_id + writer.writeUInt32LE(nfttxo.outputIndex).toBuffer().toString("hex");
        }
        const tx = new tbc.Transaction();
        tx.from(nfttxo);
        for (let i = 0; i < utxos.length; i++) {
            tx.from(utxos[i]);
        }
        ;
        tx.addOutput(new tbc.Transaction.Output({
            script: NFT.buildCodeScript(nfttxo.txId, nfttxo.outputIndex),
            satoshis: 1000,
        }))
            .addOutput(new tbc.Transaction.Output({
            script: hold,
            satoshis: 100,
        }))
            .addOutput(new tbc.Transaction.Output({
            script: NFT.buildTapeScript(data),
            satoshis: 0,
        }))
            .feePerKb(100)
            .change(address)
            .setInputScript({
            inputIndex: 0,
            privateKey
        }, (tx) => {
            const Sig = tx.getSignature(0);
            const SigLength = (Sig.length / 2).toString(16);
            const sig = SigLength + Sig;
            const publicKeylength = (privateKey.toPublicKey().toBuffer().toString('hex').length / 2).toString(16);
            const publickey = publicKeylength + privateKey.toPublicKey().toBuffer().toString('hex');
            return new tbc.Script(sig + publickey);
        })
            .sign(privateKey)
            .seal();
        return tx.uncheckedSerialize();
        ;
    }
    transferNFT(address_from, address_to, privateKey, utxos, pre_tx, pre_pre_tx) {
        const code = NFT.buildCodeScript(this.collection_id, this.collection_index);
        const tx = new tbc.Transaction()
            .addInputFromPrevTx(pre_tx, 0)
            .addInputFromPrevTx(pre_tx, 1);
        for (let i = 0; i < utxos.length; i++) {
            tx.from(utxos[i]);
        }
        ;
        tx.addOutput(new tbc.Transaction.Output({
            script: code,
            satoshis: this.code_balance,
        }))
            .addOutput(new tbc.Transaction.Output({
            script: NFT.buildHoldScript(address_to),
            satoshis: this.hold_balance,
        }))
            .addOutput(new tbc.Transaction.Output({
            script: NFT.buildTapeScript(this.nftData),
            satoshis: 0,
        }))
            .feePerKb(100)
            .change(address_from)
            .setInputScript({
            inputIndex: 0,
            privateKey
        }, (tx) => {
            const Sig = tx.getSignature(0);
            const SigLength = (Sig.length / 2).toString(16);
            const sig = SigLength + Sig;
            const publicKeylength = (privateKey.toPublicKey().toBuffer().toString('hex').length / 2).toString(16);
            const publickey = publicKeylength + privateKey.toPublicKey().toBuffer().toString('hex');
            const currenttxdata = NFT.getCurrentTxdata(tx);
            const prepretxdata = NFT.getPrePreTxdata(pre_pre_tx);
            const pretxdata = NFT.getPreTxdata(pre_tx);
            return new tbc.Script(sig + publickey + currenttxdata + prepretxdata + pretxdata);
        })
            .setInputScript({
            inputIndex: 1,
            privateKey
        }, (tx) => {
            const Sig = tx.getSignature(1);
            const SigLength = (Sig.length / 2).toString(16);
            const sig = SigLength + Sig;
            const publicKeylength = (privateKey.toPublicKey().toBuffer().toString('hex').length / 2).toString(16);
            const publickey = publicKeylength + privateKey.toPublicKey().toBuffer().toString('hex');
            return new tbc.Script(sig + publickey);
        })
            .sign(privateKey)
            .seal();
        return tx.uncheckedSerialize();
    }
    static buildCodeScript(tx_hash, outputIndex) {
        const tx_id = Buffer.from(tx_hash, "hex").reverse().toString("hex");
        const writer = new tbc.encoding.BufferWriter();
        const vout = writer.writeUInt32LE(outputIndex).toBuffer().toString("hex");
        const tx_id_vout = "0x" + tx_id + vout;
        const code = new tbc.Script('OP_1 OP_PICK OP_3 OP_SPLIT 0x01 0x14 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_1 OP_PICK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_1 OP_PICK 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_SHA256 OP_6 OP_PUSH_META 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_1 OP_PICK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_SHA256 OP_SHA256 OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_SWAP OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUAL OP_IF OP_DROP OP_ELSE 0x24 ' + tx_id_vout + ' OP_EQUALVERIFY OP_ENDIF OP_1 OP_PICK OP_FROMALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_DUP OP_HASH160 OP_FROMALTSTACK OP_EQUALVERIFY OP_CHECKSIG OP_RETURN 0x05 0x33436f6465');
        return code;
    }
    ;
    static buildMintScript(address) {
        const pubKeyHash = tbc.Address.fromString(address).hashBuffer.toString("hex");
        const mint = new tbc.Script('OP_DUP OP_HASH160' + ' 0x14 0x' + pubKeyHash + ' OP_EQUALVERIFY OP_CHECKSIG OP_RETURN 0x0d 0x5630204d696e74204e486f6c64');
        return mint;
    }
    static buildHoldScript(address) {
        const pubKeyHash = tbc.Address.fromString(address).hashBuffer.toString("hex");
        const hold = new tbc.Script('OP_DUP OP_HASH160' + ' 0x14 0x' + pubKeyHash + ' OP_EQUALVERIFY OP_CHECKSIG OP_RETURN 0x0d 0x56302043757272204e486f6c64');
        return hold;
    }
    static buildTapeScript(data) {
        const dataHex = Buffer.from(JSON.stringify(data)).toString("hex");
        const tape = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${dataHex} 4e54617065`);
        return tape;
    }
    static async encodeByBase64(filePath) {
        try {
            const data = await fs.readFile(filePath);
            const ext = path.extname(filePath).toLowerCase();
            const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
            const base64Data = `data:${mimeType};base64,${data.toString("base64")}`;
            return base64Data;
        }
        catch (err) {
            throw new Error(`Failed to read or encode file: ${err.message}`);
        }
    }
    static getCurrentTxdata(tx) {
        const amountlength = '08';
        const writer = new tbc.encoding.BufferWriter();
        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
        writer.write(NFT.getLengthHex(tx.outputs[0].script.toBuffer().length));
        writer.write(tx.outputs[0].script.toBuffer());
        writer.write(Buffer.from(NFT.getOutputsData(tx, 1), 'hex'));
        return writer.toBuffer().toString('hex');
    }
    static getPreTxdata(tx) {
        const version = 10;
        const vliolength = '10';
        const amountlength = '08';
        const hashlength = '20';
        const writer = new tbc.encoding.BufferWriter();
        writer.write(Buffer.from(vliolength, 'hex'));
        writer.writeUInt32LE(version);
        writer.writeUInt32LE(tx.nLockTime);
        writer.writeInt32LE(tx.inputs.length);
        writer.writeInt32LE(tx.outputs.length);
        const inputWriter = new tbc.encoding.BufferWriter();
        const inputWriter2 = new tbc.encoding.BufferWriter();
        for (const input of tx.inputs) {
            inputWriter.writeReverse(input.prevTxId);
            inputWriter.writeUInt32LE(input.outputIndex);
            inputWriter.writeUInt32LE(input.sequenceNumber);
            inputWriter2.write(tbc.crypto.Hash.sha256(input.script.toBuffer()));
        }
        writer.write(NFT.getLengthHex(inputWriter.toBuffer().length));
        writer.write(inputWriter.toBuffer());
        writer.write(Buffer.from(hashlength, 'hex'));
        writer.write(tbc.crypto.Hash.sha256(inputWriter2.toBuffer()));
        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
        writer.write(NFT.getLengthHex(tx.outputs[0].script.toBuffer().length));
        writer.write(tx.outputs[0].script.toBuffer());
        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
        writer.write(NFT.getLengthHex(tx.outputs[1].script.toBuffer().length));
        writer.write(tx.outputs[1].script.toBuffer());
        writer.write(Buffer.from(NFT.getOutputsData(tx, 2), 'hex'));
        return writer.toBuffer().toString('hex');
    }
    static getPrePreTxdata(tx) {
        const version = 10;
        const vliolength = '10';
        const amountlength = '08';
        const hashlength = '20';
        const writer = new tbc.encoding.BufferWriter();
        writer.write(Buffer.from(vliolength, 'hex'));
        writer.writeUInt32LE(version);
        writer.writeUInt32LE(tx.nLockTime);
        writer.writeInt32LE(tx.inputs.length);
        writer.writeInt32LE(tx.outputs.length);
        const inputWriter = new tbc.encoding.BufferWriter();
        const inputWriter2 = new tbc.encoding.BufferWriter();
        for (const input of tx.inputs) {
            inputWriter.writeReverse(input.prevTxId);
            inputWriter.writeUInt32LE(input.outputIndex);
            inputWriter.writeUInt32LE(input.sequenceNumber);
            inputWriter2.write(tbc.crypto.Hash.sha256(input.script.toBuffer()));
        }
        writer.write(Buffer.from(hashlength, 'hex'));
        writer.write(tbc.crypto.Hash.sha256(inputWriter.toBuffer()));
        writer.write(Buffer.from(hashlength, 'hex'));
        writer.write(tbc.crypto.Hash.sha256(inputWriter2.toBuffer()));
        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
        writer.write(NFT.getLengthHex(tx.outputs[0].script.toBuffer().length));
        writer.write(tx.outputs[0].script.toBuffer());
        writer.write(Buffer.from(NFT.getOutputsData(tx, 1), 'hex'));
        return writer.toBuffer().toString('hex');
    }
    static getOutputsData(tx, index) {
        let outputs = '';
        let outputslength = '';
        const outputWriter = new tbc.encoding.BufferWriter();
        for (let i = index; i < tx.outputs.length; i++) {
            outputWriter.writeUInt64LEBN(tx.outputs[i].satoshisBN);
            outputWriter.write(tbc.crypto.Hash.sha256(tx.outputs[i].script.toBuffer()));
        }
        outputs = outputWriter.toBuffer().toString('hex');
        if (outputs === '') {
            outputs = '00';
            outputslength = '';
        }
        else {
            outputslength = NFT.getLengthHex(outputs.length / 2).toString('hex');
        }
        return outputslength + outputs;
    }
    static getLengthHex(length) {
        if (length < 76) {
            return Buffer.from(length.toString(16).padStart(2, '0'), 'hex');
        }
        else if (length <= 255) {
            return Buffer.concat([Buffer.from('4c', 'hex'), Buffer.from(length.toString(16).padStart(2, '0'), 'hex')]);
        }
        else if (length <= 65535) {
            return Buffer.concat([Buffer.from('4d', 'hex'), Buffer.from(length.toString(16).padStart(4, '0'), 'hex').reverse()]);
        }
        else if (length <= 0xFFFFFFFF) {
            const lengthBuffer = Buffer.alloc(4);
            lengthBuffer.writeUInt32LE(length);
            return Buffer.concat([Buffer.from('4e', 'hex'), lengthBuffer]);
        }
        else {
            throw new Error('Length exceeds maximum supported size (4 GB)');
        }
    }
}
module.exports = NFT;
