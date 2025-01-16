import * as tbc from 'tbc-lib-js';
const partial_sha256 = require('tbc-lib-js/lib/util/partial-sha256');
const version = 10;
const vliolength = '10'; // Version + nLockTime + inputCount + outputCount (16 bytes)
const amountlength = '08'; // Length of the amount field (8 bytes)
const hashlength = '20'; // Length of the hash field (32 bytes)

export function getInputsTxdata(tx: tbc.Transaction, vout: number): string {
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

    const { outputs1, outputs1length, outputs2, outputs2length } = getInputsTxOutputsData(tx, vout);
    writer.write(Buffer.from(outputs1length, 'hex'));
    writer.write(Buffer.from(outputs1, 'hex'));

    const lockingscript = tx.outputs[vout].script.toBuffer()
    if (lockingscript.length == 1564) {
        const size = getSize(lockingscript.length)//size小端序
        const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536))
        const suffixdata = lockingscript.subarray(1536)

        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[vout].satoshisBN);
        writer.write(getLengthHex(suffixdata.length));//suffixdata
        writer.write(suffixdata);
        writer.write(Buffer.from(hashlength, 'hex'));//partialhash
        writer.write(Buffer.from(partialhash, 'hex'));
        writer.write(getLengthHex(size.length));
        writer.write(size);
    }
    else {
        const size = getSize(lockingscript.length)//size小端序
        const partialhash = '00'
        const suffixdata = lockingscript

        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[vout].satoshisBN);
        writer.write(getLengthHex(suffixdata.length));//suffixdata为完整锁定脚本
        writer.write(suffixdata);
        writer.write(Buffer.from(partialhash, 'hex'));//partialhash为空
        writer.write(getLengthHex(size.length));
        writer.write(size);
    }

    writer.write(Buffer.from(outputs2length, 'hex'));
    writer.write(Buffer.from(outputs2, 'hex'));
    writer.write(Buffer.from('52', 'hex'));

    const inputstxdata = writer.toBuffer().toString('hex');

    return `${inputstxdata}`;
}

export function getInputsTxdataSwap(tx: tbc.Transaction, vout: number): string {
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

    const lockingscript = tx.outputs[vout].script.toBuffer()
    if (lockingscript.length == 1564) {
        const { outputs1, outputs1length, outputs2, outputs2length } = getInputsTxOutputsData(tx, vout, true);
        writer.write(Buffer.from(outputs1length, 'hex'));
        writer.write(Buffer.from(outputs1, 'hex'));

        const size = getSize(lockingscript.length)//size小端序
        const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536))
        const suffixdata = lockingscript.subarray(1536)
        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[vout].satoshisBN);
        writer.write(getLengthHex(suffixdata.length));//suffixdata
        writer.write(suffixdata);
        writer.write(Buffer.from(hashlength, 'hex'));//partialhash
        writer.write(Buffer.from(partialhash, 'hex'));
        writer.write(getLengthHex(size.length));
        writer.write(size);
        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[vout + 1].satoshisBN);
        writer.write(getLengthHex(tx.outputs[vout + 1].script.toBuffer().length));
        writer.write(tx.outputs[vout + 1].script.toBuffer());

        writer.write(Buffer.from(outputs2length, 'hex'));
        writer.write(Buffer.from(outputs2, 'hex'));
    }
    else {
        const { outputs1, outputs1length, outputs2, outputs2length } = getInputsTxOutputsData(tx, vout);
        writer.write(Buffer.from(outputs1length, 'hex'));
        writer.write(Buffer.from(outputs1, 'hex'));

        const size = getSize(lockingscript.length)//size小端序
        const partialhash = '00'
        const suffixdata = lockingscript
        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[vout].satoshisBN);
        writer.write(getLengthHex(suffixdata.length));//suffixdata为完整锁定脚本
        writer.write(suffixdata);
        writer.write(Buffer.from(partialhash, 'hex'));//partialhash为空
        writer.write(getLengthHex(size.length));
        writer.write(size);

        writer.write(Buffer.from(outputs2length, 'hex'));
        writer.write(Buffer.from(outputs2, 'hex'));
    }
    writer.write(Buffer.from('52', 'hex'));

    const inputstxdata = writer.toBuffer().toString('hex');

    return `${inputstxdata}`;
}

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

export function getCurrentTxOutputsDataforPool1(tx: tbc.Transaction, option: number, swapOption?: number): string {
    const writer = new tbc.encoding.BufferWriter();
    let lockingscript = tx.outputs[2].script.toBuffer()//FTAbyC code部分
    let size = getSize(lockingscript.length)
    let partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536))
    let suffixdata = lockingscript.subarray(1536)
    switch (option) {
        //添加流动性
        case 1:
            //poolnft输出
            writer.write(Buffer.from(amountlength, 'hex'));//poolnftcodehash
            writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
            writer.write(Buffer.from(hashlength, 'hex'));
            writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
            writer.write(Buffer.from(amountlength, 'hex'));//poolnfttape
            writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
            writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length))
            writer.write(tx.outputs[1].script.toBuffer());

            //FTAbyC输出
            lockingscript = tx.outputs[2].script.toBuffer()//FTAbyC code部分
            size = getSize(lockingscript.length)
            partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536))
            suffixdata = lockingscript.subarray(1536)
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(tx.outputs[2].satoshisBN);
            writer.write(getLengthHex(suffixdata.length));//suffixdata
            writer.write(suffixdata);
            writer.write(Buffer.from(hashlength, 'hex'));//partialhash
            writer.write(Buffer.from(partialhash, 'hex'));
            writer.write(getLengthHex(size.length));
            writer.write(size);
            writer.write(Buffer.from(amountlength, 'hex'));//FTAbyC tape部分
            writer.writeUInt64LEBN(tx.outputs[3].satoshisBN);
            writer.write(getLengthHex(tx.outputs[3].script.toBuffer().length))
            writer.write(tx.outputs[3].script.toBuffer());

            //FT-LP输出
            lockingscript = tx.outputs[4].script.toBuffer()//FT-LP code部分
            size = getSize(lockingscript.length)
            //之后要修改部分，根据FT-LP的设计
            partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536))
            suffixdata = lockingscript.subarray(1536)
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(tx.outputs[4].satoshisBN);
            writer.write(getLengthHex(suffixdata.length));//suffixdata
            writer.write(suffixdata);
            writer.write(Buffer.from(hashlength, 'hex'));//partialhash
            writer.write(Buffer.from(partialhash, 'hex'));
            writer.write(getLengthHex(size.length));
            writer.write(size);
            writer.write(Buffer.from(amountlength, 'hex'));//FT-LP tape部分
            writer.writeUInt64LEBN(tx.outputs[5].satoshisBN);
            writer.write(getLengthHex(tx.outputs[5].script.toBuffer().length))
            writer.write(tx.outputs[5].script.toBuffer());

            //可能的FTAbyA找零、普通P2PKH找零输出，要求若两者均存在，FTAbyA找零在前
            switch (tx.outputs.length) {
                //无任何找零
                case 6:
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from('00', 'hex'));
                    break;
                //只有普通找零
                case 7:
                    const lockingscript = tx.outputs[6].script.toBuffer();
                    const size = getSize(lockingscript.length); // size小端序
                    const partialhash = '00';
                    const suffixdata = lockingscript;
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from(amountlength, 'hex'));
                    writer.writeUInt64LEBN(tx.outputs[6].satoshisBN);
                    writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                    writer.write(suffixdata);
                    writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                    writer.write(getLengthHex(size.length));
                    writer.write(size);
                    break;
                //只有FTAbyA找零
                case 8:
                    for (let i = 6; i < tx.outputs.length; i++) {
                        const lockingscript = tx.outputs[i].script.toBuffer();
                        const size = getSize(lockingscript.length); // size小端序
                        const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                        const suffixdata = lockingscript.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata
                        writer.write(suffixdata);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash, 'hex'));
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                        writer.write(tx.outputs[i + 1].script.toBuffer());
                        writer.write(Buffer.from('00', 'hex'));
                        i++;
                    }
                    break;
                //同时存在FTAbyA找零和普通找零
                case 9:
                    for (let i = 6; i < tx.outputs.length; i++) {
                        const lockingscript = tx.outputs[i].script.toBuffer();
                        if (lockingscript.length == 1564) {
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                            const suffixdata = lockingscript.subarray(1536);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata
                            writer.write(suffixdata);
                            writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                            writer.write(Buffer.from(partialhash, 'hex'));
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                            writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                            writer.write(tx.outputs[i + 1].script.toBuffer());
                            i++;
                        } else {
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = '00';
                            const suffixdata = lockingscript;
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                            writer.write(suffixdata);
                            writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                        }
                    }
                    break;
                default:
                    throw new Error('Invalid transaction');
            }
            break;
        //LP换Tokens
        case 2:
            //poolnft输出
            writer.write(Buffer.from(amountlength, 'hex'));//poolnftcodehash
            writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
            writer.write(Buffer.from(hashlength, 'hex'));
            writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
            writer.write(Buffer.from(amountlength, 'hex'));//poolnfttape
            writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
            writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length))
            writer.write(tx.outputs[1].script.toBuffer());
            for (let i = 2; i < 7; i++) {
                const lockingscript = tx.outputs[i].script.toBuffer();
                if (lockingscript.length == 1564) {
                    const size = getSize(lockingscript.length); // size小端序
                    const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                    const suffixdata = lockingscript.subarray(1536);

                    writer.write(Buffer.from(amountlength, 'hex'));
                    writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                    writer.write(getLengthHex(suffixdata.length)); // suffixdata
                    writer.write(suffixdata);
                    writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                    writer.write(Buffer.from(partialhash, 'hex'));
                    writer.write(getLengthHex(size.length));
                    writer.write(size);

                    writer.write(Buffer.from(amountlength, 'hex'));
                    writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                    writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                    writer.write(tx.outputs[i + 1].script.toBuffer());
                    i++;
                } else {
                    const size = getSize(lockingscript.length); // size小端序
                    const partialhash = '00';
                    const suffixdata = lockingscript;

                    writer.write(Buffer.from(amountlength, 'hex'));
                    writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                    writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                    writer.write(suffixdata);
                    writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                    writer.write(getLengthHex(size.length));
                    writer.write(size);
                }
            }
            //可能的FT-LP找零、FTAbyC找零、普通P2PKH找零输出，要求顺序保持一致
            switch (tx.outputs.length) {
                //无任何找零
                case 7:
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from('00', 'hex'));
                    break;
                //只有普通找零
                case 8:
                    lockingscript = tx.outputs[7].script.toBuffer();
                    size = getSize(lockingscript.length); // size小端序
                    partialhash = '00';
                    suffixdata = lockingscript;
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from(amountlength, 'hex'));
                    writer.writeUInt64LEBN(tx.outputs[7].satoshisBN);
                    writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                    writer.write(suffixdata);
                    writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                    writer.write(getLengthHex(size.length));
                    writer.write(size);
                    break;
                //可能的FT-PL或FTAbyC找零
                case 9:
                    lockingscript = tx.outputs[7].script.toBuffer();
                    if (lockingscript.subarray(1404, 1409).toString('hex') === 'ffffffffff') {
                        const size = getSize(lockingscript.length); // size小端序
                        const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                        const suffixdata = lockingscript.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[7].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata
                        writer.write(suffixdata);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash, 'hex'));
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[8].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[8].script.toBuffer().length));
                        writer.write(tx.outputs[8].script.toBuffer());
                        writer.write(Buffer.from('00', 'hex'));
                        writer.write(Buffer.from('00', 'hex'));
                    }
                    else {
                        writer.write(Buffer.from('00', 'hex'));
                        const size = getSize(lockingscript.length); // size小端序
                        const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                        const suffixdata = lockingscript.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[7].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata
                        writer.write(suffixdata);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash, 'hex'));
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[8].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[8].script.toBuffer().length));
                        writer.write(tx.outputs[8].script.toBuffer());
                        writer.write(Buffer.from('00', 'hex'));
                    }
                    break;
                //可能的FT-PL或FTAbyC找零 + 普通找零
                case 10:
                    lockingscript = tx.outputs[7].script.toBuffer();
                    if (lockingscript.subarray(1404, 1409).toString('hex') === 'ffffffffff') {
                        size = getSize(lockingscript.length); // size小端序
                        partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                        suffixdata = lockingscript.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[7].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata
                        writer.write(suffixdata);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash, 'hex'));
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[8].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[8].script.toBuffer().length));
                        writer.write(tx.outputs[8].script.toBuffer());
                        writer.write(Buffer.from('00', 'hex'));
                        lockingscript = tx.outputs[9].script.toBuffer();
                        size = getSize(lockingscript.length); // size小端序
                        partialhash = '00';
                        suffixdata = lockingscript;
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[9].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                        writer.write(suffixdata);
                        writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                    }
                    else {
                        writer.write(Buffer.from('00', 'hex'));
                        size = getSize(lockingscript.length); // size小端序
                        partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                        suffixdata = lockingscript.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[7].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata
                        writer.write(suffixdata);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash, 'hex'));
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[8].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[8].script.toBuffer().length));
                        writer.write(tx.outputs[8].script.toBuffer());
                        lockingscript = tx.outputs[9].script.toBuffer();
                        size = getSize(lockingscript.length); // size小端序
                        partialhash = '00';
                        suffixdata = lockingscript;
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[9].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                        writer.write(suffixdata);
                        writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                    }
                    break;
                //只有FT-PL、FTAbyC找零
                case 11:
                    for (let i = 7; i < tx.outputs.length; i++) {
                        const lockingscript = tx.outputs[i].script.toBuffer();
                        if (lockingscript.length == 1564) {
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                            const suffixdata = lockingscript.subarray(1536);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata
                            writer.write(suffixdata);
                            writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                            writer.write(Buffer.from(partialhash, 'hex'));
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                            writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                            writer.write(tx.outputs[i + 1].script.toBuffer());
                            i++;
                        } else {
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = '00';
                            const suffixdata = lockingscript;
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                            writer.write(suffixdata);
                            writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                        }
                    }
                    writer.write(Buffer.from('00', 'hex'));
                    break;
                //完整输出
                case 12:
                    for (let i = 7; i < tx.outputs.length; i++) {
                        const lockingscript = tx.outputs[i].script.toBuffer();
                        if (lockingscript.length == 1564) {
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                            const suffixdata = lockingscript.subarray(1536);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata
                            writer.write(suffixdata);
                            writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                            writer.write(Buffer.from(partialhash, 'hex'));
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                            writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                            writer.write(tx.outputs[i + 1].script.toBuffer());
                            i++;
                        } else {
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = '00';
                            const suffixdata = lockingscript;
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                            writer.write(suffixdata);
                            writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                        }
                    }
                    break;
                default:
                    throw new Error('Invalid transaction');
            }
            break;
        case 3:
            switch (swapOption) {
                //TBC换Tokens
                case 1:
                    //poolnft输出
                    writer.write(Buffer.from(amountlength, 'hex'));//poolnftcodehash
                    writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
                    writer.write(Buffer.from(hashlength, 'hex'));
                    writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
                    writer.write(Buffer.from(amountlength, 'hex'));//poolnfttape
                    writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
                    writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length))
                    writer.write(tx.outputs[1].script.toBuffer());
                    //FTAbyA、FTAbyC输出
                    for (let i = 2; i < 6; i++) {
                        const lockingscript = tx.outputs[i].script.toBuffer();
                        const size = getSize(lockingscript.length); // size小端序
                        const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                        const suffixdata = lockingscript.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata
                        writer.write(suffixdata);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash, 'hex'));
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                        writer.write(tx.outputs[i + 1].script.toBuffer());
                        i++;
                    }
                    //若有普通找零
                    if (tx.outputs.length == 7) {
                        const lockingscript = tx.outputs[6].script.toBuffer();
                        const size = getSize(lockingscript.length); // size小端序
                        const partialhash = '00';
                        const suffixdata = lockingscript;
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[6].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                        writer.write(suffixdata);
                        writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                    } else {
                        writer.write(Buffer.from('00', 'hex'));
                    }
                    break;
                //Tokens换TBC
                case 2:
                    //poolnft输出
                    writer.write(Buffer.from(amountlength, 'hex'));//poolnftcodehash
                    writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
                    writer.write(Buffer.from(hashlength, 'hex'));
                    writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
                    writer.write(Buffer.from(amountlength, 'hex'));//poolnfttape
                    writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
                    writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length))
                    writer.write(tx.outputs[1].script.toBuffer());
                    for (let i = 2; i < 5; i++) {
                        const lockingscript = tx.outputs[i].script.toBuffer();
                        if (lockingscript.length == 1564) {
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                            const suffixdata = lockingscript.subarray(1536);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata
                            writer.write(suffixdata);
                            writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                            writer.write(Buffer.from(partialhash, 'hex'));
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                            writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                            writer.write(tx.outputs[i + 1].script.toBuffer());
                            i++;
                        } else {
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = '00';
                            const suffixdata = lockingscript;
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                            writer.write(suffixdata);
                            writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                        }
                    }
                    switch (tx.outputs.length) {
                        //只有普通找零
                        case 6:
                            writer.write(Buffer.from('00', 'hex'));
                            const lockingscript = tx.outputs[5].script.toBuffer();
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = '00';
                            const suffixdata = lockingscript;
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[5].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                            writer.write(suffixdata);
                            writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                            break;
                        //只有FTAbyA找零
                        case 7:
                            for (let i = 5; i < tx.outputs.length; i++) {
                                const lockingscript = tx.outputs[i].script.toBuffer();
                                const size = getSize(lockingscript.length); // size小端序
                                const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                                const suffixdata = lockingscript.subarray(1536);
                                writer.write(Buffer.from(amountlength, 'hex'));
                                writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                                writer.write(getLengthHex(suffixdata.length)); // suffixdata
                                writer.write(suffixdata);
                                writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                                writer.write(Buffer.from(partialhash, 'hex'));
                                writer.write(getLengthHex(size.length));
                                writer.write(size);
                                writer.write(Buffer.from(amountlength, 'hex'));
                                writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                                writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                                writer.write(tx.outputs[i + 1].script.toBuffer());
                                i++;
                            }
                            writer.write(Buffer.from('00', 'hex'));
                            break;
                        //完整输出
                        case 8:
                            for (let i = 5; i < tx.outputs.length; i++) {
                                const lockingscript = tx.outputs[i].script.toBuffer();
                                if (lockingscript.length == 1564) {
                                    const size = getSize(lockingscript.length); // size小端序
                                    const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                                    const suffixdata = lockingscript.subarray(1536);
                                    writer.write(Buffer.from(amountlength, 'hex'));
                                    writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                                    writer.write(getLengthHex(suffixdata.length)); // suffixdata
                                    writer.write(suffixdata);
                                    writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                                    writer.write(Buffer.from(partialhash, 'hex'));
                                    writer.write(getLengthHex(size.length));
                                    writer.write(size);
                                    writer.write(Buffer.from(amountlength, 'hex'));
                                    writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                                    writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                                    writer.write(tx.outputs[i + 1].script.toBuffer());
                                    i++;
                                } else {
                                    const size = getSize(lockingscript.length); // size小端序
                                    const partialhash = '00';
                                    const suffixdata = lockingscript;
                                    writer.write(Buffer.from(amountlength, 'hex'));
                                    writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                                    writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                                    writer.write(suffixdata);
                                    writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                                    writer.write(getLengthHex(size.length));
                                    writer.write(size);
                                }
                            }
                            break;
                    }
                    break;
            }
            break;
        case 4:
            //poolnft输出
            writer.write(Buffer.from(amountlength, 'hex'));//poolnftcodehash
            writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
            writer.write(Buffer.from(hashlength, 'hex'));
            writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
            writer.write(Buffer.from(amountlength, 'hex'));//poolnfttape
            writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
            writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length))
            writer.write(tx.outputs[1].script.toBuffer());

            //FTAbyC输出
            lockingscript = tx.outputs[2].script.toBuffer()//FTAbyC code部分
            size = getSize(lockingscript.length)
            partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536))
            suffixdata = lockingscript.subarray(1536)
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(tx.outputs[2].satoshisBN);
            writer.write(getLengthHex(suffixdata.length));//suffixdata
            writer.write(suffixdata);
            writer.write(Buffer.from(hashlength, 'hex'));//partialhash
            writer.write(Buffer.from(partialhash, 'hex'));
            writer.write(getLengthHex(size.length));
            writer.write(size);
            writer.write(Buffer.from(amountlength, 'hex'));//FTAbyC tape部分
            writer.writeUInt64LEBN(tx.outputs[3].satoshisBN);
            writer.write(getLengthHex(tx.outputs[3].script.toBuffer().length))
            writer.write(tx.outputs[3].script.toBuffer());

            //普通找零
            lockingscript = tx.outputs[4].script.toBuffer();
            size = getSize(lockingscript.length); // size小端序
            partialhash = '00';
            suffixdata = lockingscript;
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(tx.outputs[4].satoshisBN);
            writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
            writer.write(suffixdata);
            writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
            writer.write(getLengthHex(size.length));
            writer.write(size);
    }
    const currenttxoutputsdata = writer.toBuffer().toString('hex');
    return `${currenttxoutputsdata}`;
}

export function getCurrentTxOutputsDataforPool2(tx: tbc.Transaction, option: number, swapOption?: number): string {
    const writer = new tbc.encoding.BufferWriter();
    let lockingscript = tx.outputs[2].script.toBuffer()//FTAbyC code部分
    let size = getSize(lockingscript.length)
    let partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536))
    let suffixdata = lockingscript.subarray(1536)
    switch (option) {
        //添加流动性
        case 1:
            //poolnft输出
            writer.write(Buffer.from(amountlength, 'hex'));//poolnftcodehash
            writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
            writer.write(Buffer.from(hashlength, 'hex'));
            writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
            writer.write(Buffer.from(amountlength, 'hex'));//poolnfttape
            writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
            writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length))
            writer.write(tx.outputs[1].script.toBuffer());

            //FTAbyC输出
            lockingscript = tx.outputs[2].script.toBuffer()//FTAbyC code部分
            size = getSize(lockingscript.length)
            partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536))
            suffixdata = lockingscript.subarray(1536)
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(tx.outputs[2].satoshisBN);
            writer.write(getLengthHex(suffixdata.length));//suffixdata
            writer.write(suffixdata);
            writer.write(Buffer.from(hashlength, 'hex'));//partialhash
            writer.write(Buffer.from(partialhash, 'hex'));
            writer.write(getLengthHex(size.length));
            writer.write(size);
            writer.write(Buffer.from(amountlength, 'hex'));//FTAbyC tape部分
            writer.writeUInt64LEBN(tx.outputs[3].satoshisBN);
            writer.write(getLengthHex(tx.outputs[3].script.toBuffer().length))
            writer.write(tx.outputs[3].script.toBuffer());

            //FT-LP输出
            lockingscript = tx.outputs[4].script.toBuffer()//FT-LP code部分
            size = getSize(lockingscript.length)
            //之后要修改部分，根据FT-LP的设计
            partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536))
            suffixdata = lockingscript.subarray(1536)
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(tx.outputs[4].satoshisBN);
            writer.write(getLengthHex(suffixdata.length));//suffixdata
            writer.write(suffixdata);
            writer.write(Buffer.from(hashlength, 'hex'));//partialhash
            writer.write(Buffer.from(partialhash, 'hex'));
            writer.write(getLengthHex(size.length));
            writer.write(size);
            writer.write(Buffer.from(amountlength, 'hex'));//FT-LP tape部分
            writer.writeUInt64LEBN(tx.outputs[5].satoshisBN);
            writer.write(getLengthHex(tx.outputs[5].script.toBuffer().length))
            writer.write(tx.outputs[5].script.toBuffer());

            //可能的FTAbyA找零、普通P2PKH找零输出，要求若两者均存在，FTAbyA找零在前
            switch (tx.outputs.length) {
                //无任何找零
                case 6:
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from('00', 'hex'));
                    break;
                //只有普通找零
                case 7:
                    const lockingscript = tx.outputs[6].script.toBuffer();
                    const size = getSize(lockingscript.length); // size小端序
                    const partialhash = '00';
                    const suffixdata = lockingscript;
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from(amountlength, 'hex'));
                    writer.writeUInt64LEBN(tx.outputs[6].satoshisBN);
                    writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                    writer.write(suffixdata);
                    writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                    writer.write(getLengthHex(size.length));
                    writer.write(size);
                    break;
                //只有FTAbyA找零
                case 8:
                    for (let i = 6; i < tx.outputs.length; i++) {
                        const lockingscript = tx.outputs[i].script.toBuffer();
                        const size = getSize(lockingscript.length); // size小端序
                        const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                        const suffixdata = lockingscript.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata
                        writer.write(suffixdata);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash, 'hex'));
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                        writer.write(tx.outputs[i + 1].script.toBuffer());
                        writer.write(Buffer.from('00', 'hex'));
                        i++;
                    }
                    break;
                //同时存在FTAbyA找零和普通找零
                case 9:
                    for (let i = 6; i < tx.outputs.length; i++) {
                        const lockingscript = tx.outputs[i].script.toBuffer();
                        if (lockingscript.length == 1564) {
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                            const suffixdata = lockingscript.subarray(1536);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata
                            writer.write(suffixdata);
                            writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                            writer.write(Buffer.from(partialhash, 'hex'));
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                            writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                            writer.write(tx.outputs[i + 1].script.toBuffer());
                            i++;
                        } else {
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = '00';
                            const suffixdata = lockingscript;
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                            writer.write(suffixdata);
                            writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                        }
                    }
                    break;
                default:
                    throw new Error('Invalid transaction');
            }
            break;
        //LP换Tokens
        case 2:
            //poolnft输出
            writer.write(Buffer.from(amountlength, 'hex'));//poolnftcodehash
            writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
            writer.write(Buffer.from(hashlength, 'hex'));
            writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
            writer.write(Buffer.from(amountlength, 'hex'));//poolnfttape
            writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
            writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length))
            writer.write(tx.outputs[1].script.toBuffer());
            for (let i = 2; i < 7; i++) {
                const lockingscript = tx.outputs[i].script.toBuffer();
                if (lockingscript.length == 1564) {
                    const size = getSize(lockingscript.length); // size小端序
                    const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                    const suffixdata = lockingscript.subarray(1536);

                    writer.write(Buffer.from(amountlength, 'hex'));
                    writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                    writer.write(getLengthHex(suffixdata.length)); // suffixdata
                    writer.write(suffixdata);
                    writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                    writer.write(Buffer.from(partialhash, 'hex'));
                    writer.write(getLengthHex(size.length));
                    writer.write(size);

                    writer.write(Buffer.from(amountlength, 'hex'));
                    writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                    writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                    writer.write(tx.outputs[i + 1].script.toBuffer());
                    i++;
                } else {
                    const size = getSize(lockingscript.length); // size小端序
                    const partialhash = '00';
                    const suffixdata = lockingscript;

                    writer.write(Buffer.from(amountlength, 'hex'));
                    writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                    writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                    writer.write(suffixdata);
                    writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                    writer.write(getLengthHex(size.length));
                    writer.write(size);
                }
            }
            //可能的FT-LP找零、FTAbyC找零、普通P2PKH找零输出，要求顺序保持一致
            switch (tx.outputs.length) {
                //无任何找零
                case 7:
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from('00', 'hex'));
                    break;
                //只有普通找零
                case 8:
                    lockingscript = tx.outputs[7].script.toBuffer();
                    size = getSize(lockingscript.length); // size小端序
                    partialhash = '00';
                    suffixdata = lockingscript;
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from(amountlength, 'hex'));
                    writer.writeUInt64LEBN(tx.outputs[7].satoshisBN);
                    writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                    writer.write(suffixdata);
                    writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                    writer.write(getLengthHex(size.length));
                    writer.write(size);
                    break;
                //可能的FT-PL或FTAbyC找零
                case 9:
                    lockingscript = tx.outputs[7].script.toBuffer();
                    if (lockingscript.subarray(1404, 1409).toString('hex') === 'ffffffffff') {
                        const size = getSize(lockingscript.length); // size小端序
                        const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                        const suffixdata = lockingscript.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[7].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata
                        writer.write(suffixdata);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash, 'hex'));
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[8].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[8].script.toBuffer().length));
                        writer.write(tx.outputs[8].script.toBuffer());
                        writer.write(Buffer.from('00', 'hex'));
                        writer.write(Buffer.from('00', 'hex'));
                    }
                    else {
                        writer.write(Buffer.from('00', 'hex'));
                        const size = getSize(lockingscript.length); // size小端序
                        const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                        const suffixdata = lockingscript.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[7].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata
                        writer.write(suffixdata);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash, 'hex'));
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[8].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[8].script.toBuffer().length));
                        writer.write(tx.outputs[8].script.toBuffer());
                        writer.write(Buffer.from('00', 'hex'));
                    }
                    break;
                //可能的FT-PL或FTAbyC找零 + 普通找零
                case 10:
                    lockingscript = tx.outputs[7].script.toBuffer();
                    if (lockingscript.subarray(1404, 1409).toString('hex') === 'ffffffffff') {
                        size = getSize(lockingscript.length); // size小端序
                        partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                        suffixdata = lockingscript.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[7].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata
                        writer.write(suffixdata);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash, 'hex'));
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[8].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[8].script.toBuffer().length));
                        writer.write(tx.outputs[8].script.toBuffer());
                        writer.write(Buffer.from('00', 'hex'));
                        lockingscript = tx.outputs[9].script.toBuffer();
                        size = getSize(lockingscript.length); // size小端序
                        partialhash = '00';
                        suffixdata = lockingscript;
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[9].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                        writer.write(suffixdata);
                        writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                    }
                    else {
                        writer.write(Buffer.from('00', 'hex'));
                        size = getSize(lockingscript.length); // size小端序
                        partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                        suffixdata = lockingscript.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[7].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata
                        writer.write(suffixdata);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash, 'hex'));
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[8].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[8].script.toBuffer().length));
                        writer.write(tx.outputs[8].script.toBuffer());
                        lockingscript = tx.outputs[9].script.toBuffer();
                        size = getSize(lockingscript.length); // size小端序
                        partialhash = '00';
                        suffixdata = lockingscript;
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[9].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                        writer.write(suffixdata);
                        writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                    }
                    break;
                //只有FT-PL、FTAbyC找零
                case 11:
                    for (let i = 7; i < tx.outputs.length; i++) {
                        const lockingscript = tx.outputs[i].script.toBuffer();
                        if (lockingscript.length == 1564) {
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                            const suffixdata = lockingscript.subarray(1536);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata
                            writer.write(suffixdata);
                            writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                            writer.write(Buffer.from(partialhash, 'hex'));
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                            writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                            writer.write(tx.outputs[i + 1].script.toBuffer());
                            i++;
                        } else {
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = '00';
                            const suffixdata = lockingscript;
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                            writer.write(suffixdata);
                            writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                        }
                    }
                    writer.write(Buffer.from('00', 'hex'));
                    break;
                //完整输出
                case 12:
                    for (let i = 7; i < tx.outputs.length; i++) {
                        const lockingscript = tx.outputs[i].script.toBuffer();
                        if (lockingscript.length == 1564) {
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                            const suffixdata = lockingscript.subarray(1536);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata
                            writer.write(suffixdata);
                            writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                            writer.write(Buffer.from(partialhash, 'hex'));
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                            writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                            writer.write(tx.outputs[i + 1].script.toBuffer());
                            i++;
                        } else {
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = '00';
                            const suffixdata = lockingscript;
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                            writer.write(suffixdata);
                            writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                        }
                    }
                    break;
                default:
                    throw new Error('Invalid transaction');
            }
            break;
        case 3:
            switch (swapOption) {
                //TBC换Tokens
                case 1:
                    //poolnft输出
                    writer.write(Buffer.from(amountlength, 'hex'));//poolnftcodehash
                    writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
                    writer.write(Buffer.from(hashlength, 'hex'));
                    writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
                    writer.write(Buffer.from(amountlength, 'hex'));//poolnfttape
                    writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
                    writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length))
                    writer.write(tx.outputs[1].script.toBuffer());
                    //FTAbyA输出
                    for (let i = 2; i < 4; i++) {
                        const lockingscript = tx.outputs[i].script.toBuffer();
                        const size = getSize(lockingscript.length); // size小端序
                        const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                        const suffixdata = lockingscript.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata
                        writer.write(suffixdata);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash, 'hex'));
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                        writer.write(tx.outputs[i + 1].script.toBuffer());
                        i++;
                    }
                    //若没有找零
                    if (tx.outputs.length == 4) {
                        writer.write(Buffer.from('00', 'hex'));
                        writer.write(Buffer.from('00', 'hex'));
                        //只有普通找零
                    } else if (tx.outputs.length == 5) {
                        writer.write(Buffer.from('00', 'hex'));
                        const lockingscript = tx.outputs[4].script.toBuffer();
                        const size = getSize(lockingscript.length); // size小端序
                        const partialhash = '00';
                        const suffixdata = lockingscript;
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[4].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                        writer.write(suffixdata);
                        writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                        //只有FTAbyC找零
                    } else if (tx.outputs.length == 6) {
                        const lockingscript = tx.outputs[4].script.toBuffer();
                        const size = getSize(lockingscript.length); // size小端序
                        const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                        const suffixdata = lockingscript.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[4].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata
                        writer.write(suffixdata);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash, 'hex'));
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[5].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[5].script.toBuffer().length));
                        writer.write(tx.outputs[5].script.toBuffer());
                        writer.write(Buffer.from('00', 'hex'));
                        //完整输出
                    } else {
                        for (let i = 4; i < 6; i++) {
                            const lockingscript = tx.outputs[i].script.toBuffer();
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                            const suffixdata = lockingscript.subarray(1536);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata
                            writer.write(suffixdata);
                            writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                            writer.write(Buffer.from(partialhash, 'hex'));
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                            writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                            writer.write(tx.outputs[i + 1].script.toBuffer());
                            i++;
                        }
                        const lockingscript = tx.outputs[6].script.toBuffer();
                        const size = getSize(lockingscript.length); // size小端序
                        const partialhash = '00';
                        const suffixdata = lockingscript;
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[6].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                        writer.write(suffixdata);
                        writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                    }
                    break;
                //Tokens换TBC
                case 2:
                    //poolnft输出
                    writer.write(Buffer.from(amountlength, 'hex'));//poolnftcodehash
                    writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
                    writer.write(Buffer.from(hashlength, 'hex'));
                    writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
                    writer.write(Buffer.from(amountlength, 'hex'));//poolnfttape
                    writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
                    writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length))
                    writer.write(tx.outputs[1].script.toBuffer());
                    for (let i = 2; i < 5; i++) {
                        const lockingscript = tx.outputs[i].script.toBuffer();
                        if (lockingscript.length == 1564) {
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                            const suffixdata = lockingscript.subarray(1536);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata
                            writer.write(suffixdata);
                            writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                            writer.write(Buffer.from(partialhash, 'hex'));
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                            writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                            writer.write(tx.outputs[i + 1].script.toBuffer());
                            i++;
                        } else {
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = '00';
                            const suffixdata = lockingscript;
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                            writer.write(suffixdata);
                            writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                        }
                    }
                    switch (tx.outputs.length) {
                        //只有普通找零
                        case 6:
                            writer.write(Buffer.from('00', 'hex'));
                            const lockingscript = tx.outputs[5].script.toBuffer();
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = '00';
                            const suffixdata = lockingscript;
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[5].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                            writer.write(suffixdata);
                            writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                            break;
                        //只有FTAbyA找零
                        case 7:
                            for (let i = 5; i < tx.outputs.length; i++) {
                                const lockingscript = tx.outputs[i].script.toBuffer();
                                const size = getSize(lockingscript.length); // size小端序
                                const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                                const suffixdata = lockingscript.subarray(1536);
                                writer.write(Buffer.from(amountlength, 'hex'));
                                writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                                writer.write(getLengthHex(suffixdata.length)); // suffixdata
                                writer.write(suffixdata);
                                writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                                writer.write(Buffer.from(partialhash, 'hex'));
                                writer.write(getLengthHex(size.length));
                                writer.write(size);
                                writer.write(Buffer.from(amountlength, 'hex'));
                                writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                                writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                                writer.write(tx.outputs[i + 1].script.toBuffer());
                                i++;
                            }
                            writer.write(Buffer.from('00', 'hex'));
                            break;
                        //完整输出
                        case 8:
                            for (let i = 5; i < tx.outputs.length; i++) {
                                const lockingscript = tx.outputs[i].script.toBuffer();
                                if (lockingscript.length == 1564) {
                                    const size = getSize(lockingscript.length); // size小端序
                                    const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                                    const suffixdata = lockingscript.subarray(1536);
                                    writer.write(Buffer.from(amountlength, 'hex'));
                                    writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                                    writer.write(getLengthHex(suffixdata.length)); // suffixdata
                                    writer.write(suffixdata);
                                    writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                                    writer.write(Buffer.from(partialhash, 'hex'));
                                    writer.write(getLengthHex(size.length));
                                    writer.write(size);
                                    writer.write(Buffer.from(amountlength, 'hex'));
                                    writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                                    writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                                    writer.write(tx.outputs[i + 1].script.toBuffer());
                                    i++;
                                } else {
                                    const size = getSize(lockingscript.length); // size小端序
                                    const partialhash = '00';
                                    const suffixdata = lockingscript;
                                    writer.write(Buffer.from(amountlength, 'hex'));
                                    writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                                    writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                                    writer.write(suffixdata);
                                    writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                                    writer.write(getLengthHex(size.length));
                                    writer.write(size);
                                }
                            }
                            break;
                    }
                    break;
            }
            break;
        case 4:
            //poolnft输出
            writer.write(Buffer.from(amountlength, 'hex'));//poolnftcodehash
            writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
            writer.write(Buffer.from(hashlength, 'hex'));
            writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
            writer.write(Buffer.from(amountlength, 'hex'));//poolnfttape
            writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
            writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length))
            writer.write(tx.outputs[1].script.toBuffer());

            //FTAbyC输出
            lockingscript = tx.outputs[2].script.toBuffer()//FTAbyC code部分
            size = getSize(lockingscript.length)
            partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536))
            suffixdata = lockingscript.subarray(1536)
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(tx.outputs[2].satoshisBN);
            writer.write(getLengthHex(suffixdata.length));//suffixdata
            writer.write(suffixdata);
            writer.write(Buffer.from(hashlength, 'hex'));//partialhash
            writer.write(Buffer.from(partialhash, 'hex'));
            writer.write(getLengthHex(size.length));
            writer.write(size);
            writer.write(Buffer.from(amountlength, 'hex'));//FTAbyC tape部分
            writer.writeUInt64LEBN(tx.outputs[3].satoshisBN);
            writer.write(getLengthHex(tx.outputs[3].script.toBuffer().length))
            writer.write(tx.outputs[3].script.toBuffer());

            //普通找零
            lockingscript = tx.outputs[4].script.toBuffer();
            size = getSize(lockingscript.length); // size小端序
            partialhash = '00';
            suffixdata = lockingscript;
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(tx.outputs[4].satoshisBN);
            writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
            writer.write(suffixdata);
            writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
            writer.write(getLengthHex(size.length));
            writer.write(size);
    }
    const currenttxoutputsdata = writer.toBuffer().toString('hex');
    return `${currenttxoutputsdata}`;
}

export function getPoolNFTPreTxdata(tx: tbc.Transaction): string {
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
    writer.write(Buffer.from(hashlength, 'hex'));
    writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
    writer.write(Buffer.from(amountlength, 'hex'));
    writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
    writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length));
    writer.write(tx.outputs[1].script.toBuffer());
    writer.write(Buffer.from(getOutputsData(tx, 2), 'hex'));
    return writer.toBuffer().toString('hex');
}

export function getPoolNFTPrePreTxdata(tx: tbc.Transaction): string {
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
    writer.write(Buffer.from(hashlength, 'hex'));
    writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
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

export function getInputsTxOutputsData(tx: tbc.Transaction, vout: number, isTape: boolean = false) {
    let offset = 0;
    if (isTape) {
        offset = 2;
    } else {
        offset = 1;
    }
    let outputs1 = ''; // outputs前部分
    let outputs1length = '';
    let outputs2 = ''; // outputs剩余部分
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
        outputs1 = outputWriter1.toBuffer().toString('hex'); // outputs前部分
        outputs1length = getLengthHex(outputs1.length / 2).toString('hex');
    }

    const outputWriter2 = new tbc.encoding.BufferWriter();
    for (let i = vout + offset; i < tx.outputs.length; i++) {//爷交易outputs2从vout+1开始
        outputWriter2.writeUInt64LEBN(tx.outputs[i].satoshisBN);
        outputWriter2.write(tbc.crypto.Hash.sha256(tx.outputs[i].script.toBuffer()));
    }
    outputs2 = outputWriter2.toBuffer().toString('hex'); // outputs剩余部分

    if (outputs2 === '') {
        outputs2 = '00';
        outputs2length = '';
    } else {
        outputs2length = getLengthHex(outputs2.length / 2).toString('hex');
    }

    return { outputs1, outputs1length, outputs2, outputs2length };
}

//计算交易某些数据长度，根据长度添加OP_PUSHDATA1或OP_PUSHDATA2
export function getLengthHex(length: number): Buffer {
    if (length < 76) {
        return Buffer.from(length.toString(16).padStart(2, '0'), 'hex');
    } else if (length > 75 && length < 256) {
        return Buffer.concat([Buffer.from('4c', 'hex'), Buffer.from(length.toString(16), 'hex')]);
    } else {
        return Buffer.concat([Buffer.from('4d', 'hex'), Buffer.from(length.toString(16).padStart(4, '0'), 'hex').reverse()]);
    }
}

export function getSize(length: number): Buffer {
    if (length < 256) {
        return Buffer.from(length.toString(16).padStart(2, '0'), 'hex');
    }
    else {
        return Buffer.from(length.toString(16).padStart(4, '0'), 'hex').reverse();
    }
}