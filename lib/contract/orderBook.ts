import * as tbc from "tbc-lib-js";
import {
  getPreTxdata,
  getCurrentTxOutputsData,
  getLengthHex,
} from "../util/orderbookunlock";
import {
  buildUTXO,
  fetchInBatches,
  _isValidSHA256Hash,
  _isValidHexString,
  fillCharLengthInFT,
} from "../util/util";
const API = require("../api/api");
const FT = require("./ft");
const stableCoin = require("./stableCoin");
const partial_sha256 = require("tbc-lib-js/lib/util/partial-sha256");
const BN = tbc.crypto.BN;
const ft_v1_length = 1564;
const ft_v1_partial_offset = 1536;
const ft_v2_length = 1884;
const ft_v2_partial_offset = 1856;
const coin_length = 2012;
const coin_partial_offset = 1984;
const token_order_prefix_length = 1152;
const token_order_data_length = 180;
const token_order_length = token_order_prefix_length + token_order_data_length;
const token_order_size_hex = "023405";
const zero_ft_tape_amount =
  "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
const utxoFee = 0.01;

type FTVersion = 1 | 2 | 3;
const getFTVersion = (codeScript: string, isCoin: boolean): FTVersion => {
  const baseVersion =
    codeScript.length / 2 === ft_v2_length || isCoin ? 2 : 1;
  if (baseVersion !== 2) return 1;

  const fillCharLength = fillCharLengthInFT(codeScript);
  console.log(fillCharLength);
  return fillCharLength === 1 || fillCharLength === 2 ? 3 : 2;
};

class OrderBook {
  type!: "buy" | "sell";
  hold_address!: string;
  sale_volume!: bigint;
  fee_rate!: bigint;
  unit_price!: bigint;
  sale_volume_number!: number;
  fee_rate_number!: number;
  unit_price_number!: number;
  ft_a_contract_partialhash!: string;
  ft_a_contract_id!: string;
  ft_b_contract_partialhash!: string;
  ft_b_contract_id!: string;

  contract_version: number;
  private buy_code_dust = 300;
  private precision = BigInt(1000000);

  constructor() {
    this.contract_version = 1;
  }

  buildSellOrderTX(
    holdAddress: string,
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftID: string,
    ftCodeScript: string,
    utxos: tbc.Transaction.IUnspentOutput[],
  ): string {
    if (!tbc.Address.isValid(holdAddress) || !tbc.Address.isValid(taxAddress))
      throw new Error("Invalid HoldAddress or TaxAddress");
    if (!_isPositiveBigInt(saleVolume) || !_isPositiveBigInt(unitPrice))
      throw new Error("SaleVolume and UnitPrice must be positive bigint");
    if (_isNegativeBigInt(feeRate))
      throw new Error("FeeRate must be non-negative bigint");
    if (!_isValidSHA256Hash(ftID))
      throw new Error("FTID must be valid SHA256 hash strings");

    this.type = "sell";
    this.hold_address = holdAddress;
    this.sale_volume = saleVolume;
    this.unit_price = unitPrice;
    this.fee_rate = feeRate;
    this.ft_a_contract_id = ftID;
    const ftScriptLen = ftCodeScript.length / 2;
    const isCoin = ftScriptLen === coin_length;
    const partialOffset = isCoin ? coin_partial_offset : ft_v2_partial_offset;
    this.ft_a_contract_partialhash = partial_sha256.calculate_partial_hash(
      Buffer.from(ftCodeScript, "hex").subarray(0, partialOffset),
    );

    const tx = new tbc.Transaction();
    tx.from(utxos);
    tx.addOutput(
      new tbc.Transaction.Output({
        script: this.getSellOrderCode(isCoin, taxAddress),
        satoshis: Number(saleVolume),
      }),
    );
    tx.change(holdAddress);
    const txSize = tx.getEstimateSize();
    tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));
    const txraw = tx.uncheckedSerialize();
    return txraw;
  }

  buildCancelSellOrderTX(
    sellutxo: tbc.Transaction.IUnspentOutput,
    utxos: tbc.Transaction.IUnspentOutput[],
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
    type: "make" | "cancel",
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
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftID: string,
    utxos: tbc.Transaction.IUnspentOutput[],
    ftutxos: tbc.Transaction.IUnspentOutput[],
    preTXs: tbc.Transaction[],
  ): string {
    if (!tbc.Address.isValid(holdAddress) || !tbc.Address.isValid(taxAddress))
      throw new Error("Invalid HoldAddress or TaxAddress");
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
    const ftScriptLen = ftutxos[0].script.length / 2;
    const isCoin = ftScriptLen === coin_length;
    const partialOffset = isCoin ? coin_partial_offset : ft_v2_partial_offset;
    this.ft_a_contract_partialhash = partial_sha256.calculate_partial_hash(
      Buffer.from(ftutxos[0].script, "hex").subarray(0, partialOffset),
    );

    const tx = new tbc.Transaction();
    tx.from(ftutxos);
    tx.from(utxos);

    // Buy Order Output
    const buyOrder = this.getBuyOrderCode(isCoin, taxAddress);
    tx.addOutput(
      new tbc.Transaction.Output({
        script: buyOrder,
        satoshis: this.buy_code_dust,
      }),
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
      tapeAmountSetIn,
    );
    const ftCode = ftutxos[0].script;
    const ftTape = preTXs[0].outputs[ftutxos[0].outputIndex + 1].script.toHex();
    const buyOrderHash160 = tbc.crypto.Hash.sha256ripemd160(
      tbc.crypto.Hash.sha256(buyOrder.toBuffer()),
    ).toString("hex");
    const ftCodeBuy = FT.buildFTtransferCode(ftCode, buyOrderHash160);
    const ftTapeBuy = FT.buildFTtransferTape(ftTape, amountHex);
    const ftCodeDust = ftutxos[0].satoshis;
    tx.addOutput(
      new tbc.Transaction.Output({
        script: ftCodeBuy,
        satoshis: ftCodeDust,
      }),
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: ftTapeBuy,
        satoshis: 0,
      }),
    );

    if (ftAmount < tapeAmountSum) {
      const ftCodeChange = FT.buildFTtransferCode(ftCode, holdAddress);
      const ftTapeChange = FT.buildFTtransferTape(ftTape, changeHex);
      tx.addOutput(
        new tbc.Transaction.Output({
          script: ftCodeChange,
          satoshis: ftCodeDust,
        }),
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: ftTapeChange,
          satoshis: 0,
        }),
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
    utxos: tbc.Transaction.IUnspentOutput[],
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
      1,
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
      }),
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferTape(
          ftPreTX.outputs[ftutxo.outputIndex + 1].script.toHex(),
          amountHex,
        ),
        satoshis: 0,
      }),
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
    prepreTxData: string[],
  ): string {
    if (!_isValidHexString(buyOrderTxRaw))
      throw new Error("Invalid BuyOrderTxRaw hex string");
    if (!tbc.PublicKey.isValid(publicKey)) throw new Error("Invalid PublicKey");
    if (!Array.isArray(sigs) || sigs.some((sig) => !_isValidHexString(sig)))
      throw new Error("Invalid Signatures array");
    if (prepreTxData.some((data) => !_isValidHexString(data)))
      throw new Error("Invalid PrePreTxData array");

    const tx = new tbc.Transaction(buyOrderTxRaw);

    const isCoin = tx.outputs[1].script.toBuffer().length === coin_length;
    for (let i = 0; i < preTXs.length; i++) {
      if (isCoin) tx.setInputSequence(i, 4294967294);
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
            tx.inputs[i].outputIndex,
          );
          return unlockingScript;
        },
      );
    }

    for (let i = preTXs.length; i < tx.inputs.length; i++) {
      tx.setInputScript(
        {
          inputIndex: i,
        },
        tbc.Script.fromASM(`${sigs[i]} ${publicKey}`),
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
    ftPrePreTxData: string,
  ): string {
    if (!_isValidHexString(buyOrderTxRaw))
      throw new Error("Invalid BuyOrderTxRaw hex string");
    if (!tbc.PublicKey.isValid(publicKey)) throw new Error("Invalid PublicKey");
    if (!Array.isArray(sigs) || sigs.some((sig) => !_isValidHexString(sig)))
      throw new Error("Invalid Signatures array");
    if (!_isValidHexString(ftPrePreTxData))
      throw new Error("Invalid FtPrePreTxData string");

    const tx = new tbc.Transaction(buyOrderTxRaw);
    const isCoin = tx.outputs[0].script.toBuffer().length === coin_length;
    const ftVersion = getFTVersion(tx.outputs[0].script.toHex(), isCoin);
    tx.setInputScript(
      {
        inputIndex: 0,
      },
      tbc.Script.fromASM(`${sigs[0]} ${publicKey} OP_2`),
    );

    if (isCoin) tx.setInputSequence(1, 4294967294);
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
          ftVersion,
          isCoin,
        );
        return unlockingScript;
      },
    );

    for (let i = 2; i < tx.inputs.length; i++) {
      tx.setInputScript(
        {
          inputIndex: i,
        },
        tbc.Script.fromASM(`${sigs[i]} ${publicKey}`),
      );
    }

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
    tbcFeeAddress: string,
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
      newSellOrderTBCAmount,
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
      newBuyOrderTBCAmount,
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
      1,
    );

    //**********FT Seller输出**********
    const ftTape = ftPreTX.outputs[ftutxo.outputIndex + 1].script.toHex();
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferCode(ftutxo.script, sellData.holdAddress),
        satoshis: ftutxo.satoshis,
      }),
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferTape(ftTape, ftSellerAmountHex),
        satoshis: 0,
      }),
    );

    //**********FT Tax输出**********
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferCode(ftutxo.script, ftFeeAddress),
        satoshis: ftutxo.satoshis,
      }),
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferTape(ftTape, ftTaxAmountHex),
        satoshis: 0,
      }),
    );

    //**********TBC Buyer输出**********
    tx.to(buyData.holdAddress, Number(tbcBuyerAmount));
    //**********TBC Tax输出**********
    if (buyData.feeRate === 0n && tbcTaxAmount === 0n) {
      tx.addOutput(
        new tbc.Transaction.Output({
          script: OrderBook.placeHolderP2PKHOutput(),
          satoshis: 0,
        }),
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
      inputsFee - fee - 1300,
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
            newSellOrderTBCAmount,
          ),
          satoshis: Number(newSellOrderTBCAmount),
        }),
      );
    } else if (newBuyOrderTBCAmount > 0n && tapeAmountSum - ftPayAmount > 0n) {
      //买单部分成交
      //**********BUY CHANGE输出**********
      const newBuyOrderCodeScript = OrderBook.updateSaleVolume(
        buyutxo.script,
        newBuyOrderTBCAmount,
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: newBuyOrderCodeScript,
          satoshis: this.buy_code_dust,
        }),
      );
      //**********FT CHANGE输出**********
      tx.addOutput(
        new tbc.Transaction.Output({
          script: FT.buildFTtransferCode(
            ftutxo.script,
            tbc.crypto.Hash.sha256ripemd160(
              tbc.crypto.Hash.sha256(newBuyOrderCodeScript.toBuffer()),
            ).toString("hex"),
          ),
          satoshis: ftutxo.satoshis,
        }),
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: FT.buildFTtransferTape(ftTape, changeHex),
          satoshis: 0,
        }),
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
          buyutxo.outputIndex,
        );
        return unlockingScript;
      },
    );

    const isCoin = ftutxo.script.length / 2 === coin_length;
    const ftVersion = getFTVersion(ftutxo.script, isCoin);
    if (isCoin) tx.setInputSequence(1, 4294967294);
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
          ftVersion,
          isCoin,
        );
        return unlockingScript;
      },
    );

    tx.setInputScript(
      {
        inputIndex: 2,
      },
      (tx) => {
        const unlockingScript = this.getOrderUnlock(
          tx,
          sellPreTX,
          sellutxo.outputIndex,
        );
        return unlockingScript;
      },
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
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftID: string,
  ) {
    if (!_isPositiveBigInt(saleVolume) || !_isPositiveBigInt(unitPrice))
      throw new Error("SaleVolume and UnitPrice must be positive bigint");
    if (_isNegativeBigInt(feeRate))
      throw new Error("FeeRate must be non-negative bigint");
    if (!_isValidSHA256Hash(ftID))
      throw new Error("FTID must be a valid SHA256 hash string");

    const network = "https://api.tbcdev.org/api/tbc/";
    const Token = new FT(ftID);
    let TokenInfo;
    try {
      TokenInfo = (await API.fetchCoinInfo(Token.contractTxid, network))
        .coinInfo;
    } catch {
      TokenInfo = await API.fetchFtInfo(Token.contractTxid, network);
    }

    const utxos = await API.fetchUTXO(
      privateKey,
      Number(saleVolume) / 1e6 + utxoFee,
      network,
    );

    const holdAddress = privateKey.toAddress().toString();
    this.type = "sell";
    this.hold_address = holdAddress;
    this.sale_volume = saleVolume;
    this.unit_price = unitPrice;
    this.fee_rate = feeRate;
    this.ft_a_contract_id = ftID;
    const ftScriptLen = TokenInfo.codeScript.length / 2;
    const isCoin = ftScriptLen === coin_length;
    const partialOffset = isCoin ? coin_partial_offset : ft_v2_partial_offset;
    this.ft_a_contract_partialhash = partial_sha256.calculate_partial_hash(
      Buffer.from(TokenInfo.codeScript, "hex").subarray(0, partialOffset),
    );

    const tx = new tbc.Transaction();
    tx.from(utxos);
    tx.addOutput(
      new tbc.Transaction.Output({
        script: this.getSellOrderCode(isCoin, taxAddress),
        satoshis: Number(saleVolume),
      }),
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
    sellutxo: tbc.Transaction.IUnspentOutput,
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
      },
    );
    tx.sign(privateKey);
    tx.seal();
    const txraw = tx.uncheckedSerialize();
    return txraw;
  }

  async makeBuyOrder_privateKeyOnline(
    privateKey: tbc.PrivateKey,
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftID: string,
  ) {
    if (!_isPositiveBigInt(saleVolume) || !_isPositiveBigInt(unitPrice))
      throw new Error("SaleVolume and UnitPrice must be positive bigint");
    if (_isNegativeBigInt(feeRate))
      throw new Error("FeeRate must be non-negative bigint");
    if (!_isValidSHA256Hash(ftID))
      throw new Error("FTID must be a valid SHA256 hash string");

    const network = "https://api.tbcdev.org/api/tbc/";

    const Token = new FT(ftID);
    let TokenInfo;
    let isCoin = false;
    try {
      TokenInfo = (await API.fetchCoinInfo(Token.contractTxid, network))
        .coinInfo;
      isCoin = true;
    } catch {
      TokenInfo = await API.fetchFtInfo(Token.contractTxid, network);
    }
    const ftutxo_codeScript = stableCoin
      .buildFTtransferCode(
        TokenInfo.codeScript,
        privateKey.toAddress().toString(),
      )
      .toBuffer()
      .toString("hex");
    const requiredAmount = (saleVolume * unitPrice) / 1000000n;
    const ftutxos = isCoin
      ? await API.fetchCoinUTXOs(
          Token.contractTxid,
          privateKey.toAddress().toString(),
          requiredAmount,
          ftutxo_codeScript,
          network,
          5,
        )
      : await API.fetchFtUTXOs(
          ftID,
          privateKey.toAddress().toString(),
          ftutxo_codeScript,
          network,
          requiredAmount,
        );
    let preTXs: tbc.Transaction[] = [];
    let prepreTxData: string[] = [];
    for (let i = 0; i < ftutxos.length; i++) {
      preTXs.push(await API.fetchTXraw(ftutxos[i].txId, network)); //获取每个ft输入的父交易
      prepreTxData.push(
        await API.fetchFtPrePreTxData(
          preTXs[i],
          ftutxos[i].outputIndex,
          network,
        ),
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
    const partialOffset = isCoin ? coin_partial_offset : ft_v2_partial_offset;
    this.ft_a_contract_partialhash = partial_sha256.calculate_partial_hash(
      Buffer.from(ftutxos[0].script, "hex").subarray(0, partialOffset),
    );

    const tx = new tbc.Transaction();
    tx.from(ftutxos);
    tx.from(utxos);

    // Buy Order Output
    const buyOrder = this.getBuyOrderCode(isCoin, taxAddress);
    tx.addOutput(
      new tbc.Transaction.Output({
        script: buyOrder,
        satoshis: this.buy_code_dust,
      }),
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
      tapeAmountSetIn,
    );
    const ftCode = ftutxos[0].script;
    const ftTape = preTXs[0].outputs[ftutxos[0].outputIndex + 1].script.toHex();
    const buyOrderHash160 = tbc.crypto.Hash.sha256ripemd160(
      tbc.crypto.Hash.sha256(buyOrder.toBuffer()),
    ).toString("hex");
    const ftCodeBuy = FT.buildFTtransferCode(ftCode, buyOrderHash160);
    const ftTapeBuy = FT.buildFTtransferTape(ftTape, amountHex);
    const ftCodeDust = ftutxos[0].satoshis;
    tx.addOutput(
      new tbc.Transaction.Output({
        script: ftCodeBuy,
        satoshis: ftCodeDust,
      }),
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: ftTapeBuy,
        satoshis: 0,
      }),
    );

    if (ftAmount < tapeAmountSum) {
      const ftCodeChange = FT.buildFTtransferCode(ftCode, holdAddress);
      const ftTapeChange = FT.buildFTtransferTape(ftTape, changeHex);
      tx.addOutput(
        new tbc.Transaction.Output({
          script: ftCodeChange,
          satoshis: ftCodeDust,
        }),
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: ftTapeChange,
          satoshis: 0,
        }),
      );
    }

    tx.change(holdAddress);
    // const txSize = tx.getEstimateSize();
    // tx.fee(txSize < 1000 ? 80 : Math.ceil(txSize / 1000 * 80));
    tx.feePerKb(80);

    for (let i = 0; i < ftutxos.length; i++) {
      if (isCoin) tx.setInputSequence(i, 4294967294);
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
            ftutxos[i].outputIndex,
            isCoin,
          );
          return unlockingScript;
        },
      );
    }
    tx.sign(privateKey);
    tx.seal();
    const txraw = tx.uncheckedSerialize();
    // console.log(tx.verify());
    // console.log(tx.toObject());
    return txraw;
  }

  async cancelBuyOrder_privateKeyOnline(
    privateKey: tbc.PrivateKey,
    buyutxo: tbc.Transaction.IUnspentOutput,
  ) {
    const network = "https://api.tbcdev.org/api/tbc/";
    const buyPreTX = await API.fetchTXraw(buyutxo.txId, network);
    const ftutxo = buildUTXO(buyPreTX, buyutxo.outputIndex + 1, true);
    const ftPreTX: tbc.Transaction = buyPreTX;
    const ftPrePreTxData: string = await API.fetchFtPrePreTxData(
      ftPreTX,
      ftutxo.outputIndex,
      network,
    );
    const utxos = [await API.fetchUTXO(privateKey, utxoFee, network)];

    const buyData = OrderBook.getOrderData(buyutxo.script);
    const isCoin = ftutxo.script.length / 2 === coin_length;
    const ftVersion = getFTVersion(ftutxo.script, isCoin);
    const tx = new tbc.Transaction();
    tx.from(buyutxo).from(ftutxo).from(utxos);

    const tapeAmountSetIn: bigint[] = [];
    tapeAmountSetIn.push(ftutxo.ftBalance!);
    const tapeAmountSum = BigInt(tapeAmountSetIn[0]);
    const { amountHex, changeHex } = FT.buildTapeAmount(
      tapeAmountSum,
      tapeAmountSetIn,
      1,
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
      }),
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferTape(
          ftPreTX.outputs[ftutxo.outputIndex + 1].script.toHex(),
          amountHex,
        ),
        satoshis: 0,
      }),
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
      },
    );

    if (isCoin) tx.setInputSequence(1, 4294967294);
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
          ftVersion,
          isCoin,
        );
        return unlockingScript;
      },
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
    tbcFeeAddress: string,
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
      network,
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
      newSellOrderTBCAmount,
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
      newBuyOrderTBCAmount,
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
      1,
    );

    //**********FT Seller输出**********
    const ftTape = ftPreTX.outputs[ftutxo.outputIndex + 1].script.toHex();
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferCode(ftutxo.script, sellData.holdAddress),
        satoshis: ftutxo.satoshis,
      }),
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferTape(ftTape, ftSellerAmountHex),
        satoshis: 0,
      }),
    );

    //**********FT Tax输出**********
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferCode(ftutxo.script, ftFeeAddress),
        satoshis: ftutxo.satoshis,
      }),
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferTape(ftTape, ftTaxAmountHex),
        satoshis: 0,
      }),
    );

    //**********TBC Buyer输出**********
    tx.to(buyData.holdAddress, Number(tbcBuyerAmount));
    //**********TBC Tax输出**********
    if (buyData.feeRate === 0n && tbcTaxAmount === 0n) {
      tx.addOutput(
        new tbc.Transaction.Output({
          script: OrderBook.placeHolderP2PKHOutput(),
          satoshis: 0,
        }),
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
      inputsFee - fee - 1300,
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
            newSellOrderTBCAmount,
          ),
          satoshis: Number(newSellOrderTBCAmount),
        }),
      );
    } else if (newBuyOrderTBCAmount > 0n && tapeAmountSum - ftPayAmount > 0n) {
      //买单部分成交
      //**********BUY CHANGE输出**********
      const newBuyOrderCodeScript = OrderBook.updateSaleVolume(
        buyutxo.script,
        newBuyOrderTBCAmount,
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: newBuyOrderCodeScript,
          satoshis: this.buy_code_dust,
        }),
      );
      //**********FT CHANGE输出**********
      tx.addOutput(
        new tbc.Transaction.Output({
          script: FT.buildFTtransferCode(
            ftutxo.script,
            tbc.crypto.Hash.sha256ripemd160(
              tbc.crypto.Hash.sha256(newBuyOrderCodeScript.toBuffer()),
            ).toString("hex"),
          ),
          satoshis: ftutxo.satoshis,
        }),
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: FT.buildFTtransferTape(ftTape, changeHex),
          satoshis: 0,
        }),
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
          buyutxo.outputIndex,
        );
        return unlockingScript;
      },
    );

    const isCoin = ftutxo.script.length / 2 === coin_length;
    const ftVersion = getFTVersion(ftutxo.script, isCoin);
    if (isCoin) tx.setInputSequence(1, 4294967294);
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
          ftVersion,
          isCoin,
        );
        return unlockingScript;
      },
    );

    tx.setInputScript(
      {
        inputIndex: 2,
      },
      (tx) => {
        const unlockingScript = this.getOrderUnlock(
          tx,
          sellPreTX,
          sellutxo.outputIndex,
        );
        return unlockingScript;
      },
    );

    // tx.feePerKb(80);
    // const txSize = tx.getEstimateSize() + 3 * 2000;
    // tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));
    tx.sign(privateKey);
    tx.seal();
    console.log("tx fee", tx.getFee());
    // console.log(tx.toObject());
    // console.log(tx.verifyScript(1));
    // console.log(tx.verifyScript(2));
    // console.log(tx.verify());
    const txraw = tx.uncheckedSerialize();
    console.log("Transaction Raw:", txraw.length / 2000, "KB");
    return txraw;
  }

  private getTokenPartialHash(codeScript: string): string {
    if (!_isValidHexString(codeScript))
      throw new Error("Invalid FT code script hex string");
    const ftScriptLen = codeScript.length / 2;
    const partialOffset =
      ftScriptLen === coin_length
        ? coin_partial_offset
        : ftScriptLen === ft_v1_length
          ? ft_v1_partial_offset
          : ft_v2_partial_offset;
    return partial_sha256.calculate_partial_hash(
      Buffer.from(codeScript, "hex").subarray(0, partialOffset),
    );
  }

  buildTokenSellOrderTX(
    holdAddress: string,
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftaID: string,
    ftbID: string,
    ftaCodeScript: string,
    ftbCodeScript: string,
    utxos: tbc.Transaction.IUnspentOutput[],
    ftutxos: tbc.Transaction.IUnspentOutput[],
    preTXs: tbc.Transaction[],
  ): string {
    if (!tbc.Address.isValid(holdAddress) || !tbc.Address.isValid(taxAddress))
      throw new Error("Invalid HoldAddress or TaxAddress");
    if (!_isPositiveBigInt(saleVolume) || !_isPositiveBigInt(unitPrice))
      throw new Error("SaleVolume and UnitPrice must be positive bigint");
    if (_isNegativeBigInt(feeRate))
      throw new Error("FeeRate must be non-negative bigint");
    if (!_isValidSHA256Hash(ftaID) || !_isValidSHA256Hash(ftbID))
      throw new Error("FTID must be a valid SHA256 hash string");
    if (ftutxos.length === 0 || preTXs.length !== ftutxos.length)
      throw new Error("FT UTXOs and preTXs length mismatch");

    this.type = "sell";
    this.hold_address = holdAddress;
    this.sale_volume = saleVolume;
    this.unit_price = unitPrice;
    this.fee_rate = feeRate;
    this.ft_a_contract_id = ftaID;
    this.ft_b_contract_id = ftbID;
    this.ft_a_contract_partialhash = this.getTokenPartialHash(ftaCodeScript);
    this.ft_b_contract_partialhash = this.getTokenPartialHash(ftbCodeScript);

    const tx = new tbc.Transaction();
    tx.from(ftutxos).from(utxos);

    const sellOrder = this.getTokenSellOrderCode(taxAddress);
    tx.addOutput(
      new tbc.Transaction.Output({
        script: sellOrder,
        satoshis: this.buy_code_dust,
      }),
    );

    const tapeAmountSetIn: bigint[] = [];
    let tapeAmountSum = 0n;
    for (let i = 0; i < ftutxos.length; i++) {
      tapeAmountSetIn.push(ftutxos[i].ftBalance!);
      tapeAmountSum += BigInt(tapeAmountSetIn[i]);
    }
    if (saleVolume > tapeAmountSum)
      throw new Error("Sell order FT balance is insufficient");
    const { amountHex, changeHex } = FT.buildTapeAmount(
      saleVolume,
      tapeAmountSetIn,
    );
    const ftCode = ftutxos[0].script;
    const ftTape = preTXs[0].outputs[ftutxos[0].outputIndex + 1].script.toHex();
    const sellOrderHash160 = tbc.crypto.Hash.sha256ripemd160(
      tbc.crypto.Hash.sha256(sellOrder.toBuffer()),
    ).toString("hex");
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferCode(ftCode, sellOrderHash160),
        satoshis: ftutxos[0].satoshis,
      }),
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferTape(ftTape, amountHex),
        satoshis: 0,
      }),
    );

    if (saleVolume < tapeAmountSum) {
      tx.addOutput(
        new tbc.Transaction.Output({
          script: FT.buildFTtransferCode(ftCode, holdAddress),
          satoshis: ftutxos[0].satoshis,
        }),
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: FT.buildFTtransferTape(ftTape, changeHex),
          satoshis: 0,
        }),
      );
    }

    tx.change(holdAddress);
    const txSize = tx.getEstimateSize() + ftutxos.length * 2000;
    tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));
    return tx.uncheckedSerialize();
  }

  buildTokenBuyOrderTX(
    holdAddress: string,
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftaID: string,
    ftbID: string,
    ftaCodeScript: string,
    ftbCodeScript: string,
    utxos: tbc.Transaction.IUnspentOutput[],
    ftutxos: tbc.Transaction.IUnspentOutput[],
    preTXs: tbc.Transaction[],
  ): string {
    if (!tbc.Address.isValid(holdAddress) || !tbc.Address.isValid(taxAddress))
      throw new Error("Invalid HoldAddress or TaxAddress");
    if (!_isPositiveBigInt(saleVolume) || !_isPositiveBigInt(unitPrice))
      throw new Error("SaleVolume and UnitPrice must be positive bigint");
    if (_isNegativeBigInt(feeRate))
      throw new Error("FeeRate must be non-negative bigint");
    if (!_isValidSHA256Hash(ftaID) || !_isValidSHA256Hash(ftbID))
      throw new Error("FTID must be a valid SHA256 hash string");
    if (ftutxos.length === 0 || preTXs.length !== ftutxos.length)
      throw new Error("FT UTXOs and preTXs length mismatch");

    this.type = "buy";
    this.hold_address = holdAddress;
    this.sale_volume = saleVolume;
    this.unit_price = unitPrice;
    this.fee_rate = feeRate;
    this.ft_a_contract_id = ftaID;
    this.ft_b_contract_id = ftbID;
    this.ft_a_contract_partialhash = this.getTokenPartialHash(ftaCodeScript);
    this.ft_b_contract_partialhash = this.getTokenPartialHash(ftbCodeScript);

    const tx = new tbc.Transaction();
    tx.from(ftutxos).from(utxos);

    const buyOrder = this.getTokenBuyOrderCode(taxAddress);
    tx.addOutput(
      new tbc.Transaction.Output({
        script: buyOrder,
        satoshis: this.buy_code_dust,
      }),
    );

    const ftAmount = (saleVolume * unitPrice) / this.precision;
    if (ftAmount <= 0n) throw new Error("Buy order FT amount is too small");
    const tapeAmountSetIn: bigint[] = [];
    let tapeAmountSum = 0n;
    for (let i = 0; i < ftutxos.length; i++) {
      tapeAmountSetIn.push(ftutxos[i].ftBalance!);
      tapeAmountSum += BigInt(tapeAmountSetIn[i]);
    }
    if (ftAmount > tapeAmountSum)
      throw new Error("Buy order FT balance is insufficient");
    const { amountHex, changeHex } = FT.buildTapeAmount(
      ftAmount,
      tapeAmountSetIn,
    );
    const ftCode = ftutxos[0].script;
    const ftTape = preTXs[0].outputs[ftutxos[0].outputIndex + 1].script.toHex();
    const buyOrderHash160 = tbc.crypto.Hash.sha256ripemd160(
      tbc.crypto.Hash.sha256(buyOrder.toBuffer()),
    ).toString("hex");
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferCode(ftCode, buyOrderHash160),
        satoshis: ftutxos[0].satoshis,
      }),
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferTape(ftTape, amountHex),
        satoshis: 0,
      }),
    );

    if (ftAmount < tapeAmountSum) {
      tx.addOutput(
        new tbc.Transaction.Output({
          script: FT.buildFTtransferCode(ftCode, holdAddress),
          satoshis: ftutxos[0].satoshis,
        }),
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: FT.buildFTtransferTape(ftTape, changeHex),
          satoshis: 0,
        }),
      );
    }

    tx.change(holdAddress);
    const txSize = tx.getEstimateSize() + ftutxos.length * 2000;
    tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));
    return tx.uncheckedSerialize();
  }

  private fillSigsMakeTokenOrderTX(
    tokenOrderTxRaw: string,
    sigs: string[],
    publicKey: string,
    preTXs: tbc.Transaction[],
    prepreTxData: string[],
  ): string {
    if (!_isValidHexString(tokenOrderTxRaw))
      throw new Error("Invalid TokenOrderTxRaw hex string");
    if (!tbc.PublicKey.isValid(publicKey)) throw new Error("Invalid PublicKey");
    if (!Array.isArray(sigs) || sigs.some((sig) => !_isValidHexString(sig)))
      throw new Error("Invalid Signatures array");
    if (preTXs.length === 0 || preTXs.length !== prepreTxData.length)
      throw new Error("PreTXs and PrePreTxData length mismatch");
    if (prepreTxData.some((data) => !_isValidHexString(data)))
      throw new Error("Invalid PrePreTxData array");

    const tx = new tbc.Transaction(tokenOrderTxRaw);
    if (sigs.length < tx.inputs.length)
      throw new Error("Signatures length is less than inputs length");
    const isCoin = tx.outputs[1].script.toBuffer().length === coin_length;
    for (let i = 0; i < preTXs.length; i++) {
      if (isCoin) tx.setInputSequence(i, 4294967294);
      tx.setInputScript(
        {
          inputIndex: i,
        },
        (tx) =>
          FT.getFTunlock(
            sigs[i],
            publicKey,
            tx,
            preTXs[i],
            prepreTxData[i],
            i,
            tx.inputs[i].outputIndex,
            isCoin,
          ),
      );
    }

    for (let i = preTXs.length; i < tx.inputs.length; i++) {
      tx.setInputScript(
        {
          inputIndex: i,
        },
        tbc.Script.fromASM(`${sigs[i]} ${publicKey}`),
      );
    }

    return tx.uncheckedSerialize();
  }

  fillSigsMakeTokenSellOrder(
    sellOrderTxRaw: string,
    sigs: string[],
    publicKey: string,
    preTXs: tbc.Transaction[],
    prepreTxData: string[],
  ): string {
    return this.fillSigsMakeTokenOrderTX(
      sellOrderTxRaw,
      sigs,
      publicKey,
      preTXs,
      prepreTxData,
    );
  }

  fillSigsMakeTokenBuyOrder(
    buyOrderTxRaw: string,
    sigs: string[],
    publicKey: string,
    preTXs: tbc.Transaction[],
    prepreTxData: string[],
  ): string {
    return this.fillSigsMakeTokenOrderTX(
      buyOrderTxRaw,
      sigs,
      publicKey,
      preTXs,
      prepreTxData,
    );
  }

  private buildCancelTokenOrderTX(
    tokenOrderUtxo: tbc.Transaction.IUnspentOutput,
    ftutxo: tbc.Transaction.IUnspentOutput,
    ftPreTX: tbc.Transaction,
    utxos: tbc.Transaction.IUnspentOutput[],
  ): string {
    const tokenOrderData = OrderBook.getTokenOrderData(tokenOrderUtxo.script);
    const tx = new tbc.Transaction();
    tx.from(tokenOrderUtxo).from(ftutxo).from(utxos);

    const tapeAmountSetIn = [ftutxo.ftBalance!];
    const tapeAmountSum = BigInt(tapeAmountSetIn[0]);
    const { amountHex, changeHex } = FT.buildTapeAmount(
      tapeAmountSum,
      tapeAmountSetIn,
      1,
    );
    if (changeHex !== zero_ft_tape_amount)
      throw new Error("Change amount is not zero");

    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferCode(ftutxo.script, tokenOrderData.holdAddress),
        satoshis: ftutxo.satoshis,
      }),
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferTape(
          ftPreTX.outputs[ftutxo.outputIndex + 1].script.toHex(),
          amountHex,
        ),
        satoshis: 0,
      }),
    );
    tx.change(tokenOrderData.holdAddress);
    const txSize = tx.getEstimateSize() + 2000;
    tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));
    return tx.uncheckedSerialize();
  }

  buildCancelTokenSellOrderTX(
    sellutxo: tbc.Transaction.IUnspentOutput,
    ftutxo: tbc.Transaction.IUnspentOutput,
    ftPreTX: tbc.Transaction,
    utxos: tbc.Transaction.IUnspentOutput[],
  ): string {
    return this.buildCancelTokenOrderTX(sellutxo, ftutxo, ftPreTX, utxos);
  }

  buildCancelTokenBuyOrderTX(
    buyutxo: tbc.Transaction.IUnspentOutput,
    ftutxo: tbc.Transaction.IUnspentOutput,
    ftPreTX: tbc.Transaction,
    utxos: tbc.Transaction.IUnspentOutput[],
  ): string {
    return this.buildCancelTokenOrderTX(buyutxo, ftutxo, ftPreTX, utxos);
  }

  private fillSigsCancelTokenOrderTX(
    tokenOrderTxRaw: string,
    sigs: string[],
    publicKey: string,
    tokenOrderPreTX: tbc.Transaction,
    ftPreTX: tbc.Transaction,
    ftPrePreTxData: string,
  ): string {
    if (!_isValidHexString(tokenOrderTxRaw))
      throw new Error("Invalid TokenOrderTxRaw hex string");
    if (!tbc.PublicKey.isValid(publicKey)) throw new Error("Invalid PublicKey");
    if (!Array.isArray(sigs) || sigs.some((sig) => !_isValidHexString(sig)))
      throw new Error("Invalid Signatures array");
    if (!_isValidHexString(ftPrePreTxData))
      throw new Error("Invalid FtPrePreTxData string");

    const tx = new tbc.Transaction(tokenOrderTxRaw);
    if (sigs.length < tx.inputs.length)
      throw new Error("Signatures length is less than inputs length");
    const isCoin = tx.outputs[0].script.toBuffer().length === coin_length;
    const ftVersion = getFTVersion(tx.outputs[0].script.toHex(), isCoin);

    tx.setInputScript(
      {
        inputIndex: 0,
      },
      tbc.Script.fromASM(`${sigs[0]} ${publicKey} OP_2`),
    );

    if (isCoin) tx.setInputSequence(1, 4294967294);
    tx.setInputScript(
      {
        inputIndex: 1,
      },
      (tx) =>
        FT.getFTunlockSwap(
          sigs[1],
          publicKey,
          tx,
          ftPreTX,
          ftPrePreTxData,
          tokenOrderPreTX,
          1,
          tx.inputs[1].outputIndex,
          ftVersion,
          isCoin,
        ),
    );

    for (let i = 2; i < tx.inputs.length; i++) {
      tx.setInputScript(
        {
          inputIndex: i,
        },
        tbc.Script.fromASM(`${sigs[i]} ${publicKey}`),
      );
    }

    return tx.uncheckedSerialize();
  }

  fillSigsCancelTokenSellOrder(
    cancelSellOrderTxRaw: string,
    sigs: string[],
    publicKey: string,
    sellPreTX: tbc.Transaction,
    ftPreTX: tbc.Transaction,
    ftPrePreTxData: string,
  ): string {
    return this.fillSigsCancelTokenOrderTX(
      cancelSellOrderTxRaw,
      sigs,
      publicKey,
      sellPreTX,
      ftPreTX,
      ftPrePreTxData,
    );
  }

  fillSigsCancelTokenBuyOrder(
    cancelBuyOrderTxRaw: string,
    sigs: string[],
    publicKey: string,
    buyPreTX: tbc.Transaction,
    ftPreTX: tbc.Transaction,
    ftPrePreTxData: string,
  ): string {
    return this.fillSigsCancelTokenOrderTX(
      cancelBuyOrderTxRaw,
      sigs,
      publicKey,
      buyPreTX,
      ftPreTX,
      ftPrePreTxData,
    );
  }

  private buildMatchTokenOrderTransaction(
    buyutxo: tbc.Transaction.IUnspentOutput,
    buyPreTX: tbc.Transaction,
    buyFtUtxo: tbc.Transaction.IUnspentOutput,
    buyFtPreTX: tbc.Transaction,
    sellutxo: tbc.Transaction.IUnspentOutput,
    sellPreTX: tbc.Transaction,
    sellFtUtxo: tbc.Transaction.IUnspentOutput,
    sellFtPreTX: tbc.Transaction,
    utxos: tbc.Transaction.IUnspentOutput[],
    ftaFeeAddress: string,
    ftbFeeAddress: string,
  ) {
    if (
      !tbc.Address.isValid(ftaFeeAddress) ||
      !tbc.Address.isValid(ftbFeeAddress)
    )
      throw new Error("Invalid fee address");
    if (utxos.length === 0) throw new Error("TBC fee UTXOs required");

    const buyData = OrderBook.getTokenOrderData(buyutxo.script);
    const sellData = OrderBook.getTokenOrderData(sellutxo.script);
    if (buyData.ftaID !== sellData.ftaID || buyData.ftbID !== sellData.ftbID)
      throw new Error("Token order pair mismatch");
    if (
      buyData.ftaPartialHash !== sellData.ftaPartialHash ||
      buyData.ftbPartialHash !== sellData.ftbPartialHash
    )
      throw new Error("Token order code hash mismatch");
    if (buyData.unitPrice !== sellData.unitPrice)
      throw new Error("Token order unitPrice mismatch");

    const matchedAAmount =
      buyData.saleVolume < sellData.saleVolume
        ? buyData.saleVolume
        : sellData.saleVolume;
    const tokenATaxAmount = (matchedAAmount * buyData.feeRate) / this.precision;
    const tokenABuyerAmount = matchedAAmount - tokenATaxAmount;
    const newSellOrderAmount = sellData.saleVolume - matchedAAmount;

    const tokenBPayAmount =
      (matchedAAmount * sellData.unitPrice) / this.precision;
    const tokenBTaxAmount =
      (tokenBPayAmount * sellData.feeRate) / this.precision;
    const tokenBSellerAmount = tokenBPayAmount - tokenBTaxAmount;
    const newBuyOrderAmount = buyData.saleVolume - matchedAAmount;

    if (tokenABuyerAmount <= 0n || tokenBSellerAmount <= 0n)
      throw new Error("Matched amount is too small after fee");
    if (BigInt(sellFtUtxo.ftBalance!) < matchedAAmount)
      throw new Error("Sell order FT balance is insufficient");
    if (BigInt(buyFtUtxo.ftBalance!) < tokenBPayAmount)
      throw new Error("Buy order FT balance is insufficient");

    const tx = new tbc.Transaction();
    tx.from(buyutxo)
      .from(buyFtUtxo)
      .from(sellutxo)
      .from(sellFtUtxo)
      .from(utxos);

    const addFTPair = (
      codeScript: string,
      tapeScript: string,
      amountHex: string,
      addressOrHash: string,
      satoshis: number,
    ) => {
      tx.addOutput(
        new tbc.Transaction.Output({
          script: FT.buildFTtransferCode(codeScript, addressOrHash),
          satoshis,
        }),
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: FT.buildFTtransferTape(tapeScript, amountHex),
          satoshis: 0,
        }),
      );
    };

    const tokenATape =
      sellFtPreTX.outputs[sellFtUtxo.outputIndex + 1].script.toHex();
    const tokenBTape =
      buyFtPreTX.outputs[buyFtUtxo.outputIndex + 1].script.toHex();
    const tokenABalance = BigInt(sellFtUtxo.ftBalance!);
    const tokenBBalance = BigInt(buyFtUtxo.ftBalance!);

    const { amountHex: tokenABuyerAmountHex } = FT.buildTapeAmount(
      tokenABuyerAmount,
      [tokenABalance],
      3,
    );
    const {
      amountHex: tokenATaxAmountHex,
      changeHex: tokenAChangeHex,
    } = FT.buildTapeAmount(
      tokenATaxAmount,
      [tokenABalance - tokenABuyerAmount],
      3,
    );
    const { amountHex: tokenBSellerAmountHex } = FT.buildTapeAmount(
      tokenBSellerAmount,
      [tokenBBalance],
      1,
    );
    const {
      amountHex: tokenBTaxAmountHex,
      changeHex: tokenBChangeHex,
    } = FT.buildTapeAmount(
      tokenBTaxAmount,
      [tokenBBalance - tokenBSellerAmount],
      1,
    );

    addFTPair(
      sellFtUtxo.script,
      tokenATape,
      tokenABuyerAmountHex,
      buyData.holdAddress,
      sellFtUtxo.satoshis,
    );
    addFTPair(
      sellFtUtxo.script,
      tokenATape,
      tokenATaxAmountHex,
      ftaFeeAddress,
      sellFtUtxo.satoshis,
    );
    addFTPair(
      buyFtUtxo.script,
      tokenBTape,
      tokenBSellerAmountHex,
      sellData.holdAddress,
      buyFtUtxo.satoshis,
    );
    addFTPair(
      buyFtUtxo.script,
      tokenBTape,
      tokenBTaxAmountHex,
      ftbFeeAddress,
      buyFtUtxo.satoshis,
    );

    const feeChangeAddress = tbc.Script.fromHex(utxos[0].script)
      .toAddress()
      .toString();
    const changeOutputIndex = tx.outputs.length;
    tx.to(feeChangeAddress, 1);

    if (newSellOrderAmount > 0n) {
      if (tokenAChangeHex === zero_ft_tape_amount)
        throw new Error("Sell order remains but TokenA change is zero");
      const newSellOrderCodeScript = OrderBook.updateTokenSaleVolume(
        sellutxo.script,
        newSellOrderAmount,
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: newSellOrderCodeScript,
          satoshis: this.buy_code_dust,
        }),
      );
      addFTPair(
        sellFtUtxo.script,
        tokenATape,
        tokenAChangeHex,
        tbc.crypto.Hash.sha256ripemd160(
          tbc.crypto.Hash.sha256(newSellOrderCodeScript.toBuffer()),
        ).toString("hex"),
        sellFtUtxo.satoshis,
      );
    } else if (newBuyOrderAmount > 0n) {
      if (tokenBChangeHex === zero_ft_tape_amount)
        throw new Error("Buy order remains but TokenB change is zero");
      const newBuyOrderCodeScript = OrderBook.updateTokenSaleVolume(
        buyutxo.script,
        newBuyOrderAmount,
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: newBuyOrderCodeScript,
          satoshis: this.buy_code_dust,
        }),
      );
      addFTPair(
        buyFtUtxo.script,
        tokenBTape,
        tokenBChangeHex,
        tbc.crypto.Hash.sha256ripemd160(
          tbc.crypto.Hash.sha256(newBuyOrderCodeScript.toBuffer()),
        ).toString("hex"),
        buyFtUtxo.satoshis,
      );
    }

    const inputSatoshis =
      buyutxo.satoshis +
      buyFtUtxo.satoshis +
      sellutxo.satoshis +
      sellFtUtxo.satoshis +
      utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);
    const outputSatoshisWithoutChange = tx.outputs.reduce(
      (sum, output, index) =>
        index === changeOutputIndex ? sum : sum + output.satoshis,
      0,
    );
    const txSize = tx.getEstimateSize() + 2 * 1000 + 2 * 2000;
    const fee = txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80);
    const changeAmount = inputSatoshis - outputSatoshisWithoutChange - fee;
    if (changeAmount < 24)
      throw new Error("Insufficient TBC fee UTXO for token match order");
    (tx.outputs[changeOutputIndex] as any).satoshis = changeAmount;

    return { tx, buyData, sellData };
  }

  matchTokenOrder(
    privateKey: tbc.PrivateKey,
    buyutxo: tbc.Transaction.IUnspentOutput,
    buyPreTX: tbc.Transaction,
    buyFtUtxo: tbc.Transaction.IUnspentOutput,
    buyFtPreTX: tbc.Transaction,
    buyFtPrePreTxData: string,
    sellutxo: tbc.Transaction.IUnspentOutput,
    sellPreTX: tbc.Transaction,
    sellFtUtxo: tbc.Transaction.IUnspentOutput,
    sellFtPreTX: tbc.Transaction,
    sellFtPrePreTxData: string,
    utxos: tbc.Transaction.IUnspentOutput[],
    ftaFeeAddress: string,
    ftbFeeAddress: string,
  ): string {
    if (!_isValidHexString(buyFtPrePreTxData))
      throw new Error("Invalid BuyFtPrePreTxData string");
    if (!_isValidHexString(sellFtPrePreTxData))
      throw new Error("Invalid SellFtPrePreTxData string");

    const { tx, buyData, sellData } = this.buildMatchTokenOrderTransaction(
      buyutxo,
      buyPreTX,
      buyFtUtxo,
      buyFtPreTX,
      sellutxo,
      sellPreTX,
      sellFtUtxo,
      sellFtPreTX,
      utxos,
      ftaFeeAddress,
      ftbFeeAddress,
    );

    tx.setInputScript(
      {
        inputIndex: 0,
      },
      (tx) => this.getTokenOrderUnlock(tx, buyPreTX, buyutxo.outputIndex),
    );

    const buyFtIsCoin = buyFtUtxo.script.length / 2 === coin_length;
    const buyFtVersion = getFTVersion(buyFtUtxo.script, buyFtIsCoin);
    if (buyFtIsCoin) tx.setInputSequence(1, 4294967294);
    tx.setInputScript(
      {
        inputIndex: 1,
      },
      (tx) =>
        new FT(buyData.ftbID).getFTunlockSwap(
          privateKey,
          tx,
          buyFtPreTX,
          buyFtPrePreTxData,
          buyPreTX,
          1,
          buyFtUtxo.outputIndex,
          buyFtVersion,
          buyFtIsCoin,
          true,
        ),
    );

    tx.setInputScript(
      {
        inputIndex: 2,
      },
      (tx) => this.getTokenOrderUnlock(tx, sellPreTX, sellutxo.outputIndex),
    );

    const sellFtIsCoin = sellFtUtxo.script.length / 2 === coin_length;
    const sellFtVersion = getFTVersion(sellFtUtxo.script, sellFtIsCoin);
    if (sellFtIsCoin) tx.setInputSequence(3, 4294967294);
    tx.setInputScript(
      {
        inputIndex: 3,
      },
      (tx) =>
        new FT(sellData.ftaID).getFTunlockSwap(
          privateKey,
          tx,
          sellFtPreTX,
          sellFtPrePreTxData,
          sellPreTX,
          3,
          sellFtUtxo.outputIndex,
          sellFtVersion,
          sellFtIsCoin,
          true,
        ),
    );

    tx.sign(privateKey);
    tx.seal();
    return tx.uncheckedSerialize();
  }

  async makeTokenSellOrder_privateKeyOnline(
    privateKey: tbc.PrivateKey,
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftaID: string,
    ftbID: string,
  ) {
    if (!_isPositiveBigInt(saleVolume) || !_isPositiveBigInt(unitPrice))
      throw new Error("SaleVolume and UnitPrice must be positive bigint");
    if (_isNegativeBigInt(feeRate))
      throw new Error("FeeRate must be non-negative bigint");
    if (!_isValidSHA256Hash(ftaID) || !_isValidSHA256Hash(ftbID))
      throw new Error("FTID must be a valid SHA256 hash string");

    const network = "https://api.tbcdev.org/api/tbc/";
    const TokenA = new FT(ftaID);
    const TokenB = new FT(ftbID);
    let TokenInfoA;
    try {
      TokenInfoA = (await API.fetchCoinInfo(TokenA.contractTxid, network))
        .coinInfo;
    } catch {
      TokenInfoA = await API.fetchFtInfo(TokenA.contractTxid, network);
    }
    let TokenInfoB;
    try {
      TokenInfoB = (await API.fetchCoinInfo(TokenB.contractTxid, network))
        .coinInfo;
    } catch {
      TokenInfoB = await API.fetchFtInfo(TokenB.contractTxid, network);
    }

    const ftautxo_codeScript = FT.buildFTtransferCode(
      TokenInfoA.codeScript,
      privateKey.toAddress().toString(),
    )
      .toBuffer()
      .toString("hex");

    const ftScriptLenA = TokenInfoA.codeScript.length / 2;
    const isCoinA = ftScriptLenA === coin_length;
    const partialOffsetA = isCoinA ? coin_partial_offset : ft_v2_partial_offset;
    this.ft_a_contract_partialhash = partial_sha256.calculate_partial_hash(
      Buffer.from(TokenInfoA.codeScript, "hex").subarray(0, partialOffsetA),
    );
    const ftScriptLenB = TokenInfoB.codeScript.length / 2;
    const isCoinB = ftScriptLenB === coin_length;
    const partialOffsetB = isCoinB ? coin_partial_offset : ft_v2_partial_offset;
    this.ft_b_contract_partialhash = partial_sha256.calculate_partial_hash(
      Buffer.from(TokenInfoB.codeScript, "hex").subarray(0, partialOffsetB),
    );
    const ftutxos = isCoinA
      ? await API.fetchCoinUTXOs(
          TokenA.contractTxid,
          privateKey.toAddress().toString(),
          saleVolume,
          ftautxo_codeScript,
          network,
          5,
        )
      : await API.fetchFtUTXOs(
          ftaID,
          privateKey.toAddress().toString(),
          ftautxo_codeScript,
          network,
          saleVolume,
        );
    let preTXs: tbc.Transaction[] = [];
    let prepreTxData: string[] = [];
    for (let i = 0; i < ftutxos.length; i++) {
      preTXs.push(await API.fetchTXraw(ftutxos[i].txId, network)); //获取每个ft输入的父交易
      prepreTxData.push(
        await API.fetchFtPrePreTxData(
          preTXs[i],
          ftutxos[i].outputIndex,
          network,
        ),
      ); //获取每个ft输入的爷交易
    }
    const utxos = await API.fetchUTXO(privateKey, utxoFee, network);

    const holdAddress = privateKey.toAddress().toString();
    this.type = "sell";
    this.hold_address = holdAddress;
    this.sale_volume = saleVolume;
    this.unit_price = unitPrice;
    this.fee_rate = feeRate;
    this.ft_a_contract_id = ftaID;
    this.ft_b_contract_id = ftbID;

    const tx = new tbc.Transaction();
    tx.from(ftutxos).from(utxos);

    //Sell Order Output
    const sellOrder = this.getTokenSellOrderCode(taxAddress);
    tx.addOutput(
      new tbc.Transaction.Output({
        script: sellOrder,
        satoshis: this.buy_code_dust,
      }),
    );

    //FT Code Sell Output
    const ftAmount = saleVolume;
    const tapeAmountSetIn: bigint[] = [];
    let tapeAmountSum = BigInt(0);
    for (let i = 0; i < ftutxos.length; i++) {
      tapeAmountSetIn.push(ftutxos[i].ftBalance!);
      tapeAmountSum += BigInt(tapeAmountSetIn[i]);
    }
    let { amountHex, changeHex } = FT.buildTapeAmount(
      ftAmount,
      tapeAmountSetIn,
    );
    const ftCode = ftutxos[0].script;
    const ftTape = preTXs[0].outputs[ftutxos[0].outputIndex + 1].script.toHex();
    const sellOrderHash160 = tbc.crypto.Hash.sha256ripemd160(
      tbc.crypto.Hash.sha256(sellOrder.toBuffer()),
    ).toString("hex");
    const ftCodeSell = FT.buildFTtransferCode(ftCode, sellOrderHash160);
    const ftTapeSell = FT.buildFTtransferTape(ftTape, amountHex);
    const ftCodeDust = ftutxos[0].satoshis;
    tx.addOutput(
      new tbc.Transaction.Output({
        script: ftCodeSell,
        satoshis: ftCodeDust,
      }),
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: ftTapeSell,
        satoshis: 0,
      }),
    );

    if (ftAmount < tapeAmountSum) {
      const ftCodeChange = FT.buildFTtransferCode(ftCode, holdAddress);
      const ftTapeChange = FT.buildFTtransferTape(ftTape, changeHex);
      tx.addOutput(
        new tbc.Transaction.Output({
          script: ftCodeChange,
          satoshis: ftCodeDust,
        }),
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: ftTapeChange,
          satoshis: 0,
        }),
      );
    }

    tx.change(holdAddress);
    tx.feePerKb(80);

    for (let i = 0; i < ftutxos.length; i++) {
      if (isCoinA) tx.setInputSequence(i, 4294967294);
      tx.setInputScript(
        {
          inputIndex: i,
        },
        (tx) => {
          const unlockingScript = new FT(ftaID).getFTunlock(
            privateKey,
            tx,
            preTXs[i],
            prepreTxData[i],
            i,
            ftutxos[i].outputIndex,
            isCoinA,
          );
          return unlockingScript;
        },
      );
    }
    tx.sign(privateKey);
    tx.seal();
    const txraw = tx.uncheckedSerialize();
    return txraw;
  }

  async cancelTokenSellOrder_privateKeyOnline(
    privateKey: tbc.PrivateKey,
    sellutxo: tbc.Transaction.IUnspentOutput,
  ) {
    const network = "https://api.tbcdev.org/api/tbc/";
    const sellPreTX = await API.fetchTXraw(sellutxo.txId, network);
    const ftutxo = buildUTXO(sellPreTX, sellutxo.outputIndex + 1, true);
    const ftPreTX: tbc.Transaction = sellPreTX;
    const ftPrePreTxData: string = await API.fetchFtPrePreTxData(
      ftPreTX,
      ftutxo.outputIndex,
      network,
    );
    const utxos = [await API.fetchUTXO(privateKey, utxoFee, network)];

    const sellData = OrderBook.getTokenOrderData(sellutxo.script);
    const isCoin = ftutxo.script.length / 2 === coin_length;
    const ftVersion = getFTVersion(ftutxo.script, isCoin);
    const tx = new tbc.Transaction();
    tx.from(sellutxo).from(ftutxo).from(utxos);

    const tapeAmountSetIn: bigint[] = [];
    tapeAmountSetIn.push(ftutxo.ftBalance!);
    const tapeAmountSum = BigInt(tapeAmountSetIn[0]);
    const { amountHex, changeHex } = FT.buildTapeAmount(
      tapeAmountSum,
      tapeAmountSetIn,
      1,
    );
    if (
      changeHex !=
      "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
    ) {
      throw new Error("Change amount is not zero");
    }

    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferCode(ftutxo.script, sellData.holdAddress),
        satoshis: ftutxo.satoshis,
      }),
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferTape(
          ftPreTX.outputs[ftutxo.outputIndex + 1].script.toHex(),
          amountHex,
        ),
        satoshis: 0,
      }),
    );
    tx.change(sellData.holdAddress);
    tx.feePerKb(80);

    tx.setInputScript(
      {
        inputIndex: 0,
      },
      (tx) => {
        const sig = tx.getSignature(0, privateKey);
        const pubKey = privateKey.toPublicKey().toString();
        return tbc.Script.fromASM(`${sig} ${pubKey} OP_2`);
      },
    );

    if (isCoin) tx.setInputSequence(1, 4294967294);
    tx.setInputScript(
      {
        inputIndex: 1,
      },
      (tx) => {
        const unlockingScript = new FT(sellData.ftaID).getFTunlockSwap(
          privateKey,
          tx,
          ftPreTX,
          ftPrePreTxData,
          sellPreTX,
          1,
          ftutxo.outputIndex,
          ftVersion,
          isCoin,
        );
        return unlockingScript;
      },
    );
    tx.sign(privateKey);
    tx.seal();
    const txraw = tx.uncheckedSerialize();
    return txraw;
  }

  async makeTokenBuyOrder_privateKeyOnline(
    privateKey: tbc.PrivateKey,
    taxAddress: string,
    saleVolume: bigint,
    unitPrice: bigint,
    feeRate: bigint,
    ftaID: string,
    ftbID: string,
  ) {
    if (!_isPositiveBigInt(saleVolume) || !_isPositiveBigInt(unitPrice))
      throw new Error("SaleVolume and UnitPrice must be positive bigint");
    if (_isNegativeBigInt(feeRate))
      throw new Error("FeeRate must be non-negative bigint");
    if (!_isValidSHA256Hash(ftaID) || !_isValidSHA256Hash(ftbID))
      throw new Error("FTID must be a valid SHA256 hash string");

    const network = "https://api.tbcdev.org/api/tbc/";
    const TokenA = new FT(ftaID);
    const TokenB = new FT(ftbID);
    let TokenInfoA;
    try {
      TokenInfoA = (await API.fetchCoinInfo(TokenA.contractTxid, network))
        .coinInfo;
    } catch {
      TokenInfoA = await API.fetchFtInfo(TokenA.contractTxid, network);
    }
    let TokenInfoB;
    try {
      TokenInfoB = (await API.fetchCoinInfo(TokenB.contractTxid, network))
        .coinInfo;
    } catch {
      TokenInfoB = await API.fetchFtInfo(TokenB.contractTxid, network);
    }
    const ftbutxo_codeScript = stableCoin
      .buildFTtransferCode(
        TokenInfoB.codeScript,
        privateKey.toAddress().toString(),
      )
      .toBuffer()
      .toString("hex");

    const ftScriptLenA = TokenInfoA.codeScript.length / 2;
    const isCoinA = ftScriptLenA === coin_length;
    const partialOffsetA = isCoinA ? coin_partial_offset : ft_v2_partial_offset;
    this.ft_a_contract_partialhash = partial_sha256.calculate_partial_hash(
      Buffer.from(TokenInfoA.codeScript, "hex").subarray(0, partialOffsetA),
    );
    const ftScriptLenB = TokenInfoB.codeScript.length / 2;
    const isCoinB = ftScriptLenB === coin_length;
    const partialOffsetB = isCoinB ? coin_partial_offset : ft_v2_partial_offset;
    this.ft_b_contract_partialhash = partial_sha256.calculate_partial_hash(
      Buffer.from(TokenInfoB.codeScript, "hex").subarray(0, partialOffsetB),
    );
    const requiredAmount = (saleVolume * unitPrice) / this.precision;
    const ftutxos = isCoinB
      ? await API.fetchCoinUTXOs(
          TokenB.contractTxid,
          privateKey.toAddress().toString(),
          requiredAmount,
          ftbutxo_codeScript,
          network,
          5,
        )
      : await API.fetchFtUTXOs(
          ftbID,
          privateKey.toAddress().toString(),
          ftbutxo_codeScript,
          network,
          requiredAmount,
        );
    let preTXs: tbc.Transaction[] = [];
    let prepreTxData: string[] = [];
    for (let i = 0; i < ftutxos.length; i++) {
      preTXs.push(await API.fetchTXraw(ftutxos[i].txId, network)); //获取每个ft输入的父交易
      prepreTxData.push(
        await API.fetchFtPrePreTxData(
          preTXs[i],
          ftutxos[i].outputIndex,
          network,
        ),
      ); //获取每个ft输入的爷交易
    }
    const utxos = await API.fetchUTXO(privateKey, utxoFee, network);

    const holdAddress = privateKey.toAddress().toString();
    this.type = "buy";
    this.hold_address = holdAddress;
    this.sale_volume = saleVolume;
    this.unit_price = unitPrice;
    this.fee_rate = feeRate;
    this.ft_a_contract_id = ftaID;
    this.ft_b_contract_id = ftbID;

    const tx = new tbc.Transaction();
    tx.from(ftutxos);
    tx.from(utxos);

    // Buy Order Output
    const buyOrder = this.getTokenBuyOrderCode(taxAddress);
    tx.addOutput(
      new tbc.Transaction.Output({
        script: buyOrder,
        satoshis: this.buy_code_dust,
      }),
    );

    //FT Code Buy Output
    const ftAmount = requiredAmount;
    const tapeAmountSetIn: bigint[] = [];
    let tapeAmountSum = BigInt(0);
    for (let i = 0; i < ftutxos.length; i++) {
      tapeAmountSetIn.push(ftutxos[i].ftBalance!);
      tapeAmountSum += BigInt(tapeAmountSetIn[i]);
    }
    let { amountHex, changeHex } = FT.buildTapeAmount(
      ftAmount,
      tapeAmountSetIn,
    );
    const ftCode = ftutxos[0].script;
    const ftTape = preTXs[0].outputs[ftutxos[0].outputIndex + 1].script.toHex();
    const buyOrderHash160 = tbc.crypto.Hash.sha256ripemd160(
      tbc.crypto.Hash.sha256(buyOrder.toBuffer()),
    ).toString("hex");
    const ftCodeBuy = FT.buildFTtransferCode(ftCode, buyOrderHash160);
    const ftTapeBuy = FT.buildFTtransferTape(ftTape, amountHex);
    const ftCodeDust = ftutxos[0].satoshis;
    tx.addOutput(
      new tbc.Transaction.Output({
        script: ftCodeBuy,
        satoshis: ftCodeDust,
      }),
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: ftTapeBuy,
        satoshis: 0,
      }),
    );

    if (ftAmount < tapeAmountSum) {
      const ftCodeChange = FT.buildFTtransferCode(ftCode, holdAddress);
      const ftTapeChange = FT.buildFTtransferTape(ftTape, changeHex);
      tx.addOutput(
        new tbc.Transaction.Output({
          script: ftCodeChange,
          satoshis: ftCodeDust,
        }),
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: ftTapeChange,
          satoshis: 0,
        }),
      );
    }

    tx.change(holdAddress);
    tx.feePerKb(80);

    for (let i = 0; i < ftutxos.length; i++) {
      if (isCoinB) tx.setInputSequence(i, 4294967294);
      tx.setInputScript(
        {
          inputIndex: i,
        },
        (tx) => {
          const unlockingScript = new FT(ftbID).getFTunlock(
            privateKey,
            tx,
            preTXs[i],
            prepreTxData[i],
            i,
            ftutxos[i].outputIndex,
            isCoinB,
          );
          return unlockingScript;
        },
      );
    }
    tx.sign(privateKey);
    tx.seal();
    const txraw = tx.uncheckedSerialize();
    // console.log(tx.verify());
    // console.log(tx.toObject());
    return txraw;
  }

  async cancelTokenBuyOrder_privateKeyOnline(
    privateKey: tbc.PrivateKey,
    buyutxo: tbc.Transaction.IUnspentOutput,
  ) {
    const network = "https://api.tbcdev.org/api/tbc/";
    const buyPreTX = await API.fetchTXraw(buyutxo.txId, network);
    const ftutxo = buildUTXO(buyPreTX, buyutxo.outputIndex + 1, true);
    const ftPreTX: tbc.Transaction = buyPreTX;
    const ftPrePreTxData: string = await API.fetchFtPrePreTxData(
      ftPreTX,
      ftutxo.outputIndex,
      network,
    );
    const utxos = [await API.fetchUTXO(privateKey, utxoFee, network)];

    const buyData = OrderBook.getTokenOrderData(buyutxo.script);
    const isCoin = ftutxo.script.length / 2 === coin_length;
    const ftVersion = getFTVersion(ftutxo.script, isCoin);
    const tx = new tbc.Transaction();
    tx.from(buyutxo).from(ftutxo).from(utxos);

    const tapeAmountSetIn: bigint[] = [];
    tapeAmountSetIn.push(ftutxo.ftBalance!);
    const tapeAmountSum = BigInt(tapeAmountSetIn[0]);
    const { amountHex, changeHex } = FT.buildTapeAmount(
      tapeAmountSum,
      tapeAmountSetIn,
      1,
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
      }),
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferTape(
          ftPreTX.outputs[ftutxo.outputIndex + 1].script.toHex(),
          amountHex,
        ),
        satoshis: 0,
      }),
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
      },
    );

    if (isCoin) tx.setInputSequence(1, 4294967294);
    tx.setInputScript(
      {
        inputIndex: 1,
      },
      (tx) => {
        const unlockingScript = new FT(buyData.ftbID).getFTunlockSwap(
          privateKey,
          tx,
          ftPreTX,
          ftPrePreTxData,
          buyPreTX,
          1,
          ftutxo.outputIndex,
          ftVersion,
          isCoin,
        );
        return unlockingScript;
      },
    );
    tx.sign(privateKey);
    tx.seal();
    // console.log(tx.verify());
    const txraw = tx.uncheckedSerialize();
    return txraw;
  }

  async matchTokenOrderOnline(
    privateKey: tbc.PrivateKey,
    buyutxo: tbc.Transaction.IUnspentOutput,
    sellutxo: tbc.Transaction.IUnspentOutput,
    ftaFeeAddress: string,
    ftbFeeAddress: string,
  ) {
    if (
      !tbc.Address.isValid(ftaFeeAddress) ||
      !tbc.Address.isValid(ftbFeeAddress)
    )
      throw new Error("Invalid fee address");

    const network = "https://api.tbcdev.org/api/tbc/";
    const buyPreTX = await API.fetchTXraw(buyutxo.txId, network);
    const sellPreTX = await API.fetchTXraw(sellutxo.txId, network);
    const buyFtUtxo = buildUTXO(buyPreTX, buyutxo.outputIndex + 1, true);
    const sellFtUtxo = buildUTXO(sellPreTX, sellutxo.outputIndex + 1, true);
    const buyFtPrePreTxData: string = await API.fetchFtPrePreTxData(
      buyPreTX,
      buyFtUtxo.outputIndex,
      network,
    );
    const sellFtPrePreTxData: string = await API.fetchFtPrePreTxData(
      sellPreTX,
      sellFtUtxo.outputIndex,
      network,
    );
    const utxos = [await API.fetchUTXO(privateKey, utxoFee, network)];

    const buyData = OrderBook.getTokenOrderData(buyutxo.script);
    const sellData = OrderBook.getTokenOrderData(sellutxo.script);
    if (buyData.ftaID !== sellData.ftaID || buyData.ftbID !== sellData.ftbID)
      throw new Error("Token order pair mismatch");
    if (
      buyData.ftaPartialHash !== sellData.ftaPartialHash ||
      buyData.ftbPartialHash !== sellData.ftbPartialHash
    )
      throw new Error("Token order code hash mismatch");
    if (buyData.unitPrice !== sellData.unitPrice)
      throw new Error("Token order unitPrice mismatch");

    const matchedAAmount =
      buyData.saleVolume < sellData.saleVolume
        ? buyData.saleVolume
        : sellData.saleVolume;
    const tokenATaxAmount = (matchedAAmount * buyData.feeRate) / this.precision;
    const tokenABuyerAmount = matchedAAmount - tokenATaxAmount;
    const newSellOrderAmount = sellData.saleVolume - matchedAAmount;

    const tokenBPayAmount = (matchedAAmount * sellData.unitPrice) / this.precision;
    const tokenBTaxAmount = (tokenBPayAmount * sellData.feeRate) / this.precision;
    const tokenBSellerAmount = tokenBPayAmount - tokenBTaxAmount;
    const newBuyOrderAmount = buyData.saleVolume - matchedAAmount;

    if (tokenABuyerAmount <= 0n || tokenBSellerAmount <= 0n)
      throw new Error("Matched amount is too small after fee");
    if (BigInt(sellFtUtxo.ftBalance!) < matchedAAmount)
      throw new Error("Sell order FT balance is insufficient");
    if (BigInt(buyFtUtxo.ftBalance!) < tokenBPayAmount)
      throw new Error("Buy order FT balance is insufficient");

    const tx = new tbc.Transaction();
    tx.from(buyutxo).from(buyFtUtxo).from(sellutxo).from(sellFtUtxo).from(utxos);

    const addFTPair = (
      codeScript: string,
      tapeScript: string,
      amountHex: string,
      addressOrHash: string,
      satoshis: number,
    ) => {
      tx.addOutput(
        new tbc.Transaction.Output({
          script: FT.buildFTtransferCode(codeScript, addressOrHash),
          satoshis,
        }),
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: FT.buildFTtransferTape(tapeScript, amountHex),
          satoshis: 0,
        }),
      );
    };

    const tokenATape =
      sellPreTX.outputs[sellFtUtxo.outputIndex + 1].script.toHex();
    const tokenBTape = buyPreTX.outputs[buyFtUtxo.outputIndex + 1].script.toHex();
    const tokenABalance = BigInt(sellFtUtxo.ftBalance!);
    const tokenBBalance = BigInt(buyFtUtxo.ftBalance!);

    const { amountHex: tokenABuyerAmountHex } = FT.buildTapeAmount(
      tokenABuyerAmount,
      [tokenABalance],
      3,
    );
    const {
      amountHex: tokenATaxAmountHex,
      changeHex: tokenAChangeHex,
    } = FT.buildTapeAmount(
      tokenATaxAmount,
      [tokenABalance - tokenABuyerAmount],
      3,
    );

    const { amountHex: tokenBSellerAmountHex } = FT.buildTapeAmount(
      tokenBSellerAmount,
      [tokenBBalance],
      1,
    );
    const {
      amountHex: tokenBTaxAmountHex,
      changeHex: tokenBChangeHex,
    } = FT.buildTapeAmount(
      tokenBTaxAmount,
      [tokenBBalance - tokenBSellerAmount],
      1,
    );

    addFTPair(
      sellFtUtxo.script,
      tokenATape,
      tokenABuyerAmountHex,
      buyData.holdAddress,
      sellFtUtxo.satoshis,
    );
    addFTPair(
      sellFtUtxo.script,
      tokenATape,
      tokenATaxAmountHex,
      ftaFeeAddress,
      sellFtUtxo.satoshis,
    );
    addFTPair(
      buyFtUtxo.script,
      tokenBTape,
      tokenBSellerAmountHex,
      sellData.holdAddress,
      buyFtUtxo.satoshis,
    );
    addFTPair(
      buyFtUtxo.script,
      tokenBTape,
      tokenBTaxAmountHex,
      ftbFeeAddress,
      buyFtUtxo.satoshis,
    );

    const feeChangeAddress = tbc.Script.fromHex(utxos[0].script)
      .toAddress()
      .toString();
    const changeOutputIndex = tx.outputs.length;
    tx.to(feeChangeAddress, 1);

    if (newSellOrderAmount > 0n) {
      if (tokenAChangeHex === zero_ft_tape_amount)
        throw new Error("Sell order remains but TokenA change is zero");
      const newSellOrderCodeScript = OrderBook.updateTokenSaleVolume(
        sellutxo.script,
        newSellOrderAmount,
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: newSellOrderCodeScript,
          satoshis: this.buy_code_dust,
        }),
      );
      addFTPair(
        sellFtUtxo.script,
        tokenATape,
        tokenAChangeHex,
        tbc.crypto.Hash.sha256ripemd160(
          tbc.crypto.Hash.sha256(newSellOrderCodeScript.toBuffer()),
        ).toString("hex"),
        sellFtUtxo.satoshis,
      );
    } else if (newBuyOrderAmount > 0n) {
      if (tokenBChangeHex === zero_ft_tape_amount)
        throw new Error("Buy order remains but TokenB change is zero");
      const newBuyOrderCodeScript = OrderBook.updateTokenSaleVolume(
        buyutxo.script,
        newBuyOrderAmount,
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: newBuyOrderCodeScript,
          satoshis: this.buy_code_dust,
        }),
      );
      addFTPair(
        buyFtUtxo.script,
        tokenBTape,
        tokenBChangeHex,
        tbc.crypto.Hash.sha256ripemd160(
          tbc.crypto.Hash.sha256(newBuyOrderCodeScript.toBuffer()),
        ).toString("hex"),
        buyFtUtxo.satoshis,
      );
    }

    const inputSatoshis =
      buyutxo.satoshis +
      buyFtUtxo.satoshis +
      sellutxo.satoshis +
      sellFtUtxo.satoshis +
      utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);
    const outputSatoshisWithoutChange = tx.outputs.reduce(
      (sum, output, index) =>
        index === changeOutputIndex ? sum : sum + output.satoshis,
      0,
    );
    const txSize = tx.getEstimateSize() + 2 * 1000 + 2 * 2000;
    const fee = txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80);
    const changeAmount = inputSatoshis - outputSatoshisWithoutChange - fee;
    if (changeAmount < 24)
      throw new Error("Insufficient TBC fee UTXO for token match order");
    (tx.outputs[changeOutputIndex] as any).satoshis = changeAmount;

    tx.setInputScript(
      {
        inputIndex: 0,
      },
      (tx) => this.getTokenOrderUnlock(tx, buyPreTX, buyutxo.outputIndex),
    );

    const buyFtIsCoin = buyFtUtxo.script.length / 2 === coin_length;
    const buyFtVersion = getFTVersion(buyFtUtxo.script, buyFtIsCoin);
    if (buyFtIsCoin) tx.setInputSequence(1, 4294967294);
    tx.setInputScript(
      {
        inputIndex: 1,
      },
      (tx) =>
        new FT(buyData.ftbID).getFTunlockSwap(
          privateKey,
          tx,
          buyPreTX,
          buyFtPrePreTxData,
          buyPreTX,
          1,
          buyFtUtxo.outputIndex,
          buyFtVersion,
          buyFtIsCoin,
          true,
        ),
    );

    tx.setInputScript(
      {
        inputIndex: 2,
      },
      (tx) => this.getTokenOrderUnlock(tx, sellPreTX, sellutxo.outputIndex),
    );

    const sellFtIsCoin = sellFtUtxo.script.length / 2 === coin_length;
    const sellFtVersion = getFTVersion(sellFtUtxo.script, sellFtIsCoin);
    if (sellFtIsCoin) tx.setInputSequence(3, 4294967294);
    tx.setInputScript(
      {
        inputIndex: 3,
      },
      (tx) =>
        new FT(sellData.ftaID).getFTunlockSwap(
          privateKey,
          tx,
          sellPreTX,
          sellFtPrePreTxData,
          sellPreTX,
          3,
          sellFtUtxo.outputIndex,
          sellFtVersion,
          sellFtIsCoin,
          true,
        ),
    );

    tx.sign(privateKey);
    tx.seal();
    return tx.uncheckedSerialize();
  }

  getOrderUnlock(
    currentTX: tbc.Transaction,
    preTX: tbc.Transaction,
    preTxVout: number,
  ): tbc.Script {
    const preTxData = getPreTxdata(preTX, preTxVout, 1);
    const currentTxData = getCurrentTxOutputsData(currentTX);
    const optionHex = "51";
    const unlockingScript = tbc.Script.fromHex(
      `${currentTxData}${preTxData}${optionHex}`,
    );
    // console.log("Unlocking Script:", unlockingScript.toASM());
    return unlockingScript;
  }

  getTokenOrderUnlock(
    currentTX: tbc.Transaction,
    preTX: tbc.Transaction,
    preTxVout: number,
  ): tbc.Script {
    const preTxData = getPreTxdata(preTX, preTxVout, 1);
    const currentTxData = getCurrentTxOutputsData(currentTX, 12);
    const optionHex = "51";
    const unlockingScript = tbc.Script.fromHex(
      `${currentTxData}${preTxData}${optionHex}`,
    );
    return unlockingScript;
  }

  getSellOrderCode(isCoin: boolean, taxAddress: string): tbc.Script {
    const address =
      "14" + new tbc.Address(this.hold_address).hashBuffer.toString("hex");
    const ftCodeSize = isCoin ? "dc07" : "5c07";
    const taxAddressHex =
      "14" + tbc.Address.fromString(taxAddress).hashBuffer.toString("hex");

    const sellOrderCode = tbc.Script.fromHex(
      `765187637556ba01207f77547f75817654958f01289351947901157f597f7701217f597f597f517f7701207f756b517f77816b517f77816b517f776b517f776b7654958f01289379816b7654958f0128935394796b54958f0127935294796b006b7600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575686ca87e6b007e7e7e7e7e7e7e7e7e7ea86c7e7eaa56ba01207f7588006b7600879163a86c7e7e6bbb6c7e7e6bbb6c7e7e6c6c75756b676d6d6d760087916378787e6c6c6c7e7b7c886c55798194547901157f597f5879527a517f77886c76537a517f77887c01217f6c76537a517f77887c597f6c76537a517f7781887c597f6c76537a517f7781887c517f7701207f756c7c886b6b6b6b6b6bbb6c7e7e6b676d6d6c6c6c75756b6868760119885279537f7701147f756c6c6c76547a8700886b6b6bbb6c7e7e6b760119885279537f7701147f756c6c567981008763527a75677b${taxAddressHex}8868766b557981946b6bbb6c7e7e6b760119885279537f7701147f756c6c6c6c76557a8700886b6b5579819400886bbb6c7e7e6b527902${ftCodeSize}88768255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a93597902${ftCodeSize}8857798255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a936c6c6c6c765a79885f79885979517f7701147f75${taxAddressHex}885f79517f7701147f75886c6c527a950340420f9676527a950340420f96547988537a947b886ba86c7e7e6bbb6c7e7e6ba86c7e7e6bbb6c7e7ea857ba8867528876a9${address}88ad68516a07ffffffffffffff`,
    );

    const sellOrderData = this.buildOrderData();

    return sellOrderCode.add(sellOrderData);
  }

  getBuyOrderCode(isCoin: boolean, taxAddress: string): tbc.Script {
    const address =
      "14" + new tbc.Address(this.hold_address).hashBuffer.toString("hex");
    const ftCodeSize = isCoin ? "dc07" : "5c07";
    const taxAddressHex =
      "14" + tbc.Address.fromString(taxAddress).hashBuffer.toString("hex");

    const buyOrderCode = tbc.Script.fromHex(
      `765187637556ba01207f77547f75817654958f01289351947901157f597f7701217f597f597f517f7701207f756b517f77816b517f77816b517f776b517f776b7654958f0128935394796b54958f0127935294796b006b7600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575687600879163bb7e6c7e6b6775757575686ca87e6b007e7e7e7e7e7e7e7e7e7ea86c7e7eaa56ba01207f7588006b760087636d6d6d7600879163bb6c7e7e676d6d6c686c6c75756b67577957797e6c6c6c7e7b7c88537902${ftCodeSize}88788255947f054654617065886c6c765879886b6b537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a935679517f7701147f756b6b6ba86c7e7e6bbb6c7e7e6b527901157f597f6c6c6c6c76577a517f7788547a01217f6c76537a517f77887c597f6c76537a517f7781887c597f6c76537a517f7781767c88527a517f7701207f756c7c88587a517f7781517a950340420f96567a7c886b6b6b6b6b6bbb6c6c5279a97c887e7e6b68760119885279537f7701147f756c6c76537a8700886b6bbb6c7e7e6b760119885279537f7701147f756c55798100876377677c${taxAddressHex}88685479816b6bbb6c7e7e6b760119885279537f7701147f756c6c6c76547a8878577981936c6c5279950340420f96547a886c527a950340420f967c6b7c6b6b6bbb6c7e7e6b527902${ftCodeSize}88768255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a93597902${ftCodeSize}8857798255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a936c6c6c6c765a79885f79885979517f7701147f75${taxAddressHex}885f79517f7701147f75870088537a94527a9400886ba86c7e7e6bbb6c7e7e6ba86c7e7e6bbb6c7e7ea857ba8867528876a9${address}88ad68516a30ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`,
    );

    const buyOrderData = this.buildOrderData();

    return buyOrderCode.add(buyOrderData);
  }

  getTokenSellOrderCode(taxAddress: string): tbc.Script {
    const address =
      "14" + new tbc.Address(this.hold_address).hashBuffer.toString("hex");
    const taxAddressHex =
      "14" + tbc.Address.fromString(taxAddress).hashBuffer.toString("hex");
    const buyCodeSize = token_order_size_hex;
    const sellOrderCode = tbc.Script.fromHex(
      `765187637556ba01207f77547f75817654958f01309351947901157f597f7701217f01217f597f597f01217f517f7701207f756b517f776b517f77816b517f77816b517f776b517f776b517f776b7654958f0130935394796b54958f012f935294796b006b7600879163bb7e6c7e6b756775757575687600879163bb7e6c7e6b756775757575687600879163bb7e6c7e6b756775757575687600879163bb7e6c7e6b756775757575687600879163bb7e6c7e6b756775757575687600879163bb7e6c7e6b756775757575687600879163bb7e6c7e6b756775757575687600879163bb7e6c7e6b756775757575687600879163bb7e6c7e6b756775757575687600879163bb7e6c7e6b756775757575687600879163bb7e6c7e6b756775757575687600879163bb7e6c7e6b756775757575686ca87e6b007e7e7e7e7e7e7e7e7e7ea86c7e7eaa56ba01207f7588006b760087636d6d6d7600886d6d6c6c6c75756c6c6c6c6c6c6c75756b6b6b6b6b6b675479517f7701147f75788255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a93597959797e6c6c6c7e7b7c870087916356796c6c76537a886b6b5b7901167f77587f75817b886756796c6c6c76547a885c79${buyCodeSize}885e7901167f77587f75816c6c76537a950340420f96577a517a940164a151886b6b6b6b6b687c6b7ca87c7e7e6bbb6c7e7e6c6c6c6c6c6c6c6c5b7901157f597f775879527a517f778801217f5779527a517f778801217f5679527a517f7788597f5579527a517f778188597f5479527a517f77818801217f7c517f777b88517f7701207f75886b6b6b6b6b7c6b537a537a537abb76a97b886c7e7e6b68760119885279537f7701147f756c6c76537a8700886b6bbb6c7e7e6c6c765679885c79885679517f7701147f75${taxAddressHex}885c79517f7701147f75788700886b788255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a9358798255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a93517a936b7ca87c7e7e6bbb6c7e7e7ca87c7e7e6bbb6c7e7e6c6c6c765779885d79885779517f7701147f75${taxAddressHex}885d79517f7701147f757c8852798255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a9359798255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a936c6c547a950340420f9676527a950340420f96537988527a947c886ba86c7e7e6bbb6c7e7e6ba86c7e7e6bbb6c7e7ea857ba8867528876a9${address}88ad68516a11ffffffffffffffffffffffffffffffffff`,
    ); //1152字节

    const sellOrderData = this.buildTokenOrderData(); //180字节

    return sellOrderCode.add(sellOrderData); //1332字节
  }

  getTokenBuyOrderCode(taxAddress: string): tbc.Script {
    const address =
      "14" + new tbc.Address(this.hold_address).hashBuffer.toString("hex");
    const taxAddressHex =
      "14" + tbc.Address.fromString(taxAddress).hashBuffer.toString("hex");
    const sellCodeSize = token_order_size_hex;
    const buyOrderCode = tbc.Script.fromHex(
      `765187637556ba01207f77547f75817654958f01309351947901157f597f7701217f01217f597f597f01217f517f7701207f756b517f776b517f77816b517f77816b517f776b517f776b517f776b7654958f0130935394796b54958f012f935294796b006b7600879163bb7e6c7e6b756775757575687600879163bb7e6c7e6b756775757575687600879163bb7e6c7e6b756775757575687600879163bb7e6c7e6b756775757575687600879163bb7e6c7e6b756775757575687600879163bb7e6c7e6b756775757575687600879163bb7e6c7e6b756775757575687600879163bb7e6c7e6b756775757575687600879163bb7e6c7e6b756775757575687600879163bb7e6c7e6b756775757575687600879163bb7e6c7e6b756775757575687600879163bb7e6c7e6b756775757575686ca87e6b007e7e7e7e7e7e7e7e7e7ea86c7e7eaa56ba01207f7588006b760087636d6d6d7600886d6d6c6c6c75756c6c6c6c6c6c6c75756b6b6b6b6b6b675479517f7701147f75788255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a93597959797e6c6c6c7e7b7c870087916356796c6c6c76547a885e7901167f77587f75816c6c76537a950340420f96577a517a940164a151886b6b6b6b6b6756796c6c76537a886b6b5979${sellCodeSize}885b7901167f77587f75817b88687c6b7ca87c7e7e6bbb6c7e7e6c6c6c6c6c6c6c6c5b7901157f597f775879527a517f778801217f5779527a517f778801217f5679527a517f7788597f5579527a517f778188597f5479527a517f77818801217f7c517f777b88517f7701207f75886b6b6b6b6b7c6b537a537a537abb76a97b886c7e7e6b68760119885279537f7701147f756c6c76537a8700886b6bbb6c7e7e6c6c765679885c79885679517f7701147f75${taxAddressHex}885c79517f7701147f75788852798255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a9359798255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a9378936c6c6c5379950340420f96517a537a950340420f96537a887c6b7c6b6b7ca87c7e7e6bbb6c7e7e7ca87c7e7e6bbb6c7e7e6c6c6c765779885d79885779517f7701147f75${taxAddressHex}885d79517f7701147f75517a87008852798255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a9359798255947f05465461706588537f7701307f7500517a587f587f587f587f587f81567a937c81517a937c81517a937c81517a937c81517a937c81517a93517a937c886ba86c7e7e6bbb6c7e7e6ba86c7e7e6bbb6c7e7ea857ba8867528876a9${address}88ad68516a0bffffffffffffffffffffff`,
    ); //1152字节

    const buyOrderData = this.buildTokenOrderData(); //180字节

    return buyOrderCode.add(buyOrderData); //1332字节
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
        "hex",
      ),
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

  buildTokenOrderData(): tbc.Script {
    const amountLength = "08";
    const addressLength = "14";
    const hashLength = "20";

    const writer = new tbc.encoding.BufferWriter();

    writer.write(Buffer.from(addressLength, "hex"));
    writer.write(
      Buffer.from(
        new tbc.Address(this.hold_address).hashBuffer.toString("hex"),
        "hex",
      ),
    );

    writer.write(Buffer.from(amountLength, "hex"));
    const saleVolumeBN = new BN(this.sale_volume.toString());
    writer.writeUInt64LEBN(saleVolumeBN);

    writer.write(Buffer.from(hashLength, "hex"));
    writer.write(Buffer.from(this.ft_a_contract_partialhash, "hex"));

    writer.write(Buffer.from(hashLength, "hex"));
    writer.write(Buffer.from(this.ft_b_contract_partialhash, "hex"));

    writer.write(Buffer.from(amountLength, "hex"));
    const feeRateBN = new BN(this.fee_rate.toString());
    writer.writeUInt64LEBN(feeRateBN);

    writer.write(Buffer.from(amountLength, "hex"));
    const unitPriceBN = new BN(this.unit_price.toString());
    writer.writeUInt64LEBN(unitPriceBN);

    writer.write(Buffer.from(hashLength, "hex"));
    writer.write(Buffer.from(this.ft_a_contract_id, "hex"));

    writer.write(Buffer.from(hashLength, "hex"));
    writer.write(Buffer.from(this.ft_b_contract_id, "hex"));

    const orderData = tbc.Script.fromBuffer(writer.toBuffer());
    return orderData;
  }

  static updateSaleVolume(
    codeScript: string,
    newSaleVolume: bigint,
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

  static updateTokenSaleVolume(
    codeScript: string,
    newSaleVolume: bigint,
  ): tbc.Script {
    const script = tbc.Script.fromHex(codeScript);
    const dataStartIndex = script.chunks.length - 8;
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
      new BN(script.chunks[dataStartIndex + 1].buf!, 10, "le").toString(),
    );
    const ftPartialHash =
      script.chunks[dataStartIndex + 2].buf!.toString("hex");
    const feeRate = BigInt(
      new BN(script.chunks[dataStartIndex + 3].buf!, 10, "le").toString(),
    );
    const unitPrice = BigInt(
      new BN(script.chunks[dataStartIndex + 4].buf!, 10, "le").toString(),
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

  static getTokenOrderData(codeScript: string): {
    holdAddress: string;
    saleVolume: bigint;
    ftaPartialHash: string;
    ftbPartialHash: string;
    feeRate: bigint;
    unitPrice: bigint;
    ftaID: string;
    ftbID: string;
  } {
    const script = tbc.Script.fromHex(codeScript);
    const dataStartIndex = script.chunks.length - 8;

    const holdAddressHash = script.chunks[dataStartIndex].buf!.toString("hex");
    const holdAddress = tbc.Address.fromHex("00" + holdAddressHash).toString();
    // console.log(holdAddressHash, holdAddress);
    const saleVolume = BigInt(
      new BN(script.chunks[dataStartIndex + 1].buf!, 10, "le").toString(),
    );
    const ftaPartialHash =
      script.chunks[dataStartIndex + 2].buf!.toString("hex");
    const ftbPartialHash =
      script.chunks[dataStartIndex + 3].buf!.toString("hex");
    const feeRate = BigInt(
      new BN(script.chunks[dataStartIndex + 4].buf!, 10, "le").toString(),
    );
    const unitPrice = BigInt(
      new BN(script.chunks[dataStartIndex + 5].buf!, 10, "le").toString(),
    );
    const ftaID = script.chunks[dataStartIndex + 6].buf!.toString("hex");
    const ftbID = script.chunks[dataStartIndex + 7].buf!.toString("hex");
    // console.log(saleVolume, ftaPartialHash, ftbPartialHash, feeRate, unitPrice, ftaID, ftbID);
    return {
      holdAddress: holdAddress,
      saleVolume: saleVolume,
      ftaPartialHash: ftaPartialHash,
      ftbPartialHash: ftbPartialHash,
      feeRate: feeRate,
      unitPrice: unitPrice,
      ftaID: ftaID,
      ftbID: ftbID,
    };
  }

  static placeHolderP2PKHOutput(): tbc.Script {
    return tbc.Script.fromASM(
      `OP_FALSE OP_RETURN ffffffffffffffffffffffffffffffffffffffffffff`,
    );
  }

  // makeSellOrder_privateKey(
  //   privateKey: tbc.PrivateKey,
  //   saleVolume: bigint,
  //   unitPrice: bigint,
  //   feeRate: bigint,
  //   ftID: string,
  //   ftCodeScript: string,
  //   utxos: tbc.Transaction.IUnspentOutput[],
  // ) {
  //   // const holdAddress = "1Ntohi19LEcLcijug8n42njYKNjSgHuQdq";
  //   const holdAddress = privateKey.toAddress().toString();
  //   this.type = "sell";
  //   this.hold_address = holdAddress;
  //   this.sale_volume = saleVolume;
  //   this.unit_price = unitPrice;
  //   this.fee_rate = feeRate;
  //   this.ft_a_contract_id = ftID;
  //   const ftScriptLen = ftCodeScript.length / 2;
  //   const isCoin = ftScriptLen === coin_length;
  //   const partialOffset = isCoin ? coin_partial_offset : ft_v2_partial_offset;
  //   this.ft_a_contract_partialhash = partial_sha256.calculate_partial_hash(
  //     Buffer.from(ftCodeScript, "hex").subarray(0, partialOffset),
  //   );

  //   const tx = new tbc.Transaction();
  //   tx.from(utxos);
  //   tx.addOutput(
  //     new tbc.Transaction.Output({
  //       script: this.getSellOrderCode(isCoin),
  //       satoshis: Number(saleVolume),
  //     }),
  //   );
  //   tx.change(holdAddress);
  //   const txSize = tx.getEstimateSize();
  //   tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));
  //   tx.sign(privateKey);
  //   tx.seal();
  //   const txraw = tx.uncheckedSerialize();
  //   return txraw;
  // }

  // cancelSellOrder_privateKey(
  //   privateKey: tbc.PrivateKey,
  //   sellutxo: tbc.Transaction.IUnspentOutput,
  //   utxos: tbc.Transaction.IUnspentOutput[],
  // ) {
  //   const sellData = OrderBook.getOrderData(sellutxo.script);
  //   const tx = new tbc.Transaction();
  //   tx.from(sellutxo).from(utxos);
  //   tx.to(sellData.holdAddress, sellutxo.satoshis);
  //   tx.change(sellData.holdAddress);
  //   const txSize = tx.getEstimateSize();
  //   tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));
  //   tx.setInputScript(
  //     {
  //       inputIndex: 0,
  //     },
  //     (tx) => {
  //       const sig = tx.getSignature(0, privateKey);
  //       const pubKey = privateKey.toPublicKey().toString();
  //       return tbc.Script.fromASM(`${sig} ${pubKey} OP_2`);
  //     },
  //   );
  //   tx.sign(privateKey);
  //   tx.seal();
  //   const txraw = tx.uncheckedSerialize();
  //   return txraw;
  // }

  // makeBuyOrder_privateKey(
  //   privateKey: tbc.PrivateKey,
  //   saleVolume: bigint,
  //   unitPrice: bigint,
  //   feeRate: bigint,
  //   ftID: string,
  //   utxos: tbc.Transaction.IUnspentOutput[],
  //   ftutxos: tbc.Transaction.IUnspentOutput[],
  //   preTXs: tbc.Transaction[],
  //   prepreTxData: string[],
  // ) {
  //   // const holdAddress = "15MjMwGFvV2B9GanCYpzRupykryJ4A1Lp1";
  //   const holdAddress = privateKey.toAddress().toString();
  //   this.type = "buy";
  //   this.hold_address = holdAddress;
  //   this.sale_volume = saleVolume;
  //   this.unit_price = unitPrice;
  //   this.fee_rate = feeRate;
  //   this.ft_a_contract_id = ftID;
  //   const ftScriptLen = ftutxos[0].script.length / 2;
  //   const isCoin = ftScriptLen === coin_length;
  //   const partialOffset = isCoin ? coin_partial_offset : ft_v2_partial_offset;
  //   this.ft_a_contract_partialhash = partial_sha256.calculate_partial_hash(
  //     Buffer.from(ftutxos[0].script, "hex").subarray(0, partialOffset),
  //   );

  //   const tx = new tbc.Transaction();
  //   tx.from(ftutxos);
  //   tx.from(utxos);

  //   // Buy Order Output
  //   const buyOrder = this.getBuyOrderCode(isCoin);
  //   tx.addOutput(
  //     new tbc.Transaction.Output({
  //       script: buyOrder,
  //       satoshis: this.buy_code_dust,
  //     }),
  //   );

  //   //FT Code Buy Output
  //   const ftAmount = (saleVolume * unitPrice) / this.precision;
  //   const tapeAmountSetIn: bigint[] = [];
  //   let tapeAmountSum = BigInt(0);
  //   for (let i = 0; i < ftutxos.length; i++) {
  //     tapeAmountSetIn.push(ftutxos[i].ftBalance!);
  //     tapeAmountSum += BigInt(tapeAmountSetIn[i]);
  //   }
  //   let { amountHex, changeHex } = FT.buildTapeAmount(
  //     ftAmount,
  //     tapeAmountSetIn,
  //   );
  //   const ftCode = ftutxos[0].script;
  //   const ftTape = preTXs[0].outputs[ftutxos[0].outputIndex + 1].script.toHex();
  //   const buyOrderHash160 = tbc.crypto.Hash.sha256ripemd160(
  //     tbc.crypto.Hash.sha256(buyOrder.toBuffer()),
  //   ).toString("hex");
  //   const ftCodeBuy = FT.buildFTtransferCode(ftCode, buyOrderHash160);
  //   const ftTapeBuy = FT.buildFTtransferTape(ftTape, amountHex);
  //   const ftCodeDust = ftutxos[0].satoshis;
  //   tx.addOutput(
  //     new tbc.Transaction.Output({
  //       script: ftCodeBuy,
  //       satoshis: ftCodeDust,
  //     }),
  //   );
  //   tx.addOutput(
  //     new tbc.Transaction.Output({
  //       script: ftTapeBuy,
  //       satoshis: 0,
  //     }),
  //   );

  //   if (ftAmount < tapeAmountSum) {
  //     const ftCodeChange = FT.buildFTtransferCode(ftCode, holdAddress);
  //     const ftTapeChange = FT.buildFTtransferTape(ftTape, changeHex);
  //     tx.addOutput(
  //       new tbc.Transaction.Output({
  //         script: ftCodeChange,
  //         satoshis: ftCodeDust,
  //       }),
  //     );
  //     tx.addOutput(
  //       new tbc.Transaction.Output({
  //         script: ftTapeChange,
  //         satoshis: 0,
  //       }),
  //     );
  //   }

  //   tx.change(holdAddress);
  //   // const txSize = tx.getEstimateSize();
  //   // tx.fee(txSize < 1000 ? 80 : Math.ceil(txSize / 1000 * 80));
  //   tx.feePerKb(80);

  //   for (let i = 0; i < ftutxos.length; i++) {
  //     tx.setInputScript(
  //       {
  //         inputIndex: i,
  //       },
  //       (tx) => {
  //         const unlockingScript = new FT(ftID).getFTunlock(
  //           privateKey,
  //           tx,
  //           preTXs[i],
  //           prepreTxData[i],
  //           i,
  //           ftutxos[i].outputIndex,
  //           isCoin,
  //         );
  //         return unlockingScript;
  //       },
  //     );
  //   }
  //   tx.sign(privateKey);
  //   tx.seal();
  //   const txraw = tx.uncheckedSerialize();
  //   return txraw;
  // }

  // cancelBuyOrder_privateKey(
  //   privateKey: tbc.PrivateKey,
  //   buyutxo: tbc.Transaction.IUnspentOutput,
  //   buyPreTX: tbc.Transaction,
  //   ftutxo: tbc.Transaction.IUnspentOutput,
  //   ftPreTX: tbc.Transaction,
  //   ftPrePreTxData: string,
  //   utxos: tbc.Transaction.IUnspentOutput[],
  // ) {
  //   const buyData = OrderBook.getOrderData(buyutxo.script);
  //   const isCoin = ftutxo.script.length / 2 === coin_length;
  //   const tx = new tbc.Transaction();
  //   tx.from(buyutxo).from(ftutxo).from(utxos);

  //   const tapeAmountSetIn: bigint[] = [];
  //   tapeAmountSetIn.push(ftutxo.ftBalance!);
  //   const tapeAmountSum = BigInt(tapeAmountSetIn[0]);
  //   const { amountHex, changeHex } = FT.buildTapeAmount(
  //     tapeAmountSum,
  //     tapeAmountSetIn,
  //     1,
  //   );
  //   if (
  //     changeHex !=
  //     "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
  //   ) {
  //     throw new Error("Change amount is not zero");
  //   }

  //   tx.addOutput(
  //     new tbc.Transaction.Output({
  //       script: FT.buildFTtransferCode(ftutxo.script, buyData.holdAddress),
  //       satoshis: ftutxo.satoshis,
  //     }),
  //   );
  //   tx.addOutput(
  //     new tbc.Transaction.Output({
  //       script: FT.buildFTtransferTape(
  //         ftPreTX.outputs[ftutxo.outputIndex + 1].script.toHex(),
  //         amountHex,
  //       ),
  //       satoshis: 0,
  //     }),
  //   );
  //   tx.change(buyData.holdAddress);
  //   tx.feePerKb(80);

  //   tx.setInputScript(
  //     {
  //       inputIndex: 0,
  //     },
  //     (tx) => {
  //       const sig = tx.getSignature(0, privateKey);
  //       const pubKey = privateKey.toPublicKey().toString();
  //       return tbc.Script.fromASM(`${sig} ${pubKey} OP_2`);
  //     },
  //   );

  //   tx.setInputScript(
  //     {
  //       inputIndex: 1,
  //     },
  //     (tx) => {
  //       const unlockingScript = new FT(buyData.ftID).getFTunlockSwap(
  //         privateKey,
  //         tx,
  //         ftPreTX,
  //         ftPrePreTxData,
  //         buyPreTX,
  //         1,
  //         ftutxo.outputIndex,
  //         2,
  //         isCoin,
  //       );
  //       return unlockingScript;
  //     },
  //   );
  //   tx.sign(privateKey);
  //   tx.seal();
  //   // console.log(tx.verify());
  //   const txraw = tx.uncheckedSerialize();
  //   return txraw;
  // }
}

function _isPositiveBigInt(param: bigint): boolean {
  if (param > 0n) return true;
  return false;
}

function _isNegativeBigInt(param: bigint): boolean {
  if (param < 0n) return true;
  return false;
}

module.exports = OrderBook;
