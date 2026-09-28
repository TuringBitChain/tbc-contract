import { createHash } from 'node:crypto';
import * as tbc from 'tbc-lib-js';
import { getTbc20StandardPartialScriptData, TBC20_STANDARD_MAX_SLOT_AMOUNT } from '../tbc20-standard/tbc20-standard-unlock';

export type TBC20StablecoinScriptLike = tbc.Script | Buffer | string;
export interface TBC20StablecoinCodeOptions {
  /** SHA256 of the complete issuance certificate Code at ancestor vout 0. */
  coinNftCodeHash: Buffer;
  /** HASH160 of the actual signing public key bytes (32 bytes for MuSig2). */
  adminPubKeyHash: Buffer;
  tapeSize: number;
  controller: Buffer;
}
export interface TBC20StablecoinCodeDescriptor extends TBC20StablecoinCodeOptions {
  identity: Buffer;
  codeSize: number;
}
export interface TBC20StablecoinTapeOptions {
  amounts: readonly bigint[];
  tapeSize: number;
  lockTime: number;
  /** Complete push-only script fragment; the remaining space is filled with OP_0. */
  metadata?: Buffer;
}
export interface TBC20StablecoinTapeDescriptor {
  amounts: readonly bigint[];
  balance: bigint;
  tapeSize: number;
  lockTime: number;
  /** Exact metadata region, including any OP_0 padding. */
  metadata: Buffer;
}

const ARTIFACT = require('./artifacts/tbc20-stablecoin.json');
if (createHash('sha256').update(JSON.stringify(ARTIFACT)).digest('hex') !==
    'c686fc271f0ee8116325bf541d87c4d2e6ad839896a9d9dd21dcf2ac847660e3')
  throw new Error('TBC20 Stablecoin: frozen compiler artifact integrity check failed');
function deepFreeze(value: unknown): void {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
}
deepFreeze(ARTIFACT);
const PLACEHOLDER = /(<self\.(?:CoinNftCodeHash32|AdminPubKeyHash20|ConstTapeSize1|Controller21)>)/;
const TAPE_MARKER = Buffer.from('TBC20TAPE', 'ascii');
const PREFIX = Buffer.from('006a30', 'hex');
const UINT32_MAX = 0xffffffff;
const LOCKTIME_THRESHOLD = 500000000;

function fail(message: string): never { throw new Error(`TBC20 Stablecoin: ${message}`); }
function scriptBytes(value: TBC20StablecoinScriptLike): Buffer {
  if (value instanceof tbc.Script) return Buffer.from(value.toBuffer());
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (typeof value !== 'string' || !/^(?:[0-9a-fA-F]{2})+$/.test(value))
    fail('script must be a Script, Buffer or nonempty hexadecimal string');
  return Buffer.from(value, 'hex');
}
function assertBytes(value: Buffer, width: number, name: string): void {
  if (!Buffer.isBuffer(value) || value.length !== width) fail(`${name} must be ${width} bytes`);
}
function assertTapeSize(size: number): void {
  if (!Number.isInteger(size) || size < 66 || size > 127) fail('tapeSize must be 66-127 bytes');
}
function assertLockTime(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX)
    fail('lockTime must be an unsigned 32-bit integer');
}
function assertAmounts(amounts: readonly bigint[]): void {
  if (!Array.isArray(amounts) || amounts.length !== 6) fail('amounts must contain exactly six bigint slots');
  amounts.forEach((amount, i) => {
    if (typeof amount !== 'bigint' || amount < 0n || amount > TBC20_STANDARD_MAX_SLOT_AMOUNT)
      fail(`amounts[${i}] must be a bigint in the signed-63-bit nonnegative range`);
  });
}
function assertMetadata(metadata: Buffer): void {
  if (!Buffer.isBuffer(metadata)) fail('metadata must be a Buffer containing a complete push-only script');
  try {
    const script = tbc.Script.fromBuffer(metadata);
    if (!script.isPushOnly() || !script.toBuffer().equals(metadata)) fail('metadata must contain only complete script pushes');
    // tbc-lib-js deliberately preserves truncated pushes when parsing a script;
    // check their declared lengths so metadata cannot consume the lock field.
    for (const chunk of script.chunks) {
      if (chunk.opcodenum === tbc.Opcode.OP_RESERVED ||
          (chunk.buf !== undefined && chunk.len !== chunk.buf.length))
        fail('metadata must contain only complete script pushes');
    }
  } catch { fail('metadata must contain only complete script pushes'); }
}
function assertCodeOptions(options: TBC20StablecoinCodeOptions): void {
  if (!options || typeof options !== 'object') fail('code options are required');
  assertBytes(options.coinNftCodeHash, 32, 'coinNftCodeHash');
  assertBytes(options.adminPubKeyHash, 20, 'adminPubKeyHash');
  assertBytes(options.controller, 21, 'controller');
  if (options.controller[20] !== 0 && options.controller[20] !== 1)
    fail('controller must end with 00 (address) or 01 (contract)');
  assertTapeSize(options.tapeSize);
}
function template(): string {
  if ((ARTIFACT.unlock.main.match(/<[^>]+>/g) ?? []).length !== 123)
    fail('frozen artifact does not match the supported 123-field ABI');
  return ARTIFACT.lock.hex;
}

/** Strict current TBC20Stablecoin contract and Tape codecs. No network, signing or broadcasts. */
export class TBC20StablecoinCodec {
  static readonly codeSatoshis = 500;
  static readonly codeSize = 2981;
  static readonly partialOffset = 2944;
  static readonly maxSlotAmount = TBC20_STANDARD_MAX_SLOT_AMOUNT;
  static readonly lockTimeThreshold = LOCKTIME_THRESHOLD;

  static instantiateCode(options: TBC20StablecoinCodeOptions): tbc.Script {
    assertCodeOptions(options);
    const hex = template()
      .replaceAll('<self.CoinNftCodeHash32>', '20' + options.coinNftCodeHash.toString('hex'))
      .replaceAll('<self.AdminPubKeyHash20>', '14' + options.adminPubKeyHash.toString('hex'))
      .replaceAll('<self.ConstTapeSize1>', '01' + options.tapeSize.toString(16).padStart(2, '0'))
      .replaceAll('<self.Controller21>', '15' + options.controller.toString('hex'));
    if (hex.includes('<')) fail('unresolved TBC20Stablecoin constructor parameter');
    const script = tbc.Script.fromHex(hex);
    if (script.toBuffer().length !== TBC20StablecoinCodec.codeSize || getTbc20StandardPartialScriptData(script).suffixData.length !== 37)
      fail('TBC20Stablecoin artifact size or block-aligned prefix changed');
    return script;
  }

  static parseCode(value: TBC20StablecoinScriptLike): TBC20StablecoinCodeDescriptor {
    const code = scriptBytes(value);
    const fields = new Map<string, Buffer>();
    let offset = 0;
    for (const segment of template().split(PLACEHOLDER)) {
      if (segment.startsWith('<self.')) {
        const width = segment === '<self.CoinNftCodeHash32>' ? 32 :
          segment === '<self.AdminPubKeyHash20>' ? 20 : segment === '<self.Controller21>' ? 21 : 1;
        if (offset + width + 1 > code.length || code[offset] !== width) fail('unsupported or modified TBC20Stablecoin Code template');
        const data = code.subarray(offset + 1, offset + width + 1);
        if (fields.has(segment) && !fields.get(segment)!.equals(data)) fail('inconsistent TBC20Stablecoin constructor parameter');
        fields.set(segment, Buffer.from(data));
        offset += width + 1;
      } else {
        const fixed = Buffer.from(segment, 'hex');
        if (!code.subarray(offset, offset + fixed.length).equals(fixed)) fail('unsupported or modified TBC20Stablecoin Code template');
        offset += fixed.length;
      }
    }
    if (offset !== code.length) fail('unsupported or modified TBC20Stablecoin Code length');
    const options: TBC20StablecoinCodeOptions = {
      coinNftCodeHash: fields.get('<self.CoinNftCodeHash32>')!,
      adminPubKeyHash: fields.get('<self.AdminPubKeyHash20>')!,
      tapeSize: fields.get('<self.ConstTapeSize1>')![0],
      controller: fields.get('<self.Controller21>')!,
    };
    const partial = getTbc20StandardPartialScriptData(TBC20StablecoinCodec.instantiateCode(options));
    return { ...options, identity: Buffer.concat([partial.partialHash, partial.size]), codeSize: code.length };
  }

  static validateCode(value: TBC20StablecoinScriptLike, expected: Partial<TBC20StablecoinCodeOptions> = {}): TBC20StablecoinCodeDescriptor {
    const descriptor = TBC20StablecoinCodec.parseCode(value);
    for (const field of ['coinNftCodeHash', 'adminPubKeyHash', 'controller'] as const) {
      if (expected[field] !== undefined && (!Buffer.isBuffer(expected[field]) || !expected[field]!.equals(descriptor[field])))
        fail(`TBC20Stablecoin ${field} does not match the expected value`);
    }
    if (expected.tapeSize !== undefined && expected.tapeSize !== descriptor.tapeSize)
      fail('TBC20Stablecoin tapeSize does not match the expected value');
    return descriptor;
  }

  static getCodeIdentity(value: TBC20StablecoinScriptLike): Buffer { return TBC20StablecoinCodec.parseCode(value).identity; }
  static replaceController(value: TBC20StablecoinScriptLike, controller: Buffer): tbc.Script {
    const previous = TBC20StablecoinCodec.parseCode(value);
    const script = TBC20StablecoinCodec.instantiateCode({ ...previous, controller });
    if (!TBC20StablecoinCodec.getCodeIdentity(script).equals(previous.identity)) fail('controller replacement changed TBC20Stablecoin identity');
    return script;
  }

  static buildTape(options: TBC20StablecoinTapeOptions): tbc.Script {
    if (!options || typeof options !== 'object') fail('tape options are required');
    assertTapeSize(options.tapeSize);
    assertAmounts(options.amounts);
    assertLockTime(options.lockTime);
    const metadata = options.metadata ?? Buffer.alloc(0);
    assertMetadata(metadata);
    if (metadata.length > options.tapeSize - 66) fail('metadata exceeds the fixed TBC20Stablecoin Tape capacity');
    const result = Buffer.alloc(options.tapeSize);
    PREFIX.copy(result);
    options.amounts.forEach((amount, i) => result.writeBigUInt64LE(amount, 3 + i * 8));
    metadata.copy(result, 51);
    result[result.length - 15] = 4;
    result.writeUInt32LE(options.lockTime, result.length - 14);
    result[result.length - 10] = 9;
    TAPE_MARKER.copy(result, result.length - 9);
    return tbc.Script.fromBuffer(result);
  }

  static parseTape(value: TBC20StablecoinScriptLike, profile: { tapeSize?: number } = {}): TBC20StablecoinTapeDescriptor {
    const bytes = scriptBytes(value);
    assertTapeSize(bytes.length);
    if (profile.tapeSize !== undefined && profile.tapeSize !== bytes.length) fail('TBC20Stablecoin Tape length does not match Code');
    if (!bytes.subarray(0, 3).equals(PREFIX) || bytes[bytes.length - 15] !== 4 ||
        bytes[bytes.length - 10] !== 9 || !bytes.subarray(bytes.length - 9).equals(TAPE_MARKER))
      fail('invalid TBC20Stablecoin Tape prefix, four-byte lock push or terminal marker');
    const metadata = Buffer.from(bytes.subarray(51, bytes.length - 15));
    assertMetadata(metadata);
    const amounts = Array.from({ length: 6 }, (_, i) => bytes.readBigUInt64LE(3 + i * 8));
    assertAmounts(amounts);
    return { amounts: Object.freeze(amounts), balance: amounts.reduce((a, b) => a + b, 0n),
      tapeSize: bytes.length, lockTime: bytes.readUInt32LE(bytes.length - 14), metadata };
  }

  static replaceTapeAmounts(value: TBC20StablecoinScriptLike, amounts: readonly bigint[]): tbc.Script {
    return TBC20StablecoinCodec.buildTape({ ...TBC20StablecoinCodec.parseTape(value), amounts });
  }
  static setLockTime(value: TBC20StablecoinScriptLike, lockTime: number): tbc.Script {
    return TBC20StablecoinCodec.buildTape({ ...TBC20StablecoinCodec.parseTape(value), lockTime });
  }

  /** Script lock requirement; chain finality must be evaluated separately. */
  static getRequiredLockTime(lockTimes: readonly number[]): number {
    let maximum = 0;
    let domain: boolean | undefined;
    for (const lockTime of lockTimes) {
      assertLockTime(lockTime);
      if (lockTime !== 0) {
        const timestamp = lockTime >= LOCKTIME_THRESHOLD;
        if (domain !== undefined && domain !== timestamp) fail('cannot combine nonzero height and timestamp TBC20Stablecoin locks');
        domain = timestamp;
      }
      maximum = Math.max(maximum, lockTime);
    }
    return maximum;
  }

  static verifyInputLock(tx: tbc.Transaction, inputIndex: number, tape: TBC20StablecoinScriptLike,
    profile: { tapeSize?: number } = {}, administrator = false): void {
    if (!(tx instanceof tbc.Transaction) || !Number.isInteger(inputIndex) || inputIndex < 0 || inputIndex >= tx.inputs.length)
      fail('invalid transaction or TBC20Stablecoin input index');
    if (typeof administrator !== 'boolean') fail('administrator must be a boolean');
    const parsed = TBC20StablecoinCodec.parseTape(tape, profile);
    assertLockTime(tx.nLockTime);
    if (tx.inputs[inputIndex].sequenceNumber === UINT32_MAX) fail('every TBC20Stablecoin input needs a nonfinal sequence, including administrator and zero locks');
    if (administrator) return;
    if (parsed.lockTime > 0 && (parsed.lockTime < LOCKTIME_THRESHOLD) !== (tx.nLockTime < LOCKTIME_THRESHOLD))
      fail('TBC20Stablecoin lock and transaction nLockTime use different height/timestamp domains');
    if (parsed.lockTime > tx.nLockTime) fail('transaction nLockTime does not satisfy the parent TBC20Stablecoin lock');
  }
}

export default TBC20StablecoinCodec;
