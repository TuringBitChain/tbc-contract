"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildUTXO = buildUTXO;
exports.buildFtPrePreTxData = buildFtPrePreTxData;
exports.selectTXfromLocal = selectTXfromLocal;
exports.getFtBalanceFromTape = getFtBalanceFromTape;
exports.fetchInBatches = fetchInBatches;
exports.fetchWithRetry = fetchWithRetry;
const ftunlock_1 = require("./ftunlock");
function buildUTXO(tx, vout, isFT) {
    let ftBlance;
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
function buildFtPrePreTxData(preTX, preTxVout, localTXs) {
    const preTXtape = Buffer.from(preTX.outputs[preTxVout + 1].script.toBuffer().subarray(3, 51)).toString("hex");
    let prepretxdata = "";
    for (let i = preTXtape.length - 16; i >= 0; i -= 16) {
        const chunk = preTXtape.substring(i, i + 16);
        if (chunk != "0000000000000000") {
            const inputIndex = i / 16;
            const prepreTX = selectTXfromLocal(localTXs, preTX.inputs[inputIndex].prevTxId.toString("hex"));
            prepretxdata =
                prepretxdata +
                    (0, ftunlock_1.getPrePreTxdata)(prepreTX, preTX.inputs[inputIndex].outputIndex);
        }
    }
    prepretxdata = "57" + prepretxdata;
    return prepretxdata;
}
function selectTXfromLocal(txs, txid) {
    for (const tx of txs) {
        if (tx.hash === txid) {
            return tx;
        }
    }
    throw new Error(`Transaction with ID ${txid} not found in local transactions.`);
}
function getFtBalanceFromTape(tape) {
    let tapeBuffer = Buffer.from(tape, 'hex');
    tapeBuffer = Buffer.from(tapeBuffer.subarray(3, 3 + 48));
    let balance = BigInt(0);
    for (let i = 0; i < 6; i++) {
        const amount = tapeBuffer.readBigUInt64LE(i * 8);
        balance += amount;
    }
    return balance;
}
async function fetchInBatches(items, batchSize, fetchFn, context) {
    const results = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        console.log(`Processing ${context} batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)} (${batch.length} items)`);
        const batchResults = await fetchWithRetry(() => fetchFn(batch), 3, 300, `${context} batch ${Math.floor(i / batchSize) + 1}`);
        results.push(...batchResults);
        // 批次间延迟，避免请求过于频繁
        if (i + batchSize < items.length) {
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }
    return results;
}
async function fetchWithRetry(fn, retries = 3, delay = 300, context = 'API call') {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        }
        catch (err) {
            console.warn(`${context} attempt ${i + 1} failed:`, err);
            if (i === retries - 1)
                throw err;
            await new Promise(resolve => setTimeout(resolve, delay * (i + 1))); // 递增延迟
        }
    }
    throw new Error('Unreachable code');
}
