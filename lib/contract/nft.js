"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var tbc = require("tbc-lib-js");
var fs = require('fs').promises;
var path = require('path');
;
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
            discription: "",
            attributes: "",
        };
        this.contract_id = contract_id;
    }
    NFT.prototype.initialize = function (nftInfo) {
        var collectionId = nftInfo.collectionId, collectionIndex = nftInfo.collectionIndex, collectionName = nftInfo.collectionName, nftCodeBalance = nftInfo.nftCodeBalance, nftP2pkhBalance = nftInfo.nftP2pkhBalance, nftName = nftInfo.nftName, nftSymbol = nftInfo.nftSymbol, nft_attributes = nftInfo.nft_attributes, nftDescription = nftInfo.nftDescription, nftTransferTimeCount = nftInfo.nftTransferTimeCount, nftIcon = nftInfo.nftIcon;
        var file = "";
        var writer = new tbc.encoding.BufferWriter();
        if (nftIcon === collectionId + writer.writeUInt32LE(collectionIndex).toBuffer().toString("hex")) {
            file = nftIcon;
        }
        else {
            file = this.contract_id + "00000000";
        }
        this.nftData = {
            nftName: nftName,
            symbol: nftSymbol,
            discription: nftDescription,
            attributes: nft_attributes,
            file: file
        };
        this.collection_id = collectionId;
        this.collection_index = collectionIndex;
        this.collection_name = collectionName;
        this.code_balance = nftCodeBalance;
        this.hold_balance = nftP2pkhBalance;
        this.transfer_count = nftTransferTimeCount;
    };
    NFT.createCollection = function (address, privateKey, data, utxos) {
        var tx = new tbc.Transaction();
        for (var i = 0; i < utxos.length; i++) {
            tx.from(utxos[i]);
        }
        tx.addOutput(new tbc.Transaction.Output({
            script: NFT.buildTapeScript(data),
            satoshis: 0,
        }));
        for (var i = 0; i < data.supply; i++) {
            tx.addOutput(new tbc.Transaction.Output({
                script: NFT.buildHoldScript(address),
                satoshis: 100,
            }));
        }
        tx.feePerKb(100)
            .change(address)
            .sign(privateKey);
        return tx.uncheckedSerialize();
    };
    NFT.createNFT = function (collection_id, address, privateKey, data, utxos, nfttxo) {
        var hold = NFT.buildHoldScript(address);
        if (!data.file) {
            var writer = new tbc.encoding.BufferWriter();
            data.file = collection_id + writer.writeUInt32LE(nfttxo.outputIndex).toBuffer().toString("hex");
        }
        var tx = new tbc.Transaction();
        tx.from(nfttxo);
        for (var i = 0; i < utxos.length; i++) {
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
            privateKey: privateKey
        }, function (tx) {
            var Sig = tx.getSignature(0);
            var SigLength = (Sig.length / 2).toString(16);
            var sig = SigLength + Sig;
            var publicKeylength = (privateKey.toPublicKey().toBuffer().toString('hex').length / 2).toString(16);
            var publickey = publicKeylength + privateKey.toPublicKey().toBuffer().toString('hex');
            return new tbc.Script(sig + publickey);
        })
            .sign(privateKey)
            .seal();
        return tx.uncheckedSerialize();
        ;
    };
    NFT.prototype.transferNFT = function (address_from, address_to, privateKey, utxos, pre_tx, pre_pre_tx) {
        var code = NFT.buildCodeScript(this.collection_id, this.collection_index);
        var tx = new tbc.Transaction()
            .addInputFromPrevTx(pre_tx, 0)
            .addInputFromPrevTx(pre_tx, 1);
        for (var i = 0; i < utxos.length; i++) {
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
            privateKey: privateKey
        }, function (tx) {
            var Sig = tx.getSignature(0);
            var SigLength = (Sig.length / 2).toString(16);
            var sig = SigLength + Sig;
            var publicKeylength = (privateKey.toPublicKey().toBuffer().toString('hex').length / 2).toString(16);
            var publickey = publicKeylength + privateKey.toPublicKey().toBuffer().toString('hex');
            var currenttxdata = NFT.getCurrentTxdata(tx);
            var prepretxdata = NFT.getPrePreTxdata(pre_pre_tx);
            var pretxdata = NFT.getPreTxdata(pre_tx);
            return new tbc.Script(sig + publickey + currenttxdata + prepretxdata + pretxdata);
        })
            .setInputScript({
            inputIndex: 1,
            privateKey: privateKey
        }, function (tx) {
            var Sig = tx.getSignature(1);
            var SigLength = (Sig.length / 2).toString(16);
            var sig = SigLength + Sig;
            var publicKeylength = (privateKey.toPublicKey().toBuffer().toString('hex').length / 2).toString(16);
            var publickey = publicKeylength + privateKey.toPublicKey().toBuffer().toString('hex');
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
        var code = new tbc.Script('OP_1 OP_PICK OP_3 OP_SPLIT 0x01 0x14 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_1 OP_PICK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_1 OP_PICK 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_SHA256 OP_6 OP_PUSH_META 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_1 OP_PICK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_SHA256 OP_SHA256 OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_SWAP OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUAL OP_IF OP_DROP OP_ELSE 0x24 ' + tx_id_vout + ' OP_EQUALVERIFY OP_ENDIF OP_1 OP_PICK OP_FROMALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_DUP OP_HASH160 OP_FROMALTSTACK OP_EQUALVERIFY OP_CHECKSIG OP_RETURN 0x05 0x33436f6465');
        return code;
    };
    ;
    NFT.buildHoldScript = function (address) {
        var pubKeyHash = tbc.Address.fromString(address).hashBuffer.toString("hex");
        var hold = new tbc.Script('OP_DUP OP_HASH160' + ' 0x14 0x' + pubKeyHash + ' OP_EQUALVERIFY OP_CHECKSIG OP_RETURN 0x0d 0x5631204d696e74204e486f6c64');
        return hold;
    };
    NFT.buildTapeScript = function (data) {
        var dataHex = Buffer.from(JSON.stringify(data)).toString("hex");
        var tape = tbc.Script.fromASM("OP_FALSE OP_RETURN ".concat(dataHex, " 4e54617065"));
        return tape;
    };
    NFT.encodeByBase64 = function (filePath) {
        return __awaiter(this, void 0, void 0, function () {
            var data, ext, mimeType, base64Data, err_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, fs.readFile(filePath)];
                    case 1:
                        data = _a.sent();
                        ext = path.extname(filePath).toLowerCase();
                        mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
                        base64Data = "data:".concat(mimeType, ";base64,").concat(data.toString("base64"));
                        return [2 /*return*/, base64Data];
                    case 2:
                        err_1 = _a.sent();
                        throw new Error("Failed to read or encode file: ".concat(err_1.message));
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    NFT.getCurrentTxdata = function (tx) {
        var amountlength = '08';
        var writer = new tbc.encoding.BufferWriter();
        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
        writer.write(NFT.getLengthHex(tx.outputs[0].script.toBuffer().length));
        writer.write(tx.outputs[0].script.toBuffer());
        writer.write(Buffer.from(NFT.getOutputsData(tx, 1), 'hex'));
        return writer.toBuffer().toString('hex');
    };
    NFT.getPreTxdata = function (tx) {
        var version = 10;
        var vliolength = '10';
        var amountlength = '08';
        var hashlength = '20';
        var writer = new tbc.encoding.BufferWriter();
        writer.write(Buffer.from(vliolength, 'hex'));
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
    };
    NFT.getPrePreTxdata = function (tx) {
        var version = 10;
        var vliolength = '10';
        var amountlength = '08';
        var hashlength = '20';
        var writer = new tbc.encoding.BufferWriter();
        writer.write(Buffer.from(vliolength, 'hex'));
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
    };
    NFT.getOutputsData = function (tx, index) {
        var outputs = '';
        var outputslength = '';
        var outputWriter = new tbc.encoding.BufferWriter();
        for (var i = index; i < tx.outputs.length; i++) {
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
    };
    NFT.getLengthHex = function (length) {
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
            var lengthBuffer = Buffer.alloc(4);
            lengthBuffer.writeUInt32LE(length);
            return Buffer.concat([Buffer.from('4e', 'hex'), lengthBuffer]);
        }
        else {
            throw new Error('Length exceeds maximum supported size (4 GB)');
        }
    };
    return NFT;
}());
module.exports = NFT;
