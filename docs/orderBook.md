## 数值
- 用八字节小端存储，方法参数类型统一bigint，精度除ft外均是6

## 方法
```ts
import * as tbc from "tbc-lib-js";
import { API, FT, orderBook } from "tbc-contract";

const network = "testnet";
const privateKeyA = tbc.PrivateKey.fromString('');
const addressA = tbc.Address.fromPrivateKey(privateKeyA).toString();
const ftContractTxid = "";
const ftPartialHash = "";
const fee = 0.01;

const order = new orderBook();

const saleVolume = 10000000n;
const unitPrice = 10100000n;
const feeRate = 100n;

//创建卖单，卖tbc
{
    const utxos: tbc.Transaction.IUnspentOutput[] = [];
    /**
     * 构建卖单交易
     * 
     * @param {string} holdAddress - 卖方地址,用于接收交易款项的地址
     * @param {bigint} saleVolume - 出售数量,表示要出售的tbc数量
     * @param {bigint} unitPrice - 单价,每个tbc的价格
     * @param {bigint} feeRate - 手续费率,交易所需支付的手续费比例
     * @param {string} ftContractTxid - FT合约交易ID
     * @param {string} ftPartialHash - FT部分哈希,代币合约的部分哈希值
     * @param {tbc.Transaction.IUnspentOutput[]} utxos - 未花费交易输出数组,用于构建交易的输入
     * @returns {string} sellOrderNoSigs - 返回一个待签名的卖单交易字符串
     */
    const sellOrderNoSigs = order.buildSellOrderTX(holdAddress, saleVolume, unitPrice, feeRate, ftContractTxid, ftPartialHash, utxos);   //待签名交易

    /**
     * 填充卖单签名
     * 
     * @param {string} sellOrderNoSigs - 未签名的卖单交易字符串
     * @param {string[]} sigs - 签名数据,默认是签名数组
     * @param {string} publicKey - 公钥
     * @param {string} "make" - 订单类型标识,表示这是一个挂单(maker)操作
     * @returns {string} sellOrder - 组装完成的包含签名的卖单交易字符串
     */
    const sellOrder = order.fillSigsSellOrder(sellOrderNoSigs, sigs, publicKey, "make");  //组装签名
    await API.broadcastTXraw(sellOrder, network);
}

//撤销卖单
{
    const sellutxo;
    const utxos: tbc.Transaction.IUnspentOutput[] = [];

    /**
     * 构建撤销卖单交易
     * 
     * @param {tbc.Transaction.IUnspentOutput} sellutxo - 卖单的UTXO
     * @param {tbc.Transaction.IUnspentOutput[]} utxos - 用于支付交易费用的UTXO数组
     * @returns {string} cancelSellOrderNoSigs - 返回构建好的取消卖单交易字符串(无签名)
     */
    const cancelSellOrderNoSigs = order.buildCancelSellOrderTX(sellutxo, utxos);

    /**
     * 填充撤单签名
     * 
     * @param {string} cancelSellOrderNoSigs - 未签名的卖单交易字符串
     * @param {string[]} sigs - 签名数据,默认是签名数组
     * @param {string} publicKey - 公钥
     * @param {string} "cancel" - 订单类型标识,表示这是一个撤单操作
     * @returns {string} cancelSellOrder - 组装完成的包含签名的卖单交易字符串
     */
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

    /**
     * 构建买单交易
     * 
     * @param {string} holdAddress - 卖方地址,用于接收交易款项的地址
     * @param {bigint} saleVolume - 出售数量,表示要出售的tbc数量
     * @param {bigint} unitPrice - 单价,每个tbc的价格
     * @param {bigint} feeRate - 手续费率,交易所需支付的手续费比例
     * @param {string} ftContractTxid - FT合约交易ID
     * @param {tbc.Transaction.IUnspentOutput[]} utxos - 普通utxo数组
     * @param {tbc.Transaction.IUnspentOutput[]} ftutxos - ftutxo数组
     * @param {tbc.Transaction[]} preTXs - ftutxo父交易数组
     * @returns {string} buyOrderNoSigs - 返回一个待签名的买单交易字符串
     */
    const buyOrderNoSigs = order.buildBuyOrderTX(holdAddress, saleVolume, unitPrice, feeRate, ftContractTxid, utxos, ftutxos, preTXs);

    /**
     * 填充买单签名
     * 
     * @param {string} buyOrderNoSigs - 未签名的买单交易字符串
     * @param {string[]} sigs - 签名数据,默认是签名数组
     * @param {string} publicKey - 公钥
     * @param {tbc.Transaction[]} preTXs - ftutxo父交易数组
     * @param {string[]} prepreTxData - ftutxo祖交易数组
     * @returns {string} buyOrder - 组装完成的包含签名的买单交易字符串
     */
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
    /**
     * 构建撤销买单交易
     * 
     * @param {tbc.Transaction.IUnspentOutput} buyutxo - 买单utxo
     * @param {tbc.Transaction.IUnspentOutput} ftutxo - 买单控制的单个ftutxo
     * @param {tbc.Transaction} preTX - ftutxo父交易
     * @param {tbc.Transaction.IUnspentOutput[]} utxos - 普通utxo数组
     * @returns {string} cancelBuyOrderNoSigs - 返回一个待签名的撤销买单交易字符串
     */
    const cancelBuyOrderNoSigs = order.buildCancelBuyOrderTX(buyutxo, ftutxo, preTX, utxos);

    /**
     * 填充撤单签名
     * 
     * @param {string} cancelBuyOrderNoSigs - 未签名的撤单交易字符串
     * @param {string[]} sigs - 签名数据,默认是签名数组
     * @param {string} publicKey - 公钥
     * @param {tbc.Transaction} buyPreTX - 买单utxo父交易
     * @param {tbc.Transaction} preTX - ftutxo父交易
     * @param {string} prepreTxData - ftutxo祖交易
     * @returns {string} cancelBuyOrder - 组装完成的包含签名的撤单交易字符串
     */
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
    
    /**
     * 撮合交易
     * 
     * @param {tbc.PrivateKey} privateKeyA - 撮合者私钥
     * @param {tbc.Transaction.IUnspentOutput} buyutxo - 买单utxo
     * @param {tbc.Transaction} buyPreTX - 买单utxo父交易
     * @param {tbc.Transaction.IUnspentOutput} ftutxo - 买单控制的单个ftutxo
     * @param {tbc.Transaction} ftPreTX - ftutxo父交易
     * @param {string} ftPrePreTxData - ftutxo祖交易
     * @param {tbc.Transaction.IUnspentOutput} sellutxo - 卖单utxo
     * @param {tbc.Transaction} sellPreTX - 卖单utxo父交易
     * @param {tbc.Transaction.IUnspentOutput[]} utxos - 普通utxo数组
     * @param {string} ftFeeAddress - FT手续费接收地址
     * @param {string} tbcFeeAddress - TBC手续费接收地址
     * @returns {string} matchOrder - 返回撮合交易字符串
     */
    const matchOrder = order.matchOrder(privateKeyA, buyutxo, buyPreTX, ftutxo, ftPreTX, ftPrePreTxData, sellutxo, sellPreTX, utxos, ftFeeAddress, tbcFeeAddress);
    await API.broadcastTXraw(matchOrder, network);
}

```