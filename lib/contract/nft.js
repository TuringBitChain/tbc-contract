"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var tbc = require("tbc-lib-js");
var NFT = /** @class */ (function () {
    function NFT(contract_id) {
        this.collection_id = "";
        this.collection_index = 0;
        this.collection_name = "";
        this.code_balance = 0;
        this.hold_balance = 0;
        this.transfer_count = 0;
        this.contract_id = "";
        this.nftData = {
            nftName: "",
            symbol: "",
            file: "",
            description: "",
            attributes: "",
        };
        this.contract_id = contract_id;
    }
    NFT.prototype.initialize = function (nftInfo) {
        var collectionId = nftInfo.collectionId, collectionIndex = nftInfo.collectionIndex, collectionName = nftInfo.collectionName, nftCodeBalance = nftInfo.nftCodeBalance, nftP2pkhBalance = nftInfo.nftP2pkhBalance, nftName = nftInfo.nftName, nftSymbol = nftInfo.nftSymbol, nft_attributes = nftInfo.nft_attributes, nftDescription = nftInfo.nftDescription, nftTransferTimeCount = nftInfo.nftTransferTimeCount, nftIcon = nftInfo.nftIcon;
        var file = "";
        var writer = new tbc.encoding.BufferWriter();
        if (nftIcon ===
            collectionId +
                writer.writeUInt32LE(collectionIndex).toBuffer().toString("hex")) {
            file = nftIcon;
        }
        else {
            file = this.contract_id + "00000000";
        }
        this.nftData = {
            nftName: nftName,
            symbol: nftSymbol,
            description: nftDescription,
            attributes: nft_attributes,
            file: file,
        };
        this.collection_id = collectionId;
        this.collection_index = collectionIndex;
        this.collection_name = collectionName;
        this.code_balance = nftCodeBalance;
        this.hold_balance = nftP2pkhBalance;
        this.transfer_count = nftTransferTimeCount;
    };
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
    NFT.createCollection = function (address, privateKey, data, utxos) {
        var tx = new tbc.Transaction().from(utxos).addOutput(new tbc.Transaction.Output({
            script: NFT.buildTapeScript(data),
            satoshis: 0,
        }));
        for (var i = 0; i < data.supply; i++) {
            tx.addOutput(new tbc.Transaction.Output({
                script: NFT.buildMintScript(address),
                satoshis: 100,
            }));
        }
        tx.feePerKb(100).change(address).sign(privateKey).seal();
        return tx.uncheckedSerialize();
    };
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
    NFT.createNFT = function (collection_id, address, privateKey, data, utxos, nfttxo) {
        var hold = NFT.buildHoldScript(address);
        if (!data.file) {
            var writer = new tbc.encoding.BufferWriter();
            data.file =
                collection_id +
                    writer.writeUInt32LE(nfttxo.outputIndex).toBuffer().toString("hex");
        }
        var tx = new tbc.Transaction()
            .from(nfttxo)
            .from(utxos)
            .addOutput(new tbc.Transaction.Output({
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
            privateKey: privateKey,
        }, function (tx) {
            var Sig = tx.getSignature(0);
            var SigLength = (Sig.length / 2).toString(16);
            var sig = SigLength + Sig;
            var publicKeylength = (privateKey.toPublicKey().toBuffer().toString("hex").length / 2).toString(16);
            var publickey = publicKeylength +
                privateKey.toPublicKey().toBuffer().toString("hex");
            return new tbc.Script(sig + publickey);
        })
            .sign(privateKey)
            .seal();
        return tx.uncheckedSerialize();
    };
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
    NFT.prototype.transferNFT = function (address_from, address_to, privateKey, utxos, pre_tx, pre_pre_tx) {
        var code = NFT.buildCodeScript(this.collection_id, this.collection_index);
        var tx = new tbc.Transaction()
            .addInputFromPrevTx(pre_tx, 0)
            .addInputFromPrevTx(pre_tx, 1)
            .from(utxos)
            .addOutput(new tbc.Transaction.Output({
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
            privateKey: privateKey,
        }, function (tx) {
            var Sig = tx.getSignature(0);
            var SigLength = (Sig.length / 2).toString(16);
            var sig = SigLength + Sig;
            var publicKeylength = (privateKey.toPublicKey().toBuffer().toString("hex").length / 2).toString(16);
            var publickey = publicKeylength +
                privateKey.toPublicKey().toBuffer().toString("hex");
            var currenttxdata = NFT.getCurrentTxdata(tx);
            var prepretxdata = NFT.getPrePreTxdata(pre_pre_tx);
            var pretxdata = NFT.getPreTxdata(pre_tx);
            return new tbc.Script(sig + publickey + currenttxdata + prepretxdata + pretxdata);
        })
            .setInputScript({
            inputIndex: 1,
            privateKey: privateKey,
        }, function (tx) {
            var Sig = tx.getSignature(1);
            var SigLength = (Sig.length / 2).toString(16);
            var sig = SigLength + Sig;
            var publicKeylength = (privateKey.toPublicKey().toBuffer().toString("hex").length / 2).toString(16);
            var publickey = publicKeylength +
                privateKey.toPublicKey().toBuffer().toString("hex");
            return new tbc.Script(sig + publickey);
        })
            .sign(privateKey)
            .seal();
        return tx.uncheckedSerialize();
    };
    NFT.buildCodeScript = function (tx_hash, outputIndex) {
        var tx_id = Buffer.from(tx_hash, "hex").reverse().toString("hex");
        var writer = new tbc.encoding.BufferWriter();
        var vout = writer.writeUInt32LE(outputIndex).toBuffer().toString("hex");
        var tx_id_vout = "0x" + tx_id + vout;
        var code = new tbc.Script("OP_1 OP_PICK OP_3 OP_SPLIT 0x01 0x14 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_1 OP_PICK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_1 OP_PICK 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_SHA256 OP_6 OP_PUSH_META 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_1 OP_PICK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_SHA256 OP_SHA256 OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_SWAP OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUAL OP_IF OP_DROP OP_ELSE 0x24 " +
            tx_id_vout +
            " OP_EQUALVERIFY OP_ENDIF OP_1 OP_PICK OP_FROMALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_DUP OP_HASH160 OP_FROMALTSTACK OP_EQUALVERIFY OP_CHECKSIG OP_RETURN 0x05 0x33436f6465");
        return code;
    };
    NFT.buildMintScript = function (address) {
        var pubKeyHash = tbc.Address.fromString(address).hashBuffer.toString("hex");
        var mint = new tbc.Script("OP_DUP OP_HASH160" +
            " 0x14 0x" +
            pubKeyHash +
            " OP_EQUALVERIFY OP_CHECKSIG OP_RETURN 0x0d 0x5630204d696e74204e486f6c64");
        return mint;
    };
    NFT.buildHoldScript = function (address) {
        var pubKeyHash = tbc.Address.fromString(address).hashBuffer.toString("hex");
        var hold = new tbc.Script("OP_DUP OP_HASH160" +
            " 0x14 0x" +
            pubKeyHash +
            " OP_EQUALVERIFY OP_CHECKSIG OP_RETURN 0x0d 0x56302043757272204e486f6c64");
        return hold;
    };
    NFT.buildTapeScript = function (data) {
        var dataHex = Buffer.from(JSON.stringify(data)).toString("hex");
        var tape = tbc.Script.fromASM("OP_FALSE OP_RETURN ".concat(dataHex, " 4e54617065"));
        return tape;
    };
    NFT.getCurrentTxdata = function (tx) {
        var amountlength = "08";
        var writer = new tbc.encoding.BufferWriter();
        writer.write(Buffer.from(amountlength, "hex"));
        writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
        writer.write(NFT.getLengthHex(tx.outputs[0].script.toBuffer().length));
        writer.write(tx.outputs[0].script.toBuffer());
        writer.write(Buffer.from(NFT.getOutputsData(tx, 1), "hex"));
        return writer.toBuffer().toString("hex");
    };
    NFT.getPreTxdata = function (tx) {
        var version = 10;
        var vliolength = "10";
        var amountlength = "08";
        var hashlength = "20";
        var writer = new tbc.encoding.BufferWriter();
        writer.write(Buffer.from(vliolength, "hex"));
        writer.writeUInt32LE(version);
        writer.writeUInt32LE(tx.nLockTime);
        writer.writeInt32LE(tx.inputs.length);
        writer.writeInt32LE(tx.outputs.length);
        var inputWriter = new tbc.encoding.BufferWriter();
        var inputWriter2 = new tbc.encoding.BufferWriter();
        for (var _i = 0, _a = tx.inputs; _i < _a.length; _i++) {
            var input = _a[_i];
            inputWriter.writeReverse(input.prevTxId);
            inputWriter.writeUInt32LE(input.outputIndex);
            inputWriter.writeUInt32LE(input.sequenceNumber);
            inputWriter2.write(tbc.crypto.Hash.sha256(input.script.toBuffer()));
        }
        writer.write(NFT.getLengthHex(inputWriter.toBuffer().length));
        writer.write(inputWriter.toBuffer());
        writer.write(Buffer.from(hashlength, "hex"));
        writer.write(tbc.crypto.Hash.sha256(inputWriter2.toBuffer()));
        writer.write(Buffer.from(amountlength, "hex"));
        writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
        writer.write(NFT.getLengthHex(tx.outputs[0].script.toBuffer().length));
        writer.write(tx.outputs[0].script.toBuffer());
        writer.write(Buffer.from(amountlength, "hex"));
        writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
        writer.write(NFT.getLengthHex(tx.outputs[1].script.toBuffer().length));
        writer.write(tx.outputs[1].script.toBuffer());
        writer.write(Buffer.from(NFT.getOutputsData(tx, 2), "hex"));
        return writer.toBuffer().toString("hex");
    };
    NFT.getPrePreTxdata = function (tx) {
        var version = 10;
        var vliolength = "10";
        var amountlength = "08";
        var hashlength = "20";
        var writer = new tbc.encoding.BufferWriter();
        writer.write(Buffer.from(vliolength, "hex"));
        writer.writeUInt32LE(version);
        writer.writeUInt32LE(tx.nLockTime);
        writer.writeInt32LE(tx.inputs.length);
        writer.writeInt32LE(tx.outputs.length);
        var inputWriter = new tbc.encoding.BufferWriter();
        var inputWriter2 = new tbc.encoding.BufferWriter();
        for (var _i = 0, _a = tx.inputs; _i < _a.length; _i++) {
            var input = _a[_i];
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
        writer.write(NFT.getLengthHex(tx.outputs[0].script.toBuffer().length));
        writer.write(tx.outputs[0].script.toBuffer());
        writer.write(Buffer.from(NFT.getOutputsData(tx, 1), "hex"));
        return writer.toBuffer().toString("hex");
    };
    NFT.getOutputsData = function (tx, index) {
        var outputs = "";
        var outputslength = "";
        var outputWriter = new tbc.encoding.BufferWriter();
        for (var i = index; i < tx.outputs.length; i++) {
            outputWriter.writeUInt64LEBN(tx.outputs[i].satoshisBN);
            outputWriter.write(tbc.crypto.Hash.sha256(tx.outputs[i].script.toBuffer()));
        }
        outputs = outputWriter.toBuffer().toString("hex");
        if (outputs === "") {
            outputs = "00";
            outputslength = "";
        }
        else {
            outputslength = NFT.getLengthHex(outputs.length / 2).toString("hex");
        }
        return outputslength + outputs;
    };
    NFT.getLengthHex = function (length) {
        if (length < 76) {
            return Buffer.from(length.toString(16).padStart(2, "0"), "hex");
        }
        else if (length <= 255) {
            return Buffer.concat([
                Buffer.from("4c", "hex"),
                Buffer.from(length.toString(16).padStart(2, "0"), "hex"),
            ]);
        }
        else if (length <= 65535) {
            return Buffer.concat([
                Buffer.from("4d", "hex"),
                Buffer.from(length.toString(16).padStart(4, "0"), "hex").reverse(),
            ]);
        }
        else if (length <= 0xffffffff) {
            var lengthBuffer = Buffer.alloc(4);
            lengthBuffer.writeUInt32LE(length);
            return Buffer.concat([Buffer.from("4e", "hex"), lengthBuffer]);
        }
        else {
            throw new Error("Length exceeds maximum supported size (4 GB)");
        }
    };
    return NFT;
}());
module.exports = NFT;
