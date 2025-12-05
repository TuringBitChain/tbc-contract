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
const orderbookunlock_1 = require("../util/orderbookunlock");
const API = require("../api/api");
const FT = require("./ft");
const partial_sha256 = require("tbc-lib-js/lib/util/partial-sha256");
const BN = tbc.crypto.BN;
class OrderBook {
    type;
    hold_address;
    sale_volume;
    fee_rate;
    unit_price;
    sale_volume_number;
    fee_rate_number;
    unit_price_number;
    ft_a_contract_partialhash;
    ft_a_contract_id;
    contract_version;
    buy_code_dust = 300;
    precision = BigInt(1000000);
    constructor() {
        this.contract_version = 1;
    }
    buildSellOrderTX(holdAddress, saleVolume, unitPrice, feeRate, ftID, ftPartialHash, utxos) {
        this.type = "sell";
        this.hold_address = holdAddress;
        this.sale_volume = saleVolume;
        this.unit_price = unitPrice;
        this.fee_rate = feeRate;
        this.ft_a_contract_id = ftID;
        this.ft_a_contract_partialhash = ftPartialHash;
        const tx = new tbc.Transaction();
        tx.from(utxos);
        tx.addOutput(new tbc.Transaction.Output({
            script: this.getSellOrderCode(),
            satoshis: Number(saleVolume),
        }));
        tx.change(holdAddress);
        const txSize = tx.getEstimateSize();
        tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    buildCancelSellOrderTX(sellutxo, utxos) {
        const sellData = OrderBook.getOrderData(sellutxo.script);
        const tx = new tbc.Transaction();
        tx.from(sellutxo).from(utxos);
        tx.to(sellData.holdAddress, sellutxo.satoshis);
        tx.change(sellData.holdAddress);
        const txSize = tx.getEstimateSize();
        tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    fillSigsSellOrder(sellOrderTxRaw, sigs, publicKey, type) {
        const tx = new tbc.Transaction(sellOrderTxRaw);
        sigs.forEach((sig, i) => {
            const scriptASM = (type === "cancel" && i === 0)
                ? `${sig} ${publicKey} OP_2`
                : `${sig} ${publicKey}`;
            tx.setInputScript({ inputIndex: i }, tbc.Script.fromASM(scriptASM));
        });
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    buildBuyOrderTX(holdAddress, saleVolume, unitPrice, feeRate, ftID, utxos, ftutxos, preTXs) {
        this.type = "buy";
        this.hold_address = holdAddress;
        this.sale_volume = saleVolume;
        this.unit_price = unitPrice;
        this.fee_rate = feeRate;
        this.ft_a_contract_id = ftID;
        this.ft_a_contract_partialhash = partial_sha256.calculate_partial_hash(Buffer.from(ftutxos[0].script, "hex").subarray(0, 1856));
        const tx = new tbc.Transaction();
        tx.from(ftutxos);
        tx.from(utxos);
        // Buy Order Output
        const buyOrder = this.getBuyOrderCode();
        tx.addOutput(new tbc.Transaction.Output({
            script: buyOrder,
            satoshis: this.buy_code_dust,
        }));
        //FT Code Buy Output
        const ftAmount = (saleVolume * unitPrice) / this.precision;
        const tapeAmountSetIn = [];
        let tapeAmountSum = BigInt(0);
        for (let i = 0; i < ftutxos.length; i++) {
            tapeAmountSetIn.push(ftutxos[i].ftBalance);
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
        }
        let { amountHex, changeHex } = FT.buildTapeAmount(ftAmount, tapeAmountSetIn);
        const ftCode = ftutxos[0].script;
        const ftTape = preTXs[0].outputs[ftutxos[0].outputIndex + 1].script.toHex();
        const buyOrderHash160 = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(buyOrder.toBuffer())).toString("hex");
        const ftCodeBuy = FT.buildFTtransferCode(ftCode, buyOrderHash160);
        const ftTapeBuy = FT.buildFTtransferTape(ftTape, amountHex);
        const ftCodeDust = ftutxos[0].satoshis;
        tx.addOutput(new tbc.Transaction.Output({
            script: ftCodeBuy,
            satoshis: ftCodeDust,
        }));
        tx.addOutput(new tbc.Transaction.Output({
            script: ftTapeBuy,
            satoshis: 0,
        }));
        if (ftAmount < tapeAmountSum) {
            const ftCodeChange = FT.buildFTtransferCode(ftCode, holdAddress);
            const ftTapeChange = FT.buildFTtransferTape(ftTape, changeHex);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftCodeChange,
                satoshis: ftCodeDust,
            }));
            tx.addOutput(new tbc.Transaction.Output({
                script: ftTapeChange,
                satoshis: 0,
            }));
        }
        tx.change(holdAddress);
        const txSize = tx.getEstimateSize() + ftutxos.length * 2000;
        tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    buildCancelBuyOrderTX(buyutxo, ftutxo, ftPreTX, utxos) {
        const buyData = OrderBook.getOrderData(buyutxo.script);
        const tx = new tbc.Transaction();
        tx.from(buyutxo).from(ftutxo).from(utxos);
        const tapeAmountSetIn = [];
        tapeAmountSetIn.push(ftutxo.ftBalance);
        const tapeAmountSum = BigInt(tapeAmountSetIn[0]);
        const { amountHex, changeHex } = FT.buildTapeAmount(tapeAmountSum, tapeAmountSetIn, 1);
        if (changeHex !=
            "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000") {
            throw new Error("Change amount is not zero");
        }
        tx.addOutput(new tbc.Transaction.Output({
            script: FT.buildFTtransferCode(ftutxo.script, buyData.holdAddress),
            satoshis: ftutxo.satoshis,
        }));
        tx.addOutput(new tbc.Transaction.Output({
            script: FT.buildFTtransferTape(ftPreTX.outputs[ftutxo.outputIndex + 1].script.toHex(), amountHex),
            satoshis: 0,
        }));
        tx.change(buyData.holdAddress);
        const txSize = tx.getEstimateSize() + 2000;
        tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    fillSigsMakeBuyOrder(buyOrderTxRaw, sigs, publicKey, preTXs, prepreTxData) {
        const tx = new tbc.Transaction(buyOrderTxRaw);
        for (let i = 0; i < preTXs.length; i++) {
            tx.setInputScript({
                inputIndex: i,
            }, (tx) => {
                const unlockingScript = FT.getFTunlock(sigs[i], publicKey, tx, preTXs[i], prepreTxData[i], i, tx.inputs[i].outputIndex);
                return unlockingScript;
            });
        }
        for (let i = preTXs.length; i < tx.inputs.length; i++) {
            tx.setInputScript({
                inputIndex: i,
            }, tbc.Script.fromASM(`${sigs[i]} ${publicKey}`));
        }
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    fillSigsCancelBuyOrder(buyOrderTxRaw, sigs, publicKey, buyPreTX, ftPreTX, ftPrePreTxData) {
        const tx = new tbc.Transaction(buyOrderTxRaw);
        tx.setInputScript({
            inputIndex: 0,
        }, tbc.Script.fromASM(`${sigs[0]} ${publicKey} OP_2`));
        tx.setInputScript({
            inputIndex: 1,
        }, (tx) => {
            const unlockingScript = FT.getFTunlockSwap(sigs[1], publicKey, tx, ftPreTX, ftPrePreTxData, buyPreTX, 1, tx.inputs[1].outputIndex, 2);
            return unlockingScript;
        });
        for (let i = 2; i < tx.inputs.length; i++) {
            tx.setInputScript({
                inputIndex: i,
            }, tbc.Script.fromASM(`${sigs[i]} ${publicKey}`));
        }
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    makeSellOrder_privateKey(privateKey, saleVolume, unitPrice, feeRate, ftID, ftPartialHash, utxos) {
        // const holdAddress = "1Ntohi19LEcLcijug8n42njYKNjSgHuQdq";
        const holdAddress = privateKey.toAddress().toString();
        this.type = "sell";
        this.hold_address = holdAddress;
        this.sale_volume = saleVolume;
        this.unit_price = unitPrice;
        this.fee_rate = feeRate;
        this.ft_a_contract_id = ftID;
        this.ft_a_contract_partialhash = ftPartialHash;
        const tx = new tbc.Transaction();
        tx.from(utxos);
        tx.addOutput(new tbc.Transaction.Output({
            script: this.getSellOrderCode(),
            satoshis: Number(saleVolume),
        }));
        tx.change(holdAddress);
        const txSize = tx.getEstimateSize();
        tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));
        tx.sign(privateKey);
        tx.seal();
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    cancelSellOrder_privateKey(privateKey, sellutxo, utxos) {
        const sellData = OrderBook.getOrderData(sellutxo.script);
        const tx = new tbc.Transaction();
        tx.from(sellutxo).from(utxos);
        tx.to(sellData.holdAddress, sellutxo.satoshis);
        tx.change(sellData.holdAddress);
        const txSize = tx.getEstimateSize();
        tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));
        tx.setInputScript({
            inputIndex: 0,
        }, (tx) => {
            const sig = tx.getSignature(0, privateKey);
            const pubKey = privateKey.toPublicKey().toString();
            return tbc.Script.fromASM(`${sig} ${pubKey} OP_2`);
        });
        tx.sign(privateKey);
        tx.seal();
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    makeBuyOrder_privateKey(privateKey, saleVolume, unitPrice, feeRate, ftID, utxos, ftutxos, preTXs, prepreTxData) {
        // const holdAddress = "15MjMwGFvV2B9GanCYpzRupykryJ4A1Lp1";
        const holdAddress = privateKey.toAddress().toString();
        this.type = "buy";
        this.hold_address = holdAddress;
        this.sale_volume = saleVolume;
        this.unit_price = unitPrice;
        this.fee_rate = feeRate;
        this.ft_a_contract_id = ftID;
        this.ft_a_contract_partialhash = partial_sha256.calculate_partial_hash(Buffer.from(ftutxos[0].script, "hex").subarray(0, 1856));
        const tx = new tbc.Transaction();
        tx.from(ftutxos);
        tx.from(utxos);
        // Buy Order Output
        const buyOrder = this.getBuyOrderCode();
        tx.addOutput(new tbc.Transaction.Output({
            script: buyOrder,
            satoshis: this.buy_code_dust,
        }));
        //FT Code Buy Output
        const ftAmount = (saleVolume * unitPrice) / this.precision;
        const tapeAmountSetIn = [];
        let tapeAmountSum = BigInt(0);
        for (let i = 0; i < ftutxos.length; i++) {
            tapeAmountSetIn.push(ftutxos[i].ftBalance);
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
        }
        let { amountHex, changeHex } = FT.buildTapeAmount(ftAmount, tapeAmountSetIn);
        const ftCode = ftutxos[0].script;
        const ftTape = preTXs[0].outputs[ftutxos[0].outputIndex + 1].script.toHex();
        const buyOrderHash160 = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(buyOrder.toBuffer())).toString("hex");
        const ftCodeBuy = FT.buildFTtransferCode(ftCode, buyOrderHash160);
        const ftTapeBuy = FT.buildFTtransferTape(ftTape, amountHex);
        const ftCodeDust = ftutxos[0].satoshis;
        tx.addOutput(new tbc.Transaction.Output({
            script: ftCodeBuy,
            satoshis: ftCodeDust,
        }));
        tx.addOutput(new tbc.Transaction.Output({
            script: ftTapeBuy,
            satoshis: 0,
        }));
        if (ftAmount < tapeAmountSum) {
            const ftCodeChange = FT.buildFTtransferCode(ftCode, holdAddress);
            const ftTapeChange = FT.buildFTtransferTape(ftTape, changeHex);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftCodeChange,
                satoshis: ftCodeDust,
            }));
            tx.addOutput(new tbc.Transaction.Output({
                script: ftTapeChange,
                satoshis: 0,
            }));
        }
        tx.change(holdAddress);
        // const txSize = tx.getEstimateSize();
        // tx.fee(txSize < 1000 ? 80 : Math.ceil(txSize / 1000 * 80));
        tx.feePerKb(80);
        for (let i = 0; i < ftutxos.length; i++) {
            tx.setInputScript({
                inputIndex: i,
            }, (tx) => {
                const unlockingScript = new FT(ftID).getFTunlock(privateKey, tx, preTXs[i], prepreTxData[i], i, ftutxos[i].outputIndex);
                return unlockingScript;
            });
        }
        tx.sign(privateKey);
        tx.seal();
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    cancelBuyOrder_privateKey(privateKey, buyutxo, buyPreTX, ftutxo, ftPreTX, ftPrePreTxData, utxos) {
        const buyData = OrderBook.getOrderData(buyutxo.script);
        const tx = new tbc.Transaction();
        tx.from(buyutxo).from(ftutxo).from(utxos);
        const tapeAmountSetIn = [];
        tapeAmountSetIn.push(ftutxo.ftBalance);
        const tapeAmountSum = BigInt(tapeAmountSetIn[0]);
        const { amountHex, changeHex } = FT.buildTapeAmount(tapeAmountSum, tapeAmountSetIn, 1);
        if (changeHex !=
            "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000") {
            throw new Error("Change amount is not zero");
        }
        tx.addOutput(new tbc.Transaction.Output({
            script: FT.buildFTtransferCode(ftutxo.script, buyData.holdAddress),
            satoshis: ftutxo.satoshis,
        }));
        tx.addOutput(new tbc.Transaction.Output({
            script: FT.buildFTtransferTape(ftPreTX.outputs[ftutxo.outputIndex + 1].script.toHex(), amountHex),
            satoshis: 0,
        }));
        tx.change(buyData.holdAddress);
        tx.feePerKb(80);
        tx.setInputScript({
            inputIndex: 0,
        }, (tx) => {
            const sig = tx.getSignature(0, privateKey);
            const pubKey = privateKey.toPublicKey().toString();
            return tbc.Script.fromASM(`${sig} ${pubKey} OP_2`);
        });
        tx.setInputScript({
            inputIndex: 1,
        }, (tx) => {
            const unlockingScript = new FT(buyData.ftID).getFTunlockSwap(privateKey, tx, ftPreTX, ftPrePreTxData, buyPreTX, 1, ftutxo.outputIndex, 2);
            return unlockingScript;
        });
        tx.sign(privateKey);
        tx.seal();
        console.log(tx.verify());
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    matchOrder(privateKey, buyutxo, buyPreTX, ftutxo, ftPreTX, ftPrePreTxData, sellutxo, sellPreTX, utxos, ftFeeAddress, tbcFeeAddress) {
        const buyData = OrderBook.getOrderData(buyutxo.script);
        const sellData = OrderBook.getOrderData(sellutxo.script);
        //计算，默认精度6
        const buyOrderTBCAmount = buyData.saleVolume; //买单的tbc数量
        const sellOrderTBCAmount = sellData.saleVolume; //卖单的tbc数量
        const matchedTBCAmount = buyOrderTBCAmount < sellOrderTBCAmount
            ? buyOrderTBCAmount
            : sellOrderTBCAmount;
        console.log("Matched TBC Amount:", matchedTBCAmount);
        const tbcSellAmount = matchedTBCAmount; //tbcSellAmount是卖出tbc总数量
        const tbcTaxAmount = (tbcSellAmount * buyData.feeRate) / this.precision; //tbcTaxAmount是卖家扣除的手续费数量
        const tbcBuyerAmount = tbcSellAmount - tbcTaxAmount; //tbcBuyerAmount是买家实际收到的tbc数量
        const newSellOrderTBCAmount = sellOrderTBCAmount - matchedTBCAmount; //卖单剩余tbc数量
        console.log("tbcSellAmount, tbcTaxAmount, tbcBuyerAmount, newSellOrderTBCAmount", tbcSellAmount, tbcTaxAmount, tbcBuyerAmount, newSellOrderTBCAmount);
        const ftPayAmount = (tbcSellAmount * sellData.unitPrice) / this.precision; //ftPayAmount是支付ft总数量
        const ftTaxAmount = (ftPayAmount * sellData.feeRate) / this.precision; //ftTaxAmount是买家扣除的手续费数量
        const ftSellerAmount = ftPayAmount - ftTaxAmount; //ftSellerAmount是卖家实际收到的ft数量
        const newBuyOrderTBCAmount = buyOrderTBCAmount - matchedTBCAmount; //买单剩余tbc数量
        console.log("ftPayAmount, ftTaxAmount, ftSellerAmount, newBuyOrderTBCAmount", ftPayAmount, ftTaxAmount, ftSellerAmount, newBuyOrderTBCAmount);
        //构建交易
        const tx = new tbc.Transaction();
        tx.from(buyutxo).from(ftutxo).from(sellutxo).from(utxos);
        //处理ft输出
        const tapeAmountSetIn = [];
        tapeAmountSetIn.push(ftutxo.ftBalance);
        console.log("FT Balance:", ftutxo.ftBalance);
        const tapeAmountSum = BigInt(tapeAmountSetIn[0]);
        const { amountHex: ftSellerAmountHex, changeHex: noUseHex } = FT.buildTapeAmount(ftSellerAmount, tapeAmountSetIn, 1);
        tapeAmountSetIn.pop();
        tapeAmountSetIn.push(ftutxo.ftBalance - ftSellerAmount);
        let { amountHex: ftTaxAmountHex, changeHex } = FT.buildTapeAmount(ftTaxAmount, tapeAmountSetIn, 1);
        //**********FT Seller输出**********
        const ftTape = ftPreTX.outputs[ftutxo.outputIndex + 1].script.toHex();
        tx.addOutput(new tbc.Transaction.Output({
            script: FT.buildFTtransferCode(ftutxo.script, sellData.holdAddress),
            satoshis: ftutxo.satoshis,
        }));
        tx.addOutput(new tbc.Transaction.Output({
            script: FT.buildFTtransferTape(ftTape, ftSellerAmountHex),
            satoshis: 0,
        }));
        //**********FT Tax输出**********
        tx.addOutput(new tbc.Transaction.Output({
            script: FT.buildFTtransferCode(ftutxo.script, ftFeeAddress),
            satoshis: ftutxo.satoshis,
        }));
        tx.addOutput(new tbc.Transaction.Output({
            script: FT.buildFTtransferTape(ftTape, ftTaxAmountHex),
            satoshis: 0,
        }));
        //**********TBC Buyer输出**********
        tx.to(buyData.holdAddress, Number(tbcBuyerAmount));
        //**********TBC Tax输出**********
        tx.to(tbcFeeAddress, Number(tbcTaxAmount));
        //**********交易手续费找零**********
        let inputsFee = 0;
        for (const utxo of utxos) {
            inputsFee += utxo.satoshis;
        }
        console.log("UTXOs Total Satoshis:", tx.getUnspentValue());
        console.log("Inputs Value:", inputsFee);
        const txSize = tx.getEstimateSize() + 2 * 1000 + 2000;
        const fee = txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80);
        console.log("tx fee", fee);
        tx.to(tbc.Script.fromHex(utxos[0].script).toAddress().toString(), inputsFee - fee - 1300);
        // tx.change(tbc.Script.fromHex(utxos[0].script).toAddress().toString());
        //部分成交
        if (newSellOrderTBCAmount > 0n) {
            //卖单部分成交
            //**********SELL CHANGE输出**********
            tx.addOutput(new tbc.Transaction.Output({
                script: OrderBook.updateSaleVolume(sellutxo.script, newSellOrderTBCAmount),
                satoshis: Number(newSellOrderTBCAmount),
            }));
        }
        else if (newBuyOrderTBCAmount > 0n && tapeAmountSum - ftPayAmount > 0n) {
            //买单部分成交
            //**********BUY CHANGE输出**********
            const newBuyOrderCodeScript = OrderBook.updateSaleVolume(buyutxo.script, newBuyOrderTBCAmount);
            tx.addOutput(new tbc.Transaction.Output({
                script: newBuyOrderCodeScript,
                satoshis: this.buy_code_dust,
            }));
            //**********FT CHANGE输出**********
            tx.addOutput(new tbc.Transaction.Output({
                script: FT.buildFTtransferCode(ftutxo.script, tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(newBuyOrderCodeScript.toBuffer())).toString("hex")),
                satoshis: ftutxo.satoshis,
            }));
            tx.addOutput(new tbc.Transaction.Output({
                script: FT.buildFTtransferTape(ftTape, changeHex),
                satoshis: 0,
            }));
        }
        //设置解锁脚本
        tx.setInputScript({
            inputIndex: 0,
        }, (tx) => {
            const unlockingScript = this.getOrderUnlock(tx, buyPreTX, buyutxo.outputIndex);
            return unlockingScript;
        });
        tx.setInputScript({
            inputIndex: 1,
        }, (tx) => {
            const unlockingScript = new FT(buyData.ftID).getFTunlockSwap(privateKey, tx, ftPreTX, ftPrePreTxData, buyPreTX, 1, ftutxo.outputIndex, 2);
            return unlockingScript;
        });
        tx.setInputScript({
            inputIndex: 2,
        }, (tx) => {
            const unlockingScript = this.getOrderUnlock(tx, sellPreTX, sellutxo.outputIndex);
            return unlockingScript;
        });
        // tx.feePerKb(80);
        // const txSize = tx.getEstimateSize() + 3 * 2000;
        console.log("tx fee", tx.getFee());
        // tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));
        tx.sign(privateKey);
        tx.seal();
        console.log(tx.toObject());
        // console.log(tx.verifyScript(0));
        console.log(tx.verify());
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    getOrderUnlock(currentTX, preTX, preTxVout) {
        const preTxData = (0, orderbookunlock_1.getPreTxdata)(preTX, preTxVout, 1);
        const currentTxData = (0, orderbookunlock_1.getCurrentTxOutputsData)(currentTX);
        const optionHex = "51";
        const unlockingScript = tbc.Script.fromHex(`${currentTxData}${preTxData}${optionHex}`);
        // console.log("Unlocking Script:", unlockingScript.toASM());
        return unlockingScript;
    }
    getSellOrderCode() {
        const address = "14" + new tbc.Address(this.hold_address).hashBuffer.toString("hex");
        const sellOrderCode = tbc.Script.fromHex(`765187637556ba01207f77547f75817654958f01289351947901157f597f7701217f597f597f517f7701207f756b517f77816b517f77816b517f776b517f776b7654958f01289379816b7654958f0128935394796b54958f0127935294796b006b7600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575686ca87e6b007e7e7e7e7e7e7e7e7e7ea86c7e7eaa56ba01207f7588006b7600879163a86c7e7e6bbb6c7e7e6bbb6c7e7e6c6c75756b676d6d6d760087916378787e6c6c6c7e7b7c886c55798194547901157f597f5879527a517f77886c76537a517f77887c01217f6c76537a517f77887c597f6c76537a517f7781887c597f6c76537a517f7781887c517f7701207f756c7c886b6b6b6b6b6bbb6c7e7e6b676d6d6c6c6c75756b6868760119885279537f7701147f756c6c6c76547a8700886b6b6bbb6c7e7e6b760119885279537f7701147f756c6c6c76547a8700886b766b557981946b6bbb6c7e7e6b760119885279537f7701147f756c6c6c6c76557a8700886b6b5579819400886bbb6c7e7e6b5279025c0788768255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a935979025c078857798255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a936c6c6c6c765a79885f7988765a79517f7701147f758700885f79517f7701147f75886c6c527a950340420f9676527a950340420f96547988537a947b886ba86c7e7e6bbb6c7e7e6ba86c7e7e6bbb6c7e7ea857ba8867528876a9${address}88ad68516a33ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`);
        const sellOrderData = this.buildOrderData();
        return sellOrderCode.add(sellOrderData);
    }
    getBuyOrderCode() {
        const address = "14" + new tbc.Address(this.hold_address).hashBuffer.toString("hex");
        const buyOrderCode = tbc.Script.fromHex(`765187637556ba01207f77547f75817654958f01289351947901157f597f7701217f597f597f517f7701207f756b517f77816b517f77816b517f776b517f776b7654958f0128935394796b54958f0127935294796b006b7600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575686ca87e6b007e7e7e7e7e7e7e7e7e7ea86c7e7eaa56ba01207f7588006b760087636d6d6d7600879163bb6c7e7e676d6d6c686c6c75756b67577957797e6c6c6c7e7b7c885379025c0788788255947f054654617065886c6c765879886b6b537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a935679517f7701147f756b6b6ba86c7e7e6bbb6c7e7e6b527901157f597f6c6c6c6c76577a517f7788547a01217f6c76537a517f77887c597f6c76537a517f7781887c597f6c76537a517f7781767c88527a517f7701207f756c7c88587a517f7781517a950340420f96567a7c886b6b6b6b6b6bbb6c6c5279a97c887e7e6b68760119885279537f7701147f756c6c76537a8700886b6bbb6c7e7e6b760119885279537f7701147f756c6c76537a8700886b5479816b6bbb6c7e7e6b760119885279537f7701147f756c6c6c76547a8878577981936c6c5279950340420f96547a886c527a950340420f967c6b7c6b6b6bbb6c7e7e6b5279025c0788768255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a935979025c078857798255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a936c6c6c6c765a79885f7988765a79517f7701147f758700885f79517f7701147f75870088537a94527a9400886ba86c7e7e6bbb6c7e7e6ba86c7e7e6bbb6c7e7ea857ba8867528876a9${address}88ad68516a1affffffffffffffffffffffffffffffffffffffffffffffffffff`);
        const buyOrderData = this.buildOrderData();
        return buyOrderCode.add(buyOrderData);
    }
    buildOrderData() {
        const amountLength = "08";
        const addressLength = "14";
        const hashLength = "20";
        const writer = new tbc.encoding.BufferWriter();
        writer.write(Buffer.from(addressLength, "hex"));
        writer.write(Buffer.from(new tbc.Address(this.hold_address).hashBuffer.toString("hex"), "hex"));
        writer.write(Buffer.from(amountLength, "hex"));
        const saleVolumeBN = new BN(this.sale_volume.toString());
        writer.writeUInt64LEBN(saleVolumeBN);
        writer.write(Buffer.from(hashLength, "hex"));
        writer.write(Buffer.from(this.ft_a_contract_partialhash, "hex"));
        writer.write(Buffer.from(amountLength, "hex"));
        const feeRateBN = new BN(this.fee_rate.toString());
        writer.writeUInt64LEBN(feeRateBN);
        writer.write(Buffer.from(amountLength, "hex"));
        const unitPriceBN = new BN(this.unit_price.toString());
        writer.writeUInt64LEBN(unitPriceBN);
        writer.write(Buffer.from(hashLength, "hex"));
        writer.write(Buffer.from(this.ft_a_contract_id, "hex"));
        const sellOrderData = tbc.Script.fromBuffer(writer.toBuffer());
        return sellOrderData;
    }
    static updateSaleVolume(codeScript, newSaleVolume) {
        const script = tbc.Script.fromHex(codeScript);
        const dataStartIndex = script.chunks.length - 6;
        const newSaleVolumeBN = new BN(newSaleVolume.toString());
        const newSaleVolumeBuf = new tbc.encoding.BufferWriter()
            .writeUInt64LEBN(newSaleVolumeBN)
            .toBuffer();
        script.chunks[dataStartIndex + 1].buf = newSaleVolumeBuf;
        const newCodeScript = tbc.Script.fromASM(script.toASM());
        return newCodeScript;
    }
    static getOrderData(codeScript) {
        const script = tbc.Script.fromHex(codeScript);
        const dataStartIndex = script.chunks.length - 6;
        const holdAddressHash = script.chunks[dataStartIndex].buf.toString("hex");
        const holdAddress = tbc.Address.fromHex("00" + holdAddressHash).toString();
        // console.log(holdAddressHash, holdAddress);
        const saleVolume = BigInt(new BN(script.chunks[dataStartIndex + 1].buf, 10, "le").toString());
        const ftPartialHash = script.chunks[dataStartIndex + 2].buf.toString("hex");
        const feeRate = BigInt(new BN(script.chunks[dataStartIndex + 3].buf, 10, "le").toString());
        const unitPrice = BigInt(new BN(script.chunks[dataStartIndex + 4].buf, 10, "le").toString());
        const ftID = script.chunks[dataStartIndex + 5].buf.toString("hex");
        // console.log(saleVolume, ftPartialHash, feeRate, unitPrice, ftID);
        return {
            holdAddress: holdAddress,
            saleVolume: saleVolume,
            ftPartialHash: ftPartialHash,
            feeRate: feeRate,
            unitPrice: unitPrice,
            ftID: ftID,
        };
    }
}
module.exports = OrderBook;
