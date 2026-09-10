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
exports.TBC20_MAX_SLOT_AMOUNT = exports.TBC20_MAX_TAPE_BYTES = exports.TBC20_MIN_TAPE_BYTES = exports.TBC20_TAPE_MARKER = exports.TBC20_TAPE_PREFIX = exports.TBC20_CODE_MARKER = exports.TBC20_AMOUNT_BYTES = exports.TBC20_AMOUNT_SLOTS = exports.TBC20_TAPE_SATOSHIS = exports.TBC20_CODE_SATOSHIS = exports.TBC20_MAX_OUTPUTS = exports.TBC20_MAX_OUTPUT_GROUPS = exports.TBC20_MAX_INPUTS = void 0;
exports.encodeTBC20UnsignedLE = encodeTBC20UnsignedLE;
exports.encodeTBC20UInt64LE = encodeTBC20UInt64LE;
exports.getTBC20PartialScriptData = getTBC20PartialScriptData;
exports.getTBC20CurrentOutputData = getTBC20CurrentOutputData;
exports.getTBC20CurrentInputsData = getTBC20CurrentInputsData;
exports.readTBC20TapeAmounts = readTBC20TapeAmounts;
exports.replaceTBC20TapeAmounts = replaceTBC20TapeAmounts;
exports.getTBC20PreTxData = getTBC20PreTxData;
exports.getTBC20PrePreTxArray = getTBC20PrePreTxArray;
exports.getTBC20ContractTxData = getTBC20ContractTxData;
exports.getTBC20Controller = getTBC20Controller;
exports.getTBC20CodeIdentity = getTBC20CodeIdentity;
exports.buildTBC20UnlockScriptWithSignature = buildTBC20UnlockScriptWithSignature;
exports.buildTBC20UnlockScript = buildTBC20UnlockScript;
const tbc = __importStar(require("tbc-lib-js"));
const partialSha256 = require("tbc-lib-js/lib/util/partial-sha256");
exports.TBC20_MAX_INPUTS = 6;
exports.TBC20_MAX_OUTPUT_GROUPS = 8;
exports.TBC20_MAX_OUTPUTS = exports.TBC20_MAX_OUTPUT_GROUPS * 2;
exports.TBC20_CODE_SATOSHIS = 500;
exports.TBC20_TAPE_SATOSHIS = 0;
exports.TBC20_AMOUNT_SLOTS = 6;
exports.TBC20_AMOUNT_BYTES = exports.TBC20_AMOUNT_SLOTS * 8;
exports.TBC20_CODE_MARKER = Buffer.from("TBC20CODE2", "ascii");
exports.TBC20_TAPE_PREFIX = Buffer.from("006a30", "hex");
exports.TBC20_TAPE_MARKER = Buffer.from("TBC20TAPE", "ascii");
exports.TBC20_MIN_TAPE_BYTES = exports.TBC20_TAPE_PREFIX.length + exports.TBC20_AMOUNT_BYTES + exports.TBC20_TAPE_MARKER.length;
exports.TBC20_MAX_TAPE_BYTES = 127;
// OP_BIN2NUM interprets the eight-byte amount as signed magnitude. Values with
// bit 63 set would be negative inside the contract even though the tape field
// is declared uint64, so the SDK deliberately exposes the actual safe range.
exports.TBC20_MAX_SLOT_AMOUNT = (1n << 63n) - 1n;
const EMPTY_PARTIAL_SCRIPT = Object.freeze({
    suffixData: Buffer.alloc(0),
    partialHash: Buffer.alloc(0),
    size: Buffer.alloc(0),
});
function fail(message) {
    throw new Error(`TBC20 unlock: ${message}`);
}
function assertTransaction(value, name) {
    if (!(value instanceof tbc.Transaction)) {
        fail(`${name} must be a tbc.Transaction`);
    }
}
function assertIndex(value, upperExclusive, name) {
    if (!Number.isSafeInteger(value) || value < 0 || value >= upperExclusive) {
        fail(`${name} must be an integer in [0, ${upperExclusive - 1}]`);
    }
}
function assertVersion10Transaction(tx, name) {
    assertTransaction(tx, name);
    const version = tx.version;
    if (version !== 10) {
        fail(`${name}.version must be exactly 10`);
    }
    if (tx.inputs.length < 1 || tx.inputs.length > 0x7fffffff) {
        fail(`${name} must contain 1-2147483647 inputs`);
    }
    if (tx.outputs.length < 1 || tx.outputs.length > 0x7fffffff) {
        fail(`${name} must contain 1-2147483647 outputs`);
    }
}
function toBuffer(value, name) {
    if (Buffer.isBuffer(value)) {
        return Buffer.from(value);
    }
    if (typeof value !== "string" || value.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(value)) {
        fail(`${name} must be an even-length hexadecimal string or Buffer`);
    }
    return Buffer.from(value, "hex");
}
function toPublicKeyBuffer(value) {
    let buffer;
    if (value instanceof tbc.PublicKey) {
        buffer = value.toBuffer();
    }
    else {
        buffer = toBuffer(value, "publicKey");
    }
    if (buffer.length !== 33) {
        fail(`publicKey must be a compressed 33-byte public key, got ${buffer.length} bytes`);
    }
    try {
        tbc.PublicKey.fromBuffer(buffer);
    }
    catch (error) {
        fail(`publicKey is invalid: ${error.message}`);
    }
    return buffer;
}
function toSignatureBuffer(value) {
    const buffer = toBuffer(value, "signature");
    if (buffer.length === 65 || buffer.length > 72 || !tbc.crypto.Signature.isTxDER(buffer)) {
        fail("signature must be a canonical DER transaction signature, low-S, and at most 72 bytes");
    }
    let signature;
    try {
        signature = tbc.crypto.Signature.fromTxFormat(buffer);
    }
    catch (error) {
        fail(`signature cannot be decoded: ${error.message}`);
    }
    if (!signature.hasLowS() || !signature.hasDefinedHashtype() || signature.nhashtype !== 0x41) {
        fail("signature must be low-S and use SIGHASH_ALL | SIGHASH_FORKID (0x41)");
    }
    return buffer;
}
function assertSatoshis(value, name) {
    if (!Number.isSafeInteger(value) || value < 0) {
        fail(`${name} must be a non-negative safe integer`);
    }
}
/** Minimal non-negative ScriptNum encoding used by APC `number` fields. */
function encodeTBC20UnsignedLE(value) {
    if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) {
        fail("unsigned integer number must be a non-negative safe integer");
    }
    if (typeof value !== "number" && typeof value !== "bigint") {
        fail("unsigned integer must be a number or bigint");
    }
    const numeric = typeof value === "bigint" ? value : BigInt(value);
    if (numeric < 0n) {
        fail("unsigned integer cannot be negative");
    }
    if (numeric === 0n) {
        return Buffer.alloc(0);
    }
    const bytes = [];
    let remaining = numeric;
    while (remaining > 0n) {
        bytes.push(Number(remaining & 0xffn));
        remaining >>= 8n;
    }
    // ScriptNum uses signed magnitude. Preserve a non-negative sign whenever
    // the most significant data byte has its high bit set.
    if ((bytes[bytes.length - 1] & 0x80) !== 0) {
        bytes.push(0);
    }
    return Buffer.from(bytes);
}
function encodeTBC20UInt64LE(value, name = "amount") {
    if (typeof value !== "bigint" || value < 0n || value > ((1n << 64n) - 1n)) {
        fail(`${name} must be a uint64 bigint`);
    }
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64LE(value);
    return buffer;
}
function outputValueBuffer(output, name) {
    assertSatoshis(output.satoshis, `${name}.satoshis`);
    return encodeTBC20UInt64LE(BigInt(output.satoshis), `${name}.satoshis`);
}
function inputRecord(input) {
    if (!Buffer.isBuffer(input.prevTxId) || input.prevTxId.length !== 32) {
        fail("transaction input prevTxId must be 32 bytes");
    }
    if (!Number.isSafeInteger(input.outputIndex) || input.outputIndex < 0 || input.outputIndex > 0xffffffff) {
        fail("transaction input outputIndex must be uint32");
    }
    if (!Number.isSafeInteger(input.sequenceNumber) || input.sequenceNumber < 0 || input.sequenceNumber > 0xffffffff) {
        fail("transaction input sequenceNumber must be uint32");
    }
    const writer = new tbc.encoding.BufferWriter();
    writer.writeReverse(input.prevTxId);
    writer.writeUInt32LE(input.outputIndex);
    writer.writeUInt32LE(input.sequenceNumber);
    return writer.toBuffer();
}
function txVLIO(tx) {
    const writer = new tbc.encoding.BufferWriter();
    writer.writeUInt32LE(tx.version);
    writer.writeUInt32LE(tx.nLockTime);
    writer.writeInt32LE(tx.inputs.length);
    writer.writeInt32LE(tx.outputs.length);
    return writer.toBuffer();
}
function txInputRecords(tx) {
    return Buffer.concat(tx.inputs.map((input) => inputRecord(input)));
}
function txUnlockingScriptsHash(tx) {
    const hashes = tx.inputs.map((input) => {
        if (!(input.script instanceof tbc.Script)) {
            fail("transaction input is missing its unlocking script");
        }
        return tbc.crypto.Hash.sha256(input.script.toBuffer());
    });
    return tbc.crypto.Hash.sha256(Buffer.concat(hashes));
}
function txInputsHashData(tx) {
    return Buffer.concat([
        tbc.crypto.Hash.sha256(txInputRecords(tx)),
        txUnlockingScriptsHash(tx),
    ]);
}
function outputHashRecord(output, name) {
    if (!(output.script instanceof tbc.Script)) {
        fail(`${name}.script must be a tbc.Script`);
    }
    return Buffer.concat([
        outputValueBuffer(output, name),
        tbc.crypto.Hash.sha256(output.script.toBuffer()),
    ]);
}
function outputHashRecords(tx, startInclusive, endExclusive) {
    const records = [];
    for (let index = startInclusive; index < endExclusive; index += 1) {
        records.push(outputHashRecord(tx.outputs[index], `outputs[${index}]`));
    }
    return Buffer.concat(records);
}
function getTBC20PartialScriptData(script) {
    if (!(script instanceof tbc.Script)) {
        fail("locking script must be a tbc.Script");
    }
    const lockingScript = script.toBuffer();
    if (lockingScript.length === 0) {
        fail("a physical output cannot use an empty locking script in this ABI");
    }
    const partialOffset = Math.floor(lockingScript.length / 64) * 64;
    if (partialOffset === 0) {
        return {
            suffixData: Buffer.from(lockingScript),
            partialHash: Buffer.alloc(0),
            size: encodeTBC20UnsignedLE(lockingScript.length),
        };
    }
    const partialHashHex = partialSha256.calculate_partial_hash(lockingScript.subarray(0, partialOffset));
    const partialHash = Buffer.from(partialHashHex, "hex");
    if (partialHash.length !== 32) {
        fail("partial SHA-256 implementation returned a non-32-byte state");
    }
    return {
        suffixData: Buffer.from(lockingScript.subarray(partialOffset)),
        partialHash,
        size: encodeTBC20UnsignedLE(lockingScript.length),
    };
}
function outputData(output, name) {
    return {
        value: outputValueBuffer(output, name),
        lockingScript: getTBC20PartialScriptData(output.script),
    };
}
function emptyOutputData() {
    return {
        value: Buffer.alloc(0),
        lockingScript: {
            suffixData: Buffer.from(EMPTY_PARTIAL_SCRIPT.suffixData),
            partialHash: Buffer.from(EMPTY_PARTIAL_SCRIPT.partialHash),
            size: Buffer.from(EMPTY_PARTIAL_SCRIPT.size),
        },
    };
}
function emptyOutputGroupData() {
    return {
        code: emptyOutputData(),
        tape: { value: Buffer.alloc(0), lockingScript: Buffer.alloc(0) },
    };
}
function outputGroupData(codeOutput, tapeOutput, label) {
    return {
        code: outputData(codeOutput, `${label}.Code`),
        tape: tapeOutput
            ? {
                value: outputValueBuffer(tapeOutput, `${label}.Tape`),
                lockingScript: Buffer.from(tapeOutput.script.toBuffer()),
            }
            : { value: Buffer.alloc(0), lockingScript: Buffer.alloc(0) },
    };
}
function getTBC20CurrentOutputData(tx, outputGroups) {
    assertVersion10Transaction(tx, "currentTx");
    if (tx.outputs.length < 1 || tx.outputs.length > exports.TBC20_MAX_OUTPUTS) {
        fail(`currentTx must contain 1-${exports.TBC20_MAX_OUTPUTS} outputs`);
    }
    if (!Array.isArray(outputGroups) || outputGroups.length < 1 || outputGroups.length > exports.TBC20_MAX_OUTPUT_GROUPS) {
        fail(`outputGroups must contain 1-${exports.TBC20_MAX_OUTPUT_GROUPS} logical groups`);
    }
    const groups = [];
    let nextPhysicalVout = 0;
    outputGroups.forEach((group, groupIndex) => {
        if (!group || typeof group !== "object") {
            fail(`outputGroups[${groupIndex}] must be an object`);
        }
        if (group.codeVout !== nextPhysicalVout) {
            fail(`outputGroups[${groupIndex}].codeVout must be ${nextPhysicalVout} to preserve physical output order`);
        }
        assertIndex(group.codeVout, tx.outputs.length, `outputGroups[${groupIndex}].codeVout`);
        let tapeOutput;
        if (group.tapeVout !== undefined) {
            if (group.tapeVout !== group.codeVout + 1) {
                fail(`outputGroups[${groupIndex}].tapeVout must immediately follow codeVout`);
            }
            assertIndex(group.tapeVout, tx.outputs.length, `outputGroups[${groupIndex}].tapeVout`);
            tapeOutput = tx.outputs[group.tapeVout];
            nextPhysicalVout += 2;
        }
        else {
            nextPhysicalVout += 1;
        }
        groups.push(outputGroupData(tx.outputs[group.codeVout], tapeOutput, `currentTX.Outputs[${groupIndex}]`));
    });
    if (nextPhysicalVout !== tx.outputs.length) {
        fail(`outputGroups cover ${nextPhysicalVout} physical outputs, but currentTx has ${tx.outputs.length}`);
    }
    while (groups.length < exports.TBC20_MAX_OUTPUT_GROUPS) {
        groups.push(emptyOutputGroupData());
    }
    return groups;
}
function getTBC20CurrentInputsData(tx) {
    assertVersion10Transaction(tx, "currentTx");
    if (tx.inputs.length < 1) {
        fail("currentTx must contain at least one input");
    }
    return txInputRecords(tx);
}
function readTBC20TapeAmounts(script) {
    let tape;
    if (script instanceof tbc.Script) {
        tape = script.toBuffer();
    }
    else {
        tape = toBuffer(script, "tape script");
    }
    if (tape.length < exports.TBC20_MIN_TAPE_BYTES || tape.length > exports.TBC20_MAX_TAPE_BYTES) {
        fail(`tape script must be ${exports.TBC20_MIN_TAPE_BYTES}-${exports.TBC20_MAX_TAPE_BYTES} bytes, got ${tape.length}`);
    }
    if (!tape.subarray(0, exports.TBC20_TAPE_PREFIX.length).equals(exports.TBC20_TAPE_PREFIX)) {
        fail("tape script must start with OP_FALSE OP_RETURN PUSH48 (006a30)");
    }
    if (!tape.subarray(tape.length - exports.TBC20_TAPE_MARKER.length).equals(exports.TBC20_TAPE_MARKER)) {
        fail("tape script must end with ASCII TBC20TAPE");
    }
    const amounts = [];
    for (let index = 0; index < exports.TBC20_AMOUNT_SLOTS; index += 1) {
        const amount = tape.readBigUInt64LE(exports.TBC20_TAPE_PREFIX.length + index * 8);
        if (amount > exports.TBC20_MAX_SLOT_AMOUNT) {
            fail(`tape amount slot ${index} exceeds the contract-safe signed-63-bit range`);
        }
        amounts.push(amount);
    }
    return amounts;
}
function replaceTBC20TapeAmounts(script, amounts) {
    if (!Array.isArray(amounts) || amounts.length !== exports.TBC20_AMOUNT_SLOTS) {
        fail(`amounts must contain exactly ${exports.TBC20_AMOUNT_SLOTS} bigint entries`);
    }
    const source = script instanceof tbc.Script ? script.toBuffer() : toBuffer(script, "tape script");
    // Validate the immutable envelope before copying it.
    readTBC20TapeAmounts(source);
    const result = Buffer.from(source);
    amounts.forEach((amount, index) => {
        if (typeof amount !== "bigint" || amount < 0n || amount > exports.TBC20_MAX_SLOT_AMOUNT) {
            fail(`amounts[${index}] must be a bigint in [0, ${exports.TBC20_MAX_SLOT_AMOUNT}]`);
        }
        result.writeBigUInt64LE(amount, exports.TBC20_TAPE_PREFIX.length + index * 8);
    });
    return tbc.Script.fromBuffer(result);
}
function getTBC20PreTxData(tx, codeVout) {
    assertVersion10Transaction(tx, "preTx");
    assertIndex(codeVout, tx.outputs.length, "preTxVout");
    if (tx.inputs.length > exports.TBC20_MAX_INPUTS) {
        fail(`preTx must contain at most ${exports.TBC20_MAX_INPUTS} inputs`);
    }
    if (codeVout + 1 >= tx.outputs.length) {
        fail("preTx TBC20 code output must be immediately followed by its tape output");
    }
    if (tx.outputs[codeVout].satoshis !== exports.TBC20_CODE_SATOSHIS) {
        fail(`preTx code output must contain exactly ${exports.TBC20_CODE_SATOSHIS} satoshis`);
    }
    if (tx.outputs[codeVout + 1].satoshis !== exports.TBC20_TAPE_SATOSHIS) {
        fail("preTx tape output must contain exactly 0 satoshis");
    }
    readTBC20TapeAmounts(tx.outputs[codeVout + 1].script);
    const inputs = [];
    for (let index = 0; index < exports.TBC20_MAX_INPUTS; index += 1) {
        // Every fixed ABI leaf must be either empty or one exact 40-byte record.
        inputs.push(index < tx.inputs.length ? inputRecord(tx.inputs[index]) : Buffer.alloc(0));
    }
    return {
        vlio: txVLIO(tx),
        inputs,
        unlockingScriptHash: txUnlockingScriptsHash(tx),
        outputsFirstPart: outputHashRecords(tx, 0, codeVout),
        outputsGotData: outputGroupData(tx.outputs[codeVout], tx.outputs[codeVout + 1], "preTX.OutputsGotData"),
        outputsLastPart: outputHashRecords(tx, codeVout + 2, tx.outputs.length),
    };
}
function getTBC20PrePreTxData(tx, verifiedVout) {
    assertVersion10Transaction(tx, "prepreTx");
    assertIndex(verifiedVout, tx.outputs.length, "prepreTx vout");
    const verifiedOutput = tx.outputs[verifiedVout];
    if (verifiedOutput.script.toBuffer().length === 0) {
        fail("prepreTx verified output cannot use an empty locking script");
    }
    return {
        vlio: txVLIO(tx),
        txInputsHashData: txInputsHashData(tx),
        outputsFirstPart: outputHashRecords(tx, 0, verifiedVout),
        outputsVerifiedData: outputData(verifiedOutput, "prepreTX.OutputsVerifiedData"),
        outputsLastPart: outputHashRecords(tx, verifiedVout + 1, tx.outputs.length),
    };
}
function emptyPrePreTxData() {
    return {
        vlio: Buffer.alloc(0),
        txInputsHashData: Buffer.alloc(0),
        outputsFirstPart: Buffer.alloc(0),
        outputsVerifiedData: emptyOutputData(),
        outputsLastPart: Buffer.alloc(0),
    };
}
function resolverLookup(resolver, txid) {
    const normalized = txid.toLowerCase();
    if (typeof resolver === "function") {
        return resolver(normalized);
    }
    if (resolver instanceof Map) {
        return resolver.get(normalized) ?? resolver.get(txid);
    }
    if (Array.isArray(resolver)) {
        return resolver.find((tx) => tx instanceof tbc.Transaction && tx.hash.toLowerCase() === normalized);
    }
    fail("ancestorTransactions must be a transaction array, Map, or resolver function");
}
function getTBC20PrePreTxArray(preTx, codeVout, resolver) {
    const preData = getTBC20PreTxData(preTx, codeVout);
    const amounts = readTBC20TapeAmounts(preData.outputsGotData.tape.lockingScript);
    const result = Array.from({ length: exports.TBC20_MAX_INPUTS }, () => emptyPrePreTxData());
    // The contract scans amount slots 5..0 and writes them into prepreTX[0..5].
    // Therefore parent vin k is authenticated by prepreTX[5-k].
    for (let parentInputIndex = 0; parentInputIndex < exports.TBC20_MAX_INPUTS; parentInputIndex += 1) {
        if (amounts[parentInputIndex] === 0n) {
            continue;
        }
        if (parentInputIndex >= preTx.inputs.length) {
            fail(`tape slot ${parentInputIndex} is non-zero but preTx has no matching input`);
        }
        const parentInput = preTx.inputs[parentInputIndex];
        const txid = parentInput.prevTxId.toString("hex").toLowerCase();
        const ancestor = resolverLookup(resolver, txid);
        if (!ancestor) {
            fail(`missing ancestor transaction ${txid} for preTx input ${parentInputIndex}`);
        }
        assertTransaction(ancestor, `ancestorTransactions[${txid}]`);
        if (ancestor.hash.toLowerCase() !== txid) {
            fail(`ancestor transaction hash does not match preTx input ${parentInputIndex}`);
        }
        assertIndex(parentInput.outputIndex, ancestor.outputs.length, `preTx.inputs[${parentInputIndex}].outputIndex`);
        result[exports.TBC20_MAX_INPUTS - 1 - parentInputIndex] = getTBC20PrePreTxData(ancestor, parentInput.outputIndex);
    }
    return result;
}
function getTBC20ContractTxData(tx, contractVout) {
    assertVersion10Transaction(tx, "contractTx");
    assertIndex(contractVout, tx.outputs.length, "contractTx vout");
    const middle = tx.outputs[contractVout];
    if (middle.script.toBuffer().length === 0) {
        fail("contractTx controlling output cannot have an empty locking script");
    }
    return {
        vlio: txVLIO(tx),
        txInputsHashData: txInputsHashData(tx),
        outputsFirstPart: outputHashRecords(tx, 0, contractVout),
        outputsMiddlePart: {
            value: outputValueBuffer(middle, "contractTX.OutputsMiddlePart"),
            // Despite the field name, ContractTX.LockingScript is concatenated
            // directly into the 40-byte output record in the contract and therefore
            // carries SHA256(actual locking script), not the full script.
            lockingScript: tbc.crypto.Hash.sha256(middle.script.toBuffer()),
        },
        outputsLastPart: outputHashRecords(tx, contractVout + 1, tx.outputs.length),
    };
}
function emptyContractTxData() {
    return {
        vlio: Buffer.alloc(0),
        txInputsHashData: Buffer.alloc(0),
        outputsFirstPart: Buffer.alloc(0),
        outputsMiddlePart: { value: Buffer.alloc(0), lockingScript: Buffer.alloc(0) },
        outputsLastPart: Buffer.alloc(0),
    };
}
/** Return the terminal 21-byte controller: hash160 || controlOption. */
function getTBC20Controller(codeScript) {
    const code = codeScript instanceof tbc.Script ? codeScript.toBuffer() : toBuffer(codeScript, "code script");
    const terminalMarker = Buffer.concat([
        Buffer.from([exports.TBC20_CODE_MARKER.length]),
        exports.TBC20_CODE_MARKER,
    ]);
    const terminalSuffixBytes = 1 + 21 + terminalMarker.length;
    if (code.length < terminalSuffixBytes ||
        !code.subarray(code.length - terminalMarker.length).equals(terminalMarker)) {
        fail("code script is missing the terminal TBC20CODE2 marker");
    }
    const controllerPushOffset = code.length - terminalSuffixBytes;
    if (code[controllerPushOffset] !== 21) {
        fail("code script terminal controller must be a direct 21-byte push");
    }
    return Buffer.from(code.subarray(controllerPushOffset + 1, controllerPushOffset + 22));
}
function getTBC20CodeIdentity(codeScript) {
    const script = codeScript instanceof tbc.Script
        ? codeScript
        : tbc.Script.fromBuffer(toBuffer(codeScript, "code script"));
    const partial = getTBC20PartialScriptData(script);
    return Buffer.concat([partial.partialHash, partial.size]);
}
function assertCurrentInputLinksPreTx(currentTx, inputIndex, preTx, preTxVout) {
    assertIndex(inputIndex, currentTx.inputs.length, "inputIndex");
    assertIndex(preTxVout, preTx.outputs.length, "preTxVout");
    const input = currentTx.inputs[inputIndex];
    if (input.prevTxId.toString("hex").toLowerCase() !== preTx.hash.toLowerCase()) {
        fail("currentTx input does not spend preTx");
    }
    if (input.outputIndex !== preTxVout) {
        fail(`currentTx input spends vout ${input.outputIndex}, not preTxVout ${preTxVout}`);
    }
    if (!input.output || !(input.output.script instanceof tbc.Script)) {
        fail("currentTx input is missing authenticated previous-output metadata");
    }
    const expectedOutput = preTx.outputs[preTxVout];
    if (!input.output.script.equals(expectedOutput.script)) {
        fail("currentTx input previous-output script differs from preTx output script");
    }
    if (input.output.satoshis !== expectedOutput.satoshis) {
        fail("currentTx input previous-output satoshis differ from preTx output");
    }
}
function resolveContractWitness(currentTx, controller, witness) {
    const controllerHash = controller.subarray(0, 20);
    const controlOption = controller[20];
    if (controlOption === 0) {
        if (witness) {
            fail("contractController must be omitted for address-controlled TBC20 inputs");
        }
        return { data: emptyContractTxData(), currentInputIndex: 0 };
    }
    if (controlOption === 0x80) {
        fail("controller option 80 is non-canonical ScriptNum negative zero");
    }
    if (!witness) {
        fail("contract-controlled TBC20 input requires contractController witness data");
    }
    assertTransaction(witness.transaction, "contractController.transaction");
    assertIndex(witness.currentInputIndex, currentTx.inputs.length, "contractController.currentInputIndex");
    const currentInput = currentTx.inputs[witness.currentInputIndex];
    const contractTxid = currentInput.prevTxId.toString("hex").toLowerCase();
    if (contractTxid !== witness.transaction.hash.toLowerCase()) {
        fail("contractController current input does not spend contractController.transaction");
    }
    assertIndex(currentInput.outputIndex, witness.transaction.outputs.length, "contract controller vout");
    const controllingOutput = witness.transaction.outputs[currentInput.outputIndex];
    if (!currentInput.output || !(currentInput.output.script instanceof tbc.Script)) {
        fail("contractController current input is missing previous-output metadata");
    }
    if (!currentInput.output.script.equals(controllingOutput.script) || currentInput.output.satoshis !== controllingOutput.satoshis) {
        fail("contractController current input previous-output metadata differs from its transaction");
    }
    const controllingScript = controllingOutput.script.toBuffer();
    const controllingScriptHash = tbc.crypto.Hash.sha256(controllingScript);
    if (!tbc.crypto.Hash.sha256ripemd160(controllingScriptHash).equals(controllerHash)) {
        fail("contract controller hash160 does not match the controlling output script");
    }
    return {
        data: getTBC20ContractTxData(witness.transaction, currentInput.outputIndex),
        currentInputIndex: witness.currentInputIndex,
    };
}
function addBuffer(script, value) {
    script.add(value);
}
function addSmallScriptNumber(script, value, name) {
    if (!Number.isInteger(value) || value < 0 || value > 16) {
        fail(`${name} must be an integer in [0, 16]`);
    }
    script.add(tbc.Opcode.smallInt(value));
}
function addScriptNumber(script, value, name) {
    if (!Number.isSafeInteger(value) || value < 0) {
        fail(`${name} must be a non-negative safe integer`);
    }
    if (value <= 16) {
        addSmallScriptNumber(script, value, name);
    }
    else {
        addBuffer(script, encodeTBC20UnsignedLE(value));
    }
}
function addOutputData(script, output) {
    addBuffer(script, output.value);
    addBuffer(script, output.lockingScript.suffixData);
    addBuffer(script, output.lockingScript.partialHash);
    addBuffer(script, output.lockingScript.size);
}
function addOutputGroupData(script, output) {
    addOutputData(script, output.code);
    addBuffer(script, output.tape.value);
    addBuffer(script, output.tape.lockingScript);
}
function addPrePreTxData(script, tx) {
    addBuffer(script, tx.vlio);
    addBuffer(script, tx.txInputsHashData);
    addBuffer(script, tx.outputsFirstPart);
    addOutputData(script, tx.outputsVerifiedData);
    addBuffer(script, tx.outputsLastPart);
}
function addContractTxData(script, tx) {
    addBuffer(script, tx.vlio);
    addBuffer(script, tx.txInputsHashData);
    addBuffer(script, tx.outputsFirstPart);
    addBuffer(script, tx.outputsMiddlePart.value);
    addBuffer(script, tx.outputsMiddlePart.lockingScript);
    addBuffer(script, tx.outputsLastPart);
}
function addPreTxData(script, tx) {
    addBuffer(script, tx.vlio);
    tx.inputs.forEach((input) => addBuffer(script, input));
    addBuffer(script, tx.unlockingScriptHash);
    addBuffer(script, tx.outputsFirstPart);
    addOutputGroupData(script, tx.outputsGotData);
    addBuffer(script, tx.outputsLastPart);
}
function buildTBC20UnlockScriptWithSignature(options) {
    if (!options || typeof options !== "object") {
        fail("options are required");
    }
    const { currentTx, inputIndex, preTx, preTxVout } = options;
    assertVersion10Transaction(currentTx, "currentTx");
    assertVersion10Transaction(preTx, "preTx");
    if (currentTx.inputs.length < 1) {
        fail("currentTx must contain at least one input");
    }
    if (options.inputIndex >= exports.TBC20_AMOUNT_SLOTS) {
        fail(`a TBC20 input must be in current vin 0-${exports.TBC20_AMOUNT_SLOTS - 1}`);
    }
    assertCurrentInputLinksPreTx(currentTx, inputIndex, preTx, preTxVout);
    const signature = toSignatureBuffer(options.signature);
    const publicKey = toPublicKeyBuffer(options.publicKey);
    const preTxData = getTBC20PreTxData(preTx, preTxVout);
    const controller = getTBC20Controller(preTx.outputs[preTxVout].script);
    if (controller[20] === 0) {
        const expectedHash = controller.subarray(0, 20);
        if (!tbc.crypto.Hash.sha256ripemd160(publicKey).equals(expectedHash)) {
            fail("publicKey hash160 does not match the address controller in preTx code");
        }
    }
    const contract = resolveContractWitness(currentTx, controller, options.contractController);
    const currentOutputs = getTBC20CurrentOutputData(currentTx, options.outputGroups);
    const currentInputs = getTBC20CurrentInputsData(currentTx);
    const ancestors = getTBC20PrePreTxArray(preTx, preTxVout, options.ancestorTransactions);
    const unlockingScript = new tbc.Script();
    // This order is copied from tbc20.json unlock.main. Do not reverse arrays:
    // APC expands each struct and fixed array in declaration order.
    currentOutputs.forEach((output) => addOutputGroupData(unlockingScript, output));
    addBuffer(unlockingScript, currentInputs);
    addSmallScriptNumber(unlockingScript, inputIndex, "inputIndex");
    ancestors.forEach((ancestor) => addPrePreTxData(unlockingScript, ancestor));
    addBuffer(unlockingScript, signature);
    addBuffer(unlockingScript, publicKey);
    addContractTxData(unlockingScript, contract.data);
    addScriptNumber(unlockingScript, contract.currentInputIndex, "contractController.currentInputIndex");
    addPreTxData(unlockingScript, preTxData);
    if (unlockingScript.chunks.length !== 123) {
        fail(`internal ABI error: expected 123 pushes, built ${unlockingScript.chunks.length}`);
    }
    return unlockingScript;
}
function buildTBC20UnlockScript(options) {
    if (!options || !(options.privateKey instanceof tbc.PrivateKey)) {
        fail("privateKey must be a tbc.PrivateKey");
    }
    const signature = options.currentTx.getSignature(options.inputIndex, options.privateKey);
    if (typeof signature !== "string") {
        fail("privateKey did not produce exactly one transaction signature");
    }
    return buildTBC20UnlockScriptWithSignature({
        currentTx: options.currentTx,
        inputIndex: options.inputIndex,
        preTx: options.preTx,
        preTxVout: options.preTxVout,
        outputGroups: options.outputGroups,
        ancestorTransactions: options.ancestorTransactions,
        contractController: options.contractController,
        signature,
        publicKey: options.privateKey.toPublicKey(),
    });
}
