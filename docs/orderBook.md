## 代币格式兼容

OrderBook 根据 Code 脚本自动选择旧版 FT / stableCoin、TBC20 或 Coin TBC20 的输出构造与解锁逻辑。TBC20、Coin TBC20 均支持 TBC/Token 和 Token/Token 下单、撤单、完整成交、部分成交，以及对应的在线接口。

- `stableCoin` 仍是旧版稳定币 SDK；Coin TBC20 使用 `Coin`。调用 OrderBook 时传入实际 Code 脚本即可，无需转换资产格式。
- 旧版的 `prepreTxData` / `ftPrePreTxData` 参数继续传十六进制证明字符串。TBC20、Coin TBC20 改传祖交易数组、`ReadonlyMap<txid, Transaction>` 或同步交易查询函数；每个非零父 Tape 槽对应的祖交易必须存在。多输入 `fillSigsMake*` 的参数仍是逐输入的证明数组。
- 在线接口会根据实际 Code 选择证明格式，通过 `API.fetchTXraw` 获取祖交易；返回原始交易，不广播。
- 含 TBC20 / Coin TBC20 输入的交易最多六个输入（含订单和手续费输入），以保证后续交易能够验证父交易。代币输入必须位于前六个 vin 槽。
- Coin TBC20 的 `sequence` 与最大 `lockTime` 在构建阶段固定；高度锁与时间戳锁不能混用。外部签名后，填充方法只验证这些值。输出保留 Tape 元数据及锁定时间。

```ts
// 单个 TBC20 / Coin TBC20 输入：parents[0] 是代币 UTXO 的父交易，
// ancestors 是其非零 Tape 槽引用的祖交易；不是父交易本身。
const signed = order.fillSigsMakeBuyOrder(
  unsignedRaw, signatures, publicKey, parents, [ancestors],
);
```

Token/Token 新建订单修正了父交易见证填充、输出栈索引和续单字段校验；Code 仍为 1332 字节，数据尾部仍为 180 字节。撮合输出顺序为 **B 收款/手续费、A 收款/手续费、TBC 找零、可选续单及 Code/Tape**。使用本版本新建订单；已部署的旧订单脚本不会随 SDK 更新。

运行 `npm run test:orderbook` 可离线执行真实合约脚本测试，无需网络或广播。

## 数值
- 用八字节小端存储，方法参数类型统一bigint，精度除ft外均是6

## 下单输入数量限制
- TBC 卖单：`utxos` 数量不得超过 10。
- TBC/FT 买单：`ftutxos` 数量不得超过 5，且 `utxos` 与 `ftutxos` 的数量之和不得超过 10。

## 方法
```ts
import * as tbc from "tbc-lib-js";
import { API, FT, orderBook } from "tbc-contract";

const network = "testnet";
const privateKeyA = tbc.PrivateKey.fromString('');
const addressA = tbc.Address.fromPrivateKey(privateKeyA).toString();
const ftContractTxid = "";
const fee = 0.01;

const order = new orderBook();

const saleVolume = 10000000n;
const unitPrice = 10100000n;
const feeRate = 100n;
const requiredAmount = (saleVolume * unitPrice) / 1000000n;

//创建卖单，卖tbc
{
    const utxos: tbc.Transaction.IUnspentOutput[] = [];
    /**
     * 构建卖单交易
     * 
     * @param {string} holdAddress - 卖方地址,用于接收交易款项的地址
     * @param {string} taxAddress - 手续费地址，用于接收撮合手续费
     * @param {bigint} saleVolume - 出售数量,表示要出售的tbc数量
     * @param {bigint} unitPrice - 单价,每个tbc的价格
     * @param {bigint} feeRate - 手续费率,交易所需支付的手续费比例
     * @param {string} ftContractTxid - FT合约ID
     * @param {string} ftCodeScript - FT合约脚本
     * @param {tbc.Transaction.IUnspentOutput[]} utxos - 未花费交易输出数组,用于构建交易的输入,最多10个
     * @returns {string} sellOrderNoSigs - 返回一个待签名的卖单交易字符串
     */
    const sellOrderNoSigs = order.buildSellOrderTX(holdAddress, taxAddress, saleVolume, unitPrice, feeRate, ftContractTxid, ftCodeScript, utxos);   //待签名交易

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
    //普通Token
    {   
        const TokenInfo = await API.fetchFtInfo(ftContractTxid, network);//获取FT信息
        const ftutxo_codeScript = FT.buildFTtransferCode(TokenInfo.codeScript, addressA).toBuffer().toString('hex');
        const ftutxos = await API.fetchFtUTXOs(TokenInfo.contractTxid, addressA, ftutxo_codeScript, network, requiredAmount);//准备ft utxo
    }

    //稳定币
    {
        const TokenInfo = (await API.fetchCoinInfo(ftContractTxid, network)).coinInfo;//ftContractTxid是确定的稳定币id，获取Coin信息
        const ftutxo_codeScript = FT.buildFTtransferCode(TokenInfo.codeScript, addressA).toBuffer().toString('hex');
        const ftutxos = await API.fetchCoinUTXOs(TokenInfo.contractTxid, addressA, requiredAmount, ftutxo_codeScript, network, 5);//准备coin utxo
    }

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
     * @param {string} taxAddress - 手续费地址，用于接收撮合手续费
     * @param {bigint} saleVolume - 出售数量,表示要出售的tbc数量
     * @param {bigint} unitPrice - 单价,每个tbc的价格
     * @param {bigint} feeRate - 手续费率,交易所需支付的手续费比例
     * @param {string} ftContractTxid - FT合约ID
     * @param {tbc.Transaction.IUnspentOutput[]} utxos - 普通utxo数组,与ftutxos合计最多10个
     * @param {tbc.Transaction.IUnspentOutput[]} ftutxos - ftutxo数组,最多5个,与utxos合计最多10个
     * @param {tbc.Transaction[]} preTXs - ftutxo父交易数组
     * @returns {string} buyOrderNoSigs - 返回一个待签名的买单交易字符串
     */
    const buyOrderNoSigs = order.buildBuyOrderTX(holdAddress, taxAddress, saleVolume, unitPrice, feeRate, ftContractTxid, utxos, ftutxos, preTXs);

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
