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
exports.deployHTLC = deployHTLC;
exports.withdraw = withdraw;
exports.refund = refund;
exports.fillSigDepoly = fillSigDepoly;
exports.fillSigWithdraw = fillSigWithdraw;
exports.fillSigRefund = fillSigRefund;
exports.deployHTLCWithSign = deployHTLCWithSign;
exports.withdrawWithSign = withdrawWithSign;
exports.refundWithSign = refundWithSign;
const tbc = __importStar(require("tbc-lib-js"));
const util_1 = require("../util/util");
function deployHTLC(sender, receiver, hashlock, timelock, amount, utxo) {
    if (!tbc.Address.isValid(sender) || !tbc.Address.isValid(receiver)) {
        throw new Error("Invalid sender or receiver address");
    }
    if (!(0, util_1._isValidSHA256Hash)(hashlock)) {
        throw new Error("Invalid hashlock");
    }
    if (!Number.isInteger(timelock) || timelock <= 0) {
        throw new Error("Invalid timelock");
    }
    const senderPubHash = tbc.Address.fromString(sender).hashBuffer.toString("hex");
    const receiverPubHash = tbc.Address.fromString(receiver).hashBuffer.toString("hex");
    const script = getCode(senderPubHash, receiverPubHash, hashlock, timelock);
    const amountBN = (0, util_1.parseDecimalToBigInt)(amount, 6);
    const tx = new tbc.Transaction();
    tx.from(utxo);
    tx.addOutput(new tbc.Transaction.Output({
        script: script,
        satoshis: Number(amountBN),
    }));
    tx.change(sender);
    tx.fee(80);
    const txraw = tx.uncheckedSerialize();
    return txraw;
}
function withdraw(receiver, htlcutxo) {
    if (!tbc.Address.isValid(receiver)) {
        throw new Error("Invalid receiver address");
    }
    const tx = new tbc.Transaction();
    tx.from(htlcutxo);
    tx.to(receiver, htlcutxo.satoshis - 80);
    tx.fee(80);
    const txraw = tx.uncheckedSerialize();
    return txraw;
}
function refund(sender, htlcutxo, timelock) {
    if (!tbc.Address.isValid(sender)) {
        throw new Error("Invalid sender address");
    }
    if (!Number.isInteger(timelock) || timelock <= 0) {
        throw new Error("Invalid timelock");
    }
    const tx = new tbc.Transaction();
    tx.from(htlcutxo);
    tx.to(sender, htlcutxo.satoshis - 80);
    tx.fee(80);
    tx.setInputSequence(0, 4294967294);
    tx.setLockTime(timelock);
    const txraw = tx.uncheckedSerialize();
    return txraw;
}
function fillSigDepoly(deployHTLCTxRaw, sig, publicKey) {
    if (!(0, util_1._isValidHexString)(deployHTLCTxRaw))
        throw new Error("Invalid DeployHTLCTxRaw hex string");
    if (!tbc.PublicKey.isValid(publicKey))
        throw new Error("Invalid PublicKey");
    if (!(0, util_1._isValidHexString)(sig))
        throw new Error("Invalid Signature");
    const tx = new tbc.Transaction(deployHTLCTxRaw);
    const scriptASM = `${sig} ${publicKey}`;
    tx.setInputScript({ inputIndex: 0 }, tbc.Script.fromASM(scriptASM));
    const txraw = tx.uncheckedSerialize();
    return txraw;
}
function fillSigWithdraw(withdrawTxRaw, secret, sig, publicKey) {
    if (!(0, util_1._isValidHexString)(withdrawTxRaw))
        throw new Error("Invalid WithdrawTxRaw hex string");
    if (!tbc.PublicKey.isValid(publicKey))
        throw new Error("Invalid PublicKey");
    if (!(0, util_1._isValidHexString)(sig))
        throw new Error("Invalid Signature");
    const tx = new tbc.Transaction(withdrawTxRaw);
    const scriptASM = `${sig} ${publicKey} ${secret} 1`;
    tx.setInputScript({ inputIndex: 0 }, tbc.Script.fromASM(scriptASM));
    const txraw = tx.uncheckedSerialize();
    return txraw;
}
function fillSigRefund(refundTxRaw, sig, publicKey) {
    if (!(0, util_1._isValidHexString)(refundTxRaw))
        throw new Error("Invalid RefundTxRaw hex string");
    if (!tbc.PublicKey.isValid(publicKey))
        throw new Error("Invalid PublicKey");
    if (!(0, util_1._isValidHexString)(sig))
        throw new Error("Invalid Signature");
    const tx = new tbc.Transaction(refundTxRaw);
    const scriptASM = `${sig} ${publicKey} 0`;
    tx.setInputScript({ inputIndex: 0 }, tbc.Script.fromASM(scriptASM));
    const txraw = tx.uncheckedSerialize();
    return txraw;
}
function getCode(senderPubHash, receiverPubHash, hashlock, timelock) {
    const writer = new tbc.encoding.BufferWriter();
    const timelockHex = writer.writeUInt32LE(timelock).toBuffer().toString("hex");
    const script = tbc.Script.fromASM(`OP_IF OP_SHA256 ${hashlock} OP_EQUALVERIFY OP_DUP OP_HASH160 ${receiverPubHash} OP_ELSE ${timelockHex} OP_BIN2NUM OP_2 OP_PUSH_META OP_BIN2NUM OP_2DUP OP_GREATERTHAN OP_NOTIF OP_2DUP 0065cd1d OP_GREATERTHANOREQUAL OP_IF 0065cd1d OP_GREATERTHANOREQUAL OP_VERIFY OP_LESSTHANOREQUAL OP_ELSE OP_2DROP OP_DROP OP_TRUE OP_ENDIF OP_ELSE OP_FALSE OP_ENDIF OP_VERIFY OP_6 OP_PUSH_META 24 OP_SPLIT OP_NIP OP_BIN2NUM ffffffff OP_NUMNOTEQUAL OP_VERIFY OP_DUP OP_HASH160 ${senderPubHash} OP_ENDIF OP_EQUALVERIFY OP_CHECKSIG`);
    return script;
}
function deployHTLCWithSign(sender, receiver, hashlock, timelock, amount, utxo, privateKey) {
    if (!tbc.Address.isValid(sender) || !tbc.Address.isValid(receiver)) {
        throw new Error("Invalid sender or receiver address");
    }
    if (!(0, util_1._isValidSHA256Hash)(hashlock)) {
        throw new Error("Invalid hashlock");
    }
    if (!Number.isInteger(timelock) || timelock < 0) {
        throw new Error("Invalid timelock");
    }
    const senderPubHash = tbc.Address.fromString(sender).hashBuffer.toString("hex");
    const receiverPubHash = tbc.Address.fromString(receiver).hashBuffer.toString("hex");
    const script = getCode(senderPubHash, receiverPubHash, hashlock, timelock);
    const amountBN = (0, util_1.parseDecimalToBigInt)(amount, 6);
    const tx = new tbc.Transaction();
    tx.from(utxo);
    tx.addOutput(new tbc.Transaction.Output({
        script: script,
        satoshis: Number(amountBN),
    }));
    tx.change(sender);
    tx.fee(80);
    tx.sign(privateKey);
    const txraw = tx.serialize();
    return txraw;
}
function withdrawWithSign(privateKey, receiver, htlcutxo, secret) {
    if (!tbc.Address.isValid(receiver)) {
        throw new Error("Invalid receiver address");
    }
    const tx = new tbc.Transaction();
    tx.from(htlcutxo);
    tx.to(receiver, htlcutxo.satoshis - 80);
    tx.fee(80);
    const privateKeyObj = new tbc.PrivateKey(privateKey);
    const publicKey = privateKeyObj.toPublicKey().toHex();
    const sig = tx.getSignature(0, privateKeyObj);
    const scriptASM = `${sig} ${publicKey} ${secret} OP_TRUE`;
    tx.setInputScript({ inputIndex: 0 }, tbc.Script.fromASM(scriptASM));
    const txraw = tx.uncheckedSerialize();
    return txraw;
}
function refundWithSign(sender, htlcutxo, privateKey, timelock) {
    if (!tbc.Address.isValid(sender)) {
        throw new Error("Invalid sender address");
    }
    const tx = new tbc.Transaction();
    tx.from(htlcutxo);
    tx.to(sender, htlcutxo.satoshis - 80);
    tx.fee(80);
    tx.setInputSequence(0, 4294967294);
    tx.setLockTime(timelock);
    const privateKeyObj = new tbc.PrivateKey(privateKey);
    const publicKey = privateKeyObj.toPublicKey().toHex();
    const sig = tx.getSignature(0, privateKeyObj);
    const scriptASM = `${sig} ${publicKey} OP_FALSE`;
    tx.setInputScript({ inputIndex: 0 }, tbc.Script.fromASM(scriptASM));
    console.log(tx.verify());
    const txraw = tx.uncheckedSerialize();
    return txraw;
}
