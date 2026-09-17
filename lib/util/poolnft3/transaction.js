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
exports.PreparedPool3Transaction = void 0;
exports.pool3Fail = pool3Fail;
exports.safeSatoshis = safeSatoshis;
exports.publicKeyBytes = publicKeyBytes;
exports.privateKeySigner = privateKeySigner;
exports.referenceOutput = referenceOutput;
exports.p2pkhInputPlan = p2pkhInputPlan;
exports.addPool3Output = addPool3Output;
const tbc = __importStar(require("tbc-lib-js"));
const poolnft3_1 = require("../../validator/poolnft3");
const fees_1 = require("./fees");
const MAX_SIGNATURE = Buffer.from('304502210080000000000000000000000000000000000000000000000000000000000000000220010000000000000000000000000000000000000000000000000000000000000041', 'hex');
function pool3Fail(message) {
    throw new Error(`PoolNFT3: ${message}`);
}
function safeSatoshis(value, name = 'amountSat') {
    if (typeof value !== 'bigint' || value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
        pool3Fail(`${name} must be a non-negative bigint within the JS safe satoshi range`);
    }
    return Number(value);
}
function publicKeyBytes(value) {
    if (typeof value === 'string' && !/^(02|03)[0-9a-fA-F]{64}$/.test(value))
        pool3Fail('invalid compressed public key hex');
    const bytes = typeof value === 'string' ? Buffer.from(value, 'hex') : Buffer.from(value);
    if (bytes.length !== 33)
        pool3Fail('a valid compressed 33-byte public key is required');
    tbc.PublicKey.fromBuffer(bytes);
    return bytes;
}
function privateKeySigner(key) {
    if (!(key instanceof tbc.PrivateKey))
        pool3Fail('privateKeySigner requires a PrivateKey');
    return {
        publicKey: key.toPublicKey().toBuffer(),
        sign: (request) => {
            const sig = request.transaction.getSignature(request.inputIndex, key);
            if (typeof sig !== 'string')
                pool3Fail('expected one transaction signature');
            return Buffer.from(sig, 'hex');
        },
    };
}
function referenceOutput(reference) {
    if (!(reference.parentTx instanceof tbc.Transaction) ||
        reference.parentTx.version !== 10)
        pool3Fail('parentTx must be a version 10 Transaction');
    const index = reference.outputIndex;
    if (!Number.isSafeInteger(index) || index < 0 || index >= reference.parentTx.outputs.length)
        pool3Fail('invalid input outputIndex');
    const output = reference.parentTx.outputs[index];
    if (!Number.isSafeInteger(output.satoshis) || output.satoshis < 0)
        pool3Fail('unsafe previous output satoshis');
    return output;
}
function p2pkhInputPlan(reference) {
    const pub = publicKeyBytes(reference.signer.publicKey);
    const expected = tbc.Script.buildPublicKeyHashOut(tbc.PublicKey.fromBuffer(pub).toAddress());
    if (!referenceOutput(reference).script.toBuffer().equals(expected.toBuffer()))
        pool3Fail('funding signer does not own the exact P2PKH input');
    return {
        reference,
        role: 'funding',
        signer: reference.signer,
        unlock: (_tx, sig, pk) => new tbc.Script().add(sig).add(pk),
    };
}
function addPool3Output(script, amountSat) {
    const satoshis = safeSatoshis(amountSat);
    assertP2pkhOutputAmount(script, amountSat);
    return new tbc.Transaction.Output({ script, satoshis });
}
function assertP2pkhOutputAmount(script, amountSat) {
    if (script.isPublicKeyHashOut() && amountSat < fees_1.POOL3_MIN_TBC_OUTPUT_SAT)
        pool3Fail('P2PKH output must be at least 10 sat');
}
function cloneTx(tx) {
    const copy = new tbc.Transaction(tx.uncheckedSerialize());
    tx.inputs.forEach((input, i) => {
        if (!input.output)
            pool3Fail(`input ${i} has no previous output`);
        copy.inputs[i].output = new tbc.Transaction.Output({
            script: tbc.Script.fromBuffer(Buffer.from(input.output.script.toBuffer())),
            satoshis: input.output.satoshis,
        });
    });
    return copy;
}
function signatureBytes(value) {
    if (typeof value === 'string' && !/^(?:[0-9a-fA-F]{2})+$/.test(value))
        pool3Fail('invalid signature hex');
    const bytes = typeof value === 'string' ? Buffer.from(value, 'hex') : Buffer.from(value);
    if (bytes.length === 65 || bytes.length > 72 || !tbc.crypto.Signature.isTxDER(bytes))
        pool3Fail('signature must be canonical low-S DER, at most 72 bytes');
    const parsed = tbc.crypto.Signature.fromTxFormat(bytes);
    if (!parsed.hasLowS() || parsed.nhashtype !== 0x41)
        pool3Fail('signature must use low-S SIGHASH_ALL | FORKID (0x41)');
    return bytes;
}
/** Prepared transactions keep a private copy; exported signing views cannot mutate it. */
class PreparedPool3Transaction {
    tx;
    plans;
    publicKeys;
    reservations;
    signaturePositions;
    feeSat;
    reservedBytes;
    changeVout;
    consumedOutpoints;
    constructor(plan) {
        if (plan.inputs.length < 1 || plan.inputs.length > 6)
            pool3Fail('transaction requires 1–6 inputs; consolidate funding explicitly');
        const rate = plan.feePolicy?.satoshisPerKb ?? 80n;
        const minimum = plan.feePolicy?.minimumFeeSat ?? 80n;
        const dust = plan.feePolicy?.changeDustSat ?? fees_1.POOL3_MIN_TBC_OUTPUT_SAT;
        for (const [name, value] of [
            ['satoshisPerKb', rate],
            ['minimumFeeSat', minimum],
            ['changeDustSat', dust],
        ]) {
            safeSatoshis(value, name);
            if (value === 0n)
                pool3Fail(`${name} must be positive`);
        }
        if (dust < fees_1.POOL3_MIN_TBC_OUTPUT_SAT)
            pool3Fail('changeDustSat must be at least 10 sat');
        if (plan.lockTime !== undefined &&
            (!Number.isInteger(plan.lockTime) || plan.lockTime < 0 || plan.lockTime > 0xffffffff))
            pool3Fail('lockTime must be uint32');
        const changeScript = tbc.Script.buildPublicKeyHashOut(tbc.Address.fromString(plan.changeAddress));
        if (changeScript.toBuffer().length !== 25)
            pool3Fail('change address must be P2PKH');
        // Snapshot caller-owned parents. addInputFromPrevTx otherwise aliases the
        // parent's Output object, allowing a later mutation to alter signing value.
        this.plans = plan.inputs.map((p) => ({
            ...p,
            reference: {
                parentTx: new tbc.Transaction(p.reference.parentTx.uncheckedSerialize()),
                outputIndex: p.reference.outputIndex,
            },
            signer: p.signer
                ? { publicKey: publicKeyBytes(p.signer.publicKey), sign: p.signer.sign?.bind(p.signer) }
                : undefined,
        }));
        this.publicKeys = this.plans.map((p) => p.signer ? publicKeyBytes(p.signer.publicKey) : undefined);
        const seen = new Set();
        this.consumedOutpoints = Object.freeze(this.plans.map((p) => {
            referenceOutput(p.reference);
            const outpoint = { txId: p.reference.parentTx.id, outputIndex: p.reference.outputIndex };
            const id = `${outpoint.txId}:${outpoint.outputIndex}`;
            if (seen.has(id))
                pool3Fail(`duplicate input ${id}`);
            seen.add(id);
            return Object.freeze(outpoint);
        }));
        const available = this.plans.reduce((sum, p) => sum + BigInt(referenceOutput(p.reference).satoshis), 0n) -
            plan.outputs.reduce((sum, output) => {
                if (!Number.isSafeInteger(output.satoshis) || output.satoshis < 0)
                    pool3Fail('invalid output satoshis');
                assertP2pkhOutputAmount(output.script, BigInt(output.satoshis));
                return sum + BigInt(output.satoshis);
            }, 0n);
        if (available < 0n)
            pool3Fail('insufficient TBC for fixed outputs');
        const build = (change) => {
            const tx = new tbc.Transaction();
            tx.version = 10;
            tx.nLockTime = plan.lockTime ?? 0;
            this.plans.forEach((p, i) => {
                tx.addInputFromPrevTx(p.reference.parentTx, p.reference.outputIndex);
                const previous = referenceOutput(p.reference);
                tx.inputs[i].output = new tbc.Transaction.Output({
                    script: tbc.Script.fromBuffer(Buffer.from(previous.script.toBuffer())),
                    satoshis: previous.satoshis,
                });
                if (p.sequence !== undefined)
                    tx.setInputSequence(i, p.sequence);
            });
            plan.outputs.forEach((o) => tx.addOutput(new tbc.Transaction.Output({
                script: tbc.Script.fromBuffer(Buffer.from(o.script.toBuffer())),
                satoshis: o.satoshis,
            })));
            if (change !== undefined)
                tx.addOutput(addPool3Output(changeScript, change));
            // No external signing callback is invoked during size estimation.
            const unlocks = this.plans.map((p, i) => p.unlock(tx, p.signer ? Buffer.from(MAX_SIGNATURE) : undefined, this.publicKeys[i]));
            unlocks.forEach((unlock, i) => tx.inputs[i].setScript(unlock));
            return tx;
        };
        const requiredFee = (tx) => {
            const size = BigInt(tx.uncheckedSerialize().length / 2);
            const calculated = (size * rate + 999n) / 1000n;
            return calculated > minimum ? calculated : minimum;
        };
        const withChangeFee = requiredFee(build(dust));
        const change = available - withChangeFee;
        if (change >= dust) {
            this.tx = build(change);
            this.feeSat = withChangeFee;
            this.changeVout = plan.outputs.length;
        }
        else {
            this.tx = build();
            if (available < requiredFee(this.tx))
                pool3Fail('insufficient TBC for the reserved transaction fee');
            this.feeSat = available;
        }
        if (this.feeSat < requiredFee(this.tx))
            pool3Fail('fee reservation failed to converge');
        this.reservedBytes = this.tx.uncheckedSerialize().length / 2;
        this.reservations = this.tx.inputs.map((input) => input.script.toBuffer().length);
        this.signaturePositions = this.tx.inputs.map((input, i) => {
            if (!this.publicKeys[i])
                return undefined;
            const positions = input.script.chunks.flatMap((chunk, index) => chunk.buf?.equals(MAX_SIGNATURE) ? [index] : []);
            if (positions.length !== 1 ||
                !input.script.chunks[positions[0] + 1]?.buf?.equals(this.publicKeys[i]))
                pool3Fail(`ambiguous signature placeholder in input ${i}`);
            return positions[0];
        });
    }
    get transaction() {
        return cloneTx(this.tx);
    }
    get signingRequests() {
        return this.plans.flatMap((plan, inputIndex) => {
            const publicKey = this.publicKeys[inputIndex];
            if (!publicKey)
                return [];
            const output = this.tx.inputs[inputIndex].output;
            return [
                {
                    inputIndex,
                    role: plan.role,
                    outpoint: { ...this.consumedOutpoints[inputIndex] },
                    amountSat: BigInt(output.satoshis),
                    lockingScriptHex: output.script.toHex(),
                    publicKey: Buffer.from(publicKey),
                    publicKeyHash: tbc.crypto.Hash.sha256ripemd160(publicKey),
                    sighashType: 0x41,
                    transaction: cloneTx(this.tx),
                },
            ];
        });
    }
    async sign() {
        const signatures = [];
        // Fail before requesting any signature when a role has no adapter.
        for (const request of this.signingRequests)
            if (!this.plans[request.inputIndex].signer?.sign)
                pool3Fail(`no signer for ${request.role} input ${request.inputIndex}; use finalize`);
        for (const request of this.signingRequests) {
            const signature = await this.plans[request.inputIndex].signer.sign(request);
            signatures.push({ inputIndex: request.inputIndex, signature, publicKey: request.publicKey });
        }
        return this.finalize(signatures);
    }
    finalize(signatures) {
        const tx = cloneTx(this.tx);
        const supplied = new Map();
        for (const signature of signatures) {
            if (!Number.isInteger(signature.inputIndex) ||
                !this.publicKeys[signature.inputIndex] ||
                supplied.has(signature.inputIndex))
                pool3Fail('unexpected or duplicate signature input');
            supplied.set(signature.inputIndex, signature);
        }
        const unlocks = this.plans.map((plan, i) => {
            const expected = this.publicKeys[i];
            if (!expected)
                return tbc.Script.fromBuffer(Buffer.from(this.tx.inputs[i].script.toBuffer()));
            const suppliedSignature = supplied.get(i);
            if (!suppliedSignature)
                pool3Fail(`missing signature for input ${i}`);
            const publicKey = publicKeyBytes(suppliedSignature.publicKey);
            if (!publicKey.equals(expected))
                pool3Fail(`signature public key differs from prepared signer at input ${i}`);
            const signature = signatureBytes(suppliedSignature.signature);
            const output = tx.inputs[i].output;
            if (!tx.verifySignature(tbc.crypto.Signature.fromTxFormat(signature), tbc.PublicKey.fromBuffer(publicKey), i, output.script, output.satoshisBN, 0x10000))
                pool3Fail(`invalid transaction signature for input ${i}`);
            // All proof data was frozen during preparation. Never call a live
            // parent/ancestor resolver again while finalizing external signatures.
            const unlock = new tbc.Script();
            this.tx.inputs[i].script.chunks.forEach((chunk, index) => {
                if (index === this.signaturePositions[i])
                    unlock.add(signature);
                else if (chunk.buf)
                    unlock.add(Buffer.from(chunk.buf));
                else
                    unlock.add(chunk.opcodenum);
            });
            if (unlock.toBuffer().length > this.reservations[i])
                pool3Fail(`input ${i} exceeds its signature reservation`);
            return unlock;
        });
        unlocks.forEach((script, i) => tx.inputs[i].setScript(script));
        const txraw = tx.uncheckedSerialize();
        if (txraw.length / 2 > this.reservedBytes)
            pool3Fail('final transaction exceeds its size reservation');
        const validation = (0, poolnft3_1.validatePool3Transaction)(tx);
        if (!validation.success)
            pool3Fail(`local input validation failed: ${JSON.stringify(validation.inputs.filter((i) => !i.success))}`);
        return {
            transaction: tx,
            txraw,
            txid: tx.id,
            feeSat: this.feeSat,
            reservedBytes: this.reservedBytes,
            changeVout: this.changeVout,
            consumedOutpoints: this.consumedOutpoints.map((o) => ({ ...o })),
            validation,
        };
    }
}
exports.PreparedPool3Transaction = PreparedPool3Transaction;
