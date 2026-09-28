# 合约查询 API

`API` 为 TBC20 Standard、TBC20 Stablecoin、TBC721 Standard、TBC20 LP 和 TBC AMM 提供查询入口。`network` 接受 `"mainnet"`、`"testnet"` 或自定义基础 URL，默认主网。

```ts
import { API, TBC20Standard, TBC20Stablecoin, TBC721Standard, TBCAMM } from 'tbc-contract';

const network = 'testnet';
```

## 路径与金额

| 合约 | 查询路径 |
| --- | --- |
| TBC20 Standard | `ft/info/contract/{id}`、`ft/tokenbalance/combinescript/{controller}/contract/{id}`、`ft/utxo/combinescript/{controller}/contract/{id}` |
| TBC20 Stablecoin | `stablecoin/info/stablecoinid/{id}`、`stablecoin/tokenbalance/combinescript/{controller}/stablecoinid/{id}`、`stablecoin/utxo/combinescript/{controller}/stablecoinid/{id}` |
| TBC721 Standard | `nft/nftinfo/nftid/{id}`、`nft/nftbycollection/collectionid/{id}/start/{start}/end/{end}`、`nft/utxo/scriptpubkeyhash/{hash}` |
| NFT 铸造槽 | `utxo/scriptpubkeyhash/{hash}` |
| TBC AMM | `pool/poolinfo/poolid/{id}` |
| TBC20 LP | `pool/lputxo/scriptpubkeyhash/{hash}` |
| 父交易与祖交易 | `txraw/txid/{txid}` |

`addressOrHash` 接受 P2PKH 地址或 40 位十六进制合约控制器哈希。查询时分别编码为 `公钥哈希 + 00` 和 `合约哈希 + 01`。脚本查询的 `hash` 为完整脚本 SHA256 的反向十六进制。

余额、供应量及 `amountRaw` 均使用原始最小单位 `bigint`。接口保留 JSON 大整数精度；小数和科学计数法不能作为原始整数金额。UTXO 的 `satoshis`、`outputIndex`、`lockTime` 使用范围校验后的 `number`。

## TBC20 Standard

| 方法 | 参数 | 返回 |
| --- | --- | --- |
| `fetchTbc20StandardInfo` | `contractTxid, network?` | `TBC20StandardInfo` |
| `getTbc20StandardBalance` | `contractTxid, addressOrHash, network?` | `bigint` |
| `fetchTbc20StandardUtxoList` | `contractTxid, addressOrHash, codeScript, network?` | `TBC20StandardUtxo[]` |
| `fetchTbc20StandardUtxo` | `contractTxid, addressOrHash, amountRaw, codeScript, network?` | `TBC20StandardUtxo` |
| `fetchTbc20StandardUtxos` | `contractTxid, addressOrHash, amountRaw, codeScript, network?, maxInputs?` | `TBC20StandardUtxo[]` |
| `fetchTbc20StandardAncestors` | `parentTx, codeVout, network?` | `Transaction[]` |

`Info` 包含 `contractTxid`、`codeScript`、`tapeScript`、`name`、`symbol`、`decimal`、`totalSupply`，以及按 `decimal` 换算的精确展示字符串 `supply`。

```ts
const contractTxid = 'TOKEN_GENESIS_TXID';
const address = 'HOLDER_ADDRESS';
const info = await API.fetchTbc20StandardInfo(contractTxid, network);
const token = new TBC20Standard({
  contractTxid: info.contractTxid,
  codeScript: info.codeScript,
  tapeScript: info.tapeScript,
});

const balanceRaw = await API.getTbc20StandardBalance(contractTxid, address, network);
const utxos = await API.fetchTbc20StandardUtxos(
  contractTxid, address, 1_000_000n, info.codeScript, network,
);
const parents = utxos.map(utxo => utxo.parentTx);
const ancestors = await Promise.all(utxos.map(utxo =>
  API.fetchTbc20StandardAncestors(utxo.parentTx, utxo.outputIndex, network),
));
// utxos、parents、ancestors 可按相同顺序传入 token.transfer 或 token.merge。
```

`codeScript` 可以是该资产的发行脚本；查询会按 `addressOrHash` 重建持有人控制器，并与实际父交易中的 Code 对照。列表记录包含普通 UTXO 字段、`ftBalance`、`parentTx`、`tapeScript`。

## TBC20 Stablecoin

| 方法 | 参数 | 返回 |
| --- | --- | --- |
| `fetchTbc20StablecoinInfo` | `contractTxid, network?` | `TBC20StablecoinInfo` |
| `getTbc20StablecoinBalance` | `contractTxid, addressOrHash, network?` | `bigint` |
| `fetchTbc20StablecoinUtxoList` | `contractTxid, addressOrHash, codeScript, network?` | `TBC20StablecoinUtxo[]` |
| `fetchTbc20StablecoinUtxo` | `contractTxid, addressOrHash, amountRaw, codeScript, network?` | `TBC20StablecoinUtxo` |
| `fetchTbc20StablecoinUtxos` | `contractTxid, addressOrHash, amountRaw, codeScript, network?, maxInputs?` | `TBC20StablecoinUtxo[]` |
| `fetchTbc20StablecoinAncestors` | `parentTx, codeVout, network?` | `Transaction[]` |

`Info` 直接包含初始化字段及当前发行凭证交易 ID `issuanceTxid`。`totalSupply` 是原始整数累计供应量。

```ts
const stablecoinId = 'STABLECOIN_GENESIS_TXID';
const info = await API.fetchTbc20StablecoinInfo(stablecoinId, network);
const coin = new TBC20Stablecoin(stablecoinId);
coin.initialize(info);

const utxos = await API.fetchTbc20StablecoinUtxos(
  stablecoinId, 'HOLDER_ADDRESS', 1_000_000n, info.codeScript, network,
);
const ancestors = await Promise.all(utxos.map(utxo =>
  API.fetchTbc20StablecoinAncestors(utxo.parentTx, utxo.outputIndex, network),
));
const issuerTx = await API.fetchTXraw(info.issuanceTxid, network);
```

UTXO 的 `lockTime` 从父交易 Tape 读取；索引提供 `lock_time` 时会核对一致性。改变持有人时保留 Code 中的管理员和发行凭证身份。

## TBC721 Standard

| 方法 | 参数 | 返回 |
| --- | --- | --- |
| `fetchTbc721StandardInfo` | `contractId, network?` | `TBC721StandardInfo` |
| `fetchTbc721StandardNfts` | `collectionId, address, start, end, network?` | `string[]`，该地址的 NFT ID |
| `fetchTbc721StandardTxo` | `{ script, txId?, network? }` | `Transaction.IUnspentOutput` |
| `fetchTbc721StandardTxos` | `{ script, txId, network? }` | `Transaction.IUnspentOutput[]` |

```ts
const nftId = 'NFT_CONTRACT_TXID';
const nft = new TBC721Standard(nftId);
nft.initialize(await API.fetchTbc721StandardInfo(nftId, network));

const collectionId = 'COLLECTION_TXID';
const mintSlots = await API.fetchTbc721StandardTxos({
  script: TBC721Standard.buildMintScript('MINTER_ADDRESS').toHex(),
  txId: collectionId,
  network,
});
```

元数据字段使用 `nftAttributes`，接口返回空属性时该值为空字符串。带 `txId` 的 TXO 查询使用通用 UTXO 路径，按交易 ID 筛选并按输出序号排序，适用于合集的 Mint NHold 槽；不带 `txId` 的单笔查询使用 NFT UTXO 路径。

## TBC AMM 与 TBC20 LP

| 方法 | 参数 | 返回 |
| --- | --- | --- |
| `fetchTbcAmmInfo` | `contractTxid, network?` | `TBCAMMInfo` |
| `fetchTbcAmmUtxo` | `contractTxid, network?` | `TBCAMMUtxo` |
| `fetchTbcAmmInput` | `contractTxid, network?` | `TBCAMMPoolInput`，含 `parentTx`、`ancestorTx` |
| `getTbc20LpBalance` | `codeScript, network?` | `bigint` |
| `fetchTbc20LpUtxoList` | `codeScript, network?` | `TBC20LPUtxo[]` |
| `fetchTbc20LpUtxo` | `codeScript, amountRaw, network?` | `TBC20LPUtxo` |
| `fetchTbc20LpUtxos` | `codeScript, amountRaw?, network?, maxInputs?` | `TBC20LPUtxo[]` |
| `fetchTbc20LpAncestors` | `parentTx, codeVout, network?` | `Transaction[]` |

`TBCAMMInfo` 携带当前父交易、Code、Tape、授权配置、服务提供者地址和当前 outpoint。Pool 类型及 Tape 中的代币身份由交易脚本解析，`poolVersion` 表示 SDK 的 TBC AMM。`info.tape` 包含 `ftLpAmount`、`ftAAmount`、`tbcAmount`、`ftAContractId`、`lpPlan`、费率、Code 长度及锁定配置。

```ts
const poolId = 'POOL_CONTRACT_TXID';
const poolInfo = await API.fetchTbcAmmInfo(poolId, network);
const ftGenesis = await API.fetchTXraw(poolInfo.tape.ftAContractId, network);
const pool = TBCAMM.fromPool(poolInfo.parentTx, ftGenesis);
const poolInput = await API.fetchTbcAmmInput(poolId, network);
// poolInput 可直接作为 TBC AMM 操作参数中的 pool。

const lpCodeScript = 'HOLDER_LP_CODE_HEX';
const lpUtxo = await API.fetchTbc20LpUtxo(lpCodeScript, 1_000_000n, network);
const lpAncestors = await API.fetchTbc20LpAncestors(lpUtxo.parentTx, lpUtxo.outputIndex, network);
```

LP 查询传入该持有人的完整 LP Code。返回记录包含 `ftBalance`、`parentTx`、`tapeScript`、`timelocked`、`lockTime`；锁值来自实际 Tape。余额查询会汇总经过父交易核对的 LP 输出。

## 选币、证明与错误

- `UtxoList` 返回全部索引记录，没有记录时返回空数组。
- `Utxo` 要求单个输出足够覆盖正整数 `amountRaw`。
- `Utxos` 默认最多选择 5 个输入，`maxInputs` 范围为 `1..5`。`amountRaw` 为 `undefined` 时选择余额最大的兼容输入组；指定金额时选取足够覆盖金额的输入。
- 稳定币和 LP 的非零高度锁与时间戳锁不会放在同一输入组。未锁定输出可与任一组组合；查询不判断当前链高或时间是否已满足锁条件。
- Token/LP UTXO 查询会读取 `txraw`，检查交易 ID、500/0 sat 的 Code/Tape 布局、脚本和余额。单次查询缓存重复父交易，每批最多 8 个并发 raw 请求。
- `Ancestors` 返回 Tape 非零槽对应的完整祖交易，并按交易 ID 去重。结果用于当前合约解锁器，不是 FT 的编码证明字符串。
- 服务错误保留 `code`、`status`、`requestId`。响应错误、字段不合法和索引数据与父交易不一致时抛出异常。

这些方法查询并整理交易数据。构建交易仍需使用最新未花费状态；花费是否满足完整合约规则由交易构建及脚本验证流程检查。
