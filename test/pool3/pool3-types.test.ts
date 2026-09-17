// This file is type-checked only; it is never executed against real UTXOs.
import * as tbc from "tbc-lib-js";
import * as sdkExports from "../../index";
import {
  PoolNFT3, poolNFT3, FTLPTBC20, privateKeySigner, decodePoolTape,
  calculateSwapFees, resolveSwapFeePolicy, deriveFeeRecipient, validatePool3Transaction,
} from "../../index";
import type {
  PreparedPool3Operation,
  PoolAuthorization, PoolNFT3Config, Pool3AssetInput, Pool3SignedInput,
  Pool3PoolInput, Pool3BuildResult, Pool3SigningIdentity, Pool3Signature,
  Pool3TransactionResolver,
  Pool3AddLPAmount,
} from "../../index";

declare const tx: tbc.Transaction;
declare const key: tbc.PrivateKey;
declare const funding: Pool3SignedInput;
declare const asset: Pool3AssetInput;
declare const pool: Pool3PoolInput;
declare const signatures: readonly Pool3Signature[];

const authorization: PoolAuthorization = { kind: "controller", controllerPubKeyHashes: ["11".repeat(20)] };
const config: PoolNFT3Config = { ftGenesisTx: tx, authorization, lp: { kind: "timelocked" }, lpPlan: 1 };
const sdk = new PoolNFT3(config);
const alias: typeof PoolNFT3 = poolNFT3;
const signer: Pool3SigningIdentity = privateKeySigner(key);
const resolver: Pool3TransactionResolver = new Map<string, tbc.Transaction>();
const restored: PoolNFT3 = PoolNFT3.fromPool(tx, tx);
const address = "13oCEJaqyyiC8iRrfup6PDL2GKZ3xQrsZL";
const policy = resolveSwapFeePolicy(1, 35);
const recipient = deriveFeeRecipient(address);
const breakdown = calculateSwapFees(1000000n, policy);
const state = sdk.readPoolState(tx);
const decoded = decodePoolTape(tx.outputs[1].script);
const bigAmount: bigint = decoded.ftLpAmount + breakdown.totalFeeSat;
const shared = { pool, funding, poolFT: asset, controllerSigner: signer };
const mint: Promise<Pool3BuildResult> = sdk.mintPoolNFT({ funding });
const add: Promise<Pool3BuildResult> = sdk.addLP({ ...shared, userFT: asset, incrementSat: 1000000n, firstFtAmountRaw: 2000000n, lpReceiverAddress: address, lpLockTime: 0 });
const addByFt: Promise<Pool3BuildResult> = sdk.addLP({ ...shared, userFT: asset, incrementFtRaw: 2000000n, maxTbcInSat: 1000000n, lpReceiverAddress: address, lpLockTime: 0 });
const remove: Promise<Pool3BuildResult> = sdk.removeLP({ ...shared, userLP: asset, burnAmountRaw: 100n, receiverAddress: address });
const swapFT: Promise<Pool3BuildResult> = sdk.swapFT({ ...shared, inputTbcSat: 1000000n, receiverAddress: address, minFtOutRaw: 1n });
const swapTBC: Promise<Pool3BuildResult> = sdk.swapTBC({ ...shared, userFT: asset, inputFtRaw: 1000000n, receiverAddress: address, minTbcOutSat: 42n });
const transfer: Promise<Pool3BuildResult> = sdk.transferLP({ inputs: [asset], funding, receiverAddress: address, amountRaw: 100n });
const unlock: Promise<Pool3BuildResult> = sdk.unlockLP({ inputs: [asset], funding, receiverAddress: address });
const prepared: PreparedPool3Operation = sdk.prepareAddLP({ ...shared, userFT: asset, incrementSat: 1000000n, lpReceiverAddress: address, lpLockTime: 0 });
const finalized: Pool3BuildResult = prepared.finalize(signatures);
const report = validatePool3Transaction(finalized.transaction);
const requests = prepared.signingRequests;
const lpCode = FTLPTBC20.instantiateCode({ poolCodeHash: state.poolCodeHash, controller: Buffer.alloc(21), tapeSize: 66, timelocked: true });
const lpDescriptor = FTLPTBC20.parseCode(lpCode);
sdk.quoteAddLP(tx, 100n);
const ftBudget: Pool3AddLPAmount = { incrementFtRaw: 100n };
const ftBudgetQuote = sdk.quoteAddLP(tx, ftBudget);
sdk.quoteAddLP(tx, { incrementSat: 100n, firstFtAmountRaw: 200n });
const pricingReserveIncrement: bigint = ftBudgetQuote.tbcReserveIncrementSat;
sdk.quoteRemoveLP(tx, 100n);
sdk.quoteSwapFT(tx, 100n);
sdk.quoteSwapTBC(tx, 100n);
void [alias, resolver, restored, bigAmount, mint, add, addByFt, pricingReserveIncrement, remove, swapFT, swapTBC, transfer, unlock,
  report, requests, lpDescriptor, recipient];

// @ts-expect-error Amounts cannot be floating-point JavaScript numbers.
sdk.quoteSwapFT(tx, 0.5);
// @ts-expect-error RemoveLP uses direct proportional amounts, not a fixed-point ratio.
sdk.quoteRemoveLP(tx, 100n).ratio;
// @ts-expect-error Exactly one AddLP asset budget is accepted.
sdk.quoteAddLP(tx, { incrementSat: 100n, incrementFtRaw: 200n });
// @ts-expect-error AddLP needs one asset budget.
sdk.quoteAddLP(tx, {});
// @ts-expect-error Initial pricing requires the TBC-input mode, not an FT budget.
sdk.quoteAddLP(tx, { incrementFtRaw: 100n, firstFtAmountRaw: 200n });
// @ts-expect-error Object-based amounts carry the initial FT quantity inside the object.
sdk.quoteAddLP(tx, { incrementSat: 100n }, 200n);
// @ts-expect-error The builder also rejects two simultaneous asset budgets.
sdk.prepareAddLP({ ...shared, userFT: asset, incrementSat: 100n, incrementFtRaw: 200n, lpReceiverAddress: address });
// @ts-expect-error FT budgets must use bigint raw units.
sdk.prepareAddLP({ ...shared, userFT: asset, incrementFtRaw: 0.5, lpReceiverAddress: address });
// @ts-expect-error A public pool has no whitelist field.
const badAuth: PoolAuthorization = { kind: "public", controllerPubKeyHashes: [] };
// @ts-expect-error A controller whitelist is a list, not one hash string.
const badHashes: PoolAuthorization = { kind: "controller", controllerPubKeyHashes: "11".repeat(20) };
// @ts-expect-error FT output protection is required by the swapFT builder.
sdk.prepareSwapFT({ ...shared, inputTbcSat: 1000000n, receiverAddress: address });
// @ts-expect-error Prepared operations are obtained from builders, not constructed by consumers.
new sdkExports.PreparedPool3Operation();
// @ts-expect-error Raw template construction is intentionally not a package-root API.
sdkExports.instantiatePoolCode;
void [badAuth, badHashes];
