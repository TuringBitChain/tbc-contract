## 数值
- 用八字节小端存储，方法参数类型统一bigint

## 方法
```ts
import * as tbc from "tbc-lib-js";
import { API, FT, OrderBook } from "tbc-contract";

const network = "testnet";
const privateKeyA = tbc.PrivateKey.fromString('');
const addressA = tbc.Address.fromPrivateKey(privateKeyA).toString();
const ftContractTxid = "";
const ftPartialHash = "";
const fee = 0.01;

const order = new OrderBook();

const saleVolume = 10000000n;
const unitPrice = 10100000n;
const feeRate = 100n;

//创建卖单，卖tbc
{
    const utxos: tbc.Transaction.IUnspentOutput[] = [];
    const sellOrderNoSigs = order.buildSellOrderTX(addressA, saleVolume, unitPrice, feeRate, ftContractTxid, ftPartialHash, utxos);   //待签名交易
    const sellOrder = order.fillSigsSellOrder(sellOrderNoSigs, sigs, publicKey, "make");  //组装签名
    await API.broadcastTXraw(sellOrder, network);
}

//撤销卖单
{
    const sellutxo;
    const utxos: tbc.Transaction.IUnspentOutput[] = [];
    const cancelSellOrderNoSigs = order.buildCancelSellOrderTX(sellutxo, utxos);
    const cancelSellOrder = order.fillSigsSellOrder(cancelSellOrderNoSigs, sigs, publicKey, "cancel");
    await API.broadcastTXraw(cancelSellOrder, network);
}

//创建买单，用token买tbc
{
    const Token = new FT(ftContractTxid);
    const TokenInfo = await API.fetchFtInfo(Token.contractTxid, network);//获取FT信息
    Token.initialize(TokenInfo);
    const ftutxo_codeScript = FT.buildFTtransferCode(Token.codeScript, addressA).toBuffer().toString('hex');
    const ftutxos = await API.fetchFtUTXOs(Token.contractTxid, addressA, ftutxo_codeScript, network, saleVolume);//准备ft utxo
    const utxos: tbc.Transaction.IUnspentOutput[] = [];

    let preTXs: tbc.Transaction[] = [];
    let prepreTxData: string[] = [];
    for (let i = 0; i < ftutxos.length; i++) {
        preTXs.push(await API.fetchTXraw(ftutxos[i].txId, network));//获取每个ft输入的父交易
        prepreTxData.push(await API.fetchFtPrePreTxData(preTXs[i], ftutxos[i].outputIndex, network));//获取每个ft输入的爷交易
    }

    const buyOrderNoSigs = order.buildBuyOrderTX(holdAddress, saleVolume, unitPrice, feeRate, ftContractTxid, utxos, ftutxos, preTXs);
    const buyOrder = order.fillSigsMakeBuyOrder(buyOrderNoSigs, sigs, publicKey, preTXs, prepreTxData);
    await API.broadcastTXraw(buyOrder, network);
}

//撤销买单
{
    const buyutxo;
    const buyPreTX: tbc.Transaction = await API.fetchTXraw(buyutxo.txId, network);
    const ftutxo;
    const preTX: tbc.Transaction = await API.fetchTXraw(ftutxo.txId, network);
    const prepreTxData: string = await API.fetchFtPrePreTxData(preTX, ftutxo.outputIndex, network);
    const utxos: tbc.Transaction.IUnspentOutput[] = [];
    const cancelBuyOrderNoSigs = order.buildCancelBuyOrderTX(buyutxo, ftutxo, preTX, utxos);
    const cancelBuyOrder = order.fillSigsCancelBuyOrder(cancelBuyOrderNoSigs, sigs, publicKey, buyPreTX, preTX, prepreTxData);
    await API.broadcastTXraw(cancelBuyOrder, network);
}

//撮合交易
{
    const buyutxo;
    const buyPreTX = await API.fetchTXraw(buyutxo.txId, network);
    const ftutxo;
    const ftPreTX: tbc.Transaction = await API.fetchTXraw(ftutxo.txId, network);
    const ftPrePreTxData: string = await API.fetchFtPrePreTxData(preTX, ftutxo.outputIndex, network);

    const sellutxo;
    const sellPreTX = await API.fetchTXraw(sellutxo.txId, network);

    const utxos: tbc.Transaction.IUnspentOutput[] = [];
    const ftFeeAddress = "";
    const tbcFeeAddress = "";
    const matchOrder = order.matchOrder(privateKeyA, buyutxo, buyPreTX, ftutxo, ftPreTX, ftPrePreTxData, sellutxo, sellPreTX, utxos, ftFeeAddress, tbcFeeAddress);
}

```