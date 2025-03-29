"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var tbc = require("tbc-lib-js");
var FT = require("./ft");
var MultiSig = /** @class */ (function () {
    function MultiSig() {
    }
    /**
     * Create a multi-signature transaction
     * @param address_from The address from which the transaction is sent
     * @param pubKeys An array of public keys involved in the multi-signature
     * @param signatureCount The number of signatures required to authorize the transaction
     * @param publicKeyCount The total number of public keys in the multi-signature
     * @param amount_tbc The amount to be sent in TBC
     * @param utxos An array of unspent transaction outputs to be used as inputs
     * @param privateKey The private key used to sign the transaction
     * @returns The raw serialized transaction string
     */
    MultiSig.createMultiSigWallet = function (address_from, pubKeys, signatureCount, publicKeyCount, utxos, privateKey) {
        var address = MultiSig.getMultiSigAddress(pubKeys, signatureCount, publicKeyCount);
        var script_asm = MultiSig.getMultiSigLockScript(address);
        var tx = new tbc.Transaction();
        tx.from(utxos);
        tx.addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromASM(script_asm),
            satoshis: 5000,
        }));
        for (var i = 0; i < publicKeyCount; i++) {
            tx.addOutput(new tbc.Transaction.Output({
                script: MultiSig.buildHoldScript(pubKeys[i]),
                satoshis: 200,
            }));
        }
        tx.addOutput(new tbc.Transaction.Output({
            script: MultiSig.buildTapeScript(address, pubKeys),
            satoshis: 0,
        })).change(address_from);
        var txSize = tx.getEstimateSize();
        if (txSize < 1000) {
            tx.fee(80);
        }
        else {
            tx.feePerKb(100);
        }
        tx.sign(privateKey).seal();
        var raw = tx.uncheckedSerialize();
        return raw;
    };
    /**
     * Create a P2PKH to multi-signature transaction
     * @param address_from The address from which the transaction is sent
     * @param address_to The address to which the transaction is sent
     * @param amount_tbc The amount to be sent in TBC
     * @param utxos An array of unspent transaction outputs to be used as inputs
     * @param privateKey The private key used to sign the transaction
     * @returns The raw serialized transaction string
     */
    MultiSig.p2pkhToMultiSig_sendTBC = function (address_from, address_to, amount_tbc, utxos, privateKey) {
        var script_asm = MultiSig.getMultiSigLockScript(address_to);
        var amount_satoshis = Math.floor(amount_tbc * Math.pow(10, 6));
        var tx = new tbc.Transaction()
            .from(utxos)
            .addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromASM(script_asm),
            satoshis: amount_satoshis,
        }))
            .change(address_from);
        var txSize = tx.getEstimateSize();
        if (txSize < 1000) {
            tx.fee(80);
        }
        else {
            tx.feePerKb(100);
        }
        tx.sign(privateKey).seal();
        var raw = tx.uncheckedSerialize();
        return raw;
    };
    /**
     * Build a multi-signature transaction
     * @param address_from The address from which the transaction is sent
     * @param address_to The address to which the transaction is sent
     * @param amount_tbc The amount to be sent in TBC
     * @param utxos An array of unspent transaction outputs to be used as inputs
     * @returns The raw serialized transaction string
     */
    MultiSig.buildMultiSigTransaction_sendTBC = function (address_from, address_to, amount_tbc, utxos) {
        var script_asm_from = MultiSig.getMultiSigLockScript(address_from);
        var amount_satoshis = Math.floor(amount_tbc * Math.pow(10, 6));
        var count = 0;
        var amounts = [];
        for (var i = 0; i < utxos.length; i++) {
            count += utxos[i].satoshis;
            amounts.push(utxos[i].satoshis);
        }
        var tx = new tbc.Transaction().from(utxos).fee(300);
        if (address_to.startsWith("1")) {
            tx.to(address_to, amount_satoshis).addOutput(new tbc.Transaction.Output({
                script: tbc.Script.fromASM(script_asm_from),
                satoshis: count - amount_satoshis - 300,
            }));
        }
        else {
            var script_asm_to = MultiSig.getMultiSigLockScript(address_to);
            tx.addOutput(new tbc.Transaction.Output({
                script: tbc.Script.fromASM(script_asm_to),
                satoshis: amount_satoshis,
            })).addOutput(new tbc.Transaction.Output({
                script: tbc.Script.fromASM(script_asm_to),
                satoshis: count - amount_satoshis - 300,
            }));
        }
        var txraw = tx.uncheckedSerialize();
        return { txraw: txraw, amounts: amounts };
    };
    /**
     * Sign a multi-signature transaction
     * @param address_from The address from which the transaction is sent
     * @param multiSigTxraw The raw serialized transaction string
     * @param privateKey The private key used to sign the transaction
     * @returns An array of signatures
     */
    MultiSig.signMultiSigTransaction_sendTBC = function (address_from, multiSigTxraw, privateKey) {
        var script_asm = MultiSig.getMultiSigLockScript(address_from);
        var txraw = multiSigTxraw.txraw, amounts = multiSigTxraw.amounts;
        var tx = new tbc.Transaction(txraw);
        for (var i = 0; i < amounts.length; i++) {
            tx.inputs[i].output = new tbc.Transaction.Output({
                script: tbc.Script.fromASM(script_asm),
                satoshis: amounts[i],
            });
        }
        var sigs = [];
        for (var i = 0; i < amounts.length; i++) {
            sigs[i] = tx.getSignature(i, privateKey);
        }
        return sigs;
    };
    /**
     * Create a multi-signature transaction from a raw transaction string
     * @param txraw The raw serialized transaction string
     * @param sigs An array of signatures
     * @param pubkeys An array of public keys
     * @returns The raw serialized transaction string
     */
    MultiSig.finishMultiSigTransaction_sendTBC = function (txraw, sigs, pubKeys) {
        var multiPubKeys = "";
        for (var i = 0; i < pubKeys.length; i++) {
            multiPubKeys = multiPubKeys + pubKeys[i];
        }
        var tx = new tbc.Transaction(txraw);
        var _loop_1 = function (j) {
            tx.setInputScript({
                inputIndex: j,
            }, function (tx) {
                var signature = "";
                for (var i = 0; i < sigs[j].length; i++) {
                    if (i < sigs[j].length - 1) {
                        signature = signature + sigs[j][i] + " ";
                    }
                    else {
                        signature = signature + sigs[j][i];
                    }
                }
                var unlockingScript = tbc.Script.fromASM("OP_0 ".concat(signature, " ").concat(multiPubKeys));
                return unlockingScript;
            });
        };
        for (var j = 0; j < sigs.length; j++) {
            _loop_1(j);
        }
        return tx.uncheckedSerialize();
    };
    /**
     * Transfer FT from a multi-signature address to another address
     * @param address_from The address from which the transaction is sent
     * @param address_to The address to which the transaction is sent
     * @param ft The FT contract
     * @param ft_amount The amount to be sent in FT
     * @param utxo The UTXO to be used as input
     * @param ftutxos An array of UTXOs to be used as inputs
     * @param preTX An array of previous transactions
     * @param prepreTxData An array of previous transaction data
     * @param privateKey The private key used to sign the transaction
     * @returns The raw serialized transaction string
     */
    MultiSig.p2pkhToMultiSig_transferFT = function (address_from, address_to, ft, ft_amount, utxo, ftutxos, preTXs, prepreTxDatas, privateKey, tbc_amount) {
        var code = ft.codeScript;
        var tape = ft.tapeScript;
        var decimal = ft.decimal;
        var tapeAmountSetIn = [];
        if (ft_amount < 0) {
            throw new Error("Invalid amount");
        }
        var amountbn = BigInt(Math.floor(ft_amount * Math.pow(10, decimal)));
        var tapeAmountSum = BigInt(0);
        for (var i = 0; i < ftutxos.length; i++) {
            tapeAmountSetIn.push(ftutxos[i].ftBalance);
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
        }
        if (amountbn > tapeAmountSum) {
            throw new Error("Insufficient balance, please add more FT UTXOs");
        }
        if (decimal > 18) {
            throw new Error("The maximum value for decimal cannot exceed 18");
        }
        var maxAmount = Math.floor(Math.pow(10, 18 - decimal));
        if (ft_amount > maxAmount) {
            throw new Error("When decimal is ".concat(decimal, ", the maximum amount cannot exceed ").concat(maxAmount));
        }
        var _a = FT.buildTapeAmount(amountbn, tapeAmountSetIn), amountHex = _a.amountHex, changeHex = _a.changeHex;
        var script_asm = MultiSig.getMultiSigLockScript(address_to);
        var tx = new tbc.Transaction().from(ftutxos).from(utxo);
        var hash = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(tbc.Script.fromASM(script_asm).toBuffer())).toString("hex");
        var codeScript = FT.buildFTtransferCode(code, hash);
        tx.addOutput(new tbc.Transaction.Output({
            script: codeScript,
            satoshis: 2000,
        }));
        var tapeScript = FT.buildFTtransferTape(tape, amountHex);
        tx.addOutput(new tbc.Transaction.Output({
            script: tapeScript,
            satoshis: 0,
        }));
        if (amountbn < tapeAmountSum) {
            var changeCodeScript = FT.buildFTtransferCode(code, address_from);
            tx.addOutput(new tbc.Transaction.Output({
                script: changeCodeScript,
                satoshis: 2000,
            }));
            var changeTapeScript = FT.buildFTtransferTape(tape, changeHex);
            tx.addOutput(new tbc.Transaction.Output({
                script: changeTapeScript,
                satoshis: 0,
            }));
        }
        if (tbc_amount) {
            var amount_satoshis = Math.floor(tbc_amount * Math.pow(10, 6));
            tx.addOutput(new tbc.Transaction.Output({
                script: tbc.Script.fromASM(script_asm),
                satoshis: amount_satoshis,
            }));
        }
        tx.change(address_from);
        var txSize = tx.getEstimateSize();
        if (txSize < 1000) {
            tx.fee(80);
        }
        else {
            tx.feePerKb(100);
        }
        var _loop_2 = function (i) {
            tx.setInputScript({
                inputIndex: i,
            }, function (tx) {
                var unlockingScript = ft.getFTunlock(privateKey, tx, preTXs[i], prepreTxDatas[i], i, ftutxos[i].outputIndex);
                return unlockingScript;
            });
        };
        for (var i = 0; i < ftutxos.length; i++) {
            _loop_2(i);
        }
        tx.sign(privateKey).seal();
        return tx.uncheckedSerialize();
    };
    /**
     * Build a multi-signature transaction for transferring FT
     * @param address_from The address from which the transaction is sent
     * @param address_to The address to which the transaction is sent
     * @param ft The FT contract
     * @param ft_amount The amount to be sent in FT
     * @param utxo The UTXO to be used as input
     * @param ftutxos An array of UTXOs to be used as inputs
     * @param preTX An array of previous transactions
     * @param prepreTxData An array of previous transaction data
     * @param privateKey The private key used to sign the transaction
     * @returns The raw serialized transaction string
     */
    MultiSig.buildMultiSigTransaction_transferFT = function (address_from, address_to, ft, ft_amount, utxo, ftutxos, preTXs, prepreTxDatas, contractTX, privateKey, tbc_amount) {
        var code = ft.codeScript;
        var tape = ft.tapeScript;
        var decimal = ft.decimal;
        var tapeAmountSetIn = [];
        if (ft_amount < 0) {
            throw new Error("Invalid amount");
        }
        var script_asm_from = MultiSig.getMultiSigLockScript(address_from);
        var script_asm_to = MultiSig.getMultiSigLockScript(address_to);
        var hash_from = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(tbc.Script.fromASM(script_asm_from).toBuffer())).toString("hex");
        var amountbn = BigInt(Math.floor(ft_amount * Math.pow(10, decimal)));
        var tapeAmountSum = BigInt(0);
        for (var i = 0; i < ftutxos.length; i++) {
            tapeAmountSetIn.push(ftutxos[i].ftBalance);
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
        }
        if (amountbn > tapeAmountSum) {
            throw new Error("Insufficient balance, please add more FT UTXOs");
        }
        if (decimal > 18) {
            throw new Error("The maximum value for decimal cannot exceed 18");
        }
        var maxAmount = Math.floor(Math.pow(10, 18 - decimal));
        if (ft_amount > maxAmount) {
            throw new Error("When decimal is ".concat(decimal, ", the maximum amount cannot exceed ").concat(maxAmount));
        }
        var _a = FT.buildTapeAmount(amountbn, tapeAmountSetIn, 1), amountHex = _a.amountHex, changeHex = _a.changeHex;
        var tx = new tbc.Transaction().from(utxo).from(ftutxos);
        var codeScript;
        if (address_to.startsWith("1")) {
            codeScript = FT.buildFTtransferCode(code, address_to);
        }
        else {
            var hash_to = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(tbc.Script.fromASM(script_asm_to).toBuffer())).toString("hex");
            codeScript = FT.buildFTtransferCode(code, hash_to);
        }
        tx.addOutput(new tbc.Transaction.Output({
            script: codeScript,
            satoshis: 2000,
        }));
        var tapeScript = FT.buildFTtransferTape(tape, amountHex);
        tx.addOutput(new tbc.Transaction.Output({
            script: tapeScript,
            satoshis: 0,
        }));
        if (amountbn < tapeAmountSum) {
            var changeCodeScript = FT.buildFTtransferCode(code, hash_from);
            tx.addOutput(new tbc.Transaction.Output({
                script: changeCodeScript,
                satoshis: 2000,
            }));
            var changeTapeScript = FT.buildFTtransferTape(tape, changeHex);
            tx.addOutput(new tbc.Transaction.Output({
                script: changeTapeScript,
                satoshis: 0,
            }));
        }
        var amount_satoshis = 0;
        if (tbc_amount) {
            amount_satoshis = Math.floor(tbc_amount * Math.pow(10, 6));
            if (address_to.startsWith("1")) {
                tx.addOutput(new tbc.Transaction.Output({
                    script: tbc.Script.buildPublicKeyHashOut(address_to),
                    satoshis: amount_satoshis,
                }));
            }
            else {
                tx.addOutput(new tbc.Transaction.Output({
                    script: tbc.Script.fromASM(script_asm_to),
                    satoshis: amount_satoshis,
                }));
            }
        }
        switch (ftutxos.length) {
            case 1:
                tx.addOutput(new tbc.Transaction.Output({
                    script: tbc.Script.fromASM(script_asm_from),
                    satoshis: utxo.satoshis - amount_satoshis - 4000,
                }));
                break;
            case 2:
                tx.addOutput(new tbc.Transaction.Output({
                    script: tbc.Script.fromASM(script_asm_from),
                    satoshis: utxo.satoshis - amount_satoshis - 5500,
                }));
                break;
            case 3:
                tx.addOutput(new tbc.Transaction.Output({
                    script: tbc.Script.fromASM(script_asm_from),
                    satoshis: utxo.satoshis - amount_satoshis - 7000,
                }));
                break;
            case 4:
                tx.addOutput(new tbc.Transaction.Output({
                    script: tbc.Script.fromASM(script_asm_from),
                    satoshis: utxo.satoshis - amount_satoshis - 8500,
                }));
                break;
            case 5:
                tx.addOutput(new tbc.Transaction.Output({
                    script: tbc.Script.fromASM(script_asm_from),
                    satoshis: utxo.satoshis - amount_satoshis - 10000,
                }));
                break;
        }
        var _loop_3 = function (i) {
            tx.setInputScript({
                inputIndex: i + 1,
            }, function (tx) {
                var unlockingScript = ft.getFTunlockSwap(privateKey, tx, preTXs[i], prepreTxDatas[i], contractTX, i + 1, ftutxos[i].outputIndex);
                return unlockingScript;
            });
        };
        for (var i = 0; i < ftutxos.length; i++) {
            _loop_3(i);
        }
        var txraw = tx.uncheckedSerialize();
        return { txraw: txraw, amounts: [utxo.satoshis] };
    };
    /**
     * Sign a multi-signature transaction for transferring FT
     * @param address_from The address from which the transaction is sent
     * @param multiSigTxraw The raw serialized transaction string
     * @param privateKey The private key used to sign the transaction
     * @returns An array of signatures
     */
    MultiSig.signMultiSigTransaction_transferFT = function (multiSig_address, multiSigTxraw, privateKey) {
        var script_asm = MultiSig.getMultiSigLockScript(multiSig_address);
        var txraw = multiSigTxraw.txraw, amounts = multiSigTxraw.amounts;
        var tx = new tbc.Transaction(txraw);
        tx.inputs[0].output = new tbc.Transaction.Output({
            script: tbc.Script.fromASM(script_asm),
            satoshis: amounts[0],
        });
        var sigs = [];
        sigs[0] = tx.getSignature(0, privateKey);
        return sigs;
    };
    /**
     * Finish a multi-signature transaction for transferring FT
     * @param txraw The raw serialized transaction string
     * @param sigs An array of signatures
     * @param pubkeys The public keys
     * @returns The raw serialized transaction string
     */
    MultiSig.finishMultiSigTransaction_transferFT = function (txraw, sigs, pubKeys) {
        var multiPubKeys = "";
        for (var i = 0; i < pubKeys.length; i++) {
            multiPubKeys = multiPubKeys + pubKeys[i];
        }
        var tx = new tbc.Transaction(txraw);
        tx.setInputScript({
            inputIndex: 0,
        }, function (tx) {
            var signature = "";
            for (var i = 0; i < sigs[0].length; i++) {
                if (i < sigs[0].length - 1) {
                    signature = signature + sigs[0][i] + " ";
                }
                else {
                    signature = signature + sigs[0][i];
                }
            }
            var unlockingScript = tbc.Script.fromASM("OP_0 ".concat(signature, " ").concat(multiPubKeys));
            return unlockingScript;
        });
        return tx.uncheckedSerialize();
    };
    /**
     * Get multi-signature address
     * @param pubkeys Public keys
     * @param signatureCount Number of signatures
     * @param publicKeyCount Number of public keys
     * @returns Multi-signature address
     */
    MultiSig.getMultiSigAddress = function (pubKeys, signatureCount, publicKeyCount) {
        if (signatureCount < 1 || signatureCount > 6) {
            throw new Error("Invalid signatureCount.");
        }
        else if (publicKeyCount < 3 || publicKeyCount > 10) {
            throw new Error("Invalid publicKeyCount.");
        }
        else if (signatureCount > publicKeyCount) {
            throw new Error("SignatureCount must be less than publicKeyCount.");
        }
        var hash = MultiSig.getHash(pubKeys);
        var prefix = (signatureCount << 4) | (publicKeyCount & 0x0f);
        var versionBuffer = Buffer.from([prefix]);
        var addressBuffer = Buffer.concat([versionBuffer, hash]);
        var addressHash = tbc.crypto.Hash.sha256sha256(addressBuffer);
        var checksum = addressHash.subarray(0, 4);
        var addressWithChecksum = Buffer.concat([addressBuffer, checksum]);
        return tbc.encoding.Base58.encode(addressWithChecksum);
    };
    /**
     * Get the signature and public key count from a multi-signature address
     * @param address Multi-signature address
     * @returns Signature and public key count
     */
    MultiSig.getSignatureAndPublicKeyCount = function (address) {
        var buf = Buffer.from(tbc.encoding.Base58.decode(address));
        var prefix = buf[0];
        var signatureCount = (prefix >> 4) & 0x0f;
        var publicKeyCount = prefix & 0x0f;
        return { signatureCount: signatureCount, publicKeyCount: publicKeyCount };
    };
    /**
     * Verify a multi-signature address
     * @param pubkeys Public keys
     * @param address Multi-signature address
     * @returns True if the address is valid, false otherwise
     */
    MultiSig.verifyMultiSigAddress = function (pubKeys, address) {
        var hash_from_pubkeys = MultiSig.getHash(pubKeys).toString("hex");
        var buf = Buffer.from(tbc.encoding.Base58.decode(address));
        var hash_from_address = Buffer.from(buf.subarray(1, 21)).toString("hex");
        return hash_from_pubkeys === hash_from_address;
    };
    /**
     * Generate a multi-signature lock script(script_asm) from a multi-signature address
     * @param address Multi-signature address
     * @returns Lock script for the multi-signature contract
     * @throws Error if signature count or public key count is invalid
     *
     * The generated lock script performs the following:
     * 1. Splits the input public keys
     * 2. Duplicates and concatenates the public keys
     * 3. Verifies the hash matches the address
     * 4. Checks that the required number of signatures are valid
     */
    MultiSig.getMultiSigLockScript = function (address) {
        var buf = Buffer.from(tbc.encoding.Base58.decode(address));
        var _a = MultiSig.getSignatureAndPublicKeyCount(address), signatureCount = _a.signatureCount, publicKeyCount = _a.publicKeyCount;
        if (signatureCount < 1 || signatureCount > 6) {
            throw new Error("Invalid signatureCount.");
        }
        else if (publicKeyCount < 3 || publicKeyCount > 10) {
            throw new Error("Invalid publicKeyCount.");
        }
        else if (signatureCount > publicKeyCount) {
            throw new Error("SignatureCount must be less than publicKeyCount.");
        }
        var hash = Buffer.from(buf.subarray(1, 21)).toString("hex");
        var lockScriptPrefix = "";
        for (var i = 0; i < publicKeyCount - 1; i++) {
            lockScriptPrefix = lockScriptPrefix + "21 OP_SPLIT ";
        }
        for (var i = 0; i < publicKeyCount; i++) {
            lockScriptPrefix = lockScriptPrefix + "OP_".concat(publicKeyCount - 1, " OP_PICK ");
        }
        for (var i = 0; i < publicKeyCount - 1; i++) {
            lockScriptPrefix = lockScriptPrefix + "OP_CAT ";
        }
        var script_asm = "OP_".concat(signatureCount, " OP_SWAP ") +
            lockScriptPrefix +
            "OP_HASH160 ".concat(hash, " OP_EQUALVERIFY OP_").concat(publicKeyCount, " OP_CHECKMULTISIG");
        return script_asm;
    };
    /**
     * Get the combine hash from a multi-signature address
     * @param address Multi-signature address
     * @returns Combine hash
     */
    MultiSig.getCombineHash = function (address) {
        var combine_hash = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(tbc.Script.fromASM(MultiSig.getMultiSigLockScript(address)).toBuffer())).toString("hex") + "01";
        return combine_hash;
    };
    MultiSig.getHash = function (pubKeys) {
        var multiPubKeys = "";
        for (var i = 0; i < pubKeys.length; i++) {
            multiPubKeys = multiPubKeys + pubKeys[i];
        }
        var buf = Buffer.from(multiPubKeys, "hex");
        var hash = tbc.crypto.Hash.sha256ripemd160(buf);
        return hash;
    };
    MultiSig.buildHoldScript = function (pubKey) {
        var publicKeyHash = tbc.crypto.Hash.sha256ripemd160(Buffer.from(pubKey, "hex")).toString("hex");
        return new tbc.Script("OP_DUP OP_HASH160" +
            " 0x14 0x" +
            publicKeyHash +
            " OP_EQUALVERIFY OP_CHECKSIG OP_RETURN 0x08 0x6d756c7469736967");
    };
    MultiSig.buildTapeScript = function (address, pubKeys) {
        var data = {
            address: address,
            pubkeys: pubKeys,
        };
        var dataHex = Buffer.from(JSON.stringify(data)).toString("hex");
        return tbc.Script.fromASM("OP_FALSE OP_RETURN " + dataHex + " 4d54617065");
    };
    return MultiSig;
}());
module.exports = MultiSig;
