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
const privateKeyA = tbc.PrivateKey.fromString("");
const addressAdmin = tbc.Address.fromPrivateKey(privateKey_admin).toString();
const addressA = tbc.Address.fromPrivateKey(privateKeyA).toString();
const addressB = "1FhSD1YezTXbdRGWzNbNvUj6qeKQ6gZDMq";

const coinName = "USD Test";
const coinSymbol = "USDT";
const coinDecimal = 6;
const coinSupply = 1000000000; // 精度6，初次供应量10亿
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
      console.log("StableCoin Contract ID:");
      await API.broadcastTXraw(createTXs[0], network); // 广播 coinNFT 交易，txid 即为 contractTxid，记录合约 txid，后续操作均需此 txid
      await API.broadcastTXraw(createTXs[1], network); // 广播 coinMint 交易
    }

    // MintCoin（增发稳定币，仅管理员可操作）
    {
      const mintAmount = 50000; // 增发数量，number 或 string（大数请使用 string）
      const Coin = new stableCoin(coinContractTxid);
      const CoinInfo = await API.fetchCoinInfo(Coin.contractTxid, network); // 获取稳定币信息
      Coin.initialize(CoinInfo.coinInfo);

      const utxo = await API.fetchUTXO(privateKey_admin, 0.01, network); // 准备手续费utxo

      // 获取 coinNFT 的父交易和爷交易
      const nftPreTX = await API.fetchTXraw(CoinInfo.nftTXID, network);
      const nftPrePreTX = await API.fetchTXraw(
        nftPreTX.inputs[0].prevTxId.toString("hex"),
        network
      );

      const mintMessage = "SourceChain: BSC, TXID: 34434..."; //一般为跨链信息，起始链名称，交易id为必填信息。
      const mintTXRaw = Coin.mintCoin(
        privateKey_admin,
        addressA,      // 接收新铸稳定币的地址
        mintAmount,
        utxo,
        nftPreTX,
        nftPrePreTX,
        mintMessage
      ); // 组装交易
      await API.broadcastTXraw(mintTXRaw, network);
    }

    // Transfer（转移稳定币）
    {
      const transferAmount = 1000; // 转移数量，number 或 string（大数请使用 string）
      const Coin = new stableCoin(coinContractTxid);
      const CoinInfo = await API.fetchCoinInfo(Coin.contractTxid, network); // 获取稳定币信息
      Coin.initialize(CoinInfo.coinInfo);

      const tbc_amount = 0; // 如果同时转 tbc 和稳定币可设置此值，只转稳定币可忽略
      const utxo = await API.fetchUTXO(privateKeyA, tbc_amount + 0.01, network); // 准备手续费utxo
      const transferAmountBN = parseDecimalToBigInt(transferAmount, Coin.decimal);

      const coinutxo_codeScript = stableCoin
      .buildFTtransferCode(Coin.codeScript, addressA)
      .toBuffer()
      .toString("hex");
      const coinutxos = await API.fetchCoinUTXOs(
          Coin.contractTxid,
          addressA,
          transferAmountBN,
          coinutxo_codeScript,
          network,
          5 //转移交易coinUTXO数量上限5个
      ); // 准备稳定币 utxo

      let preTXs: tbc.Transaction[] = [];
      let prepreTxDatas: string[] = [];
      for (let i = 0; i < coinutxos.length; i++) {
          preTXs.push(await API.fetchTXraw(coinutxos[i].txId, network));
          prepreTxDatas.push(await API.fetchFtPrePreTxData(preTXs[i], coinutxos[i].outputIndex, network));
      }

      const transferTXRaw = Coin.transfer(
          privateKeyA,
          addressB,
          transferAmount,
          coinutxos,
          utxo,
          preTXs,
          prepreTxDatas,
          // tbc_amount  // 可选，同时转 tbc
      ); // 组装交易
      await API.broadcastTXraw(transferTXRaw, network);
    }

    // BatchTransfer（批量转移稳定币到多个地址，每笔交易最多5人，超过自动链式拆分，支持重复地址）
    {
      const receivers: { address: string, amount: number | string }[] = [ // 大数应使用 string
        { address: addressA, amount: 500 },
        { address: addressB, amount: 700 },
        // ... 最多可添加任意数量，每5人一笔交易
      ];
      const totalAmount = 500 + 700;

      const Coin = new stableCoin(coinContractTxid);
      const CoinInfo = await API.fetchCoinInfo(Coin.contractTxid, network); // 获取稳定币信息
      Coin.initialize(CoinInfo.coinInfo);

      const batchCount = Math.ceil(receivers.length / 5);
      const transferFee = 0.005 * batchCount;
      const utxo = await API.fetchUTXO(privateKeyA, transferFee, network);
      const totalAmountBN = parseDecimalToBigInt(totalAmount, Coin.decimal);

      const coinutxo_codeScript = stableCoin
        .buildFTtransferCode(Coin.codeScript, addressA)
        .toBuffer()
        .toString("hex");
      const coinutxos = await API.fetchCoinUTXOs(
        Coin.contractTxid,
        addressA,
        totalAmountBN,
        coinutxo_codeScript,
        network,
      ); // 准备稳定币 utxo

      let preTXs: tbc.Transaction[] = [];
      let prepreTxDatas: string[] = [];
      for (let i = 0; i < coinutxos.length; i++) {
        preTXs.push(await API.fetchTXraw(coinutxos[i].txId, network));
        prepreTxDatas.push(
          await API.fetchFtPrePreTxData(preTXs[i], coinutxos[i].outputIndex, network)
        );
      }

      const transferTXs = Coin.batchTransfer(
        privateKeyA,
        receivers,
        coinutxos,
        utxo,
        preTXs,
        prepreTxDatas
      ); // 组装交易
      transferTXs.length > 0
        ? await API.broadcastTXsraw(transferTXs, network)
        : console.log("BatchTransfer failed");
    }

    // MergeCoin（合并稳定币 UTXO，要求所有 coinutxo 均已上链）
    {
      const Coin = new stableCoin(coinContractTxid);
      const CoinInfo = await API.fetchCoinInfo(Coin.contractTxid, network); // 获取稳定币信息
      Coin.initialize(CoinInfo.coinInfo);

      const coinutxo_codeScript = stableCoin
        .buildFTtransferCode(Coin.codeScript, addressA)
        .toBuffer()
        .toString("hex");
      const coinutxos = await API.fetchCoinUTXOList(
        Coin.contractTxid,
        addressA,
        coinutxo_codeScript,
        network
      ); // 拉取所有稳定币 utxo

      const mergeFee = 0.005 * coinutxos.length;
      const utxo = await API.fetchUTXO(privateKeyA, mergeFee, network);

      let localTX: tbc.Transaction[] = [];
      let preTXs: tbc.Transaction[] = [];
      let prepreTxDatas: string[] = [];

      // 分片获取 preTXs，每批处理 300 个
      const batchSize = 300;
      preTXs = await fetchInBatches<tbc.Transaction.IUnspentOutput, tbc.Transaction>(
        coinutxos,
        batchSize,
        (batch) =>
          Promise.all(batch.map((u) => API.fetchTXraw(u.txId, network))),
        "fetchFtPreTXData"
      );

      // 分片获取 prepreTxDatas
      prepreTxDatas = await fetchInBatches<tbc.Transaction.IUnspentOutput, string>(
        coinutxos,
        batchSize,
        (batch) =>
          Promise.all(
            batch.map((u) => {
              const globalIndex = coinutxos.indexOf(u);
              return API.fetchFtPrePreTxData(
                preTXs[globalIndex],
                u.outputIndex,
                network
              );
            })
          ),
        "fetchFtPrePreTxData"
      );

      const mergeTXs = Coin.mergeCoin(
        privateKeyA,
        coinutxos,
        utxo,
        preTXs,
        prepreTxDatas,
        localTX
      ); // 组装交易
      mergeTXs.length > 0
        ? await API.broadcastTXsraw(mergeTXs, network)
        : console.log("Merge success");
    }

    // FreezeCoinUTXO（冻结指定地址的稳定币 UTXO，仅管理员可操作）
    // 冻结后，持有者须等到冻结到期才能使用该 UTXO
    {
      const lock_time = 1774410989; // 冻结至unix时间 1774410989
      const Coin = new stableCoin(coinContractTxid);
      const CoinInfo = await API.fetchCoinInfo(Coin.contractTxid, network); // 获取稳定币信息
      Coin.initialize(CoinInfo.coinInfo);

      // 被冻结地址的稳定币 utxo（所有输入须属于同一地址，且合并为单个输出）
      const targetAddress = addressB;
      const coinutxo_codeScript = stableCoin
        .buildFTtransferCode(Coin.codeScript, targetAddress)
        .toBuffer()
        .toString("hex");
      const coinutxos = await API.fetchCoinUTXOList(
        Coin.contractTxid,
        targetAddress,
        coinutxo_codeScript,
        network
      ); // 拉取该地址下稳定币 utxo

      const utxo = await API.fetchUTXO(privateKey_admin, 0.01, network);

      let preTXs: tbc.Transaction[] = [];
      let prepreTxDatas: string[] = [];
      for (let i = 0; i < coinutxos.length; i++) {
        preTXs.push(await API.fetchTXraw(coinutxos[i].txId, network));
        prepreTxDatas.push(
          await API.fetchFtPrePreTxData(preTXs[i], coinutxos[i].outputIndex, network)
        );
      }

      const freezeTXRaw = Coin.freezeCoinUTXO(
        privateKey_admin,
        lock_time,
        coinutxos,
        utxo,
        preTXs,
        prepreTxDatas
      ); // 组装冻结交易
      await API.broadcastTXraw(freezeTXRaw, network);
    }

    // UnfreezeCoinUTXO （解冻指定地址的稳定币 UTXO，仅管理员可操作）
    {
      const Coin = new stableCoin(coinContractTxid);
      const CoinInfo = await API.fetchCoinInfo(Coin.contractTxid, network); // 获取稳定币信息
      Coin.initialize(CoinInfo.coinInfo);

      // 被冻结地址的稳定币 utxo（所有输入须属于同一地址，且合并为单个输出）
      const targetAddress = addressB;
      const coinutxo_codeScript = stableCoin
          .buildFTtransferCode(Coin.codeScript, targetAddress)
          .toBuffer()
          .toString("hex");
      const coinutxos = await API.fetchCoinUTXOList(
          Coin.contractTxid,
          targetAddress,
          coinutxo_codeScript,
          network
      ); // 拉取该地址下冻结的稳定币 utxo

      const utxo = await API.fetchUTXO(privateKeyA, 0.01, network);

      let preTXs: tbc.Transaction[] = [];
      let prepreTxDatas: string[] = [];
      for (let i = 0; i < coinutxos.length; i++) {
          preTXs.push(await API.fetchTXraw(coinutxos[i].txId, network));
          prepreTxDatas.push(
          await API.fetchFtPrePreTxData(preTXs[i], coinutxos[i].outputIndex, network)
          );
      }

      const unfreezeTXRaw = Coin.unfreezeCoinUTXO(
          privateKeyA,
          coinutxos,
          utxo,
          preTXs,
          prepreTxDatas
      ); // 组装解冻交易
      await API.broadcastTXraw(unfreezeTXRaw, network);
    }
  } catch (error: any) {
    console.error("Error:", error);
  }
}

main();
```
