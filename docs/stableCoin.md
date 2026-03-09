```ts
import * as tbc from "tbc-lib-js";
import {
  API,
  stableCoin,
  buildUTXO,
  buildFtPrePreTxData,
  fetchInBatches,
  parseDecimalToBigInt,
} from "tbc-contract";

const network = "testnet";
const privateKey_admin = tbc.PrivateKey.fromString(""); // 管理员私钥
const addressAdmin = tbc.Address.fromPrivateKey(privateKey_admin).toString();
const addressB = "1FhSD1YezTXbdRGWzNbNvUj6qeKQ6gZDMq";

const coinName = "USD Test";
const coinSymbol = "USDT";
const coinDecimal = 6;
const coinSupply = 100000000; // 精度6，总供应量上限1万亿
const coinContractTxid = ""; // createCoin 后获得

async function main() {
  try {
    // CreateCoin（发行稳定币合约，仅需执行一次）
    // stableCoin 继承自 FT，构造方式与 FT 相同
    {
      const newCoin = new stableCoin({
        name: coinName,
        symbol: coinSymbol,
        amount: coinSupply,
        decimal: coinDecimal,
      });

      const utxo = await API.fetchUTXO(privateKey_admin, 0.01, network); // 准备utxo
      const utxoTX = await API.fetchTXraw(utxo.txId, network); // 获取utxo所在交易
      const mintMessage = "SourceChain: BSC, TXID: 34434..."; //一般为跨链信息，起始链名称，交易id为必填信息。
      const createTXs = newCoin.createCoin(
        privateKey_admin,
        address, // 初始接收地址（一般是管理员自身）
        utxo,
        utxoTX,
        mintMessage
      ); // 组装交易，返回 [coinNftTXRaw, coinMintTXRaw]
      await API.broadcastTXraw(createTXs[0], network); // 广播 coinNFT 交易
      console.log("StableCoin Contract ID:");
      await API.broadcastTXraw(createTXs[1], network); // 广播 coinMint 交易，txid 即为 contractTxid
      console.log(newCoin.contractTxid); // 记录合约 txid，后续操作均需此 txid
    }

    // // MintCoin（增发稳定币，仅管理员可操作）
    // {
    //   const mintAmount = 50000; // 增发数量，number 或 string（大数请使用 string）
    //   const Coin = new stableCoin(coinContractTxid);
    //   const CoinInfo = await API.fetchFtInfo(Coin.contractTxid, network); // 获取稳定币信息
    //   Coin.initialize(CoinInfo);

    //   const utxo = await API.fetchUTXO(privateKey_admin, 0.01, network); // 准备手续费utxo

    //   // 获取 coinNFT 的父交易和爷交易（coinNFT 的 txid 即为 contractTxid）
    //   const nftPreTX = await API.fetchTXraw(coinContractTxid, network);
    //   const nftPrePreTX = await API.fetchTXraw(
    //     nftPreTX.inputs[0].prevTxId.toString("hex"),
    //     network
    //   );

    //   const mintTXRaw = Coin.mintCoin(
    //     privateKey_admin,
    //     addressB,      // 接收新铸稳定币的地址
    //     mintAmount,
    //     utxo,
    //     nftPreTX,
    //     nftPrePreTX,
    //     // "可选的铸币备注信息"  // mintMessage 可选
    //   ); // 组装交易
    //   await API.broadcastTXraw(mintTXRaw, network);
    // }

    // // Transfer（转移稳定币）
    // {
    //   const transferAmount = 1000; // 转移数量，number 或 string（大数请使用 string）
    //   const Coin = new stableCoin(coinContractTxid);
    //   const CoinInfo = await API.fetchFtInfo(Coin.contractTxid, network); // 获取稳定币信息
    //   Coin.initialize(CoinInfo);

    //   const tbc_amount = 0; // 如果同时转 tbc 和稳定币可设置此值，只转稳定币可忽略
    //   const utxo = await API.fetchUTXO(privateKey_admin, tbc_amount + 0.01, network); // 准备手续费utxo
    //   const transferAmountBN = parseDecimalToBigInt(transferAmount, Coin.decimal);

    //   const ftutxo_codeScript = stableCoin
    //     .buildFTtransferCode(Coin.codeScript, addressAdmin) // 使用管理员地址筛选
    //     .toBuffer()
    //     .toString("hex");
    //   const ftutxos = await API.fetchFtUTXOs(
    //     Coin.contractTxid,
    //     addressAdmin,
    //     ftutxo_codeScript,
    //     network,
    //     transferAmountBN
    //   ); // 准备稳定币 utxo

    //   let preTXs: tbc.Transaction[] = [];
    //   let prepreTxDatas: string[] = [];
    //   for (let i = 0; i < ftutxos.length; i++) {
    //     preTXs.push(await API.fetchTXraw(ftutxos[i].txId, network)); // 获取父交易
    //     prepreTxDatas.push(
    //       await API.fetchFtPrePreTxData(preTXs[i], ftutxos[i].outputIndex, network)
    //     ); // 获取爷交易数据
    //   }

    //   const transferTXRaw = Coin.transfer(
    //     privateKey_admin,
    //     addressB,
    //     transferAmount,
    //     ftutxos,
    //     utxo,
    //     preTXs,
    //     prepreTxDatas,
    //     // tbc_amount  // 可选，同时转 tbc
    //   ); // 组装交易
    //   await API.broadcastTXraw(transferTXRaw, network);
    // }

    // // BatchTransfer（批量转移稳定币到多个地址）
    // {
    //   const receiveAddressAmount = new Map<string, number | string>(); // 大数应使用 string
    //   receiveAddressAmount.set(addressAdmin, 500);
    //   receiveAddressAmount.set(addressB, 700);
    //   const totalAmount = 500 + 700;

    //   const Coin = new stableCoin(coinContractTxid);
    //   const CoinInfo = await API.fetchFtInfo(Coin.contractTxid, network);
    //   Coin.initialize(CoinInfo);

    //   const times = receiveAddressAmount.size;
    //   const transferFee = 0.005 * times;
    //   const utxo = await API.fetchUTXO(privateKey_admin, transferFee, network);
    //   const totalAmountBN = parseDecimalToBigInt(totalAmount, Coin.decimal);

    //   const ftutxo_codeScript = stableCoin
    //     .buildFTtransferCode(Coin.codeScript, addressAdmin)
    //     .toBuffer()
    //     .toString("hex");
    //   const ftutxos = await API.fetchFtUTXOs(
    //     Coin.contractTxid,
    //     addressAdmin,
    //     ftutxo_codeScript,
    //     network,
    //     totalAmountBN
    //   );

    //   let preTXs: tbc.Transaction[] = [];
    //   let prepreTxDatas: string[] = [];
    //   for (let i = 0; i < ftutxos.length; i++) {
    //     preTXs.push(await API.fetchTXraw(ftutxos[i].txId, network));
    //     prepreTxDatas.push(
    //       await API.fetchFtPrePreTxData(preTXs[i], ftutxos[i].outputIndex, network)
    //     );
    //   }

    //   const transferTXs = Coin.batchTransfer(
    //     privateKey_admin,
    //     receiveAddressAmount,
    //     ftutxos,
    //     utxo,
    //     preTXs,
    //     prepreTxDatas
    //   ); // 组装交易
    //   transferTXs.length > 0
    //     ? await API.broadcastTXsraw(transferTXs, network)
    //     : console.log("BatchTransfer failed");
    // }

    // // MergeCoin（合并稳定币 UTXO，要求所有 ftutxo 均已上链）
    // {
    //   const Coin = new stableCoin(coinContractTxid);
    //   const CoinInfo = await API.fetchFtInfo(Coin.contractTxid, network);
    //   Coin.initialize(CoinInfo);

    //   const ftutxo_codeScript = stableCoin
    //     .buildFTtransferCode(Coin.codeScript, addressAdmin)
    //     .toBuffer()
    //     .toString("hex");
    //   const ftutxos = await API.fetchFtUTXOList(
    //     Coin.contractTxid,
    //     addressAdmin,
    //     ftutxo_codeScript,
    //     network
    //   ); // 拉取所有稳定币 utxo

    //   const mergeFee = 0.005 * ftutxos.length;
    //   const utxo = await API.fetchUTXO(privateKey_admin, mergeFee, network);

    //   let localTX: tbc.Transaction[] = [];
    //   let preTXs: tbc.Transaction[] = [];
    //   let prepreTxDatas: string[] = [];

    //   // 分片获取 preTXs，每批处理 300 个
    //   const batchSize = 300;
    //   preTXs = await fetchInBatches<tbc.Transaction.IUnspentOutput, tbc.Transaction>(
    //     ftutxos,
    //     batchSize,
    //     (batch) =>
    //       Promise.all(batch.map((u) => API.fetchTXraw(u.txId, network))),
    //     "fetchFtPreTXData"
    //   );

    //   // 分片获取 prepreTxDatas
    //   prepreTxDatas = await fetchInBatches<tbc.Transaction.IUnspentOutput, string>(
    //     ftutxos,
    //     batchSize,
    //     (batch) =>
    //       Promise.all(
    //         batch.map((u) => {
    //           const globalIndex = ftutxos.indexOf(u);
    //           return API.fetchFtPrePreTxData(
    //             preTXs[globalIndex],
    //             u.outputIndex,
    //             network
    //           );
    //         })
    //       ),
    //     "fetchFtPrePreTxData"
    //   );

    //   const mergeTXs = Coin.mergeCoin(
    //     privateKey_admin,
    //     ftutxos,
    //     utxo,
    //     preTXs,
    //     prepreTxDatas,
    //     localTX
    //   ); // 组装交易
    //   mergeTXs.length > 0
    //     ? await API.broadcastTXsraw(mergeTXs, network)
    //     : console.log("Merge success");
    // }

    // // FrozenCoinUTXO（冻结指定地址的稳定币 UTXO，仅管理员可操作）
    // // 冻结后，持有者须等到 lockTime 到期（按区块高度）才能使用该 UTXO
    // {
    //   const lock_time = 900000; // 冻结至区块高度 900000
    //   const Coin = new stableCoin(coinContractTxid);
    //   const CoinInfo = await API.fetchFtInfo(Coin.contractTxid, network);
    //   Coin.initialize(CoinInfo);

    //   // 被冻结地址的稳定币 utxo（所有输入须属于同一地址，且合并为单个输出）
    //   const targetAddress = addressB;
    //   const ftutxo_codeScript = stableCoin
    //     .buildFTtransferCode(Coin.codeScript, targetAddress)
    //     .toBuffer()
    //     .toString("hex");
    //   const ftutxos = await API.fetchFtUTXOs(
    //     Coin.contractTxid,
    //     targetAddress,
    //     ftutxo_codeScript,
    //     network
    //   );

    //   const utxo = await API.fetchUTXO(privateKey_admin, 0.01, network);

    //   let preTXs: tbc.Transaction[] = [];
    //   let prepreTxDatas: string[] = [];
    //   for (let i = 0; i < ftutxos.length; i++) {
    //     preTXs.push(await API.fetchTXraw(ftutxos[i].txId, network));
    //     prepreTxDatas.push(
    //       await API.fetchFtPrePreTxData(preTXs[i], ftutxos[i].outputIndex, network)
    //     );
    //   }

    //   const frozenTXRaw = Coin.frozenCoinUTXO(
    //     privateKey_admin,
    //     lock_time,
    //     ftutxos,
    //     utxo,
    //     preTXs,
    //     prepreTxDatas
    //   ); // 组装冻结交易
    //   await API.broadcastTXraw(frozenTXRaw, network);
    // }
  } catch (error: any) {
    console.error("Error:", error);
  }
}

main();
```
