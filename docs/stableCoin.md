# StableCoin：旧版 FT 稳定币

`stableCoin` 是 FT 稳定币业务类，使用 `FTape` 和 coinNft 发行凭证。TBC20 Stablecoin 使用独立的业务类 [`TBC20Stablecoin`](./tbc20-stablecoin.md)，实现在 `lib/contract/tbc20-stablecoin.ts`。

| 业务 | 包根导出 | 实现 | 发行凭证 |
| --- | --- | --- | --- |
| 旧版 FT 稳定币 | `stableCoin` | `lib/contract/stableCoin.ts` | 旧 coinNft |
| TBC20 Stablecoin | `TBC20Stablecoin` | `lib/contract/tbc20-stablecoin.ts` | TBC721 Standard |

FT 稳定币通过 `stableCoin` 发行和管理。转账、批量转账、合并和冻结／解冻的祖交易证明参数为 `prepreTxData: string[]`。

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

已有 FT 稳定币可通过 `new stableCoin(contractTxid)` 和 `initialize` 恢复元数据。`API.fetchCoinInfo`、`API.fetchCoinUTXOs` 与 `API.fetchFtPrePreTxData` 分别用于查询元数据、UTXO 和祖交易证明。

`createCoin`、`mintCoin`、`freezeCoinUTXO` 和 `unfreezeCoinUTXO` 返回 `AdminPrepared<R>`。管理员使用 32 字节 MuSig2 聚合公钥，对每个 `sighashes` 中的消息提供一个 64 字节 Schnorr 签名，再调用 `finalize(signatures64)`；手续费输入使用独立普通私钥。MuSig2 聚合流程参见 [TBC20 Stablecoin 签名示例](./tbc20-stablecoin.md#管理员-musig2-签名)。首次发行返回 `[issuerRaw, firstMintRaw]`，增发返回一笔交易原文。

所有构造方法只返回交易，不会自动广播。调用方按依赖顺序发送发行、批量转账或合并返回的交易。`mergeCoin` 的可选 `localTX` 参数用于维护合并链的祖交易数据。
