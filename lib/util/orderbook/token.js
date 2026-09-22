"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.modernCodeOffsets = exports.fetchTokenProof = exports.isTokenProof = exports.getFTVersion = exports.getFTPartialOffset = exports.isCoinCodeScript = exports.tokenKind = exports.OrderBookToken = void 0;
// Compatibility entrypoint for the OrderBook adapter; HTLC shares the same codecs.
var contractToken_1 = require("../common/contractToken");
Object.defineProperty(exports, "OrderBookToken", { enumerable: true, get: function () { return contractToken_1.ContractToken; } });
Object.defineProperty(exports, "tokenKind", { enumerable: true, get: function () { return contractToken_1.tokenKind; } });
Object.defineProperty(exports, "isCoinCodeScript", { enumerable: true, get: function () { return contractToken_1.isCoinCodeScript; } });
Object.defineProperty(exports, "getFTPartialOffset", { enumerable: true, get: function () { return contractToken_1.getFTPartialOffset; } });
Object.defineProperty(exports, "getFTVersion", { enumerable: true, get: function () { return contractToken_1.getFTVersion; } });
Object.defineProperty(exports, "isTokenProof", { enumerable: true, get: function () { return contractToken_1.isTokenProof; } });
Object.defineProperty(exports, "fetchTokenProof", { enumerable: true, get: function () { return contractToken_1.fetchTokenProof; } });
Object.defineProperty(exports, "modernCodeOffsets", { enumerable: true, get: function () { return contractToken_1.modernCodeOffsets; } });
