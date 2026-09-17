# PoolNFT 3.0

本次更新（2026-09-17）：在直接比例 AddLP/RemoveLP 和向下取整 Swap 输出的基础上，统一普通 TBC 输出下限为 10 sat，SwapTBC 用户实收至少 10 sat；首次 AddLP 要求旧 Pool Code 恰好为 1500 sat。先更新普通/哈希锁合约，再同步 SDK 报价、输出构造及编译模板。本地验证固定采用 8 字节 BIN2NUM 数值范围，不再依赖其他交易是否先调用过验证器。手续费率仍不纳入链上校验，增撤池组合的账面漂移尚未修复。新模板改变 Pool Code hash，仅适用于新模板创建的池，不能直接升级或操作旧模板池。

本轮最终离线回归：合约仓库 `node --test tests/*.test.cjs` 为 284/284；SDK `npm run build` 成功后，`node --test test/pool3/pool3-*.test.cjs` 为 181/181，`node --test test/tbc20.local.test.js` 为 23/23。覆盖四版本 9/10/11 sat 边界、非标准空池余额拒绝、独立新进程的大额交易、8 字节数值边界以及执行后全局参数恢复；新增哈希锁版四操作当前 Tape 及首次 AddLP 父 Tape 的 144/145 字节拒绝测试和 SDK 非规范长度解析测试。源码、根目录编译产物和 SDK 冻结模板/哈希已核对一致；离线脚本验证不等同于目标节点已接受交易，本轮未广播。

历史验收（2026-09-11，R2）：当时的四种版本、1–5 人白名单及六种费用计划已在真实测试网完成生命周期，见[生产前复测报告](</home/ubuntu/projects/apc-contract/doc/PoolNFT3.0 生产前测试复测报告.md>)。该报告不覆盖本次新模板；本次离线回归不替代新模板的测试网验收，也不表示其他经济风险已消除。

PoolNFT 3.0 面向当前 `TBC20 + FTLPTBC20` 合约，不接受旧 FT/旧 FTLP 作为同一协议资产。统一接口支持普通池、公钥哈希白名单池，以及两者各自的 LP 锁仓版本。

所有构造、报价、签名和本地验证均默认离线，不查询余额、不自动合并 UTXO、不广播交易。调用者提供真实父交易和祖先交易；接收成功的构造结果后，仍需自行检查 UTXO 可用性、节点策略和时间锁成熟条件。

## 1. 导入与金额单位

```ts
import * as tbc from 'tbc-lib-js';
import {
  PoolNFT3, FTLPTBC20, privateKeySigner,
  decodePoolTape, resolveSwapFeePolicy, calculateSwapFees,
  deriveFeeRecipient, validatePool3Transaction,
} from 'tbc-contract';
```

CommonJS 使用同名导出；`poolNFT3` 是 `PoolNFT3` 的别名。原来的 `poolNFT`、`poolNFT2` 和 `TBC20` 接口保持不变。

根入口只保留业务使用所需的九项运行时导出：`PoolNFT3`、`poolNFT3`、`FTLPTBC20`、`privateKeySigner`、`decodePoolTape`、`resolveSwapFeePolicy`、`calculateSwapFees`、`deriveFeeRecipient`、`validatePool3Transaction`。输入选项、返回结果和外部签名请求另有完整的 TypeScript 类型。

交易计划、模板拼装、Tape 改写及纯数学计算属于内部实现，不从根入口导出。调用方通过 Pool 实例报价，通过 `prepare*` 取得待签名操作；`PreparedPool3Operation` 是返回对象的类型，不是公开构造器。请使用 `import type` 导入它，不要直接 `new`。

- 所有交易金额和报价金额为 `bigint`：TBC 使用 sat，FT/LP 使用原始最小单位。`1 TBC = 1_000_000n sat`。
- 本接口不接受浮点人类金额；应用展示层应先用精确十进制字符串转换。不能先乘浮点数再转 `BigInt`。
- Pool Tape 标量、FT/LP 每个金额槽的范围是 `0..2^63-1`。乘积和中间比例保持 BigInt。
- 底层库的真实 TBC 输出金额使用 `number`；SDK 在转换前检查 `Number.MAX_SAFE_INTEGER`，超界直接拒绝。
- LP 首次发行量等于 TBC 增量，显示精度建议为 6；LP 原始量不按 FT-A 的显示精度换算。

## 2. 配置四种版本

构造器需要所选 TBC20 的可信创世交易，Code/Tape 必须在 vout0/1。不能拿任意一次 FT 转账交易当作创世交易。

```ts
// ftGenesisTx 为已取得并确认身份的 tbc.Transaction，不会在构造器中联网获取。
const pool = new PoolNFT3({
  ftGenesisTx,
  authorization: { kind: 'public' },
  lp: { kind: 'plain' },
  lpPlan: 1,
});
```

`PoolNFT3` 实例保存的是 FT、费用计划、授权规则和 LP 模板配置，**不是绑定某一个唯一 Pool 或固定 outpoint 的钱包对象**。同配置的多个池可以使用同一实例；每次 Pool 操作都显式传入快照并验证其配置与资产身份。应用必须保存并核对业务预期的 Pool Code hash/outpoint，不能只因实例相同就认为操作的是同一个池。

| authorization | lp.kind | swap hash flag | LP locktime flag | LP hash flag |
| --- | --- | --- | --- | --- |
| `public` | `plain` | 00 | 00 | 00 |
| `public` | `timelocked` | 00 | 01 | 00 |
| `controller` | `plain` | 01 | 00 | 01 |
| `controller` | `timelocked` | 01 | 01 | 01 |

公钥哈希白名单示例：

```ts
const controlledPool = new PoolNFT3({
  ftGenesisTx,
  authorization: {
    kind: 'controller',
    controllerPubKeyHashes: [controllerHashHexA, controllerHashHexB],
  },
  lp: { kind: 'timelocked' },
  lpPlan: 1,
  serviceFeeRate: 35, // 可省略；若提供，必须与计划对应。
});
```

每项为完整的 20 字节 `HASH160(publicKey)`，即 40 位 hex；支持 1–5 项，拒绝重复、非 hex 和错误长度，编码时复制排序，不修改调用者数组。它是任意一个成员签名即可的 1-of-N 白名单，不是 M-of-N 多签，也不是完整公钥/公钥前缀比较。

SDK 仅在固定编译模板的验签尾段生成白名单操作码，随后才计算完整 Pool Code SHA256。池控 FT 的 Controller 和 LP 的 PoolCodeHash 均由这个最终脚本派生。白名单不进入 Tape，不能在既有池的一次操作中修改名单或切换版本。

哈希锁池的 `addLP`、`removeLP`、`swapFT`、`swapTBC` 都要求一个白名单成员签名。`transferLP` 和 `unlockLP` 不消费 Pool，只要求 LP 持有人和资金输入签名。`withLpHashLock` 不表示 LP 转账还需要 Pool Controller 二次批准。

### FT/LP Tape 长度

所选 FT 的固定 Tape 长度为 S；Pool 的 FtTapeSize、FT Tape 和 LP Tape 必须使用相同 S。普通版支持 `61..127` 字节，锁仓版要求 `66..127` 字节。

已有 61 字节 FT 不能创建锁仓池，SDK 不会擅自扩展其 Tape 或改变资产身份。FT 的 metadata/extension 原样保留；LP 锁值只写入 LP 自己的 Tape。

## 3. 输入准备与祖先交易

```ts
import type {
  Pool3SignedInput, Pool3AssetInput, Pool3PoolInput,
  Pool3TransactionResolver, Pool3SigningRequest,
} from 'tbc-contract';

const signer = privateKeySigner(privateKey);
const transactions: Pool3TransactionResolver = new Map([
  [ancestorTx.id, ancestorTx],
  [anotherAncestorTx.id, anotherAncestorTx],
]);

const funding: Pool3SignedInput = {
  parentTx: fundingParentTx, outputIndex: fundingVout, signer,
};
const userFT: Pool3AssetInput = {
  parentTx: userFtParentTx, outputIndex: userFtCodeVout,
  signer, ancestors: transactions,
};
const poolReference: Pool3PoolInput = {
  parentTx: currentPoolTx,
  ancestorTx: previousPoolParentTx,
};
```

`parentTx` 是创建被花费 Code/资金输出的真实父交易；`outputIndex` 是该输出在父交易中的 vout，不是本次交易的 vin。Tape 不作为输入花费，而是紧邻 Code 的父交易证明。

`ancestors` 支持只读 Map、交易数组或同步函数 `(txid) => Transaction | undefined`。应包含 FT/LP 父 Tape 非零槽所引用的真实父输入交易；LP 首次发行还会涉及 Pool 发行来源。可以混合缓存的已确认交易和本地未确认交易，但不能用当前交易替代祖先，也不能只填 txid。

Pool 的 `ancestorTx` 必须对应 `parentTx.vin0` 的实际父交易。首次 AddLP 时它是 mint 返回的 Source；以后通常是上一笔 Pool 状态交易。

四种 Pool 操作的 vin 固定如下，不能自行追加费用输入：

| 方法 | vin0 | vin1 | vin2 | vin3 |
| --- | --- | --- | --- | --- |
| addLP | Pool | 用户 FT | 池 FT | 资金 |
| removeLP | Pool | 用户 LP | 池 FT | 资金 |
| swapFT | Pool | 资金 | 池 FT | 不存在 |
| swapTBC | Pool | 用户 FT | 池 FT | 资金 |

资金不足或 FT/LP 分散在多个 UTXO 时，应先显式整理；SDK 不会暗中取币、合并、广播或突破固定输入数量。独立 `transferLP` 支持 1–5 个同身份 LP 输入和一个资金输入。

池 FT 输入还需要一个有效交易签名，可用单独的普通签名适配器；其资产控制权由同交易 vin0 的 Pool 证明授权，而不是由这个签名者的 P2PKH 身份决定。这个签名与哈希锁 Pool Controller 签名是两个独立输入的签名，不能省掉其中一个。

## 4. 创建池与首次 AddLP

```ts
const minted = await pool.mintPoolNFT({ funding });

// 返回顺序是 Source -> Genesis；此处仅构造和签名，没有广播。
const [sourceTx, poolGenesisTx] = minted.transactions;
const initialState = minted.nextState;
```

`mintPoolNFT` 返回完整 Source 和 Genesis 交易包。Source 固定后再将其 outpoint 写入 Pool Code；Genesis 固定输出为：vout0 Pool Code（1500 sat）、vout1 Pool Tape（0）、vout2 零余额池控 FT Code（500）、vout3 FT Tape（0），以及可选资金找零。Genesis 不发行 LP。

低层 `prepareMintPoolNFT` 不额外创建 Source，而是把传入 `funding` 作为已经选定的原始 mint root；适合已有整理交易的离线流程。使用它时，应自行保存该 root 父交易，供后续 Pool 祖先证明使用。

以下示例以普通池为例，并使用 Genesis 的资金找零；调用者需预先准备足额资金以及 `userFT` 的真实祖先。

```ts
if (minted.changeVout === undefined) {
  throw new Error('需要另选一个足额资金输入');
}

const history = new Map<string, tbc.Transaction>(knownAncestors);
history.set(sourceTx.id, sourceTx);
history.set(poolGenesisTx.id, poolGenesisTx);

const added = await pool.addLP({
  pool: { parentTx: poolGenesisTx, ancestorTx: sourceTx },
  poolFT: {
    parentTx: poolGenesisTx, outputIndex: 2,
    signer, ancestors: history,
  },
  userFT: { ...userFT, ancestors: history },
  funding: {
    parentTx: poolGenesisTx, outputIndex: minted.changeVout, signer,
  },
  incrementSat: 100_000_000n,
  firstFtAmountRaw: 200_000_000n,
  lpReceiverAddress: receiverAddress,
  minLpOutRaw: 100_000_000n,
  maxFtInRaw: 200_000_000n,
});
```

首次 FT 投入和 TBC 投入分别给出：以上发行 LP 为 `100_000_000n`，FT 投入是 `200_000_000n`，二者不必相等。首次也必须消费 Genesis 创建的零余额池 FT 输入，并要求旧 Pool Code 恰好为 1500 sat；不能先向空池预存额外 TBC，再把这部分余额归入首批 LP。

非首次省略 `firstFtAmountRaw`，只输入 TBC 或 FT 中的一项预算；SDK 自动计算另一项和 LP 数量。`incrementSat` 与 `incrementFtRaw` 互斥，均表示原始整数单位的最大预算，实际投入可能因 LP 整数精度略小于预算，余量留在找零中。另一项资产不足时拒绝构造，不自动降低 LP 数量。

```ts
// 两种报价入口二选一；旧 quoteAddLP(tx, 100_000_000n) 调用仍可用。
const byTbc = pool.quoteAddLP(currentPoolTx, { incrementSat: 100_000_000n });
const byFt = pool.quoteAddLP(currentPoolTx, { incrementFtRaw: 200_000_000n });

const nextAdd = await pool.addLP({
  pool: freshPoolReference, poolFT: freshPoolFT,
  userFT: freshUserFT, funding: freshFunding,
  incrementFtRaw: 200_000_000n,
  lpReceiverAddress: receiverAddress,
  minLpOutRaw: minimumAcceptableLpRaw,
  maxTbcInSat: maximumAcceptableTbcSat,
  expectedSnapshotHash: byFt.snapshotHash,
});
```

`minLpOutRaw` 限制最少收到的 LP；`maxFtInRaw` 和 `maxTbcInSat` 限制两侧实际投入。报价的 `tbcIncrementSat` 是实际入池 TBC，`tbcReserveIncrementSat` 是 Tape 账面 TBC 增量，两者不能混用。AddLP 不再返回中间 `ratio`。

锁仓池每次 AddLP 必须显式提供 `lpLockTime`，包括选择 `0`；可直接发行未来锁值 LP。哈希锁池还必须提供 `controllerSigner`。

## 5. 报价、交换与撤池

`pool.quoteAddLP`、`quoteRemoveLP`、`quoteSwapFT`、`quoteSwapTBC` 都读取指定 Pool 交易，返回 `outpoint`、`snapshotHash`、金额明细和 `nextState`。构造时重算报价，并可通过 `expectedSnapshotHash` 拒绝使用过期快照。底层纯数学函数仅供实现和测试使用，应用统一通过实例方法报价。

```ts
// swapFT: 用户付 TBC，收到 FT（源码 option=3）。
const quote = pool.quoteSwapFT(currentPoolTx, 1_000_000n);
const swapped = await pool.swapFT({
  pool: poolReference,
  poolFT,
  funding,
  inputTbcSat: 1_000_000n,
  receiverAddress,
  minFtOutRaw: minimumAcceptableFtRaw,
  expectedSnapshotHash: quote.snapshotHash,
  // 哈希锁版本另加 controllerSigner。
});

// swapTBC: 用户付 FT，收到 TBC（源码 option=4）。
const swappedBack = await pool.swapTBC({
  pool: freshPoolReference, poolFT: freshPoolFT,
  userFT: freshUserFT, funding: freshFunding,
  inputFtRaw: 1_000_000n,
  receiverAddress,
  minTbcOutSat: minimumAcceptableTbcSat,
});
```

两笔示例必须使用各自的新鲜输入，不能同时消费同一 Pool outpoint。`minFtOutRaw` / `minTbcOutSat` 是 Swap 构造器必填的用户成交边界；不要因为示例报价可计算，就无条件接受任意变化后的价格。

```ts
const removed = await pool.removeLP({
  pool: freshPoolReference, poolFT: freshPoolFT,
  userLP, funding: freshFunding,
  burnAmountRaw: amountOfLpToBurn,
  receiverAddress,
  minFtOutRaw: minimumFtRefundRaw,
  minTbcOutSat: minimumTbcRefundSat,
});
```

RemoveLP 的用户 TBC 兑付按 Pool Code 的真实可分配余额计算，不只是 Tape 账面 TBC，因此可包含累积留池费用。销毁、LP 找零、池 FT 找零均保持各自原始身份；池 FT 对始终存在，即使全额撤池后余额为零。全撤后 Pool 保留 1500 sat，可重新首次注入。

RemoveLP 的必需 TBC 付款至少为 **10 sat**，报价阶段即拒绝 0–9 sat。该输出必须精确等于按 LP 比例计算的金额，不能添加 funding 将它补至 10 sat；`changeDustSat` 也不改变此规则。降低旧 SDK 的 42 sat 门槛解决了 10–41 sat 的构造限制，但未解决不足 10 sat 的残余 LP 退出；需要在应用层明确提示，不能承诺任意极小余额均可全退。

### 固定金额来源

FT/LP Tape 的六槽是本次交易绝对 vin 的来源分配，不能只编码输出总量。SDK 自动建立并返回 `layout.assetOutputs[].amountsByInput`：

- AddLP 池 FT：用户投入在 slot1，旧池 FT 在 slot2；新增 LP 在 slot0。
- RemoveLP：用户 FT 和池 FT 找零来自 slot2；LP 销毁和 LP 找零来自 slot1。
- swapFT：用户 FT 与池 FT 找零都只来自 slot2；服务费固定在 vout4。
- swapTBC：池 FT 的新增部分来自 slot1，原储备来自 slot2；用户 FT 找零只来自 slot1，服务费固定在 vout3。

可选 FT/LP/TBC 找零会影响后续 vout，请读取返回的 `layout`、`changeVout`，不要用“最后一个 FT”或地址扫描来猜输出角色。费用地址和普通找零地址即使相同，也不能合并角色。

### 当前整数公式边界

本版报价匹配固定编译合约。非首次 AddLP 定义旧真实可分配 TBC 为 `R = poolValue - 1500`，旧账面 TBC、FT 和 LP 分别为 `T、A、L`，要求 `R >= T > 0`、`A > 0`、`L > 0`：

```text
TBC 预算 x：m = floor(x × L / R)
FT 预算 y： m = floor(y × L / A)
实际 TBC 投入 dR = ceil(R × m / L)
实际 FT 投入  dA = ceil(A × m / L)
账面 TBC 增量 dT = ceil(T × m / L)
L' = L + m，A' = A + dA，T' = T + dT，poolValue' = poolValue + dR
```

`m` 必须大于零，否则预算不足以获得一个原始 LP 单位。整数上取整使用 `(乘积 + 分母 - 1) / 分母`，不使用浮点或中间固定精度比例。合约不信任 SDK 的预算：从实际输出恢复 `dR、dA`，计算 `min(floor(dR×L/R), floor(dA×L/A))`，再验证上述各项精确相等及实际 FT/LP 输出。这样 LP 按真实 TBC（含留池收益）和 FT 双边足额发行，账面储备仍按其自身比例增长；不会把全部真实 TBC 增量直接计入定价储备。三项上取整可能保留极小整数余量，不保证报价比例绝对不变。

RemoveLP 以实际销毁 LP 数量 `b` 为依据，要求 `0 < b <= L`，直接按份额计算：

```text
取出 FT       = floor(A × b / L)
账面 TBC 减少 = floor(T × b / L)
实际 TBC 付款 = floor(R × b / L)
```

三项分别先乘后除、仅向下取整一次，不再计算倒数比例。实际兑付包含留池收益，不能用账面减少量代替；部分赎回不会将原本为正的某项储备取光，全额赎回则准确退还全部可分配余额。`RemoveLPQuote` 不再返回 `ratio`，其余金额字段不变。

账面 T 的组合取整仍是未解决的经济边界，不能泛称“每轮最多差 1 sat”。例如旧 `R=200000000、T=100000001、A=L=100000000`，先销毁 `99999999 LP`，余 `R=T=2、A=L=1`；再投入刚取出的 `199999998 sat + 99999999 raw FT`，铸回相同 LP，最终 `R、A、L` 恢复但 `T=200000000`。原因是接近全撤后，残余账面值的取整误差被后续添加放大；本轮不修改此公式，也不把这个案例直接等同于已证明的可获利盗取。

两个 Swap 改为先向下取整理论换出量，再从旧储备扣除：

```text
TBC → FT：d 为参与定价的账面 TBC 增量
  qFT = floor(A × d / (T + d))
  T' = T + d，A' = A - qFT，L' = L

FT → TBC：f 为实际入池 FT 增量
  grossTbcOut = floor(T × f / (A + f))
  A' = A + f，T' = T - grossTbcOut，L' = L
```

定价仍用账面 T，不混入真实余额 R 中的留池收益；有效输入下账面乘积 `T' × A' >= T × A`。合约和 SDK 均拒绝零理论换出量，不将不足1个单位的报价补成1。原有“输入增量严格小于旧同侧储备”、最小成交边界和严格正留池差额保持不变。SwapTBC 继续以理论换出的 TBC 计算现有手续费，但基数为修正后的向下取整结果。

仍未修复的组合边界：AddLP 的 ceil 与 RemoveLP 的 floor 可能使添加后立即撤出的账面 T 残留1个最小单位。例如 `R=10000、T=1、A=L=100`，投入 `100 sat + 1 FT` 获得 `1 LP` 后撤出，可拿回相同实际资产而 T 变为2；这会影响后续定价，本轮不宣称解决该问题。大整数也不消除小额手续费为零等边界。合约不允许的情况直接报错，不偷偷提高投入。

## 6. Swap 手续费

手续费语义与 PoolNFT 2.0 相同，使用一份不可变计划表；Tape 的 `serviceFeeRate` 实际表示总 Swap 费率。费率均以万分比计。

本次按要求不把手续费金额计算纳入链上校验。下述费率计算是 SDK 的构造政策；链上原有的费用输出位置、脚本绑定和留池差额条件保持不变，不应理解为合约已强制执行整张费率表。

| lpPlan | 总费率 | LP 费率 |
| --- | --- | --- |
| 1 | 35 | 25 |
| 2 | 35 | 5 |
| 3 | 135 | 5 |
| 4 | 335 | 5 |
| 5 | 535 | 5 |
| 6 | 130 | 80 |

```ts
const policy = resolveSwapFeePolicy(1);
const fee = calculateSwapFees(1_000_000n, policy);
// totalFeeSat=3500n, lpFeeSat=2500n,
// serviceFeePaidSat=1000n, poolFeeRetainedSat=2500n
const recipient = deriveFeeRecipient(policy.serviceFeeAddress);
```

`swapFT` 的费用基数是用户投入兑换的 TBC 本金，不含矿工费；`swapTBC` 先算理论换出 TBC，再以该 TBC 数量为基数。总费和 LP 费分别取整后相减，得到服务方计算份额；不是对两个费率之差一次取整。

服务方份额达到 10 sat 才实际支付。小于 10 时，用户仍承担完整 Swap 费用，未支付份额留在 Pool Code，不退给用户、不算矿工费、也不是服务方以后可独立领取的欠款。两种 Swap 均要求严格正的留池差额，费用取整导致不满足该条件时拒绝报价。

新合约固定费用输出位置：SDK 的实付正值使用计划对应的 P2PKH，金额至少 10 sat；实付零值仍保留 `0 sat + OP_FALSE OP_RETURN`，不能像 Pool2 那样省略输出。按本次确认，两份合约对正手续费仅绑定收款脚本哈希，不校验手续费 dust 或具体费率；10 sat 的手续费门槛仅由 SDK 执行。Pool3 普通 P2PKH 付款及找零至少 10 sat，SwapTBC 用户实收同样至少 10 sat，这两项由合约和 SDK 共同检查，还须满足所选费用计划、正留池差额及用户的最小成交量。SDK 不修改底层库的全局 `DUST_AMOUNT`，目标节点的接收策略仍需独立验证。

Pool3 的 `TbcFeeScriptHash` 是完整 25 字节 P2PKH 锁脚本的 **SHA256，32 字节**。Pool2 的构造信息使用地址的公钥哈希，二者不能混用。

```text
address -> pubKeyHash[20]
        -> 76a914 || pubKeyHash || 88ac       (25 字节 P2PKH)
        -> SHA256                          (32 字节 TbcFeeScriptHash)
```

`recipient.feePubKeyHash20`、`feeP2pkhScript25`、`feeScriptHash32` 刻意区分命名。创建和恢复池时都验证固定计划与 Code 脚本哈希一致，不能每次 Swap 临时替换收款方。

矿工费独立设置为 `feePolicy: { satoshisPerKb, minimumFeeSat, changeDustSat }`，默认分别为 `80n、80n、10n`。找零门槛可提高但不可低于 10 sat；不足找零门槛的余款计入矿工费，不影响必需付款的精确值。按最大签名长度预留费用，再收集真实签名；不在签名后修改输出找零以节省几字节费用。

## 7. LP 转移与解锁

```ts
const transferred = await pool.transferLP({
  inputs: [lpInputA, lpInputB],
  funding,
  receiverAddress,
  amountRaw: 100_000n,
  // lpChangeAddress: ... // 不同持有人的剩余 LP 需明确找零归属。
});

const unlocked = await controlledPool.unlockLP({
  inputs: [lockedLpInput],
  funding,
  receiverAddress: currentOwnerAddress,
});
```

LP 独立操作不消费 Pool，不改变全池 LP 总量。合并必须同一 Pool、同一普通/锁仓模板、同一 Tape 长度，金额按每个实际 vin 分槽，不能将全部余额挤到 slot0。跨持有人合并仍需每个持有人的签名。

`transferLP` 验证所有输入的 PoolCodeHash/LP identity 一致，但实例配置本身不是某个发行 Pool 的唯一绑定。应用若要求转移指定池的 LP，应在准备输入时额外核对发行绑定，例如：

```ts
const descriptor = FTLPTBC20.parseCode(lpInput.parentTx.outputs[lpInput.outputIndex].script);
if (!descriptor.poolCodeHash.equals(expectedPoolCodeHash)) {
  throw new Error('输入不是业务预期池的 LP');
}
```

锁仓 LP 在父锁满足之前不能转账、解锁或撤池。SDK 为每个锁仓 LP 输入设置 `0xfffffffe` 非 final sequence，并要求交易 nLockTime 覆盖父锁；即便父锁已经归零，锁仓模板再次花费也仍需非 final sequence。

- 锁值是 uint32：小于 `500000000` 为区块高度，达到该值为时间戳；不同类型的非零父锁不能混合。
- 默认转移保留父锁；合并取同类型父锁最大值。可显式传 `outputLockTime` 重新设定接收 LP 锁值，但不能跳过父锁验证。
- `unlockLP` 只在满足父锁后，将同持有人 LP 转为同一锁仓 Code 身份、`lockTime=0` 的输出。它不是提前解锁，也不是转换成普通 LP。
- 锁仓池并未在当前 Pool 合约中强制全池统一最短锁期；`withLpLocktime=01` 表示具备锁仓校验的 LP 模板，而不是每一笔 LP 永远具有正锁值。
- 设置未来 nLockTime 只能满足脚本比较，不证明节点此刻允许花费。高度、时间和链最终性需按目标节点规则另外检查，不能仅用本机时间代替链状态。

## 8. 外部签名与返回结果

所有核心方法都有 `prepare*` 形式：准备阶段固定交易输出、sequence、lockTime、见证和费用，生成签名请求；`sign()` 调用身份上的签名适配器，`finalize()` 接收调用者提供的签名。准备/费用估算不会触发外部签名器。

```ts
const externalIdentity = {
  publicKey: compressedPublicKeyHex,
  sign: async (request: Pool3SigningRequest) => {
    // 按 request.role/inputIndex/outpoint/amountSat 展示审批内容。
    // 使用带完整 prevout 的 request.transaction；返回 DER + 0x41 的交易签名。
    return await externalWalletSign(request);
  },
};
```

哈希锁池的 `controllerSigner.publicKey` 必须属于 Code 中白名单，但资金或资产持有人可以不同。SDK 检查公钥、实际 vin、签名哈希类型 `SIGHASH_ALL | FORKID = 0x41`、签名有效性和预留长度。不要对多输入直接复制同一份签名。

完全由外部流程收集签名时，只提供各角色公钥，不提供 `sign`：

```ts
const prepared = pool.prepareSwapFT(swapOptionsWithPublicKeys);
const signatures = await Promise.all(prepared.signingRequests.map(async request => ({
  inputIndex: request.inputIndex,
  publicKey: request.publicKey,
  signature: await externalWalletSign(request),
})));
const result = prepared.finalize(signatures);
```

每个请求包含最终交易视图、角色、vin、outpoint、金额、锁脚本、实际签名公钥和哈希类型。不要改动请求中的输出再签名；状态改变时，应重新准备、重新审批和签名。修改返回的交易对象也不能让旧签名自动覆盖新交易。

构造结果包含：`transaction`、`txraw`、`txid`、`feeSat`、`reservedBytes`、可选 `changeVout`、`consumedOutpoints`、`validation`；Pool 门面另返回 `layout`、可选 `quote` / `nextState`。Mint 另带 `source` 和有序 `transactions`。

SDK 对所有输入执行本地脚本验证，包括 Pool、池 FT、用户 FT/LP 和资金输入，不只验证 Pool 分支。`validation.success` 仍不代表网络接收：`nodeAcceptanceChecked` 恒为 `false`，不证明 UTXO 未被花费、祖先已经被节点接收、时间锁已成熟或该节点的 dust/标准性规则满足。若从 raw 重建交易后手工调用 `validatePool3Transaction`，必须先给每个输入挂上可信 previous output。

每次同步脚本执行期间，验证器把 `MAXIMUM_ELEMENT_SIZE` 固定为 `8`，按脚本数字符号位语义支持非负金额 `0..2^63−1`；`OP_BIN2NUM` 不接受需要 9 字节表示的正数。普通字节串的 `MAX_SCRIPT_ELEMENT_SIZE` 独立沿用库 `Input.verify()` 的配置，不将长见证限制为 8 字节。两项全局参数均通过 `try/finally` 恢复，即使验证失败或抛异常也不污染其他协议。中间乘积继续使用大整数，允许超过 8 字节；TBC 实际输出还受 `Transaction.Output` 的 JavaScript 安全整数范围约束，不能与 FT Tape 的数值范围混淆。

当前 FTLP 编译产物的部分成功路径会在副栈保留 2 个记账项；验证报告如实返回 `altStackDepth`，SDK 不额外把“副栈必须为零”当成共识条件。此处保留当前源码/产物行为，没有将其包装成已经通过 SDK 修复的合约风险。

广播由应用单独执行，并按 Source/Genesis/后续操作的依赖顺序处理；父交易失败不能继续子交易。本 SDK 不自动修改客户端“最新池状态”。同一 Pool outpoint 无法并发花费，冲突后应重读状态、重报价、重签名。

## 9. Tape 解码与产物版本

```ts
const tape = decodePoolTape(poolTransaction.outputs[1].script);
console.log(tape.ftLpAmount, tape.ftAAmount, tape.tbcAmount);
console.log(tape.ftLpPartialHash, tape.ftLpCodeSize);
console.log(tape.ftAPartialHash, tape.ftACodeSize);
console.log(tape.ftAContractId, tape.serviceFeeRate, tape.lpPlan);
console.log(tape.withSwapHashLock, tape.withLpLocktime, tape.withLpHashLock);
console.log(tape.flag, tape.variant, tape.suffixData);
```

Pool Tape 为严格 **143 字节**：`006a4c82 + 连续130字节 + 08POOLTAPE`，即 `OP_FALSE OP_RETURN OP_PUSHDATA1 0x82 <130字节> <POOLTAPE>`。其中 92 字节身份/储备区和 38 字节配置区直接相连，不能插入额外 push。SDK 使用固定 Buffer 偏移识别所有字段；旧的 `006a82` / 142 字节形式被明确拒绝。

普通版和哈希锁版合约均校验 Pool Tape 总长恰好 143 字节；哈希锁版新增长度断言后的编译模板已同步。SDK 原有编码与解析规则无需变更，1–5 个控制者及 LP 锁仓的组合继续使用相同格式。新模板会改变哈希锁 Pool Code hash，不会自动升级旧池。

金额是 8 字节小端；serviceFeeRate 为 uint16LE；布尔标志是一字节 00/01；FT contractId 使用显示 txid 的字节顺序，不按 outpoint 自动反转。构造器内部只修改三个金额，保留两种 identity 和整个配置区；应用不需要直接改写 Tape。

`PoolNFT3.fromPool(poolTx, ftGenesisTx)` 可根据链上 Code/Tape 恢复版本、费用计划和白名单，再验证完整模板与资产身份；仅解析 Tape 不等于证明资产身份。

四个固定 JSON 及生成的白名单 profile 随 SDK 发布，运行时不依赖合约源码仓库。内部产物清单记录源码提交、源码/产物/模板 SHA256、编译器版本和 ABI profile；不作为根入口的业务 API 导出。本轮用户源码尚未提交，因此 Pool 记录 `sourceRevision: 'worktree'`、基线提交和实际内容摘要，`sourceCommit` 为 null，不冒充已提交版本。SDK 复制的 JSON 仅规范化末尾换行，因此同时记录源文件摘要与发布文件摘要；规范 JSON 内容摘要一致。模板或公式升级应更新 profile、报价和测试，不能静默替换已部署池身份。

## 10. 开发与验证

Node.js 22 环境下，开发依赖提供 TypeScript。全部生产代码复用项目唯一的 `tsconfig.json`，只编译 `lib`，不生成或执行测试文件：

```sh
npm run build
npm run test:pool3
npm pack --dry-run --ignore-scripts
```

`test:pool3` 先构建生产 JS，再执行 `test/pool3/` 下的离线测试。严格类型检查使用同一配置的选项，由测试显式开启 `strict` / `noEmit`，不另设 Pool3 或类型消费者的 tsconfig。

公开声明统一放在已有的 `index.d.ts`，没有额外的 Pool3 `.d.ts` 文件，也不靠发布实现 TS 来补齐类型。测试同时检查公开声明与实现的双向类型一致性，以及只含发布文件的 TypeScript 消费者；防止手写声明漂移或工作区源码掩盖缺失类型。原有非 Pool3 根接口保持不变。

Pool3 测试代码和测试网工具统一在 `test/pool3/`；原始测试网证据仍在 `test/pool3-preprod-20260911*`，不移动或重新广播。只读复核已有证据可执行：

```sh
node test/pool3/pool3-testnet-audit.cjs
```

旧的 `tests/pool3-*` 命令路径统一改为 `test/pool3/pool3-*`。测试源码纳入版本管理，真实钱包文件、测试网证据及所有测试文件都不进入 npm 发布包。

此次目录、声明与接口精简后，Pool3 完整回归 **142/142**、现有 TBC20 回归 **71/71** 通过；新增用例检查手写公开声明与实现双向一致。TypeScript 5.9.3 / tbc-lib-js 1.0.31 的干净安装环境也通过 142 项回归，以及实际 npm 包的独立类型消费、39 项根导出（30 项已有接口 + 9 项 Pool3）和首次注入交易验证。原测试网 298 笔交易的 884 个输入重新离线验证通过；此轮整理没有新增广播，也没有改动合约模板或金额公式。

离线测试使用真实编译脚本和合成交易，不广播、不调用远程钱包、不花费真实资产。本轮获准的真实测试网复测采用独立 Journal 和完整本地祖先图，不查询新资产索引；广播串行化并限制滚动一秒最多 4 次，低于用户要求的 5 TPS。接收、拒绝、重播及未知状态分别记录，父交易失败或广播状态未知时停止推进。实网工具不会作为 SDK 自动广播行为发布。完整命令、证据及验收限制见上述 R2 报告。
