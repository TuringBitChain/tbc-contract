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
const ftunlock_1 = require("../util/ftunlock");
const util_1 = require("../util/util");
const FT = require("./ft");
const NFT = require("./nft");
class stableCoin extends FT {
    /**
     * Mints a new stableCoin and returns the raw transaction hex.
     * @param privateKey_from - The private key of the sender.
     * @param address_to - The recipient's address.
     * @param utxo - The UTXO to spend.
     * @returns The raw transaction hex string array.
     */
    createCoin(privateKey_admin, address_to, utxo, utxoTX, mintMessage) {
        const privateKey = privateKey_admin;
        const adminAddress = privateKey.toAddress().toString();
        const name = this.name;
        const symbol = this.symbol;
        const decimal = this.decimal;
        const totalSupply = (0, util_1.parseDecimalToBigInt)(this.totalSupply, decimal);
        // Prepare the amount in BN format and write it into a buffer
        const amountbn = new tbc.crypto.BN(totalSupply.toString());
        const amountwriter = new tbc.encoding.BufferWriter();
        amountwriter.writeUInt64LEBN(amountbn);
        for (let i = 1; i < 6; i++) {
            amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
        }
        const tapeAmount = amountwriter.toBuffer().toString("hex");
        // Convert name, symbol, and decimal to hex
        const nameHex = Buffer.from(name, "utf8").toString("hex");
        const symbolHex = Buffer.from(symbol, "utf8").toString("hex");
        const decimalHex = decimal.toString(16).padStart(2, "0");
        const lockTimeHex = "00000000";
        // Build the tape script
        const tapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${tapeAmount} ${decimalHex} ${nameHex} ${symbolHex} ${lockTimeHex} 4654617065`);
        const tapeSize = tapeScript.toBuffer().length;
        const data = {
            nftName: name + " NFT",
            nftSymbol: symbol + " NFT",
            description: `The sole issuance certificate for the stablecoin, dynamically recording cumulative supply and issuance history. Non-transferable, real-time updated, ensuring full transparency and auditability.`,
            coinDecimal: decimal,
            coinTotalSupply: "0",
        };
        const coinNftTX = stableCoin.buildCoinNftTX(privateKey, utxo, data);
        const coinNftTXRaw = coinNftTX.uncheckedSerialize();
        data.coinTotalSupply = totalSupply.toString();
        const coinNftOutputs = stableCoin.buildCoinNftOutput(coinNftTX.outputs[0].script, coinNftTX.outputs[1].script, coinNft.getTapeScript(data));
        // Build the code script for minting coin
        const originCodeHash = tbc.crypto.Hash.sha256(coinNftTX.outputs[0].script.toBuffer()).toString("hex");
        const codeScript = stableCoin.getCoinMintCode(adminAddress, address_to, originCodeHash, tapeSize);
        this.codeScript = codeScript.toBuffer().toString("hex");
        this.tapeScript = tapeScript.toBuffer().toString("hex");
        // Construct the transaction
        const tx = new tbc.Transaction()
            .addInputFromPrevTx(coinNftTX, 0)
            .addInputFromPrevTx(coinNftTX, 1)
            .addInputFromPrevTx(coinNftTX, 3);
        coinNftOutputs.forEach((output) => tx.addOutput(output));
        tx.addOutput(new tbc.Transaction.Output({
            script: codeScript,
            satoshis: 500,
        })).addOutput(new tbc.Transaction.Output({
            script: tapeScript,
            satoshis: 0,
        }));
        if (mintMessage && mintMessage.length > 0) {
            const mintMessageHex = Buffer.from(mintMessage, "utf8").toString("hex");
            const msgScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${mintMessageHex}`);
            tx.addOutput(new tbc.Transaction.Output({
                script: msgScript,
                satoshis: 0,
            }));
        }
        tx.feePerKb(80)
            .change(privateKey.toAddress())
            .setInputScript({
            inputIndex: 0,
            privateKey,
        }, (tx) => {
            return coinNft.buildUnlockScript(privateKey, tx, coinNftTX, utxoTX, 0);
        })
            .setInputScript({
            inputIndex: 1,
            privateKey,
        }, (tx) => {
            const sig = tx.getSignature(1);
            const publickey = privateKey.toPublicKey().toBuffer().toString("hex");
            return tbc.Script.fromASM(`${sig} ${publickey}`);
        })
            .sign(privateKey);
        tx.seal();
        console.log(tx.verify());
        const coinMintRaw = tx.uncheckedSerialize();
        this.contractTxid = tx.hash;
        const txraw = [];
        txraw.push(coinNftTXRaw);
        txraw.push(coinMintRaw);
        return txraw;
    }
    mintCoin(privateKey_admin, address_to, mintAmount, utxo, nftPreTX, nftPrePreTX, mintMessage) {
        const privateKey = privateKey_admin;
        const adminAddress = privateKey.toAddress().toString();
        const name = this.name;
        const symbol = this.symbol;
        const decimal = this.decimal;
        const totalSupply = (0, util_1.parseDecimalToBigInt)(this.totalSupply, decimal);
        const newMintAmount = (0, util_1.parseDecimalToBigInt)(mintAmount, decimal);
        const newTotalSupply = totalSupply + newMintAmount;
        const coinNftTX = nftPreTX;
        // Prepare the amount in BN format and write it into a buffer
        const amountbn = new tbc.crypto.BN(newMintAmount.toString());
        const amountwriter = new tbc.encoding.BufferWriter();
        amountwriter.writeUInt64LEBN(amountbn);
        for (let i = 1; i < 6; i++) {
            amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
        }
        const tapeAmount = amountwriter.toBuffer().toString("hex");
        // Convert name, symbol, and decimal to hex
        const nameHex = Buffer.from(name, "utf8").toString("hex");
        const symbolHex = Buffer.from(symbol, "utf8").toString("hex");
        const decimalHex = decimal.toString(16).padStart(2, "0");
        const lockTimeHex = "00000000";
        // Build the tape script
        const tapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${tapeAmount} ${decimalHex} ${nameHex} ${symbolHex} ${lockTimeHex} 4654617065`);
        const tapeSize = tapeScript.toBuffer().length;
        const coinNftOutputs = stableCoin.buildCoinNftOutput(coinNftTX.outputs[0].script, coinNftTX.outputs[1].script, coinNft.updateTapeScript(coinNftTX.outputs[2].script, newTotalSupply.toString()));
        // Build the code script for minting coin
        const originCodeHash = tbc.crypto.Hash.sha256(coinNftTX.outputs[0].script.toBuffer()).toString("hex");
        const codeScript = stableCoin.getCoinMintCode(adminAddress, address_to, originCodeHash, tapeSize);
        this.codeScript = codeScript.toBuffer().toString("hex");
        this.tapeScript = tapeScript.toBuffer().toString("hex");
        // Construct the transaction
        const tx = new tbc.Transaction()
            .addInputFromPrevTx(coinNftTX, 0)
            .addInputFromPrevTx(coinNftTX, 1)
            .from(utxo);
        coinNftOutputs.forEach((output) => tx.addOutput(output));
        tx.addOutput(new tbc.Transaction.Output({
            script: codeScript,
            satoshis: 500,
        })).addOutput(new tbc.Transaction.Output({
            script: tapeScript,
            satoshis: 0,
        }));
        if (mintMessage && mintMessage.length > 0) {
            const mintMessageHex = Buffer.from(mintMessage, "utf8").toString("hex");
            const msgScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${mintMessageHex}`);
            tx.addOutput(new tbc.Transaction.Output({
                script: msgScript,
                satoshis: 0,
            }));
        }
        tx.feePerKb(80)
            .change(privateKey.toAddress())
            .setInputScript({
            inputIndex: 0,
            privateKey,
        }, (tx) => {
            return coinNft.buildUnlockScript(privateKey, tx, nftPreTX, nftPrePreTX, 0);
        })
            .setInputScript({
            inputIndex: 1,
            privateKey,
        }, (tx) => {
            const sig = tx.getSignature(1);
            const publickey = privateKey.toPublicKey().toBuffer().toString("hex");
            return tbc.Script.fromASM(`${sig} ${publickey}`);
        })
            .sign(privateKey);
        tx.seal();
        console.log(tx.verify());
        const coinMintRaw = tx.uncheckedSerialize();
        return coinMintRaw;
    }
    /**
     * Transfers stableCoin to another address.
     * @param privateKey_from - The private key of the sender.
     * @param address_to - The recipient's address.
     * @param ft_amount - The amount of FT to transfer.
     * @param ftutxo_a - Array of FT UTXOs to spend.
     * @param utxo - Regular UTXO for transaction fees.
     * @param preTX - Array of previous transactions.
     * @param prepreTxData - Array of pre-previous transaction data.
     * @param tbc_amount - Optional TBC amount to send alongside.
     * @returns The raw transaction hex string.
     */
    transfer(privateKey_from, address_to, ft_amount, ftutxo_a, utxo, preTX, prepreTxData, tbc_amount) {
        const privateKey = privateKey_from;
        const address_from = privateKey.toAddress().toString();
        const code = this.codeScript;
        const tape = this.tapeScript;
        const decimal = this.decimal;
        const isCoin = 1;
        const tapeAmountSetIn = [];
        if ((typeof ft_amount === "string" && parseFloat(ft_amount) < 0) ||
            (typeof ft_amount === "number" && ft_amount < 0)) {
            throw new Error("Invalid amount input");
        }
        const amountbn = (0, util_1.parseDecimalToBigInt)(ft_amount, decimal);
        // Calculate the total available balance
        let tapeAmountSum = BigInt(0);
        let lockTimeMax = 0;
        for (let i = 0; i < ftutxo_a.length; i++) {
            tapeAmountSetIn.push(ftutxo_a[i].ftBalance);
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
            lockTimeMax = Math.max(lockTimeMax, stableCoin.getLockTimeFromTape(preTX[i].outputs[ftutxo_a[i].outputIndex + 1].script));
        }
        // Check if the balance is sufficient
        if (amountbn > tapeAmountSum) {
            throw new Error("Insufficient balance, please add more FT UTXOs");
        }
        // Validate the decimal and amount
        if (decimal > 18) {
            throw new Error("The maximum value for decimal cannot exceed 18");
        }
        const maxAmount = (0, util_1.parseDecimalToBigInt)(1, 18 - decimal);
        if (Number(ft_amount) > Number(maxAmount)) {
            throw new Error(`When decimal is ${decimal}, the maximum amount cannot exceed ${maxAmount}`);
        }
        // Build the amount and change hex strings for the tape
        const { amountHex, changeHex } = FT.buildTapeAmount(amountbn, tapeAmountSetIn);
        // Construct the transaction
        const tx = new tbc.Transaction().from(ftutxo_a).from(utxo);
        // Build the code script for the recipient
        const codeScript = FT.buildFTtransferCode(code, address_to);
        tx.addOutput(new tbc.Transaction.Output({
            script: codeScript,
            satoshis: 500,
        }));
        // Build the tape script for the amount
        const tapeScript = FT.buildFTtransferTape(tape, amountHex);
        tx.addOutput(new tbc.Transaction.Output({
            script: tapeScript,
            satoshis: 0,
        }));
        if (tbc_amount) {
            const amount_satoshis = Number((0, util_1.parseDecimalToBigInt)(tbc_amount, 6));
            tx.to(address_to, amount_satoshis);
        }
        // If there's change, add outputs for the change
        if (amountbn < tapeAmountSum) {
            const changeCodeScript = FT.buildFTtransferCode(code, address_from);
            tx.addOutput(new tbc.Transaction.Output({
                script: changeCodeScript,
                satoshis: 500,
            }));
            const changeTapeScript = FT.buildFTtransferTape(tape, changeHex);
            tx.addOutput(new tbc.Transaction.Output({
                script: changeTapeScript,
                satoshis: 0,
            }));
        }
        tx.feePerKb(80);
        tx.change(address_from);
        // Set the input script asynchronously for the FT UTXO
        for (let i = 0; i < ftutxo_a.length; i++) {
            tx.setInputSequence(i, 4294967294);
            tx.setInputScript({
                inputIndex: i,
            }, (tx) => {
                const unlockingScript = this.getFTunlock(privateKey, tx, preTX[i], prepreTxData[i], i, ftutxo_a[i].outputIndex, isCoin);
                return unlockingScript;
            });
        }
        tx.sign(privateKey);
        tx.setLockTime(lockTimeMax);
        tx.seal();
        console.log(tx.toObject());
        console.log(tx.verify());
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    /**
     * Batch transfers FT from one address to multiple addresses and returns unchecked transaction raw data.
     *
     * @param {tbc.PrivateKey} privateKey_from - The private key used to sign the transaction.
     * @param {Map<string, number | string>} receiveAddressAmount - Map of receiving addresses and amounts.
     * @param {tbc.Transaction.IUnspentOutput[]} ftutxo - List of FT UTXOs used to create the transaction.
     * @param {tbc.Transaction.IUnspentOutput} utxo - Unspent output used to create the transaction.
     * @param {tbc.Transaction[]} preTX - List of previous transactions.
     * @param {string[]} prepreTxData - List of previous transaction data.
     * @returns {Array<{ txraw: string }>} Returns an array containing unchecked transaction raw data.
     */
    batchTransfer(privateKey_from, receiveAddressAmount, ftutxo, utxo, preTX, prepreTxData) {
        const privateKey = privateKey_from;
        let txsraw = [];
        let tx = new tbc.Transaction();
        let ftutxoBalance = 0n;
        for (const utxo of ftutxo) {
            ftutxoBalance += BigInt(utxo.ftBalance);
            console.log("ftutxoBalance", ftutxoBalance);
        }
        let i = 0;
        for (const [address_to, amount] of receiveAddressAmount) {
            if (i === 0) {
                tx = this._batchTransfer(privateKey, address_to, amount, preTX, prepreTxData, txsraw, ftutxoBalance, ftutxo, utxo);
                let prepretxdata = "";
                for (let j = 0; j < preTX.length; j++) {
                    prepretxdata =
                        (0, ftunlock_1.getPrePreTxdata)(preTX[j], tx.inputs[j].outputIndex) + prepretxdata;
                }
                prepretxdata = "57" + prepretxdata;
                prepreTxData = [prepretxdata];
            }
            else {
                tx = this._batchTransfer(privateKey, address_to, amount, preTX, prepreTxData, txsraw, ftutxoBalance);
                prepreTxData = [
                    "57" + (0, ftunlock_1.getPrePreTxdata)(preTX[0], tx.inputs[0].outputIndex),
                ];
            }
            preTX = [tx];
            ftutxoBalance -= (0, util_1.parseDecimalToBigInt)(amount, this.decimal);
            i++;
            console.log("ftutxoBalance", ftutxoBalance);
        }
        return txsraw;
    }
    _batchTransfer(privateKey_from, address_to, amount, preTX, prepreTxData, txsraw, ftutxoBalance, ftutxo, utxo) {
        const privateKey = privateKey_from;
        const address_from = privateKey.toAddress().toString();
        const code = this.codeScript;
        const tape = this.tapeScript;
        const decimal = this.decimal;
        const isCoin = 1;
        const tapeAmountSetIn = [];
        let tapeAmountSum = ftutxoBalance;
        let lockTimeMax = 0;
        if ((typeof amount === "string" && parseFloat(amount) < 0) ||
            (typeof amount === "number" && amount < 0)) {
            throw new Error("Invalid amount input");
        }
        const amountbn = (0, util_1.parseDecimalToBigInt)(amount, decimal);
        if (ftutxo) {
            for (let i = 0; i < ftutxo.length; i++) {
                tapeAmountSetIn.push(ftutxo[i].ftBalance);
                lockTimeMax = Math.max(lockTimeMax, stableCoin.getLockTimeFromTape(preTX[i].outputs[ftutxo[i].outputIndex + 1].script));
            }
        }
        else {
            tapeAmountSetIn.push(tapeAmountSum);
            lockTimeMax = stableCoin.getLockTimeFromTape(preTX[0].outputs[3].script);
        }
        const { amountHex, changeHex } = FT.buildTapeAmount(amountbn, tapeAmountSetIn);
        const tx = new tbc.Transaction();
        ftutxo ? tx.from(ftutxo) : tx.addInputFromPrevTx(preTX[0], 2);
        utxo ? tx.from(utxo) : tx.addInputFromPrevTx(preTX[0], 4);
        const codeScript = FT.buildFTtransferCode(code, address_to);
        tx.addOutput(new tbc.Transaction.Output({
            script: codeScript,
            satoshis: 500,
        }));
        const tapeScript = FT.buildFTtransferTape(tape, amountHex);
        tx.addOutput(new tbc.Transaction.Output({
            script: tapeScript,
            satoshis: 0,
        }));
        if (amountbn < tapeAmountSum) {
            const changeCodeScript = FT.buildFTtransferCode(code, address_from);
            tx.addOutput(new tbc.Transaction.Output({
                script: changeCodeScript,
                satoshis: 500,
            }));
            const changeTapeScript = FT.buildFTtransferTape(tape, changeHex);
            tx.addOutput(new tbc.Transaction.Output({
                script: changeTapeScript,
                satoshis: 0,
            }));
        }
        tx.feePerKb(80);
        tx.change(address_from);
        if (ftutxo) {
            for (let i = 0; i < ftutxo.length; i++) {
                tx.setInputSequence(i, 4294967294);
                tx.setInputScript({
                    inputIndex: i,
                }, (tx) => {
                    const unlockingScript = this.getFTunlock(privateKey, tx, preTX[i], prepreTxData[i], i, ftutxo[i].outputIndex, isCoin);
                    return unlockingScript;
                });
            }
        }
        else {
            tx.setInputSequence(0, 4294967294);
            tx.setInputScript({
                inputIndex: 0,
            }, (tx) => {
                const unlockingScript = this.getFTunlock(privateKey, tx, preTX[0], prepreTxData[0], 0, 2, isCoin);
                return unlockingScript;
            });
        }
        tx.sign(privateKey);
        tx.setLockTime(lockTimeMax);
        tx.seal();
        const txraw = tx.uncheckedSerialize();
        txsraw.push({ txraw: txraw });
        return tx;
    }
    mergeCoin(privateKey_from, ftutxo, utxo, preTX, prepreTxData, localTX) {
        const privateKey = privateKey_from;
        const preTxCopy = preTX;
        let ftutxos = ftutxo.slice(0, 5);
        let preTXs = preTX.slice(0, 5);
        let prepreTxDatas = prepreTxData.slice(0, 5);
        let txsraw = [];
        let tx = new tbc.Transaction();
        for (let i = 0; ftutxos.length > 1; i++) {
            if (i === 0) {
                tx = this._mergeCoin(privateKey, ftutxos, preTXs, prepreTxDatas, txsraw, utxo);
            }
            else {
                tx = this._mergeCoin(privateKey, ftutxos, preTXs, prepreTxDatas, txsraw);
            }
            let index = (i + 1) * 5;
            preTXs = preTX.slice(index, index + 5);
            preTXs.push(tx);
            prepreTxDatas = prepreTxData.slice(index, index + 5);
            ftutxos = ftutxo.slice(index, index + 5);
        }
        if (txsraw.length <= 1 && ftutxos.length < 1)
            return txsraw;
        const utxoTX = preTXs.pop();
        const nonEmpty = preTXs.length;
        const newutxo = (0, util_1.buildUTXO)(utxoTX, 2, false);
        for (const txraw of txsraw) {
            const tx = new tbc.Transaction(txraw.txraw);
            preTXs.push(tx);
            ftutxos.push((0, util_1.buildUTXO)(tx, 0, true));
        }
        if (localTX.length === 0) {
            localTX = preTxCopy;
        }
        for (let i = nonEmpty; i < preTXs.length; i++) {
            prepreTxDatas.push((0, util_1.buildFtPrePreTxData)(preTXs[i], 0, localTX));
        }
        localTX = preTXs;
        const txs = this.mergeFT(privateKey, ftutxos, newutxo, preTXs, prepreTxDatas, localTX);
        txsraw = txsraw.concat(txs ?? []);
        return txsraw;
    }
    _mergeCoin(privateKey_from, ftutxo, preTX, prepreTxData, txsraw, utxo) {
        const privateKey = privateKey_from;
        const address = privateKey.toAddress().toString();
        const isCoin = 1;
        const ftutxos = ftutxo;
        if (ftutxos.length === 0) {
            throw new Error("No FT UTXO available");
        }
        else if (ftutxos.length === 1) {
            return null;
        }
        const tapeAmountSetIn = [];
        let tapeAmountSum = BigInt(0);
        let lockTimeMax = 0;
        for (let i = 0; i < ftutxos.length; i++) {
            tapeAmountSetIn.push(ftutxos[i].ftBalance);
            tapeAmountSum += BigInt(ftutxos[i].ftBalance);
            lockTimeMax = Math.max(lockTimeMax, stableCoin.getLockTimeFromTape(preTX[i].outputs[ftutxos[i].outputIndex + 1].script));
        }
        const { amountHex, changeHex } = FT.buildTapeAmount(tapeAmountSum, tapeAmountSetIn);
        if (changeHex !=
            "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000") {
            throw new Error("Change amount is not zero");
        }
        const tx = new tbc.Transaction().from(ftutxos);
        utxo ? tx.from(utxo) : tx.addInputFromPrevTx(preTX[preTX.length - 1], 2);
        const codeScript = FT.buildFTtransferCode(this.codeScript, address);
        tx.addOutput(new tbc.Transaction.Output({
            script: codeScript,
            satoshis: 500,
        }));
        const tapeScript = FT.buildFTtransferTape(this.tapeScript, amountHex);
        tx.addOutput(new tbc.Transaction.Output({
            script: tapeScript,
            satoshis: 0,
        }));
        tx.feePerKb(80);
        tx.change(privateKey.toAddress());
        for (let i = 0; i < ftutxos.length && i < 5; i++) {
            tx.setInputSequence(i, 4294967294);
            tx.setInputScript({
                inputIndex: i,
            }, (tx) => {
                const unlockingScript = this.getFTunlock(privateKey, tx, preTX[i], prepreTxData[i], i, ftutxos[i].outputIndex, isCoin);
                return unlockingScript;
            });
        }
        tx.sign(privateKey);
        tx.setLockTime(lockTimeMax);
        tx.seal();
        const txraw = tx.uncheckedSerialize();
        txsraw.push({ txraw: txraw });
        return tx;
    }
    frozenCoinUTXO(privateKey_admin, lock_time, ftutxo, utxo, preTX, prepreTxData) {
        const privateKey = privateKey_admin;
        const controlData = stableCoin.getAddressFromCode(ftutxo[0].script);
        const address = controlData.type === "address"
            ? tbc.Address.fromHex("00" + controlData.address).toString()
            : controlData.address;
        const isCoin = 1;
        const ftutxos = ftutxo;
        if (ftutxos.length === 0) {
            throw new Error("No FT UTXO available");
        }
        const tapeAmountSetIn = [];
        let tapeAmountSum = BigInt(0);
        let lockTimeMax = 0;
        for (let i = 0; i < ftutxo.length; i++) {
            tapeAmountSetIn.push(ftutxo[i].ftBalance);
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
            lockTimeMax = Math.max(lockTimeMax, stableCoin.getLockTimeFromTape(preTX[i].outputs[ftutxo[i].outputIndex + 1].script));
        }
        const { amountHex, changeHex } = FT.buildTapeAmount(tapeAmountSum, tapeAmountSetIn);
        if (changeHex !=
            "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000") {
            throw new Error("Change amount is not zero");
        }
        const tx = new tbc.Transaction();
        tx.from(ftutxos).from(utxo);
        const codeScript = FT.buildFTtransferCode(this.codeScript, address);
        tx.addOutput(new tbc.Transaction.Output({
            script: codeScript,
            satoshis: 500,
        }));
        const tapeScript = stableCoin.setLockTimeInTape(FT.buildFTtransferTape(this.tapeScript, amountHex), lock_time);
        tx.addOutput(new tbc.Transaction.Output({
            script: tapeScript,
            satoshis: 0,
        }));
        tx.feePerKb(80);
        tx.change(privateKey.toAddress());
        for (let i = 0; i < ftutxos.length && i < 5; i++) {
            tx.setInputSequence(i, 4294967294);
            tx.setInputScript({
                inputIndex: i,
            }, (tx) => {
                const unlockingScript = this.getFTunlock(privateKey, tx, preTX[i], prepreTxData[i], i, ftutxos[i].outputIndex, isCoin);
                return unlockingScript;
            });
        }
        tx.sign(privateKey);
        tx.setLockTime(lockTimeMax);
        tx.seal();
        console.log(tx.toObject());
        console.log(tx.verify());
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    /**
     * @deprecated This method has been deprecated
     */
    transferContract(privateKey_from, address_to, ft_amount, ftutxo_a, utxo, utxoTX, preTX, prepreTxData, tbc_amount) {
        const privateKey = privateKey_from;
        const address_from = privateKey.toAddress().toString();
        const code = this.codeScript;
        const tape = this.tapeScript;
        const decimal = this.decimal;
        const isCoin = 1;
        const tapeAmountSetIn = [];
        if ((typeof ft_amount === "string" && parseFloat(ft_amount) < 0) ||
            (typeof ft_amount === "number" && ft_amount < 0)) {
            throw new Error("Invalid amount input");
        }
        const amountbn = (0, util_1.parseDecimalToBigInt)(ft_amount, decimal);
        // Calculate the total available balance
        let tapeAmountSum = BigInt(0);
        let lockTimeMax = 0;
        for (let i = 0; i < ftutxo_a.length; i++) {
            tapeAmountSetIn.push(ftutxo_a[i].ftBalance);
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
            lockTimeMax = Math.max(lockTimeMax, stableCoin.getLockTimeFromTape(preTX[i].outputs[ftutxo_a[i].outputIndex + 1].script));
        }
        // Check if the balance is sufficient
        if (amountbn > tapeAmountSum) {
            throw new Error("Insufficient balance, please add more FT UTXOs");
        }
        // Validate the decimal and amount
        if (decimal > 18) {
            throw new Error("The maximum value for decimal cannot exceed 18");
        }
        const maxAmount = (0, util_1.parseDecimalToBigInt)(1, 18 - decimal);
        if (Number(ft_amount) > Number(maxAmount)) {
            throw new Error(`When decimal is ${decimal}, the maximum amount cannot exceed ${maxAmount}`);
        }
        // Build the amount and change hex strings for the tape
        const { amountHex, changeHex } = FT.buildTapeAmount(amountbn, tapeAmountSetIn, 1);
        // Construct the transaction
        const tx = new tbc.Transaction().from(utxo).from(ftutxo_a);
        // Build the code script for the recipient
        const codeScript = FT.buildFTtransferCode(code, address_to);
        tx.addOutput(new tbc.Transaction.Output({
            script: codeScript,
            satoshis: 500,
        }));
        // Build the tape script for the amount
        const tapeScript = FT.buildFTtransferTape(tape, amountHex);
        tx.addOutput(new tbc.Transaction.Output({
            script: tapeScript,
            satoshis: 0,
        }));
        if (tbc_amount) {
            const amount_satoshis = Number((0, util_1.parseDecimalToBigInt)(tbc_amount, 6));
            tx.to(address_to, amount_satoshis);
        }
        // If there's change, add outputs for the change
        if (amountbn < tapeAmountSum) {
            const changeCodeScript = FT.buildFTtransferCode(code, address_from);
            tx.addOutput(new tbc.Transaction.Output({
                script: changeCodeScript,
                satoshis: 500,
            }));
            const changeTapeScript = FT.buildFTtransferTape(tape, changeHex);
            tx.addOutput(new tbc.Transaction.Output({
                script: changeTapeScript,
                satoshis: 0,
            }));
        }
        tx.feePerKb(80);
        tx.change(address_from);
        // Set the input script asynchronously for the FT UTXO
        for (let i = 0; i < ftutxo_a.length; i++) {
            tx.setInputSequence(i + 1, 4294967294);
            tx.setInputScript({
                inputIndex: i + 1,
            }, (tx) => {
                const unlockingScript = this.getFTunlockSwap(privateKey, tx, preTX[i], prepreTxData[i], utxoTX, i + 1, ftutxo_a[i].outputIndex, 2, isCoin);
                return unlockingScript;
            });
        }
        tx.sign(privateKey);
        tx.setLockTime(lockTimeMax);
        tx.seal();
        console.log(tx.toObject());
        console.log(tx.verify());
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    static buildCoinNftOutput(nftCodeScript, nftHoldScript, nftTapeScript) {
        return [
            new tbc.Transaction.Output({
                script: nftCodeScript,
                satoshis: 200,
            }),
            new tbc.Transaction.Output({
                script: nftHoldScript,
                satoshis: 100,
            }),
            new tbc.Transaction.Output({
                script: nftTapeScript,
                satoshis: 0,
            }),
        ];
    }
    static buildCoinNftTX(privateKey_admin, utxo, data) {
        const address = privateKey_admin.toAddress().toString();
        const nftCodeScript = coinNft.getCoinNftCode(utxo.txId, utxo.outputIndex);
        const nftHoldScript = coinNft.getHoldScript(address, data.nftName);
        const nftTapeScript = coinNft.getTapeScript(data);
        const outputs = stableCoin.buildCoinNftOutput(nftCodeScript, nftHoldScript, nftTapeScript);
        const tx = new tbc.Transaction()
            .from(utxo)
            .addOutput(outputs[0])
            .addOutput(outputs[1])
            .addOutput(outputs[2])
            .change(address);
        const txSize = tx.getEstimateSize();
        if (txSize < 1000) {
            tx.fee(80);
        }
        else {
            tx.feePerKb(80);
        }
        tx.sign(privateKey_admin).seal();
        return tx;
    }
    static getCoinMintCode(adminAddress, receiveAddress, codeHash, tapeSize) {
        const adminPubHash = tbc.Address.fromString(adminAddress).hashBuffer.toString("hex");
        const publicKeyHash = tbc.Address.fromString(receiveAddress).hashBuffer.toString("hex");
        const hash = publicKeyHash + "00";
        const tapeSizeHex = (0, ftunlock_1.getSize)(tapeSize).toString("hex");
        // The codeScript is constructed with specific opcodes and parameters for FT minting
        const codeScript = new tbc.Script(`OP_9 OP_PICK OP_TOALTSTACK OP_1 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_5 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_4 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_3 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_2 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_1 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_0 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_DUP OP_SIZE OP_10 OP_SUB OP_SPLIT OP_NIP OP_4 OP_SPLIT OP_DROP OP_BIN2NUM OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_SIZE 0x01 0x28 OP_DIV OP_FROMALTSTACK OP_FROMALTSTACK OP_ROT OP_TOALTSTACK OP_TOALTSTACK OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_TOALTSTACK OP_SHA256 OP_FROMALTSTACK OP_CAT OP_CAT OP_HASH256 OP_6 OP_PUSH_META 0x01 0x20 OP_SPLIT OP_4 OP_SPLIT OP_BIN2NUM 0x04 0xffffffff OP_BIN2NUM OP_NUMNOTEQUAL OP_1 OP_EQUALVERIFY OP_BIN2NUM OP_FROMALTSTACK OP_EQUALVERIFY OP_EQUALVERIFY OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_DUP OP_HASH160 OP_FROMALTSTACK OP_EQUAL OP_NOTIF OP_DUP OP_HASH160 0x14 0x${adminPubHash} OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_2 OP_PUSH_META OP_BIN2NUM OP_2DUP OP_LESSTHANOREQUAL OP_TOALTSTACK 0x04 0x0065cd1d OP_LESSTHAN OP_SWAP 0x04 0x0065cd1d OP_LESSTHAN OP_EQUAL OP_FROMALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_CHECKSIGVERIFY OP_ELSE OP_1 OP_EQUALVERIFY OP_FROMALTSTACK 0x01 0x22 OP_PICK 0x01 0x24 OP_SPLIT OP_DROP 0x01 0x20 OP_SPLIT OP_NIP OP_BIN2NUM OP_2 OP_MUL OP_NEGATE 0x01 0x1e OP_ADD OP_1 OP_SUB OP_PICK OP_HASH160 OP_EQUALVERIFY OP_0 OP_TOALTSTACK OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_OVER 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_2 OP_PUSH_META OP_BIN2NUM OP_2DUP OP_LESSTHANOREQUAL OP_TOALTSTACK 0x04 0x0065cd1d OP_LESSTHAN OP_SWAP 0x04 0x0065cd1d OP_LESSTHAN OP_EQUAL OP_FROMALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_CHECKSIGVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_ELSE OP_TOALTSTACK OP_PARTIAL_HASH OP_DUP 0x20 0x${codeHash} OP_EQUALVERIFY OP_ENDIF OP_CAT OP_TOALTSTACK OP_SIZE 0x01 0x28 OP_DIV OP_FROMALTSTACK OP_FROMALTSTACK OP_ROT OP_TOALTSTACK OP_TOALTSTACK OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_BIN2NUM OP_ROT OP_EQUALVERIFY OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_SIZE 0x01 0x28 OP_DIV OP_FROMALTSTACK OP_FROMALTSTACK OP_ROT OP_TOALTSTACK OP_TOALTSTACK OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_BIN2NUM OP_ROT OP_EQUALVERIFY OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_SIZE 0x01 0x28 OP_DIV OP_FROMALTSTACK OP_FROMALTSTACK OP_ROT OP_TOALTSTACK OP_TOALTSTACK OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_BIN2NUM OP_ROT OP_EQUALVERIFY OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_SIZE 0x01 0x28 OP_DIV OP_FROMALTSTACK OP_FROMALTSTACK OP_ROT OP_TOALTSTACK OP_TOALTSTACK OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_BIN2NUM OP_ROT OP_EQUALVERIFY OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_SIZE 0x01 0x28 OP_DIV OP_FROMALTSTACK OP_FROMALTSTACK OP_ROT OP_TOALTSTACK OP_TOALTSTACK OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_BIN2NUM OP_ROT OP_EQUALVERIFY OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_SIZE 0x01 0x28 OP_DIV OP_FROMALTSTACK OP_FROMALTSTACK OP_ROT OP_TOALTSTACK OP_TOALTSTACK OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_BIN2NUM OP_ROT OP_EQUALVERIFY OP_EQUALVERIFY OP_ENDIF OP_7 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_0 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_SHA256 OP_7 OP_PUSH_META OP_EQUAL OP_NIP 0x0b 0xffffffffffffffffffffff OP_DROP OP_RETURN 0x15 0x${hash} 0x05 0x32436f6465`);
        return codeScript;
    }
    static setLockTimeInTape(tapeScript, lockTime) {
        if (lockTime < 500000000) {
            throw new Error("lockTime must be a Unix timestamp (>= 500000000)");
        }
        else if (lockTime > 4294967295) {
            throw new Error("lockTime exceeds the maximum value of 4294967295");
        }
        const lockTimeWriter = new tbc.encoding.BufferWriter();
        lockTimeWriter.writeUInt32LE(lockTime);
        const lockTimeHex = lockTimeWriter.toBuffer();
        tapeScript.chunks[tapeScript.chunks.length - 2].buf = lockTimeHex;
        const script = tapeScript.toASM();
        return tbc.Script.fromASM(script);
    }
    static getLockTimeFromTape(tapeScript) {
        const lockTimeChunk = tapeScript.chunks[tapeScript.chunks.length - 2].buf;
        const lockTimeReader = new tbc.encoding.BufferReader(lockTimeChunk);
        const lockTime = lockTimeReader.readUInt32LE();
        return lockTime;
    }
    static getAddressFromCode(codeScript) {
        const script = tbc.Script.fromHex(codeScript);
        const addressChunk = script.chunks[script.chunks.length - 2].buf.toString("hex");
        const address = addressChunk.slice(0, 40);
        const type = addressChunk.slice(40, 42) === "00" ? "address" : "contract";
        return { address, type };
    }
    /**
     * @deprecated This method has been deprecated
     * Creates a P2PKH script with OP_RETURN data.
     * @param address - The address string.
     * @param flag - The flag string to include in OP_RETURN.
     * @returns The combined P2PKH and OP_RETURN script.
     */
    static buildP2PKHWithCoinFlag(address, flag) {
        const publicKeyHash = tbc.Address.fromString(address).hashBuffer.toString("hex");
        const flagHex = Buffer.from(`for stable coin ${flag}`, "utf8").toString("hex");
        return tbc.Script.fromASM(`OP_DUP OP_HASH160 ${publicKeyHash} OP_EQUALVERIFY OP_CHECKSIG OP_RETURN ${flagHex}`);
    }
    /**
     * @deprecated This method has been deprecated
     */
    static buildAdminP2PKHTX(privateKey_admin, flag, utxo) {
        const address = privateKey_admin.toAddress().toString();
        const script = stableCoin.buildP2PKHWithCoinFlag(address, flag);
        const tx = new tbc.Transaction()
            .from(utxo)
            .addOutput(new tbc.Transaction.Output({
            script: script,
            satoshis: 3000,
        }))
            .fee(80)
            .change(address);
        tx.sign(privateKey_admin).seal();
        return tx;
    }
}
class coinNft extends NFT {
    static getCoinNftCode(tx_hash, outputIndex) {
        const tx_id = Buffer.from(tx_hash, "hex").reverse().toString("hex");
        const writer = new tbc.encoding.BufferWriter();
        const vout = writer.writeUInt32LE(outputIndex).toBuffer().toString("hex");
        const tx_id_vout = "0x" + tx_id + vout;
        const code = new tbc.Script("OP_1 OP_PICK OP_3 OP_SPLIT 0x01 0x14 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_OVER OP_TOALTSTACK OP_TOALTSTACK OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_OVER 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_HASH256 OP_6 OP_PUSH_META 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_OVER OP_TOALTSTACK OP_TOALTSTACK OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_SWAP OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUAL OP_IF OP_DROP OP_ELSE 0x24 " +
            tx_id_vout +
            " OP_EQUALVERIFY OP_ENDIF OP_OVER OP_FROMALTSTACK OP_EQUALVERIFY OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_DUP OP_HASH160 OP_FROMALTSTACK OP_EQUALVERIFY OP_CHECKSIG OP_RETURN 0x05 0x33436f6465");
        return code;
    }
    static getHoldScript(address, flag) {
        const preScript = tbc.Script.buildPublicKeyHashOut(address);
        const flagHex = Buffer.from(`For Coin ${flag} NHold`, "utf8").toString("hex");
        const script = tbc.Script.fromASM(`${preScript.toASM()} OP_RETURN ${flagHex}`);
        return script;
    }
    static getTapeScript(data) {
        const dataHex = Buffer.from(JSON.stringify(data)).toString("hex");
        const tape = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${dataHex} 4e54617065`);
        return tape;
    }
    static updateTapeScript(tapeScript, newTotalSupply) {
        const data = tapeScript.chunks[tapeScript.chunks.length - 2].buf.toString("utf8");
        const jsonData = JSON.parse(data);
        jsonData.coinTotalSupply = newTotalSupply;
        const dataHex = Buffer.from(JSON.stringify(jsonData)).toString("hex");
        const script = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${dataHex} 4e54617065`);
        return script;
    }
}
module.exports = stableCoin;
