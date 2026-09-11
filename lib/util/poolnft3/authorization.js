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
exports.POOL3_MAX_CONTROLLERS = exports.POOL3_WHITELIST_PROFILE = void 0;
exports.normalizeControllerPubKeyHashes = normalizeControllerPubKeyHashes;
exports.normalizePoolAuthorization = normalizePoolAuthorization;
exports.buildControllerMembershipScript = buildControllerMembershipScript;
exports.buildControllerAuthorizationScript = buildControllerAuthorizationScript;
exports.parseControllerMembershipScript = parseControllerMembershipScript;
exports.assertPoolControllerPublicKey = assertPoolControllerPublicKey;
const tbc = __importStar(require("tbc-lib-js"));
exports.POOL3_WHITELIST_PROFILE = 'pool3-controller-whitelist-v1';
exports.POOL3_MAX_CONTROLLERS = 5;
/** Returns a canonical copy: a 1-of-N whitelist, not M-of-N multisig. */
function normalizeControllerPubKeyHashes(hashes) {
    if (!Array.isArray(hashes) || hashes.length < 1 || hashes.length > exports.POOL3_MAX_CONTROLLERS) {
        throw new Error('Pool3: controllerPubKeyHashes must contain 1-5 public-key hashes');
    }
    const normalized = hashes.map((hash) => {
        if (typeof hash !== 'string' || !/^[0-9a-fA-F]{40}$/.test(hash)) {
            throw new Error('Pool3: each controller public-key hash must be exactly 20 bytes of hex');
        }
        return hash.toLowerCase();
    });
    if (new Set(normalized).size !== normalized.length)
        throw new Error('Pool3: duplicate controller public-key hash');
    return Object.freeze(normalized.sort());
}
function normalizePoolAuthorization(authorization) {
    if (!authorization || typeof authorization !== 'object')
        throw new Error('Pool3: authorization is required');
    if (authorization.kind === 'public') {
        if ('controllerPubKeyHashes' in authorization)
            throw new Error('Pool3: a public pool cannot contain controller public-key hashes');
        return Object.freeze({ kind: 'public' });
    }
    if (authorization.kind !== 'controller')
        throw new Error('Pool3: unsupported authorization kind');
    return Object.freeze({
        kind: 'controller',
        controllerPubKeyHashes: normalizeControllerPubKeyHashes(authorization.controllerPubKeyHashes),
    });
}
/** Consumes HASH160(publicKey), leaving the original [signature, publicKey]. */
function buildControllerMembershipScript(hashes) {
    const canonical = normalizeControllerPubKeyHashes(hashes);
    const head = canonical
        .slice(0, -1)
        .map((hash) => `7614${hash}87637567`)
        .join('');
    return Buffer.from(`${head}14${canonical[canonical.length - 1]}88${'68'.repeat(canonical.length - 1)}`, 'hex');
}
/** Full isolated authorization fragment. No altstack use; consumes sig/publicKey. */
function buildControllerAuthorizationScript(hashes) {
    return tbc.Script.fromBuffer(Buffer.concat([
        Buffer.from('76a9', 'hex'),
        buildControllerMembershipScript(hashes),
        Buffer.from('ad', 'hex'),
    ]));
}
/** Strictly parses the SDK's canonical direct-push membership grammar. */
function parseControllerMembershipScript(script) {
    if (!Buffer.isBuffer(script))
        throw new Error('Pool3: controller membership must be a Buffer');
    const hashes = [];
    let offset = 0;
    while (script[offset] === 0x76) {
        if (hashes.length >= exports.POOL3_MAX_CONTROLLERS - 1 ||
            script[offset + 1] !== 0x14 ||
            !script.subarray(offset + 22, offset + 26).equals(Buffer.from('87637567', 'hex'))) {
            throw new Error('Pool3: noncanonical controller membership branch');
        }
        hashes.push(script.subarray(offset + 2, offset + 22).toString('hex'));
        offset += 26;
    }
    if (script[offset] !== 0x14 || script[offset + 21] !== 0x88)
        throw new Error('Pool3: missing terminal controller comparison');
    hashes.push(script.subarray(offset + 1, offset + 21).toString('hex'));
    offset += 22;
    if (!script.subarray(offset).equals(Buffer.alloc(hashes.length - 1, 0x68)))
        throw new Error('Pool3: noncanonical controller branch closure');
    const canonical = normalizeControllerPubKeyHashes(hashes);
    if (!buildControllerMembershipScript(canonical).equals(script))
        throw new Error('Pool3: controller public-key hashes must be sorted');
    return canonical;
}
function assertPoolControllerPublicKey(authorization, publicKey) {
    const normalized = normalizePoolAuthorization(authorization);
    if (normalized.kind !== 'controller')
        throw new Error('Pool3: public pools do not require a controller signature');
    let bytes;
    if (publicKey instanceof tbc.PublicKey)
        bytes = publicKey.toBuffer();
    else if (Buffer.isBuffer(publicKey))
        bytes = Buffer.from(publicKey);
    else if (typeof publicKey === 'string' && /^[0-9a-fA-F]{66}$/.test(publicKey))
        bytes = Buffer.from(publicKey, 'hex');
    else
        throw new Error('Pool3: controller public key must be compressed 33-byte hex or Buffer');
    if (bytes.length !== 33)
        throw new Error('Pool3: controller public key must be compressed');
    tbc.PublicKey.fromBuffer(bytes);
    if (!normalized.controllerPubKeyHashes.includes(tbc.crypto.Hash.sha256ripemd160(bytes).toString('hex'))) {
        throw new Error('Pool3: signer is not a member of the controller whitelist');
    }
}
