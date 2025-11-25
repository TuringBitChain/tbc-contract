import * as tbc from "tbc-lib-js"
const partial_sha256 = require('tbc-lib-js/lib/util/partial-sha256');

const version = 10;
const vliolength = '10';
const inputslength = '28';
const amountlength = '08';
const hashlength = '20';

const ftCodeLength = 1564;
const buyCodeLength = 832 + 114;
const sellCodeLength = 768 + 114;
const buyPartialOffset = 832;
const sellPartialOffset = 768;
const ftPartialOffset = 1536;

export function getPreTxdata(tx: tbc.Transaction, vout: number, contractOutputNumber: number): string {
    const writer = new tbc.encoding.BufferWriter();
    
    //写入Version、LockTime、InputCount、OutputCount
    writer.write(Buffer.from(vliolength, 'hex'));
    writer.writeUInt32LE(version);
    writer.writeUInt32LE(tx.nLockTime);
    writer.writeInt32LE(tx.inputs.length);
    writer.writeInt32LE(tx.outputs.length);

    //写入Inputs
    const inputWriter = new tbc.encoding.BufferWriter();
    const inputWriter2 = new tbc.encoding.BufferWriter();
    for (const input of tx.inputs) {
        inputWriter.write(Buffer.from(inputslength, 'hex'));
        inputWriter.writeReverse(input.prevTxId);
        inputWriter.writeUInt32LE(input.outputIndex);
        inputWriter.writeUInt32LE(input.sequenceNumber);
        inputWriter2.write(tbc.crypto.Hash.sha256(input.script.toBuffer()));
    }
    for (let i = tx.inputs.length; i < 10; i++) {
        inputWriter.write(Buffer.from("00", 'hex'));
    }
    writer.write(inputWriter.toBuffer());

    //写入UnlockingScriptHash
    writer.write(Buffer.from(hashlength, 'hex'));
    writer.write(tbc.crypto.Hash.sha256(inputWriter2.toBuffer()));

    //写入Outputs
    for (let i = 0; i < tx.outputs.length; i++) {
        const output = tx.outputs[i];
        const lockingscript = output.script.toBuffer();
        const len = lockingscript.length;
        const size = getSize(len);
        
        let partialhash: string;
        let suffixdata: Buffer;
        let isCurrentContract = (i === vout);

        // Determine how to split the script (partial hash vs suffix)
        if (isCurrentContract) {
            let partialOffset = 0;
            if (len === buyCodeLength) partialOffset = buyPartialOffset;
            else if (len === sellCodeLength) partialOffset = sellPartialOffset;
            // Special handling for the specific contract output being unlocked
            partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, partialOffset));
            suffixdata = lockingscript.subarray(partialOffset);
        } else {
            // Standard handling for other outputs
            if (lockingscript.length < 64) {
                partialhash = "00";
                suffixdata = lockingscript;
            } else {
                const maxOffset = Math.floor(lockingscript.length / 64) * 64;
                partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, maxOffset));
                suffixdata = lockingscript.subarray(maxOffset);
            }
        }

        // Write common output data
        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(output.satoshisBN);
        writer.write(getLengthHex(suffixdata.length));
        writer.write(suffixdata);

        // Write partial hash (with length prefix if it's a real hash)
        if (partialhash.length > 2 || isCurrentContract) {
             writer.write(Buffer.from(hashlength, 'hex'));
        }
        writer.write(Buffer.from(partialhash, 'hex'));
        
        writer.write(getLengthHex(size.length));
        writer.write(size);

        // If this was the contract output, handle its subsequent related outputs immediately
        if (isCurrentContract) {
            for (let j = 1; j < contractOutputNumber; j++) {
                const nextOutput = tx.outputs[i + j];
                const nextScript = nextOutput.script.toBuffer();
                const nextSize = getSize(nextScript.length);

                writer.write(Buffer.from(amountlength, 'hex'));
                writer.writeUInt64LEBN(nextOutput.satoshisBN);
                writer.write(getLengthHex(nextScript.length));
                writer.write(nextScript);
                writer.write(Buffer.from("00", 'hex')); // No partial hash for these
                writer.write(getLengthHex(nextSize.length));
                writer.write(nextSize);
            }
            // Skip the outputs we just processed manually
            i += contractOutputNumber - 1;
        }
    }
    for (let i = tx.outputs.length; i < 10; i++) {
        writer.write(Buffer.from("00", 'hex'));
        writer.write(Buffer.from("00", 'hex'));
        writer.write(Buffer.from("00", 'hex'));
        writer.write(Buffer.from("00", 'hex'));
    }
    const pretxdata = writer.toBuffer().toString('hex');

    return `${pretxdata}`;
}

export function getCurrentTxOutputsData(tx: tbc.Transaction): string {
    const writer = new tbc.encoding.BufferWriter();

    for (let i = 0; i < tx.outputs.length; i++) {
        const lockingscript = tx.outputs[i].script.toBuffer();
        const len = lockingscript.length;
        const size = getSize(len);

        let partialOffset = 0;
        if (len === ftCodeLength) partialOffset = ftPartialOffset;
        else if (len === buyCodeLength) partialOffset = buyPartialOffset;
        else if (len === sellCodeLength) partialOffset = sellPartialOffset;

        const isSpecial = partialOffset > 0;
        let partialhash: string;
        let suffixdata: Buffer;

        if (isSpecial) {
            partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, partialOffset));
            suffixdata = lockingscript.subarray(partialOffset);
        } else {
            if (len < 64) {
                partialhash = "00";
                suffixdata = lockingscript;
            } else {
                const maxOffset = Math.floor(len / 64) * 64;
                partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, maxOffset));
                suffixdata = lockingscript.subarray(maxOffset);
            }
        }

        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
        writer.write(getLengthHex(suffixdata.length));
        writer.write(suffixdata);

        if (isSpecial) {
            writer.write(Buffer.from(hashlength, 'hex'));
        }
        writer.write(Buffer.from(partialhash, 'hex'));
        
        writer.write(getLengthHex(size.length));
        writer.write(size);

        if (len === ftCodeLength) {
            const nextOutput = tx.outputs[i + 1];
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(nextOutput.satoshisBN);
            const nextScript = nextOutput.script.toBuffer();
            writer.write(getLengthHex(nextScript.length));
            writer.write(nextScript);
            i++;
        }
    }
    for (let i = tx.outputs.length; i < 10; i++) {
        writer.write(Buffer.from("00", 'hex'));
        writer.write(Buffer.from("00", 'hex'));
        writer.write(Buffer.from("00", 'hex'));
        writer.write(Buffer.from("00", 'hex'));
    }
    const outputsData = writer.toBuffer().toString('hex');
    return outputsData;
}

export function getNumberHex(num: number): Buffer {
    if (num < 0 || num > 75) {
        throw new Error("Number must be between 0 and 75");
    }
    if (num < 17) {
        if (num == 0) return Buffer.from('00', 'hex');
        return Buffer.from((num + 80).toString(16).padStart(2, '0'), 'hex');
    }
    return Buffer.from("01" + num.toString(16).padStart(2, '0'), 'hex');
}

export function getSize(length: number): Buffer {
    if (length < 256) {
        return Buffer.from(length.toString(16).padStart(2, '0'), 'hex');
    } else {
        return Buffer.from(length.toString(16).padStart(4, '0'), 'hex').reverse();
    }
}

export function getLengthHex(length: number): Buffer {
    if (length < 76) {
        return Buffer.from(length.toString(16).padStart(2, '0'), 'hex');
    } else if (length > 75 && length < 256) {
        return Buffer.concat([Buffer.from('4c', 'hex'), Buffer.from(length.toString(16), 'hex')]);
    } else {
        return Buffer.concat([Buffer.from('4d', 'hex'), Buffer.from(length.toString(16).padStart(4, '0'), 'hex').reverse()]);
    }
}