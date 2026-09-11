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
exports.validatePool3Transaction = validatePool3Transaction;
const tbc = __importStar(require("tbc-lib-js"));
const Interpreter = tbc.Script.Interpreter;
/** Executes every previous locking script, not only the Pool state input. */
function validatePool3Transaction(tx) {
    if (!(tx instanceof tbc.Transaction) ||
        tx.version !== 10 ||
        !tx.inputs.length ||
        !tx.outputs.length)
        throw new Error('PoolNFT3 validation requires a version 10 transaction');
    const seen = new Set();
    let inputSat = 0n;
    const inputs = tx.inputs.map((input, inputIndex) => {
        const outpoint = `${input.prevTxId.toString('hex')}:${input.outputIndex}`;
        if (seen.has(outpoint))
            throw new Error('PoolNFT3 validation: duplicate input');
        seen.add(outpoint);
        if (!input.output || !Number.isSafeInteger(input.output.satoshis) || input.output.satoshis < 0)
            throw new Error('PoolNFT3 validation: missing or unsafe prevout');
        inputSat += BigInt(input.output.satoshis);
        const vm = new Interpreter();
        const ok = vm.verify(input.script, input.output.script, tx, inputIndex, Interpreter.DEFAULT_FLAGS, input.output.satoshisBN);
        // Current FTLP artifacts intentionally leave bookkeeping on altstack.
        // Acceptance requires the interpreter result and one main-stack result;
        // report altstack depth without inventing an extra consensus condition.
        return {
            inputIndex,
            success: ok && vm.stack.length === 1,
            error: vm.errstr || (ok && vm.stack.length !== 1 ? 'non-clean final main stack' : ''),
            stackDepth: vm.stack.length,
            altStackDepth: vm.altstack.length,
        };
    });
    const outputSat = tx.outputs.reduce((sum, output) => {
        if (!Number.isSafeInteger(output.satoshis) || output.satoshis < 0)
            throw new Error('PoolNFT3 validation: unsafe output');
        return sum + BigInt(output.satoshis);
    }, 0n);
    const valueConserved = inputSat >= outputSat;
    return {
        success: valueConserved && inputs.every((i) => i.success),
        inputs,
        valueConserved,
        nodeAcceptanceChecked: false,
    };
}
