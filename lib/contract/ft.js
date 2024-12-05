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
var API = require("../api/api").API;
var partial_sha256 = require('tbc-lib-js/lib/util/partial-sha256');
var version = 10;
var vliolength = '10'; // Version + nLockTime + inputCount + outputCount (16 bytes)
var amountlength = '08'; // Length of the amount field (8 bytes)
var hashlength = '20'; // Length of the hash field (32 bytes)
/**
 * Class representing a Fungible Token (FT) with methods for minting and transferring.
 */
var FT = /** @class */ (function () {
    /**
     * Constructs the FT instance either from a transaction ID or parameters.
     * @param txidOrParams - Either a contract transaction ID or token parameters.
     */
    function FT(config) {
        var _a;
        this.name = '';
        this.symbol = '';
        this.decimal = 0;
        this.totalSupply = 0;
        this.codeScript = '';
        this.tapeScript = '';
        this.contractTxid = '';
        this.network = (_a = config === null || config === void 0 ? void 0 : config.network) !== null && _a !== void 0 ? _a : "mainnet";
        if (typeof config.txidOrParams === 'string') {
            // Initialize from an existing contract transaction ID
            this.contractTxid = config.txidOrParams;
        }
        else if (config.txidOrParams) {
            // Initialize with new token parameters
            var _b = config.txidOrParams, name_1 = _b.name, symbol = _b.symbol, amount = _b.amount, decimal = _b.decimal;
            if (amount <= 0) {
                throw new Error('Amount must be a natural number');
            }
            // Validate the decimal value
            if (!Number.isInteger(decimal) || decimal <= 0) {
                throw new Error('Decimal must be a positive integer');
            }
            else if (decimal > 18) {
                throw new Error('The maximum value for decimal cannot exceed 18');
            }
            // Calculate the maximum allowable amount based on the decimal
            var maxAmount = 18 * Math.pow(10, 18 - decimal);
            if (amount > maxAmount) {
                throw new Error("When decimal is ".concat(decimal, ", the maximum amount cannot exceed ").concat(maxAmount));
            }
            this.name = name_1;
            this.symbol = symbol;
            this.decimal = decimal;
            this.totalSupply = amount;
        }
        else {
            throw new Error('Invalid constructor arguments');
        }
    }
    /**
     * Initializes the FT instance by fetching the FTINFO.
     */
    FT.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            var ftInfo;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.fetchFtInfo(this.contractTxid)];
                    case 1:
                        ftInfo = _a.sent();
                        this.name = ftInfo.name;
                        this.symbol = ftInfo.symbol;
                        this.decimal = ftInfo.decimal;
                        this.totalSupply = ftInfo.totalSupply;
                        this.codeScript = ftInfo.codeScript;
                        this.tapeScript = ftInfo.tapeScript;
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Mints a new FT and returns the raw transaction hex.
     * @param privateKey_from - The private key of the sender.
     * @param address_to - The recipient's address.
     * @returns The raw transaction hex string.
     */
    FT.prototype.MintFT = function (privateKey_from, address_to) {
        return __awaiter(this, void 0, void 0, function () {
            var privateKey, address_from, name, symbol, decimal, totalSupply, amountbn, amountwriter, i, tapeAmount, nameHex, symbolHex, decimalHex, tapeScript, tapeSize, utxo, codeScript, tx, txraw;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        privateKey = privateKey_from;
                        address_from = privateKey.toAddress().toString();
                        name = this.name;
                        symbol = this.symbol;
                        decimal = this.decimal;
                        totalSupply = BigInt(this.totalSupply * Math.pow(10, decimal));
                        amountbn = new tbc.crypto.BN(totalSupply.toString());
                        amountwriter = new tbc.encoding.BufferWriter();
                        amountwriter.writeUInt64LEBN(amountbn);
                        for (i = 1; i < 6; i++) {
                            amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
                        }
                        tapeAmount = amountwriter.toBuffer().toString('hex');
                        nameHex = Buffer.from(name, 'utf8').toString('hex');
                        symbolHex = Buffer.from(symbol, 'utf8').toString('hex');
                        decimalHex = decimal.toString(16).padStart(2, '0');
                        tapeScript = tbc.Script.fromASM("OP_FALSE OP_RETURN ".concat(tapeAmount, " ").concat(decimalHex, " ").concat(nameHex, " ").concat(symbolHex, " 4654617065"));
                        tapeSize = tapeScript.toBuffer().length;
                        return [4 /*yield*/, API.fetchUTXO(privateKey, 0.001, this.network)];
                    case 1:
                        utxo = _a.sent();
                        codeScript = this.getFTmintCode(utxo.txId, utxo.outputIndex, address_to, tapeSize);
                        this.codeScript = codeScript.toBuffer().toString('hex');
                        this.tapeScript = tapeScript.toBuffer().toString('hex');
                        tx = new tbc.Transaction()
                            .from(utxo)
                            .addOutput(new tbc.Transaction.Output({
                            script: codeScript,
                            satoshis: 2000
                        }))
                            .addOutput(new tbc.Transaction.Output({
                            script: tapeScript,
                            satoshis: 0
                        }))
                            .feePerKb(100)
                            .change(privateKey.toAddress())
                            .sign(privateKey);
                        tx.seal();
                        txraw = tx.uncheckedSerialize();
                        this.contractTxid = tx.hash;
                        return [2 /*return*/, txraw];
                }
            });
        });
    };
    /**
     * Transfers FT tokens to another address and returns the raw transaction hex.
     * @param privateKey_from - The private key of the sender.
     * @param address_to - The recipient's address.
     * @param amount - The amount to transfer.
     * @returns The raw transaction hex string.
     */
    FT.prototype.transfer = function (privateKey_from, address_to, amount) {
        return __awaiter(this, void 0, void 0, function () {
            var privateKey, address_from, code, tape, decimal, tapeAmountSetIn, amountbn, fttxo_a, tapeAmountSum, i, maxAmount, _a, amountHex, changeHex, utxo, tx, codeScript, tapeScript, changeCodeScript, changeTapeScript, txraw;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        privateKey = privateKey_from;
                        address_from = privateKey.toAddress().toString();
                        code = this.codeScript;
                        tape = this.tapeScript;
                        decimal = this.decimal;
                        tapeAmountSetIn = [];
                        if (amount < 0) {
                            throw new Error('Invalid amount input');
                        }
                        amountbn = BigInt(amount * Math.pow(10, decimal));
                        return [4 /*yield*/, this.fetchFtTXO(this.contractTxid, address_from, amountbn)];
                    case 1:
                        fttxo_a = _b.sent();
                        tapeAmountSetIn.push(fttxo_a.ftBalance);
                        tapeAmountSum = BigInt(0);
                        for (i = 0; i < tapeAmountSetIn.length; i++) {
                            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
                        }
                        // Check if the balance is sufficient
                        if (amountbn > tapeAmountSum) {
                            throw new Error('Insufficient balance, please add more FT UTXOs');
                        }
                        // Validate the decimal and amount
                        if (decimal > 18) {
                            throw new Error('The maximum value for decimal cannot exceed 18');
                        }
                        maxAmount = Math.pow(10, 18 - decimal);
                        if (amount > maxAmount) {
                            throw new Error("When decimal is ".concat(decimal, ", the maximum amount cannot exceed ").concat(maxAmount));
                        }
                        _a = FT.buildTapeAmount(amountbn, tapeAmountSetIn), amountHex = _a.amountHex, changeHex = _a.changeHex;
                        return [4 /*yield*/, API.fetchUTXO(privateKey, 0.1, this.network)];
                    case 2:
                        utxo = _b.sent();
                        tx = new tbc.Transaction()
                            .from(fttxo_a)
                            .from(utxo);
                        codeScript = FT.buildFTtransferCode(code, address_to);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: codeScript,
                            satoshis: 2000
                        }));
                        tapeScript = FT.buildFTtransferTape(tape, amountHex);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: tapeScript,
                            satoshis: 0
                        }));
                        // If there's change, add outputs for the change
                        if (amountbn < tapeAmountSum) {
                            changeCodeScript = FT.buildFTtransferCode(code, address_from);
                            tx.addOutput(new tbc.Transaction.Output({
                                script: changeCodeScript,
                                satoshis: 2000
                            }));
                            changeTapeScript = FT.buildFTtransferTape(tape, changeHex);
                            tx.addOutput(new tbc.Transaction.Output({
                                script: changeTapeScript,
                                satoshis: 0
                            }));
                        }
                        tx.feePerKb(100);
                        tx.change(address_from);
                        // Set the input script asynchronously for the FT UTXO
                        return [4 /*yield*/, tx.setInputScriptAsync({
                                inputIndex: 0,
                            }, function (tx) { return __awaiter(_this, void 0, void 0, function () {
                                var unlockingScript;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, this.getFTunlock(privateKey, tx, 0, fttxo_a.txId, fttxo_a.outputIndex)];
                                        case 1:
                                            unlockingScript = _a.sent();
                                            return [2 /*return*/, unlockingScript];
                                    }
                                });
                            }); })];
                    case 3:
                        // Set the input script asynchronously for the FT UTXO
                        _b.sent();
                        tx.sign(privateKey);
                        return [4 /*yield*/, tx.sealAsync()];
                    case 4:
                        _b.sent();
                        txraw = tx.uncheckedSerialize();
                        return [2 /*return*/, txraw];
                }
            });
        });
    };
    /**
     * Fetches an FT UTXO that satisfies the required amount.
     * @param contractTxid - The contract transaction ID.
     * @param addressOrHash - The recipient's address or hash.
     * @param amount - The required amount.
     * @returns The FT UTXO that meets the amount requirement.
     */
    FT.prototype.fetchFtTXO = function (contractTxid, addressOrHash, amount) {
        return __awaiter(this, void 0, void 0, function () {
            var hash, publicKeyHash, url_testnet, url_mainnet, url, response, responseData, data, i, totalBalance, fttxo_codeScript, fttxo, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        hash = '';
                        if (tbc.Address.isValid(addressOrHash)) {
                            publicKeyHash = tbc.Address.fromString(addressOrHash).hashBuffer.toString('hex');
                            hash = publicKeyHash + '00';
                        }
                        else {
                            // If the recipient is a hash
                            if (addressOrHash.length !== 40) {
                                throw new Error('Invalid address or hash');
                            }
                            hash = addressOrHash + '01';
                        }
                        url_testnet = "http://tbcdev.org:5000/v1/tbc/main/ft/utxo/combine/script/".concat(hash, "/contract/").concat(contractTxid);
                        url_mainnet = "https://turingwallet.xyz/v1/tbc/main/ft/utxo/combine/script/".concat(hash, "/contract/").concat(contractTxid);
                        url = this.network == "testnet" ? url_testnet : url_mainnet;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 6, , 7]);
                        return [4 /*yield*/, fetch(url, {
                                method: 'GET',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                            })];
                    case 2:
                        response = _a.sent();
                        if (!response.ok) {
                            throw new Error("Failed to fetch from URL: ".concat(url, ", status: ").concat(response.status));
                        }
                        return [4 /*yield*/, response.json()];
                    case 3:
                        responseData = _a.sent();
                        data = responseData.ftUtxoList[0];
                        for (i = 0; i < responseData.ftUtxoList.length; i++) {
                            if (responseData.ftUtxoList[i].ftBalance >= amount) {
                                data = responseData.ftUtxoList[i];
                                break;
                            }
                        }
                        if (!(data.ftBalance < amount)) return [3 /*break*/, 5];
                        return [4 /*yield*/, API.getFTbalance(contractTxid, addressOrHash, this.network)];
                    case 4:
                        totalBalance = _a.sent();
                        if (totalBalance >= amount) {
                            throw new Error('Insufficient FTbalance, please merge FT UTXOs');
                        }
                        _a.label = 5;
                    case 5:
                        fttxo_codeScript = FT.buildFTtransferCode(this.codeScript, addressOrHash).toBuffer().toString('hex');
                        fttxo = {
                            txId: data.utxoId,
                            outputIndex: data.utxoVout,
                            script: fttxo_codeScript,
                            satoshis: data.utxoBalance,
                            ftBalance: data.ftBalance
                        };
                        return [2 /*return*/, fttxo];
                    case 6:
                        error_1 = _a.sent();
                        throw new Error("Failed to fetch FTTXO.");
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Fetches the FT information for a given contract transaction ID.
     *
     * @param {string} contractTxid - The contract transaction ID.
     * @returns {Promise<FtInfo>} Returns a Promise that resolves to an FtInfo object containing the FT information.
     * @throws {Error} Throws an error if the request to fetch FT information fails.
     */
    FT.prototype.fetchFtInfo = function (contractTxid) {
        return __awaiter(this, void 0, void 0, function () {
            var url_testnet, url_mainnet, url, response, data, ftInfo, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url_testnet = "http://tbcdev.org:5000/v1/tbc/main/ft/info/contract/id/".concat(contractTxid);
                        url_mainnet = "https://turingwallet.xyz/v1/tbc/main/ft/info/contract/id/".concat(contractTxid);
                        url = this.network == "testnet" ? url_testnet : url_mainnet;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, fetch(url, {
                                method: 'GET',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                            })];
                    case 2:
                        response = _a.sent();
                        if (!response.ok) {
                            throw new Error("Failed to fetch from URL: ".concat(url, ", status: ").concat(response.status));
                        }
                        return [4 /*yield*/, response.json()];
                    case 3:
                        data = _a.sent();
                        ftInfo = {
                            codeScript: data.ftCodeScript,
                            tapeScript: data.ftTapeScript,
                            totalSupply: data.ftSupply,
                            decimal: data.ftDecimal,
                            name: data.ftName,
                            symbol: data.ftSymbol
                        };
                        return [2 /*return*/, ftInfo];
                    case 4:
                        error_2 = _a.sent();
                        throw new Error("Failed to fetch FtInfo.");
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Merges FT UTXOs.
     *
     * @param {tbc.PrivateKey} privateKey_from - The private key object.
     * @returns {Promise<boolean>} Returns a Promise that resolves to a boolean indicating whether the merge was successful.
     * @throws {Error} Throws an error if the merge fails.
     */
    FT.prototype.mergeFT = function (privateKey_from) {
        return __awaiter(this, void 0, void 0, function () {
            var privateKey, address, contractTxid, url_testnet, url_mainnet, url, fttxo_codeScript, response, fttxo_1, i, tapeAmountSetIn, tapeAmountSum, i, _a, amountHex, changeHex, utxo, tx, codeScript, tapeScript, _loop_1, i, txraw, error_3;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        privateKey = privateKey_from;
                        address = privateKey.toAddress().toString();
                        contractTxid = this.contractTxid;
                        url_testnet = "http://tbcdev.org:5000/v1/tbc/main/ft/utxo/address/".concat(address, "/contract/").concat(contractTxid);
                        url_mainnet = "https://turingwallet.xyz/v1/tbc/main/ft/utxo/address/".concat(address, "/contract/").concat(contractTxid);
                        url = this.network == "testnet" ? url_testnet : url_mainnet;
                        fttxo_codeScript = FT.buildFTtransferCode(this.codeScript, address).toBuffer().toString('hex');
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 13, , 14]);
                        return [4 /*yield*/, fetch(url)];
                    case 2: return [4 /*yield*/, (_b.sent()).json()];
                    case 3:
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
                    case 4:
                        utxo = _b.sent();
                        tx = new tbc.Transaction()
                            .from(fttxo_1)
                            .from(utxo);
                        codeScript = FT.buildFTtransferCode(this.codeScript, address);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: codeScript,
                            satoshis: 2000
                        }));
                        tapeScript = FT.buildFTtransferTape(this.tapeScript, amountHex);
                        tx.addOutput(new tbc.Transaction.Output({
                            script: tapeScript,
                            satoshis: 0
                        }));
                        tx.feePerKb(100);
                        tx.change(privateKey.toAddress());
                        _loop_1 = function (i) {
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0: return [4 /*yield*/, tx.setInputScriptAsync({
                                            inputIndex: i,
                                        }, function (tx) { return __awaiter(_this, void 0, void 0, function () {
                                            var unlockingScript;
                                            return __generator(this, function (_a) {
                                                switch (_a.label) {
                                                    case 0: return [4 /*yield*/, this.getFTunlock(privateKey, tx, i, fttxo_1[i].txId, fttxo_1[i].outputIndex)];
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
                        _b.label = 5;
                    case 5:
                        if (!(i < fttxo_1.length)) return [3 /*break*/, 8];
                        return [5 /*yield**/, _loop_1(i)];
                    case 6:
                        _b.sent();
                        _b.label = 7;
                    case 7:
                        i++;
                        return [3 /*break*/, 5];
                    case 8:
                        tx.sign(privateKey);
                        return [4 /*yield*/, tx.sealAsync()];
                    case 9:
                        _b.sent();
                        txraw = tx.uncheckedSerialize();
                        console.log('Merge FTUTXO:');
                        return [4 /*yield*/, API.broadcastTXraw(txraw, this.network)];
                    case 10:
                        _b.sent();
                        // wait 5 seconds
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 5000); })];
                    case 11:
                        // wait 5 seconds
                        _b.sent();
                        return [4 /*yield*/, this.mergeFT(privateKey)];
                    case 12:
                        _b.sent();
                        return [2 /*return*/, true];
                    case 13:
                        error_3 = _b.sent();
                        throw new Error("Merge Faild!.");
                    case 14: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Generates the unlocking script for an FT transfer.
     * @param privateKey_from - The private key of the sender.
     * @param currentTX - The current transaction object.
     * @param currentUnlockIndex - The index of the input being unlocked.
     * @param preTxId - The transaction ID of the previous transaction.
     * @param preVout - The output index in the previous transaction.
     * @returns The unlocking script as a tbc.Script object.
     */
    FT.prototype.getFTunlock = function (privateKey_from, currentTX, currentUnlockIndex, preTxId, preVout) {
        return __awaiter(this, void 0, void 0, function () {
            var privateKey, preTX, pretxdata, preTXtape, prepretxdata, i, chunk, inputIndex, prepreTX, currenttxdata, sig, publicKey, unlockingScript;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        privateKey = privateKey_from;
                        return [4 /*yield*/, API.fetchTXraw(preTxId, this.network)];
                    case 1:
                        preTX = _a.sent();
                        pretxdata = getPreTxdata(preTX, preVout);
                        preTXtape = preTX.outputs[preVout + 1].script.toBuffer().subarray(3, 51).toString('hex');
                        prepretxdata = '';
                        i = preTXtape.length - 16;
                        _a.label = 2;
                    case 2:
                        if (!(i >= 0)) return [3 /*break*/, 5];
                        chunk = preTXtape.substring(i, i + 16);
                        if (!(chunk != '0000000000000000')) return [3 /*break*/, 4];
                        inputIndex = i / 16;
                        return [4 /*yield*/, API.fetchTXraw(preTX.inputs[inputIndex].prevTxId.toString('hex'), this.network)];
                    case 3:
                        prepreTX = _a.sent();
                        prepretxdata = prepretxdata + getPrePreTxdata(prepreTX, preTX.inputs[inputIndex].outputIndex);
                        _a.label = 4;
                    case 4:
                        i -= 16;
                        return [3 /*break*/, 2];
                    case 5:
                        prepretxdata = '57' + prepretxdata;
                        currenttxdata = getCurrentTxdata(currentTX, currentUnlockIndex);
                        sig = (currentTX.getSignature(currentUnlockIndex, privateKey).length / 2).toString(16).padStart(2, '0') + currentTX.getSignature(currentUnlockIndex, privateKey);
                        publicKey = (privateKey.toPublicKey().toString().length / 2).toString(16).padStart(2, '0') + privateKey.toPublicKey().toString();
                        unlockingScript = new tbc.Script("".concat(currenttxdata).concat(prepretxdata).concat(sig).concat(publicKey).concat(pretxdata));
                        return [2 /*return*/, unlockingScript];
                }
            });
        });
    };
    /**
     * Generates the unlocking script for an FT swap.
     * @param privateKey_from - The private key of the sender.
     * @param currentTX - The current transaction object.
     * @param currentUnlockIndex - The index of the input being unlocked.
     * @param preTxId - The transaction ID of the previous transaction.
     * @param preVout - The output index in the previous transaction.
     * @returns The unlocking script as a tbc.Script object.
     */
    FT.prototype.getFTunlockSwap = function (privateKey_from, currentTX, currentUnlockIndex, preTxId, preVout) {
        return __awaiter(this, void 0, void 0, function () {
            var privateKey, contractTX, contracttxdata, preTX, pretxdata, preTXtape, prepretxdata, i, chunk, inputIndex, prepreTX, currentinputsdata, currenttxdata, sig, publicKey, unlockingScript;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        privateKey = privateKey_from;
                        return [4 /*yield*/, API.fetchTXraw(currentTX.inputs[0].prevTxId.toString('hex'), this.network)];
                    case 1:
                        contractTX = _a.sent();
                        contracttxdata = getContractTxdata(contractTX, currentTX.inputs[0].outputIndex);
                        return [4 /*yield*/, API.fetchTXraw(preTxId, this.network)];
                    case 2:
                        preTX = _a.sent();
                        pretxdata = getPreTxdata(preTX, preVout);
                        preTXtape = preTX.outputs[preVout + 1].script.toBuffer().subarray(3, 51).toString('hex');
                        prepretxdata = '';
                        i = preTXtape.length - 16;
                        _a.label = 3;
                    case 3:
                        if (!(i >= 0)) return [3 /*break*/, 6];
                        chunk = preTXtape.substring(i, i + 16);
                        if (!(chunk != '0000000000000000')) return [3 /*break*/, 5];
                        inputIndex = i / 16;
                        return [4 /*yield*/, API.fetchTXraw(preTX.inputs[inputIndex].prevTxId.toString('hex'), this.network)];
                    case 4:
                        prepreTX = _a.sent();
                        prepretxdata = prepretxdata + getPrePreTxdata(prepreTX, preTX.inputs[inputIndex].outputIndex);
                        _a.label = 5;
                    case 5:
                        i -= 16;
                        return [3 /*break*/, 3];
                    case 6:
                        prepretxdata = '57' + prepretxdata;
                        currentinputsdata = getCurrentInputsdata(currentTX);
                        currenttxdata = getCurrentTxdata(currentTX, currentUnlockIndex);
                        sig = (currentTX.getSignature(currentUnlockIndex, privateKey).length / 2).toString(16).padStart(2, '0') + currentTX.getSignature(currentUnlockIndex, privateKey);
                        publicKey = (privateKey.toPublicKey().toString().length / 2).toString(16).padStart(2, '0') + privateKey.toPublicKey().toString();
                        unlockingScript = new tbc.Script("".concat(currenttxdata).concat(prepretxdata).concat(sig).concat(publicKey).concat(currentinputsdata).concat(contracttxdata).concat(pretxdata));
                        return [2 /*return*/, unlockingScript];
                }
            });
        });
    };
    /**
     * Builds the code script for minting FT tokens.
     * @param txid - The transaction ID of the UTXO used for minting.
     * @param vout - The output index of the UTXO.
     * @param address - The recipient's address.
     * @param tapeSize - The size of the tape script.
     * @returns The code script as a tbc.Script object.
     */
    FT.prototype.getFTmintCode = function (txid, vout, address, tapeSize) {
        var writer = new tbc.encoding.BufferWriter();
        writer.writeReverse(Buffer.from(txid, 'hex'));
        writer.writeUInt32LE(vout);
        var utxoHex = writer.toBuffer().toString('hex');
        var publicKeyHash = tbc.Address.fromString(address).hashBuffer.toString('hex');
        var hash = publicKeyHash + '00';
        var tapeSizeHex = getSize(tapeSize).toString('hex');
        // The codeScript is constructed with specific opcodes and parameters for FT minting
        var codeScript = new tbc.Script("OP_9 OP_PICK OP_TOALTSTACK OP_1 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_5 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x28 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_4 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x28 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_3 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x28 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_2 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x28 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_1 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x28 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_0 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x28 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_TOALTSTACK OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_TOALTSTACK OP_SHA256 OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_SHA256 OP_6 OP_PUSH_META 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_FROMALTSTACK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_1 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_1 OP_PICK OP_HASH160 OP_EQUALVERIFY OP_CHECKSIGVERIFY OP_ELSE OP_1 OP_EQUALVERIFY OP_2 OP_PICK OP_HASH160 OP_EQUALVERIFY OP_TOALTSTACK OP_CAT OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_SHA256 OP_SHA256 OP_OVER 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY OP_CHECKSIGVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_SHA256 OP_SHA256 OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_FROMALTSTACK OP_FROMALTSTACK 0x01 0x24 OP_SPLIT OP_DROP OP_DUP OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_5 OP_ROLL OP_EQUALVERIFY OP_2SWAP OP_EQUAL OP_IF OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_FROMALTSTACK 0x24 0x".concat(utxoHex, " OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_SHA256 OP_SHA256 OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_FROMALTSTACK OP_FROMALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_5 OP_ROLL OP_EQUALVERIFY OP_2SWAP OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_SHA256 OP_SHA256 OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_FROMALTSTACK OP_FROMALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_5 OP_ROLL OP_EQUALVERIFY OP_2SWAP OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_SHA256 OP_SHA256 OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_FROMALTSTACK OP_FROMALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_5 OP_ROLL OP_EQUALVERIFY OP_2SWAP OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_SHA256 OP_SHA256 OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_FROMALTSTACK OP_FROMALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_5 OP_ROLL OP_EQUALVERIFY OP_2SWAP OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_SHA256 OP_SHA256 OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_FROMALTSTACK OP_FROMALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_5 OP_ROLL OP_EQUALVERIFY OP_2SWAP OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_0 OP_EQUALVERIFY OP_7 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x").concat(tapeSizeHex, " OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_0 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_0 OP_EQUALVERIFY OP_DROP OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_SHA256 OP_7 OP_PUSH_META OP_EQUAL OP_NIP 0x21 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff OP_DROP OP_RETURN 0x15 0x").concat(hash, " 0x05 0x32436f6465"));
        return codeScript;
    };
    /**
     * Builds the code script for transferring FT to a new address or hash.
     * @param code - The original code script in hex.
     * @param addressOrHash - The recipient's address or hash.
     * @returns The new code script as a tbc.Script object.
     */
    FT.buildFTtransferCode = function (code, addressOrHash) {
        if (tbc.Address.isValid(addressOrHash)) {
            // If the recipient is an address
            var publicKeyHashBuffer = tbc.Address.fromString(addressOrHash).hashBuffer;
            var hashBuffer = Buffer.concat([publicKeyHashBuffer, Buffer.from([0x00])]);
            var codeBuffer = Buffer.from(code, 'hex');
            hashBuffer.copy(codeBuffer, 1537, 0, 21); // Replace the hash in the code script
            var codeScript = new tbc.Script(codeBuffer.toString('hex'));
            return codeScript;
        }
        else {
            // If the recipient is a hash
            if (addressOrHash.length !== 40) {
                throw new Error('Invalid address or hash');
            }
            var hash = addressOrHash + '01';
            var hashBuffer = Buffer.from(hash, 'hex');
            var codeBuffer = Buffer.from(code, 'hex');
            hashBuffer.copy(codeBuffer, 1537, 0, 21); // Replace the hash in the code script
            var codeScript = new tbc.Script(codeBuffer.toString('hex'));
            return codeScript;
        }
    };
    /**
     * Builds the tape script with the specified amount for transfer.
     * @param tape - The original tape script in hex.
     * @param amountHex - The amount in hex format.
     * @returns The new tape script as a tbc.Script object.
     */
    FT.buildFTtransferTape = function (tape, amountHex) {
        var amountHexBuffer = Buffer.from(amountHex, 'hex');
        var tapeBuffer = Buffer.from(tape, 'hex');
        amountHexBuffer.copy(tapeBuffer, 3, 0, 48); // Replace the amount in the tape script
        var tapeScript = new tbc.Script(tapeBuffer.toString('hex'));
        return tapeScript;
    };
    /**
     * Builds the amount and change hex strings for the tape script.
     * @param amountBN - The amount to transfer in BN format.
     * @param tapeAmountSet - The set of amounts from the input tapes.
     * @param ftInputIndex - (Optional) The index of the FT input.
     * @returns An object containing amountHex and changeHex.
     */
    FT.buildTapeAmount = function (amountBN, tapeAmountSet, ftInputIndex) {
        var i = 0;
        var j = 0;
        var amountwriter = new tbc.encoding.BufferWriter();
        var changewriter = new tbc.encoding.BufferWriter();
        // Initialize with zeros if ftInputIndex is provided
        if (ftInputIndex) {
            for (j = 0; j < ftInputIndex; j++) {
                amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
                changewriter.writeUInt64LEBN(new tbc.crypto.BN(0));
            }
        }
        // Build the amount and change for each tape slot
        for (i = 0; i < 6; i++) {
            if (amountBN <= BigInt(0)) {
                break;
            }
            if (tapeAmountSet[i] < amountBN) {
                amountwriter.writeUInt64LEBN(new tbc.crypto.BN(tapeAmountSet[i].toString()));
                changewriter.writeUInt64LEBN(new tbc.crypto.BN(0));
                amountBN -= BigInt(tapeAmountSet[i]);
            }
            else {
                amountwriter.writeUInt64LEBN(new tbc.crypto.BN(amountBN.toString()));
                changewriter.writeUInt64LEBN(new tbc.crypto.BN((BigInt(tapeAmountSet[i]) - amountBN).toString()));
                amountBN = BigInt(0);
            }
        }
        // Fill the remaining slots with zeros or remaining amounts
        for (; i < 6 && j < 6; i++, j++) {
            if (tapeAmountSet[i]) {
                amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
                changewriter.writeUInt64LEBN(new tbc.crypto.BN(tapeAmountSet[i].toString()));
            }
            else {
                amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
                changewriter.writeUInt64LEBN(new tbc.crypto.BN(0));
            }
        }
        var amountHex = amountwriter.toBuffer().toString('hex');
        var changeHex = changewriter.toBuffer().toString('hex');
        return { amountHex: amountHex, changeHex: changeHex };
    };
    return FT;
}());
/**
 * Retrieves the transaction data needed for contract operations.
 * @param tx - The transaction object.
 * @returns The transaction data as a hex string.
 */
function getContractTxdata(tx, vout) {
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
    var _b = getPrePreOutputsData(tx, vout), outputs1 = _b.outputs1, outputs1length = _b.outputs1length, outputs2 = _b.outputs2, outputs2length = _b.outputs2length;
    writer.write(Buffer.from(outputs1length, 'hex'));
    writer.write(Buffer.from(outputs1, 'hex'));
    writer.write(Buffer.from(amountlength, 'hex'));
    writer.writeUInt64LEBN(tx.outputs[vout].satoshisBN);
    writer.write(Buffer.from(hashlength, 'hex'));
    writer.write(tbc.crypto.Hash.sha256(tx.outputs[vout].script.toBuffer()));
    writer.write(Buffer.from(outputs2length, 'hex'));
    writer.write(Buffer.from(outputs2, 'hex'));
    var contracttxdata = writer.toBuffer().toString('hex');
    return "".concat(contracttxdata);
}
/**
 * Retrieves the inputs data from the current transaction.
 * @param tx - The transaction object.
 * @returns The inputs data as a hex string.
 */
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
/**
 * Retrieves the current transaction data needed for unlocking scripts.
 * @param tx - The transaction object.
 * @param inputIndex - The index of the input being unlocked.
 * @returns The transaction data as a hex string.
 */
function getCurrentTxdata(tx, inputIndex) {
    var endTag = '51';
    var writer = new tbc.encoding.BufferWriter();
    for (var i = 0; i < tx.outputs.length; i++) {
        var lockingscript = tx.outputs[i].script.toBuffer();
        if (lockingscript.length == 1564) {
            // For scripts longer than 1500 bytes, calculate partial hash
            var size = getSize(lockingscript.length); // Size in little-endian
            var partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
            var suffixdata = lockingscript.subarray(1536);
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
            writer.write(getLengthHex(suffixdata.length)); // Suffix data
            writer.write(suffixdata);
            writer.write(Buffer.from(hashlength, 'hex')); // Partial hash
            writer.write(Buffer.from(partialhash, 'hex'));
            writer.write(getLengthHex(size.length));
            writer.write(size);
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
            writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
            writer.write(tx.outputs[i + 1].script.toBuffer());
            i++;
        }
        else {
            // For shorter scripts, include the entire locking script
            var size = getSize(lockingscript.length);
            var partialhash = '00';
            var suffixdata = lockingscript;
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
            writer.write(getLengthHex(suffixdata.length)); // Entire locking script
            writer.write(suffixdata);
            writer.write(Buffer.from(partialhash, 'hex')); // No partial hash
            writer.write(getLengthHex(size.length));
            writer.write(size);
        }
        writer.write(Buffer.from('52', 'hex'));
    }
    var currenttxdata = writer.toBuffer().toString('hex');
    var inputIndexMap = {
        0: '00',
        1: '51',
        2: '52',
        3: '53',
        4: '54',
        5: '55'
    };
    return "".concat(endTag).concat(currenttxdata).concat(inputIndexMap[inputIndex]);
}
/**
 * Retrieves the previous transaction data needed for unlocking scripts.
 * @param tx - The previous transaction object.
 * @param vout - The output index in the previous transaction.
 * @returns The transaction data as a hex string.
 */
function getPreTxdata(tx, vout) {
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
    var _b = getPreOutputsData(tx, vout), outputs1 = _b.outputs1, outputs1length = _b.outputs1length, outputs2 = _b.outputs2, outputs2length = _b.outputs2length;
    writer.write(Buffer.from(outputs1length, 'hex'));
    writer.write(Buffer.from(outputs1, 'hex'));
    var lockingscript = tx.outputs[vout].script.toBuffer();
    var size = getSize(lockingscript.length); // Size in little-endian
    var partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
    var suffixdata = lockingscript.subarray(1536);
    writer.write(Buffer.from(amountlength, 'hex'));
    writer.writeUInt64LEBN(tx.outputs[vout].satoshisBN);
    writer.write(getLengthHex(suffixdata.length)); // Suffix data
    writer.write(suffixdata);
    writer.write(Buffer.from(hashlength, 'hex')); // Partial hash
    writer.write(Buffer.from(partialhash, 'hex'));
    writer.write(getLengthHex(size.length));
    writer.write(size);
    writer.write(Buffer.from(amountlength, 'hex'));
    writer.writeUInt64LEBN(tx.outputs[vout + 1].satoshisBN);
    writer.write(getLengthHex(tx.outputs[vout + 1].script.toBuffer().length));
    writer.write(tx.outputs[vout + 1].script.toBuffer());
    writer.write(Buffer.from(outputs2length, 'hex'));
    writer.write(Buffer.from(outputs2, 'hex'));
    var pretxdata = writer.toBuffer().toString('hex');
    return "".concat(pretxdata);
}
/**
 * Retrieves the previous transaction data from the grandparent transaction.
 * @param tx - The grandparent transaction object.
 * @param vout - The output index in the grandparent transaction.
 * @returns The transaction data as a hex string with a suffix '52'.
 */
function getPrePreTxdata(tx, vout) {
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
    var _b = getPrePreOutputsData(tx, vout), outputs1 = _b.outputs1, outputs1length = _b.outputs1length, outputs2 = _b.outputs2, outputs2length = _b.outputs2length;
    writer.write(Buffer.from(outputs1length, 'hex'));
    writer.write(Buffer.from(outputs1, 'hex'));
    var lockingscript = tx.outputs[vout].script.toBuffer();
    if (lockingscript.length == 1564) {
        var size = getSize(lockingscript.length); // Size in little-endian
        var partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
        var suffixdata = lockingscript.subarray(1536);
        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[vout].satoshisBN);
        writer.write(getLengthHex(suffixdata.length)); // Suffix data
        writer.write(suffixdata);
        writer.write(Buffer.from(hashlength, 'hex')); // Partial hash
        writer.write(Buffer.from(partialhash, 'hex'));
        writer.write(getLengthHex(size.length));
        writer.write(size);
    }
    else {
        var size = getSize(lockingscript.length); // Size in little-endian
        var partialhash = '00';
        var suffixdata = lockingscript;
        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[vout].satoshisBN);
        writer.write(getLengthHex(suffixdata.length)); // Entire locking script
        writer.write(suffixdata);
        writer.write(Buffer.from(partialhash, 'hex')); // No partial hash
        writer.write(getLengthHex(size.length));
        writer.write(size);
    }
    writer.write(Buffer.from(outputs2length, 'hex'));
    writer.write(Buffer.from(outputs2, 'hex'));
    var prepretxdata = writer.toBuffer().toString('hex');
    return "".concat(prepretxdata, "52");
}
/**
 * Helper function to get outputs data before the specified output index for the grandparent transaction.
 * @param tx - The transaction object.
 * @param vout - The output index.
 * @returns An object containing outputs1, outputs1length, outputs2, and outputs2length.
 */
function getPrePreOutputsData(tx, vout) {
    var outputs1 = ''; // Outputs before the specified index
    var outputs1length = '';
    var outputs2 = ''; // Outputs after the specified index
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
        outputs1 = outputWriter1.toBuffer().toString('hex');
        outputs1length = getLengthHex(outputs1.length / 2).toString('hex');
    }
    var outputWriter2 = new tbc.encoding.BufferWriter();
    for (var i = vout + 1; i < tx.outputs.length; i++) {
        outputWriter2.writeUInt64LEBN(tx.outputs[i].satoshisBN);
        outputWriter2.write(tbc.crypto.Hash.sha256(tx.outputs[i].script.toBuffer()));
    }
    outputs2 = outputWriter2.toBuffer().toString('hex');
    if (outputs2 === '') {
        outputs2 = '00';
        outputs2length = '';
    }
    else {
        outputs2length = getLengthHex(outputs2.length / 2).toString('hex');
    }
    return { outputs1: outputs1, outputs1length: outputs1length, outputs2: outputs2, outputs2length: outputs2length };
}
/**
 * Helper function to get outputs data before the specified output index for the parent transaction.
 * @param tx - The transaction object.
 * @param vout - The output index.
 * @returns An object containing outputs1, outputs1length, outputs2, and outputs2length.
 */
function getPreOutputsData(tx, vout) {
    var outputs1 = ''; // Outputs before the specified index
    var outputs1length = '';
    var outputs2 = ''; // Outputs after the specified index
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
        outputs1 = outputWriter1.toBuffer().toString('hex');
        outputs1length = getLengthHex(outputs1.length / 2).toString('hex');
    }
    var outputWriter2 = new tbc.encoding.BufferWriter();
    for (var i = vout + 2; i < tx.outputs.length; i++) { // For parent transaction, outputs2 starts from vout + 2
        outputWriter2.writeUInt64LEBN(tx.outputs[i].satoshisBN);
        outputWriter2.write(tbc.crypto.Hash.sha256(tx.outputs[i].script.toBuffer()));
    }
    outputs2 = outputWriter2.toBuffer().toString('hex');
    if (outputs2 === '') {
        outputs2 = '00';
        outputs2length = '';
    }
    else {
        outputs2length = getLengthHex(outputs2.length / 2).toString('hex');
    }
    return { outputs1: outputs1, outputs1length: outputs1length, outputs2: outputs2, outputs2length: outputs2length };
}
/**
 * Calculates the length of data and adds OP_PUSHDATA1 or OP_PUSHDATA2 if necessary.
 * @param length - The length of the data.
 * @returns A buffer representing the length with appropriate push opcode.
 */
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
/**
 * Converts the size of data to a little-endian buffer.
 * @param length - The length of the data.
 * @returns A buffer representing the size in little-endian format.
 */
function getSize(length) {
    if (length < 256) {
        return Buffer.from(length.toString(16).padStart(2, '0'), 'hex');
    }
    else {
        return Buffer.from(length.toString(16).padStart(4, '0'), 'hex').reverse();
    }
}
module.exports = FT;
