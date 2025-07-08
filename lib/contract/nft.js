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
const nftunlock_1 = require("../util/nftunlock");
const version = 10;
const vliolength = "10";
const amountlength = "08";
const hashlength = "20";
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
        description: "",
        attributes: "",
    };
    constructor(contract_id) {
        this.contract_id = contract_id;
    }
    initialize(nftInfo) {
        const { collectionId, collectionIndex, collectionName, nftCodeBalance, nftP2pkhBalance, nftName, nftSymbol, nft_attributes, nftDescription, nftTransferTimeCount, nftIcon, } = nftInfo;
        let file = "";
        const writer = new tbc.encoding.BufferWriter();
        if (nftIcon ===
            collectionId +
                writer.writeUInt32LE(collectionIndex).toBuffer().toString("hex")) {
            file = nftIcon;
        }
        else {
            file = this.contract_id + "00000000";
        }
        this.nftData = {
            nftName,
            symbol: nftSymbol,
            description: nftDescription,
            attributes: nft_attributes,
            file,
        };
        this.collection_id = collectionId;
        this.collection_index = collectionIndex;
        this.collection_name = collectionName;
        this.code_balance = nftCodeBalance;
        this.hold_balance = nftP2pkhBalance;
        this.transfer_count = nftTransferTimeCount;
    }
    /**
     * 创建一个新的 NFT 集合，并返回未检查的交易原始数据。
     *
     * @param {string} address - 接收 NFT 的地址。
     * @param {tbc.PrivateKey} privateKey - 用于签名交易的私钥。
     * @param {CollectionData} data - 包含集合数据的对象，包括供应量等信息。
     * @param {tbc.Transaction.IUnspentOutput[]} utxos - 用于创建交易的未花费输出列表。
     * @returns {string} 返回未检查的交易原始数据。
     *
     * 该函数执行以下主要步骤：
     * 1. 创建一个新的交易实例。
     * 2. 将所有提供的 UTXO 添加为交易输入。
     * 3. 添加一个输出，用于构建 NFT 的脚本，金额为 0。
     * 4. 根据指定的供应量，为每个 NFT 添加输出，金额为 100 satoshis。
     * 5. 设置每千字节的交易费用，指定找零地址，并使用私钥签名交易。
     * 6. 返回序列化后的未检查交易数据以供发送。
     */
    static createCollection(address, privateKey, data, utxos) {
        const tx = new tbc.Transaction().from(utxos).addOutput(new tbc.Transaction.Output({
            script: NFT.buildTapeScript(data),
            satoshis: 0,
        }));
        for (let i = 0; i < data.supply; i++) {
            tx.addOutput(new tbc.Transaction.Output({
                script: NFT.buildMintScript(address),
                satoshis: 100,
            }));
        }
        tx.feePerKb(80).change(address).sign(privateKey).seal();
        return tx.uncheckedSerialize();
    }
    /**
     * 创建一个新的 NFT，并返回未检查的交易原始数据。
     *
     * @param {string} collection_id - 关联的 NFT 集合 ID。
     * @param {string} address - 接收 NFT 的地址。
     * @param {tbc.PrivateKey} privateKey - 用于签名交易的私钥。
     * @param {NFTData} data - 包含 NFT 数据的对象，包括文件信息等。
     * @param {tbc.Transaction.IUnspentOutput[]} utxos - 用于创建交易的未花费输出列表。
     * @param {tbc.Transaction.IUnspentOutput} nfttxo - 用于创建 NFT 的特定未花费输出。
     * @returns {string} 返回未检查的交易原始数据。
     *
     * 该函数执行以下主要步骤：
     * 1. 构建持有脚本，如果数据中没有文件信息，则生成文件信息并将其添加到数据中。
     * 2. 创建一个新的交易实例，并将指定的 NFT UTXO 添加为输入。
     * 3. 将所有提供的 UTXO 添加为交易输入。
     * 4. 添加多个输出，包括：
     *    - 一个用于 NFT 代码的输出，金额为 1000 satoshis；
     *    - 一个用于持有脚本的输出，金额为 100 satoshis；
     *    - 一个用于构建 NFT 的脚本，金额为 0。
     * 5. 设置每千字节的交易费用，指定找零地址，并设置输入脚本以进行签名。
     * 6. 使用私钥签名交易并封装交易以准备发送。
     * 7. 返回序列化后的未检查交易数据以供发送。
     */
    static createNFT(collection_id, address, privateKey, data, utxos, nfttxo) {
        const hold = NFT.buildHoldScript(address);
        if (!data.file) {
            const writer = new tbc.encoding.BufferWriter();
            data.file =
                collection_id +
                    writer.writeUInt32LE(nfttxo.outputIndex).toBuffer().toString("hex");
        }
        const tx = new tbc.Transaction()
            .from(nfttxo)
            .from(utxos)
            .addOutput(new tbc.Transaction.Output({
            script: NFT.buildCodeScript(nfttxo.txId, nfttxo.outputIndex),
            satoshis: 200,
        }))
            .addOutput(new tbc.Transaction.Output({
            script: hold,
            satoshis: 100,
        }))
            .addOutput(new tbc.Transaction.Output({
            script: NFT.buildTapeScript(data),
            satoshis: 0,
        }))
            .feePerKb(80)
            .change(address)
            .setInputScript({
            inputIndex: 0,
            privateKey,
        }, (tx) => {
            const Sig = tx.getSignature(0);
            const SigLength = (Sig.length / 2).toString(16);
            const sig = SigLength + Sig;
            const publicKeylength = (privateKey.toPublicKey().toBuffer().toString("hex").length / 2).toString(16);
            const publickey = publicKeylength +
                privateKey.toPublicKey().toBuffer().toString("hex");
            return new tbc.Script(sig + publickey);
        })
            .sign(privateKey)
            .seal();
        return tx.uncheckedSerialize();
    }
    /**
     * 批量创建 NFT，并返回未检查的交易原始数据。
     *
     * @param {string} collection_id - 关联的 NFT 集合 ID。
     * @param {string} address - 接收 NFT 的地址。
     * @param {tbc.PrivateKey} privateKey - 用于签名交易的私钥。
     * @param {NFTData[]} datas - 包含 NFT 数据的对象数组，包括文件信息等。
     * @param {tbc.Transaction.IUnspentOutput[]} utxos - 用于创建交易的未花费输出列表。
     * @param {tbc.Transaction.IUnspentOutput[]} nfttxos - 用于创建 NFT 的特定未花费输出列表。
     * @returns {Array<{ txHex: string }>} 返回包含未检查交易原始数据的数组。
     */
    static batchCreateNFT(collection_id, address, privateKey, datas, utxos, nfttxos) {
        if (datas.length !== nfttxos.length) {
            throw new Error("The length of datas array must match the length of nfttxos array");
        }
        const hold = NFT.buildHoldScript(address);
        const txs = [];
        for (let i = 0; i < datas.length; i++) {
            const writer = new tbc.encoding.BufferWriter();
            datas[i].file =
                collection_id +
                    writer.writeUInt32LE(nfttxos[i].outputIndex).toBuffer().toString("hex");
            const tx = new tbc.Transaction().from(nfttxos[i]);
            if (i === 0) {
                tx.from(utxos);
            }
            else {
                tx.addInputFromPrevTx(txs[i - 1], 3);
            }
            tx.addOutput(new tbc.Transaction.Output({
                script: NFT.buildCodeScript(nfttxos[i].txId, nfttxos[i].outputIndex),
                satoshis: 200,
            }))
                .addOutput(new tbc.Transaction.Output({
                script: hold,
                satoshis: 100,
            }))
                .addOutput(new tbc.Transaction.Output({
                script: NFT.buildTapeScript(datas[i]),
                satoshis: 0,
            }))
                .feePerKb(80)
                .change(address)
                .setInputScript({
                inputIndex: 0,
                privateKey,
            }, (tx) => {
                const Sig = tx.getSignature(0);
                const SigLength = (Sig.length / 2).toString(16);
                const sig = SigLength + Sig;
                const publicKeylength = (privateKey.toPublicKey().toBuffer().toString("hex").length / 2).toString(16);
                const publickey = publicKeylength +
                    privateKey.toPublicKey().toBuffer().toString("hex");
                return new tbc.Script(sig + publickey);
            })
                .sign(privateKey)
                .seal();
            txs.push(tx);
        }
        return txs.map((tx) => ({ txHex: tx.uncheckedSerialize() }));
    }
    /**
     * 转移 NFT 从一个地址到另一个地址，并返回未检查的交易原始数据。
     *
     * @param {string} address_from - NFT 转出地址。
     * @param {string} address_to - NFT 转入地址。
     * @param {tbc.PrivateKey} privateKey - 用于签名交易的私钥。
     * @param {tbc.Transaction.IUnspentOutput[]} utxos - 用于创建交易的未花费输出列表。
     * @param {tbc.Transaction} pre_tx - 前一个交易，用于获取输入。
     * @param {tbc.Transaction} pre_pre_tx - 前一个交易的前一个交易，用于获取输入。
     * @returns {string} 返回未检查的交易原始数据。
     *
     * 该函数执行以下主要步骤：
     * 1. 构建 NFT 代码脚本，使用集合 ID 和索引。
     * 2. 创建一个新的交易实例，并添加来自前一个交易的两个输入。
     * 3. 将所有提供的 UTXO 添加为交易输入。
     * 4. 添加多个输出，包括：
     *    - 一个用于 NFT 代码的输出，金额为 `this.code_balance`；
     *    - 一个用于持有脚本的输出，金额为 `this.hold_balance`；
     *    - 一个用于构建 NFT 的脚本，金额为 0。
     * 5. 设置每千字节的交易费用，指定找零地址，并设置输入脚本以进行签名。
     * 6. 对两个输入进行签名，并封装交易以准备发送。
     * 7. 返回序列化后的未检查交易数据以供发送。
     */
    transferNFT(address_from, address_to, privateKey, utxos, pre_tx, pre_pre_tx) {
        const code = NFT.buildCodeScript(this.collection_id, this.collection_index);
        const tx = new tbc.Transaction()
            .addInputFromPrevTx(pre_tx, 0)
            .addInputFromPrevTx(pre_tx, 1)
            .from(utxos)
            .addOutput(new tbc.Transaction.Output({
            script: code,
            satoshis: 200,
        }))
            .addOutput(new tbc.Transaction.Output({
            script: NFT.buildHoldScript(address_to),
            satoshis: 100,
        }))
            .addOutput(new tbc.Transaction.Output({
            script: NFT.buildTapeScript(this.nftData),
            satoshis: 0,
        }))
            .feePerKb(80)
            .change(address_from)
            .setInputScript({
            inputIndex: 0,
            privateKey,
        }, (tx) => {
            const Sig = tx.getSignature(0);
            const SigLength = (Sig.length / 2).toString(16);
            const sig = SigLength + Sig;
            const publicKeylength = (privateKey.toPublicKey().toBuffer().toString("hex").length / 2).toString(16);
            const publickey = publicKeylength +
                privateKey.toPublicKey().toBuffer().toString("hex");
            const currenttxdata = (0, nftunlock_1.getCurrentTxdata)(tx);
            const prepretxdata = (0, nftunlock_1.getPrePreTxdata)(pre_pre_tx);
            const pretxdata = (0, nftunlock_1.getPreTxdata)(pre_tx);
            return new tbc.Script(sig + publickey + currenttxdata + prepretxdata + pretxdata);
        })
            .setInputScript({
            inputIndex: 1,
            privateKey,
        }, (tx) => {
            const Sig = tx.getSignature(1);
            const SigLength = (Sig.length / 2).toString(16);
            const sig = SigLength + Sig;
            const publicKeylength = (privateKey.toPublicKey().toBuffer().toString("hex").length / 2).toString(16);
            const publickey = publicKeylength +
                privateKey.toPublicKey().toBuffer().toString("hex");
            return new tbc.Script(sig + publickey);
        })
            .sign(privateKey)
            .seal();
        console.log(tx.verify());
        return tx.uncheckedSerialize();
    }
    transferNFT_v0(address_from, address_to, privateKey, utxos, pre_tx, pre_pre_tx) {
        const code = NFT.buildCodeScript_v0(this.collection_id, this.collection_index);
        const tx = new tbc.Transaction()
            .addInputFromPrevTx(pre_tx, 0)
            .addInputFromPrevTx(pre_tx, 1)
            .from(utxos)
            .addOutput(new tbc.Transaction.Output({
            script: code,
            satoshis: 200,
        }))
            .addOutput(new tbc.Transaction.Output({
            script: NFT.buildHoldScript(address_to),
            satoshis: 100,
        }))
            .addOutput(new tbc.Transaction.Output({
            script: NFT.buildTapeScript(this.nftData),
            satoshis: 0,
        }))
            .feePerKb(80)
            .change(address_from)
            .setInputScript({
            inputIndex: 0,
            privateKey,
        }, (tx) => {
            const Sig = tx.getSignature(0);
            const SigLength = (Sig.length / 2).toString(16);
            const sig = SigLength + Sig;
            const publicKeylength = (privateKey.toPublicKey().toBuffer().toString("hex").length / 2).toString(16);
            const publickey = publicKeylength +
                privateKey.toPublicKey().toBuffer().toString("hex");
            const currenttxdata = NFT.getCurrentTxdata_v0(tx);
            const prepretxdata = NFT.getPrePreTxdata_v0(pre_pre_tx);
            const pretxdata = NFT.getPreTxdata_v0(pre_tx);
            return new tbc.Script(sig + publickey + currenttxdata + prepretxdata + pretxdata);
        })
            .setInputScript({
            inputIndex: 1,
            privateKey,
        }, (tx) => {
            const Sig = tx.getSignature(1);
            const SigLength = (Sig.length / 2).toString(16);
            const sig = SigLength + Sig;
            const publicKeylength = (privateKey.toPublicKey().toBuffer().toString("hex").length / 2).toString(16);
            const publickey = publicKeylength +
                privateKey.toPublicKey().toBuffer().toString("hex");
            return new tbc.Script(sig + publickey);
        })
            .sign(privateKey)
            .seal();
        console.log(tx.verify());
        return tx.uncheckedSerialize();
    }
    static buildCodeScript(tx_hash, outputIndex) {
        const tx_id = Buffer.from(tx_hash, "hex").reverse().toString("hex");
        const writer = new tbc.encoding.BufferWriter();
        const vout = writer.writeUInt32LE(outputIndex).toBuffer().toString("hex");
        const tx_id_vout = "0x" + tx_id + vout;
        const code = new tbc.Script("OP_1 OP_PICK OP_3 OP_SPLIT 0x01 0x14 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_OVER OP_TOALTSTACK OP_TOALTSTACK OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_OVER 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_HASH256 OP_6 OP_PUSH_META 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_OVER OP_TOALTSTACK OP_TOALTSTACK OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_SWAP OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUAL OP_IF OP_DROP OP_ELSE 0x24 " +
            tx_id_vout +
            " OP_EQUALVERIFY OP_ENDIF OP_OVER OP_FROMALTSTACK OP_EQUALVERIFY OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_DUP OP_HASH160 OP_FROMALTSTACK OP_EQUALVERIFY OP_CHECKSIG OP_RETURN");
        return code;
    }
    static buildCodeScript_v0(tx_hash, outputIndex) {
        const tx_id = Buffer.from(tx_hash, "hex").reverse().toString("hex");
        const writer = new tbc.encoding.BufferWriter();
        const vout = writer.writeUInt32LE(outputIndex).toBuffer().toString("hex");
        const tx_id_vout = "0x" + tx_id + vout;
        const code = new tbc.Script("OP_1 OP_PICK OP_3 OP_SPLIT 0x01 0x14 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_1 OP_PICK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_1 OP_PICK 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_SHA256 OP_6 OP_PUSH_META 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_1 OP_PICK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_SHA256 OP_SHA256 OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_SWAP OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUAL OP_IF OP_DROP OP_ELSE 0x24 " +
            tx_id_vout +
            " OP_EQUALVERIFY OP_ENDIF OP_1 OP_PICK OP_FROMALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_DUP OP_HASH160 OP_FROMALTSTACK OP_EQUALVERIFY OP_CHECKSIG OP_RETURN 0x05 0x33436f6465");
        return code;
    }
    static buildMintScript(address) {
        const pubKeyHash = tbc.Address.fromString(address).hashBuffer.toString("hex");
        const mint = new tbc.Script("OP_DUP OP_HASH160" +
            " 0x14 0x" +
            pubKeyHash +
            " OP_EQUALVERIFY OP_CHECKSIG OP_RETURN 0x0d 0x5630204d696e74204e486f6c64");
        return mint;
    }
    static buildHoldScript(address) {
        const pubKeyHash = tbc.Address.fromString(address).hashBuffer.toString("hex");
        const hold = new tbc.Script("OP_DUP OP_HASH160" +
            " 0x14 0x" +
            pubKeyHash +
            " OP_EQUALVERIFY OP_CHECKSIG OP_RETURN 0x0d 0x56302043757272204e486f6c64");
        return hold;
    }
    static buildTapeScript(data) {
        const dataHex = Buffer.from(JSON.stringify(data)).toString("hex");
        const tape = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${dataHex} 4e54617065`);
        return tape;
    }
    static decodeNFTDataFromHex(hex) {
        try {
            const jsonString = Buffer.from(hex, "hex").toString("utf8");
            return JSON.parse(jsonString);
        }
        catch (error) {
            throw new Error(`Failed to decode NFT data from hex: ${error.message}`);
        }
    }
    static encodeNFTDataToHex(data) {
        try {
            const jsonString = JSON.stringify(data);
            return Buffer.from(jsonString).toString("hex");
        }
        catch (error) {
            throw new Error(`Failed to encode NFT data to hex: ${error.message}`);
        }
    }
    static getCurrentTxdata_v0(tx) {
        const writer = new tbc.encoding.BufferWriter();
        writer.write(Buffer.from(amountlength, "hex"));
        writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
        writer.write((0, nftunlock_1.getLengthHex)(tx.outputs[0].script.toBuffer().length));
        writer.write(tx.outputs[0].script.toBuffer());
        writer.write(Buffer.from((0, nftunlock_1.getOutputsData)(tx, 1), "hex"));
        return writer.toBuffer().toString("hex");
    }
    static getPreTxdata_v0(tx) {
        const writer = new tbc.encoding.BufferWriter();
        writer.write(Buffer.from(vliolength, "hex"));
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
        writer.write((0, nftunlock_1.getLengthHex)(inputWriter.toBuffer().length));
        writer.write(inputWriter.toBuffer());
        writer.write(Buffer.from(hashlength, "hex"));
        writer.write(tbc.crypto.Hash.sha256(inputWriter2.toBuffer()));
        writer.write(Buffer.from(amountlength, "hex"));
        writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
        writer.write((0, nftunlock_1.getLengthHex)(tx.outputs[0].script.toBuffer().length));
        writer.write(tx.outputs[0].script.toBuffer());
        writer.write(Buffer.from(amountlength, "hex"));
        writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
        writer.write((0, nftunlock_1.getLengthHex)(tx.outputs[1].script.toBuffer().length));
        writer.write(tx.outputs[1].script.toBuffer());
        writer.write(Buffer.from((0, nftunlock_1.getOutputsData)(tx, 2), "hex"));
        return writer.toBuffer().toString("hex");
    }
    static getPrePreTxdata_v0(tx) {
        const writer = new tbc.encoding.BufferWriter();
        writer.write(Buffer.from(vliolength, "hex"));
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
        writer.write(Buffer.from(hashlength, "hex"));
        writer.write(tbc.crypto.Hash.sha256(inputWriter.toBuffer()));
        writer.write(Buffer.from(hashlength, "hex"));
        writer.write(tbc.crypto.Hash.sha256(inputWriter2.toBuffer()));
        writer.write(Buffer.from(amountlength, "hex"));
        writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
        writer.write((0, nftunlock_1.getLengthHex)(tx.outputs[0].script.toBuffer().length));
        writer.write(tx.outputs[0].script.toBuffer());
        writer.write(Buffer.from((0, nftunlock_1.getOutputsData)(tx, 1), "hex"));
        return writer.toBuffer().toString("hex");
    }
}
module.exports = NFT;
