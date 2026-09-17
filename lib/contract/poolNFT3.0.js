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
exports.poolNFT3 = exports.PoolNFT3 = exports.PreparedPool3Operation = void 0;
const tbc = __importStar(require("tbc-lib-js"));
const tbc20_1 = require("./tbc20");
const ftlpTbc20_1 = require("./ftlpTbc20");
const ftlpTbc20unlock_1 = require("../util/ftlpTbc20unlock");
const tbc20unlock_1 = require("../util/tbc20unlock");
const authorization_1 = require("../util/poolnft3/authorization");
const artifacts_1 = require("../util/poolnft3/artifacts");
const tape_1 = require("../util/poolnft3/tape");
const fees_1 = require("../util/poolnft3/fees");
const math_1 = require("../util/poolnft3/math");
const witness_1 = require("../util/poolnft3/witness");
const transaction_1 = require("../util/poolnft3/transaction");
const sha = (data) => tbc.crypto.Hash.sha256(data);
const h160 = (data) => tbc.crypto.Hash.sha256ripemd160(data);
const ZERO_SLOTS = [0n, 0n, 0n, 0n, 0n, 0n];
const BURN_CONTROLLER = Buffer.from('759d6677091e973b9e9d99f19c68fbf43e3f05f900', 'hex');
const slots = (entries) => {
    const amounts = [...ZERO_SLOTS];
    for (const [index, amount] of entries) {
        (0, tape_1.assertPoolAmount)(amount, 'amount slot');
        amounts[index] = amount;
    }
    return amounts;
};
const signerAddress = (input) => tbc.PublicKey.fromBuffer((0, transaction_1.publicKeyBytes)(input.signer.publicKey)).toAddress().toString();
const ownerController = (address) => tbc20_1.TBC20.addressController(address);
const cloneTransaction = (tx) => new tbc.Transaction(tx.uncheckedSerialize());
function copyDetails(value) {
    if (Buffer.isBuffer(value))
        return Buffer.from(value);
    if (Array.isArray(value))
        return value.map((item) => copyDetails(item));
    if (value !== null && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyDetails(item)]));
    return value;
}
class PreparedPool3Operation {
    prepared;
    readState;
    layoutValue;
    quoteValue;
    constructor(prepared, layout, quote, readState) {
        this.prepared = prepared;
        this.readState = readState;
        this.layoutValue = copyDetails(layout);
        this.quoteValue = copyDetails(quote);
    }
    get layout() {
        return copyDetails(this.layoutValue);
    }
    get quote() {
        return copyDetails(this.quoteValue);
    }
    get transaction() {
        return this.prepared.transaction;
    }
    get signingRequests() {
        return this.prepared.signingRequests;
    }
    get feeSat() {
        return this.prepared.feeSat;
    }
    get changeVout() {
        return this.prepared.changeVout;
    }
    result(result) {
        return {
            ...result,
            layout: this.layout,
            quote: this.quote,
            nextState: this.readState?.(result.transaction),
        };
    }
    finalize(signatures) {
        return this.result(this.prepared.finalize(signatures));
    }
    async sign() {
        return this.result(await this.prepared.sign());
    }
}
exports.PreparedPool3Operation = PreparedPool3Operation;
/** Immutable pool configuration; each operation explicitly consumes a fresh Pool snapshot. */
class PoolNFT3 {
    ftGenesis;
    ftCode;
    ftTape;
    ftIdentity;
    config;
    feePolicy;
    feeRecipient;
    tapeSize;
    constructor(options) {
        if (!options || !(options.ftGenesisTx instanceof tbc.Transaction))
            (0, transaction_1.pool3Fail)('ftGenesisTx is required');
        this.ftGenesis = cloneTransaction(options.ftGenesisTx);
        if (this.ftGenesis.inputs.length !== 1 ||
            this.ftGenesis.outputs.length < 2 ||
            this.ftGenesis.outputs.length > 3)
            (0, transaction_1.pool3Fail)('expected canonical TBC20 genesis Code/Tape at vout 0/1');
        const root = { parentTx: this.ftGenesis, outputIndex: 0 };
        this.ftCode = (0, transaction_1.referenceOutput)(root).script;
        this.ftTape = this.ftGenesis.outputs[1].script;
        if (this.ftGenesis.outputs[0].satoshis !== 500 || this.ftGenesis.outputs[1].satoshis !== 0)
            (0, transaction_1.pool3Fail)('FT genesis Code/Tape must be 500/0 sat');
        const tape = tbc20_1.TBC20.parseTape(this.ftTape);
        this.tapeSize = tape.size;
        tbc20_1.TBC20.validateCode(this.ftCode, this.tapeSize);
        const input = this.ftGenesis.inputs[0];
        const expectedCode = tbc20_1.TBC20.instantiateCode({
            originalUTXO: { txId: input.prevTxId.toString('hex'), outputIndex: input.outputIndex },
            tapeSize: this.tapeSize,
            controller: (0, tbc20unlock_1.getTBC20Controller)(this.ftCode),
        });
        if (!expectedCode.toBuffer().equals(this.ftCode.toBuffer()))
            (0, transaction_1.pool3Fail)('FT reference is not its genesis transaction');
        if (tape.amounts[0] <= 0n || tape.amounts.slice(1).some((a) => a !== 0n))
            (0, transaction_1.pool3Fail)('invalid canonical FT genesis amounts');
        const lp = options.lp ?? { kind: 'plain' };
        if (lp.kind !== 'plain' && lp.kind !== 'timelocked')
            (0, transaction_1.pool3Fail)('unsupported LP kind');
        (0, artifacts_1.assertPoolFtTapeSize)(this.tapeSize, lp.kind === 'timelocked');
        this.feePolicy = (0, fees_1.resolveSwapFeePolicy)(options.lpPlan, options.serviceFeeRate);
        this.feeRecipient = (0, fees_1.deriveFeeRecipient)(this.feePolicy.serviceFeeAddress);
        this.config = {
            authorization: (0, authorization_1.normalizePoolAuthorization)(options.authorization ?? { kind: 'public' }),
            lp: Object.freeze({ kind: lp.kind }),
            lpPlan: this.feePolicy.lpPlan,
        };
        this.ftIdentity = (0, tbc20unlock_1.getTBC20CodeIdentity)(this.ftCode);
    }
    static fromPool(poolTx, ftGenesisTx) {
        const code = (0, artifacts_1.parsePoolCode)(poolTx.outputs[0].script);
        const tape = (0, tape_1.decodePoolTape)(poolTx.outputs[1].script.toBuffer());
        const instance = new PoolNFT3({
            ftGenesisTx,
            authorization: code.authorization,
            lp: { kind: tape.withLpLocktime ? 'timelocked' : 'plain' },
            lpPlan: tape.lpPlan,
            serviceFeeRate: tape.serviceFeeRate,
        });
        instance.readPoolState(poolTx);
        return instance;
    }
    readPoolState(poolTx) {
        const code = (0, transaction_1.referenceOutput)({ parentTx: poolTx, outputIndex: 0 });
        if (poolTx.outputs.length < 2 || poolTx.outputs[1].satoshis !== 0)
            (0, transaction_1.pool3Fail)('Pool Tape must follow Code with zero satoshis');
        const parsed = (0, artifacts_1.parsePoolCode)(code.script);
        const tape = (0, tape_1.decodePoolTape)(poolTx.outputs[1].script.toBuffer());
        if (parsed.ftTapeSize !== this.tapeSize ||
            tape.ftAContractId !== this.ftGenesis.id ||
            tape.lpPlan !== this.feePolicy.lpPlan ||
            tape.serviceFeeRate !== this.feePolicy.totalFeeBps ||
            !parsed.tbcFeeScriptHash.equals(this.feeRecipient.feeScriptHash32))
            (0, transaction_1.pool3Fail)('Pool FT identity, Tape size or fee configuration mismatch');
        if (JSON.stringify(parsed.authorization) !== JSON.stringify(this.config.authorization) ||
            tape.withSwapHashLock !== (parsed.authorization.kind === 'controller') ||
            tape.withLpHashLock !== (parsed.authorization.kind === 'controller') ||
            tape.withLpLocktime !== (this.config.lp.kind === 'timelocked'))
            (0, transaction_1.pool3Fail)('Pool flags or authorization do not match the trusted Code profile');
        if (!tape.ftAPartialHash.equals(this.ftIdentity.subarray(0, 32)) ||
            tape.ftACodeSize !== this.ftCode.toBuffer().length)
            (0, transaction_1.pool3Fail)('Pool underlying FT partial identity mismatch');
        const lp = this.makeLPCode(parsed.poolCodeHash, Buffer.alloc(21));
        const lpIdentity = ftlpTbc20_1.FTLPTBC20.getCodeIdentity(lp);
        if (!tape.ftLpPartialHash.equals(lpIdentity.subarray(0, 32)) ||
            tape.ftLpCodeSize !== lp.toBuffer().length)
            (0, transaction_1.pool3Fail)('LP identity does not bind the final Pool Code');
        const poolValue = BigInt(code.satoshis);
        if (poolValue < math_1.POOL3_CODE_DUST)
            (0, transaction_1.pool3Fail)('Pool Code is below its reserve dust');
        const encodedValue = Buffer.alloc(8);
        encodedValue.writeBigUInt64LE(poolValue);
        const snapshotHash = sha(Buffer.concat([
            Buffer.from(poolTx.id, 'hex'),
            parsed.poolCodeHash,
            encodedValue,
            poolTx.outputs[1].script.toBuffer(),
        ])).toString('hex');
        return {
            ftLpAmount: tape.ftLpAmount,
            ftAAmount: tape.ftAAmount,
            tbcAmount: tape.tbcAmount,
            poolValue,
            tape,
            poolCodeHash: parsed.poolCodeHash,
            codeScript: tbc.Script.fromBuffer(Buffer.from(code.script.toBuffer())),
            outpoint: { txId: poolTx.id, outputIndex: 0 },
            snapshotHash,
            controllerPubKeyHashes: parsed.authorization.kind === 'controller'
                ? parsed.authorization.controllerPubKeyHashes.slice()
                : [],
        };
    }
    quoteAddLP(poolTx, amount, firstFtAmountRaw) {
        const state = this.readPoolState(poolTx);
        return {
            ...(0, math_1.quoteAddLP)(state, amount, firstFtAmountRaw),
            outpoint: state.outpoint,
            snapshotHash: state.snapshotHash,
        };
    }
    quoteRemoveLP(poolTx, burnRaw) {
        const state = this.readPoolState(poolTx);
        return {
            ...(0, math_1.quoteRemoveLP)(state, burnRaw),
            outpoint: state.outpoint,
            snapshotHash: state.snapshotHash,
        };
    }
    quoteSwapFT(poolTx, inputTbcSat, minFtOutRaw = 0n) {
        const state = this.readPoolState(poolTx);
        return {
            ...(0, math_1.quoteSwapFT)(state, inputTbcSat, this.feePolicy, minFtOutRaw),
            outpoint: state.outpoint,
            snapshotHash: state.snapshotHash,
        };
    }
    quoteSwapTBC(poolTx, inputFtRaw, minTbcOutSat = 0n) {
        const state = this.readPoolState(poolTx);
        return {
            ...(0, math_1.quoteSwapTBC)(state, inputFtRaw, this.feePolicy, minTbcOutSat),
            outpoint: state.outpoint,
            snapshotHash: state.snapshotHash,
        };
    }
    makeLPCode(poolCodeHash, controller) {
        return ftlpTbc20_1.FTLPTBC20.instantiateCode({
            poolCodeHash,
            controller,
            tapeSize: this.tapeSize,
            timelocked: this.config.lp.kind === 'timelocked',
        });
    }
    makeLPTape(amounts, lockTime) {
        return ftlpTbc20_1.FTLPTBC20.buildTape({
            amounts,
            tapeSize: this.tapeSize,
            timelocked: this.config.lp.kind === 'timelocked',
            lockTime,
        });
    }
    validateFT(input, state) {
        const code = (0, transaction_1.referenceOutput)(input);
        const tapeOutput = input.parentTx.outputs[input.outputIndex + 1];
        if (code.satoshis !== 500 || !tapeOutput || tapeOutput.satoshis !== 0)
            (0, transaction_1.pool3Fail)('FT Code/Tape must be adjacent 500/0 outputs');
        tbc20_1.TBC20.validateCode(code.script, this.tapeSize);
        const tape = tbc20_1.TBC20.parseTape(tapeOutput.script);
        if (tape.size !== this.tapeSize ||
            !tape.extensionData.equals(tbc20_1.TBC20.parseTape(this.ftTape).extensionData) ||
            !(0, tbc20unlock_1.getTBC20CodeIdentity)(code.script).equals(this.ftIdentity))
            (0, transaction_1.pool3Fail)('wrong underlying FT identity or metadata');
        const controller = (0, tbc20unlock_1.getTBC20Controller)(code.script);
        if (state) {
            if (!controller.equals(Buffer.concat([h160(state.poolCodeHash), Buffer.from([1])])) ||
                tape.balance !== state.ftAAmount)
                (0, transaction_1.pool3Fail)('pool FT owner or balance does not match Pool state');
        }
        else if (controller[20] !== 0 ||
            !controller.subarray(0, 20).equals(h160((0, transaction_1.publicKeyBytes)(input.signer.publicKey)))) {
            (0, transaction_1.pool3Fail)('user FT must be owned by its supplied signer');
        }
        return { balance: tape.balance, code: code.script, tape: tapeOutput.script };
    }
    validateLP(input, state) {
        const output = (0, transaction_1.referenceOutput)(input);
        const tapeOutput = input.parentTx.outputs[input.outputIndex + 1];
        if (output.satoshis !== 500 || !tapeOutput || tapeOutput.satoshis !== 0)
            (0, transaction_1.pool3Fail)('LP Code/Tape must be adjacent 500/0 outputs');
        const code = ftlpTbc20_1.FTLPTBC20.validateCode(output.script, {
            tapeSize: this.tapeSize,
            timelocked: this.config.lp.kind === 'timelocked',
        });
        if (code.controller[20] !== 0 ||
            !code.controller.subarray(0, 20).equals(h160((0, transaction_1.publicKeyBytes)(input.signer.publicKey))))
            (0, transaction_1.pool3Fail)('LP must be owned by its supplied signer');
        if (state &&
            (!code.poolCodeHash.equals(state.poolCodeHash) ||
                !code.identity.subarray(0, 32).equals(state.tape.ftLpPartialHash)))
            (0, transaction_1.pool3Fail)('LP belongs to a different Pool');
        const tape = ftlpTbc20_1.FTLPTBC20.parseTape(tapeOutput.script, {
            timelocked: code.timelocked,
            tapeSize: this.tapeSize,
        });
        return { code, tape, codeScript: output.script };
    }
    addAsset(outputs, assets, role, family, code, tape, amounts) {
        const codeVout = outputs.length;
        outputs.push((0, transaction_1.addPool3Output)(code, 500n), (0, transaction_1.addPool3Output)(tape, 0n));
        assets.push({
            role,
            family,
            codeVout,
            tapeVout: codeVout + 1,
            amountRaw: amounts.reduce((sum, a) => sum + a, 0n),
            amountsByInput: amounts.slice(),
        });
    }
    groups(tx, assets, hasPool) {
        const paired = new Set(assets.map((a) => a.codeVout));
        if (hasPool)
            paired.add(0);
        const result = [];
        for (let i = 0; i < tx.outputs.length; i++) {
            if (paired.has(i)) {
                result.push({ codeVout: i, tapeVout: i + 1 });
                i++;
            }
            else
                result.push({ codeVout: i });
        }
        return result;
    }
    tokenPlan(input, inputIndex, family, assets, pool, poolOwned = false, sequence) {
        return {
            reference: input,
            role: poolOwned ? 'pool-ft' : family === 'ftlp' ? 'lp-owner' : 'user-ft',
            signer: input.signer,
            sequence,
            unlock: (tx, signature, publicKey) => {
                const options = {
                    currentTx: tx,
                    inputIndex,
                    preTx: input.parentTx,
                    preTxVout: input.outputIndex,
                    ancestorTransactions: input.ancestors,
                    outputGroups: this.groups(tx, assets, !!pool),
                    signature: signature,
                    publicKey: publicKey,
                    contractController: poolOwned
                        ? { transaction: pool.parentTx, currentInputIndex: 0 }
                        : undefined,
                };
                return family === 'ftlp'
                    ? (0, ftlpTbc20unlock_1.buildFTLPUnlockScriptWithSignature)(options)
                    : (0, tbc20unlock_1.buildTBC20UnlockScriptWithSignature)(options);
            },
        };
    }
    operation(options, option, quote, outputs, layout, userInput, lockTime) {
        const state = this.readPoolState(options.pool.parentTx);
        if (options.expectedSnapshotHash !== undefined &&
            options.expectedSnapshotHash !== state.snapshotHash)
            (0, transaction_1.pool3Fail)('STALE_POOL_STATE: quote snapshot differs from consumed Pool');
        this.validateFT(options.poolFT, state);
        const hashLocked = this.config.authorization.kind === 'controller';
        if (hashLocked) {
            if (!options.controllerSigner)
                (0, transaction_1.pool3Fail)('hash-locked Pool requires a Controller signer');
            (0, authorization_1.assertPoolControllerPublicKey)(this.config.authorization, (0, transaction_1.publicKeyBytes)(options.controllerSigner.publicKey));
        }
        else if (options.controllerSigner !== undefined)
            (0, transaction_1.pool3Fail)('public Pool has no Controller signature field');
        const auxiliary = option === 3
            ? [options.funding, options.poolFT]
            : [userInput, options.poolFT, options.funding];
        const plans = [
            {
                reference: { parentTx: options.pool.parentTx, outputIndex: 0 },
                role: 'pool-controller',
                signer: options.controllerSigner,
                unlock: (tx, signature, publicKey) => (0, witness_1.buildPoolUnlockScript)({
                    tx,
                    preTx: options.pool.parentTx,
                    prePreTx: options.pool.ancestorTx,
                    inputTxs: auxiliary.map((i) => i.parentTx),
                    option,
                    signature,
                    publicKey,
                }),
            },
        ];
        if (option === 3)
            plans.push((0, transaction_1.p2pkhInputPlan)(options.funding));
        else
            plans.push(this.tokenPlan(userInput, 1, option === 2 ? 'ftlp' : 'tbc20', layout.assetOutputs, options.pool, false, option === 2 && this.config.lp.kind === 'timelocked' ? 0xfffffffe : undefined));
        plans.push(this.tokenPlan(options.poolFT, 2, 'tbc20', layout.assetOutputs, options.pool, true));
        if (option !== 3)
            plans.push((0, transaction_1.p2pkhInputPlan)(options.funding));
        const prepared = new transaction_1.PreparedPool3Transaction({
            inputs: plans,
            outputs,
            changeAddress: options.changeAddress ?? signerAddress(options.funding),
            lockTime,
            feePolicy: options.feePolicy,
        });
        return new PreparedPool3Operation(prepared, layout, quote, (tx) => this.readPoolState(tx));
    }
    poolOutputs(state, quote) {
        return [
            (0, transaction_1.addPool3Output)(state.codeScript, quote.nextState.poolValue),
            (0, transaction_1.addPool3Output)(tbc.Script.fromBuffer((0, tape_1.replacePoolTapeAmounts)((0, tape_1.encodePoolTape)(state.tape), quote.nextState)), 0n),
        ];
    }
    payment(address, value) {
        ownerController(address);
        return (0, transaction_1.addPool3Output)(tbc.Script.buildPublicKeyHashOut(address), value);
    }
    serviceFeeOutput(amountSat) {
        // The contract reserves this vout even when the service fee rounds to zero.
        const script = amountSat > 0n ? this.feeRecipient.feeP2pkhScript25 : tbc.Script.fromHex('006a');
        return (0, transaction_1.addPool3Output)(script, amountSat);
    }
    /** Low-level genesis preparation: funding is the already selected mint root. */
    prepareMintPoolNFT(options) {
        const hashLocked = this.config.authorization.kind === 'controller';
        const code = (0, artifacts_1.instantiatePoolCode)({
            originalUTXO: tbc20_1.TBC20.encodeOriginalUTXO({
                txId: options.funding.parentTx.id,
                outputIndex: options.funding.outputIndex,
            }),
            tbcFeeScriptHash: this.feeRecipient.feeScriptHash32,
            ftTapeSize: this.tapeSize,
            authorization: this.config.authorization,
        });
        const poolHash = sha(code.toBuffer());
        const lp = this.makeLPCode(poolHash, Buffer.alloc(21));
        const lpIdentity = ftlpTbc20_1.FTLPTBC20.getCodeIdentity(lp);
        const tape = (0, tape_1.encodePoolTape)({
            ftLpPartialHash: lpIdentity.subarray(0, 32),
            ftLpCodeSize: lp.toBuffer().length,
            ftAPartialHash: this.ftIdentity.subarray(0, 32),
            ftACodeSize: this.ftCode.toBuffer().length,
            ftLpAmount: 0n,
            ftAAmount: 0n,
            tbcAmount: 0n,
            ftAContractId: this.ftGenesis.id,
            serviceFeeRate: this.feePolicy.totalFeeBps,
            lpPlan: this.feePolicy.lpPlan,
            withSwapHashLock: hashLocked,
            withLpLocktime: this.config.lp.kind === 'timelocked',
            withLpHashLock: hashLocked,
        });
        const outputs = [
            (0, transaction_1.addPool3Output)(code, math_1.POOL3_CODE_DUST),
            (0, transaction_1.addPool3Output)(tbc.Script.fromBuffer(tape), 0n),
        ];
        const assets = [];
        this.addAsset(outputs, assets, 'pool-ft', 'tbc20', tbc20_1.TBC20.replaceController(this.ftCode, Buffer.concat([h160(poolHash), Buffer.from([1])])), (0, tbc20unlock_1.replaceTBC20TapeAmounts)(this.ftTape, ZERO_SLOTS), ZERO_SLOTS);
        const prepared = new transaction_1.PreparedPool3Transaction({
            inputs: [(0, transaction_1.p2pkhInputPlan)(options.funding)],
            outputs,
            changeAddress: options.changeAddress ?? signerAddress(options.funding),
            feePolicy: options.feePolicy,
        });
        return new PreparedPool3Operation(prepared, { operation: 'mint', inputRoles: ['funding'], assetOutputs: assets, poolCodeVout: 0 }, undefined, (tx) => this.readPoolState(tx));
    }
    async mintPoolNFT(options) {
        // Source's only output returns funding minus its miner fee to the same signer.
        const sourcePreparation = new transaction_1.PreparedPool3Transaction({
            inputs: [(0, transaction_1.p2pkhInputPlan)(options.funding)],
            outputs: [],
            changeAddress: signerAddress(options.funding),
            feePolicy: options.feePolicy,
        });
        if (sourcePreparation.changeVout !== 0)
            (0, transaction_1.pool3Fail)('insufficient funding for mint Source');
        const source = await sourcePreparation.sign();
        const genesis = await this.prepareMintPoolNFT({
            ...options,
            funding: { parentTx: source.transaction, outputIndex: 0, signer: options.funding.signer },
        }).sign();
        return { ...genesis, source, transactions: [source.transaction, genesis.transaction] };
    }
    prepareAddLP(options) {
        const state = this.readPoolState(options.pool.parentTx);
        const quote = (0, math_1.quoteAddLP)(state, options);
        if (options.minLpOutRaw !== undefined) {
            (0, tape_1.assertPoolAmount)(options.minLpOutRaw, 'minLpOutRaw');
            if (quote.ftLpIncrementRaw < options.minLpOutRaw)
                (0, transaction_1.pool3Fail)('LP output is below minLpOutRaw');
        }
        if (options.maxFtInRaw !== undefined) {
            (0, tape_1.assertPoolAmount)(options.maxFtInRaw, 'maxFtInRaw');
            if (quote.ftAIncrementRaw > options.maxFtInRaw)
                (0, transaction_1.pool3Fail)('FT input exceeds maxFtInRaw');
        }
        if (options.maxTbcInSat !== undefined) {
            (0, tape_1.assertPoolAmount)(options.maxTbcInSat, 'maxTbcInSat');
            if (quote.tbcIncrementSat > options.maxTbcInSat)
                (0, transaction_1.pool3Fail)('TBC input exceeds maxTbcInSat');
        }
        const user = this.validateFT(options.userFT);
        const pool = this.validateFT(options.poolFT, state);
        if (user.balance < quote.ftAIncrementRaw)
            (0, transaction_1.pool3Fail)('insufficient user FT; consolidate into one input explicitly');
        const outputs = this.poolOutputs(state, quote);
        const assets = [];
        const poolSlots = slots([
            [1, quote.ftAIncrementRaw],
            [2, state.ftAAmount],
        ]);
        this.addAsset(outputs, assets, 'pool-ft', 'tbc20', pool.code, (0, tbc20unlock_1.replaceTBC20TapeAmounts)(pool.tape, poolSlots), poolSlots);
        const lpSlots = slots([[0, quote.ftLpIncrementRaw]]);
        this.addAsset(outputs, assets, 'new-lp', 'ftlp', this.makeLPCode(state.poolCodeHash, ownerController(options.lpReceiverAddress)), this.makeLPTape(lpSlots, options.lpLockTime), lpSlots);
        if (user.balance > quote.ftAIncrementRaw) {
            const change = slots([[1, user.balance - quote.ftAIncrementRaw]]);
            this.addAsset(outputs, assets, 'ft-change', 'tbc20', user.code, (0, tbc20unlock_1.replaceTBC20TapeAmounts)(user.tape, change), change);
        }
        return this.operation(options, 1, quote, outputs, {
            operation: 'addLP',
            inputRoles: ['pool-controller', 'user-ft', 'pool-ft', 'funding'],
            assetOutputs: assets,
            poolCodeVout: 0,
        }, options.userFT);
    }
    async addLP(options) {
        return this.prepareAddLP(options).sign();
    }
    prepareRemoveLP(options) {
        const state = this.readPoolState(options.pool.parentTx);
        const quote = (0, math_1.quoteRemoveLP)(state, options.burnAmountRaw);
        const lp = this.validateLP(options.userLP, state);
        const pool = this.validateFT(options.poolFT, state);
        if (lp.tape.balance < options.burnAmountRaw)
            (0, transaction_1.pool3Fail)('insufficient LP; consolidate into one input explicitly');
        if (options.minFtOutRaw !== undefined) {
            (0, tape_1.assertPoolAmount)(options.minFtOutRaw, 'minFtOutRaw');
            if (quote.ftADecrementRaw < options.minFtOutRaw)
                (0, transaction_1.pool3Fail)('FT payout is below minimum');
        }
        if (options.minTbcOutSat !== undefined) {
            (0, tape_1.assertPoolAmount)(options.minTbcOutSat, 'minTbcOutSat');
            if (quote.poolValueDecrementSat < options.minTbcOutSat)
                (0, transaction_1.pool3Fail)('TBC payout is below minimum');
        }
        const outputs = this.poolOutputs(state, quote);
        const assets = [];
        outputs.push(this.payment(options.receiverAddress, quote.poolValueDecrementSat));
        const ftOut = slots([[2, quote.ftADecrementRaw]]);
        this.addAsset(outputs, assets, 'user-ft', 'tbc20', tbc20_1.TBC20.replaceController(pool.code, ownerController(options.receiverAddress)), (0, tbc20unlock_1.replaceTBC20TapeAmounts)(pool.tape, ftOut), ftOut);
        const burn = slots([[1, options.burnAmountRaw]]);
        this.addAsset(outputs, assets, 'lp-burn', 'ftlp', ftlpTbc20_1.FTLPTBC20.replaceController(lp.codeScript, BURN_CONTROLLER), this.makeLPTape(burn, this.config.lp.kind === 'timelocked' ? 0 : undefined), burn);
        const poolChange = slots([[2, quote.nextState.ftAAmount]]);
        this.addAsset(outputs, assets, 'pool-ft', 'tbc20', pool.code, (0, tbc20unlock_1.replaceTBC20TapeAmounts)(pool.tape, poolChange), poolChange);
        if (lp.tape.balance > options.burnAmountRaw) {
            const change = slots([[1, lp.tape.balance - options.burnAmountRaw]]);
            this.addAsset(outputs, assets, 'lp-change', 'ftlp', lp.codeScript, this.makeLPTape(change, lp.code.timelocked ? lp.tape.lockTime : undefined), change);
        }
        return this.operation(options, 2, quote, outputs, {
            operation: 'removeLP',
            inputRoles: ['pool-controller', 'lp-owner', 'pool-ft', 'funding'],
            assetOutputs: assets,
            poolCodeVout: 0,
            userTbcVout: 2,
        }, options.userLP, options.lockTime ?? lp.tape.lockTime);
    }
    async removeLP(options) {
        return this.prepareRemoveLP(options).sign();
    }
    prepareSwapFT(options) {
        (0, tape_1.assertPoolAmount)(options.minFtOutRaw, 'minFtOutRaw');
        const state = this.readPoolState(options.pool.parentTx);
        const quote = (0, math_1.quoteSwapFT)(state, options.inputTbcSat, this.feePolicy, options.minFtOutRaw);
        const pool = this.validateFT(options.poolFT, state);
        const outputs = this.poolOutputs(state, quote);
        const assets = [];
        const userSlots = slots([[2, quote.ftOutRaw]]);
        this.addAsset(outputs, assets, 'user-ft', 'tbc20', tbc20_1.TBC20.replaceController(pool.code, ownerController(options.receiverAddress)), (0, tbc20unlock_1.replaceTBC20TapeAmounts)(pool.tape, userSlots), userSlots);
        outputs.push(this.serviceFeeOutput(quote.fees.serviceFeePaidSat));
        const poolSlots = slots([[2, quote.nextState.ftAAmount]]);
        this.addAsset(outputs, assets, 'pool-ft', 'tbc20', pool.code, (0, tbc20unlock_1.replaceTBC20TapeAmounts)(pool.tape, poolSlots), poolSlots);
        return this.operation(options, 3, quote, outputs, {
            operation: 'swapFT',
            inputRoles: ['pool-controller', 'funding', 'pool-ft'],
            assetOutputs: assets,
            poolCodeVout: 0,
            serviceFeeVout: 4,
        });
    }
    async swapFT(options) {
        return this.prepareSwapFT(options).sign();
    }
    prepareSwapTBC(options) {
        (0, tape_1.assertPoolAmount)(options.minTbcOutSat, 'minTbcOutSat');
        const state = this.readPoolState(options.pool.parentTx);
        const quote = (0, math_1.quoteSwapTBC)(state, options.inputFtRaw, this.feePolicy, options.minTbcOutSat);
        const user = this.validateFT(options.userFT);
        const pool = this.validateFT(options.poolFT, state);
        if (user.balance < options.inputFtRaw)
            (0, transaction_1.pool3Fail)('insufficient user FT');
        const outputs = this.poolOutputs(state, quote);
        const assets = [];
        outputs.push(this.payment(options.receiverAddress, quote.tbcOutSat));
        outputs.push(this.serviceFeeOutput(quote.fees.serviceFeePaidSat));
        const poolSlots = slots([
            [1, options.inputFtRaw],
            [2, state.ftAAmount],
        ]);
        this.addAsset(outputs, assets, 'pool-ft', 'tbc20', pool.code, (0, tbc20unlock_1.replaceTBC20TapeAmounts)(pool.tape, poolSlots), poolSlots);
        if (user.balance > options.inputFtRaw) {
            const change = slots([[1, user.balance - options.inputFtRaw]]);
            this.addAsset(outputs, assets, 'ft-change', 'tbc20', user.code, (0, tbc20unlock_1.replaceTBC20TapeAmounts)(user.tape, change), change);
        }
        return this.operation(options, 4, quote, outputs, {
            operation: 'swapTBC',
            inputRoles: ['pool-controller', 'user-ft', 'pool-ft', 'funding'],
            assetOutputs: assets,
            poolCodeVout: 0,
            serviceFeeVout: 3,
            userTbcVout: 2,
        }, options.userFT);
    }
    async swapTBC(options) {
        return this.prepareSwapTBC(options).sign();
    }
    prepareTransferLP(options) {
        return this.prepareLPTransfer(options, 'transferLP');
    }
    prepareLPTransfer(options, operation) {
        if (!Array.isArray(options.inputs) || options.inputs.length < 1 || options.inputs.length > 5)
            (0, transaction_1.pool3Fail)('LP transfer requires 1–5 LP inputs and one funding input');
        (0, tape_1.assertPoolAmount)(options.amountRaw, 'amountRaw');
        if (options.amountRaw === 0n)
            (0, transaction_1.pool3Fail)('LP transfer amount must be positive');
        const inputs = options.inputs.map((input) => this.validateLP(input));
        if (inputs.some((input) => !input.code.identity.equals(inputs[0].code.identity)))
            (0, transaction_1.pool3Fail)('LP inputs must share one Pool and template identity');
        const locks = inputs.map((i) => i.tape.lockTime);
        const requiredLock = ftlpTbc20_1.FTLPTBC20.getRequiredLockTime(locks);
        const lockTime = options.lockTime ?? requiredLock;
        const outputLockTime = this.config.lp.kind === 'timelocked' ? (options.outputLockTime ?? requiredLock) : undefined;
        if (this.config.lp.kind === 'plain' && options.outputLockTime !== undefined)
            (0, transaction_1.pool3Fail)('plain LP has no lockTime field');
        let remaining = options.amountRaw;
        const receiverSlots = [...ZERO_SLOTS];
        const changeSlots = [...ZERO_SLOTS];
        inputs.forEach((input, i) => {
            const used = input.tape.balance < remaining ? input.tape.balance : remaining;
            receiverSlots[i] = used;
            changeSlots[i] = input.tape.balance - used;
            remaining -= used;
        });
        if (remaining > 0n)
            (0, transaction_1.pool3Fail)('insufficient LP balance');
        const outputs = [];
        const assets = [];
        this.addAsset(outputs, assets, 'lp-transfer', 'ftlp', ftlpTbc20_1.FTLPTBC20.replaceController(inputs[0].codeScript, ownerController(options.receiverAddress)), this.makeLPTape(receiverSlots, outputLockTime), receiverSlots);
        if (changeSlots.some((a) => a > 0n)) {
            const ownerHashes = inputs
                .filter((_, i) => changeSlots[i] > 0n)
                .map((i) => i.code.controller.toString('hex'));
            if (!options.lpChangeAddress && new Set(ownerHashes).size > 1)
                (0, transaction_1.pool3Fail)('multiple LP change owners require an explicit lpChangeAddress');
            const changeController = options.lpChangeAddress
                ? ownerController(options.lpChangeAddress)
                : inputs[changeSlots.findIndex((a) => a > 0n)].code.controller;
            this.addAsset(outputs, assets, 'lp-change', 'ftlp', ftlpTbc20_1.FTLPTBC20.replaceController(inputs[0].codeScript, changeController), this.makeLPTape(changeSlots, this.config.lp.kind === 'timelocked' ? requiredLock : undefined), changeSlots);
        }
        const plans = options.inputs.map((input, i) => this.tokenPlan(input, i, 'ftlp', assets, undefined, false, this.config.lp.kind === 'timelocked' ? 0xfffffffe : undefined));
        plans.push((0, transaction_1.p2pkhInputPlan)(options.funding));
        const prepared = new transaction_1.PreparedPool3Transaction({
            inputs: plans,
            outputs,
            changeAddress: options.changeAddress ?? signerAddress(options.funding),
            lockTime,
            feePolicy: options.feePolicy,
        });
        return new PreparedPool3Operation(prepared, {
            operation,
            inputRoles: [...options.inputs.map(() => 'lp-owner'), 'funding'],
            assetOutputs: assets,
        }, undefined);
    }
    async transferLP(options) {
        return this.prepareTransferLP(options).sign();
    }
    prepareUnlockLP(options) {
        if (this.config.lp.kind !== 'timelocked')
            (0, transaction_1.pool3Fail)('unlockLP requires the timelocked LP template');
        const controller = ownerController(options.receiverAddress);
        const inputs = options.inputs.map((input) => this.validateLP(input));
        if (inputs.some((i) => !i.code.controller.equals(controller)))
            (0, transaction_1.pool3Fail)('unlockLP preserves ownership; use transferLP for another recipient');
        const amountRaw = inputs.reduce((sum, i) => sum + i.tape.balance, 0n);
        return this.prepareLPTransfer({ ...options, amountRaw, outputLockTime: 0 }, 'unlockLP');
    }
    async unlockLP(options) {
        return this.prepareUnlockLP(options).sign();
    }
}
exports.PoolNFT3 = PoolNFT3;
exports.poolNFT3 = PoolNFT3;
exports.default = PoolNFT3;
