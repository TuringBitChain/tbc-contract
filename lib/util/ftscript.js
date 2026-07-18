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
exports.FT_V4_PARTIAL_OFFSET = exports.FT_V4_CODE_LENGTH = exports.LEGACY_COIN_PARTIAL_OFFSET = exports.LEGACY_COIN_CODE_LENGTH = exports.FT_V2_PARTIAL_OFFSET = exports.FT_V2_CODE_LENGTH = exports.FT_V1_PARTIAL_OFFSET = exports.FT_V1_CODE_LENGTH = void 0;
exports.fillCharLengthInFT = fillCharLengthInFT;
exports.isCoinCodeScript = isCoinCodeScript;
exports.getFTVersion = getFTVersion;
exports.getFTPartialOffsetByLength = getFTPartialOffsetByLength;
exports.getFTPartialOffset = getFTPartialOffset;
exports.isFTCodeLength = isFTCodeLength;
const tbc = __importStar(require("tbc-lib-js"));
exports.FT_V1_CODE_LENGTH = 1564;
exports.FT_V1_PARTIAL_OFFSET = 1536;
exports.FT_V2_CODE_LENGTH = 1884;
exports.FT_V2_PARTIAL_OFFSET = 1856;
exports.LEGACY_COIN_CODE_LENGTH = 2012;
exports.LEGACY_COIN_PARTIAL_OFFSET = 1984;
exports.FT_V4_CODE_LENGTH = 2076;
exports.FT_V4_PARTIAL_OFFSET = 2048;
// Published stableCoin templates used three different padding lengths while
// keeping the same 2012-byte code size:
//   1.5.1-1.5.2: 11 bytes, 1.5.3-1.6.0: 54 bytes, 1.6.1+: 2 bytes.
// A 28-byte all-FF padding belongs to the pre-release 2012-byte FT v4
// template, so it must not be treated as a coin.
const LEGACY_COIN_FILL_LENGTHS = new Set([2, 11, 54]);
const LEGACY_FT_V4_FILL_LENGTH = 28;
const V4_COIN_FILL_LENGTH = 10;
const FT_CODE_MARKER = Buffer.from("32436f6465", "hex");
function fillCharLengthInFT(codeScript) {
    const fillChunk = getFTFillChunk(codeScript);
    if (fillChunk.opcodenum === 95) {
        return 1;
    }
    if (fillChunk.buf) {
        return fillChunk.buf.length;
    }
    return fillChunk.opcodenum;
}
function isCoinCodeScript(codeScript) {
    const codeLength = codeScript.length / 2;
    const code = tbc.Script.fromHex(codeScript);
    const fillChunk = getFTFillChunk(code);
    if (!isAllFF(fillChunk.buf))
        return false;
    if (!hasFTCodeMarker(code))
        return false;
    return ((codeLength === exports.LEGACY_COIN_CODE_LENGTH &&
        LEGACY_COIN_FILL_LENGTHS.has(fillChunk.buf.length)) ||
        (codeLength === exports.FT_V4_CODE_LENGTH &&
            fillChunk.buf.length === V4_COIN_FILL_LENGTH));
}
function getFTVersion(codeScript, isCoin = isCoinCodeScript(codeScript)) {
    const codeLength = codeScript.length / 2;
    if (codeLength === exports.FT_V4_CODE_LENGTH)
        return 4;
    const fillCharLength = fillCharLengthInFT(codeScript);
    if (codeLength === exports.LEGACY_COIN_CODE_LENGTH &&
        !isCoin &&
        fillCharLength === LEGACY_FT_V4_FILL_LENGTH) {
        return 4;
    }
    const isVersion2Family = codeLength === exports.FT_V2_CODE_LENGTH ||
        codeLength === exports.LEGACY_COIN_CODE_LENGTH ||
        isCoin;
    if (!isVersion2Family)
        return 1;
    return fillCharLength === 1 || fillCharLength === 2 ? 3 : 2;
}
function getFTPartialOffsetByLength(codeLength) {
    if (codeLength === exports.FT_V1_CODE_LENGTH)
        return exports.FT_V1_PARTIAL_OFFSET;
    if (codeLength === exports.FT_V2_CODE_LENGTH)
        return exports.FT_V2_PARTIAL_OFFSET;
    if (codeLength === exports.LEGACY_COIN_CODE_LENGTH) {
        return exports.LEGACY_COIN_PARTIAL_OFFSET;
    }
    if (codeLength === exports.FT_V4_CODE_LENGTH)
        return exports.FT_V4_PARTIAL_OFFSET;
    return null;
}
function getFTPartialOffset(codeScript) {
    const codeLength = codeScript.length / 2;
    const offset = getFTPartialOffsetByLength(codeLength);
    if (offset === null) {
        throw new Error(`Unsupported FT code length ${codeLength}`);
    }
    return offset;
}
function isFTCodeLength(codeLength) {
    return getFTPartialOffsetByLength(codeLength) !== null;
}
function getFTFillChunk(codeScript) {
    const code = typeof codeScript === "string" ? tbc.Script.fromHex(codeScript) : codeScript;
    return code.chunks[code.chunks.length - 5];
}
function hasFTCodeMarker(code) {
    const marker = code.chunks[code.chunks.length - 1]?.buf;
    return marker !== undefined && marker.equals(FT_CODE_MARKER);
}
function isAllFF(buffer) {
    return buffer !== undefined && buffer.every((byte) => byte === 0xff);
}
