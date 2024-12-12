import * as tbc from 'tbc-lib-js';
const version = 10;
const vliolength = '10';
const amountlength = '08';
const hashlength = '20';

export function getCurrentTxdata(tx: tbc.Transaction): string {
    const writer = new tbc.encoding.BufferWriter();
    writer.write(Buffer.from(amountlength, 'hex'));
    writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
    writer.write(getLengthHex(tx.outputs[0].script.toBuffer().length));
    writer.write(tx.outputs[0].script.toBuffer());
    writer.write(Buffer.from(getOutputsData(tx, 1), 'hex'));
    return writer.toBuffer().toString('hex');
}

export function getPreTxdata(tx: tbc.Transaction): string {
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
    writer.write(Buffer.from(amountlength, 'hex'));
    writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
    writer.write(getLengthHex(tx.outputs[0].script.toBuffer().length));
    writer.write(tx.outputs[0].script.toBuffer());
    writer.write(Buffer.from(amountlength, 'hex'));
    writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
    writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length));
    writer.write(tx.outputs[1].script.toBuffer());
    writer.write(Buffer.from(getOutputsData(tx, 2), 'hex'));
    return writer.toBuffer().toString('hex');
}

export function getPrePreTxdata(tx: tbc.Transaction): string {
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
    writer.write(Buffer.from(amountlength, 'hex'));
    writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);

    writer.write(getLengthHex(tx.outputs[0].script.toBuffer().length));

    writer.write(tx.outputs[0].script.toBuffer());
    writer.write(Buffer.from(getOutputsData(tx, 1), 'hex'));
    return writer.toBuffer().toString('hex');
}

export function getOutputsData(tx: tbc.Transaction, index: number) {

    let outputs = '';
    let outputslength = '';

    const outputWriter = new tbc.encoding.BufferWriter();
    for (let i = index; i < tx.outputs.length; i++) {
        outputWriter.writeUInt64LEBN(tx.outputs[i].satoshisBN);
        outputWriter.write(tbc.crypto.Hash.sha256(tx.outputs[i].script.toBuffer()));
    }
    outputs = outputWriter.toBuffer().toString('hex');

    if (outputs === '') {
        outputs = '00';
        outputslength = '';
    } else {
        outputslength = getLengthHex(outputs.length / 2).toString('hex');
    }

    return outputslength + outputs;

}

export function getLengthHex(length: number): Buffer {
    if (length < 76) {
        return Buffer.from(length.toString(16).padStart(2, '0'), 'hex');
    } else if (length <= 255) {
        return Buffer.concat([Buffer.from('4c', 'hex'), Buffer.from(length.toString(16).padStart(2, '0'), 'hex')]);
    } else if (length <= 65535) {
        return Buffer.concat([Buffer.from('4d', 'hex'), Buffer.from(length.toString(16).padStart(4, '0'), 'hex').reverse()]);
    } else if (length <= 0xFFFFFFFF) {
        const lengthBuffer = Buffer.alloc(4);
        lengthBuffer.writeUInt32LE(length);
        return Buffer.concat([Buffer.from('4e', 'hex'), lengthBuffer]);
    } else {
        throw new Error('Length exceeds maximum supported size (4 GB)');
    }
}