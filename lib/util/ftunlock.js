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
exports.getContractTxdata = getContractTxdata;
exports.getCurrentInputsdata = getCurrentInputsdata;
exports.getCurrentTxdata = getCurrentTxdata;
exports.getPreTxdata = getPreTxdata;
exports.getPrePreTxdata = getPrePreTxdata;
exports.getPrePreOutputsData = getPrePreOutputsData;
exports.getPreOutputsData = getPreOutputsData;
exports.getLengthHex = getLengthHex;
exports.getSize = getSize;
const tbc = __importStar(require("tbc-lib-js"));
const partial_sha256 = require('tbc-lib-js/lib/util/partial-sha256');
const version = 10;
const vliolength = '10'; // Version + nLockTime + inputCount + outputCount (16 bytes)
const amountlength = '08'; // Length of the amount field (8 bytes)
const hashlength = '20'; // Length of the hash field (32 bytes)
/**
 * Retrieves the transaction data needed for contract operations.
 * @param tx - The transaction object.
 * @returns The transaction data as a hex string.
 */
function getContractTxdata(tx, vout) {
    const writer = new tbc.encoding.BufferWriter();
    writer.write(Buffer.from(vliolength, 'hex'));
    writer.writeUInt32LE(version);
    writer.writeUInt32LE(tx.nLockTime);
    writer.writeInt32LE(tx.inputs.length);
    writer.writeInt32LE(tx.outputs.length);
    const inputWriter = new tbc.encoding.BufferWriter();
    const inputWriter2 = new tbc.encoding.BufferWriter();
    for (const input of tx.inputs) {
        inputWriter.writeReverse(input.prevTxId);
        inputWriter.writeUInt32LE(input.outputIndex);
        inputWriter.writeUInt32LE(input.sequenceNumber);
        inputWriter2.write(tbc.crypto.Hash.sha256(input.script.toBuffer()));
    }
    writer.write(Buffer.from(hashlength, 'hex'));
    writer.write(tbc.crypto.Hash.sha256(inputWriter.toBuffer()));
    writer.write(Buffer.from(hashlength, 'hex'));
    writer.write(tbc.crypto.Hash.sha256(inputWriter2.toBuffer()));
    const { outputs1, outputs1length, outputs2, outputs2length } = getPrePreOutputsData(tx, vout);
    writer.write(Buffer.from(outputs1length, 'hex'));
    writer.write(Buffer.from(outputs1, 'hex'));
    writer.write(Buffer.from(amountlength, 'hex'));
    writer.writeUInt64LEBN(tx.outputs[vout].satoshisBN);
    writer.write(Buffer.from(hashlength, 'hex'));
    writer.write(tbc.crypto.Hash.sha256(tx.outputs[vout].script.toBuffer()));
    writer.write(Buffer.from(outputs2length, 'hex'));
    writer.write(Buffer.from(outputs2, 'hex'));
    const contracttxdata = writer.toBuffer().toString('hex');
    return `${contracttxdata}`;
}
/**
 * Retrieves the inputs data from the current transaction.
 * @param tx - The transaction object.
 * @returns The inputs data as a hex string.
 */
function getCurrentInputsdata(tx) {
    const writer = new tbc.encoding.BufferWriter();
    const inputWriter = new tbc.encoding.BufferWriter();
    for (const input of tx.inputs) {
        inputWriter.writeReverse(input.prevTxId);
        inputWriter.writeUInt32LE(input.outputIndex);
        inputWriter.writeUInt32LE(input.sequenceNumber);
    }
    writer.write(getLengthHex(inputWriter.toBuffer().length));
    writer.write(inputWriter.toBuffer());
    const currentinputsdata = writer.toBuffer().toString('hex');
    return `${currentinputsdata}`;
}
/**
 * Retrieves the current transaction data needed for unlocking scripts.
 * @param tx - The transaction object.
 * @param inputIndex - The index of the input being unlocked.
 * @returns The transaction data as a hex string.
 */
function getCurrentTxdata(tx, inputIndex) {
    const endTag = '51';
    const writer = new tbc.encoding.BufferWriter();
    for (let i = 0; i < tx.outputs.length; i++) {
        const lockingscript = tx.outputs[i].script.toBuffer();
        if (lockingscript.length == 1564) {
            // For scripts longer than 1500 bytes, calculate partial hash
            const size = getSize(lockingscript.length); // Size in little-endian
            const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
            const suffixdata = lockingscript.subarray(1536);
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
            writer.write(getLengthHex(suffixdata.length)); // Suffix data
            writer.write(suffixdata);
            writer.write(Buffer.from(hashlength, 'hex')); // Partial hash
            writer.write(Buffer.from(partialhash, 'hex'));
            writer.write(getLengthHex(size.length));
            writer.write(size);
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
            writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
            writer.write(tx.outputs[i + 1].script.toBuffer());
            i++;
        }
        else {
            // For shorter scripts, include the entire locking script
            const size = getSize(lockingscript.length);
            const partialhash = '00';
            const suffixdata = lockingscript;
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
            writer.write(getLengthHex(suffixdata.length)); // Entire locking script
            writer.write(suffixdata);
            writer.write(Buffer.from(partialhash, 'hex')); // No partial hash
            writer.write(getLengthHex(size.length));
            writer.write(size);
        }
        writer.write(Buffer.from('52', 'hex'));
    }
    const currenttxdata = writer.toBuffer().toString('hex');
    const inputIndexMap = {
        0: '00',
        1: '51',
        2: '52',
        3: '53',
        4: '54',
        5: '55'
    };
    return `${endTag}${currenttxdata}${inputIndexMap[inputIndex]}`;
}
/**
 * Retrieves the previous transaction data needed for unlocking scripts.
 * @param tx - The previous transaction object.
 * @param vout - The output index in the previous transaction.
 * @returns The transaction data as a hex string.
 */
function getPreTxdata(tx, vout) {
    const writer = new tbc.encoding.BufferWriter();
    writer.write(Buffer.from(vliolength, 'hex'));
    writer.writeUInt32LE(version);
    writer.writeUInt32LE(tx.nLockTime);
    writer.writeInt32LE(tx.inputs.length);
    writer.writeInt32LE(tx.outputs.length);
    const inputWriter = new tbc.encoding.BufferWriter();
    const inputWriter2 = new tbc.encoding.BufferWriter();
    for (const input of tx.inputs) {
        inputWriter.writeReverse(input.prevTxId);
        inputWriter.writeUInt32LE(input.outputIndex);
        inputWriter.writeUInt32LE(input.sequenceNumber);
        inputWriter2.write(tbc.crypto.Hash.sha256(input.script.toBuffer()));
    }
    writer.write(getLengthHex(inputWriter.toBuffer().length));
    writer.write(inputWriter.toBuffer());
    writer.write(Buffer.from(hashlength, 'hex'));
    writer.write(tbc.crypto.Hash.sha256(inputWriter2.toBuffer()));
    const { outputs1, outputs1length, outputs2, outputs2length } = getPreOutputsData(tx, vout);
    writer.write(Buffer.from(outputs1length, 'hex'));
    writer.write(Buffer.from(outputs1, 'hex'));
    const lockingscript = tx.outputs[vout].script.toBuffer();
    const size = getSize(lockingscript.length); // Size in little-endian
    const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
    const suffixdata = lockingscript.subarray(1536);
    writer.write(Buffer.from(amountlength, 'hex'));
    writer.writeUInt64LEBN(tx.outputs[vout].satoshisBN);
    writer.write(getLengthHex(suffixdata.length)); // Suffix data
    writer.write(suffixdata);
    writer.write(Buffer.from(hashlength, 'hex')); // Partial hash
    writer.write(Buffer.from(partialhash, 'hex'));
    writer.write(getLengthHex(size.length));
    writer.write(size);
    writer.write(Buffer.from(amountlength, 'hex'));
    writer.writeUInt64LEBN(tx.outputs[vout + 1].satoshisBN);
    writer.write(getLengthHex(tx.outputs[vout + 1].script.toBuffer().length));
    writer.write(tx.outputs[vout + 1].script.toBuffer());
    writer.write(Buffer.from(outputs2length, 'hex'));
    writer.write(Buffer.from(outputs2, 'hex'));
    const pretxdata = writer.toBuffer().toString('hex');
    return `${pretxdata}`;
}
/**
 * Retrieves the previous transaction data from the grandparent transaction.
 * @param tx - The grandparent transaction object.
 * @param vout - The output index in the grandparent transaction.
 * @returns The transaction data as a hex string with a suffix '52'.
 */
function getPrePreTxdata(tx, vout) {
    const writer = new tbc.encoding.BufferWriter();
    writer.write(Buffer.from(vliolength, 'hex'));
    writer.writeUInt32LE(version);
    writer.writeUInt32LE(tx.nLockTime);
    writer.writeInt32LE(tx.inputs.length);
    writer.writeInt32LE(tx.outputs.length);
    const inputWriter = new tbc.encoding.BufferWriter();
    const inputWriter2 = new tbc.encoding.BufferWriter();
    for (const input of tx.inputs) {
        inputWriter.writeReverse(input.prevTxId);
        inputWriter.writeUInt32LE(input.outputIndex);
        inputWriter.writeUInt32LE(input.sequenceNumber);
        inputWriter2.write(tbc.crypto.Hash.sha256(input.script.toBuffer()));
    }
    writer.write(Buffer.from(hashlength, 'hex'));
    writer.write(tbc.crypto.Hash.sha256(inputWriter.toBuffer()));
    writer.write(Buffer.from(hashlength, 'hex'));
    writer.write(tbc.crypto.Hash.sha256(inputWriter2.toBuffer()));
    const { outputs1, outputs1length, outputs2, outputs2length } = getPrePreOutputsData(tx, vout);
    writer.write(Buffer.from(outputs1length, 'hex'));
    writer.write(Buffer.from(outputs1, 'hex'));
    const lockingscript = tx.outputs[vout].script.toBuffer();
    if (lockingscript.length == 1564) {
        const size = getSize(lockingscript.length); // Size in little-endian
        const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
        const suffixdata = lockingscript.subarray(1536);
        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[vout].satoshisBN);
        writer.write(getLengthHex(suffixdata.length)); // Suffix data
        writer.write(suffixdata);
        writer.write(Buffer.from(hashlength, 'hex')); // Partial hash
        writer.write(Buffer.from(partialhash, 'hex'));
        writer.write(getLengthHex(size.length));
        writer.write(size);
    }
    else {
        const size = getSize(lockingscript.length); // Size in little-endian
        const partialhash = '00';
        const suffixdata = lockingscript;
        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[vout].satoshisBN);
        writer.write(getLengthHex(suffixdata.length)); // Entire locking script
        writer.write(suffixdata);
        writer.write(Buffer.from(partialhash, 'hex')); // No partial hash
        writer.write(getLengthHex(size.length));
        writer.write(size);
    }
    writer.write(Buffer.from(outputs2length, 'hex'));
    writer.write(Buffer.from(outputs2, 'hex'));
    const prepretxdata = writer.toBuffer().toString('hex');
    return `${prepretxdata}52`;
}
/**
 * Helper function to get outputs data before the specified output index for the grandparent transaction.
 * @param tx - The transaction object.
 * @param vout - The output index.
 * @returns An object containing outputs1, outputs1length, outputs2, and outputs2length.
 */
function getPrePreOutputsData(tx, vout) {
    let outputs1 = ''; // Outputs before the specified index
    let outputs1length = '';
    let outputs2 = ''; // Outputs after the specified index
    let outputs2length = '';
    if (vout === 0) {
        outputs1 = '00';
        outputs1length = '';
    }
    else {
        const outputWriter1 = new tbc.encoding.BufferWriter();
        for (let i = 0; i < vout; i++) {
            outputWriter1.writeUInt64LEBN(tx.outputs[i].satoshisBN);
            outputWriter1.write(tbc.crypto.Hash.sha256(tx.outputs[i].script.toBuffer()));
        }
        outputs1 = outputWriter1.toBuffer().toString('hex');
        outputs1length = getLengthHex(outputs1.length / 2).toString('hex');
    }
    const outputWriter2 = new tbc.encoding.BufferWriter();
    for (let i = vout + 1; i < tx.outputs.length; i++) {
        outputWriter2.writeUInt64LEBN(tx.outputs[i].satoshisBN);
        outputWriter2.write(tbc.crypto.Hash.sha256(tx.outputs[i].script.toBuffer()));
    }
    outputs2 = outputWriter2.toBuffer().toString('hex');
    if (outputs2 === '') {
        outputs2 = '00';
        outputs2length = '';
    }
    else {
        outputs2length = getLengthHex(outputs2.length / 2).toString('hex');
    }
    return { outputs1, outputs1length, outputs2, outputs2length };
}
/**
 * Helper function to get outputs data before the specified output index for the parent transaction.
 * @param tx - The transaction object.
 * @param vout - The output index.
 * @returns An object containing outputs1, outputs1length, outputs2, and outputs2length.
 */
function getPreOutputsData(tx, vout) {
    let outputs1 = ''; // Outputs before the specified index
    let outputs1length = '';
    let outputs2 = ''; // Outputs after the specified index
    let outputs2length = '';
    if (vout === 0) {
        outputs1 = '00';
        outputs1length = '';
    }
    else {
        const outputWriter1 = new tbc.encoding.BufferWriter();
        for (let i = 0; i < vout; i++) {
            outputWriter1.writeUInt64LEBN(tx.outputs[i].satoshisBN);
            outputWriter1.write(tbc.crypto.Hash.sha256(tx.outputs[i].script.toBuffer()));
        }
        outputs1 = outputWriter1.toBuffer().toString('hex');
        outputs1length = getLengthHex(outputs1.length / 2).toString('hex');
    }
    const outputWriter2 = new tbc.encoding.BufferWriter();
    for (let i = vout + 2; i < tx.outputs.length; i++) { // For parent transaction, outputs2 starts from vout + 2
        outputWriter2.writeUInt64LEBN(tx.outputs[i].satoshisBN);
        outputWriter2.write(tbc.crypto.Hash.sha256(tx.outputs[i].script.toBuffer()));
    }
    outputs2 = outputWriter2.toBuffer().toString('hex');
    if (outputs2 === '') {
        outputs2 = '00';
        outputs2length = '';
    }
    else {
        outputs2length = getLengthHex(outputs2.length / 2).toString('hex');
    }
    return { outputs1, outputs1length, outputs2, outputs2length };
}
/**
 * Calculates the length of data and adds OP_PUSHDATA1 or OP_PUSHDATA2 if necessary.
 * @param length - The length of the data.
 * @returns A buffer representing the length with appropriate push opcode.
 */
function getLengthHex(length) {
    if (length < 76) {
        return Buffer.from(length.toString(16).padStart(2, '0'), 'hex');
    }
    else if (length > 75 && length < 256) {
        return Buffer.concat([Buffer.from('4c', 'hex'), Buffer.from(length.toString(16), 'hex')]);
    }
    else {
        return Buffer.concat([Buffer.from('4d', 'hex'), Buffer.from(length.toString(16).padStart(4, '0'), 'hex').reverse()]);
    }
}
/**
 * Converts the size of data to a little-endian buffer.
 * @param length - The length of the data.
 * @returns A buffer representing the size in little-endian format.
 */
function getSize(length) {
    if (length < 256) {
        return Buffer.from(length.toString(16).padStart(2, '0'), 'hex');
    }
    else {
        return Buffer.from(length.toString(16).padStart(4, '0'), 'hex').reverse();
    }
}
