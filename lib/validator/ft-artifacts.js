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
exports.isPublishedFTTape = void 0;
exports.classifyPublishedFTCode = classifyPublishedFTCode;
exports.decodePublishedFTCode = decodePublishedFTCode;
exports.isLegacyFTTape = isLegacyFTTape;
const tbc = __importStar(require("tbc-lib-js"));
const FT_CODE_MARKER = Buffer.from("0532436f6465", "hex");
const FT_TAPE_MARKER = Buffer.from("054654617065", "hex");
/*
 * Security boundary
 * -----------------
 * This registry classifies SDK lock templates; it does not validate an FT
 * transition, balance, ancestry, metadata, or spendability.  The v1-v3 rows
 * below were derived from the byte output of every tbc-contract version
 * published on npm through 1.6.5.  The v4 rows cover the early 2012-byte
 * ordinary-FT source artifact and the current ordinary-FT/StableCoin source
 * templates. A semver, script length, fill run, or trailing `2Code` marker
 * alone is intentionally never accepted as an artifact match.
 *
 * The hashes cover a byte-exact template after zeroing only fields supplied by
 * the SDK at mint/transfer time:
 *
 * - ordinary FT: OriginalUTXO36, the 16 repeated TapeSize bytes, Controller21;
 * - StableCoin: admin hash20, origin code hash32, the 16 repeated TapeSize
 *   bytes, Controller21.
 *
 * All repeated TapeSize bytes must also agree, Controller is required to be a
 * canonical SDK address/contract selector (00/01), and the final push must be
 * the exact direct-push `2Code` marker.  Consequently a random script with a
 * known length cannot be hidden from a TBC20 scanner as an opaque legacy FT.
 */
const ARTIFACTS = Object.freeze([
    artifact({
        id: "ft-v1-npm-1.0.0-1.1.28",
        version: 1,
        coin: false,
        codeBytes: 1564,
        partialOffset: 1536,
        normalizedSha256: "bfd8126a4cc55725a62b3ae0a7235f6cabe1b15c70f27fe3e7d7fada9bc37c73",
        identityRanges: [[303, 339]],
        originalUTXORange: [303, 339],
        tapeSizeOffsets: [
            566, 636, 678, 750, 794, 866, 910, 982, 1026, 1098, 1142, 1214,
            1258, 1330, 1374, 1446,
        ],
    }),
    artifact({
        id: "ft-v1-npm-1.1.29-1.4.12",
        version: 1,
        coin: false,
        codeBytes: 1564,
        partialOffset: 1536,
        normalizedSha256: "aa4471260dc8dbc3e9ba5a7e98653b87e617634b5c37c6025374b73e55310735",
        identityRanges: [[313, 349]],
        originalUTXORange: [313, 349],
        tapeSizeOffsets: [
            576, 646, 688, 760, 804, 876, 920, 992, 1036, 1108, 1152, 1224,
            1268, 1340, 1384, 1456,
        ],
    }),
    artifact({
        id: "ft-v2-npm-1.5.0-1.6.0",
        version: 2,
        coin: false,
        codeBytes: 1884,
        partialOffset: 1856,
        normalizedSha256: "f4b034ef624fc3de2dd461996712d4389c31e39fc4f74524e663465f1c7bd4cf",
        identityRanges: [[619, 655]],
        originalUTXORange: [619, 655],
        tapeSizeOffsets: [
            882, 952, 994, 1066, 1110, 1182, 1226, 1298, 1342, 1414, 1458,
            1530, 1574, 1646, 1690, 1762,
        ],
    }),
    artifact({
        id: "ft-v3-npm-1.6.1-1.6.5",
        version: 3,
        coin: false,
        codeBytes: 1884,
        partialOffset: 1856,
        normalizedSha256: "fdfa23a85f44ca26cff96e5053fa33e5b47af7dd3bc31ffbc577ab191952fb82",
        identityRanges: [[647, 683]],
        originalUTXORange: [647, 683],
        tapeSizeOffsets: [
            919, 989, 1031, 1103, 1147, 1219, 1263, 1335, 1379, 1451, 1495,
            1567, 1611, 1683, 1727, 1799,
        ],
    }),
    artifact({
        id: "ft-v4-source-pre-release",
        version: 4,
        coin: false,
        codeBytes: 2012,
        partialOffset: 1984,
        normalizedSha256: "2c80025bcbe3e42a3fe171547d0f1a576d7bc53a1d8c8fb2ff5c996e56af9172",
        identityRanges: [[672, 708]],
        originalUTXORange: [672, 708],
        tapeSizeOffsets: [
            1019, 1089, 1131, 1203, 1247, 1319, 1363, 1435, 1479, 1551,
            1595, 1667, 1711, 1783, 1827, 1899,
        ],
    }),
    artifact({
        id: "stablecoin-v2-npm-1.5.1-1.5.2",
        version: 2,
        coin: true,
        codeBytes: 2012,
        partialOffset: 1984,
        normalizedSha256: "e08e43f220636197380d8763df8c31c8b4bc76c326f66b9385d4e973d16200b8",
        identityRanges: [
            [258, 278],
            [705, 737],
        ],
        tapeSizeOffsets: [
            1041, 1111, 1153, 1225, 1269, 1341, 1385, 1457, 1501, 1573,
            1617, 1689, 1733, 1805, 1849, 1921,
        ],
    }),
    artifact({
        id: "stablecoin-v2-npm-1.5.3-1.6.0",
        version: 2,
        coin: true,
        codeBytes: 2012,
        partialOffset: 1984,
        normalizedSha256: "77b60cc9e884901425987112ff3a9547a0dfd155db641aea0f752ad29b6a30a9",
        identityRanges: [
            [256, 276],
            [669, 701],
        ],
        tapeSizeOffsets: [
            998, 1068, 1110, 1182, 1226, 1298, 1342, 1414, 1458, 1530, 1574,
            1646, 1690, 1762, 1806, 1878,
        ],
    }),
    artifact({
        id: "stablecoin-v3-npm-1.6.1-1.6.5",
        version: 3,
        coin: true,
        codeBytes: 2012,
        partialOffset: 1984,
        normalizedSha256: "0f226cbd6cf89f89d2c22eca43f8295e4bcafb750e11141bc1cee5aebbb42b3b",
        identityRanges: [
            [278, 298],
            [697, 729],
        ],
        tapeSizeOffsets: [
            1050, 1120, 1162, 1234, 1278, 1350, 1394, 1466, 1510, 1582,
            1626, 1698, 1742, 1814, 1858, 1930,
        ],
    }),
    artifact({
        id: "ft-v4-current-sdk",
        version: 4,
        coin: false,
        codeBytes: 2076,
        partialOffset: 2048,
        normalizedSha256: "d0a57bdf42b2f919c14febc71aac79ded1f25099cdee8373242261e83150fa74",
        identityRanges: [[696, 732]],
        originalUTXORange: [696, 732],
        tapeSizeOffsets: [
            1043, 1117, 1159, 1235, 1279, 1355, 1399, 1475, 1519, 1595,
            1639, 1715, 1759, 1835, 1879, 1955,
        ],
    }),
    artifact({
        id: "stablecoin-v4-current-sdk",
        version: 4,
        coin: true,
        codeBytes: 2076,
        partialOffset: 2048,
        normalizedSha256: "7d283417e489492719705e2b495775e53f6667751736abe90e2a5d5af14db5d9",
        identityRanges: [
            [302, 322],
            [721, 753],
        ],
        tapeSizeOffsets: [
            1074, 1148, 1190, 1266, 1310, 1386, 1430, 1506, 1550, 1626,
            1670, 1746, 1790, 1866, 1910, 1986,
        ],
    }),
]);
/**
 * Classifies a byte-exact FT/StableCoin Code artifact known to this SDK.
 *
 * `null` means only "not a registered artifact".  It must never be used as a
 * claim that the script is harmless, nor does a non-null result prove a valid
 * FT transaction. Transition validators must still decode the adjacent Tape,
 * enforce its output values and amount matrix, and check direct lineage.
 */
function classifyPublishedFTCode(scriptHex) {
    const code = decodeStrictHex(scriptHex);
    if (code === null)
        return null;
    const matched = matchPublishedFTDescriptor(code);
    if (matched === null)
        return null;
    return Object.freeze({
        version: matched.version,
        coin: matched.coin,
        codeBytes: matched.codeBytes,
        partialOffset: matched.partialOffset,
    });
}
/**
 * Decodes the runtime fields needed by the shared token-transition adapter.
 * StableCoin is intentionally returned as a known family without an
 * OriginalUTXO boundary; callers must not apply ordinary FT lineage rules to
 * it.
 */
function decodePublishedFTCode(scriptHex) {
    const code = decodeStrictHex(scriptHex);
    if (code === null)
        return null;
    const matched = matchPublishedFTDescriptor(code);
    if (matched === null)
        return null;
    const originalRange = matched.originalUTXORange;
    const originalUTXOWire36Hex = originalRange === undefined
        ? undefined
        : code.subarray(originalRange[0], originalRange[1]).toString("hex");
    if (originalUTXOWire36Hex !== undefined && originalUTXOWire36Hex.length !== 72) {
        return null;
    }
    return Object.freeze({
        artifactId: matched.id,
        family: matched.coin ? "STABLE_COIN" : "FT",
        version: matched.version,
        coin: matched.coin,
        codeBytes: matched.codeBytes,
        partialOffset: matched.partialOffset,
        tapeSize: code[matched.tapeSizeOffsets[0]],
        originalUTXOWire36Hex,
    });
}
/**
 * Recognises the stable envelope emitted by legacy FT and StableCoin SDKs.
 *
 * This is deliberately a format predicate, not an amount/metadata validator:
 * the six uint64 slots and metadata are opaque here.  It requires the exact
 * `OP_FALSE OP_RETURN PUSH48` prefix, canonical push-only extension, a
 * one-byte decimal field, and a final direct-push `FTape` marker.
 */
function isLegacyFTTape(scriptHex) {
    const tape = decodeStrictHex(scriptHex);
    if (tape === null || tape.length < 59)
        return false;
    if (tape[0] !== 0x00 || tape[1] !== 0x6a || tape[2] !== 0x30) {
        return false;
    }
    if (!tape.subarray(tape.length - FT_TAPE_MARKER.length).equals(FT_TAPE_MARKER)) {
        return false;
    }
    const pushes = [];
    let cursor = 51; // OP_FALSE, OP_RETURN, PUSH48, and the 48 amount bytes.
    while (cursor < tape.length) {
        const push = readCanonicalPush(tape, cursor);
        if (push === null)
            return false;
        pushes.push(push);
        cursor = push.dataStart + push.length;
    }
    if (cursor !== tape.length || pushes.length < 2)
        return false;
    if (pushes[0].length !== 1)
        return false;
    const markerPush = pushes[pushes.length - 1];
    return (markerPush.start === tape.length - FT_TAPE_MARKER.length &&
        markerPush.length === 5);
}
exports.isPublishedFTTape = isLegacyFTTape;
function artifact(config) {
    const controllerRange = [
        config.partialOffset + 1,
        config.partialOffset + 22,
    ];
    const tapeRanges = config.tapeSizeOffsets.map((offset) => [offset, offset + 1]);
    return Object.freeze({
        id: config.id,
        version: config.version,
        coin: config.coin,
        codeBytes: config.codeBytes,
        partialOffset: config.partialOffset,
        normalizedSha256: config.normalizedSha256,
        mutableRanges: Object.freeze([
            ...config.identityRanges,
            ...tapeRanges,
            controllerRange,
        ]),
        tapeSizeOffsets: Object.freeze([...config.tapeSizeOffsets]),
        originalUTXORange: config.originalUTXORange === undefined
            ? undefined
            : Object.freeze([...config.originalUTXORange]),
    });
}
function matchPublishedFTDescriptor(code) {
    let matched = null;
    for (const descriptor of ARTIFACTS) {
        if (code.length !== descriptor.codeBytes)
            continue;
        if (!hasCanonicalCodeSuffix(code, descriptor.partialOffset))
            continue;
        if (!hasConsistentTapeSize(code, descriptor.tapeSizeOffsets))
            continue;
        if (normalizedSha256(code, descriptor.mutableRanges) !== descriptor.normalizedSha256) {
            continue;
        }
        // A registry overlap is a configuration error. Fail closed instead of
        // depending on descriptor order.
        if (matched !== null)
            return null;
        matched = descriptor;
    }
    return matched;
}
function decodeStrictHex(value) {
    if (typeof value !== "string" ||
        value.length === 0 ||
        value.length % 2 !== 0 ||
        !/^[0-9a-fA-F]+$/.test(value)) {
        return null;
    }
    return Buffer.from(value, "hex");
}
function hasCanonicalCodeSuffix(code, partialOffset) {
    // The partial-hash suffix is exactly:
    // PUSH21 <hash20> <00 address | 01 contract> PUSH5 "2Code".
    if (partialOffset + 28 !== code.length)
        return false;
    if (code[partialOffset] !== 0x15)
        return false;
    const controllerOption = code[partialOffset + 21];
    if (controllerOption !== 0x00 && controllerOption !== 0x01)
        return false;
    return code.subarray(partialOffset + 22).equals(FT_CODE_MARKER);
}
function hasConsistentTapeSize(code, tapeSizeOffsets) {
    if (tapeSizeOffsets.length === 0)
        return false;
    const expected = code[tapeSizeOffsets[0]];
    return tapeSizeOffsets.every((offset) => offset < code.length && code[offset] === expected);
}
function normalizedSha256(code, mutableRanges) {
    const normalized = Buffer.from(code);
    for (const [start, endExclusive] of mutableRanges) {
        if (start < 0 || endExclusive < start || endExclusive > normalized.length) {
            return "";
        }
        normalized.fill(0, start, endExclusive);
    }
    return tbc.crypto.Hash.sha256(normalized).toString("hex");
}
function readCanonicalPush(script, start) {
    if (start >= script.length)
        return null;
    const opcode = script[start];
    let dataStart;
    let length;
    if (opcode >= 0x01 && opcode <= 0x4b) {
        dataStart = start + 1;
        length = opcode;
    }
    else if (opcode === 0x4c) {
        if (start + 1 >= script.length)
            return null;
        dataStart = start + 2;
        length = script[start + 1];
        if (length < 0x4c)
            return null;
    }
    else if (opcode === 0x4d) {
        if (start + 2 >= script.length)
            return null;
        dataStart = start + 3;
        length = script.readUInt16LE(start + 1);
        if (length <= 0xff)
            return null;
    }
    else if (opcode === 0x4e) {
        if (start + 4 >= script.length)
            return null;
        dataStart = start + 5;
        length = script.readUInt32LE(start + 1);
        if (length <= 0xffff)
            return null;
    }
    else {
        return null;
    }
    if (dataStart + length > script.length)
        return null;
    return { start, dataStart, length };
}
