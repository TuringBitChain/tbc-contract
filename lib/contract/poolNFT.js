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
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
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
var API = require('../api/api');
var FT = require('./ft');
var partial_sha256 = require('tbc-lib-js/lib/util/partial-sha256');
var version = 10;
var vliolength = '10';
var amountlength = '08';
var hashlength = '20';
var poolNFT = /** @class */ (function () {
    function poolNFT(config) {
        var _a;
        this.ft_lp_amount = BigInt(0);
        this.ft_a_amount = BigInt(0);
        this.tbc_amount = BigInt(0);
        this.ft_a_number = 0;
        this.ft_a_contractTxid = '';
        this.ft_lp_partialhash = '';
        this.ft_a_partialhash = '';
        this.poolnft_code = '';
        this.contractTxid = '';
        this.network = (_a = config === null || config === void 0 ? void 0 : config.network) !== null && _a !== void 0 ? _a : "mainnet";
        if (typeof config.txidOrParams === 'string') {
            this.contractTxid = config.txidOrParams;
        }
        else if (config.txidOrParams) {
            if (config.txidOrParams.ft_a <= 0 || config.txidOrParams.tbc_amount <= 0) {
                throw new Error("Invalid number.");
            }
            this.ft_a_amount = BigInt(0);
            this.tbc_amount = BigInt(config.txidOrParams.tbc_amount * Math.pow(10, 6));
            this.ft_lp_amount = this.tbc_amount;
            this.ft_a_number = config.txidOrParams.ft_a;
            this.ft_a_contractTxid = config.txidOrParams.ftContractTxid;
        }
    }
    poolNFT.prototype.initCreate = function (ftContractTxid) {
        return __awaiter(this, void 0, void 0, function () {
            var FTA;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!(!ftContractTxid && this.ft_a_contractTxid != '')) return [3 /*break*/, 2];
                        FTA = new FT({ txidOrParams: this.ft_a_contractTxid, network: this.network });
                        return [4 /*yield*/, FTA.initialize()];
                    case 1:
                        _a.sent();
                        this.ft_a_amount = BigInt(this.ft_a_number * Math.pow(10, FTA.decimal));
                        return [3 /*break*/, 3];
                    case 2:
                        if (ftContractTxid) {
                            this.ft_a_contractTxid = ftContractTxid;
                        }
                        else {
                            throw new Error('Invalid Input');
                        }
                        _a.label = 3;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    poolNFT.prototype.initfromContractId = function () {
        return __awaiter(this, void 0, void 0, function () {
            var poolNFTInfo;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.fetchPoolNFTInfo(this.contractTxid)];
                    case 1:
                        poolNFTInfo = _a.sent();
                        this.ft_lp_amount = poolNFTInfo.ft_lp_amount;
                        this.ft_a_amount = poolNFTInfo.ft_a_amount;
                        this.tbc_amount = poolNFTInfo.tbc_amount;
                        this.ft_lp_partialhash = poolNFTInfo.ft_lp_partialhash;
                        this.ft_a_partialhash = poolNFTInfo.ft_a_partialhash;
                        this.ft_a_contractTxid = poolNFTInfo.ft_a_contractTxid;
                        this.poolnft_code = poolNFTInfo.poolnft_code;
                        return [2 /*return*/];
                }
            });
        });
    };
    poolNFT.prototype.createPoolNFT = function (privateKey_from) {
        return __awaiter(this, void 0, void 0, function () {
            var privateKey, FTA, utxo, ftlpCode, writer, amountData, poolnftTapeScript, tx, txraw;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        privateKey = privateKey_from;
                        FTA = new FT({ txidOrParams: this.ft_a_contractTxid, network: this.network });
                        return [4 /*yield*/, FTA.initialize()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, API.fetchUTXO(privateKey, 0.1, this.network)];
                    case 2:
                        utxo = _a.sent();
                        this.poolnft_code = this.getPoolNftCode(utxo.txId, utxo.outputIndex).toBuffer().toString('hex');
                        ftlpCode = this.getFTLPcode(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, 'hex')).toString('hex'), privateKey.toAddress().toString(), FTA.tapeScript.length / 2);
                        this.ft_lp_partialhash = partial_sha256.calculate_partial_hash(ftlpCode.toBuffer().subarray(0, 1536));
                        this.ft_a_partialhash = partial_sha256.calculate_partial_hash(Buffer.from(FTA.codeScript, 'hex').subarray(0, 1536));
                        writer = new tbc.encoding.BufferWriter();
                        writer.writeUInt64LEBN(new tbc.crypto.BN(0));
                        writer.writeUInt64LEBN(new tbc.crypto.BN(0));
                        writer.writeUInt64LEBN(new tbc.crypto.BN(0));
                        amountData = writer.toBuffer().toString('hex');
                        poolnftTapeScript = tbc.Script.fromASM("OP_FALSE OP_RETURN ".concat(this.ft_lp_partialhash + this.ft_a_partialhash, " ").concat(amountData, " ").concat(this.ft_a_contractTxid, " 4e54617065"));
                        tx = new tbc.Transaction()
                            .from(utxo)
                            //poolNft
                            .addOutput(new tbc.Transaction.Output({
                            script: tbc.Script.fromHex(this.poolnft_code),
                            satoshis: 2000,
                        }))
                            .addOutput(new tbc.Transaction.Output({
                            script: poolnftTapeScript,
                            satoshis: 0,
                        }));
                        tx.feePerKb(100);
                        tx.change(privateKey.toAddress());
                        tx.sign(privateKey);
                        tx.seal();
                        txraw = tx.uncheckedSerialize();
                        return [2 /*return*/, txraw];
                }
            });
        });
    };
    poolNFT.prototype.initPoolNFT = function (privateKey_from, address_to, tbc_amount, ft_a) {
        return __awaiter(this, void 0, void 0, function () {
            var privateKey, FTA, amount_lpbn, tapeAmountSetIn, utxo, poolnft_codehash, poolnft_codehash160, maxAmount, fttxo_a, tapeAmountSum, i, _a, amountHex, changeHex, writer, amountData, poolnftTapeScript, poolnft, tx, ftCodeScript, ftTapeScript, nameHex, symbolHex, ftlp_amount, amountwriter, i, ftlpTapeAmount, ftlpTapeScript, tapeSize, ftlpCodeScript, changeCodeScript, changeTapeScript, txraw;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        privateKey = privateKey_from;
                        FTA = new FT({ txidOrParams: this.ft_a_contractTxid, network: this.network });
                        return [4 /*yield*/, FTA.initialize()];
                    case 1:
                        _b.sent();
                        amount_lpbn = BigInt(0);
                        if (tbc_amount && ft_a) {
                            amount_lpbn = BigInt(tbc_amount / 10 * Math.pow(10, 6));
                            this.tbc_amount = BigInt(tbc_amount * Math.pow(10, 6));
                            this.ft_lp_amount = this.tbc_amount - amount_lpbn;
                            this.ft_a_number = ft_a;
                            this.ft_a_amount = BigInt(this.ft_a_number * Math.pow(10, FTA.decimal));
                        }
                        else if (!tbc_amount && !ft_a && this.tbc_amount != BigInt(0) && this.ft_a_amount != BigInt(0)) {
                            amount_lpbn = BigInt(BigInt(this.tbc_amount) / BigInt(10));
                            this.tbc_amount = this.tbc_amount;
                            this.ft_lp_amount = this.tbc_amount - amount_lpbn;
                            this.ft_a_amount = this.ft_a_amount;
                        }
                        else {
                            throw new Error('Invalid Input');
                        }
                        tapeAmountSetIn = [];
                        return [4 /*yield*/, API.fetchUTXO(privateKey, 0.1, this.network)];
                    case 2:
                        utxo = _b.sent();
                        if (utxo.satoshis < this.tbc_amount) {
                            throw new Error('Insufficient TBC amount, please merge UTXOs');
                        }
                        poolnft_codehash = tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, 'hex'));
                        poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(poolnft_codehash).toString('hex');
                        maxAmount = Math.pow(10, 18 - FTA.decimal);
                        if (this.ft_a_number > maxAmount) {
                            throw new Error("When decimal is ".concat(FTA.decimal, ", the maximum amount cannot exceed ").concat(maxAmount));
                        }
                        return [4 /*yield*/, FTA.fetchFtTXO(this.ft_a_contractTxid, privateKey.toAddress().toString(), this.ft_a_amount)];
                    case 3:
                        fttxo_a = _b.sent();
                        if (fttxo_a.ftBalance < this.ft_a_amount) {
                            throw new Error('Insufficient FT-A amount, please merge FT-A UTXOs');
                        }
                        tapeAmountSetIn.push(fttxo_a.ftBalance);
                        tapeAmountSum = BigInt(0);
                        for (i = 0; i < tapeAmountSetIn.length; i++) {
                            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
                        }
                        _a = FT.buildTapeAmount(this.ft_a_amount, tapeAmountSetIn, 1), amountHex = _a.amountHex, changeHex = _a.changeHex;
                        writer = new tbc.encoding.BufferWriter();
                        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_lp_amount));
                        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_a_amount));
                        writer.writeUInt64LEBN(new tbc.crypto.BN(this.tbc_amount));
                        amountData = writer.toBuffer().toString('hex');
                        poolnftTapeScript = tbc.Script.fromASM("OP_FALSE OP_RETURN ".concat(this.ft_lp_partialhash + this.ft_a_partialhash, " ").concat(amountData, " ").concat(this.ft_a_contractTxid, " 4e54617065"));
                        return [4 /*yield*/, this.fetchPoolNftUTXO(this.contractTxid)];
                    case 4:
                        poolnft = _b.sent();
                        tx = new tbc.Transaction()
                            .from(poolnft)
                            .from(fttxo_a)
                            .from(utxo)
                            //poolNft
                            .addOutput(new tbc.Transaction.Output({
                            script: tbc.Script.fromHex(this.poolnft_code),
                            satoshis: 2000,
                        }))
                            .addOutput(new tbc.Transaction.Output({
                            script: poolnftTapeScript,
                            satoshis: 0,
                        }));
                        ftCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
                        ftTapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: ftCodeScript,
                            satoshis: Number(this.tbc_amount),
                        }))
                            .addOutput(new tbc.Transaction.Output({
                            script: ftTapeScript,
                            satoshis: 0
                        }));
                        nameHex = Buffer.from(FTA.name, 'utf8').toString('hex');
                        symbolHex = Buffer.from(FTA.symbol, 'utf8').toString('hex');
                        ftlp_amount = new tbc.crypto.BN(amount_lpbn.toString());
                        amountwriter = new tbc.encoding.BufferWriter();
                        amountwriter.writeUInt64LEBN(ftlp_amount);
                        for (i = 1; i < 6; i++) {
                            amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
                        }
                        ftlpTapeAmount = amountwriter.toBuffer().toString('hex');
                        ftlpTapeScript = tbc.Script.fromASM("OP_FALSE OP_RETURN ".concat(ftlpTapeAmount, " 06 ").concat(nameHex, " ").concat(symbolHex, " 4654617065"));
                        tapeSize = ftlpTapeScript.toBuffer().length;
                        ftlpCodeScript = this.getFTLPcode(poolnft_codehash.toString('hex'), address_to, tapeSize);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: ftlpCodeScript,
                            satoshis: 2000
                        }));
                        tx.addOutput(new tbc.Transaction.Output({
                            script: ftlpTapeScript,
                            satoshis: 0
                        }));
                        if (this.ft_a_amount < tapeAmountSum) {
                            changeCodeScript = FT.buildFTtransferCode(FTA.codeScript, privateKey.toAddress().toString());
                            tx.addOutput(new tbc.Transaction.Output({
                                script: changeCodeScript,
                                satoshis: 2000
                            }));
                            changeTapeScript = FT.buildFTtransferTape(FTA.tapeScript, changeHex);
                            tx.addOutput(new tbc.Transaction.Output({
                                script: changeTapeScript,
                                satoshis: 0
                            }));
                        }
                        tx.feePerKb(100);
                        tx.change(privateKey.toAddress());
                        return [4 /*yield*/, tx.setInputScriptAsync({
                                inputIndex: 0,
                            }, function (tx) { return __awaiter(_this, void 0, void 0, function () {
                                var unlockingScript;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, this.getPoolNFTunlock(privateKey, tx, 0, poolnft.txId, poolnft.outputIndex, 1)];
                                        case 1:
                                            unlockingScript = _a.sent();
                                            return [2 /*return*/, unlockingScript];
                                    }
                                });
                            }); })];
                    case 5:
                        _b.sent();
                        return [4 /*yield*/, tx.setInputScriptAsync({
                                inputIndex: 1,
                            }, function (tx) { return __awaiter(_this, void 0, void 0, function () {
                                var unlockingScript;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, FTA.getFTunlock(privateKey, tx, 1, fttxo_a.txId, fttxo_a.outputIndex)];
                                        case 1:
                                            unlockingScript = _a.sent();
                                            return [2 /*return*/, unlockingScript];
                                    }
                                });
                            }); })];
                    case 6:
                        _b.sent();
                        tx.sign(privateKey);
                        return [4 /*yield*/, tx.sealAsync()];
                    case 7:
                        _b.sent();
                        txraw = tx.uncheckedSerialize();
                        //console.log(tx.verify());
                        return [2 /*return*/, txraw];
                }
            });
        });
    };
    poolNFT.prototype.increaseLP = function (privateKey_from, address_to, amount_tbc) {
        return __awaiter(this, void 0, void 0, function () {
            var privateKey, FTA, amount_tbcbn, changeDate, poolnft_codehash, poolnft_codehash160, tapeAmountSetIn, fttxo_a, tapeAmountSum, i, _a, amountHex, changeHex, utxo, poolnft, tx, writer, amountData, poolnftTapeScript, ftabycCodeScript, ftabycTapeScript, nameHex, symbolHex, ftlp_amount, amountwriter, i, ftlpTapeAmount, ftlpTapeScript, tapeSize, ftlpCodeScript, ftabya_changeCodeScript, ftabya_changeTapeScript, txraw;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        privateKey = privateKey_from;
                        FTA = new FT({ txidOrParams: this.ft_a_contractTxid, network: this.network });
                        return [4 /*yield*/, FTA.initialize()];
                    case 1:
                        _b.sent();
                        amount_tbcbn = BigInt(amount_tbc * Math.pow(10, 6));
                        changeDate = this.updatePoolNFT(amount_tbc, FTA.decimal, 2);
                        poolnft_codehash = tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, 'hex'));
                        poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(poolnft_codehash).toString('hex');
                        tapeAmountSetIn = [];
                        return [4 /*yield*/, FTA.fetchFtTXO(this.ft_a_contractTxid, privateKey.toAddress().toString(), changeDate.ft_a_difference)];
                    case 2:
                        fttxo_a = _b.sent();
                        tapeAmountSetIn.push(fttxo_a.ftBalance);
                        tapeAmountSum = BigInt(0);
                        for (i = 0; i < tapeAmountSetIn.length; i++) {
                            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
                        }
                        // Check if the balance is sufficient
                        if (changeDate.ft_a_difference > tapeAmountSum) {
                            throw new Error('Insufficient balance, please merge FT UTXOs');
                        }
                        _a = FT.buildTapeAmount(changeDate.ft_a_difference, tapeAmountSetIn, 1), amountHex = _a.amountHex, changeHex = _a.changeHex;
                        return [4 /*yield*/, API.fetchUTXO(privateKey, 0.1, this.network)];
                    case 3:
                        utxo = _b.sent();
                        if (utxo.satoshis < amount_tbcbn) {
                            throw new Error('Insufficient TBC amount, please merge UTXOs');
                        }
                        return [4 /*yield*/, this.fetchPoolNftUTXO(this.contractTxid)];
                    case 4:
                        poolnft = _b.sent();
                        tx = new tbc.Transaction()
                            .from(poolnft)
                            .from(fttxo_a)
                            .from(utxo);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: tbc.Script.fromHex(this.poolnft_code),
                            satoshis: 2000
                        }));
                        writer = new tbc.encoding.BufferWriter();
                        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_lp_amount));
                        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_a_amount));
                        writer.writeUInt64LEBN(new tbc.crypto.BN(this.tbc_amount));
                        amountData = writer.toBuffer().toString('hex');
                        poolnftTapeScript = tbc.Script.fromASM("OP_FALSE OP_RETURN ".concat(this.ft_lp_partialhash + this.ft_a_partialhash, " ").concat(amountData, " ").concat(this.ft_a_contractTxid, " 4e54617065"));
                        tx.addOutput(new tbc.Transaction.Output({
                            script: poolnftTapeScript,
                            satoshis: 0
                        }));
                        ftabycCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: ftabycCodeScript,
                            satoshis: Number(changeDate.tbc_amount_difference)
                        }));
                        ftabycTapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: ftabycTapeScript,
                            satoshis: 0
                        }));
                        nameHex = Buffer.from(FTA.name, 'utf8').toString('hex');
                        symbolHex = Buffer.from(FTA.symbol, 'utf8').toString('hex');
                        ftlp_amount = new tbc.crypto.BN(changeDate.ft_lp_difference.toString());
                        amountwriter = new tbc.encoding.BufferWriter();
                        amountwriter.writeUInt64LEBN(ftlp_amount);
                        for (i = 1; i < 6; i++) {
                            amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
                        }
                        ftlpTapeAmount = amountwriter.toBuffer().toString('hex');
                        ftlpTapeScript = tbc.Script.fromASM("OP_FALSE OP_RETURN ".concat(ftlpTapeAmount, " 06 ").concat(nameHex, " ").concat(symbolHex, " 4654617065"));
                        tapeSize = ftlpTapeScript.toBuffer().length;
                        ftlpCodeScript = this.getFTLPcode(poolnft_codehash.toString('hex'), address_to, tapeSize);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: ftlpCodeScript,
                            satoshis: 2000
                        }));
                        tx.addOutput(new tbc.Transaction.Output({
                            script: ftlpTapeScript,
                            satoshis: 0
                        }));
                        if (changeDate.ft_a_difference < tapeAmountSum) {
                            ftabya_changeCodeScript = FT.buildFTtransferCode(FTA.codeScript, privateKey.toAddress().toString());
                            tx.addOutput(new tbc.Transaction.Output({
                                script: ftabya_changeCodeScript,
                                satoshis: 2000
                            }));
                            ftabya_changeTapeScript = FT.buildFTtransferTape(FTA.tapeScript, changeHex);
                            tx.addOutput(new tbc.Transaction.Output({
                                script: ftabya_changeTapeScript,
                                satoshis: 0
                            }));
                        }
                        tx.feePerKb(100);
                        tx.change(privateKey.toAddress());
                        return [4 /*yield*/, tx.setInputScriptAsync({
                                inputIndex: 0,
                            }, function (tx) { return __awaiter(_this, void 0, void 0, function () {
                                var unlockingScript;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, this.getPoolNFTunlock(privateKey, tx, 0, poolnft.txId, poolnft.outputIndex, 1)];
                                        case 1:
                                            unlockingScript = _a.sent();
                                            return [2 /*return*/, unlockingScript];
                                    }
                                });
                            }); })];
                    case 5:
                        _b.sent();
                        return [4 /*yield*/, tx.setInputScriptAsync({
                                inputIndex: 1,
                            }, function (tx) { return __awaiter(_this, void 0, void 0, function () {
                                var unlockingScript;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, FTA.getFTunlock(privateKey, tx, 1, fttxo_a.txId, fttxo_a.outputIndex)];
                                        case 1:
                                            unlockingScript = _a.sent();
                                            return [2 /*return*/, unlockingScript];
                                    }
                                });
                            }); })];
                    case 6:
                        _b.sent();
                        tx.sign(privateKey);
                        return [4 /*yield*/, tx.sealAsync()];
                    case 7:
                        _b.sent();
                        txraw = tx.uncheckedSerialize();
                        return [2 /*return*/, txraw];
                }
            });
        });
    };
    poolNFT.prototype.consumLP = function (privateKey_from, address_to, amount_lp) {
        return __awaiter(this, void 0, void 0, function () {
            var privateKey, FTA, amount_lpbn, changeDate, poolnft_codehash160, tapeAmountSetIn, lpTapeAmountSetIn, ftlpCode, fttxo_lp, fttxo_c, tapeAmountSum, i, _a, amountHex, changeHex, ftAbyA, ftAbyC, ftlpBurn, ftlpChange, utxo, poolnft, tx, writer, amountData, poolnftTapeScript, ftCodeScript, ftTapeScript, nameHex, symbolHex, amountwriter, i, ftlpTapeAmount, ftlpTapeScript, ftlpCodeScript, ftlp_changeCodeScript, ftlp_changeTapeScript, ftabycCodeScript, ftabycTapeScript, txraw;
            var _b;
            var _this = this;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        privateKey = privateKey_from;
                        FTA = new FT({ txidOrParams: this.ft_a_contractTxid, network: this.network });
                        return [4 /*yield*/, FTA.initialize()];
                    case 1:
                        _c.sent();
                        amount_lpbn = BigInt(amount_lp * Math.pow(10, 6));
                        if (this.ft_lp_amount < amount_lpbn) {
                            throw new Error('Invalid FT-LP amount input');
                        }
                        changeDate = this.updatePoolNFT(amount_lp, FTA.decimal, 1);
                        poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, 'hex'))).toString('hex');
                        tapeAmountSetIn = [];
                        lpTapeAmountSetIn = [];
                        ftlpCode = this.getFTLPcode(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, 'hex')).toString('hex'), privateKey.toAddress().toString(), FTA.tapeScript.length / 2);
                        return [4 /*yield*/, this.fetchFtlpUTXO(ftlpCode.toBuffer().toString('hex'), amount_lpbn)];
                    case 2:
                        fttxo_lp = _c.sent();
                        if (fttxo_lp.ftBalance === undefined) {
                            throw new Error('ftBalance is undefined');
                        }
                        else if (fttxo_lp.ftBalance < amount_lpbn) {
                            throw new Error('Insufficient FT-LP amount, please merge FT-LP UTXOs');
                        }
                        lpTapeAmountSetIn.push(fttxo_lp.ftBalance);
                        return [4 /*yield*/, FTA.fetchFtTXO(this.ft_a_contractTxid, poolnft_codehash160, changeDate.ft_a_difference)];
                    case 3:
                        fttxo_c = _c.sent();
                        if (fttxo_c.ftBalance === undefined) {
                            throw new Error('ftBalance is undefined');
                        }
                        else if (BigInt(fttxo_c.satoshis) < changeDate.tbc_amount_difference) {
                            throw new Error('PoolFtUTXO tbc_amount is insufficient, please merge UTXOs');
                        }
                        tapeAmountSetIn.push(fttxo_c.ftBalance);
                        tapeAmountSum = BigInt(0);
                        for (i = 0; i < tapeAmountSetIn.length; i++) {
                            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
                        }
                        // Check if the balance is sufficient
                        if (changeDate.ft_a_difference > tapeAmountSum) {
                            throw new Error('Insufficient FT, please merge FT UTXOs');
                        }
                        _a = FT.buildTapeAmount(changeDate.ft_a_difference, tapeAmountSetIn, 2), amountHex = _a.amountHex, changeHex = _a.changeHex;
                        ftAbyA = amountHex;
                        ftAbyC = changeHex;
                        (_b = FT.buildTapeAmount(amount_lpbn, lpTapeAmountSetIn, 1), amountHex = _b.amountHex, changeHex = _b.changeHex);
                        ftlpBurn = amountHex;
                        ftlpChange = changeHex;
                        return [4 /*yield*/, API.fetchUTXO(privateKey, 0.1, this.network)];
                    case 4:
                        utxo = _c.sent();
                        return [4 /*yield*/, this.fetchPoolNftUTXO(this.contractTxid)];
                    case 5:
                        poolnft = _c.sent();
                        tx = new tbc.Transaction()
                            .from(poolnft)
                            .from(fttxo_lp)
                            .from(fttxo_c)
                            .from(utxo);
                        //poolNft
                        tx.addOutput(new tbc.Transaction.Output({
                            script: tbc.Script.fromHex(this.poolnft_code),
                            satoshis: 2000
                        }));
                        writer = new tbc.encoding.BufferWriter();
                        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_lp_amount));
                        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_a_amount));
                        writer.writeUInt64LEBN(new tbc.crypto.BN(this.tbc_amount));
                        amountData = writer.toBuffer().toString('hex');
                        poolnftTapeScript = tbc.Script.fromASM("OP_FALSE OP_RETURN ".concat(this.ft_lp_partialhash + this.ft_a_partialhash, " ").concat(amountData, " ").concat(this.ft_a_contractTxid, " 4e54617065"));
                        tx.addOutput(new tbc.Transaction.Output({
                            script: poolnftTapeScript,
                            satoshis: 0
                        }));
                        ftCodeScript = FT.buildFTtransferCode(FTA.codeScript, address_to);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: ftCodeScript,
                            satoshis: 2000
                        }));
                        ftTapeScript = FT.buildFTtransferTape(FTA.tapeScript, ftAbyA);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: ftTapeScript,
                            satoshis: 0
                        }));
                        //P2PKH
                        tx.to(privateKey.toAddress().toString(), Number(changeDate.tbc_amount_difference));
                        nameHex = Buffer.from(FTA.name, 'utf8').toString('hex');
                        symbolHex = Buffer.from(FTA.symbol, 'utf8').toString('hex');
                        amountwriter = new tbc.encoding.BufferWriter();
                        for (i = 0; i < 6; i++) {
                            amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
                        }
                        ftlpTapeAmount = amountwriter.toBuffer().toString('hex');
                        ftlpTapeScript = tbc.Script.fromASM("OP_FALSE OP_RETURN ".concat(ftlpTapeAmount, " 06 ").concat(nameHex, " ").concat(symbolHex, " 4654617065"));
                        ftlpCodeScript = FT.buildFTtransferCode(ftlpCode.toBuffer().toString('hex'), '1BitcoinEaterAddressDontSendf59kuE');
                        tx.addOutput(new tbc.Transaction.Output({
                            script: ftlpCodeScript,
                            satoshis: 2000
                        }));
                        ftlpTapeScript = FT.buildFTtransferTape(ftlpTapeScript.toBuffer().toString('hex'), ftlpBurn);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: ftlpTapeScript,
                            satoshis: 0
                        }));
                        // FTLP_change
                        if (fttxo_lp.ftBalance > amount_lpbn) {
                            ftlp_changeCodeScript = FT.buildFTtransferCode(ftlpCode.toBuffer().toString('hex'), address_to);
                            tx.addOutput(new tbc.Transaction.Output({
                                script: ftlp_changeCodeScript,
                                satoshis: 2000
                            }));
                            ftlp_changeTapeScript = FT.buildFTtransferTape(ftlpTapeScript.toBuffer().toString('hex'), ftlpChange);
                            tx.addOutput(new tbc.Transaction.Output({
                                script: ftlp_changeTapeScript,
                                satoshis: 0
                            }));
                        }
                        // FTAbyC_change
                        if (changeDate.ft_a_difference < tapeAmountSum) {
                            ftabycCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
                            tx.addOutput(new tbc.Transaction.Output({
                                script: ftabycCodeScript,
                                satoshis: fttxo_c.satoshis - Number(changeDate.tbc_amount_difference)
                            }));
                            ftabycTapeScript = FT.buildFTtransferTape(FTA.tapeScript, ftAbyC);
                            tx.addOutput(new tbc.Transaction.Output({
                                script: ftabycTapeScript,
                                satoshis: 0
                            }));
                        }
                        tx.feePerKb(100);
                        tx.change(privateKey.toAddress());
                        return [4 /*yield*/, tx.setInputScriptAsync({
                                inputIndex: 0,
                            }, function (tx) { return __awaiter(_this, void 0, void 0, function () {
                                var unlockingScript;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, this.getPoolNFTunlock(privateKey, tx, 0, poolnft.txId, poolnft.outputIndex, 2)];
                                        case 1:
                                            unlockingScript = _a.sent();
                                            return [2 /*return*/, unlockingScript];
                                    }
                                });
                            }); })];
                    case 6:
                        _c.sent();
                        return [4 /*yield*/, tx.setInputScriptAsync({
                                inputIndex: 1,
                            }, function (tx) { return __awaiter(_this, void 0, void 0, function () {
                                var unlockingScript;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, FTA.getFTunlock(privateKey, tx, 1, fttxo_lp.txId, fttxo_lp.outputIndex)];
                                        case 1:
                                            unlockingScript = _a.sent();
                                            return [2 /*return*/, unlockingScript];
                                    }
                                });
                            }); })];
                    case 7:
                        _c.sent();
                        return [4 /*yield*/, tx.setInputScriptAsync({
                                inputIndex: 2,
                            }, function (tx) { return __awaiter(_this, void 0, void 0, function () {
                                var unlockingScript;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, FTA.getFTunlockSwap(privateKey, tx, 2, fttxo_c.txId, fttxo_c.outputIndex)];
                                        case 1:
                                            unlockingScript = _a.sent();
                                            return [2 /*return*/, unlockingScript];
                                    }
                                });
                            }); })];
                    case 8:
                        _c.sent();
                        tx.sign(privateKey);
                        return [4 /*yield*/, tx.sealAsync()];
                    case 9:
                        _c.sent();
                        txraw = tx.uncheckedSerialize();
                        return [2 /*return*/, txraw];
                }
            });
        });
    };
    poolNFT.prototype.swaptoToken = function (privateKey_from, address_to, amount_token) {
        return __awaiter(this, void 0, void 0, function () {
            var privateKey, FTA, amount_ftbn, poolnft_codehash160, poolMul, tbc_amount, tbc_amount_increment, tapeAmountSetIn, fttxo_c, tapeAmountSum, i, _a, amountHex, changeHex, utxo, poolnft, tx, writer, amountData, poolnftTapeScript, ftCodeScript, ftTapeScript, ftabycCodeScript, ftabycTapeScript, txraw;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        privateKey = privateKey_from;
                        FTA = new FT({ txidOrParams: this.ft_a_contractTxid, network: this.network });
                        return [4 /*yield*/, FTA.initialize()];
                    case 1:
                        _b.sent();
                        amount_ftbn = BigInt(amount_token * Math.pow(10, FTA.decimal));
                        if (this.ft_a_amount < amount_ftbn) {
                            throw new Error('Invalid FT-A amount input');
                        }
                        poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, 'hex'))).toString('hex');
                        poolMul = this.ft_a_amount * this.tbc_amount;
                        tbc_amount = this.tbc_amount;
                        this.ft_a_amount = BigInt(this.ft_a_amount) - BigInt(amount_ftbn);
                        this.tbc_amount = BigInt(poolMul) / BigInt(this.ft_a_amount);
                        tbc_amount_increment = BigInt(this.tbc_amount) - BigInt(tbc_amount);
                        tapeAmountSetIn = [];
                        return [4 /*yield*/, FTA.fetchFtTXO(this.ft_a_contractTxid, poolnft_codehash160, amount_ftbn)];
                    case 2:
                        fttxo_c = _b.sent();
                        tapeAmountSetIn.push(fttxo_c.ftBalance);
                        tapeAmountSum = BigInt(0);
                        for (i = 0; i < tapeAmountSetIn.length; i++) {
                            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
                        }
                        // Check if the balance is sufficient
                        if (amount_ftbn > tapeAmountSum) {
                            throw new Error('Insufficient FT, please merge FT UTXOs');
                        }
                        _a = FT.buildTapeAmount(amount_ftbn, tapeAmountSetIn, 2), amountHex = _a.amountHex, changeHex = _a.changeHex;
                        return [4 /*yield*/, API.fetchUTXO(privateKey, Number(tbc_amount_increment) / Math.pow(10, 6), this.network)];
                    case 3:
                        utxo = _b.sent();
                        if (BigInt(utxo.satoshis) < tbc_amount_increment) {
                            throw new Error('Insufficient TBC amount, please merge UTXOs');
                        }
                        return [4 /*yield*/, this.fetchPoolNftUTXO(this.contractTxid)];
                    case 4:
                        poolnft = _b.sent();
                        tx = new tbc.Transaction()
                            .from(poolnft)
                            .from(utxo)
                            .from(fttxo_c);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: tbc.Script.fromHex(this.poolnft_code),
                            satoshis: 2000
                        }));
                        writer = new tbc.encoding.BufferWriter();
                        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_lp_amount));
                        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_a_amount));
                        writer.writeUInt64LEBN(new tbc.crypto.BN(this.tbc_amount));
                        amountData = writer.toBuffer().toString('hex');
                        poolnftTapeScript = tbc.Script.fromASM("OP_FALSE OP_RETURN ".concat(this.ft_lp_partialhash + this.ft_a_partialhash, " ").concat(amountData, " ").concat(this.ft_a_contractTxid, " 4e54617065"));
                        tx.addOutput(new tbc.Transaction.Output({
                            script: poolnftTapeScript,
                            satoshis: 0
                        }));
                        ftCodeScript = FT.buildFTtransferCode(FTA.codeScript, address_to);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: ftCodeScript,
                            satoshis: 2000
                        }));
                        ftTapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: ftTapeScript,
                            satoshis: 0
                        }));
                        ftabycCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: ftabycCodeScript,
                            satoshis: fttxo_c.satoshis + Number(tbc_amount_increment)
                        }));
                        ftabycTapeScript = FT.buildFTtransferTape(FTA.tapeScript, changeHex);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: ftabycTapeScript,
                            satoshis: 0
                        }));
                        tx.feePerKb(100);
                        tx.change(privateKey.toAddress());
                        return [4 /*yield*/, tx.setInputScriptAsync({
                                inputIndex: 0,
                            }, function (tx) { return __awaiter(_this, void 0, void 0, function () {
                                var unlockingScript;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, this.getPoolNFTunlock(privateKey, tx, 0, poolnft.txId, poolnft.outputIndex, 3, 1)];
                                        case 1:
                                            unlockingScript = _a.sent();
                                            return [2 /*return*/, unlockingScript];
                                    }
                                });
                            }); })];
                    case 5:
                        _b.sent();
                        return [4 /*yield*/, tx.setInputScriptAsync({
                                inputIndex: 2,
                            }, function (tx) { return __awaiter(_this, void 0, void 0, function () {
                                var unlockingScript;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, FTA.getFTunlockSwap(privateKey, tx, 2, fttxo_c.txId, fttxo_c.outputIndex)];
                                        case 1:
                                            unlockingScript = _a.sent();
                                            return [2 /*return*/, unlockingScript];
                                    }
                                });
                            }); })];
                    case 6:
                        _b.sent();
                        tx.sign(privateKey);
                        return [4 /*yield*/, tx.sealAsync()];
                    case 7:
                        _b.sent();
                        txraw = tx.uncheckedSerialize();
                        return [2 /*return*/, txraw];
                }
            });
        });
    };
    poolNFT.prototype.swaptoTBC = function (privateKey_from, address_to, amount_tbc) {
        return __awaiter(this, void 0, void 0, function () {
            var privateKey, FTA, amount_tbcbn, poolnft_codehash160, poolMul, ft_a_amount, ft_a_amount_increment, tapeAmountSetIn, fttxo_a, fttxo_c, _a, amountHex, changeHex, utxo, poolnft, tx, writer, amountData, poolnftTapeScript, ftCodeScript, ftTapeScript, ftabycCodeScript, ftabycTapeScript, txraw;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        privateKey = privateKey_from;
                        FTA = new FT({ txidOrParams: this.ft_a_contractTxid, network: this.network });
                        return [4 /*yield*/, FTA.initialize()];
                    case 1:
                        _b.sent();
                        amount_tbcbn = BigInt(amount_tbc * Math.pow(10, 6));
                        if (this.tbc_amount < amount_tbcbn) {
                            throw new Error('Invalid tbc amount input');
                        }
                        poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, 'hex'))).toString('hex');
                        poolMul = this.ft_a_amount * this.tbc_amount;
                        ft_a_amount = this.ft_a_amount;
                        this.tbc_amount = BigInt(this.tbc_amount) - BigInt(amount_tbcbn);
                        this.ft_a_amount = BigInt(poolMul) / BigInt(this.tbc_amount);
                        ft_a_amount_increment = BigInt(this.ft_a_amount) - BigInt(ft_a_amount);
                        tapeAmountSetIn = [];
                        return [4 /*yield*/, FTA.fetchFtTXO(this.ft_a_contractTxid, privateKey.toAddress().toString(), amount_tbcbn)];
                    case 2:
                        fttxo_a = _b.sent();
                        if (fttxo_a.ftBalance < ft_a_amount_increment) {
                            throw new Error('Insufficient FT-A amount, please merge FT-A UTXOs');
                        }
                        tapeAmountSetIn.push(fttxo_a.ftBalance);
                        return [4 /*yield*/, FTA.fetchFtTXO(this.ft_a_contractTxid, poolnft_codehash160, amount_tbcbn)];
                    case 3:
                        fttxo_c = _b.sent();
                        tapeAmountSetIn.push(fttxo_c.ftBalance);
                        // Check if the balance is sufficient
                        if (amount_tbcbn > BigInt(fttxo_c.satoshis)) {
                            throw new Error('Insufficient PoolTbc, please merge FT UTXOs');
                        }
                        _a = FT.buildTapeAmount(BigInt(ft_a_amount_increment) + BigInt(fttxo_c.ftBalance), tapeAmountSetIn, 1), amountHex = _a.amountHex, changeHex = _a.changeHex;
                        return [4 /*yield*/, API.fetchUTXO(privateKey, 0.1, this.network)];
                    case 4:
                        utxo = _b.sent();
                        return [4 /*yield*/, this.fetchPoolNftUTXO(this.contractTxid)];
                    case 5:
                        poolnft = _b.sent();
                        tx = new tbc.Transaction()
                            .from(poolnft)
                            .from(fttxo_a)
                            .from(fttxo_c)
                            .from(utxo);
                        //poolNft
                        tx.addOutput(new tbc.Transaction.Output({
                            script: tbc.Script.fromHex(this.poolnft_code),
                            satoshis: 2000
                        }));
                        writer = new tbc.encoding.BufferWriter();
                        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_lp_amount));
                        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_a_amount));
                        writer.writeUInt64LEBN(new tbc.crypto.BN(this.tbc_amount));
                        amountData = writer.toBuffer().toString('hex');
                        poolnftTapeScript = tbc.Script.fromASM("OP_FALSE OP_RETURN ".concat(this.ft_lp_partialhash + this.ft_a_partialhash, " ").concat(amountData, " ").concat(this.ft_a_contractTxid, " 4e54617065"));
                        tx.addOutput(new tbc.Transaction.Output({
                            script: poolnftTapeScript,
                            satoshis: 0
                        }));
                        tx.to(address_to, Number(amount_tbcbn));
                        ftCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: ftCodeScript,
                            satoshis: fttxo_c.satoshis - Number(amount_tbcbn)
                        }));
                        ftTapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: ftTapeScript,
                            satoshis: 0
                        }));
                        // FTAbyA_change
                        if (ft_a_amount_increment < fttxo_a.ftBalance) {
                            ftabycCodeScript = FT.buildFTtransferCode(FTA.codeScript, privateKey.toAddress().toString());
                            tx.addOutput(new tbc.Transaction.Output({
                                script: ftabycCodeScript,
                                satoshis: 2000
                            }));
                            ftabycTapeScript = FT.buildFTtransferTape(FTA.tapeScript, changeHex);
                            tx.addOutput(new tbc.Transaction.Output({
                                script: ftabycTapeScript,
                                satoshis: 0
                            }));
                        }
                        tx.feePerKb(100);
                        tx.change(privateKey.toAddress());
                        return [4 /*yield*/, tx.setInputScriptAsync({
                                inputIndex: 0,
                            }, function (tx) { return __awaiter(_this, void 0, void 0, function () {
                                var unlockingScript;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, this.getPoolNFTunlock(privateKey, tx, 0, poolnft.txId, poolnft.outputIndex, 3, 2)];
                                        case 1:
                                            unlockingScript = _a.sent();
                                            return [2 /*return*/, unlockingScript];
                                    }
                                });
                            }); })];
                    case 6:
                        _b.sent();
                        return [4 /*yield*/, tx.setInputScriptAsync({
                                inputIndex: 1,
                            }, function (tx) { return __awaiter(_this, void 0, void 0, function () {
                                var unlockingScript;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, FTA.getFTunlock(privateKey, tx, 1, fttxo_a.txId, fttxo_a.outputIndex)];
                                        case 1:
                                            unlockingScript = _a.sent();
                                            return [2 /*return*/, unlockingScript];
                                    }
                                });
                            }); })];
                    case 7:
                        _b.sent();
                        return [4 /*yield*/, tx.setInputScriptAsync({
                                inputIndex: 2,
                            }, function (tx) { return __awaiter(_this, void 0, void 0, function () {
                                var unlockingScript;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, FTA.getFTunlockSwap(privateKey, tx, 2, fttxo_c.txId, fttxo_c.outputIndex)];
                                        case 1:
                                            unlockingScript = _a.sent();
                                            return [2 /*return*/, unlockingScript];
                                    }
                                });
                            }); })];
                    case 8:
                        _b.sent();
                        tx.sign(privateKey);
                        return [4 /*yield*/, tx.sealAsync()];
                    case 9:
                        _b.sent();
                        txraw = tx.uncheckedSerialize();
                        //console.log(tx.verify());
                        return [2 /*return*/, txraw];
                }
            });
        });
    };
    poolNFT.prototype.fetchPoolNFTInfo = function (contractTxid) {
        return __awaiter(this, void 0, void 0, function () {
            var url_testnet, url_mainnet, url, response, data, poolNftInfo, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url_testnet = "http://tbcdev.org:5000/v1/tbc/main/ft/pool/nft/info/contract/id/".concat(contractTxid);
                        url_mainnet = "https://turingwallet.xyz/v1/tbc/main/ft/pool/nft/info/contract/id/".concat(contractTxid);
                        url = this.network == "testnet" ? url_testnet : url_mainnet;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, fetch(url)];
                    case 2: return [4 /*yield*/, (_a.sent()).json()];
                    case 3:
                        response = _a.sent();
                        data = response;
                        poolNftInfo = {
                            ft_lp_amount: data.ft_lp_balance,
                            ft_a_amount: data.ft_a_balance,
                            tbc_amount: data.tbc_balance,
                            ft_lp_partialhash: data.ft_lp_partial_hash,
                            ft_a_partialhash: data.ft_a_partial_hash,
                            ft_a_contractTxid: data.ft_a_contract_txid,
                            poolnft_code: data.pool_nft_code_script,
                            currentContractTxid: data.current_pool_nft_txid,
                            currentContractVout: data.current_pool_nft_vout,
                            currentContractSatoshi: data.current_pool_nft_balance
                        };
                        return [2 /*return*/, poolNftInfo];
                    case 4:
                        error_1 = _a.sent();
                        throw new Error("Failed to fetch PoolNFTInfo.");
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    poolNFT.prototype.fetchPoolNftUTXO = function (contractTxid) {
        return __awaiter(this, void 0, void 0, function () {
            var poolNftInfo, poolnft, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.fetchPoolNFTInfo(contractTxid)];
                    case 1:
                        poolNftInfo = _a.sent();
                        poolnft = {
                            txId: poolNftInfo.currentContractTxid,
                            outputIndex: poolNftInfo.currentContractVout,
                            script: poolNftInfo.poolnft_code,
                            satoshis: poolNftInfo.currentContractSatoshi
                        };
                        return [2 /*return*/, poolnft];
                    case 2:
                        error_2 = _a.sent();
                        throw new Error("Failed to fetch PoolNFT UTXO.");
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    poolNFT.prototype.fetchFtlpUTXO = function (ftlpCode, amount) {
        return __awaiter(this, void 0, void 0, function () {
            var ftlpHash, url_testnet, url_mainnet, url, response, data, i, ftlpBalance, i, ftlp, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        ftlpHash = tbc.crypto.Hash.sha256(Buffer.from(ftlpCode, 'hex')).reverse().toString('hex');
                        url_testnet = "http://tbcdev.org:5000/v1/tbc/main/ft/lp/unspent/by/script/hash".concat(ftlpHash);
                        url_mainnet = "https://turingwallet.xyz/v1/tbc/main/ft/lp/unspent/by/script/hash".concat(ftlpHash);
                        url = this.network == "testnet" ? url_testnet : url_mainnet;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, fetch(url)];
                    case 2: return [4 /*yield*/, (_a.sent()).json()];
                    case 3:
                        response = _a.sent();
                        data = response.ftUtxoList[0];
                        for (i = 0; i < response.ftUtxoList.length; i++) {
                            if (response.ftUtxoList[i].ftBalance >= amount) {
                                data = response.ftUtxoList[i];
                                break;
                            }
                        }
                        ftlpBalance = BigInt(0);
                        if (data.ftBalance < amount) {
                            for (i = 0; i < response.ftUtxoList.length; i++) {
                                ftlpBalance += BigInt(response.ftUtxoList[i].ftBalance);
                            }
                            if (ftlpBalance < amount) {
                                throw new Error('Insufficient FT-LP amount');
                            }
                            else {
                                throw new Error('Please merge FT-LP UTXOs');
                            }
                        }
                        ftlp = {
                            txId: data.utxoId,
                            outputIndex: data.utxoVout,
                            script: ftlpCode,
                            satoshis: data.utxoBalance,
                            ftBalance: data.ftBalance
                        };
                        return [2 /*return*/, ftlp];
                    case 4:
                        error_3 = _a.sent();
                        throw new Error("Failed to fetch FTLP UTXO.");
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    poolNFT.prototype.mergeFTLP = function (privateKey_from) {
        return __awaiter(this, void 0, void 0, function () {
            var FTA, privateKey, address, ftlpCodeScript, ftlpCodeHash, url_testnet, url_mainnet, url, fttxo_codeScript, response, fttxo_1, i, tapeAmountSetIn, tapeAmountSum, i, _a, amountHex, changeHex, utxo, tx, codeScript, tapeScript, _loop_1, i, txraw, error_4;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        FTA = new FT({ txidOrParams: this.ft_a_contractTxid, network: this.network });
                        return [4 /*yield*/, FTA.initialize()];
                    case 1:
                        _b.sent();
                        privateKey = privateKey_from;
                        address = privateKey.toAddress().toString();
                        ftlpCodeScript = this.getFTLPcode(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, 'hex')).toString('hex'), address, FTA.tapeScript.length / 2);
                        ftlpCodeHash = tbc.crypto.Hash.sha256(ftlpCodeScript.toBuffer());
                        url_testnet = "http://tbcdev.org:5000/v1/tbc/main/ft/lp/unspent/by/script/hash".concat(ftlpCodeHash);
                        url_mainnet = "https://turingwallet.xyz/v1/tbc/main/ft/lp/unspent/by/script/hash".concat(ftlpCodeHash);
                        url = this.network == "testnet" ? url_testnet : url_mainnet;
                        fttxo_codeScript = FT.buildFTtransferCode(ftlpCodeScript.toBuffer().toString(), address).toBuffer().toString('hex');
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 14, , 15]);
                        return [4 /*yield*/, fetch(url)];
                    case 3: return [4 /*yield*/, (_b.sent()).json()];
                    case 4:
                        response = _b.sent();
                        fttxo_1 = [];
                        if (response.ftUtxoList.length === 0) {
                            throw new Error('No FT UTXO available');
                        }
                        if (response.ftUtxoList.length === 1) {
                            console.log('Merge Success!');
                            return [2 /*return*/, true];
                        }
                        else {
                            for (i = 0; i < response.ftUtxoList.length && i < 5; i++) {
                                fttxo_1.push({
                                    txId: response.ftUtxoList[i].utxoId,
                                    outputIndex: response.ftUtxoList[i].utxoVout,
                                    script: fttxo_codeScript,
                                    satoshis: response.ftUtxoList[i].utxoBalance,
                                    ftBalance: response.ftUtxoList[i].ftBalance
                                });
                            }
                        }
                        tapeAmountSetIn = [];
                        tapeAmountSum = BigInt(0);
                        for (i = 0; i < fttxo_1.length; i++) {
                            tapeAmountSetIn.push(fttxo_1[i].ftBalance);
                            tapeAmountSum += BigInt(fttxo_1[i].ftBalance);
                        }
                        _a = FT.buildTapeAmount(tapeAmountSum, tapeAmountSetIn), amountHex = _a.amountHex, changeHex = _a.changeHex;
                        if (changeHex != '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000') {
                            throw new Error('Change amount is not zero');
                        }
                        return [4 /*yield*/, API.fetchUTXO(privateKey, 0.1, this.network)];
                    case 5:
                        utxo = _b.sent();
                        tx = new tbc.Transaction()
                            .from(fttxo_1)
                            .from(utxo);
                        codeScript = FT.buildFTtransferCode(fttxo_codeScript, address);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: codeScript,
                            satoshis: 2000
                        }));
                        tapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: tapeScript,
                            satoshis: 0
                        }));
                        tx.feePerKb(100)
                            .change(privateKey.toAddress());
                        _loop_1 = function (i) {
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0: return [4 /*yield*/, tx.setInputScriptAsync({
                                            inputIndex: i,
                                        }, function (tx) { return __awaiter(_this, void 0, void 0, function () {
                                            var unlockingScript;
                                            return __generator(this, function (_a) {
                                                switch (_a.label) {
                                                    case 0: return [4 /*yield*/, FTA.getFTunlock(privateKey, tx, i, fttxo_1[i].txId, fttxo_1[i].outputIndex)];
                                                    case 1:
                                                        unlockingScript = _a.sent();
                                                        return [2 /*return*/, unlockingScript];
                                                }
                                            });
                                        }); })];
                                    case 1:
                                        _c.sent();
                                        return [2 /*return*/];
                                }
                            });
                        };
                        i = 0;
                        _b.label = 6;
                    case 6:
                        if (!(i < fttxo_1.length)) return [3 /*break*/, 9];
                        return [5 /*yield**/, _loop_1(i)];
                    case 7:
                        _b.sent();
                        _b.label = 8;
                    case 8:
                        i++;
                        return [3 /*break*/, 6];
                    case 9:
                        tx.sign(privateKey);
                        return [4 /*yield*/, tx.sealAsync()];
                    case 10:
                        _b.sent();
                        txraw = tx.uncheckedSerialize();
                        console.log('Merge FTLPUTXO:');
                        return [4 /*yield*/, poolNFT.broadcastTXraw(txraw, this.network)];
                    case 11:
                        _b.sent();
                        // wait 5 seconds
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 5000); })];
                    case 12:
                        // wait 5 seconds
                        _b.sent();
                        return [4 /*yield*/, this.mergeFTLP(privateKey)];
                    case 13:
                        _b.sent();
                        return [2 /*return*/, true];
                    case 14:
                        error_4 = _b.sent();
                        throw new Error("Merge Faild!.");
                    case 15: return [2 /*return*/];
                }
            });
        });
    };
    poolNFT.prototype.mergeFTinPool = function (privateKey_from) {
        return __awaiter(this, void 0, void 0, function () {
            var FTA, privateKey, address, poolnft_codehash160, hash, contractTxid, url_testnet, url_mainnet, url, fttxo_codeScript, response, fttxo_2, i, tapeAmountSetIn, tapeAmountSum, tbcAmountSum, i, _a, amountHex, changeHex, poolnft_1, utxo, tx, writer, amountData, poolnftTapeScript, codeScript, tapeScript, _loop_2, i, txraw, error_5;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        FTA = new FT({ txidOrParams: this.ft_a_contractTxid, network: this.network });
                        return [4 /*yield*/, FTA.initialize()];
                    case 1:
                        _b.sent();
                        privateKey = privateKey_from;
                        address = privateKey.toAddress().toString();
                        poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, 'hex'))).toString('hex');
                        hash = poolnft_codehash160 + '01';
                        contractTxid = this.ft_a_contractTxid;
                        url_testnet = "http://tbcdev.org:5000/v1/tbc/main/ft/utxo/combine/script/".concat(hash, "/contract/").concat(contractTxid);
                        url_mainnet = "https://turingwallet.xyz/v1/tbc/main/ft/utxo/combine/script/".concat(hash, "/contract/").concat(contractTxid);
                        url = this.network == "testnet" ? url_testnet : url_mainnet;
                        fttxo_codeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160).toBuffer().toString('hex');
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 16, , 17]);
                        return [4 /*yield*/, fetch(url)];
                    case 3: return [4 /*yield*/, (_b.sent()).json()];
                    case 4:
                        response = _b.sent();
                        fttxo_2 = [];
                        if (response.ftUtxoList.length === 0) {
                            throw new Error('No FT UTXO available');
                        }
                        if (response.ftUtxoList.length === 1) {
                            console.log('Merge Success!');
                            return [2 /*return*/, true];
                        }
                        else {
                            for (i = 0; i < response.ftUtxoList.length && i < 4; i++) {
                                fttxo_2.push({
                                    txId: response.ftUtxoList[i].utxoId,
                                    outputIndex: response.ftUtxoList[i].utxoVout,
                                    script: fttxo_codeScript,
                                    satoshis: response.ftUtxoList[i].utxoBalance,
                                    ftBalance: response.ftUtxoList[i].ftBalance
                                });
                            }
                        }
                        tapeAmountSetIn = [];
                        tapeAmountSum = BigInt(0);
                        tbcAmountSum = 0;
                        for (i = 0; i < fttxo_2.length; i++) {
                            tapeAmountSetIn.push(fttxo_2[i].ftBalance);
                            tapeAmountSum += BigInt(fttxo_2[i].ftBalance);
                            tbcAmountSum += fttxo_2[i].satoshis;
                        }
                        _a = FT.buildTapeAmount(tapeAmountSum, tapeAmountSetIn, 1), amountHex = _a.amountHex, changeHex = _a.changeHex;
                        if (changeHex != '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000') {
                            throw new Error('Change amount is not zero');
                        }
                        return [4 /*yield*/, this.fetchPoolNftUTXO(this.contractTxid)];
                    case 5:
                        poolnft_1 = _b.sent();
                        return [4 /*yield*/, API.fetchUTXO(privateKey, 0.1, this.network)];
                    case 6:
                        utxo = _b.sent();
                        tx = new tbc.Transaction()
                            .from(poolnft_1)
                            .from(fttxo_2)
                            .from(utxo);
                        //poolNft
                        tx.addOutput(new tbc.Transaction.Output({
                            script: tbc.Script.fromHex(this.poolnft_code),
                            satoshis: 2000
                        }));
                        writer = new tbc.encoding.BufferWriter();
                        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_lp_amount));
                        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_a_amount));
                        writer.writeUInt64LEBN(new tbc.crypto.BN(this.tbc_amount));
                        amountData = writer.toBuffer().toString('hex');
                        poolnftTapeScript = tbc.Script.fromASM("OP_FALSE OP_RETURN ".concat(this.ft_lp_partialhash + this.ft_a_partialhash, " ").concat(amountData, " ").concat(this.ft_a_contractTxid, " 4e54617065"));
                        tx.addOutput(new tbc.Transaction.Output({
                            script: poolnftTapeScript,
                            satoshis: 0
                        }));
                        codeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: codeScript,
                            satoshis: tbcAmountSum
                        }));
                        tapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: tapeScript,
                            satoshis: 0
                        }));
                        tx.feePerKb(100);
                        tx.change(privateKey.toAddress());
                        return [4 /*yield*/, tx.setInputScriptAsync({
                                inputIndex: 0,
                            }, function (tx) { return __awaiter(_this, void 0, void 0, function () {
                                var unlockingScript;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, this.getPoolNFTunlock(privateKey, tx, 0, poolnft_1.txId, poolnft_1.outputIndex, 4)];
                                        case 1:
                                            unlockingScript = _a.sent();
                                            return [2 /*return*/, unlockingScript];
                                    }
                                });
                            }); })];
                    case 7:
                        _b.sent();
                        _loop_2 = function (i) {
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0: return [4 /*yield*/, tx.setInputScriptAsync({
                                            inputIndex: i + 1,
                                        }, function (tx) { return __awaiter(_this, void 0, void 0, function () {
                                            var unlockingScript;
                                            return __generator(this, function (_a) {
                                                switch (_a.label) {
                                                    case 0: return [4 /*yield*/, FTA.getFTunlock(privateKey, tx, i + 1, fttxo_2[i].txId, fttxo_2[i].outputIndex)];
                                                    case 1:
                                                        unlockingScript = _a.sent();
                                                        return [2 /*return*/, unlockingScript];
                                                }
                                            });
                                        }); })];
                                    case 1:
                                        _c.sent();
                                        return [2 /*return*/];
                                }
                            });
                        };
                        i = 0;
                        _b.label = 8;
                    case 8:
                        if (!(i < fttxo_2.length)) return [3 /*break*/, 11];
                        return [5 /*yield**/, _loop_2(i)];
                    case 9:
                        _b.sent();
                        _b.label = 10;
                    case 10:
                        i++;
                        return [3 /*break*/, 8];
                    case 11:
                        tx.sign(privateKey);
                        return [4 /*yield*/, tx.sealAsync()];
                    case 12:
                        _b.sent();
                        txraw = tx.uncheckedSerialize();
                        console.log('Merge FtUTXOinPool:');
                        return [4 /*yield*/, poolNFT.broadcastTXraw(txraw, this.network)];
                    case 13:
                        _b.sent();
                        // wait 5 seconds
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 5000); })];
                    case 14:
                        // wait 5 seconds
                        _b.sent();
                        return [4 /*yield*/, this.mergeFTinPool(privateKey)];
                    case 15:
                        _b.sent();
                        return [2 /*return*/, true];
                    case 16:
                        error_5 = _b.sent();
                        throw new Error("Merge Faild!.");
                    case 17: return [2 /*return*/];
                }
            });
        });
    };
    poolNFT.broadcastTXraw = function (txraw, network) {
        return __awaiter(this, void 0, void 0, function () {
            var url_testnet, url_mainnet, url, response, data, error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (network) {
                            network = network;
                        }
                        else {
                            network = "mainnet";
                        }
                        url_testnet = 'http://tbcdev.org:5000/v1/tbc/main/broadcast/tx/raw';
                        url_mainnet = 'https://turingwallet.xyz/v1/tbc/main/broadcast/tx/raw';
                        url = network == "testnet" ? url_testnet : url_mainnet;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, fetch(url, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    txHex: txraw
                                })
                            })];
                    case 2:
                        response = _a.sent();
                        if (!response.ok) {
                            throw new Error("Failed to broadcast TXraw: ".concat(response.statusText));
                        }
                        return [4 /*yield*/, response.json()];
                    case 3:
                        data = _a.sent();
                        console.log('txid:', data.result);
                        if (data.error) {
                            console.log('error:', data.error);
                        }
                        return [2 /*return*/, data.result];
                    case 4:
                        error_6 = _a.sent();
                        throw new Error("Failed to broadcast TXraw.");
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    poolNFT.prototype.getPoolNFTunlock = function (privateKey_from, currentTX, currentUnlockIndex, preTxId, preVout, option, swapOption) {
        return __awaiter(this, void 0, void 0, function () {
            var privateKey, preTX, pretxdata, prepreTX, prepretxdata, currentinputsdata, currentinputstxdata, i, inputsTX, currenttxoutputsdata, sig, publicKey, unlockingScript, optionHex;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        privateKey = privateKey_from;
                        return [4 /*yield*/, API.fetchTXraw(preTxId, this.network)];
                    case 1:
                        preTX = _a.sent();
                        pretxdata = getPoolNFTPreTxdata(preTX);
                        return [4 /*yield*/, API.fetchTXraw(preTX.inputs[preVout].prevTxId.toString('hex'), this.network)];
                    case 2:
                        prepreTX = _a.sent();
                        prepretxdata = getPoolNFTPrePreTxdata(prepreTX);
                        currentinputsdata = getCurrentInputsdata(currentTX);
                        currentinputstxdata = '';
                        i = 1;
                        _a.label = 3;
                    case 3:
                        if (!(i < currentTX.inputs.length)) return [3 /*break*/, 6];
                        return [4 /*yield*/, API.fetchTXraw(currentTX.inputs[i].prevTxId.toString('hex'), this.network)];
                    case 4:
                        inputsTX = _a.sent();
                        if (option == 3) {
                            currentinputstxdata = getInputsTxdataSwap(inputsTX, currentTX.inputs[i].outputIndex) + currentinputstxdata;
                        }
                        else {
                            currentinputstxdata += getInputsTxdata(inputsTX, currentTX.inputs[i].outputIndex);
                        }
                        _a.label = 5;
                    case 5:
                        i++;
                        return [3 /*break*/, 3];
                    case 6:
                        currentinputstxdata = '51' + currentinputstxdata;
                        currenttxoutputsdata = getCurrentTxOutputsdata(currentTX, option, swapOption);
                        sig = (currentTX.getSignature(currentUnlockIndex, privateKey).length / 2).toString(16).padStart(2, '0') + currentTX.getSignature(currentUnlockIndex, privateKey);
                        publicKey = (privateKey.toPublicKey().toString().length / 2).toString(16).padStart(2, '0') + privateKey.toPublicKey().toString();
                        unlockingScript = new tbc.Script('');
                        optionHex = option + 50;
                        switch (option) {
                            case 1:
                                unlockingScript = new tbc.Script("".concat(sig).concat(publicKey).concat(currentinputstxdata).concat(currentinputsdata).concat(currenttxoutputsdata).concat(optionHex).concat(prepretxdata).concat(pretxdata));
                                break;
                            case 2:
                                unlockingScript = new tbc.Script("".concat(sig).concat(publicKey).concat(currenttxoutputsdata).concat(currentinputstxdata).concat(currentinputsdata).concat(optionHex).concat(prepretxdata).concat(pretxdata));
                                break;
                            case 3:
                                unlockingScript = new tbc.Script("".concat(sig).concat(publicKey).concat(currenttxoutputsdata).concat(currentinputstxdata).concat(currentinputsdata).concat(optionHex).concat(prepretxdata).concat(pretxdata));
                                break;
                            case 4:
                                unlockingScript = new tbc.Script("".concat(sig).concat(publicKey).concat(currenttxoutputsdata).concat(currentinputstxdata).concat(currentinputsdata).concat(optionHex).concat(prepretxdata).concat(pretxdata));
                                break;
                            default:
                                throw new Error("Invalid option.");
                        }
                        return [2 /*return*/, unlockingScript];
                }
            });
        });
    };
    poolNFT.prototype.getPoolNftCode = function (txid, vout) {
        var writer = new tbc.encoding.BufferWriter();
        writer.writeReverse(Buffer.from(txid, 'hex'));
        writer.writeUInt32LE(vout);
        var utxoHex = writer.toBuffer().toString('hex');
        var poolNftCode = new tbc.Script("OP_1 OP_PICK OP_3 OP_SPLIT OP_NIP 0x01 0x20 OP_SPLIT 0x01 0x20 OP_SPLIT OP_1 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_TOALTSTACK OP_BIN2NUM OP_TOALTSTACK OP_BIN2NUM OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_1 OP_PICK OP_TOALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_1 OP_PICK 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_HASH256 OP_6 OP_PUSH_META 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_1 OP_PICK OP_TOALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_SWAP OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUAL OP_IF OP_DROP OP_ELSE 0x24 0x".concat(utxoHex, " OP_EQUALVERIFY OP_ENDIF OP_DUP OP_1 OP_EQUAL OP_IF OP_DROP OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_4 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_HASH160 OP_SWAP OP_TOALTSTACK OP_EQUAL OP_0 OP_EQUALVERIFY OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_8 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_DUP 0x03 0xa08601 OP_BIN2NUM OP_GREATERTHANOREQUAL OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_2DUP OP_2DUP OP_GREATERTHAN OP_NOTIF OP_SWAP OP_ENDIF OP_DIV 0x04 0x00e1f505 OP_BIN2NUM OP_LESSTHANOREQUAL OP_1 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_TOALTSTACK OP_3 OP_ROLL OP_DUP OP_HASH160 OP_TOALTSTACK OP_8 OP_ROLL OP_EQUALVERIFY OP_5 OP_ROLL OP_DUP OP_TOALTSTACK OP_2DUP OP_2DUP OP_ADD OP_TOALTSTACK OP_DIV OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_DUP OP_10 OP_LESSTHAN OP_IF OP_TOALTSTACK OP_MOD OP_0 OP_EQUALVERIFY OP_ELSE OP_TOALTSTACK OP_2DROP OP_ENDIF OP_FROMALTSTACK OP_2DUP OP_DIV OP_5 OP_PICK OP_EQUALVERIFY OP_SWAP OP_4 OP_ROLL OP_ADD OP_TOALTSTACK OP_2DUP OP_DIV OP_3 OP_PICK OP_EQUALVERIFY OP_DROP OP_SWAP OP_SUB OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DROP OP_ELSE OP_DROP OP_2DROP OP_3 OP_ROLL OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_4 OP_ROLL OP_SUB OP_SWAP OP_TOALTSTACK OP_SWAP OP_FROMALTSTACK OP_3 OP_ROLL OP_DROP OP_ENDIF OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_3 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_1 OP_EQUALVERIFY OP_ELSE OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY OP_TOALTSTACK OP_0 OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_4 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_HASH160 OP_3 OP_ROLL OP_EQUALVERIFY OP_7 OP_PICK OP_BIN2NUM OP_SUB OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP 0x14 0x759d6677091e973b9e9d99f19c68fbf43e3f05f9 OP_EQUALVERIFY OP_2 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_DUP 0x03 0x40420f OP_BIN2NUM OP_GREATERTHANOREQUAL OP_1 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_DUP OP_TOALTSTACK OP_SUB OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_2 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_2DUP OP_2DUP OP_GREATERTHAN OP_NOTIF OP_SWAP OP_ENDIF OP_DIV 0x04 0x00e1f505 OP_BIN2NUM OP_LESSTHANOREQUAL OP_1 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_5 OP_ROLL OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_5 OP_ROLL OP_2DUP OP_2DUP OP_SUB OP_TOALTSTACK OP_DIV OP_DUP OP_10 OP_LESSTHAN OP_IF OP_TOALTSTACK OP_MOD OP_0 OP_EQUALVERIFY OP_ELSE OP_TOALTSTACK OP_2DROP OP_ENDIF OP_FROMALTSTACK OP_2DUP OP_DIV OP_5 OP_PICK OP_EQUALVERIFY OP_SWAP OP_4 OP_ROLL OP_SUB OP_TOALTSTACK OP_2DUP OP_DIV OP_3 OP_PICK OP_EQUALVERIFY OP_DROP OP_SWAP OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_3 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_ELSE OP_DUP OP_3 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY 0x01 0x28 OP_SPLIT OP_NIP OP_FROMALTSTACK OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_0 OP_TOALTSTACK OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_DROP OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_7 OP_PICK OP_BIN2NUM OP_2DUP OP_LESSTHAN OP_1 OP_EQUALVERIFY OP_SWAP OP_SUB OP_DUP 0x03 0xa08601 OP_BIN2NUM OP_GREATERTHANOREQUAL OP_1 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_2 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_2DUP OP_2DUP OP_GREATERTHAN OP_NOTIF OP_SWAP OP_ENDIF OP_DIV 0x04 0x00e1f505 OP_BIN2NUM OP_LESSTHANOREQUAL OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_4 OP_ROLL OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_2DUP OP_MUL OP_TOALTSTACK OP_4 OP_ROLL OP_ADD OP_TOALTSTACK OP_2 OP_ROLL OP_SUB OP_FROMALTSTACK OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_2DUP OP_FROMALTSTACK OP_SWAP OP_DIV OP_EQUALVERIFY OP_4 OP_ROLL OP_EQUALVERIFY OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_7 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_0 OP_0 OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_9 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_9 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_IF OP_9 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_9 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_9 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_IF OP_9 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_9 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_9 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_IF OP_9 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_9 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_9 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_IF OP_9 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_DROP OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_4 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_9 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_4 OP_ROLL OP_EQUALVERIFY OP_8 OP_PICK OP_BIN2NUM OP_SUB OP_TOALTSTACK OP_2 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_2DUP OP_LESSTHAN OP_1 OP_EQUALVERIFY OP_SWAP OP_SUB OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_DUP OP_TOALTSTACK OP_DUP 0x03 0xa08601 OP_BIN2NUM OP_GREATERTHANOREQUAL OP_1 OP_EQUALVERIFY OP_SUB OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_2DUP OP_2DUP OP_GREATERTHAN OP_NOTIF OP_SWAP OP_ENDIF OP_DIV 0x04 0x00e1f505 OP_BIN2NUM OP_LESSTHANOREQUAL OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_4 OP_ROLL OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_2DUP OP_MUL OP_TOALTSTACK OP_4 OP_ROLL OP_SUB OP_TOALTSTACK OP_2 OP_ROLL OP_ADD OP_FROMALTSTACK OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_2DUP OP_FROMALTSTACK OP_SWAP OP_DIV OP_EQUALVERIFY OP_4 OP_ROLL OP_EQUALVERIFY OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_ENDIF OP_ELSE OP_4 OP_EQUALVERIFY OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_0 OP_TOALTSTACK OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_DROP OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_7 OP_PICK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_HASH160 OP_7 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_7 OP_PICK OP_BIN2NUM OP_EQUALVERIFY OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_DROP OP_SWAP OP_FROMALTSTACK OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_3 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_ENDIF OP_ENDIF OP_ENDIF OP_CHECKSIG OP_RETURN 0x05 0x32436f6465"));
        return poolNftCode;
        //OP_DUP OP_1 OP_SPLIT OP_NIP OP_4 OP_SPLIT OP_DROP 0x04 0x00000000 OP_EQUALVERIFY 
    };
    poolNFT.prototype.getFTLPcode = function (poolNftCodeHash, address, tapeSize) {
        var codeHash = poolNftCodeHash;
        var publicKeyHash = tbc.Address.fromString(address).hashBuffer.toString('hex');
        var hash = publicKeyHash + '00';
        var tapeSizeHex = getSize(tapeSize).toString('hex');
        var ftlpcode = new tbc.Script("OP_9 OP_PICK OP_TOALTSTACK OP_1 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_5 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_4 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_3 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_2 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_1 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_0 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_TOALTSTACK OP_SHA256 OP_FROMALTSTACK OP_CAT OP_CAT OP_HASH256 OP_6 OP_PUSH_META 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_DUP OP_HASH160 OP_FROMALTSTACK OP_EQUALVERIFY OP_CHECKSIGVERIFY OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_ELSE OP_TOALTSTACK OP_PARTIAL_HASH OP_DUP 0x20 0x".concat(codeHash, " OP_EQUALVERIFY OP_ENDIF OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_7 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_0 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_SHA256 OP_7 OP_PUSH_META OP_EQUAL OP_NIP OP_PUSHDATA1 0x82 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff OP_DROP OP_RETURN 0x15 0x").concat(hash, " 0x05 0x02436f6465"));
        return ftlpcode;
    };
    poolNFT.prototype.updatePoolNFT = function (increment, ft_a_decimal, option) {
        var ft_a_old = this.ft_a_amount;
        var ft_lp_old = this.ft_lp_amount;
        var tbc_amount_old = this.tbc_amount;
        if (option == 1) {
            var ftLpIncrement = BigInt(increment * Math.pow(10, 6));
            this.updateWhenFtLpChange(ftLpIncrement);
        }
        else if (option == 2) {
            var tbcIncrement = BigInt(increment * Math.pow(10, 6));
            this.updateWhenTbcAmountChange(tbcIncrement);
        }
        else {
            var ftAIncrement = BigInt(increment * Math.pow(10, ft_a_decimal));
            this.updateWhenFtAChange(ftAIncrement);
        }
        if (this.tbc_amount > tbc_amount_old) {
            return {
                ft_lp_difference: BigInt(ft_lp_old) - BigInt(this.ft_lp_amount),
                ft_a_difference: BigInt(this.ft_a_amount) - BigInt(ft_a_old),
                tbc_amount_difference: BigInt(this.tbc_amount) - BigInt(tbc_amount_old)
            };
        }
        else {
            return {
                ft_lp_difference: BigInt(this.ft_lp_amount) - BigInt(ft_lp_old),
                ft_a_difference: BigInt(ft_a_old) - BigInt(this.ft_a_amount),
                tbc_amount_difference: BigInt(tbc_amount_old) - BigInt(this.tbc_amount)
            };
        }
    };
    poolNFT.prototype.updateWhenFtLpChange = function (incrementBN) {
        var increment = BigInt(incrementBN);
        if (increment == BigInt(0)) {
            return;
        }
        else if (increment > BigInt(0) && increment <= BigInt(this.ft_lp_amount)) {
            var ratio = BigInt(this.ft_lp_amount) / increment;
            this.ft_lp_amount = BigInt(this.ft_lp_amount) + BigInt(increment);
            this.ft_a_amount = BigInt(this.ft_a_amount) - BigInt(this.ft_a_amount) / ratio;
            this.tbc_amount = BigInt(this.tbc_amount) - BigInt(this.tbc_amount) / ratio;
        }
        else {
            throw new Error("Increment is invalid!");
        }
    };
    poolNFT.prototype.updateWhenFtAChange = function (incrementBN) {
        var increment = BigInt(incrementBN);
        if (increment == BigInt(0)) {
            return;
        }
        else if (increment > BigInt(0) && increment <= BigInt(this.ft_a_amount)) {
            var ratio = BigInt(this.ft_a_amount) / increment;
            this.ft_a_amount = BigInt(this.ft_a_amount) + BigInt(increment);
            this.ft_lp_amount = BigInt(this.ft_lp_amount) - BigInt(this.ft_lp_amount) / ratio;
            this.tbc_amount = BigInt(this.ft_a_amount) + BigInt(this.ft_a_amount) / ratio;
        }
        else {
            throw new Error("Increment is invalid!");
        }
    };
    poolNFT.prototype.updateWhenTbcAmountChange = function (incrementBN) {
        var increment = BigInt(incrementBN);
        if (increment == BigInt(0)) {
            return;
        }
        else if (increment > BigInt(0) && increment <= BigInt(this.tbc_amount)) {
            var ratio = BigInt(this.tbc_amount) / increment;
            this.tbc_amount = BigInt(this.tbc_amount) + BigInt(increment);
            this.ft_lp_amount = BigInt(this.ft_lp_amount) - BigInt(this.ft_lp_amount) / ratio;
            this.ft_a_amount = BigInt(this.ft_a_amount) + BigInt(this.ft_a_amount) / ratio;
        }
        else {
            throw new Error("Increment is invalid!");
        }
    };
    return poolNFT;
}());
function getInputsTxdata(tx, vout) {
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
    var _b = getInputsTxOutputsData(tx, vout), outputs1 = _b.outputs1, outputs1length = _b.outputs1length, outputs2 = _b.outputs2, outputs2length = _b.outputs2length;
    writer.write(Buffer.from(outputs1length, 'hex'));
    writer.write(Buffer.from(outputs1, 'hex'));
    var lockingscript = tx.outputs[vout].script.toBuffer();
    if (lockingscript.length == 1564) {
        var size = getSize(lockingscript.length); //size小端序
        var partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
        var suffixdata = lockingscript.subarray(1536);
        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[vout].satoshisBN);
        writer.write(getLengthHex(suffixdata.length)); //suffixdata
        writer.write(suffixdata);
        writer.write(Buffer.from(hashlength, 'hex')); //partialhash
        writer.write(Buffer.from(partialhash, 'hex'));
        writer.write(getLengthHex(size.length));
        writer.write(size);
    }
    else {
        var size = getSize(lockingscript.length); //size小端序
        var partialhash = '00';
        var suffixdata = lockingscript;
        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[vout].satoshisBN);
        writer.write(getLengthHex(suffixdata.length)); //suffixdata为完整锁定脚本
        writer.write(suffixdata);
        writer.write(Buffer.from(partialhash, 'hex')); //partialhash为空
        writer.write(getLengthHex(size.length));
        writer.write(size);
    }
    writer.write(Buffer.from(outputs2length, 'hex'));
    writer.write(Buffer.from(outputs2, 'hex'));
    writer.write(Buffer.from('52', 'hex'));
    var inputstxdata = writer.toBuffer().toString('hex');
    return "".concat(inputstxdata);
}
function getInputsTxdataSwap(tx, vout) {
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
    var lockingscript = tx.outputs[vout].script.toBuffer();
    if (lockingscript.length == 1564) {
        var _b = getInputsTxOutputsData(tx, vout, true), outputs1 = _b.outputs1, outputs1length = _b.outputs1length, outputs2 = _b.outputs2, outputs2length = _b.outputs2length;
        writer.write(Buffer.from(outputs1length, 'hex'));
        writer.write(Buffer.from(outputs1, 'hex'));
        var size = getSize(lockingscript.length); //size小端序
        var partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
        var suffixdata = lockingscript.subarray(1536);
        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[vout].satoshisBN);
        writer.write(getLengthHex(suffixdata.length)); //suffixdata
        writer.write(suffixdata);
        writer.write(Buffer.from(hashlength, 'hex')); //partialhash
        writer.write(Buffer.from(partialhash, 'hex'));
        writer.write(getLengthHex(size.length));
        writer.write(size);
        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[vout + 1].satoshisBN);
        writer.write(getLengthHex(tx.outputs[vout + 1].script.toBuffer().length));
        writer.write(tx.outputs[vout + 1].script.toBuffer());
        writer.write(Buffer.from(outputs2length, 'hex'));
        writer.write(Buffer.from(outputs2, 'hex'));
    }
    else {
        var _c = getInputsTxOutputsData(tx, vout), outputs1 = _c.outputs1, outputs1length = _c.outputs1length, outputs2 = _c.outputs2, outputs2length = _c.outputs2length;
        writer.write(Buffer.from(outputs1length, 'hex'));
        writer.write(Buffer.from(outputs1, 'hex'));
        var size = getSize(lockingscript.length); //size小端序
        var partialhash = '00';
        var suffixdata = lockingscript;
        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[vout].satoshisBN);
        writer.write(getLengthHex(suffixdata.length)); //suffixdata为完整锁定脚本
        writer.write(suffixdata);
        writer.write(Buffer.from(partialhash, 'hex')); //partialhash为空
        writer.write(getLengthHex(size.length));
        writer.write(size);
        writer.write(Buffer.from(outputs2length, 'hex'));
        writer.write(Buffer.from(outputs2, 'hex'));
    }
    writer.write(Buffer.from('52', 'hex'));
    var inputstxdata = writer.toBuffer().toString('hex');
    return "".concat(inputstxdata);
}
function getCurrentInputsdata(tx) {
    var writer = new tbc.encoding.BufferWriter();
    var inputWriter = new tbc.encoding.BufferWriter();
    for (var _i = 0, _a = tx.inputs; _i < _a.length; _i++) {
        var input = _a[_i];
        inputWriter.writeReverse(input.prevTxId);
        inputWriter.writeUInt32LE(input.outputIndex);
        inputWriter.writeUInt32LE(input.sequenceNumber);
    }
    writer.write(getLengthHex(inputWriter.toBuffer().length));
    writer.write(inputWriter.toBuffer());
    var currentinputsdata = writer.toBuffer().toString('hex');
    return "".concat(currentinputsdata);
}
function getCurrentTxOutputsdata(tx, option, swapOption) {
    var writer = new tbc.encoding.BufferWriter();
    var lockingscript = tx.outputs[2].script.toBuffer(); //FTAbyC code部分
    var size = getSize(lockingscript.length);
    var partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
    var suffixdata = lockingscript.subarray(1536);
    switch (option) {
        //添加流动性
        case 1:
            //poolnft输出
            writer.write(Buffer.from(amountlength, 'hex')); //poolnftcodehash
            writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
            writer.write(Buffer.from(hashlength, 'hex'));
            writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
            writer.write(Buffer.from(amountlength, 'hex')); //poolnfttape
            writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
            writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length));
            writer.write(tx.outputs[1].script.toBuffer());
            //FTAbyC输出
            lockingscript = tx.outputs[2].script.toBuffer(); //FTAbyC code部分
            size = getSize(lockingscript.length);
            partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
            suffixdata = lockingscript.subarray(1536);
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(tx.outputs[2].satoshisBN);
            writer.write(getLengthHex(suffixdata.length)); //suffixdata
            writer.write(suffixdata);
            writer.write(Buffer.from(hashlength, 'hex')); //partialhash
            writer.write(Buffer.from(partialhash, 'hex'));
            writer.write(getLengthHex(size.length));
            writer.write(size);
            writer.write(Buffer.from(amountlength, 'hex')); //FTAbyC tape部分
            writer.writeUInt64LEBN(tx.outputs[3].satoshisBN);
            writer.write(getLengthHex(tx.outputs[3].script.toBuffer().length));
            writer.write(tx.outputs[3].script.toBuffer());
            //FT-LP输出
            lockingscript = tx.outputs[4].script.toBuffer(); //FT-LP code部分
            size = getSize(lockingscript.length);
            //之后要修改部分，根据FT-LP的设计
            partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
            suffixdata = lockingscript.subarray(1536);
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(tx.outputs[4].satoshisBN);
            writer.write(getLengthHex(suffixdata.length)); //suffixdata
            writer.write(suffixdata);
            writer.write(Buffer.from(hashlength, 'hex')); //partialhash
            writer.write(Buffer.from(partialhash, 'hex'));
            writer.write(getLengthHex(size.length));
            writer.write(size);
            writer.write(Buffer.from(amountlength, 'hex')); //FT-LP tape部分
            writer.writeUInt64LEBN(tx.outputs[5].satoshisBN);
            writer.write(getLengthHex(tx.outputs[5].script.toBuffer().length));
            writer.write(tx.outputs[5].script.toBuffer());
            //可能的FTAbyA找零、普通P2PKH找零输出，要求若两者均存在，FTAbyA找零在前
            switch (tx.outputs.length) {
                //无任何找零
                case 6:
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from('00', 'hex'));
                    break;
                //只有普通找零
                case 7:
                    var lockingscript_1 = tx.outputs[6].script.toBuffer();
                    var size_1 = getSize(lockingscript_1.length); // size小端序
                    var partialhash_1 = '00';
                    var suffixdata_1 = lockingscript_1;
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from(amountlength, 'hex'));
                    writer.writeUInt64LEBN(tx.outputs[6].satoshisBN);
                    writer.write(getLengthHex(suffixdata_1.length)); // suffixdata为完整锁定脚本
                    writer.write(suffixdata_1);
                    writer.write(Buffer.from(partialhash_1, 'hex')); // partialhash为空
                    writer.write(getLengthHex(size_1.length));
                    writer.write(size_1);
                    break;
                //只有FTAbyA找零
                case 8:
                    for (var i = 6; i < tx.outputs.length; i++) {
                        var lockingscript_2 = tx.outputs[i].script.toBuffer();
                        var size_2 = getSize(lockingscript_2.length); // size小端序
                        var partialhash_2 = partial_sha256.calculate_partial_hash(lockingscript_2.subarray(0, 1536));
                        var suffixdata_2 = lockingscript_2.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                        writer.write(getLengthHex(suffixdata_2.length)); // suffixdata
                        writer.write(suffixdata_2);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash_2, 'hex'));
                        writer.write(getLengthHex(size_2.length));
                        writer.write(size_2);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                        writer.write(tx.outputs[i + 1].script.toBuffer());
                        writer.write(Buffer.from('00', 'hex'));
                        i++;
                    }
                    break;
                //同时存在FTAbyA找零和普通找零
                case 9:
                    for (var i = 6; i < tx.outputs.length; i++) {
                        var lockingscript_3 = tx.outputs[i].script.toBuffer();
                        if (lockingscript_3.length == 1564) {
                            var size_3 = getSize(lockingscript_3.length); // size小端序
                            var partialhash_3 = partial_sha256.calculate_partial_hash(lockingscript_3.subarray(0, 1536));
                            var suffixdata_3 = lockingscript_3.subarray(1536);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata_3.length)); // suffixdata
                            writer.write(suffixdata_3);
                            writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                            writer.write(Buffer.from(partialhash_3, 'hex'));
                            writer.write(getLengthHex(size_3.length));
                            writer.write(size_3);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                            writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                            writer.write(tx.outputs[i + 1].script.toBuffer());
                            i++;
                        }
                        else {
                            var size_4 = getSize(lockingscript_3.length); // size小端序
                            var partialhash_4 = '00';
                            var suffixdata_4 = lockingscript_3;
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata_4.length)); // suffixdata为完整锁定脚本
                            writer.write(suffixdata_4);
                            writer.write(Buffer.from(partialhash_4, 'hex')); // partialhash为空
                            writer.write(getLengthHex(size_4.length));
                            writer.write(size_4);
                        }
                    }
                    break;
                default:
                    throw new Error('Invalid transaction');
            }
            break;
        //LP换Tokens
        case 2:
            //poolnft输出
            writer.write(Buffer.from(amountlength, 'hex')); //poolnftcodehash
            writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
            writer.write(Buffer.from(hashlength, 'hex'));
            writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
            writer.write(Buffer.from(amountlength, 'hex')); //poolnfttape
            writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
            writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length));
            writer.write(tx.outputs[1].script.toBuffer());
            for (var i = 2; i < 7; i++) {
                var lockingscript_4 = tx.outputs[i].script.toBuffer();
                if (lockingscript_4.length == 1564) {
                    var size_5 = getSize(lockingscript_4.length); // size小端序
                    var partialhash_5 = partial_sha256.calculate_partial_hash(lockingscript_4.subarray(0, 1536));
                    var suffixdata_5 = lockingscript_4.subarray(1536);
                    writer.write(Buffer.from(amountlength, 'hex'));
                    writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                    writer.write(getLengthHex(suffixdata_5.length)); // suffixdata
                    writer.write(suffixdata_5);
                    writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                    writer.write(Buffer.from(partialhash_5, 'hex'));
                    writer.write(getLengthHex(size_5.length));
                    writer.write(size_5);
                    writer.write(Buffer.from(amountlength, 'hex'));
                    writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                    writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                    writer.write(tx.outputs[i + 1].script.toBuffer());
                    i++;
                }
                else {
                    var size_6 = getSize(lockingscript_4.length); // size小端序
                    var partialhash_6 = '00';
                    var suffixdata_6 = lockingscript_4;
                    writer.write(Buffer.from(amountlength, 'hex'));
                    writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                    writer.write(getLengthHex(suffixdata_6.length)); // suffixdata为完整锁定脚本
                    writer.write(suffixdata_6);
                    writer.write(Buffer.from(partialhash_6, 'hex')); // partialhash为空
                    writer.write(getLengthHex(size_6.length));
                    writer.write(size_6);
                }
            }
            //可能的FT-LP找零、FTAbyC找零、普通P2PKH找零输出，要求顺序保持一致
            switch (tx.outputs.length) {
                //无任何找零
                case 7:
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from('00', 'hex'));
                    break;
                //只有普通找零
                case 8:
                    lockingscript = tx.outputs[7].script.toBuffer();
                    size = getSize(lockingscript.length); // size小端序
                    partialhash = '00';
                    suffixdata = lockingscript;
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from(amountlength, 'hex'));
                    writer.writeUInt64LEBN(tx.outputs[7].satoshisBN);
                    writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                    writer.write(suffixdata);
                    writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                    writer.write(getLengthHex(size.length));
                    writer.write(size);
                    break;
                //可能的FT-PL或FTAbyC找零
                case 9:
                    lockingscript = tx.outputs[7].script.toBuffer();
                    if (lockingscript.subarray(1404, 1409).toString('hex') === 'ffffffffff') {
                        var size_7 = getSize(lockingscript.length); // size小端序
                        var partialhash_7 = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                        var suffixdata_7 = lockingscript.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[7].satoshisBN);
                        writer.write(getLengthHex(suffixdata_7.length)); // suffixdata
                        writer.write(suffixdata_7);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash_7, 'hex'));
                        writer.write(getLengthHex(size_7.length));
                        writer.write(size_7);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[8].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[8].script.toBuffer().length));
                        writer.write(tx.outputs[8].script.toBuffer());
                        writer.write(Buffer.from('00', 'hex'));
                        writer.write(Buffer.from('00', 'hex'));
                    }
                    else {
                        writer.write(Buffer.from('00', 'hex'));
                        var size_8 = getSize(lockingscript.length); // size小端序
                        var partialhash_8 = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                        var suffixdata_8 = lockingscript.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[7].satoshisBN);
                        writer.write(getLengthHex(suffixdata_8.length)); // suffixdata
                        writer.write(suffixdata_8);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash_8, 'hex'));
                        writer.write(getLengthHex(size_8.length));
                        writer.write(size_8);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[8].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[8].script.toBuffer().length));
                        writer.write(tx.outputs[8].script.toBuffer());
                        writer.write(Buffer.from('00', 'hex'));
                    }
                    break;
                //可能的FT-PL或FTAbyC找零 + 普通找零
                case 10:
                    lockingscript = tx.outputs[7].script.toBuffer();
                    if (lockingscript.subarray(1404, 1409).toString('hex') === 'ffffffffff') {
                        size = getSize(lockingscript.length); // size小端序
                        partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                        suffixdata = lockingscript.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[7].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata
                        writer.write(suffixdata);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash, 'hex'));
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[8].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[8].script.toBuffer().length));
                        writer.write(tx.outputs[8].script.toBuffer());
                        writer.write(Buffer.from('00', 'hex'));
                        lockingscript = tx.outputs[9].script.toBuffer();
                        size = getSize(lockingscript.length); // size小端序
                        partialhash = '00';
                        suffixdata = lockingscript;
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[9].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                        writer.write(suffixdata);
                        writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                    }
                    else {
                        writer.write(Buffer.from('00', 'hex'));
                        size = getSize(lockingscript.length); // size小端序
                        partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                        suffixdata = lockingscript.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[7].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata
                        writer.write(suffixdata);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash, 'hex'));
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[8].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[8].script.toBuffer().length));
                        writer.write(tx.outputs[8].script.toBuffer());
                        lockingscript = tx.outputs[9].script.toBuffer();
                        size = getSize(lockingscript.length); // size小端序
                        partialhash = '00';
                        suffixdata = lockingscript;
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[9].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                        writer.write(suffixdata);
                        writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                    }
                    break;
                //只有FT-PL、FTAbyC找零
                case 11:
                    for (var i = 7; i < tx.outputs.length; i++) {
                        var lockingscript_5 = tx.outputs[i].script.toBuffer();
                        if (lockingscript_5.length == 1564) {
                            var size_9 = getSize(lockingscript_5.length); // size小端序
                            var partialhash_9 = partial_sha256.calculate_partial_hash(lockingscript_5.subarray(0, 1536));
                            var suffixdata_9 = lockingscript_5.subarray(1536);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata_9.length)); // suffixdata
                            writer.write(suffixdata_9);
                            writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                            writer.write(Buffer.from(partialhash_9, 'hex'));
                            writer.write(getLengthHex(size_9.length));
                            writer.write(size_9);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                            writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                            writer.write(tx.outputs[i + 1].script.toBuffer());
                            i++;
                        }
                        else {
                            var size_10 = getSize(lockingscript_5.length); // size小端序
                            var partialhash_10 = '00';
                            var suffixdata_10 = lockingscript_5;
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata_10.length)); // suffixdata为完整锁定脚本
                            writer.write(suffixdata_10);
                            writer.write(Buffer.from(partialhash_10, 'hex')); // partialhash为空
                            writer.write(getLengthHex(size_10.length));
                            writer.write(size_10);
                        }
                    }
                    writer.write(Buffer.from('00', 'hex'));
                    break;
                //完整输出
                case 12:
                    for (var i = 7; i < tx.outputs.length; i++) {
                        var lockingscript_6 = tx.outputs[i].script.toBuffer();
                        if (lockingscript_6.length == 1564) {
                            var size_11 = getSize(lockingscript_6.length); // size小端序
                            var partialhash_11 = partial_sha256.calculate_partial_hash(lockingscript_6.subarray(0, 1536));
                            var suffixdata_11 = lockingscript_6.subarray(1536);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata_11.length)); // suffixdata
                            writer.write(suffixdata_11);
                            writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                            writer.write(Buffer.from(partialhash_11, 'hex'));
                            writer.write(getLengthHex(size_11.length));
                            writer.write(size_11);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                            writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                            writer.write(tx.outputs[i + 1].script.toBuffer());
                            i++;
                        }
                        else {
                            var size_12 = getSize(lockingscript_6.length); // size小端序
                            var partialhash_12 = '00';
                            var suffixdata_12 = lockingscript_6;
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata_12.length)); // suffixdata为完整锁定脚本
                            writer.write(suffixdata_12);
                            writer.write(Buffer.from(partialhash_12, 'hex')); // partialhash为空
                            writer.write(getLengthHex(size_12.length));
                            writer.write(size_12);
                        }
                    }
                    break;
                default:
                    throw new Error('Invalid transaction');
            }
            break;
        case 3:
            switch (swapOption) {
                //TBC换Tokens
                case 1:
                    //poolnft输出
                    writer.write(Buffer.from(amountlength, 'hex')); //poolnftcodehash
                    writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
                    writer.write(Buffer.from(hashlength, 'hex'));
                    writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
                    writer.write(Buffer.from(amountlength, 'hex')); //poolnfttape
                    writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
                    writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length));
                    writer.write(tx.outputs[1].script.toBuffer());
                    //FTAbyA、FTAbyC输出
                    for (var i = 2; i < 6; i++) {
                        var lockingscript_7 = tx.outputs[i].script.toBuffer();
                        var size_13 = getSize(lockingscript_7.length); // size小端序
                        var partialhash_13 = partial_sha256.calculate_partial_hash(lockingscript_7.subarray(0, 1536));
                        var suffixdata_13 = lockingscript_7.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                        writer.write(getLengthHex(suffixdata_13.length)); // suffixdata
                        writer.write(suffixdata_13);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash_13, 'hex'));
                        writer.write(getLengthHex(size_13.length));
                        writer.write(size_13);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                        writer.write(tx.outputs[i + 1].script.toBuffer());
                        i++;
                    }
                    //若有普通找零
                    if (tx.outputs.length == 7) {
                        var lockingscript_8 = tx.outputs[6].script.toBuffer();
                        var size_14 = getSize(lockingscript_8.length); // size小端序
                        var partialhash_14 = '00';
                        var suffixdata_14 = lockingscript_8;
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[6].satoshisBN);
                        writer.write(getLengthHex(suffixdata_14.length)); // suffixdata为完整锁定脚本
                        writer.write(suffixdata_14);
                        writer.write(Buffer.from(partialhash_14, 'hex')); // partialhash为空
                        writer.write(getLengthHex(size_14.length));
                        writer.write(size_14);
                    }
                    else {
                        writer.write(Buffer.from('00', 'hex'));
                    }
                    break;
                //Tokens换TBC
                case 2:
                    //poolnft输出
                    writer.write(Buffer.from(amountlength, 'hex')); //poolnftcodehash
                    writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
                    writer.write(Buffer.from(hashlength, 'hex'));
                    writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
                    writer.write(Buffer.from(amountlength, 'hex')); //poolnfttape
                    writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
                    writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length));
                    writer.write(tx.outputs[1].script.toBuffer());
                    for (var i = 2; i < 5; i++) {
                        var lockingscript_9 = tx.outputs[i].script.toBuffer();
                        if (lockingscript_9.length == 1564) {
                            var size_15 = getSize(lockingscript_9.length); // size小端序
                            var partialhash_15 = partial_sha256.calculate_partial_hash(lockingscript_9.subarray(0, 1536));
                            var suffixdata_15 = lockingscript_9.subarray(1536);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata_15.length)); // suffixdata
                            writer.write(suffixdata_15);
                            writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                            writer.write(Buffer.from(partialhash_15, 'hex'));
                            writer.write(getLengthHex(size_15.length));
                            writer.write(size_15);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                            writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                            writer.write(tx.outputs[i + 1].script.toBuffer());
                            i++;
                        }
                        else {
                            var size_16 = getSize(lockingscript_9.length); // size小端序
                            var partialhash_16 = '00';
                            var suffixdata_16 = lockingscript_9;
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata_16.length)); // suffixdata为完整锁定脚本
                            writer.write(suffixdata_16);
                            writer.write(Buffer.from(partialhash_16, 'hex')); // partialhash为空
                            writer.write(getLengthHex(size_16.length));
                            writer.write(size_16);
                        }
                    }
                    switch (tx.outputs.length) {
                        //只有普通找零
                        case 6:
                            writer.write(Buffer.from('00', 'hex'));
                            var lockingscript_10 = tx.outputs[5].script.toBuffer();
                            var size_17 = getSize(lockingscript_10.length); // size小端序
                            var partialhash_17 = '00';
                            var suffixdata_17 = lockingscript_10;
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[5].satoshisBN);
                            writer.write(getLengthHex(suffixdata_17.length)); // suffixdata为完整锁定脚本
                            writer.write(suffixdata_17);
                            writer.write(Buffer.from(partialhash_17, 'hex')); // partialhash为空
                            writer.write(getLengthHex(size_17.length));
                            writer.write(size_17);
                            break;
                        //只有FTAbyA找零
                        case 7:
                            for (var i = 5; i < tx.outputs.length; i++) {
                                var lockingscript_11 = tx.outputs[i].script.toBuffer();
                                var size_18 = getSize(lockingscript_11.length); // size小端序
                                var partialhash_18 = partial_sha256.calculate_partial_hash(lockingscript_11.subarray(0, 1536));
                                var suffixdata_18 = lockingscript_11.subarray(1536);
                                writer.write(Buffer.from(amountlength, 'hex'));
                                writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                                writer.write(getLengthHex(suffixdata_18.length)); // suffixdata
                                writer.write(suffixdata_18);
                                writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                                writer.write(Buffer.from(partialhash_18, 'hex'));
                                writer.write(getLengthHex(size_18.length));
                                writer.write(size_18);
                                writer.write(Buffer.from(amountlength, 'hex'));
                                writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                                writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                                writer.write(tx.outputs[i + 1].script.toBuffer());
                                i++;
                            }
                            writer.write(Buffer.from('00', 'hex'));
                            break;
                        //完整输出
                        case 8:
                            for (var i = 5; i < tx.outputs.length; i++) {
                                var lockingscript_12 = tx.outputs[i].script.toBuffer();
                                if (lockingscript_12.length == 1564) {
                                    var size_19 = getSize(lockingscript_12.length); // size小端序
                                    var partialhash_19 = partial_sha256.calculate_partial_hash(lockingscript_12.subarray(0, 1536));
                                    var suffixdata_19 = lockingscript_12.subarray(1536);
                                    writer.write(Buffer.from(amountlength, 'hex'));
                                    writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                                    writer.write(getLengthHex(suffixdata_19.length)); // suffixdata
                                    writer.write(suffixdata_19);
                                    writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                                    writer.write(Buffer.from(partialhash_19, 'hex'));
                                    writer.write(getLengthHex(size_19.length));
                                    writer.write(size_19);
                                    writer.write(Buffer.from(amountlength, 'hex'));
                                    writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                                    writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                                    writer.write(tx.outputs[i + 1].script.toBuffer());
                                    i++;
                                }
                                else {
                                    var size_20 = getSize(lockingscript_12.length); // size小端序
                                    var partialhash_20 = '00';
                                    var suffixdata_20 = lockingscript_12;
                                    writer.write(Buffer.from(amountlength, 'hex'));
                                    writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                                    writer.write(getLengthHex(suffixdata_20.length)); // suffixdata为完整锁定脚本
                                    writer.write(suffixdata_20);
                                    writer.write(Buffer.from(partialhash_20, 'hex')); // partialhash为空
                                    writer.write(getLengthHex(size_20.length));
                                    writer.write(size_20);
                                }
                            }
                            break;
                    }
                    break;
            }
            break;
        case 4:
            //poolnft输出
            writer.write(Buffer.from(amountlength, 'hex')); //poolnftcodehash
            writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
            writer.write(Buffer.from(hashlength, 'hex'));
            writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
            writer.write(Buffer.from(amountlength, 'hex')); //poolnfttape
            writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
            writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length));
            writer.write(tx.outputs[1].script.toBuffer());
            //FTAbyC输出
            lockingscript = tx.outputs[2].script.toBuffer(); //FTAbyC code部分
            size = getSize(lockingscript.length);
            partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
            suffixdata = lockingscript.subarray(1536);
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(tx.outputs[2].satoshisBN);
            writer.write(getLengthHex(suffixdata.length)); //suffixdata
            writer.write(suffixdata);
            writer.write(Buffer.from(hashlength, 'hex')); //partialhash
            writer.write(Buffer.from(partialhash, 'hex'));
            writer.write(getLengthHex(size.length));
            writer.write(size);
            writer.write(Buffer.from(amountlength, 'hex')); //FTAbyC tape部分
            writer.writeUInt64LEBN(tx.outputs[3].satoshisBN);
            writer.write(getLengthHex(tx.outputs[3].script.toBuffer().length));
            writer.write(tx.outputs[3].script.toBuffer());
            //普通找零
            lockingscript = tx.outputs[4].script.toBuffer();
            size = getSize(lockingscript.length); // size小端序
            partialhash = '00';
            suffixdata = lockingscript;
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(tx.outputs[4].satoshisBN);
            writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
            writer.write(suffixdata);
            writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
            writer.write(getLengthHex(size.length));
            writer.write(size);
    }
    var currenttxoutputsdata = writer.toBuffer().toString('hex');
    return "".concat(currenttxoutputsdata);
}
function getPoolNFTPreTxdata(tx) {
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
    writer.write(getLengthHex(inputWriter.toBuffer().length));
    writer.write(inputWriter.toBuffer());
    writer.write(Buffer.from(hashlength, 'hex'));
    writer.write(tbc.crypto.Hash.sha256(inputWriter2.toBuffer()));
    writer.write(Buffer.from(amountlength, 'hex'));
    writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
    writer.write(Buffer.from(hashlength, 'hex'));
    writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
    writer.write(Buffer.from(amountlength, 'hex'));
    writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
    writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length));
    writer.write(tx.outputs[1].script.toBuffer());
    writer.write(Buffer.from(getOutputsData(tx, 2), 'hex'));
    return writer.toBuffer().toString('hex');
}
function getPoolNFTPrePreTxdata(tx) {
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
    writer.write(Buffer.from(hashlength, 'hex'));
    writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
    writer.write(Buffer.from(getOutputsData(tx, 1), 'hex'));
    return writer.toBuffer().toString('hex');
}
function getOutputsData(tx, index) {
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
        outputslength = getLengthHex(outputs.length / 2).toString('hex');
    }
    return outputslength + outputs;
}
function getInputsTxOutputsData(tx, vout, isTape) {
    if (isTape === void 0) { isTape = false; }
    var offset = 0;
    if (isTape) {
        offset = 2;
    }
    else {
        offset = 1;
    }
    var outputs1 = ''; // outputs前部分
    var outputs1length = '';
    var outputs2 = ''; // outputs剩余部分
    var outputs2length = '';
    if (vout === 0) {
        outputs1 = '00';
        outputs1length = '';
    }
    else {
        var outputWriter1 = new tbc.encoding.BufferWriter();
        for (var i = 0; i < vout; i++) {
            outputWriter1.writeUInt64LEBN(tx.outputs[i].satoshisBN);
            outputWriter1.write(tbc.crypto.Hash.sha256(tx.outputs[i].script.toBuffer()));
        }
        outputs1 = outputWriter1.toBuffer().toString('hex'); // outputs前部分
        outputs1length = getLengthHex(outputs1.length / 2).toString('hex');
    }
    var outputWriter2 = new tbc.encoding.BufferWriter();
    for (var i = vout + offset; i < tx.outputs.length; i++) { //爷交易outputs2从vout+1开始
        outputWriter2.writeUInt64LEBN(tx.outputs[i].satoshisBN);
        outputWriter2.write(tbc.crypto.Hash.sha256(tx.outputs[i].script.toBuffer()));
    }
    outputs2 = outputWriter2.toBuffer().toString('hex'); // outputs剩余部分
    if (outputs2 === '') {
        outputs2 = '00';
        outputs2length = '';
    }
    else {
        outputs2length = getLengthHex(outputs2.length / 2).toString('hex');
    }
    return { outputs1: outputs1, outputs1length: outputs1length, outputs2: outputs2, outputs2length: outputs2length };
}
//计算交易某些数据长度，根据长度添加OP_PUSHDATA1或OP_PUSHDATA2
function getLengthHex(length) {
    if (length < 76) {
        return Buffer.from(length.toString(16).padStart(2, '0'), 'hex');
    }
    else if (length > 75 && length < 256) {
        return Buffer.concat([Buffer.from('4c', 'hex'), Buffer.from(length.toString(16), 'hex')]);
    }
    else {
        return Buffer.concat([Buffer.from('4d', 'hex'), Buffer.from(length.toString(16).padStart(4, '0'), 'hex').reverse()]);
    }
}
function getSize(length) {
    if (length < 256) {
        return Buffer.from(length.toString(16).padStart(2, '0'), 'hex');
    }
    else {
        return Buffer.from(length.toString(16).padStart(4, '0'), 'hex').reverse();
    }
}
module.exports = poolNFT;
