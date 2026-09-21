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
exports.buildFTLPUnlockScriptWithSignature = buildFTLPUnlockScriptWithSignature;
exports.buildFTLPUnlockScript = buildFTLPUnlockScript;
const tbc = __importStar(require("tbc-lib-js"));
const ftlpTbc20_1 = require("../../contract/ftlpTbc20");
const tbc20unlock_1 = require("../tbc20/tbc20unlock");
function fail(message) {
    throw new Error(`FTLP unlock: ${message}`);
}
function bytes(value, name) {
    if (Buffer.isBuffer(value))
        return Buffer.from(value);
    if (typeof value !== 'string' || value.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(value)) {
        fail(`${name} must be a Buffer or hexadecimal string`);
    }
    return Buffer.from(value, 'hex');
}
function index(value, length, name) {
    if (!Number.isSafeInteger(value) || value < 0 || value >= length)
        fail(`${name} is out of range`);
}
function assertLinked(tx, vin, parent, vout) {
    if (!(tx instanceof tbc.Transaction) || !(parent instanceof tbc.Transaction))
        fail('current and parent transactions are required');
    index(vin, tx.inputs.length, 'inputIndex');
    index(vout, parent.outputs.length, 'preTxVout');
    const input = tx.inputs[vin];
    const output = parent.outputs[vout];
    if (input.prevTxId.toString('hex').toLowerCase() !== parent.hash.toLowerCase() ||
        input.outputIndex !== vout) {
        fail('current input does not spend the specified parent output');
    }
    if (!input.output ||
        !input.output.script.equals(output.script) ||
        input.output.satoshis !== output.satoshis) {
        fail('current input previous-output metadata does not match its authenticated parent');
    }
}
function lookup(resolver, txid) {
    if (typeof resolver === 'function')
        return resolver(txid);
    if (Array.isArray(resolver))
        return resolver.find((tx) => tx.hash.toLowerCase() === txid);
    if (resolver && typeof resolver.get === 'function') {
        return resolver.get(txid);
    }
    return fail('ancestorTransactions must be a resolver, array or map');
}
function ancestors(options, descriptor, amounts) {
    // Resolve each TXID once. The same immutable view supplies prechecks and ABI proofs.
    const resolved = new Map();
    for (let slot = 0; slot < 6; slot += 1) {
        if (amounts[slot] === 0n)
            continue;
        index(slot, options.preTx.inputs.length, 'nonzero parent Tape slot');
        const source = options.preTx.inputs[slot];
        const txid = source.prevTxId.toString('hex').toLowerCase();
        let parent = resolved.get(txid);
        if (!parent) {
            parent = lookup(options.ancestorTransactions, txid);
            if (!(parent instanceof tbc.Transaction) || parent.hash.toLowerCase() !== txid) {
                fail(`missing or mismatched LP ancestor ${txid}`);
            }
            resolved.set(txid, parent);
        }
        index(source.outputIndex, parent.outputs.length, 'LP ancestor vout');
        const code = parent.outputs[source.outputIndex].script;
        let sameIdentity = false;
        try {
            sameIdentity = ftlpTbc20_1.FTLPTBC20.getCodeIdentity(code).equals(descriptor.identity);
        }
        catch {
            /* Pool issuance is checked separately. */
        }
        if (!sameIdentity &&
            !(slot === 0 &&
                source.outputIndex === 0 &&
                tbc.crypto.Hash.sha256(code.toBuffer()).equals(descriptor.poolCodeHash))) {
            fail(`parent Tape slot ${slot} is neither the same LP identity nor its authorized Pool issuance source`);
        }
    }
    return (0, tbc20unlock_1.getTBC20PrePreTxArray)(options.preTx, options.preTxVout, resolved);
}
function controllerProof(options, descriptor, publicKey) {
    const expected = descriptor.controller.subarray(0, 20);
    if (descriptor.controller[20] === 0) {
        if (options.contractController)
            fail('contractController must be omitted for address-held LP');
        if (!tbc.crypto.Hash.sha256ripemd160(publicKey).equals(expected))
            fail('publicKey does not belong to the LP owner');
        return {
            vin: 0,
            data: {
                vlio: Buffer.alloc(0),
                txInputsHashData: Buffer.alloc(0),
                outputsFirstPart: Buffer.alloc(0),
                outputsMiddlePart: { value: Buffer.alloc(0), lockingScript: Buffer.alloc(0) },
                outputsLastPart: Buffer.alloc(0),
            },
        };
    }
    const witness = options.contractController;
    if (!witness)
        fail('contract-held LP requires an explicit controlling-contract witness');
    index(witness.currentInputIndex, options.currentTx.inputs.length, 'contract currentInputIndex');
    if (witness.currentInputIndex === options.inputIndex)
        fail('an LP input cannot be its own controlling-contract input');
    const controllingInput = options.currentTx.inputs[witness.currentInputIndex];
    assertLinked(options.currentTx, witness.currentInputIndex, witness.transaction, controllingInput.outputIndex);
    const hash = tbc.crypto.Hash.sha256(witness.transaction.outputs[controllingInput.outputIndex].script.toBuffer());
    if (!tbc.crypto.Hash.sha256ripemd160(hash).equals(expected))
        fail('controlling-contract hash does not match LP Controller');
    return {
        vin: witness.currentInputIndex,
        data: (0, tbc20unlock_1.getTBC20ContractTxData)(witness.transaction, controllingInput.outputIndex),
    };
}
function verifyOutputAllocations(options, descriptor, inputBalance) {
    const groups = (0, tbc20unlock_1.getTBC20CurrentOutputData)(options.currentTx, options.outputGroups);
    let allocated = 0n;
    for (const group of options.outputGroups) {
        const code = options.currentTx.outputs[group.codeVout];
        const codeBytes = code.script.toBuffer();
        if (codeBytes.length === descriptor.tapeSize &&
            codeBytes.subarray(-9).equals(Buffer.from('TBC20TAPE'))) {
            fail('an FT/LP Tape cannot be hidden in a Code output field');
        }
        if (group.tapeVout === undefined)
            continue;
        const tape = options.currentTx.outputs[group.tapeVout];
        if (tape.script.toBuffer().length !== descriptor.tapeSize)
            continue;
        const amount = (0, tbc20unlock_1.readTBC20TapeAmounts)(tape.script)[options.inputIndex];
        allocated += amount;
        if (amount === 0n)
            continue;
        const recipient = ftlpTbc20_1.FTLPTBC20.validateCode(code.script, {
            poolCodeHash: descriptor.poolCodeHash,
            tapeSize: descriptor.tapeSize,
            timelocked: descriptor.timelocked,
        });
        if (!recipient.identity.equals(descriptor.identity))
            fail('LP output changes its source identity');
        ftlpTbc20_1.FTLPTBC20.parseTape(tape.script, recipient);
        if (code.satoshis !== 500 || tape.satoshis !== 0)
            fail('LP output Code/Tape values must be 500/0 satoshis');
    }
    if (allocated !== inputBalance)
        fail("LP output amounts do not conserve this input's absolute vin slot");
    return groups;
}
function push(script, value) {
    if (value.length === 1 && value[0] >= 1 && value[0] <= 16)
        script.add(tbc.Opcode.smallInt(value[0]));
    else if (value.length === 1 && value[0] === 0x81)
        script.add(tbc.Opcode.OP_1NEGATE);
    else
        script.add(value);
}
function pushOutput(script, data) {
    push(script, data.value);
    push(script, data.lockingScript.suffixData);
    push(script, data.lockingScript.partialHash);
    push(script, data.lockingScript.size);
}
function pushGroup(script, data) {
    pushOutput(script, data.code);
    push(script, data.tape.value);
    push(script, data.tape.lockingScript);
}
function pushAncestor(script, data) {
    push(script, data.vlio);
    push(script, data.txInputsHashData);
    push(script, data.outputsFirstPart);
    pushOutput(script, data.outputsVerifiedData);
    push(script, data.outputsLastPart);
}
function pushParent(script, data) {
    push(script, data.vlio);
    data.inputs.forEach((input) => push(script, input));
    push(script, data.unlockingScriptHash);
    push(script, data.outputsFirstPart);
    pushGroup(script, data.outputsGotData);
    push(script, data.outputsLastPart);
}
/** Build the frozen 123-field LP ABI; does not sign, fetch, broadcast or mutate the transaction. */
function buildFTLPUnlockScriptWithSignature(options) {
    if (!options || typeof options !== 'object')
        fail('unlock options are required');
    assertLinked(options.currentTx, options.inputIndex, options.preTx, options.preTxVout);
    if (options.currentTx.inputs.length > 6 || options.inputIndex >= 6)
        fail('LP transactions support at most six total inputs');
    const descriptor = ftlpTbc20_1.FTLPTBC20.parseCode(options.preTx.outputs[options.preTxVout].script);
    const preData = (0, tbc20unlock_1.getTBC20PreTxData)(options.preTx, options.preTxVout);
    const tape = ftlpTbc20_1.FTLPTBC20.parseTape(preData.outputsGotData.tape.lockingScript, descriptor);
    ftlpTbc20_1.FTLPTBC20.verifyInputLock(options.currentTx, options.inputIndex, preData.outputsGotData.tape.lockingScript, descriptor);
    const signature = bytes(options.signature, 'signature');
    if (signature.length === 65 ||
        signature.length > 72 ||
        !tbc.crypto.Signature.isTxDER(signature)) {
        fail('signature must be a canonical DER transaction signature of at most 72 bytes');
    }
    const decoded = tbc.crypto.Signature.fromTxFormat(signature);
    if (!decoded.hasLowS() || !decoded.hasDefinedHashtype() || decoded.nhashtype !== 0x41) {
        fail('signature must be low-S and use SIGHASH_ALL | SIGHASH_FORKID (0x41)');
    }
    const publicKey = options.publicKey instanceof tbc.PublicKey
        ? options.publicKey.toBuffer()
        : bytes(options.publicKey, 'publicKey');
    if (publicKey.length !== 33)
        fail('publicKey must be a compressed 33-byte key');
    tbc.PublicKey.fromBuffer(publicKey);
    const contract = controllerProof(options, descriptor, publicKey);
    const outputs = verifyOutputAllocations(options, descriptor, tape.balance);
    const inputs = (0, tbc20unlock_1.getTBC20CurrentInputsData)(options.currentTx);
    const preceding = ancestors(options, descriptor, tape.amounts);
    const result = new tbc.Script();
    outputs.forEach((output) => pushGroup(result, output));
    push(result, inputs);
    push(result, (0, tbc20unlock_1.encodeTBC20UnsignedLE)(options.inputIndex));
    preceding.forEach((ancestor) => pushAncestor(result, ancestor));
    push(result, signature);
    push(result, publicKey);
    push(result, contract.data.vlio);
    push(result, contract.data.txInputsHashData);
    push(result, contract.data.outputsFirstPart);
    push(result, contract.data.outputsMiddlePart.value);
    push(result, contract.data.outputsMiddlePart.lockingScript);
    push(result, contract.data.outputsLastPart);
    push(result, (0, tbc20unlock_1.encodeTBC20UnsignedLE)(contract.vin));
    pushParent(result, preData);
    if (result.chunks.length !== 123)
        fail('internal LP ABI error: expected exactly 123 pushes');
    return result;
}
function buildFTLPUnlockScript(options) {
    if (!options || !(options.privateKey instanceof tbc.PrivateKey))
        fail('privateKey must be a tbc.PrivateKey');
    const signature = options.currentTx.getSignature(options.inputIndex, options.privateKey);
    if (typeof signature !== 'string')
        fail('privateKey did not produce one transaction signature');
    return buildFTLPUnlockScriptWithSignature({
        ...options,
        signature,
        publicKey: options.privateKey.toPublicKey(),
    });
}
