# StableCoin：Coin TBC20 SDK

`stableCoin` 默认创建基于 `coin_tbc20.ct` 的稳定币，发行凭证使用 [TBC721](./tbc721.md)。管理员以 MuSig2 聚合公钥和外部 Schnorr 签名完成首次发行、增发、冻结、解冻。

当前 Coin Code 为 **2981 字节**，解锁脚本采用固定 **123 字段 ABI**。Tape 使用 `TBC20TAPE` 标记，支持区块高度和时间戳锁。普通 FT 的旧解锁脚本和祖交易证明字符串不能用于新 Coin。

本页的构造和签名流程可以离线运行，不会自动广播。现有 `API.fetchCoinInfo`、余额、UTXO 等服务对新 Code/Tape 标记的索引支持尚未验证；不能据此假定服务端已经上线。接入前应确认索引器支持，或者自行保存原始交易与 Coin 元数据。

## 导出与兼容

```ts
import * as tbc from "tbc-lib-js";
import {
  stableCoin,
  stableCoinLegacy,
  CoinTBC20,
  buildUTXO,
  type CoinAncestors,
  type AdminPrepared,
} from "tbc-contract";
```

| 导出 | 用途 |
| --- | --- |
| `stableCoin` | 默认创建新 Coin；初始化旧 Coin Code 后按旧逻辑转账、增发及管理 |
| `stableCoinLegacy` | 显式使用原 FT 实现，包括继续创建旧版本 Coin |
| `CoinTBC20` | 新版 Code/Tape 的严格解析、构造、控制权替换与锁条件检查 |
| `stableCoin.getUnlockScript` | 私钥签名的新 Coin 底层 ABI 构造器 |
| `stableCoin.getUnlockScriptWithSignature` | 外部签名的新 Coin 底层 ABI 构造器 |

新 Code 不会改变已发行旧币的合约身份。旧币的 `FTape`、解锁格式和 `prepreTxData: string[]` 继续保留在 legacy 路径。混合新旧 Coin 输入不能合并为同一种资产。

新发行凭证使用 `TBC721CODE3` 和包含当前完整输入列表的 20 字段解锁 ABI。原 `NFT`、`stableCoinLegacy` 保留；此前以旧 coinNft 发行的 Coin TBC20 也继续使用原凭证增发。已发行币绑定了凭证完整 Code 哈希，不能在增发中更换凭证模板。`coinNftCodeHash` 和 `buildCoinNftTX` 的公开名称保持兼容，其中新版 `stableCoin.buildCoinNftTX` 现在创建 TBC721。

新 Coin 的祖证明参数由 `string[]` 改为 `CoinAncestors`，其他常用方法仍使用原来的位置参数及返回形式。`mergeCoin` 的 `localTX` 参数现在可省略。新实例的 `totalSupply` 是原始最小单位数量；`createCoin`、`mintCoin`、转账及批量收款参数中的金额是显示单位，建议始终传十进制字符串。`decimal` 支持 `0..18`，不接受科学计数法或超出精度的有效小数位。

## 管理员 MuSig2 签名

四个管理员方法返回：

```ts
interface AdminPrepared<R> {
  tx: tbc.Transaction;
  sighashes: { inputIndex: number; sighash: Buffer }[];
  finalize(schnorrSigs64: Buffer[]): R;
}
```

`aggPubkey32` 是 32 字节 x-only 聚合公钥，链上管理员身份为其 `HASH160`。`sighash` 是可直接用于 BIP340 签名的 32 字节消息；`finalize` 接收与 `sighashes` 顺序相同的 64 字节签名，SDK 追加 `0x41` 哈希类型字节。手续费输入使用独立普通私钥进行 ECDSA 签名。

SDK 在输出及费用确定后给出 sighash。获取 `prepared` 后不要修改交易、输入所引用的 UTXO、输出或锁时间；新 Coin 路径会拒绝被修改的签名上下文、无效签名和重复 finalize。

下面演示 2-of-2 或一般 n-of-n 的完整聚合过程，不包含任何密钥。单机函数仅用于测试签名协议：生产流程应让各签名方分别保存私钥和秘密 nonce，并且每个秘密 nonce 只使用一次。

```ts
const { MuSig2, Schnorr } = tbc.crypto;

function buildAdminKeyAgg(keys: tbc.PrivateKey[]) {
  const pubkeys = MuSig2.keySort(
    keys.map(key => MuSig2.pubkeyFromSk(key.toBuffer())),
  );
  const keyAggCtx = MuSig2.keyAgg(pubkeys);
  return { keyAggCtx, aggPubkey32: MuSig2.getAggPubkey(keyAggCtx) };
}

function runMuSigCeremony(
  keys: tbc.PrivateKey[],
  keyAggCtx: tbc.crypto.MuSig2KeyAggCtx,
  aggPubkey32: Buffer,
  messages: Buffer[],
): Buffer[] {
  const secrets = keys.map(key => key.toBuffer());
  const pubkeys = secrets.map(secret => MuSig2.pubkeyFromSk(secret));
  return messages.map(msg => {
    // 第一轮：每个参与者为这一个消息生成新的 nonce 对。
    const nonces = secrets.map((sk, i) => MuSig2.nonceGen({
      pk: pubkeys[i], sk, aggpk: aggPubkey32, msg,
    }));
    const aggnonce = MuSig2.nonceAgg(nonces.map(nonce => nonce.pubnonce));
    const session = MuSig2.buildSession(keyAggCtx, aggnonce, msg);
    // 第二轮：参与者分别签名，协调方合并 partial signatures。
    const partials = secrets.map((sk, i) =>
      MuSig2.partialSign(nonces[i].secnonce, sk, session),
    );
    const signature = MuSig2.partialSigAgg(partials, session);
    if (!Schnorr.verify(msg, signature, aggPubkey32)) {
      throw new Error("MuSig2 aggregate signature failed verification");
    }
    return signature;
  });
}
```

## 首次发行与继续增发

准备发行所需的付款 UTXO 和创建该 UTXO 的完整交易。`fundingTX` 与 `fundingUTXO.txId` 必须匹配，费用 UTXO 必须由 `feeKey` 控制。

```ts
function prepareIssuance(
  aggPubkey32: Buffer,
  feeKey: tbc.PrivateKey,
  holderAddress: string,
  fundingUTXO: tbc.Transaction.IUnspentOutput,
  fundingTX: tbc.Transaction,
) {
  const coin = new stableCoin({
    name: "USD Test", symbol: "USDT", amount: "1000000", decimal: 6,
  });
  const prepared = coin.createCoin(
    aggPubkey32, feeKey, holderAddress, fundingUTXO, fundingTX,
    "Source-chain deposit reference",
  );
  return { coin, prepared };
}

// 管理员分别完成每个消息的签名后：
function finishIssuance(
  coin: stableCoin,
  prepared: AdminPrepared<string[]>,
  signatures64: Buffer[],
) {
  const [issuerRaw, firstMintRaw] = prepared.finalize(signatures64);
  const issuerTX = new tbc.Transaction(issuerRaw);
  const firstMintTX = new tbc.Transaction(firstMintRaw);
  // 沿用旧 SDK 的标识语义：contractTxid 是首笔 mint 交易 ID。
  if (coin.contractTxid !== firstMintTX.id) throw new Error("contract ID mismatch");
  const firstCoinUTXO = stableCoin.buildUTXO(firstMintTX, 3);
  return { issuerRaw, firstMintRaw, issuerTX, firstMintTX, firstCoinUTXO };
}
```

返回交易依赖顺序是 `issuerRaw → firstMintRaw`。如需广播，调用方按这个顺序发送。`coin.contractTxid` 为首次 mint 的交易 ID，后续增发不改变该标识；它与初始发行凭证交易 ID 不同。链上发行权限绑定的是完整 TBC721 Code 的 SHA256。首次 mint 和后续 mint 的输入 `0/1` 花费凭证 Code/Hold，输出 `0/1/2` 延续凭证 Code/Hold/Tape，输出 `3/4` 是新发行 Coin Code/Tape。

增发花费**最新**发行凭证的 Code 和 Hold：

```ts
function prepareNextMint(
  coin: stableCoin,
  aggPubkey32: Buffer,
  feeKey: tbc.PrivateKey,
  recipient: string,
  feeUTXO: tbc.Transaction.IUnspentOutput,
  latestIssuerTX: tbc.Transaction,
  issuerAncestorTX: tbc.Transaction,
) {
  return coin.mintCoin(
    aggPubkey32, feeKey, recipient, "50000", feeUTXO,
    latestIssuerTX, issuerAncestorTX, "Additional deposit reference",
  );
}
```

`issuerAncestorTX` 是 `latestIssuerTX.inputs[0]` 引用的交易。对于第二次 mint，`latestIssuerTX` 就是首次 mint 交易，`issuerAncestorTX` 是初始 issuer 交易。累计供应从最新凭证 Tape 的 `coinTotalSupply` 读取，以原始最小单位相加，并在 finalize 成功后更新实例。SDK 保持管理员 Hold 和供应量元数据；TBC721 本身不强制 Tape 中的供应量计算，也不禁止持有人修改 Hold。

恢复已有新 Coin 时，可从可信 Code/Tape 和发行凭证元数据初始化：

```ts
const restored = new stableCoin(firstMintTX.id);
restored.initialize({
  contractTxid: firstMintTX.id,
  codeScript: firstMintTX.outputs[3].script.toHex(),
  tapeScript: firstMintTX.outputs[4].script.toHex(),
  name: "USD Test", symbol: "USDT", decimal: 6,
  totalSupply: "1000000000000", // raw，等于 1000000 * 10^6
});
```

`initialize` 校验当前 Code 模板和 Tape 结构；调用方仍需保证输入数据来自可信链上交易，并用最新发行凭证获得当前累计供应。

## 祖交易数据

每个 Coin 输入需要 `parentTxs[i]`，即创建该 UTXO 的完整交易。还需要该父交易 Tape 中每个**非零金额槽**对应输入的祖交易原文。槽 `k` 对应父交易 `inputs[k]`，不能删除中间的零槽后重新编号。

`CoinAncestors` 接受以下任意一种新格式：

- 所有输入共享的 `Transaction[]`。
- 所有输入共享的 `ReadonlyMap<string, Transaction>`，键为小写交易 ID。
- 同步函数 `(txid: string) => Transaction | undefined`。
- 按 Coin 输入顺序排列的 resolver 数组，例如 `[input0Ancestors, input1Ancestors]`。

下面的辅助函数使用外部提供的 `fetchTX` 获取原始交易；它不依赖新 Coin 索引接口，也可替换为本地数据库读取。

```ts
async function loadCoinAncestors(
  utxos: tbc.Transaction.IUnspentOutput[],
  parents: tbc.Transaction[],
  fetchTX: (txid: string) => Promise<tbc.Transaction>,
): Promise<Map<string, tbc.Transaction>> {
  const result = new Map<string, tbc.Transaction>();
  for (let i = 0; i < utxos.length; i++) {
    const tape = CoinTBC20.parseTape(parents[i].outputs[utxos[i].outputIndex + 1].script);
    for (let slot = 0; slot < 6; slot++) {
      if (tape.amounts[slot] === 0n) continue;
      const txid = parents[i].inputs[slot].prevTxId.toString("hex").toLowerCase();
      if (!result.has(txid)) result.set(txid, await fetchTX(txid));
    }
  }
  return result;
}
```

离线首笔转账最简单的祖数据是 `new Map([[issuerTX.id, issuerTX]])`，父交易是 `firstMintTX`，Coin UTXO 位于输出 `3`。后续链式交易需要保存已构建的父交易；批量转账及合并方法会自动维护其内部链的祖数据。

新 Coin 不接受 `API.fetchFtPrePreTxData()` 或 `buildFtPrePreTxData()` 返回的旧 proof 字符串。它们只能用于 legacy Coin。

## 转账、批量转账与合并

```ts
const ancestors: CoinAncestors = new Map([[issuerTX.id, issuerTX]]);
const coinUTXO = stableCoin.buildUTXO(firstMintTX, 3);

// holderKey 同时签 Coin 输入及费用输入。
const transferRaw = coin.transfer(
  holderKey, recipientAddress, "10.5", [coinUTXO], feeUTXO,
  [firstMintTX], ancestors,
);

// 下面是替代转账的另一个方案；不能与上面的交易重复花费同一组 UTXO。
const batch = coin.batchTransfer(
  holderKey,
  [{ address: recipientA, amount: "10" }, { address: recipientB, amount: "20" }],
  [coinUTXO], feeUTXO, [firstMintTX], ancestors,
);
```

`transfer` 返回 raw hex；第八参数可附送显示单位的 TBC 数量。`transferWithAdditionalInfo` 的第八参数是追加独立 OP_RETURN 输出的 `Buffer`。`batchTransfer` 每笔最多处理 5 个接收人，超过时返回依赖有序的 `{ txraw }[]`。

`mergeCoin(holderKey, coinUTXOs, feeUTXO, parentTxs, ancestors, localTX?)` 将多笔 UTXO 合并，返回依赖有序的 `{ txraw }[]`；`mergeFT` 是新 Coin 路径上的兼容别名。每笔交易最多 5 个 Coin 输入和 1 个费用输入。Coin 余额取自认证父交易 Tape，显式传入的 `ftBalance` 如不一致会被拒绝。

Coin Tape 有 6 个金额槽，每槽最大 `2^63 - 1`。某个 UTXO 汇总余额若大于此值，不能在后续交易中用单槽表示其全部贡献。SDK 会拒绝单个输出槽的超限分配；调用方应将贡献拆到多个输出，当前高层方法不会自动拆分超限槽。

## 冻结、解冻与成熟锁

```ts
const preparedFreeze = coin.freezeCoinUTXO(
  aggPubkey32, feeKey, 900000, // 区块高度；也可传 Unix 时间戳
  coinUTXOs, feeUTXO, parentTxs, ancestors,
);
const freezeRaw = preparedFreeze.finalize(freezeSignatures64);

// 解冻需要使用上笔冻结后新产生的 UTXO、对应父交易和祖数据。
const preparedThaw = coin.unfreezeCoinUTXO(
  aggPubkey32, feeKey, frozenCoinUTXOs, nextFeeUTXO,
  frozenParentTxs, frozenAncestors,
);
const thawRaw = preparedThaw.finalize(thawSignatures64);
```

锁值是无符号 32 位整数：`0` 表示无锁；`1..499999999` 是区块高度；`500000000..4294967295` 是 Unix 时间戳。普通持有人/合约控制分支要求父 Tape 的锁已被交易 `nLockTime` 满足，且非零锁必须和交易使用相同的高度/时间戳类别。高层转账拒绝把非零高度锁与时间戳锁放进同一笔普通转账。

管理员不受父 Tape 成熟时间限制，可立即延长锁、冻结或解冻；SDK 的管理员交易使用 `nLockTime=0`。所有 Coin 输入，包括管理员输入和无锁输入，都使用非 final sequence。冻结/解冻按原控制权分组保留余额，多个持有人不会被合并到第一个地址；管理员仍需为每个 Coin 输入提供一个签名。

普通转账在满足输入锁后，输出 Coin 的锁重置为 `0`。脚本验证只说明交易声明的 `nLockTime` 满足合约；交易能否立即进入内存池/区块还取决于当时链状态。

Tape 长度固定为 `S`（`66..127`）：金额区从偏移 `3` 开始共 `48` 字节；元数据位于偏移 `51..S-16`；锁字段头 `04` 位于 `S-15`，锁值为 `S-14..S-11` 的 4 字节小端整数；最后是 `09` 和 `TBC20TAPE`。名称、符号和精度的 push 编码合计必须放进最多 61 字节的元数据区。

## 合约控制与底层构造

合约控制权仍是 `HASH160(SHA256(controllerCode)) || 01`，地址控制权为地址的 20 字节 HASH160 加 `00`。`CoinTBC20.replaceController` 保持 Coin 身份不变；改变管理员、发行凭证或固定 Tape 长度会改变 Coin 身份。

合约控制的花费必须同时包含正在花费的控制合约输入，并通过 `contractController` 指明其来源交易和当前输入位置。高级调用方可以使用：

```ts
const unlock = stableCoin.getUnlockScript({
  currentTx: tx,
  inputIndex: coinVin,
  preTx: parentCoinTX,
  preTxVout: coinVout,
  ancestorTransactions: ancestors,
  outputGroups, // 顺序覆盖每个物理输出；Coin 使用 {codeVout, tapeVout}
  privateKey: signingKey,
  contractController: {
    transaction: controllerParentTX,
    currentInputIndex: controllerVin,
  },
});
```

在所有输入、输出、sequence、`nLockTime` 和费用确定后再构造签名；如使用会重新计算找零的交易 API，应通过回调重新生成解锁脚本。外部签名调用 `getUnlockScriptWithSignature`，将 `privateKey` 替换为 `signature` 与 `publicKey`；签名必须含 `0x41`。

新 Coin 上的旧 `getFTunlock`、`getFTunlockSwap`、`getFTmintCode`、`MintFT` 和弃用的 `transferContract` 会拒绝调用。请使用上述 Coin ABI 或 `createCoin` / `mintCoin`。

## 本地回归

```sh
npm run test:coin
```

该命令构建 SDK 后运行 `test/coin/*.test.cjs` 和 `test/coinTbc20.local.test.cjs`，覆盖新的 ABI、Code/Tape 编码与离线签名流程，不访问链或广播交易。旧 `test/stableCoin.schnorr.test.ts` 是在线操作示例，包含广播调用，不是本命令的测试入口。

真实测试网覆盖和当前上线阻项见 [2026-09-16 测试网验收报告](./StableCoin测试网验收-20260916.md)。确认后的新版资产目前仍无法通过测试网稳定币索引查询；SDK 会保留后端错误码，金额接口统一返回原子单位 `bigint`。索引返回的零余额不能替代对已确认交易的核对。
