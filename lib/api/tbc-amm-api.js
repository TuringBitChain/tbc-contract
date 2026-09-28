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
exports.fetchTbcAmmInfo = fetchTbcAmmInfo;
exports.fetchTbcAmmUtxo = fetchTbcAmmUtxo;
exports.fetchTbcAmmInput = fetchTbcAmmInput;
exports.fetchTbc20LpUtxoList = fetchTbc20LpUtxoList;
exports.getTbc20LpBalance = getTbc20LpBalance;
exports.fetchTbc20LpUtxo = fetchTbc20LpUtxo;
exports.fetchTbc20LpUtxos = fetchTbc20LpUtxos;
exports.fetchTbc20LpAncestors = fetchTbc20LpAncestors;
const tbc = __importStar(require("tbc-lib-js"));
const tbc20_lp_1 = require("../contract/tbc20-lp");
const artifacts_1 = require("../util/tbc-amm/artifacts");
const fees_1 = require("../util/tbc-amm/fees");
const math_1 = require("../util/tbc-amm/math");
const tape_1 = require("../util/tbc-amm/tape");
const contract_query_1 = require("./contract-query");
function equalInteger(value, expected, label) {
    if ((0, contract_query_1.apiInteger)(value, label) !== expected) {
        throw new Error(`API: ${label} does not match the transaction`);
    }
}
function equalHex(value, expected, label) {
    if ((0, contract_query_1.apiHex)(value, label) !== expected.toLowerCase()) {
        throw new Error(`API: ${label} does not match the transaction`);
    }
}
async function fetchTbcAmmInfo(query, contractTxid) {
    const poolId = (0, contract_query_1.apiTxid)(contractTxid, 'Pool contract txid');
    const data = await query.data(`pool/poolinfo/poolid/${poolId}`);
    const txid = (0, contract_query_1.apiTxid)(data.txid, 'Pool current txid');
    if ((0, contract_query_1.apiNumber)(data.vout, 'Pool vout') !== 0) {
        throw new Error('API: TBC AMM Code must be at vout 0');
    }
    const parentTx = await query.tx(txid);
    const codeOutput = parentTx.outputs[0];
    const tapeOutput = parentTx.outputs[1];
    if (!codeOutput || !tapeOutput || tapeOutput.satoshis !== 0) {
        throw new Error('API: TBC AMM requires a Code/Tape pair at vout 0/1');
    }
    const code = (0, artifacts_1.parsePoolCode)(codeOutput.script);
    const tape = (0, tape_1.decodePoolTape)(tapeOutput.script);
    const codeScript = codeOutput.script.toHex();
    const tapeScript = tapeOutput.script.toHex();
    equalHex(data.pool_code_script, codeScript, 'Pool Code');
    equalInteger(data.value, BigInt(codeOutput.satoshis), 'Pool output value');
    equalInteger(data.lp_balance, tape.ftLpAmount, 'Pool LP balance');
    equalInteger(data.token_balance, tape.ftAAmount, 'Pool token balance');
    equalInteger(data.tbc_balance, tape.tbcAmount, 'Pool TBC balance');
    equalHex(data.ft_lp_partial_hash, tape.ftLpPartialHash.toString('hex'), 'Pool LP partial hash');
    // The shared index reports legacy version/hash summaries for this route.
    // The canonical Code and Tape determine the Pool profile and FT identity.
    equalHex(data.ft_contract_id, tape.ftAContractId, 'Pool token contract id');
    equalInteger(data.service_fee_rate, BigInt(tape.serviceFeeRate), 'Pool service fee rate');
    if (BigInt(codeOutput.satoshis) < math_1.TBC_AMM_CODE_DUST) {
        throw new Error('API: TBC AMM Code is below its retained value');
    }
    const controlled = code.authorization.kind === 'controller';
    if (tape.withSwapHashLock !== controlled || tape.withLpHashLock !== controlled) {
        throw new Error('API: Pool authorization flags do not match its Code');
    }
    const lpCode = tbc20_lp_1.TBC20LP.instantiateCode({
        poolCodeHash: code.poolCodeHash,
        tapeSize: code.ftTapeSize,
        controller: Buffer.alloc(21),
        timelocked: tape.withLpLocktime,
    });
    if (!tbc20_lp_1.TBC20LP.getCodeIdentity(lpCode).subarray(0, 32).equals(tape.ftLpPartialHash) ||
        lpCode.toBuffer().length !== tape.ftLpCodeSize) {
        throw new Error('API: Pool LP identity does not match its Code and Tape');
    }
    const feePolicy = (0, fees_1.resolveSwapFeePolicy)(tape.lpPlan, tape.serviceFeeRate);
    const recipient = (0, fees_1.assertPoolFeeRecipient)(code.tbcFeeScriptHash, feePolicy);
    return {
        contractTxid: poolId,
        parentTx,
        codeScript,
        tapeScript,
        poolCodeHash: code.poolCodeHash,
        tape,
        authorization: code.authorization,
        poolVersion: 3,
        serviceProvider: recipient.address,
        currentContractTxid: txid,
        currentContractVout: 0,
        currentContractSatoshi: codeOutput.satoshis,
    };
}
async function fetchTbcAmmUtxo(query, contractTxid) {
    const info = await fetchTbcAmmInfo(query, contractTxid);
    return {
        txId: info.currentContractTxid,
        outputIndex: 0,
        script: info.codeScript,
        satoshis: info.currentContractSatoshi,
        parentTx: info.parentTx,
        tapeScript: info.tapeScript,
    };
}
/** Includes the transaction consumed by the current Pool's first input. */
async function fetchTbcAmmInput(query, contractTxid) {
    const { parentTx } = await fetchTbcAmmInfo(query, contractTxid);
    const input = parentTx.inputs[0];
    if (!input)
        throw new Error('API: Pool transaction has no ancestor input');
    const ancestorTx = await query.tx(input.prevTxId.toString('hex'));
    if (!ancestorTx.outputs[input.outputIndex]) {
        throw new Error('API: Pool ancestor output does not exist');
    }
    return { parentTx, ancestorTx };
}
/** Accepts the canonical field and the historical alias, rejecting conflicts. */
function aliasedInteger(record, field, alias) {
    const value = (0, contract_query_1.apiInteger)(record[field] ?? record[alias], field);
    if (record[field] !== undefined && record[alias] !== undefined) {
        if ((0, contract_query_1.apiInteger)(record[alias], alias) !== value) {
            throw new Error(`API: conflicting ${field} and ${alias}`);
        }
    }
    return value;
}
async function fetchTbc20LpUtxoList(query, codeScript) {
    const script = (0, contract_query_1.apiHex)(codeScript, 'TBC20 LP Code');
    const descriptor = tbc20_lp_1.TBC20LP.parseCode(script);
    const scriptHash = tbc.crypto.Hash.sha256(Buffer.from(script, 'hex')).reverse().toString('hex');
    const data = await query.data(`pool/lputxo/scriptpubkeyhash/${scriptHash}`);
    if (!Array.isArray(data.utxos))
        throw new Error('API: LP UTXOs must be an array');
    const seen = new Set();
    const utxos = data.utxos.map((record) => {
        const balance = aliasedInteger(record, 'lp_balance', 'ftBalance');
        const value = aliasedInteger(record, 'tbc_balance', 'value');
        const outputIndex = aliasedInteger(record, 'index', 'vout');
        const utxo = (0, contract_query_1.apiUtxo)({ ...record, index: outputIndex, tbc_balance: value, lp_balance: balance }, script, 'tbc_balance', 'lp_balance');
        const outpoint = `${utxo.txId}:${utxo.outputIndex}`;
        if (seen.has(outpoint))
            throw new Error('API: duplicate LP UTXO');
        seen.add(outpoint);
        return { utxo, record };
    });
    const result = [];
    for (let start = 0; start < utxos.length; start += 8) {
        result.push(...await Promise.all(utxos.slice(start, start + 8).map(async ({ utxo, record }) => {
            const parentTx = await query.tx(utxo.txId);
            const codeOutput = parentTx.outputs[utxo.outputIndex];
            const tapeOutput = parentTx.outputs[utxo.outputIndex + 1];
            if (!codeOutput || !tapeOutput || tapeOutput.satoshis !== 0 ||
                codeOutput.satoshis !== tbc20_lp_1.TBC20LP.codeSatoshis ||
                codeOutput.satoshis !== utxo.satoshis || codeOutput.script.toHex() !== script) {
                throw new Error('API: LP UTXO does not match its transaction Code/Tape pair');
            }
            const tape = tbc20_lp_1.TBC20LP.parseTape(tapeOutput.script, descriptor);
            if (tape.balance !== utxo.ftBalance) {
                throw new Error('API: indexed LP balance does not match its Tape');
            }
            if (record.lock_time !== undefined &&
                (0, contract_query_1.apiNumber)(record.lock_time, 'LP lock_time', 0xffffffff) !== tape.lockTime) {
                throw new Error('API: indexed LP lock_time does not match its Tape');
            }
            return {
                ...utxo,
                parentTx,
                tapeScript: tapeOutput.script.toHex(),
                timelocked: tape.timelocked,
                lockTime: tape.lockTime,
            };
        })));
    }
    return result;
}
async function getTbc20LpBalance(query, codeScript) {
    const utxos = await fetchTbc20LpUtxoList(query, codeScript);
    return utxos.reduce((sum, utxo) => sum + utxo.ftBalance, 0n);
}
async function fetchTbc20LpUtxo(query, codeScript, amountRaw) {
    if (typeof amountRaw !== 'bigint' || amountRaw <= 0n) {
        throw new Error('API: LP amountRaw must be a positive bigint');
    }
    return (await fetchTbc20LpUtxos(query, codeScript, amountRaw, 1))[0];
}
/** Selects up to five LP inputs whose nonzero locks use the same time domain. */
async function fetchTbc20LpUtxos(query, codeScript, amountRaw, maxInputs = 5) {
    if (!Number.isInteger(maxInputs) || maxInputs < 1 || maxInputs > 5) {
        throw new Error('API: TBC20 LP maxInputs must be an integer from 1 to 5');
    }
    if (amountRaw !== undefined && (typeof amountRaw !== 'bigint' || amountRaw <= 0n)) {
        throw new Error('API: LP amountRaw must be a positive bigint');
    }
    const utxos = await fetchTbc20LpUtxoList(query, codeScript);
    return (0, contract_query_1.selectTokenUtxos)(utxos, amountRaw, maxInputs);
}
/** Resolves nonzero parent Tape slots, including the Pool used for LP issuance. */
async function fetchTbc20LpAncestors(query, parentTx, codeVout) {
    if (!(parentTx instanceof tbc.Transaction)) {
        throw new Error('API: LP parentTx must be a Transaction');
    }
    const vout = (0, contract_query_1.apiNumber)(codeVout, 'LP codeVout', 0xffffffff);
    const code = parentTx.outputs[vout];
    const tape = parentTx.outputs[vout + 1];
    if (!code || code.satoshis !== tbc20_lp_1.TBC20LP.codeSatoshis || !tape || tape.satoshis !== 0) {
        throw new Error('API: LP parent output must be a Code/Tape pair');
    }
    const parsed = tbc20_lp_1.TBC20LP.parseTape(tape.script, tbc20_lp_1.TBC20LP.parseCode(code.script));
    return (0, contract_query_1.fetchAncestorTransactions)(query, parentTx, parsed.amounts);
}
