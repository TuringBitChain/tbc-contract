import * as tbc from 'tbc-lib-js';
import { validatePool3Transaction } from '../../validator/poolnft3';
import type { Pool3ValidationReport } from '../../validator/poolnft3';

export type Pool3SignerRole = 'funding' | 'pool-controller' | 'pool-ft' | 'user-ft' | 'lp-owner';
export interface Pool3InputReference {
  parentTx: tbc.Transaction;
  outputIndex: number;
}
export interface Pool3SigningRequest {
  inputIndex: number;
  role: Pool3SignerRole;
  outpoint: { txId: string; outputIndex: number };
  amountSat: bigint;
  lockingScriptHex: string;
  publicKey: Buffer;
  publicKeyHash: Buffer;
  sighashType: 0x41;
  /** Isolated final-output view, with previous outputs attached for FORKID signing. */
  transaction: tbc.Transaction;
}
export interface Pool3SigningIdentity {
  publicKey: string | Buffer;
  /** Called once per input, only after amounts, outputs and fee are fixed. */
  sign?: (request: Pool3SigningRequest) => Buffer | string | Promise<Buffer | string>;
}
export interface Pool3SignedInput extends Pool3InputReference {
  signer: Pool3SigningIdentity;
}
export interface Pool3FeePolicy {
  satoshisPerKb?: bigint;
  minimumFeeSat?: bigint;
  changeDustSat?: bigint;
}
export interface Pool3Signature {
  inputIndex: number;
  signature: Buffer | string;
  publicKey: Buffer | string;
}
export interface Pool3TransactionResult {
  transaction: tbc.Transaction;
  txraw: string;
  txid: string;
  feeSat: bigint;
  reservedBytes: number;
  changeVout?: number;
  consumedOutpoints: readonly { txId: string; outputIndex: number }[];
  validation: Pool3ValidationReport;
}
export interface Pool3InputPlan {
  reference: Pool3InputReference;
  role: Pool3SignerRole;
  signer?: Pool3SigningIdentity;
  sequence?: number;
  unlock: (tx: tbc.Transaction, signature?: Buffer, publicKey?: Buffer) => tbc.Script;
}
export interface Pool3TransactionPlan {
  inputs: readonly Pool3InputPlan[];
  outputs: readonly tbc.Transaction.Output[];
  changeAddress: string;
  lockTime?: number;
  feePolicy?: Pool3FeePolicy;
}

const MAX_SIGNATURE = Buffer.from(
  '304502210080000000000000000000000000000000000000000000000000000000000000000220010000000000000000000000000000000000000000000000000000000000000041',
  'hex'
);
export function pool3Fail(message: string): never {
  throw new Error(`PoolNFT3: ${message}`);
}
export function safeSatoshis(value: bigint, name = 'amountSat'): number {
  if (typeof value !== 'bigint' || value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    pool3Fail(`${name} must be a non-negative bigint within the JS safe satoshi range`);
  }
  return Number(value);
}
export function publicKeyBytes(value: string | Buffer): Buffer {
  if (typeof value === 'string' && !/^(02|03)[0-9a-fA-F]{64}$/.test(value))
    pool3Fail('invalid compressed public key hex');
  const bytes = typeof value === 'string' ? Buffer.from(value, 'hex') : Buffer.from(value);
  if (bytes.length !== 33) pool3Fail('a valid compressed 33-byte public key is required');
  tbc.PublicKey.fromBuffer(bytes);
  return bytes;
}
export function privateKeySigner(key: tbc.PrivateKey): Pool3SigningIdentity {
  if (!(key instanceof tbc.PrivateKey)) pool3Fail('privateKeySigner requires a PrivateKey');
  return {
    publicKey: key.toPublicKey().toBuffer(),
    sign: (request) => {
      const sig = request.transaction.getSignature(request.inputIndex, key);
      if (typeof sig !== 'string') pool3Fail('expected one transaction signature');
      return Buffer.from(sig, 'hex');
    },
  };
}
export function referenceOutput(reference: Pool3InputReference): tbc.Transaction.Output {
  if (
    !(reference.parentTx instanceof tbc.Transaction) ||
    (reference.parentTx as tbc.Transaction & { version: number }).version !== 10
  )
    pool3Fail('parentTx must be a version 10 Transaction');
  const index = reference.outputIndex;
  if (!Number.isSafeInteger(index) || index < 0 || index >= reference.parentTx.outputs.length)
    pool3Fail('invalid input outputIndex');
  const output = reference.parentTx.outputs[index];
  if (!Number.isSafeInteger(output.satoshis) || output.satoshis < 0)
    pool3Fail('unsafe previous output satoshis');
  return output;
}
export function p2pkhInputPlan(reference: Pool3SignedInput): Pool3InputPlan {
  const pub = publicKeyBytes(reference.signer.publicKey);
  const expected = tbc.Script.buildPublicKeyHashOut(tbc.PublicKey.fromBuffer(pub).toAddress());
  if (!referenceOutput(reference).script.toBuffer().equals(expected.toBuffer()))
    pool3Fail('funding signer does not own the exact P2PKH input');
  return {
    reference,
    role: 'funding',
    signer: reference.signer,
    unlock: (_tx, sig, pk) => new tbc.Script().add(sig!).add(pk!),
  };
}
export function addPool3Output(script: tbc.Script, amountSat: bigint): tbc.Transaction.Output {
  return new tbc.Transaction.Output({ script, satoshis: safeSatoshis(amountSat) });
}
function cloneTx(tx: tbc.Transaction): tbc.Transaction {
  const copy = new tbc.Transaction(tx.uncheckedSerialize());
  tx.inputs.forEach((input, i) => {
    if (!input.output) pool3Fail(`input ${i} has no previous output`);
    copy.inputs[i].output = new tbc.Transaction.Output({
      script: tbc.Script.fromBuffer(Buffer.from(input.output.script.toBuffer())),
      satoshis: input.output.satoshis,
    });
  });
  return copy;
}
function signatureBytes(value: string | Buffer): Buffer {
  if (typeof value === 'string' && !/^(?:[0-9a-fA-F]{2})+$/.test(value))
    pool3Fail('invalid signature hex');
  const bytes = typeof value === 'string' ? Buffer.from(value, 'hex') : Buffer.from(value);
  if (bytes.length === 65 || bytes.length > 72 || !tbc.crypto.Signature.isTxDER(bytes))
    pool3Fail('signature must be canonical low-S DER, at most 72 bytes');
  const parsed = tbc.crypto.Signature.fromTxFormat(bytes);
  if (!parsed.hasLowS() || parsed.nhashtype !== 0x41)
    pool3Fail('signature must use low-S SIGHASH_ALL | FORKID (0x41)');
  return bytes;
}

/** Prepared transactions keep a private copy; exported signing views cannot mutate it. */
export class PreparedPool3Transaction {
  private readonly tx: tbc.Transaction;
  private readonly plans: readonly Pool3InputPlan[];
  private readonly publicKeys: readonly (Buffer | undefined)[];
  private readonly reservations: readonly number[];
  private readonly signaturePositions: readonly (number | undefined)[];
  readonly feeSat: bigint;
  readonly reservedBytes: number;
  readonly changeVout?: number;
  readonly consumedOutpoints: readonly { txId: string; outputIndex: number }[];

  constructor(plan: Pool3TransactionPlan) {
    if (plan.inputs.length < 1 || plan.inputs.length > 6)
      pool3Fail('transaction requires 1–6 inputs; consolidate funding explicitly');
    const rate = plan.feePolicy?.satoshisPerKb ?? 80n;
    const minimum = plan.feePolicy?.minimumFeeSat ?? 80n;
    const dust = plan.feePolicy?.changeDustSat ?? 42n;
    for (const [name, value] of [
      ['satoshisPerKb', rate],
      ['minimumFeeSat', minimum],
      ['changeDustSat', dust],
    ] as const) {
      safeSatoshis(value, name);
      if (value === 0n) pool3Fail(`${name} must be positive`);
    }
    if (
      plan.lockTime !== undefined &&
      (!Number.isInteger(plan.lockTime) || plan.lockTime < 0 || plan.lockTime > 0xffffffff)
    )
      pool3Fail('lockTime must be uint32');
    const changeScript = tbc.Script.buildPublicKeyHashOut(
      tbc.Address.fromString(plan.changeAddress)
    );
    if (changeScript.toBuffer().length !== 25) pool3Fail('change address must be P2PKH');
    // Snapshot caller-owned parents. addInputFromPrevTx otherwise aliases the
    // parent's Output object, allowing a later mutation to alter signing value.
    this.plans = plan.inputs.map((p) => ({
      ...p,
      reference: {
        parentTx: new tbc.Transaction(p.reference.parentTx.uncheckedSerialize()),
        outputIndex: p.reference.outputIndex,
      },
      signer: p.signer
        ? { publicKey: publicKeyBytes(p.signer.publicKey), sign: p.signer.sign?.bind(p.signer) }
        : undefined,
    }));
    this.publicKeys = this.plans.map((p) =>
      p.signer ? publicKeyBytes(p.signer.publicKey) : undefined
    );
    const seen = new Set<string>();
    this.consumedOutpoints = Object.freeze(
      this.plans.map((p) => {
        referenceOutput(p.reference);
        const outpoint = { txId: p.reference.parentTx.id, outputIndex: p.reference.outputIndex };
        const id = `${outpoint.txId}:${outpoint.outputIndex}`;
        if (seen.has(id)) pool3Fail(`duplicate input ${id}`);
        seen.add(id);
        return Object.freeze(outpoint);
      })
    );
    const available =
      this.plans.reduce((sum, p) => sum + BigInt(referenceOutput(p.reference).satoshis), 0n) -
      plan.outputs.reduce((sum, output) => {
        if (!Number.isSafeInteger(output.satoshis) || output.satoshis < 0)
          pool3Fail('invalid output satoshis');
        return sum + BigInt(output.satoshis);
      }, 0n);
    if (available < 0n) pool3Fail('insufficient TBC for fixed outputs');
    const build = (change?: bigint): tbc.Transaction => {
      const tx = new tbc.Transaction();
      (tx as tbc.Transaction & { version: number }).version = 10;
      tx.nLockTime = plan.lockTime ?? 0;
      this.plans.forEach((p, i) => {
        tx.addInputFromPrevTx(p.reference.parentTx, p.reference.outputIndex);
        const previous = referenceOutput(p.reference);
        tx.inputs[i].output = new tbc.Transaction.Output({
          script: tbc.Script.fromBuffer(Buffer.from(previous.script.toBuffer())),
          satoshis: previous.satoshis,
        });
        if (p.sequence !== undefined) tx.setInputSequence(i, p.sequence);
      });
      plan.outputs.forEach((o) =>
        tx.addOutput(
          new tbc.Transaction.Output({
            script: tbc.Script.fromBuffer(Buffer.from(o.script.toBuffer())),
            satoshis: o.satoshis,
          })
        )
      );
      if (change !== undefined) tx.addOutput(addPool3Output(changeScript, change));
      // No external signing callback is invoked during size estimation.
      const unlocks = this.plans.map((p, i) =>
        p.unlock(tx, p.signer ? Buffer.from(MAX_SIGNATURE) : undefined, this.publicKeys[i])
      );
      unlocks.forEach((unlock, i) => tx.inputs[i].setScript(unlock));
      return tx;
    };
    const requiredFee = (tx: tbc.Transaction): bigint => {
      const size = BigInt(tx.uncheckedSerialize().length / 2);
      const calculated = (size * rate + 999n) / 1000n;
      return calculated > minimum ? calculated : minimum;
    };
    const withChangeFee = requiredFee(build(dust));
    const change = available - withChangeFee;
    if (change >= dust) {
      this.tx = build(change);
      this.feeSat = withChangeFee;
      this.changeVout = plan.outputs.length;
    } else {
      this.tx = build();
      if (available < requiredFee(this.tx))
        pool3Fail('insufficient TBC for the reserved transaction fee');
      this.feeSat = available;
    }
    if (this.feeSat < requiredFee(this.tx)) pool3Fail('fee reservation failed to converge');
    this.reservedBytes = this.tx.uncheckedSerialize().length / 2;
    this.reservations = this.tx.inputs.map((input) => input.script.toBuffer().length);
    this.signaturePositions = this.tx.inputs.map((input, i) => {
      if (!this.publicKeys[i]) return undefined;
      const positions = input.script.chunks.flatMap((chunk, index) =>
        chunk.buf?.equals(MAX_SIGNATURE) ? [index] : []
      );
      if (
        positions.length !== 1 ||
        !input.script.chunks[positions[0] + 1]?.buf?.equals(this.publicKeys[i]!)
      )
        pool3Fail(`ambiguous signature placeholder in input ${i}`);
      return positions[0];
    });
  }

  get transaction(): tbc.Transaction {
    return cloneTx(this.tx);
  }
  get signingRequests(): readonly Pool3SigningRequest[] {
    return this.plans.flatMap((plan, inputIndex) => {
      const publicKey = this.publicKeys[inputIndex];
      if (!publicKey) return [];
      const output = this.tx.inputs[inputIndex].output!;
      return [
        {
          inputIndex,
          role: plan.role,
          outpoint: { ...this.consumedOutpoints[inputIndex] },
          amountSat: BigInt(output.satoshis),
          lockingScriptHex: output.script.toHex(),
          publicKey: Buffer.from(publicKey),
          publicKeyHash: tbc.crypto.Hash.sha256ripemd160(publicKey),
          sighashType: 0x41 as const,
          transaction: cloneTx(this.tx),
        },
      ];
    });
  }

  async sign(): Promise<Pool3TransactionResult> {
    const signatures: Pool3Signature[] = [];
    // Fail before requesting any signature when a role has no adapter.
    for (const request of this.signingRequests)
      if (!this.plans[request.inputIndex].signer?.sign)
        pool3Fail(`no signer for ${request.role} input ${request.inputIndex}; use finalize`);
    for (const request of this.signingRequests) {
      const signature = await this.plans[request.inputIndex].signer!.sign!(request);
      signatures.push({ inputIndex: request.inputIndex, signature, publicKey: request.publicKey });
    }
    return this.finalize(signatures);
  }

  finalize(signatures: readonly Pool3Signature[]): Pool3TransactionResult {
    const tx = cloneTx(this.tx);
    const supplied = new Map<number, Pool3Signature>();
    for (const signature of signatures) {
      if (
        !Number.isInteger(signature.inputIndex) ||
        !this.publicKeys[signature.inputIndex] ||
        supplied.has(signature.inputIndex)
      )
        pool3Fail('unexpected or duplicate signature input');
      supplied.set(signature.inputIndex, signature);
    }
    const unlocks = this.plans.map((plan, i) => {
      const expected = this.publicKeys[i];
      if (!expected) return tbc.Script.fromBuffer(Buffer.from(this.tx.inputs[i].script.toBuffer()));
      const suppliedSignature = supplied.get(i);
      if (!suppliedSignature) pool3Fail(`missing signature for input ${i}`);
      const publicKey = publicKeyBytes(suppliedSignature.publicKey);
      if (!publicKey.equals(expected))
        pool3Fail(`signature public key differs from prepared signer at input ${i}`);
      const signature = signatureBytes(suppliedSignature.signature);
      const output = tx.inputs[i].output!;
      if (
        !tx.verifySignature(
          tbc.crypto.Signature.fromTxFormat(signature),
          tbc.PublicKey.fromBuffer(publicKey),
          i,
          output.script,
          output.satoshisBN,
          0x10000
        )
      )
        pool3Fail(`invalid transaction signature for input ${i}`);
      // All proof data was frozen during preparation. Never call a live
      // parent/ancestor resolver again while finalizing external signatures.
      const unlock = new tbc.Script();
      this.tx.inputs[i].script.chunks.forEach((chunk, index) => {
        if (index === this.signaturePositions[i]) unlock.add(signature);
        else if (chunk.buf) unlock.add(Buffer.from(chunk.buf));
        else unlock.add(chunk.opcodenum);
      });
      if (unlock.toBuffer().length > this.reservations[i])
        pool3Fail(`input ${i} exceeds its signature reservation`);
      return unlock;
    });
    unlocks.forEach((script, i) => tx.inputs[i].setScript(script));
    const txraw = tx.uncheckedSerialize();
    if (txraw.length / 2 > this.reservedBytes)
      pool3Fail('final transaction exceeds its size reservation');
    const validation = validatePool3Transaction(tx);
    if (!validation.success)
      pool3Fail(
        `local input validation failed: ${JSON.stringify(validation.inputs.filter((i) => !i.success))}`
      );
    return {
      transaction: tx,
      txraw,
      txid: tx.id,
      feeSat: this.feeSat,
      reservedBytes: this.reservedBytes,
      changeVout: this.changeVout,
      consumedOutpoints: this.consumedOutpoints.map((o) => ({ ...o })),
      validation,
    };
  }
}
