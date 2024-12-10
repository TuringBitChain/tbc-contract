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
var API = /** @class */ (function () {
    function API() {
    }
    /**sda
     * Get the FT balance for a specified contract transaction ID and address or hash.
     *
     * @param {string} contractTxid - The contract transaction ID.
     * @param {string} addressOrHash - The address or hash.
     * @returns {Promise<bigint>} Returns a Promise that resolves to the FT balance.
     * @throws {Error} Throws an error if the address or hash is invalid, or if the request fails.
     */
    API.getBaseURL = function (network) {
        var url_testnet = "http://tbcdev.org:5000/v1/tbc/main/";
        var url_mainnet = "https://turingwallet.xyz/v1/tbc/main/";
        var base_url = network == "testnet" ? url_testnet : url_mainnet;
        return base_url;
    };
    API.getFTbalance = function (contractTxid, addressOrHash, network) {
        return __awaiter(this, void 0, void 0, function () {
            var base_url, hash, publicKeyHash, url, response, ftBalance, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        base_url = "";
                        if (network) {
                            base_url = API.getBaseURL(network);
                        }
                        else {
                            base_url = API.getBaseURL("mainnet");
                        }
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
                        error_1 = _a.sent();
                        throw new Error("Failed to get ftBalance.");
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    API.fetchUTXO = function (privateKey, amount, network) {
        return __awaiter(this, void 0, void 0, function () {
            var base_url, address, url, scriptPubKey, amount_bn, response, utxo_1, data, i, utxo, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        base_url = "";
                        if (network) {
                            base_url = API.getBaseURL(network);
                        }
                        else {
                            base_url = API.getBaseURL("mainnet");
                        }
                        address = privateKey.toAddress().toString();
                        url = base_url + "address/".concat(address, "/unspent/");
                        scriptPubKey = tbc.Script.buildPublicKeyHashOut(address).toBuffer().toString('hex');
                        amount_bn = amount * Math.pow(10, 6);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 9, , 10]);
                        return [4 /*yield*/, fetch(url)];
                    case 2: return [4 /*yield*/, (_a.sent()).json()];
                    case 3:
                        response = _a.sent();
                        if (response.length === 1 && response[0].value > amount_bn) {
                            utxo_1 = {
                                txId: response[0].tx_hash,
                                outputIndex: response[0].tx_pos,
                                script: scriptPubKey,
                                satoshis: response[0].value
                            };
                            return [2 /*return*/, utxo_1];
                        }
                        else if (response.length === 1 && response[0].value <= amount_bn) {
                            throw new Error('Insufficient balance');
                        }
                        data = response[0];
                        // Select a UTXO with value greater than 5000
                        for (i = 0; i < response.length; i++) {
                            if (response[i].value > amount_bn) {
                                data = response[i];
                                break;
                            }
                        }
                        if (!(data.value < amount_bn)) return [3 /*break*/, 8];
                        console.log('Please merge UTXO!');
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 3000); })];
                    case 4:
                        _a.sent();
                        return [4 /*yield*/, API.mergeUTXO(privateKey, network)];
                    case 5:
                        _a.sent();
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 5000); })];
                    case 6:
                        _a.sent();
                        return [4 /*yield*/, API.fetchUTXO(privateKey, amount, network)];
                    case 7: return [2 /*return*/, _a.sent()];
                    case 8:
                        utxo = {
                            txId: data.tx_hash,
                            outputIndex: data.tx_pos,
                            script: scriptPubKey,
                            satoshis: data.value
                        };
                        return [2 /*return*/, utxo];
                    case 9:
                        error_2 = _a.sent();
                        throw new Error("Failed to fetch UTXO.");
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    API.mergeUTXO = function (privateKey, network) {
        return __awaiter(this, void 0, void 0, function () {
            var base_url, address, url, scriptPubKey, response, sumAmount, utxo, i, tx, txraw, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        base_url = "";
                        if (network) {
                            base_url = API.getBaseURL(network);
                        }
                        else {
                            base_url = API.getBaseURL("mainnet");
                        }
                        address = tbc.Address.fromPrivateKey(privateKey).toString();
                        url = base_url + "address/".concat(address, "/unspent/");
                        scriptPubKey = tbc.Script.buildPublicKeyHashOut(address).toBuffer().toString('hex');
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
                            throw new Error('No UTXO available');
                        }
                        if (response.length === 1) {
                            console.log('Merge Success!');
                            return [2 /*return*/, true];
                        }
                        else {
                            for (i = 0; i < response.length; i++) {
                                sumAmount += response[i].value;
                                utxo.push({
                                    txId: response[i].tx_hash,
                                    outputIndex: response[i].tx_pos,
                                    script: scriptPubKey,
                                    satoshis: response[i].value
                                });
                            }
                        }
                        tx = new tbc.Transaction()
                            .from(utxo)
                            .to(address, sumAmount - 500)
                            .fee(500)
                            .change(address)
                            .sign(privateKey)
                            .seal();
                        txraw = tx.uncheckedSerialize();
                        return [4 /*yield*/, API.broadcastTXraw(txraw, network)];
                    case 4:
                        _a.sent();
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 3000); })];
                    case 5:
                        _a.sent();
                        return [4 /*yield*/, API.mergeUTXO(privateKey, network)];
                    case 6:
                        _a.sent();
                        return [2 /*return*/, true];
                    case 7:
                        error_3 = _a.sent();
                        throw new Error("Failed to merge UTXO.");
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Fetches the raw transaction data for a given transaction ID.
     * @param txid - The transaction ID to fetch.
     * @returns The transaction object.
     */
    API.fetchTXraw = function (txid, network) {
        return __awaiter(this, void 0, void 0, function () {
            var base_url, url, response, rawtx, tx, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        base_url = "";
                        if (network) {
                            base_url = API.getBaseURL(network);
                        }
                        else {
                            base_url = API.getBaseURL("mainnet");
                        }
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
                        error_4 = _a.sent();
                        throw new Error("Failed to fetch TXraw.");
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Broadcasts the raw transaction to the network.
     * @param txraw - The raw transaction hex.
     * @returns The response from the broadcast API.
     */
    API.broadcastTXraw = function (txraw, network) {
        return __awaiter(this, void 0, void 0, function () {
            var base_url, url, response, data, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        base_url = "";
                        if (network) {
                            base_url = API.getBaseURL(network);
                        }
                        else {
                            base_url = API.getBaseURL("mainnet");
                        }
                        url = base_url + "broadcast/tx/raw";
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
                        error_5 = _a.sent();
                        throw new Error("Failed to broadcast TXraw.");
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    API.fetchUTXOs = function (address, network) {
        return __awaiter(this, void 0, void 0, function () {
            var base_url, url, response, data, scriptPubKey_1, error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        base_url = "";
                        if (network) {
                            base_url = API.getBaseURL(network);
                        }
                        else {
                            base_url = API.getBaseURL("mainnet");
                        }
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
                        scriptPubKey_1 = tbc.Script.buildPublicKeyHashOut(address).toBuffer().toString('hex');
                        return [2 /*return*/, data.map(function (utxo) { return ({
                                txId: utxo.tx_hash,
                                outputIndex: utxo.tx_pos,
                                script: scriptPubKey_1,
                                satoshis: utxo.value
                            }); })];
                    case 4:
                        error_6 = _a.sent();
                        throw new Error("Failed to fetch UTXO.");
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    API.selectUTXOs = function (address, amount_tbc, network) {
        return __awaiter(this, void 0, void 0, function () {
            var utxos, amount_satoshis, closestUTXO, totalAmount, selectedUTXOs, _i, utxos_1, utxo;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
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
                        amount_satoshis = amount_tbc * Math.pow(10, 6);
                        closestUTXO = utxos.find(function (utxo) { return utxo.satoshis >= amount_satoshis + 50000; });
                        if (closestUTXO) {
                            return [2 /*return*/, [closestUTXO]];
                        }
                        totalAmount = 0;
                        selectedUTXOs = [];
                        for (_i = 0, utxos_1 = utxos; _i < utxos_1.length; _i++) {
                            utxo = utxos_1[_i];
                            totalAmount += utxo.satoshis;
                            selectedUTXOs.push(utxo);
                            if (totalAmount >= amount_satoshis + 2000) {
                                break;
                            }
                        }
                        if (totalAmount < amount_satoshis + 2000) {
                            throw new Error("Insufficient balance");
                        }
                        return [2 /*return*/, selectedUTXOs];
                }
            });
        });
    };
    API.fetchNFTTXO = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var script, tx_hash, network, base_url, script_hash, url, response, data, filteredUTXOs, min_vout_utxo, error_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        script = params.script, tx_hash = params.tx_hash, network = params.network;
                        base_url = "";
                        if (network) {
                            base_url = API.getBaseURL(network);
                        }
                        else {
                            base_url = API.getBaseURL("mainnet");
                        }
                        script_hash = Buffer.from(tbc.crypto.Hash.sha256(Buffer.from(script, "hex")).toString("hex"), "hex").reverse().toString("hex");
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
                                throw new Error('No matching UTXO found.');
                            }
                            min_vout_utxo = filteredUTXOs.reduce(function (prev, current) {
                                return prev.tx_pos < current.tx_pos ? prev : current;
                            });
                            return [2 /*return*/, {
                                    txId: min_vout_utxo.tx_hash,
                                    outputIndex: min_vout_utxo.tx_pos,
                                    script: script,
                                    satoshis: min_vout_utxo.value
                                }];
                        }
                        else {
                            return [2 /*return*/, {
                                    txId: data[0].tx_hash,
                                    outputIndex: data[0].tx_pos,
                                    script: script,
                                    satoshis: data[0].value
                                }];
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        error_7 = _a.sent();
                        throw new Error("Failed to fetch UTXO.");
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    API.fetchNFTInfo = function (contract_id, network) {
        return __awaiter(this, void 0, void 0, function () {
            var base_url, url, response, data, nftInfo, error_8;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        base_url = "";
                        if (network) {
                            base_url = API.getBaseURL(network);
                        }
                        else {
                            base_url = API.getBaseURL("mainnet");
                        }
                        url = base_url + "nft/infos/contract_ids";
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, fetch(url, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    if_icon_needed: true,
                                    nft_contract_list: [contract_id]
                                })
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
                            nftIcon: data.nftInfoList[0].nftIcon
                        };
                        return [2 /*return*/, nftInfo];
                    case 4:
                        error_8 = _a.sent();
                        throw new Error("Failed to fetch NFTInfo.");
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    return API;
}());
module.exports = API;
