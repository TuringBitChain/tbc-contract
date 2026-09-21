# StableCoin：旧版 FT 稳定币

`stableCoin` 保留原 FT 稳定币实现，使用 `FTape` 和旧 coinNft 发行凭证。新版基于 TBC20 的稳定币独立为 `lib/contract/coinTbc20.ts`，包根导出名为 [`Coin`](./coinTbc20.md)。两者与 `NFT` / `TBC721` 一样，通过不同入口使用。

| 业务 | 包根导出 | 实现 | 发行凭证 |
| --- | --- | --- | --- |
| 旧版 FT 稳定币 | `stableCoin` | `lib/contract/stableCoin.ts` | 旧 coinNft |
| 新版 TBC20 稳定币 | `Coin` | `lib/contract/coinTbc20.ts` | 新发行使用 TBC721，既有 Coin TBC20 保留绑定的凭证 |

原有调用方继续导入 `stableCoin`，不会创建新版资产。旧版转账、批量转账、合并和冻结／解冻仍接受 `prepreTxData: string[]`，不能把新版 Coin 祖交易对象替换成旧证明字符串。

```ts
import * as tbc from "tbc-lib-js";
import { stableCoin, type AdminPrepared } from "tbc-contract";

const legacyToken = new stableCoin({
  name: "Legacy USD", symbol: "LUSD", amount: 1000000, decimal: 6,
});

function prepareLegacyIssuance(
  aggPubkey32: Buffer,
  feeKey: tbc.PrivateKey,
  recipient: string,
  feeUTXO: tbc.Transaction.IUnspentOutput,
  fundingTX: tbc.Transaction,
): AdminPrepared<string[]> {
  return legacyToken.createCoin(
    aggPubkey32, feeKey, recipient, feeUTXO, fundingTX,
  );
}

function transferLegacy(
  holderKey: tbc.PrivateKey,
  recipient: string,
  coinUTXOs: tbc.Transaction.IUnspentOutput[],
  feeUTXO: tbc.Transaction.IUnspentOutput,
  parentTXs: tbc.Transaction[],
  prepreTxData: string[],
): string {
  return legacyToken.transfer(
    holderKey, recipient, "10.5", coinUTXOs, feeUTXO,
    parentTXs, prepreTxData,
  );
}
```

已有旧币可通过 `new stableCoin(contractTxid)` 和 `initialize` 恢复元数据。`API.fetchCoinInfo`、`API.fetchCoinUTXOs` 与 `API.fetchFtPrePreTxData` 的旧币调用方式保留；这些索引接口是否支持新版 Coin 应另行确认。

`createCoin`、`mintCoin`、`freezeCoinUTXO` 和 `unfreezeCoinUTXO` 返回 `AdminPrepared<R>`。管理员使用 32 字节 MuSig2 聚合公钥，对每个 `sighashes` 中的消息提供一个 64 字节 Schnorr 签名，再调用 `finalize(signatures64)`；手续费输入使用独立普通私钥。MuSig2 聚合流程参见 [Coin TBC20 签名示例](./coinTbc20.md#管理员-musig2-签名)。首次发行返回 `[issuerRaw, firstMintRaw]`，增发返回一笔交易原文。

所有构造方法只返回交易，不会自动广播。调用方按依赖顺序发送发行、批量转账或合并返回的交易。旧版 `mergeCoin` 的可选 `localTX` 参数保留，用于维护合并链的祖交易数据；旧资产的 Code、Tape、锁字段及解锁 ABI 不随新版入口拆分而迁移。
