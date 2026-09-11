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
exports.POOL3_SWAP_FEE_POLICIES = void 0;
exports.resolveSwapFeePolicy = resolveSwapFeePolicy;
exports.calculateSwapFees = calculateSwapFees;
exports.deriveFeeRecipient = deriveFeeRecipient;
exports.assertPoolFeeRecipient = assertPoolFeeRecipient;
exports.buildPoolServiceFeeOutput = buildPoolServiceFeeOutput;
const tbc = __importStar(require("tbc-lib-js"));
const tape_1 = require("./tape");
const policy = (lpPlan, totalFeeBps, lpFeeBps, serviceFeeAddress) => Object.freeze({
    lpPlan,
    totalFeeBps,
    lpFeeBps,
    serviceFeeAddress,
    servicePayoutThresholdSat: 10n,
});
exports.POOL3_SWAP_FEE_POLICIES = Object.freeze({
    1: policy(1, 35, 25, '13oCEJaqyyiC8iRrfup6PDL2GKZ3xQrsZL'),
    2: policy(2, 35, 5, '1Fa6Uy64Ub4qNdB896zX2pNMx4a8zMhtCy'),
    3: policy(3, 135, 5, '125fTLNsraQxTYqT4EeQNF2ggzcqicveKL'),
    4: policy(4, 335, 5, '19DetoaaohQkjFVJ6oGXd83xhZYQSbpE1g'),
    5: policy(5, 535, 5, '15EKrhuD8Yf3SfhjAgbizYqfnBbKh9ZMZ7'),
    6: policy(6, 130, 80, '1N7rf2AuAHB2aCrVgnbQhSWhaUVk3rGhjm'),
});
function resolveSwapFeePolicy(lpPlan = 1, serviceFeeRate) {
    if (!Number.isSafeInteger(lpPlan) || lpPlan < 1 || lpPlan > 6)
        throw new Error('Pool3: lpPlan must be 1-6');
    const selected = exports.POOL3_SWAP_FEE_POLICIES[lpPlan];
    if (serviceFeeRate !== undefined && serviceFeeRate !== selected.totalFeeBps)
        throw new Error('Pool3: serviceFeeRate does not match lpPlan');
    return selected;
}
function validatePolicy(supplied) {
    if (!supplied || typeof supplied !== 'object')
        throw new Error('Pool3: Swap fee policy is required');
    const canonical = resolveSwapFeePolicy(supplied.lpPlan, supplied.totalFeeBps);
    if (supplied.lpFeeBps !== canonical.lpFeeBps ||
        supplied.serviceFeeAddress !== canonical.serviceFeeAddress ||
        supplied.servicePayoutThresholdSat !== 10n) {
        throw new Error('Pool3: unsupported or modified Swap fee policy');
    }
    return canonical;
}
/** Pool2 semantics: floor(total) - floor(LP), not floor(the difference rate). */
function calculateSwapFees(baseTbcSat, supplied) {
    (0, tape_1.assertPoolAmount)(baseTbcSat, 'Swap fee baseTbcSat');
    const selected = validatePolicy(supplied);
    const totalFeeSat = (baseTbcSat * BigInt(selected.totalFeeBps)) / 10000n;
    const lpFeeSat = (baseTbcSat * BigInt(selected.lpFeeBps)) / 10000n;
    const serviceFeeAccruedSat = totalFeeSat - lpFeeSat;
    const serviceFeePaidSat = serviceFeeAccruedSat >= selected.servicePayoutThresholdSat ? serviceFeeAccruedSat : 0n;
    const serviceFeeRetainedSat = serviceFeeAccruedSat - serviceFeePaidSat;
    return Object.freeze({
        baseTbcSat,
        totalFeeSat,
        lpFeeSat,
        serviceFeeAccruedSat,
        serviceFeePaidSat,
        serviceFeeRetainedSat,
        poolFeeRetainedSat: totalFeeSat - serviceFeePaidSat,
        netAmountSat: baseTbcSat - totalFeeSat,
    });
}
function deriveFeeRecipient(address) {
    if (typeof address !== 'string')
        throw new Error('Pool3: fee recipient must be a P2PKH address');
    const parsed = tbc.Address.fromString(address);
    if (!parsed.isPayToPublicKeyHash())
        throw new Error('Pool3: fee recipient must be P2PKH, not P2SH');
    const feePubKeyHash20 = Buffer.from(parsed.hashBuffer);
    if (feePubKeyHash20.length !== 20)
        throw new Error('Pool3: fee recipient public-key hash must be 20 bytes');
    const feeP2pkhScript25 = tbc.Script.fromBuffer(Buffer.concat([Buffer.from('76a914', 'hex'), feePubKeyHash20, Buffer.from('88ac', 'hex')]));
    return {
        address: parsed.toString(),
        feePubKeyHash20,
        feeP2pkhScript25,
        feeScriptHash32: tbc.crypto.Hash.sha256(feeP2pkhScript25.toBuffer()),
    };
}
function assertPoolFeeRecipient(scriptHash, supplied) {
    const recipient = deriveFeeRecipient(validatePolicy(supplied).serviceFeeAddress);
    if (!Buffer.isBuffer(scriptHash) ||
        scriptHash.length !== 32 ||
        !scriptHash.equals(recipient.feeScriptHash32)) {
        throw new Error("Pool3: TbcFeeScriptHash must equal SHA256 of this fee plan's full P2PKH script");
    }
    return recipient;
}
/** Zero-fee outputs remain present at the operation's fixed vout. */
function buildPoolServiceFeeOutput(fees, recipient) {
    (0, tape_1.assertPoolAmount)(fees.serviceFeePaidSat, 'serviceFeePaidSat');
    if (fees.serviceFeePaidSat > BigInt(Number.MAX_SAFE_INTEGER))
        throw new Error('Pool3: service fee cannot be represented safely in Transaction.Output');
    const expected = deriveFeeRecipient(recipient.address);
    if (!expected.feeP2pkhScript25.toBuffer().equals(recipient.feeP2pkhScript25.toBuffer()) ||
        !expected.feeScriptHash32.equals(recipient.feeScriptHash32))
        throw new Error('Pool3: inconsistent fee recipient');
    return new tbc.Transaction.Output({
        satoshis: Number(fees.serviceFeePaidSat),
        script: fees.serviceFeePaidSat === 0n ? tbc.Script.fromHex('006a') : expected.feeP2pkhScript25,
    });
}
