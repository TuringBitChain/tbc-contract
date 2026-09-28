"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContractToken = exports.modernCodeOffsets = void 0;
exports.tokenKind = tokenKind;
exports.isCoinCodeScript = isCoinCodeScript;
exports.getFTPartialOffset = getFTPartialOffset;
exports.getFTVersion = getFTVersion;
exports.isTokenProof = isTokenProof;
exports.fetchTokenProof = fetchTokenProof;
const tbc20_standard_1 = require("../../contract/tbc20-standard");
const tbc20_stablecoin_codec_1 = require("../tbc20-stablecoin/tbc20-stablecoin-codec");
const tbc20_stablecoin_unlock_1 = require("../tbc20-stablecoin/tbc20-stablecoin-unlock");
const tbc20_standard_unlock_1 = require("../tbc20-standard/tbc20-standard-unlock");
const ftscript_1 = require("../ft/ftscript");
const LegacyFT = require('../../contract/ft');
const API = require('../../api/api');
exports.modernCodeOffsets = new Map([
    [tbc20_standard_1.TBC20Standard.codeBytes, tbc20_standard_1.TBC20Standard.partialOffset],
    [tbc20_stablecoin_codec_1.TBC20StablecoinCodec.codeSize, tbc20_stablecoin_codec_1.TBC20StablecoinCodec.partialOffset],
]);
function tokenKind(code) {
    const bytes = Buffer.from(code, 'hex');
    if (bytes.subarray(-14).equals(Buffer.from('COINTBC20CODE2'))) {
        tbc20_stablecoin_codec_1.TBC20StablecoinCodec.parseCode(code);
        return 'tbc20-stablecoin';
    }
    if (bytes.subarray(-10).equals(Buffer.from('TBC20CODE2'))) {
        tbc20_standard_1.TBC20Standard.validateCode(code);
        return 'tbc20-standard';
    }
    return 'legacy';
}
function isCoinCodeScript(code) {
    const kind = tokenKind(code);
    return kind === 'tbc20-stablecoin' || (kind === 'legacy' && (0, ftscript_1.isCoinCodeScript)(code));
}
function getFTPartialOffset(code) {
    return tokenKind(code) === 'legacy' ? (0, ftscript_1.getFTPartialOffset)(code) : exports.modernCodeOffsets.get(code.length / 2);
}
// Only used by the legacy unlocker; modern unlockers read the complete template.
function getFTVersion(code, isCoin) {
    return tokenKind(code) === 'legacy' ? (0, ftscript_1.getFTVersion)(code, isCoin) : 4;
}
function isTokenProof(proof) {
    return typeof proof === 'string' ? /^(?:[0-9a-fA-F]{2})+$/.test(proof)
        : Array.isArray(proof) || typeof proof === 'function' ||
            (proof !== null && typeof proof?.get === 'function');
}
async function fetchTokenProof(parent, vout, network) {
    if (tokenKind(parent.outputs[vout].script.toHex()) === 'legacy')
        return API.fetchFtPrePreTxData(parent, vout, network);
    const amounts = (0, tbc20_standard_unlock_1.readTbc20StandardTapeAmounts)(parent.outputs[vout + 1].script);
    const ids = new Set();
    amounts.forEach((amount, vin) => {
        if (amount === 0n)
            return;
        if (!parent.inputs[vin])
            throw new Error('Token contract: Tape references a missing parent input');
        ids.add(parent.inputs[vin].prevTxId.toString('hex'));
    });
    return Promise.all([...ids].map(id => API.fetchTXraw(id, network)));
}
function outputGroups(tx) {
    const groups = [];
    for (let i = 0; i < tx.outputs.length; i++) {
        const next = tx.outputs[i + 1]?.script.toBuffer();
        const tape = next?.subarray(0, 3).equals(Buffer.from('006a30', 'hex')) &&
            (next.subarray(-9).equals(Buffer.from('TBC20TAPE')) || next.subarray(-5).equals(Buffer.from('FTape')));
        groups.push(tape ? { codeVout: i, tapeVout: ++i } : { codeVout: i });
    }
    return groups;
}
function attachParent(tx, vin, parent, vout) {
    const input = tx.inputs[vin], output = parent.outputs[vout];
    if (!input || !output || input.prevTxId.toString('hex') !== parent.hash || input.outputIndex !== vout)
        throw new Error('Token contract: input does not spend the supplied parent output');
    if (input.output && (!input.output.script.equals(output.script) || input.output.satoshis !== output.satoshis))
        throw new Error('Token contract: previous-output metadata differs from parent');
    input.output = output;
}
function modernUnlock(signature, publicKey, tx, parent, proof, vin, vout, contract, contractVin = 0) {
    if (typeof proof === 'string')
        throw new Error('Token contract: TBC20Standard requires ancestor transactions, not legacy proof hex');
    if (tx.inputs.length > 6)
        throw new Error('Token contract: TBC20Standard transactions must have at most six inputs to remain spendable');
    attachParent(tx, vin, parent, vout);
    if (contract)
        attachParent(tx, contractVin, contract, tx.inputs[contractVin].outputIndex);
    const build = tokenKind(parent.outputs[vout].script.toHex()) === 'tbc20-stablecoin'
        ? tbc20_stablecoin_unlock_1.buildTbc20StablecoinUnlockScriptWithSignature : tbc20_standard_unlock_1.buildTbc20StandardUnlockScriptWithSignature;
    return build({ currentTx: tx, inputIndex: vin, preTx: parent, preTxVout: vout,
        signature, publicKey, ancestorTransactions: proof, outputGroups: outputGroups(tx),
        contractController: contract ? { transaction: contract, currentInputIndex: contractVin } : undefined });
}
/** Shared contract-token dispatch, keeping the public legacy FT class unchanged. */
class ContractToken extends LegacyFT {
    constructor(id) { super(id); }
    static buildFTtransferCode(code, destination) {
        const kind = tokenKind(code);
        if (kind === 'legacy')
            return LegacyFT.buildFTtransferCode(code, destination);
        const controller = /^[0-9a-fA-F]{40}$/.test(destination)
            ? Buffer.concat([Buffer.from(destination, 'hex'), Buffer.from([1])])
            : tbc20_standard_1.TBC20Standard.addressController(destination);
        return kind === 'tbc20-stablecoin' ? tbc20_stablecoin_codec_1.TBC20StablecoinCodec.replaceController(code, controller) : tbc20_standard_1.TBC20Standard.replaceController(code, controller);
    }
    static buildFTtransferTape(tape, amounts) {
        if (!Buffer.from(tape, 'hex').subarray(-9).equals(Buffer.from('TBC20TAPE')))
            return LegacyFT.buildFTtransferTape(tape, amounts);
        if (!/^[0-9a-fA-F]{96}$/.test(amounts))
            throw new Error('Token contract: amounts must contain six uint64 slots');
        const data = Buffer.from(amounts, 'hex');
        return (0, tbc20_standard_unlock_1.replaceTbc20StandardTapeAmounts)(tape, Array.from({ length: 6 }, (_, i) => data.readBigUInt64LE(i * 8)));
    }
    static getFTunlock(sig, pub, tx, parent, proof, vin, vout, isCoin) {
        if (tokenKind(parent.outputs[vout].script.toHex()) === 'legacy') {
            if (typeof proof !== 'string')
                throw new Error('Token contract: legacy FT requires encoded proof hex');
            return LegacyFT.getFTunlock(sig, pub, tx, parent, proof, vin, vout, isCoin);
        }
        return modernUnlock(sig, pub, tx, parent, proof, vin, vout);
    }
    static getFTunlockSwap(sig, pub, tx, parent, proof, contract, vin, vout, version, isCoin, multipleContracts) {
        if (tokenKind(parent.outputs[vout].script.toHex()) === 'legacy') {
            if (typeof proof !== 'string')
                throw new Error('Token contract: legacy FT requires encoded proof hex');
            return LegacyFT.getFTunlockSwap(sig, pub, tx, parent, proof, contract, vin, vout, version, isCoin, multipleContracts);
        }
        return modernUnlock(sig, pub, tx, parent, proof, vin, vout, contract, multipleContracts ? vin - 1 : 0);
    }
    getFTunlock(key, tx, parent, proof, vin, vout, isCoin) {
        attachParent(tx, vin, parent, vout);
        return ContractToken.getFTunlock(tx.getSignature(vin, key), key.publicKey.toString(), tx, parent, proof, vin, vout, isCoin);
    }
    getFTunlockSwap(key, tx, parent, proof, contract, vin, vout, version, isCoin, multipleContracts) {
        attachParent(tx, vin, parent, vout);
        return ContractToken.getFTunlockSwap(tx.getSignature(vin, key), key.publicKey.toString(), tx, parent, proof, contract, vin, vout, version, isCoin, multipleContracts);
    }
}
exports.ContractToken = ContractToken;
