import * as tbc from 'tbc-lib-js';
import {
  encodeTBC20UInt64LE,
  encodeTBC20UnsignedLE,
  getTBC20CurrentInputsData,
  getTBC20PartialScriptData,
} from '../tbc20unlock';

/** Pool.main options; option 3 consumes exactly two auxiliary input proofs. */
export type PoolOperation = 1 | 2 | 3 | 4;

export interface PoolOutputLayout {
  readonly poolCodeVout: 0;
  readonly poolTapeVout: 1;
  readonly poolFtCodeVout: number;
  readonly userFtCodeVout?: number;
  readonly lpCodeVout?: number;
  readonly lpBurnCodeVout?: number;
  readonly ftChangeCodeVout?: number;
  readonly lpChangeCodeVout?: number;
  readonly tbcVout?: number;
  readonly feeVout?: number;
  readonly tbcChangeVout?: number;
}

export interface PoolUnlockOptions {
  readonly tx: tbc.Transaction;
  /** The transaction creating the Pool Code at vout 0 and its Tape at vout 1. */
  readonly preTx: tbc.Transaction;
  /** The actual transaction spent by preTx.vin[0], including genesis ancestry. */
  readonly prePreTx: tbc.Transaction;
  /** Actual parents of tx.vin[1..], in that order, including the fee input. */
  readonly inputTxs: readonly tbc.Transaction[];
  readonly option: PoolOperation;
  /** Both fields must be present for a hash-locked Pool, and absent otherwise. */
  readonly signature?: Buffer;
  readonly publicKey?: Buffer;
}

const EMPTY = Buffer.alloc(0);
const ACTIVE_LEAF_COUNTS: Readonly<Record<PoolOperation, number>> = Object.freeze({
  1: 66,
  2: 76,
  3: 56,
  4: 68,
});

function fail(message: string): never {
  throw new Error(`PoolNFT3 witness: ${message}`);
}

function assertOption(value: unknown): asserts value is PoolOperation {
  if (value !== 1 && value !== 2 && value !== 3 && value !== 4) {
    fail('option must be 1 (AddLP), 2 (RemoveLP), 3 (SwapFT), or 4 (SwapTBC)');
  }
}

function transactionVersion(tx: tbc.Transaction): number {
  const version = (tx as tbc.Transaction & { version?: unknown }).version;
  if (version !== 10) fail('transaction.version must be 10');
  return version;
}

function assertTransaction(tx: unknown, name: string): asserts tx is tbc.Transaction {
  if (!(tx instanceof tbc.Transaction)) fail(`${name} must be a tbc.Transaction`);
  transactionVersion(tx);
  if (
    tx.inputs.length < 1 ||
    tx.inputs.length > 0x7fffffff ||
    tx.outputs.length < 1 ||
    tx.outputs.length > 0x7fffffff
  ) {
    fail(`${name} must contain a positive signed-32-bit number of inputs and outputs`);
  }
  if (!Number.isInteger(tx.nLockTime) || tx.nLockTime < 0 || tx.nLockTime > 0xffffffff) {
    fail(`${name}.nLockTime must be uint32`);
  }
}

function outputAt(tx: tbc.Transaction, vout: number, name: string): tbc.Transaction.Output {
  if (!Number.isSafeInteger(vout) || vout < 0 || vout >= tx.outputs.length) {
    fail(`${name} output index is outside the transaction`);
  }
  const output = tx.outputs[vout];
  if (!(output.script instanceof tbc.Script) || output.script.toBuffer().length === 0) {
    fail(`${name} must have a nonempty locking script`);
  }
  if (!Number.isSafeInteger(output.satoshis) || output.satoshis < 0) {
    fail(`${name}.satoshis must be a nonnegative safe integer`);
  }
  return output;
}

function value(output: tbc.Transaction.Output): Buffer {
  return encodeTBC20UInt64LE(BigInt(output.satoshis));
}

function sha(data: Buffer): Buffer {
  return tbc.crypto.Hash.sha256(data);
}

function header(tx: tbc.Transaction): Buffer {
  const result = Buffer.alloc(16);
  result.writeUInt32LE(transactionVersion(tx), 0);
  result.writeUInt32LE(tx.nLockTime, 4);
  result.writeUInt32LE(tx.inputs.length, 8);
  result.writeUInt32LE(tx.outputs.length, 12);
  return result;
}

function unlockingScriptsHash(tx: tbc.Transaction): Buffer {
  return sha(
    Buffer.concat(
      tx.inputs.map((input, vin) => {
        if (!(input.script instanceof tbc.Script)) fail(`input ${vin} has no unlocking script`);
        return sha(input.script.toBuffer());
      })
    )
  );
}

function inputsHashData(tx: tbc.Transaction): Buffer {
  return Buffer.concat([sha(getTBC20CurrentInputsData(tx)), unlockingScriptsHash(tx)]);
}

function outputRecords(tx: tbc.Transaction, start: number, end = tx.outputs.length): Buffer {
  const records: Buffer[] = [];
  for (let vout = start; vout < end; vout += 1) {
    const output = outputAt(tx, vout, `output ${vout}`);
    records.push(value(output), sha(output.script.toBuffer()));
  }
  return Buffer.concat(records);
}

/** Compute the v10 txid from actual fields, avoiding a previously cached tx.hash. */
function actualTxid(tx: tbc.Transaction): string {
  return Buffer.from(
    tbc.crypto.Hash.sha256sha256(
      Buffer.concat([header(tx), inputsHashData(tx), sha(outputRecords(tx, 0))])
    )
  )
    .reverse()
    .toString('hex');
}

function assertParentLink(
  current: tbc.Transaction,
  vin: number,
  parent: tbc.Transaction,
  name: string,
  requirePrevout: boolean
): number {
  const input = current.inputs[vin];
  if (!input || !Buffer.isBuffer(input.prevTxId) || input.prevTxId.length !== 32) {
    fail(`${name} has no valid input outpoint`);
  }
  if (input.prevTxId.toString('hex') !== actualTxid(parent)) {
    fail(`${name} does not spend the supplied parent transaction`);
  }
  const output = outputAt(parent, input.outputIndex, `${name} parent`);
  if (requirePrevout && !input.output) {
    fail(`${name} is missing authenticated previous-output metadata`);
  }
  if (
    input.output &&
    (!(input.output.script instanceof tbc.Script) ||
      !input.output.script.equals(output.script) ||
      input.output.satoshis !== output.satoshis)
  ) {
    fail(`${name} previous-output metadata differs from the supplied parent`);
  }
  return input.outputIndex;
}

/** Canonical physical positions; optional pair and final change are unambiguous by count. */
export function getPoolOutputLayout(tx: tbc.Transaction, option: PoolOperation): PoolOutputLayout {
  assertOption(option);
  assertTransaction(tx, 'tx');
  const count = tx.outputs.length;
  const common = { poolCodeVout: 0 as const, poolTapeVout: 1 as const };
  if (option === 3) {
    if (count !== 7 && count !== 8) fail('SwapFT must contain 7 or 8 outputs');
    return Object.freeze({
      ...common,
      userFtCodeVout: 2,
      feeVout: 4,
      poolFtCodeVout: 5,
      ...(count === 8 ? { tbcChangeVout: 7 } : {}),
    });
  }
  const base = option === 2 ? 9 : 6;
  if (count < base || count > base + 3) {
    fail(
      `${option === 1 ? 'AddLP' : option === 2 ? 'RemoveLP' : 'SwapTBC'} must contain ${base}..${base + 3} outputs`
    );
  }
  const hasTokenChange = count - base >= 2;
  const hasTbcChange = (count - base) % 2 === 1;
  const tail = hasTbcChange ? { tbcChangeVout: count - 1 } : {};
  if (option === 1) {
    return Object.freeze({
      ...common,
      poolFtCodeVout: 2,
      lpCodeVout: 4,
      ...(hasTokenChange ? { ftChangeCodeVout: 6 } : {}),
      ...tail,
    });
  }
  if (option === 2) {
    return Object.freeze({
      ...common,
      tbcVout: 2,
      userFtCodeVout: 3,
      lpBurnCodeVout: 5,
      poolFtCodeVout: 7,
      ...(hasTokenChange ? { lpChangeCodeVout: 9 } : {}),
      ...tail,
    });
  }
  return Object.freeze({
    ...common,
    tbcVout: 2,
    feeVout: 3,
    poolFtCodeVout: 4,
    ...(hasTokenChange ? { ftChangeCodeVout: 6 } : {}),
    ...tail,
  });
}

export function getPoolUnlockLeafCount(option: PoolOperation, hashLocked = false): number {
  assertOption(option);
  if (typeof hashLocked !== 'boolean') fail('hashLocked must be boolean');
  return ACTIVE_LEAF_COUNTS[option] + (hashLocked ? 2 : 0);
}

function outputLeaves(tx: tbc.Transaction, vout: number | undefined): Buffer[] {
  if (vout === undefined) return [EMPTY, EMPTY, EMPTY, EMPTY];
  const output = outputAt(tx, vout, `output ${vout}`);
  const partial = getTBC20PartialScriptData(output.script);
  return [value(output), partial.suffixData, partial.partialHash, partial.size];
}

function pairLeaves(tx: tbc.Transaction, codeVout: number | undefined): Buffer[] {
  if (codeVout === undefined) return [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY];
  const tape = outputAt(tx, codeVout + 1, `Tape after output ${codeVout}`);
  return [...outputLeaves(tx, codeVout), value(tape), tape.script.toBuffer()];
}

function contextLeaves(
  tx: tbc.Transaction,
  option: PoolOperation,
  layout: PoolOutputLayout
): Buffer[] {
  const pool = outputAt(tx, 0, 'Pool Code');
  const tape = outputAt(tx, 1, 'Pool Tape');
  const leaves = [value(pool), sha(pool.script.toBuffer()), value(tape), tape.script.toBuffer()];
  if (option === 1) {
    leaves.push(
      ...pairLeaves(tx, layout.poolFtCodeVout),
      ...pairLeaves(tx, layout.lpCodeVout),
      ...pairLeaves(tx, layout.ftChangeCodeVout)
    );
  } else if (option === 2) {
    leaves.push(
      ...outputLeaves(tx, layout.tbcVout),
      ...pairLeaves(tx, layout.userFtCodeVout),
      ...pairLeaves(tx, layout.lpBurnCodeVout),
      ...pairLeaves(tx, layout.poolFtCodeVout),
      ...pairLeaves(tx, layout.lpChangeCodeVout)
    );
  } else if (option === 3) {
    leaves.push(
      ...pairLeaves(tx, layout.userFtCodeVout),
      ...outputLeaves(tx, layout.feeVout),
      ...pairLeaves(tx, layout.poolFtCodeVout)
    );
  } else {
    leaves.push(
      ...outputLeaves(tx, layout.tbcVout),
      ...outputLeaves(tx, layout.feeVout),
      ...pairLeaves(tx, layout.poolFtCodeVout),
      ...pairLeaves(tx, layout.ftChangeCodeVout)
    );
  }
  leaves.push(...outputLeaves(tx, layout.tbcChangeVout));
  return leaves;
}

function inputProofLeaves(tx: tbc.Transaction, vout: number): Buffer[] {
  return [
    header(tx),
    inputsHashData(tx),
    outputRecords(tx, 0, vout),
    ...outputLeaves(tx, vout),
    outputRecords(tx, vout + 1),
  ];
}

function ancestorLeaves(tx: tbc.Transaction, vout: number): Buffer[] {
  const output = outputAt(tx, vout, 'Pool ancestor Code');
  return [
    header(tx),
    inputsHashData(tx),
    outputRecords(tx, 0, vout),
    value(output),
    sha(output.script.toBuffer()),
    outputRecords(tx, vout + 1),
  ];
}

function parentLeaves(tx: tbc.Transaction): Buffer[] {
  const code = outputAt(tx, 0, 'Pool parent Code');
  const tape = outputAt(tx, 1, 'Pool parent Tape');
  return [
    header(tx),
    getTBC20CurrentInputsData(tx),
    unlockingScriptsHash(tx),
    value(code),
    sha(code.script.toBuffer()),
    value(tape),
    tape.script.toBuffer(),
    outputRecords(tx, 2),
  ];
}

function validateAuthorization(signature: Buffer, publicKey: Buffer): void {
  if (
    !Buffer.isBuffer(signature) ||
    signature.length === 65 ||
    signature.length > 72 ||
    !tbc.crypto.Signature.isTxDER(signature)
  ) {
    fail('signature must be a canonical DER transaction signature of at most 72 bytes');
  }
  const parsed = tbc.crypto.Signature.fromTxFormat(signature);
  if (!parsed.hasLowS() || parsed.nhashtype !== 0x41) {
    fail('signature must be low-S and use SIGHASH_ALL | SIGHASH_FORKID (0x41)');
  }
  if (!Buffer.isBuffer(publicKey) || publicKey.length !== 33) {
    fail('publicKey must be a compressed 33-byte public key');
  }
  try {
    tbc.PublicKey.fromBuffer(publicKey);
  } catch {
    fail('publicKey is invalid');
  }
}

function pushLeaf(script: tbc.Script, leaf: Buffer): void {
  if (leaf.length === 1 && leaf[0] >= 1 && leaf[0] <= 16) {
    script.add(tbc.Opcode.smallInt(leaf[0]));
  } else if (leaf.length === 1 && leaf[0] === 0x81) {
    script.add(tbc.Opcode.OP_1NEGATE);
  } else {
    script.add(Buffer.from(leaf));
  }
}

/**
 * Serialize only the active Pool.main branch in compiler declaration order.
 * Inactive ctx structs/input arrays are omitted, not padded: Pool.main's Pop
 * is compile-time only. Absent outputs *inside* the active ctx retain padding.
 *
 * This is a pure witness builder: it neither signs nor changes the transaction.
 * The caller validates the trusted Code profile/Controller membership and
 * freezes fee, outputs, sequence, and lockTime before requesting a signature.
 */
export function buildPoolUnlockScript(options: PoolUnlockOptions): tbc.Script {
  if (!options || typeof options !== 'object') fail('options are required');
  const { tx, preTx, prePreTx, inputTxs, option, signature, publicKey } = options;
  assertOption(option);
  assertTransaction(tx, 'tx');
  assertTransaction(preTx, 'preTx');
  assertTransaction(prePreTx, 'prePreTx');
  const auxiliaryCount = option === 3 ? 2 : 3;
  if (tx.inputs.length !== auxiliaryCount + 1) {
    fail(`option ${option} requires exactly ${auxiliaryCount + 1} current inputs`);
  }
  if (!Array.isArray(inputTxs) || inputTxs.length !== auxiliaryCount) {
    fail(`option ${option} requires exactly ${auxiliaryCount} inputTxs in vin[1..] order`);
  }
  const seen = new Set<string>();
  tx.inputs.forEach((input, vin) => {
    const outpoint = `${input.prevTxId.toString('hex')}:${input.outputIndex}`;
    if (seen.has(outpoint)) fail(`duplicate current input outpoint at vin ${vin}`);
    seen.add(outpoint);
  });
  if (assertParentLink(tx, 0, preTx, 'tx.vin[0]', true) !== 0) {
    fail('tx.vin[0] must spend Pool Code at preTx.vout[0]');
  }
  const ancestorVout = assertParentLink(preTx, 0, prePreTx, 'preTx.vin[0]', false);
  const layout = getPoolOutputLayout(tx, option);
  if (!outputAt(tx, 0, 'Pool Code').script.equals(outputAt(preTx, 0, 'Pool parent Code').script)) {
    fail('Pool Code must be unchanged at current vout 0');
  }
  const hasSignature = signature !== undefined;
  if (hasSignature !== (publicKey !== undefined)) {
    fail('signature and publicKey must be supplied together for a hash-locked Pool');
  }
  const leaves: Buffer[] = [];
  if (signature !== undefined && publicKey !== undefined) {
    validateAuthorization(signature, publicKey);
    leaves.push(Buffer.from(signature), Buffer.from(publicKey));
  }
  leaves.push(...contextLeaves(tx, option, layout));
  inputTxs.forEach((parent, index) => {
    assertTransaction(parent, `inputTxs[${index}]`);
    const vout = assertParentLink(tx, index + 1, parent, `tx.vin[${index + 1}]`, true);
    leaves.push(...inputProofLeaves(parent, vout));
  });
  leaves.push(
    getTBC20CurrentInputsData(tx),
    encodeTBC20UnsignedLE(option),
    ...ancestorLeaves(prePreTx, ancestorVout),
    ...parentLeaves(preTx)
  );
  if (leaves.length !== getPoolUnlockLeafCount(option, hasSignature)) {
    fail(`internal active ABI leaf count mismatch: ${leaves.length}`);
  }
  const script = new tbc.Script();
  leaves.forEach((leaf) => pushLeaf(script, leaf));
  return script;
}
