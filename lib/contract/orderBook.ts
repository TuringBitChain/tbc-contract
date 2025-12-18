import * as tbc from "tbc-lib-js";
import {
  getPreTxdata,
  getCurrentTxOutputsData,
  getLengthHex,
} from "../util/orderbookunlock";
import { buildUTXO, fetchInBatches } from "../util/util";
const API = require("../api/api");
const FT = require("./ft");
const partial_sha256 = require("tbc-lib-js/lib/util/partial-sha256");
const BN = tbc.crypto.BN;
const ft_v1_length = 1564;
const ft_v1_partial_offset = 1536;
const ft_v2_length = 1884;
const ft_v2_partial_offset = 1856;
const utxoFee = 0.01;

class OrderBook {
  type: "buy" | "sell";
  hold_address: string;
  sale_volume: bigint;
  fee_rate: bigint;
  unit_price: bigint;
  sale_volume_number: number;
  fee_rate_number: number;
  unit_price_number: number;
  ft_a_contract_partialhash: string;
  ft_a_contract_id: string;

  contract_version: number;
  private buy_code_dust = 300;
  private precision = BigInt(1000000);

  constructor() {
    this.contract_version = 1;
  }

  buildSellOrderTX(
    holdAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftID: string,
    ftPartialHash: string,
    utxos: tbc.Transaction.IUnspentOutput[]
  ): string {
    if (!tbc.Address.isValid(holdAddress))
      throw new Error("Invalid HoldAddress");
    if (!_isPositiveBigInt(saleVolume) || !_isPositiveBigInt(unitPrice))
      throw new Error("SaleVolume and UnitPrice must be positive bigint");
    if (_isNegativeBigInt(feeRate))
      throw new Error("FeeRate must be non-negative bigint");
    if (!_isValidSHA256Hash(ftID) || !_isValidSHA256Hash(ftPartialHash))
      throw new Error(
        "FTID and FTPartialHash must be valid SHA256 hash strings"
      );

    this.type = "sell";
    this.hold_address = holdAddress;
    this.sale_volume = saleVolume;
    this.unit_price = unitPrice;
    this.fee_rate = feeRate;
    this.ft_a_contract_id = ftID;
    this.ft_a_contract_partialhash = ftPartialHash;

    const tx = new tbc.Transaction();
    tx.from(utxos);
    tx.addOutput(
      new tbc.Transaction.Output({
        script: this.getSellOrderCode(),
        satoshis: Number(saleVolume),
      })
    );
    tx.change(holdAddress);
    const txSize = tx.getEstimateSize();
    tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));
    const txraw = tx.uncheckedSerialize();
    return txraw;
  }

  buildCancelSellOrderTX(
    sellutxo: tbc.Transaction.IUnspentOutput,
    utxos: tbc.Transaction.IUnspentOutput[]
  ): string {
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

  fillSigsSellOrder(
    sellOrderTxRaw: string,
    sigs: string[],
    publicKey: string,
    type: "make" | "cancel"
  ): string {
    if (!_isValidHexString(sellOrderTxRaw))
      throw new Error("Invalid SellOrderTxRaw hex string");
    if (!tbc.PublicKey.isValid(publicKey)) throw new Error("Invalid PublicKey");
    if (!Array.isArray(sigs) || sigs.some((sig) => !_isValidHexString(sig)))
      throw new Error("Invalid Signatures array");

    const tx = new tbc.Transaction(sellOrderTxRaw);

    sigs.forEach((sig, i) => {
      const scriptASM =
        type === "cancel" && i === 0
          ? `${sig} ${publicKey} OP_2`
          : `${sig} ${publicKey}`;

      tx.setInputScript({ inputIndex: i }, tbc.Script.fromASM(scriptASM));
    });
    const txraw = tx.uncheckedSerialize();
    return txraw;
  }

  buildBuyOrderTX(
    holdAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftID: string,
    utxos: tbc.Transaction.IUnspentOutput[],
    ftutxos: tbc.Transaction.IUnspentOutput[],
    preTXs: tbc.Transaction[]
  ): string {
    if (!tbc.Address.isValid(holdAddress))
      throw new Error("Invalid HoldAddress");
    if (!_isPositiveBigInt(saleVolume) || !_isPositiveBigInt(unitPrice))
      throw new Error("SaleVolume and UnitPrice must be positive bigint");
    if (_isNegativeBigInt(feeRate))
      throw new Error("FeeRate must be non-negative bigint");
    if (!_isValidSHA256Hash(ftID))
      throw new Error("FTID must be a valid SHA256 hash string");

    this.type = "buy";
    this.hold_address = holdAddress;
    this.sale_volume = saleVolume;
    this.unit_price = unitPrice;
    this.fee_rate = feeRate;
    this.ft_a_contract_id = ftID;
    this.ft_a_contract_partialhash = partial_sha256.calculate_partial_hash(
      Buffer.from(ftutxos[0].script, "hex").subarray(0, 1856)
    );

    const tx = new tbc.Transaction();
    tx.from(ftutxos);
    tx.from(utxos);

    // Buy Order Output
    const buyOrder = this.getBuyOrderCode();
    tx.addOutput(
      new tbc.Transaction.Output({
        script: buyOrder,
        satoshis: this.buy_code_dust,
      })
    );

    //FT Code Buy Output
    const ftAmount = (saleVolume * unitPrice) / this.precision;
    const tapeAmountSetIn: bigint[] = [];
    let tapeAmountSum = BigInt(0);
    for (let i = 0; i < ftutxos.length; i++) {
      tapeAmountSetIn.push(ftutxos[i].ftBalance!);
      tapeAmountSum += BigInt(tapeAmountSetIn[i]);
    }
    let { amountHex, changeHex } = FT.buildTapeAmount(
      ftAmount,
      tapeAmountSetIn
    );
    const ftCode = ftutxos[0].script;
    const ftTape = preTXs[0].outputs[ftutxos[0].outputIndex + 1].script.toHex();
    const buyOrderHash160 = tbc.crypto.Hash.sha256ripemd160(
      tbc.crypto.Hash.sha256(buyOrder.toBuffer())
    ).toString("hex");
    const ftCodeBuy = FT.buildFTtransferCode(ftCode, buyOrderHash160);
    const ftTapeBuy = FT.buildFTtransferTape(ftTape, amountHex);
    const ftCodeDust = ftutxos[0].satoshis;
    tx.addOutput(
      new tbc.Transaction.Output({
        script: ftCodeBuy,
        satoshis: ftCodeDust,
      })
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: ftTapeBuy,
        satoshis: 0,
      })
    );

    if (ftAmount < tapeAmountSum) {
      const ftCodeChange = FT.buildFTtransferCode(ftCode, holdAddress);
      const ftTapeChange = FT.buildFTtransferTape(ftTape, changeHex);
      tx.addOutput(
        new tbc.Transaction.Output({
          script: ftCodeChange,
          satoshis: ftCodeDust,
        })
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: ftTapeChange,
          satoshis: 0,
        })
      );
    }

    tx.change(holdAddress);
    const txSize = tx.getEstimateSize() + ftutxos.length * 2000;
    tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));
    const txraw = tx.uncheckedSerialize();
    return txraw;
  }

  buildCancelBuyOrderTX(
    buyutxo: tbc.Transaction.IUnspentOutput,
    ftutxo: tbc.Transaction.IUnspentOutput,
    ftPreTX: tbc.Transaction,
    utxos: tbc.Transaction.IUnspentOutput[]
  ): string {
    const buyData = OrderBook.getOrderData(buyutxo.script);
    const tx = new tbc.Transaction();
    tx.from(buyutxo).from(ftutxo).from(utxos);

    const tapeAmountSetIn: bigint[] = [];
    tapeAmountSetIn.push(ftutxo.ftBalance!);
    const tapeAmountSum = BigInt(tapeAmountSetIn[0]);
    const { amountHex, changeHex } = FT.buildTapeAmount(
      tapeAmountSum,
      tapeAmountSetIn,
      1
    );
    if (
      changeHex !=
      "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
    ) {
      throw new Error("Change amount is not zero");
    }

    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferCode(ftutxo.script, buyData.holdAddress),
        satoshis: ftutxo.satoshis,
      })
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferTape(
          ftPreTX.outputs[ftutxo.outputIndex + 1].script.toHex(),
          amountHex
        ),
        satoshis: 0,
      })
    );
    tx.change(buyData.holdAddress);
    const txSize = tx.getEstimateSize() + 2000;
    tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));
    const txraw = tx.uncheckedSerialize();
    return txraw;
  }

  fillSigsMakeBuyOrder(
    buyOrderTxRaw: string,
    sigs: string[],
    publicKey: string,
    preTXs: tbc.Transaction[],
    prepreTxData: string[]
  ): string {
    if (!_isValidHexString(buyOrderTxRaw))
      throw new Error("Invalid BuyOrderTxRaw hex string");
    if (!tbc.PublicKey.isValid(publicKey)) throw new Error("Invalid PublicKey");
    if (!Array.isArray(sigs) || sigs.some((sig) => !_isValidHexString(sig)))
      throw new Error("Invalid Signatures array");
    if (prepreTxData.some((data) => !_isValidHexString(data)))
      throw new Error("Invalid PrePreTxData array");

    const tx = new tbc.Transaction(buyOrderTxRaw);

    for (let i = 0; i < preTXs.length; i++) {
      tx.setInputScript(
        {
          inputIndex: i,
        },
        (tx) => {
          const unlockingScript = FT.getFTunlock(
            sigs[i],
            publicKey,
            tx,
            preTXs[i],
            prepreTxData[i],
            i,
            tx.inputs[i].outputIndex
          );
          return unlockingScript;
        }
      );
    }

    for (let i = preTXs.length; i < tx.inputs.length; i++) {
      tx.setInputScript(
        {
          inputIndex: i,
        },
        tbc.Script.fromASM(`${sigs[i]} ${publicKey}`)
      );
    }

    const txraw = tx.uncheckedSerialize();
    return txraw;
  }

  fillSigsCancelBuyOrder(
    buyOrderTxRaw: string,
    sigs: string[],
    publicKey: string,
    buyPreTX: tbc.Transaction,
    ftPreTX: tbc.Transaction,
    ftPrePreTxData: string
  ): string {
    if (!_isValidHexString(buyOrderTxRaw))
      throw new Error("Invalid BuyOrderTxRaw hex string");
    if (!tbc.PublicKey.isValid(publicKey)) throw new Error("Invalid PublicKey");
    if (!Array.isArray(sigs) || sigs.some((sig) => !_isValidHexString(sig)))
      throw new Error("Invalid Signatures array");
    if (!_isValidHexString(ftPrePreTxData))
      throw new Error("Invalid FtPrePreTxData string");

    const tx = new tbc.Transaction(buyOrderTxRaw);

    tx.setInputScript(
      {
        inputIndex: 0,
      },
      tbc.Script.fromASM(`${sigs[0]} ${publicKey} OP_2`)
    );

    tx.setInputScript(
      {
        inputIndex: 1,
      },
      (tx) => {
        const unlockingScript = FT.getFTunlockSwap(
          sigs[1],
          publicKey,
          tx,
          ftPreTX,
          ftPrePreTxData,
          buyPreTX,
          1,
          tx.inputs[1].outputIndex,
          2
        );
        return unlockingScript;
      }
    );

    for (let i = 2; i < tx.inputs.length; i++) {
      tx.setInputScript(
        {
          inputIndex: i,
        },
        tbc.Script.fromASM(`${sigs[i]} ${publicKey}`)
      );
    }

    const txraw = tx.uncheckedSerialize();
    return txraw;
  }

  makeSellOrder_privateKey(
    privateKey: tbc.PrivateKey,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftID: string,
    ftPartialHash: string,
    utxos: tbc.Transaction.IUnspentOutput[]
  ) {
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
    tx.addOutput(
      new tbc.Transaction.Output({
        script: this.getSellOrderCode(),
        satoshis: Number(saleVolume),
      })
    );
    tx.change(holdAddress);
    const txSize = tx.getEstimateSize();
    tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));
    tx.sign(privateKey);
    tx.seal();
    const txraw = tx.uncheckedSerialize();
    return txraw;
  }

  cancelSellOrder_privateKey(
    privateKey: tbc.PrivateKey,
    sellutxo: tbc.Transaction.IUnspentOutput,
    utxos: tbc.Transaction.IUnspentOutput[]
  ) {
    const sellData = OrderBook.getOrderData(sellutxo.script);
    const tx = new tbc.Transaction();
    tx.from(sellutxo).from(utxos);
    tx.to(sellData.holdAddress, sellutxo.satoshis);
    tx.change(sellData.holdAddress);
    const txSize = tx.getEstimateSize();
    tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));
    tx.setInputScript(
      {
        inputIndex: 0,
      },
      (tx) => {
        const sig = tx.getSignature(0, privateKey);
        const pubKey = privateKey.toPublicKey().toString();
        return tbc.Script.fromASM(`${sig} ${pubKey} OP_2`);
      }
    );
    tx.sign(privateKey);
    tx.seal();
    const txraw = tx.uncheckedSerialize();
    return txraw;
  }

  makeBuyOrder_privateKey(
    privateKey: tbc.PrivateKey,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftID: string,
    utxos: tbc.Transaction.IUnspentOutput[],
    ftutxos: tbc.Transaction.IUnspentOutput[],
    preTXs: tbc.Transaction[],
    prepreTxData: string[]
  ) {
    // const holdAddress = "15MjMwGFvV2B9GanCYpzRupykryJ4A1Lp1";
    const holdAddress = privateKey.toAddress().toString();
    this.type = "buy";
    this.hold_address = holdAddress;
    this.sale_volume = saleVolume;
    this.unit_price = unitPrice;
    this.fee_rate = feeRate;
    this.ft_a_contract_id = ftID;
    this.ft_a_contract_partialhash = partial_sha256.calculate_partial_hash(
      Buffer.from(ftutxos[0].script, "hex").subarray(0, 1856)
    );

    const tx = new tbc.Transaction();
    tx.from(ftutxos);
    tx.from(utxos);

    // Buy Order Output
    const buyOrder = this.getBuyOrderCode();
    tx.addOutput(
      new tbc.Transaction.Output({
        script: buyOrder,
        satoshis: this.buy_code_dust,
      })
    );

    //FT Code Buy Output
    const ftAmount = (saleVolume * unitPrice) / this.precision;
    const tapeAmountSetIn: bigint[] = [];
    let tapeAmountSum = BigInt(0);
    for (let i = 0; i < ftutxos.length; i++) {
      tapeAmountSetIn.push(ftutxos[i].ftBalance!);
      tapeAmountSum += BigInt(tapeAmountSetIn[i]);
    }
    let { amountHex, changeHex } = FT.buildTapeAmount(
      ftAmount,
      tapeAmountSetIn
    );
    const ftCode = ftutxos[0].script;
    const ftTape = preTXs[0].outputs[ftutxos[0].outputIndex + 1].script.toHex();
    const buyOrderHash160 = tbc.crypto.Hash.sha256ripemd160(
      tbc.crypto.Hash.sha256(buyOrder.toBuffer())
    ).toString("hex");
    const ftCodeBuy = FT.buildFTtransferCode(ftCode, buyOrderHash160);
    const ftTapeBuy = FT.buildFTtransferTape(ftTape, amountHex);
    const ftCodeDust = ftutxos[0].satoshis;
    tx.addOutput(
      new tbc.Transaction.Output({
        script: ftCodeBuy,
        satoshis: ftCodeDust,
      })
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: ftTapeBuy,
        satoshis: 0,
      })
    );

    if (ftAmount < tapeAmountSum) {
      const ftCodeChange = FT.buildFTtransferCode(ftCode, holdAddress);
      const ftTapeChange = FT.buildFTtransferTape(ftTape, changeHex);
      tx.addOutput(
        new tbc.Transaction.Output({
          script: ftCodeChange,
          satoshis: ftCodeDust,
        })
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: ftTapeChange,
          satoshis: 0,
        })
      );
    }

    tx.change(holdAddress);
    // const txSize = tx.getEstimateSize();
    // tx.fee(txSize < 1000 ? 80 : Math.ceil(txSize / 1000 * 80));
    tx.feePerKb(80);

    for (let i = 0; i < ftutxos.length; i++) {
      tx.setInputScript(
        {
          inputIndex: i,
        },
        (tx) => {
          const unlockingScript = new FT(ftID).getFTunlock(
            privateKey,
            tx,
            preTXs[i],
            prepreTxData[i],
            i,
            ftutxos[i].outputIndex
          );
          return unlockingScript;
        }
      );
    }
    tx.sign(privateKey);
    tx.seal();
    const txraw = tx.uncheckedSerialize();
    return txraw;
  }

  cancelBuyOrder_privateKey(
    privateKey: tbc.PrivateKey,
    buyutxo: tbc.Transaction.IUnspentOutput,
    buyPreTX: tbc.Transaction,
    ftutxo: tbc.Transaction.IUnspentOutput,
    ftPreTX: tbc.Transaction,
    ftPrePreTxData: string,
    utxos: tbc.Transaction.IUnspentOutput[]
  ) {
    const buyData = OrderBook.getOrderData(buyutxo.script);
    const tx = new tbc.Transaction();
    tx.from(buyutxo).from(ftutxo).from(utxos);

    const tapeAmountSetIn: bigint[] = [];
    tapeAmountSetIn.push(ftutxo.ftBalance!);
    const tapeAmountSum = BigInt(tapeAmountSetIn[0]);
    const { amountHex, changeHex } = FT.buildTapeAmount(
      tapeAmountSum,
      tapeAmountSetIn,
      1
    );
    if (
      changeHex !=
      "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
    ) {
      throw new Error("Change amount is not zero");
    }

    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferCode(ftutxo.script, buyData.holdAddress),
        satoshis: ftutxo.satoshis,
      })
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferTape(
          ftPreTX.outputs[ftutxo.outputIndex + 1].script.toHex(),
          amountHex
        ),
        satoshis: 0,
      })
    );
    tx.change(buyData.holdAddress);
    tx.feePerKb(80);

    tx.setInputScript(
      {
        inputIndex: 0,
      },
      (tx) => {
        const sig = tx.getSignature(0, privateKey);
        const pubKey = privateKey.toPublicKey().toString();
        return tbc.Script.fromASM(`${sig} ${pubKey} OP_2`);
      }
    );

    tx.setInputScript(
      {
        inputIndex: 1,
      },
      (tx) => {
        const unlockingScript = new FT(buyData.ftID).getFTunlockSwap(
          privateKey,
          tx,
          ftPreTX,
          ftPrePreTxData,
          buyPreTX,
          1,
          ftutxo.outputIndex,
          2
        );
        return unlockingScript;
      }
    );
    tx.sign(privateKey);
    tx.seal();
    // console.log(tx.verify());
    const txraw = tx.uncheckedSerialize();
    return txraw;
  }

  matchOrder(
    privateKey: tbc.PrivateKey,
    buyutxo: tbc.Transaction.IUnspentOutput,
    buyPreTX: tbc.Transaction,
    ftutxo: tbc.Transaction.IUnspentOutput,
    ftPreTX: tbc.Transaction,
    ftPrePreTxData: string,
    sellutxo: tbc.Transaction.IUnspentOutput,
    sellPreTX: tbc.Transaction,
    utxos: tbc.Transaction.IUnspentOutput[],
    ftFeeAddress: string,
    tbcFeeAddress: string
  ): string {
    if (!_isValidHexString(ftPrePreTxData))
      throw new Error("Invalid FtPrePreTxData string");
    if (
      !tbc.Address.isValid(ftFeeAddress) ||
      !tbc.Address.isValid(tbcFeeAddress)
    )
      throw new Error("Invalid fee address");

    const buyData = OrderBook.getOrderData(buyutxo.script);
    const sellData = OrderBook.getOrderData(sellutxo.script);

    //计算，默认精度6
    const buyOrderTBCAmount = buyData.saleVolume; //买单的tbc数量
    const sellOrderTBCAmount = sellData.saleVolume; //卖单的tbc数量
    const matchedTBCAmount =
      buyOrderTBCAmount < sellOrderTBCAmount
        ? buyOrderTBCAmount
        : sellOrderTBCAmount;

    console.log("Matched TBC Amount:", matchedTBCAmount);

    const tbcSellAmount = matchedTBCAmount; //tbcSellAmount是卖出tbc总数量
    const tbcTaxAmount = (tbcSellAmount * buyData.feeRate) / this.precision; //tbcTaxAmount是卖家扣除的手续费数量
    const tbcBuyerAmount = tbcSellAmount - tbcTaxAmount; //tbcBuyerAmount是买家实际收到的tbc数量
    const newSellOrderTBCAmount = sellOrderTBCAmount - matchedTBCAmount; //卖单剩余tbc数量

    console.log(
      "tbcSellAmount, tbcTaxAmount, tbcBuyerAmount, newSellOrderTBCAmount",
      tbcSellAmount,
      tbcTaxAmount,
      tbcBuyerAmount,
      newSellOrderTBCAmount
    );

    const ftPayAmount = (tbcSellAmount * sellData.unitPrice) / this.precision; //ftPayAmount是支付ft总数量
    const ftTaxAmount = (ftPayAmount * sellData.feeRate) / this.precision; //ftTaxAmount是买家扣除的手续费数量
    const ftSellerAmount = ftPayAmount - ftTaxAmount; //ftSellerAmount是卖家实际收到的ft数量
    const newBuyOrderTBCAmount = buyOrderTBCAmount - matchedTBCAmount; //买单剩余tbc数量

    console.log(
      "ftPayAmount, ftTaxAmount, ftSellerAmount, newBuyOrderTBCAmount",
      ftPayAmount,
      ftTaxAmount,
      ftSellerAmount,
      newBuyOrderTBCAmount
    );

    //构建交易
    const tx = new tbc.Transaction();
    tx.from(buyutxo).from(ftutxo).from(sellutxo).from(utxos);

    //处理ft输出
    const tapeAmountSetIn: bigint[] = [];
    tapeAmountSetIn.push(ftutxo.ftBalance!);

    console.log("FT Balance:", ftutxo.ftBalance!);

    const tapeAmountSum = BigInt(tapeAmountSetIn[0]);
    const { amountHex: ftSellerAmountHex, changeHex: noUseHex } =
      FT.buildTapeAmount(ftSellerAmount, tapeAmountSetIn, 1);
    tapeAmountSetIn.pop();
    tapeAmountSetIn.push(ftutxo.ftBalance! - ftSellerAmount);
    let { amountHex: ftTaxAmountHex, changeHex } = FT.buildTapeAmount(
      ftTaxAmount,
      tapeAmountSetIn,
      1
    );

    //**********FT Seller输出**********
    const ftTape = ftPreTX.outputs[ftutxo.outputIndex + 1].script.toHex();
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferCode(ftutxo.script, sellData.holdAddress),
        satoshis: ftutxo.satoshis,
      })
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferTape(ftTape, ftSellerAmountHex),
        satoshis: 0,
      })
    );

    //**********FT Tax输出**********
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferCode(ftutxo.script, ftFeeAddress),
        satoshis: ftutxo.satoshis,
      })
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferTape(ftTape, ftTaxAmountHex),
        satoshis: 0,
      })
    );

    //**********TBC Buyer输出**********
    tx.to(buyData.holdAddress, Number(tbcBuyerAmount));
    //**********TBC Tax输出**********
    if (buyData.feeRate === 0n && tbcTaxAmount === 0n) {
      tx.addOutput(
        new tbc.Transaction.Output({
          script: OrderBook.placeHolderP2PKHOutput(),
          satoshis: 0,
        })
      );
    } else if (tbcTaxAmount < 10n) {
      throw new Error("TBC tax amount is less than dust limit");
    } else {
      tx.to(tbcFeeAddress, Number(tbcTaxAmount));
    }
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
    tx.to(
      tbc.Script.fromHex(utxos[0].script).toAddress().toString(),
      inputsFee - fee - 1300
    );
    // tx.change(tbc.Script.fromHex(utxos[0].script).toAddress().toString());

    //部分成交
    if (newSellOrderTBCAmount > 0n) {
      //卖单部分成交
      //**********SELL CHANGE输出**********
      tx.addOutput(
        new tbc.Transaction.Output({
          script: OrderBook.updateSaleVolume(
            sellutxo.script,
            newSellOrderTBCAmount
          ),
          satoshis: Number(newSellOrderTBCAmount),
        })
      );
    } else if (newBuyOrderTBCAmount > 0n && tapeAmountSum - ftPayAmount > 0n) {
      //买单部分成交
      //**********BUY CHANGE输出**********
      const newBuyOrderCodeScript = OrderBook.updateSaleVolume(
        buyutxo.script,
        newBuyOrderTBCAmount
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: newBuyOrderCodeScript,
          satoshis: this.buy_code_dust,
        })
      );
      //**********FT CHANGE输出**********
      tx.addOutput(
        new tbc.Transaction.Output({
          script: FT.buildFTtransferCode(
            ftutxo.script,
            tbc.crypto.Hash.sha256ripemd160(
              tbc.crypto.Hash.sha256(newBuyOrderCodeScript.toBuffer())
            ).toString("hex")
          ),
          satoshis: ftutxo.satoshis,
        })
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: FT.buildFTtransferTape(ftTape, changeHex),
          satoshis: 0,
        })
      );
    }

    //设置解锁脚本
    tx.setInputScript(
      {
        inputIndex: 0,
      },
      (tx) => {
        const unlockingScript = this.getOrderUnlock(
          tx,
          buyPreTX,
          buyutxo.outputIndex
        );
        return unlockingScript;
      }
    );

    tx.setInputScript(
      {
        inputIndex: 1,
      },
      (tx) => {
        const unlockingScript = new FT(buyData.ftID).getFTunlockSwap(
          privateKey,
          tx,
          ftPreTX,
          ftPrePreTxData,
          buyPreTX,
          1,
          ftutxo.outputIndex,
          2
        );
        return unlockingScript;
      }
    );

    tx.setInputScript(
      {
        inputIndex: 2,
      },
      (tx) => {
        const unlockingScript = this.getOrderUnlock(
          tx,
          sellPreTX,
          sellutxo.outputIndex
        );
        return unlockingScript;
      }
    );

    // tx.feePerKb(80);
    // const txSize = tx.getEstimateSize() + 3 * 2000;
    // tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));
    tx.sign(privateKey);
    tx.seal();
    console.log("tx fee", tx.getFee());
    // console.log(tx.toObject());
    // console.log(tx.verifyScript(0));
    // console.log(tx.verify());
    const txraw = tx.uncheckedSerialize();
    return txraw;
  }

  async makeSellOrder_privateKeyOnline(
    privateKey: tbc.PrivateKey,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftID: string
  ) {
    if (!_isPositiveBigInt(saleVolume) || !_isPositiveBigInt(unitPrice))
      throw new Error("SaleVolume and UnitPrice must be positive bigint");
    if (_isNegativeBigInt(feeRate))
      throw new Error("FeeRate must be non-negative bigint");
    if (!_isValidSHA256Hash(ftID))
      throw new Error("FTID must be a valid SHA256 hash string");

    const network = "https://api.tbcdev.org/api/tbc/";
    const Token = new FT(ftID);
    const TokenInfo = await API.fetchFtInfo(Token.contractTxid, network);
    let ftPartialHash: string;
    let offset = 0;
    if (TokenInfo.codeScript.length / 2 === ft_v1_length) {
      offset = ft_v1_partial_offset;
    } else if (TokenInfo.codeScript.length / 2 === ft_v2_length) {
      offset = ft_v2_partial_offset;
    }
    if (offset > 0)
      ftPartialHash = partial_sha256.calculate_partial_hash(
        Buffer.from(TokenInfo.codeScript, "hex").subarray(0, offset)
      );
    const utxos = await API.fetchUTXO(
      privateKey,
      Number(saleVolume) / 1e6 + utxoFee,
      network
    );

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
    tx.addOutput(
      new tbc.Transaction.Output({
        script: this.getSellOrderCode(),
        satoshis: Number(saleVolume),
      })
    );
    tx.change(holdAddress);
    const txSize = tx.getEstimateSize();
    tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));
    tx.sign(privateKey);
    tx.seal();
    const txraw = tx.uncheckedSerialize();
    return txraw;
  }

  async cancelSellOrder_privateKeyOnline(
    privateKey: tbc.PrivateKey,
    sellutxo: tbc.Transaction.IUnspentOutput
  ) {
    const network = "https://api.tbcdev.org/api/tbc/";
    const utxos = [await API.fetchUTXO(privateKey, utxoFee, network)];
    const sellData = OrderBook.getOrderData(sellutxo.script);
    const tx = new tbc.Transaction();
    tx.from(sellutxo).from(utxos);
    tx.to(sellData.holdAddress, sellutxo.satoshis);
    tx.change(sellData.holdAddress);
    const txSize = tx.getEstimateSize();
    tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));
    tx.setInputScript(
      {
        inputIndex: 0,
      },
      (tx) => {
        const sig = tx.getSignature(0, privateKey);
        const pubKey = privateKey.toPublicKey().toString();
        return tbc.Script.fromASM(`${sig} ${pubKey} OP_2`);
      }
    );
    tx.sign(privateKey);
    tx.seal();
    const txraw = tx.uncheckedSerialize();
    return txraw;
  }

  async makeBuyOrder_privateKeyOnline(
    privateKey: tbc.PrivateKey,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftID: string
  ) {
    if (!_isPositiveBigInt(saleVolume) || !_isPositiveBigInt(unitPrice))
      throw new Error("SaleVolume and UnitPrice must be positive bigint");
    if (_isNegativeBigInt(feeRate))
      throw new Error("FeeRate must be non-negative bigint");
    if (!_isValidSHA256Hash(ftID))
      throw new Error("FTID must be a valid SHA256 hash string");

    const network = "https://api.tbcdev.org/api/tbc/";
    const Token = new FT(ftID);
    const TokenInfo = await API.fetchFtInfo(Token.contractTxid, network); //获取FT信息
    const ftutxo_codeScript = FT.buildFTtransferCode(
      TokenInfo.codeScript,
      privateKey.toAddress().toString()
    )
      .toBuffer()
      .toString("hex");
    const ftutxos = await API.fetchFtUTXOs(
      ftID,
      privateKey.toAddress().toString(),
      ftutxo_codeScript,
      network,
      (saleVolume * unitPrice) / 1000000n
    ); //准备ft utxo
    let preTXs: tbc.Transaction[] = [];
    let prepreTxData: string[] = [];
    for (let i = 0; i < ftutxos.length; i++) {
      preTXs.push(await API.fetchTXraw(ftutxos[i].txId, network)); //获取每个ft输入的父交易
      prepreTxData.push(
        await API.fetchFtPrePreTxData(
          preTXs[i],
          ftutxos[i].outputIndex,
          network
        )
      ); //获取每个ft输入的爷交易
    }
    const utxos = await API.fetchUTXO(privateKey, utxoFee, network);

    const holdAddress = privateKey.toAddress().toString();
    this.type = "buy";
    this.hold_address = holdAddress;
    this.sale_volume = saleVolume;
    this.unit_price = unitPrice;
    this.fee_rate = feeRate;
    this.ft_a_contract_id = ftID;
    this.ft_a_contract_partialhash = partial_sha256.calculate_partial_hash(
      Buffer.from(ftutxos[0].script, "hex").subarray(0, 1856)
    );

    const tx = new tbc.Transaction();
    tx.from(ftutxos);
    tx.from(utxos);

    // Buy Order Output
    const buyOrder = this.getBuyOrderCode();
    tx.addOutput(
      new tbc.Transaction.Output({
        script: buyOrder,
        satoshis: this.buy_code_dust,
      })
    );

    //FT Code Buy Output
    const ftAmount = (saleVolume * unitPrice) / this.precision;
    const tapeAmountSetIn: bigint[] = [];
    let tapeAmountSum = BigInt(0);
    for (let i = 0; i < ftutxos.length; i++) {
      tapeAmountSetIn.push(ftutxos[i].ftBalance!);
      tapeAmountSum += BigInt(tapeAmountSetIn[i]);
    }
    let { amountHex, changeHex } = FT.buildTapeAmount(
      ftAmount,
      tapeAmountSetIn
    );
    const ftCode = ftutxos[0].script;
    const ftTape = preTXs[0].outputs[ftutxos[0].outputIndex + 1].script.toHex();
    const buyOrderHash160 = tbc.crypto.Hash.sha256ripemd160(
      tbc.crypto.Hash.sha256(buyOrder.toBuffer())
    ).toString("hex");
    const ftCodeBuy = FT.buildFTtransferCode(ftCode, buyOrderHash160);
    const ftTapeBuy = FT.buildFTtransferTape(ftTape, amountHex);
    const ftCodeDust = ftutxos[0].satoshis;
    tx.addOutput(
      new tbc.Transaction.Output({
        script: ftCodeBuy,
        satoshis: ftCodeDust,
      })
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: ftTapeBuy,
        satoshis: 0,
      })
    );

    if (ftAmount < tapeAmountSum) {
      const ftCodeChange = FT.buildFTtransferCode(ftCode, holdAddress);
      const ftTapeChange = FT.buildFTtransferTape(ftTape, changeHex);
      tx.addOutput(
        new tbc.Transaction.Output({
          script: ftCodeChange,
          satoshis: ftCodeDust,
        })
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: ftTapeChange,
          satoshis: 0,
        })
      );
    }

    tx.change(holdAddress);
    // const txSize = tx.getEstimateSize();
    // tx.fee(txSize < 1000 ? 80 : Math.ceil(txSize / 1000 * 80));
    tx.feePerKb(80);

    for (let i = 0; i < ftutxos.length; i++) {
      tx.setInputScript(
        {
          inputIndex: i,
        },
        (tx) => {
          const unlockingScript = new FT(ftID).getFTunlock(
            privateKey,
            tx,
            preTXs[i],
            prepreTxData[i],
            i,
            ftutxos[i].outputIndex
          );
          return unlockingScript;
        }
      );
    }
    tx.sign(privateKey);
    tx.seal();
    const txraw = tx.uncheckedSerialize();
    // console.log(tx.toObject());
    return txraw;
  }

  async cancelBuyOrder_privateKeyOnline(
    privateKey: tbc.PrivateKey,
    buyutxo: tbc.Transaction.IUnspentOutput
  ) {
    const network = "https://api.tbcdev.org/api/tbc/";
    const buyPreTX = await API.fetchTXraw(buyutxo.txId, network);
    const ftutxo = buildUTXO(buyPreTX, 1, true);
    const ftPreTX: tbc.Transaction = buyPreTX;
    const ftPrePreTxData: string = await API.fetchFtPrePreTxData(
      ftPreTX,
      ftutxo.outputIndex,
      network
    );
    const utxos = [await API.fetchUTXO(privateKey, utxoFee, network)];

    const buyData = OrderBook.getOrderData(buyutxo.script);
    const tx = new tbc.Transaction();
    tx.from(buyutxo).from(ftutxo).from(utxos);

    const tapeAmountSetIn: bigint[] = [];
    tapeAmountSetIn.push(ftutxo.ftBalance!);
    const tapeAmountSum = BigInt(tapeAmountSetIn[0]);
    const { amountHex, changeHex } = FT.buildTapeAmount(
      tapeAmountSum,
      tapeAmountSetIn,
      1
    );
    if (
      changeHex !=
      "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
    ) {
      throw new Error("Change amount is not zero");
    }

    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferCode(ftutxo.script, buyData.holdAddress),
        satoshis: ftutxo.satoshis,
      })
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferTape(
          ftPreTX.outputs[ftutxo.outputIndex + 1].script.toHex(),
          amountHex
        ),
        satoshis: 0,
      })
    );
    tx.change(buyData.holdAddress);
    tx.feePerKb(80);

    tx.setInputScript(
      {
        inputIndex: 0,
      },
      (tx) => {
        const sig = tx.getSignature(0, privateKey);
        const pubKey = privateKey.toPublicKey().toString();
        return tbc.Script.fromASM(`${sig} ${pubKey} OP_2`);
      }
    );

    tx.setInputScript(
      {
        inputIndex: 1,
      },
      (tx) => {
        const unlockingScript = new FT(buyData.ftID).getFTunlockSwap(
          privateKey,
          tx,
          ftPreTX,
          ftPrePreTxData,
          buyPreTX,
          1,
          ftutxo.outputIndex,
          2
        );
        return unlockingScript;
      }
    );
    tx.sign(privateKey);
    tx.seal();
    // console.log(tx.verify());
    const txraw = tx.uncheckedSerialize();
    return txraw;
  }

  async matchOrderOnline(
    privateKey: tbc.PrivateKey,
    buyutxo: tbc.Transaction.IUnspentOutput,
    sellutxo: tbc.Transaction.IUnspentOutput,
    ftFeeAddress: string,
    tbcFeeAddress: string
  ) {
    if (
      !tbc.Address.isValid(ftFeeAddress) ||
      !tbc.Address.isValid(tbcFeeAddress)
    )
      throw new Error("Invalid fee address");
    const network = "https://api.tbcdev.org/api/tbc/";
    const sellPreTX = await API.fetchTXraw(sellutxo.txId, network);
    const buyPreTX = await API.fetchTXraw(buyutxo.txId, network);
    const ftutxo = buildUTXO(buyPreTX, buyutxo.outputIndex + 1, true);
    const ftPreTX: tbc.Transaction = buyPreTX;
    const ftPrePreTxData: string = await API.fetchFtPrePreTxData(
      ftPreTX,
      ftutxo.outputIndex,
      network
    );
    const utxos = [await API.fetchUTXO(privateKey, utxoFee, network)];

    const buyData = OrderBook.getOrderData(buyutxo.script);
    const sellData = OrderBook.getOrderData(sellutxo.script);

    //计算，默认精度6
    const buyOrderTBCAmount = buyData.saleVolume; //买单的tbc数量
    const sellOrderTBCAmount = sellData.saleVolume; //卖单的tbc数量
    const matchedTBCAmount =
      buyOrderTBCAmount < sellOrderTBCAmount
        ? buyOrderTBCAmount
        : sellOrderTBCAmount;

    console.log("Matched TBC Amount:", matchedTBCAmount);

    const tbcSellAmount = matchedTBCAmount; //tbcSellAmount是卖出tbc总数量
    const tbcTaxAmount = (tbcSellAmount * buyData.feeRate) / this.precision; //tbcTaxAmount是卖家扣除的手续费数量
    const tbcBuyerAmount = tbcSellAmount - tbcTaxAmount; //tbcBuyerAmount是买家实际收到的tbc数量
    const newSellOrderTBCAmount = sellOrderTBCAmount - matchedTBCAmount; //卖单剩余tbc数量

    console.log(
      "tbcSellAmount, tbcTaxAmount, tbcBuyerAmount, newSellOrderTBCAmount",
      tbcSellAmount,
      tbcTaxAmount,
      tbcBuyerAmount,
      newSellOrderTBCAmount
    );

    const ftPayAmount = (tbcSellAmount * sellData.unitPrice) / this.precision; //ftPayAmount是支付ft总数量
    const ftTaxAmount = (ftPayAmount * sellData.feeRate) / this.precision; //ftTaxAmount是买家扣除的手续费数量
    const ftSellerAmount = ftPayAmount - ftTaxAmount; //ftSellerAmount是卖家实际收到的ft数量
    const newBuyOrderTBCAmount = buyOrderTBCAmount - matchedTBCAmount; //买单剩余tbc数量

    console.log(
      "ftPayAmount, ftTaxAmount, ftSellerAmount, newBuyOrderTBCAmount",
      ftPayAmount,
      ftTaxAmount,
      ftSellerAmount,
      newBuyOrderTBCAmount
    );

    //构建交易
    const tx = new tbc.Transaction();
    tx.from(buyutxo).from(ftutxo).from(sellutxo).from(utxos);

    //处理ft输出
    const tapeAmountSetIn: bigint[] = [];
    tapeAmountSetIn.push(ftutxo.ftBalance!);

    console.log("FT Balance:", ftutxo.ftBalance!);

    const tapeAmountSum = BigInt(tapeAmountSetIn[0]);
    const { amountHex: ftSellerAmountHex, changeHex: noUseHex } =
      FT.buildTapeAmount(ftSellerAmount, tapeAmountSetIn, 1);
    tapeAmountSetIn.pop();
    tapeAmountSetIn.push(ftutxo.ftBalance! - ftSellerAmount);
    let { amountHex: ftTaxAmountHex, changeHex } = FT.buildTapeAmount(
      ftTaxAmount,
      tapeAmountSetIn,
      1
    );

    //**********FT Seller输出**********
    const ftTape = ftPreTX.outputs[ftutxo.outputIndex + 1].script.toHex();
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferCode(ftutxo.script, sellData.holdAddress),
        satoshis: ftutxo.satoshis,
      })
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferTape(ftTape, ftSellerAmountHex),
        satoshis: 0,
      })
    );

    //**********FT Tax输出**********
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferCode(ftutxo.script, ftFeeAddress),
        satoshis: ftutxo.satoshis,
      })
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferTape(ftTape, ftTaxAmountHex),
        satoshis: 0,
      })
    );

    //**********TBC Buyer输出**********
    tx.to(buyData.holdAddress, Number(tbcBuyerAmount));
    //**********TBC Tax输出**********
    if (buyData.feeRate === 0n && tbcTaxAmount === 0n) {
      tx.addOutput(
        new tbc.Transaction.Output({
          script: OrderBook.placeHolderP2PKHOutput(),
          satoshis: 0,
        })
      );
    } else if (tbcTaxAmount < 10n) {
      throw new Error("TBC tax amount is less than dust limit");
    } else {
      tx.to(tbcFeeAddress, Number(tbcTaxAmount));
    }
    //**********交易手续费找零**********
    let inputsFee = 0;
    for (const utxo of utxos) {
      inputsFee += utxo.satoshis;
    }
    // console.log("UTXOs Total Satoshis:", tx.getUnspentValue());
    // console.log("Inputs Value:", inputsFee);
    const txSize = tx.getEstimateSize() + 2 * 1000 + 2000;
    const fee = txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80);
    console.log("tx fee", fee);
    tx.to(
      tbc.Script.fromHex(utxos[0].script).toAddress().toString(),
      inputsFee - fee - 1300
    );
    // tx.change(tbc.Script.fromHex(utxos[0].script).toAddress().toString());

    //部分成交
    if (newSellOrderTBCAmount > 0n) {
      //卖单部分成交
      //**********SELL CHANGE输出**********
      tx.addOutput(
        new tbc.Transaction.Output({
          script: OrderBook.updateSaleVolume(
            sellutxo.script,
            newSellOrderTBCAmount
          ),
          satoshis: Number(newSellOrderTBCAmount),
        })
      );
    } else if (newBuyOrderTBCAmount > 0n && tapeAmountSum - ftPayAmount > 0n) {
      //买单部分成交
      //**********BUY CHANGE输出**********
      const newBuyOrderCodeScript = OrderBook.updateSaleVolume(
        buyutxo.script,
        newBuyOrderTBCAmount
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: newBuyOrderCodeScript,
          satoshis: this.buy_code_dust,
        })
      );
      //**********FT CHANGE输出**********
      tx.addOutput(
        new tbc.Transaction.Output({
          script: FT.buildFTtransferCode(
            ftutxo.script,
            tbc.crypto.Hash.sha256ripemd160(
              tbc.crypto.Hash.sha256(newBuyOrderCodeScript.toBuffer())
            ).toString("hex")
          ),
          satoshis: ftutxo.satoshis,
        })
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: FT.buildFTtransferTape(ftTape, changeHex),
          satoshis: 0,
        })
      );
    }

    //设置解锁脚本
    tx.setInputScript(
      {
        inputIndex: 0,
      },
      (tx) => {
        const unlockingScript = this.getOrderUnlock(
          tx,
          buyPreTX,
          buyutxo.outputIndex
        );
        return unlockingScript;
      }
    );

    tx.setInputScript(
      {
        inputIndex: 1,
      },
      (tx) => {
        const unlockingScript = new FT(buyData.ftID).getFTunlockSwap(
          privateKey,
          tx,
          ftPreTX,
          ftPrePreTxData,
          buyPreTX,
          1,
          ftutxo.outputIndex,
          2
        );
        return unlockingScript;
      }
    );

    tx.setInputScript(
      {
        inputIndex: 2,
      },
      (tx) => {
        const unlockingScript = this.getOrderUnlock(
          tx,
          sellPreTX,
          sellutxo.outputIndex
        );
        return unlockingScript;
      }
    );

    // tx.feePerKb(80);
    // const txSize = tx.getEstimateSize() + 3 * 2000;
    // tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));
    tx.sign(privateKey);
    tx.seal();
    console.log("tx fee", tx.getFee());
    // console.log(tx.toObject());
    // console.log(tx.verifyScript(0));
    // console.log(tx.verify());
    const txraw = tx.uncheckedSerialize();
    console.log("Transaction Raw:", txraw.length / 2000, "KB");
    return txraw;
  }

  getOrderUnlock(
    currentTX: tbc.Transaction,
    preTX: tbc.Transaction,
    preTxVout: number
  ): tbc.Script {
    const preTxData = getPreTxdata(preTX, preTxVout, 1);
    const currentTxData = getCurrentTxOutputsData(currentTX);
    const optionHex = "51";
    const unlockingScript = tbc.Script.fromHex(
      `${currentTxData}${preTxData}${optionHex}`
    );
    // console.log("Unlocking Script:", unlockingScript.toASM());
    return unlockingScript;
  }

  getSellOrderCode(): tbc.Script {
    const address =
      "14" + new tbc.Address(this.hold_address).hashBuffer.toString("hex");

    const sellOrderCode = tbc.Script.fromHex(
      `765187637556ba01207f77547f75817654958f01289351947901157f597f7701217f597f597f517f7701207f756b517f77816b517f77816b517f776b517f776b7654958f01289379816b7654958f0128935394796b54958f0127935294796b006b7600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575686ca87e6b007e7e7e7e7e7e7e7e7e7ea86c7e7eaa56ba01207f7588006b7600879163a86c7e7e6bbb6c7e7e6bbb6c7e7e6c6c75756b676d6d6d760087916378787e6c6c6c7e7b7c886c55798194547901157f597f5879527a517f77886c76537a517f77887c01217f6c76537a517f77887c597f6c76537a517f7781887c597f6c76537a517f7781887c517f7701207f756c7c886b6b6b6b6b6bbb6c7e7e6b676d6d6c6c6c75756b6868760119885279537f7701147f756c6c6c76547a8700886b6b6bbb6c7e7e6b760119885279537f7701147f756c6c6c76547a8700886b766b557981946b6bbb6c7e7e6b760119885279537f7701147f756c6c6c6c76557a8700886b6b5579819400886bbb6c7e7e6b5279025c0788768255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a935979025c078857798255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a936c6c6c6c765a79885f7988765a79517f7701147f758700885f79517f7701147f75886c6c527a950340420f9676527a950340420f96547988537a947b886ba86c7e7e6bbb6c7e7e6ba86c7e7e6bbb6c7e7ea857ba8867528876a9${address}88ad68516a33ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`
    );

    const sellOrderData = this.buildOrderData();

    return sellOrderCode.add(sellOrderData);
  }

  getBuyOrderCode(): tbc.Script {
    const address =
      "14" + new tbc.Address(this.hold_address).hashBuffer.toString("hex");

    const buyOrderCode = tbc.Script.fromHex(
      `765187637556ba01207f77547f75817654958f01289351947901157f597f7701217f597f597f517f7701207f756b517f77816b517f77816b517f776b517f776b7654958f0128935394796b54958f0127935294796b006b7600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575686ca87e6b007e7e7e7e7e7e7e7e7e7ea86c7e7eaa56ba01207f7588006b760087636d6d6d7600879163bb6c7e7e676d6d6c686c6c75756b67577957797e6c6c6c7e7b7c885379025c0788788255947f054654617065886c6c765879886b6b537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a935679517f7701147f756b6b6ba86c7e7e6bbb6c7e7e6b527901157f597f6c6c6c6c76577a517f7788547a01217f6c76537a517f77887c597f6c76537a517f7781887c597f6c76537a517f7781767c88527a517f7701207f756c7c88587a517f7781517a950340420f96567a7c886b6b6b6b6b6bbb6c6c5279a97c887e7e6b68760119885279537f7701147f756c6c76537a8700886b6bbb6c7e7e6b760119885279537f7701147f756c6c76537a8700886b5479816b6bbb6c7e7e6b760119885279537f7701147f756c6c6c76547a8878577981936c6c5279950340420f96547a886c527a950340420f967c6b7c6b6b6bbb6c7e7e6b5279025c0788768255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a935979025c078857798255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a936c6c6c6c765a79885f7988765a79517f7701147f758700885f79517f7701147f75870088537a94527a9400886ba86c7e7e6bbb6c7e7e6ba86c7e7e6bbb6c7e7ea857ba8867528876a9${address}88ad68516a1affffffffffffffffffffffffffffffffffffffffffffffffffff`
    );

    const buyOrderData = this.buildOrderData();

    return buyOrderCode.add(buyOrderData);
  }

  buildOrderData(): tbc.Script {
    const amountLength = "08";
    const addressLength = "14";
    const hashLength = "20";

    const writer = new tbc.encoding.BufferWriter();

    writer.write(Buffer.from(addressLength, "hex"));
    writer.write(
      Buffer.from(
        new tbc.Address(this.hold_address).hashBuffer.toString("hex"),
        "hex"
      )
    );

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

    const orderData = tbc.Script.fromBuffer(writer.toBuffer());
    return orderData;
  }

  static updateSaleVolume(
    codeScript: string,
    newSaleVolume: bigint
  ): tbc.Script {
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

  static getOrderData(codeScript: string): {
    holdAddress: string;
    saleVolume: bigint;
    ftPartialHash: string;
    feeRate: bigint;
    unitPrice: bigint;
    ftID: string;
  } {
    const script = tbc.Script.fromHex(codeScript);
    const dataStartIndex = script.chunks.length - 6;

    const holdAddressHash = script.chunks[dataStartIndex].buf!.toString("hex");
    const holdAddress = tbc.Address.fromHex("00" + holdAddressHash).toString();
    // console.log(holdAddressHash, holdAddress);
    const saleVolume = BigInt(
      new BN(script.chunks[dataStartIndex + 1].buf!, 10, "le").toString()
    );
    const ftPartialHash =
      script.chunks[dataStartIndex + 2].buf!.toString("hex");
    const feeRate = BigInt(
      new BN(script.chunks[dataStartIndex + 3].buf!, 10, "le").toString()
    );
    const unitPrice = BigInt(
      new BN(script.chunks[dataStartIndex + 4].buf!, 10, "le").toString()
    );
    const ftID = script.chunks[dataStartIndex + 5].buf!.toString("hex");
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

  static placeHolderP2PKHOutput(): tbc.Script {
    return tbc.Script.fromASM(
      `OP_FALSE OP_RETURN ffffffffffffffffffffffffffffffffffffffffffff`
    );
  }
}

function _isPositiveBigInt(param: bigint): boolean {
  if (param > 0n) return true;
  return false;
}

function _isNegativeBigInt(param: bigint): boolean {
  if (param < 0n) return true;
  return false;
}

function _isValidSHA256Hash(param: string): boolean {
  if (typeof param !== "string") return false;
  if (param.length !== 64) return false;
  return /^[0-9a-f]{64}$/.test(param);
}

function _isValidHexString(param: string): boolean {
  if (typeof param !== "string") return false;
  if (param.length === 0) return false;
  return /^[0-9a-f]+$/.test(param);
}

module.exports = OrderBook;