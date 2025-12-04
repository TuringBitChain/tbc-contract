import * as tbc from 'tbc-lib-js';
const partial_sha256 = require('tbc-lib-js/lib/util/partial-sha256');
const version = 10;
const vliolength = '10'; // Version + nLockTime + inputCount + outputCount (16 bytes)
const amountlength = '08'; // Length of the amount field (8 bytes)
const hashlength = '20'; // Length of the hash field (32 bytes)
const ft_v1_length = 1564;
const ft_v1_partial_offset = 1536;
const ft_v2_length = 1884;
const ft_v2_partial_offset = 1856;
/**
 * Retrieves the transaction data needed for contract operations.
 * @param tx - The transaction object.
 * @param vout - The output index in the transaction, if it is a negative number, it indicates that the output is constructed in a uniform format.
 * @returns The transaction data as a hex string.
 */
export function getContractTxdata(tx: tbc.Transaction, vout: number): string {
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

    if (vout < 0) {
        for (let i = 0; i < tx.outputs.length; i++) {
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
            writer.write(Buffer.from(hashlength, 'hex'));
            writer.write(tbc.crypto.Hash.sha256(tx.outputs[i].script.toBuffer()));
        }
        for (let i = tx.outputs.length; i < 15; i++) {
            writer.write(Buffer.from("00", 'hex'));
            writer.write(Buffer.from("00", 'hex'));
        }
    } else {
        const { outputs1, outputs1length, outputs2, outputs2length } = getPrePreOutputsData(tx, vout);
        writer.write(Buffer.from(outputs1length, 'hex'));
        writer.write(Buffer.from(outputs1, 'hex'));
        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[vout].satoshisBN);
        writer.write(Buffer.from(hashlength, 'hex'));
        writer.write(tbc.crypto.Hash.sha256(tx.outputs[vout].script.toBuffer()));
        writer.write(Buffer.from(outputs2length, 'hex'));
        writer.write(Buffer.from(outputs2, 'hex'));
    }

    const contracttxdata = writer.toBuffer().toString('hex');
    return `${contracttxdata}`;
}

/**
 * Retrieves the inputs data from the current transaction.
 * @param tx - The transaction object.
 * @returns The inputs data as a hex string.
 */
export function getCurrentInputsdata(tx: tbc.Transaction): string {
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
    return `${currentinputsdata}`
}

/**
 * Retrieves the current transaction data needed for unlocking scripts.
 * @param tx - The transaction object.
 * @param inputIndex - The index of the input being unlocked.
 * @returns The transaction data as a hex string.
 */
export function getCurrentTxdata(tx: tbc.Transaction, inputIndex: number): string {
    const endTag = '51';
    const writer = new tbc.encoding.BufferWriter();

    for (let i = 0; i < tx.outputs.length; i++) {
        const lockingscript = tx.outputs[i].script.toBuffer();

        let offset = 0;
        if (lockingscript.length === ft_v1_length) {
            offset = ft_v1_partial_offset;
        } else if (lockingscript.length === ft_v2_length) {
            offset = ft_v2_partial_offset;
        }

        if (offset > 0) {
            // For scripts longer than 1500 bytes, calculate partial hash
            const size = getSize(lockingscript.length); // Size in little-endian
            const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, offset));
            const suffixdata = lockingscript.subarray(offset);

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
        } else {
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
    const inputIndexMap: { [key: number]: string } = {
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
export function getPreTxdata(tx: tbc.Transaction, vout: number): string {
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
    let offset = ft_v1_partial_offset;
    if (lockingscript.length === ft_v2_length) {
        offset = ft_v2_partial_offset;
    }
    const size = getSize(lockingscript.length); // Size in little-endian
    const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, offset));
    const suffixdata = lockingscript.subarray(offset);

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
export function getPrePreTxdata(tx: tbc.Transaction, vout: number): string {
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
    let offset = 0;
    if (lockingscript.length === ft_v1_length) {
        offset = ft_v1_partial_offset;
    } else if (lockingscript.length === ft_v2_length) {
        offset = ft_v2_partial_offset;
    }

    if (offset > 0) {
        const size = getSize(lockingscript.length); // Size in little-endian
        const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, offset));
        const suffixdata = lockingscript.subarray(offset);

        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[vout].satoshisBN);
        writer.write(getLengthHex(suffixdata.length)); // Suffix data
        writer.write(suffixdata);
        writer.write(Buffer.from(hashlength, 'hex')); // Partial hash
        writer.write(Buffer.from(partialhash, 'hex'));
        writer.write(getLengthHex(size.length));
        writer.write(size);
    } else {
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
export function getPrePreOutputsData(tx: tbc.Transaction, vout: number) {
    let outputs1 = ''; // Outputs before the specified index
    let outputs1length = '';
    let outputs2 = ''; // Outputs after the specified index
    let outputs2length = '';

    if (vout === 0) {
        outputs1 = '00';
        outputs1length = '';
    } else {
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
    } else {
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
export function getPreOutputsData(tx: tbc.Transaction, vout: number) {
    let outputs1 = ''; // Outputs before the specified index
    let outputs1length = '';
    let outputs2 = ''; // Outputs after the specified index
    let outputs2length = '';

    if (vout === 0) {
        outputs1 = '00';
        outputs1length = '';
    } else {
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
    } else {
        outputs2length = getLengthHex(outputs2.length / 2).toString('hex');
    }

    return { outputs1, outputs1length, outputs2, outputs2length };
}

/**
 * Calculates the length of data and adds OP_PUSHDATA1 or OP_PUSHDATA2 if necessary.
 * @param length - The length of the data.
 * @returns A buffer representing the length with appropriate push opcode.
 */
export function getLengthHex(length: number): Buffer {
    if (length < 76) {
        return Buffer.from(length.toString(16).padStart(2, '0'), 'hex');
    } else if (length > 75 && length < 256) {
        return Buffer.concat([Buffer.from('4c', 'hex'), Buffer.from(length.toString(16), 'hex')]);
    } else {
        return Buffer.concat([Buffer.from('4d', 'hex'), Buffer.from(length.toString(16).padStart(4, '0'), 'hex').reverse()]);
    }
}

/**
 * Converts the size of data to a little-endian buffer.
 * @param length - The length of the data.
 * @returns A buffer representing the size in little-endian format.
 */
export function getSize(length: number): Buffer {
    if (length < 256) {
        return Buffer.from(length.toString(16).padStart(2, '0'), 'hex');
    } else {
        return Buffer.from(length.toString(16).padStart(4, '0'), 'hex').reverse();
    }
}