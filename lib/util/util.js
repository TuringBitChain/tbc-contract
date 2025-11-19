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
exports.buildUTXO = buildUTXO;
exports.buildFtPrePreTxData = buildFtPrePreTxData;
exports.selectTXfromLocal = selectTXfromLocal;
exports.getFtBalanceFromTape = getFtBalanceFromTape;
exports.fetchInBatches = fetchInBatches;
exports.fetchWithRetry = fetchWithRetry;
exports.getOpCode = getOpCode;
exports.getLpCostAddress = getLpCostAddress;
exports.getLpCostAmount = getLpCostAmount;
exports.isLock = isLock;
exports.fetchTBCLockTime = fetchTBCLockTime;
exports.safeJSONParse = safeJSONParse;
const tbc = __importStar(require("tbc-lib-js"));
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
function getOpCode(number) {
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
function getLpCostAddress(poolCode) {
    const pubKeyHash = poolCode.substring(426, 426 + 40);
    // console.log(pubKeyHash);
    return tbc.Address.fromPublicKeyHash(Buffer.from(pubKeyHash, 'hex')).toString();
}
function getLpCostAmount(poolCode) {
    const amount = poolCode.substring(474, 474 + 16);
    // console.log(amount);
    const satoshi = new tbc.encoding.BufferReader(Buffer.from(amount, 'hex')).readUInt64LEBN();
    return Number(satoshi);
}
function isLock(length) {
    return length > 6600 ? 1 : 0;
}
function fetchTBCLockTime(utxo) {
    if (utxo.script.length != 106) {
        throw new Error("Invalid Piggy Bank script");
    }
    const script = tbc.Script.fromString(utxo.script);
    const lockTimeChunk = script.chunks[script.chunks.length - 8].buf;
    const lockTime = lockTimeChunk.readUInt32LE();
    return lockTime;
}
function safeJSONParse(text) {
    // 先匹配所有大数字字段及其值
    const bigIntMap = new Map();
    // 按对象分组收集大数字字段
    const objects = text.split(/}[\s,]*{/);
    objects.forEach((obj, index) => {
        const fieldMap = new Map();
        const localPattern = /"(\w+)":\s*(\d{16,})/g;
        let localMatch;
        while ((localMatch = localPattern.exec(obj)) !== null) {
            fieldMap.set(localMatch[1], localMatch[2]);
        }
        if (fieldMap.size > 0) {
            bigIntMap.set(index.toString(), fieldMap);
        }
    });
    let currentObjectIndex = -1;
    return JSON.parse(text, (key, value) => {
        // 检测到新对象
        if (key === '' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
            currentObjectIndex++;
        }
        const fieldMap = bigIntMap.get(currentObjectIndex.toString());
        if (fieldMap && fieldMap.has(key)) {
            const originalValue = fieldMap.get(key);
            if (typeof value === 'number' && !Number.isSafeInteger(value)) {
                return BigInt(originalValue);
            }
        }
        return value;
    });
}
