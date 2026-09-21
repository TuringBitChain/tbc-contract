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
exports.detectContractVersion = detectContractVersion;
exports.detectPoolVersion = detectPoolVersion;
exports.detectFTVersion = detectFTVersion;
exports.detectStableCoinVersion = detectStableCoinVersion;
exports.detectNFTVersion = detectNFTVersion;
const tbc = __importStar(require("tbc-lib-js"));
const tbc20_1 = require("../../contract/tbc20");
// These legacy modules use module.exports rather than TypeScript exports.
const NFT = require('../../contract/nft');
const PoolNFT = require('../../contract/poolNFT');
const PoolNFT2 = require('../../contract/poolNFT2.0');
const ft_artifacts_1 = require("../../validator/ft-artifacts");
const coinTbc20Code_1 = require("../coin/coinTbc20Code");
const artifacts_1 = require("../poolnft3/artifacts");
const fees_1 = require("../poolnft3/fees");
const tbc721unlock_1 = require("../tbc721/tbc721unlock");
const util_1 = require("./util");
function chunkBytes(chunk) {
    return new tbc.Script().add(chunk).toBuffer();
}
function readCode(value) {
    try {
        let bytes;
        if (value instanceof tbc.Script)
            bytes = value.toBuffer();
        else if (Buffer.isBuffer(value))
            bytes = value;
        else if (typeof value === 'string' && /^(?:[0-9a-fA-F]{2})+$/.test(value))
            bytes = Buffer.from(value, 'hex');
        else
            return null;
        if (bytes.length === 0)
            return null;
        const script = tbc.Script.fromBuffer(bytes);
        // The library can preserve incomplete pushes; never classify those as Code.
        if (!script.toBuffer().equals(bytes) || script.chunks.some(c => c.buf !== undefined && c.len !== c.buf.length))
            return null;
        return script;
    }
    catch {
        return null;
    }
}
// The legacy builders are the single source of template bytes. Only their
// explicit constructor pushes vary; every other opcode/byte must match.
function pattern(script, fields, keyLengthIndex = -1) {
    const seen = new Set();
    const parts = script.chunks.map((chunk, index) => {
        if (index === keyLengthIndex)
            return { keyLength: true };
        const field = chunk.buf && fields.get(chunk.buf.toString('hex'));
        if (field) {
            seen.add(field.name);
            return { field };
        }
        return { fixed: chunkBytes(chunk) };
    });
    for (const field of fields.values()) {
        if (!seen.has(field.name))
            throw new Error(`Contract version template is missing ${field.name}`);
    }
    return parts;
}
function matches(script, template) {
    if (script.chunks.length !== template.length)
        return false;
    const fields = new Map();
    let keyLengthChunk;
    for (let index = 0; index < template.length; index++) {
        const part = template[index], chunk = script.chunks[index];
        if ('fixed' in part) {
            if (!chunkBytes(chunk).equals(part.fixed))
                return false;
        }
        else if ('keyLength' in part) {
            keyLengthChunk = chunk;
        }
        else {
            const data = chunk.buf;
            if (!data || data.length === 0 || (part.field.width !== undefined && data.length !== part.field.width)
                || (part.field.maxWidth !== undefined && data.length > part.field.maxWidth))
                return false;
            // Preserve canonical SDK push encoding, including the constructor's length byte.
            if (!chunkBytes(chunk).equals(new tbc.Script().add(data).toBuffer()))
                return false;
            const previous = fields.get(part.field.name);
            if (previous && !previous.equals(data))
                return false;
            fields.set(part.field.name, data);
        }
    }
    const ftSize = fields.get('ftSize');
    if (ftSize && !['1c06', '5c07', 'dc07', '1c08'].includes(ftSize.toString('hex')))
        return false;
    const cost = fields.get('lpCost');
    if (cost && cost.readBigUInt64LE() === 0n)
        return false;
    if (keyLengthChunk) {
        const width = fields.get('key0').length;
        if (!chunkBytes(keyLengthChunk).equals(tbc.Script.fromASM((0, util_1.getOpCode)(width)).toBuffer()))
            return false;
        for (const [name, data] of fields)
            if (name.startsWith('key') && data.length !== width)
                return false;
    }
    return true;
}
const rootTxid = '11'.repeat(32);
const rootVout = 0x12345678;
const rootBytes = Buffer.concat([Buffer.alloc(32, 0x11), Buffer.from('78563412', 'hex')]);
const rootFields = new Map([[rootBytes.toString('hex'), { name: 'root', width: 36 }]]);
let legacyPools;
let legacyNFTs;
function poolPatterns() {
    if (legacyPools)
        return legacyPools;
    const v1 = PoolNFT.prototype, v2 = PoolNFT2.prototype;
    const feeAddress = (0, fees_1.resolveSwapFeePolicy)(1).serviceFeeAddress;
    const costAddress = tbc.Address.fromPublicKeyHash(Buffer.alloc(20, 0x22)).toString();
    const cost = Buffer.alloc(8);
    cost.writeBigUInt64LE(1000000n);
    const tag = 'SDK_VERSION_TEMPLATE';
    const fields = new Map(rootFields);
    fields.set('5c07', { name: 'ftSize', width: 2 });
    fields.set(tbc.Address.fromString(feeAddress).hashBuffer.toString('hex'), { name: 'feeHash', width: 20 });
    fields.set(Buffer.from(tag).toString('hex'), { name: 'tag' });
    const result = [
        { version: 1, template: pattern(v1.getPoolNftCode(rootTxid, rootVout), rootFields) },
        { version: 1, template: pattern(v1.getPoolNftCodeWithLock(rootTxid, rootVout), rootFields) },
        { version: 2, template: pattern(v2.getPoolNftCode(rootTxid, rootVout, 1, 2, tag), fields) },
    ];
    for (let count = 1; count <= 10; count++) {
        const keys = Array.from({ length: count }, (_, index) => Buffer.alloc(33, 0xa0 + index).toString('hex'));
        const lockedFields = new Map(fields);
        lockedFields.set('22'.repeat(20), { name: 'lpCostAddress', width: 20 });
        lockedFields.set(cost.toString('hex'), { name: 'lpCost', width: 8 });
        keys.forEach((key, index) => lockedFields.set(key, { name: `key${index}`, maxWidth: 65 }));
        const script = v2.getPoolNftCodeWithLock(rootTxid, rootVout, 1, costAddress, 1, keys, 2, tag);
        const firstKey = script.chunks.findIndex(c => c.buf?.toString('hex') === keys[0]);
        const lengthIndex = firstKey - (count === 1 ? 3 : 4);
        if (lengthIndex < 0 || script.chunks[lengthIndex].buf?.toString('hex') !== '21') {
            throw new Error('Pool2 authorization template boundary changed');
        }
        result.push({ version: 2, template: pattern(script, lockedFields, lengthIndex) });
    }
    legacyPools = result;
    return result;
}
function nftPatterns() {
    if (!legacyNFTs)
        legacyNFTs = [
            { version: 0, template: pattern(NFT.buildCodeScript_v0(rootTxid, rootVout), rootFields) },
            { version: 1, template: pattern(NFT.buildCodeScript_v1(rootTxid, rootVout), rootFields) },
            { version: 2, template: pattern(NFT.buildCodeScript(rootTxid, rootVout), rootFields) },
        ];
    return legacyNFTs;
}
function poolVersion(script) {
    const codeBytes = script.toBuffer().length;
    try {
        (0, artifacts_1.parsePoolCode)(script);
        return Object.freeze({ family: 'pool', version: 3, sdk: 'PoolNFT3', codeBytes });
    }
    catch { /* Not a supported Pool3 template. Try the legacy builders. */ }
    if (script.chunks[0]?.opcodenum !== tbc.Opcode.OP_1 && script.chunks[0]?.opcodenum !== tbc.Opcode.OP_4)
        return null;
    for (const entry of poolPatterns()) {
        if (matches(script, entry.template))
            return entry.version === 1
                ? Object.freeze({ family: 'pool', version: 1, sdk: 'poolNFT', codeBytes })
                : Object.freeze({ family: 'pool', version: 2, sdk: 'poolNFT2', codeBytes });
    }
    return null;
}
function ftVersion(script) {
    const codeBytes = script.toBuffer().length;
    const legacy = (0, ft_artifacts_1.decodePublishedFTCode)(script.toHex());
    if (legacy && !legacy.coin)
        return Object.freeze({ family: 'ft', version: 'legacy', sdk: 'FT', legacyVersion: legacy.version, codeBytes });
    try {
        tbc20_1.TBC20.validateCode(script);
        return Object.freeze({ family: 'ft', version: 'tbc20', sdk: 'TBC20', codeBytes });
    }
    catch {
        return null;
    }
}
function stableCoinVersion(script) {
    const codeBytes = script.toBuffer().length;
    const legacy = (0, ft_artifacts_1.decodePublishedFTCode)(script.toHex());
    if (legacy?.coin)
        return Object.freeze({ family: 'stablecoin', version: 'legacy', sdk: 'stableCoin', legacyVersion: legacy.version, codeBytes });
    try {
        coinTbc20Code_1.CoinTBC20.parseCode(script);
        return Object.freeze({ family: 'stablecoin', version: 'tbc20', sdk: 'Coin', codeBytes });
    }
    catch {
        return null;
    }
}
function nftVersion(script) {
    const codeBytes = script.toBuffer().length;
    try {
        (0, tbc721unlock_1.parseTBC721Code)(script);
        return Object.freeze({ family: 'nft', version: 'tbc721', sdk: 'TBC721', codeBytes });
    }
    catch { /* Compare the complete legacy Code before recommending NFT. */ }
    for (const entry of nftPatterns()) {
        if (matches(script, entry.template))
            return Object.freeze({ family: 'nft', version: 'legacy', sdk: 'NFT', legacyVersion: entry.version, codeBytes });
    }
    return null;
}
/** Local template recognition only, not proof of asset identity, validity or spendability. */
function detectContractVersion(codeScript) {
    const script = readCode(codeScript);
    return script ? poolVersion(script) ?? ftVersion(script) ?? stableCoinVersion(script) ?? nftVersion(script) : null;
}
/** Recognizes Pool1/Pool2 (including authorization variants) and the supported Pool3 templates. */
function detectPoolVersion(codeScript) {
    const script = readCode(codeScript);
    return script ? poolVersion(script) : null;
}
/** Ordinary FT only; stablecoins and LP tokens are not routed to FT/TBC20. */
function detectFTVersion(codeScript) {
    const script = readCode(codeScript);
    return script ? ftVersion(script) : null;
}
/** Coin TBC20 routes to the Coin business SDK, not the CoinTBC20 codec. */
function detectStableCoinVersion(codeScript) {
    const script = readCode(codeScript);
    return script ? stableCoinVersion(script) : null;
}
/** Pass NFT Code, not its adjacent Hold/Tape or an issuance-certificate identifier. */
function detectNFTVersion(codeScript) {
    const script = readCode(codeScript);
    return script ? nftVersion(script) : null;
}
