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
exports.POOL3_MAX_AMOUNT = exports.POOL3_TAPE_BYTES = void 0;
exports.assertPoolAmount = assertPoolAmount;
exports.encodePoolTape = encodePoolTape;
exports.decodePoolTape = decodePoolTape;
exports.replacePoolTapeAmounts = replacePoolTapeAmounts;
exports.assertPoolTapeConfigurationUnchanged = assertPoolTapeConfigurationUnchanged;
const tbc = __importStar(require("tbc-lib-js"));
exports.POOL3_TAPE_BYTES = 143;
exports.POOL3_MAX_AMOUNT = (1n << 63n) - 1n;
const PREFIX = Buffer.from('006a4c82', 'hex');
const SUFFIX = Buffer.from('08504f4f4c54415045', 'hex');
function assertPoolAmount(value, label) {
    if (typeof value !== 'bigint' || value < 0n || value > exports.POOL3_MAX_AMOUNT) {
        throw new Error(`Pool3: ${label} must be a bigint in [0, 2^63-1]`);
    }
}
function assertSize(size, label) {
    // Size is consumed by OP_PARTIAL_HASH as a positive two-byte ScriptNum.
    if (!Number.isSafeInteger(size) || size < 128 || size > 0x7fff) {
        throw new Error(`Pool3: ${label} must fit a positive two-byte ScriptNum (128-32767)`);
    }
}
function assertFlags(fields) {
    for (const field of ['withSwapHashLock', 'withLpLocktime', 'withLpHashLock']) {
        if (typeof fields[field] !== 'boolean')
            throw new Error(`Pool3: ${field} must be boolean`);
    }
    if (fields.withSwapHashLock !== fields.withLpHashLock)
        throw new Error('Pool3: unsupported Pool authorization flag combination');
}
function amountFields(fields) {
    for (const key of ['ftLpAmount', 'ftAAmount', 'tbcAmount'])
        assertPoolAmount(fields[key], key);
}
/** Canonical framing: OP_FALSE OP_RETURN OP_PUSHDATA1(130) + 130 bytes + 08POOLTAPE. */
function encodePoolTape(fields) {
    if (!fields || typeof fields !== 'object')
        throw new Error('Pool3: Tape fields are required');
    for (const key of ['ftLpPartialHash', 'ftAPartialHash']) {
        if (!Buffer.isBuffer(fields[key]) || fields[key].length !== 32)
            throw new Error(`Pool3: ${key} must be exactly 32 bytes`);
    }
    assertSize(fields.ftLpCodeSize, 'LP Code size');
    assertSize(fields.ftACodeSize, 'FT Code size');
    amountFields(fields);
    assertFlags(fields);
    if (typeof fields.ftAContractId !== 'string' || !/^[0-9a-fA-F]{64}$/.test(fields.ftAContractId))
        throw new Error('Pool3: ftAContractId must be 32-byte display-order hex');
    if (!Number.isSafeInteger(fields.serviceFeeRate) ||
        fields.serviceFeeRate < 0 ||
        fields.serviceFeeRate > 0xffff)
        throw new Error('Pool3: serviceFeeRate must be uint16');
    if (!Number.isSafeInteger(fields.lpPlan) || fields.lpPlan < 0 || fields.lpPlan > 0xff)
        throw new Error('Pool3: lpPlan must be uint8');
    const bytes = Buffer.alloc(exports.POOL3_TAPE_BYTES);
    PREFIX.copy(bytes);
    fields.ftLpPartialHash.copy(bytes, 4);
    bytes.writeUInt16LE(fields.ftLpCodeSize, 36);
    fields.ftAPartialHash.copy(bytes, 38);
    bytes.writeUInt16LE(fields.ftACodeSize, 70);
    bytes.writeBigUInt64LE(fields.ftLpAmount, 72);
    bytes.writeBigUInt64LE(fields.ftAAmount, 80);
    bytes.writeBigUInt64LE(fields.tbcAmount, 88);
    Buffer.from(fields.ftAContractId, 'hex').copy(bytes, 96);
    bytes.writeUInt16LE(fields.serviceFeeRate, 128);
    bytes[130] = fields.lpPlan;
    bytes[131] = Number(fields.withSwapHashLock);
    bytes[132] = Number(fields.withLpLocktime);
    bytes[133] = Number(fields.withLpHashLock);
    SUFFIX.copy(bytes, 134);
    return bytes;
}
function decodePoolTape(tape) {
    const bytes = Buffer.isBuffer(tape)
        ? tape
        : tape instanceof tbc.Script
            ? tape.toBuffer()
            : undefined;
    if (!bytes ||
        bytes.length !== exports.POOL3_TAPE_BYTES ||
        !bytes.subarray(0, 4).equals(PREFIX) ||
        !bytes.subarray(134).equals(SUFFIX)) {
        throw new Error('Pool3: Tape must be exactly 143 bytes with the canonical 006a4c82 header and POOLTAPE marker');
    }
    if ([bytes[131], bytes[132], bytes[133]].some((flag) => flag > 1))
        throw new Error('Pool3: Tape boolean flags must be 00 or 01');
    const fields = {
        ftLpPartialHash: Buffer.from(bytes.subarray(4, 36)),
        ftLpCodeSize: bytes.readUInt16LE(36),
        ftAPartialHash: Buffer.from(bytes.subarray(38, 70)),
        ftACodeSize: bytes.readUInt16LE(70),
        ftLpAmount: bytes.readBigUInt64LE(72),
        ftAAmount: bytes.readBigUInt64LE(80),
        tbcAmount: bytes.readBigUInt64LE(88),
        ftAContractId: bytes.subarray(96, 128).toString('hex'),
        serviceFeeRate: bytes.readUInt16LE(128),
        lpPlan: bytes[130],
        withSwapHashLock: bytes[131] === 1,
        withLpLocktime: bytes[132] === 1,
        withLpHashLock: bytes[133] === 1,
    };
    if (!encodePoolTape(fields).equals(bytes))
        throw new Error('Pool3: noncanonical Tape');
    const variant = fields.withSwapHashLock
        ? fields.withLpLocktime
            ? 'controller-timelocked'
            : 'controller'
        : fields.withLpLocktime
            ? 'public-timelocked'
            : 'public';
    return { ...fields, suffixData: Buffer.from(bytes.subarray(96, 134)), flag: 'POOLTAPE', variant };
}
/** Preserves both token identities and all 38 configuration bytes exactly. */
function replacePoolTapeAmounts(tape, amounts) {
    if (!amounts || typeof amounts !== 'object')
        throw new Error('Pool3: replacement amounts are required');
    return encodePoolTape({
        ...decodePoolTape(tape),
        ftLpAmount: amounts.ftLpAmount,
        ftAAmount: amounts.ftAAmount,
        tbcAmount: amounts.tbcAmount,
    });
}
function assertPoolTapeConfigurationUnchanged(previous, next) {
    const oldBytes = encodePoolTape(decodePoolTape(previous));
    const newBytes = encodePoolTape(decodePoolTape(next));
    if (!oldBytes.subarray(0, 72).equals(newBytes.subarray(0, 72)) ||
        !oldBytes.subarray(96).equals(newBytes.subarray(96))) {
        throw new Error('Pool3: a Pool transition cannot change token identities or configuration');
    }
}
