import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as tbc from "tbc-lib-js";

const TBC20 = require("../lib/contract/tbc20");
import {
  TBC20_CODE_MARKER,
  TBC20_TAPE_MARKER,
  TBC20_TAPE_PREFIX,
  getTBC20CodeIdentity,
  getTBC20Controller,
  getTBC20CurrentOutputData,
  getTBC20PrePreTxArray,
  getTBC20PreTxData,
  encodeTBC20UnsignedLE,
  buildTBC20UnlockScriptWithSignature,
} from "../lib/util/tbc20/tbc20unlock";

const OWNER_WIF =
  "L1u2TmR7hMMMSV9Bx2Lyt3sujbboqEFqnKygnPRnQERhKB4qptuK";
const FUNDING_TXID = "11".repeat(32);
const SUPPLY = 1_000n;

type LocalFixture = ReturnType<typeof createLocalFixture>;
type MetadataConvenienceFixture = ReturnType<typeof createMetadataConvenienceFixture>;

let cachedFixture: LocalFixture | undefined;
let cachedMetadataConvenienceFixture: MetadataConvenienceFixture | undefined;

function withoutInterpreterLogs<T>(fn: () => T): T {
  const originalLog = console.log;
  try {
    // tbc-lib-js@1.0.30 logs the main stack before every non-push opcode.
    console.log = () => {};
    return fn();
  } finally {
    console.log = originalLog;
  }
}

function verifyInput(tx: tbc.Transaction, inputIndex: number): any {
  return withoutInterpreterLogs(() => tx.verifyScript(inputIndex));
}

interface SignatureCall {
  transaction: tbc.Transaction;
  inputIndex: number;
}

function captureSignatureCalls<T>(fn: () => T): { result: T; calls: SignatureCall[] } {
  const prototype = (tbc.Transaction as any).prototype;
  const original = prototype.getSignature;
  const calls: SignatureCall[] = [];
  prototype.getSignature = function(inputIndex: number, ...args: any[]): string {
    calls.push({ transaction: this as tbc.Transaction, inputIndex });
    return original.apply(this, [inputIndex, ...args]);
  };
  try {
    return { result: fn(), calls };
  } finally {
    prototype.getSignature = original;
  }
}

function buildUTXO(
  tx: tbc.Transaction,
  outputIndex: number,
): tbc.Transaction.IUnspentOutput {
  const output = tx.outputs[outputIndex];
  assert.ok(output, `missing output ${outputIndex}`);
  return {
    txId: tx.hash,
    outputIndex,
    script: output.script.toHex(),
    satoshis: output.satoshis,
  };
}

function pushHex(value: Buffer): string {
  return new tbc.Script().add(value).toHex();
}

function chunkBuffer(chunk: any): Buffer {
  return chunk.buf ? Buffer.from(chunk.buf) : Buffer.alloc(0);
}

function tokenInput(
  parentTx: tbc.Transaction,
  codeVout: number,
  ancestors: readonly tbc.Transaction[],
  signingKey: tbc.PrivateKey,
): any {
  return {
    utxo: TBC20.buildUTXO(parentTx, codeVout),
    parentTx,
    ancestors,
    signingKey,
  };
}

function createLocalFixture() {
  const ownerKey = tbc.PrivateKey.fromString(OWNER_WIF);
  const ownerAddress = ownerKey.toAddress().toString();
  const fundingUTXO: tbc.Transaction.IUnspentOutput = {
    txId: FUNDING_TXID,
    outputIndex: 0,
    script: tbc.Script.buildPublicKeyHashOut(ownerAddress).toHex(),
    satoshis: 100_000,
  };
  const extensionData = Buffer.concat([
    Buffer.from([5]),
    Buffer.from("local", "ascii"),
    Buffer.from([TBC20_TAPE_MARKER.length]),
  ]);
  const token = new TBC20({ extensionData });

  // Mint verification executes only the two P2PKH inputs. The TBC20 artifact
  // is first executed when the genesis token output is spent below.
  const mint = withoutInterpreterLogs(() =>
    token.mint(ownerKey, ownerAddress, SUPPLY, fundingUTXO, {
      verify: true,
    }),
  );

  const genesisInput = tokenInput(
    mint.transaction,
    0,
    [mint.sourceTransaction],
    ownerKey,
  );
  const transfer = withoutInterpreterLogs(() => token.transfer({
    inputs: [genesisInput],
    receivers: [{ controller: ownerAddress, amount: SUPPLY }],
    feeInputs: [{ utxo: buildUTXO(mint.transaction, 2), privateKey: ownerKey }],
    tbcChangeAddress: ownerAddress,
    verify: true,
  }));

  const splitFeeUTXO = buildUTXO(transfer.transaction, 2);
  const split = withoutInterpreterLogs(() => token.transfer({
    inputs: [
      tokenInput(
        transfer.transaction,
        0,
        [mint.transaction],
        ownerKey,
      ),
    ],
    receivers: [{ controller: ownerAddress, amount: 400n }],
    tokenChangeController: ownerAddress,
    feeInputs: [{ utxo: splitFeeUTXO, privateKey: ownerKey }],
    tbcChangeAddress: ownerAddress,
    verify: true,
  }));

  const merge = withoutInterpreterLogs(() => token.merge({
    inputs: [
      tokenInput(split.transaction, 0, [transfer.transaction], ownerKey),
      tokenInput(split.transaction, 2, [transfer.transaction], ownerKey),
    ],
    controller: ownerAddress,
    feeInputs: [{ utxo: buildUTXO(split.transaction, 4), privateKey: ownerKey }],
    tbcChangeAddress: ownerAddress,
    verify: true,
  }));

  // This next hop makes the ancestor proof authenticate both split vout 0 and
  // split vout 2, exercising the fixed OutputsFirstPart size path as ancestry.
  const postMerge = withoutInterpreterLogs(() => token.transfer({
    inputs: [
      tokenInput(merge.transaction, 0, [split.transaction], ownerKey),
    ],
    receivers: [{ controller: ownerAddress, amount: SUPPLY }],
    feeInputs: [{ utxo: buildUTXO(merge.transaction, 2), privateKey: ownerKey }],
    tbcChangeAddress: ownerAddress,
    verify: true,
  }));

  return {
    ownerKey,
    ownerAddress,
    fundingUTXO,
    extensionData,
    token,
    mint,
    genesisInput,
    transfer,
    split,
    merge,
    postMerge,
  };
}

function fixture(): LocalFixture {
  cachedFixture ??= createLocalFixture();
  return cachedFixture;
}

function createMetadataConvenienceFixture() {
  const ownerKey = tbc.PrivateKey.fromString(OWNER_WIF);
  const ownerAddress = ownerKey.toAddress().toString();
  const fundingUTXO: tbc.Transaction.IUnspentOutput = {
    txId: "12".repeat(32),
    outputIndex: 0,
    script: tbc.Script.buildPublicKeyHashOut(ownerAddress).toHex(),
    satoshis: 100_000,
  };
  const definition = Object.freeze({
    name: "Chain Token",
    symbol: "CHN",
    supply: "10.000001",
    decimal: 6,
  });
  const token = new TBC20(definition);

  const mint = withoutInterpreterLogs(() => token.mint(
    ownerKey,
    ownerAddress,
    fundingUTXO,
    { verify: false },
  ));
  assert.equal(mint.outputGroups.length, 2);

  const transfer = withoutInterpreterLogs(() => token.transfer(
    ownerKey,
    ownerAddress,
    "4.000001",
    [TBC20.buildUTXO(mint.transaction, 0)],
    buildUTXO(mint.transaction, 2),
    [mint.transaction],
    [[mint.sourceTransaction]],
    { verify: false },
  ));
  assert.equal(transfer.outputGroups.length, 3);

  const merge = withoutInterpreterLogs(() => token.merge(
    ownerKey,
    [
      TBC20.buildUTXO(transfer.transaction, 0),
      TBC20.buildUTXO(transfer.transaction, 2),
    ],
    buildUTXO(transfer.transaction, 4),
    [transfer.transaction, transfer.transaction],
    [[mint.transaction], [mint.transaction]],
    { verify: false },
  ));
  assert.equal(merge.outputGroups.length, 2);

  return {
    ownerKey,
    ownerAddress,
    fundingUTXO,
    definition,
    token,
    mint,
    transfer,
    merge,
  };
}

function metadataConvenienceFixture(): MetadataConvenienceFixture {
  cachedMetadataConvenienceFixture ??= createMetadataConvenienceFixture();
  return cachedMetadataConvenienceFixture;
}

test("instantiates every compiled placeholder with its declared push length", () => {
  const ownerKey = tbc.PrivateKey.fromString(OWNER_WIF);
  const controller = TBC20.addressController(ownerKey.toAddress().toString());
  const outpoint = {
    txId: "ab".repeat(32),
    outputIndex: 0x01020304,
  };
  const originalUTXO = TBC20.encodeOriginalUTXO(outpoint);
  const tapeSize = TBC20.minTapeBytes;
  const template: string = TBC20.lockHexTemplate;

  assert.equal(
    TBC20.artifactSha256,
    "0f5db33bb46e4517963cbd383518f74283b5c2c4efb0a733522a1fbc0d4a9f84",
  );
  assert.equal(
    createHash("sha256").update(template).digest("hex"),
    "731ae1278ba9404c79da4886024892838ff0f6d90c483ad4a74a59125d497080",
  );
  assert.equal(TBC20.codeBytes, 2657);
  assert.equal(TBC20.partialOffset, 2624);

  assert.equal(originalUTXO.length, 36);
  assert.equal(
    originalUTXO.subarray(0, 32).toString("hex"),
    Buffer.from(outpoint.txId, "hex").reverse().toString("hex"),
  );
  assert.equal(originalUTXO.subarray(32).toString("hex"), "04030201");
  assert.equal(controller.length, 21);
  assert.equal(pushHex(originalUTXO).slice(0, 2), "24");
  assert.equal(
    pushHex(Buffer.from([tapeSize])),
    `01${tapeSize.toString(16).padStart(2, "0")}`,
  );
  assert.equal(pushHex(controller).slice(0, 2), "15");

  assert.equal(
    (template.match(/<self\.OriginalUTXO36>/g) ?? []).length,
    1,
  );
  assert.equal(
    (template.match(/<self\.ConstTapeSize1>/g) ?? []).length,
    17,
  );
  assert.equal(
    (template.match(/<self\.Controller21>/g) ?? []).length,
    1,
  );

  const expectedHex = template
    .replaceAll("<self.OriginalUTXO36>", pushHex(originalUTXO))
    .replaceAll(
      "<self.ConstTapeSize1>",
      pushHex(Buffer.from([tapeSize])),
    )
    .replaceAll("<self.Controller21>", pushHex(controller));
  const code = TBC20.instantiateCode({
    originalUTXO: outpoint,
    tapeSize,
    controller,
  });

  assert.equal(code.toHex(), expectedHex);
  assert.doesNotMatch(code.toHex(), /[<>]/);
  assert.equal(code.toBuffer().length, TBC20.codeBytes);
  assert.equal(
    TBC20.partialOffset,
    Math.floor(code.toBuffer().length / 64) * 64,
  );
  assert.equal(
    code.toBuffer().subarray(TBC20.partialOffset).length,
    code.toBuffer().length - TBC20.partialOffset,
  );
  assert.deepEqual(
    code.toBuffer().subarray(-(TBC20_CODE_MARKER.length + 1)),
    Buffer.concat([Buffer.from([TBC20_CODE_MARKER.length]), TBC20_CODE_MARKER]),
  );
  assert.equal(
    code.toBuffer().length - (1 + 21 + 1 + TBC20_CODE_MARKER.length),
    TBC20.partialOffset,
  );
  assert.deepEqual(getTBC20Controller(code), controller);

  const legacyMarkerCode = Buffer.concat([
    code.toBuffer().subarray(0, -(TBC20_CODE_MARKER.length + 1)),
    Buffer.from("0532436f6465", "hex"),
  ]);
  assert.throws(
    () => getTBC20Controller(legacyMarkerCode),
    /missing the terminal TBC20CODE2 marker/,
  );

  const changedController = TBC20.addressController(
    tbc.PrivateKey.fromRandom().toAddress().toString(),
  );
  const changedCode = TBC20.replaceController(code, changedController);
  assert.deepEqual(
    getTBC20CodeIdentity(changedCode),
    getTBC20CodeIdentity(code),
  );
  assert.deepEqual(getTBC20Controller(changedCode), changedController);

  const nonZeroContractController = Buffer.concat([
    controller.subarray(0, 20),
    Buffer.from([2]),
  ]);
  const nonZeroContractCode = TBC20.instantiateCode({
    originalUTXO: outpoint,
    tapeSize,
    controller: nonZeroContractController,
  });
  assert.equal(getTBC20Controller(nonZeroContractCode)[20], 2);
  assert.doesNotThrow(() => TBC20.validateCode(nonZeroContractCode, tapeSize));
  assert.throws(
    () => TBC20.instantiateCode({
      originalUTXO: outpoint,
      tapeSize,
      controller: Buffer.concat([controller.subarray(0, 20), Buffer.from([0x80])]),
    }),
    /negative zero/,
  );

  const mutatedCode = Buffer.from(code.toBuffer());
  mutatedCode[0] ^= 1;
  assert.throws(
    () => TBC20.validateCode(mutatedCode, tapeSize),
    /differs from the embedded compiler artifact/,
  );
  assert.throws(
    () => TBC20.validateCode(code, tapeSize + 1),
    /differs from expected tapeSize/,
  );

  const mismatchedParent = new tbc.Transaction();
  (mismatchedParent as any).version = 10;
  mismatchedParent.from({
    txId: "55".repeat(32),
    outputIndex: 0,
    script: tbc.Script.fromASM("OP_TRUE").toHex(),
    satoshis: 500,
  });
  mismatchedParent.inputs[0].setScript(tbc.Script.fromASM("OP_TRUE"));
  mismatchedParent.addOutput(new tbc.Transaction.Output({ script: code, satoshis: 500 }));
  mismatchedParent.addOutput(new tbc.Transaction.Output({
    script: TBC20.buildTape(
      [0n, 0n, 0n, 0n, 0n, 0n],
      tapeSize + 1,
      Buffer.from([0, TBC20_TAPE_MARKER.length]),
    ),
    satoshis: 0,
  }));
  assert.throws(
    () => TBC20.buildUTXO(mismatchedParent, 0),
    /differs from expected tapeSize/,
  );
});

test("enforces the exact TBC20 tape envelope and signed-63-bit amount bounds", () => {
  const zeroes = [0n, 0n, 0n, 0n, 0n, 0n];
  const minimumTape = TBC20.buildTape(zeroes, TBC20.minTapeBytes);
  const maxExtension = Buffer.concat([
    Buffer.from([65]),
    Buffer.alloc(65, 0x7a),
    Buffer.from([TBC20_TAPE_MARKER.length]),
  ]);
  const maximumTape = TBC20.buildTape(
    [TBC20.maxSlotAmount, 2n, 3n, 4n, 5n, 6n],
    TBC20.maxTapeBytes,
    maxExtension,
  );

  assert.equal(minimumTape.toBuffer().length, TBC20.minTapeBytes);
  assert.equal(minimumTape.isSafeDataOut(), true);
  assert.equal(minimumTape.toBuffer()[51], TBC20_TAPE_MARKER.length);
  assert.equal(maximumTape.toBuffer().length, TBC20.maxTapeBytes);
  assert.deepEqual(
    maximumTape.toBuffer().subarray(0, TBC20_TAPE_PREFIX.length),
    TBC20_TAPE_PREFIX,
  );
  assert.deepEqual(
    maximumTape.toBuffer().subarray(-TBC20_TAPE_MARKER.length),
    TBC20_TAPE_MARKER,
  );

  const parsed = TBC20.parseTape(maximumTape);
  assert.deepEqual(parsed.amounts, [
    TBC20.maxSlotAmount,
    2n,
    3n,
    4n,
    5n,
    6n,
  ]);
  assert.equal(
    parsed.balance,
    TBC20.maxSlotAmount + 2n + 3n + 4n + 5n + 6n,
  );
  assert.deepEqual(parsed.extensionData, maxExtension);

  assert.throws(
    () => TBC20.buildTape(zeroes.slice(0, 5)),
    /exactly 6 bigint entries/,
  );
  assert.throws(
    () => TBC20.buildTape([1n << 63n, 0n, 0n, 0n, 0n, 0n]),
    /amounts\[0\]/,
  );
  assert.throws(
    () => TBC20.buildTape([-1n, 0n, 0n, 0n, 0n, 0n]),
    /amounts\[0\]/,
  );
  assert.throws(
    () => TBC20.buildTape(zeroes, TBC20.minTapeBytes - 1),
    /tapeSize/,
  );
  assert.throws(
    () => TBC20.buildTape(zeroes, TBC20.maxTapeBytes + 1),
    /tapeSize/,
  );
  assert.throws(
    () => TBC20.buildTape(zeroes, TBC20.minTapeBytes, Buffer.from([1])),
    /complete push-only data script/,
  );

  const legacyNonRelayTape = Buffer.concat([
    TBC20_TAPE_PREFIX,
    Buffer.alloc(48),
    TBC20_TAPE_MARKER,
  ]);
  assert.throws(
    () => TBC20.parseTape(legacyNonRelayTape),
    /tapeSize|complete push-only data script/,
  );

  const badPrefix = Buffer.from(minimumTape.toBuffer());
  badPrefix[0] = 0x51;
  assert.throws(() => TBC20.parseTape(badPrefix), /start with/);
  const badMarker = Buffer.from(minimumTape.toBuffer());
  badMarker[badMarker.length - 1] ^= 0xff;
  assert.throws(() => TBC20.parseTape(badMarker), /end with/);

  assert.deepEqual(encodeTBC20UnsignedLE(0), Buffer.alloc(0));
  assert.deepEqual(encodeTBC20UnsignedLE(127), Buffer.from([0x7f]));
  assert.deepEqual(encodeTBC20UnsignedLE(128), Buffer.from([0x80, 0x00]));
  assert.throws(() => encodeTBC20UnsignedLE(Number.MAX_SAFE_INTEGER + 1), /safe integer/);
  assert.throws(() => encodeTBC20UnsignedLE(1.5), /safe integer/);
});

test("round-trips canonical frozen metadata through the tape extension", () => {
  const definition = {
    name: "Chain Token",
    symbol: "CHN",
    supply: "10.000001",
    decimal: 6,
  };
  const token = new TBC20(definition);

  assert.deepEqual(token.metadata, definition);
  assert.equal(Object.isFrozen(token.metadata), true);
  assert.equal(token.name, definition.name);
  assert.equal(token.symbol, definition.symbol);
  assert.equal(token.supply, definition.supply);
  assert.equal(token.decimal, definition.decimal);
  assert.equal(token.declaredSupplyRaw, 10_000_001n);
  assert.equal(TBC20.humanToRaw("1.230000", 6), 1_230_000n);
  assert.equal(TBC20.rawToHuman(1_230_000n, 6), "1.23");
  assert.equal(TBC20.humanToRaw("0", 18), 0n);
  assert.equal(TBC20.rawToHuman(0n, 18), "0");
  assert.equal(TBC20.humanToRaw("0.000000000000000001", 18), 1n);
  assert.equal(
    TBC20.humanToRaw(TBC20.maxSlotAmount.toString(), 0),
    TBC20.maxSlotAmount,
  );
  assert.equal(TBC20.rawToHuman(TBC20.maxSlotAmount, 0), TBC20.maxSlotAmount.toString());

  const extension = TBC20.buildMetadataExtension(definition);
  assert.deepEqual(extension, token.extensionData);
  assert.notEqual(token.extensionData, token.extensionData);
  const exposedExtension = token.extensionData;
  exposedExtension[0] ^= 0xff;
  assert.notDeepEqual(exposedExtension, token.extensionData);
  assert.deepEqual(token.extensionData, extension);
  const decoded = TBC20.parseMetadataExtension(extension);
  assert.deepEqual(decoded.metadata, definition);
  assert.equal(decoded.declaredSupplyRaw, token.declaredSupplyRaw);
  assert.equal(Object.isFrozen(decoded.metadata), true);

  const tape = TBC20.buildTape(
    [token.declaredSupplyRaw, 0n, 0n, 0n, 0n, 0n],
    token.tapeSize,
    token.extensionData,
  );
  const parsedTape = TBC20.parseTape(tape);
  assert.deepEqual(parsedTape.extensionData, extension);
  assert.equal(parsedTape.balance, token.declaredSupplyRaw);

  const restored = new TBC20({ tapeScript: tape });
  assert.deepEqual(restored.metadata, definition);
  assert.equal(restored.declaredSupplyRaw, token.declaredSupplyRaw);
  assert.deepEqual(restored.extensionData, token.extensionData);

  assert.throws(() => {
    (token.metadata as any).name = "mutated";
  }, TypeError);
  assert.equal(token.metadata?.name, definition.name);

  const canonicalized = new TBC20({
    name: "Canonical",
    symbol: "CAN",
    supply: "1.230000",
    decimal: 6,
  });
  assert.equal(canonicalized.supply, "1.23");
  assert.equal(canonicalized.declaredSupplyRaw, 1_230_000n);
});

test("rejects non-canonical metadata, decimal amounts, and codec boundaries", () => {
  const valid = {
    name: "Boundary",
    symbol: "BND",
    supply: "1",
    decimal: 0,
  };

  const maximumMetadata = new TBC20({
    name: "N".repeat(52),
    symbol: "S",
    supply: "1",
  });
  assert.equal(maximumMetadata.tapeSize, TBC20.maxTapeBytes);
  assert.equal(maximumMetadata.decimal, 0);
  assert.equal(maximumMetadata.declaredSupplyRaw, 1n);

  for (const config of [
    { name: "Only name" },
    { name: "Name", symbol: "SYM" },
    { name: "Name", supply: "1" },
    { symbol: "SYM", supply: "1" },
    { decimal: 6 },
  ]) {
    assert.throws(
      () => new TBC20(config as any),
      /name, symbol, and supply must be provided together/,
    );
  }

  for (const decimal of [-1, 19, 1.5, Number.NaN, "6"] as any[]) {
    assert.throws(
      () => new TBC20({ ...valid, decimal }),
      /metadata\.decimal must be an integer in \[0, 18\]/,
    );
  }

  for (const supply of [
    "",
    "01",
    "+1",
    "-1",
    " 1",
    "1 ",
    "1e3",
    ".1",
    "1.",
  ]) {
    assert.throws(
      () => new TBC20({ ...valid, supply }),
      /canonical unsigned decimal string/,
    );
  }
  assert.throws(
    () => new TBC20({ ...valid, supply: 1 as any }),
    /canonical unsigned decimal string/,
  );
  assert.throws(
    () => new TBC20({ ...valid, supply: "0" }),
    /positive bigint/,
  );
  assert.throws(
    () => new TBC20({ ...valid, supply: "1.0000001", decimal: 6 }),
    /more than 6 fractional digits/,
  );
  assert.throws(
    () => new TBC20({ ...valid, supply: "1.0", decimal: 0 }),
    /more than 0 fractional digits|fractional part when decimal is zero/,
  );
  assert.throws(
    () => new TBC20({ ...valid, supply: (TBC20.maxSlotAmount + 1n).toString() }),
    /maximum raw TBC20 amount 9223372036854775807/,
  );
  assert.throws(
    () => TBC20.humanToRaw("0.0000001", 6),
    /more than 6 fractional digits/,
  );
  assert.throws(
    () => TBC20.humanToRaw((TBC20.maxSlotAmount + 1n).toString(), 0),
    /maximum raw TBC20 amount 9223372036854775807/,
  );
  assert.throws(() => TBC20.humanToRaw("1e3", 6), /canonical unsigned decimal string/);
  assert.throws(() => TBC20.humanToRaw("1", 19), /integer in \[0, 18\]/);
  assert.throws(() => TBC20.rawToHuman(-1n, 6), /bigint in \[0, 9223372036854775807\]/);
  assert.throws(
    () => TBC20.rawToHuman(TBC20.maxSlotAmount + 1n, 0),
    /bigint in \[0, 9223372036854775807\]/,
  );
  assert.throws(() => TBC20.rawToHuman(1 as any, 6), /bigint in \[0, 9223372036854775807\]/);

  assert.throws(
    () => new TBC20({ ...valid, name: "" }),
    /metadata\.name must be a non-empty string/,
  );
  assert.throws(
    () => new TBC20({ ...valid, name: "e\u0301" }),
    /canonical NFC/,
  );
  assert.throws(
    () => new TBC20({ ...valid, symbol: "T BC" }),
    /printable ASCII without whitespace/,
  );
  assert.throws(
    () => new TBC20({ ...valid, symbol: "币" }),
    /printable ASCII without whitespace/,
  );
  assert.throws(
    () => new TBC20({ ...valid, name: "N".repeat(53), symbol: "S" }),
    /combined bytes must not exceed 53/,
  );

  const extension = TBC20.buildMetadataExtension(valid);
  const wrongVersion = Buffer.from(extension);
  wrongVersion[1] += 1;
  assert.throws(() => TBC20.parseMetadataExtension(wrongVersion), /metadata version/);
  const wrongLength = Buffer.from(extension);
  wrongLength[0] -= 1;
  assert.throws(() => TBC20.parseMetadataExtension(wrongLength), /push length/);
  const zeroSupply = Buffer.from(extension);
  zeroSupply.fill(0, 3, 11);
  assert.throws(() => TBC20.parseMetadataExtension(zeroSupply), /positive bigint/);

  assert.throws(
    () => new TBC20({ ...valid, extensionData: Buffer.from([TBC20_TAPE_MARKER.length]) }),
    /extensionData differs from canonical declared metadata/,
  );
});

test("runs the positional metadata mint, split transfer, and merge chain locally", () => {
  const { definition, token, mint, transfer, merge } = metadataConvenienceFixture();
  const supplyRaw = 10_000_001n;

  assert.deepEqual(token.metadata, definition);
  assert.equal(token.declaredSupplyRaw, supplyRaw);
  assert.deepEqual(mint.tokenOutputs.map((output: any) => output.amount), [supplyRaw]);
  assert.deepEqual(
    transfer.tokenOutputs.map((output: any) => output.amount),
    [4_000_001n, 6_000_000n],
  );
  assert.deepEqual(merge.tokenOutputs.map((output: any) => output.amount), [supplyRaw]);

  for (const [label, build] of [
    ["mint", mint],
    ["transfer", transfer],
    ["merge", merge],
  ] as const) {
    const tokenBalance = build.tokenOutputs.reduce(
      (sum: bigint, output: any) => sum + output.amount,
      0n,
    );
    assert.equal(tokenBalance, supplyRaw, `${label} changed total token supply`);
    for (const output of build.tokenOutputs) {
      const tape = TBC20.parseTape(build.transaction.outputs[output.tapeVout].script);
      assert.equal(tape.balance, output.amount);
      assert.deepEqual(
        tape.extensionData,
        token.extensionData,
        `${label} output ${output.codeVout} changed metadata bytes`,
      );
      const restored = new TBC20({
        codeScript: build.transaction.outputs[output.codeVout].script,
        tapeScript: build.transaction.outputs[output.tapeVout].script,
        contractTxid: build.transaction.hash,
      });
      assert.deepEqual(restored.metadata, definition);
      assert.equal(restored.declaredSupplyRaw, supplyRaw);
    }
  }

  const transactionsToVerify: Array<{
    label: string;
    transaction: tbc.Transaction;
    inputCount: number;
  }> = [
    { label: "source", transaction: mint.sourceTransaction, inputCount: 1 },
    { label: "mint", transaction: mint.transaction, inputCount: 1 },
    { label: "transfer", transaction: transfer.transaction, inputCount: 2 },
    { label: "merge", transaction: merge.transaction, inputCount: 3 },
  ];
  for (const { label, transaction, inputCount } of transactionsToVerify) {
    assert.equal(transaction.inputs.length, inputCount);
    for (let inputIndex = 0; inputIndex < inputCount; inputIndex += 1) {
      const result = verifyInput(transaction, inputIndex);
      assert.equal(
        result.success,
        true,
        `${label} input ${inputIndex} failed: ${result.error ?? "unknown error"}`,
      );
      assert.equal(result.error, "");
    }
  }

  assert.equal(transfer.transaction.inputs[0].script.chunks.length, 123);
  assert.equal(transfer.transaction.inputs[1].script.chunks.length, 2);
  assert.equal(merge.transaction.inputs[0].script.chunks.length, 123);
  assert.equal(merge.transaction.inputs[1].script.chunks.length, 123);
  assert.equal(merge.transaction.inputs[2].script.chunks.length, 2);

  for (const result of [mint, transfer, merge]) {
    const finalBytes = result.txraw.length / 2;
    assert.equal(result.transaction.uncheckedSerialize(), result.txraw);
    assert.ok(result.feeSatoshis >= TBC20.feeForSize(finalBytes));
  }
  assert.ok(
    mint.sourceFeeSatoshis >= TBC20.feeForSize(mint.sourceTxraw.length / 2),
  );
  assert.deepEqual(token.metadata, definition);
});

test("rejects invalid positional mint, transfer, and merge boundaries", () => {
  const {
    ownerKey,
    ownerAddress,
    fundingUTXO,
    token,
    mint,
    transfer,
  } = metadataConvenienceFixture();
  const mintTokenUTXO = TBC20.buildUTXO(mint.transaction, 0);
  const mintFeeUTXO = buildUTXO(mint.transaction, 2);
  const mintParents = [mint.transaction];
  const mintResolvers = [[mint.sourceTransaction]];

  assert.throws(
    () => new TBC20().mint(ownerKey, ownerAddress, fundingUTXO, { verify: false }),
    /mint amount is required when constructor metadata does not declare supply/,
  );
  assert.throws(
    () => token.mint(ownerKey, ownerAddress, 1n, fundingUTXO, { verify: false }),
    /mint amount must equal constructor metadata declaredSupplyRaw/,
  );
  assert.throws(
    () => token.mint(ownerKey, ownerAddress, fundingUTXO, { verify: false }),
    /mint requires an uninitialized TBC20 instance/,
  );
  assert.throws(
    () => new TBC20().transfer(
      ownerKey,
      ownerAddress,
      "1",
      [mintTokenUTXO],
      mintFeeUTXO,
      mintParents,
      mintResolvers,
      { verify: false },
    ),
    /positional human transfer requires constructor metadata with decimal/,
  );

  assert.throws(
    () => token.transfer(
      ownerKey,
      ownerAddress,
      "1",
      [mintTokenUTXO],
      mintFeeUTXO,
      [],
      mintResolvers,
      { verify: false },
    ),
    /utxos, parentTxs, and ancestorResolvers must have exactly matching lengths/,
  );
  assert.throws(
    () => token.transfer(
      ownerKey,
      ownerAddress,
      "1",
      [mintTokenUTXO],
      mintFeeUTXO,
      mintParents,
      [],
      { verify: false },
    ),
    /utxos, parentTxs, and ancestorResolvers must have exactly matching lengths/,
  );
  assert.throws(
    () => token.transfer(
      ownerKey,
      ownerAddress,
      "1",
      [mintTokenUTXO],
      mintFeeUTXO,
      mintParents,
      mintResolvers,
      { contractControllers: [], verify: false },
    ),
    /contractControllers must be omitted or match the token input count/,
  );

  for (const humanAmount of ["01", "1e3", " 1", "1 ", "+1", "-1"]) {
    assert.throws(
      () => token.transfer(
        ownerKey,
        ownerAddress,
        humanAmount,
        [mintTokenUTXO],
        mintFeeUTXO,
        mintParents,
        mintResolvers,
        { verify: false },
      ),
      /canonical unsigned decimal string/,
    );
  }
  assert.throws(
    () => token.transfer(
      ownerKey,
      ownerAddress,
      "1.0000001",
      [mintTokenUTXO],
      mintFeeUTXO,
      mintParents,
      mintResolvers,
      { verify: false },
    ),
    /more than 6 fractional digits/,
  );
  assert.throws(
    () => token.transfer(
      ownerKey,
      ownerAddress,
      "0",
      [mintTokenUTXO],
      mintFeeUTXO,
      mintParents,
      mintResolvers,
      { verify: false },
    ),
    /receivers\[0\]\.amount must be a positive bigint/,
  );
  assert.throws(
    () => token.transfer(
      ownerKey,
      ownerAddress,
      "11",
      [mintTokenUTXO],
      mintFeeUTXO,
      mintParents,
      mintResolvers,
      { verify: false },
    ),
    /receiver amount total exceeds available TBC20 balance/,
  );

  const sixTokenUTXOs = Array.from({ length: 6 }, () => mintTokenUTXO);
  const sixParentTxs = Array.from({ length: 6 }, () => mint.transaction);
  const sixAncestorResolvers = Array.from(
    { length: 6 },
    () => [mint.sourceTransaction],
  );
  assert.throws(
    () => token.transfer(
      ownerKey,
      ownerAddress,
      "1",
      sixTokenUTXOs,
      mintFeeUTXO,
      sixParentTxs,
      sixAncestorResolvers,
      { verify: false },
    ),
    /positional transfer tokenUTXOs must contain 1-5 inputs/,
  );
  assert.throws(
    () => token.merge(
      ownerKey,
      sixTokenUTXOs,
      mintFeeUTXO,
      sixParentTxs,
      sixAncestorResolvers,
      { verify: false },
    ),
    /positional merge tokenUTXOs must contain 2-5 inputs/,
  );

  assert.throws(
    () => token.merge(
      ownerKey,
      [TBC20.buildUTXO(transfer.transaction, 0)],
      buildUTXO(transfer.transaction, 4),
      [transfer.transaction],
      [[mint.transaction]],
      { verify: false },
    ),
    /positional merge tokenUTXOs must contain 2-5 inputs/,
  );
  assert.throws(
    () => token.merge(
      ownerKey,
      [
        TBC20.buildUTXO(transfer.transaction, 0),
        TBC20.buildUTXO(transfer.transaction, 2),
      ],
      buildUTXO(transfer.transaction, 4),
      [transfer.transaction],
      [[mint.transaction], [mint.transaction]],
      { verify: false },
    ),
    /utxos, parentTxs, and ancestorResolvers must have exactly matching lengths/,
  );
});

test("mint builds a locally valid source and genesis transaction", () => {
  const { mint, token } = fixture();

  assert.equal(verifyInput(mint.sourceTransaction, 0).success, true);
  assert.equal(verifyInput(mint.transaction, 0).success, true);
  assert.equal(mint.transaction.outputs[0].satoshis, 500);
  assert.equal(mint.transaction.outputs[1].satoshis, 0);
  assert.equal(mint.transaction.outputs[0].script.toHex(), token.codeScript);
  assert.equal(mint.transaction.outputs[1].script.toHex(), token.tapeScript);
  assert.equal(TBC20.parseTape(mint.transaction.outputs[1].script).balance, SUPPLY);
  assert.equal(TBC20.buildUTXO(mint.transaction, 0).ftBalance, SUPPLY);
  assert.equal(mint.originalUTXO.txId, mint.sourceTransaction.hash);
  assert.equal(mint.originalUTXO.outputIndex, 0);
  assert.equal(mint.outputGroups[0].codeVout, 0);
  assert.equal(mint.outputGroups[0].tapeVout, 1);
});

test("charges 80 sat/KB from final bytes with an 80-satoshi minimum", () => {
  const {
    token,
    mint,
    transfer,
    split,
    merge,
    postMerge,
    genesisInput,
    ownerKey,
    ownerAddress,
    fundingUTXO,
  } = fixture();
  const priced = [
    { label: "source", transaction: mint.sourceTransaction, fee: mint.sourceFeeSatoshis },
    { label: "genesis", transaction: mint.transaction, fee: mint.feeSatoshis },
    { label: "transfer", transaction: transfer.transaction, fee: transfer.feeSatoshis },
    { label: "split", transaction: split.transaction, fee: split.feeSatoshis },
    { label: "merge", transaction: merge.transaction, fee: merge.feeSatoshis },
    { label: "post-merge", transaction: postMerge.transaction, fee: postMerge.feeSatoshis },
  ];

  assert.equal(TBC20.feeRateSatoshisPerKb, 80);
  assert.equal(TBC20.minimumFeeSatoshis, 80);
  assert.equal(TBC20.feeForSize(1), 80);
  assert.equal(TBC20.feeForSize(999), 80);
  assert.equal(TBC20.feeForSize(1_000), 80);
  assert.equal(TBC20.feeForSize(1_001), 81);
  assert.equal(TBC20.feeForSize(12_500), 1_000);
  assert.throws(() => TBC20.feeForSize(0), /positive safe integer/);

  priced.forEach(({ label, transaction, fee }) => {
    const sizeBytes = Buffer.from(transaction.uncheckedSerialize(), "hex").length;
    const requiredFee = TBC20.feeForSize(sizeBytes);
    assert.ok(
      fee >= requiredFee && fee - requiredFee <= 1,
      `${label} fee must equal or exceed its final-size fee by at most 1 satoshi`,
    );
  });
  assert.ok(Buffer.from(mint.sourceTxraw, "hex").length < 1_000);
  assert.equal(mint.sourceFeeSatoshis, 80);

  assert.throws(
    () => new TBC20().mint(ownerKey, ownerAddress, SUPPLY, fundingUTXO, {
      sourceFeeSatoshis: 80,
    } as any),
    /explicit fee fields are not accepted/,
  );
  assert.throws(
    () => token.transfer({ feeSatoshis: 80 } as any),
    /feeSatoshis is not accepted/,
  );

  assert.throws(
    () => new TBC20({
      codeScript: mint.transaction.outputs[0].script,
      tapeScript: mint.transaction.outputs[1].script,
    }).transfer({
      inputs: [genesisInput],
      receivers: [{ controller: ownerAddress, amount: SUPPLY }],
      verify: false,
    }),
    /inputs can pay only .* transaction requires/,
  );
});

test("prices from maximum signature placeholders before signing across byte boundaries", () => {
  const ownerKey = tbc.PrivateKey.fromString(OWNER_WIF);
  const ownerAddress = ownerKey.toAddress().toString();
  const fundingUTXO: tbc.Transaction.IUnspentOutput = {
    txId: FUNDING_TXID,
    outputIndex: 0,
    script: tbc.Script.buildPublicKeyHashOut(ownerAddress).toHex(),
    satoshis: 100_000,
  };
  const token = new TBC20();
  const mint = withoutInterpreterLogs(() =>
    token.mint(ownerKey, ownerAddress, SUPPLY, fundingUTXO, { verify: true }));
  const feeUTXO = buildUTXO(mint.transaction, 2);
  const paddingUTXO: tbc.Transaction.IUnspentOutput = {
    txId: "22".repeat(32),
    outputIndex: 0,
    script: tbc.Script.fromASM("OP_DROP OP_TRUE").toHex(),
    satoshis: 10_000,
  };
  const build = (paddingBytes: number) => withoutInterpreterLogs(() => token.transfer({
    inputs: [tokenInput(mint.transaction, 0, [mint.sourceTransaction], ownerKey)],
    receivers: [{ controller: ownerAddress, amount: SUPPLY }],
    feeInputs: [{ utxo: feeUTXO, privateKey: ownerKey }],
    additionalInputs: [{
      utxo: paddingUTXO,
      unlock: new tbc.Script().add(Buffer.alloc(paddingBytes, 1)),
    }],
    tbcChangeAddress: ownerAddress,
    verify: true,
  }));

  const derOscillation = build(11);
  const exactAfterShorterSignature = build(12);
  const atBoundary = build(74);
  const overBoundary = build(75);
  const oscillationBytes = Buffer.from(derOscillation.txraw, "hex").length;
  assert.equal(oscillationBytes, 3_937);
  assert.equal(derOscillation.feeSatoshis, 316);
  assert.equal(TBC20.feeForSize(oscillationBytes), 315);
  assert.equal(
    derOscillation.feeSatoshis - TBC20.feeForSize(oscillationBytes),
    1,
  );
  const exactBytes = Buffer.from(exactAfterShorterSignature.txraw, "hex").length;
  assert.equal(exactBytes, 3_938);
  assert.equal(exactAfterShorterSignature.feeSatoshis, 316);
  assert.equal(exactAfterShorterSignature.feeSatoshis, TBC20.feeForSize(exactBytes));
  assert.equal(Buffer.from(atBoundary.txraw, "hex").length, 4_000);
  assert.equal(atBoundary.feeSatoshis, 321);
  assert.equal(TBC20.feeForSize(4_000), 320);
  assert.equal(Buffer.from(overBoundary.txraw, "hex").length, 4_001);
  assert.equal(overBoundary.feeSatoshis, 321);
  for (const transaction of [
    derOscillation.transaction,
    exactAfterShorterSignature.transaction,
    atBoundary.transaction,
    overBoundary.transaction,
  ]) {
    for (let inputIndex = 0; inputIndex < transaction.inputs.length; inputIndex += 1) {
      assert.equal(verifyInput(transaction, inputIndex).success, true);
    }
  }
});

test("signs every final mint, transfer, split, and merge input exactly once", { concurrency: false }, () => {
  const ownerKey = tbc.PrivateKey.fromString(OWNER_WIF);
  const ownerAddress = ownerKey.toAddress().toString();
  const token = new TBC20();
  const fundingUTXO: tbc.Transaction.IUnspentOutput = {
    txId: "33".repeat(32),
    outputIndex: 0,
    script: tbc.Script.buildPublicKeyHashOut(ownerAddress).toHex(),
    satoshis: 100_000,
  };

  const mintCapture = captureSignatureCalls(() => withoutInterpreterLogs(() =>
    token.mint(ownerKey, ownerAddress, SUPPLY, fundingUTXO, { verify: true })));
  const mint = mintCapture.result;
  assert.deepEqual(mintCapture.calls.map((call) => call.inputIndex), [0, 0]);
  assert.equal(mintCapture.calls[0].transaction, mint.sourceTransaction);
  assert.equal(mintCapture.calls[1].transaction, mint.transaction);

  const transferCapture = captureSignatureCalls(() => withoutInterpreterLogs(() => token.transfer({
    inputs: [tokenInput(mint.transaction, 0, [mint.sourceTransaction], ownerKey)],
    receivers: [{ controller: ownerAddress, amount: SUPPLY }],
    feeInputs: [{ utxo: buildUTXO(mint.transaction, 2), privateKey: ownerKey }],
    tbcChangeAddress: ownerAddress,
    verify: true,
  })));
  const transfer = transferCapture.result;
  assert.deepEqual(transferCapture.calls.map((call) => call.inputIndex), [0, 1]);
  assert.ok(transferCapture.calls.every((call) => call.transaction === transfer.transaction));

  const splitCapture = captureSignatureCalls(() => withoutInterpreterLogs(() => token.transfer({
    inputs: [tokenInput(transfer.transaction, 0, [mint.transaction], ownerKey)],
    receivers: [{ controller: ownerAddress, amount: 400n }],
    tokenChangeController: ownerAddress,
    feeInputs: [{ utxo: buildUTXO(transfer.transaction, 2), privateKey: ownerKey }],
    tbcChangeAddress: ownerAddress,
    verify: true,
  })));
  const split = splitCapture.result;
  assert.deepEqual(splitCapture.calls.map((call) => call.inputIndex), [0, 1]);
  assert.ok(splitCapture.calls.every((call) => call.transaction === split.transaction));

  const mergeCapture = captureSignatureCalls(() => withoutInterpreterLogs(() => token.merge({
    inputs: [
      tokenInput(split.transaction, 0, [transfer.transaction], ownerKey),
      tokenInput(split.transaction, 2, [transfer.transaction], ownerKey),
    ],
    controller: ownerAddress,
    feeInputs: [{ utxo: buildUTXO(split.transaction, 4), privateKey: ownerKey }],
    tbcChangeAddress: ownerAddress,
    verify: true,
  })));
  const merge = mergeCapture.result;
  assert.deepEqual(mergeCapture.calls.map((call) => call.inputIndex), [0, 1, 2]);
  assert.ok(mergeCapture.calls.every((call) => call.transaction === merge.transaction));

  for (const result of [mint.sourceTransaction, mint.transaction, transfer.transaction, split.transaction, merge.transaction]) {
    for (let inputIndex = 0; inputIndex < result.inputs.length; inputIndex += 1) {
      assert.equal(verifyInput(result, inputIndex).success, true);
    }
  }
});

test("invokes an additional signing callback once after fee and outputs are frozen", { concurrency: false }, () => {
  const { token, mint, ownerKey, ownerAddress } = fixture();
  const additionalUTXO: tbc.Transaction.IUnspentOutput = {
    txId: "44".repeat(32),
    outputIndex: 0,
    script: tbc.Script.buildPublicKeyHashOut(ownerAddress).toHex(),
    satoshis: 1_000,
  };
  let callbackCalls = 0;
  const capture = captureSignatureCalls(() => withoutInterpreterLogs(() => token.transfer({
    inputs: [tokenInput(mint.transaction, 0, [mint.sourceTransaction], ownerKey)],
    receivers: [{ controller: ownerAddress, amount: SUPPLY }],
    feeInputs: [{ utxo: buildUTXO(mint.transaction, 2), privateKey: ownerKey }],
    additionalInputs: [{
      utxo: additionalUTXO,
      maxUnlockScriptBytes: 107,
      unlock: (transaction: tbc.Transaction, inputIndex: number) => {
        callbackCalls += 1;
        const signature = transaction.getSignature(inputIndex, ownerKey);
        assert.equal(typeof signature, "string");
        return new tbc.Script()
          .add(Buffer.from(signature as string, "hex"))
          .add(ownerKey.toPublicKey().toBuffer());
      },
    }],
    tbcChangeAddress: ownerAddress,
    verify: true,
  })));

  assert.equal(callbackCalls, 1);
  assert.deepEqual(capture.calls.map((call) => call.inputIndex), [0, 1, 2]);
  assert.ok(capture.calls.slice(0, 2).every((call) => call.transaction === capture.result.transaction));
  assert.notEqual(capture.calls[2].transaction, capture.result.transaction);
  for (let inputIndex = 0; inputIndex < capture.result.transaction.inputs.length; inputIndex += 1) {
    assert.equal(verifyInput(capture.result.transaction, inputIndex).success, true);
  }
});

test("isolates additional callbacks from previous-output signing metadata", { concurrency: false }, () => {
  const { token, mint, ownerKey, ownerAddress } = fixture();
  const additionalUTXO: tbc.Transaction.IUnspentOutput = {
    txId: "45".repeat(32),
    outputIndex: 0,
    script: tbc.Script.fromASM("OP_TRUE").toHex(),
    satoshis: 1_000,
  };
  let callbackCalls = 0;
  assert.throws(() => token.transfer({
    inputs: [tokenInput(mint.transaction, 0, [mint.sourceTransaction], ownerKey)],
    receivers: [{ controller: ownerAddress, amount: SUPPLY }],
    feeInputs: [{ utxo: buildUTXO(mint.transaction, 2), privateKey: ownerKey }],
    additionalInputs: [{
      utxo: additionalUTXO,
      maxUnlockScriptBytes: 1,
      unlock: (transaction: tbc.Transaction, inputIndex: number) => {
        callbackCalls += 1;
        (transaction.inputs[inputIndex] as any).output.satoshis = 2_000;
        return tbc.Script.fromASM("OP_TRUE");
      },
    }],
    tbcChangeAddress: ownerAddress,
    verify: false,
  }), /callback must not mutate the transaction/);
  assert.equal(callbackCalls, 1);

  callbackCalls = 0;
  assert.throws(() => token.transfer({
    inputs: [tokenInput(mint.transaction, 0, [mint.sourceTransaction], ownerKey)],
    receivers: [{ controller: ownerAddress, amount: SUPPLY }],
    additionalInputs: [{
      utxo: additionalUTXO,
      unlock: () => {
        callbackCalls += 1;
        return tbc.Script.fromASM("OP_TRUE");
      },
    }],
    verify: false,
  }), /maxUnlockScriptBytes/);
  assert.equal(callbackCalls, 0);

  callbackCalls = 0;
  assert.throws(() => token.transfer({
    inputs: [tokenInput(mint.transaction, 0, [mint.sourceTransaction], ownerKey)],
    receivers: [{ controller: ownerAddress, amount: SUPPLY }],
    additionalInputs: [{
      utxo: additionalUTXO,
      maxUnlockScriptBytes: 1,
      unlock: () => {
        callbackCalls += 1;
        return new tbc.Script().add(Buffer.alloc(2, 1));
      },
    }],
    verify: false,
  }), /script exceeds maxUnlockScriptBytes/);
  assert.equal(callbackCalls, 1);

  assert.throws(() => token.transfer({
    inputs: [tokenInput(mint.transaction, 0, [mint.sourceTransaction], ownerKey)],
    receivers: [{ controller: ownerAddress, amount: SUPPLY }],
    additionalInputs: [{
      utxo: additionalUTXO,
      maxUnlockScriptBytes: 1,
      unlock: tbc.Script.fromASM("OP_TRUE"),
    }],
    verify: false,
  }), /only valid for callback unlocks/);
});

test("chooses dust-safe change topology before producing any real signature", { concurrency: false }, () => {
  const ownerKey = tbc.PrivateKey.fromString(OWNER_WIF);
  const ownerAddress = ownerKey.toAddress().toString();
  const token = new TBC20();
  const fundingUTXO: tbc.Transaction.IUnspentOutput = {
    txId: FUNDING_TXID,
    outputIndex: 0,
    script: tbc.Script.buildPublicKeyHashOut(ownerAddress).toHex(),
    satoshis: 100_000,
  };
  const mint = withoutInterpreterLogs(() =>
    token.mint(ownerKey, ownerAddress, SUPPLY, fundingUTXO, { verify: true }));
  const build = (feeBudget: number) => withoutInterpreterLogs(() => token.transfer({
    inputs: [tokenInput(mint.transaction, 0, [mint.sourceTransaction], ownerKey)],
    receivers: [{ controller: ownerAddress, amount: SUPPLY }],
    feeInputs: [{
      utxo: {
        txId: feeBudget.toString(16).padStart(64, "0"),
        outputIndex: 0,
        script: tbc.Script.buildPublicKeyHashOut(ownerAddress).toHex(),
        satoshis: feeBudget,
      },
      privateKey: ownerKey,
    }],
    tbcChangeAddress: ownerAddress,
    verify: true,
  }));

  const insufficient = captureSignatureCalls(() => assert.throws(
    () => build(302),
    /can pay only 302 sat; transaction requires 303 sat/,
  ));
  assert.equal(insufficient.calls.length, 0);

  const exactNoChange = captureSignatureCalls(() => build(303));
  assert.equal(exactNoChange.result.transaction.outputs.length, 2);
  assert.equal(exactNoChange.result.feeSatoshis, 303);
  assert.equal(
    exactNoChange.result.feeSatoshis,
    TBC20.feeForSize(Buffer.from(exactNoChange.result.txraw, "hex").length),
  );

  const donatedDust = captureSignatureCalls(() => build(344));
  assert.equal(donatedDust.result.transaction.outputs.length, 2);
  assert.equal(donatedDust.result.feeSatoshis, 344);
  assert.equal(
    donatedDust.result.feeSatoshis - TBC20.feeForSize(Buffer.from(donatedDust.result.txraw, "hex").length),
    41,
  );

  const dustChange = captureSignatureCalls(() => build(350));
  assert.equal(dustChange.result.transaction.outputs.length, 3);
  assert.equal(dustChange.result.transaction.outputs[2].satoshis, 42);
  assert.equal(dustChange.result.feeSatoshis, 308);
  assert.equal(
    dustChange.result.feeSatoshis,
    TBC20.feeForSize(Buffer.from(dustChange.result.txraw, "hex").length),
  );

  for (const capture of [exactNoChange, donatedDust, dustChange]) {
    assert.deepEqual(capture.calls.map((call) => call.inputIndex), [0, 1]);
    assert.ok(capture.calls.every((call) => call.transaction === capture.result.transaction));
    for (let inputIndex = 0; inputIndex < capture.result.transaction.inputs.length; inputIndex += 1) {
      assert.equal(verifyInput(capture.result.transaction, inputIndex).success, true);
    }
  }
});

test("constructs transfer, split, merge, and a chained ancestor spend with the exact 123-leaf ABI", () => {
  const { transfer, split, merge, postMerge } = fixture();

  assert.equal(transfer.transaction.inputs[0].script.chunks.length, 123);
  assert.deepEqual(transfer.tokenOutputs[0].amountsByInput, [
    SUPPLY,
    0n,
    0n,
    0n,
    0n,
    0n,
  ]);

  assert.equal(split.transaction.inputs[0].script.chunks.length, 123);
  assert.equal(split.transaction.inputs[1].script.chunks.length, 2);
  assert.deepEqual(
    split.tokenOutputs.map((output: any) => output.amount),
    [400n, 600n],
  );
  assert.deepEqual(split.tokenOutputs[0].amountsByInput, [
    400n,
    0n,
    0n,
    0n,
    0n,
    0n,
  ]);
  assert.deepEqual(split.tokenOutputs[1].amountsByInput, [
    600n,
    0n,
    0n,
    0n,
    0n,
    0n,
  ]);
  assert.deepEqual(split.outputGroups, [
    { codeVout: 0, tapeVout: 1 },
    { codeVout: 2, tapeVout: 3 },
    { codeVout: 4 },
  ]);

  assert.equal(merge.transaction.inputs[0].script.chunks.length, 123);
  assert.equal(merge.transaction.inputs[1].script.chunks.length, 123);
  assert.equal(merge.tokenOutputs.length, 1);
  assert.equal(merge.tokenOutputs[0].amount, SUPPLY);
  assert.deepEqual(merge.tokenOutputs[0].amountsByInput, [
    400n,
    600n,
    0n,
    0n,
    0n,
    0n,
  ]);
  assert.equal(
    TBC20.parseTape(merge.transaction.outputs[1].script).balance,
    SUPPLY,
  );
  const mergeAncestorProofs = getTBC20PrePreTxArray(
    merge.transaction,
    0,
    [split.transaction],
  );
  assert.equal(mergeAncestorProofs[5].outputsFirstPart.length, 0);
  assert.equal(mergeAncestorProofs[4].outputsFirstPart.length, 80);
  assert.equal(postMerge.transaction.inputs[0].script.chunks.length, 123);
  const postMergeResult = verifyInput(postMerge.transaction, 0);
  assert.equal(postMergeResult.success, true);
  assert.equal(postMergeResult.error, "");
});

test("rejects non-8-byte CurrentTX Code and Tape values in the first and last output groups", () => {
  const { ownerAddress, mint, genesisInput } = fixture();
  const current = new tbc.Transaction();
  (current as any).version = 10;
  current.from(genesisInput.utxo);

  const outputGroups: Array<{ codeVout: number; tapeVout: number }> = [];
  current.addOutput(new tbc.Transaction.Output({
    script: mint.transaction.outputs[0].script,
    satoshis: 500,
  }));
  current.addOutput(new tbc.Transaction.Output({
    script: mint.transaction.outputs[1].script,
    satoshis: 0,
  }));
  outputGroups.push({ codeVout: 0, tapeVout: 1 });

  // A 25-byte P2PKH script avoids the non-minimal size witness that OP_TRUE
  // would produce, while still exercising both value fields in all 8 groups.
  const opaqueScript = tbc.Script.buildPublicKeyHashOut(ownerAddress);
  for (let groupIndex = 1; groupIndex < 8; groupIndex += 1) {
    const codeVout = current.outputs.length;
    current.addOutput(new tbc.Transaction.Output({ script: opaqueScript, satoshis: 0 }));
    current.addOutput(new tbc.Transaction.Output({ script: opaqueScript, satoshis: 0 }));
    outputGroups.push({ codeVout, tapeVout: codeVout + 1 });
  }

  const unlock = withoutInterpreterLogs(() => TBC20.attachUnlockScript({
    transaction: current,
    inputIndex: 0,
    tokenInput: genesisInput,
    outputGroups,
    verify: true,
  }));
  assert.equal(current.outputs.length, 16);
  assert.equal(outputGroups.length, 8);
  assert.equal(unlock.chunks.length, 123);
  assert.equal(verifyInput(current, 0).success, true);

  const cloneWithPrevouts = (source: tbc.Transaction): tbc.Transaction => {
    const copy = new tbc.Transaction(source.uncheckedSerialize());
    source.inputs.forEach((input: any, inputIndex: number) => {
      assert.ok(input.output, `missing prevout ${inputIndex}`);
      (copy.inputs[inputIndex] as any).output = new tbc.Transaction.Output({
        script: input.output.script,
        satoshis: input.output.satoshis,
      });
    });
    return copy;
  };
  const replaceUnlockPush = (
    transaction: tbc.Transaction,
    chunkIndex: number,
    value: Buffer,
  ): void => {
    const rebuilt = new tbc.Script();
    transaction.inputs[0].script.chunks.forEach((chunk: any, index: number) => {
      if (index === chunkIndex) rebuilt.add(value);
      else if (chunk.buf !== undefined) rebuilt.add(Buffer.from(chunk.buf));
      else rebuilt.add(chunk.opcodenum);
    });
    assert.equal(rebuilt.chunks.length, 123);
    transaction.setInputScript(0, rebuilt);
  };
  const valueWithWidth = (satoshis: number, width: number): Buffer => {
    const canonical = Buffer.alloc(8);
    canonical.writeBigUInt64LE(BigInt(satoshis));
    return width < canonical.length
      ? Buffer.from(canonical.subarray(0, width))
      : Buffer.concat([canonical, Buffer.alloc(width - canonical.length)]);
  };

  const targets = [
    { label: "first Code.Value", chunkIndex: 0, vout: 0 },
    { label: "first Tape.Value", chunkIndex: 4, vout: 1 },
    { label: "last Code.Value", chunkIndex: 42, vout: 14 },
    { label: "last Tape.Value", chunkIndex: 46, vout: 15 },
  ] as const;
  const lockingChunks = tbc.Script.fromHex(genesisInput.utxo.script).chunks;
  const failurePcByField = new Map<string, number>();

  for (const target of targets) {
    assert.equal(chunkBuffer(unlock.chunks[target.chunkIndex]).length, 8);
    for (const malformedLength of [7, 9, 88]) {
      const mutated = cloneWithPrevouts(current);
      replaceUnlockPush(
        mutated,
        target.chunkIndex,
        valueWithWidth(current.outputs[target.vout].satoshis, malformedLength),
      );
      const result = verifyInput(mutated, 0);
      const label = `${target.label}/${malformedLength}B`;
      assert.equal(result.success, false, label);
      assert.equal(result.error, "SCRIPT_ERR_EQUALVERIFY");
      const failurePc = result.failedAt?.pc;
      assert.ok(Number.isInteger(failurePc), `${label} missing failure pc`);
      assert.equal(lockingChunks[failurePc - 2]?.opcodenum, tbc.Opcode.OP_SIZE);
      assert.equal(lockingChunks[failurePc - 1]?.opcodenum, tbc.Opcode.OP_8);
      assert.equal(lockingChunks[failurePc]?.opcodenum, tbc.Opcode.OP_EQUALVERIFY);
      const priorPc = failurePcByField.get(target.label);
      if (priorPc === undefined) failurePcByField.set(target.label, failurePc);
      else assert.equal(failurePc, priorPc);
    }
  }
  assert.equal(new Set(failurePcByField.values()).size, targets.length);
});

test("allows one output total above 2^63-1 when every provenance slot stays bounded", () => {
  const ownerKey = tbc.PrivateKey.fromString(OWNER_WIF);
  const ownerAddress = ownerKey.toAddress().toString();
  const makeAncestor = (txidByte: string, script: tbc.Script, satoshis: number) => {
    const tx = new tbc.Transaction();
    (tx as any).version = 10;
    tx.from({
      txId: txidByte.repeat(32),
      outputIndex: 0,
      script: tbc.Script.fromASM("OP_TRUE").toHex(),
      satoshis,
    });
    tx.inputs[0].setScript(tbc.Script.fromASM("OP_TRUE"));
    tx.addOutput(new tbc.Transaction.Output({ script, satoshis }));
    return tx;
  };
  const source = makeAncestor(
    "31",
    tbc.Script.buildPublicKeyHashOut(ownerAddress),
    500,
  );
  const code = TBC20.instantiateCode({
    originalUTXO: { txId: source.hash, outputIndex: 0 },
    tapeSize: TBC20.minTapeBytes,
    controller: ownerAddress,
  });
  const tokenAncestor = makeAncestor("32", code, 500);
  const parent = new tbc.Transaction();
  (parent as any).version = 10;
  parent.addInputFromPrevTx(source, 0);
  parent.addInputFromPrevTx(tokenAncestor, 0);
  parent.inputs.forEach((input) => input.setScript(tbc.Script.fromASM("OP_TRUE")));
  parent.addOutput(new tbc.Transaction.Output({ script: code, satoshis: 500 }));
  parent.addOutput(new tbc.Transaction.Output({
    script: TBC20.buildTape([TBC20.maxSlotAmount, 0n, 0n, 0n, 0n, 0n]),
    satoshis: 0,
  }));
  parent.addOutput(new tbc.Transaction.Output({ script: code, satoshis: 500 }));
  parent.addOutput(new tbc.Transaction.Output({
    script: TBC20.buildTape([0n, TBC20.maxSlotAmount, 0n, 0n, 0n, 0n]),
    satoshis: 0,
  }));

  const token = new TBC20({ codeScript: code, tapeScript: parent.outputs[1].script });
  const result = token.transfer({
    inputs: [
      tokenInput(parent, 0, [source, tokenAncestor], ownerKey),
      tokenInput(parent, 2, [source, tokenAncestor], ownerKey),
    ],
    receivers: [{ controller: ownerAddress, amount: TBC20.maxSlotAmount * 2n }],
    verify: false,
  });

  assert.equal(result.tokenOutputs.length, 1);
  assert.equal(result.tokenOutputs[0].amount, TBC20.maxSlotAmount * 2n);
  assert.deepEqual(result.tokenOutputs[0].amountsByInput, [
    TBC20.maxSlotAmount,
    TBC20.maxSlotAmount,
    0n,
    0n,
    0n,
    0n,
  ]);
});

test("builds a nonzero-option contract-controller proof with SHA256(script) and an explicit vin", () => {
  const { token, ownerKey, mint } = fixture();
  const controllerScript = tbc.Script.fromASM("OP_TRUE");
  const controller = TBC20.contractController(controllerScript);
  controller[20] = 2;
  const controlledCode = TBC20.replaceController(mint.transaction.outputs[0].script, controller);
  const controlledParent = new tbc.Transaction();
  (controlledParent as any).version = 10;
  controlledParent.addInputFromPrevTx(mint.sourceTransaction, 0);
  controlledParent.inputs[0].setScript(tbc.Script.fromASM("OP_TRUE"));
  controlledParent.addOutput(new tbc.Transaction.Output({ script: controlledCode, satoshis: 500 }));
  controlledParent.addOutput(new tbc.Transaction.Output({
    script: TBC20.buildTape([SUPPLY, 0n, 0n, 0n, 0n, 0n], token.tapeSize, token.extensionData),
    satoshis: 0,
  }));

  const controllerTx = new tbc.Transaction();
  (controllerTx as any).version = 10;
  controllerTx.from({
    txId: "22".repeat(32),
    outputIndex: 0,
    script: tbc.Script.fromASM("OP_TRUE").toHex(),
    satoshis: 1_000,
  });
  controllerTx.inputs[0].setScript(tbc.Script.fromASM("OP_TRUE"));
  controllerTx.addOutput(new tbc.Transaction.Output({ script: controllerScript, satoshis: 1_000 }));

  const tokenUTXO = TBC20.buildUTXO(controlledParent, 0);
  const current = new tbc.Transaction();
  (current as any).version = 10;
  current.from(tokenUTXO);
  current.from(buildUTXO(controllerTx, 0));
  current.addOutput(new tbc.Transaction.Output({ script: controlledCode, satoshis: 500 }));
  current.addOutput(new tbc.Transaction.Output({
    script: TBC20.buildTape([SUPPLY, 0n, 0n, 0n, 0n, 0n], token.tapeSize, token.extensionData),
    satoshis: 0,
  }));
  // OP_TRUE needs no unlocking data; keeping this input empty also satisfies
  // the interpreter's clean-stack rule.
  current.inputs[1].setScript(new tbc.Script());

  const pendingChange = new tbc.Transaction(current.uncheckedSerialize());
  (pendingChange.inputs[0] as any).output = new tbc.Transaction.Output({
    script: tbc.Script.fromHex(tokenUTXO.script),
    satoshis: tokenUTXO.satoshis,
  });
  (pendingChange.inputs[1] as any).output = new tbc.Transaction.Output({
    script: controllerTx.outputs[0].script,
    satoshis: controllerTx.outputs[0].satoshis,
  });
  pendingChange.change(ownerKey.toAddress());
  assert.throws(() => TBC20.attachUnlockScript({
    transaction: pendingChange,
    inputIndex: 0,
    tokenInput: {
      utxo: tokenUTXO,
      parentTx: controlledParent,
      ancestors: [mint.sourceTransaction],
      signingKey: ownerKey,
      contractController: { transaction: controllerTx, currentInputIndex: 1 },
    },
    outputGroups: [{ codeVout: 0, tapeVout: 1 }],
  }), /fee and outputs to be frozen/);

  const unlock = withoutInterpreterLogs(() => TBC20.attachUnlockScript({
    transaction: current,
    inputIndex: 0,
    tokenInput: {
      utxo: tokenUTXO,
      parentTx: controlledParent,
      ancestors: [mint.sourceTransaction],
      signingKey: ownerKey,
      contractController: { transaction: controllerTx, currentInputIndex: 1 },
    },
    outputGroups: [{ codeVout: 0, tapeVout: 1 }],
    verify: true,
  }));

  assert.equal(unlock.chunks.length, 123);
  assert.equal(current.isSealed(), true);
  assert.deepEqual(
    chunkBuffer(unlock.chunks[104]),
    tbc.crypto.Hash.sha256(controllerScript.toBuffer()),
  );
  assert.equal(unlock.chunks[106].opcodenum, tbc.Opcode.OP_1);
  for (const inputIndex of [0, 1]) {
    const result = verifyInput(current, inputIndex);
    assert.equal(result.success, true);
    assert.equal(result.error, "");
  }
});

test("maps parent vin 0 to prepreTX[5] and to ABI leaves 91-98", () => {
  const { mint, transfer } = fixture();
  const proofs = getTBC20PrePreTxArray(
    mint.transaction,
    0,
    [mint.sourceTransaction],
  );

  assert.equal(proofs.length, 6);
  for (let index = 0; index < 5; index += 1) {
    assert.equal(proofs[index].vlio.length, 0);
    assert.equal(proofs[index].outputsVerifiedData.lockingScript.size.length, 0);
  }
  assert.equal(proofs[5].vlio.length, 16);
  assert.ok(proofs[5].outputsVerifiedData.lockingScript.size.length > 0);

  const chunks = transfer.transaction.inputs[0].script.chunks;
  assert.equal(chunks.length, 123);
  // Zero-based ABI offsets: PrePreTX[0..4] occupy chunks 50..89;
  // PrePreTX[5].VLIO starts at chunk 90.
  assert.ok(
    chunks.slice(50, 90).every((chunk: any) =>
      chunk.opcodenum === tbc.Opcode.OP_0),
  );
  assert.deepEqual(chunkBuffer(chunks[90]), proofs[5].vlio);
  assert.deepEqual(
    chunkBuffer(chunks[94]),
    proofs[5].outputsVerifiedData.lockingScript.suffixData,
  );
});

test("rejects a parent with more than six fixed PreTX input records", () => {
  const key = tbc.PrivateKey.fromString(OWNER_WIF);
  const tx = new tbc.Transaction();
  (tx as any).version = 10;
  for (let index = 0; index < 7; index += 1) {
    tx.from({
      txId: index.toString(16).padStart(2, "0").repeat(32),
      outputIndex: index,
      script: tbc.Script.fromASM("OP_TRUE").toHex(),
      satoshis: 500,
    });
    tx.inputs[index].setScript(tbc.Script.fromASM("OP_TRUE"));
  }
  const code = TBC20.instantiateCode({
    originalUTXO: { txId: "44".repeat(32), outputIndex: 0 },
    tapeSize: TBC20.minTapeBytes,
    controller: key.toAddress().toString(),
  });
  tx.addOutput(new tbc.Transaction.Output({ script: code, satoshis: 500 }));
  tx.addOutput(new tbc.Transaction.Output({
    script: TBC20.buildTape([0n, 0n, 0n, 0n, 0n, 0n]),
    satoshis: 0,
  }));

  assert.throws(
    () => getTBC20PreTxData(tx, 0),
    /preTx must contain at most 6 inputs/,
  );
});

test("requires the consensus transaction version to be exactly 10", () => {
  const { mint } = fixture();
  const versionEleven = new tbc.Transaction(mint.transaction.toString());
  (versionEleven as any).version = 11;

  assert.throws(
    () => TBC20.buildUTXO(versionEleven, 0),
    /version must be exactly 10/,
  );
  assert.throws(
    () => getTBC20PreTxData(versionEleven, 0),
    /version must be exactly 10/,
  );
});

test("rejects non-DER or Schnorr-shaped signature/public-key ABI data", () => {
  const { mint, transfer, ownerKey } = fixture();
  const common = {
    currentTx: transfer.transaction,
    inputIndex: 0,
    preTx: mint.transaction,
    preTxVout: 0,
    outputGroups: transfer.outputGroups,
    ancestorTransactions: [mint.sourceTransaction],
    publicKey: ownerKey.toPublicKey(),
  };
  assert.throws(
    () => buildTBC20UnlockScriptWithSignature({
      ...common,
      signature: Buffer.alloc(65, 1),
    }),
    /canonical DER transaction signature/,
  );
  assert.throws(
    () => buildTBC20UnlockScriptWithSignature({
      ...common,
      signature: Buffer.alloc(8, 1),
    }),
    /canonical DER transaction signature/,
  );

  const highS = Buffer.concat([
    Buffer.from("3046022100", "hex"),
    Buffer.from(`80${"00".repeat(31)}`, "hex"),
    Buffer.from("022100", "hex"),
    Buffer.from("fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140", "hex"),
    Buffer.from([0x41]),
  ]);
  assert.equal(highS.length, 73);
  assert.equal(tbc.crypto.Signature.isTxDER(highS), true);
  assert.throws(
    () => buildTBC20UnlockScriptWithSignature({ ...common, signature: highS }),
    /at most 72 bytes/,
  );

  const wrongSighash = chunkBuffer(transfer.transaction.inputs[0].script.chunks[98]);
  wrongSighash[wrongSighash.length - 1] = 0x42;
  assert.throws(
    () => buildTBC20UnlockScriptWithSignature({ ...common, signature: wrongSighash }),
    /SIGHASH_ALL.*0x41/,
  );
});

test("rejects outputGroups that do not exactly and consecutively cover outputs", () => {
  const { split } = fixture();
  const tx = split.transaction;

  const padded = getTBC20CurrentOutputData(tx, split.outputGroups);
  assert.equal(padded.length, 8);
  assert.throws(
    () => getTBC20CurrentOutputData(tx, []),
    /outputGroups must contain/,
  );
  assert.throws(
    () => getTBC20CurrentOutputData(tx, [
      { codeVout: 1, tapeVout: 2 },
    ]),
    /codeVout must be 0/,
  );
  assert.throws(
    () => getTBC20CurrentOutputData(tx, [
      { codeVout: 0, tapeVout: 2 },
      { codeVout: 3 },
      { codeVout: 4 },
    ]),
    /tapeVout must immediately follow/,
  );
  assert.throws(
    () => getTBC20CurrentOutputData(tx, [
      { codeVout: 0, tapeVout: 1 },
      { codeVout: 2, tapeVout: 3 },
    ]),
    /cover 4 physical outputs, but currentTx has 5/,
  );
});

test("verifies address padding and parent code vout 0/2 with the fixed artifact", () => {
  const { token, ownerKey, ownerAddress, mint, genesisInput, transfer, split, merge } = fixture();
  const artifactChunks = tbc.Script.fromHex(token.codeScript).chunks;

  const hasAddressPaddingBug = artifactChunks.some((chunk: any, index: number) =>
    chunk.opcodenum === tbc.Opcode.OP_IF &&
    artifactChunks[index + 1]?.opcodenum === tbc.Opcode.OP_OVER &&
    artifactChunks[index + 2]?.opcodenum === tbc.Opcode.OP_HASH160 &&
    artifactChunks[index + 3]?.opcodenum === tbc.Opcode.OP_EQUALVERIFY &&
    artifactChunks[index + 4]?.opcodenum === tbc.Opcode.OP_CHECKSIGVERIFY);
  const hasAddressPaddingCleanup = artifactChunks.some((chunk: any, index: number) =>
    chunk.opcodenum === tbc.Opcode.OP_IF &&
    artifactChunks.slice(index + 1, index + 9).every(
      (candidate: any) => candidate?.opcodenum === tbc.Opcode.OP_NIP,
    ) &&
    artifactChunks[index + 9]?.opcodenum === tbc.Opcode.OP_OVER &&
    artifactChunks[index + 10]?.opcodenum === tbc.Opcode.OP_HASH160 &&
    artifactChunks[index + 11]?.opcodenum === tbc.Opcode.OP_ELSE);
  const hasSharedControllerSignatureCheck = artifactChunks.some(
    (chunk: any, index: number) =>
      chunk.opcodenum === tbc.Opcode.OP_ENDIF &&
      artifactChunks[index + 1]?.opcodenum === tbc.Opcode.OP_EQUALVERIFY &&
      artifactChunks[index + 2]?.opcodenum === tbc.Opcode.OP_CHECKSIGVERIFY,
  );
  const hasDirectParentFirstPartSizeBug = artifactChunks.some(
    (chunk: any, index: number) =>
      chunk.opcodenum === tbc.Opcode.OP_CAT &&
      artifactChunks[index + 1]?.opcodenum === tbc.Opcode.OP_CAT &&
      artifactChunks[index + 2]?.opcodenum === tbc.Opcode.OP_SIZE &&
      artifactChunks[index + 3]?.opcodenum === tbc.Opcode.OP_DUP &&
      chunkBuffer(artifactChunks[index + 4]).equals(Buffer.from([0x28])) &&
      artifactChunks[index + 5]?.opcodenum === tbc.Opcode.OP_MOD &&
      artifactChunks[index + 9]?.opcodenum === tbc.Opcode.OP_DIV,
  );
  const hasSafeParentFirstPartSize = artifactChunks.some(
    (chunk: any, index: number) =>
      chunk.opcodenum === tbc.Opcode.OP_OVER &&
      artifactChunks[index + 1]?.opcodenum === tbc.Opcode.OP_SIZE &&
      artifactChunks[index + 2]?.opcodenum === tbc.Opcode.OP_NIP &&
      artifactChunks[index + 3]?.opcodenum === tbc.Opcode.OP_DUP &&
      chunkBuffer(artifactChunks[index + 4]).equals(Buffer.from([0x28])) &&
      artifactChunks[index + 5]?.opcodenum === tbc.Opcode.OP_MOD &&
      artifactChunks[index + 6]?.opcodenum === tbc.Opcode.OP_0 &&
      artifactChunks[index + 7]?.opcodenum === tbc.Opcode.OP_EQUALVERIFY &&
      chunkBuffer(artifactChunks[index + 8]).equals(Buffer.from([0x28])) &&
      artifactChunks[index + 9]?.opcodenum === tbc.Opcode.OP_DIV,
  );

  assert.equal(hasAddressPaddingBug, false);
  assert.equal(hasAddressPaddingCleanup, true);
  assert.equal(hasSharedControllerSignatureCheck, true);
  assert.equal(hasDirectParentFirstPartSizeBug, false);
  assert.equal(hasSafeParentFirstPartSize, true);

  // Address control keeps the real currentInputsData at leaf 48 and uses seven
  // OP_0 placeholders for ContractTX[6] plus contractTXVinIndex at 100..106.
  const addressChunks = transfer.transaction.inputs[0].script.chunks;
  assert.ok(
    addressChunks.slice(100, 107).every(
      (chunk: any) => chunk.opcodenum === tbc.Opcode.OP_0,
    ),
  );
  const addressResult = verifyInput(transfer.transaction, 0);
  assert.equal(addressResult.success, true);
  assert.equal(addressResult.error, "");

  const verifiedTransfer = withoutInterpreterLogs(() => token.transfer({
      inputs: [genesisInput],
      receivers: [{ controller: ownerAddress, amount: SUPPLY }],
      feeInputs: [{ utxo: buildUTXO(mint.transaction, 2), privateKey: ownerKey }],
      tbcChangeAddress: ownerAddress,
      verify: true,
    }));
  const verifiedTransferResult = verifyInput(verifiedTransfer.transaction, 0);
  assert.equal(verifiedTransferResult.success, true);
  assert.equal(verifiedTransferResult.error, "");

  // Parent proofs represent empty/80-byte first parts for code vout 0/2, and
  // both layouts now complete successfully under the same 123-leaf ABI.
  assert.equal(getTBC20PreTxData(split.transaction, 0).outputsFirstPart.length, 0);
  assert.equal(getTBC20PreTxData(split.transaction, 2).outputsFirstPart.length, 80);
  for (const inputIndex of [0, 1]) {
    const result = verifyInput(merge.transaction, inputIndex);
    assert.equal(result.success, true, `merge input ${inputIndex} failed`);
    assert.equal(result.error, "");
  }
});
