# 合约版本识别与 SDK 选择

版本识别工具根据 **Code 输出的完整锁定脚本** 判断合约版本，并通过返回值的 `sdk` 字段指示应调用的 SDK。实现位于 `lib/util/common/contractVersion.ts`，运行时代码为同目录的 `.js` 文件；应用推荐从 `tbc-contract` 根入口导入。

所有识别函数均为同步、离线操作，不查询网络、不构造交易、不签名、不广播。

## 1. 接口与返回值

```ts
import {
  detectContractVersion,
  detectPoolVersion,
  detectFTVersion,
  detectStableCoinVersion,
  detectNFTVersion,
} from 'tbc-contract';
import type {
  ContractCodeScript, ContractVersionInfo,
  PoolVersionInfo, FTVersionInfo, StableCoinVersionInfo, NFTVersionInfo,
} from 'tbc-contract';
```

| 方法 | 用途 | 返回类型 |
| --- | --- | --- |
| `detectContractVersion(codeScript)` | 不知道资产类别时，统一识别 | `ContractVersionInfo \| null` |
| `detectPoolVersion(codeScript)` | Pool 版本 | `PoolVersionInfo \| null` |
| `detectFTVersion(codeScript)` | 普通 FT / TBC20 | `FTVersionInfo \| null` |
| `detectStableCoinVersion(codeScript)` | 旧稳定币 / Coin TBC20 | `StableCoinVersionInfo \| null` |
| `detectNFTVersion(codeScript)` | 旧 NFT / TBC721 | `NFTVersionInfo \| null` |

输入 `ContractCodeScript` 支持三种形式：

- `tbc.Script`，例如 `transaction.outputs[codeVout].script`。
- `Buffer`，内容为完整锁定脚本字节。
- hex 字符串，大小写均可，不带 `0x` 前缀，不接受 ASM 文本。

不直接接受 txid、交易 raw、UTXO 对象或 `Transaction` 对象。已取得 UTXO 时传 `utxo.script`；已取得交易时先选中真实的 Code vout。输入错误、脚本不完整、未知模板或类别不符均返回 `null`，不能将其默认分配给旧 SDK。

成功时返回只读对象，所有结果都有 `family`、`version`、`sdk`、`codeBytes`。旧 FT、稳定币、NFT 另有 `legacyVersion`，用于区分同一旧 SDK 内部的脚本版本。

| 合约 | `family` | `version` | `legacyVersion` | `sdk`：包根导出名 |
| --- | --- | --- | --- | --- |
| Pool 1.0 | `pool` | `1` | 无 | `poolNFT` |
| Pool 2.0 | `pool` | `2` | 无 | `poolNFT2` |
| Pool 3.0 | `pool` | `3` | 无 | `PoolNFT3` |
| 旧普通 FT | `ft` | `legacy` | `1 / 2 / 3 / 4` | `FT` |
| TBC20 | `ft` | `tbc20` | 无 | `TBC20` |
| 旧稳定币 | `stablecoin` | `legacy` | 已登记模板的内部版本号 | `stableCoin` |
| Coin TBC20 | `stablecoin` | `tbc20` | 无 | `Coin` |
| 旧 NFT | `nft` | `legacy` | `0 / 1 / 2` | `NFT` |
| TBC721 | `nft` | `tbc721` | 无 | `TBC721` |

`sdk` 是字符串，不是已经初始化的实例。**Coin TBC20 对应的业务类是 `Coin`**，文件为 `lib/contract/coinTbc20`；根导出的 `CoinTBC20` 是底层 Code/Tape 编解码器，不能作为发行、转账、冻结等业务类使用。

Pool1 单独返回 `poolNFT`，避免将它误送给 `poolNFT2`。Pool3 的 `PoolNFT3` 也可使用包内别名 `poolNFT3`，识别结果统一返回 `PoolNFT3`。

## 2. 一次识别并取得 SDK 类

以下 CommonJS 示例可直接用于 Node.js。它返回对应的类引用；每个 SDK 的构造、初始化及交易参数不同，调用者在取得结果后按相应文档初始化。

```js
const sdk = require('tbc-contract');

function resolveContractSDK(codeScript) {
  const info = sdk.detectContractVersion(codeScript);
  if (!info) throw new Error('无法识别该 Code：请核对输出位置和合约模板');

  const classes = {
    poolNFT: sdk.poolNFT,
    poolNFT2: sdk.poolNFT2,
    PoolNFT3: sdk.PoolNFT3,
    FT: sdk.FT,
    TBC20: sdk.TBC20,
    stableCoin: sdk.stableCoin,
    Coin: sdk.Coin,
    NFT: sdk.NFT,
    TBC721: sdk.TBC721,
  };
  return { info, SDK: classes[info.sdk] };
}

// 构造用于展示的 Code，不发行资产、不花费 UTXO。
const code = sdk.TBC721.buildCodeScript('11'.repeat(32), 7);
const { info, SDK } = resolveContractSDK(code);
console.log(info);
// { family: 'nft', version: 'tbc721', sdk: 'TBC721', codeBytes: 234 }
console.log(SDK === sdk.TBC721); // true
```

在 TypeScript 中，可以按 `family`、`version` 或 `sdk` 缩小返回类型。例如 `info.family === 'ft' && info.version === 'legacy'` 时才存在 `info.legacyVersion`。

## 3. Pool 2.0 / Pool 3.0

Pool 应传状态锚点的 **Pool Code**，不能传池控 FT 或 LP Code。下面的函数接收真实池交易、可信底层 FT 创世交易和已知池 ID，展示两个版本各自的初始化方式。

```js
const { poolNFT, poolNFT2, PoolNFT3, detectPoolVersion } = require('tbc-contract');

async function openPool(poolTx, ftGenesisTx, poolId, network = 'testnet') {
  const code = poolTx.outputs[0]?.script;
  if (!code) throw new Error('交易缺少 Pool Code 输出');
  const info = detectPoolVersion(code);
  if (!info) throw new Error('不是受支持的 Pool Code');

  if (info.sdk === 'PoolNFT3') {
    // fromPool 还会检查 Code/Tape 配置与底层 FT 身份。
    const pool = PoolNFT3.fromPool(poolTx, ftGenesisTx);
    return { info, pool };
  }
  if (info.sdk === 'poolNFT2') {
    const pool = new poolNFT2({ txid: poolId, network });
    await pool.initfromContractId(); // 此初始化方法会查询网络。
    return { info, pool };
  }
  // Pool1 不适用 Pool2/Pool3 接口，由应用选择是否支持。
  throw new Error(`检测到 Pool1，请使用 ${poolNFT.name} 的独立接入流程`);
}
```

Pool2 普通版与带公钥前缀授权的版本都返回 `version: 2`；Pool3 普通版与 1–5 人白名单版都返回 `version: 3`。LP 是否锁仓属于配套 Tape/LP 配置，不由这个 Code 版本接口判断。Pool3 可通过 `readPoolState(poolTx).tape.withLpLocktime` 读取该配置。

识别或初始化后，应用还应核对自己的业务池 ID、Pool Code hash 和最新 outpoint，不能把“同版本”视为“同一个池”。

## 4. FT / TBC20

```js
const { FT, TBC20, detectFTVersion } = require('tbc-contract');

function selectTokenSDK(codeScript) {
  const info = detectFTVersion(codeScript);
  if (!info) throw new Error('不是已知的普通 FT/TBC20 Code');
  return { info, SDK: info.sdk === 'TBC20' ? TBC20 : FT };
}

// 只创建示例脚本，供本地识别。
const code = TBC20.instantiateCode({
  originalUTXO: { txId: '22'.repeat(32), outputIndex: 0 },
  tapeSize: 66,
  controller: Buffer.concat([Buffer.alloc(20, 0x33), Buffer.from([0])]),
});
const selected = selectTokenSDK(code.toHex());
console.log(selected.info.sdk); // TBC20
console.log(selected.SDK === TBC20); // true
```

`detectFTVersion` 只识别普通代币。旧稳定币、Coin TBC20、旧 FTLP 和 FTLPTBC20 不会返回 `FT` 或 `TBC20`。不知道类别时使用 `detectContractVersion`。

旧 FT 内部版本 v1–v4 都路由到 `FT`；TBC20 是独立协议，不使用旧 FT 的内部版本号。业务金额也需遵循对应接口：TBC20 使用原始整数单位，不能直接照搬旧 FT 的展示金额参数。

## 5. stableCoin / Coin TBC20

```js
const { stableCoin, Coin, CoinTBC20, detectStableCoinVersion } = require('tbc-contract');

function selectStableCoinSDK(codeScript) {
  const info = detectStableCoinVersion(codeScript);
  if (!info) throw new Error('不是已知的稳定币 Code');
  return { info, SDK: info.sdk === 'Coin' ? Coin : stableCoin };
}

// CoinTBC20 在这里仅用于构造示例 Code。
const code = CoinTBC20.instantiateCode({
  coinNftCodeHash: Buffer.alloc(32, 0x44),
  adminPubKeyHash: Buffer.alloc(20, 0x55),
  tapeSize: 66,
  controller: Buffer.concat([Buffer.alloc(20, 0x66), Buffer.from([0])]),
});
const selected = selectStableCoinSDK(code.toBuffer());
console.log(selected.info);
// { family: 'stablecoin', version: 'tbc20', sdk: 'Coin', codeBytes: 2981 }
console.log(selected.SDK === Coin); // true
```

应传稳定币资产 Code，不是发行凭证的 NFT Code。发行凭证若采用 TBC721 模板，其 Code 会被识别为 `TBC721`；脚本版本本身不能说明它在业务上是否作为发行凭证。

## 6. NFT / TBC721

```js
const { NFT, TBC721, detectNFTVersion } = require('tbc-contract');

function selectNFTSDK(nftTx, codeVout = 0) {
  const output = nftTx.outputs[codeVout];
  if (!output) throw new Error('NFT Code vout 不存在');
  const info = detectNFTVersion(output.script);
  if (!info) throw new Error('不是已知的 NFT/TBC721 Code');
  return { info, SDK: info.sdk === 'TBC721' ? TBC721 : NFT };
}

const tbc = require('tbc-lib-js');
const tx = new tbc.Transaction().addOutput(new tbc.Transaction.Output({
  script: NFT.buildCodeScript('77'.repeat(32), 2), satoshis: 200,
}));
const selected = selectNFTSDK(tx);
console.log(selected.info.sdk, selected.info.legacyVersion); // NFT 2
```

传入 NFT 的 Code，不能只取 `NHold` 输出或 `NTape`。旧 NFT v0/v1/v2 均路由到 `NFT`，该 SDK 的常规转移入口会根据输入 Code 选择对应实现；TBC721 路由到独立的 `TBC721`。

## 7. 从链上交易选择 Code 并识别

查询交易属于应用层网络操作，识别函数本身保持离线。以下代码要求显式指定 vout，适用于 Code 不在 vout0 的 FT/稳定币转账或发行交易。

```js
const { API, detectContractVersion } = require('tbc-contract');

async function detectByOutpoint(txid, codeVout, network = 'testnet') {
  if (!Number.isInteger(codeVout) || codeVout < 0) throw new Error('无效 vout');
  const tx = await API.fetchTXraw(txid, network);
  const output = tx.outputs[codeVout];
  if (!output) throw new Error(`交易没有 vout ${codeVout}`);
  const info = detectContractVersion(output.script);
  if (!info) throw new Error(`vout ${codeVout} 不匹配已知的资产 Code 模板`);
  return { txid: tx.id, codeVout, info };
}
```

如需显示交易中所有可识别的 Code，可以逐输出调用识别函数。一笔交易可能同时包含 Pool、底层 FT、NFT 发行凭证等多种资产；不要将第一个匹配结果当作整笔交易的唯一版本。

## 8. 识别范围

工具匹配完整模板及其构造参数边界，不仅比较长度、填充字节或末尾标记：

- 旧 FT / 稳定币复用 SDK 中的已登记模板和规范化摘要，区分同长度的普通 FT 与稳定币。
- TBC20、Coin TBC20、Pool3、TBC721 复用各自严格的 Code 解析或验证器。
- Pool1、Pool2、旧 NFT 按仓库现有构造器生成模板，保留可变参数位置，核对其余固定字节。Pool2 重复的 FT 长度、费用公钥哈希及授权前缀长度必须一致；支持 1–10 个、各 1–65 字节的等长授权公钥前缀。

`null` 表示“不匹配本 SDK 支持的模板”，不等同于链上脚本无效。其他历史编译产物、自定义模板或未登记版本需要单独接入，不能因保留相同 marker 就认为兼容。

识别成功只表示应使用哪个协议入口，不证明资产身份、发行唯一性、余额守恒、祖先链真实性、UTXO 未花费或锁已成熟；这些检查仍由对应 SDK、验证器和业务执行。接收 Code/Tape、NFT Hold 等完整输入后再构造交易。

## 9. 仓库验证

```sh
npm run test:versions
```

该命令先构建代码，再运行离线版本识别测试，覆盖协议路由、历史 FT、Pool 授权变体、非规范输入、跨类别排除和脚本篡改。包根导出和公开类型的验证还包含在 `npm run test:pool3` 中。
