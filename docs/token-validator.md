# TokenValidator 调用文档

`TokenValidator` 是协议中立的已上链 Token 输出校验入口。调用方不需要预先判断交易使用 TBC20 还是旧版 FT；校验器会扫描整笔交易并自动识别协议与版本。

## 1. 支持范围

当前支持：

- TBC20 v1；
- 普通 FT v1；
- 普通 FT v2；
- 普通 FT v3；
- 普通 FT v4，包括 early 2012B 和 current 2076B Code 模板。

一笔交易的 Token 输出及其实际选中来源只能属于同一个 `family + version`。同一版本可以同时迁移多个不同 identity。

```ts
type TokenProtocolDescriptor =
  | Readonly<{ family: "TBC20"; version: 1 }>
  | Readonly<{ family: "FT"; version: 1 | 2 | 3 | 4 }>;
```

StableCoin 的授权增发和血统边界与普通 FT 不同，当前不在支持范围内。当它是交易中唯一识别出的 Token 协议时，会返回 `INVALID / UNSUPPORTED_TOKEN_PROTOCOL`；若同时出现其他 Token 协议，则返回 `INVALID / MIXED_TOKEN_PROTOCOLS`。

## 2. 安装与导入

```bash
npm install tbc-contract tbc-lib-js
```

CommonJS：

```js
const {
  API,
  TokenValidator,
} = require("tbc-contract");
```

TypeScript：

```ts
import {
  API,
  TokenValidator,
  type TokenValidationResult,
} from "tbc-contract";
```

下文出现的 `await` 调用应放在业务代码的 `async` 函数中；ESM 项目也可以使用 top-level await。

## 3. 校验整笔交易

`transaction` 可以是：

- `tbc.Transaction`；
- raw transaction hex string；
- raw transaction `Buffer`。

```js
const report = await TokenValidator.validateOnChainTransaction({
  transaction,
  network: "mainnet",
});
```

校验器会自动完成：

1. 扫描当前交易全部物理输出；
2. 识别 TBC20 或普通 FT 的 Code/Tape 与版本；
3. 拒绝 Token 输出及实际选中来源中的协议或 FT 版本混合；
4. 建立六槽金额矩阵，并对每个正金额来源 vin 检查金额守恒；
5. 检查输出 identity 是否存在对应输入来源；
6. 检查六槽全零输出的同 identity 输入见证；
7. 通过 `API.fetchTXraw` 获取必需父交易与祖交易；
8. 验证父到祖的两级血统。

## 4. 只有 txid 时如何调用

先获取创建目标输出的完整交易，再交给 `TokenValidator`：

```js
const { API, TokenValidator } = require("tbc-contract");

async function validateTokenTransaction(txid, network = "mainnet") {
  const transaction = await API.fetchTXraw(txid, network);

  return TokenValidator.validateOnChainTransaction({
    transaction,
    network,
  });
}

const report = await validateTokenTransaction(
  "创建Token输出的交易txid",
  "mainnet",
);

console.log(report.status);
console.log(report.protocol);
```

根交易必须由调用方取得并传入；父交易和祖交易由校验器根据输入 outpoint 自动查询。

## 5. 校验指定 vout

金额守恒和血统属于交易级关系，因此不能只校验单个 locking script。正确方式是先校验创建该输出的完整交易，再从报告中定位目标 `vout`。

```js
function findTokenOutputGroup(report, targetVout) {
  return report.outputGroups.find((group) =>
    (group.kind === "TBC20" || group.kind === "FT") &&
    (group.codeVout === targetVout || group.tapeVout === targetVout)
  );
}

async function inspectTokenVout(txid, targetVout, network = "mainnet") {
  const report = await validateTokenTransaction(txid, network);

  if (report.status !== "VALID") {
    console.error("交易未通过校验", report.status, report.issues);
    return;
  }

  const group = findTokenOutputGroup(report, targetVout);

  if (!group) {
    console.log("该vout不是已识别的Token Code/Tape输出");
    return;
  }

  console.log({
    protocol: group.protocol,
    kind: group.kind,
    codeVout: group.codeVout,
    tapeVout: group.tapeVout,
    identity: group.identity,
    balanceRaw: group.balanceRaw.toString(10),
    slots: group.slots.map((amount) => amount.toString(10)),
  });
}

inspectTokenVout("创建Token输出的交易txid", 2, "mainnet")
  .catch(console.error);
```

`targetVout` 可以是 Code vout，也可以是其紧邻的 Tape vout。

## 6. 自动识别协议

当结果为 `VALID` 时，`report.protocol` 表示本次状态迁移使用的协议：

```js
if (report.status === "VALID") {
  switch (report.protocol.family) {
    case "TBC20":
      console.log("TBC20 v1");
      break;

    case "FT":
      console.log(`FT v${report.protocol.version}`);
      break;
  }
}
```

每个已解析 Token 输入、Token 输出组和资产流也包含对应的 `protocol` 字段。

## 7. 处理 VALID、INVALID 与 UNKNOWN

```js
const report = await TokenValidator.validateOnChainTransaction({
  transaction,
  network: "mainnet",
});

switch (report.status) {
  case "VALID":
    // 必需结构、金额、identity闭包和两级血统均通过。
    acceptTokenOutputs(report);
    break;

  case "INVALID":
    // 已发现确定性错误，不能靠重试变成合法交易。
    console.error(report.issues);
    break;

  case "UNKNOWN":
    // 必需父交易或祖交易暂时不可用，不能当作有效。
    scheduleRetry(report);
    break;
}
```

状态优先级固定为：

```text
INVALID > UNKNOWN > VALID
```

一个来源查询失败不会阻止校验其他已取得的来源。如果另一分支存在确定性错误，最终仍返回 `INVALID`。

## 8. 断言式接口

如果调用流程希望所有非 `VALID` 结果直接抛错，可以使用：

```js
try {
  const report = await TokenValidator.assertValidOnChainTransaction({
    transaction,
    network: "mainnet",
  });

  console.log("校验通过", report.protocol);
} catch (error) {
  const report = error && typeof error === "object"
    ? error.report
    : undefined;

  if (report) {
    console.error("校验失败", report.status, report.issues);
  } else {
    throw error;
  }
}
```

只有同时满足下面两个条件才会正常返回：

```text
report.status == VALID
report.kind == TRANSITION
```

## 9. 主要报告字段

`TokenValidationResult` 已包含所有子字段的完整类型。输入、输出组等明细类型不需要单独导入；需要给辅助函数标注类型时，可以从结果类型中推导：

```ts
type TokenInput = TokenValidationResult["inputs"][number];
type TokenOutputGroup = TokenValidationResult["outputGroups"][number];
type TokenAssetFlow = TokenValidationResult["assets"][number];
type TokenAncestorEdge = TokenValidationResult["ancestorEdges"][number];
```

`kind` 的运行时取值为 `TRANSITION`、`NON_TOKEN` 或 `UNDETERMINED`。

常用字段：

| 字段 | 含义 |
| --- | --- |
| `protocol` | 自动识别出的唯一 Token family 与 version |
| `issues` | 错误或 warning，包含阶段、vin、vout、slot、txid、identity 等定位信息 |
| `inputs` | 实际解析过的来源输入；无关输入可以保持 `NOT_REQUESTED` |
| `outputGroups` | 按协议规则恢复的逻辑输出组 |
| `assets` | 按 identity 汇总的输入、输出 raw amount |
| `matrix` | Token 输出的六槽金额矩阵 |
| `ancestorEdges` | 已验证的父到祖血统边 |
| `source` | 本次 API 查询、解析和必需来源 txid 记录 |

### bigint 与 JSON

余额、金额槽和资产汇总均使用 `bigint`，不要转换为 JavaScript `number`。

```js
console.log(report.assets[0].inputRaw.toString(10));
console.log(report.assets[0].outputRaw.toString(10));
```

报告提供了 `toJSON()`，所以可以直接序列化；所有 `bigint` 会转换成十进制字符串：

```js
const json = JSON.stringify(report, null, 2);
console.log(json);
```

## 10. policy

默认使用 `strict`：

```js
const report = await TokenValidator.validateOnChainTransaction({
  transaction,
  network: "mainnet",
  policy: {
    preset: "strict",
  },
});
```

如果业务只希望把同 identity 的 Tape metadata envelope 差异降为 warning，可以使用：

```js
const report = await TokenValidator.validateOnChainTransaction({
  transaction,
  network: "mainnet",
  policy: {
    preset: "relaxed-metadata",
  },
});
```

`relaxed-metadata` 不会放宽以下规则：

- Code/Tape artifact 与配对结构；
- 协议和版本一致性；
- 六槽金额解析与逐 vin 守恒；
- identity 闭包；
- 零余额见证；
- 父祖血统。

## 11. 常见错误码

| 错误码 | 含义 |
| --- | --- |
| `NO_TOKEN_OUTPUT` | 当前交易没有受支持的 Token 输出 |
| `UNSUPPORTED_TOKEN_PROTOCOL` | 识别到 StableCoin 等已知但未支持的协议 |
| `MIXED_TOKEN_PROTOCOLS` | 当前 Token 输出或实际选中来源混合了协议或版本 |
| `INVALID_TOKEN_CODE` | FT Code 候选不匹配已登记模板 |
| `INVALID_TOKEN_TAPE` | FT Tape 长度、格式或金额槽非法 |
| `TOKEN_CODE_WITHOUT_TAPE` | FT Code 后没有相邻 Tape |
| `ORPHAN_TOKEN_TAPE` | 出现没有对应 Code 的 FT Tape |
| `AMOUNT_SLOT_WITHOUT_INPUT` | 非零金额槽指向不存在的 vin |
| `AMOUNT_SLOT_WITHOUT_TOKEN_INPUT` | 非零金额槽对应的输入不是同协议 Token 来源 |
| `OUTPUT_INPUT_IDENTITY_MISMATCH` | 输出 identity 与对应输入 identity 不一致 |
| `VIN_AMOUNT_NOT_CONSERVED` | 某个 vin 的父余额与当前输出列总额不相等 |
| `OUTPUT_IDENTITY_WITHOUT_INPUT` | 输出 identity 没有对应输入来源 |
| `ZERO_IDENTITY_WITNESS_UNRESOLVED` | 全零 identity 仍可能有来源，但必需 API 数据不可用 |
| `ZERO_IDENTITY_WITNESS_CAPACITY_EXCEEDED` | 剩余 vin 数不足以分别见证所有全零 identity |
| `PARENT_FETCH_FAILED` | 必需父交易无法通过 API 获取 |
| `ANCESTOR_FETCH_FAILED` | 必需祖交易无法通过 API 获取 |
| `ANCESTOR_IDENTITY_MISMATCH` | slot1..5 的祖 identity 不一致 |
| `ORIGINAL_UTXO_MISMATCH` | slot0 祖 identity 不同且 OriginalUTXO 不匹配 |

完整错误码以 `TokenValidationErrorCode` 类型为准。

## 12. 数据源和血统边界

校验器遵循以下产品信任约定：

1. 调用方保证传入的根交易已经上链，且根交易输入脚本已经由节点成功执行；
2. 父交易和祖交易只使用现有 `API.fetchTXraw(txid, network)`；
3. API 成功返回 `tbc.Transaction`，即完全信任它是查询 txid 对应的已上链交易；
4. 不重算或比较父交易、祖交易 txid；
5. 同一请求内相同查询 txid 只调用一次。

血统只检查两级：

```text
当前交易
  -> 当前输入引用的父 Code/Tape
     -> 父 Tape 非零 slot[k] 对应 parent vin[k] 引用的祖输出
        -> 到此停止
```

不会继续请求曾祖交易，也不会回溯 Genesis。

校验器采用输出驱动查询：正金额槽对应的输入必须解析；全零输出只在需要 identity 见证时搜索其他输入。与输出无关的零余额输入可以保持 `NOT_REQUESTED`。调用方应保证真实交易不会在这些未解析输入中混入另一个 Token 协议或版本。

## 13. 明确不检查的内容

`TokenValidator` 不会：

- 执行当前、父或祖交易的 `verifyScript`；
- 计算原生 TBC 输入输出总额、交易手续费或费率；
- 检查确认数、区块归属、active chain 或 Merkle proof；
- 检查输出当前是否仍未花费；
- 验证 Genesis、Mint 唯一性或历史总供应；
- 验证 StableCoin 状态迁移；
- 签名、修改、seal 或广播交易。

Code/Tape 的 `500/0 satoshis` 仍会检查，因为它属于当前 canonical Token 输出结构，不是手续费校验。

## 14. 完整调用示例

下面的函数接收创建交易 txid 与目标 vout，返回协议和 raw Token 余额：

```js
const { API, TokenValidator } = require("tbc-contract");

async function validateTokenOutput({
  txid,
  vout,
  network = "mainnet",
}) {
  const transaction = await API.fetchTXraw(txid, network);
  const report = await TokenValidator.validateOnChainTransaction({
    transaction,
    network,
  });

  if (report.status !== "VALID") {
    return {
      ok: false,
      status: report.status,
      issues: report.issues,
      report,
    };
  }

  const output = report.outputGroups.find((group) =>
    (group.kind === "TBC20" || group.kind === "FT") &&
    (group.codeVout === vout || group.tapeVout === vout)
  );

  if (!output) {
    return {
      ok: false,
      status: "INVALID",
      reason: "TARGET_VOUT_IS_NOT_TOKEN",
      message: `vout ${vout} is not a recognized Token Code/Tape output`,
      report,
    };
  }

  return {
    ok: true,
    status: "VALID",
    protocol: output.protocol,
    identity: output.identity,
    codeVout: output.codeVout,
    tapeVout: output.tapeVout,
    balanceRaw: output.balanceRaw.toString(10),
    slotsRaw: output.slots.map((amount) => amount.toString(10)),
    report,
  };
}

async function main() {
  const result = await validateTokenOutput({
    txid: "创建Token输出的交易txid",
    vout: 0,
    network: "mainnet",
  });

  if (result.ok) {
    console.log("Token协议", result.protocol);
    console.log("Token identity", result.identity);
    console.log("raw余额", result.balanceRaw);
  } else {
    console.error(
      "校验失败",
      result.status,
      result.issues ?? result.message,
    );
  }
}

main().catch(console.error);
```

`TARGET_VOUT_IS_NOT_TOKEN` 是这个调用示例定义的业务返回原因，不属于 `TokenValidationErrorCode`。

这里返回的是最小单位 raw amount 字符串。若需要展示人类可读金额，应结合该 Token 的 decimal 元数据使用字符串算法转换，不要使用浮点数。
