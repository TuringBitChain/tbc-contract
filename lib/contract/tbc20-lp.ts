import * as tbc from 'tbc-lib-js';
import { getPool3Artifact } from '../util/poolnft3/artifacts';
import { getTbc20StandardPartialScriptData, TBC20_STANDARD_MAX_SLOT_AMOUNT } from '../util/tbc20-standard/tbc20-standard-unlock';

export type TBC20LPScriptLike = tbc.Script | Buffer | string;

export interface TBC20LPCodeOptions {
  poolCodeHash: Buffer;
  tapeSize: number;
  controller: Buffer;
  timelocked: boolean;
}

export interface TBC20LPCodeDescriptor extends TBC20LPCodeOptions {
  /** SHA256 intermediate state of the immutable prefix followed by ScriptNum size. */
  identity: Buffer;
  codeSize: number;
}

export interface TBC20LPTapeOptions {
  amounts: readonly bigint[];
  tapeSize: number;
  timelocked: boolean;
  /** Required for the timelocked template, including an explicit zero. */
  lockTime?: number;
}

export interface TBC20LPTapeDescriptor {
  amounts: readonly bigint[];
  balance: bigint;
  tapeSize: number;
  timelocked: boolean;
  lockTime: number;
}

// Full JSON, ABI and template hashes are checked before either artifact is used.
const ARTIFACTS = [
  getPool3Artifact('tbc20-lp'),
  getPool3Artifact('tbc20-lp-locktime'),
] as const;
const PLACEHOLDER = /(<self\.(?:PoolCodeHash32|ConstTapeSize1|Controller21)>)/;
const CODE_MARKER = Buffer.from('LPTBC20CODE2', 'ascii');
const TAPE_MARKER = Buffer.from('TBC20TAPE', 'ascii');
const PREFIX = Buffer.from('006a30', 'hex');
const SUFFIX_BYTES = 1 + 21 + 1 + CODE_MARKER.length;
const UINT32_MAX = 0xffffffff;
const LOCKTIME_THRESHOLD = 500000000;

function fail(message: string): never {
  throw new Error(`TBC20 LP: ${message}`);
}

function scriptBytes(value: TBC20LPScriptLike): Buffer {
  if (value instanceof tbc.Script) return Buffer.from(value.toBuffer());
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (typeof value !== 'string' || value.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(value)) {
    fail('script must be a Script, Buffer or nonempty hexadecimal string');
  }
  return Buffer.from(value, 'hex');
}

function assertMode(value: boolean): void {
  if (typeof value !== 'boolean') fail('timelocked must be a boolean');
}

function assertTapeSize(size: number, timelocked: boolean): void {
  assertMode(timelocked);
  const minimum = timelocked ? 66 : 61;
  if (!Number.isInteger(size) || size < minimum || size > 127) {
    fail(`tapeSize must be ${minimum}-127 bytes for this LP template`);
  }
}

function assertLockTime(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    fail('lockTime must be an unsigned 32-bit integer');
  }
}

function assertController(value: Buffer): void {
  if (!Buffer.isBuffer(value) || value.length !== 21 || (value[20] !== 0 && value[20] !== 1)) {
    fail('controller must be hash160[20] followed by 00 (address) or 01 (contract)');
  }
}

function assertCodeOptions(options: TBC20LPCodeOptions): void {
  if (!options || typeof options !== 'object') fail('code options are required');
  assertTapeSize(options.tapeSize, options.timelocked);
  if (!Buffer.isBuffer(options.poolCodeHash) || options.poolCodeHash.length !== 32) {
    fail('poolCodeHash must be the 32-byte SHA256 of the complete Pool Code');
  }
  assertController(options.controller);
}

function template(timelocked: boolean): string {
  assertMode(timelocked);
  const index = timelocked ? 1 : 0;
  const artifact = ARTIFACTS[index];
  if ((artifact.unlock.main.match(/<[^>]+>/g) ?? []).length !== 123) {
    fail('frozen LP artifact does not match its supported template/ABI profile');
  }
  return artifact.lock.hex;
}

/** Strict codecs for the two PoolNFT 3.0 LP templates; no network or broadcasts. */
export class TBC20LP {
  static readonly codeSatoshis = 500;
  static readonly maxSlotAmount = TBC20_STANDARD_MAX_SLOT_AMOUNT;
  static readonly lockTimeThreshold = LOCKTIME_THRESHOLD;

  static instantiateCode(options: TBC20LPCodeOptions): tbc.Script {
    assertCodeOptions(options);
    const hex = template(options.timelocked)
      .replaceAll('<self.PoolCodeHash32>', '20' + options.poolCodeHash.toString('hex'))
      .replaceAll('<self.ConstTapeSize1>', '01' + options.tapeSize.toString(16).padStart(2, '0'))
      .replaceAll('<self.Controller21>', '15' + options.controller.toString('hex'));
    if (hex.includes('<')) fail('unresolved LP constructor parameter');
    const script = tbc.Script.fromHex(hex);
    const size = script.toBuffer().length;
    if ((size - SUFFIX_BYTES) % 64 !== 0 || getTbc20StandardPartialScriptData(script).size.length !== 2) {
      fail('LP artifact must have a block-aligned immutable prefix and two-byte Code size');
    }
    return script;
  }

  static parseCode(value: TBC20LPScriptLike): TBC20LPCodeDescriptor {
    const code = scriptBytes(value);
    for (const timelocked of [false, true]) {
      const fields = new Map<string, Buffer>();
      let offset = 0;
      let matches = true;
      for (const segment of template(timelocked).split(PLACEHOLDER)) {
        if (segment.startsWith('<self.')) {
          const width =
            segment === '<self.PoolCodeHash32>' ? 32 : segment === '<self.Controller21>' ? 21 : 1;
          if (offset + width + 1 > code.length || code[offset] !== width) {
            matches = false;
            break;
          }
          const data = code.subarray(offset + 1, offset + width + 1);
          const previous = fields.get(segment);
          if (previous && !previous.equals(data)) {
            matches = false;
            break;
          }
          fields.set(segment, Buffer.from(data));
          offset += width + 1;
        } else {
          const fixed = Buffer.from(segment, 'hex');
          if (!code.subarray(offset, offset + fixed.length).equals(fixed)) {
            matches = false;
            break;
          }
          offset += fixed.length;
        }
      }
      if (!matches || offset !== code.length) continue;
      const options: TBC20LPCodeOptions = {
        poolCodeHash: fields.get('<self.PoolCodeHash32>')!,
        tapeSize: fields.get('<self.ConstTapeSize1>')![0],
        controller: fields.get('<self.Controller21>')!,
        timelocked,
      };
      const rebuilt = TBC20LP.instantiateCode(options);
      if (!rebuilt.toBuffer().equals(code)) fail('LP code is not canonical');
      const partial = getTbc20StandardPartialScriptData(rebuilt);
      return {
        ...options,
        identity: Buffer.concat([partial.partialHash, partial.size]),
        codeSize: code.length,
      };
    }
    return fail('unsupported or modified LP Code template');
  }

  static validateCode(
    value: TBC20LPScriptLike,
    expected: Partial<TBC20LPCodeOptions> = {}
  ): TBC20LPCodeDescriptor {
    const descriptor = TBC20LP.parseCode(value);
    for (const field of ['poolCodeHash', 'controller'] as const) {
      const wanted = expected[field];
      if (wanted !== undefined && (!Buffer.isBuffer(wanted) || !wanted.equals(descriptor[field]))) {
        fail(`LP ${field} does not match the expected value`);
      }
    }
    for (const field of ['tapeSize', 'timelocked'] as const) {
      if (expected[field] !== undefined && expected[field] !== descriptor[field]) {
        fail(`LP ${field} does not match the expected value`);
      }
    }
    return descriptor;
  }

  static getCodeIdentity(value: TBC20LPScriptLike): Buffer {
    return TBC20LP.parseCode(value).identity;
  }

  static replaceController(value: TBC20LPScriptLike, controller: Buffer): tbc.Script {
    const previous = TBC20LP.parseCode(value);
    const script = TBC20LP.instantiateCode({ ...previous, controller });
    if (!TBC20LP.getCodeIdentity(script).equals(previous.identity))
      fail('controller replacement changed LP identity');
    return script;
  }

  static buildTape(options: TBC20LPTapeOptions): tbc.Script {
    if (!options || typeof options !== 'object') fail('tape options are required');
    assertTapeSize(options.tapeSize, options.timelocked);
    if (!Array.isArray(options.amounts) || options.amounts.length !== 6)
      fail('amounts must contain exactly six bigint slots');
    if (options.timelocked) assertLockTime(options.lockTime!);
    else if (options.lockTime !== undefined && options.lockTime !== 0)
      fail('ordinary LP does not have a time lock');
    const result = Buffer.alloc(options.tapeSize);
    PREFIX.copy(result);
    options.amounts.forEach((amount, index) => {
      if (typeof amount !== 'bigint' || amount < 0n || amount > TBC20_STANDARD_MAX_SLOT_AMOUNT) {
        fail(`amounts[${index}] must be a bigint in the signed-63-bit nonnegative range`);
      }
      result.writeBigUInt64LE(amount, 3 + index * 8);
    });
    if (options.timelocked) {
      result[51] = 4;
      result.writeUInt32LE(options.lockTime!, 52);
    }
    result[result.length - 10] = 9;
    TAPE_MARKER.copy(result, result.length - 9);
    return tbc.Script.fromBuffer(result);
  }

  /** LP extensions are deliberately canonical: fixed lock field, zero padding, terminal marker. */
  static parseTape(
    value: TBC20LPScriptLike,
    profile: { timelocked: boolean; tapeSize?: number }
  ): TBC20LPTapeDescriptor {
    if (!profile || typeof profile !== 'object') fail('LP tape profile is required');
    const bytes = scriptBytes(value);
    assertTapeSize(bytes.length, profile.timelocked);
    if (profile.tapeSize !== undefined && profile.tapeSize !== bytes.length)
      fail('LP Tape length does not match Code');
    if (
      !bytes.subarray(0, 3).equals(PREFIX) ||
      bytes[bytes.length - 10] !== 9 ||
      !bytes.subarray(bytes.length - 9).equals(TAPE_MARKER)
    )
      fail('invalid LP Tape prefix or terminal marker');
    if (profile.timelocked && bytes[51] !== 4)
      fail('locked LP Tape requires a direct four-byte push at offset 51');
    const paddingStart = profile.timelocked ? 56 : 51;
    if (bytes.subarray(paddingStart, bytes.length - 10).some((byte) => byte !== 0))
      fail('LP Tape padding must contain only OP_0 bytes');
    const amounts = Array.from({ length: 6 }, (_, index) => bytes.readBigUInt64LE(3 + index * 8));
    if (amounts.some((amount) => amount > TBC20_STANDARD_MAX_SLOT_AMOUNT))
      fail('LP amount slot exceeds signed-63-bit contract range');
    return {
      amounts: Object.freeze(amounts),
      balance: amounts.reduce((sum, amount) => sum + amount, 0n),
      tapeSize: bytes.length,
      timelocked: profile.timelocked,
      lockTime: profile.timelocked ? bytes.readUInt32LE(52) : 0,
    };
  }

  /** Computes the script-level nLockTime requirement, not node/chain finality. */
  static getRequiredLockTime(lockTimes: readonly number[]): number {
    let maximum = 0;
    let domain: boolean | undefined;
    for (const lockTime of lockTimes) {
      assertLockTime(lockTime);
      if (lockTime !== 0) {
        const isTimestamp = lockTime >= LOCKTIME_THRESHOLD;
        if (domain !== undefined && domain !== isTimestamp)
          fail('cannot combine nonzero height and timestamp LP locks');
        domain = isTimestamp;
      }
      maximum = Math.max(maximum, lockTime);
    }
    return maximum;
  }

  static verifyInputLock(
    tx: tbc.Transaction,
    inputIndex: number,
    tape: TBC20LPScriptLike,
    profile: Pick<TBC20LPCodeOptions, 'timelocked' | 'tapeSize'>
  ): void {
    if (
      !(tx instanceof tbc.Transaction) ||
      !Number.isInteger(inputIndex) ||
      inputIndex < 0 ||
      inputIndex >= tx.inputs.length
    ) {
      fail('invalid transaction or LP input index');
    }
    const parsed = TBC20LP.parseTape(tape, profile);
    if (!profile.timelocked) return;
    assertLockTime(tx.nLockTime);
    if (tx.inputs[inputIndex].sequenceNumber === UINT32_MAX)
      fail('every timelocked LP input needs a nonfinal sequence, including zero locks');
    if (
      parsed.lockTime > 0 &&
      parsed.lockTime < LOCKTIME_THRESHOLD !== tx.nLockTime < LOCKTIME_THRESHOLD
    ) {
      fail('LP lock and transaction nLockTime use different height/timestamp domains');
    }
    if (parsed.lockTime > tx.nLockTime)
      fail('transaction nLockTime does not satisfy the parent LP lock');
  }
}

export default TBC20LP;
