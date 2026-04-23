> **v1.6 Breaking change**：`createCoin` / `mintCoin` / `freezeCoinUTXO` / `unfreezeCoinUTXO`
> 的管理员鉴权从 ECDSA 迁移到 BIP327 **MuSig2 n-of-n Schnorr**。
>
> - 第一参数从 `privateKey_admin` 改为 `aggPubkey32`（32 字节 x-only 聚合公钥，
>   由所有管理员私钥按 BIP327 `keyAgg` 聚合得到），第二参数新增 `feePrivateKey`
>   （任何可付 fee 的普通 ECDSA 私钥，不必是管理员）。
> - 这四个方法不再直接返回 raw tx，而是返回 `AdminPrepared<R> = { tx, sighashes, finalize(schnorrSigs64) => R }`。
>   调用方须拿 `prepared.sighashes` 里的每个 32 字节 sighash 交给管理员们跑 MuSig2
>   仪式产出 64 字节 Schnorr 签名，再调 `prepared.finalize(sigs)` 拿到最终 raw tx 广播。
> - 其余方法（transfer / batchTransfer / mergeCoin 等）接口未变。
>
> 下方示例内联了一个 `runMuSigCeremony` 辅助函数演示单机聚合；生产环境中每个
> 管理员必须在各自的机器上本地生成 `secnonce` 并严格保证一次性使用。

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

const { MuSig2, Schnorr } = tbc.crypto;

const network = "testnet";

// ---------- 管理员（MuSig2 n-of-n，这里以 2-of-2 为例） ----------
// 线上应分别保存在不同签名方；两个 WIF 示例仅用于说明。
const adminSk1 = tbc.PrivateKey.fromString("");
const adminSk2 = tbc.PrivateKey.fromString("");

// ---------- 付手续费的 ECDSA 私钥（可以与 admin 无关） ----------
const feePrivateKey = tbc.PrivateKey.fromString("");
const feeAddress = feePrivateKey.toAddress().toString();

// ---------- 普通用户私钥（用于 transfer / batchTransfer 等） ----------
const privateKeyA = tbc.PrivateKey.fromString("");
const addressA = tbc.Address.fromPrivateKey(privateKeyA).toString();
const addressB = "1FhSD1YezTXbdRGWzNbNvUj6qeKQ6gZDMq";

const coinName = "USD Test";
const coinSymbol = "USDT";
const coinDecimal = 6;
const coinSupply = 1000000000; // 精度6，初次供应量10亿
const coinContractTxid = ""; // createCoin 后获得

// ----------------------------------------------------------------------
// MuSig2 工具
// ----------------------------------------------------------------------

/** 按字节序排序后聚合 n-of-n 管理员公钥，返回 keyAggCtx 和 32 字节 x-only aggPubkey。 */
function buildAdminKeyAgg(sks: tbc.PrivateKey[]) {
  const pubkeys33Raw: Buffer[] = sks.map((sk) =>
    MuSig2.pubkeyFromSk(sk.toBuffer())
  );
  const pubkeys33 = MuSig2.keySort(pubkeys33Raw);
  const keyAggCtx = MuSig2.keyAgg(pubkeys33);
  const aggPubkey32: Buffer = MuSig2.getAggPubkey(keyAggCtx);
  return { keyAggCtx, aggPubkey32 };
}

/**
 * 模拟多个管理员共同对一批 sighash 签名，返回同长度的 64 字节 Schnorr 签名数组。
 * 实际部署中，secnonce 必须只使用一次且本地保存，禁止跨 sighash / 跨会话复用。
 */
function runMuSigCeremony(
  sks: tbc.PrivateKey[],
  keyAggCtx: tbc.crypto.MuSig2KeyAggCtx,
  aggPubkey32: Buffer,
  sighashes: Buffer[]
): Buffer[] {
  const skBufs = sks.map((sk) => sk.toBuffer());
  const pubkeys33 = skBufs.map((sk) => MuSig2.pubkeyFromSk(sk));
  const sigs: Buffer[] = [];
  for (const msg of sighashes) {
    // Round 1: 每个签名方为当前 msg 生成 (secnonce, pubnonce)
    const nonces = skBufs.map((sk, i) =>
      MuSig2.nonceGen({
        pk: pubkeys33[i],
        sk,
        aggpk: aggPubkey32,
        msg,
      })
    );
    const aggnonce = MuSig2.nonceAgg(nonces.map((n) => n.pubnonce));
    // Round 2: 根据聚合 nonce 构建会话并生成 partial sig
    const session = MuSig2.buildSession(keyAggCtx, aggnonce, msg);
    const psigs = skBufs.map((sk, i) =>
      MuSig2.partialSign(nonces[i].secnonce, sk, session)
    );
    const sig64 = MuSig2.partialSigAgg(psigs, session);
    // 本地 BIP340 校验，提前拦住仪式配置错误
    if (!Schnorr.verify(msg, sig64, aggPubkey32)) {
      throw new Error("Schnorr.verify 本地校验失败");
    }
    sigs.push(sig64);
  }
  return sigs;
}

async function main() {
  try {
    const { keyAggCtx, aggPubkey32 } = buildAdminKeyAgg([adminSk1, adminSk2]);

    // CreateCoin（发行稳定币合约，仅需执行一次）
    // stableCoin 继承自 FT，构造方式与 FT 相同
    {
      const newCoin = new stableCoin({
        name: coinName,
        symbol: coinSymbol,
        amount: coinSupply,
        decimal: coinDecimal,
      });

      const utxo = await API.fetchUTXO(feePrivateKey, 0.01, network); // 手续费 utxo
      const utxoTX = await API.fetchTXraw(utxo.txId, network);
      const mintMessage = "SourceChain: BSC, TXID: 34434..."; // 一般为跨链信息：起始链名称 + 交易 id

      // 第一阶段：组装交易并返回需要管理员 MuSig2 签名的 sighash 列表
      const prepared = newCoin.createCoin(
        aggPubkey32,
        feePrivateKey,
        feeAddress, // 初始接收地址（示例放到 fee 地址名下，可改为任意地址）
        utxo,
        utxoTX,
        mintMessage
      );

      // 第二阶段：管理员共同对每个 sighash 生成 64B Schnorr 签名
      const sighashes = prepared.sighashes.map((x) => x.sighash);
      const sigs = runMuSigCeremony(
        [adminSk1, adminSk2],
        keyAggCtx,
        aggPubkey32,
        sighashes
      );

      // 合成最终 raw tx 并依次广播：coinNft → coinMint
      const [coinNftTXRaw, coinMintTXRaw] = prepared.finalize(sigs);
      const contractTxid = await API.broadcastTXraw(coinNftTXRaw, network);
      console.log("StableCoin Contract ID (= coinNft txid):", contractTxid);
      await API.broadcastTXraw(coinMintTXRaw, network);
    }

    // MintCoin（增发稳定币，仅管理员可操作）
    {
      const mintAmount = 50000; // 增发数量，number 或 string（大数请使用 string）
      const Coin = new stableCoin(coinContractTxid);
      const CoinInfo = await API.fetchCoinInfo(Coin.contractTxid, network);
      Coin.initialize(CoinInfo.coinInfo);

      const utxo = await API.fetchUTXO(feePrivateKey, 0.01, network);
      // 获取 coinNFT 的父交易和爷交易
      const nftPreTX = await API.fetchTXraw(CoinInfo.nftTXID, network);
      const nftPrePreTX = await API.fetchTXraw(
        nftPreTX.inputs[0].prevTxId.toString("hex"),
        network
      );

      const mintMessage = "SourceChain: BSC, TXID: 34434...";

      const prepared = Coin.mintCoin(
        aggPubkey32,
        feePrivateKey,
        addressA, // 接收新铸稳定币的地址
        mintAmount,
        utxo,
        nftPreTX,
        nftPrePreTX,
        mintMessage
      );
      const sighashes = prepared.sighashes.map((x) => x.sighash);
      const sigs = runMuSigCeremony(
        [adminSk1, adminSk2],
        keyAggCtx,
        aggPubkey32,
        sighashes
      );
      const mintTXRaw = prepared.finalize(sigs);
      await API.broadcastTXraw(mintTXRaw, network);
    }

    // Transfer（转移稳定币）
    {
      const transferAmount = 1000;
      const Coin = new stableCoin(coinContractTxid);
      const CoinInfo = await API.fetchCoinInfo(Coin.contractTxid, network);
      Coin.initialize(CoinInfo.coinInfo);

      const tbc_amount = 0; // 如果同时转 tbc 和稳定币可设置此值，只转稳定币可忽略
      const utxo = await API.fetchUTXO(privateKeyA, tbc_amount + 0.01, network);
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
        5 // 转移交易 coinUTXO 数量上限 5 个
      );

      let preTXs: tbc.Transaction[] = [];
      let prepreTxDatas: string[] = [];
      for (let i = 0; i < coinutxos.length; i++) {
        preTXs.push(await API.fetchTXraw(coinutxos[i].txId, network));
        prepreTxDatas.push(
          await API.fetchFtPrePreTxData(preTXs[i], coinutxos[i].outputIndex, network)
        );
      }

      const transferTXRaw = Coin.transfer(
        privateKeyA,
        addressB,
        transferAmount,
        coinutxos,
        utxo,
        preTXs,
        prepreTxDatas
        // tbc_amount  // 可选，同时转 tbc
      );
      await API.broadcastTXraw(transferTXRaw, network);
    }

    // BatchTransfer（批量转移稳定币到多个地址，每笔交易最多 5 人，超过自动链式拆分，支持重复地址）
    {
      const receivers: { address: string; amount: number | string }[] = [
        { address: addressA, amount: 500 },
        { address: addressB, amount: 700 },
        // ... 最多可添加任意数量，每 5 人一笔交易
      ];
      const totalAmount = 500 + 700;

      const Coin = new stableCoin(coinContractTxid);
      const CoinInfo = await API.fetchCoinInfo(Coin.contractTxid, network);
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
        network
      );

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
      );
      transferTXs.length > 0
        ? await API.broadcastTXsraw(transferTXs, network)
        : console.log("BatchTransfer failed");
    }

    // MergeCoin（合并稳定币 UTXO，要求所有 coinutxo 均已上链）
    {
      const Coin = new stableCoin(coinContractTxid);
      const CoinInfo = await API.fetchCoinInfo(Coin.contractTxid, network);
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
      );

      const mergeFee = 0.005 * coinutxos.length;
      const utxo = await API.fetchUTXO(privateKeyA, mergeFee, network);

      let localTX: tbc.Transaction[] = [];
      let preTXs: tbc.Transaction[] = [];
      let prepreTxDatas: string[] = [];

      const batchSize = 300;
      preTXs = await fetchInBatches<tbc.Transaction.IUnspentOutput, tbc.Transaction>(
        coinutxos,
        batchSize,
        (batch) => Promise.all(batch.map((u) => API.fetchTXraw(u.txId, network))),
        "fetchFtPreTXData"
      );
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
      );
      mergeTXs.length > 0
        ? await API.broadcastTXsraw(mergeTXs, network)
        : console.log("Merge success");
    }

    // FreezeCoinUTXO（冻结指定地址的稳定币 UTXO，仅管理员可操作）
    // 冻结后，持有者须等到 lock_time 之后才能再使用该 UTXO
    // 注意：本次最多处理 5 个 UTXO，超过会抛错（v1.6 从静默截断改为显式报错）
    {
      const lock_time = 1774410989; // 冻结至 unix 时间 1774410989
      const Coin = new stableCoin(coinContractTxid);
      const CoinInfo = await API.fetchCoinInfo(Coin.contractTxid, network);
      Coin.initialize(CoinInfo.coinInfo);

      // 被冻结地址的稳定币 utxo（所有输入须属于同一地址）
      const targetAddress = addressB;
      const coinutxo_codeScript = stableCoin
        .buildFTtransferCode(Coin.codeScript, targetAddress)
        .toBuffer()
        .toString("hex");
      const coinutxos = (
        await API.fetchCoinUTXOList(
          Coin.contractTxid,
          targetAddress,
          coinutxo_codeScript,
          network
        )
      ).slice(0, 5); // 每次最多 5 个

      const utxo = await API.fetchUTXO(feePrivateKey, 0.01, network);

      let preTXs: tbc.Transaction[] = [];
      let prepreTxDatas: string[] = [];
      for (let i = 0; i < coinutxos.length; i++) {
        preTXs.push(await API.fetchTXraw(coinutxos[i].txId, network));
        prepreTxDatas.push(
          await API.fetchFtPrePreTxData(preTXs[i], coinutxos[i].outputIndex, network)
        );
      }

      const prepared = Coin.freezeCoinUTXO(
        aggPubkey32,
        feePrivateKey,
        lock_time,
        coinutxos,
        utxo,
        preTXs,
        prepreTxDatas
      );
      // freeze 每个 ftutxo 都需要一个 admin Schnorr 签名（N 条 sighash）
      const sighashes = prepared.sighashes.map((x) => x.sighash);
      const sigs = runMuSigCeremony(
        [adminSk1, adminSk2],
        keyAggCtx,
        aggPubkey32,
        sighashes
      );
      const freezeTXRaw = prepared.finalize(sigs);
      await API.broadcastTXraw(freezeTXRaw, network);
    }

    // UnfreezeCoinUTXO（解冻指定地址的稳定币 UTXO，仅管理员可操作）
    // 同样最多 5 个 UTXO
    {
      const Coin = new stableCoin(coinContractTxid);
      const CoinInfo = await API.fetchCoinInfo(Coin.contractTxid, network);
      Coin.initialize(CoinInfo.coinInfo);

      const targetAddress = addressB;
      const coinutxo_codeScript = stableCoin
        .buildFTtransferCode(Coin.codeScript, targetAddress)
        .toBuffer()
        .toString("hex");
      const allUtxos = await API.fetchCoinUTXOList(
        Coin.contractTxid,
        targetAddress,
        coinutxo_codeScript,
        network
      );
      // 只选 lock_time 未到期的（已被冻结的）
      const nowTs = Math.floor(Date.now() / 1000);
      const coinutxos = allUtxos
        .filter((u: any) => Number(u.lockTime) > nowTs)
        .slice(0, 5);

      const utxo = await API.fetchUTXO(feePrivateKey, 0.01, network);

      let preTXs: tbc.Transaction[] = [];
      let prepreTxDatas: string[] = [];
      for (let i = 0; i < coinutxos.length; i++) {
        preTXs.push(await API.fetchTXraw(coinutxos[i].txId, network));
        prepreTxDatas.push(
          await API.fetchFtPrePreTxData(preTXs[i], coinutxos[i].outputIndex, network)
        );
      }

      const prepared = Coin.unfreezeCoinUTXO(
        aggPubkey32,
        feePrivateKey,
        coinutxos,
        utxo,
        preTXs,
        prepreTxDatas
      );
      const sighashes = prepared.sighashes.map((x) => x.sighash);
      const sigs = runMuSigCeremony(
        [adminSk1, adminSk2],
        keyAggCtx,
        aggPubkey32,
        sighashes
      );
      const unfreezeTXRaw = prepared.finalize(sigs);
      await API.broadcastTXraw(unfreezeTXRaw, network);
    }
  } catch (error: any) {
    console.error("Error:", error);
  }
}

main();
```
