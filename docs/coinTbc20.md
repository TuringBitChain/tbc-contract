# Coin TBC20 SDK

`Coin` 是新版稳定币入口，支持发行、增发、转账、批量转账、合并、冻结与解冻。旧版 FT 稳定币请使用 [`stableCoin`](./stableCoin.md)。

本文以 **2-of-2 管理员**为例：管理员甲、乙共同签名发行、增发、冻结和解冻；币发给普通持有人，由持有人自行签名转账。SDK 构造交易后，由调用方广播。

## 准备

```sh
npm install tbc-lib-js tbc-contract
```

示例使用测试网。替换下面的 WIF 和收款地址，并为手续费付款人、持有人准备 TBC 余额：

```ts
import * as tbc from "tbc-lib-js";
import { Coin, CoinTBC20, API, buildUTXO, type AdminPrepared } from "tbc-contract";

const network = "testnet";
const adminKeyA = tbc.PrivateKey.fromString("管理员甲的 WIF");
const adminKeyB = tbc.PrivateKey.fromString("管理员乙的 WIF");
const feeKey = tbc.PrivateKey.fromString("手续费付款人的 WIF");
const holderKey = tbc.PrivateKey.fromString("持有人的 WIF");
const holderAddress = holderKey.toAddress().toString();
const recipientAddress = "收款人的测试网地址";
```

| 角色 | 负责什么 |
| --- | --- |
| 管理员甲、乙 | 共同授权发行和管理操作，缺一不可 |
| `feeKey` | 支付发行、增发、冻结、解冻的 TBC 手续费 |
| `holderKey` | 接收首次发行的币，签名并支付普通转账的手续费 |

**币的金额用十进制字符串。** `"10.5"` 就是 10.5 枚，无需乘精度。`decimal` 支持 `0..18`；`totalSupply` 和 UTXO 的 `ftBalance` 是最小单位，例如 6 位精度的 10.5 枚对应 `10500000n`。

后文含 `await` 的操作片段放在异步函数中执行。`API.fetchUTXO(key, 0.01, network)` 的 `0.01` 单位是 TBC，是选取费用 UTXO 的金额门槛；实际费用由 SDK 计算。该查询可能自动合并并广播 TBC UTXO。

## 管理员 MuSig2 签名

先把甲、乙的公钥聚合成一个管理员公钥：

```ts
const { MuSig2, Schnorr } = tbc.crypto;
const pubkeyA = MuSig2.pubkeyFromSk(adminKeyA.toBuffer());
const pubkeyB = MuSig2.pubkeyFromSk(adminKeyB.toBuffer());
const keyAggCtx = MuSig2.keyAgg(MuSig2.keySort([pubkeyA, pubkeyB]));
const aggPubkey32 = MuSig2.getAggPubkey(keyAggCtx);
```

每次管理员操作都是 **构造交易 → 甲乙共同签名 → 回填签名 → 广播**。下面的辅助函数展示两人如何对每条消息共同生成一条 64 字节 Schnorr 签名：

```ts
function signByBothAdmins(messages: Buffer[]): Buffer[] {
  return messages.map(msg => {
    // 第一轮：甲、乙各自生成一次性 nonce，交换公开部分。
    const nonceA = MuSig2.nonceGen({
      pk: pubkeyA, sk: adminKeyA.toBuffer(), aggpk: aggPubkey32, msg,
    });
    const nonceB = MuSig2.nonceGen({
      pk: pubkeyB, sk: adminKeyB.toBuffer(), aggpk: aggPubkey32, msg,
    });
    const aggnonce = MuSig2.nonceAgg([nonceA.pubnonce, nonceB.pubnonce]);
    const session = MuSig2.buildSession(keyAggCtx, aggnonce, msg);

    // 第二轮：甲、乙分别签名，再合并两份部分签名。
    const partialA = MuSig2.partialSign(nonceA.secnonce, adminKeyA.toBuffer(), session);
    const partialB = MuSig2.partialSign(nonceB.secnonce, adminKeyB.toBuffer(), session);
    const signature = MuSig2.partialSigAgg([partialA, partialB], session);
    if (!Schnorr.verify(msg, signature, aggPubkey32)) throw new Error("管理员签名校验失败");
    return signature;
  });
}

function finalizeAdmin<R>(prepared: AdminPrepared<R>): R {
  const signatures = signByBothAdmins(prepared.sighashes.map(item => item.sighash));
  return prepared.finalize(signatures);
}
```

这里将两位管理员放在同一程序中演示；实际使用时，两人各自保管私钥和秘密 nonce，只交换公开 nonce 与部分签名，秘密 nonce 每次都要重新生成。

`prepared.sighashes` 中每条消息都需要甲乙共同签名；`finalize` 的签名数组与消息顺序、数量一致。取得 `prepared` 后不要改交易，每个 `prepared` 只能成功 `finalize` 一次。

## 首次发行

甲、乙共同发行一种 6 位精度的稳定币，首次发行 100 万枚给持有人，费用由 `feeKey` 支付：

```ts
const token = new Coin({
  name: "USD Test",
  symbol: "USDT",
  amount: "1000000",
  decimal: 6,
});

const fundingUTXO = await API.fetchUTXO(feeKey, 0.01, network);
const fundingTX = await API.fetchTXraw(fundingUTXO.txId, network);

// 1. 构造交易，得到需要管理员签名的消息。
const prepared = token.createCoin(
  aggPubkey32, feeKey, holderAddress, fundingUTXO, fundingTX, "首次发行",
);

// 2. 甲、乙共同签名，再回填得到两笔交易。
const signatures = signByBothAdmins(prepared.sighashes.map(item => item.sighash));
const [issuerRaw, firstMintRaw] = prepared.finalize(signatures);
const issuerTX = new tbc.Transaction(issuerRaw);
const firstMintTX = new tbc.Transaction(firstMintRaw);

// 3. 先广播发行凭证，再广播首次发行交易；等待前一笔成功。
await API.broadcastTXraw(issuerRaw, network);
await API.broadcastTXraw(firstMintRaw, network);

const contractTxid = token.contractTxid;     // 等于 firstMintTX.id，后续增发不变
```

`createCoin` 同时创建 [TBC721 发行凭证](./tbc721.md)。每次发行都会延续这张凭证，后续增发需要用到它的最新交易。请保存 `contractTxid`、币种元数据和相关交易原文。

## 转账

持有人将刚收到的币转出 10.5 枚。这一步由 `holderKey` 签名，无需管理员参与：

```ts
const coinUTXOs = [Coin.buildUTXO(firstMintTX, 3)]; // 首次发行的 Coin 位于输出 3
const parentTxs = [firstMintTX];
const ancestors = new Map([[issuerTX.id, issuerTX]]);
const feeUTXO = await API.fetchUTXO(holderKey, 0.01, network); // 持有人支付转账费

const transferRaw = token.transfer(
  holderKey,
  recipientAddress,
  "10.5",
  coinUTXOs,
  feeUTXO,
  parentTxs,
  ancestors,
);
await API.broadcastTXraw(transferRaw, network);
```

`transfer` 返回已签名的交易原文。收款 Coin 位于输出 `0`；有 Coin 找零时位于输出 `2`，TBC 找零位于最后一个输出。费用 UTXO 必须属于签名的 `holderKey`。

转账、合并和冻结都会用到以下三组数据：

| 参数 | 如何准备 |
| --- | --- |
| `coinUTXOs` | 使用 `Coin.buildUTXO(parentTX, coinVout)` 提取要花费的 Coin |
| `parentTxs` | 创建这些 Coin 的完整交易，与 `coinUTXOs` 一一对应、顺序一致 |
| `ancestors` | 父交易所引用的祖交易对象，推荐用 `Map<txid, Transaction>` 保存，交易 ID 使用小写 |

<details>
<summary>已有 Coin 的祖交易数据怎么获取？</summary>

父交易的 Coin Tape 中，每个非零金额槽对应一个输入，需要获取该输入引用的完整交易。保留原槽位编号，不要过滤零槽后重新编号：

```ts
async function loadAncestors(
  utxos: tbc.Transaction.IUnspentOutput[],
  parents: tbc.Transaction[],
): Promise<Map<string, tbc.Transaction>> {
  const result = new Map<string, tbc.Transaction>();
  for (let i = 0; i < utxos.length; i++) {
    const tape = CoinTBC20.parseTape(parents[i].outputs[utxos[i].outputIndex + 1].script);
    for (let slot = 0; slot < tape.amounts.length; slot++) {
      if (tape.amounts[slot] === 0n) continue;
      const txid = parents[i].inputs[slot].prevTxId.toString("hex").toLowerCase();
      if (!result.has(txid)) result.set(txid, await API.fetchTXraw(txid, network));
    }
  }
  return result;
}
```

也可以从本地交易缓存读取。`CoinAncestors` 还接受共享的 `Transaction[]`、同步查询函数 `(txid) => Transaction | undefined`，或按 Coin 输入顺序提供的 resolver 数组。

链式交易请保存新构造的交易；批量转账与合并会自动维护内部交易链。新版 Coin 不接受 `API.fetchFtPrePreTxData()` 或 `buildFtPrePreTxData()` 的旧 proof 字符串。

</details>

## 继续增发

甲、乙再次共同签名，增发 5 万枚到收款地址。这里复用 `finalizeAdmin` 完成两人签名和回填：

```ts
const mintFeeUTXO = await API.fetchUTXO(feeKey, 0.01, network);
const mintPrepared = token.mintCoin(
  aggPubkey32, feeKey, recipientAddress, "50000",
  mintFeeUTXO,
  firstMintTX, // 最新发行凭证所在交易
  issuerTX,    // 上述交易 inputs[0] 引用的交易
  "追加发行", // 可选备注
);
const mintRaw = finalizeAdmin(mintPrepared);
await API.broadcastTXraw(mintRaw, network);
```

下一次增发时，凭证交易改用 `new tbc.Transaction(mintRaw)`，它的祖交易改用 `firstMintTX`。始终沿用**最新且未花费的发行凭证**。每笔发行交易的新 Coin 都位于输出 `3`；`finalize` 成功后实例会更新累计 `totalSupply`。

## 批量转账与合并

以下是独立用法；每次操作都要重新准备当前未花费的 `coinUTXOs`、`feeUTXO` 及对应交易数据。

```ts
const recipientA = "第一个收款人的测试网地址";
const recipientB = "第二个收款人的测试网地址";
const batch = token.batchTransfer(
  holderKey,
  [{ address: recipientA, amount: "10" }, { address: recipientB, amount: "20" }],
  coinUTXOs, feeUTXO, parentTxs, ancestors,
);
for (const { txraw } of batch) await API.broadcastTXraw(txraw, network);
```

```ts
const merged = token.mergeCoin(holderKey, coinUTXOs, feeUTXO, parentTxs, ancestors);
for (const { txraw } of merged) await API.broadcastTXraw(txraw, network);
```

两者均返回 `{ txraw }[]`，按数组顺序广播。批量转账每笔最多 5 个接收人，超出后自动拆成多笔；单笔最多 5 个 Coin 输入，更多 UTXO 可先用 `mergeCoin` 合并。仅一个 UTXO 时，合并返回空数组。

## 冻结与解冻

甲、乙共同将前面转出的 10.5 枚冻结 24 小时，费用由 `feeKey` 支付。以下假设收款人尚未花费这笔 Coin：

```ts
const transferTX = new tbc.Transaction(transferRaw);
const targetUTXOs = [Coin.buildUTXO(transferTX, 0)];
const adminFeeUTXO = await API.fetchUTXO(feeKey, 0.01, network);
const unlockTime = Math.floor(Date.now() / 1000) + 24 * 60 * 60;

const freezePrepared = token.freezeCoinUTXO(
  aggPubkey32, feeKey, unlockTime,
  targetUTXOs, adminFeeUTXO, [transferTX], new Map([[firstMintTX.id, firstMintTX]]),
);
const freezeRaw = finalizeAdmin(freezePrepared);
await API.broadcastTXraw(freezeRaw, network);
```

甲、乙也可以共同签名提前解冻。使用冻结交易新产生的 Coin 和 TBC 找零：

```ts
const frozenTX = new tbc.Transaction(freezeRaw);
const thawPrepared = token.unfreezeCoinUTXO(
  aggPubkey32, feeKey,
  [Coin.buildUTXO(frozenTX, 0)],
  buildUTXO(frozenTX, frozenTX.outputs.length - 1),
  [frozenTX], new Map([[transferTX.id, transferTX]]),
);
const thawRaw = finalizeAdmin(thawPrepared);
await API.broadcastTXraw(thawRaw, network);
```

| 锁值 | 含义 |
| --- | --- |
| `0` | 无锁，解冻即设为此值 |
| `1..499999999` | 区块高度 |
| `500000000..4294967295` | Unix 时间戳，单位为秒 |

冻结针对指定 UTXO，保留原持有人及余额。锁到期后持有人可转账，管理员也可提前解冻。普通转账会按输入锁设置交易锁时间，能否广播取决于链上高度或时间；不要混用高度锁与时间戳锁。转账后的新 Coin 锁重置为 `0`。

## 恢复已有币

通过保存的币种信息恢复实例，无需再次发行：

```ts
const restored = new Coin(contractTxid);
restored.initialize({
  contractTxid,
  name: "USD Test",
  symbol: "USDT",
  decimal: 6,
  codeScript: firstMintTX.outputs[3].script.toHex(),
  tapeScript: firstMintTX.outputs[4].script.toHex(),
  totalSupply: "1000000000000", // 首次发行时的最小单位数量，1000000 × 10^6
});
```

示例恢复的是首次发行时的状态。已有增发时，从最新发行凭证 Tape 的 `coinTotalSupply` 读取当前累计供应量。`initialize` 只初始化本地实例，不会查询链上数据；传入的信息应来自可信交易。

## 接入提示

- **查询接口**：使用 `API.fetchCoinInfo`、`API.getCoinbalance`、`API.fetchCoinUTXOs` 前，先确认所用索引服务支持新版 Coin；也可自行保存交易和币种信息。
- **附加信息**：`transfer` 的第八参数可附送 TBC，仍传显示单位字符串；`transferWithAdditionalInfo` 的第八参数为 `Buffer`，用于附加备注输出。
- **金额上限**：首次发行、单次增发及 Tape 单个金额槽上限为 `2^63 - 1` 最小单位；超限须拆分，高层方法不会自动拆分超限槽。
- **底层扩展**：`CoinTBC20` 提供 Code/Tape 编解码；合约控制与外部签名使用 `Coin.getUnlockScript` / `Coin.getUnlockScriptWithSignature`，接口见 [类型定义](../index.d.ts)，实现见 [Coin SDK](../lib/contract/coinTbc20.ts)。

离线回归：`npm run test:coin`。可运行示例参见 [生命周期测试](../test/coin/stableCoin.integration.test.cjs)；这些测试不广播交易。
