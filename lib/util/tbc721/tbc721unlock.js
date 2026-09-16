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
exports.buildTBC721Code = buildTBC721Code;
exports.parseTBC721Code = parseTBC721Code;
exports.buildTBC721UnlockScript = buildTBC721UnlockScript;
const tbc = __importStar(require("tbc-lib-js"));
// Compiled from apc-contract/src/tbc721.ct with --asa (without padding).
const artifact = require('./artifacts/tbc721.json');
const placeholder = '<self.OriginalUTXO36>';
const [prefixHex, suffixHex] = artifact.lock.hex.split(placeholder);
const prefix = Buffer.from(prefixHex, 'hex');
const suffix = Buffer.from(suffixHex, 'hex');
const sha = (value) => tbc.crypto.Hash.sha256(value);
function fail(message) { throw new Error(`TBC721: ${message}`); }
function u32(value) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
        fail('value must be a uint32');
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32LE(value);
    return buffer;
}
function value(output) {
    if (!Number.isSafeInteger(output.satoshis) || output.satoshis < 0)
        fail('invalid output satoshis');
    return new tbc.encoding.BufferWriter().writeUInt64LEBN(output.satoshisBN).toBuffer();
}
function transaction(tx, label) {
    if (!(tx instanceof tbc.Transaction) || tx.version !== 10)
        fail(`${label} must be a version 10 transaction`);
    if (!tx.inputs.length || !tx.outputs.length)
        fail(`${label} must contain inputs and outputs`);
}
function header(tx) {
    return Buffer.concat([u32(tx.version), u32(tx.nLockTime), u32(tx.inputs.length), u32(tx.outputs.length)]);
}
function inputs(tx) {
    return Buffer.concat(tx.inputs.map(input => Buffer.concat([
        Buffer.from(input.prevTxId).reverse(), u32(input.outputIndex), u32(input.sequenceNumber),
    ])));
}
function unlockingHash(tx) {
    return sha(Buffer.concat(tx.inputs.map(input => sha(input.script.toBuffer()))));
}
function records(outputs) {
    return Buffer.concat(outputs.map(output => Buffer.concat([value(output), sha(output.script.toBuffer())])));
}
/** ABI bytes must use minimal Script pushes, including one-byte numeric values. */
function push(script, data) {
    if (data.length === 1 && data[0] >= 1 && data[0] <= 16)
        script.add(0x50 + data[0]);
    else if (data.length === 1 && data[0] === 0x81)
        script.add(tbc.Opcode.OP_1NEGATE);
    else
        script.add(data);
}
function buildTBC721Code(txid, outputIndex) {
    if (typeof txid !== 'string' || !/^[0-9a-fA-F]{64}$/.test(txid))
        fail('root transaction ID must be 32-byte hexadecimal');
    const root = Buffer.concat([Buffer.from(txid, 'hex').reverse(), u32(outputIndex)]);
    return tbc.Script.fromHex(artifact.lock.hex.replace(placeholder, new tbc.Script().add(root).toHex()));
}
/** Match the complete compiled template, not merely its public marker. */
function parseTBC721Code(script) {
    let buffer;
    try {
        buffer = typeof script === 'string' ? tbc.Script.fromHex(script).toBuffer() : script.toBuffer();
    }
    catch {
        return fail('invalid Code script');
    }
    if (buffer.length !== prefix.length + 37 + suffix.length ||
        !buffer.subarray(0, prefix.length).equals(prefix) || buffer[prefix.length] !== 36 ||
        !buffer.subarray(prefix.length + 37).equals(suffix))
        fail('Code does not match the TBC721 template');
    const originalUTXO = Buffer.from(buffer.subarray(prefix.length + 1, prefix.length + 37));
    return { originalUTXO, txid: Buffer.from(originalUTXO.subarray(0, 32)).reverse().toString('hex'),
        outputIndex: originalUTXO.readUInt32LE(32) };
}
function linked(input, parent, index, label) {
    if (!Number.isInteger(index) || index < 0 || index >= parent.outputs.length ||
        input.outputIndex !== index || input.prevTxId.toString('hex').toLowerCase() !== parent.id.toLowerCase())
        fail(`${label} does not spend the specified ancestor output`);
    const output = parent.outputs[index];
    if (input.output && (!input.output.script.equals(output.script) || input.output.satoshis !== output.satoshis))
        fail(`${label} previous-output metadata does not match the ancestor`);
}
/**
 * Supply the complete signed parent and grandparent transactions. The genesis
 * mint slot may be any vout; subsequent TBC721 Code ancestry always uses vout 0.
 */
function buildTBC721UnlockScript(signature, publicKey, currentTX, preTX, prepreTX, currentUnlockIndex = 0) {
    transaction(currentTX, 'current transaction');
    transaction(preTX, 'parent transaction');
    transaction(prepreTX, 'grandparent transaction');
    if (currentUnlockIndex !== 0)
        fail('Code must be spent at input 0');
    if (!Buffer.isBuffer(signature) || signature.length < 2 || signature[signature.length - 1] !== 0x41)
        fail('signature must include the SIGHASH_ALL | SIGHASH_FORKID (0x41) byte');
    if (!Buffer.isBuffer(publicKey) || ![32, 33, 65].includes(publicKey.length))
        fail('invalid public key length');
    if (preTX.outputs.length < 2)
        fail('parent must contain Code and Hold outputs');
    linked(currentTX.inputs[0], preTX, 0, 'current Code input');
    const source = preTX.inputs[0];
    linked(source, prepreTX, source.outputIndex, 'parent first input');
    const descriptor = parseTBC721Code(preTX.outputs[0].script);
    if (!currentTX.outputs[0].script.equals(preTX.outputs[0].script))
        fail('output 0 must preserve the TBC721 Code');
    const ancestorCode = prepreTX.outputs[source.outputIndex].script;
    if (ancestorCode.equals(preTX.outputs[0].script)) {
        if (source.outputIndex !== 0)
            fail('continued Code ancestry must spend output 0');
    }
    else if (!descriptor.originalUTXO.equals(Buffer.concat([Buffer.from(source.prevTxId).reverse(), u32(source.outputIndex)]))) {
        fail('genesis ancestor does not match the original UTXO');
    }
    const hold = preTX.outputs[1].script.toBuffer();
    if (hold.length < 25 || !hold.subarray(0, 3).equals(Buffer.from('76a914', 'hex')) ||
        !hold.subarray(23, 25).equals(Buffer.from('88ac', 'hex')))
        fail('parent Hold must start with a canonical P2PKH script');
    if (!tbc.crypto.Hash.sha256ripemd160(publicKey).equals(hold.subarray(3, 23)))
        fail('public key does not match the parent Hold owner');
    const args = {
        sig: signature, publicKey,
        currentTX: { CodeValue: value(currentTX.outputs[0]), CodeHash: sha(currentTX.outputs[0].script.toBuffer()),
            OutputsLastPart: records(currentTX.outputs.slice(1)) },
        currentInputsData: inputs(currentTX),
        prepreTX: { VLIO: header(prepreTX), InputsHashData: Buffer.concat([sha(inputs(prepreTX)), unlockingHash(prepreTX)]),
            OutputsFirstPart: records(prepreTX.outputs.slice(0, source.outputIndex)),
            CodeValue: value(prepreTX.outputs[source.outputIndex]), CodeHash: sha(ancestorCode.toBuffer()),
            OutputsLastPart: records(prepreTX.outputs.slice(source.outputIndex + 1)) },
        preTX: { VLIO: header(preTX), Inputs: inputs(preTX), UnlockingScriptHash: unlockingHash(preTX),
            CodeValue: value(preTX.outputs[0]), CodeHash: sha(preTX.outputs[0].script.toBuffer()),
            HoldValue: value(preTX.outputs[1]), HoldScript: hold, OutputsLastPart: records(preTX.outputs.slice(2)) },
    };
    const result = new tbc.Script();
    for (const match of artifact.unlock.main.matchAll(/<([^>]+)>/g)) {
        const data = match[1].split('.').reduce((cursor, field) => cursor?.[field], args);
        if (!Buffer.isBuffer(data))
            fail(`missing ABI field ${match[1]}`);
        push(result, data);
    }
    return result;
}
