# TBC721 Standard

TBC721 Standard 的业务类为 `TBC721Standard`，使用 `apc-contract/src/tbc721.ct` 的 `TBC721CODE3` 模板，实现在 `lib/contract/tbc721-standard.ts`，解锁见证位于 `lib/util/tbc721-standard/tbc721-standard-unlock.ts`。随包提供的 `lib/util/tbc721-standard/artifacts/tbc721-standard.json` 对应不带 `--fill` 的编译产物。

```ts
import { TBC721Standard } from 'tbc-contract';
import { Transaction } from 'tbc-lib-js';

// 创建合集，并使用其中一个未花费铸造槽位发行 NFT。
const collectionRaw = TBC721Standard.createCollection(address, privateKey, collectionData, feeUTXOs);
const collectionTX = new Transaction(collectionRaw);
// mintSlot 是 collectionTX 中的一个未花费铸造槽位，手续费 UTXO 另行准备。
const nftRaw = TBC721Standard.createNft(collectionTX.id, address, privateKey, nftData, nextFeeUTXOs, mintSlot);
const nftTX = new Transaction(nftRaw);
const nft = new TBC721Standard(nftTX.id);
const transferRaw = nft.transferNft(address, recipient, privateKey, transferFeeUTXOs, nftTX, collectionTX);
```

构造方法返回原始交易，不广播。交易按依赖顺序发送。`createCollection` 返回包含元数据和铸造槽位的单笔交易；`createNft` 消费其中一个槽位。也支持 `batchCreateNft` 及 `transferNftWithTbc`，后者的 TBC 数量使用显示单位，建议传十进制字符串。

SDK 保持 Code/Hold/Tape 三个连续输出，金额为 200/100/0 sat。转移消费父交易的 Code 和 Hold，Code 始终位于输入及输出第 0 位，字节与父交易 Code 一致。祖交易参数必须是父交易首输入实际引用的交易，首次铸造来源支持非零 vout。

底层 `buildUnlockScript` 支持私钥签名或带 SIGHASH 字节的外部签名。`buildUnlockScriptSchnorr` 接收 64 字节 Schnorr 签名及 32 字节 x-only 公钥。20 字段 ABI 包含真实顺序的全部当前输入、父交易、祖交易及当前输出证明。`parseCode` 严格匹配模板并返回发行来源 outpoint，`isTbc721StandardCode` 用于识别该模板。

TBC20 Stablecoin 的发行凭证使用同一 TBC721 Standard 模板，由 `TBC20Stablecoin.buildCoinNftTx` 构建。首次发行和增发均使用上述解锁见证，详情见 [TBC20 Stablecoin](./tbc20-stablecoin.md)。

TBC721 Standard 在链上约束发行来源、Code 连续性、首输入位置及持有人签名。Hold/Tape 的标准布局、元数据保留和合集供应量需由 SDK 或索引器验证，不能把这些约定当作合约强制规则。

离线验证：

```sh
npm run test:tbc721-standard
npm run test:tbc20-stablecoin
```
