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
exports.TokenValidator = exports.TokenValidationError = void 0;
const tbc = __importStar(require("tbc-lib-js"));
const tbc20unlock_1 = require("../util/tbc20unlock");
const ft_artifacts_1 = require("./ft-artifacts");
const ftscript_1 = require("../util/ftscript");
const TBC20 = require("../contract/tbc20");
// Deliberately require the shared mutable API object. Tests and applications
// may replace API.fetchTXraw; capturing the method at module load would bypass
// that supported behavior.
const API = require("../api/api");
const UINT32_MAX = 0xffffffff;
const MAX_SLOT_AMOUNT = (1n << 63n) - 1n;
const PLACEHOLDER = /(<self\.(?:OriginalUTXO36|ConstTapeSize1|Controller21)>)/;
const TEMPLATE_SEGMENTS = TBC20.lockHexTemplate.split(PLACEHOLDER);
class TokenValidationError extends Error {
    report;
    constructor(report) {
        super(`token validation ${report.status.toLowerCase()}: ${report.issues.map((issue) => issue.code).join(", ") || report.kind}`);
        this.name = "TokenValidationError";
        this.report = report;
    }
}
exports.TokenValidationError = TokenValidationError;
class ProtocolError extends Error {
    code;
    stage;
    details;
    constructor(code, stage, message, details = {}) {
        super(message);
        this.code = code;
        this.stage = stage;
        this.details = details;
    }
}
function isUInt32(value) {
    return Number.isSafeInteger(value) && value >= 0 && value <= UINT32_MAX;
}
function deepFreeze(value) {
    if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const child of Object.values(value)) {
            deepFreeze(child);
        }
    }
    return value;
}
function cloneIssue(issue) {
    return { ...issue };
}
function jsonSafe(value) {
    if (typeof value === "bigint")
        return value.toString(10);
    if (Array.isArray(value))
        return value.map(jsonSafe);
    if (value && typeof value === "object") {
        const result = {};
        for (const [key, child] of Object.entries(value)) {
            if (key === "toJSON" || typeof child === "function")
                continue;
            result[key] = jsonSafe(child);
        }
        return result;
    }
    return value;
}
function issueMessage(code) {
    return code.replaceAll("_", " ").toLowerCase();
}
function addInvalid(ctx, code, stage, details = {}, message = issueMessage(code)) {
    ctx.invalidIssues.push({ code, severity: "error", stage, message, ...details });
}
function addUnknown(ctx, code, stage, details = {}, message = issueMessage(code)) {
    ctx.unknownIssues.push({ code, severity: "error", stage, message, ...details });
}
function addWarning(ctx, code, stage, details = {}, message = issueMessage(code)) {
    ctx.warnings.push({ code, severity: "warning", stage, message, ...details });
}
function sha256Hex(bytes) {
    return tbc.crypto.Hash.sha256(bytes).toString("hex");
}
function tokenProtocol(family, version) {
    return Object.freeze({ family, version });
}
function protocolKey(protocol) {
    return `${protocol.family}:v${protocol.version}`;
}
function unsupportedProtocolKey(artifact) {
    return `${artifact.family}:v${artifact.version}`;
}
function calculateAbiIdentity(scriptHex) {
    const bytes = Buffer.from(scriptHex, "hex");
    const partial = (0, tbc20unlock_1.getTBC20PartialScriptData)(tbc.Script.fromBuffer(bytes));
    return Buffer.concat([partial.partialHash, partial.size]).toString("hex");
}
function snapshotTransaction(tx) {
    if (!(tx instanceof tbc.Transaction))
        throw new Error("API did not return a Transaction");
    const runtime = tx;
    if (!isUInt32(runtime.version))
        throw new Error("transaction version is not uint32");
    if (!isUInt32(tx.nLockTime))
        throw new Error("transaction nLockTime is not uint32");
    const inputs = tx.inputs.map((input) => {
        if (!Buffer.isBuffer(input.prevTxId) || input.prevTxId.length !== 32) {
            throw new Error("transaction input prevTxId must be 32 bytes");
        }
        if (!isUInt32(input.outputIndex) || !isUInt32(input.sequenceNumber)) {
            throw new Error("transaction input vout and sequence must be uint32");
        }
        const displayTxid = Buffer.from(input.prevTxId).toString("hex").toLowerCase();
        const vout = input.outputIndex;
        const voutLE = Buffer.alloc(4);
        voutLE.writeUInt32LE(vout);
        return deepFreeze({
            txid: displayTxid,
            vout,
            sequence: input.sequenceNumber,
            outpointWire36Hex: Buffer.concat([
                Buffer.from(input.prevTxId).reverse(),
                voutLE,
            ]).toString("hex"),
        });
    });
    const outputs = tx.outputs.map((output) => {
        if (!output || !output.satoshisBN || typeof output.satoshisBN.toString !== "function") {
            throw new Error("transaction output is missing satoshisBN");
        }
        const satoshis = BigInt(output.satoshisBN.toString(10));
        if (satoshis < 0n)
            throw new Error("transaction output value cannot be negative");
        if (!output.script || typeof output.script.toBuffer !== "function") {
            throw new Error("transaction output is missing locking script");
        }
        const script = Buffer.from(output.script.toBuffer());
        return deepFreeze({
            satoshis,
            scriptHex: script.toString("hex"),
            scriptBytes: script.length,
        });
    });
    return deepFreeze({
        version: runtime.version,
        nLockTime: tx.nLockTime,
        inputs: deepFreeze(inputs.slice()),
        outputs: deepFreeze(outputs.slice()),
    });
}
function parseAndSnapshotRoot(input) {
    try {
        let raw;
        if (input instanceof tbc.Transaction) {
            raw = Buffer.from(input.toBuffer());
        }
        else if (Buffer.isBuffer(input)) {
            raw = Buffer.from(input);
        }
        else if (typeof input === "string") {
            if (!/^(?:[0-9a-fA-F]{2})+$/.test(input))
                return { kind: "invalid" };
            raw = Buffer.from(input, "hex");
        }
        else {
            return { kind: "invalid" };
        }
        if (raw.length === 0)
            return { kind: "invalid" };
        const parsed = new tbc.Transaction();
        parsed.fromBuffer(raw);
        const canonical = Buffer.from(parsed.toBuffer());
        if (!canonical.equals(raw))
            return { kind: "invalid" };
        return { kind: "ok", view: snapshotTransaction(parsed), txid: parsed.hash };
    }
    catch {
        return { kind: "invalid" };
    }
}
function normalizeOptions(options) {
    if (!options || typeof options !== "object") {
        return { kind: "invalid", message: "options must be an object" };
    }
    if (!(options.transaction instanceof tbc.Transaction) &&
        !Buffer.isBuffer(options.transaction) &&
        typeof options.transaction !== "string") {
        return { kind: "invalid", message: "transaction must be a Transaction, Buffer, or hex string" };
    }
    if (typeof options.network !== "string" || options.network.trim() === "") {
        return { kind: "invalid", message: "network must be a non-empty string" };
    }
    const policy = options.policy ?? {};
    if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
        return { kind: "invalid", message: "policy must be an object" };
    }
    const preset = policy.preset ?? "strict";
    if (preset !== "strict" && preset !== "relaxed-metadata") {
        return { kind: "invalid", message: "policy.preset is unsupported" };
    }
    if (policy.requireExactTapeEnvelope !== undefined &&
        typeof policy.requireExactTapeEnvelope !== "boolean") {
        return { kind: "invalid", message: "requireExactTapeEnvelope must be boolean" };
    }
    if (preset === "strict" && policy.requireExactTapeEnvelope === false) {
        return { kind: "invalid", message: "strict policy cannot disable exact Tape envelopes" };
    }
    return {
        kind: "ok",
        value: {
            transaction: options.transaction,
            network: options.network.trim(),
            requireExactTapeEnvelope: policy.requireExactTapeEnvelope ?? preset === "strict",
        },
    };
}
function createContext(options) {
    return {
        kind: "UNDETERMINED",
        invalidIssues: [],
        unknownIssues: [],
        warnings: [],
        assurances: new Set(),
        inputs: [],
        groups: [],
        matrix: [],
        assets: [],
        ancestorEdges: [],
        fetchCache: new Map(),
        queriedTxids: [],
        resolvedTxids: [],
        requiredSourceTxids: new Set(),
        resolvedTransactions: 0,
        parentsChecked: 0,
        ancestorsChecked: 0,
        originalUTXOBoundaries: 0,
        network: options.network,
        requireExactTapeEnvelope: options.requireExactTapeEnvelope,
        lineageExpected: 0,
        lineageResolved: 0,
    };
}
function placeholderBytes(segment) {
    if (segment === "<self.OriginalUTXO36>")
        return 37;
    if (segment === "<self.ConstTapeSize1>")
        return 2;
    if (segment === "<self.Controller21>")
        return 22;
    return Buffer.from(segment, "hex").length;
}
function isCurrentArtifactCandidate(scriptHex) {
    const code = Buffer.from(scriptHex, "hex");
    if (code.length !== TBC20.codeBytes)
        return false;
    let offset = 0;
    let constantMismatches = 0;
    for (const segment of TEMPLATE_SEGMENTS) {
        if (offset >= TBC20.partialOffset)
            break;
        if (segment.startsWith("<self.")) {
            offset += placeholderBytes(segment);
            continue;
        }
        const constant = Buffer.from(segment, "hex");
        const comparable = Math.min(constant.length, TBC20.partialOffset - offset);
        for (let index = 0; index < comparable; index += 1) {
            if (code[offset + index] !== constant[index]) {
                constantMismatches += 1;
                // A small mutation budget catches damaged instances of the registered
                // artifact while keeping unrelated same-length contracts opaque.
                if (constantMismatches > 8)
                    return false;
            }
        }
        offset += constant.length;
    }
    return constantMismatches <= 8;
}
function decodeTBC20CodeStrict(scriptHex) {
    try {
        TBC20.validateCode(scriptHex);
    }
    catch (error) {
        throw new ProtocolError(isCurrentArtifactCandidate(scriptHex) ? "INVALID_TBC20_CODE" : "UNSUPPORTED_TBC20_ARTIFACT", "OUTPUT_SCAN", error.message);
    }
    const code = Buffer.from(scriptHex, "hex");
    let offset = 0;
    let originalUTXOWire36Hex;
    let tapeSize;
    for (const segment of TEMPLATE_SEGMENTS) {
        if (segment === "<self.OriginalUTXO36>") {
            originalUTXOWire36Hex = code.subarray(offset + 1, offset + 37).toString("hex");
            offset += 37;
        }
        else if (segment === "<self.ConstTapeSize1>") {
            tapeSize ??= code[offset + 1];
            offset += 2;
        }
        else if (segment === "<self.Controller21>") {
            offset += 22;
        }
        else {
            offset += Buffer.from(segment, "hex").length;
        }
    }
    if (!originalUTXOWire36Hex || tapeSize === undefined || offset !== code.length) {
        throw new ProtocolError("INVALID_TBC20_CODE", "OUTPUT_SCAN", "cannot decode TBC20 code parameters");
    }
    return {
        identity: calculateAbiIdentity(scriptHex),
        originalUTXOWire36Hex,
        tapeSize,
        scriptHex,
        protocol: tokenProtocol("TBC20", 1),
        outputKind: "TBC20",
    };
}
function tryDecodeTBC20Code(scriptHex) {
    try {
        return decodeTBC20CodeStrict(scriptHex);
    }
    catch {
        return null;
    }
}
function isTapeCandidate(scriptHex) {
    const bytes = Buffer.from(scriptHex, "hex");
    return bytes.length >= TBC20.minTapeBytes &&
        bytes.length <= TBC20.maxTapeBytes &&
        bytes.subarray(0, tbc20unlock_1.TBC20_TAPE_PREFIX.length).equals(tbc20unlock_1.TBC20_TAPE_PREFIX) &&
        bytes.subarray(bytes.length - tbc20unlock_1.TBC20_TAPE_MARKER.length).equals(tbc20unlock_1.TBC20_TAPE_MARKER);
}
function decodeTBC20TapeStrict(scriptHex, expectedSize) {
    try {
        const parsed = TBC20.parseTape(scriptHex);
        if (parsed.size !== expectedSize) {
            throw new Error(`Tape size ${parsed.size} differs from Code size ${expectedSize}`);
        }
        const bytes = Buffer.from(scriptHex, "hex");
        const slots = parsed.amounts.slice();
        if (slots.length !== tbc20unlock_1.TBC20_AMOUNT_SLOTS || slots.some((amount) => amount < 0n || amount > MAX_SLOT_AMOUNT)) {
            throw new Error("Tape amounts are outside the canonical signed-63 range");
        }
        const envelope = Buffer.concat([bytes.subarray(0, 3), bytes.subarray(51)]);
        return {
            slots,
            balanceRaw: slots.reduce((sum, amount) => sum + amount, 0n),
            envelopeHex: envelope.toString("hex"),
            envelopeHash: sha256Hex(envelope),
            scriptHex,
            size: parsed.size,
        };
    }
    catch (error) {
        throw new ProtocolError("INVALID_TBC20_TAPE", "OUTPUT_SCAN", error.message);
    }
}
function decodeFTCodeStrict(scriptHex) {
    const artifact = (0, ft_artifacts_1.decodePublishedFTCode)(scriptHex);
    if (artifact === null ||
        artifact.family !== "FT" ||
        artifact.coin ||
        artifact.originalUTXOWire36Hex === undefined) {
        return null;
    }
    return {
        identity: calculateAbiIdentity(scriptHex),
        originalUTXOWire36Hex: artifact.originalUTXOWire36Hex,
        tapeSize: artifact.tapeSize,
        scriptHex,
        protocol: tokenProtocol("FT", artifact.version),
        outputKind: "FT",
    };
}
function decodeFTTapeStrict(scriptHex, expectedSize) {
    try {
        const bytes = Buffer.from(scriptHex, "hex");
        if (bytes.length !== expectedSize) {
            throw new Error(`Tape size ${bytes.length} differs from Code size ${expectedSize}`);
        }
        if (!(0, ft_artifacts_1.isPublishedFTTape)(scriptHex)) {
            throw new Error("Tape is not a canonical published FT envelope");
        }
        const slots = [
            bytes.readBigUInt64LE(3),
            bytes.readBigUInt64LE(11),
            bytes.readBigUInt64LE(19),
            bytes.readBigUInt64LE(27),
            bytes.readBigUInt64LE(35),
            bytes.readBigUInt64LE(43),
        ];
        if (slots.some((amount) => amount > MAX_SLOT_AMOUNT)) {
            throw new Error("Tape amounts are outside the canonical signed-63 range");
        }
        const envelope = Buffer.concat([bytes.subarray(0, 3), bytes.subarray(51)]);
        return {
            slots,
            balanceRaw: slots.reduce((sum, amount) => sum + amount, 0n),
            envelopeHex: envelope.toString("hex"),
            envelopeHash: sha256Hex(envelope),
            scriptHex,
            size: bytes.length,
        };
    }
    catch (error) {
        throw new ProtocolError("INVALID_TOKEN_TAPE", "OUTPUT_SCAN", error.message);
    }
}
const TBC20_ADAPTER = Object.freeze({
    id: "TBC20",
    tryDecodeCode: tryDecodeTBC20Code,
    isCodeCandidate: isCurrentArtifactCandidate,
    isTapeCandidate,
    decodeTape: decodeTBC20TapeStrict,
});
const FT_ADAPTER = Object.freeze({
    id: "FT",
    tryDecodeCode: decodeFTCodeStrict,
    isCodeCandidate: (scriptHex) => (0, ftscript_1.isFTCodeLength)(scriptHex.length / 2),
    isTapeCandidate: ft_artifacts_1.isPublishedFTTape,
    decodeTape: decodeFTTapeStrict,
});
const TOKEN_ADAPTERS = Object.freeze([
    TBC20_ADAPTER,
    FT_ADAPTER,
]);
function classifyCode(scriptHex, followingScriptHex) {
    for (const adapter of TOKEN_ADAPTERS) {
        const code = adapter.tryDecodeCode(scriptHex);
        if (code !== null)
            return { kind: "STRICT", code, adapter };
    }
    const publishedFT = (0, ft_artifacts_1.decodePublishedFTCode)(scriptHex);
    if (publishedFT?.family === "STABLE_COIN") {
        return { kind: "KNOWN_UNSUPPORTED", artifact: publishedFT };
    }
    if (TBC20_ADAPTER.isCodeCandidate(scriptHex)) {
        return {
            kind: "CANDIDATE_INVALID",
            error: new ProtocolError("INVALID_TBC20_CODE", "OUTPUT_SCAN", "script resembles the registered TBC20 artifact but fails strict decoding"),
        };
    }
    if (followingScriptHex !== undefined &&
        FT_ADAPTER.isCodeCandidate(scriptHex) &&
        FT_ADAPTER.isTapeCandidate(followingScriptHex)) {
        return {
            kind: "CANDIDATE_INVALID",
            error: new ProtocolError("INVALID_TOKEN_CODE", "OUTPUT_SCAN", "known FT Code length adjacent to FTape does not match the published artifact registry"),
        };
    }
    return { kind: "NOT_TOKEN" };
}
function toRecognizedContract(artifact) {
    return {
        family: artifact.coin ? "STABLE_COIN" : "FT",
        version: artifact.version,
    };
}
function scanOutputs(root, ctx) {
    const scanned = [];
    const observedSupported = new Map();
    const observedUnsupported = new Set();
    if (root.outputs.length > tbc20unlock_1.TBC20_MAX_OUTPUTS) {
        addInvalid(ctx, "OUTPUT_LIMIT_EXCEEDED", "ROOT", {}, `transaction has ${root.outputs.length} physical outputs; maximum is ${tbc20unlock_1.TBC20_MAX_OUTPUTS}`);
        return scanned;
    }
    for (let vout = 0; vout < root.outputs.length;) {
        const output = root.outputs[vout];
        if (output.scriptBytes === 0) {
            addInvalid(ctx, "EMPTY_LOCKING_SCRIPT", "OUTPUT_SCAN", { vout });
            scanned.push({ logicalIndex: scanned.length, kind: "ORDINARY", firstVout: vout, physicalVoutCount: 1 });
            vout += 1;
            continue;
        }
        const followingOutput = root.outputs[vout + 1];
        const codeClassification = classifyCode(output.scriptHex, followingOutput?.scriptHex);
        if (codeClassification.kind === "CANDIDATE_INVALID") {
            addInvalid(ctx, codeClassification.error.code, "OUTPUT_SCAN", { vout }, codeClassification.error.message);
            const consumePair = followingOutput !== undefined && ((codeClassification.error.code === "INVALID_TBC20_CODE" && isTapeCandidate(followingOutput.scriptHex)) ||
                (codeClassification.error.code === "INVALID_TOKEN_CODE" && (0, ft_artifacts_1.isPublishedFTTape)(followingOutput.scriptHex)));
            scanned.push({
                logicalIndex: scanned.length,
                kind: "ORDINARY",
                firstVout: vout,
                physicalVoutCount: consumePair ? 2 : 1,
            });
            vout += consumePair ? 2 : 1;
            continue;
        }
        if (codeClassification.kind === "KNOWN_UNSUPPORTED") {
            const artifact = codeClassification.artifact;
            const key = unsupportedProtocolKey(artifact);
            observedUnsupported.add(key);
            const hasTape = followingOutput !== undefined && (0, ft_artifacts_1.isPublishedFTTape)(followingOutput.scriptHex);
            scanned.push({
                logicalIndex: scanned.length,
                kind: "ORDINARY",
                firstVout: vout,
                physicalVoutCount: hasTape ? 2 : 1,
                codeVout: vout,
                tapeVout: hasTape ? vout + 1 : undefined,
                recognizedContract: toRecognizedContract(artifact),
                observedProtocolKey: key,
            });
            vout += hasTape ? 2 : 1;
            continue;
        }
        if (codeClassification.kind === "STRICT") {
            const code = codeClassification.code;
            const key = protocolKey(code.protocol);
            observedSupported.set(key, code.protocol);
            if (vout + 1 >= root.outputs.length) {
                addInvalid(ctx, code.outputKind === "TBC20" ? "TBC20_CODE_WITHOUT_TAPE" : "TOKEN_CODE_WITHOUT_TAPE", "OUTPUT_SCAN", { vout });
                scanned.push({
                    logicalIndex: scanned.length,
                    kind: "ORDINARY",
                    firstVout: vout,
                    physicalVoutCount: 1,
                    observedProtocolKey: key,
                });
                vout += 1;
                continue;
            }
            const tapeOutput = root.outputs[vout + 1];
            if (tapeOutput.scriptBytes === 0) {
                addInvalid(ctx, "EMPTY_LOCKING_SCRIPT", "OUTPUT_SCAN", { vout: vout + 1 });
                scanned.push({
                    logicalIndex: scanned.length,
                    kind: "ORDINARY",
                    firstVout: vout,
                    physicalVoutCount: 2,
                    observedProtocolKey: key,
                });
                vout += 2;
                continue;
            }
            if (output.satoshis !== BigInt(tbc20unlock_1.TBC20_CODE_SATOSHIS)) {
                addInvalid(ctx, "INVALID_CODE_VALUE", "OUTPUT_SCAN", { vout });
            }
            if (tapeOutput.satoshis !== 0n) {
                addInvalid(ctx, "INVALID_TAPE_VALUE", "OUTPUT_SCAN", { vout: vout + 1 });
            }
            try {
                const tape = codeClassification.adapter.decodeTape(tapeOutput.scriptHex, code.tapeSize);
                const pair = {
                    codeVout: vout,
                    tapeVout: vout + 1,
                    code,
                    tape,
                };
                scanned.push({
                    logicalIndex: scanned.length,
                    kind: code.outputKind,
                    firstVout: vout,
                    physicalVoutCount: 2,
                    codeVout: vout,
                    tapeVout: vout + 1,
                    identity: pair.code.identity,
                    slots: pair.tape.slots,
                    balanceRaw: pair.tape.balanceRaw,
                    protocol: code.protocol,
                    recognizedContract: code.outputKind === "FT"
                        ? { family: "FT", version: code.protocol.version }
                        : undefined,
                    observedProtocolKey: key,
                    pair,
                });
            }
            catch (error) {
                const protocol = error;
                addInvalid(ctx, protocol.code ?? (code.outputKind === "TBC20" ? "INVALID_TBC20_TAPE" : "INVALID_TOKEN_TAPE"), "OUTPUT_SCAN", { vout: vout + 1 }, protocol.message);
                scanned.push({
                    logicalIndex: scanned.length,
                    kind: "ORDINARY",
                    firstVout: vout,
                    physicalVoutCount: 2,
                    observedProtocolKey: key,
                });
            }
            vout += 2;
            continue;
        }
        if (isTapeCandidate(output.scriptHex)) {
            addInvalid(ctx, "ORPHAN_TBC20_TAPE", "OUTPUT_SCAN", { vout });
        }
        else if ((0, ft_artifacts_1.isPublishedFTTape)(output.scriptHex)) {
            addInvalid(ctx, "ORPHAN_TOKEN_TAPE", "OUTPUT_SCAN", { vout });
        }
        scanned.push({ logicalIndex: scanned.length, kind: "ORDINARY", firstVout: vout, physicalVoutCount: 1 });
        vout += 1;
    }
    const observedKeys = new Set([
        ...observedSupported.keys(),
        ...observedUnsupported,
    ]);
    if (observedKeys.size > 1) {
        addInvalid(ctx, "MIXED_TOKEN_PROTOCOLS", "OUTPUT_SCAN", {}, `transaction outputs contain multiple token protocols: ${[...observedKeys].sort().join(", ")}`);
    }
    else if (observedKeys.size === 1) {
        const key = observedKeys.values().next().value;
        const supported = observedSupported.get(key);
        if (supported !== undefined) {
            ctx.protocol = supported;
        }
        else {
            addInvalid(ctx, "UNSUPPORTED_TOKEN_PROTOCOL", "OUTPUT_SCAN", {}, `${key} is recognized but is not supported by this validator`);
        }
    }
    // Raw transactions do not retain the outputGroups array used by the unlock
    // ABI. The two supported families encode ordinary outputs differently:
    // TBC20 may group two consecutive opaque physical outputs, whereas legacy
    // FT encodes every ordinary physical output as its own tag=2 group. A token
    // Code/Tape pair always occupies one forced two-output group.
    const groups = [];
    if (ctx.protocol?.family === "FT") {
        for (const group of scanned) {
            groups.push({ ...group, logicalIndex: groups.length });
        }
        if (groups.length > tbc20unlock_1.TBC20_MAX_OUTPUT_GROUPS) {
            addInvalid(ctx, "OUTPUT_LIMIT_EXCEEDED", "OUTPUT_SCAN", {}, `FT outputs require ${groups.length} ABI groups; maximum is ${tbc20unlock_1.TBC20_MAX_OUTPUT_GROUPS}`);
        }
        return groups;
    }
    // For TBC20, reconstruct the minimum possible grouping: strict pairs are
    // barriers and every opaque run contributes ceil(physicalOutputs / 2).
    let opaqueRun = [];
    const flushOpaqueRun = () => {
        if (opaqueRun.length === 0)
            return;
        const start = opaqueRun[0].firstVout;
        const last = opaqueRun[opaqueRun.length - 1];
        const end = last.firstVout + last.physicalVoutCount;
        for (let vout = start; vout < end; vout += 2) {
            const physicalVoutCount = vout + 1 < end ? 2 : 1;
            const recognized = physicalVoutCount === 2
                ? opaqueRun.find((candidate) => candidate.recognizedContract !== undefined &&
                    candidate.codeVout === vout && candidate.tapeVout === vout + 1)
                : undefined;
            groups.push({
                logicalIndex: groups.length,
                kind: "ORDINARY",
                firstVout: vout,
                physicalVoutCount,
                codeVout: recognized?.codeVout,
                tapeVout: recognized?.tapeVout,
                recognizedContract: recognized?.recognizedContract,
            });
        }
        opaqueRun = [];
    };
    for (const group of scanned) {
        if (group.pair !== undefined) {
            flushOpaqueRun();
            groups.push({ ...group, logicalIndex: groups.length });
        }
        else {
            opaqueRun.push(group);
        }
    }
    flushOpaqueRun();
    if (groups.length > tbc20unlock_1.TBC20_MAX_OUTPUT_GROUPS) {
        addInvalid(ctx, "OUTPUT_LIMIT_EXCEEDED", "OUTPUT_SCAN", {}, `outputs require at least ${groups.length} ABI groups; maximum is ${tbc20unlock_1.TBC20_MAX_OUTPUT_GROUPS}`);
    }
    return groups;
}
function decodePairAt(parent, codeVout) {
    const codeOutput = parent.outputs[codeVout];
    if (!codeOutput)
        return { kind: "NONE" };
    const tapeOutput = parent.outputs[codeVout + 1];
    const classification = classifyCode(codeOutput.scriptHex, tapeOutput?.scriptHex);
    if (classification.kind === "NOT_TOKEN")
        return { kind: "NONE" };
    if (classification.kind === "KNOWN_UNSUPPORTED") {
        return { kind: "KNOWN_UNSUPPORTED", artifact: classification.artifact };
    }
    if (classification.kind === "CANDIDATE_INVALID") {
        return { kind: "INVALID", error: classification.error };
    }
    if (!tapeOutput) {
        return {
            kind: "INVALID",
            error: new ProtocolError(classification.code.outputKind === "TBC20" ? "TBC20_CODE_WITHOUT_TAPE" : "TOKEN_CODE_WITHOUT_TAPE", "PARENT", "referenced token Code has no following Tape output"),
        };
    }
    if (codeOutput.satoshis !== BigInt(tbc20unlock_1.TBC20_CODE_SATOSHIS) || tapeOutput.satoshis !== 0n) {
        return {
            kind: "INVALID",
            error: new ProtocolError(codeOutput.satoshis !== BigInt(tbc20unlock_1.TBC20_CODE_SATOSHIS) ? "INVALID_CODE_VALUE" : "INVALID_TAPE_VALUE", "PARENT", "referenced token pair has invalid output values"),
        };
    }
    try {
        const tape = classification.adapter.decodeTape(tapeOutput.scriptHex, classification.code.tapeSize);
        return {
            kind: "SUPPORTED",
            pair: {
                codeVout,
                tapeVout: codeVout + 1,
                code: classification.code,
                tape,
            },
        };
    }
    catch (error) {
        return { kind: "INVALID", error: error };
    }
}
async function fetchTransaction(ctx, txid) {
    const normalized = txid.toLowerCase();
    let cached = ctx.fetchCache.get(normalized);
    if (!cached) {
        ctx.queriedTxids.push(normalized);
        cached = Promise.resolve()
            .then(() => API.fetchTXraw(normalized, ctx.network))
            .then((transaction) => {
            const view = snapshotTransaction(transaction);
            ctx.resolvedTxids.push(normalized);
            ctx.resolvedTransactions += 1;
            return { kind: "ok", requestedTxid: normalized, view };
        })
            .catch((error) => ({ kind: "source-error", requestedTxid: normalized, error }));
        ctx.fetchCache.set(normalized, cached);
    }
    return cached;
}
function createInputTable(root) {
    return root.inputs.map((input, vin) => ({
        vin,
        prevTxid: input.txid,
        prevVout: input.vout,
        kind: "UNRESOLVED",
        resolution: "NOT_REQUESTED",
        attempted: false,
    }));
}
async function resolveParent(root, input, ctx, role) {
    input.attempted = true;
    const rootInput = root.inputs[input.vin];
    const fetched = await fetchTransaction(ctx, rootInput.txid);
    if (fetched.kind === "source-error") {
        input.kind = "UNRESOLVED";
        input.resolution = "UNAVAILABLE";
        if (role === "POSITIVE_SOURCE") {
            addUnknown(ctx, "PARENT_FETCH_FAILED", "PARENT", {
                vin: input.vin,
                txid: rootInput.txid,
            });
            ctx.requiredSourceTxids.add(rootInput.txid);
        }
        return "source-error";
    }
    const parent = fetched.view;
    const output = parent.outputs[rootInput.vout];
    if (!output) {
        input.kind = "UNRESOLVED";
        input.resolution = "INVALID";
        addInvalid(ctx, "PARENT_VOUT_OUT_OF_RANGE", "PARENT", {
            vin: input.vin,
            txid: rootInput.txid,
            vout: rootInput.vout,
        });
        return "invalid";
    }
    ctx.parentsChecked += 1;
    input.parent = parent;
    input.parentTxid = rootInput.txid;
    const decoded = decodePairAt(parent, rootInput.vout);
    if (decoded.kind === "INVALID") {
        input.kind = "UNRESOLVED";
        input.resolution = "INVALID";
        addInvalid(ctx, decoded.error.code, "PARENT", {
            vin: input.vin,
            txid: rootInput.txid,
            vout: rootInput.vout,
        }, decoded.error.message);
        return "invalid";
    }
    if (decoded.kind === "KNOWN_UNSUPPORTED") {
        input.kind = "ORDINARY";
        input.resolution = "RESOLVED";
        if (role === "POSITIVE_SOURCE") {
            addInvalid(ctx, "MIXED_TOKEN_PROTOCOLS", "PARENT", {
                vin: input.vin,
                txid: rootInput.txid,
                vout: rootInput.vout,
            }, `input token ${unsupportedProtocolKey(decoded.artifact)} differs from output protocol ${ctx.protocol ? protocolKey(ctx.protocol) : "unknown"}`);
            return "invalid";
        }
        return "ok";
    }
    if (decoded.kind === "NONE") {
        input.kind = "ORDINARY";
        input.resolution = "RESOLVED";
        return "ok";
    }
    const pair = decoded.pair;
    input.kind = pair.code.outputKind;
    input.resolution = "RESOLVED";
    input.pair = pair;
    if (ctx.protocol !== undefined && protocolKey(pair.code.protocol) !== protocolKey(ctx.protocol)) {
        if (role === "POSITIVE_SOURCE") {
            addInvalid(ctx, "MIXED_TOKEN_PROTOCOLS", "PARENT", {
                vin: input.vin,
                txid: rootInput.txid,
                vout: rootInput.vout,
            }, `input token ${protocolKey(pair.code.protocol)} differs from output protocol ${protocolKey(ctx.protocol)}`);
            return "invalid";
        }
        return "ok";
    }
    return "ok";
}
function buildMatrix(groups) {
    return groups
        .filter((group) => group.pair !== undefined)
        .map((group) => group.pair.tape.slots.slice());
}
function collectTokenGroups(groups) {
    return groups.filter((group) => group.pair !== undefined);
}
function columnSum(groups, vin) {
    return collectTokenGroups(groups).reduce((sum, group) => sum + group.pair.tape.slots[vin], 0n);
}
function positiveVins(groups) {
    const vins = new Set();
    for (const group of collectTokenGroups(groups)) {
        group.pair.tape.slots.forEach((amount, vin) => {
            if (amount > 0n)
                vins.add(vin);
        });
    }
    return [...vins].sort((a, b) => a - b);
}
function validateRoot(root, ctx) {
    if (root.version !== 10) {
        addInvalid(ctx, "INVALID_TRANSACTION_VERSION", "ROOT", {}, "root transaction version must be 10");
    }
    if (root.inputs.length < 1 || root.inputs.length > tbc20unlock_1.TBC20_MAX_INPUTS) {
        addInvalid(ctx, "INPUT_LIMIT_EXCEEDED", "ROOT", {}, `root transaction must contain 1-${tbc20unlock_1.TBC20_MAX_INPUTS} inputs`);
    }
    const seen = new Set();
    for (const input of root.inputs) {
        const key = `${input.txid}:${input.vout}`;
        if (seen.has(key)) {
            addInvalid(ctx, "DUPLICATE_INPUT_OUTPOINT", "ROOT", { txid: input.txid, vout: input.vout });
        }
        seen.add(key);
    }
}
function validateOutputOnlyMatrixRules(root, groups, ctx) {
    const tokenGroups = collectTokenGroups(groups);
    for (let vin = 0; vin < tbc20unlock_1.TBC20_AMOUNT_SLOTS; vin += 1) {
        const identities = new Set();
        for (const group of tokenGroups) {
            if (group.pair.tape.slots[vin] > 0n)
                identities.add(group.pair.code.identity);
        }
        if (identities.size > 0 && vin >= root.inputs.length) {
            addInvalid(ctx, "AMOUNT_SLOT_WITHOUT_INPUT", "MATRIX", { vin });
        }
        if (identities.size > 1) {
            addInvalid(ctx, "OUTPUT_INPUT_IDENTITY_MISMATCH", "MATRIX", { vin }, "one vin cannot fund more than one token identity");
        }
    }
    const envelopes = new Map();
    for (const group of tokenGroups) {
        const list = envelopes.get(group.pair.code.identity) ?? new Set();
        list.add(group.pair.tape.envelopeHex);
        envelopes.set(group.pair.code.identity, list);
    }
    for (const [identity, variants] of envelopes) {
        if (variants.size > 1) {
            if (ctx.requireExactTapeEnvelope) {
                addInvalid(ctx, "TAPE_ENVELOPE_MISMATCH", "MATRIX", { identity });
            }
            else {
                addWarning(ctx, "TAPE_ENVELOPE_MISMATCH", "MATRIX", { identity });
            }
        }
    }
}
async function resolvePositiveSources(root, groups, inputs, vins, ctx) {
    let complete = true;
    for (const vin of vins) {
        if (vin >= root.inputs.length) {
            complete = false;
            continue;
        }
        const input = inputs[vin];
        // A positive output column makes this prevout a required source even when
        // the trusted API returns an unusable/non-token parent.
        ctx.requiredSourceTxids.add(input.prevTxid);
        const outcome = await resolveParent(root, input, ctx, "POSITIVE_SOURCE");
        if (outcome === "source-error") {
            complete = false;
            continue;
        }
        if (outcome === "invalid") {
            complete = false;
            continue;
        }
        if ((input.kind !== "TBC20" && input.kind !== "FT") || !input.pair || !input.parent) {
            addInvalid(ctx, "AMOUNT_SLOT_WITHOUT_TOKEN_INPUT", "MATRIX", { vin });
            complete = false;
            continue;
        }
        input.sourceRole = "POSITIVE_SOURCE";
        if (input.parent.version !== 10) {
            addInvalid(ctx, "INVALID_TRANSACTION_VERSION", "PARENT", { vin, txid: input.prevTxid });
        }
        if (input.parent.inputs.length < 1 || input.parent.inputs.length > tbc20unlock_1.TBC20_MAX_INPUTS) {
            addInvalid(ctx, "INPUT_LIMIT_EXCEEDED", "PARENT", { vin, txid: input.prevTxid });
        }
        const outputIdentities = new Set(collectTokenGroups(groups)
            .filter((group) => group.pair.tape.slots[vin] > 0n)
            .map((group) => group.pair.code.identity));
        if (outputIdentities.size !== 1 || !outputIdentities.has(input.pair.code.identity)) {
            addInvalid(ctx, "OUTPUT_INPUT_IDENTITY_MISMATCH", "MATRIX", {
                vin,
                identity: input.pair.code.identity,
            });
        }
        const actual = columnSum(groups, vin);
        if (actual !== input.pair.tape.balanceRaw) {
            addInvalid(ctx, "VIN_AMOUNT_NOT_CONSERVED", "MATRIX", { vin, identity: input.pair.code.identity }, `vin ${vin} contributes ${actual} raw but parent balance is ${input.pair.tape.balanceRaw}`);
        }
    }
    return complete;
}
function expectedEnvelopeForIdentity(groups, identity) {
    return collectTokenGroups(groups).find((group) => group.pair.code.identity === identity)?.pair.tape.envelopeHex;
}
async function searchZeroWitnesses(root, groups, inputs, targets, positive, ctx) {
    const unresolved = new Set(targets);
    const failedCandidateVins = [];
    const rejections = new Map();
    const remainingVins = root.inputs.map((_, vin) => vin).filter((vin) => !positive.has(vin));
    if (unresolved.size > remainingVins.length) {
        addInvalid(ctx, "ZERO_IDENTITY_WITNESS_CAPACITY_EXCEEDED", "MATRIX", {}, `${unresolved.size} distinct zero identities cannot be witnessed by ${remainingVins.length} remaining vins`);
        return { complete: false, unresolved, failedCandidateVins, rejections };
    }
    for (const vin of remainingVins) {
        if (unresolved.size === 0)
            break;
        const input = inputs[vin];
        const outcome = await resolveParent(root, input, ctx, "ZERO_WITNESS_CANDIDATE");
        if (outcome === "source-error") {
            failedCandidateVins.push(vin);
            continue;
        }
        if (outcome === "invalid") {
            // A trusted returned Transaction lacking its referenced vout is already
            // a deterministic root graph contradiction, never wildcard capacity.
            continue;
        }
        if ((input.kind !== "TBC20" && input.kind !== "FT") || !input.pair || !input.parent)
            continue;
        const pair = input.pair;
        // A speculative zero-witness lookup may encounter an unrelated token
        // protocol. It is not a selected source and must not make the result
        // depend on vin ordering; only matching family/version candidates qualify.
        if (ctx.protocol !== undefined && protocolKey(pair.code.protocol) !== protocolKey(ctx.protocol)) {
            continue;
        }
        if (pair.tape.balanceRaw > 0n) {
            if (columnSum(groups, vin) === 0n) {
                addInvalid(ctx, "VIN_AMOUNT_NOT_CONSERVED", "MATRIX", {
                    vin,
                    identity: pair.code.identity,
                });
            }
            continue;
        }
        if (!unresolved.has(pair.code.identity))
            continue;
        const identityRejections = rejections.get(pair.code.identity) ?? [];
        if (input.parent.version !== 10) {
            identityRejections.push({ code: "INVALID_TRANSACTION_VERSION", vin });
            rejections.set(pair.code.identity, identityRejections);
            continue;
        }
        if (input.parent.inputs.length < 1 || input.parent.inputs.length > tbc20unlock_1.TBC20_MAX_INPUTS) {
            identityRejections.push({ code: "INPUT_LIMIT_EXCEEDED", vin });
            rejections.set(pair.code.identity, identityRejections);
            continue;
        }
        const expectedEnvelope = expectedEnvelopeForIdentity(groups, pair.code.identity);
        if (ctx.requireExactTapeEnvelope && expectedEnvelope !== pair.tape.envelopeHex) {
            identityRejections.push({ code: "TAPE_ENVELOPE_MISMATCH", vin });
            rejections.set(pair.code.identity, identityRejections);
            continue;
        }
        if (!ctx.requireExactTapeEnvelope && expectedEnvelope !== pair.tape.envelopeHex) {
            addWarning(ctx, "TAPE_ENVELOPE_MISMATCH", "MATRIX", { vin, identity: pair.code.identity });
        }
        input.sourceRole = "ZERO_IDENTITY_WITNESS";
        ctx.requiredSourceTxids.add(input.prevTxid);
        unresolved.delete(pair.code.identity);
    }
    if (unresolved.size === 0) {
        return { complete: true, unresolved, failedCandidateVins, rejections };
    }
    // Each failed vin has capacity one. A single unknown vin cannot witness two
    // distinct zero-output identities, even if both are otherwise plausible.
    if (failedCandidateVins.length >= unresolved.size) {
        addUnknown(ctx, "ZERO_IDENTITY_WITNESS_UNRESOLVED", "MATRIX", {}, `${unresolved.size} zero identities may be covered by ${failedCandidateVins.length} unavailable vins`);
    }
    else if (failedCandidateVins.length === 0) {
        const priority = [
            "INVALID_TRANSACTION_VERSION",
            "INPUT_LIMIT_EXCEEDED",
            "TAPE_ENVELOPE_MISMATCH",
            "OUTPUT_IDENTITY_WITHOUT_INPUT",
        ];
        for (const identity of [...unresolved].sort()) {
            const rejected = rejections.get(identity) ?? [];
            const selectedCode = priority.find((code) => rejected.some((entry) => entry.code === code)) ??
                "OUTPUT_IDENTITY_WITHOUT_INPUT";
            const selectedRejection = rejected.find((entry) => entry.code === selectedCode);
            addInvalid(ctx, selectedCode, "MATRIX", { identity, vin: selectedRejection?.vin });
        }
    }
    else {
        addInvalid(ctx, "ZERO_IDENTITY_WITNESS_CAPACITY_EXCEEDED", "MATRIX", {}, `${unresolved.size} zero identities exceed ${failedCandidateVins.length} remaining witness capacity`);
    }
    return { complete: false, unresolved, failedCandidateVins, rejections };
}
function requiredSources(inputs) {
    return inputs.filter((input) => input.pair && input.parent && input.sourceRole);
}
function validateRequiredSourceEnvelopes(sources, groups, ctx) {
    for (const source of sources) {
        const identity = source.pair.code.identity;
        const expected = expectedEnvelopeForIdentity(groups, identity);
        if (expected !== source.pair.tape.envelopeHex) {
            if (ctx.requireExactTapeEnvelope) {
                addInvalid(ctx, "TAPE_ENVELOPE_MISMATCH", "MATRIX", { vin: source.vin, identity });
            }
            else {
                addWarning(ctx, "TAPE_ENVELOPE_MISMATCH", "MATRIX", { vin: source.vin, identity });
            }
        }
    }
}
function validateIdentityClosureAndTotals(sources, groups, ctx) {
    const tokenGroups = collectTokenGroups(groups);
    const sourceIdentities = new Set(sources.map((input) => input.pair.code.identity));
    for (const group of tokenGroups) {
        if (!sourceIdentities.has(group.pair.code.identity)) {
            addInvalid(ctx, "OUTPUT_IDENTITY_WITHOUT_INPUT", "MATRIX", { identity: group.pair.code.identity });
        }
    }
    const identities = new Set([...sourceIdentities, ...tokenGroups.map((group) => group.pair.code.identity)]);
    ctx.assets = [];
    for (const identity of [...identities].sort()) {
        const matchingInputs = sources.filter((input) => input.pair.code.identity === identity);
        const matchingGroups = tokenGroups.filter((group) => group.pair.code.identity === identity);
        const inputRaw = matchingInputs.reduce((sum, input) => sum + input.pair.tape.balanceRaw, 0n);
        const outputRaw = matchingGroups.reduce((sum, group) => sum + group.pair.tape.balanceRaw, 0n);
        if (inputRaw !== outputRaw) {
            addInvalid(ctx, "IDENTITY_AMOUNT_NOT_CONSERVED", "MATRIX", { identity }, `identity input ${inputRaw} differs from output ${outputRaw}`);
        }
        ctx.assets.push({
            identity,
            protocol: (matchingGroups[0]?.pair ?? matchingInputs[0]?.pair).code.protocol,
            inputVins: matchingInputs.map((input) => input.vin),
            outputGroups: matchingGroups.map((group) => group.logicalIndex),
            inputRaw,
            outputRaw,
            envelopeHash: matchingGroups[0]?.pair?.tape.envelopeHash,
        });
    }
}
async function validateLineage(sources, ctx) {
    for (const source of sources) {
        const parent = source.parent;
        const pair = source.pair;
        for (let slot = 0; slot < tbc20unlock_1.TBC20_AMOUNT_SLOTS; slot += 1) {
            if (pair.tape.slots[slot] === 0n)
                continue;
            ctx.lineageExpected += 1;
            if (slot >= parent.inputs.length) {
                addInvalid(ctx, "PARENT_SLOT_WITHOUT_VIN", "PARENT", {
                    vin: source.vin,
                    slot,
                    txid: source.prevTxid,
                });
                continue;
            }
            const parentInput = parent.inputs[slot];
            ctx.requiredSourceTxids.add(parentInput.txid);
            const fetched = await fetchTransaction(ctx, parentInput.txid);
            if (fetched.kind === "source-error") {
                addUnknown(ctx, "ANCESTOR_FETCH_FAILED", "ANCESTOR", {
                    vin: source.vin,
                    slot,
                    txid: parentInput.txid,
                });
                continue;
            }
            const ancestor = fetched.view;
            const ancestorOutput = ancestor.outputs[parentInput.vout];
            if (!ancestorOutput) {
                addInvalid(ctx, "ANCESTOR_VOUT_OUT_OF_RANGE", "ANCESTOR", {
                    vin: source.vin,
                    slot,
                    txid: parentInput.txid,
                    vout: parentInput.vout,
                });
                continue;
            }
            ctx.ancestorsChecked += 1;
            if (ancestor.version !== 10) {
                addInvalid(ctx, "INVALID_TRANSACTION_VERSION", "ANCESTOR", {
                    vin: source.vin,
                    slot,
                    txid: parentInput.txid,
                });
                continue;
            }
            if (ancestorOutput.scriptBytes === 0) {
                addInvalid(ctx, "ANCESTOR_EMPTY_LOCKING_SCRIPT", "ANCESTOR", {
                    vin: source.vin,
                    slot,
                    txid: parentInput.txid,
                    vout: parentInput.vout,
                });
                continue;
            }
            let ancestorIdentity;
            try {
                const ancestorCode = classifyCode(ancestorOutput.scriptHex, ancestor.outputs[parentInput.vout + 1]?.scriptHex);
                ancestorIdentity = ancestorCode.kind === "STRICT"
                    ? ancestorCode.code.identity
                    : calculateAbiIdentity(ancestorOutput.scriptHex);
            }
            catch (error) {
                addInvalid(ctx, "ANCESTOR_EMPTY_LOCKING_SCRIPT", "ANCESTOR", {
                    vin: source.vin,
                    slot,
                    txid: parentInput.txid,
                }, error.message);
                continue;
            }
            const common = {
                currentVin: source.vin,
                parentTxid: source.prevTxid,
                parentCodeVout: pair.codeVout,
                parentSlot: slot,
                parentVin: slot,
                abiPrepreIndex: 5 - slot,
                ancestorTxid: parentInput.txid,
                ancestorVout: parentInput.vout,
                parentIdentity: pair.code.identity,
                ancestorIdentity,
            };
            if (ancestorIdentity === pair.code.identity) {
                ctx.ancestorEdges.push({ ...common, resolution: "SAME_IDENTITY" });
                ctx.lineageResolved += 1;
                continue;
            }
            if (slot === 0 && parentInput.outpointWire36Hex === pair.code.originalUTXOWire36Hex) {
                ctx.ancestorEdges.push({ ...common, resolution: "ORIGINAL_UTXO" });
                ctx.originalUTXOBoundaries += 1;
                ctx.lineageResolved += 1;
                continue;
            }
            addInvalid(ctx, slot === 0 ? "ORIGINAL_UTXO_MISMATCH" : "ANCESTOR_IDENTITY_MISMATCH", "ANCESTOR", { vin: source.vin, slot, txid: parentInput.txid, vout: parentInput.vout });
        }
    }
}
function publicInput(input) {
    const base = {
        vin: input.vin,
        prevTxid: input.prevTxid,
        prevVout: input.prevVout,
    };
    if ((input.kind === "TBC20" || input.kind === "FT") && input.resolution === "RESOLVED" && input.pair) {
        return {
            ...base,
            kind: input.kind,
            resolution: "RESOLVED",
            sourceRole: input.sourceRole,
            parentTxid: input.parentTxid,
            codeVout: input.pair.codeVout,
            tapeVout: input.pair.tapeVout,
            identity: input.pair.code.identity,
            slots: input.pair.tape.slots.slice(),
            balanceRaw: input.pair.tape.balanceRaw,
            protocol: input.pair.code.protocol,
        };
    }
    if (input.kind === "ORDINARY" && input.resolution === "RESOLVED") {
        return { ...base, kind: "ORDINARY", resolution: "RESOLVED", parentTxid: input.parentTxid };
    }
    return {
        ...base,
        kind: "UNRESOLVED",
        resolution: input.resolution === "UNAVAILABLE"
            ? "UNAVAILABLE"
            : input.resolution === "INVALID"
                ? "INVALID"
                : "NOT_REQUESTED",
    };
}
function publicGroup(group) {
    return {
        logicalIndex: group.logicalIndex,
        kind: group.kind,
        firstVout: group.firstVout,
        physicalVoutCount: group.physicalVoutCount,
        codeVout: group.codeVout,
        tapeVout: group.tapeVout,
        identity: group.identity,
        slots: group.slots ? group.slots.slice() : undefined,
        balanceRaw: group.balanceRaw,
        protocol: group.protocol ? { ...group.protocol } : undefined,
        recognizedContract: group.recognizedContract ? { ...group.recognizedContract } : undefined,
    };
}
function finalize(ctx, includeSource = true) {
    if (ctx.invalidIssues.length === 0 && ctx.unknownIssues.length === 0 && ctx.kind === "TRANSITION") {
        const mandatory = [
            "STRUCTURE",
            "TRANSITION",
            "OUTPUT_SOURCE_LINEAGE",
            "OUTPUT_SOURCE_GRAPH_RESOLVED",
        ];
        if (mandatory.some((assurance) => !ctx.assurances.has(assurance))) {
            addUnknown(ctx, "VALIDATOR_INTERNAL_INCOMPLETE", "ROOT", {}, "mandatory validation assurance is incomplete");
        }
    }
    const status = ctx.invalidIssues.length > 0
        ? "INVALID"
        : ctx.unknownIssues.length > 0
            ? "UNKNOWN"
            : ctx.kind === "TRANSITION"
                ? "VALID"
                : "INVALID";
    const issues = [...ctx.invalidIssues, ...ctx.unknownIssues, ...ctx.warnings].map(cloneIssue);
    const data = {
        status,
        txid: ctx.txid,
        kind: ctx.kind,
        protocol: ctx.protocol ? { ...ctx.protocol } : undefined,
        assurances: [...ctx.assurances],
        issues,
        inputs: ctx.inputs.map(publicInput),
        outputGroups: ctx.groups.map(publicGroup),
        assets: ctx.assets.map((asset) => ({
            ...asset,
            protocol: { ...asset.protocol },
            inputVins: [...asset.inputVins],
            outputGroups: [...asset.outputGroups],
        })),
        matrix: ctx.matrix.map((row) => row.slice()),
        ancestorEdges: ctx.ancestorEdges.map((edge) => ({ ...edge })),
        source: includeSource ? {
            network: ctx.network,
            api: "API.fetchTXraw",
            trustModel: "API_FETCH_TXRAW_FULLY_TRUSTED",
            rootTrustModel: "CALLER_ASSERTED_ON_CHAIN_AND_INPUT_SCRIPTS_VALID",
            queriedTxids: [...ctx.queriedTxids],
            resolvedTxids: [...ctx.resolvedTxids],
            requiredSourceTxids: [...ctx.requiredSourceTxids],
        } : undefined,
        resolvedTransactions: ctx.resolvedTransactions,
        parentsChecked: ctx.parentsChecked,
        ancestorsChecked: ctx.ancestorsChecked,
        originalUTXOBoundaries: ctx.originalUTXOBoundaries,
    };
    const result = {
        ...data,
        toJSON() {
            return jsonSafe(data);
        },
    };
    return deepFreeze(result);
}
function invalidPolicyReport(message) {
    const fallback = {
        transaction: "",
        network: "",
        requireExactTapeEnvelope: true,
    };
    const ctx = createContext(fallback);
    addInvalid(ctx, "INVALID_POLICY", "ROOT", {}, message);
    return finalize(ctx, false);
}
class TokenValidator {
    static async validateOnChainTransaction(options) {
        const normalized = normalizeOptions(options);
        if (normalized.kind === "invalid")
            return invalidPolicyReport(normalized.message);
        const ctx = createContext(normalized.value);
        try {
            const rootResolution = parseAndSnapshotRoot(normalized.value.transaction);
            if (rootResolution.kind !== "ok") {
                addUnknown(ctx, "ROOT_RAW_INVALID", "ROOT");
                return finalize(ctx);
            }
            const root = rootResolution.view;
            ctx.txid = rootResolution.txid;
            ctx.inputs = createInputTable(root);
            validateRoot(root, ctx);
            if (ctx.invalidIssues.length > 0)
                return finalize(ctx);
            ctx.groups = scanOutputs(root, ctx);
            if (ctx.invalidIssues.length > 0)
                return finalize(ctx);
            ctx.assurances.add("STRUCTURE");
            const tokenGroups = collectTokenGroups(ctx.groups);
            if (tokenGroups.length === 0) {
                ctx.kind = "NON_TOKEN";
                ctx.assurances.add("OUTPUT_SOURCE_GRAPH_RESOLVED");
                addInvalid(ctx, "NO_TOKEN_OUTPUT", "OUTPUT_SCAN");
                return finalize(ctx);
            }
            ctx.kind = "TRANSITION";
            ctx.matrix = buildMatrix(ctx.groups);
            validateOutputOnlyMatrixRules(root, ctx.groups, ctx);
            if (ctx.invalidIssues.length > 0)
                return finalize(ctx);
            const positive = positiveVins(ctx.groups);
            const positiveSet = new Set(positive);
            const positiveComplete = await resolvePositiveSources(root, ctx.groups, ctx.inputs, positive, ctx);
            if (ctx.invalidIssues.length > 0)
                return finalize(ctx);
            const positiveOutputIdentities = new Set();
            for (const group of tokenGroups) {
                if (group.pair.tape.balanceRaw > 0n)
                    positiveOutputIdentities.add(group.pair.code.identity);
            }
            const zeroTargets = new Set();
            for (const group of tokenGroups) {
                if (group.pair.tape.balanceRaw === 0n && !positiveOutputIdentities.has(group.pair.code.identity)) {
                    zeroTargets.add(group.pair.code.identity);
                }
            }
            let zeroComplete = zeroTargets.size === 0;
            if (!zeroComplete) {
                const zeroSearch = await searchZeroWitnesses(root, ctx.groups, ctx.inputs, zeroTargets, positiveSet, ctx);
                zeroComplete = zeroSearch.complete;
            }
            if (ctx.invalidIssues.length > 0)
                return finalize(ctx);
            const sources = requiredSources(ctx.inputs);
            validateRequiredSourceEnvelopes(sources, ctx.groups, ctx);
            if (ctx.invalidIssues.length > 0)
                return finalize(ctx);
            const transitionEvidenceComplete = positiveComplete && zeroComplete;
            if (transitionEvidenceComplete) {
                validateIdentityClosureAndTotals(sources, ctx.groups, ctx);
                if (ctx.invalidIssues.length > 0)
                    return finalize(ctx);
                ctx.assurances.add("TRANSITION");
            }
            // UNKNOWN evidence never prevents checking lineage branches that are
            // already independently resolvable. This preserves INVALID > UNKNOWN.
            await validateLineage(sources, ctx);
            if (ctx.invalidIssues.length > 0)
                return finalize(ctx);
            if (transitionEvidenceComplete && ctx.lineageExpected === ctx.lineageResolved) {
                ctx.assurances.add("OUTPUT_SOURCE_LINEAGE");
            }
            if (transitionEvidenceComplete &&
                ctx.lineageExpected === ctx.lineageResolved &&
                !ctx.unknownIssues.some((issue) => issue.code === "PARENT_FETCH_FAILED" || issue.code === "ANCESTOR_FETCH_FAILED" ||
                    issue.code === "ZERO_IDENTITY_WITNESS_UNRESOLVED")) {
                ctx.assurances.add("OUTPUT_SOURCE_GRAPH_RESOLVED");
            }
            return finalize(ctx);
        }
        catch (error) {
            if (error instanceof ProtocolError) {
                addInvalid(ctx, error.code, error.stage, error.details, error.message);
            }
            else {
                addUnknown(ctx, "VALIDATOR_INTERNAL_ERROR", "ROOT", {}, error?.message ?? String(error));
            }
            return finalize(ctx);
        }
    }
    static async assertValidOnChainTransaction(options) {
        const report = await TokenValidator.validateOnChainTransaction(options);
        if (report.status !== "VALID" || report.kind !== "TRANSITION") {
            throw new TokenValidationError(report);
        }
        return report;
    }
}
exports.TokenValidator = TokenValidator;
module.exports = TokenValidator;
module.exports.TokenValidator = TokenValidator;
module.exports.TokenValidationError = TokenValidationError;
