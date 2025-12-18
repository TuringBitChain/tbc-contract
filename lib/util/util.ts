import * as tbc from 'tbc-lib-js';
import { getPrePreTxdata } from './ftunlock';

export function buildUTXO(tx: tbc.Transaction, vout: number, isFT?: boolean): tbc.Transaction.IUnspentOutput {
        let ftBlance: bigint;
        isFT === true ? ftBlance = getFtBalanceFromTape(tx.outputs[vout + 1].script.toHex()) : ftBlance = 0n;
        const output = tx.outputs[vout];
        if (!output) {
            throw new Error(`Output at index ${vout} does not exist in the transaction.`);
        }
        return {
            txId: tx.hash,
            outputIndex: vout,
            script: output.script.toHex(),
            satoshis: output.satoshis,
            ftBalance: ftBlance
        };
    }

export function buildFtPrePreTxData(preTX: tbc.Transaction, preTxVout: number, localTXs: tbc.Transaction[]): string {
    const preTXtape = Buffer.from(preTX.outputs[preTxVout + 1].script.toBuffer().subarray(3, 51)).toString("hex");
    let prepretxdata = "";
    for (let i = preTXtape.length - 16; i >= 0; i -= 16) {
        const chunk = preTXtape.substring(i, i + 16);
        if (chunk != "0000000000000000") {
            const inputIndex = i / 16;
            const prepreTX = selectTXfromLocal(localTXs, preTX.inputs[inputIndex].prevTxId.toString("hex"));
            prepretxdata =
                prepretxdata +
                getPrePreTxdata(prepreTX, preTX.inputs[inputIndex].outputIndex);
        }
    }
    prepretxdata = "57" + prepretxdata;
    return prepretxdata;
}

export function selectTXfromLocal(txs: tbc.Transaction[], txid: string): tbc.Transaction {
    for (const tx of txs) {
        if (tx.hash === txid) {
            return tx;
        }
    }
    throw new Error(`Transaction with ID ${txid} not found in local transactions.`);
}

export function getFtBalanceFromTape(tape: string): bigint {
        let tapeBuffer = Buffer.from(tape, 'hex');
        tapeBuffer = Buffer.from(tapeBuffer.subarray(3, 3 + 48));
        let balance: bigint = BigInt(0);
        for (let i = 0; i < 6; i++) {
            const amount = tapeBuffer.readBigUInt64LE(i * 8);
            balance += amount;
        }
        return balance;
}

export async function fetchInBatches<T, R>(
    items: T[],
    batchSize: number,
    fetchFn: (batch: T[]) => Promise<R[]>,
    context: string
): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        console.log(`Processing ${context} batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)} (${batch.length} items)`);
        
        const batchResults = await fetchWithRetry(
            () => fetchFn(batch),
            3,
            300,
            `${context} batch ${Math.floor(i / batchSize) + 1}`
        );
        
        results.push(...batchResults);
        
        // 批次间延迟，避免请求过于频繁
        if (i + batchSize < items.length) {
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }
    
    return results;
}

export async function fetchWithRetry<T>(
    fn: () => Promise<T>, 
    retries = 3, 
    delay = 300,
    context = 'API call'
): Promise<T> {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            console.warn(`${context} attempt ${i + 1} failed:`, err);
            if (i === retries - 1) throw err;
            await new Promise(resolve => setTimeout(resolve, delay * (i + 1))); // 递增延迟
        }
    }
    throw new Error('Unreachable code');
}

export function getOpCode(number: number): string {
    if (number < 0) {
        throw new Error("Number must more than or equal 0");
    }
    if (number < 16)
         return `OP_${['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'][number]}`;
    else if (number < 256)
        return `${number.toString(16).padStart(2, '0')}`;
    else
        throw new Error("Number must be less than 256");     
}

export function getLpCostAddress(poolCode: string): string {
    const pubKeyHash = poolCode.substring(426, 426 + 40);
    // console.log(pubKeyHash);
    return tbc.Address.fromPublicKeyHash(Buffer.from(pubKeyHash, 'hex')).toString();
}

export function getLpCostAmount(poolCode: string): number {
    const amount = poolCode.substring(474, 474 + 16);
    // console.log(amount);
    const satoshi = new tbc.encoding.BufferReader(Buffer.from(amount, 'hex')).readUInt64LEBN();
    return Number(satoshi);
}

export function isLock(length: number): 0 | 1 {
    return length > 6600 ? 1 : 0;
}

export function fetchTBCLockTime(utxo: tbc.Transaction.IUnspentOutput): number {
    if (utxo.script.length != 106) {
        throw new Error("Invalid Piggy Bank script");
    }
    const script = tbc.Script.fromString(utxo.script);
    const lockTimeChunk = script.chunks[script.chunks.length - 8].buf;
    const lockTime = lockTimeChunk.readUInt32LE();
    return lockTime;
}

export function safeJSONParse(text: string): any {
    // 直接替换大数字字段
    const replacedText = text.replace(
        /"(ft_value|tbc_value|lp_balance|token_balance|tbc_balance|balance|value)":\s*(\d{14,})/g,
        '"$1":"$2"'
    );
    return JSON.parse(replacedText, (key, value) => {
        // 将特定字段的字符串转换为 BigInt
        if ((key === 'ft_value' || key === 'tbc_value' || key === 'lp_balance' || 
             key === 'token_balance' || key === 'tbc_balance' || key === 'balance' || key === 'value') && 
            typeof value === 'string' && /^\d+$/.test(value)) {
            return BigInt(value);
        }
        return value;
    });
}

export function parseDecimalToBigInt(amount: number | bigint | string, decimal: number): bigint {
    const amountStr = amount.toString();
    const [integerPart, fractionalPart = ''] = amountStr.split('.');
    const paddedFractional = fractionalPart.padEnd(decimal, '0').slice(0, decimal);
    // console.log(amountStr, integerPart, fractionalPart, paddedFractional);
    return BigInt(integerPart + paddedFractional);
}