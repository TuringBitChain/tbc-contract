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
var ftunlock_1 = require("../util/ftunlock");
var utxoSelect_1 = require("../util/utxoSelect");
var API = /** @class */ (function () {
    function API() {
    }
    /**
     * Set the mainnet URL
     * @param url The mainnet URL to use
     */
    API.setMainnetURL = function (url) {
        if (!url.endsWith('/')) {
            url += '/';
        }
        this.mainnetURL = url;
    };
    /**
     * Set the testnet URL
     * @param url The testnet URL to use
     */
    API.setTestnetURL = function (url) {
        if (!url.endsWith('/')) {
            url += '/';
        }
        this.testnetURL = url;
    };
    /**
     * Get the base URL for the specified network.
     *
     * @param {("testnet" | "mainnet")} network - The network type.
     * @returns {string} The base URL for the specified network.
     */
    API.getBaseURL = function (network) {
        return network === "testnet" ? this.testnetURL : this.mainnetURL;
    };
    /**
     * Fetches the TBC balance for a given address.
     *
     * @param {string} address - The address to fetch the TBC balance for.
     * @param {("testnet" | "mainnet")} [network] - The network type. Defaults to "mainnet" if not specified.
     * @returns {Promise<number>} Returns a Promise that resolves to the TBC balance.
     * @throws {Error} Throws an error if the request fails.
     */
    API.getTBCbalance = function (address, network) {
        return __awaiter(this, void 0, void 0, function () {
            var base_url, url, response, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!tbc.Address.isValid(address)) {
                            throw new Error("Invalid address input");
                        }
                        base_url = network
                            ? API.getBaseURL(network)
                            : API.getBaseURL("mainnet");
                        url = base_url + "address/".concat(address, "/get/balance/");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, fetch(url)];
                    case 2: return [4 /*yield*/, (_a.sent()).json()];
                    case 3:
                        response = _a.sent();
                        return [2 /*return*/, response.data.balance];
                    case 4:
                        error_1 = _a.sent();
                        throw new Error(error_1.message);
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Fetches a UTXO that satisfies the required amount.
     *
     * @param {tbc.PrivateKey} privateKey - The private key object.
     * @param {number} amount - The required amount.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<tbc.Transaction.IUnspentOutput>} Returns a Promise that resolves to the UTXO.
     * @throws {Error} Throws an error if the request fails or if the balance is insufficient.
     */
    API.fetchUTXO = function (privateKey, amount, network) {
        return __awaiter(this, void 0, void 0, function () {
            var base_url, address, url, scriptPubKey, amount_bn, response, utxo_1, data, i, totalBalance, utxo, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        base_url = network
                            ? API.getBaseURL(network)
                            : API.getBaseURL("mainnet");
                        address = privateKey.toAddress().toString();
                        url = base_url + "address/".concat(address, "/unspent/");
                        scriptPubKey = tbc.Script.buildPublicKeyHashOut(address)
                            .toBuffer()
                            .toString("hex");
                        amount_bn = Math.floor(amount * Math.pow(10, 6));
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 10, , 11]);
                        return [4 /*yield*/, fetch(url)];
                    case 2: return [4 /*yield*/, (_a.sent()).json()];
                    case 3:
                        response = _a.sent();
                        if (response.length === 0) {
                            throw new Error("The tbc balance in the account is zero.");
                        }
                        if (response.length === 1 && response[0].value > amount_bn) {
                            utxo_1 = {
                                txId: response[0].tx_hash,
                                outputIndex: response[0].tx_pos,
                                script: scriptPubKey,
                                satoshis: response[0].value,
                            };
                            return [2 /*return*/, utxo_1];
                        }
                        else if (response.length === 1 && response[0].value <= amount_bn) {
                            throw new Error("Insufficient tbc balance");
                        }
                        data = response[0];
                        for (i = 0; i < response.length; i++) {
                            if (response[i].value > amount_bn) {
                                data = response[i];
                                break;
                            }
                        }
                        if (!(data.value < amount_bn)) return [3 /*break*/, 9];
                        return [4 /*yield*/, this.getTBCbalance(address, network)];
                    case 4:
                        totalBalance = _a.sent();
                        if (!(totalBalance <= amount_bn)) return [3 /*break*/, 5];
                        throw new Error("Insufficient tbc balance");
                    case 5:
                        console.log("Merge UTXO");
                        return [4 /*yield*/, API.mergeUTXO(privateKey, network)];
                    case 6:
                        _a.sent();
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 3000); })];
                    case 7:
                        _a.sent();
                        return [4 /*yield*/, API.fetchUTXO(privateKey, amount, network)];
                    case 8: return [2 /*return*/, _a.sent()];
                    case 9:
                        utxo = {
                            txId: data.tx_hash,
                            outputIndex: data.tx_pos,
                            script: scriptPubKey,
                            satoshis: data.value,
                        };
                        return [2 /*return*/, utxo];
                    case 10:
                        error_2 = _a.sent();
                        throw new Error(error_2.message);
                    case 11: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Merges UTXOs for a given private key.
     *
     * @param {tbc.PrivateKey} privateKey - The private key object.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<boolean>} Returns a Promise that resolves to a boolean indicating whether the merge was successful.
     * @throws {Error} Throws an error if the merge fails.
     */
    API.mergeUTXO = function (privateKey, network) {
        return __awaiter(this, void 0, void 0, function () {
            var base_url, address, url, scriptPubKey, response, sumAmount, utxo, i, tx, txSize, fee, txraw, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        base_url = network
                            ? API.getBaseURL(network)
                            : API.getBaseURL("mainnet");
                        address = tbc.Address.fromPrivateKey(privateKey).toString();
                        url = base_url + "address/".concat(address, "/unspent/");
                        scriptPubKey = tbc.Script.buildPublicKeyHashOut(address)
                            .toBuffer()
                            .toString("hex");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 7, , 8]);
                        return [4 /*yield*/, fetch(url)];
                    case 2: return [4 /*yield*/, (_a.sent()).json()];
                    case 3:
                        response = _a.sent();
                        sumAmount = 0;
                        utxo = [];
                        if (response.length === 0) {
                            throw new Error("No UTXO available");
                        }
                        if (response.length === 1) {
                            console.log("Merge Success!");
                            return [2 /*return*/, true];
                        }
                        else {
                            for (i = 0; i < response.length; i++) {
                                sumAmount += response[i].value;
                                utxo.push({
                                    txId: response[i].tx_hash,
                                    outputIndex: response[i].tx_pos,
                                    script: scriptPubKey,
                                    satoshis: response[i].value,
                                });
                            }
                        }
                        tx = new tbc.Transaction().from(utxo);
                        txSize = tx.getEstimateSize() + 100;
                        fee = txSize < 1000 ? 80 : Math.ceil(txSize / 1000) * 80;
                        tx.to(address, sumAmount - fee)
                            .fee(fee)
                            .change(address)
                            .sign(privateKey)
                            .seal();
                        txraw = tx.uncheckedSerialize();
                        return [4 /*yield*/, API.broadcastTXraw(txraw, network)];
                    case 4:
                        _a.sent();
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 5000); })];
                    case 5:
                        _a.sent();
                        return [4 /*yield*/, API.mergeUTXO(privateKey, network)];
                    case 6:
                        _a.sent();
                        return [2 /*return*/, true];
                    case 7:
                        error_3 = _a.sent();
                        throw new Error(error_3.message);
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get the FT balance for a specified contract transaction ID and address or hash.
     *
     * @param {string} contractTxid - The contract transaction ID.
     * @param {string} addressOrHash - The address or hash.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<bigint>} Returns a Promise that resolves to the FT balance.
     * @throws {Error} Throws an error if the address or hash is invalid, or if the request fails.
     */
    API.getFTbalance = function (contractTxid, addressOrHash, network) {
        return __awaiter(this, void 0, void 0, function () {
            var base_url, hash, publicKeyHash, url, response, ftBalance, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        base_url = network
                            ? API.getBaseURL(network)
                            : API.getBaseURL("mainnet");
                        hash = "";
                        if (tbc.Address.isValid(addressOrHash)) {
                            publicKeyHash = tbc.Address.fromString(addressOrHash).hashBuffer.toString("hex");
                            hash = publicKeyHash + "00";
                        }
                        else {
                            // If the recipient is a hash
                            if (addressOrHash.length !== 40) {
                                throw new Error("Invalid address or hash");
                            }
                            hash = addressOrHash + "01";
                        }
                        url = base_url + "ft/balance/combine/script/".concat(hash, "/contract/").concat(contractTxid);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, fetch(url)];
                    case 2: return [4 /*yield*/, (_a.sent()).json()];
                    case 3:
                        response = _a.sent();
                        ftBalance = response.ftBalance;
                        return [2 /*return*/, ftBalance];
                    case 4:
                        error_4 = _a.sent();
                        throw new Error(error_4.message);
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Fetches a list of FT UTXOs for a specified contract transaction ID and address or hash.
     *
     * @param {string} contractTxid - The contract transaction ID.
     * @param {string} addressOrHash - The recipient's address or hash.
     * @param {string} codeScript - The code script.
     * @param {("testnet" | "mainnet")} [network] - The network type. Defaults to "mainnet" if not specified.
     * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of FT UTXOs.
     * @throws {Error} Throws an error if the request fails or if no UTXOs are found.
     */
    API.fetchFtUTXOList = function (contractTxid, addressOrHash, codeScript, network) {
        return __awaiter(this, void 0, void 0, function () {
            var base_url, hash, publicKeyHash, url, response, responseData, ftutxos, i, data, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        base_url = network
                            ? API.getBaseURL(network)
                            : API.getBaseURL("mainnet");
                        hash = "";
                        if (tbc.Address.isValid(addressOrHash)) {
                            publicKeyHash = tbc.Address.fromString(addressOrHash).hashBuffer.toString("hex");
                            hash = publicKeyHash + "00";
                        }
                        else {
                            // If the recipient is a hash
                            if (addressOrHash.length !== 40) {
                                throw new Error("Invalid address or hash");
                            }
                            hash = addressOrHash + "01";
                        }
                        url = base_url + "ft/utxo/combine/script/".concat(hash, "/contract/").concat(contractTxid);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, fetch(url, {
                                method: "GET",
                                headers: {
                                    "Content-Type": "application/json",
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
                        if (responseData.ftUtxoList.length === 0) {
                            throw new Error("The ft balance in the account is zero.");
                        }
                        ftutxos = [];
                        for (i = 0; i < responseData.ftUtxoList.length; i++) {
                            data = responseData.ftUtxoList[i];
                            ftutxos.push({
                                txId: data.utxoId,
                                outputIndex: data.utxoVout,
                                script: codeScript,
                                satoshis: data.utxoBalance,
                                ftBalance: data.ftBalance,
                            });
                        }
                        return [2 /*return*/, ftutxos];
                    case 4:
                        error_5 = _a.sent();
                        throw new Error(error_5.message);
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
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
    API.fetchFtUTXO = function (contractTxid, addressOrHash, amount, codeScript, network) {
        return __awaiter(this, void 0, void 0, function () {
            var ftutxolist, ftutxo, i, totalBalance, error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        return [4 /*yield*/, API.fetchFtUTXOList(contractTxid, addressOrHash, codeScript, network)];
                    case 1:
                        ftutxolist = _a.sent();
                        ftutxo = ftutxolist[0];
                        for (i = 0; i < ftutxolist.length; i++) {
                            if (ftutxolist[i].ftBalance >= amount) {
                                ftutxo = ftutxolist[i];
                                break;
                            }
                        }
                        if (!(ftutxo.ftBalance < amount)) return [3 /*break*/, 3];
                        return [4 /*yield*/, API.getFTbalance(contractTxid, addressOrHash, network)];
                    case 2:
                        totalBalance = _a.sent();
                        if (totalBalance >= amount) {
                            throw new Error("Insufficient FTbalance, please merge FT UTXOs");
                        }
                        else {
                            throw new Error("FTbalance not enough!");
                        }
                        _a.label = 3;
                    case 3: return [2 /*return*/, ftutxo];
                    case 4:
                        error_6 = _a.sent();
                        throw new Error(error_6.message);
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Fetches FT UTXOs for a specified contract transaction ID and address or hash.
     *
     * @param {string} contractTxid - The contract transaction ID.
     * @param {string} addressOrHash - The recipient's address or hash.
     * @param {string} codeScript - The code script.
     * @param {("testnet" | "mainnet")} [network] - The network type. Defaults to "mainnet" if not specified.
     * @param {bigint} [amount] - The required amount. If not specified, fetches up to 5 UTXOs.
     * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of FT UTXOs.
     * @throws {Error} Throws an error if the request fails or if the FT balance is insufficient.
     */
    API.fetchFtUTXOs = function (contractTxid, addressOrHash, codeScript, network, amount) {
        return __awaiter(this, void 0, void 0, function () {
            var ftutxolist, sumBalance, ftutxos, i, i, totalBalance, error_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 5, , 6]);
                        return [4 /*yield*/, API.fetchFtUTXOList(contractTxid, addressOrHash, codeScript, network)];
                    case 1:
                        ftutxolist = _a.sent();
                        ftutxolist.sort(function (a, b) { return (b.ftBalance > a.ftBalance ? 1 : -1); });
                        sumBalance = BigInt(0);
                        ftutxos = [];
                        if (!!amount) return [3 /*break*/, 2];
                        for (i = 0; i < ftutxolist.length && i < 5; i++) {
                            ftutxos.push(ftutxolist[i]);
                        }
                        return [3 /*break*/, 4];
                    case 2:
                        for (i = 0; i < ftutxolist.length && i < 5; i++) {
                            sumBalance += BigInt(ftutxolist[i].ftBalance);
                            ftutxos.push(ftutxolist[i]);
                            if (sumBalance >= amount)
                                break;
                        }
                        if (!(sumBalance < amount)) return [3 /*break*/, 4];
                        return [4 /*yield*/, API.getFTbalance(contractTxid, addressOrHash, network)];
                    case 3:
                        totalBalance = _a.sent();
                        if (totalBalance >= amount) {
                            throw new Error("Insufficient FTbalance, please merge FT UTXOs");
                        }
                        else {
                            throw new Error("FTbalance not enough!");
                        }
                        _a.label = 4;
                    case 4: return [2 /*return*/, ftutxos];
                    case 5:
                        error_7 = _a.sent();
                        throw new Error(error_7.message);
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Fetches a specified number of FT UTXOs that satisfy the required amount for a pool.
     *
     * @param {string} contractTxid - The contract transaction ID.
     * @param {string} addressOrHash - The recipient's address or hash.
     * @param {bigint} amount - The required amount.
     * @param {number} number - The number of FT UTXOs to fetch.
     * @param {string} codeScript - The code script.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of FT UTXOs.
     * @throws {Error} Throws an error if the request fails or if the FT balance is insufficient.
     */
    API.fetchFtUTXOsforPool = function (contractTxid, addressOrHash, amount, number, codeScript, network) {
        return __awaiter(this, void 0, void 0, function () {
            var ftutxolist, sumBalance, ftutxos, i, totalBalance, error_8;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (number <= 0 || !Number.isInteger(number)) {
                            throw new Error("Number must be a positive integer greater than 0");
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 5, , 6]);
                        return [4 /*yield*/, API.fetchFtUTXOList(contractTxid, addressOrHash, codeScript, network)];
                    case 2:
                        ftutxolist = _a.sent();
                        ftutxolist.sort(function (a, b) { return (b.ftBalance > a.ftBalance ? 1 : -1); });
                        sumBalance = BigInt(0);
                        ftutxos = [];
                        for (i = 0; i < ftutxolist.length && i < number; i++) {
                            sumBalance += BigInt(ftutxolist[i].ftBalance);
                            ftutxos.push(ftutxolist[i]);
                            if (sumBalance >= amount && i >= 1)
                                break;
                        }
                        if (!(sumBalance < amount)) return [3 /*break*/, 4];
                        return [4 /*yield*/, API.getFTbalance(contractTxid, addressOrHash, network)];
                    case 3:
                        totalBalance = _a.sent();
                        if (totalBalance >= amount) {
                            throw new Error("Insufficient FTbalance, please merge FT UTXOs");
                        }
                        else {
                            throw new Error("FTbalance not enough!");
                        }
                        _a.label = 4;
                    case 4: return [2 /*return*/, ftutxos];
                    case 5:
                        error_8 = _a.sent();
                        throw new Error(error_8.message);
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Fetches the FT information for a given contract transaction ID.
     *
     * @param {string} contractTxid - The contract transaction ID.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<FtInfo>} Returns a Promise that resolves to an FtInfo object containing the FT information.
     * @throws {Error} Throws an error if the request to fetch FT information fails.
     */
    API.fetchFtInfo = function (contractTxid, network) {
        return __awaiter(this, void 0, void 0, function () {
            var base_url, url, response, data, ftInfo, error_9;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        base_url = network
                            ? API.getBaseURL(network)
                            : API.getBaseURL("mainnet");
                        url = base_url + "ft/info/contract/id/".concat(contractTxid);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, fetch(url, {
                                method: "GET",
                                headers: {
                                    "Content-Type": "application/json",
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
                            symbol: data.ftSymbol,
                        };
                        return [2 /*return*/, ftInfo];
                    case 4:
                        error_9 = _a.sent();
                        throw new Error(error_9.message);
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Fetches the pre-pre transaction data for a given transaction.
     *
     * @param {tbc.Transaction} preTX - The previous transaction.
     * @param {number} preTxVout - The output index of the previous transaction.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<string>} Returns a Promise that resolves to the pre-pre transaction data.
     * @throws {Error} Throws an error if the request fails.
     */
    API.fetchFtPrePreTxData = function (preTX, preTxVout, network) {
        return __awaiter(this, void 0, void 0, function () {
            var preTXtape, prepretxdata, i, chunk, inputIndex, prepreTX;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        preTXtape = Buffer.from(preTX.outputs[preTxVout + 1].script.toBuffer().subarray(3, 51)).toString("hex");
                        prepretxdata = "";
                        i = preTXtape.length - 16;
                        _a.label = 1;
                    case 1:
                        if (!(i >= 0)) return [3 /*break*/, 4];
                        chunk = preTXtape.substring(i, i + 16);
                        if (!(chunk != "0000000000000000")) return [3 /*break*/, 3];
                        inputIndex = i / 16;
                        return [4 /*yield*/, API.fetchTXraw(preTX.inputs[inputIndex].prevTxId.toString("hex"), network)];
                    case 2:
                        prepreTX = _a.sent();
                        prepretxdata =
                            prepretxdata +
                                (0, ftunlock_1.getPrePreTxdata)(prepreTX, preTX.inputs[inputIndex].outputIndex);
                        _a.label = 3;
                    case 3:
                        i -= 16;
                        return [3 /*break*/, 1];
                    case 4:
                        prepretxdata = "57" + prepretxdata;
                        return [2 /*return*/, prepretxdata];
                }
            });
        });
    };
    /**
     * Fetches the Pool NFT information for a given contract transaction ID.
     *
     * @param {string} contractTxid - The contract transaction ID.
     * @param {("testnet" | "mainnet")} [network] - The network type. Defaults to "mainnet" if not specified.
     * @returns {Promise<PoolNFTInfo>} Returns a Promise that resolves to a PoolNFTInfo object containing the Pool NFT information.
     * @throws {Error} Throws an error if the request to fetch Pool NFT information fails.
     */
    API.fetchPoolNftInfo = function (contractTxid, network) {
        return __awaiter(this, void 0, void 0, function () {
            var base_url, url, response, data, poolNftInfo, error_10;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        base_url = network
                            ? API.getBaseURL(network)
                            : API.getBaseURL("mainnet");
                        url = base_url + "ft/pool/nft/info/contract/id/".concat(contractTxid);
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
                            service_fee_rate: data.pool_service_fee_rate,
                            service_provider: data.pool_service_provider,
                            poolnft_code: data.pool_nft_code_script,
                            pool_version: data.pool_version,
                            currentContractTxid: data.current_pool_nft_txid,
                            currentContractVout: data.current_pool_nft_vout,
                            currentContractSatoshi: data.current_pool_nft_balance,
                        };
                        return [2 /*return*/, poolNftInfo];
                    case 4:
                        error_10 = _a.sent();
                        throw new Error("Failed to fetch PoolNFTInfo.");
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Fetches the Pool NFT UTXO for a given contract transaction ID.
     *
     * @param {string} contractTxid - The contract transaction ID.
     * @param {("testnet" | "mainnet")} [network] - The network type. Defaults to "mainnet" if not specified.
     * @returns {Promise<tbc.Transaction.IUnspentOutput>} Returns a Promise that resolves to a Pool NFT UTXO.
     * @throws {Error} Throws an error if the request to fetch Pool NFT UTXO fails.
     */
    API.fetchPoolNftUTXO = function (contractTxid, network) {
        return __awaiter(this, void 0, void 0, function () {
            var poolNftInfo, poolnft, error_11;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, API.fetchPoolNftInfo(contractTxid, network)];
                    case 1:
                        poolNftInfo = _a.sent();
                        poolnft = {
                            txId: poolNftInfo.currentContractTxid,
                            outputIndex: poolNftInfo.currentContractVout,
                            script: poolNftInfo.poolnft_code,
                            satoshis: poolNftInfo.currentContractSatoshi,
                        };
                        return [2 /*return*/, poolnft];
                    case 2:
                        error_11 = _a.sent();
                        throw new Error("Failed to fetch PoolNFT UTXO.");
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Fetches the FT LP balance for a given FT LP code.
     *
     * @param {string} ftlpCode - The FT LP code.
     * @param {("testnet" | "mainnet")} [network] - The network type. Defaults to "mainnet" if not specified.
     * @returns {Promise<bigint>} Returns a Promise that resolves to the FT LP balance.
     * @throws {Error} Throws an error if the request to fetch FT LP balance fails.
     */
    API.fetchFtlpBalance = function (ftlpCode, network) {
        return __awaiter(this, void 0, void 0, function () {
            var ftlpHash, base_url, url, response, ftlpBalance, i, error_12;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        ftlpHash = tbc.crypto.Hash.sha256(Buffer.from(ftlpCode, "hex"))
                            .reverse()
                            .toString("hex");
                        base_url = network
                            ? API.getBaseURL(network)
                            : API.getBaseURL("mainnet");
                        url = base_url + "ft/lp/unspent/by/script/hash".concat(ftlpHash);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, fetch(url)];
                    case 2: return [4 /*yield*/, (_a.sent()).json()];
                    case 3:
                        response = _a.sent();
                        ftlpBalance = BigInt(0);
                        for (i = 0; i < response.ftUtxoList.length; i++) {
                            ftlpBalance += BigInt(response.ftUtxoList[i].ftBalance);
                        }
                        return [2 /*return*/, ftlpBalance];
                    case 4:
                        error_12 = _a.sent();
                        throw new Error(error_12.message);
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Fetches an FT LP UTXO that satisfies the required amount for a given FT LP code.
     *
     * @param {string} ftlpCode - The FT LP code.
     * @param {bigint} amount - The required amount.
     * @param {("testnet" | "mainnet")} [network] - The network type. Defaults to "mainnet" if not specified.
     * @returns {Promise<tbc.Transaction.IUnspentOutput>} Returns a Promise that resolves to an FT LP UTXO.
     * @throws {Error} Throws an error if the request to fetch FT LP UTXO fails or if no suitable UTXO is found.
     */
    API.fetchFtlpUTXO = function (ftlpCode, amount, network) {
        return __awaiter(this, void 0, void 0, function () {
            var ftlpHash, base_url, url, response, data, i, ftlpBalance, i, ftlp, error_13;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        ftlpHash = tbc.crypto.Hash.sha256(Buffer.from(ftlpCode, "hex"))
                            .reverse()
                            .toString("hex");
                        base_url = network
                            ? API.getBaseURL(network)
                            : API.getBaseURL("mainnet");
                        url = base_url + "ft/lp/unspent/by/script/hash".concat(ftlpHash);
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
                                throw new Error("Insufficient FT-LP amount");
                            }
                            else {
                                throw new Error("Please merge FT-LP UTXOs");
                            }
                        }
                        ftlp = {
                            txId: data.utxoId,
                            outputIndex: data.utxoVout,
                            script: ftlpCode,
                            satoshis: data.utxoBalance,
                            ftBalance: data.ftBalance,
                        };
                        return [2 /*return*/, ftlp];
                    case 4:
                        error_13 = _a.sent();
                        throw new Error(error_13.message);
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Fetches the raw transaction data for a given transaction ID.
     *
     * @param {string} txid - The transaction ID to fetch.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<tbc.Transaction>} Returns a Promise that resolves to the transaction object.
     * @throws {Error} Throws an error if the request fails.
     */
    API.fetchTXraw = function (txid, network) {
        return __awaiter(this, void 0, void 0, function () {
            var base_url, url, response, rawtx, tx, error_14;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        base_url = network
                            ? API.getBaseURL(network)
                            : API.getBaseURL("mainnet");
                        url = base_url + "tx/hex/".concat(txid);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, fetch(url)];
                    case 2:
                        response = _a.sent();
                        if (!response.ok) {
                            throw new Error("Failed to fetch TXraw: ".concat(response.statusText));
                        }
                        return [4 /*yield*/, response.json()];
                    case 3:
                        rawtx = _a.sent();
                        tx = new tbc.Transaction();
                        tx.fromString(rawtx);
                        return [2 /*return*/, tx];
                    case 4:
                        error_14 = _a.sent();
                        throw new Error(error_14.message);
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Broadcasts the raw transaction to the network.
     *
     * @param {string} txraw - The raw transaction hex.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<string>} Returns a Promise that resolves to the response from the broadcast API.
     * @throws {Error} Throws an error if the request fails.
     */
    API.broadcastTXraw = function (txraw, network) {
        return __awaiter(this, void 0, void 0, function () {
            var base_url, url, response, data, error_15;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        base_url = network
                            ? API.getBaseURL(network)
                            : API.getBaseURL("mainnet");
                        url = base_url + "broadcast/tx/raw";
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, fetch(url, {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                    txHex: txraw,
                                }),
                            })];
                    case 2:
                        response = _a.sent();
                        if (!response.ok) {
                            throw new Error("Failed to broadcast TXraw: ".concat(response.statusText));
                        }
                        return [4 /*yield*/, response.json()];
                    case 3:
                        data = _a.sent();
                        console.log("txid:", data.result);
                        if (data.error && data.error.message) {
                            throw new Error(data.error.message);
                        }
                        return [2 /*return*/, data.result];
                    case 4:
                        error_15 = _a.sent();
                        throw new Error(error_15.message);
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Broadcast multiple raw transactions in batch.
     *
     * @param {Array<{ txHex: string }>} txrawList - An array containing multiple transactions in the format [{ txHex: "string" }].
     * @param {("testnet" | "mainnet")} [network] - The network type, either "testnet" or "mainnet".
     * @returns {Promise<string[]>} Returns a Promise that resolves to a list of successfully broadcasted transaction IDs.
     * @throws {Error} Throws an error if the broadcast fails.
     */
    API.broadcastTXsraw = function (txrawList, network) {
        return __awaiter(this, void 0, void 0, function () {
            var base_url, url, response, data, error_16;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        base_url = network
                            ? API.getBaseURL(network)
                            : API.getBaseURL("mainnet");
                        url = base_url + "broadcast/txs/raw";
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, fetch(url, {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify(txrawList),
                            })];
                    case 2:
                        response = _a.sent();
                        if (!response.ok) {
                            throw new Error("Failed to broadcast transactions: ".concat(response.statusText));
                        }
                        return [4 /*yield*/, response.json()];
                    case 3:
                        data = _a.sent();
                        if (!data.result.invalid) {
                            console.log("Broadcast success!");
                        }
                        else {
                            throw new Error("Broadcast failed!\n ".concat(JSON.stringify(data.result.invalid)));
                        }
                        // console.log("txid:", data.result);
                        if (data.error && data.error.message) {
                            throw new Error(data.error.message);
                        }
                        return [2 /*return*/, data.result];
                    case 4:
                        error_16 = _a.sent();
                        throw new Error(error_16.message);
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Fetches the UTXOs for a given address.
     *
     * @param {string} address - The address to fetch UTXOs for.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of UTXOs.
     * @throws {Error} Throws an error if the request fails.
     */
    API.fetchUTXOs = function (address, network) {
        return __awaiter(this, void 0, void 0, function () {
            var base_url, url, response, data, scriptPubKey_1, error_17;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        base_url = network
                            ? API.getBaseURL(network)
                            : API.getBaseURL("mainnet");
                        url = base_url + "address/".concat(address, "/unspent/");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, fetch(url)];
                    case 2:
                        response = _a.sent();
                        if (!response.ok) {
                            throw new Error("Failed to fetch UTXO: ".concat(response.statusText));
                        }
                        return [4 /*yield*/, response.json()];
                    case 3:
                        data = _a.sent();
                        if (data.length === 0) {
                            throw new Error("The balance in the account is zero.");
                        }
                        scriptPubKey_1 = tbc.Script.buildPublicKeyHashOut(address)
                            .toBuffer()
                            .toString("hex");
                        return [2 /*return*/, data.map(function (utxo) { return ({
                                txId: utxo.tx_hash,
                                outputIndex: utxo.tx_pos,
                                script: scriptPubKey_1,
                                satoshis: utxo.value,
                            }); })];
                    case 4:
                        error_17 = _a.sent();
                        throw new Error(error_17.message);
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get UTXOs for a given address and amount.
     *
     * @param {string} address - The address to fetch UTXOs for.
     * @param {number} amount_tbc - The required amount in TBC.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of selected UTXOs.
     * @throws {Error} Throws an error if the balance is insufficient.
     */
    API.getUTXOs = function (address, amount_tbc, network) {
        return __awaiter(this, void 0, void 0, function () {
            var utxos, amount_satoshis_1, closestUTXO, totalAmount, selectedUTXOs, _i, utxos_1, utxo, error_18;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 5, , 6]);
                        utxos = [];
                        if (!network) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.fetchUTXOs(address, network)];
                    case 1:
                        utxos = _a.sent();
                        return [3 /*break*/, 4];
                    case 2: return [4 /*yield*/, this.fetchUTXOs(address)];
                    case 3:
                        utxos = _a.sent();
                        _a.label = 4;
                    case 4:
                        utxos.sort(function (a, b) { return a.satoshis - b.satoshis; });
                        amount_satoshis_1 = amount_tbc * Math.pow(10, 6);
                        closestUTXO = utxos.find(function (utxo) { return utxo.satoshis >= amount_satoshis_1 + 100000; });
                        if (closestUTXO) {
                            return [2 /*return*/, [closestUTXO]];
                        }
                        totalAmount = 0;
                        selectedUTXOs = [];
                        for (_i = 0, utxos_1 = utxos; _i < utxos_1.length; _i++) {
                            utxo = utxos_1[_i];
                            totalAmount += utxo.satoshis;
                            selectedUTXOs.push(utxo);
                            if (totalAmount >= amount_satoshis_1) {
                                break;
                            }
                        }
                        if (totalAmount < amount_satoshis_1) {
                            throw new Error("Insufficient tbc balance");
                        }
                        return [2 /*return*/, selectedUTXOs];
                    case 5:
                        error_18 = _a.sent();
                        throw new Error(error_18.message);
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
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
    API.fetchNFTTXO = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var script, tx_hash, network, base_url, script_hash, url, response, data, filteredUTXOs, min_vout_utxo, error_19;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        script = params.script, tx_hash = params.tx_hash, network = params.network;
                        base_url = network
                            ? API.getBaseURL(network)
                            : API.getBaseURL("mainnet");
                        script_hash = Buffer.from(tbc.crypto.Hash.sha256(Buffer.from(script, "hex")).toString("hex"), "hex")
                            .reverse()
                            .toString("hex");
                        url = base_url + "script/hash/".concat(script_hash, "/unspent");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, fetch(url)];
                    case 2:
                        response = _a.sent();
                        if (!response.ok) {
                            throw new Error("Failed to fetch UTXO: ".concat(response.statusText));
                        }
                        return [4 /*yield*/, response.json()];
                    case 3:
                        data = _a.sent();
                        if (tx_hash) {
                            filteredUTXOs = data.filter(function (item) { return item.tx_hash === tx_hash; });
                            if (filteredUTXOs.length === 0) {
                                throw new Error("No matching UTXO found.");
                            }
                            min_vout_utxo = filteredUTXOs.reduce(function (prev, current) {
                                return prev.tx_pos < current.tx_pos ? prev : current;
                            });
                            return [2 /*return*/, {
                                    txId: min_vout_utxo.tx_hash,
                                    outputIndex: min_vout_utxo.tx_pos,
                                    script: script,
                                    satoshis: min_vout_utxo.value,
                                }];
                        }
                        else {
                            return [2 /*return*/, {
                                    txId: data[0].tx_hash,
                                    outputIndex: data[0].tx_pos,
                                    script: script,
                                    satoshis: data[0].value,
                                }];
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        error_19 = _a.sent();
                        throw new Error(error_19.message);
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Fetches the NFT information for a given contract ID.
     *
     * @param {string} contract_id - The contract ID to fetch NFT information for.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<NFTInfo>} Returns a Promise that resolves to an NFTInfo object containing the NFT information.
     * @throws {Error} Throws an error if the request to fetch NFT information fails.
     */
    API.fetchNFTInfo = function (contract_id, network) {
        return __awaiter(this, void 0, void 0, function () {
            var base_url, url, response, data, nftInfo, error_20;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        base_url = network
                            ? API.getBaseURL(network)
                            : API.getBaseURL("mainnet");
                        url = base_url + "nft/infos/contract_ids";
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, fetch(url, {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                    if_icon_needed: true,
                                    nft_contract_list: [contract_id],
                                }),
                            })];
                    case 2:
                        response = _a.sent();
                        if (!response.ok) {
                            if (!response.ok) {
                                throw new Error("Failed to fetch NFTInfo: ".concat(response.statusText));
                            }
                        }
                        return [4 /*yield*/, response.json()];
                    case 3:
                        data = _a.sent();
                        nftInfo = {
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
                            nftIcon: data.nftInfoList[0].nftIcon,
                        };
                        return [2 /*return*/, nftInfo];
                    case 4:
                        error_20 = _a.sent();
                        throw new Error(error_20.message);
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Fetches the UMTXO for a given script.
     *
     * @param {string} script_asm - The script to fetch the UMTXO for.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<tbc.Transaction.IUnspentOutput>} Returns a Promise that resolves to the UMTXO.
     * @throws {Error} Throws an error if the request fails.
     */
    API.fetchUMTXO = function (script_asm, tbc_amount, network) {
        return __awaiter(this, void 0, void 0, function () {
            var multiScript, amount_satoshis, script_hash, base_url, url, response, data, selectedUTXO, i, balance, i, umtxo, error_21;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        multiScript = tbc.Script.fromASM(script_asm).toHex();
                        amount_satoshis = Math.floor(tbc_amount * Math.pow(10, 6));
                        script_hash = Buffer.from(tbc.crypto.Hash.sha256(Buffer.from(multiScript, "hex")).toString("hex"), "hex")
                            .reverse()
                            .toString("hex");
                        base_url = network
                            ? API.getBaseURL(network)
                            : API.getBaseURL("mainnet");
                        url = base_url + "script/hash/".concat(script_hash, "/unspent/");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, fetch(url)];
                    case 2:
                        response = _a.sent();
                        if (!response.ok) {
                            throw new Error("Failed to fetch UTXO: ".concat(response.statusText));
                        }
                        return [4 /*yield*/, response.json()];
                    case 3:
                        data = _a.sent();
                        if (data.length === 0) {
                            throw new Error("The balance in the account is zero.");
                        }
                        selectedUTXO = data[0];
                        for (i = 0; i < data.length; i++) {
                            if (data[i].value > amount_satoshis && data[i].value < 3200000000) {
                                selectedUTXO = data[i];
                                break;
                            }
                        }
                        if (selectedUTXO.value < amount_satoshis) {
                            balance = 0;
                            for (i = 0; i < data.length; i++) {
                                balance += data[i].value;
                            }
                            if (balance < amount_satoshis) {
                                throw new Error("Insufficient tbc balance");
                            }
                            else {
                                throw new Error("Please mergeUTXO");
                            }
                        }
                        umtxo = {
                            txId: selectedUTXO.tx_hash,
                            outputIndex: selectedUTXO.tx_pos,
                            script: multiScript,
                            satoshis: selectedUTXO.value,
                        };
                        return [2 /*return*/, umtxo];
                    case 4:
                        error_21 = _a.sent();
                        throw new Error(error_21.message);
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Fetches all UMTXOs for a given script.
     *
     * @param {string} script_asm - The script to fetch UMTXOs for.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of UMTXOs.
     * @throws {Error} Throws an error if the request fails.
     */
    API.fetchUMTXOs = function (script_asm, network) {
        return __awaiter(this, void 0, void 0, function () {
            var multiScript, script_hash, base_url, url, response, data, umtxos, error_22;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        multiScript = tbc.Script.fromASM(script_asm).toHex();
                        script_hash = Buffer.from(tbc.crypto.Hash.sha256(Buffer.from(multiScript, "hex")).toString("hex"), "hex")
                            .reverse()
                            .toString("hex");
                        base_url = network
                            ? API.getBaseURL(network)
                            : API.getBaseURL("mainnet");
                        url = base_url + "script/hash/".concat(script_hash, "/unspent/");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, fetch(url)];
                    case 2:
                        response = _a.sent();
                        if (!response.ok) {
                            throw new Error("Failed to fetch UTXO: ".concat(response.statusText));
                        }
                        return [4 /*yield*/, response.json()];
                    case 3:
                        data = _a.sent();
                        if (data.length === 0) {
                            throw new Error("The balance in the account is zero.");
                        }
                        umtxos = data.map(function (utxo) {
                            return {
                                txId: utxo.tx_hash,
                                outputIndex: utxo.tx_pos,
                                script: multiScript,
                                satoshis: utxo.value,
                            };
                        });
                        return [2 /*return*/, umtxos];
                    case 4:
                        error_22 = _a.sent();
                        throw new Error(error_22.message);
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get UMTXOs for a given address and amount.
     *
     * @param {string} address - The address to fetch UMTXOs for.
     * @param {number} amount_tbc - The required amount in TBC.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of selected UMTXOs.
     * @throws {Error} Throws an error if the balance is insufficient.
     */
    API.getUMTXOs = function (script_asm, amount_tbc, network) {
        return __awaiter(this, void 0, void 0, function () {
            var umtxos, amount_satoshis_2, closestUMTXO, totalSatoshis, selectedUMTXOs, _i, umtxos_1, umtxo, error_23;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 5, , 6]);
                        umtxos = [];
                        if (!network) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.fetchUMTXOs(script_asm, network)];
                    case 1:
                        umtxos = _a.sent();
                        return [3 /*break*/, 4];
                    case 2: return [4 /*yield*/, this.fetchUMTXOs(script_asm)];
                    case 3:
                        umtxos = _a.sent();
                        _a.label = 4;
                    case 4:
                        umtxos.sort(function (a, b) { return a.satoshis - b.satoshis; });
                        amount_satoshis_2 = amount_tbc * Math.pow(10, 6);
                        closestUMTXO = umtxos.find(function (umtxo) { return umtxo.satoshis >= amount_satoshis_2 + 100000; });
                        if (closestUMTXO) {
                            return [2 /*return*/, [closestUMTXO]];
                        }
                        totalSatoshis = 0;
                        selectedUMTXOs = [];
                        for (_i = 0, umtxos_1 = umtxos; _i < umtxos_1.length; _i++) {
                            umtxo = umtxos_1[_i];
                            totalSatoshis += umtxo.satoshis;
                            selectedUMTXOs.push(umtxo);
                            if (totalSatoshis >= amount_satoshis_2) {
                                break;
                            }
                        }
                        if (totalSatoshis < amount_satoshis_2) {
                            throw new Error("Insufficient tbc balance");
                        }
                        return [2 /*return*/, selectedUMTXOs];
                    case 5:
                        error_23 = _a.sent();
                        throw new Error(error_23.message);
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Fetches the FT UTXOs for a given contract and multiSig address.
     *
     * @param {string} contractTxid - The contract TXID.
     * @param {string} addressOrHash - The address or hash to fetch UMTXOs for.
     * @param {string} codeScript - The code script.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of UMTXOs.
     * @throws {Error} Throws an error if the request fails.
     */
    API.fetchFtUTXOS_multiSig = function (contractTxid, addressOrHash, codeScript, network) {
        return __awaiter(this, void 0, void 0, function () {
            var base_url, hash, publicKeyHash, url, response, responseData, sortedData, ftutxos, i, error_24;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        base_url = network
                            ? API.getBaseURL(network)
                            : API.getBaseURL("mainnet");
                        hash = "";
                        if (tbc.Address.isValid(addressOrHash)) {
                            publicKeyHash = tbc.Address.fromString(addressOrHash).hashBuffer.toString("hex");
                            hash = publicKeyHash + "00";
                        }
                        else {
                            if (addressOrHash.length !== 40) {
                                throw new Error("Invalid address or hash");
                            }
                            hash = addressOrHash + "01";
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        url = base_url + "ft/utxo/combine/script/".concat(hash, "/contract/").concat(contractTxid);
                        return [4 /*yield*/, fetch(url, {
                                method: "GET",
                                headers: {
                                    "Content-Type": "application/json",
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
                        if (responseData.ftUtxoList.length === 0) {
                            throw new Error("The ft balance in the account is zero.");
                        }
                        sortedData = responseData.ftUtxoList.sort(function (a, b) {
                            if (a.ftBalance < b.ftBalance)
                                return -1;
                            if (a.ftBalance > b.ftBalance)
                                return 1;
                            return 0;
                        });
                        ftutxos = [];
                        for (i = 0; i < sortedData.length; i++) {
                            ftutxos.push({
                                txId: sortedData[i].utxoId,
                                outputIndex: sortedData[i].utxoVout,
                                script: codeScript,
                                satoshis: sortedData[i].utxoBalance,
                                ftBalance: sortedData[i].ftBalance,
                            });
                        }
                        return [2 /*return*/, ftutxos];
                    case 4:
                        error_24 = _a.sent();
                        throw new Error(error_24.message);
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Fetches the FT UTXOs for a given contract and multiSig address.
     *
     * @param {string} contractTxid - The contract TXID.
     * @param {string} addressOrHash - The address or hash to fetch UMTXOs for.
     * @param {string} codeScript - The code script.
     * @param {bigint} amount - The amount to fetch UMTXOs for.
     * @param {("testnet" | "mainnet")} [network] - The network type.
     * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of UMTXOs.
     * @throws {Error} Throws an error if the request fails.
     */
    API.getFtUTXOS_multiSig = function (contractTxid, addressOrHash, codeScript, amount, network) {
        return __awaiter(this, void 0, void 0, function () {
            var base_url, hash, publicKeyHash, url, response, responseData, sortedData, ftutxos, i, ftBalanceArray, result, result_three, ftBalanceArray_three, result_two, result_four, ftBalanceArray_four, result_three, ftBalanceArray_three, result_two, result_five, ftBalanceArray_five, result_four, ftBalanceArray_four, result_three, ftBalanceArray_three, result_two, error_25;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        base_url = network
                            ? API.getBaseURL(network)
                            : API.getBaseURL("mainnet");
                        hash = "";
                        if (tbc.Address.isValid(addressOrHash)) {
                            publicKeyHash = tbc.Address.fromString(addressOrHash).hashBuffer.toString("hex");
                            hash = publicKeyHash + "00";
                        }
                        else {
                            if (addressOrHash.length !== 40) {
                                throw new Error("Invalid address or hash");
                            }
                            hash = addressOrHash + "01";
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        url = base_url + "ft/utxo/combine/script/".concat(hash, "/contract/").concat(contractTxid);
                        return [4 /*yield*/, fetch(url, {
                                method: "GET",
                                headers: {
                                    "Content-Type": "application/json",
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
                        if (responseData.ftUtxoList.length === 0) {
                            throw new Error("The ft balance in the account is zero.");
                        }
                        sortedData = responseData.ftUtxoList.sort(function (a, b) {
                            if (a.ftBalance < b.ftBalance)
                                return -1;
                            if (a.ftBalance > b.ftBalance)
                                return 1;
                            return 0;
                        });
                        ftutxos = [];
                        for (i = 0; i < sortedData.length; i++) {
                            ftutxos.push({
                                txId: sortedData[i].utxoId,
                                outputIndex: sortedData[i].utxoVout,
                                script: codeScript,
                                satoshis: sortedData[i].utxoBalance,
                                ftBalance: sortedData[i].ftBalance,
                            });
                        }
                        ftBalanceArray = ftutxos.map(function (item) {
                            return BigInt(item.ftBalance);
                        });
                        switch (ftBalanceArray.length) {
                            case 1:
                                if (ftBalanceArray[0] >= amount) {
                                    return [2 /*return*/, [ftutxos[0]]];
                                }
                                else {
                                    throw new Error("Insufficient FT balance");
                                }
                            case 2:
                                if (ftBalanceArray[0] + ftBalanceArray[1] < amount) {
                                    throw new Error("Insufficient FT balance");
                                }
                                else if (ftBalanceArray[0] >= amount) {
                                    return [2 /*return*/, [ftutxos[0]]];
                                }
                                else if (ftBalanceArray[1] >= amount) {
                                    return [2 /*return*/, [ftutxos[1]]];
                                }
                                else {
                                    return [2 /*return*/, [ftutxos[0], ftutxos[1]]];
                                }
                            case 3:
                                if (ftBalanceArray[0] + ftBalanceArray[1] + ftBalanceArray[2] <
                                    amount) {
                                    throw new Error("Insufficient FT balance");
                                }
                                else if ((0, utxoSelect_1.findMinTwoSum)(ftBalanceArray, amount)) {
                                    result = (0, utxoSelect_1.findMinTwoSum)(ftBalanceArray, amount);
                                    if (ftBalanceArray[result[0]] >= amount) {
                                        return [2 /*return*/, [ftutxos[result[0]]]];
                                    }
                                    else if (ftBalanceArray[result[1]] >= amount) {
                                        return [2 /*return*/, [ftutxos[result[1]]]];
                                    }
                                    else {
                                        return [2 /*return*/, [ftutxos[result[0]], ftutxos[result[1]]]];
                                    }
                                }
                                else {
                                    return [2 /*return*/, [ftutxos[0], ftutxos[1], ftutxos[2]]];
                                }
                            case 4:
                                if (ftBalanceArray[0] +
                                    ftBalanceArray[1] +
                                    ftBalanceArray[2] +
                                    ftBalanceArray[3] <
                                    amount) {
                                    throw new Error("Insufficient FT balance");
                                }
                                else if ((0, utxoSelect_1.findMinThreeSum)(ftBalanceArray, amount)) {
                                    result_three = (0, utxoSelect_1.findMinThreeSum)(ftBalanceArray, amount);
                                    ftBalanceArray_three = (0, utxoSelect_1.initialUtxoArray)(ftBalanceArray, result_three);
                                    if ((0, utxoSelect_1.findMinTwoSum)(ftBalanceArray_three, amount)) {
                                        result_two = (0, utxoSelect_1.findMinTwoSum)(ftBalanceArray_three, amount);
                                        if (ftBalanceArray[result_two[0]] >= amount) {
                                            return [2 /*return*/, [ftutxos[result_two[0]]]];
                                        }
                                        else if (ftBalanceArray[result_two[1]] >= amount) {
                                            return [2 /*return*/, [ftutxos[result_two[1]]]];
                                        }
                                        else {
                                            return [2 /*return*/, [ftutxos[result_two[0]], ftutxos[result_two[1]]]];
                                        }
                                    }
                                    else {
                                        return [2 /*return*/, [
                                                ftutxos[result_three[0]],
                                                ftutxos[result_three[1]],
                                                ftutxos[result_three[2]],
                                            ]];
                                    }
                                }
                                else {
                                    return [2 /*return*/, [ftutxos[0], ftutxos[1], ftutxos[2], ftutxos[3]]];
                                }
                            case 5:
                                if (ftBalanceArray[0] +
                                    ftBalanceArray[1] +
                                    ftBalanceArray[2] +
                                    ftBalanceArray[3] +
                                    ftBalanceArray[4] <
                                    amount) {
                                    throw new Error("Insufficient FT balance");
                                }
                                else if ((0, utxoSelect_1.findMinFourSum)(ftBalanceArray, amount)) {
                                    result_four = (0, utxoSelect_1.findMinFourSum)(ftBalanceArray, amount);
                                    ftBalanceArray_four = (0, utxoSelect_1.initialUtxoArray)(ftBalanceArray, result_four);
                                    if ((0, utxoSelect_1.findMinThreeSum)(ftBalanceArray_four, amount)) {
                                        result_three = (0, utxoSelect_1.findMinThreeSum)(ftBalanceArray_four, amount);
                                        ftBalanceArray_three = (0, utxoSelect_1.initialUtxoArray)(ftBalanceArray, result_three);
                                        if ((0, utxoSelect_1.findMinTwoSum)(ftBalanceArray_three, amount)) {
                                            result_two = (0, utxoSelect_1.findMinTwoSum)(ftBalanceArray_three, amount);
                                            if (ftBalanceArray[result_two[0]] >= amount) {
                                                return [2 /*return*/, [ftutxos[result_two[0]]]];
                                            }
                                            else if (ftBalanceArray[result_two[1]] >= amount) {
                                                return [2 /*return*/, [ftutxos[result_two[1]]]];
                                            }
                                            else {
                                                return [2 /*return*/, [ftutxos[result_two[0]], ftutxos[result_two[1]]]];
                                            }
                                        }
                                        else {
                                            return [2 /*return*/, [
                                                    ftutxos[result_three[0]],
                                                    ftutxos[result_three[1]],
                                                    ftutxos[result_three[2]],
                                                ]];
                                        }
                                    }
                                    else {
                                        return [2 /*return*/, [
                                                ftutxos[result_four[0]],
                                                ftutxos[result_four[1]],
                                                ftutxos[result_four[2]],
                                                ftutxos[result_four[3]],
                                            ]];
                                    }
                                }
                                else {
                                    return [2 /*return*/, [ftutxos[0], ftutxos[1], ftutxos[2], ftutxos[3], ftutxos[4]]];
                                }
                            default:
                                if ((0, utxoSelect_1.findMinFiveSum)(ftBalanceArray, amount)) {
                                    result_five = (0, utxoSelect_1.findMinFiveSum)(ftBalanceArray, amount);
                                    ftBalanceArray_five = (0, utxoSelect_1.initialUtxoArray)(ftBalanceArray, result_five);
                                    if ((0, utxoSelect_1.findMinFourSum)(ftBalanceArray_five, amount)) {
                                        result_four = (0, utxoSelect_1.findMinFourSum)(ftBalanceArray_five, amount);
                                        ftBalanceArray_four = (0, utxoSelect_1.initialUtxoArray)(ftBalanceArray, result_four);
                                        if ((0, utxoSelect_1.findMinThreeSum)(ftBalanceArray_four, amount)) {
                                            result_three = (0, utxoSelect_1.findMinThreeSum)(ftBalanceArray_four, amount);
                                            ftBalanceArray_three = (0, utxoSelect_1.initialUtxoArray)(ftBalanceArray, result_three);
                                            if ((0, utxoSelect_1.findMinTwoSum)(ftBalanceArray_three, amount)) {
                                                result_two = (0, utxoSelect_1.findMinTwoSum)(ftBalanceArray_three, amount);
                                                if (ftBalanceArray[result_two[0]] >= amount) {
                                                    return [2 /*return*/, [ftutxos[result_two[0]]]];
                                                }
                                                else if (ftBalanceArray[result_two[1]] >= amount) {
                                                    return [2 /*return*/, [ftutxos[result_two[1]]]];
                                                }
                                                else {
                                                    return [2 /*return*/, [ftutxos[result_two[0]], ftutxos[result_two[1]]]];
                                                }
                                            }
                                            else {
                                                return [2 /*return*/, [
                                                        ftutxos[result_three[0]],
                                                        ftutxos[result_three[1]],
                                                        ftutxos[result_three[2]],
                                                    ]];
                                            }
                                        }
                                        else {
                                            return [2 /*return*/, [
                                                    ftutxos[result_four[0]],
                                                    ftutxos[result_four[1]],
                                                    ftutxos[result_four[2]],
                                                    ftutxos[result_four[3]],
                                                ]];
                                        }
                                    }
                                    else {
                                        return [2 /*return*/, [
                                                ftutxos[result_five[0]],
                                                ftutxos[result_five[1]],
                                                ftutxos[result_five[2]],
                                                ftutxos[result_five[3]],
                                                ftutxos[result_five[4]],
                                            ]];
                                    }
                                }
                                else {
                                    throw new Error("Insufficient FT balance");
                                }
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        error_25 = _a.sent();
                        throw new Error(error_25.message);
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    API.mainnetURL = 'https://turingwallet.xyz/v1/tbc/main/';
    API.testnetURL = 'https://tbcdev.org/v1/tbc/main/';
    return API;
}());
module.exports = API;
