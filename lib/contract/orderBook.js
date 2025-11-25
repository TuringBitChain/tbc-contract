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
    makeSellOrder(holdAddress, saleVolume, unitPrice, feeRate, ftID, ftPartialHash, utxos) {
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
    makeSellOrder_privateKey(privateKey, saleVolume, unitPrice, feeRate, ftID, ftPartialHash, utxos) {
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
    makeBuyOrder(buyOrderTxRaw, sigs, publicKey, utxos, ftutxos, preTXs, prepreTxData) {
        const tx = new tbc.Transaction(buyOrderTxRaw);
        for (let i = 0; i < ftutxos.length; i++) {
            tx.setInputScript({
                inputIndex: i,
            }, (tx) => {
                const unlockingScript = FT.getFTunlock(sigs[i], publicKey, tx, preTXs[i], prepreTxData[i], i, ftutxos[i].outputIndex);
                return unlockingScript;
            });
        }
        for (let i = ftutxos.length; i < utxos.length; i++) {
            tx.setInputScript({
                inputIndex: i,
            }, tbc.Script.fromASM(`${sigs[i]} ${publicKey}`));
        }
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    preMakeBuyOrder(holdAddress, saleVolume, unitPrice, feeRate, ftID, ftPartialHash, ftTape, utxos, ftutxos, preTXs, prepreTxData) {
        this.type = "buy";
        this.hold_address = holdAddress;
        this.sale_volume = saleVolume;
        this.unit_price = unitPrice;
        this.fee_rate = feeRate;
        this.ft_a_contract_id = ftID;
        this.ft_a_contract_partialhash = ftPartialHash;
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
        const tapeAmountSetIn = [];
        let tapeAmountSum = BigInt(0);
        for (let i = 0; i < ftutxos.length; i++) {
            tapeAmountSetIn.push(ftutxos[i].ftBalance);
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
        }
        let { amountHex, changeHex } = FT.buildTapeAmount(saleVolume, tapeAmountSetIn);
        const ftCode = preTXs[0].outputs[ftutxos[0].outputIndex].script.toHex();
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
        if (saleVolume < tapeAmountSum) {
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
    makeBuyOrder_privateKey(privateKey, saleVolume, unitPrice, feeRate, ftID, ftPartialHash, ftTape, utxos, ftutxos, preTXs, prepreTxData) {
        const FTA = new FT(ftID);
        const holdAddress = privateKey.toAddress().toString();
        this.type = "buy";
        this.hold_address = holdAddress;
        this.sale_volume = saleVolume;
        this.unit_price = unitPrice;
        this.fee_rate = feeRate;
        this.ft_a_contract_id = ftID;
        this.ft_a_contract_partialhash = ftPartialHash;
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
        const tapeAmountSetIn = [];
        let tapeAmountSum = BigInt(0);
        for (let i = 0; i < ftutxos.length; i++) {
            tapeAmountSetIn.push(ftutxos[i].ftBalance);
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
        }
        let { amountHex, changeHex } = FT.buildTapeAmount(saleVolume, tapeAmountSetIn);
        const ftCode = preTXs[0].outputs[ftutxos[0].outputIndex].script.toHex();
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
        if (saleVolume < tapeAmountSum) {
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
                const unlockingScript = FTA.getFTunlock(privateKey, tx, preTXs[i], prepreTxData[i], i, ftutxos[i].outputIndex);
                return unlockingScript;
            });
        }
        tx.sign(privateKey);
        tx.seal();
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    matchOrder(buyutxo, ftutxo, preTX, prepreTxData, sellutxo, utxos, ftFeeAddress, tbcFeeAddress) { }
    getSellOrderCode() {
        const address = "14" + new tbc.Address(this.hold_address).hashBuffer.toString("hex");
        console.log(address);
        const sellOrderCode = tbc.Script.fromHex(`765187637556ba01207f77547f75817654958f01289351947901157f597f7701217f597f597f517f7701207f756b517f776b517f776b517f776b517f776b7654958f01289379816b7654958f0128935394796b54958f0127935294796b006b7600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575686ca87e6b007e7e7e7e7e7e7e7e7e7ea86c7e7eaa56ba01207f7588006b7600879163a86c7e7e6bbb6c7e7e6bbb6c7e7e6c6c75756b676d6d6d78767e6c6c6c7e7b7c886c55798194547901157f597f5879817c517f7781886c76537a517f77887c01217f6c76537a517f77887c597f6c76537a517f77887c597f6c76537a517f77887c517f7701207f756c7c886b6b6b6b6b6bbb6c7e7e6b68760119885279537f7701147f756c6c6c76547a8700886b6b6bbb6c7e7e6b760119885279537f7701147f756c6c6c76547a8700886b766b557981946b6bbb6c7e7e6b760119885279537f7701147f756c6c6c6c76557a8700886b6b5579819400886bbb6c7e7e6b5279021c0688768255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a935979021c068857798255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a936c6c6c6c765a79885f7988765a79517f7701147f758700885f79517f7701147f75886c6c527a9576527a95547988537a947b886ba86c7e7e6bbb6c7e7e6ba86c7e7e6bbb6c7e7ea857ba8867528876a9${address}88ad68516a19ffffffffffffffffffffffffffffffffffffffffffffffffff`);
        const sellOrderData = this.buildOrderData();
        return sellOrderCode.add(sellOrderData);
    }
    getBuyOrderCode() {
        const address = "14" + new tbc.Address(this.hold_address).hashBuffer.toString("hex");
        console.log(address);
        const buyOrderCode = tbc.Script.fromHex(`765187637556ba01207f77547f75817654958f01289351947901157f597f7701217f597f597f517f7701207f756b517f776b517f776b517f776b517f776b7654958f0128935394796b54958f0127935294796b006b7600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575686ca87e6b007e7e7e7e7e7e7e7e7e7ea86c7e7eaa56ba01207f7588006b760087636d6d6dbb6c7e7e6c6c75756b67577956797e6c6c6c7e7b7c885379021c0688788255947f054654617065886c6c765879886b6b537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a935679517f7701147f756b6b6ba86c7e7e6bbb6c7e7e6b527901157f597f6c6c537a517f7781886c6c76557a517f7788537a01217f6c76537a517f77887c597f6c76537a517f77887c597f6c76537a517f77887c517f7701207f756c7c886b6b6b6b6b6bbb6c6c5279a97c887e7e6b68760119885279537f7701147f756c6c76537a8700886b6bbb6c7e7e6b760119885279537f7701147f756c6c76537a8700886b5479816b6bbb6c7e7e6b760119885279537f7701147f756c6c6c76547a8878577981936c6c527995547a886c527a957c6b7c6b6b6bbb6c7e7e6b5279021c0688768255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a935979021c068857798255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a936c6c6c6c765a79885f7988765a79517f7701147f758700885f79517f7701147f7588537a94527a9400886ba86c7e7e6bbb6c7e7e6ba86c7e7e6bbb6c7e7ea857ba8867528876a9${address}88ad68516a0cffffffffffffffffffffffff`);
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
        console.log(newCodeScript.toASM());
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
