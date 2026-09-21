# PoolNFT 3.0 开发指南

PoolNFT 3.0 为 `TBC20 + FTLPTBC20` 提供建池、添加/移除流动性、双向兑换、LP 转移和 LP 解锁接口，支持普通池、公钥哈希白名单池，以及这两类池的 LP 锁仓版本。底层 FT 与 LP 是不同资产，不能用旧 FT/FTLP 替代。

SDK 负责离线构造、报价、签名和逐输入脚本验证；交易查询、UTXO 选择、广播和链上状态同步由应用负责。下文先提供公共辅助代码，再给出各功能的完整函数，最后用一个入口串起完整生命周期。

## 1. 阅读与运行方式

| 需求 | 章节 | 主要接口 |
| --- | --- | --- |
| 准备交易、签名器、金额 | [公共代码](#3-公共代码) | `privateKeySigner` |
| 配置普通/白名单/锁仓池 | [池配置](#4-配置四种池) | `new PoolNFT3` |
| 创建池、首次注入 | [建池](#5-创建池)、[首次加池](#6-首次添加流动性) | `mintPoolNFT`、`addLP` |
| 按 TBC 或 FT 预算加池 | [继续加池](#7-按预算继续添加流动性) | `quoteAddLP`、`addLP` |
| TBC 换 FT、FT 换 TBC | [兑换](#8-双向兑换) | `swapFT`、`swapTBC` |
| 撤出部分或全部流动性 | [撤池](#9-移除流动性) | `quoteRemoveLP`、`removeLP` |
| LP 转账、合并、解锁 | [LP 操作](#10-lp-转移合并与解锁) | `transferLP`、`unlockLP` |
| 恢复池、检查 LP 归属 | [状态读取](#11-恢复池与读取状态) | `fromPool`、`decodePoolTape`、`FTLPTBC20` |
| 手续费、钱包签名、本地验证 | [费用](#12-手续费)、[签名](#13-外部签名)、[验证](#14-本地验证与串行广播) | `prepare*`、`finalize` |
| 跑通完整流程 | [完整入口](#15-完整生命周期入口) | 串联上述用例 |

以下 **所有 TypeScript 代码块按顺序放入同一个 `pool3-examples.ts` 文件**，共用第 3 节的导入和辅助函数。每个业务函数都显式接收输入，方便直接抽取到应用。只有第 15 节入口会执行生命周期；广播函数需要应用显式调用。

使用支持 BigInt 的 Node.js 环境（例如 Node.js 22），安装依赖：

```sh
npm install tbc-lib-js tbc-contract
npm install --save-dev typescript @types/node
```

编译及运行：

```sh
npx tsc pool3-examples.ts --target ES2022 --module Node16 --moduleResolution Node16 --strict --skipLibCheck --outDir dist
node dist/pool3-examples.js
```

需要准备环境变量 `POOL3_WIF`（示例中的资金、FT、LP 持有人私钥），以及 `pool3-inputs.json`。白名单版本还需要 `POOL3_CONTROLLER_WIF`。私钥仅从环境读取，不写入交易文件。

输入文件格式如下，尖括号内容须替换为真实数据：

```json
{
  "ftGenesisTxid": "<可信 TBC20 创世交易 txid>",
  "funding": { "txId": "<资金父交易 txid>", "outputIndex": 0 },
  "userFT": { "txId": "<用户 FT 父交易 txid>", "outputIndex": 0 },
  "transactions": [
    "<完整父交易 raw hex>",
    "<FT 创世交易 raw hex>",
    "<其他祖先交易 raw hex>"
  ]
}
```

`transactions` 包含上述引用的交易及构造所需的祖先图。示例入口投入 `100 TBC` 和 `200_000_000` 个 FT 最小单位，随后两次加池；资金 UTXO 建议准备至少 `150 TBC`，用户 FT UTXO 至少准备 `300_000_000` 个最小单位。两者均须属于 `POOL3_WIF` 对应地址，且是不同的未花费输出。底层 FT 的显示精度由应用确定。

输入数据可以来自应用缓存，也可以使用 `API.fetchTXraw(txid, network)` 按真实 txid 查询。这里不依赖索引器自动发现或合并 UTXO。

## 2. 金额、资产与输入约定

| 项目 | 单位/约束 |
| --- | --- |
| TBC 金额 | `bigint`，单位 sat；`1 TBC = 1_000_000n sat` |
| FT、LP 金额 | `bigint`，原始最小单位，不传浮点展示金额 |
| Pool Tape 标量、FT/LP 金额槽 | `0..2^63-1` |
| 真实 TBC 输出 | 底层库用 `number`，SDK 拒绝超出 `Number.MAX_SAFE_INTEGER` 的值 |
| Pool Code 保留金额 | `1500 sat`；储备 TBC 同时保存在该输出 |
| FT/LP Code + Tape | 紧邻的 `500 sat + 0 sat` 输出 |
| FT/LP Tape 长度 | 普通池 `61..127` 字节，锁仓池 `66..127` 字节 |
| 普通 TBC 付款和找零 | 至少 `10 sat`；具体网络接收还取决于节点策略 |

首次发行 LP 的原始量等于注入的 TBC sat 数，LP 显示精度建议为 6，与底层 FT 显示精度无关。构造器需要可信 TBC20 创世交易，Code/Tape 位于 vout0/1，不能用普通转账交易代替。FT 的 metadata/extension 原样保留；锁仓字段只写入 LP Tape。61 字节 FT Tape 不适用于锁仓池。

输入引用中的 `parentTx` 是创建被花费输出的完整交易，`outputIndex` 是 **父交易的 vout**。Tape 是紧邻 Code 的证明数据，本身不作为输入花费。FT/LP 的 `ancestors` 可使用 Map、交易数组或同步函数 `(txid) => Transaction | undefined`，必须能找到父 Tape 非零槽所对应的真实祖先交易；LP 首次发行还涉及 Pool 发行来源。

Pool 的 `ancestorTx` 必须是 `parentTx.vin0` 的真实父交易；首次加池时它是 mint 的 Source。四种 Pool 操作固定输入位置如下：

| 方法 | vin0 | vin1 | vin2 | vin3 |
| --- | --- | --- | --- | --- |
| `addLP` | Pool | 用户 FT | 池 FT | 资金 |
| `removeLP` | Pool | 用户 LP | 池 FT | 资金 |
| `swapFT` | Pool | 资金 | 池 FT | 无 |
| `swapTBC` | Pool | 用户 FT | 池 FT | 资金 |

每项 Pool 操作只接受一个用户资产输入和一个资金输入（`swapFT` 不需要用户 FT）。余额分散时先显式整理。池控 FT 也需要签名，其资产控制权由 vin0 的 Pool 证明；这个签名与白名单 Controller 签名分别属于不同输入。

## 3. 公共代码

本节实现精确金额换算、真实交易加载、祖先缓存、按输出角色取币和结果保存。示例默认由同一个持有人管理资金、FT、LP；实际应用可为每个输入传入各自签名器。

```ts
import * as tbc from 'tbc-lib-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import {
  API, PoolNFT3, FTLPTBC20, privateKeySigner, decodePoolTape,
  resolveSwapFeePolicy, calculateSwapFees, deriveFeeRecipient,
  validatePool3Transaction,
} from 'tbc-contract';
import type {
  PoolAuthorization, Pool3AssetInput, Pool3AssetOutput,
  Pool3BuildResult, Pool3FeePolicy, Pool3MintResult,
  Pool3OperationOptions, Pool3SignedInput, Pool3SigningIdentity,
  Pool3SigningRequest, Pool3SwapFTOptions,
} from 'tbc-contract';

type Outpoint = { txId: string; outputIndex: number };
type Variant = 'public' | 'public-timelocked'
  | 'controller' | 'controller-timelocked';

interface InputFile {
  ftGenesisTxid: string;
  funding: Outpoint;
  userFT: Outpoint;
  transactions: string[];
}

interface Context {
  history: Map<string, tbc.Transaction>;
  signer: Pool3SigningIdentity;
  controllerSigner?: Pool3SigningIdentity;
  address: string;
}

const minerFee: Pool3FeePolicy = {
  satoshisPerKb: 80n, minimumFeeSat: 80n, changeDustSat: 10n,
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

// 示例：toRaw('1.25', 6) === 1_250_000n；全程不经过浮点金额。
function toRaw(human: string, decimals: number): bigint {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error('示例换算器支持 0–18 位小数');
  }
  if (!/^\d+(\.\d+)?$/.test(human)) throw new Error('金额须为非负十进制字符串');
  const [whole, fraction = ''] = human.split('.');
  if (fraction.length > decimals) throw new Error('小数位超出资产精度');
  return BigInt(whole + fraction.padEnd(decimals, '0'));
}

function json(value: unknown): string {
  return JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
}

function transaction(ctx: Context, txid: string): tbc.Transaction {
  const tx = ctx.history.get(txid);
  if (!tx || tx.id !== txid) throw new Error(`缺少可信交易 ${txid}`);
  return tx;
}

function signedInput(ctx: Context, ref: Outpoint): Pool3SignedInput {
  const parentTx = transaction(ctx, ref.txId);
  if (!Number.isSafeInteger(ref.outputIndex) || ref.outputIndex < 0
      || !parentTx.outputs[ref.outputIndex]) throw new Error('无效的输出索引');
  return { parentTx, outputIndex: ref.outputIndex, signer: ctx.signer };
}

function assetInput(ctx: Context, ref: Outpoint): Pool3AssetInput {
  return { ...signedInput(ctx, ref), ancestors: ctx.history };
}

function loadInputs(path = 'pool3-inputs.json') {
  const input = JSON.parse(readFileSync(path, 'utf8')) as InputFile;
  const key = tbc.PrivateKey.fromWIF(requiredEnv('POOL3_WIF'));
  const ctx: Context = {
    history: new Map(), signer: privateKeySigner(key),
    address: key.toAddress().toString(),
  };
  for (const raw of input.transactions) {
    const tx = new tbc.Transaction(raw);
    ctx.history.set(tx.id, tx);
  }
  if (process.env.POOL3_CONTROLLER_WIF) {
    ctx.controllerSigner = privateKeySigner(
      tbc.PrivateKey.fromWIF(process.env.POOL3_CONTROLLER_WIF),
    );
  }
  return {
    ctx,
    ftGenesisTx: transaction(ctx, input.ftGenesisTxid),
    funding: signedInput(ctx, input.funding),
    userFT: assetInput(ctx, input.userFT),
  };
}

// 保存的是待广播交易和本地构造结果，不表示已经被节点接收。
function remember(ctx: Context, label: string, result: Pool3BuildResult): void {
  if (!result.validation.success) throw new Error(json(result.validation));
  ctx.history.set(result.txid, result.transaction);
  mkdirSync('pool3-output', { recursive: true });
  writeFileSync(`pool3-output/${label}.json`, json({
    txid: result.txid, txraw: result.txraw, feeSat: result.feeSat,
    reservedBytes: result.reservedBytes, changeVout: result.changeVout,
    consumedOutpoints: result.consumedOutpoints,
    layout: result.layout, quote: result.quote, validation: result.validation,
    poolCodeHash: result.nextState?.poolCodeHash.toString('hex'),
  }));
  console.log(label, result.txid, `矿工费 ${result.feeSat} sat`);
}

function assetFrom(
  ctx: Context, result: Pool3BuildResult,
  role: Pool3AssetOutput['role'], signer = ctx.signer,
): Pool3AssetInput {
  const output = result.layout.assetOutputs.find(item => item.role === role);
  if (!output) throw new Error(`${result.layout.operation} 没有 ${role} 输出`);
  return {
    parentTx: result.transaction, outputIndex: output.codeVout,
    signer, ancestors: ctx.history,
  };
}

function fundingFrom(ctx: Context, result: Pool3BuildResult): Pool3SignedInput {
  if (result.changeVout === undefined) {
    throw new Error('没有 TBC 找零；请另选一个足额、未花费的资金 UTXO');
  }
  return { parentTx: result.transaction, outputIndex: result.changeVout, signer: ctx.signer };
}

function operationInputs(
  ctx: Context, pool: PoolNFT3, current: Pool3BuildResult,
  funding: Pool3SignedInput,
): Pool3OperationOptions {
  const parentTx = current.transaction;
  const state = pool.readPoolState(parentTx);
  const ancestorTx = transaction(ctx, parentTx.inputs[0].prevTxId.toString('hex'));
  const controlled = state.tape.withSwapHashLock;
  if (controlled && !ctx.controllerSigner) throw new Error('白名单池需要 Controller 签名器');
  return {
    pool: { parentTx, ancestorTx },
    poolFT: assetFrom(ctx, current, 'pool-ft'),
    funding, feePolicy: minerFee,
    ...(controlled ? { controllerSigner: ctx.controllerSigner } : {}),
  };
}

// 示例允许报价输出减少最多 50 bps（0.5%），实际容差由业务决定。
function minimumOut(quotedRaw: bigint, slippageBps = 50n): bigint {
  if (slippageBps < 0n || slippageBps >= 10_000n) throw new Error('滑点范围无效');
  const minimum = quotedRaw * (10_000n - slippageBps) / 10_000n;
  if (minimum <= 0n) throw new Error('成交量太小，无法设置有效最小输出');
  return minimum;
}
```

`assetFrom` 必须根据 `layout.assetOutputs` 的角色选择输出；找零可能不存在，也会改变后续 vout。`fundingFrom` 假定资金找零回到 `ctx.signer` 的地址；如果业务指定其他 `changeAddress`，下一笔应使用实际持有人的签名器。

## 4. 配置四种池

```ts
function createPool(
  ftGenesisTx: tbc.Transaction, variant: Variant,
  controllerPublicKeys: readonly (string | Buffer)[] = [], lpPlan = 1,
): PoolNFT3 {
  const controlled = variant === 'controller' || variant === 'controller-timelocked';
  const timelocked = variant === 'public-timelocked' || variant === 'controller-timelocked';
  const authorization: PoolAuthorization = controlled
    ? {
        kind: 'controller',
        controllerPubKeyHashes: controllerPublicKeys.map(publicKey => {
          const bytes = typeof publicKey === 'string' ? Buffer.from(publicKey, 'hex') : publicKey;
          return tbc.crypto.Hash.sha256ripemd160(bytes).toString('hex');
        }),
      }
    : { kind: 'public' };
  return new PoolNFT3({
    ftGenesisTx, authorization,
    lp: { kind: timelocked ? 'timelocked' : 'plain' }, lpPlan,
  });
}
```

| `variant` 参数 | authorization | LP 模板 | 每次 Pool 操作所需额外签名 |
| --- | --- | --- | --- |
| `public` | `public` | `plain` | 无 |
| `public-timelocked` | `public` | `timelocked` | 无 |
| `controller` | `controller` | `plain` | 一个白名单成员 |
| `controller-timelocked` | `controller` | `timelocked` | 一个白名单成员 |

白名单支持 1–5 个不同的完整 `HASH160(publicKey)`，每项为 20 字节、40 位 hex。SDK 复制排序后编码，不修改原数组。这是任意一个成员签名即可的 1-of-N 授权。`addLP/removeLP/swapFT/swapTBC` 需要 `controllerSigner`；`transferLP/unlockLP` 不消费 Pool，只需要 LP 持有人与资金输入签名。

白名单写入 Pool Code，不在 Tape 中。Pool 配置、底层资产身份、白名单与 LP 模板在建池时确定，不能通过普通操作切换。`serviceFeeRate` 可省略；若提供，必须与 `lpPlan` 对应的总费率一致。

实例保存配置，不绑定唯一 Pool outpoint。同配置的多个池可以共用实例，应用仍应保存业务预期的 Pool Code hash 和最新 outpoint。

## 5. 创建池

```ts
async function mintPool(
  ctx: Context, pool: PoolNFT3, funding: Pool3SignedInput,
): Promise<Pool3MintResult> {
  const result = await pool.mintPoolNFT({ funding, feePolicy: minerFee });
  ctx.history.set(result.source.txid, result.source.transaction);
  mkdirSync('pool3-output', { recursive: true });
  writeFileSync('pool3-output/00-source.json', json({
    txid: result.source.txid, txraw: result.source.txraw,
    validation: result.source.validation,
  }));
  remember(ctx, '01-pool-genesis', result);
  console.log('Pool Code hash:', result.nextState!.poolCodeHash.toString('hex'));
  return result;
}
```

返回的 `transactions` 按 `Source → Genesis` 排序。Genesis 输出为 vout0 Pool Code（1500 sat）、vout1 Pool Tape（0 sat）、vout2 零余额池控 FT Code（500 sat）、vout3 FT Tape（0 sat），以及可选资金找零。此时没有 LP。

### 使用已选定的 mint root

已有整理交易时，可以直接以其中一个 P2PKH 输出作为 mint root。`prepareMintPoolNFT` 只准备 Genesis，不额外创建 Source；该 root 必须是专门选定、未花费的真实输出。

```ts
async function mintFromRoot(
  ctx: Context, pool: PoolNFT3, root: Pool3SignedInput,
): Promise<Pool3BuildResult> {
  ctx.history.set(root.parentTx.id, root.parentTx);
  const prepared = pool.prepareMintPoolNFT({ funding: root, feePolicy: minerFee });
  console.log('待签名输入:', prepared.signingRequests.map(r => r.inputIndex));
  const result = await prepared.sign();
  remember(ctx, 'pool-genesis-from-root', result);
  return result;
}
```

首次加池时，`ancestorTx` 使用这里的 `root.parentTx`。两种建池方式是独立选择，不应重复花费同一个资金输出。

## 6. 首次添加流动性

首次加池同时指定 TBC 和 FT，决定初始兑换比例。本例注入 100 TBC 和 `200_000_000` 个 FT 最小单位，发行 `100_000_000` 个 LP 最小单位。

```ts
async function firstAddLP(
  ctx: Context, pool: PoolNFT3, common: Pool3OperationOptions,
  userFT: Pool3AssetInput, lpLockTime = 0,
): Promise<Pool3BuildResult> {
  const amount = { incrementSat: toRaw('100', 6), firstFtAmountRaw: 200_000_000n };
  const quote = pool.quoteAddLP(common.pool.parentTx, amount);
  if (!quote.isFirstAddLP) throw new Error('此用例需要空池');
  const timelocked = pool.readPoolState(common.pool.parentTx).tape.withLpLocktime;
  const result = await pool.addLP({
    ...common, ...amount, userFT, lpReceiverAddress: ctx.address,
    minLpOutRaw: quote.ftLpIncrementRaw,
    maxFtInRaw: quote.ftAIncrementRaw, maxTbcInSat: quote.tbcIncrementSat,
    expectedSnapshotHash: quote.snapshotHash,
    ...(timelocked ? { lpLockTime } : {}),
  });
  remember(ctx, '02-first-add', result);
  return result;
}
```

首次也必须消费 Genesis 的零余额池 FT，旧 Pool Code 必须恰好为 1500 sat。资金输入除入池 TBC 外，还需覆盖输出资金和矿工费。

锁仓池每次加池都必须显式传 `lpLockTime`，包括 `0`。例如调用 `firstAddLP(ctx, pool, common, userFT, 900_000)` 可发行锁到指定区块高度的 LP；高度是否在未来由目标链决定。该 LP 到期前不能转账、解锁或撤池。第 15 节默认使用 `0`，便于离线串联整个生命周期。

## 7. 按预算继续添加流动性

非空池只指定一侧预算，SDK 报价确定实际双边投入和 LP 数量。以下两个函数分别演示两种入口，可以独立使用；串联时必须使用上一笔产生的池、FT 找零及资金找零。

### 7.1 按 TBC 预算

```ts
async function addLPByTbc(
  ctx: Context, pool: PoolNFT3, common: Pool3OperationOptions,
  userFT: Pool3AssetInput, budgetSat = 10_000_000n, lpLockTime = 0,
): Promise<Pool3BuildResult> {
  const quote = pool.quoteAddLP(common.pool.parentTx, { incrementSat: budgetSat });
  const timelocked = pool.readPoolState(common.pool.parentTx).tape.withLpLocktime;
  console.log(json({ tbcSat: quote.tbcIncrementSat, ftRaw: quote.ftAIncrementRaw,
    lpRaw: quote.ftLpIncrementRaw }));
  const result = await pool.addLP({
    ...common, userFT, incrementSat: budgetSat, lpReceiverAddress: ctx.address,
    minLpOutRaw: quote.ftLpIncrementRaw,
    maxFtInRaw: quote.ftAIncrementRaw, maxTbcInSat: budgetSat,
    expectedSnapshotHash: quote.snapshotHash,
    ...(timelocked ? { lpLockTime } : {}),
  });
  remember(ctx, '03-add-by-tbc', result);
  return result;
}
```

### 7.2 按 FT 预算

```ts
async function addLPByFt(
  ctx: Context, pool: PoolNFT3, common: Pool3OperationOptions,
  userFT: Pool3AssetInput, budgetRaw = 20_000_000n, lpLockTime = 0,
): Promise<Pool3BuildResult> {
  const quote = pool.quoteAddLP(common.pool.parentTx, { incrementFtRaw: budgetRaw });
  const timelocked = pool.readPoolState(common.pool.parentTx).tape.withLpLocktime;
  console.log(json({ tbcSat: quote.tbcIncrementSat, ftRaw: quote.ftAIncrementRaw,
    lpRaw: quote.ftLpIncrementRaw }));
  const result = await pool.addLP({
    ...common, userFT, incrementFtRaw: budgetRaw, lpReceiverAddress: ctx.address,
    minLpOutRaw: quote.ftLpIncrementRaw,
    maxFtInRaw: budgetRaw, maxTbcInSat: quote.tbcIncrementSat,
    expectedSnapshotHash: quote.snapshotHash,
    ...(timelocked ? { lpLockTime } : {}),
  });
  remember(ctx, '04-add-by-ft', result);
  return result;
}
```

`incrementSat` 与 `incrementFtRaw` 互斥，均为最大预算。实际投入可能因 LP 整数精度略少于预算，余量留在找零；另一侧资产不足时直接拒绝构造，不自动降低 LP 数量。`firstFtAmountRaw` 仅用于空池。

`minLpOutRaw` 是最低 LP 收入；`maxFtInRaw/maxTbcInSat` 是实际入池上限，TBC 上限不包含矿工费和新输出资金。报价的 `tbcIncrementSat` 是真实入池 TBC，`tbcReserveIncrementSat` 是 Tape 账面储备增量。

## 8. 双向兑换

方法按用户**收到的资产**命名：`swapFT` 用 TBC 买 FT，`swapTBC` 用 FT 换 TBC。报价读取显式传入的池快照；构造时重算金额。

### 8.1 TBC → FT

```ts
async function buyFT(
  ctx: Context, pool: PoolNFT3, common: Pool3OperationOptions,
  inputTbcSat = 1_000_000n,
): Promise<Pool3BuildResult> {
  const quote = pool.quoteSwapFT(common.pool.parentTx, inputTbcSat);
  console.log(json({ ftOutRaw: quote.ftOutRaw, fees: quote.fees }));
  const result = await pool.swapFT({
    ...common, inputTbcSat, receiverAddress: ctx.address,
    minFtOutRaw: minimumOut(quote.ftOutRaw),
    expectedSnapshotHash: quote.snapshotHash,
  });
  remember(ctx, '05-swap-ft', result);
  return result;
}
```

用户收到的 FT 通过 `assetFrom(ctx, result, 'user-ft')` 获取。资金输入要覆盖兑换本金、输出资金和矿工费。

### 8.2 FT → TBC

```ts
async function sellFT(
  ctx: Context, pool: PoolNFT3, common: Pool3OperationOptions,
  userFT: Pool3AssetInput, inputFtRaw = 1_000_000n,
): Promise<Pool3BuildResult> {
  const quote = pool.quoteSwapTBC(common.pool.parentTx, inputFtRaw);
  const minimum = minimumOut(quote.tbcOutSat);
  const result = await pool.swapTBC({
    ...common, userFT, inputFtRaw, receiverAddress: ctx.address,
    minTbcOutSat: minimum < 10n ? 10n : minimum,
    expectedSnapshotHash: quote.snapshotHash,
  });
  remember(ctx, '06-swap-tbc', result);
  const payoutVout = result.layout.userTbcVout!;
  console.log('用户实收 sat:', result.transaction.outputs[payoutVout].satoshis);
  return result;
}
```

`minFtOutRaw/minTbcOutSat` 是构造 Swap 的必填参数。`expectedSnapshotHash` 只核对传入的 Pool 是否与报价一致，不会联网确认它仍未花费。链上状态发生变化时，应获取最新 outpoint 并重新报价、签名。同一个 Pool outpoint 不能并发用于两笔操作。

两种 Swap 都要求有效输入严格小于旧同侧定价储备、理论换出量为正、留池差额为正。`swapTBC` 用户实际收款至少 10 sat；矿工资金不能用来补足该兑换付款。

## 9. 移除流动性

撤池消耗一个 LP UTXO。下面的函数既支持部分撤池，也支持销毁该 UTXO 的全部 LP；若要清空整个池，持有人需要先将全池 LP 汇集到一个输入。

```ts
function inspectLP(input: Pool3AssetInput, expectedPoolCodeHash: Buffer) {
  const code = input.parentTx.outputs[input.outputIndex];
  const tapeOutput = input.parentTx.outputs[input.outputIndex + 1];
  if (!code || code.satoshis !== 500 || !tapeOutput || tapeOutput.satoshis !== 0) {
    throw new Error('LP Code/Tape 必须是相邻的 500/0 sat 输出');
  }
  const descriptor = FTLPTBC20.validateCode(code.script, { poolCodeHash: expectedPoolCodeHash });
  const tape = FTLPTBC20.parseTape(tapeOutput.script, descriptor);
  return { descriptor, tape };
}

async function removeLiquidity(
  ctx: Context, pool: PoolNFT3, common: Pool3OperationOptions,
  userLP: Pool3AssetInput, burnAmountRaw: bigint, label = 'remove-lp',
): Promise<Pool3BuildResult> {
  const state = pool.readPoolState(common.pool.parentTx);
  const { tape } = inspectLP(userLP, state.poolCodeHash);
  if (burnAmountRaw > tape.balance) throw new Error('LP 输入余额不足，请先合并');
  const quote = pool.quoteRemoveLP(common.pool.parentTx, burnAmountRaw);
  const result = await pool.removeLP({
    ...common, userLP, burnAmountRaw, receiverAddress: ctx.address,
    minFtOutRaw: quote.ftADecrementRaw,
    minTbcOutSat: quote.poolValueDecrementSat,
    expectedSnapshotHash: quote.snapshotHash,
    lockTime: tape.lockTime,
  });
  remember(ctx, label, result);
  console.log(json({ ftRaw: quote.ftADecrementRaw,
    tbcPaidSat: quote.poolValueDecrementSat, pricingReserveDecreaseSat: quote.tbcDecrementSat }));
  return result;
}
```

TBC 兑付按 Pool Code 的真实可分配余额计算，可以包含留池收益，不能用 Tape 账面减少量代替。部分撤池的剩余 LP 通过 `lp-change` 获取；返回 FT 为 `user-ft`；`lp-burn` 是销毁输出，不能当作用户余额。

必需 TBC 兑付至少 10 sat，0–9 sat 的报价会失败，不能追加 funding 补足，也不能通过降低 `changeDustSat` 绕过。全撤后 Pool 保留 1500 sat，池控 FT Code/Tape 对仍存在、余额为零，可以重新首次注入。

## 10. LP 转移、合并与解锁

这些操作不消费 Pool，也不改变 LP 总发行量。独立操作的实例不自动绑定唯一发行池，所以示例显式核对 LP 的 `poolCodeHash`。

### 10.1 转移 LP

```ts
async function transferLP(
  ctx: Context, pool: PoolNFT3, expectedPoolCodeHash: Buffer,
  inputs: readonly Pool3AssetInput[], funding: Pool3SignedInput,
  receiverAddress: string, amountRaw: bigint, outputLockTime?: number,
): Promise<Pool3BuildResult> {
  for (const input of inputs) inspectLP(input, expectedPoolCodeHash);
  const result = await pool.transferLP({
    inputs, funding, receiverAddress, amountRaw,
    lpChangeAddress: ctx.address, feePolicy: minerFee,
    ...(outputLockTime === undefined ? {} : { outputLockTime }),
  });
  remember(ctx, '07-transfer-lp', result);
  return result;
}
```

支持 1–5 个同身份 LP 输入，跨持有人时每个输入都要使用对应签名器。示例明确将剩余 LP 退回 `ctx.address`；实际应用应确认参与人的找零归属。接收输出为 `lp-transfer`，剩余输出为 `lp-change`。

锁仓版本省略 `outputLockTime` 时保留输入的最大同类型锁值；传入该参数可设置接收 LP 的锁值，但父锁仍必须满足。普通 LP 不接受此参数。示例入口转给同一持有人以便继续合并；转给他人时，把 `receiverAddress` 换成对方地址，后续花费也须更换签名器。

### 10.2 合并 LP

合并通过 `transferLP` 将 1–5 个 LP UTXO 的全部余额转回自己，无需单独的 `mergeFTLP` 方法。

```ts
async function mergeLP(
  ctx: Context, pool: PoolNFT3, expectedPoolCodeHash: Buffer,
  inputs: readonly Pool3AssetInput[], funding: Pool3SignedInput,
): Promise<Pool3BuildResult> {
  if (inputs.length < 1 || inputs.length > 5) throw new Error('每笔合并需要 1–5 个 LP 输入');
  const amountRaw = inputs.reduce(
    (sum, input) => sum + inspectLP(input, expectedPoolCodeHash).tape.balance, 0n,
  );
  const result = await pool.transferLP({
    inputs, funding, receiverAddress: ctx.address, amountRaw, feePolicy: minerFee,
  });
  remember(ctx, '08-merge-lp', result);
  return result;
}
```

输入必须来自同一 Pool，且 LP 模板和 Tape 长度相同。超过 5 个输入时，分批合并，并使用每批返回的 `lp-transfer` 和新资金找零继续构造；不能重复引用已消费输入。

### 10.3 到期解锁 LP

```ts
async function unlockLP(
  ctx: Context, pool: PoolNFT3, expectedPoolCodeHash: Buffer,
  inputs: readonly Pool3AssetInput[], funding: Pool3SignedInput,
): Promise<Pool3BuildResult> {
  const locks = inputs.map(input => {
    const { descriptor, tape } = inspectLP(input, expectedPoolCodeHash);
    if (!descriptor.timelocked) throw new Error('此用例只接受锁仓 LP');
    return tape.lockTime;
  });
  const lockTime = FTLPTBC20.getRequiredLockTime(locks);
  const result = await pool.unlockLP({
    inputs, funding, receiverAddress: ctx.address, lockTime, feePolicy: minerFee,
  });
  remember(ctx, '09-unlock-lp', result);
  const unlocked = assetFrom(ctx, result, 'lp-transfer');
  if (inspectLP(unlocked, expectedPoolCodeHash).tape.lockTime !== 0) {
    throw new Error('解锁输出 lockTime 应为 0');
  }
  return result;
}
```

`unlockLP` 将同一持有人的所有输入余额合并为 `lockTime=0` 的 LP，保留锁仓 Code 身份和持有人，不转换为普通 LP。SDK 会拒绝不属于 `receiverAddress` 的输入。

锁值为 uint32：小于 `500000000` 表示区块高度，达到该值表示时间戳。不同类型的非零父锁不能混合。锁仓 LP 花费使用 `0xfffffffe` sequence，并要求交易 `nLockTime` 覆盖父锁；父锁为 0 时也仍使用非 final sequence。

**构造时设置 nLockTime 不证明锁已到期。** 转移、合并、解锁和撤池广播前，都需按目标节点的高度、时间和最终性规则检查父锁成熟；不能只用本机时间判断。锁仓模板本身不强制全池统一最短锁期，允许 AddLP 显式发行锁值为 0 的 LP。

## 11. 恢复池与读取状态

已经持有链上 Pool 交易时，使用 `fromPool` 从 Code/Tape 恢复配置，并校验底层资产与模板。应用仍须用自己保存的可信 Pool Code hash 核对业务身份。

```ts
function restoreAndInspectPool(
  poolTx: tbc.Transaction, ftGenesisTx: tbc.Transaction, expectedPoolCodeHashHex: string,
): PoolNFT3 {
  const pool = PoolNFT3.fromPool(poolTx, ftGenesisTx);
  const state = pool.readPoolState(poolTx);
  if (state.poolCodeHash.toString('hex') !== expectedPoolCodeHashHex.toLowerCase()) {
    throw new Error('不是业务预期的池');
  }
  const tape = decodePoolTape(poolTx.outputs[1].script);
  console.log(json({
    outpoint: state.outpoint, snapshotHash: state.snapshotHash,
    poolValueSat: state.poolValue, redeemableTbcSat: state.poolValue - 1500n,
    pricingTbcSat: tape.tbcAmount, ftRaw: tape.ftAAmount, lpRaw: tape.ftLpAmount,
    variant: tape.variant, lpPlan: tape.lpPlan, totalFeeBps: tape.serviceFeeRate,
    ftContractId: tape.ftAContractId,
    ftIdentity: tape.ftAPartialHash.toString('hex'), ftCodeSize: tape.ftACodeSize,
    lpIdentity: tape.ftLpPartialHash.toString('hex'), lpCodeSize: tape.ftLpCodeSize,
    swapHashLock: tape.withSwapHashLock, lpHashLock: tape.withLpHashLock,
    lpLocktime: tape.withLpLocktime, controllers: state.controllerPubKeyHashes,
  }));
  return pool;
}
```

若从持久化数据恢复操作，需要同时恢复最新池交易、它的 vin0 父交易、当前池 FT 输出、用户资产/资金输出，以及相关祖先图。池 FT 的 vout 应保存自先前的 `layout`，或由可信索引器提供；不要假定它在每种操作后都位于 vout2。

Pool Tape 严格为 143 字节：`006a4c82 + 连续130字节 + 08POOLTAPE`。金额是 8 字节小端，`serviceFeeRate` 为 uint16LE，布尔值为单字节 00/01，FT contractId 使用显示 txid 的字节顺序。单独解码 Tape 不能证明资产身份。

## 12. 手续费

Swap 费用与矿工费分别计算。Tape 的 `serviceFeeRate` 表示总 Swap 费率，单位为万分比；计划和收款方在创建池时确定。

| lpPlan | 总费率（bps） | LP 费率（bps） |
| --- | --- | --- |
| 1 | 35 | 25 |
| 2 | 35 | 5 |
| 3 | 135 | 5 |
| 4 | 335 | 5 |
| 5 | 535 | 5 |
| 6 | 130 | 80 |

```ts
function inspectFees(baseTbcSat = 1_000_000n, lpPlan = 1): void {
  const policy = resolveSwapFeePolicy(lpPlan);
  const fees = calculateSwapFees(baseTbcSat, policy);
  const recipient = deriveFeeRecipient(policy.serviceFeeAddress);
  console.log(json({ policy, fees,
    feePubKeyHash20: recipient.feePubKeyHash20.toString('hex'),
    feeP2pkhScript25: recipient.feeP2pkhScript25.toHex(),
    feeScriptHash32: recipient.feeScriptHash32.toString('hex'),
  }));
}
```

以计划 1、基数 `1_000_000n` 为例，总费为 `3500n`，LP 费为 `2500n`，服务方实付 `1000n`，留池费用 `2500n`。`swapFT` 用用户兑换 TBC 本金作为基数；`swapTBC` 用理论换出 TBC 作为基数。总费和 LP 费各自向下取整，再相减得服务方份额。

服务方份额达到 10 sat 才支付；不足 10 sat 时留在池中，用户仍承担完整 Swap 费用。服务费 vout 固定：`swapFT` 为 4，`swapTBC` 为 3。实付为 0 时仍保留 `0 sat + OP_FALSE OP_RETURN` 输出。留池部分不属于矿工费，也不是服务方的独立待领余额。

费用收款绑定使用完整 25 字节 P2PKH 锁脚本的 SHA256（32 字节），不等同于地址公钥哈希。费用计划表是 **SDK 构造政策**；合约绑定费用输出位置、收款脚本及留池差额等条件，不强制核对整张费率表或正服务费输出的 10 sat 门槛。

矿工费可通过 `feePolicy` 配置，默认 `80n sat/KB`、最低 `80n sat`、找零门槛 `10n sat`。不足找零门槛的余额并入矿工费；门槛可提高，不能低于 10 sat。SDK 先按最大签名长度固定费用和输出，再收集签名。

## 13. 外部签名

全部业务方法都有 `prepare*` 形式。准备阶段固定输出、费用、sequence、lockTime 和见证，不调用签名器；之后可以通过 `sign()` 调用适配器，或收集签名后交给 `finalize()`。

| 直接构造并签名 | 只准备 |
| --- | --- |
| `mintPoolNFT` | `prepareMintPoolNFT`（直接使用 mint root，不创建 Source） |
| `addLP` | `prepareAddLP` |
| `removeLP` | `prepareRemoveLP` |
| `swapFT` | `prepareSwapFT` |
| `swapTBC` | `prepareSwapTBC` |
| `transferLP` | `prepareTransferLP` |
| `unlockLP` | `prepareUnlockLP` |

### 13.1 签名回调适配器

下面的适配器用本地私钥模拟钱包签名端，包含实际签名实现。接入远程钱包时，替换 `sign` 内部传输逻辑，并保持请求交易和 prevout 数据完整。

```ts
function walletAdapter(key: tbc.PrivateKey): Pool3SigningIdentity {
  return {
    publicKey: key.publicKey.toBuffer(),
    sign: async (request: Pool3SigningRequest) => {
      if (request.sighashType !== 0x41) throw new Error('不支持的签名类型');
      if (!request.publicKey.equals(key.publicKey.toBuffer())) throw new Error('签名身份不匹配');
      const input = request.transaction.inputs[request.inputIndex];
      if (!input.output) throw new Error('缺少 prevout');
      console.log(json({ role: request.role, vin: request.inputIndex,
        outpoint: request.outpoint, amountSat: request.amountSat }));
      const signature = request.transaction.getSignature(request.inputIndex, key, request.sighashType);
      if (typeof signature !== 'string') throw new Error('期望单个输入的交易签名');
      return signature;
    },
  };
}

async function buyFTWithAdapter(
  ctx: Context, pool: PoolNFT3, common: Pool3OperationOptions,
  wallet: Pool3SigningIdentity, inputTbcSat = 1_000_000n,
): Promise<Pool3BuildResult> {
  const quote = pool.quoteSwapFT(common.pool.parentTx, inputTbcSat);
  const prepared = pool.prepareSwapFT({
    ...common,
    funding: { ...common.funding, signer: wallet },
    poolFT: { ...common.poolFT, signer: wallet },
    inputTbcSat, receiverAddress: ctx.address,
    minFtOutRaw: minimumOut(quote.ftOutRaw), expectedSnapshotHash: quote.snapshotHash,
  });
  const result = await prepared.sign();
  remember(ctx, 'swap-with-adapter', result);
  return result;
}
```

`wallet` 必须能签署资金输入；白名单池的 Controller 仍由 `common.controllerSigner` 提供。调用时可使用 `walletAdapter(tbc.PrivateKey.fromWIF(requiredEnv('POOL3_WIF')))`。

### 13.2 只传公钥，收集签名后 finalize

该用例接收签名端列表，先将构造选项中的身份转换为仅公钥，再按每个请求的公钥选择签名端。它同时适用于多持有人或独立 Controller 的场景，不会把同一份签名复制到多个 vin。

```ts
async function finalizeSwapWithWallets(
  ctx: Context, pool: PoolNFT3, options: Pool3SwapFTOptions,
  wallets: readonly Pool3SigningIdentity[],
): Promise<Pool3BuildResult> {
  const pubkeyHex = (value: string | Buffer) =>
    typeof value === 'string' ? value.toLowerCase() : value.toString('hex');
  const publicOnly = (identity: Pool3SigningIdentity): Pool3SigningIdentity =>
    ({ publicKey: identity.publicKey });
  const prepared = pool.prepareSwapFT({
    ...options,
    funding: { ...options.funding, signer: publicOnly(options.funding.signer) },
    poolFT: { ...options.poolFT, signer: publicOnly(options.poolFT.signer) },
    ...(options.controllerSigner ? { controllerSigner: publicOnly(options.controllerSigner) } : {}),
  });
  console.log('固定矿工费 sat:', prepared.feeSat.toString());
  const signatures = [];
  for (const request of prepared.signingRequests) {
    const wallet = wallets.find(w => pubkeyHex(w.publicKey) === request.publicKey.toString('hex'));
    if (!wallet?.sign) throw new Error(`缺少 ${request.role} 的签名端`);
    signatures.push({
      inputIndex: request.inputIndex, publicKey: request.publicKey,
      signature: await wallet.sign(request),
    });
  }
  const result = prepared.finalize(signatures);
  remember(ctx, 'swap-with-finalize', result);
  return result;
}
```

签名必须是对应输入的 `DER + 0x41` 交易签名，使用 `SIGHASH_ALL | FORKID`。SDK 检查公钥、vin、类型、有效性和预留长度。业务审批应核对请求的完整输出、金额和费用；审批之后不能修改输出再复用签名。`PreparedPool3Operation` 仅是公开返回类型，不能从根入口直接 `new`。

## 14. 本地验证与串行广播

构造结果包含 `transaction/txraw/txid/feeSat/reservedBytes/changeVout/consumedOutpoints/validation`，以及 `layout`、可选 `quote/nextState`。Mint 还包含 `source` 和有序 `transactions`。

### 14.1 从 raw 重新验证

反序列化交易不包含输入对应的 previous output，必须从可信父交易补齐后才能验证。

```ts
function validateRaw(ctx: Context, txraw: string): void {
  const tx = new tbc.Transaction(txraw);
  for (const input of tx.inputs) {
    const parent = transaction(ctx, input.prevTxId.toString('hex'));
    const output = parent.outputs[input.outputIndex];
    if (!output) throw new Error('父交易中不存在被花费输出');
    input.output = new tbc.Transaction.Output({
      script: tbc.Script.fromBuffer(output.script.toBuffer()), satoshis: output.satoshis,
    });
  }
  const report = validatePool3Transaction(tx);
  if (!report.success) throw new Error(json(report));
  console.log(json(report));
}
```

本地验证覆盖 Pool、池 FT、用户 FT/LP 和资金的全部输入。`nodeAcceptanceChecked` 恒为 `false`，不证明 UTXO 可用、祖先已接收、时间锁成熟或节点策略满足。

脚本执行的 BIN2NUM 范围固定为 8 字节，非负金额上限为 `2^63-1`；中间乘积仍使用大整数。验证器执行后恢复底层库全局参数。验证报告保留 `altStackDepth`，FTLP 部分成功路径副栈有 2 个记账项，不能自行把副栈非空解释为验证失败。

### 14.2 按依赖顺序广播

下面函数会实际广播，只有应用决定提交时才调用。参数必须按父交易在前、子交易在后排列；本地依赖图之外的祖先也必须已被目标网络接收。

```ts
async function broadcastInOrder(
  transactions: readonly tbc.Transaction[], network: 'testnet' | 'mainnet',
): Promise<void> {
  mkdirSync('pool3-output', { recursive: true });
  for (const tx of transactions) {
    const receiptPath = `pool3-output/broadcast-${network}-${tx.id}.json`;
    writeFileSync(receiptPath, json({ network, txid: tx.id, status: 'submitting' }));
    let acceptedTxid: string;
    try {
      acceptedTxid = await API.broadcastTXraw(tx.uncheckedSerialize(), network);
    } catch (error) {
      // 请求失败可能发生在节点接收之后，记录待核实状态并停止子交易。
      writeFileSync(receiptPath, json({ network, txid: tx.id,
        status: 'needs-verification', error: String(error) }));
      throw error;
    }
    if (acceptedTxid !== tx.id) {
      writeFileSync(receiptPath, json({ network, txid: tx.id,
        returnedTxid: acceptedTxid, status: 'needs-verification' }));
      throw new Error('广播返回 txid 不匹配，停止后续交易');
    }
    writeFileSync(receiptPath, json({ network, txid: tx.id, status: 'accepted' }));
    console.log('节点接口已接收:', tx.id);
  }
}
```

广播返回成功不等于确认。超时或未知状态先查询该 txid 的实际接收情况，不立即创建竞争交易。应用应在确认节点接受后推进“最新池状态”，并记录未花费输出；SDK 不自动维护这部分网络状态。

## 15. 完整生命周期入口

下列入口串行构造：创建 → 首次加池 → 按 TBC 加池 → 按 FT 加池 → 双向兑换 → LP 转移 → 合并 → 可选解锁 → 部分撤池 → 全撤。

设置 `POOL3_VARIANT` 可选择第 4 节任一版本，默认 `public`。锁仓版本要求底层 FT Tape 至少 66 字节；白名单版本由 `POOL3_CONTROLLER_WIF` 提供一名成员。多成员池可直接向 `createPool` 传入 1–5 个成员公钥。

```ts
async function main(): Promise<void> {
  const { ctx, ftGenesisTx, funding, userFT } = loadInputs();
  const variantValue = process.env.POOL3_VARIANT ?? 'public';
  const variants: Variant[] = ['public', 'public-timelocked', 'controller', 'controller-timelocked'];
  if (!variants.includes(variantValue as Variant)) throw new Error('不支持的 POOL3_VARIANT');
  const variant = variantValue as Variant;
  const pool = createPool(ftGenesisTx, variant,
    ctx.controllerSigner ? [ctx.controllerSigner.publicKey] : []);
  const minted = await mintPool(ctx, pool, funding);
  const ordered: tbc.Transaction[] = [...minted.transactions];
  const append = (result: Pool3BuildResult) => { ordered.push(result.transaction); return result; };

  const first = append(await firstAddLP(ctx, pool,
    operationInputs(ctx, pool, minted, fundingFrom(ctx, minted)), userFT));
  const second = append(await addLPByTbc(ctx, pool,
    operationInputs(ctx, pool, first, fundingFrom(ctx, first)), assetFrom(ctx, first, 'ft-change')));
  const third = append(await addLPByFt(ctx, pool,
    operationInputs(ctx, pool, second, fundingFrom(ctx, second)), assetFrom(ctx, second, 'ft-change')));

  const bought = append(await buyFT(ctx, pool,
    operationInputs(ctx, pool, third, fundingFrom(ctx, third))));
  const sold = append(await sellFT(ctx, pool,
    operationInputs(ctx, pool, bought, fundingFrom(ctx, bought)), assetFrom(ctx, bought, 'user-ft')));

  const poolCodeHash = pool.readPoolState(sold.transaction).poolCodeHash;
  const transferred = append(await transferLP(ctx, pool, poolCodeHash,
    [assetFrom(ctx, first, 'new-lp')], fundingFrom(ctx, sold), ctx.address, 1_000_000n));
  const merged = append(await mergeLP(ctx, pool, poolCodeHash, [
    assetFrom(ctx, transferred, 'lp-transfer'), assetFrom(ctx, transferred, 'lp-change'),
    assetFrom(ctx, second, 'new-lp'), assetFrom(ctx, third, 'new-lp'),
  ], fundingFrom(ctx, transferred)));

  let lpResult = merged;
  if (pool.readPoolState(sold.transaction).tape.withLpLocktime) {
    lpResult = append(await unlockLP(ctx, pool, poolCodeHash,
      [assetFrom(ctx, merged, 'lp-transfer')], fundingFrom(ctx, merged)));
  }
  const lp = assetFrom(ctx, lpResult, 'lp-transfer');
  const balance = inspectLP(lp, poolCodeHash).tape.balance;
  // LP 独立操作不消费 Pool，所以此处的最新 Pool 仍是 sold。
  const partial = append(await removeLiquidity(ctx, pool,
    operationInputs(ctx, pool, sold, fundingFrom(ctx, lpResult)), lp, balance / 2n, '10-remove-partial'));
  const remainder = assetFrom(ctx, partial, 'lp-change');
  const all = append(await removeLiquidity(ctx, pool,
    operationInputs(ctx, pool, partial, fundingFrom(ctx, partial)), remainder,
    inspectLP(remainder, poolCodeHash).tape.balance, '11-remove-all'));

  restoreAndInspectPool(all.transaction, ftGenesisTx, poolCodeHash.toString('hex'));
  inspectFees();
  validateRaw(ctx, all.txraw);
  writeFileSync('pool3-output/ordered-transactions.json', json(
    ordered.map(tx => ({ txid: tx.id, txraw: tx.uncheckedSerialize() })),
  ));
  writeFileSync('pool3-output/transaction-history.json', json(
    [...ctx.history.values()].map(tx => tx.uncheckedSerialize()),
  ));
  console.log('构造完成，交易和祖先缓存位于 pool3-output/；尚未广播。');
  // 应用完成 UTXO、链状态及依赖检查后，可显式提交：
  // await broadcastInOrder(ordered, 'testnet');
}

if (require.main === module) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
```

入口中的资金找零属于连续链，FT/LP 输入则按各自角色衔接。`third` 的用户 FT 找零、`sold` 的 FT 找零、撤池返回的 FT 和用户 TBC 付款等仍是持有人的资产，应用钱包应将这些输出一起纳入余额管理。演示仅选择后续操作需要的输出，不代表完整钱包索引器。

外部签名的两个用例可以替代其中一次 `buyFT`；需传入同一时点的 `operationInputs` 和报价参数，再把返回结果作为后续池状态。替代操作与原操作不能同时广播。

## 16. 整数计算与使用边界

### 加池与撤池

设真实可分配 TBC 为 `R = poolValue - 1500`，Tape 账面 TBC、FT、LP 分别为 `T、A、L`。非首次加池要求 `R >= T > 0`、`A > 0`、`L > 0`：

```text
TBC 预算 x：m = floor(x × L / R)
FT 预算 y： m = floor(y × L / A)
实际 TBC 投入 dR = ceil(R × m / L)
实际 FT 投入  dA = ceil(A × m / L)
账面 TBC 增量 dT = ceil(T × m / L)
L' = L + m，A' = A + dA，T' = T + dT
poolValue' = poolValue + dR
```

`m` 必须大于零。合约从实际输出恢复投入，并核验 LP 发行量和双边资产，而非信任应用预算。`ceil(a/b)` 使用 `(a+b-1)/b` 的整数计算。

销毁 `b` 个 LP（`0 < b <= L`）时：

```text
用户 FT       = floor(A × b / L)
账面 TBC 减少 = floor(T × b / L)
用户实际 TBC  = floor(R × b / L)
```

AddLP 的向上取整与 RemoveLP 的向下取整可能造成账面储备漂移。例如 `R=10000、T=1、A=L=100`，投入 `100 sat + 1 FT` 获得 `1 LP` 后立即撤出，可以拿回相同实际资产，而 T 变为 2，影响后续定价。应用评估池的经济行为时应考虑这个组合边界。

### Swap

```text
TBC → FT：d 为扣除总 Swap 费后的账面 TBC 增量
  qFT = floor(A × d / (T + d))
  T' = T + d，A' = A - qFT

FT → TBC：f 为实际入池 FT
  grossTbcOut = floor(T × f / (A + f))
  A' = A + f，T' = T - grossTbcOut
  用户实收 = grossTbcOut - 总 Swap 费
```

Swap 使用账面 T 定价，不混入 R 中留池收益；LP 总量保持不变。理论换出量向下取整，账面乘积满足 `T' × A' >= T × A`。极小交易可能因输出为零、费用取整、10 sat 付款下限或缺少正留池差额而被拒绝。

### 输出来源与版本身份

FT/LP Tape 的六个槽表示本次交易绝对 vin 的资产来源。`layout.assetOutputs[].amountsByInput` 可用于审计：

| 操作/输出 | 来源槽 |
| --- | --- |
| AddLP 池 FT | 用户投入 slot1 + 旧池储备 slot2 |
| AddLP 新 LP | slot0 |
| RemoveLP 用户 FT、池 FT | slot2 |
| RemoveLP 销毁 LP、LP 找零 | slot1 |
| swapFT 用户 FT、池 FT | slot2 |
| swapTBC 池 FT | 用户投入 slot1 + 旧池储备 slot2 |
| swapTBC 用户 FT 找零 | slot1 |

应用不需要手动拼接 Tape、解锁脚本或见证。Pool Code hash、FT 控制指针及 LP 发行绑定由完整模板派生；模板不同的池不能仅靠地址、Tape 标志或相同费用计划视为同一身份。

## 17. 常见错误与验证命令

| 现象 | 检查与处理 |
| --- | --- |
| 缺少祖先交易 | 补齐父交易 Tape 非零来源槽所引用的交易，以及 Pool 的 vin0 父交易 |
| FT/LP 余额不足 | 检查原始单位及单个输入余额，先显式整理 UTXO |
| `STALE_POOL_STATE` | 使用最新池交易重新报价，传对应 `snapshotHash` |
| 白名单签名缺失/不匹配 | 使用 Code 白名单成员的完整公钥和签名器 |
| LP belongs to a different Pool | 核对 Pool Code hash，不要混入其他池的 LP |
| 时间锁验证失败或节点不接受 | 检查父锁类型、`nLockTime`、sequence 及目标链成熟条件 |
| TBC payout must be at least 10 sat | 增大合法操作规模；撤池不能用额外资金补足必需兑付 |
| missing inputs / mempool conflict | 检查父交易接收状态及 UTXO 是否被占用，刷新输入后重新构造 |
| 本地验证通过但广播失败 | 结合节点错误检查 UTXO、费用策略、祖先和时间锁 |

在 SDK 仓库内可执行以下离线检查：

```sh
npm run build
npm run test:pool3
npm pack --dry-run --ignore-scripts
```

`test:pool3` 构建生产代码后执行 `test/pool3/` 下离线测试，不广播或花费真实资产。公开类型由根目录 `index.d.ts` 提供；运行时使用随包发布的编译模板。业务代码从 `tbc-contract` 根入口导入，不依赖内部模板、交易计划或数学模块路径。
