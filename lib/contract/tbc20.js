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
exports.TBC20 = void 0;
const tbc = __importStar(require("tbc-lib-js"));
const tbc20unlock_1 = require("../util/tbc20unlock");
const TBC20_LOCK_HEX_TEMPLATE = "78537f7c03006a308801307f8259947f77095442433230544150458800006b7c587f587f587f587f587f817600a2696c7800a0638b0111796700686b6b567a937c817600a2696c7800a0638b0111796700686b6b937c817600a2696c7800a0638b0111796700686b6b937c817600a2696c7800a0638b0111796700686b6b937c817600a2696c7800a0638b0111796700686b6b937c817600a2696c7800a0638b0111796700686b6b936b547954797e6b7882<self.ConstTapeSize1>88755579517f7701157f756b56798102f4018852798100886ba87e6bbb7e6c6c7e7e7882777601289700880128966b7ea87882012088757e6b0078827600877c0128879b69757e78827600877c0128879b69757e78827600877c0128879b69757e78827600877c0128879b69757e78827600877c0128879b69757e78827600877c0128879b69757ea86c7e78826088757eaa56ba01247f7501207f816c88886c013b795a7a5a7a7b5a7a5a7a5a7a5a7a5a7a5a7a5a7a5a7a01147f81008763777777777777777778a9675879a855ba887c012895587a7c7f7701247f7501207f8156798277760128970088012896886b5279a9887e78825888757e7ea87882014088755279826088757e7eaa6c6888ad780087636d6d6d6d6c6c6c6c7c6b7c6b7c6b7567527952797e6b6bbb78825888757e6b7682777601289700880128966c6c7e7b7c7ea8527982014088755379826088757b7c7e7b7c7eaa6c6c6c6c8c6c7c6b7c6b787b6b7c01247f757601207f81567a88547a887b7b8764<self.OriginalUTXO36>8867756868780087636d6d6d6d6c6c6c6c7c6b7c6b7c6b67527952797e6b6bbb78825888757e6b7682777601289700880128966c6c7e7b7c7ea8527982014088755379826088757b7c7e7b7c7eaa6c6c6c6c8c6c7c6b7c6b787b6b7c01247f757601207f81567a88547a887b7b886875780087636d6d6d6d6c6c6c6c7c6b7c6b7c6b67527952797e6b6bbb78825888757e6b7682777601289700880128966c6c7e7b7c7ea8527982014088755379826088757b7c7e7b7c7eaa6c6c6c6c8c6c7c6b7c6b787b6b7c01247f757601207f81567a88547a887b7b886875780087636d6d6d6d6c6c6c6c7c6b7c6b7c6b67527952797e6b6bbb78825888757e6b7682777601289700880128966c6c7e7b7c7ea8527982014088755379826088757b7c7e7b7c7eaa6c6c6c6c8c6c7c6b7c6b787b6b7c01247f757601207f81567a88547a887b7b886875780087636d6d6d6d6c6c6c6c7c6b7c6b7c6b67527952797e6b6bbb78825888757e6b7682777601289700880128966c6c7e7b7c7ea8527982014088755379826088757b7c7e7b7c7eaa6c6c6c6c8c6c7c6b7c6b787b6b7c01247f757601207f81567a88547a887b7b886875780087636d6d6d6d6c6c6c6c7c6b7c6b7c6b67527952797e6b6bbb78825888757e6b7682777601289700880128966c6c7e7b7c7ea8527982014088755379826088757b7c7e7b7c7eaa6c6c6c6c8c6c7c6b7c6b787b6b7c01247f757601207f81567a88547a887b7b8868756c6c6c7c6b7c6b008878a855ba88760128957b7c7f7701287f7556ba886b006b52790087636d6d6d677682760087636d6d76<self.ConstTapeSize1>876352798259947f770954424332305441504587916968676c7c<self.ConstTapeSize1>87637c537f7c03006a308801307f8259947f7709544243323054415045886c7658957b7c7f77587f75817600a2696c7800a063577957797e7888557981008859798102f40188686c7b946b6b6b6777687ca87b7c7e7c7e6b68bb7e6c7e6b6852790087636d6d6d677682760087636d6d76<self.ConstTapeSize1>876352798259947f770954424332305441504587916968676c7c<self.ConstTapeSize1>87637c537f7c03006a308801307f8259947f7709544243323054415045886c7658957b7c7f77587f75817600a2696c7800a063577957797e7888557981008859798102f40188686c7b946b6b6b6777687ca87b7c7e7c7e6b68bb7e6c7e6b6852790087636d6d6d677682760087636d6d76<self.ConstTapeSize1>876352798259947f770954424332305441504587916968676c7c<self.ConstTapeSize1>87637c537f7c03006a308801307f8259947f7709544243323054415045886c7658957b7c7f77587f75817600a2696c7800a063577957797e7888557981008859798102f40188686c7b946b6b6b6777687ca87b7c7e7c7e6b68bb7e6c7e6b6852790087636d6d6d677682760087636d6d76<self.ConstTapeSize1>876352798259947f770954424332305441504587916968676c7c<self.ConstTapeSize1>87637c537f7c03006a308801307f8259947f7709544243323054415045886c7658957b7c7f77587f75817600a2696c7800a063577957797e7888557981008859798102f40188686c7b946b6b6b6777687ca87b7c7e7c7e6b68bb7e6c7e6b6852790087636d6d6d677682760087636d6d76<self.ConstTapeSize1>876352798259947f770954424332305441504587916968676c7c<self.ConstTapeSize1>87637c537f7c03006a308801307f8259947f7709544243323054415045886c7658957b7c7f77587f75817600a2696c7800a063577957797e7888557981008859798102f40188686c7b946b6b6b6777687ca87b7c7e7c7e6b68bb7e6c7e6b6852790087636d6d6d677682760087636d6d76<self.ConstTapeSize1>876352798259947f770954424332305441504587916968676c7c<self.ConstTapeSize1>87637c537f7c03006a308801307f8259947f7709544243323054415045886c7658957b7c7f77587f75817600a2696c7800a063577957797e7888557981008859798102f40188686c7b946b6b6b6777687ca87b7c7e7c7e6b68bb7e6c7e6b6852790087636d6d6d677682760087636d6d76<self.ConstTapeSize1>876352798259947f770954424332305441504587916968676c7c<self.ConstTapeSize1>87637c537f7c03006a308801307f8259947f7709544243323054415045886c7658957b7c7f77587f75817600a2696c7800a063577957797e7888557981008859798102f40188686c7b946b6b6b6777687ca87b7c7e7c7e6b68bb7e6c7e6b6852790087636d6d6d677682760087636d6d76<self.ConstTapeSize1>876352798259947f770954424332305441504587916968676c7c<self.ConstTapeSize1>87637c537f7c03006a308801307f8259947f7709544243323054415045886c7658957b7c7f77587f75817600a2696c7800a063577957797e7888557981008859798102f40188686c7b946b6b6b6777687ca87b7c7e7c7e6b68bb7e6c7e6b686ca857ba886c6c6c7c6b7c6b0088516a27ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff<self.Controller21>0532436f6465";
function instantiatedTemplateBytes(template) {
    const resolved = template
        .replaceAll("<self.OriginalUTXO36>", `24${"00".repeat(36)}`)
        .replaceAll("<self.ConstTapeSize1>", "0100")
        .replaceAll("<self.Controller21>", `15${"00".repeat(21)}`);
    if (resolved.includes("<") || resolved.includes(">") || !/^[0-9a-f]+$/.test(resolved) || resolved.length % 2 !== 0) {
        throw new Error("TBC20: embedded compiled lock template is malformed");
    }
    return resolved.length / 2;
}
const TBC20_TEMPLATE_SEGMENTS = TBC20_LOCK_HEX_TEMPLATE.split(/(<self\.(?:OriginalUTXO36|ConstTapeSize1|Controller21)>)/);
const TBC20_CODE_BYTES = instantiatedTemplateBytes(TBC20_LOCK_HEX_TEMPLATE);
const TBC20_CODE_PARTIAL_OFFSET = Math.floor(TBC20_CODE_BYTES / 64) * 64;
// Full-file hash of the compiler artifact from which the embedded lock
// template was copied. Keeping this visible makes template drift auditable.
const TBC20_ARTIFACT_SHA256 = "e06235404815def601948893adab791e0ddf7b3ffc08ed1b4961e46477dabeb1";
const UINT32_MAX = 0xffffffff;
const TBC_DUST_AMOUNT = tbc.Transaction.DUST_AMOUNT;
const TBC20_FEE_RATE_SATOSHIS_PER_KB = 80;
const TBC20_MIN_FEE_SATOSHIS = 80;
const TBC20_MAX_ADDITIONAL_UNLOCK_BYTES = 10_000_000;
// Maximum low-S ECDSA transaction signature produced by tbc-lib-js:
// 71-byte DER (33-byte R + 32-byte low-S) plus one sighash byte.
const MAX_LOW_S_TX_SIGNATURE = Buffer.from("304502210080000000000000000000000000000000000000000000000000000000000000000220010000000000000000000000000000000000000000000000000000000000000041", "hex");
const TAPE_ENVELOPE_BYTES = tbc20unlock_1.TBC20_TAPE_PREFIX.length + tbc20unlock_1.TBC20_AMOUNT_SLOTS * 8 + tbc20unlock_1.TBC20_TAPE_MARKER.length;
// The marker itself must be a complete push after OP_FALSE OP_RETURN. Without
// this 0x09, a zero-satoshi 60-byte tape is non-standard and TBCNODE rejects it
// as dust even though the contract can parse its raw suffix.
const DEFAULT_TAPE_EXTENSION = Buffer.from([tbc20unlock_1.TBC20_TAPE_MARKER.length]);
const MIN_TAPE_BYTES = TAPE_ENVELOPE_BYTES + DEFAULT_TAPE_EXTENSION.length;
const TBC20_METADATA_VERSION = 1;
const TBC20_MAX_DECIMAL = 18;
const TBC20_METADATA_FIXED_BYTES = 12;
function fail(message) {
    throw new Error(`TBC20: ${message}`);
}
function scriptFrom(value, name) {
    if (value instanceof tbc.Script) {
        return tbc.Script.fromBuffer(Buffer.from(value.toBuffer()));
    }
    const buffer = bufferFrom(value, name);
    try {
        return tbc.Script.fromBuffer(buffer);
    }
    catch (error) {
        fail(`${name} is not a valid script: ${error.message}`);
    }
}
function bufferFrom(value, name) {
    if (Buffer.isBuffer(value)) {
        return Buffer.from(value);
    }
    if (typeof value !== "string" || value.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(value)) {
        fail(`${name} must be an even-length hexadecimal string or Buffer`);
    }
    return Buffer.from(value, "hex");
}
function assertPrivateKey(value, name) {
    if (!(value instanceof tbc.PrivateKey)) {
        fail(`${name} must be a tbc.PrivateKey`);
    }
}
function assertTransaction(value, name) {
    if (!(value instanceof tbc.Transaction)) {
        fail(`${name} must be a tbc.Transaction`);
    }
    const version = value.version;
    if (version !== 10) {
        fail(`${name}.version must be exactly 10`);
    }
}
function assertSatoshis(value, name) {
    if (!Number.isSafeInteger(value) || value < 0) {
        fail(`${name} must be a non-negative safe integer`);
    }
}
function assertSlotAmount(value, name, allowZero = false) {
    if (typeof value !== "bigint") {
        fail(`${name} must be a bigint in raw smallest units`);
    }
    if (value < 0n || (!allowZero && value === 0n) || value > tbc20unlock_1.TBC20_MAX_SLOT_AMOUNT) {
        fail(`${name} must be ${allowZero ? "in" : "a positive bigint in"} [${allowZero ? "0" : "1"}, ${tbc20unlock_1.TBC20_MAX_SLOT_AMOUNT}]`);
    }
}
function assertPositiveAmount(value, name) {
    if (typeof value !== "bigint" || value <= 0n) {
        fail(`${name} must be a positive bigint in raw smallest units`);
    }
}
function assertTxid(value, name) {
    if (typeof value !== "string" || !/^[0-9a-fA-F]{64}$/.test(value)) {
        fail(`${name} must be a 64-character transaction id`);
    }
    return value.toLowerCase();
}
function assertVout(value, name) {
    if (!Number.isSafeInteger(value) || value < 0 || value > UINT32_MAX) {
        fail(`${name} must be a uint32 integer`);
    }
}
function assertTapeSize(size) {
    if (!Number.isSafeInteger(size) || size < MIN_TAPE_BYTES || size > 127) {
        fail(`tapeSize must be an integer in [${MIN_TAPE_BYTES}, 127]`);
    }
}
function assertMetadataDecimal(value, name = "decimal") {
    if (!Number.isSafeInteger(value) || value < 0 || value > TBC20_MAX_DECIMAL) {
        fail(`${name} must be an integer in [0, ${TBC20_MAX_DECIMAL}]`);
    }
    return value;
}
function humanAmountToRaw(value, decimal, name) {
    assertMetadataDecimal(decimal, `${name}.decimal`);
    if (typeof value !== "string" || !/^(0|[1-9]\d*)(?:\.(\d+))?$/.test(value)) {
        fail(`${name} must be a canonical unsigned decimal string without whitespace, sign, or exponent`);
    }
    const [integerPart, fractionalPart = ""] = value.split(".");
    if (fractionalPart.length > decimal) {
        fail(`${name} has more than ${decimal} fractional digits`);
    }
    if (decimal === 0 && fractionalPart.length !== 0) {
        fail(`${name} cannot contain a fractional part when decimal is zero`);
    }
    if (integerPart.length + decimal > tbc20unlock_1.TBC20_MAX_SLOT_AMOUNT.toString().length) {
        fail(`${name} exceeds the maximum raw TBC20 amount ${tbc20unlock_1.TBC20_MAX_SLOT_AMOUNT}`);
    }
    const scale = 10n ** BigInt(decimal);
    const fraction = fractionalPart.length === 0
        ? 0n
        : BigInt(fractionalPart.padEnd(decimal, "0"));
    const raw = BigInt(integerPart) * scale + fraction;
    if (raw > tbc20unlock_1.TBC20_MAX_SLOT_AMOUNT) {
        fail(`${name} exceeds the maximum raw TBC20 amount ${tbc20unlock_1.TBC20_MAX_SLOT_AMOUNT}`);
    }
    return raw;
}
function rawAmountToHuman(value, decimal, name) {
    assertMetadataDecimal(decimal, `${name}.decimal`);
    if (typeof value !== "bigint" || value < 0n || value > tbc20unlock_1.TBC20_MAX_SLOT_AMOUNT) {
        fail(`${name} must be a bigint in [0, ${tbc20unlock_1.TBC20_MAX_SLOT_AMOUNT}] raw smallest units`);
    }
    if (decimal === 0)
        return value.toString();
    const scale = 10n ** BigInt(decimal);
    const integerPart = value / scale;
    const fraction = (value % scale).toString().padStart(decimal, "0").replace(/0+$/, "");
    return fraction.length === 0 ? integerPart.toString() : `${integerPart}.${fraction}`;
}
function assertMetadataName(value) {
    if (typeof value !== "string" || value.length === 0) {
        fail("metadata.name must be a non-empty string");
    }
    if (value.length > 53) {
        fail("metadata.name is too long for the bounded tape extension");
    }
    if (value.normalize("NFC") !== value) {
        fail("metadata.name must use canonical NFC Unicode normalization");
    }
    const encoded = Buffer.from(value, "utf8");
    if (encoded.toString("utf8") !== value) {
        fail("metadata.name must contain valid Unicode scalar values");
    }
    return encoded;
}
function assertMetadataSymbol(value) {
    if (typeof value !== "string" || !/^[\x21-\x7e]+$/.test(value)) {
        fail("metadata.symbol must be non-empty printable ASCII without whitespace");
    }
    if (value.length > 53) {
        fail("metadata.symbol is too long for the bounded tape extension");
    }
    return Buffer.from(value, "ascii");
}
function encodeTBC20Metadata(definition) {
    if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
        fail("metadata definition must be an object");
    }
    const decimal = assertMetadataDecimal(definition.decimal ?? 0, "metadata.decimal");
    const supplyRaw = humanAmountToRaw(definition.supply, decimal, "metadata.supply");
    assertSlotAmount(supplyRaw, "metadata.supply raw amount");
    const name = assertMetadataName(definition.name);
    const symbol = assertMetadataSymbol(definition.symbol);
    if (name.length > 255 || symbol.length > 255) {
        fail("metadata name and symbol must each fit in one byte of length");
    }
    const payloadLength = TBC20_METADATA_FIXED_BYTES + name.length + symbol.length;
    const maxExtensionBytes = 127 - TAPE_ENVELOPE_BYTES;
    if (payloadLength > 75 || payloadLength + 2 > maxExtensionBytes) {
        fail(`metadata UTF-8 name and ASCII symbol are too long; combined bytes must not exceed ${maxExtensionBytes - TBC20_METADATA_FIXED_BYTES - 2}`);
    }
    const supplyBytes = Buffer.alloc(8);
    supplyBytes.writeBigUInt64LE(supplyRaw);
    const payload = Buffer.concat([
        Buffer.from([
            TBC20_METADATA_VERSION,
            decimal,
        ]),
        supplyBytes,
        Buffer.from([name.length, symbol.length]),
        name,
        symbol,
    ]);
    const extensionData = Buffer.concat([
        Buffer.from([payload.length]),
        payload,
        Buffer.from([tbc20unlock_1.TBC20_TAPE_MARKER.length]),
    ]);
    const metadata = Object.freeze({
        name: definition.name,
        symbol: definition.symbol,
        supply: rawAmountToHuman(supplyRaw, decimal, "metadata.supply raw amount"),
        decimal,
    });
    return { metadata, declaredSupplyRaw: supplyRaw, extensionData };
}
function decodeTBC20Metadata(extensionData) {
    const extension = bufferFrom(extensionData, "metadata extensionData");
    if (extension.length < TBC20_METADATA_FIXED_BYTES + 2 ||
        extension[extension.length - 1] !== tbc20unlock_1.TBC20_TAPE_MARKER.length) {
        fail("metadata extension must be one direct canonical push followed by the TBC20TAPE push opcode");
    }
    const payloadLength = extension[0];
    if (payloadLength < TBC20_METADATA_FIXED_BYTES ||
        payloadLength > 75 ||
        payloadLength + 2 !== extension.length) {
        fail("metadata extension has a non-canonical payload push length");
    }
    const payload = extension.subarray(1, 1 + payloadLength);
    if (payload[0] !== TBC20_METADATA_VERSION) {
        fail(`metadata version must be ${TBC20_METADATA_VERSION}`);
    }
    const decimal = assertMetadataDecimal(payload[1], "metadata.decimal");
    const supplyRaw = payload.readBigUInt64LE(2);
    assertSlotAmount(supplyRaw, "metadata.supply raw amount");
    const nameLength = payload[10];
    const symbolLength = payload[11];
    if (TBC20_METADATA_FIXED_BYTES + nameLength + symbolLength !== payload.length) {
        fail("metadata name/symbol lengths do not exactly cover the payload");
    }
    const name = payload.subarray(12, 12 + nameLength).toString("utf8");
    const symbol = payload.subarray(12 + nameLength).toString("ascii");
    assertMetadataName(name);
    assertMetadataSymbol(symbol);
    const encoded = encodeTBC20Metadata({
        name,
        symbol,
        supply: rawAmountToHuman(supplyRaw, decimal, "metadata.supply raw amount"),
        decimal,
    });
    if (!encoded.extensionData.equals(extension)) {
        fail("metadata extension is not canonical");
    }
    return encoded;
}
function tryDecodeTBC20Metadata(extensionData) {
    if (extensionData.equals(DEFAULT_TAPE_EXTENSION))
        return undefined;
    try {
        return decodeTBC20Metadata(extensionData);
    }
    catch {
        // Arbitrary legacy extension bytes remain supported. Call the strict public
        // decoder when a caller expects the extension to contain metadata.
        return undefined;
    }
}
function isStrictPushOnly(script, start) {
    let offset = start;
    while (offset < script.length) {
        const opcode = script[offset++];
        let dataLength = 0;
        if (opcode >= 1 && opcode <= 75) {
            dataLength = opcode;
        }
        else if (opcode === 76) {
            if (offset + 1 > script.length)
                return false;
            dataLength = script[offset++];
        }
        else if (opcode === 77) {
            if (offset + 2 > script.length)
                return false;
            dataLength = script.readUInt16LE(offset);
            offset += 2;
        }
        else if (opcode === 78) {
            if (offset + 4 > script.length)
                return false;
            dataLength = script.readUInt32LE(offset);
            offset += 4;
        }
        else if (opcode > 96) {
            return false;
        }
        if (dataLength > script.length - offset)
            return false;
        offset += dataLength;
    }
    return offset === script.length;
}
function assertRelaySafeTape(script) {
    if (!script.subarray(0, tbc20unlock_1.TBC20_TAPE_PREFIX.length).equals(tbc20unlock_1.TBC20_TAPE_PREFIX)) {
        fail("tape must start with OP_FALSE OP_RETURN PUSH48");
    }
    // TBCNODE Solver classifies OP_FALSE OP_RETURN as TX_NULL_DATA only when
    // everything after the first two opcodes is a fully parseable push-only
    // script. A zero-satoshi tape that fails this check is rejected as dust.
    if (!isStrictPushOnly(script, 2)) {
        fail("tape extension and TBC20TAPE marker must form a complete push-only data script");
    }
}
function pushHex(buffer) {
    return new tbc.Script().add(buffer).toHex();
}
function outputScriptHex(utxo) {
    const script = utxo.script;
    if (typeof script !== "string" || script.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(script)) {
        fail("UTXO script must be a non-empty hexadecimal string");
    }
    return script.toLowerCase();
}
function validateUTXO(utxo, name) {
    if (!utxo || typeof utxo !== "object") {
        fail(`${name} is required`);
    }
    assertTxid(utxo.txId, `${name}.txId`);
    assertVout(utxo.outputIndex, `${name}.outputIndex`);
    assertSatoshis(utxo.satoshis, `${name}.satoshis`);
    outputScriptHex(utxo);
}
function outpointKey(utxo) {
    return `${utxo.txId.toLowerCase()}:${utxo.outputIndex}`;
}
function validateUniqueOutpoints(utxos) {
    const seen = new Set();
    utxos.forEach((utxo, index) => {
        validateUTXO(utxo, `inputs[${index}]`);
        const key = outpointKey(utxo);
        if (seen.has(key)) {
            fail(`duplicate input outpoint ${key}`);
        }
        seen.add(key);
    });
}
function normalizeController(value, name) {
    let controller;
    if (Buffer.isBuffer(value)) {
        controller = Buffer.from(value);
    }
    else if (typeof value === "string" && /^[0-9a-fA-F]{42}$/.test(value)) {
        controller = Buffer.from(value, "hex");
    }
    else if (typeof value === "string") {
        controller = TBC20.addressController(value);
    }
    else {
        fail(`${name} must be an address, 21-byte controller hex, or Buffer`);
    }
    if (controller.length !== 21) {
        fail(`${name} must be exactly 21 bytes`);
    }
    // The contract branches on BinToNum(option): 00 is address control and any
    // other numeric value is contract control. Raw 80 is ScriptNum negative zero
    // and would unexpectedly take the address branch, so never accept it.
    if (controller[20] === 0x80) {
        fail(`${name} control option 80 is non-canonical ScriptNum negative zero`);
    }
    return controller;
}
function assertCanonicalSigningResult(signature, inputIndex) {
    if (signature.length === 65 ||
        signature.length > MAX_LOW_S_TX_SIGNATURE.length ||
        !tbc.crypto.Signature.isTxDER(signature)) {
        fail(`input ${inputIndex} did not produce a canonical DER transaction signature within the 72-byte low-S bound`);
    }
    const parsed = tbc.crypto.Signature.fromTxFormat(signature);
    if (!parsed.hasLowS() || !parsed.hasDefinedHashtype() || parsed.nhashtype !== 0x41) {
        fail(`input ${inputIndex} signature must be low-S SIGHASH_ALL | SIGHASH_FORKID (0x41)`);
    }
}
function buildP2PKHUnlock(tx, inputIndex, privateKey) {
    const signature = tx.getSignature(inputIndex, privateKey);
    if (typeof signature !== "string") {
        fail(`input ${inputIndex} did not produce exactly one P2PKH signature`);
    }
    const signatureBuffer = Buffer.from(signature, "hex");
    assertCanonicalSigningResult(signatureBuffer, inputIndex);
    return new tbc.Script()
        .add(signatureBuffer)
        .add(privateKey.toPublicKey().toBuffer());
}
function buildEstimatedP2PKHUnlock(privateKey) {
    return new tbc.Script()
        .add(MAX_LOW_S_TX_SIGNATURE)
        .add(privateKey.toPublicKey().toBuffer());
}
function buildEstimatedTBC20Unlock(tx, inputIndex, input, outputGroups) {
    return (0, tbc20unlock_1.buildTBC20UnlockScriptWithSignature)({
        currentTx: tx,
        inputIndex,
        preTx: input.parentTx,
        preTxVout: input.utxo.outputIndex,
        outputGroups,
        ancestorTransactions: input.ancestors,
        contractController: input.contractController,
        signature: MAX_LOW_S_TX_SIGNATURE,
        publicKey: input.signingKey.toPublicKey(),
    });
}
function buildTBC20UnlockOnce(tx, inputIndex, input, outputGroups) {
    const signature = tx.getSignature(inputIndex, input.signingKey);
    if (typeof signature !== "string") {
        fail(`input ${inputIndex} did not produce exactly one TBC20 signature`);
    }
    const signatureBuffer = Buffer.from(signature, "hex");
    assertCanonicalSigningResult(signatureBuffer, inputIndex);
    return (0, tbc20unlock_1.buildTBC20UnlockScriptWithSignature)({
        currentTx: tx,
        inputIndex,
        preTx: input.parentTx,
        preTxVout: input.utxo.outputIndex,
        outputGroups,
        ancestorTransactions: input.ancestors,
        contractController: input.contractController,
        signature: signatureBuffer,
        publicKey: input.signingKey.toPublicKey(),
    });
}
function buildEstimatedAdditionalUnlock(input) {
    if (input.unlock instanceof tbc.Script) {
        return tbc.Script.fromBuffer(Buffer.from(input.unlock.toBuffer()));
    }
    return tbc.Script.fromBuffer(Buffer.alloc(input.maxUnlockScriptBytes));
}
function snapshotInputOutputs(tx) {
    return tx.inputs.map((input, inputIndex) => {
        const output = input.output;
        if (!(output instanceof tbc.Transaction.Output)) {
            fail(`input ${inputIndex} is missing its previous output metadata`);
        }
        return {
            reference: output,
            satoshis: output.satoshis,
            scriptHex: output.script.toHex(),
        };
    });
}
function inputOutputsEqual(tx, snapshots) {
    return tx.inputs.length === snapshots.length && tx.inputs.every((input, inputIndex) => {
        const output = input.output;
        const snapshot = snapshots[inputIndex];
        return output === snapshot.reference &&
            output instanceof tbc.Transaction.Output &&
            output.satoshis === snapshot.satoshis &&
            output.script.toHex() === snapshot.scriptHex;
    });
}
function cloneForAdditionalCallback(tx) {
    const clone = new tbc.Transaction(tx.uncheckedSerialize());
    tx.inputs.forEach((input, inputIndex) => {
        const output = input.output;
        if (!(output instanceof tbc.Transaction.Output)) {
            fail(`input ${inputIndex} is missing its previous output metadata`);
        }
        clone.inputs[inputIndex].output = new tbc.Transaction.Output({
            script: tbc.Script.fromBuffer(Buffer.from(output.script.toBuffer())),
            satoshis: output.satoshis,
        });
    });
    if (clone.uncheckedSerialize() !== tx.uncheckedSerialize()) {
        fail("isolated callback transaction differs from the fee-final transaction");
    }
    return clone;
}
function buildAdditionalUnlockOnce(input, tx, inputIndex) {
    if (input.unlock instanceof tbc.Script) {
        return tbc.Script.fromBuffer(Buffer.from(input.unlock.toBuffer()));
    }
    // Execute untrusted/custom signing logic on an isolated transaction. Previous
    // output metadata is not part of raw serialization but is part of FORKID
    // sighash, so allowing the callback to mutate the final transaction would be
    // enough to create a signature for the wrong amount or locking script.
    const callbackTx = cloneForAdditionalCallback(tx);
    const internals = callbackTx;
    const beforeRaw = callbackTx.uncheckedSerialize();
    const originalRaw = tx.uncheckedSerialize();
    const originalOutputs = snapshotInputOutputs(tx);
    const callbackOutputs = snapshotInputOutputs(callbackTx);
    const beforeInputCallbacks = internals._inputsMap?.size ?? 0;
    const beforeOutputCallbacks = internals._outputsMap?.size ?? 0;
    const beforeChangeScript = internals._changeScript;
    const beforePrivateKey = internals._privateKey;
    const beforeSealed = internals.sealed;
    const result = input.unlock(callbackTx, inputIndex);
    if (!(result instanceof tbc.Script)) {
        fail(`additional input ${inputIndex} callback must return a Script`);
    }
    if (callbackTx.uncheckedSerialize() !== beforeRaw ||
        !inputOutputsEqual(callbackTx, callbackOutputs) ||
        tx.uncheckedSerialize() !== originalRaw ||
        !inputOutputsEqual(tx, originalOutputs) ||
        (internals._inputsMap?.size ?? 0) !== beforeInputCallbacks ||
        (internals._outputsMap?.size ?? 0) !== beforeOutputCallbacks ||
        internals._changeScript !== beforeChangeScript ||
        internals._privateKey !== beforePrivateKey ||
        internals.sealed !== beforeSealed) {
        fail(`additional input ${inputIndex} callback must not mutate the transaction`);
    }
    const script = tbc.Script.fromBuffer(Buffer.from(result.toBuffer()));
    if (script.toBuffer().length > input.maxUnlockScriptBytes) {
        fail(`additional input ${inputIndex} script exceeds maxUnlockScriptBytes`);
    }
    return script;
}
function assertP2PKHOwner(utxo, privateKey, name) {
    assertPrivateKey(privateKey, `${name}.privateKey`);
    const script = tbc.Script.fromHex(outputScriptHex(utxo));
    if (!script.isPublicKeyHashOut()) {
        fail(`${name}.utxo must be P2PKH`);
    }
    if (!script.getPublicKeyHash().equals(tbc.crypto.Hash.sha256ripemd160(privateKey.toPublicKey().toBuffer()))) {
        fail(`${name}.privateKey does not control its P2PKH UTXO`);
    }
}
function outputAmountSum(tx) {
    return tx.outputs.reduce((sum, output, index) => {
        assertSatoshis(output.satoshis, `outputs[${index}].satoshis`);
        const next = sum + output.satoshis;
        if (!Number.isSafeInteger(next))
            fail("aggregate output satoshis exceed JavaScript safe integer range");
        return next;
    }, 0);
}
function inputAmountSum(utxos) {
    return utxos.reduce((sum, utxo, index) => {
        assertSatoshis(utxo.satoshis, `inputs[${index}].satoshis`);
        const next = sum + utxo.satoshis;
        if (!Number.isSafeInteger(next))
            fail("aggregate input satoshis exceed JavaScript safe integer range");
        return next;
    }, 0);
}
function actualFee(utxos, tx) {
    return inputAmountSum(utxos) - outputAmountSum(tx);
}
function feeForSize(sizeBytes) {
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
        fail("serialized transaction size must be a positive safe integer");
    }
    const calculated = (BigInt(sizeBytes) * BigInt(TBC20_FEE_RATE_SATOSHIS_PER_KB) + 999n) / 1000n;
    if (calculated > BigInt(Number.MAX_SAFE_INTEGER)) {
        fail("calculated transaction fee exceeds JavaScript safe integer range");
    }
    return Math.max(TBC20_MIN_FEE_SATOSHIS, Number(calculated));
}
function serializedSize(tx) {
    const raw = tx.uncheckedSerialize();
    if (typeof raw !== "string" || raw.length === 0 || raw.length % 2 !== 0) {
        fail("transaction serialization is not valid hexadecimal bytes");
    }
    return raw.length / 2;
}
function checkedAutomaticFee(name, utxos, tx) {
    const paid = actualFee(utxos, tx);
    const required = feeForSize(serializedSize(tx));
    if (paid < required) {
        fail(`${name} paid ${paid} sat but its final ${serializedSize(tx)} bytes require ${required} sat`);
    }
    return paid;
}
function buildPositionalTokenInputs(privateKey, utxos, parentTxs, ancestorResolvers, contractControllers, name) {
    assertPrivateKey(privateKey, `${name}.privateKey`);
    if (!Array.isArray(utxos) || !Array.isArray(parentTxs) || !Array.isArray(ancestorResolvers)) {
        fail(`${name} utxos, parentTxs, and ancestorResolvers must be arrays`);
    }
    if (utxos.length !== parentTxs.length || utxos.length !== ancestorResolvers.length) {
        fail(`${name} utxos, parentTxs, and ancestorResolvers must have exactly matching lengths`);
    }
    if (contractControllers !== undefined &&
        (!Array.isArray(contractControllers) || contractControllers.length !== utxos.length)) {
        fail(`${name}.contractControllers must be omitted or match the token input count`);
    }
    return utxos.map((utxo, index) => ({
        utxo,
        parentTx: parentTxs[index],
        ancestors: ancestorResolvers[index],
        signingKey: privateKey,
        contractController: contractControllers?.[index],
    }));
}
class TBC20 {
    codeScript;
    tapeScript;
    contractTxid;
    tapeSize;
    _extensionData;
    /** Canonical SDK/indexer metadata; it is not a contract-authenticated consensus cap. */
    metadata;
    /** Raw form of metadata.supply, subject to the same non-consensus limitation. */
    declaredSupplyRaw;
    name;
    symbol;
    supply;
    decimal;
    constructor(config = {}) {
        if (!config || typeof config !== "object" || Array.isArray(config)) {
            fail("config must be an object");
        }
        const metadataKeysPresent = config.name !== undefined ||
            config.symbol !== undefined ||
            config.supply !== undefined ||
            config.decimal !== undefined;
        if (metadataKeysPresent &&
            (config.name === undefined || config.symbol === undefined || config.supply === undefined)) {
            fail("name, symbol, and supply must be provided together; decimal is optional");
        }
        const declaredMetadata = metadataKeysPresent
            ? encodeTBC20Metadata({
                name: config.name,
                symbol: config.symbol,
                supply: config.supply,
                decimal: config.decimal,
            })
            : undefined;
        const suppliedExtension = config.extensionData === undefined
            ? undefined
            : bufferFrom(config.extensionData, "extensionData");
        if (declaredMetadata && suppliedExtension &&
            !declaredMetadata.extensionData.equals(suppliedExtension)) {
            fail("extensionData differs from canonical declared metadata");
        }
        let tapeSize = config.tapeSize;
        let tapeScript = "";
        let extension = declaredMetadata?.extensionData ??
            suppliedExtension ??
            Buffer.from(DEFAULT_TAPE_EXTENSION);
        if (config.tapeScript !== undefined) {
            const parsed = TBC20.parseTape(config.tapeScript);
            tapeScript = scriptFrom(config.tapeScript, "tapeScript").toHex();
            if (suppliedExtension && !suppliedExtension.equals(parsed.extensionData)) {
                fail("extensionData differs from tapeScript extension data");
            }
            if (declaredMetadata && !declaredMetadata.extensionData.equals(parsed.extensionData)) {
                fail("declared metadata differs from tapeScript extension data");
            }
            extension = parsed.extensionData;
            if (tapeSize !== undefined && tapeSize !== parsed.size) {
                fail("tapeSize differs from tapeScript size");
            }
            tapeSize = parsed.size;
        }
        const resolvedSize = tapeSize ?? TAPE_ENVELOPE_BYTES + extension.length;
        assertTapeSize(resolvedSize);
        if (resolvedSize !== TAPE_ENVELOPE_BYTES + extension.length) {
            fail(`tapeSize ${resolvedSize} requires exactly ${resolvedSize - TAPE_ENVELOPE_BYTES} extension bytes`);
        }
        this.tapeSize = resolvedSize;
        this._extensionData = Buffer.from(extension);
        const decodedMetadata = declaredMetadata ?? tryDecodeTBC20Metadata(this._extensionData);
        this.metadata = decodedMetadata?.metadata;
        this.declaredSupplyRaw = decodedMetadata?.declaredSupplyRaw;
        this.name = this.metadata?.name;
        this.symbol = this.metadata?.symbol;
        this.supply = this.metadata?.supply;
        this.decimal = this.metadata?.decimal;
        this.tapeScript = tapeScript;
        this.codeScript = config.codeScript === undefined
            ? ""
            : scriptFrom(config.codeScript, "codeScript").toHex();
        if (this.codeScript) {
            TBC20.validateCode(this.codeScript, this.tapeSize);
        }
        this.contractTxid = config.contractTxid === undefined
            ? ""
            : assertTxid(config.contractTxid, "contractTxid");
    }
    get extensionData() {
        return Buffer.from(this._extensionData);
    }
    static lockHexTemplate = TBC20_LOCK_HEX_TEMPLATE;
    static artifactSha256 = TBC20_ARTIFACT_SHA256;
    static codeBytes = TBC20_CODE_BYTES;
    static partialOffset = TBC20_CODE_PARTIAL_OFFSET;
    static minTapeBytes = MIN_TAPE_BYTES;
    static maxTapeBytes = 127;
    static maxSlotAmount = tbc20unlock_1.TBC20_MAX_SLOT_AMOUNT;
    static feeRateSatoshisPerKb = TBC20_FEE_RATE_SATOSHIS_PER_KB;
    static minimumFeeSatoshis = TBC20_MIN_FEE_SATOSHIS;
    static metadataVersion = TBC20_METADATA_VERSION;
    static humanToRaw(amount, decimal) {
        return humanAmountToRaw(amount, decimal, "amount");
    }
    static rawToHuman(amountRaw, decimal) {
        return rawAmountToHuman(amountRaw, decimal, "amountRaw");
    }
    static buildMetadataExtension(definition) {
        return Buffer.from(encodeTBC20Metadata(definition).extensionData);
    }
    static parseMetadataExtension(extensionData) {
        const decoded = decodeTBC20Metadata(extensionData);
        return {
            metadata: decoded.metadata,
            declaredSupplyRaw: decoded.declaredSupplyRaw,
        };
    }
    static feeForSize(sizeBytes) {
        return feeForSize(sizeBytes);
    }
    static addressController(address) {
        if (typeof address !== "string" || address.trim() === "") {
            fail("address is required");
        }
        try {
            const parsed = tbc.Address.fromString(address);
            if (parsed.type !== tbc.Address.PayToPublicKeyHash) {
                fail("address controller must be a P2PKH address");
            }
            return Buffer.concat([
                parsed.hashBuffer,
                Buffer.from([0]),
            ]);
        }
        catch (error) {
            fail(`invalid address: ${error.message}`);
        }
    }
    static contractController(lockingScript) {
        const script = scriptFrom(lockingScript, "contract lockingScript");
        if (script.toBuffer().length === 0) {
            fail("contract lockingScript cannot be empty");
        }
        const scriptHash = tbc.crypto.Hash.sha256(script.toBuffer());
        return Buffer.concat([
            tbc.crypto.Hash.sha256ripemd160(scriptHash),
            Buffer.from([1]),
        ]);
    }
    static encodeOriginalUTXO(outpoint) {
        if (!outpoint || typeof outpoint !== "object") {
            fail("originalUTXO is required");
        }
        const txid = assertTxid(outpoint.txId, "originalUTXO.txId");
        assertVout(outpoint.outputIndex, "originalUTXO.outputIndex");
        const writer = new tbc.encoding.BufferWriter();
        writer.writeReverse(Buffer.from(txid, "hex"));
        writer.writeUInt32LE(outpoint.outputIndex);
        return writer.toBuffer();
    }
    static instantiateCode(options) {
        if (!options || typeof options !== "object") {
            fail("instantiateCode options are required");
        }
        assertTapeSize(options.tapeSize);
        const original = typeof options.originalUTXO === "object" && !Buffer.isBuffer(options.originalUTXO)
            ? TBC20.encodeOriginalUTXO(options.originalUTXO)
            : bufferFrom(options.originalUTXO, "originalUTXO");
        if (original.length !== 36) {
            fail(`originalUTXO must be exactly 36 bytes, got ${original.length}`);
        }
        const controller = normalizeController(options.controller, "controller");
        const counts = {
            original: (TBC20_LOCK_HEX_TEMPLATE.match(/<self\.OriginalUTXO36>/g) ?? []).length,
            tape: (TBC20_LOCK_HEX_TEMPLATE.match(/<self\.ConstTapeSize1>/g) ?? []).length,
            controller: (TBC20_LOCK_HEX_TEMPLATE.match(/<self\.Controller21>/g) ?? []).length,
        };
        if (counts.original !== 1 || counts.tape !== 17 || counts.controller !== 1) {
            fail(`embedded artifact placeholders changed unexpectedly (${JSON.stringify(counts)})`);
        }
        const hex = TBC20_LOCK_HEX_TEMPLATE
            .replaceAll("<self.OriginalUTXO36>", pushHex(original))
            .replaceAll("<self.ConstTapeSize1>", pushHex(Buffer.from([options.tapeSize])))
            .replaceAll("<self.Controller21>", pushHex(controller));
        if (hex.includes("<") || hex.includes(">") || !/^[0-9a-f]+$/.test(hex)) {
            fail("compiled lock template still contains an unresolved placeholder");
        }
        const script = tbc.Script.fromHex(hex);
        if (script.toBuffer().length !== TBC20_CODE_BYTES) {
            fail(`instantiated code must be ${TBC20_CODE_BYTES} bytes, got ${script.toBuffer().length}`);
        }
        if (!(0, tbc20unlock_1.getTBC20Controller)(script).equals(controller)) {
            fail("instantiated code controller differs from requested controller");
        }
        TBC20.validateCode(script, options.tapeSize);
        return script;
    }
    static validateCode(codeScript, tapeSize) {
        const script = scriptFrom(codeScript, "codeScript");
        const code = script.toBuffer();
        if (code.length !== TBC20_CODE_BYTES) {
            fail(`codeScript must be ${TBC20_CODE_BYTES} bytes`);
        }
        let offset = 0;
        let embeddedTapeSize;
        for (const segment of TBC20_TEMPLATE_SEGMENTS) {
            if (segment === "<self.OriginalUTXO36>") {
                if (code[offset] !== 36)
                    fail("codeScript OriginalUTXO must use a direct 36-byte push");
                offset += 37;
            }
            else if (segment === "<self.ConstTapeSize1>") {
                if (code[offset] !== 1)
                    fail("codeScript ConstTapeSize must use a direct one-byte push");
                const currentTapeSize = code[offset + 1];
                if (embeddedTapeSize === undefined)
                    embeddedTapeSize = currentTapeSize;
                if (embeddedTapeSize !== currentTapeSize)
                    fail("codeScript contains inconsistent ConstTapeSize values");
                offset += 2;
            }
            else if (segment === "<self.Controller21>") {
                if (code[offset] !== 21)
                    fail("codeScript Controller must use a direct 21-byte push");
                offset += 22;
            }
            else {
                const constant = Buffer.from(segment, "hex");
                if (!code.subarray(offset, offset + constant.length).equals(constant)) {
                    fail(`codeScript differs from the embedded compiler artifact at byte ${offset}`);
                }
                offset += constant.length;
            }
        }
        if (offset !== code.length)
            fail("codeScript has trailing bytes outside the compiler artifact");
        if (embeddedTapeSize === undefined)
            fail("codeScript has no embedded ConstTapeSize");
        assertTapeSize(embeddedTapeSize);
        if (tapeSize !== undefined && embeddedTapeSize !== tapeSize) {
            fail(`codeScript ConstTapeSize ${embeddedTapeSize} differs from expected tapeSize ${tapeSize}`);
        }
        const partial = (0, tbc20unlock_1.getTBC20CodeIdentity)(script);
        if (partial.length < 33) {
            fail("codeScript did not produce the expected partial hash identity");
        }
        normalizeController((0, tbc20unlock_1.getTBC20Controller)(script), "codeScript controller");
        if (tapeSize !== undefined)
            assertTapeSize(tapeSize);
    }
    static replaceController(codeScript, controllerValue) {
        const script = scriptFrom(codeScript, "codeScript");
        TBC20.validateCode(script);
        const controller = normalizeController(controllerValue, "controller");
        const code = Buffer.from(script.toBuffer());
        const controllerPushOffset = code.length - 28;
        if (controllerPushOffset !== TBC20_CODE_PARTIAL_OFFSET || code[controllerPushOffset] !== 21) {
            fail("codeScript has a non-canonical terminal controller position");
        }
        controller.copy(code, controllerPushOffset + 1);
        const updated = tbc.Script.fromBuffer(code);
        if (!(0, tbc20unlock_1.getTBC20CodeIdentity)(updated).equals((0, tbc20unlock_1.getTBC20CodeIdentity)(script))) {
            fail("controller replacement unexpectedly changed the TBC20 code identity");
        }
        return updated;
    }
    static buildTape(amounts, tapeSize = MIN_TAPE_BYTES, extensionData = DEFAULT_TAPE_EXTENSION) {
        assertTapeSize(tapeSize);
        if (!Array.isArray(amounts) || amounts.length !== tbc20unlock_1.TBC20_AMOUNT_SLOTS) {
            fail(`amounts must contain exactly ${tbc20unlock_1.TBC20_AMOUNT_SLOTS} bigint entries`);
        }
        const extension = bufferFrom(extensionData, "extensionData");
        if (extension.length !== tapeSize - TAPE_ENVELOPE_BYTES) {
            fail(`tapeSize ${tapeSize} requires exactly ${tapeSize - TAPE_ENVELOPE_BYTES} extension bytes`);
        }
        const amountData = Buffer.alloc(tbc20unlock_1.TBC20_AMOUNT_SLOTS * 8);
        amounts.forEach((amount, index) => {
            assertSlotAmount(amount, `amounts[${index}]`, true);
            amountData.writeBigUInt64LE(amount, index * 8);
        });
        const buffer = Buffer.concat([
            tbc20unlock_1.TBC20_TAPE_PREFIX,
            amountData,
            extension,
            tbc20unlock_1.TBC20_TAPE_MARKER,
        ]);
        assertRelaySafeTape(buffer);
        return tbc.Script.fromBuffer(buffer);
    }
    static parseTape(tapeScript) {
        const script = scriptFrom(tapeScript, "tapeScript");
        const size = script.toBuffer().length;
        assertTapeSize(size);
        assertRelaySafeTape(script.toBuffer());
        const amounts = (0, tbc20unlock_1.readTBC20TapeAmounts)(script);
        return {
            amounts,
            balance: amounts.reduce((sum, amount) => sum + amount, 0n),
            extensionData: Buffer.from(script.toBuffer().subarray(tbc20unlock_1.TBC20_TAPE_PREFIX.length + tbc20unlock_1.TBC20_AMOUNT_SLOTS * 8, size - tbc20unlock_1.TBC20_TAPE_MARKER.length)),
            size,
        };
    }
    static buildUTXO(tx, codeVout) {
        assertTransaction(tx, "tx");
        assertVout(codeVout, "codeVout");
        if (codeVout + 1 >= tx.outputs.length) {
            fail("TBC20 code output must be immediately followed by a tape output");
        }
        const code = tx.outputs[codeVout];
        const tape = tx.outputs[codeVout + 1];
        if (code.satoshis !== tbc20unlock_1.TBC20_CODE_SATOSHIS || tape.satoshis !== 0) {
            fail("TBC20 code/tape values must be exactly 500/0 satoshis");
        }
        const tapeData = TBC20.parseTape(tape.script);
        TBC20.validateCode(code.script, tapeData.size);
        return {
            txId: tx.hash,
            outputIndex: codeVout,
            script: code.script.toHex(),
            satoshis: code.satoshis,
            ftBalance: tapeData.balance,
        };
    }
    static getUnlockScript = tbc20unlock_1.buildTBC20UnlockScript;
    static getUnlockScriptWithSignature = tbc20unlock_1.buildTBC20UnlockScriptWithSignature;
    static attachUnlockScript(options) {
        if (!options || typeof options !== "object")
            fail("attachUnlockScript options are required");
        assertTransaction(options.transaction, "transaction");
        const transactionInternals = options.transaction;
        if ((transactionInternals._inputsMap?.size ?? 0) !== 0 ||
            (transactionInternals._outputsMap?.size ?? 0) !== 0 ||
            transactionInternals._changeScript !== undefined ||
            transactionInternals._privateKey !== undefined) {
            fail("attachUnlockScript requires fee and outputs to be frozen with no pending signer, callback, or automatic change");
        }
        const rawBeforeFreeze = options.transaction.uncheckedSerialize();
        if (!options.transaction.isSealed()) {
            // With no pending callbacks/signers/change, seal only marks the immutable
            // core as final. Literal input scripts may still be installed afterward.
            options.transaction.seal();
        }
        if (options.transaction.uncheckedSerialize() !== rawBeforeFreeze) {
            fail("attachUnlockScript freeze unexpectedly changed the transaction");
        }
        if (options.transaction.inputs.length > tbc20unlock_1.TBC20_MAX_INPUTS) {
            fail(`attachUnlockScript transaction must contain at most ${tbc20unlock_1.TBC20_MAX_INPUTS} inputs so its TBC20 outputs remain spendable`);
        }
        if (!Number.isSafeInteger(options.inputIndex) || options.inputIndex < 0 || options.inputIndex >= options.transaction.inputs.length) {
            fail("attachUnlockScript.inputIndex is outside transaction inputs");
        }
        if (options.inputIndex >= tbc20unlock_1.TBC20_AMOUNT_SLOTS) {
            fail(`a TBC20 input must be in current vin 0-${tbc20unlock_1.TBC20_AMOUNT_SLOTS - 1}`);
        }
        if (!options.tokenInput || typeof options.tokenInput !== "object")
            fail("attachUnlockScript.tokenInput is required");
        validateUTXO(options.tokenInput.utxo, "attachUnlockScript.tokenInput.utxo");
        assertTransaction(options.tokenInput.parentTx, "attachUnlockScript.tokenInput.parentTx");
        assertPrivateKey(options.tokenInput.signingKey, "attachUnlockScript.tokenInput.signingKey");
        const parentVout = options.tokenInput.utxo.outputIndex;
        if (parentVout + 1 >= options.tokenInput.parentTx.outputs.length) {
            fail("attachUnlockScript token parent has no adjacent tape output");
        }
        const parentCode = options.tokenInput.parentTx.outputs[parentVout];
        const parentTape = options.tokenInput.parentTx.outputs[parentVout + 1];
        if (parentCode.satoshis !== tbc20unlock_1.TBC20_CODE_SATOSHIS || parentTape.satoshis !== 0) {
            fail("attachUnlockScript token parent code/tape values must be 500/0");
        }
        const parentTapeData = TBC20.parseTape(parentTape.script);
        TBC20.validateCode(parentCode.script, parentTapeData.size);
        const expected = options.transaction.inputs[options.inputIndex];
        if (expected.prevTxId.toString("hex").toLowerCase() !== options.tokenInput.utxo.txId.toLowerCase() ||
            expected.outputIndex !== options.tokenInput.utxo.outputIndex) {
            fail("attachUnlockScript input does not spend tokenInput.utxo");
        }
        (0, tbc20unlock_1.getTBC20CurrentOutputData)(options.transaction, options.outputGroups);
        const unlockingScript = buildTBC20UnlockOnce(options.transaction, options.inputIndex, options.tokenInput, options.outputGroups);
        // Literal scripts do not enter tbc-lib's callback map, so a later seal()
        // cannot generate this signature a second time.
        options.transaction.setInputScript(options.inputIndex, unlockingScript);
        if (options.verify === true) {
            const result = options.transaction.verifyScript(options.inputIndex);
            if (!result.success) {
                fail(`input ${options.inputIndex} failed local verification: ${result.error} at pc ${result.failedAt?.pc ?? "unknown"}`);
            }
        }
        return unlockingScript;
    }
    validateTokenInput(input, index) {
        if (!input || typeof input !== "object") {
            fail(`inputs[${index}] is required`);
        }
        validateUTXO(input.utxo, `inputs[${index}].utxo`);
        assertTransaction(input.parentTx, `inputs[${index}].parentTx`);
        assertPrivateKey(input.signingKey, `inputs[${index}].signingKey`);
        const vout = input.utxo.outputIndex;
        if (input.parentTx.hash.toLowerCase() !== input.utxo.txId.toLowerCase()) {
            fail(`inputs[${index}].utxo txId does not match parentTx`);
        }
        if (vout + 1 >= input.parentTx.outputs.length) {
            fail(`inputs[${index}] parent code output has no adjacent tape output`);
        }
        const codeOutput = input.parentTx.outputs[vout];
        const tapeOutput = input.parentTx.outputs[vout + 1];
        if (codeOutput.satoshis !== tbc20unlock_1.TBC20_CODE_SATOSHIS || tapeOutput.satoshis !== 0) {
            fail(`inputs[${index}] parent code/tape values must be 500/0`);
        }
        if (input.utxo.satoshis !== codeOutput.satoshis || outputScriptHex(input.utxo) !== codeOutput.script.toHex().toLowerCase()) {
            fail(`inputs[${index}].utxo differs from parentTx output`);
        }
        TBC20.validateCode(codeOutput.script, this.tapeSize);
        if (this.codeScript && !(0, tbc20unlock_1.getTBC20CodeIdentity)(codeOutput.script).equals((0, tbc20unlock_1.getTBC20CodeIdentity)(tbc.Script.fromHex(this.codeScript)))) {
            fail(`inputs[${index}] belongs to a different TBC20 instance`);
        }
        const tapeData = TBC20.parseTape(tapeOutput.script);
        if (tapeData.size !== this.tapeSize) {
            fail(`inputs[${index}] tape size differs from this TBC20 instance`);
        }
        if (!tapeData.extensionData.equals(this.extensionData)) {
            fail(`inputs[${index}] tape extension data differs from this TBC20 instance`);
        }
        const controller = (0, tbc20unlock_1.getTBC20Controller)(codeOutput.script);
        if (controller[20] === 0) {
            const keyHash = tbc.crypto.Hash.sha256ripemd160(input.signingKey.toPublicKey().toBuffer());
            if (!keyHash.equals(controller.subarray(0, 20))) {
                fail(`inputs[${index}].signingKey does not match its address controller`);
            }
            if (input.contractController !== undefined) {
                fail(`inputs[${index}].contractController must be omitted for address control`);
            }
        }
        else if (!input.contractController) {
            fail(`inputs[${index}] is contract-controlled and requires contractController proof`);
        }
        return {
            source: input,
            codeScript: codeOutput.script,
            tapeScript: tapeOutput.script,
            balance: tapeData.balance,
            controller,
            identity: (0, tbc20unlock_1.getTBC20CodeIdentity)(codeOutput.script),
        };
    }
    mint(privateKey, recipient, amountOrFundingUTXO, fundingUTXOOrOptions = {}, maybeOptions = {}) {
        const amount = typeof amountOrFundingUTXO === "bigint"
            ? amountOrFundingUTXO
            : this.declaredSupplyRaw;
        if (amount === undefined) {
            fail("mint amount is required when constructor metadata does not declare supply");
        }
        const fundingUTXO = typeof amountOrFundingUTXO === "bigint"
            ? fundingUTXOOrOptions
            : amountOrFundingUTXO;
        const options = typeof amountOrFundingUTXO === "bigint"
            ? maybeOptions
            : fundingUTXOOrOptions;
        if (this.declaredSupplyRaw !== undefined && amount !== this.declaredSupplyRaw) {
            fail("mint amount must equal constructor metadata declaredSupplyRaw");
        }
        if (this.codeScript !== "" || this.tapeScript !== "" || this.contractTxid !== "") {
            fail("mint requires an uninitialized TBC20 instance and cannot overwrite an existing token identity");
        }
        assertPrivateKey(privateKey, "privateKey");
        assertSlotAmount(amount, "amount");
        validateUTXO(fundingUTXO, "fundingUTXO");
        assertP2PKHOwner(fundingUTXO, privateKey, "fundingUTXO");
        if (!options || typeof options !== "object" || Array.isArray(options)) {
            fail("mint options must be an object");
        }
        if ("sourceFeeSatoshis" in options || "genesisFeeSatoshis" in options) {
            fail("mint uses the fixed 80 sat/KB policy; explicit fee fields are not accepted");
        }
        const buildSource = (sourceValue, estimated) => {
            const transaction = new tbc.Transaction()
                .from(fundingUTXO)
                .addOutput(new tbc.Transaction.Output({
                script: tbc.Script.buildPublicKeyHashOut(privateKey.toAddress()),
                satoshis: sourceValue,
            }));
            transaction.setInputScript(0, estimated
                ? buildEstimatedP2PKHUnlock(privateKey)
                : buildP2PKHUnlock(transaction, 0, privateKey));
            if (!estimated)
                transaction.seal();
            return transaction;
        };
        const estimatedSourceValue = fundingUTXO.satoshis - TBC20_MIN_FEE_SATOSHIS;
        if (estimatedSourceValue <= 0) {
            fail("fundingUTXO is too small for the source transaction fee");
        }
        const sourceFee = feeForSize(serializedSize(buildSource(estimatedSourceValue, true)));
        const sourceValue = fundingUTXO.satoshis - sourceFee;
        if (sourceValue < tbc20unlock_1.TBC20_CODE_SATOSHIS + TBC20_MIN_FEE_SATOSHIS) {
            fail("fundingUTXO is too small for source, genesis code output, and automatic fees");
        }
        const source = buildSource(sourceValue, false);
        const paidSourceFee = checkedAutomaticFee("mint source", [fundingUTXO], source);
        const originalUTXO = { txId: source.hash, outputIndex: 0 };
        const controller = normalizeController(recipient, "recipient");
        const code = TBC20.instantiateCode({
            originalUTXO,
            tapeSize: this.tapeSize,
            controller,
        });
        const tape = TBC20.buildTape([amount, 0n, 0n, 0n, 0n, 0n], this.tapeSize, this.extensionData);
        const sourceUTXO = {
            txId: source.hash,
            outputIndex: 0,
            script: source.outputs[0].script.toHex(),
            satoshis: sourceValue,
        };
        const buildGenesis = (change, estimated) => {
            const transaction = new tbc.Transaction()
                .addInputFromPrevTx(source, 0)
                .addOutput(new tbc.Transaction.Output({ script: code, satoshis: tbc20unlock_1.TBC20_CODE_SATOSHIS }))
                .addOutput(new tbc.Transaction.Output({ script: tape, satoshis: 0 }));
            const outputGroups = [{ codeVout: 0, tapeVout: 1 }];
            if (change !== undefined) {
                transaction.addOutput(new tbc.Transaction.Output({
                    script: tbc.Script.buildPublicKeyHashOut(privateKey.toAddress()),
                    satoshis: change,
                }));
                outputGroups.push({ codeVout: 2 });
            }
            transaction.setInputScript(0, estimated
                ? buildEstimatedP2PKHUnlock(privateKey)
                : buildP2PKHUnlock(transaction, 0, privateKey));
            if (!estimated)
                transaction.seal();
            return { transaction, outputGroups };
        };
        const availableGenesisFee = sourceValue - tbc20unlock_1.TBC20_CODE_SATOSHIS;
        if (availableGenesisFee < 0) {
            fail("source output is too small for the genesis code output");
        }
        const withChangeEstimate = buildGenesis(TBC_DUST_AMOUNT, true).transaction;
        const withChangeFee = feeForSize(serializedSize(withChangeEstimate));
        const calculatedChange = availableGenesisFee - withChangeFee;
        let selectedChange;
        if (calculatedChange >= TBC_DUST_AMOUNT) {
            selectedChange = calculatedChange;
        }
        else {
            const noChangeFee = feeForSize(serializedSize(buildGenesis(undefined, true).transaction));
            if (availableGenesisFee < noChangeFee) {
                fail(`source output can pay only ${availableGenesisFee} sat; genesis requires ${noChangeFee} sat`);
            }
        }
        const genesisBuild = buildGenesis(selectedChange, false);
        const genesis = genesisBuild.transaction;
        const groups = genesisBuild.outputGroups;
        const paidGenesisFee = checkedAutomaticFee("mint genesis", [sourceUTXO], genesis);
        if (options.verify !== false) {
            const sourceResult = source.verifyScript(0);
            if (!sourceResult.success) {
                fail(`source input failed local verification: ${sourceResult.error}`);
            }
            const genesisResult = genesis.verifyScript(0);
            if (!genesisResult.success) {
                fail(`genesis input failed local verification: ${genesisResult.error}`);
            }
        }
        this.codeScript = code.toHex();
        this.tapeScript = tape.toHex();
        this.contractTxid = genesis.hash;
        return {
            sourceTransaction: source,
            sourceTxraw: source.uncheckedSerialize(),
            sourceFeeSatoshis: paidSourceFee,
            originalUTXO,
            transaction: genesis,
            txraw: genesis.uncheckedSerialize(),
            feeSatoshis: paidGenesisFee,
            tokenOutputs: [{
                    codeVout: 0,
                    tapeVout: 1,
                    amount,
                    amountsByInput: [amount, 0n, 0n, 0n, 0n, 0n],
                    controller,
                }],
            outputGroups: groups,
        };
    }
    MintTBC20(privateKey, recipient, amountOrFundingUTXO, fundingUTXOOrOptions = {}, maybeOptions = {}) {
        if (typeof amountOrFundingUTXO === "bigint") {
            return this.mint(privateKey, recipient, amountOrFundingUTXO, fundingUTXOOrOptions, maybeOptions);
        }
        return this.mint(privateKey, recipient, amountOrFundingUTXO, fundingUTXOOrOptions);
    }
    transfer(optionsOrPrivateKey, recipient, humanAmount, tokenUTXOs, feeUTXO, parentTxs, ancestorResolvers, positionalOptions = {}) {
        let options;
        if (optionsOrPrivateKey instanceof tbc.PrivateKey) {
            if (recipient === undefined || humanAmount === undefined ||
                tokenUTXOs === undefined || feeUTXO === undefined ||
                parentTxs === undefined || ancestorResolvers === undefined) {
                fail("positional transfer requires recipient, humanAmount, tokenUTXOs, feeUTXO, parentTxs, and ancestorResolvers");
            }
            if (!positionalOptions || typeof positionalOptions !== "object" || Array.isArray(positionalOptions)) {
                fail("positional transfer options must be an object");
            }
            if (positionalOptions.additionalInputs !== undefined &&
                !Array.isArray(positionalOptions.additionalInputs)) {
                fail("positional transfer additionalInputs must be an array");
            }
            const additionalCount = positionalOptions.additionalInputs?.length ?? 0;
            const maximumTokenInputs = tbc20unlock_1.TBC20_MAX_INPUTS - 1 - additionalCount;
            if (maximumTokenInputs < 1) {
                fail("positional transfer additionalInputs leave no room for a token input and the mandatory fee input");
            }
            if (!Array.isArray(tokenUTXOs) || tokenUTXOs.length < 1 || tokenUTXOs.length > maximumTokenInputs) {
                fail(`positional transfer tokenUTXOs must contain 1-${maximumTokenInputs} inputs after reserving one fee input and ${additionalCount} additional inputs`);
            }
            if (this.decimal === undefined) {
                fail("positional human transfer requires constructor metadata with decimal");
            }
            const inputs = buildPositionalTokenInputs(optionsOrPrivateKey, tokenUTXOs, parentTxs, ancestorResolvers, positionalOptions.contractControllers, "positional transfer");
            options = {
                inputs,
                receivers: [{
                        controller: recipient,
                        amount: humanAmountToRaw(humanAmount, this.decimal, "humanAmount"),
                    }],
                feeInputs: [{ utxo: feeUTXO, privateKey: optionsOrPrivateKey }],
                additionalInputs: positionalOptions.additionalInputs,
                tokenChangeController: positionalOptions.tokenChangeController,
                tbcChangeAddress: positionalOptions.tbcChangeAddress,
                verify: positionalOptions.verify,
            };
        }
        else {
            options = optionsOrPrivateKey;
        }
        if (!options || typeof options !== "object") {
            fail("transfer options are required");
        }
        if ("feeSatoshis" in options) {
            fail("transfer uses the fixed 80 sat/KB policy; feeSatoshis is not accepted");
        }
        const tokenInputs = options.inputs;
        const receivers = options.receivers;
        const feeInputs = options.feeInputs ?? [];
        const additionalInputs = options.additionalInputs ?? [];
        if (!Array.isArray(tokenInputs) || tokenInputs.length < 1 || tokenInputs.length > tbc20unlock_1.TBC20_MAX_INPUTS) {
            fail(`inputs must contain 1-${tbc20unlock_1.TBC20_MAX_INPUTS} TBC20 inputs`);
        }
        if (!Array.isArray(receivers) || receivers.length < 1) {
            fail("receivers must contain at least one recipient");
        }
        if (!Array.isArray(feeInputs) || !Array.isArray(additionalInputs)) {
            fail("feeInputs and additionalInputs must be arrays");
        }
        if (tokenInputs.length + feeInputs.length + additionalInputs.length > tbc20unlock_1.TBC20_MAX_INPUTS) {
            fail(`generated TBC20 transaction must contain at most ${tbc20unlock_1.TBC20_MAX_INPUTS} total inputs`);
        }
        const validated = tokenInputs.map((input, index) => this.validateTokenInput(input, index));
        const identity = validated[0].identity;
        const canonicalTape = validated[0].tapeScript.toBuffer();
        validated.forEach((input, index) => {
            if (!input.identity.equals(identity)) {
                fail(`inputs[${index}] belongs to a different TBC20 code identity`);
            }
            const candidateTape = input.tapeScript.toBuffer();
            const canonicalEnvelope = Buffer.concat([canonicalTape.subarray(0, 3), canonicalTape.subarray(51)]);
            const candidateEnvelope = Buffer.concat([candidateTape.subarray(0, 3), candidateTape.subarray(51)]);
            if (!candidateEnvelope.equals(canonicalEnvelope)) {
                fail(`inputs[${index}] uses a different tape envelope`);
            }
        });
        feeInputs.forEach((input, index) => {
            if (!input || typeof input !== "object")
                fail(`feeInputs[${index}] is required`);
            validateUTXO(input.utxo, `feeInputs[${index}].utxo`);
            assertP2PKHOwner(input.utxo, input.privateKey, `feeInputs[${index}]`);
        });
        additionalInputs.forEach((input, index) => {
            if (!input || typeof input !== "object")
                fail(`additionalInputs[${index}] is required`);
            validateUTXO(input.utxo, `additionalInputs[${index}].utxo`);
            if (!(input.unlock instanceof tbc.Script) && typeof input.unlock !== "function") {
                fail(`additionalInputs[${index}].unlock must be a Script or callback`);
            }
            if (typeof input.unlock === "function") {
                if (!Number.isSafeInteger(input.maxUnlockScriptBytes) ||
                    input.maxUnlockScriptBytes < 0 ||
                    input.maxUnlockScriptBytes > TBC20_MAX_ADDITIONAL_UNLOCK_BYTES) {
                    fail(`additionalInputs[${index}].maxUnlockScriptBytes must be an integer in [0, ${TBC20_MAX_ADDITIONAL_UNLOCK_BYTES}]`);
                }
            }
            else if (input.maxUnlockScriptBytes !== undefined) {
                fail(`additionalInputs[${index}].maxUnlockScriptBytes is only valid for callback unlocks`);
            }
        });
        const allUTXOs = [
            ...tokenInputs.map((input) => input.utxo),
            ...feeInputs.map((input) => input.utxo),
            ...additionalInputs.map((input) => input.utxo),
        ];
        validateUniqueOutpoints(allUTXOs);
        const balances = validated.map((input) => input.balance);
        const totalInputAmount = balances.reduce((sum, amount) => sum + amount, 0n);
        const remaining = balances.slice();
        const outputPlans = [];
        const allocateOutputPlans = (controller, requested) => {
            let needed = requested;
            while (needed > 0n) {
                const slots = Array.from({ length: tbc20unlock_1.TBC20_AMOUNT_SLOTS }, () => 0n);
                let allocated = 0n;
                for (let inputIndex = 0; inputIndex < remaining.length && needed > 0n; inputIndex += 1) {
                    const availableInSlot = remaining[inputIndex] < tbc20unlock_1.TBC20_MAX_SLOT_AMOUNT
                        ? remaining[inputIndex]
                        : tbc20unlock_1.TBC20_MAX_SLOT_AMOUNT;
                    const used = availableInSlot < needed ? availableInSlot : needed;
                    slots[inputIndex] = used;
                    remaining[inputIndex] -= used;
                    needed -= used;
                    allocated += used;
                }
                if (allocated === 0n)
                    fail("internal amount allocation error");
                outputPlans.push({ controller: Buffer.from(controller), amount: allocated, slots });
                if (outputPlans.length > tbc20unlock_1.TBC20_MAX_OUTPUT_GROUPS) {
                    fail(`token amounts require more than ${tbc20unlock_1.TBC20_MAX_OUTPUT_GROUPS} output groups`);
                }
            }
        };
        let requestedAmount = 0n;
        receivers.forEach((receiver, receiverIndex) => {
            if (!receiver || typeof receiver !== "object")
                fail(`receivers[${receiverIndex}] is required`);
            assertPositiveAmount(receiver.amount, `receivers[${receiverIndex}].amount`);
            requestedAmount += receiver.amount;
            if (requestedAmount > totalInputAmount) {
                fail("receiver amount total exceeds available TBC20 balance");
            }
            allocateOutputPlans(normalizeController(receiver.controller, `receivers[${receiverIndex}].controller`), receiver.amount);
        });
        const tokenChange = remaining.reduce((sum, amount) => sum + amount, 0n);
        if (tokenChange > 0n) {
            const changeController = options.tokenChangeController === undefined
                ? validated[0].controller
                : normalizeController(options.tokenChangeController, "tokenChangeController");
            allocateOutputPlans(changeController, tokenChange);
        }
        if (outputPlans.length > tbc20unlock_1.TBC20_MAX_OUTPUT_GROUPS) {
            fail(`token outputs require ${outputPlans.length} groups; maximum is ${tbc20unlock_1.TBC20_MAX_OUTPUT_GROUPS}`);
        }
        const totalSatoshisIn = inputAmountSum(allUTXOs);
        const fixedOutputSatoshis = outputPlans.length * tbc20unlock_1.TBC20_CODE_SATOSHIS;
        const availableFeeAndChange = totalSatoshisIn - fixedOutputSatoshis;
        if (availableFeeAndChange < 0) {
            fail("input satoshis are insufficient for the TBC20 code outputs");
        }
        let changeAddress = options.tbcChangeAddress;
        if (!changeAddress) {
            const fallbackKey = feeInputs[0]?.privateKey ?? tokenInputs[0].signingKey;
            changeAddress = fallbackKey.toAddress().toString();
        }
        if (!changeAddress)
            fail("unable to resolve tbcChangeAddress");
        TBC20.addressController(changeAddress);
        const buildTransaction = (tbcChange, estimated) => {
            const transaction = new tbc.Transaction();
            allUTXOs.forEach((utxo) => transaction.from(utxo));
            const outputGroups = [];
            const tokenOutputs = [];
            outputPlans.forEach((plan) => {
                const codeVout = transaction.outputs.length;
                const code = TBC20.replaceController(validated[0].codeScript, plan.controller);
                const tape = (0, tbc20unlock_1.replaceTBC20TapeAmounts)(validated[0].tapeScript, plan.slots);
                transaction.addOutput(new tbc.Transaction.Output({ script: code, satoshis: tbc20unlock_1.TBC20_CODE_SATOSHIS }));
                transaction.addOutput(new tbc.Transaction.Output({ script: tape, satoshis: 0 }));
                outputGroups.push({ codeVout, tapeVout: codeVout + 1 });
                tokenOutputs.push({
                    codeVout,
                    tapeVout: codeVout + 1,
                    amount: plan.amount,
                    amountsByInput: plan.slots.slice(),
                    controller: Buffer.from(plan.controller),
                });
            });
            if (tbcChange !== undefined) {
                const changeVout = transaction.outputs.length;
                transaction.addOutput(new tbc.Transaction.Output({
                    script: tbc.Script.buildPublicKeyHashOut(tbc.Address.fromString(changeAddress)),
                    satoshis: tbcChange,
                }));
                outputGroups.push({ codeVout: changeVout });
            }
            if (outputGroups.length > tbc20unlock_1.TBC20_MAX_OUTPUT_GROUPS || transaction.outputs.length > 16) {
                fail("current transaction exceeds eight logical or sixteen physical outputs");
            }
            const placeholderScripts = [];
            tokenInputs.forEach((input, inputIndex) => {
                const script = buildEstimatedTBC20Unlock(transaction, inputIndex, input, outputGroups);
                placeholderScripts[inputIndex] = script;
                transaction.setInputScript(inputIndex, script);
            });
            feeInputs.forEach((input, feeIndex) => {
                const inputIndex = tokenInputs.length + feeIndex;
                const script = buildEstimatedP2PKHUnlock(input.privateKey);
                placeholderScripts[inputIndex] = script;
                transaction.setInputScript(inputIndex, script);
            });
            additionalInputs.forEach((input, additionalIndex) => {
                const inputIndex = tokenInputs.length + feeInputs.length + additionalIndex;
                const script = buildEstimatedAdditionalUnlock(input);
                placeholderScripts[inputIndex] = script;
                transaction.setInputScript(inputIndex, script);
            });
            const reservedBytes = serializedSize(transaction);
            if (!estimated) {
                // Collect every real script while all siblings are still placeholders.
                // FORKID sighash and the TBC20 current-input proof exclude scriptSig,
                // so each input can be signed exactly once in any order.
                const finalScripts = [];
                tokenInputs.forEach((input, inputIndex) => {
                    finalScripts[inputIndex] = buildTBC20UnlockOnce(transaction, inputIndex, input, outputGroups);
                });
                feeInputs.forEach((input, feeIndex) => {
                    const inputIndex = tokenInputs.length + feeIndex;
                    finalScripts[inputIndex] = buildP2PKHUnlock(transaction, inputIndex, input.privateKey);
                });
                additionalInputs.forEach((input, additionalIndex) => {
                    const inputIndex = tokenInputs.length + feeInputs.length + additionalIndex;
                    finalScripts[inputIndex] = buildAdditionalUnlockOnce(input, transaction, inputIndex);
                });
                finalScripts.forEach((script, inputIndex) => {
                    if (script.toBuffer().length > placeholderScripts[inputIndex].toBuffer().length) {
                        fail(`input ${inputIndex} unlocking script exceeds its pre-sign size bound`);
                    }
                });
                finalScripts.forEach((script, inputIndex) => {
                    transaction.setInputScript(inputIndex, tbc.Script.fromBuffer(Buffer.from(script.toBuffer())));
                });
                const internals = transaction;
                if ((internals._inputsMap?.size ?? 0) !== 0 ||
                    (internals._outputsMap?.size ?? 0) !== 0 ||
                    internals._changeScript !== undefined ||
                    internals._privateKey !== undefined) {
                    fail("transaction contains a pending signer, callback, or automatic change mutation");
                }
                const rawBeforeSeal = transaction.uncheckedSerialize();
                transaction.seal();
                if (transaction.uncheckedSerialize() !== rawBeforeSeal) {
                    fail("seal unexpectedly changed the single-sign transaction");
                }
                if (serializedSize(transaction) > reservedBytes) {
                    fail("final transaction exceeds its pre-sign size reservation");
                }
            }
            return {
                transaction,
                txraw: transaction.uncheckedSerialize(),
                feeSatoshis: actualFee(allUTXOs, transaction),
                tokenOutputs,
                outputGroups,
            };
        };
        const canAddChange = outputPlans.length < tbc20unlock_1.TBC20_MAX_OUTPUT_GROUPS &&
            outputPlans.length * 2 + 1 <= 16;
        let selectedChange;
        if (canAddChange) {
            const withChangeEstimate = buildTransaction(TBC_DUST_AMOUNT, true);
            const withChangeFee = feeForSize(serializedSize(withChangeEstimate.transaction));
            const candidateChange = availableFeeAndChange - withChangeFee;
            if (candidateChange >= TBC_DUST_AMOUNT) {
                selectedChange = candidateChange;
            }
        }
        if (selectedChange === undefined) {
            const noChangeEstimate = buildTransaction(undefined, true);
            const noChangeFee = feeForSize(serializedSize(noChangeEstimate.transaction));
            if (availableFeeAndChange < noChangeFee) {
                fail(`inputs can pay only ${availableFeeAndChange} sat; transaction requires ${noChangeFee} sat`);
            }
            if (!canAddChange && availableFeeAndChange - noChangeFee >= TBC_DUST_AMOUNT) {
                fail("no logical output slot remains for a non-dust TBC change output");
            }
        }
        const built = buildTransaction(selectedChange, false);
        built.feeSatoshis = checkedAutomaticFee("transfer", allUTXOs, built.transaction);
        built.txraw = built.transaction.uncheckedSerialize();
        if (options.verify !== false) {
            for (let inputIndex = 0; inputIndex < built.transaction.inputs.length; inputIndex += 1) {
                const result = built.transaction.verifyScript(inputIndex);
                if (!result.success) {
                    fail(`current input ${inputIndex} failed local verification: ${result.error} at pc ${result.failedAt?.pc ?? "unknown"}`);
                }
            }
        }
        return built;
    }
    merge(optionsOrPrivateKey, tokenUTXOs, feeUTXO, parentTxs, ancestorResolvers, positionalOptions = {}) {
        let options;
        if (optionsOrPrivateKey instanceof tbc.PrivateKey) {
            if (tokenUTXOs === undefined || feeUTXO === undefined ||
                parentTxs === undefined || ancestorResolvers === undefined) {
                fail("positional merge requires tokenUTXOs, feeUTXO, parentTxs, and ancestorResolvers");
            }
            if (!positionalOptions || typeof positionalOptions !== "object" || Array.isArray(positionalOptions)) {
                fail("positional merge options must be an object");
            }
            if (positionalOptions.additionalInputs !== undefined &&
                !Array.isArray(positionalOptions.additionalInputs)) {
                fail("positional merge additionalInputs must be an array");
            }
            const additionalCount = positionalOptions.additionalInputs?.length ?? 0;
            const maximumTokenInputs = tbc20unlock_1.TBC20_MAX_INPUTS - 1 - additionalCount;
            if (maximumTokenInputs < 2) {
                fail("positional merge additionalInputs leave room for fewer than two token inputs and the mandatory fee input");
            }
            if (!Array.isArray(tokenUTXOs) || tokenUTXOs.length < 2 || tokenUTXOs.length > maximumTokenInputs) {
                fail(`positional merge tokenUTXOs must contain 2-${maximumTokenInputs} inputs after reserving one fee input and ${additionalCount} additional inputs`);
            }
            const inputs = buildPositionalTokenInputs(optionsOrPrivateKey, tokenUTXOs, parentTxs, ancestorResolvers, positionalOptions.contractControllers, "positional merge");
            options = {
                inputs,
                controller: positionalOptions.controller ?? optionsOrPrivateKey.toAddress().toString(),
                feeInputs: [{ utxo: feeUTXO, privateKey: optionsOrPrivateKey }],
                additionalInputs: positionalOptions.additionalInputs,
                tbcChangeAddress: positionalOptions.tbcChangeAddress,
                verify: positionalOptions.verify,
            };
        }
        else {
            options = optionsOrPrivateKey;
        }
        if (!options || typeof options !== "object") {
            fail("merge options are required");
        }
        if ("feeSatoshis" in options) {
            fail("merge uses the fixed 80 sat/KB policy; feeSatoshis is not accepted");
        }
        if (!Array.isArray(options.inputs) || options.inputs.length < 1 || options.inputs.length > tbc20unlock_1.TBC20_MAX_INPUTS) {
            fail(`inputs must contain 1-${tbc20unlock_1.TBC20_MAX_INPUTS} TBC20 inputs`);
        }
        const total = options.inputs.reduce((sum, input, index) => {
            const validated = this.validateTokenInput(input, index);
            return sum + validated.balance;
        }, 0n);
        return this.transfer({
            inputs: options.inputs,
            receivers: [{ controller: options.controller, amount: total }],
            feeInputs: options.feeInputs,
            additionalInputs: options.additionalInputs,
            tbcChangeAddress: options.tbcChangeAddress,
            verify: options.verify,
        });
    }
}
exports.TBC20 = TBC20;
module.exports = TBC20;
module.exports.TBC20 = TBC20;
