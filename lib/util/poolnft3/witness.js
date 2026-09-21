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
exports.getPoolOutputLayout = getPoolOutputLayout;
exports.getPoolUnlockLeafCount = getPoolUnlockLeafCount;
exports.buildPoolUnlockScript = buildPoolUnlockScript;
const tbc = __importStar(require("tbc-lib-js"));
const tbc20unlock_1 = require("../tbc20/tbc20unlock");
const EMPTY = Buffer.alloc(0);
const ACTIVE_LEAF_COUNTS = Object.freeze({
    1: 66,
    2: 76,
    3: 56,
    4: 68,
});
function fail(message) {
    throw new Error(`PoolNFT3 witness: ${message}`);
}
function assertOption(value) {
    if (value !== 1 && value !== 2 && value !== 3 && value !== 4) {
        fail('option must be 1 (AddLP), 2 (RemoveLP), 3 (SwapFT), or 4 (SwapTBC)');
    }
}
function transactionVersion(tx) {
    const version = tx.version;
    if (version !== 10)
        fail('transaction.version must be 10');
    return version;
}
function assertTransaction(tx, name) {
    if (!(tx instanceof tbc.Transaction))
        fail(`${name} must be a tbc.Transaction`);
    transactionVersion(tx);
    if (tx.inputs.length < 1 ||
        tx.inputs.length > 0x7fffffff ||
        tx.outputs.length < 1 ||
        tx.outputs.length > 0x7fffffff) {
        fail(`${name} must contain a positive signed-32-bit number of inputs and outputs`);
    }
    if (!Number.isInteger(tx.nLockTime) || tx.nLockTime < 0 || tx.nLockTime > 0xffffffff) {
        fail(`${name}.nLockTime must be uint32`);
    }
}
function outputAt(tx, vout, name) {
    if (!Number.isSafeInteger(vout) || vout < 0 || vout >= tx.outputs.length) {
        fail(`${name} output index is outside the transaction`);
    }
    const output = tx.outputs[vout];
    if (!(output.script instanceof tbc.Script) || output.script.toBuffer().length === 0) {
        fail(`${name} must have a nonempty locking script`);
    }
    if (!Number.isSafeInteger(output.satoshis) || output.satoshis < 0) {
        fail(`${name}.satoshis must be a nonnegative safe integer`);
    }
    return output;
}
function value(output) {
    return (0, tbc20unlock_1.encodeTBC20UInt64LE)(BigInt(output.satoshis));
}
function sha(data) {
    return tbc.crypto.Hash.sha256(data);
}
function header(tx) {
    const result = Buffer.alloc(16);
    result.writeUInt32LE(transactionVersion(tx), 0);
    result.writeUInt32LE(tx.nLockTime, 4);
    result.writeUInt32LE(tx.inputs.length, 8);
    result.writeUInt32LE(tx.outputs.length, 12);
    return result;
}
function unlockingScriptsHash(tx) {
    return sha(Buffer.concat(tx.inputs.map((input, vin) => {
        if (!(input.script instanceof tbc.Script))
            fail(`input ${vin} has no unlocking script`);
        return sha(input.script.toBuffer());
    })));
}
function inputsHashData(tx) {
    return Buffer.concat([sha((0, tbc20unlock_1.getTBC20CurrentInputsData)(tx)), unlockingScriptsHash(tx)]);
}
function outputRecords(tx, start, end = tx.outputs.length) {
    const records = [];
    for (let vout = start; vout < end; vout += 1) {
        const output = outputAt(tx, vout, `output ${vout}`);
        records.push(value(output), sha(output.script.toBuffer()));
    }
    return Buffer.concat(records);
}
/** Compute the v10 txid from actual fields, avoiding a previously cached tx.hash. */
function actualTxid(tx) {
    return Buffer.from(tbc.crypto.Hash.sha256sha256(Buffer.concat([header(tx), inputsHashData(tx), sha(outputRecords(tx, 0))])))
        .reverse()
        .toString('hex');
}
function assertParentLink(current, vin, parent, name, requirePrevout) {
    const input = current.inputs[vin];
    if (!input || !Buffer.isBuffer(input.prevTxId) || input.prevTxId.length !== 32) {
        fail(`${name} has no valid input outpoint`);
    }
    if (input.prevTxId.toString('hex') !== actualTxid(parent)) {
        fail(`${name} does not spend the supplied parent transaction`);
    }
    const output = outputAt(parent, input.outputIndex, `${name} parent`);
    if (requirePrevout && !input.output) {
        fail(`${name} is missing authenticated previous-output metadata`);
    }
    if (input.output &&
        (!(input.output.script instanceof tbc.Script) ||
            !input.output.script.equals(output.script) ||
            input.output.satoshis !== output.satoshis)) {
        fail(`${name} previous-output metadata differs from the supplied parent`);
    }
    return input.outputIndex;
}
/** Canonical physical positions; optional pair and final change are unambiguous by count. */
function getPoolOutputLayout(tx, option) {
    assertOption(option);
    assertTransaction(tx, 'tx');
    const count = tx.outputs.length;
    const common = { poolCodeVout: 0, poolTapeVout: 1 };
    if (option === 3) {
        if (count !== 7 && count !== 8)
            fail('SwapFT must contain 7 or 8 outputs');
        return Object.freeze({
            ...common,
            userFtCodeVout: 2,
            feeVout: 4,
            poolFtCodeVout: 5,
            ...(count === 8 ? { tbcChangeVout: 7 } : {}),
        });
    }
    const base = option === 2 ? 9 : 6;
    if (count < base || count > base + 3) {
        fail(`${option === 1 ? 'AddLP' : option === 2 ? 'RemoveLP' : 'SwapTBC'} must contain ${base}..${base + 3} outputs`);
    }
    const hasTokenChange = count - base >= 2;
    const hasTbcChange = (count - base) % 2 === 1;
    const tail = hasTbcChange ? { tbcChangeVout: count - 1 } : {};
    if (option === 1) {
        return Object.freeze({
            ...common,
            poolFtCodeVout: 2,
            lpCodeVout: 4,
            ...(hasTokenChange ? { ftChangeCodeVout: 6 } : {}),
            ...tail,
        });
    }
    if (option === 2) {
        return Object.freeze({
            ...common,
            tbcVout: 2,
            userFtCodeVout: 3,
            lpBurnCodeVout: 5,
            poolFtCodeVout: 7,
            ...(hasTokenChange ? { lpChangeCodeVout: 9 } : {}),
            ...tail,
        });
    }
    return Object.freeze({
        ...common,
        tbcVout: 2,
        feeVout: 3,
        poolFtCodeVout: 4,
        ...(hasTokenChange ? { ftChangeCodeVout: 6 } : {}),
        ...tail,
    });
}
function getPoolUnlockLeafCount(option, hashLocked = false) {
    assertOption(option);
    if (typeof hashLocked !== 'boolean')
        fail('hashLocked must be boolean');
    return ACTIVE_LEAF_COUNTS[option] + (hashLocked ? 2 : 0);
}
function outputLeaves(tx, vout) {
    if (vout === undefined)
        return [EMPTY, EMPTY, EMPTY, EMPTY];
    const output = outputAt(tx, vout, `output ${vout}`);
    const partial = (0, tbc20unlock_1.getTBC20PartialScriptData)(output.script);
    return [value(output), partial.suffixData, partial.partialHash, partial.size];
}
function pairLeaves(tx, codeVout) {
    if (codeVout === undefined)
        return [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY];
    const tape = outputAt(tx, codeVout + 1, `Tape after output ${codeVout}`);
    return [...outputLeaves(tx, codeVout), value(tape), tape.script.toBuffer()];
}
function contextLeaves(tx, option, layout) {
    const pool = outputAt(tx, 0, 'Pool Code');
    const tape = outputAt(tx, 1, 'Pool Tape');
    const leaves = [value(pool), sha(pool.script.toBuffer()), value(tape), tape.script.toBuffer()];
    if (option === 1) {
        leaves.push(...pairLeaves(tx, layout.poolFtCodeVout), ...pairLeaves(tx, layout.lpCodeVout), ...pairLeaves(tx, layout.ftChangeCodeVout));
    }
    else if (option === 2) {
        leaves.push(...outputLeaves(tx, layout.tbcVout), ...pairLeaves(tx, layout.userFtCodeVout), ...pairLeaves(tx, layout.lpBurnCodeVout), ...pairLeaves(tx, layout.poolFtCodeVout), ...pairLeaves(tx, layout.lpChangeCodeVout));
    }
    else if (option === 3) {
        leaves.push(...pairLeaves(tx, layout.userFtCodeVout), ...outputLeaves(tx, layout.feeVout), ...pairLeaves(tx, layout.poolFtCodeVout));
    }
    else {
        leaves.push(...outputLeaves(tx, layout.tbcVout), ...outputLeaves(tx, layout.feeVout), ...pairLeaves(tx, layout.poolFtCodeVout), ...pairLeaves(tx, layout.ftChangeCodeVout));
    }
    leaves.push(...outputLeaves(tx, layout.tbcChangeVout));
    return leaves;
}
function inputProofLeaves(tx, vout) {
    return [
        header(tx),
        inputsHashData(tx),
        outputRecords(tx, 0, vout),
        ...outputLeaves(tx, vout),
        outputRecords(tx, vout + 1),
    ];
}
function ancestorLeaves(tx, vout) {
    const output = outputAt(tx, vout, 'Pool ancestor Code');
    return [
        header(tx),
        inputsHashData(tx),
        outputRecords(tx, 0, vout),
        value(output),
        sha(output.script.toBuffer()),
        outputRecords(tx, vout + 1),
    ];
}
function parentLeaves(tx) {
    const code = outputAt(tx, 0, 'Pool parent Code');
    const tape = outputAt(tx, 1, 'Pool parent Tape');
    return [
        header(tx),
        (0, tbc20unlock_1.getTBC20CurrentInputsData)(tx),
        unlockingScriptsHash(tx),
        value(code),
        sha(code.script.toBuffer()),
        value(tape),
        tape.script.toBuffer(),
        outputRecords(tx, 2),
    ];
}
function validateAuthorization(signature, publicKey) {
    if (!Buffer.isBuffer(signature) ||
        signature.length === 65 ||
        signature.length > 72 ||
        !tbc.crypto.Signature.isTxDER(signature)) {
        fail('signature must be a canonical DER transaction signature of at most 72 bytes');
    }
    const parsed = tbc.crypto.Signature.fromTxFormat(signature);
    if (!parsed.hasLowS() || parsed.nhashtype !== 0x41) {
        fail('signature must be low-S and use SIGHASH_ALL | SIGHASH_FORKID (0x41)');
    }
    if (!Buffer.isBuffer(publicKey) || publicKey.length !== 33) {
        fail('publicKey must be a compressed 33-byte public key');
    }
    try {
        tbc.PublicKey.fromBuffer(publicKey);
    }
    catch {
        fail('publicKey is invalid');
    }
}
function pushLeaf(script, leaf) {
    if (leaf.length === 1 && leaf[0] >= 1 && leaf[0] <= 16) {
        script.add(tbc.Opcode.smallInt(leaf[0]));
    }
    else if (leaf.length === 1 && leaf[0] === 0x81) {
        script.add(tbc.Opcode.OP_1NEGATE);
    }
    else {
        script.add(Buffer.from(leaf));
    }
}
/**
 * Serialize only the active Pool.main branch in compiler declaration order.
 * Inactive ctx structs/input arrays are omitted, not padded: Pool.main's Pop
 * is compile-time only. Absent outputs *inside* the active ctx retain padding.
 *
 * This is a pure witness builder: it neither signs nor changes the transaction.
 * The caller validates the trusted Code profile/Controller membership and
 * freezes fee, outputs, sequence, and lockTime before requesting a signature.
 */
function buildPoolUnlockScript(options) {
    if (!options || typeof options !== 'object')
        fail('options are required');
    const { tx, preTx, prePreTx, inputTxs, option, signature, publicKey } = options;
    assertOption(option);
    assertTransaction(tx, 'tx');
    assertTransaction(preTx, 'preTx');
    assertTransaction(prePreTx, 'prePreTx');
    const auxiliaryCount = option === 3 ? 2 : 3;
    if (tx.inputs.length !== auxiliaryCount + 1) {
        fail(`option ${option} requires exactly ${auxiliaryCount + 1} current inputs`);
    }
    if (!Array.isArray(inputTxs) || inputTxs.length !== auxiliaryCount) {
        fail(`option ${option} requires exactly ${auxiliaryCount} inputTxs in vin[1..] order`);
    }
    const seen = new Set();
    tx.inputs.forEach((input, vin) => {
        const outpoint = `${input.prevTxId.toString('hex')}:${input.outputIndex}`;
        if (seen.has(outpoint))
            fail(`duplicate current input outpoint at vin ${vin}`);
        seen.add(outpoint);
    });
    if (assertParentLink(tx, 0, preTx, 'tx.vin[0]', true) !== 0) {
        fail('tx.vin[0] must spend Pool Code at preTx.vout[0]');
    }
    const ancestorVout = assertParentLink(preTx, 0, prePreTx, 'preTx.vin[0]', false);
    const layout = getPoolOutputLayout(tx, option);
    if (!outputAt(tx, 0, 'Pool Code').script.equals(outputAt(preTx, 0, 'Pool parent Code').script)) {
        fail('Pool Code must be unchanged at current vout 0');
    }
    const hasSignature = signature !== undefined;
    if (hasSignature !== (publicKey !== undefined)) {
        fail('signature and publicKey must be supplied together for a hash-locked Pool');
    }
    const leaves = [];
    if (signature !== undefined && publicKey !== undefined) {
        validateAuthorization(signature, publicKey);
        leaves.push(Buffer.from(signature), Buffer.from(publicKey));
    }
    leaves.push(...contextLeaves(tx, option, layout));
    inputTxs.forEach((parent, index) => {
        assertTransaction(parent, `inputTxs[${index}]`);
        const vout = assertParentLink(tx, index + 1, parent, `tx.vin[${index + 1}]`, true);
        leaves.push(...inputProofLeaves(parent, vout));
    });
    leaves.push((0, tbc20unlock_1.getTBC20CurrentInputsData)(tx), (0, tbc20unlock_1.encodeTBC20UnsignedLE)(option), ...ancestorLeaves(prePreTx, ancestorVout), ...parentLeaves(preTx));
    if (leaves.length !== getPoolUnlockLeafCount(option, hasSignature)) {
        fail(`internal active ABI leaf count mismatch: ${leaves.length}`);
    }
    const script = new tbc.Script();
    leaves.forEach((leaf) => pushLeaf(script, leaf));
    return script;
}
