## 数值
- 用八字节小端存储，方法参数类型统一bigint


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


{
    const utxos = await API.fetchUTXO(privateKeyA, fee, network);
    const sellOrder = order.makeSellOrder(addressA, saleVolume, unitPrice, feeRate, ftContractTxid, ftPartialHash, utxos);
    await API.broadcastTXraw(sellOrder, network);
}


{
    const Token = new FT(ftContractTxid);
    const TokenInfo = await API.fetchFtInfo(Token.contractTxid, network);//获取FT信息
    Token.initialize(TokenInfo);
    const ftTape = Token.tapeScript;
    const ftutxo_codeScript = FT.buildFTtransferCode(Token.codeScript, addressA).toBuffer().toString('hex');
    const ftutxos = await API.fetchFtUTXOs(Token.contractTxid, addressA, ftutxo_codeScript, network, saleVolume);//准备ft utxo
    const utxos = await API.fetchUTXO(privateKeyA, fee, network);


    let preTXs: tbc.Transaction[] = [];
    let prepreTxDatas: string[] = [];
    for (let i = 0; i < ftutxos.length; i++) {
        preTXs.push(await API.fetchTXraw(ftutxos[i].txId, network));//获取每个ft输入的父交易
        prepreTxDatas.push(await API.fetchFtPrePreTxData(preTXs[i], ftutxos[i].outputIndex, network));//获取每个ft输入的爷交易
    }


    const buyOrder = order.makeBuyOrder(privateKeyA, saleVolume, unitPrice, feeRate, ftContractTxid, ftPartialHash, ftTape, utxos, ftutxos, preTXs, prepreTxDatas);
    await API.broadcastTXraw(buyOrder, network);
}


```