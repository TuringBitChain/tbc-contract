/** Package-only fixture: must type-check with index.d.ts and no lib sources. */
import { PrivateKey, Script, Transaction } from "tbc-lib-js";
import { Coin, stableCoin, CoinTBC20, type AdminPrepared, type CoinAncestors } from "../..";

declare const key: PrivateKey;
declare const admin: Buffer;
declare const utxo: Transaction.IUnspentOutput;
declare const parent: Transaction;
declare const address: string;
declare const signatures: Buffer[];

const current = new Coin({ name: "Current", symbol: "NEW", decimal: 0, amount: "9007199254740993" });
current.initialize({ name: "Current", symbol: "NEW", decimal: 0, totalSupply: "9007199254740993",
  codeScript: "00", tapeScript: "00" });
const ancestors: CoinAncestors = new Map([[parent.id, parent]]);
const transfer: string = current.transfer(key, address, "1", [utxo], utxo, [parent], ancestors);
const issue: AdminPrepared<string[]> = current.createCoin(admin, key, address, utxo, parent);
const freeze: AdminPrepared<string> = current.freezeCoinUTXO(admin, key, 800000, [utxo], utxo, [parent], ancestors);
const legacy = new stableCoin({ name: "Original", symbol: "OLD", decimal: 2, amount: 100 });
const oldTransfer: string = legacy.transfer(key, address, "1", [utxo], utxo, [parent], ["57"]);
const encoded: Script = CoinTBC20.buildTape({ amounts: [1n, 0n, 0n, 0n, 0n, 0n], tapeSize: 66, lockTime: 0 });
const controllerCode: Script = Coin.buildFTtransferCode(current.codeScript, address);
const transferTape: Script = Coin.buildFTtransferTape(current.tapeScript, "00".repeat(48));
const singleAmounts: { amountHex: string; changeHex: string } = Coin.buildTapeAmount(1n, [2n], 1);
const multipleAmounts: string[] = Coin.buildMultiTapeAmounts([1n], [2n]);
legacy.initialize({ name: "Original", symbol: "OLD", decimal: 2, totalSupply: 10000n,
  contractTxid: "00", codeScript: "00", tapeScript: "00" });
const legacyMerge: Array<{ txraw: string }> = legacy.mergeCoin(key, [utxo], utxo, [parent], ["57"]);
// @ts-expect-error Serialized legacy proofs do not satisfy the new Coin API.
current.transfer(key, address, "1", [utxo], utxo, [parent], ["57"]);
// @ts-expect-error The low-level codec is distinct from the transaction-building class.
CoinTBC20.createCoin(admin, key, address, utxo, parent);
void [transfer, issue.finalize(signatures), freeze.finalize(signatures), oldTransfer, encoded,
  controllerCode, transferTape, singleAmounts, multipleAmounts, legacyMerge];
