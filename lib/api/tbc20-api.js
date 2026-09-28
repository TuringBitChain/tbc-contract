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
exports.fetchTbc20StandardInfo = fetchTbc20StandardInfo;
exports.fetchTbc20StablecoinInfo = fetchTbc20StablecoinInfo;
exports.getTokenBalance = getTokenBalance;
exports.fetchTokenUtxoList = fetchTokenUtxoList;
exports.fetchTokenUtxos = fetchTokenUtxos;
exports.fetchTokenAncestors = fetchTokenAncestors;
const tbc = __importStar(require("tbc-lib-js"));
const tbc20_standard_1 = require("../contract/tbc20-standard");
const tbc20_stablecoin_codec_1 = require("../util/tbc20-stablecoin/tbc20-stablecoin-codec");
const contract_query_1 = require("./contract-query");
const route = (family) => family === 'standard'
    ? { prefix: 'ft', id: 'contract' } : { prefix: 'stablecoin', id: 'stablecoinid' };
function tokenTape(family, code, tape) {
    if (family === 'standard') {
        const parsed = tbc20_standard_1.TBC20Standard.parseTape(tape);
        tbc20_standard_1.TBC20Standard.validateCode(code, parsed.size);
        return { ...parsed, lockTime: 0 };
    }
    return tbc20_stablecoin_codec_1.TBC20StablecoinCodec.parseTape(tape, tbc20_stablecoin_codec_1.TBC20StablecoinCodec.parseCode(code));
}
function tokenInfo(data, contractTxid, family) {
    const codeScript = (0, contract_query_1.apiHex)(data.code_script, 'code_script');
    const tapeScript = (0, contract_query_1.apiHex)(data.tape_script, 'tape_script');
    tokenTape(family, codeScript, tapeScript);
    return {
        contractTxid,
        codeScript,
        tapeScript,
        totalSupply: (0, contract_query_1.apiInteger)(family === 'standard' ? data.amount : data.supply, 'totalSupply'),
        decimal: (0, contract_query_1.apiNumber)(data.decimal, 'decimal', 18),
        name: (0, contract_query_1.apiString)(data.name, 'name'),
        symbol: (0, contract_query_1.apiString)(data.symbol, 'symbol'),
    };
}
async function fetchTbc20StandardInfo(query, contractTxid) {
    const id = (0, contract_query_1.apiTxid)(contractTxid, 'contractTxid');
    const info = tokenInfo(await query.data(`ft/info/contract/${id}`), id, 'standard');
    return { ...info, supply: tbc20_standard_1.TBC20Standard.rawToHuman(info.totalSupply, info.decimal) };
}
async function fetchTbc20StablecoinInfo(query, contractTxid) {
    const id = (0, contract_query_1.apiTxid)(contractTxid, 'contractTxid');
    const data = await query.data(`stablecoin/info/stablecoinid/${id}`);
    return { ...tokenInfo(data, id, 'stablecoin'), issuanceTxid: (0, contract_query_1.apiTxid)(data.utxo?.txid, 'issuance txid') };
}
async function getTokenBalance(query, family, contractTxid, addressOrHash) {
    const id = (0, contract_query_1.apiTxid)(contractTxid, 'contractTxid');
    const controller = (0, contract_query_1.apiController)(addressOrHash).toString('hex');
    const { prefix, id: idName } = route(family);
    const data = await query.data(`${prefix}/tokenbalance/combinescript/${controller}/${idName}/${id}`);
    return (0, contract_query_1.apiInteger)(data.balance, 'balance');
}
async function fetchTokenUtxoList(query, family, contractTxid, addressOrHash, codeScript) {
    const id = (0, contract_query_1.apiTxid)(contractTxid, 'contractTxid');
    const controller = (0, contract_query_1.apiController)(addressOrHash);
    const sourceCode = (0, contract_query_1.apiHex)(codeScript, 'codeScript');
    const expectedCode = family === 'standard'
        ? tbc20_standard_1.TBC20Standard.replaceController(sourceCode, controller).toHex()
        : tbc20_stablecoin_codec_1.TBC20StablecoinCodec.replaceController(sourceCode, controller).toHex();
    const { prefix, id: idName } = route(family);
    const data = await query.data(`${prefix}/utxo/combinescript/${controller.toString('hex')}/${idName}/${id}`);
    if (!Array.isArray(data.utxos))
        throw new Error('Contract API: missing token UTXO array');
    const seen = new Set();
    const indexed = data.utxos.map((record) => {
        const utxo = (0, contract_query_1.apiUtxo)(record, expectedCode);
        const point = `${utxo.txId}:${utxo.outputIndex}`;
        if (seen.has(point))
            throw new Error('Contract API: duplicate token outpoint');
        seen.add(point);
        if (utxo.satoshis !== 500)
            throw new Error('Contract API: token Code must contain 500 satoshis');
        return { utxo, record };
    });
    const result = [];
    // Bound raw-transaction requests while retaining index order.
    for (let start = 0; start < indexed.length; start += 8) {
        result.push(...await Promise.all(indexed.slice(start, start + 8).map(async ({ utxo, record }) => {
            const parentTx = await query.tx(utxo.txId);
            const code = parentTx.outputs[utxo.outputIndex];
            const tape = parentTx.outputs[utxo.outputIndex + 1];
            if (!code || code.satoshis !== 500 || code.script.toHex() !== expectedCode || !tape || tape.satoshis !== 0) {
                throw new Error('Contract API: indexed token output does not match its parent Code/Tape');
            }
            const tapeScript = tape.script.toHex();
            const parsed = tokenTape(family, expectedCode, tapeScript);
            if (parsed.balance !== utxo.ftBalance)
                throw new Error('Contract API: indexed token balance differs from its Tape');
            if (family === 'stablecoin' && record.lock_time !== undefined &&
                (0, contract_query_1.apiNumber)(record.lock_time, 'lock_time', 0xffffffff) !== parsed.lockTime) {
                throw new Error('Contract API: indexed lock_time differs from its Tape');
            }
            return { ...utxo, parentTx, tapeScript, ...(family === 'stablecoin' ? { lockTime: parsed.lockTime } : {}) };
        })));
    }
    return result;
}
async function fetchTokenUtxos(query, family, contractTxid, addressOrHash, amountRaw, codeScript, maxInputs) {
    const list = family === 'standard'
        ? await fetchTokenUtxoList(query, family, contractTxid, addressOrHash, codeScript)
        : await fetchTokenUtxoList(query, family, contractTxid, addressOrHash, codeScript);
    return (0, contract_query_1.selectTokenUtxos)(list, amountRaw, maxInputs);
}
async function fetchTokenAncestors(query, family, parentTx, codeVout) {
    if (!(parentTx instanceof tbc.Transaction))
        throw new Error('Contract API: parentTx must be a Transaction');
    const vout = (0, contract_query_1.apiNumber)(codeVout, 'codeVout', 0xffffffff);
    const code = parentTx.outputs[vout];
    const tape = parentTx.outputs[vout + 1];
    if (!code || code.satoshis !== 500 || !tape || tape.satoshis !== 0) {
        throw new Error('Contract API: parent output must be a token Code/Tape pair');
    }
    const parsed = tokenTape(family, code.script.toHex(), tape.script.toHex());
    return (0, contract_query_1.fetchAncestorTransactions)(query, parentTx, parsed.amounts);
}
