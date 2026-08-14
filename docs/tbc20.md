# TBC20 使用文档

TBC20 是新的同质化 Token 合约。每个 Token UTXO 由两个相邻输出组成：

- Code：固定 `500 satoshis`，负责所有权和状态迁移验证。
- Tape：固定 `0 satoshis`，保存6个金额槽以及 metadata。

根入口只公开便捷的 `mint`、`transfer`、`merge`。底层 ABI、解锁脚本和合约控制接口不在本文范围内。

## 安装与导入

```bash
npm i tbc-lib-js tbc-contract
```

```ts
import * as tbc from "tbc-lib-js";
import { API, TBC20 } from "tbc-contract";
import type { TBC20AncestorResolver, TBC20BuildResult } from "tbc-contract";

const network = "testnet";
const privateKeyA = tbc.PrivateKey.fromString("YOUR_TESTNET_WIF");
const addressA = privateKeyA.toAddress().toString();
const addressB = "RECIPIENT_ADDRESS";
```

不要在源码中提交真实 WIF。示例中的地址、UTXO 和交易必须替换为自己的测试数据。

## Metadata 与金额精度

创建新 Token 时必须使用精确十进制字符串定义供应量：

```ts
const token = new TBC20({
  name: "Chain Token",
  symbol: "CHN",
  supply: "1000",
  decimal: 6,
});

console.log(token.declaredSupplyRaw); // 1000000000n
```

约束如下：

- `supply` 和 `transfer` 金额必须是字符串，不能传 `number`、科学计数法或带空格的值。
- `decimal` 必须是 `0-18` 的整数，默认值为 `0`。
- 每个 Tape 金额槽、metadata 声明供应量和位置式人类可读金额的 raw 上限为 `2^63-1`。一个 Token 输出的余额是最多6个槽的和，因此聚合余额可以大于该值。
- `name` 必须是非空、NFC 规范化的 UTF-8 字符串。
- `symbol` 必须是无空格的可打印 ASCII 字符串。
- `name` 与 `symbol` 编码后的总字节数不能超过53字节。

`name`、`symbol`、`supply` 是 SDK/indexer metadata。官方 SDK 会在状态迁移中保留这些 Tape extension 字节，但当前锁定脚本不认证其内容，也不把 `supply` 强制为共识发行上限。应用识别 Token 时应使用可信的 Code identity 或规范创世 `txid:vout`，不能只比较名称或符号。

## 通用辅助函数

以下函数把交易输出转换为后续调用需要的 UTXO。不要猜测 Token Code 的输出位置，应读取返回值中的 `tokenOutputs`。

```ts
function outputToUTXO(
  tx: tbc.Transaction,
  outputIndex: number,
): tbc.Transaction.IUnspentOutput {
  const output = tx.outputs[outputIndex];
  if (!output) throw new Error(`missing output ${outputIndex}`);

  return {
    txId: tx.hash,
    outputIndex,
    script: output.script.toHex(),
    satoshis: output.satoshis,
  };
}

function findAddressUTXO(
  tx: tbc.Transaction,
  address: string,
): tbc.Transaction.IUnspentOutput {
  const expectedScript = tbc.Script.buildPublicKeyHashOut(address).toHex();

  for (let outputIndex = tx.outputs.length - 1; outputIndex >= 0; outputIndex -= 1) {
    if (tx.outputs[outputIndex].script.toHex() === expectedScript) {
      return outputToUTXO(tx, outputIndex);
    }
  }

  throw new Error("transaction has no P2PKH change output for this address");
}

function tokenUTXOsFromResult(
  result: TBC20BuildResult,
): tbc.Transaction.IUnspentOutput[] {
  return result.tokenOutputs.map((output) =>
    outputToUTXO(result.transaction, output.codeVout),
  );
}
```

`findAddressUTXO` 只适用于确定存在找零的交易。资金过小时，SDK 可能把小于 dust 的余额计入手续费而不创建找零输出。

## Mint

Mint 会生成两笔链式交易：

1. Source transaction：把原始资金整理成规范创世来源。
2. Genesis transaction：消费 Source 输出并创建第一组 Code + Tape。

```ts
const token = new TBC20({
  name: "Chain Token",
  symbol: "CHN",
  supply: "1000",
  decimal: 6,
});

// API.fetchUTXO 的金额单位是 TBC。它在UTXO不足时可能自动执行合并；
// 需要完全控制资金选择时，应从 fetchUTXOList 返回值中自行选择单个UTXO。
const fundingUTXO = await API.fetchUTXO(privateKeyA, 0.01, network);

const mint = token.mint(
  privateKeyA,
  addressA,
  fundingUTXO,
);

// 两笔交易必须按顺序广播。
const sourceTxid = await API.broadcastTXraw(mint.sourceTxraw, network);
if (sourceTxid.toLowerCase() !== mint.sourceTransaction.hash.toLowerCase()) {
  throw new Error("source transaction id mismatch");
}

const genesisTxid = await API.broadcastTXraw(mint.txraw, network);
if (genesisTxid.toLowerCase() !== mint.transaction.hash.toLowerCase()) {
  throw new Error("genesis transaction id mismatch");
}

console.log("TBC20 Contract ID:", token.contractTxid);
console.log("Genesis token output:", mint.tokenOutputs[0]);
```

`transaction` 和 `txraw` 指 Genesis transaction；`sourceTransaction` 和 `sourceTxraw` 指 Source transaction。默认会执行本地脚本验证，生产代码不要设置 `verify: false`。

### 持久化和恢复 Token 身份

Mint 成功后应保存可信的创世锚点：

```ts
const savedToken = {
  contractTxid: token.contractTxid,
  codeVout: mint.tokenOutputs[0].codeVout,
  codeScript: token.codeScript,
  tapeScript: token.tapeScript,
};
```

进程重启后，可以直接使用已持久化的可信脚本恢复：

```ts
const token = new TBC20({
  codeScript: savedToken.codeScript,
  tapeScript: savedToken.tapeScript,
  contractTxid: savedToken.contractTxid,
});
```

也可以根据可信的创世 `txid:vout` 重新获取：

```ts
const genesis = await API.fetchTXraw(savedToken.contractTxid, network);
if (genesis.hash.toLowerCase() !== savedToken.contractTxid.toLowerCase()) {
  throw new Error("genesis transaction hash mismatch");
}

const code = genesis.outputs[savedToken.codeVout];
const tape = genesis.outputs[savedToken.codeVout + 1];
if (!code || !tape || code.satoshis !== 500 || tape.satoshis !== 0) {
  throw new Error("invalid canonical TBC20 Code/Tape pair");
}

const token = new TBC20({
  codeScript: code.script,
  tapeScript: tape.script,
  contractTxid: savedToken.contractTxid,
});
```

安全边界：`codeScript` 是 SDK 花费时使用的 Token identity 锚点；`tapeScript` 绑定 Tape 长度和 metadata。两者必须来自同一个已认证的相邻 Code/Tape 输出对。`contractTxid` 在当前类中只是信息字段，不能单独完成身份绑定。不要从尚未认证的候选 Token UTXO 中提取脚本，再把该脚本当作可信身份锚点。

如果恢复的 Tape 不包含可解析的规范 metadata，实例没有 `decimal`，因而不能使用接受人类可读金额的位置式 `transfer`。恢复时可以同时提供完整的 `name`/`symbol`/`supply`/`decimal`，SDK 会验证它们与 `tapeScript` 中的 metadata 完全一致。

## 父交易与祖交易证明

每个 Token 输入都必须提供三个位置完全对应的数据：

```text
tokenUTXOs[i]  <->  parentTxs[i]  <->  ancestorResolvers[i]
```

- `tokenUTXOs[i]` 必须指向 Code 输出，下一输出必须是对应 Tape。
- `parentTxs[i]` 是创建该 Code 输出的完整交易，其 hash 必须等于 `tokenUTXOs[i].txId`。
- `ancestorResolvers[i]` 用于按 txid 查找 `parentTxs[i]` 中非零 Tape 金额槽所对应输入花费的直接前序交易。
- resolver 不是完整历史链，也不要求内部交易数组按顺序排列；SDK 会按 hash 查找。
- resolver 可以是 `ReadonlyMap<string, Transaction>`、`Transaction[]` 或同步回调。
- resolver 回调收到小写 txid，不能返回 `Promise`。所有网络请求必须在调用 `transfer` 或 `merge` 前完成。
- 合约内部需要的 `5 - vin` 反向 ABI 映射由 SDK 处理，调用者不要自行反转数组。

生产环境可以提前准备所有父交易和祖交易：

```ts
async function prepareTBC20Proofs(
  tokenUTXOs: readonly tbc.Transaction.IUnspentOutput[],
  network: string,
): Promise<{
  parentTxs: tbc.Transaction[];
  ancestorResolvers: TBC20AncestorResolver[];
}> {
  const parentTxs = await Promise.all(
    tokenUTXOs.map((utxo) => API.fetchTXraw(utxo.txId, network)),
  );
  const ancestorIds = new Set<string>();

  parentTxs.forEach((parent, index) => {
    const utxo = tokenUTXOs[index];
    if (parent.hash.toLowerCase() !== utxo.txId.toLowerCase()) {
      throw new Error(`parentTxs[${index}] hash mismatch`);
    }

    const output = parent.outputs[utxo.outputIndex];
    if (
      !output ||
      output.satoshis !== utxo.satoshis ||
      output.script.toHex().toLowerCase() !== utxo.script.toLowerCase()
    ) {
      throw new Error(`tokenUTXOs[${index}] differs from parent output`);
    }

    // 获取全部parent输入的直接前序交易最简单；SDK只使用非零Tape槽需要的项。
    for (const input of parent.inputs) {
      const txid = (input as any).prevTxId.toString("hex").toLowerCase();
      ancestorIds.add(txid);
    }
  });

  const ancestorMap = new Map<string, tbc.Transaction>();
  for (const txid of ancestorIds) {
    const transaction = await API.fetchTXraw(txid, network);
    if (transaction.hash.toLowerCase() !== txid) {
      throw new Error(`ancestor ${txid} hash mismatch`);
    }
    ancestorMap.set(txid, transaction);
  }

  return {
    parentTxs,
    ancestorResolvers: tokenUTXOs.map(() => ancestorMap),
  };
}
```

零确认链中，API 可能暂时查询不到刚创建的父交易。此时应把本地 `Transaction` 放进数组或 Map，并严格按照父交易在前、子交易在后的顺序广播。

## 交易结构边界

- TBC20 交易版本必须精确为 `10`。
- SDK 生成的当前交易最多6个 vin。位置式便捷接口必须预留1个 fee vin，所以最多使用5个 Token 输入。
- 每个 `parentTxs[i]` 也必须是版本 `10`，且最多6个输入；ancestor 交易必须是版本 `10`，但不受父交易固定6条输入证明的限制。
- 当前交易最多8个逻辑输出组、16个物理 vout。一组 Token 必须是相邻的 Code + Tape，占2个物理 vout；普通 TBC 找零占1个逻辑组和1个物理 vout。

## Transfer

位置式 `transfer` 使用一个私钥签署所有地址控制的 Token 输入和 fee UTXO：

```ts
const tokenUTXOs = getTokenUTXOsFromWalletOrIndexer();
const feeUTXO = await API.fetchUTXO(privateKeyA, 0.01, network);
const { parentTxs, ancestorResolvers } = await prepareTBC20Proofs(
  tokenUTXOs,
  network,
);

const transfer = token.transfer(
  privateKeyA,
  addressB,
  "4.000001",
  tokenUTXOs,
  feeUTXO,
  parentTxs,
  ancestorResolvers,
  {
    tbcChangeAddress: addressA,
  },
);

await API.broadcastTXraw(transfer.txraw, network);
```

约束：

- 每次接受 `1-5` 个 Token 输入；fee 输入紧跟 Token 输入，并额外占用一个 vin。
- `tokenUTXOs`、`parentTxs`、`ancestorResolvers` 长度必须完全一致。
- 所有 Token 输入必须属于同一个 Code identity，并由传入私钥控制。
- Token 找零默认返回第一个 Token 输入的控制地址。
- 单次便捷调用只有一个接收者；需要多个接收者时应构建多笔链式交易，或使用深层高级接口。

当前 `tbc-contract` 的公共 API 尚未提供 TBC20 专用 UTXO 索引接口，`getTokenUTXOsFromWalletOrIndexer()` 代表应用自己维护的 UTXO 列表或可信索引服务。SDK 会再次校验 UTXO、父交易、Code identity、Tape 和祖交易证明，但索引器仍应以规范创世 identity 分类资产。

## Merge

`merge` 每次尽量把 `2-5` 个由同一私钥控制的 Token UTXO 聚合到尽可能少的输出，并返回一笔交易。如果聚合金额无法放入一组受单槽上限约束的 Tape，SDK 会自动拆成多个 Token 输出，实际位置以 `tokenOutputs` 为准。它不会像旧 FT 的 `mergeFT` 一样自动生成多轮交易数组。

```ts
const tokenUTXOs = getTokenUTXOsFromWalletOrIndexer();
if (tokenUTXOs.length < 2 || tokenUTXOs.length > 5) {
  throw new Error("merge requires 2-5 token UTXOs");
}

const feeUTXO = await API.fetchUTXO(privateKeyA, 0.01, network);
const { parentTxs, ancestorResolvers } = await prepareTBC20Proofs(
  tokenUTXOs,
  network,
);

const merge = token.merge(
  privateKeyA,
  tokenUTXOs,
  feeUTXO,
  parentTxs,
  ancestorResolvers,
  {
    controller: addressA,
    tbcChangeAddress: addressA,
  },
);

await API.broadcastTXraw(merge.txraw, network);
```

超过5个 UTXO 时，应用需要分批合并，并把上一轮结果的 Token 输出、父交易和祖交易放入下一轮；每一轮必须先完成本地验证并按顺序广播。

## 完整测试网示例

下面是可独立执行的 Mint → Split Transfer → Merge 零确认链。运行时会实际广播4笔交易，请只使用专用的测试网私钥和小额 UTXO：

```ts
import * as tbc from "tbc-lib-js";
import { API, TBC20 } from "tbc-contract";
import type { TBC20BuildResult } from "tbc-contract";

const network = "testnet";

function outputToUTXO(
  tx: tbc.Transaction,
  outputIndex: number,
): tbc.Transaction.IUnspentOutput {
  const output = tx.outputs[outputIndex];
  if (!output) throw new Error(`missing output ${outputIndex}`);
  return {
    txId: tx.hash,
    outputIndex,
    script: output.script.toHex(),
    satoshis: output.satoshis,
  };
}

function findP2PKHChange(
  tx: tbc.Transaction,
  address: string,
): tbc.Transaction.IUnspentOutput {
  const scriptHex = tbc.Script.buildPublicKeyHashOut(address).toHex();
  for (let vout = tx.outputs.length - 1; vout >= 0; vout -= 1) {
    if (tx.outputs[vout].script.toHex() === scriptHex) {
      return outputToUTXO(tx, vout);
    }
  }
  throw new Error("missing P2PKH change output");
}

function tokenUTXOs(result: TBC20BuildResult) {
  return result.tokenOutputs.map(({ codeVout }) =>
    outputToUTXO(result.transaction, codeVout),
  );
}

async function broadcastChecked(raw: string, expectedTxid: string) {
  const txid = await API.broadcastTXraw(raw, network);
  if (txid.toLowerCase() !== expectedTxid.toLowerCase()) {
    throw new Error(`broadcast txid mismatch: ${txid}`);
  }
}

async function main() {
  const wif = process.env.TBC20_TESTNET_WIF;
  if (!wif) throw new Error("set TBC20_TESTNET_WIF first");

  const ownerKey = tbc.PrivateKey.fromString(wif);
  const ownerAddress = ownerKey.toAddress().toString();
  const token = new TBC20({
    name: "Chain Token",
    symbol: "CHN",
    supply: "1000",
    decimal: 6,
  });

  const fundingUTXO = await API.fetchUTXO(ownerKey, 0.01, network);
  const mint = token.mint(ownerKey, ownerAddress, fundingUTXO);
  await broadcastChecked(mint.sourceTxraw, mint.sourceTransaction.hash);
  await broadcastChecked(mint.txraw, mint.transaction.hash);

  const genesisToken = outputToUTXO(
    mint.transaction,
    mint.tokenOutputs[0].codeVout,
  );
  const split = token.transfer(
    ownerKey,
    ownerAddress,
    "400",
    [genesisToken],
    findP2PKHChange(mint.transaction, ownerAddress),
    [mint.transaction],
    [[mint.sourceTransaction]],
    { tbcChangeAddress: ownerAddress },
  );
  await broadcastChecked(split.txraw, split.transaction.hash);

  // 两个 split Tape 都只有 slot0 非零；slot0 对应 split vin0，
  // 因而两个 resolver 都需要能查到 mint.transaction。
  const splitTokens = tokenUTXOs(split);
  const merged = token.merge(
    ownerKey,
    splitTokens,
    findP2PKHChange(split.transaction, ownerAddress),
    splitTokens.map(() => split.transaction),
    splitTokens.map(() => [mint.transaction]),
    { tbcChangeAddress: ownerAddress },
  );
  await broadcastChecked(merged.txraw, merged.transaction.hash);

  console.log({
    contractTxid: token.contractTxid,
    finalTxid: merged.transaction.hash,
    finalTokenOutputs: merged.tokenOutputs,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

如果接收地址是 `addressB`，接收输出由 B 控制，而 Token 找零仍由 A 控制。两个不同所有者的输出不能使用同一个私钥一起合并。

## 返回值

`transfer` 和 `merge` 返回：

```ts
interface TBC20BuildResult {
  transaction: tbc.Transaction; // 已完成签名的最终交易
  txraw: string;                 // 可直接广播
  feeSatoshis: number;           // 实际支付的矿工费
  tokenOutputs: readonly {
    codeVout: number;
    tapeVout: number;
    amount: bigint;              // raw最小单位
  }[];
}
```

Mint 额外返回：

```ts
interface TBC20MintResult extends TBC20BuildResult {
  sourceTransaction: tbc.Transaction;
  sourceTxraw: string;
  sourceFeeSatoshis: number;
  originalUTXO: {
    txId: string;
    outputIndex: number;
  };
}
```

不要硬编码 Token 输出位置。接收者、Token 找零和 TBC 找零会使 vout 数量变化，应始终使用 `tokenOutputs[].codeVout` 和 `tokenOutputs[].tapeVout`。

## 手续费

SDK 自动按照以下规则预留解锁脚本、计算找零并完成一次真实签名：

```text
requiredFee = max(80, ceil(finalTransactionBytes * 80 / 1000)) satoshis
```

- 交易大小不超过1000字节时，最低手续费为 `80 satoshis`。
- 不接受 `feeSatoshis`、`sourceFeeSatoshis` 或 `genesisFeeSatoshis` 手工覆盖。
- `feeSatoshis` 永远不会低于最终交易所需值。
- DER 签名长度变化或不足 dust 的余额可能使实际手续费略高于公式值。
- Code 输出消耗 `500 satoshis`，Tape 输出为 `0 satoshis`。所有输入的 satoshis 合计必须覆盖所有 Code 输出和矿工费；每个既有 Token Code 输入自带 `500 satoshis`，fee UTXO 为交易提供额外余额，至少补足净新增的 Code 输出成本与矿工费；是否产生 TBC 找零由剩余余额决定。

## 常见错误

| 错误信息 | 原因 | 处理方式 |
| --- | --- | --- |
| `missing ancestor transaction` | resolver 缺少非零 Tape 槽对应的直接前序交易 | 先获取交易并加入 Map 或数组 |
| `utxo txId does not match parentTx` | UTXO 与 `parentTxs[i]` 错位 | 按 Token 输入索引重新排列三个数组 |
| `belongs to a different TBC20 instance` | 输入不属于已加载的 Code identity | 检查可信创世锚点和索引器分类 |
| `tape extension data differs` | metadata/Tape envelope 不一致 | 不要混用不同 Token 或自行修改 Tape |
| `inputs can pay only ...` | fee UTXO 余额不足 | 更换更大的 P2PKH UTXO |
| `current input ... failed local verification` | 签名、父/祖证明或输出状态不一致 | 不要广播，重新检查完整交易链 |
| `txn-mempool-conflict` | 输入已被另一笔交易占用 | 重新获取 UTXO；TBC 不支持 RBF 替换 |

## 广播前检查

1. 网络必须显式传入 `testnet` 或 `mainnet`，测试阶段不要使用默认主网。
2. Mint 必须先广播 Source，再广播 Genesis。
3. 零确认链必须按照父交易在前、子交易在后的顺序广播。
4. 广播返回的 txid 应与本地 `transaction.hash` 一致。
5. 所有 `tokenUTXOs[i]`、`parentTxs[i]`、`ancestorResolvers[i]` 必须一一对应。
6. Token 金额只使用字符串或 `bigint`，不能经过浮点计算。
7. 发生超时或网络错误时，先按本地 txid 查询交易是否已被节点接受，不要盲目重复广播。
8. 应用和索引器应拒绝非规范创世中的同 identity 重复 Code/Tape sibling，或明确以 `contractTxid:vout` 作为资产身份。
