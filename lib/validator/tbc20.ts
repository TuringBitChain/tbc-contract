import * as tbc from "tbc-lib-js";
import { TBC20 as TBC20Class } from "../contract/tbc20";
import {
  TBC20_AMOUNT_SLOTS,
  TBC20_CODE_SATOSHIS,
  TBC20_MAX_INPUTS,
  TBC20_MAX_OUTPUT_GROUPS,
  TBC20_MAX_OUTPUTS,
  TBC20_TAPE_MARKER,
  TBC20_TAPE_PREFIX,
  getTBC20PartialScriptData,
} from "../util/tbc20/tbc20unlock";
import {
  decodePublishedFTCode,
  isPublishedFTTape,
  PublishedFTCodeDescriptor,
} from "./ft-artifacts";
import { isFTCodeLength } from "../util/ft/ftscript";

const TBC20: typeof TBC20Class = require("../contract/tbc20");

// Deliberately require the shared mutable API object. Tests and applications
// may replace API.fetchTXraw; capturing the method at module load would bypass
// that supported behavior.
const API = require("../api/api") as {
  fetchTXraw(txid: string, network?: string): Promise<tbc.Transaction>;
};

const UINT32_MAX = 0xffffffff;
const MAX_SLOT_AMOUNT = (1n << 63n) - 1n;
const PLACEHOLDER = /(<self\.(?:OriginalUTXO36|ConstTapeSize1|Controller21)>)/;
const TEMPLATE_SEGMENTS = TBC20.lockHexTemplate.split(PLACEHOLDER);

export type TBC20ValidationStatus = "VALID" | "INVALID" | "UNKNOWN";
export type TBC20ValidationKind = "TRANSITION" | "NON_TOKEN" | "UNDETERMINED";
export type TokenFamilyName = "TBC20" | "FT";

export type TokenProtocolDescriptor =
  | Readonly<{ family: "TBC20"; version: 1 }>
  | Readonly<{ family: "FT"; version: 1 | 2 | 3 | 4 }>;
export type TBC20Assurance =
  | "OUTPUT_SOURCE_GRAPH_RESOLVED"
  | "STRUCTURE"
  | "TRANSITION"
  | "OUTPUT_SOURCE_LINEAGE";

export type TBC20ValidationErrorCode =
  | "INVALID_POLICY"
  | "ROOT_RAW_INVALID"
  | "INVALID_TRANSACTION_VERSION"
  | "NO_TOKEN_OUTPUT"
  | "PARENT_FETCH_FAILED"
  | "ANCESTOR_FETCH_FAILED"
  | "VALIDATOR_INTERNAL_ERROR"
  | "VALIDATOR_INTERNAL_INCOMPLETE"
  | "DUPLICATE_INPUT_OUTPOINT"
  | "INPUT_LIMIT_EXCEEDED"
  | "OUTPUT_LIMIT_EXCEEDED"
  | "PARENT_VOUT_OUT_OF_RANGE"
  | "UNSUPPORTED_TOKEN_PROTOCOL"
  | "MIXED_TOKEN_PROTOCOLS"
  | "INVALID_TOKEN_CODE"
  | "INVALID_TOKEN_TAPE"
  | "TOKEN_CODE_WITHOUT_TAPE"
  | "ORPHAN_TOKEN_TAPE"
  | "UNSUPPORTED_TBC20_ARTIFACT"
  | "INVALID_TBC20_CODE"
  | "EMPTY_LOCKING_SCRIPT"
  | "TBC20_CODE_WITHOUT_TAPE"
  | "ORPHAN_TBC20_TAPE"
  | "INVALID_TBC20_TAPE"
  | "INVALID_CODE_VALUE"
  | "INVALID_TAPE_VALUE"
  | "AMOUNT_SLOT_WITHOUT_INPUT"
  | "AMOUNT_SLOT_WITHOUT_TOKEN_INPUT"
  | "OUTPUT_INPUT_IDENTITY_MISMATCH"
  | "OUTPUT_IDENTITY_WITHOUT_INPUT"
  | "ZERO_IDENTITY_WITNESS_UNRESOLVED"
  | "ZERO_IDENTITY_WITNESS_CAPACITY_EXCEEDED"
  | "VIN_AMOUNT_NOT_CONSERVED"
  | "IDENTITY_AMOUNT_NOT_CONSERVED"
  | "TAPE_ENVELOPE_MISMATCH"
  | "PARENT_SLOT_WITHOUT_VIN"
  | "ANCESTOR_VOUT_OUT_OF_RANGE"
  | "ANCESTOR_EMPTY_LOCKING_SCRIPT"
  | "ANCESTOR_IDENTITY_MISMATCH"
  | "ORIGINAL_UTXO_MISMATCH";

export interface TBC20ValidationPolicy {
  preset?: "strict" | "relaxed-metadata";
  requireExactTapeEnvelope?: boolean;
}

export interface TBC20ValidateTransitionOptions {
  transaction: tbc.Transaction | string | Buffer;
  network: string;
  policy?: TBC20ValidationPolicy;
}

export interface TBC20ValidationIssue {
  code: TBC20ValidationErrorCode;
  severity: "error" | "warning";
  stage: "SOURCE" | "ROOT" | "PARENT" | "OUTPUT_SCAN" | "MATRIX" | "ANCESTOR";
  message: string;
  vin?: number;
  vout?: number;
  slot?: number;
  txid?: string;
  identity?: string;
}

export interface TBC20AncestorEdge {
  currentVin: number;
  parentTxid: string;
  parentCodeVout: number;
  parentSlot: number;
  parentVin: number;
  abiPrepreIndex: number;
  ancestorTxid: string;
  ancestorVout: number;
  parentIdentity: string;
  ancestorIdentity?: string;
  resolution: "SAME_IDENTITY" | "ORIGINAL_UTXO";
}

interface ValidatedInputBase {
  vin: number;
  prevTxid: string;
  prevVout: number;
}

export type TBC20ValidatedInput =
  | (ValidatedInputBase & {
      kind: "UNRESOLVED";
      resolution: "NOT_REQUESTED" | "UNAVAILABLE" | "INVALID";
    })
  | (ValidatedInputBase & {
      kind: "ORDINARY";
      resolution: "RESOLVED";
      parentTxid: string;
    })
  | (ValidatedInputBase & {
      kind: "TBC20" | "FT";
      resolution: "RESOLVED";
      sourceRole?: "POSITIVE_SOURCE" | "ZERO_IDENTITY_WITNESS";
      parentTxid: string;
      codeVout: number;
      tapeVout: number;
      identity: string;
      slots: readonly [bigint, bigint, bigint, bigint, bigint, bigint];
      balanceRaw: bigint;
      protocol: TokenProtocolDescriptor;
    });

export interface TBC20RecognizedContract {
  family: "FT" | "STABLE_COIN";
  version: 1 | 2 | 3 | 4;
}

export interface TBC20ValidatedOutputGroup {
  logicalIndex: number;
  kind: "TBC20" | "FT" | "ORDINARY";
  firstVout: number;
  physicalVoutCount: 1 | 2;
  codeVout?: number;
  tapeVout?: number;
  identity?: string;
  slots?: readonly [bigint, bigint, bigint, bigint, bigint, bigint];
  balanceRaw?: bigint;
  protocol?: TokenProtocolDescriptor;
  recognizedContract?: TBC20RecognizedContract;
}

export interface TBC20ValidatedAssetFlow {
  identity: string;
  protocol: TokenProtocolDescriptor;
  inputVins: readonly number[];
  outputGroups: readonly number[];
  inputRaw: bigint;
  outputRaw: bigint;
  envelopeHash?: string;
}

export interface TBC20ValidationSource {
  network: string;
  api: "API.fetchTXraw";
  trustModel: "API_FETCH_TXRAW_FULLY_TRUSTED";
  rootTrustModel: "CALLER_ASSERTED_ON_CHAIN_AND_INPUT_SCRIPTS_VALID";
  queriedTxids: readonly string[];
  resolvedTxids: readonly string[];
  requiredSourceTxids: readonly string[];
}

export interface TBC20ValidationResult {
  status: TBC20ValidationStatus;
  txid?: string;
  kind: TBC20ValidationKind;
  protocol?: TokenProtocolDescriptor;
  assurances: readonly TBC20Assurance[];
  issues: readonly TBC20ValidationIssue[];
  inputs: readonly TBC20ValidatedInput[];
  outputGroups: readonly TBC20ValidatedOutputGroup[];
  assets: readonly TBC20ValidatedAssetFlow[];
  matrix: readonly (readonly bigint[])[];
  ancestorEdges: readonly TBC20AncestorEdge[];
  source?: TBC20ValidationSource;
  resolvedTransactions: number;
  parentsChecked: number;
  ancestorsChecked: number;
  originalUTXOBoundaries: number;
  toJSON(): Record<string, unknown>;
}

export class TokenValidationError extends Error {
  readonly report: TBC20ValidationResult;

  constructor(report: TBC20ValidationResult) {
    super(`token validation ${report.status.toLowerCase()}: ${report.issues.map((issue) => issue.code).join(", ") || report.kind}`);
    this.name = "TokenValidationError";
    this.report = report;
  }
}

interface FrozenInputView {
  readonly txid: string;
  readonly vout: number;
  readonly sequence: number;
  readonly outpointWire36Hex: string;
}

interface FrozenOutputView {
  readonly satoshis: bigint;
  readonly scriptHex: string;
  readonly scriptBytes: number;
}

interface FrozenTxView {
  readonly version: number;
  readonly nLockTime: number;
  readonly inputs: readonly FrozenInputView[];
  readonly outputs: readonly FrozenOutputView[];
}

interface DecodedCode {
  identity: string;
  originalUTXOWire36Hex: string;
  tapeSize: number;
  scriptHex: string;
  protocol: TokenProtocolDescriptor;
  outputKind: "TBC20" | "FT";
}

interface DecodedTape {
  slots: [bigint, bigint, bigint, bigint, bigint, bigint];
  balanceRaw: bigint;
  envelopeHex: string;
  envelopeHash: string;
  scriptHex: string;
  size: number;
}

interface InternalTokenPair {
  codeVout: number;
  tapeVout: number;
  code: DecodedCode;
  tape: DecodedTape;
}

interface InternalInput extends ValidatedInputBase {
  kind: "UNRESOLVED" | "ORDINARY" | "TBC20" | "FT";
  resolution: "NOT_REQUESTED" | "UNAVAILABLE" | "INVALID" | "RESOLVED";
  attempted: boolean;
  parentTxid?: string;
  sourceRole?: "POSITIVE_SOURCE" | "ZERO_IDENTITY_WITNESS";
  parent?: FrozenTxView;
  pair?: InternalTokenPair;
}

interface InternalOutputGroup extends TBC20ValidatedOutputGroup {
  pair?: InternalTokenPair;
  /** Includes known-but-unsupported protocols so they cannot become opaque. */
  observedProtocolKey?: string;
}

interface TokenArtifactAdapter {
  readonly id: "TBC20" | "FT";
  tryDecodeCode(scriptHex: string): DecodedCode | null;
  isCodeCandidate(scriptHex: string): boolean;
  isTapeCandidate(scriptHex: string): boolean;
  decodeTape(scriptHex: string, expectedSize: number): DecodedTape;
}

type TokenCodeClassification =
  | { kind: "STRICT"; code: DecodedCode; adapter: TokenArtifactAdapter }
  | { kind: "KNOWN_UNSUPPORTED"; artifact: PublishedFTCodeDescriptor }
  | { kind: "CANDIDATE_INVALID"; error: ProtocolError }
  | { kind: "NOT_TOKEN" };

type PairAtResult =
  | { kind: "SUPPORTED"; pair: InternalTokenPair }
  | { kind: "KNOWN_UNSUPPORTED"; artifact: PublishedFTCodeDescriptor }
  | { kind: "INVALID"; error: ProtocolError }
  | { kind: "NONE" };

type FetchOutcome =
  | { kind: "ok"; requestedTxid: string; view: FrozenTxView }
  | { kind: "source-error"; requestedTxid: string; error: unknown };

interface NormalizedOptions {
  transaction: tbc.Transaction | string | Buffer;
  network: string;
  requireExactTapeEnvelope: boolean;
}

interface Context {
  kind: TBC20ValidationKind;
  protocol?: TokenProtocolDescriptor;
  txid?: string;
  invalidIssues: TBC20ValidationIssue[];
  unknownIssues: TBC20ValidationIssue[];
  warnings: TBC20ValidationIssue[];
  assurances: Set<TBC20Assurance>;
  inputs: InternalInput[];
  groups: InternalOutputGroup[];
  matrix: bigint[][];
  assets: TBC20ValidatedAssetFlow[];
  ancestorEdges: TBC20AncestorEdge[];
  fetchCache: Map<string, Promise<FetchOutcome>>;
  queriedTxids: string[];
  resolvedTxids: string[];
  requiredSourceTxids: Set<string>;
  resolvedTransactions: number;
  parentsChecked: number;
  ancestorsChecked: number;
  originalUTXOBoundaries: number;
  network: string;
  requireExactTapeEnvelope: boolean;
  lineageExpected: number;
  lineageResolved: number;
}

class ProtocolError extends Error {
  readonly code: TBC20ValidationErrorCode;
  readonly stage: TBC20ValidationIssue["stage"];
  readonly details: Partial<TBC20ValidationIssue>;

  constructor(
    code: TBC20ValidationErrorCode,
    stage: TBC20ValidationIssue["stage"],
    message: string,
    details: Partial<TBC20ValidationIssue> = {},
  ) {
    super(message);
    this.code = code;
    this.stage = stage;
    this.details = details;
  }
}

function isUInt32(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= UINT32_MAX;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function cloneIssue(issue: TBC20ValidationIssue): TBC20ValidationIssue {
  return { ...issue };
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString(10);
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === "toJSON" || typeof child === "function") continue;
      result[key] = jsonSafe(child);
    }
    return result;
  }
  return value;
}

function issueMessage(code: TBC20ValidationErrorCode): string {
  return code.replaceAll("_", " ").toLowerCase();
}

function addInvalid(
  ctx: Context,
  code: TBC20ValidationErrorCode,
  stage: TBC20ValidationIssue["stage"],
  details: Partial<TBC20ValidationIssue> = {},
  message = issueMessage(code),
): void {
  ctx.invalidIssues.push({ code, severity: "error", stage, message, ...details });
}

function addUnknown(
  ctx: Context,
  code: TBC20ValidationErrorCode,
  stage: TBC20ValidationIssue["stage"],
  details: Partial<TBC20ValidationIssue> = {},
  message = issueMessage(code),
): void {
  ctx.unknownIssues.push({ code, severity: "error", stage, message, ...details });
}

function addWarning(
  ctx: Context,
  code: TBC20ValidationErrorCode,
  stage: TBC20ValidationIssue["stage"],
  details: Partial<TBC20ValidationIssue> = {},
  message = issueMessage(code),
): void {
  ctx.warnings.push({ code, severity: "warning", stage, message, ...details });
}

function sha256Hex(bytes: Buffer): string {
  return tbc.crypto.Hash.sha256(bytes).toString("hex");
}

function tokenProtocol(family: "TBC20", version: 1): TokenProtocolDescriptor;
function tokenProtocol(family: "FT", version: 1 | 2 | 3 | 4): TokenProtocolDescriptor;
function tokenProtocol(
  family: TokenFamilyName,
  version: 1 | 2 | 3 | 4,
): TokenProtocolDescriptor {
  return Object.freeze({ family, version }) as TokenProtocolDescriptor;
}

function protocolKey(protocol: TokenProtocolDescriptor): string {
  return `${protocol.family}:v${protocol.version}`;
}

function unsupportedProtocolKey(artifact: PublishedFTCodeDescriptor): string {
  return `${artifact.family}:v${artifact.version}`;
}

function calculateAbiIdentity(scriptHex: string): string {
  const bytes = Buffer.from(scriptHex, "hex");
  const partial = getTBC20PartialScriptData(tbc.Script.fromBuffer(bytes));
  return Buffer.concat([partial.partialHash, partial.size]).toString("hex");
}

function snapshotTransaction(tx: tbc.Transaction): FrozenTxView {
  if (!(tx instanceof tbc.Transaction)) throw new Error("API did not return a Transaction");
  const runtime = tx as unknown as { version?: unknown };
  if (!isUInt32(runtime.version)) throw new Error("transaction version is not uint32");
  if (!isUInt32(tx.nLockTime)) throw new Error("transaction nLockTime is not uint32");

  const inputs = tx.inputs.map((input: any): FrozenInputView => {
    if (!Buffer.isBuffer(input.prevTxId) || input.prevTxId.length !== 32) {
      throw new Error("transaction input prevTxId must be 32 bytes");
    }
    if (!isUInt32(input.outputIndex) || !isUInt32(input.sequenceNumber)) {
      throw new Error("transaction input vout and sequence must be uint32");
    }
    const displayTxid = Buffer.from(input.prevTxId).toString("hex").toLowerCase();
    const vout = input.outputIndex;
    const voutLE = Buffer.alloc(4);
    voutLE.writeUInt32LE(vout);
    return deepFreeze({
      txid: displayTxid,
      vout,
      sequence: input.sequenceNumber,
      outpointWire36Hex: Buffer.concat([
        Buffer.from(input.prevTxId).reverse(),
        voutLE,
      ]).toString("hex"),
    });
  });

  const outputs = tx.outputs.map((output: any): FrozenOutputView => {
    if (!output || !output.satoshisBN || typeof output.satoshisBN.toString !== "function") {
      throw new Error("transaction output is missing satoshisBN");
    }
    const satoshis = BigInt(output.satoshisBN.toString(10));
    if (satoshis < 0n) throw new Error("transaction output value cannot be negative");
    if (!output.script || typeof output.script.toBuffer !== "function") {
      throw new Error("transaction output is missing locking script");
    }
    const script = Buffer.from(output.script.toBuffer());
    return deepFreeze({
      satoshis,
      scriptHex: script.toString("hex"),
      scriptBytes: script.length,
    });
  });

  return deepFreeze({
    version: runtime.version,
    nLockTime: tx.nLockTime,
    inputs: deepFreeze(inputs.slice()),
    outputs: deepFreeze(outputs.slice()),
  });
}

function parseAndSnapshotRoot(
  input: tbc.Transaction | string | Buffer,
): { kind: "ok"; view: FrozenTxView; txid: string } | { kind: "invalid" } {
  try {
    let raw: Buffer;
    if (input instanceof tbc.Transaction) {
      raw = Buffer.from(input.toBuffer());
    } else if (Buffer.isBuffer(input)) {
      raw = Buffer.from(input);
    } else if (typeof input === "string") {
      if (!/^(?:[0-9a-fA-F]{2})+$/.test(input)) return { kind: "invalid" };
      raw = Buffer.from(input, "hex");
    } else {
      return { kind: "invalid" };
    }
    if (raw.length === 0) return { kind: "invalid" };

    const parsed = new tbc.Transaction();
    (parsed as any).fromBuffer(raw);
    const canonical = Buffer.from(parsed.toBuffer());
    if (!canonical.equals(raw)) return { kind: "invalid" };
    return { kind: "ok", view: snapshotTransaction(parsed), txid: parsed.hash };
  } catch {
    return { kind: "invalid" };
  }
}

function normalizeOptions(
  options: TBC20ValidateTransitionOptions,
): { kind: "ok"; value: NormalizedOptions } | { kind: "invalid"; message: string } {
  if (!options || typeof options !== "object") {
    return { kind: "invalid", message: "options must be an object" };
  }
  if (!(options.transaction instanceof tbc.Transaction) &&
      !Buffer.isBuffer(options.transaction) &&
      typeof options.transaction !== "string") {
    return { kind: "invalid", message: "transaction must be a Transaction, Buffer, or hex string" };
  }
  if (typeof options.network !== "string" || options.network.trim() === "") {
    return { kind: "invalid", message: "network must be a non-empty string" };
  }
  const policy = options.policy ?? {};
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    return { kind: "invalid", message: "policy must be an object" };
  }
  const preset = policy.preset ?? "strict";
  if (preset !== "strict" && preset !== "relaxed-metadata") {
    return { kind: "invalid", message: "policy.preset is unsupported" };
  }
  if (policy.requireExactTapeEnvelope !== undefined &&
      typeof policy.requireExactTapeEnvelope !== "boolean") {
    return { kind: "invalid", message: "requireExactTapeEnvelope must be boolean" };
  }
  if (preset === "strict" && policy.requireExactTapeEnvelope === false) {
    return { kind: "invalid", message: "strict policy cannot disable exact Tape envelopes" };
  }
  return {
    kind: "ok",
    value: {
      transaction: options.transaction,
      network: options.network.trim(),
      requireExactTapeEnvelope: policy.requireExactTapeEnvelope ?? preset === "strict",
    },
  };
}

function createContext(options: NormalizedOptions): Context {
  return {
    kind: "UNDETERMINED",
    invalidIssues: [],
    unknownIssues: [],
    warnings: [],
    assurances: new Set(),
    inputs: [],
    groups: [],
    matrix: [],
    assets: [],
    ancestorEdges: [],
    fetchCache: new Map(),
    queriedTxids: [],
    resolvedTxids: [],
    requiredSourceTxids: new Set(),
    resolvedTransactions: 0,
    parentsChecked: 0,
    ancestorsChecked: 0,
    originalUTXOBoundaries: 0,
    network: options.network,
    requireExactTapeEnvelope: options.requireExactTapeEnvelope,
    lineageExpected: 0,
    lineageResolved: 0,
  };
}

function placeholderBytes(segment: string): number {
  if (segment === "<self.OriginalUTXO36>") return 37;
  if (segment === "<self.ConstTapeSize1>") return 2;
  if (segment === "<self.Controller21>") return 22;
  return Buffer.from(segment, "hex").length;
}

function isCurrentArtifactCandidate(scriptHex: string): boolean {
  const code = Buffer.from(scriptHex, "hex");
  if (code.length !== TBC20.codeBytes) return false;
  let offset = 0;
  let constantMismatches = 0;
  for (const segment of TEMPLATE_SEGMENTS) {
    if (offset >= TBC20.partialOffset) break;
    if (segment.startsWith("<self.")) {
      offset += placeholderBytes(segment);
      continue;
    }
    const constant = Buffer.from(segment, "hex");
    const comparable = Math.min(constant.length, TBC20.partialOffset - offset);
    for (let index = 0; index < comparable; index += 1) {
      if (code[offset + index] !== constant[index]) {
        constantMismatches += 1;
        // A small mutation budget catches damaged instances of the registered
        // artifact while keeping unrelated same-length contracts opaque.
        if (constantMismatches > 8) return false;
      }
    }
    offset += constant.length;
  }
  return constantMismatches <= 8;
}

function decodeTBC20CodeStrict(scriptHex: string): DecodedCode {
  try {
    TBC20.validateCode(scriptHex);
  } catch (error) {
    throw new ProtocolError(
      isCurrentArtifactCandidate(scriptHex) ? "INVALID_TBC20_CODE" : "UNSUPPORTED_TBC20_ARTIFACT",
      "OUTPUT_SCAN",
      (error as Error).message,
    );
  }

  const code = Buffer.from(scriptHex, "hex");
  let offset = 0;
  let originalUTXOWire36Hex: string | undefined;
  let tapeSize: number | undefined;
  for (const segment of TEMPLATE_SEGMENTS) {
    if (segment === "<self.OriginalUTXO36>") {
      originalUTXOWire36Hex = code.subarray(offset + 1, offset + 37).toString("hex");
      offset += 37;
    } else if (segment === "<self.ConstTapeSize1>") {
      tapeSize ??= code[offset + 1];
      offset += 2;
    } else if (segment === "<self.Controller21>") {
      offset += 22;
    } else {
      offset += Buffer.from(segment, "hex").length;
    }
  }
  if (!originalUTXOWire36Hex || tapeSize === undefined || offset !== code.length) {
    throw new ProtocolError("INVALID_TBC20_CODE", "OUTPUT_SCAN", "cannot decode TBC20 code parameters");
  }
  return {
    identity: calculateAbiIdentity(scriptHex),
    originalUTXOWire36Hex,
    tapeSize,
    scriptHex,
    protocol: tokenProtocol("TBC20", 1),
    outputKind: "TBC20",
  };
}

function tryDecodeTBC20Code(scriptHex: string): DecodedCode | null {
  try {
    return decodeTBC20CodeStrict(scriptHex);
  } catch {
    return null;
  }
}

function isTapeCandidate(scriptHex: string): boolean {
  const bytes = Buffer.from(scriptHex, "hex");
  return bytes.length >= TBC20.minTapeBytes &&
    bytes.length <= TBC20.maxTapeBytes &&
    bytes.subarray(0, TBC20_TAPE_PREFIX.length).equals(TBC20_TAPE_PREFIX) &&
    bytes.subarray(bytes.length - TBC20_TAPE_MARKER.length).equals(TBC20_TAPE_MARKER);
}

function decodeTBC20TapeStrict(scriptHex: string, expectedSize: number): DecodedTape {
  try {
    const parsed = TBC20.parseTape(scriptHex);
    if (parsed.size !== expectedSize) {
      throw new Error(`Tape size ${parsed.size} differs from Code size ${expectedSize}`);
    }
    const bytes = Buffer.from(scriptHex, "hex");
    const slots = parsed.amounts.slice() as [bigint, bigint, bigint, bigint, bigint, bigint];
    if (slots.length !== TBC20_AMOUNT_SLOTS || slots.some((amount) => amount < 0n || amount > MAX_SLOT_AMOUNT)) {
      throw new Error("Tape amounts are outside the canonical signed-63 range");
    }
    const envelope = Buffer.concat([bytes.subarray(0, 3), bytes.subarray(51)]);
    return {
      slots,
      balanceRaw: slots.reduce((sum, amount) => sum + amount, 0n),
      envelopeHex: envelope.toString("hex"),
      envelopeHash: sha256Hex(envelope),
      scriptHex,
      size: parsed.size,
    };
  } catch (error) {
    throw new ProtocolError("INVALID_TBC20_TAPE", "OUTPUT_SCAN", (error as Error).message);
  }
}

function decodeFTCodeStrict(scriptHex: string): DecodedCode | null {
  const artifact = decodePublishedFTCode(scriptHex);
  if (
    artifact === null ||
    artifact.family !== "FT" ||
    artifact.coin ||
    artifact.originalUTXOWire36Hex === undefined
  ) {
    return null;
  }
  return {
    identity: calculateAbiIdentity(scriptHex),
    originalUTXOWire36Hex: artifact.originalUTXOWire36Hex,
    tapeSize: artifact.tapeSize,
    scriptHex,
    protocol: tokenProtocol("FT", artifact.version),
    outputKind: "FT",
  };
}

function decodeFTTapeStrict(scriptHex: string, expectedSize: number): DecodedTape {
  try {
    const bytes = Buffer.from(scriptHex, "hex");
    if (bytes.length !== expectedSize) {
      throw new Error(`Tape size ${bytes.length} differs from Code size ${expectedSize}`);
    }
    if (!isPublishedFTTape(scriptHex)) {
      throw new Error("Tape is not a canonical published FT envelope");
    }
    const slots: [bigint, bigint, bigint, bigint, bigint, bigint] = [
      bytes.readBigUInt64LE(3),
      bytes.readBigUInt64LE(11),
      bytes.readBigUInt64LE(19),
      bytes.readBigUInt64LE(27),
      bytes.readBigUInt64LE(35),
      bytes.readBigUInt64LE(43),
    ];
    if (slots.some((amount) => amount > MAX_SLOT_AMOUNT)) {
      throw new Error("Tape amounts are outside the canonical signed-63 range");
    }
    const envelope = Buffer.concat([bytes.subarray(0, 3), bytes.subarray(51)]);
    return {
      slots,
      balanceRaw: slots.reduce((sum, amount) => sum + amount, 0n),
      envelopeHex: envelope.toString("hex"),
      envelopeHash: sha256Hex(envelope),
      scriptHex,
      size: bytes.length,
    };
  } catch (error) {
    throw new ProtocolError("INVALID_TOKEN_TAPE", "OUTPUT_SCAN", (error as Error).message);
  }
}

const TBC20_ADAPTER: TokenArtifactAdapter = Object.freeze({
  id: "TBC20" as const,
  tryDecodeCode: tryDecodeTBC20Code,
  isCodeCandidate: isCurrentArtifactCandidate,
  isTapeCandidate,
  decodeTape: decodeTBC20TapeStrict,
});

const FT_ADAPTER: TokenArtifactAdapter = Object.freeze({
  id: "FT" as const,
  tryDecodeCode: decodeFTCodeStrict,
  isCodeCandidate: (scriptHex: string): boolean => isFTCodeLength(scriptHex.length / 2),
  isTapeCandidate: isPublishedFTTape,
  decodeTape: decodeFTTapeStrict,
});

const TOKEN_ADAPTERS: readonly TokenArtifactAdapter[] = Object.freeze([
  TBC20_ADAPTER,
  FT_ADAPTER,
]);

function classifyCode(
  scriptHex: string,
  followingScriptHex?: string,
): TokenCodeClassification {
  for (const adapter of TOKEN_ADAPTERS) {
    const code = adapter.tryDecodeCode(scriptHex);
    if (code !== null) return { kind: "STRICT", code, adapter };
  }

  const publishedFT = decodePublishedFTCode(scriptHex);
  if (publishedFT?.family === "STABLE_COIN") {
    return { kind: "KNOWN_UNSUPPORTED", artifact: publishedFT };
  }

  if (TBC20_ADAPTER.isCodeCandidate(scriptHex)) {
    return {
      kind: "CANDIDATE_INVALID",
      error: new ProtocolError(
        "INVALID_TBC20_CODE",
        "OUTPUT_SCAN",
        "script resembles the registered TBC20 artifact but fails strict decoding",
      ),
    };
  }
  if (
    followingScriptHex !== undefined &&
    FT_ADAPTER.isCodeCandidate(scriptHex) &&
    FT_ADAPTER.isTapeCandidate(followingScriptHex)
  ) {
    return {
      kind: "CANDIDATE_INVALID",
      error: new ProtocolError(
        "INVALID_TOKEN_CODE",
        "OUTPUT_SCAN",
        "known FT Code length adjacent to FTape does not match the published artifact registry",
      ),
    };
  }
  return { kind: "NOT_TOKEN" };
}

function toRecognizedContract(artifact: PublishedFTCodeDescriptor): TBC20RecognizedContract {
  return {
    family: artifact.coin ? "STABLE_COIN" : "FT",
    version: artifact.version,
  };
}

function scanOutputs(root: FrozenTxView, ctx: Context): InternalOutputGroup[] {
  const scanned: InternalOutputGroup[] = [];
  const observedSupported = new Map<string, TokenProtocolDescriptor>();
  const observedUnsupported = new Set<string>();
  if (root.outputs.length > TBC20_MAX_OUTPUTS) {
    addInvalid(ctx, "OUTPUT_LIMIT_EXCEEDED", "ROOT", {}, `transaction has ${root.outputs.length} physical outputs; maximum is ${TBC20_MAX_OUTPUTS}`);
    return scanned;
  }

  for (let vout = 0; vout < root.outputs.length;) {
    const output = root.outputs[vout];
    if (output.scriptBytes === 0) {
      addInvalid(ctx, "EMPTY_LOCKING_SCRIPT", "OUTPUT_SCAN", { vout });
      scanned.push({ logicalIndex: scanned.length, kind: "ORDINARY", firstVout: vout, physicalVoutCount: 1 });
      vout += 1;
      continue;
    }

    const followingOutput = root.outputs[vout + 1];
    const codeClassification = classifyCode(output.scriptHex, followingOutput?.scriptHex);
    if (codeClassification.kind === "CANDIDATE_INVALID") {
      addInvalid(ctx, codeClassification.error.code, "OUTPUT_SCAN", { vout }, codeClassification.error.message);
      const consumePair = followingOutput !== undefined && (
        (codeClassification.error.code === "INVALID_TBC20_CODE" && isTapeCandidate(followingOutput.scriptHex)) ||
        (codeClassification.error.code === "INVALID_TOKEN_CODE" && isPublishedFTTape(followingOutput.scriptHex))
      );
      scanned.push({
        logicalIndex: scanned.length,
        kind: "ORDINARY",
        firstVout: vout,
        physicalVoutCount: consumePair ? 2 : 1,
      });
      vout += consumePair ? 2 : 1;
      continue;
    }
    if (codeClassification.kind === "KNOWN_UNSUPPORTED") {
      const artifact = codeClassification.artifact;
      const key = unsupportedProtocolKey(artifact);
      observedUnsupported.add(key);
      const hasTape = followingOutput !== undefined && isPublishedFTTape(followingOutput.scriptHex);
      scanned.push({
        logicalIndex: scanned.length,
        kind: "ORDINARY",
        firstVout: vout,
        physicalVoutCount: hasTape ? 2 : 1,
        codeVout: vout,
        tapeVout: hasTape ? vout + 1 : undefined,
        recognizedContract: toRecognizedContract(artifact),
        observedProtocolKey: key,
      });
      vout += hasTape ? 2 : 1;
      continue;
    }
    if (codeClassification.kind === "STRICT") {
      const code = codeClassification.code;
      const key = protocolKey(code.protocol);
      observedSupported.set(key, code.protocol);
      if (vout + 1 >= root.outputs.length) {
        addInvalid(
          ctx,
          code.outputKind === "TBC20" ? "TBC20_CODE_WITHOUT_TAPE" : "TOKEN_CODE_WITHOUT_TAPE",
          "OUTPUT_SCAN",
          { vout },
        );
        scanned.push({
          logicalIndex: scanned.length,
          kind: "ORDINARY",
          firstVout: vout,
          physicalVoutCount: 1,
          observedProtocolKey: key,
        });
        vout += 1;
        continue;
      }
      const tapeOutput = root.outputs[vout + 1];
      if (tapeOutput.scriptBytes === 0) {
        addInvalid(ctx, "EMPTY_LOCKING_SCRIPT", "OUTPUT_SCAN", { vout: vout + 1 });
        scanned.push({
          logicalIndex: scanned.length,
          kind: "ORDINARY",
          firstVout: vout,
          physicalVoutCount: 2,
          observedProtocolKey: key,
        });
        vout += 2;
        continue;
      }
      if (output.satoshis !== BigInt(TBC20_CODE_SATOSHIS)) {
        addInvalid(ctx, "INVALID_CODE_VALUE", "OUTPUT_SCAN", { vout });
      }
      if (tapeOutput.satoshis !== 0n) {
        addInvalid(ctx, "INVALID_TAPE_VALUE", "OUTPUT_SCAN", { vout: vout + 1 });
      }
      try {
        const tape = codeClassification.adapter.decodeTape(tapeOutput.scriptHex, code.tapeSize);
        const pair: InternalTokenPair = {
          codeVout: vout,
          tapeVout: vout + 1,
          code,
          tape,
        };
        scanned.push({
          logicalIndex: scanned.length,
          kind: code.outputKind,
          firstVout: vout,
          physicalVoutCount: 2,
          codeVout: vout,
          tapeVout: vout + 1,
          identity: pair.code.identity,
          slots: pair.tape.slots,
          balanceRaw: pair.tape.balanceRaw,
          protocol: code.protocol,
          recognizedContract: code.outputKind === "FT"
            ? { family: "FT", version: code.protocol.version }
            : undefined,
          observedProtocolKey: key,
          pair,
        });
      } catch (error) {
        const protocol = error as ProtocolError;
        addInvalid(
          ctx,
          protocol.code ?? (code.outputKind === "TBC20" ? "INVALID_TBC20_TAPE" : "INVALID_TOKEN_TAPE"),
          "OUTPUT_SCAN",
          { vout: vout + 1 },
          protocol.message,
        );
        scanned.push({
          logicalIndex: scanned.length,
          kind: "ORDINARY",
          firstVout: vout,
          physicalVoutCount: 2,
          observedProtocolKey: key,
        });
      }
      vout += 2;
      continue;
    }

    if (isTapeCandidate(output.scriptHex)) {
      addInvalid(ctx, "ORPHAN_TBC20_TAPE", "OUTPUT_SCAN", { vout });
    } else if (isPublishedFTTape(output.scriptHex)) {
      addInvalid(ctx, "ORPHAN_TOKEN_TAPE", "OUTPUT_SCAN", { vout });
    }
    scanned.push({ logicalIndex: scanned.length, kind: "ORDINARY", firstVout: vout, physicalVoutCount: 1 });
    vout += 1;
  }

  const observedKeys = new Set([
    ...observedSupported.keys(),
    ...observedUnsupported,
  ]);
  if (observedKeys.size > 1) {
    addInvalid(
      ctx,
      "MIXED_TOKEN_PROTOCOLS",
      "OUTPUT_SCAN",
      {},
      `transaction outputs contain multiple token protocols: ${[...observedKeys].sort().join(", ")}`,
    );
  } else if (observedKeys.size === 1) {
    const key = observedKeys.values().next().value as string;
    const supported = observedSupported.get(key);
    if (supported !== undefined) {
      ctx.protocol = supported;
    } else {
      addInvalid(
        ctx,
        "UNSUPPORTED_TOKEN_PROTOCOL",
        "OUTPUT_SCAN",
        {},
        `${key} is recognized but is not supported by this validator`,
      );
    }
  }

  // Raw transactions do not retain the outputGroups array used by the unlock
  // ABI. The two supported families encode ordinary outputs differently:
  // TBC20 may group two consecutive opaque physical outputs, whereas legacy
  // FT encodes every ordinary physical output as its own tag=2 group. A token
  // Code/Tape pair always occupies one forced two-output group.
  const groups: InternalOutputGroup[] = [];
  if (ctx.protocol?.family === "FT") {
    for (const group of scanned) {
      groups.push({ ...group, logicalIndex: groups.length });
    }
    if (groups.length > TBC20_MAX_OUTPUT_GROUPS) {
      addInvalid(
        ctx,
        "OUTPUT_LIMIT_EXCEEDED",
        "OUTPUT_SCAN",
        {},
        `FT outputs require ${groups.length} ABI groups; maximum is ${TBC20_MAX_OUTPUT_GROUPS}`,
      );
    }
    return groups;
  }

  // For TBC20, reconstruct the minimum possible grouping: strict pairs are
  // barriers and every opaque run contributes ceil(physicalOutputs / 2).
  let opaqueRun: InternalOutputGroup[] = [];
  const flushOpaqueRun = (): void => {
    if (opaqueRun.length === 0) return;
    const start = opaqueRun[0].firstVout;
    const last = opaqueRun[opaqueRun.length - 1];
    const end = last.firstVout + last.physicalVoutCount;
    for (let vout = start; vout < end; vout += 2) {
      const physicalVoutCount: 1 | 2 = vout + 1 < end ? 2 : 1;
      const recognized = physicalVoutCount === 2
        ? opaqueRun.find((candidate) =>
          candidate.recognizedContract !== undefined &&
          candidate.codeVout === vout && candidate.tapeVout === vout + 1)
        : undefined;
      groups.push({
        logicalIndex: groups.length,
        kind: "ORDINARY",
        firstVout: vout,
        physicalVoutCount,
        codeVout: recognized?.codeVout,
        tapeVout: recognized?.tapeVout,
        recognizedContract: recognized?.recognizedContract,
      });
    }
    opaqueRun = [];
  };
  for (const group of scanned) {
    if (group.pair !== undefined) {
      flushOpaqueRun();
      groups.push({ ...group, logicalIndex: groups.length });
    } else {
      opaqueRun.push(group);
    }
  }
  flushOpaqueRun();
  if (groups.length > TBC20_MAX_OUTPUT_GROUPS) {
    addInvalid(
      ctx,
      "OUTPUT_LIMIT_EXCEEDED",
      "OUTPUT_SCAN",
      {},
      `outputs require at least ${groups.length} ABI groups; maximum is ${TBC20_MAX_OUTPUT_GROUPS}`,
    );
  }
  return groups;
}

function decodePairAt(parent: FrozenTxView, codeVout: number): PairAtResult {
  const codeOutput = parent.outputs[codeVout];
  if (!codeOutput) return { kind: "NONE" };
  const tapeOutput = parent.outputs[codeVout + 1];
  const classification = classifyCode(codeOutput.scriptHex, tapeOutput?.scriptHex);
  if (classification.kind === "NOT_TOKEN") return { kind: "NONE" };
  if (classification.kind === "KNOWN_UNSUPPORTED") {
    return { kind: "KNOWN_UNSUPPORTED", artifact: classification.artifact };
  }
  if (classification.kind === "CANDIDATE_INVALID") {
    return { kind: "INVALID", error: classification.error };
  }
  if (!tapeOutput) {
    return {
      kind: "INVALID",
      error: new ProtocolError(
        classification.code.outputKind === "TBC20" ? "TBC20_CODE_WITHOUT_TAPE" : "TOKEN_CODE_WITHOUT_TAPE",
        "PARENT",
        "referenced token Code has no following Tape output",
      ),
    };
  }
  if (codeOutput.satoshis !== BigInt(TBC20_CODE_SATOSHIS) || tapeOutput.satoshis !== 0n) {
    return {
      kind: "INVALID",
      error: new ProtocolError(
        codeOutput.satoshis !== BigInt(TBC20_CODE_SATOSHIS) ? "INVALID_CODE_VALUE" : "INVALID_TAPE_VALUE",
        "PARENT",
        "referenced token pair has invalid output values",
      ),
    };
  }
  try {
    const tape = classification.adapter.decodeTape(tapeOutput.scriptHex, classification.code.tapeSize);
    return {
      kind: "SUPPORTED",
      pair: {
        codeVout,
        tapeVout: codeVout + 1,
        code: classification.code,
        tape,
      },
    };
  } catch (error) {
    return { kind: "INVALID", error: error as ProtocolError };
  }
}

async function fetchTransaction(ctx: Context, txid: string): Promise<FetchOutcome> {
  const normalized = txid.toLowerCase();
  let cached = ctx.fetchCache.get(normalized);
  if (!cached) {
    ctx.queriedTxids.push(normalized);
    cached = Promise.resolve()
      .then(() => API.fetchTXraw(normalized, ctx.network))
      .then((transaction): FetchOutcome => {
        const view = snapshotTransaction(transaction);
        ctx.resolvedTxids.push(normalized);
        ctx.resolvedTransactions += 1;
        return { kind: "ok", requestedTxid: normalized, view };
      })
      .catch((error): FetchOutcome => ({ kind: "source-error", requestedTxid: normalized, error }));
    ctx.fetchCache.set(normalized, cached);
  }
  return cached;
}

function createInputTable(root: FrozenTxView): InternalInput[] {
  return root.inputs.map((input, vin) => ({
    vin,
    prevTxid: input.txid,
    prevVout: input.vout,
    kind: "UNRESOLVED",
    resolution: "NOT_REQUESTED",
    attempted: false,
  }));
}

async function resolveParent(
  root: FrozenTxView,
  input: InternalInput,
  ctx: Context,
  role: "POSITIVE_SOURCE" | "ZERO_WITNESS_CANDIDATE",
): Promise<"ok" | "source-error" | "invalid"> {
  input.attempted = true;
  const rootInput = root.inputs[input.vin];
  const fetched = await fetchTransaction(ctx, rootInput.txid);
  if (fetched.kind === "source-error") {
    input.kind = "UNRESOLVED";
    input.resolution = "UNAVAILABLE";
    if (role === "POSITIVE_SOURCE") {
      addUnknown(ctx, "PARENT_FETCH_FAILED", "PARENT", {
        vin: input.vin,
        txid: rootInput.txid,
      });
      ctx.requiredSourceTxids.add(rootInput.txid);
    }
    return "source-error";
  }

  const parent = fetched.view;
  const output = parent.outputs[rootInput.vout];
  if (!output) {
    input.kind = "UNRESOLVED";
    input.resolution = "INVALID";
    addInvalid(ctx, "PARENT_VOUT_OUT_OF_RANGE", "PARENT", {
      vin: input.vin,
      txid: rootInput.txid,
      vout: rootInput.vout,
    });
    return "invalid";
  }
  ctx.parentsChecked += 1;
  input.parent = parent;
  input.parentTxid = rootInput.txid;
  const decoded = decodePairAt(parent, rootInput.vout);
  if (decoded.kind === "INVALID") {
    input.kind = "UNRESOLVED";
    input.resolution = "INVALID";
    addInvalid(ctx, decoded.error.code, "PARENT", {
      vin: input.vin,
      txid: rootInput.txid,
      vout: rootInput.vout,
    }, decoded.error.message);
    return "invalid";
  }
  if (decoded.kind === "KNOWN_UNSUPPORTED") {
    input.kind = "ORDINARY";
    input.resolution = "RESOLVED";
    if (role === "POSITIVE_SOURCE") {
      addInvalid(ctx, "MIXED_TOKEN_PROTOCOLS", "PARENT", {
        vin: input.vin,
        txid: rootInput.txid,
        vout: rootInput.vout,
      }, `input token ${unsupportedProtocolKey(decoded.artifact)} differs from output protocol ${ctx.protocol ? protocolKey(ctx.protocol) : "unknown"}`);
      return "invalid";
    }
    return "ok";
  }
  if (decoded.kind === "NONE") {
    input.kind = "ORDINARY";
    input.resolution = "RESOLVED";
    return "ok";
  }
  const pair = decoded.pair;
  input.kind = pair.code.outputKind;
  input.resolution = "RESOLVED";
  input.pair = pair;
  if (ctx.protocol !== undefined && protocolKey(pair.code.protocol) !== protocolKey(ctx.protocol)) {
    if (role === "POSITIVE_SOURCE") {
      addInvalid(ctx, "MIXED_TOKEN_PROTOCOLS", "PARENT", {
        vin: input.vin,
        txid: rootInput.txid,
        vout: rootInput.vout,
      }, `input token ${protocolKey(pair.code.protocol)} differs from output protocol ${protocolKey(ctx.protocol)}`);
      return "invalid";
    }
    return "ok";
  }
  return "ok";
}

function buildMatrix(groups: readonly InternalOutputGroup[]): bigint[][] {
  return groups
    .filter((group) => group.pair !== undefined)
    .map((group) => group.pair!.tape.slots.slice());
}

function collectTokenGroups(groups: readonly InternalOutputGroup[]): InternalOutputGroup[] {
  return groups.filter((group) => group.pair !== undefined);
}

function columnSum(groups: readonly InternalOutputGroup[], vin: number): bigint {
  return collectTokenGroups(groups).reduce((sum, group) => sum + group.pair!.tape.slots[vin], 0n);
}

function positiveVins(groups: readonly InternalOutputGroup[]): number[] {
  const vins = new Set<number>();
  for (const group of collectTokenGroups(groups)) {
    group.pair!.tape.slots.forEach((amount, vin) => {
      if (amount > 0n) vins.add(vin);
    });
  }
  return [...vins].sort((a, b) => a - b);
}

function validateRoot(root: FrozenTxView, ctx: Context): void {
  if (root.version !== 10) {
    addInvalid(ctx, "INVALID_TRANSACTION_VERSION", "ROOT", {}, "root transaction version must be 10");
  }
  if (root.inputs.length < 1 || root.inputs.length > TBC20_MAX_INPUTS) {
    addInvalid(ctx, "INPUT_LIMIT_EXCEEDED", "ROOT", {}, `root transaction must contain 1-${TBC20_MAX_INPUTS} inputs`);
  }
  const seen = new Set<string>();
  for (const input of root.inputs) {
    const key = `${input.txid}:${input.vout}`;
    if (seen.has(key)) {
      addInvalid(ctx, "DUPLICATE_INPUT_OUTPOINT", "ROOT", { txid: input.txid, vout: input.vout });
    }
    seen.add(key);
  }
}

function validateOutputOnlyMatrixRules(root: FrozenTxView, groups: InternalOutputGroup[], ctx: Context): void {
  const tokenGroups = collectTokenGroups(groups);
  for (let vin = 0; vin < TBC20_AMOUNT_SLOTS; vin += 1) {
    const identities = new Set<string>();
    for (const group of tokenGroups) {
      if (group.pair!.tape.slots[vin] > 0n) identities.add(group.pair!.code.identity);
    }
    if (identities.size > 0 && vin >= root.inputs.length) {
      addInvalid(ctx, "AMOUNT_SLOT_WITHOUT_INPUT", "MATRIX", { vin });
    }
    if (identities.size > 1) {
      addInvalid(ctx, "OUTPUT_INPUT_IDENTITY_MISMATCH", "MATRIX", { vin }, "one vin cannot fund more than one token identity");
    }
  }

  const envelopes = new Map<string, Set<string>>();
  for (const group of tokenGroups) {
    const list = envelopes.get(group.pair!.code.identity) ?? new Set<string>();
    list.add(group.pair!.tape.envelopeHex);
    envelopes.set(group.pair!.code.identity, list);
  }
  for (const [identity, variants] of envelopes) {
    if (variants.size > 1) {
      if (ctx.requireExactTapeEnvelope) {
        addInvalid(ctx, "TAPE_ENVELOPE_MISMATCH", "MATRIX", { identity });
      } else {
        addWarning(ctx, "TAPE_ENVELOPE_MISMATCH", "MATRIX", { identity });
      }
    }
  }
}

async function resolvePositiveSources(
  root: FrozenTxView,
  groups: InternalOutputGroup[],
  inputs: InternalInput[],
  vins: readonly number[],
  ctx: Context,
): Promise<boolean> {
  let complete = true;
  for (const vin of vins) {
    if (vin >= root.inputs.length) {
      complete = false;
      continue;
    }
    const input = inputs[vin];
    // A positive output column makes this prevout a required source even when
    // the trusted API returns an unusable/non-token parent.
    ctx.requiredSourceTxids.add(input.prevTxid);
    const outcome = await resolveParent(root, input, ctx, "POSITIVE_SOURCE");
    if (outcome === "source-error") {
      complete = false;
      continue;
    }
    if (outcome === "invalid") {
      complete = false;
      continue;
    }
    if ((input.kind !== "TBC20" && input.kind !== "FT") || !input.pair || !input.parent) {
      addInvalid(ctx, "AMOUNT_SLOT_WITHOUT_TOKEN_INPUT", "MATRIX", { vin });
      complete = false;
      continue;
    }
    input.sourceRole = "POSITIVE_SOURCE";
    if (input.parent.version !== 10) {
      addInvalid(ctx, "INVALID_TRANSACTION_VERSION", "PARENT", { vin, txid: input.prevTxid });
    }
    if (input.parent.inputs.length < 1 || input.parent.inputs.length > TBC20_MAX_INPUTS) {
      addInvalid(ctx, "INPUT_LIMIT_EXCEEDED", "PARENT", { vin, txid: input.prevTxid });
    }

    const outputIdentities = new Set(
      collectTokenGroups(groups)
        .filter((group) => group.pair!.tape.slots[vin] > 0n)
        .map((group) => group.pair!.code.identity),
    );
    if (outputIdentities.size !== 1 || !outputIdentities.has(input.pair.code.identity)) {
      addInvalid(ctx, "OUTPUT_INPUT_IDENTITY_MISMATCH", "MATRIX", {
        vin,
        identity: input.pair.code.identity,
      });
    }
    const actual = columnSum(groups, vin);
    if (actual !== input.pair.tape.balanceRaw) {
      addInvalid(ctx, "VIN_AMOUNT_NOT_CONSERVED", "MATRIX", { vin, identity: input.pair.code.identity },
        `vin ${vin} contributes ${actual} raw but parent balance is ${input.pair.tape.balanceRaw}`);
    }
  }
  return complete;
}

interface ZeroRejection {
  code: "INVALID_TRANSACTION_VERSION" | "INPUT_LIMIT_EXCEEDED" | "TAPE_ENVELOPE_MISMATCH" | "OUTPUT_IDENTITY_WITHOUT_INPUT";
  vin: number;
}

interface ZeroSearchResult {
  complete: boolean;
  unresolved: Set<string>;
  failedCandidateVins: number[];
  rejections: Map<string, ZeroRejection[]>;
}

function expectedEnvelopeForIdentity(groups: InternalOutputGroup[], identity: string): string | undefined {
  return collectTokenGroups(groups).find((group) => group.pair!.code.identity === identity)?.pair!.tape.envelopeHex;
}

async function searchZeroWitnesses(
  root: FrozenTxView,
  groups: InternalOutputGroup[],
  inputs: InternalInput[],
  targets: Set<string>,
  positive: Set<number>,
  ctx: Context,
): Promise<ZeroSearchResult> {
  const unresolved = new Set(targets);
  const failedCandidateVins: number[] = [];
  const rejections = new Map<string, ZeroRejection[]>();

  const remainingVins = root.inputs.map((_, vin) => vin).filter((vin) => !positive.has(vin));
  if (unresolved.size > remainingVins.length) {
    addInvalid(ctx, "ZERO_IDENTITY_WITNESS_CAPACITY_EXCEEDED", "MATRIX", {},
      `${unresolved.size} distinct zero identities cannot be witnessed by ${remainingVins.length} remaining vins`);
    return { complete: false, unresolved, failedCandidateVins, rejections };
  }

  for (const vin of remainingVins) {
    if (unresolved.size === 0) break;
    const input = inputs[vin];
    const outcome = await resolveParent(root, input, ctx, "ZERO_WITNESS_CANDIDATE");
    if (outcome === "source-error") {
      failedCandidateVins.push(vin);
      continue;
    }
    if (outcome === "invalid") {
      // A trusted returned Transaction lacking its referenced vout is already
      // a deterministic root graph contradiction, never wildcard capacity.
      continue;
    }
    if ((input.kind !== "TBC20" && input.kind !== "FT") || !input.pair || !input.parent) continue;

    const pair = input.pair;
    // A speculative zero-witness lookup may encounter an unrelated token
    // protocol. It is not a selected source and must not make the result
    // depend on vin ordering; only matching family/version candidates qualify.
    if (ctx.protocol !== undefined && protocolKey(pair.code.protocol) !== protocolKey(ctx.protocol)) {
      continue;
    }
    if (pair.tape.balanceRaw > 0n) {
      if (columnSum(groups, vin) === 0n) {
        addInvalid(ctx, "VIN_AMOUNT_NOT_CONSERVED", "MATRIX", {
          vin,
          identity: pair.code.identity,
        });
      }
      continue;
    }
    if (!unresolved.has(pair.code.identity)) continue;

    const identityRejections = rejections.get(pair.code.identity) ?? [];
    if (input.parent.version !== 10) {
      identityRejections.push({ code: "INVALID_TRANSACTION_VERSION", vin });
      rejections.set(pair.code.identity, identityRejections);
      continue;
    }
    if (input.parent.inputs.length < 1 || input.parent.inputs.length > TBC20_MAX_INPUTS) {
      identityRejections.push({ code: "INPUT_LIMIT_EXCEEDED", vin });
      rejections.set(pair.code.identity, identityRejections);
      continue;
    }
    const expectedEnvelope = expectedEnvelopeForIdentity(groups, pair.code.identity);
    if (ctx.requireExactTapeEnvelope && expectedEnvelope !== pair.tape.envelopeHex) {
      identityRejections.push({ code: "TAPE_ENVELOPE_MISMATCH", vin });
      rejections.set(pair.code.identity, identityRejections);
      continue;
    }
    if (!ctx.requireExactTapeEnvelope && expectedEnvelope !== pair.tape.envelopeHex) {
      addWarning(ctx, "TAPE_ENVELOPE_MISMATCH", "MATRIX", { vin, identity: pair.code.identity });
    }

    input.sourceRole = "ZERO_IDENTITY_WITNESS";
    ctx.requiredSourceTxids.add(input.prevTxid);
    unresolved.delete(pair.code.identity);
  }

  if (unresolved.size === 0) {
    return { complete: true, unresolved, failedCandidateVins, rejections };
  }

  // Each failed vin has capacity one. A single unknown vin cannot witness two
  // distinct zero-output identities, even if both are otherwise plausible.
  if (failedCandidateVins.length >= unresolved.size) {
    addUnknown(ctx, "ZERO_IDENTITY_WITNESS_UNRESOLVED", "MATRIX", {},
      `${unresolved.size} zero identities may be covered by ${failedCandidateVins.length} unavailable vins`);
  } else if (failedCandidateVins.length === 0) {
    const priority: ZeroRejection["code"][] = [
      "INVALID_TRANSACTION_VERSION",
      "INPUT_LIMIT_EXCEEDED",
      "TAPE_ENVELOPE_MISMATCH",
      "OUTPUT_IDENTITY_WITHOUT_INPUT",
    ];
    for (const identity of [...unresolved].sort()) {
      const rejected = rejections.get(identity) ?? [];
      const selectedCode = priority.find((code) => rejected.some((entry) => entry.code === code)) ??
        "OUTPUT_IDENTITY_WITHOUT_INPUT";
      const selectedRejection = rejected.find((entry) => entry.code === selectedCode);
      addInvalid(ctx, selectedCode, "MATRIX", { identity, vin: selectedRejection?.vin });
    }
  } else {
    addInvalid(ctx, "ZERO_IDENTITY_WITNESS_CAPACITY_EXCEEDED", "MATRIX", {},
      `${unresolved.size} zero identities exceed ${failedCandidateVins.length} remaining witness capacity`);
  }
  return { complete: false, unresolved, failedCandidateVins, rejections };
}

function requiredSources(inputs: readonly InternalInput[]): InternalInput[] {
  return inputs.filter((input) => input.pair && input.parent && input.sourceRole);
}

function validateRequiredSourceEnvelopes(
  sources: readonly InternalInput[],
  groups: InternalOutputGroup[],
  ctx: Context,
): void {
  for (const source of sources) {
    const identity = source.pair!.code.identity;
    const expected = expectedEnvelopeForIdentity(groups, identity);
    if (expected !== source.pair!.tape.envelopeHex) {
      if (ctx.requireExactTapeEnvelope) {
        addInvalid(ctx, "TAPE_ENVELOPE_MISMATCH", "MATRIX", { vin: source.vin, identity });
      } else {
        addWarning(ctx, "TAPE_ENVELOPE_MISMATCH", "MATRIX", { vin: source.vin, identity });
      }
    }
  }
}

function validateIdentityClosureAndTotals(
  sources: readonly InternalInput[],
  groups: InternalOutputGroup[],
  ctx: Context,
): void {
  const tokenGroups = collectTokenGroups(groups);
  const sourceIdentities = new Set(sources.map((input) => input.pair!.code.identity));
  for (const group of tokenGroups) {
    if (!sourceIdentities.has(group.pair!.code.identity)) {
      addInvalid(ctx, "OUTPUT_IDENTITY_WITHOUT_INPUT", "MATRIX", { identity: group.pair!.code.identity });
    }
  }

  const identities = new Set([...sourceIdentities, ...tokenGroups.map((group) => group.pair!.code.identity)]);
  ctx.assets = [];
  for (const identity of [...identities].sort()) {
    const matchingInputs = sources.filter((input) => input.pair!.code.identity === identity);
    const matchingGroups = tokenGroups.filter((group) => group.pair!.code.identity === identity);
    const inputRaw = matchingInputs.reduce((sum, input) => sum + input.pair!.tape.balanceRaw, 0n);
    const outputRaw = matchingGroups.reduce((sum, group) => sum + group.pair!.tape.balanceRaw, 0n);
    if (inputRaw !== outputRaw) {
      addInvalid(ctx, "IDENTITY_AMOUNT_NOT_CONSERVED", "MATRIX", { identity },
        `identity input ${inputRaw} differs from output ${outputRaw}`);
    }
    ctx.assets.push({
      identity,
      protocol: (matchingGroups[0]?.pair ?? matchingInputs[0]?.pair)!.code.protocol,
      inputVins: matchingInputs.map((input) => input.vin),
      outputGroups: matchingGroups.map((group) => group.logicalIndex),
      inputRaw,
      outputRaw,
      envelopeHash: matchingGroups[0]?.pair?.tape.envelopeHash,
    });
  }
}

async function validateLineage(
  sources: readonly InternalInput[],
  ctx: Context,
): Promise<void> {
  for (const source of sources) {
    const parent = source.parent!;
    const pair = source.pair!;
    for (let slot = 0; slot < TBC20_AMOUNT_SLOTS; slot += 1) {
      if (pair.tape.slots[slot] === 0n) continue;
      ctx.lineageExpected += 1;
      if (slot >= parent.inputs.length) {
        addInvalid(ctx, "PARENT_SLOT_WITHOUT_VIN", "PARENT", {
          vin: source.vin,
          slot,
          txid: source.prevTxid,
        });
        continue;
      }
      const parentInput = parent.inputs[slot];
      ctx.requiredSourceTxids.add(parentInput.txid);
      const fetched = await fetchTransaction(ctx, parentInput.txid);
      if (fetched.kind === "source-error") {
        addUnknown(ctx, "ANCESTOR_FETCH_FAILED", "ANCESTOR", {
          vin: source.vin,
          slot,
          txid: parentInput.txid,
        });
        continue;
      }
      const ancestor = fetched.view;
      const ancestorOutput = ancestor.outputs[parentInput.vout];
      if (!ancestorOutput) {
        addInvalid(ctx, "ANCESTOR_VOUT_OUT_OF_RANGE", "ANCESTOR", {
          vin: source.vin,
          slot,
          txid: parentInput.txid,
          vout: parentInput.vout,
        });
        continue;
      }
      ctx.ancestorsChecked += 1;
      if (ancestor.version !== 10) {
        addInvalid(ctx, "INVALID_TRANSACTION_VERSION", "ANCESTOR", {
          vin: source.vin,
          slot,
          txid: parentInput.txid,
        });
        continue;
      }
      if (ancestorOutput.scriptBytes === 0) {
        addInvalid(ctx, "ANCESTOR_EMPTY_LOCKING_SCRIPT", "ANCESTOR", {
          vin: source.vin,
          slot,
          txid: parentInput.txid,
          vout: parentInput.vout,
        });
        continue;
      }

      let ancestorIdentity: string;
      try {
        const ancestorCode = classifyCode(
          ancestorOutput.scriptHex,
          ancestor.outputs[parentInput.vout + 1]?.scriptHex,
        );
        ancestorIdentity = ancestorCode.kind === "STRICT"
          ? ancestorCode.code.identity
          : calculateAbiIdentity(ancestorOutput.scriptHex);
      } catch (error) {
        addInvalid(ctx, "ANCESTOR_EMPTY_LOCKING_SCRIPT", "ANCESTOR", {
          vin: source.vin,
          slot,
          txid: parentInput.txid,
        }, (error as Error).message);
        continue;
      }
      const common = {
        currentVin: source.vin,
        parentTxid: source.prevTxid,
        parentCodeVout: pair.codeVout,
        parentSlot: slot,
        parentVin: slot,
        abiPrepreIndex: 5 - slot,
        ancestorTxid: parentInput.txid,
        ancestorVout: parentInput.vout,
        parentIdentity: pair.code.identity,
        ancestorIdentity,
      };
      if (ancestorIdentity === pair.code.identity) {
        ctx.ancestorEdges.push({ ...common, resolution: "SAME_IDENTITY" });
        ctx.lineageResolved += 1;
        continue;
      }
      if (slot === 0 && parentInput.outpointWire36Hex === pair.code.originalUTXOWire36Hex) {
        ctx.ancestorEdges.push({ ...common, resolution: "ORIGINAL_UTXO" });
        ctx.originalUTXOBoundaries += 1;
        ctx.lineageResolved += 1;
        continue;
      }
      addInvalid(
        ctx,
        slot === 0 ? "ORIGINAL_UTXO_MISMATCH" : "ANCESTOR_IDENTITY_MISMATCH",
        "ANCESTOR",
        { vin: source.vin, slot, txid: parentInput.txid, vout: parentInput.vout },
      );
    }
  }
}

function publicInput(input: InternalInput): TBC20ValidatedInput {
  const base: ValidatedInputBase = {
    vin: input.vin,
    prevTxid: input.prevTxid,
    prevVout: input.prevVout,
  };
  if ((input.kind === "TBC20" || input.kind === "FT") && input.resolution === "RESOLVED" && input.pair) {
    return {
      ...base,
      kind: input.kind,
      resolution: "RESOLVED",
      sourceRole: input.sourceRole,
      parentTxid: input.parentTxid!,
      codeVout: input.pair.codeVout,
      tapeVout: input.pair.tapeVout,
      identity: input.pair.code.identity,
      slots: input.pair.tape.slots.slice() as [bigint, bigint, bigint, bigint, bigint, bigint],
      balanceRaw: input.pair.tape.balanceRaw,
      protocol: input.pair.code.protocol,
    };
  }
  if (input.kind === "ORDINARY" && input.resolution === "RESOLVED") {
    return { ...base, kind: "ORDINARY", resolution: "RESOLVED", parentTxid: input.parentTxid! };
  }
  return {
    ...base,
    kind: "UNRESOLVED",
    resolution: input.resolution === "UNAVAILABLE"
      ? "UNAVAILABLE"
      : input.resolution === "INVALID"
        ? "INVALID"
        : "NOT_REQUESTED",
  };
}

function publicGroup(group: InternalOutputGroup): TBC20ValidatedOutputGroup {
  return {
    logicalIndex: group.logicalIndex,
    kind: group.kind,
    firstVout: group.firstVout,
    physicalVoutCount: group.physicalVoutCount,
    codeVout: group.codeVout,
    tapeVout: group.tapeVout,
    identity: group.identity,
    slots: group.slots ? group.slots.slice() as [bigint, bigint, bigint, bigint, bigint, bigint] : undefined,
    balanceRaw: group.balanceRaw,
    protocol: group.protocol ? { ...group.protocol } : undefined,
    recognizedContract: group.recognizedContract ? { ...group.recognizedContract } : undefined,
  };
}

function finalize(ctx: Context, includeSource = true): TBC20ValidationResult {
  if (ctx.invalidIssues.length === 0 && ctx.unknownIssues.length === 0 && ctx.kind === "TRANSITION") {
    const mandatory: TBC20Assurance[] = [
      "STRUCTURE",
      "TRANSITION",
      "OUTPUT_SOURCE_LINEAGE",
      "OUTPUT_SOURCE_GRAPH_RESOLVED",
    ];
    if (mandatory.some((assurance) => !ctx.assurances.has(assurance))) {
      addUnknown(ctx, "VALIDATOR_INTERNAL_INCOMPLETE", "ROOT", {}, "mandatory validation assurance is incomplete");
    }
  }
  const status: TBC20ValidationStatus = ctx.invalidIssues.length > 0
    ? "INVALID"
    : ctx.unknownIssues.length > 0
      ? "UNKNOWN"
      : ctx.kind === "TRANSITION"
        ? "VALID"
        : "INVALID";
  const issues = [...ctx.invalidIssues, ...ctx.unknownIssues, ...ctx.warnings].map(cloneIssue);
  const data = {
    status,
    txid: ctx.txid,
    kind: ctx.kind,
    protocol: ctx.protocol ? { ...ctx.protocol } : undefined,
    assurances: [...ctx.assurances],
    issues,
    inputs: ctx.inputs.map(publicInput),
    outputGroups: ctx.groups.map(publicGroup),
    assets: ctx.assets.map((asset) => ({
      ...asset,
      protocol: { ...asset.protocol },
      inputVins: [...asset.inputVins],
      outputGroups: [...asset.outputGroups],
    })),
    matrix: ctx.matrix.map((row) => row.slice()),
    ancestorEdges: ctx.ancestorEdges.map((edge) => ({ ...edge })),
    source: includeSource ? {
      network: ctx.network,
      api: "API.fetchTXraw" as const,
      trustModel: "API_FETCH_TXRAW_FULLY_TRUSTED" as const,
      rootTrustModel: "CALLER_ASSERTED_ON_CHAIN_AND_INPUT_SCRIPTS_VALID" as const,
      queriedTxids: [...ctx.queriedTxids],
      resolvedTxids: [...ctx.resolvedTxids],
      requiredSourceTxids: [...ctx.requiredSourceTxids],
    } : undefined,
    resolvedTransactions: ctx.resolvedTransactions,
    parentsChecked: ctx.parentsChecked,
    ancestorsChecked: ctx.ancestorsChecked,
    originalUTXOBoundaries: ctx.originalUTXOBoundaries,
  };
  const result = {
    ...data,
    toJSON(): Record<string, unknown> {
      return jsonSafe(data) as Record<string, unknown>;
    },
  } satisfies TBC20ValidationResult;
  return deepFreeze(result);
}

function invalidPolicyReport(message: string): TBC20ValidationResult {
  const fallback: NormalizedOptions = {
    transaction: "",
    network: "",
    requireExactTapeEnvelope: true,
  };
  const ctx = createContext(fallback);
  addInvalid(ctx, "INVALID_POLICY", "ROOT", {}, message);
  return finalize(ctx, false);
}

export class TokenValidator {
  static async validateOnChainTransaction(
    options: TBC20ValidateTransitionOptions,
  ): Promise<TBC20ValidationResult> {
    const normalized = normalizeOptions(options);
    if (normalized.kind === "invalid") return invalidPolicyReport(normalized.message);

    const ctx = createContext(normalized.value);
    try {
      const rootResolution = parseAndSnapshotRoot(normalized.value.transaction);
      if (rootResolution.kind !== "ok") {
        addUnknown(ctx, "ROOT_RAW_INVALID", "ROOT");
        return finalize(ctx);
      }
      const root = rootResolution.view;
      ctx.txid = rootResolution.txid;
      ctx.inputs = createInputTable(root);
      validateRoot(root, ctx);
      if (ctx.invalidIssues.length > 0) return finalize(ctx);

      ctx.groups = scanOutputs(root, ctx);
      if (ctx.invalidIssues.length > 0) return finalize(ctx);
      ctx.assurances.add("STRUCTURE");

      const tokenGroups = collectTokenGroups(ctx.groups);
      if (tokenGroups.length === 0) {
        ctx.kind = "NON_TOKEN";
        ctx.assurances.add("OUTPUT_SOURCE_GRAPH_RESOLVED");
        addInvalid(ctx, "NO_TOKEN_OUTPUT", "OUTPUT_SCAN");
        return finalize(ctx);
      }
      ctx.kind = "TRANSITION";
      ctx.matrix = buildMatrix(ctx.groups);
      validateOutputOnlyMatrixRules(root, ctx.groups, ctx);
      if (ctx.invalidIssues.length > 0) return finalize(ctx);

      const positive = positiveVins(ctx.groups);
      const positiveSet = new Set(positive);
      const positiveComplete = await resolvePositiveSources(
        root,
        ctx.groups,
        ctx.inputs,
        positive,
        ctx,
      );
      if (ctx.invalidIssues.length > 0) return finalize(ctx);

      const positiveOutputIdentities = new Set<string>();
      for (const group of tokenGroups) {
        if (group.pair!.tape.balanceRaw > 0n) positiveOutputIdentities.add(group.pair!.code.identity);
      }
      const zeroTargets = new Set<string>();
      for (const group of tokenGroups) {
        if (group.pair!.tape.balanceRaw === 0n && !positiveOutputIdentities.has(group.pair!.code.identity)) {
          zeroTargets.add(group.pair!.code.identity);
        }
      }

      let zeroComplete = zeroTargets.size === 0;
      if (!zeroComplete) {
        const zeroSearch = await searchZeroWitnesses(
          root,
          ctx.groups,
          ctx.inputs,
          zeroTargets,
          positiveSet,
          ctx,
        );
        zeroComplete = zeroSearch.complete;
      }
      if (ctx.invalidIssues.length > 0) return finalize(ctx);

      const sources = requiredSources(ctx.inputs);
      validateRequiredSourceEnvelopes(sources, ctx.groups, ctx);
      if (ctx.invalidIssues.length > 0) return finalize(ctx);

      const transitionEvidenceComplete = positiveComplete && zeroComplete;
      if (transitionEvidenceComplete) {
        validateIdentityClosureAndTotals(sources, ctx.groups, ctx);
        if (ctx.invalidIssues.length > 0) return finalize(ctx);
        ctx.assurances.add("TRANSITION");
      }

      // UNKNOWN evidence never prevents checking lineage branches that are
      // already independently resolvable. This preserves INVALID > UNKNOWN.
      await validateLineage(sources, ctx);
      if (ctx.invalidIssues.length > 0) return finalize(ctx);

      if (transitionEvidenceComplete && ctx.lineageExpected === ctx.lineageResolved) {
        ctx.assurances.add("OUTPUT_SOURCE_LINEAGE");
      }
      if (
        transitionEvidenceComplete &&
        ctx.lineageExpected === ctx.lineageResolved &&
        !ctx.unknownIssues.some((issue) =>
          issue.code === "PARENT_FETCH_FAILED" || issue.code === "ANCESTOR_FETCH_FAILED" ||
          issue.code === "ZERO_IDENTITY_WITNESS_UNRESOLVED")
      ) {
        ctx.assurances.add("OUTPUT_SOURCE_GRAPH_RESOLVED");
      }
      return finalize(ctx);
    } catch (error) {
      if (error instanceof ProtocolError) {
        addInvalid(ctx, error.code, error.stage, error.details, error.message);
      } else {
        addUnknown(ctx, "VALIDATOR_INTERNAL_ERROR", "ROOT", {}, (error as Error)?.message ?? String(error));
      }
      return finalize(ctx);
    }
  }

  static async assertValidOnChainTransaction(
    options: TBC20ValidateTransitionOptions,
  ): Promise<TBC20ValidationResult> {
    const report = await TokenValidator.validateOnChainTransaction(options);
    if (report.status !== "VALID" || report.kind !== "TRANSITION") {
      throw new TokenValidationError(report);
    }
    return report;
  }
}

module.exports = TokenValidator;
(module.exports as typeof TokenValidator & {
  TokenValidator: typeof TokenValidator;
  TokenValidationError: typeof TokenValidationError;
}).TokenValidator = TokenValidator;
(module.exports as typeof TokenValidator & {
  TokenValidator: typeof TokenValidator;
  TokenValidationError: typeof TokenValidationError;
}).TokenValidationError = TokenValidationError;
