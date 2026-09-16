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
const tbc = __importStar(require("tbc-lib-js"));
const coinTbc20_1 = require("./coinTbc20");
const coinTbc20unlock_1 = require("../util/coinTbc20unlock");
const Legacy = require('./stableCoinLegacy');
const TBC721 = require('./tbc721');
const SIGHASH = 0x41;
const MAX_SLOT = (1n << 63n) - 1n;
const MAX_DER = Buffer.from('304502210080000000000000000000000000000000000000000000000000000000000000000220010000000000000000000000000000000000000000000000000000000000000041', 'hex');
const EMPTY_SCHNORR = Buffer.concat([Buffer.alloc(64), Buffer.from([SIGHASH])]);
const hash160 = (b) => tbc.crypto.Hash.sha256ripemd160(b);
const sha = (b) => tbc.crypto.Hash.sha256(b);
function fail(message) { throw new Error(`stableCoin: ${message}`); }
function decimal(value) {
    if (!Number.isInteger(value) || value < 0 || value > 18)
        fail('decimal must be an integer from 0 to 18');
}
function amount(value, precision) {
    decimal(precision);
    if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER))
        fail('use a decimal string for amounts outside the safe numeric range');
    const text = String(value);
    if (!/^\d+(\.\d+)?$/.test(text))
        fail('amount must be a nonnegative decimal without exponent notation');
    const [whole, fraction = ''] = text.split('.');
    if (fraction.length > precision && /[1-9]/.test(fraction.slice(precision)))
        fail('amount exceeds token precision');
    return BigInt(whole + fraction.slice(0, precision).padEnd(precision, '0'));
}
function positive(value, precision) {
    const result = amount(value, precision);
    if (result === 0n)
        fail('amount must be positive');
    return result;
}
function controller(value) {
    if (/^[a-fA-F0-9]{40}$/.test(value))
        return Buffer.concat([Buffer.from(value, 'hex'), Buffer.from([1])]);
    return Buffer.concat([tbc.Address.fromString(value).hashBuffer, Buffer.from([0])]);
}
function oldCode(code) {
    return typeof code === 'string' && [2012, 2076].includes(code.length / 2) && code.endsWith('0532436f6465');
}
function oldTape(tape) { return tape.toHex().endsWith('054654617065'); }
function resolverFor(proofs, index, count) {
    if (typeof proofs === 'function' || (proofs && !Array.isArray(proofs) && typeof proofs.get === 'function'))
        return proofs;
    if (!Array.isArray(proofs))
        return fail('ancestor transactions or a resolver are required');
    if (proofs.some(p => typeof p === 'string'))
        fail('Coin TBC20 requires ancestor transactions, not legacy FT proof strings');
    if (proofs.every(p => p instanceof tbc.Transaction))
        return proofs;
    if (proofs.length !== count)
        fail('per-input ancestor resolvers must match coin input count');
    return proofs[index];
}
function core(tx) {
    return JSON.stringify({ version: tx.version, lockTime: tx.nLockTime,
        inputs: tx.inputs.map(i => [i.prevTxId.toString('hex'), i.outputIndex, i.sequenceNumber,
            i.output?.satoshis, i.output?.script.toHex()]),
        outputs: tx.outputs.map(o => [o.satoshis, o.script.toHex()]) });
}
function sighash(tx, vin) {
    return tbc.crypto.Hash.sha256sha256(Buffer.from(tx.getPreimage(vin, SIGHASH), 'hex'));
}
function utxoFrom(tx, vout, coin = false) {
    const output = tx.outputs[vout];
    return { txId: tx.id, outputIndex: vout, script: output.script.toHex(), satoshis: output.satoshis,
        ...(coin ? { ftBalance: coinTbc20_1.CoinTBC20.parseTape(tx.outputs[vout + 1].script).balance } : {}) };
}
function certificateTape(data) {
    return new tbc.Script().add(tbc.Opcode.OP_0).add(tbc.Opcode.OP_RETURN)
        .add(Buffer.from(JSON.stringify(data), 'utf8')).add(Buffer.from('NTape'));
}
function readCertificate(parent) {
    const tape = parent.outputs[2];
    if (parent.outputs[0]?.satoshis !== 200 || parent.outputs[1]?.satoshis !== 100 || tape?.satoshis !== 0 ||
        tape.script.chunks.length !== 4 || !tape.script.isSafeDataOut() ||
        !tape.script.chunks[3].buf?.equals(Buffer.from('NTape')))
        fail('invalid issuance certificate layout');
    let data;
    try {
        data = JSON.parse(tape.script.chunks[2].buf.toString('utf8'));
    }
    catch {
        return fail('invalid issuance certificate metadata');
    }
    if (!data || typeof data.nftName !== 'string' || typeof data.nftSymbol !== 'string' ||
        typeof data.description !== 'string' || typeof data.coinTotalSupply !== 'string' ||
        !/^\d+$/.test(data.coinTotalSupply))
        fail('invalid issuance certificate metadata');
    decimal(data.coinDecimal);
    return data;
}
/** Fix the fee with maximal ECDSA placeholders before any external signature is requested. */
function fundIssuance(tx, feeKey, feeVin, seed = () => { }) {
    const inputSat = tx.inputs.reduce((sum, input) => sum + BigInt(input.output.satoshis), 0n);
    const outputSat = tx.outputs.reduce((sum, output) => sum + BigInt(output.satoshis), 0n);
    if (inputSat > BigInt(Number.MAX_SAFE_INTEGER))
        fail('native input value exceeds safe range');
    const available = Number(inputSat - outputSat);
    if (available < 104)
        fail('insufficient TBC for issuance fees and change');
    const change = new tbc.Transaction.Output({ satoshis: available - 80, script: tbc.Script.buildPublicKeyHashOut(feeKey.toAddress()) });
    tx.addOutput(change);
    tx.inputs[feeVin].setScript(new tbc.Script().add(MAX_DER).add(feeKey.publicKey.toBuffer()));
    seed();
    const feeSat = Math.max(80, Math.ceil(tx.toBuffer().length * 80 / 1000));
    if (available - feeSat < 24)
        fail('insufficient TBC for the complete issuance witness fee and change');
    change.satoshis = available - feeSat;
    tx.fee(feeSat);
    tx.seal();
    seed();
    const signature = tbc.Transaction.sighash.sign(tx, feeKey, SIGHASH, feeVin, tx.inputs[feeVin].output.script, tx.inputs[feeVin].output.satoshisBN).toTxFormat();
    tx.inputs[feeVin].setScript(new tbc.Script().add(signature).add(feeKey.publicKey.toBuffer()));
}
/** Creates Coin TBC20 by default and continues to spend initialized legacy stablecoins. */
class stableCoin extends Legacy {
    initialAmount;
    creating = false;
    constructor(config) {
        super(typeof config === 'string' ? config : '0'.repeat(64));
        if (typeof config === 'string')
            return;
        if (!config || typeof config.name !== 'string' || typeof config.symbol !== 'string')
            fail('name and symbol are required');
        decimal(config.decimal);
        const raw = positive(config.amount, config.decimal);
        if (raw > MAX_SLOT)
            fail('initial supply exceeds the Coin Tape slot limit');
        this.name = config.name;
        this.symbol = config.symbol;
        this.decimal = config.decimal;
        this.initialAmount = String(config.amount);
        this.totalSupply = 0n;
        this.contractTxid = '';
    }
    initialize(info) {
        if (this.creating)
            fail('finish the pending issuance before reinitializing');
        decimal(info.decimal);
        if (!oldCode(info.codeScript)) {
            const code = coinTbc20_1.CoinTBC20.parseCode(info.codeScript);
            coinTbc20_1.CoinTBC20.parseTape(info.tapeScript, code);
        }
        if (BigInt(info.totalSupply) < 0n)
            fail('totalSupply must be nonnegative atomic units');
        super.initialize({ ...info, totalSupply: BigInt(info.totalSupply) });
        if (info.contractTxid)
            this.contractTxid = info.contractTxid;
        this.initialAmount = undefined;
    }
    isLegacy() { return oldCode(this.codeScript); }
    buildIssuanceScripts(adminHash, recipient, issuerHash, raw) {
        if (this.isLegacy())
            return super.buildIssuanceScripts(adminHash, recipient, issuerHash, raw);
        if (raw <= 0n || raw > MAX_SLOT)
            fail('issuance amount exceeds the Coin Tape slot range');
        let tapeScript;
        if (this.codeScript) {
            const previous = coinTbc20_1.CoinTBC20.parseCode(this.codeScript);
            if (!previous.coinNftCodeHash.equals(Buffer.from(issuerHash, 'hex')) || !previous.adminPubKeyHash.equals(Buffer.from(adminHash, 'hex')))
                fail('issuance certificate or administrator differs from this coin');
            tapeScript = coinTbc20_1.CoinTBC20.setLockTime(coinTbc20_1.CoinTBC20.replaceTapeAmounts(this.tapeScript, [raw, 0n, 0n, 0n, 0n, 0n]), 0);
        }
        else {
            const metadata = new tbc.Script().add(Buffer.from([this.decimal])).add(Buffer.from(this.name, 'utf8')).add(Buffer.from(this.symbol, 'utf8')).toBuffer();
            tapeScript = coinTbc20_1.CoinTBC20.buildTape({ amounts: [raw, 0n, 0n, 0n, 0n, 0n], tapeSize: 66 + metadata.length, lockTime: 0, metadata });
        }
        return { tapeScript, codeScript: stableCoin.getCoinMintCode(adminHash, recipient, issuerHash, tapeScript.toBuffer().length) };
    }
    createCoin(admin, feeKey, recipient, fee, funding, message) {
        if (!this.initialAmount || this.codeScript || this.creating)
            fail('createCoin requires a fresh coin definition');
        if (!Buffer.isBuffer(admin) || admin.length !== 32)
            fail('administrator must be a 32-byte x-only public key');
        this.checkFee(fee, feeKey);
        this.checkParent(fee, funding);
        const raw = positive(this.initialAmount, this.decimal);
        const snapshot = this.issuanceState();
        try {
            const data = {
                nftName: this.name + ' NFT', nftSymbol: this.symbol + ' NFT',
                description: 'The issuance certificate for the stablecoin, recording cumulative supply and issuance history.',
                coinDecimal: this.decimal, coinTotalSupply: '0',
            };
            const source = stableCoin.buildCoinNftTX(feeKey, hash160(admin).toString('hex'), fee, data);
            const sourceRaw = source.uncheckedSerialize();
            const issuance = this.prepareIssuance(admin, feeKey, recipient, utxoFrom(source, 3), source, funding, raw, { ...data, coinTotalSupply: raw.toString() }, message);
            const prepared = { ...issuance, finalize: signatures => [sourceRaw, issuance.finalize(signatures)] };
            this.totalSupply = 0n;
            this.creating = true;
            return this.guardPrepared(prepared, admin, () => {
                this.totalSupply = raw;
                this.contractTxid = prepared.tx.id;
                this.creating = false;
                this.initialAmount = undefined;
            });
        }
        catch (error) {
            Object.assign(this, snapshot);
            this.creating = false;
            throw error;
        }
    }
    mintCoin(admin, feeKey, recipient, humanAmount, fee, parent, grandparent, message) {
        if (this.isLegacy())
            return super.mintCoin(admin, feeKey, recipient, humanAmount, fee, parent, grandparent, message);
        const code = coinTbc20_1.CoinTBC20.parseCode(this.codeScript);
        if (!Buffer.isBuffer(admin) || admin.length !== 32 || !hash160(admin).equals(code.adminPubKeyHash))
            fail('wrong administrator');
        if (!(parent instanceof tbc.Transaction) || !parent.outputs[0] || !sha(parent.outputs[0].script.toBuffer()).equals(code.coinNftCodeHash))
            fail('wrong issuance certificate');
        this.checkFee(fee, feeKey);
        const data = readCertificate(parent);
        const previousSupply = BigInt(data.coinTotalSupply);
        if (previousSupply < 0n || data.coinDecimal !== this.decimal)
            fail('invalid issuance certificate metadata');
        const raw = positive(humanAmount, this.decimal);
        if (raw > MAX_SLOT)
            fail('mint amount exceeds the Coin Tape slot limit');
        if (this.creating)
            fail('finish the pending issuance first');
        const snapshot = this.issuanceState();
        try {
            let prepared;
            if (TBC721.isTBC721Code(parent.outputs[0].script)) {
                prepared = this.prepareIssuance(admin, feeKey, recipient, fee, parent, grandparent, raw, { ...data, coinTotalSupply: (previousSupply + raw).toString() }, message);
            }
            else {
                // Coin TBC20 issued before this migration retains its original certificate identity.
                this.totalSupply = previousSupply;
                prepared = super.mintCoin(admin, feeKey, recipient, humanAmount, fee, parent, grandparent, message);
            }
            this.creating = true;
            return this.guardPrepared(prepared, admin, () => { this.totalSupply = previousSupply + raw; this.creating = false; });
        }
        catch (error) {
            Object.assign(this, snapshot);
            this.creating = false;
            throw error;
        }
    }
    prepareIssuance(admin, feeKey, recipient, fee, parent, grandparent, raw, data, message) {
        if (fee.txId.toLowerCase() === parent.id.toLowerCase() && [0, 1, 2].includes(fee.outputIndex))
            fail('fee input duplicates an issuance certificate output');
        const adminHash = hash160(admin).toString('hex');
        const expectedHold = TBC721.getHoldScriptFromHash(adminHash, data.nftName);
        if (!parent.outputs[1]?.script.equals(expectedHold))
            fail('wrong issuance certificate administrator or Hold script');
        const scripts = this.buildIssuanceScripts(adminHash, recipient, sha(parent.outputs[0].script.toBuffer()).toString('hex'), raw);
        const tx = new tbc.Transaction().addInputFromPrevTx(parent, 0).addInputFromPrevTx(parent, 1).from(fee);
        stableCoin.buildCoinNftOutput(parent.outputs[0].script, parent.outputs[1].script, certificateTape(data))
            .forEach((output) => tx.addOutput(output));
        tx.addOutput(new tbc.Transaction.Output({ satoshis: 500, script: scripts.codeScript }));
        tx.addOutput(new tbc.Transaction.Output({ satoshis: 0, script: scripts.tapeScript }));
        if (message)
            tx.addOutput(new tbc.Transaction.Output({ satoshis: 0,
                script: new tbc.Script().add(tbc.Opcode.OP_0).add(tbc.Opcode.OP_RETURN).add(Buffer.from(message, 'utf8')) }));
        const unlock = (signatures) => {
            tx.inputs[0].setScript(TBC721.buildUnlockScriptSchnorr(signatures[0], admin, tx, parent, grandparent, 0));
            tx.inputs[1].setScript(new tbc.Script().add(Buffer.concat([signatures[1], Buffer.from([SIGHASH])])).add(admin));
        };
        fundIssuance(tx, feeKey, 2, () => unlock([Buffer.alloc(64), Buffer.alloc(64)]));
        this.codeScript = scripts.codeScript.toHex();
        this.tapeScript = scripts.tapeScript.toHex();
        return { tx, sighashes: [0, 1].map(inputIndex => ({ inputIndex, sighash: sighash(tx, inputIndex) })),
            finalize: signatures => { unlock(signatures); return tx.uncheckedSerialize(); } };
    }
    /** Builds a new TBC721 issuance certificate; the legacy class retains coinNft. */
    static buildCoinNftTX(feeKey, adminHash, fee, data) {
        if (!/^[a-fA-F0-9]{40}$/.test(adminHash))
            fail('administrator hash must be 20 bytes');
        if (!(feeKey instanceof tbc.PrivateKey) || !fee || !Number.isSafeInteger(fee.satoshis) || fee.satoshis <= 0 ||
            fee.script !== tbc.Script.buildPublicKeyHashOut(feeKey.toAddress()).toHex())
            fail('fee UTXO must belong to the fee key');
        const outputs = stableCoin.buildCoinNftOutput(TBC721.buildCodeScript(fee.txId, fee.outputIndex), TBC721.getHoldScriptFromHash(adminHash, data.nftName), certificateTape(data));
        const tx = new tbc.Transaction().from(fee);
        outputs.forEach((output) => tx.addOutput(output));
        readCertificate(tx);
        fundIssuance(tx, feeKey, 0);
        return tx;
    }
    issuanceState() {
        return { codeScript: this.codeScript, tapeScript: this.tapeScript, totalSupply: this.totalSupply, contractTxid: this.contractTxid };
    }
    guardPrepared(prepared, publicKey, done = () => { }) {
        const expectedCore = core(prepared.tx);
        const expected = prepared.sighashes.map(item => ({ inputIndex: item.inputIndex, sighash: Buffer.from(item.sighash) }));
        const key = Buffer.from(publicKey);
        let finalized = false;
        const finish = prepared.finalize;
        return { tx: prepared.tx, sighashes: expected.map(item => ({ ...item, sighash: Buffer.from(item.sighash) })), finalize: signatures => {
                if (finalized)
                    fail('prepared transaction has already been finalized');
                if (core(prepared.tx) !== expectedCore)
                    fail('prepared transaction changed after sighashes were issued');
                if (!Array.isArray(signatures) || signatures.length !== expected.length)
                    fail(`expected ${expected.length} administrator signatures`);
                expected.forEach((entry, i) => {
                    if (!Buffer.isBuffer(signatures[i]) || signatures[i].length !== 64 ||
                        !sighash(prepared.tx, entry.inputIndex).equals(entry.sighash) ||
                        !tbc.crypto.Schnorr.verify(entry.sighash, signatures[i], key))
                        fail('invalid administrator signature or changed signing context');
                });
                const result = finish(signatures.map(sig => Buffer.from(sig)));
                if (core(prepared.tx) !== expectedCore)
                    fail('finalization changed the signed transaction');
                for (let vin = 0; vin < prepared.tx.inputs.length; vin++) {
                    const checked = prepared.tx.verifyScript(vin);
                    if (!checked.success)
                        fail(`final transaction input ${vin} failed: ${checked.error}`);
                }
                finalized = true;
                done();
                return result;
            } };
    }
    checkParent(utxo, parent) {
        const output = parent?.outputs?.[utxo.outputIndex];
        if (!(parent instanceof tbc.Transaction) || utxo.txId.toLowerCase() !== parent.id.toLowerCase() || !output ||
            output.satoshis !== utxo.satoshis || output.script.toHex() !== utxo.script.toLowerCase())
            fail('UTXO does not match its parent transaction');
    }
    checkFee(fee, key) {
        if (!(key instanceof tbc.PrivateKey) || !fee || !/^[a-fA-F0-9]{64}$/.test(fee.txId) ||
            !Number.isSafeInteger(fee.outputIndex) || fee.outputIndex < 0 || !Number.isSafeInteger(fee.satoshis) || fee.satoshis <= 0 ||
            fee.script !== tbc.Script.buildPublicKeyHashOut(key.toAddress()).toHex())
            fail('fee UTXO must be a positive P2PKH output owned by the fee key');
    }
    inputs(utxos, parents, proofs) {
        if (!Array.isArray(utxos) || !utxos.length || !Array.isArray(parents) || parents.length !== utxos.length)
            fail('coin UTXOs and parents must have matching nonzero lengths');
        const identity = coinTbc20_1.CoinTBC20.getCodeIdentity(this.codeScript);
        const seen = new Set();
        return utxos.map((utxo, i) => {
            this.checkParent(utxo, parents[i]);
            const point = `${utxo.txId.toLowerCase()}:${utxo.outputIndex}`;
            if (seen.has(point))
                fail('duplicate coin input');
            seen.add(point);
            const descriptor = coinTbc20_1.CoinTBC20.parseCode(utxo.script);
            if (!descriptor.identity.equals(identity))
                fail('coin inputs must share this coin identity');
            const tape = parents[i].outputs[utxo.outputIndex + 1]?.script;
            if (!tape || utxo.satoshis !== 500 || parents[i].outputs[utxo.outputIndex + 1].satoshis !== 0)
                fail('Coin Code/Tape values must be 500/0 satoshis');
            const parsed = coinTbc20_1.CoinTBC20.parseTape(tape, descriptor);
            if (parsed.balance <= 0n)
                fail('coin input balance must be positive');
            if (utxo.ftBalance !== undefined && BigInt(utxo.ftBalance) !== parsed.balance)
                fail('claimed ftBalance differs from authenticated Tape');
            return { utxo, parent: parents[i], ancestors: resolverFor(proofs, i, utxos.length), descriptor, tape,
                balance: parsed.balance, lockTime: parsed.lockTime };
        });
    }
    build(inputs, fee, feeKey, allocations, signer, extra) {
        if (inputs.length < 1 || inputs.length > 5)
            fail('at most five Coin inputs plus one fee input are supported');
        this.checkFee(fee, feeKey);
        if (inputs.some(i => i.utxo.txId.toLowerCase() === fee.txId.toLowerCase() && i.utxo.outputIndex === fee.outputIndex))
            fail('fee input duplicates a Coin input');
        const admin = Buffer.isBuffer(signer);
        if (admin && (signer.length !== 32 || inputs.some(i => !hash160(signer).equals(i.descriptor.adminPubKeyHash))))
            fail('wrong administrator');
        let lockTime = 0;
        if (!admin) {
            for (const input of inputs) {
                const key = signer.publicKey.toBuffer();
                if (hash160(key).equals(input.descriptor.adminPubKeyHash) || hash160(key.subarray(1)).equals(input.descriptor.adminPubKeyHash))
                    continue;
                const lock = input.lockTime;
                if (lock && lockTime && (lock < 500000000) !== (lockTime < 500000000))
                    fail('cannot combine height and timestamp locks under ordinary authorization');
                lockTime = Math.max(lockTime, lock);
            }
        }
        const tx = new tbc.Transaction();
        inputs.forEach(input => tx.addInputFromPrevTx(input.parent, input.utxo.outputIndex));
        tx.from(fee);
        inputs.forEach((_, i) => tx.setInputSequence(i, 0xfffffffe));
        tx.setLockTime(lockTime);
        const groups = [];
        for (const allocation of allocations) {
            const codeVout = tx.outputs.length;
            tx.addOutput(new tbc.Transaction.Output({ satoshis: 500, script: coinTbc20_1.CoinTBC20.replaceController(this.codeScript, allocation.controller) }));
            tx.addOutput(new tbc.Transaction.Output({ satoshis: 0, script: coinTbc20_1.CoinTBC20.setLockTime(coinTbc20_1.CoinTBC20.replaceTapeAmounts(allocation.tape, allocation.amounts), allocation.lockTime) }));
            groups.push({ codeVout, tapeVout: codeVout + 1 });
        }
        if (extra?.satoshis) {
            groups.push({ codeVout: tx.outputs.length });
            tx.to(extra.recipient, extra.satoshis);
        }
        if (extra?.data) {
            groups.push({ codeVout: tx.outputs.length });
            tx.addOutput(new tbc.Transaction.Output({ satoshis: 0, script: new tbc.Script().add(tbc.Opcode.OP_0).add(tbc.Opcode.OP_RETURN).add(extra.data) }));
        }
        const changeVout = tx.outputs.length;
        groups.push({ codeVout: changeVout });
        if (groups.length > 8)
            fail('transaction exceeds eight output groups');
        const total = tx.inputs.reduce((sum, input) => sum + BigInt(input.output.satoshis), 0n);
        const spent = tx.outputs.reduce((sum, output) => sum + BigInt(output.satoshis), 0n);
        if (total > BigInt(Number.MAX_SAFE_INTEGER))
            fail('native input value exceeds safe range');
        const available = Number(total - spent);
        if (available < 104)
            fail('insufficient TBC for fees and change');
        const change = new tbc.Transaction.Output({ satoshis: available - 80, script: tbc.Script.buildPublicKeyHashOut(feeKey.toAddress()) });
        tx.addOutput(change);
        const options = (vin) => ({ currentTx: tx, inputIndex: vin, preTx: inputs[vin].parent,
            preTxVout: inputs[vin].utxo.outputIndex, ancestorTransactions: inputs[vin].ancestors, outputGroups: groups });
        const pubkey = admin ? signer : signer.publicKey.toBuffer();
        inputs.forEach((input, vin) => {
            const compressedAdmin = hash160(pubkey).equals(input.descriptor.adminPubKeyHash);
            const useXOnly = !admin && (hash160(pubkey.subarray(1)).equals(input.descriptor.adminPubKeyHash) ||
                (!compressedAdmin && input.descriptor.controller[20] === 0 && hash160(pubkey.subarray(1)).equals(input.descriptor.controller.subarray(0, 20))));
            tx.inputs[vin].setScript((0, coinTbc20unlock_1.buildCoinTBC20UnlockScriptWithSignature)({ ...options(vin), signature: admin || useXOnly ? EMPTY_SCHNORR : MAX_DER,
                publicKey: useXOnly ? pubkey.subarray(1) : pubkey }));
        });
        const feeVin = inputs.length;
        tx.inputs[feeVin].setScript(new tbc.Script().add(MAX_DER).add(feeKey.publicKey.toBuffer()));
        const feeSat = Math.max(80, Math.ceil(tx.toBuffer().length * 80 / 1000));
        if (available - feeSat < 24)
            fail('insufficient TBC for the complete witness fee and change');
        change.satoshis = available - feeSat;
        // All output values are fixed before obtaining real signatures. No automatic change callbacks remain.
        tx.fee(feeSat);
        tx.seal();
        inputs.forEach((_, vin) => tx.inputs[vin].setScript(admin
            ? (0, coinTbc20unlock_1.buildCoinTBC20UnlockScriptWithSignature)({ ...options(vin), signature: EMPTY_SCHNORR, publicKey: signer })
            : (0, coinTbc20unlock_1.buildCoinTBC20UnlockScript)({ ...options(vin), privateKey: signer })));
        const feeSig = tbc.Transaction.sighash.sign(tx, feeKey, SIGHASH, feeVin, tx.inputs[feeVin].output.script, tx.inputs[feeVin].output.satoshisBN).toTxFormat();
        tx.inputs[feeVin].setScript(new tbc.Script().add(feeSig).add(feeKey.publicKey.toBuffer()));
        return tx;
    }
    distribute(inputs, recipients) {
        const remaining = inputs.map(input => input.balance);
        return recipients.map(recipient => {
            let wanted = recipient.amount;
            const slots = Array(6).fill(0n);
            for (let vin = 0; vin < inputs.length; vin++) {
                const take = remaining[vin] < wanted ? remaining[vin] : wanted;
                slots[vin] = take;
                remaining[vin] -= take;
                wanted -= take;
            }
            if (wanted > 0n)
                fail('insufficient Coin balance');
            return { controller: recipient.controller, amounts: slots, tape: inputs[0].tape, lockTime: 0 };
        });
    }
    send(key, recipients, utxos, fee, parents, proofs, extra) {
        const inputs = this.inputs(utxos, parents, proofs);
        const targets = recipients.map(item => ({ controller: controller(item.address), amount: positive(item.amount, this.decimal) }));
        const total = inputs.reduce((sum, input) => sum + input.balance, 0n);
        const spent = targets.reduce((sum, output) => sum + output.amount, 0n);
        if (spent > total)
            fail('insufficient Coin balance');
        const changeVout = spent < total ? targets.length * 2 : undefined;
        if (spent < total)
            targets.push({ controller: controller(key.toAddress().toString()), amount: total - spent });
        return { tx: this.build(inputs, fee, key, this.distribute(inputs, targets), key, extra), changeVout };
    }
    transfer(key, recipient, value, utxos, fee, parents, proofs, tbcAmount) {
        if (this.isLegacy())
            return super.transfer(key, recipient, value, utxos, fee, parents, proofs, tbcAmount);
        const raw = tbcAmount === undefined ? 0n : amount(tbcAmount, 6);
        if (raw > BigInt(Number.MAX_SAFE_INTEGER) || (raw > 0n && raw < 24n))
            fail('additional TBC value is outside the supported range');
        return this.send(key, [{ address: recipient, amount: value }], utxos, fee, parents, proofs, { recipient, satoshis: Number(raw) }).tx.uncheckedSerialize();
    }
    transferWithAdditionalInfo(key, recipient, value, utxos, fee, parents, proofs, data) {
        if (this.isLegacy())
            return super.transfer(key, recipient, value, utxos, fee, parents, proofs, undefined, data);
        if (!Buffer.isBuffer(data))
            fail('additionalInfo must be a Buffer');
        return this.send(key, [{ address: recipient, amount: value }], utxos, fee, parents, proofs, { data }).tx.uncheckedSerialize();
    }
    batchTransfer(key, recipients, utxos, fee, parents, proofs) {
        if (this.isLegacy())
            return super.batchTransfer(key, recipients, utxos, fee, parents, proofs);
        if (!Array.isArray(recipients) || !recipients.length)
            fail('receivers must not be empty');
        const inputs = this.inputs(utxos, parents, proofs);
        const required = recipients.reduce((sum, item) => { controller(item.address); return sum + positive(item.amount, this.decimal); }, 0n);
        if (required > inputs.reduce((sum, item) => sum + item.balance, 0n))
            fail('insufficient Coin balance for batch');
        const result = [];
        let currentUTXOs = utxos, currentParents = parents, currentProofs = proofs, currentFee = fee;
        for (let start = 0; start < recipients.length; start += 5) {
            const built = this.send(key, recipients.slice(start, start + 5), currentUTXOs, currentFee, currentParents, currentProofs);
            result.push({ txraw: built.tx.uncheckedSerialize() });
            if (start + 5 < recipients.length) {
                if (built.changeVout === undefined)
                    fail('batch has no Coin change for the next transaction');
                currentProofs = currentParents;
                currentParents = [built.tx];
                currentUTXOs = [utxoFrom(built.tx, built.changeVout, true)];
                currentFee = utxoFrom(built.tx, built.tx.outputs.length - 1);
            }
        }
        return result;
    }
    mergeCoin(key, utxos, fee, parents, proofs, localTX = []) {
        if (this.isLegacy())
            return super.mergeCoin(key, utxos, fee, parents, proofs, localTX);
        const pending = this.inputs(utxos, parents, proofs);
        if (pending.length < 2)
            return [];
        const local = new Map([...localTX, ...parents].map(tx => [tx.id, tx]));
        const result = [];
        let currentFee = fee;
        while (pending.length > 1) {
            const group = pending.splice(0, 5);
            const raw = group.reduce((sum, input) => sum + input.balance, 0n);
            const allocations = this.distribute(group, [{ controller: controller(key.toAddress().toString()), amount: raw }]);
            const tx = this.build(group, currentFee, key, allocations, key);
            result.push({ txraw: tx.uncheckedSerialize() });
            local.set(tx.id, tx);
            const coin = utxoFrom(tx, 0, true);
            pending.unshift({ utxo: coin, parent: tx, ancestors: local, descriptor: coinTbc20_1.CoinTBC20.parseCode(coin.script),
                balance: raw, tape: tx.outputs[1].script, lockTime: 0 });
            currentFee = utxoFrom(tx, tx.outputs.length - 1);
        }
        return result;
    }
    freezeCoinUTXO(admin, feeKey, lockTime, utxos, fee, parents, proofs) {
        if (this.isLegacy())
            return super.freezeCoinUTXO(admin, feeKey, lockTime, utxos, fee, parents, proofs);
        return this.changeLocks(admin, feeKey, lockTime, utxos, fee, parents, proofs);
    }
    unfreezeCoinUTXO(admin, feeKey, utxos, fee, parents, proofs) {
        if (this.isLegacy())
            return super.unfreezeCoinUTXO(admin, feeKey, utxos, fee, parents, proofs);
        return this.changeLocks(admin, feeKey, 0, utxos, fee, parents, proofs);
    }
    changeLocks(admin, feeKey, lockTime, utxos, fee, parents, proofs) {
        const inputs = this.inputs(utxos, parents, proofs);
        const groups = new Map();
        inputs.forEach((input, vin) => {
            const key = input.descriptor.controller.toString('hex');
            let allocation = groups.get(key);
            if (!allocation) {
                allocation = { controller: input.descriptor.controller, amounts: Array(6).fill(0n), tape: input.tape, lockTime };
                groups.set(key, allocation);
            }
            allocation.amounts[vin] = input.balance;
        });
        const tx = this.build(inputs, fee, feeKey, [...groups.values()], admin);
        const outputGroups = [...groups.values()].map((_, i) => ({ codeVout: i * 2, tapeVout: i * 2 + 1 }));
        outputGroups.push({ codeVout: tx.outputs.length - 1 });
        const sighashes = inputs.map((_, inputIndex) => ({ inputIndex, sighash: sighash(tx, inputIndex) }));
        return this.guardPrepared({ tx, sighashes, finalize: signatures => {
                inputs.forEach((input, inputIndex) => tx.inputs[inputIndex].setScript((0, coinTbc20unlock_1.buildCoinTBC20UnlockScriptWithSignature)({
                    currentTx: tx, inputIndex, preTx: input.parent, preTxVout: input.utxo.outputIndex, ancestorTransactions: input.ancestors,
                    outputGroups, publicKey: admin, signature: Buffer.concat([signatures[inputIndex], Buffer.from([SIGHASH])])
                })));
                return tx.uncheckedSerialize();
            } }, admin);
    }
    static getCoinMintCode(adminHash, recipient, issuerHash, tapeSize) {
        if (!/^[0-9a-fA-F]{40}$/.test(adminHash) || !/^[0-9a-fA-F]{64}$/.test(issuerHash))
            fail('invalid administrator or issuance code hash');
        return coinTbc20_1.CoinTBC20.instantiateCode({ adminPubKeyHash: Buffer.from(adminHash, 'hex'), coinNftCodeHash: Buffer.from(issuerHash, 'hex'), tapeSize, controller: controller(recipient) });
    }
    static setLockTimeInTape(tape, lockTime) {
        return oldTape(tape) ? Legacy.setLockTimeInTape(tape, lockTime) : coinTbc20_1.CoinTBC20.setLockTime(tape, lockTime);
    }
    static getLockTimeFromTape(tape) { return oldTape(tape) ? Legacy.getLockTimeFromTape(tape) : coinTbc20_1.CoinTBC20.parseTape(tape).lockTime; }
    static getAddressFromCode(code) {
        if (oldCode(code))
            return Legacy.getAddressFromCode(code);
        const data = coinTbc20_1.CoinTBC20.parseCode(code).controller;
        return { address: data.subarray(0, 20).toString('hex'), type: data[20] === 0 ? 'address' : 'contract' };
    }
    static buildFTtransferCode(code, address) {
        return oldCode(code) ? Legacy.buildFTtransferCode(code, address) : coinTbc20_1.CoinTBC20.replaceController(code, controller(address));
    }
    static buildFTtransferTape(tape, amountHex) {
        if (oldTape(tbc.Script.fromHex(tape)))
            return Legacy.buildFTtransferTape(tape, amountHex);
        if (!/^[0-9a-fA-F]{96}$/.test(amountHex))
            fail('amount data must contain six uint64 slots');
        const bytes = Buffer.from(amountHex, 'hex');
        return coinTbc20_1.CoinTBC20.replaceTapeAmounts(tape, Array.from({ length: 6 }, (_, i) => bytes.readBigUInt64LE(i * 8)));
    }
    static buildUTXO(tx, vout) {
        const output = tx.outputs[vout];
        if (!output)
            fail('Coin output index is out of range');
        const code = coinTbc20_1.CoinTBC20.parseCode(output.script);
        coinTbc20_1.CoinTBC20.parseTape(tx.outputs[vout + 1]?.script, code);
        if (output.satoshis !== 500 || tx.outputs[vout + 1].satoshis !== 0)
            fail('Coin Code/Tape values must be 500/0');
        return utxoFrom(tx, vout, true);
    }
    static getUnlockScript = coinTbc20unlock_1.buildCoinTBC20UnlockScript;
    static getUnlockScriptWithSignature = coinTbc20unlock_1.buildCoinTBC20UnlockScriptWithSignature;
    mergeFT(...args) {
        return this.mergeCoin(...args);
    }
    batchTransfer_old(key, receivers, ...args) {
        return this.batchTransfer(key, [...receivers].map(([address, value]) => ({ address, amount: value })), ...args);
    }
    // Legacy batching internals remain available only to the legacy dispatcher.
    _mergeCoin(...args) { if (this.isLegacy())
        return super._mergeCoin(...args); fail('use mergeCoin for Coin TBC20'); }
    _mergeFT(...args) { if (this.isLegacy())
        return super._mergeFT(...args); fail('use mergeCoin for Coin TBC20'); }
    mergeFT_(...args) { if (this.isLegacy())
        return super.mergeFT_(...args); fail('use mergeCoin for Coin TBC20'); }
    _batchTransfer(...args) { if (this.isLegacy())
        return super._batchTransfer(...args); fail('use batchTransfer for Coin TBC20'); }
    _batchTransfer_old(...args) { if (this.isLegacy())
        return super._batchTransfer_old(...args); fail('use batchTransfer for Coin TBC20'); }
    static getBalanceFromTape(tape) {
        return oldTape(tbc.Script.fromHex(tape)) ? Legacy.getBalanceFromTape(tape) : coinTbc20_1.CoinTBC20.parseTape(tape).balance;
    }
    MintFT(...args) { if (this.isLegacy())
        return super.MintFT(...args); fail('Coin issuance requires createCoin or mintCoin'); }
    getFTmintCode(...args) { if (this.isLegacy())
        return super.getFTmintCode(...args); fail('Coin issuance requires getCoinMintCode'); }
    transferContract(...args) { if (this.isLegacy())
        return super.transferContract(...args); fail('use getUnlockScript with an explicit contractController witness for contract-held Coin'); }
    getFTunlock(...args) { if (this.isLegacy())
        return super.getFTunlock(...args); fail('use stableCoin.getUnlockScript for the Coin TBC20 ABI'); }
    getFTunlockSwap(...args) { if (this.isLegacy())
        return super.getFTunlockSwap(...args); fail('use stableCoin.getUnlockScript with contractController'); }
    static getFTunlock(...args) { if (oldCode(args[2]?.inputs[args[5]]?.output?.script?.toHex() || ''))
        return Legacy.getFTunlock(...args); fail('use stableCoin.getUnlockScriptWithSignature for Coin TBC20'); }
    static getFTunlockSwap(...args) { if (oldCode(args[2]?.inputs[args[6]]?.output?.script?.toHex() || ''))
        return Legacy.getFTunlockSwap(...args); fail('use stableCoin.getUnlockScriptWithSignature with contractController'); }
}
module.exports = stableCoin;
