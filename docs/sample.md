## 使用本地合并的FT UTXO

```ts
import * as tbc from "tbc-lib-js"
import { API, FT, poolNFT2, buildUTXO, buildFtPrePreTxData, fetchInBatches } from "tbc-contract"

const network = "testnet";
const privateKeyA = tbc.PrivateKey.fromString('');
const addressA = tbc.Address.fromPrivateKey(privateKeyA).toString();
const ftContractTxid = "";
const poolNftContractId = "";

const fee = 0.01;
const lpPlan = 1;
```
### 将链上的ftutxo进行本地合并
```ts
//Merge 将输入的ftutxo合并成一个 (要求ftutxo均在链上)
const Token = new FT(ftContractTxid);
const TokenInfo = await API.fetchFtInfo(Token.contractTxid, network);//获取FT信息
Token.initialize(TokenInfo);

//网络请求拉取ftutxo
{
    const ftutxo_codeScript = FT.buildFTtransferCode(Token.codeScript, addressA).toBuffer().toString('hex');
    const ftutxos = await API.fetchFtUTXOList(Token.contractTxid, addressA, ftutxo_codeScript, network);//准备多个ft utxo
}
//or手动输入ftutxo
{
    //从维护的ftutxo列表中选择
    const ftutxos = ftutxos_manual;
    //or从交易中选择ftutxo
    const ftutxos: tbc.Transaction.IUnspentOutput[];
    for (const tx of txs ) {
        const ftutxo = buildUTXO(tx, vout, true);//tx: tbc.Transaction, vout: 输出序号(若来自转账交易，一般置vout为0), true: 构建ftutxo; false: 构建utxo
        ftutxos.push(ftutxo);
    }
}
const mergeFee = 0.005 * ftutxos.length;
//网络请求获取utxo用于交易fee
const utxo = await API.fetchUTXO(privateKeyA, mergeFee, network);
//or手动输入utxo
{
    //从维护的utxo列表中选择
    const utxo = utxo_manual;
    //or从交易中选择utxo
    const utxo = buildUTXO(tx, vout, false);
}
let localTX: tbc.Transaction[] = [];
let preTXs: tbc.Transaction[] = [];
let prepreTxDatas: string[] = [];

// 分片获取 preTXs，每批处理 300 个 (根据实际情况调整分片大小)
const batchSize = 300;
preTXs = await fetchInBatches<tbc.Transaction.IUnspentOutput, tbc.Transaction>(
    ftutxos,
    batchSize,
    (batch) => Promise.all(batch.map(utxo => API.fetchTXraw(utxo.txId, network))),
    'fetchFtPreTXData'
);

// 分片获取 prepreTxDatas
prepreTxDatas = await fetchInBatches<tbc.Transaction.IUnspentOutput, string>(
    ftutxos,
    batchSize,
    (batch) => Promise.all(batch.map(utxo => {
        const globalIndex = ftutxos.indexOf(utxo);
        return API.fetchFtPrePreTxData(preTXs[globalIndex], utxo.outputIndex, network);
    })),
    'fetchFtPrePreTxData'
);
const txs = Token.mergeFT(privateKeyA, ftutxos, utxo, preTXs, prepreTxDatas, localTX);//组装交易
```
### 使用本地合并的FT UTXO与POOL交互

```ts
//从本地merge交易中构建池交易数据
for (const tx of mergeTX) {
    const txObj = new tbc.Transaction(tx.txraw);
    preTXs.push(txObj);
}
const ftutxo = buildUTXO(preTXs[preTXs.length - 1], 0, true);
const ftPreTX = [preTXs[preTXs.length - 1]];
const ftPrePreTxData = [buildFtPrePreTxData(ftPreTX[0], 0, preTXs)];
```

### 1.从本地ftutxo交易中选择交易费utxo
```ts
let ftAmount = 50000;
const tx = await poolUse.swaptoTBC_baseToken_local(privateKeyA, addressA, ftutxo, ftPreTX, ftPrePreTxData, ftAmount, lpPlan);
txs.push({ txraw: tx });
```

### 2.手动输入交易费utxo
```ts
let ftAmount = 50000;
// 手动构建
const tbcutxo: tbc.Transaction.IUnspentOutput = {
    txId: "12314",
    outputIndex: 2,
    satoshis: 6666,
    script: "1231313"
};
// or从交易中构建
const tbcutxo = buildUTXO(tx, vout, false);
const txSawp = await poolUse.swaptoTBC_baseToken_local(privateKeyA, addressA, ftutxo, ftPreTX, ftPrePreTxData, ftAmount, lpPlan, tbcutxo);
txs.push({ txraw: txSawp });
```

### 更进一步，使用POOL中换出的TBC UTXO
```ts
const tbcutxo_fromPool = buildUTXO(new tbc.Transaction(txSawp), 2, false);
//使用tbcutxo_fromPool执行需要的操作，如批量转账等
const txSendTBC = function1();
txs.push({ txraw: txSendTBC });
```

### 批量广播
```ts
await API.broadcastTXsraw(txs, network);
```

const tbcutxo = await API.fetchUTXO(privateKey, fee, this.network);
const txSawp = await poolUse.swaptoTBC_baseToken_local(privateKey, address, ftutxos[0], preTXs, prepreTxDatas, ftAmount, lpPlan, tbcutxo);