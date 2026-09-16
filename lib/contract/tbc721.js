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
const tbc721unlock_1 = require("../util/tbc721unlock");
const util_1 = require("../util/util");
const NFT = require('./nft');
function checkFunding(utxos, privateKey, reserved = []) {
    if (!(privateKey instanceof tbc.PrivateKey) || !Array.isArray(utxos))
        throw new Error('TBC721: a private key and funding UTXO array are required');
    const script = tbc.Script.buildPublicKeyHashOut(privateKey.toAddress()).toHex();
    const seen = new Set(reserved.map(point => point.toLowerCase()));
    for (const utxo of utxos) {
        if (!utxo || !/^[0-9a-fA-F]{64}$/.test(utxo.txId) || !Number.isInteger(utxo.outputIndex) ||
            utxo.outputIndex < 0 || utxo.outputIndex > 0xffffffff || !Number.isSafeInteger(utxo.satoshis) ||
            utxo.satoshis <= 0 || typeof utxo.script !== 'string' || utxo.script.toLowerCase() !== script)
            throw new Error('TBC721: funding UTXOs must be positive P2PKH outputs owned by the signing key');
        const point = `${utxo.txId.toLowerCase()}:${utxo.outputIndex}`;
        if (seen.has(point))
            throw new Error('TBC721: duplicate funding or NFT input');
        seen.add(point);
    }
}
function p2pkhUnlock(tx, vin, privateKey) {
    return new tbc.Script().add(signature(tx, vin, privateKey)).add(privateKey.toPublicKey().toBuffer());
}
function signature(tx, vin, privateKey) {
    const result = tx.getSignature(vin, privateKey);
    if (typeof result !== 'string')
        throw new Error('TBC721: expected a single input signature');
    return Buffer.from(result, 'hex');
}
function finish(tx, privateKey) {
    // Generic Code/Hold inputs already contain provisional callback witnesses;
    // reserve two extra bytes per input for DER length changes at final signing.
    tx.fee(Math.max(80, Math.ceil((tx.getEstimateSize() + tx.inputs.length * 2) * 80 / 1000)))
        .sign(privateKey).seal();
    const inputValue = tx.inputs.reduce((sum, input) => {
        if (!input.output)
            throw new Error('TBC721: missing input previous-output metadata');
        return sum + input.output.satoshis;
    }, 0);
    const outputValue = tx.outputs.reduce((sum, output) => sum + output.satoshis, 0);
    if (inputValue - outputValue < Math.max(80, Math.ceil(tx.toBuffer().length * 80 / 1000)))
        throw new Error('TBC721: insufficient funds for outputs and transaction fee');
    return tx.uncheckedSerialize();
}
/**
 * TBC721 keeps the established NFT metadata and Code/Hold/Tape API while using
 * the independently compiled TBC721 covenant. Existing NFT remains unchanged.
 */
class TBC721 extends NFT {
    constructor(contract_id) { super(contract_id); }
    static buildCodeScript(txid, outputIndex) {
        return (0, tbc721unlock_1.buildTBC721Code)(txid, outputIndex);
    }
    static getNftCode(txid, outputIndex) {
        return TBC721.buildCodeScript(txid, outputIndex);
    }
    static parseCode(codeScript) {
        return (0, tbc721unlock_1.parseTBC721Code)(codeScript);
    }
    static isTBC721Code(codeScript) {
        try {
            TBC721.parseCode(codeScript);
            return true;
        }
        catch {
            return false;
        }
    }
    static getNFTVersion(codeScript) {
        return TBC721.isTBC721Code(codeScript) ? 3 : -1;
    }
    static buildUnlockScript(keyOrSignature, publicKeyOrTX, currentOrPreTX, preOrPrepreTX, prepreOrIndex, currentUnlockIndex = 0) {
        if (Buffer.isBuffer(keyOrSignature)) {
            return (0, tbc721unlock_1.buildTBC721UnlockScript)(keyOrSignature, publicKeyOrTX, currentOrPreTX, preOrPrepreTX, prepreOrIndex, currentUnlockIndex);
        }
        const tx = publicKeyOrTX;
        const index = typeof prepreOrIndex === 'number' ? prepreOrIndex : 0;
        return (0, tbc721unlock_1.buildTBC721UnlockScript)(signature(tx, index, keyOrSignature), keyOrSignature.toPublicKey().toBuffer(), tx, currentOrPreTX, preOrPrepreTX, index);
    }
    static buildUnlockScriptSchnorr(schnorrSig64, xOnlyPubkey32, currentTX, preTX, prepreTX, currentUnlockIndex = 0) {
        if (!Buffer.isBuffer(schnorrSig64) || schnorrSig64.length !== 64)
            throw new Error('TBC721: Schnorr signature must contain 64 bytes');
        if (!Buffer.isBuffer(xOnlyPubkey32) || xOnlyPubkey32.length !== 32)
            throw new Error('TBC721: x-only public key must contain 32 bytes');
        return (0, tbc721unlock_1.buildTBC721UnlockScript)(Buffer.concat([schnorrSig64, Buffer.from([0x41])]), xOnlyPubkey32, currentTX, preTX, prepreTX, currentUnlockIndex);
    }
    static getHoldScriptFromHash(pubKeyHashHex, flag) {
        if (!/^[0-9a-fA-F]{40}$/.test(pubKeyHashHex))
            throw new Error('TBC721: Hold hash must contain 20 bytes');
        return new tbc.Script().add(tbc.Opcode.OP_DUP).add(tbc.Opcode.OP_HASH160)
            .add(Buffer.from(pubKeyHashHex, 'hex')).add(tbc.Opcode.OP_EQUALVERIFY).add(tbc.Opcode.OP_CHECKSIG)
            .add(tbc.Opcode.OP_RETURN).add(Buffer.from(`For Coin ${flag} NHold`, 'utf8'));
    }
    static createCollection(address, privateKey, data, utxos) {
        checkFunding(utxos, privateKey);
        if (!Number.isSafeInteger(data.supply) || data.supply <= 0)
            throw new Error('TBC721: collection supply must be a positive safe integer');
        const tx = new tbc.Transaction().from(utxos);
        tx.version = 10;
        tx.addOutput(new tbc.Transaction.Output({ script: TBC721.buildTapeScript(data), satoshis: 0 }));
        for (let index = 0; index < data.supply; index++)
            tx.addOutput(new tbc.Transaction.Output({ script: TBC721.buildMintScript(address), satoshis: 100 }));
        return finish(tx.change(address), privateKey);
    }
    static createNFT(collection_id, address, privateKey, data, utxos, nfttxo) {
        checkFunding(utxos, privateKey, [`${nfttxo.txId}:${nfttxo.outputIndex}`]);
        if (collection_id.toLowerCase() !== nfttxo.txId.toLowerCase())
            throw new Error('TBC721: mint slot must belong to the supplied collection');
        if (nfttxo.satoshis !== 100 || nfttxo.script.toLowerCase() !== TBC721.buildMintScript(privateKey.toAddress().toString()).toHex())
            throw new Error('TBC721: mint slot must be a 100-satoshi Mint NHold output owned by the signing key');
        const outputIndex = Buffer.alloc(4);
        outputIndex.writeUInt32LE(nfttxo.outputIndex);
        const metadata = { ...data, file: data.file || collection_id + outputIndex.toString('hex') };
        const tx = new tbc.Transaction().from(nfttxo).from(utxos);
        tx.version = 10;
        tx.addOutput(new tbc.Transaction.Output({ script: TBC721.buildCodeScript(nfttxo.txId, nfttxo.outputIndex), satoshis: 200 }))
            .addOutput(new tbc.Transaction.Output({ script: TBC721.buildHoldScript(address), satoshis: 100 }))
            .addOutput(new tbc.Transaction.Output({ script: TBC721.buildTapeScript(metadata), satoshis: 0 }))
            .change(address)
            .setInputScript({ inputIndex: 0, privateKey }, currentTX => p2pkhUnlock(currentTX, 0, privateKey));
        return finish(tx, privateKey);
    }
    static batchCreateNFT(collection_id, address, privateKey, datas, utxos, nfttxos) {
        if (datas.length !== nfttxos.length)
            throw new Error('TBC721: NFT metadata and mint slot counts must match');
        if (new Set(nfttxos.map(slot => `${slot.txId.toLowerCase()}:${slot.outputIndex}`)).size !== nfttxos.length)
            throw new Error('TBC721: duplicate NFT mint slot');
        const results = [];
        let funding = utxos;
        for (let index = 0; index < datas.length; index++) {
            const txraw = TBC721.createNFT(collection_id, address, privateKey, datas[index], funding, nfttxos[index]);
            results.push({ txraw });
            if (index + 1 < datas.length) {
                const tx = new tbc.Transaction(txraw);
                if (tx.outputs.length !== 4)
                    throw new Error('TBC721: insufficient change to continue batch minting');
                funding = [{ txId: tx.id, outputIndex: 3, script: tx.outputs[3].script.toHex(), satoshis: tx.outputs[3].satoshis }];
            }
        }
        return results;
    }
    transfer(address_from, address_to, privateKey, utxos, preTX, prepreTX, batch, payment) {
        checkFunding(utxos, privateKey, [`${preTX.id}:0`, `${preTX.id}:1`]);
        TBC721.parseCode(preTX.outputs[0]?.script);
        if (preTX.outputs.length < 3 || preTX.outputs[0].satoshis !== 200 || preTX.outputs[1].satoshis !== 100 ||
            preTX.outputs[2].satoshis !== 0 || !preTX.outputs[2].script.toHex().startsWith('006a') ||
            !preTX.outputs[2].script.toHex().endsWith('054e54617065') ||
            !preTX.outputs[1].script.equals(TBC721.buildHoldScript(privateKey.toAddress().toString())))
            throw new Error('TBC721: expected canonical Code/Hold/Tape outputs');
        const tx = new tbc.Transaction().addInputFromPrevTx(preTX, 0).addInputFromPrevTx(preTX, 1).from(utxos);
        tx.version = 10;
        tx.addOutput(new tbc.Transaction.Output({ script: preTX.outputs[0].script, satoshis: 200 }))
            .addOutput(new tbc.Transaction.Output({ script: TBC721.buildHoldScript(address_to), satoshis: 100 }))
            .addOutput(new tbc.Transaction.Output({ script: preTX.outputs[2].script, satoshis: 0 }));
        if (payment)
            tx.addOutput(new tbc.Transaction.Output({
                script: tbc.Script.buildPublicKeyHashOut(payment.address), satoshis: payment.satoshis,
            }));
        if (!batch)
            tx.change(address_from);
        tx.setInputScript({ inputIndex: 0, privateKey }, currentTX => TBC721.buildUnlockScript(privateKey, currentTX, preTX, prepreTX))
            .setInputScript({ inputIndex: 1, privateKey }, currentTX => p2pkhUnlock(currentTX, 1, privateKey));
        return finish(tx, privateKey);
    }
    transferNFT(address_from, address_to, privateKey, utxos, preTX, prepreTX, batch = false) {
        return this.transfer(address_from, address_to, privateKey, utxos, preTX, prepreTX, batch);
    }
    transferNFTWithTBC(address_from, address_to_nft, address_to_tbc, privateKey, utxos, preTX, prepreTX, tbc_amount) {
        const text = String(tbc_amount);
        if (!/^\d+(\.\d+)?$/.test(text) || /[1-9]/.test((text.split('.')[1] || '').slice(6)))
            throw new Error('TBC721: TBC payment must be a nonnegative decimal with at most six significant decimal places');
        const satoshis = Number((0, util_1.parseDecimalToBigInt)(tbc_amount, 6));
        if (!Number.isSafeInteger(satoshis) || satoshis < 24)
            throw new Error('TBC721: TBC payment must be at least 24 satoshis and within the safe integer range');
        return this.transfer(address_from, address_to_nft, privateKey, utxos, preTX, prepreTX, false, { address: address_to_tbc, satoshis });
    }
    // Version-specific legacy entry points must never silently mint or transfer a
    // different covenant through the new class. NFT exposes the original paths.
    static buildCodeScript_v0() { throw new Error('Use NFT for legacy version 0 scripts'); }
    static buildCodeScript_v1() { throw new Error('Use NFT for legacy version 1 scripts'); }
    transferNFT_v0() { throw new Error('Use NFT for legacy version 0 transfers'); }
    transferNFT_v1() { throw new Error('Use NFT for legacy version 1 transfers'); }
    transferNFTWithTBC_v1() { throw new Error('Use NFT for legacy version 1 transfers'); }
}
module.exports = TBC721;
