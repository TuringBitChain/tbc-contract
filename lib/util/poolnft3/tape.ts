import * as tbc from 'tbc-lib-js';

export const POOL3_TAPE_BYTES = 143;
export const POOL3_MAX_AMOUNT = (1n << 63n) - 1n;
const PREFIX = Buffer.from('006a4c82', 'hex');
const SUFFIX = Buffer.from('08504f4f4c54415045', 'hex');

export interface PoolTapeAmounts {
  readonly ftLpAmount: bigint;
  readonly ftAAmount: bigint;
  readonly tbcAmount: bigint;
}
export interface PoolTapeFields extends PoolTapeAmounts {
  readonly ftLpPartialHash: Buffer;
  readonly ftLpCodeSize: number;
  readonly ftAPartialHash: Buffer;
  readonly ftACodeSize: number;
  /** Display txid byte order, not the reversed outpoint encoding. */
  readonly ftAContractId: string;
  /** Legacy field name: the total Swap fee rate, not only the service share. */
  readonly serviceFeeRate: number;
  readonly lpPlan: number;
  readonly withSwapHashLock: boolean;
  readonly withLpLocktime: boolean;
  readonly withLpHashLock: boolean;
}
export interface DecodedPoolTape extends PoolTapeFields {
  readonly suffixData: Buffer;
  readonly flag: 'POOLTAPE';
  readonly variant: 'public' | 'public-timelocked' | 'controller' | 'controller-timelocked';
}

export function assertPoolAmount(value: bigint, label: string): void {
  if (typeof value !== 'bigint' || value < 0n || value > POOL3_MAX_AMOUNT) {
    throw new Error(`Pool3: ${label} must be a bigint in [0, 2^63-1]`);
  }
}
function assertSize(size: number, label: string): void {
  // Size is consumed by OP_PARTIAL_HASH as a positive two-byte ScriptNum.
  if (!Number.isSafeInteger(size) || size < 128 || size > 0x7fff) {
    throw new Error(`Pool3: ${label} must fit a positive two-byte ScriptNum (128-32767)`);
  }
}
function assertFlags(
  fields: Pick<PoolTapeFields, 'withSwapHashLock' | 'withLpLocktime' | 'withLpHashLock'>
): void {
  for (const field of ['withSwapHashLock', 'withLpLocktime', 'withLpHashLock'] as const) {
    if (typeof fields[field] !== 'boolean') throw new Error(`Pool3: ${field} must be boolean`);
  }
  if (fields.withSwapHashLock !== fields.withLpHashLock)
    throw new Error('Pool3: unsupported Pool authorization flag combination');
}
function amountFields(fields: PoolTapeAmounts): void {
  for (const key of ['ftLpAmount', 'ftAAmount', 'tbcAmount'] as const)
    assertPoolAmount(fields[key], key);
}

/** Canonical framing: OP_FALSE OP_RETURN OP_PUSHDATA1(130) + 130 bytes + 08POOLTAPE. */
export function encodePoolTape(fields: PoolTapeFields): Buffer {
  if (!fields || typeof fields !== 'object') throw new Error('Pool3: Tape fields are required');
  for (const key of ['ftLpPartialHash', 'ftAPartialHash'] as const) {
    if (!Buffer.isBuffer(fields[key]) || fields[key].length !== 32)
      throw new Error(`Pool3: ${key} must be exactly 32 bytes`);
  }
  assertSize(fields.ftLpCodeSize, 'LP Code size');
  assertSize(fields.ftACodeSize, 'FT Code size');
  amountFields(fields);
  assertFlags(fields);
  if (typeof fields.ftAContractId !== 'string' || !/^[0-9a-fA-F]{64}$/.test(fields.ftAContractId))
    throw new Error('Pool3: ftAContractId must be 32-byte display-order hex');
  if (
    !Number.isSafeInteger(fields.serviceFeeRate) ||
    fields.serviceFeeRate < 0 ||
    fields.serviceFeeRate > 0xffff
  )
    throw new Error('Pool3: serviceFeeRate must be uint16');
  if (!Number.isSafeInteger(fields.lpPlan) || fields.lpPlan < 0 || fields.lpPlan > 0xff)
    throw new Error('Pool3: lpPlan must be uint8');
  const bytes = Buffer.alloc(POOL3_TAPE_BYTES);
  PREFIX.copy(bytes);
  fields.ftLpPartialHash.copy(bytes, 4);
  bytes.writeUInt16LE(fields.ftLpCodeSize, 36);
  fields.ftAPartialHash.copy(bytes, 38);
  bytes.writeUInt16LE(fields.ftACodeSize, 70);
  bytes.writeBigUInt64LE(fields.ftLpAmount, 72);
  bytes.writeBigUInt64LE(fields.ftAAmount, 80);
  bytes.writeBigUInt64LE(fields.tbcAmount, 88);
  Buffer.from(fields.ftAContractId, 'hex').copy(bytes, 96);
  bytes.writeUInt16LE(fields.serviceFeeRate, 128);
  bytes[130] = fields.lpPlan;
  bytes[131] = Number(fields.withSwapHashLock);
  bytes[132] = Number(fields.withLpLocktime);
  bytes[133] = Number(fields.withLpHashLock);
  SUFFIX.copy(bytes, 134);
  return bytes;
}

export function decodePoolTape(tape: Buffer | tbc.Script): DecodedPoolTape {
  const bytes = Buffer.isBuffer(tape)
    ? tape
    : tape instanceof tbc.Script
      ? tape.toBuffer()
      : undefined;
  if (
    !bytes ||
    bytes.length !== POOL3_TAPE_BYTES ||
    !bytes.subarray(0, 4).equals(PREFIX) ||
    !bytes.subarray(134).equals(SUFFIX)
  ) {
    throw new Error(
      'Pool3: Tape must be exactly 143 bytes with the canonical 006a4c82 header and POOLTAPE marker'
    );
  }
  if ([bytes[131], bytes[132], bytes[133]].some((flag) => flag > 1))
    throw new Error('Pool3: Tape boolean flags must be 00 or 01');
  const fields: PoolTapeFields = {
    ftLpPartialHash: Buffer.from(bytes.subarray(4, 36)),
    ftLpCodeSize: bytes.readUInt16LE(36),
    ftAPartialHash: Buffer.from(bytes.subarray(38, 70)),
    ftACodeSize: bytes.readUInt16LE(70),
    ftLpAmount: bytes.readBigUInt64LE(72),
    ftAAmount: bytes.readBigUInt64LE(80),
    tbcAmount: bytes.readBigUInt64LE(88),
    ftAContractId: bytes.subarray(96, 128).toString('hex'),
    serviceFeeRate: bytes.readUInt16LE(128),
    lpPlan: bytes[130],
    withSwapHashLock: bytes[131] === 1,
    withLpLocktime: bytes[132] === 1,
    withLpHashLock: bytes[133] === 1,
  };
  if (!encodePoolTape(fields).equals(bytes)) throw new Error('Pool3: noncanonical Tape');
  const variant = fields.withSwapHashLock
    ? fields.withLpLocktime
      ? 'controller-timelocked'
      : 'controller'
    : fields.withLpLocktime
      ? 'public-timelocked'
      : 'public';
  return { ...fields, suffixData: Buffer.from(bytes.subarray(96, 134)), flag: 'POOLTAPE', variant };
}

/** Preserves both token identities and all 38 configuration bytes exactly. */
export function replacePoolTapeAmounts(
  tape: Buffer | tbc.Script,
  amounts: PoolTapeAmounts
): Buffer {
  if (!amounts || typeof amounts !== 'object')
    throw new Error('Pool3: replacement amounts are required');
  return encodePoolTape({
    ...decodePoolTape(tape),
    ftLpAmount: amounts.ftLpAmount,
    ftAAmount: amounts.ftAAmount,
    tbcAmount: amounts.tbcAmount,
  });
}

export function assertPoolTapeConfigurationUnchanged(
  previous: Buffer | tbc.Script,
  next: Buffer | tbc.Script
): void {
  const oldBytes = encodePoolTape(decodePoolTape(previous));
  const newBytes = encodePoolTape(decodePoolTape(next));
  if (
    !oldBytes.subarray(0, 72).equals(newBytes.subarray(0, 72)) ||
    !oldBytes.subarray(96).equals(newBytes.subarray(96))
  ) {
    throw new Error('Pool3: a Pool transition cannot change token identities or configuration');
  }
}
