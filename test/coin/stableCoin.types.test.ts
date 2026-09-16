/** Compile-only package-root consumer fixture; no network or runtime execution. */
import { PrivateKey, Transaction, Script } from "tbc-lib-js";
import {
  Coin,
  stableCoin,
  CoinTBC20,
  type AdminPrepared,
  type CoinAncestors,
  type CoinCodeOptions,
  type CoinTapeDescriptor,
  type CoinTBC20UnlockWithPrivateKeyOptions,
  type CoinTBC20UnlockWithSignatureOptions,
  type TBC20AncestorResolver,
} from "../..";
import type {
  CoinTBC20UnlockWithPrivateKeyOptions as DeepPrivateKeyOptions,
  CoinTBC20UnlockWithSignatureOptions as DeepSignatureOptions,
} from "../../lib/util/coin/coinTbc20unlock";
import type { CoinTBC20 as DeepCodec } from "../../lib/util/coin/coinTbc20Code";

declare const key: PrivateKey;
declare const admin: Buffer;
declare const address: string;
declare const utxo: Transaction.IUnspentOutput;
declare const parent: Transaction;
declare const ancestor: Transaction;
declare const signature64: Buffer;

const coin = new Coin({ name: "Zero Decimal", symbol: "ZERO", amount: "123", decimal: 0 });
coin.initialize({
  codeScript: "00", tapeScript: "00", totalSupply: "123", decimal: 0,
  name: "Zero Decimal", symbol: "ZERO", contractTxid: "00",
});
const sharedTransactions: Transaction[] = [ancestor];
const sharedMap: TBC20AncestorResolver = new Map([[ancestor.id, ancestor]]);
const sharedResolver: TBC20AncestorResolver = txid => sharedTransactions.find(tx => tx.id === txid);
const perInput: readonly TBC20AncestorResolver[] = [sharedMap];
const proofVariants: CoinAncestors[] = [sharedTransactions, sharedMap, sharedResolver, perInput];
for (const proofs of proofVariants) {
  const raw: string = coin.transfer(key, address, "1", [utxo], utxo, [parent], proofs);
  const annotated: string = coin.transferWithAdditionalInfo(key, address, "1", [utxo], utxo, [parent], proofs, Buffer.from("memo"));
  const batch: Array<{ txraw: string }> = coin.batchTransfer(key, [{ address, amount: "1" }], [utxo], utxo, [parent], proofs);
  const merged: Array<{ txraw: string }> = coin.mergeCoin(key, [utxo], utxo, [parent], proofs);
  const alias: Array<{ txraw: string }> = coin.mergeFT(key, [utxo], utxo, [parent], proofs);
  const freeze: AdminPrepared<string> = coin.freezeCoinUTXO(admin, key, 100, [utxo], utxo, [parent], proofs);
  const thaw: AdminPrepared<string> = coin.unfreezeCoinUTXO(admin, key, [utxo], utxo, [parent], proofs);
  void [raw, annotated, batch, merged, alias, freeze, thaw];
}
const prepared: AdminPrepared<string[]> = coin.createCoin(admin, key, address, utxo, parent);
const mint: AdminPrepared<string> = coin.mintCoin(admin, key, address, "1", utxo, parent, ancestor);
const issued: string[] = prepared.finalize(prepared.sighashes.map(() => signature64));
const minted: string = mint.finalize(mint.sighashes.map(() => signature64));

const codeOptions: CoinCodeOptions = {
  coinNftCodeHash: Buffer.alloc(32), adminPubKeyHash: Buffer.alloc(20),
  tapeSize: 66, controller: Buffer.alloc(21),
};
const code: Script = CoinTBC20.instantiateCode(codeOptions);
const descriptor = CoinTBC20.validateCode(code, { tapeSize: 66 });
const tape: Script = CoinTBC20.buildTape({
  amounts: [1n, 0n, 0n, 0n, 0n, 0n], tapeSize: 66, lockTime: 0,
});
const parsed: CoinTapeDescriptor = CoinTBC20.parseTape(tape, descriptor);
CoinTBC20.replaceController(code, Buffer.alloc(21));
CoinTBC20.replaceTapeAmounts(tape, parsed.amounts);
CoinTBC20.setLockTime(tape, 500000001);
CoinTBC20.getRequiredLockTime([0, 500000001]);
CoinTBC20.verifyInputLock(parent, 0, tape, descriptor, true);
const coinUTXO: Transaction.IUnspentOutput = Coin.buildUTXO(parent, 0);
const balance: bigint = Coin.getBalanceFromTape(tape.toHex());
const nftOutputs: Transaction.Output[] = Coin.buildCoinNftOutput(code, code, tape);

const unlockOptions: CoinTBC20UnlockWithPrivateKeyOptions = {
  currentTx: parent, inputIndex: 0, preTx: ancestor, preTxVout: 0,
  outputGroups: [{ codeVout: 0, tapeVout: 1 }, { codeVout: 2 }],
  ancestorTransactions: sharedMap, privateKey: key,
  contractController: { transaction: ancestor, currentInputIndex: 1 },
};
const unlock: Script = Coin.getUnlockScript(unlockOptions);
const externalOptions: CoinTBC20UnlockWithSignatureOptions = {
  ...unlockOptions, signature: Buffer.alloc(65), publicKey: admin,
};
const external: Script = Coin.getUnlockScriptWithSignature(externalOptions);
const deepPrivate: DeepPrivateKeyOptions = unlockOptions;
const deepSignature: DeepSignatureOptions = externalOptions;
const roundTripPrivate: CoinTBC20UnlockWithPrivateKeyOptions = deepPrivate;
const roundTripSignature: CoinTBC20UnlockWithSignatureOptions = deepSignature;
const deepCodec: typeof DeepCodec = CoinTBC20;
const publicCodec: typeof CoinTBC20 = deepCodec;

const legacy = new stableCoin({ name: "Legacy", symbol: "OLD", amount: 1, decimal: 1 });
const legacyPrepared: AdminPrepared<string[]> = legacy.createCoin(admin, key, address, utxo, parent);
const oldRaw: string = legacy.transfer(key, address, "1", [utxo], utxo, [parent], ["57"]);
const initializedLegacy = new stableCoin("00");
const oldCompatible: string = initializedLegacy.transfer(key, address, "1", [utxo], utxo, [parent], ["57"]);
void [issued, minted, coinUTXO, balance, nftOutputs, unlock, external, roundTripPrivate,
  roundTripSignature, publicCodec, legacyPrepared, oldRaw, oldCompatible];

// New and old APIs must retain distinct ancestor proof types.
// @ts-expect-error coin accepts actual ancestors, never old serialized FT proofs.
coin.transfer(key, address, "1", [utxo], utxo, [parent], ["57"]);
