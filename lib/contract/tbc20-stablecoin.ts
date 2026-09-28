import * as tbc from 'tbc-lib-js';
import { TBC20StablecoinCodec } from '../util/tbc20-stablecoin/tbc20-stablecoin-codec';
import { buildTbc20StablecoinUnlockScript, buildTbc20StablecoinUnlockScriptWithSignature } from '../util/tbc20-stablecoin/tbc20-stablecoin-unlock';
import type { TBC20StablecoinCodeDescriptor } from '../util/tbc20-stablecoin/tbc20-stablecoin-codec';
import type { TBC20StandardTransactionResolver, TBC20StandardCurrentOutputGroup } from '../util/tbc20-standard/tbc20-standard-unlock';
import type { AdminPrepared, AdminSighash } from './stableCoin';
const StableCoin = require('./stableCoin');
const TBC721Standard = require('./tbc721-standard');

export type { AdminPrepared, AdminSighash } from './stableCoin';
/** Authenticated ancestor transactions for TBC20 Stablecoin. */
export type TBC20StablecoinAncestors = TBC20StandardTransactionResolver | readonly TBC20StandardTransactionResolver[];
export interface TBC20StablecoinDefinition { name: string; symbol: string; amount: number | string; decimal: number }
interface TBC20StablecoinCertificateData {
  nftName: string; nftSymbol: string; description: string; coinDecimal: number; coinTotalSupply: string;
}

const SIGHASH = 0x41;
const MAX_SLOT = (1n << 63n) - 1n;
const MAX_DER = Buffer.from('304502210080000000000000000000000000000000000000000000000000000000000000000220010000000000000000000000000000000000000000000000000000000000000041', 'hex');
const EMPTY_SCHNORR = Buffer.concat([Buffer.alloc(64), Buffer.from([SIGHASH])]);
const hash160 = (b: Buffer): Buffer => tbc.crypto.Hash.sha256ripemd160(b);
const sha = (b: Buffer): Buffer => tbc.crypto.Hash.sha256(b);
function fail(message: string): never { throw new Error(`TBC20Stablecoin: ${message}`); }
function decimal(value: unknown): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 18) fail('decimal must be an integer from 0 to 18');
}
function amount(value: number | string, precision: number): bigint {
  decimal(precision);
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER))
    fail('use a decimal string for amounts outside the safe numeric range');
  const text = String(value);
  if (!/^\d+(\.\d+)?$/.test(text)) fail('amount must be a nonnegative decimal without exponent notation');
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > precision && /[1-9]/.test(fraction.slice(precision))) fail('amount exceeds token precision');
  return BigInt(whole + fraction.slice(0, precision).padEnd(precision, '0'));
}
function positive(value: number | string, precision: number): bigint {
  const result = amount(value, precision);
  if (result === 0n) fail('amount must be positive');
  return result;
}
function controller(value: string): Buffer {
  if (/^[a-fA-F0-9]{40}$/.test(value)) return Buffer.concat([Buffer.from(value, 'hex'), Buffer.from([1])]);
  return Buffer.concat([tbc.Address.fromString(value).hashBuffer, Buffer.from([0])]);
}
function resolverFor(proofs: TBC20StablecoinAncestors, index: number, count: number): TBC20StandardTransactionResolver {
  if (typeof proofs === 'function' || (proofs && !Array.isArray(proofs) && typeof (proofs as any).get === 'function'))
    return proofs as TBC20StandardTransactionResolver;
  if (!Array.isArray(proofs)) return fail('ancestor transactions or a resolver are required');
  if (proofs.some(p => typeof p === 'string')) fail('TBC20 Stablecoin requires ancestor transactions, not legacy FT proof strings');
  if ((proofs as unknown[]).every(p => p instanceof tbc.Transaction)) return proofs as unknown as tbc.Transaction[];
  if (proofs.length !== count) fail('per-input ancestor resolvers must match coin input count');
  return proofs[index] as unknown as TBC20StandardTransactionResolver;
}
function core(tx: tbc.Transaction): string {
  return JSON.stringify({ version: (tx as any).version, lockTime: tx.nLockTime,
    inputs: tx.inputs.map(i => [i.prevTxId.toString('hex'), i.outputIndex, i.sequenceNumber,
      i.output?.satoshis, i.output?.script.toHex()]),
    outputs: tx.outputs.map(o => [o.satoshis, o.script.toHex()]) });
}
function sighash(tx: tbc.Transaction, vin: number): Buffer {
  return tbc.crypto.Hash.sha256sha256(Buffer.from(tx.getPreimage(vin, SIGHASH), 'hex'));
}
function utxoFrom(tx: tbc.Transaction, vout: number, coin = false): tbc.Transaction.IUnspentOutput {
  const output = tx.outputs[vout];
  return { txId: tx.id, outputIndex: vout, script: output.script.toHex(), satoshis: output.satoshis,
    ...(coin ? { ftBalance: TBC20StablecoinCodec.parseTape(tx.outputs[vout + 1].script).balance } : {}) };
}
function certificateTape(data: TBC20StablecoinCertificateData): tbc.Script {
  return new tbc.Script().add(tbc.Opcode.OP_0).add(tbc.Opcode.OP_RETURN)
    .add(Buffer.from(JSON.stringify(data), 'utf8')).add(Buffer.from('NTape'));
}
function readCertificate(parent: tbc.Transaction): TBC20StablecoinCertificateData {
  const tape = parent.outputs[2];
  if (parent.outputs[0]?.satoshis !== 200 || parent.outputs[1]?.satoshis !== 100 || tape?.satoshis !== 0 ||
    tape.script.chunks.length !== 4 || !tape.script.isSafeDataOut() ||
    !tape.script.chunks[3].buf?.equals(Buffer.from('NTape'))) fail('invalid issuance certificate layout');
  let data: TBC20StablecoinCertificateData;
  try { data = JSON.parse(tape.script.chunks[2].buf!.toString('utf8')); }
  catch { return fail('invalid issuance certificate metadata'); }
  if (!data || typeof data.nftName !== 'string' || typeof data.nftSymbol !== 'string' ||
    typeof data.description !== 'string' || typeof data.coinTotalSupply !== 'string' ||
    !/^\d+$/.test(data.coinTotalSupply)) fail('invalid issuance certificate metadata');
  decimal(data.coinDecimal);
  return data;
}
/** Fix the fee with maximal ECDSA placeholders before any external signature is requested. */
function fundIssuance(tx: tbc.Transaction, feeKey: tbc.PrivateKey, feeVin: number,
  seed: () => void = () => {}): void {
  const inputSat = tx.inputs.reduce((sum, input) => sum + BigInt(input.output!.satoshis), 0n);
  const outputSat = tx.outputs.reduce((sum, output) => sum + BigInt(output.satoshis), 0n);
  if (inputSat > BigInt(Number.MAX_SAFE_INTEGER)) fail('native input value exceeds safe range');
  const available = Number(inputSat - outputSat);
  if (available < 104) fail('insufficient TBC for issuance fees and change');
  const change = new tbc.Transaction.Output({ satoshis: available - 80, script: tbc.Script.buildPublicKeyHashOut(feeKey.toAddress()) });
  tx.addOutput(change);
  tx.inputs[feeVin].setScript(new tbc.Script().add(MAX_DER).add(feeKey.publicKey.toBuffer()));
  seed();
  const feeSat = Math.max(80, Math.ceil(tx.toBuffer().length * 80 / 1000));
  if (available - feeSat < 24) fail('insufficient TBC for the complete issuance witness fee and change');
  (change as any).satoshis = available - feeSat;
  tx.fee(feeSat); tx.seal();
  seed();
  const signature = (tbc.Transaction as any).sighash.sign(tx, feeKey, SIGHASH, feeVin,
    tx.inputs[feeVin].output!.script, tx.inputs[feeVin].output!.satoshisBN).toTxFormat();
  tx.inputs[feeVin].setScript(new tbc.Script().add(signature).add(feeKey.publicKey.toBuffer()));
}
interface TBC20StablecoinInput { utxo: tbc.Transaction.IUnspentOutput; parent: tbc.Transaction; ancestors: TBC20StandardTransactionResolver;
  descriptor: TBC20StablecoinCodeDescriptor; balance: bigint; tape: tbc.Script; lockTime: number }
interface Allocation { controller: Buffer; amounts: bigint[]; tape: tbc.Script; lockTime: number }

/** TBC20 Stablecoin issuance, transfers and administrator operations. */
class TBC20Stablecoin extends StableCoin {
  private initialAmount?: string;
  private creating = false;

  constructor(config: string | TBC20StablecoinDefinition) {
    super(typeof config === 'string' ? config : '0'.repeat(64));
    if (typeof config === 'string') return;
    if (!config || typeof config.name !== 'string' || typeof config.symbol !== 'string') fail('name and symbol are required');
    decimal(config.decimal);
    const raw = positive(config.amount, config.decimal);
    if (raw > MAX_SLOT) fail('initial supply exceeds the TBC20Stablecoin Tape slot limit');
    this.name = config.name; this.symbol = config.symbol; this.decimal = config.decimal;
    this.initialAmount = String(config.amount); this.totalSupply = 0n; this.contractTxid = '';
  }

  initialize(info: { codeScript: string; tapeScript: string; totalSupply: bigint | string; decimal: number;
    name: string; symbol: string; contractTxid?: string }): void {
    if (this.creating) fail('finish the pending issuance before reinitializing');
    decimal(info.decimal);
    const code = TBC20StablecoinCodec.parseCode(info.codeScript);
    TBC20StablecoinCodec.parseTape(info.tapeScript, code);
    if (BigInt(info.totalSupply) < 0n) fail('totalSupply must be nonnegative atomic units');
    this.name = info.name; this.symbol = info.symbol; this.decimal = info.decimal;
    this.totalSupply = BigInt(info.totalSupply);
    this.codeScript = info.codeScript; this.tapeScript = info.tapeScript;
    if (info.contractTxid) this.contractTxid = info.contractTxid;
    this.initialAmount = undefined;
  }

  protected buildIssuanceScripts(adminHash: string, recipient: string, issuerHash: string, raw: bigint): { codeScript: tbc.Script; tapeScript: tbc.Script } {
    if (raw <= 0n || raw > MAX_SLOT) fail('issuance amount exceeds the TBC20Stablecoin Tape slot range');
    let tapeScript: tbc.Script;
    if (this.codeScript) {
      const previous = TBC20StablecoinCodec.parseCode(this.codeScript);
      if (!previous.coinNftCodeHash.equals(Buffer.from(issuerHash, 'hex')) || !previous.adminPubKeyHash.equals(Buffer.from(adminHash, 'hex')))
        fail('issuance certificate or administrator differs from this coin');
      tapeScript = TBC20StablecoinCodec.setLockTime(TBC20StablecoinCodec.replaceTapeAmounts(this.tapeScript, [raw, 0n, 0n, 0n, 0n, 0n]), 0);
    } else {
      const metadata = new tbc.Script().add(Buffer.from([this.decimal])).add(Buffer.from(this.name, 'utf8')).add(Buffer.from(this.symbol, 'utf8')).toBuffer();
      tapeScript = TBC20StablecoinCodec.buildTape({ amounts: [raw, 0n, 0n, 0n, 0n, 0n], tapeSize: 66 + metadata.length, lockTime: 0, metadata });
    }
    return { tapeScript, codeScript: TBC20Stablecoin.getCoinMintCode(adminHash, recipient, issuerHash, tapeScript.toBuffer().length) };
  }

  createCoin(admin: Buffer, feeKey: tbc.PrivateKey, recipient: string, fee: tbc.Transaction.IUnspentOutput,
    funding: tbc.Transaction, message?: string): AdminPrepared<string[]> {
    if (!this.initialAmount || this.codeScript || this.creating) fail('createCoin requires a fresh coin definition');
    if (!Buffer.isBuffer(admin) || admin.length !== 32) fail('administrator must be a 32-byte x-only public key');
    this.checkFee(fee, feeKey);
    this.checkParent(fee, funding);
    const raw = positive(this.initialAmount, this.decimal);
    const snapshot = this.issuanceState();
    try {
      const data: TBC20StablecoinCertificateData = {
        nftName: this.name + ' NFT', nftSymbol: this.symbol + ' NFT',
        description: 'The issuance certificate for the stablecoin, recording cumulative supply and issuance history.',
        coinDecimal: this.decimal, coinTotalSupply: '0',
      };
      const source = TBC20Stablecoin.buildCoinNftTx(feeKey, hash160(admin).toString('hex'), fee, data);
      const sourceRaw = source.uncheckedSerialize();
      const issuance = this.prepareIssuance(admin, feeKey, recipient, utxoFrom(source, 3), source, funding,
        raw, { ...data, coinTotalSupply: raw.toString() }, message);
      const prepared: AdminPrepared<string[]> = { ...issuance, finalize: signatures => [sourceRaw, issuance.finalize(signatures)] };
      this.totalSupply = 0n; this.creating = true;
      return this.guardPrepared(prepared, admin, () => {
        this.totalSupply = raw; this.contractTxid = prepared.tx.id; this.creating = false; this.initialAmount = undefined;
      });
    } catch (error) { Object.assign(this, snapshot); this.creating = false; throw error; }
  }

  mintCoin(admin: Buffer, feeKey: tbc.PrivateKey, recipient: string, humanAmount: number | string,
    fee: tbc.Transaction.IUnspentOutput, parent: tbc.Transaction, grandparent: tbc.Transaction, message?: string): AdminPrepared<string> {
    const code = TBC20StablecoinCodec.parseCode(this.codeScript);
    if (!Buffer.isBuffer(admin) || admin.length !== 32 || !hash160(admin).equals(code.adminPubKeyHash)) fail('wrong administrator');
    if (!(parent instanceof tbc.Transaction) || !parent.outputs[0] || !sha(parent.outputs[0].script.toBuffer()).equals(code.coinNftCodeHash)) fail('wrong issuance certificate');
    this.checkFee(fee, feeKey);
    const data = readCertificate(parent);
    const previousSupply = BigInt(data.coinTotalSupply);
    if (previousSupply < 0n || data.coinDecimal !== this.decimal) fail('invalid issuance certificate metadata');
    const raw = positive(humanAmount, this.decimal);
    if (raw > MAX_SLOT) fail('mint amount exceeds the TBC20Stablecoin Tape slot limit');
    if (this.creating) fail('finish the pending issuance first');
    const snapshot = this.issuanceState();
    try {
      let prepared: AdminPrepared<string>;
      if (TBC721Standard.isTbc721StandardCode(parent.outputs[0].script)) {
        prepared = this.prepareIssuance(admin, feeKey, recipient, fee, parent, grandparent,
          raw, { ...data, coinTotalSupply: (previousSupply + raw).toString() }, message);
      } else {
        // The issuance certificate selects the matching NFT unlock ABI.
        this.totalSupply = previousSupply;
        prepared = super.mintCoin(admin, feeKey, recipient, humanAmount, fee, parent, grandparent, message);
      }
      this.creating = true;
      return this.guardPrepared(prepared, admin, () => { this.totalSupply = previousSupply + raw; this.creating = false; });
    } catch (error) { Object.assign(this, snapshot); this.creating = false; throw error; }
  }

  private prepareIssuance(admin: Buffer, feeKey: tbc.PrivateKey, recipient: string,
    fee: tbc.Transaction.IUnspentOutput, parent: tbc.Transaction, grandparent: tbc.Transaction,
    raw: bigint, data: TBC20StablecoinCertificateData, message?: string): AdminPrepared<string> {
    if (fee.txId.toLowerCase() === parent.id.toLowerCase() && [0, 1, 2].includes(fee.outputIndex))
      fail('fee input duplicates an issuance certificate output');
    const adminHash = hash160(admin).toString('hex');
    const expectedHold = TBC721Standard.getHoldScriptFromHash(adminHash, data.nftName);
    if (!parent.outputs[1]?.script.equals(expectedHold)) fail('wrong issuance certificate administrator or Hold script');
    const scripts = this.buildIssuanceScripts(adminHash, recipient, sha(parent.outputs[0].script.toBuffer()).toString('hex'), raw);
    const tx = new tbc.Transaction().addInputFromPrevTx(parent, 0).addInputFromPrevTx(parent, 1).from(fee);
    TBC20Stablecoin.buildCoinNftOutput(parent.outputs[0].script, parent.outputs[1].script, certificateTape(data))
      .forEach((output: tbc.Transaction.Output) => tx.addOutput(output));
    tx.addOutput(new tbc.Transaction.Output({ satoshis: 500, script: scripts.codeScript }));
    tx.addOutput(new tbc.Transaction.Output({ satoshis: 0, script: scripts.tapeScript }));
    if (message) tx.addOutput(new tbc.Transaction.Output({ satoshis: 0,
      script: new tbc.Script().add(tbc.Opcode.OP_0).add(tbc.Opcode.OP_RETURN).add(Buffer.from(message, 'utf8')) }));
    const unlock = (signatures: Buffer[]) => {
      tx.inputs[0].setScript(TBC721Standard.buildUnlockScriptSchnorr(signatures[0], admin, tx, parent, grandparent, 0));
      tx.inputs[1].setScript(new tbc.Script().add(Buffer.concat([signatures[1], Buffer.from([SIGHASH])])).add(admin));
    };
    fundIssuance(tx, feeKey, 2, () => unlock([Buffer.alloc(64), Buffer.alloc(64)]));
    this.codeScript = scripts.codeScript.toHex(); this.tapeScript = scripts.tapeScript.toHex();
    return { tx, sighashes: [0, 1].map(inputIndex => ({ inputIndex, sighash: sighash(tx, inputIndex) })),
      finalize: signatures => { unlock(signatures); return tx.uncheckedSerialize(); } };
  }

  /** Builds a new TBC721Standard issuance certificate; the legacy class retains coinNft. */
  static buildCoinNftTx(feeKey: tbc.PrivateKey, adminHash: string, fee: tbc.Transaction.IUnspentOutput,
    data: TBC20StablecoinCertificateData): tbc.Transaction {
    if (!/^[a-fA-F0-9]{40}$/.test(adminHash)) fail('administrator hash must be 20 bytes');
    if (!(feeKey instanceof tbc.PrivateKey) || !fee || !Number.isSafeInteger(fee.satoshis) || fee.satoshis <= 0 ||
      fee.script !== tbc.Script.buildPublicKeyHashOut(feeKey.toAddress()).toHex()) fail('fee UTXO must belong to the fee key');
    const outputs = TBC20Stablecoin.buildCoinNftOutput(TBC721Standard.buildCodeScript(fee.txId, fee.outputIndex),
      TBC721Standard.getHoldScriptFromHash(adminHash, data.nftName), certificateTape(data));
    const tx = new tbc.Transaction().from(fee);
    outputs.forEach((output: tbc.Transaction.Output) => tx.addOutput(output));
    readCertificate(tx);
    fundIssuance(tx, feeKey, 0);
    return tx;
  }

  private issuanceState() {
    return { codeScript: this.codeScript, tapeScript: this.tapeScript, totalSupply: this.totalSupply, contractTxid: this.contractTxid };
  }

  private guardPrepared<R>(prepared: AdminPrepared<R>, publicKey: Buffer, done: () => void = () => {}): AdminPrepared<R> {
    const expectedCore = core(prepared.tx);
    const expected = prepared.sighashes.map(item => ({ inputIndex: item.inputIndex, sighash: Buffer.from(item.sighash) }));
    const key = Buffer.from(publicKey);
    let finalized = false;
    const finish = prepared.finalize;
    return { tx: prepared.tx, sighashes: expected.map(item => ({ ...item, sighash: Buffer.from(item.sighash) })), finalize: signatures => {
      if (finalized) fail('prepared transaction has already been finalized');
      if (core(prepared.tx) !== expectedCore) fail('prepared transaction changed after sighashes were issued');
      if (!Array.isArray(signatures) || signatures.length !== expected.length) fail(`expected ${expected.length} administrator signatures`);
      expected.forEach((entry, i) => {
        if (!Buffer.isBuffer(signatures[i]) || signatures[i].length !== 64 ||
          !sighash(prepared.tx, entry.inputIndex).equals(entry.sighash) ||
          !(tbc.crypto as any).Schnorr.verify(entry.sighash, signatures[i], key)) fail('invalid administrator signature or changed signing context');
      });
      const result = finish(signatures.map(sig => Buffer.from(sig)));
      if (core(prepared.tx) !== expectedCore) fail('finalization changed the signed transaction');
      for (let vin = 0; vin < prepared.tx.inputs.length; vin++) {
        const checked = prepared.tx.verifyScript(vin);
        if (!checked.success) fail(`final transaction input ${vin} failed: ${checked.error}`);
      }
      finalized = true; done(); return result;
    } };
  }

  private checkParent(utxo: tbc.Transaction.IUnspentOutput, parent: tbc.Transaction): void {
    const output = parent?.outputs?.[utxo.outputIndex];
    if (!(parent instanceof tbc.Transaction) || utxo.txId.toLowerCase() !== parent.id.toLowerCase() || !output ||
      output.satoshis !== utxo.satoshis || output.script.toHex() !== utxo.script.toLowerCase()) fail('UTXO does not match its parent transaction');
  }
  private checkFee(fee: tbc.Transaction.IUnspentOutput, key: tbc.PrivateKey): void {
    if (!(key instanceof tbc.PrivateKey) || !fee || !/^[a-fA-F0-9]{64}$/.test(fee.txId) ||
      !Number.isSafeInteger(fee.outputIndex) || fee.outputIndex < 0 || !Number.isSafeInteger(fee.satoshis) || fee.satoshis <= 0 ||
      fee.script !== tbc.Script.buildPublicKeyHashOut(key.toAddress()).toHex()) fail('fee UTXO must be a positive P2PKH output owned by the fee key');
  }
  private inputs(utxos: tbc.Transaction.IUnspentOutput[], parents: tbc.Transaction[], proofs: TBC20StablecoinAncestors): TBC20StablecoinInput[] {
    if (!Array.isArray(utxos) || !utxos.length || !Array.isArray(parents) || parents.length !== utxos.length) fail('coin UTXOs and parents must have matching nonzero lengths');
    const identity = TBC20StablecoinCodec.getCodeIdentity(this.codeScript);
    const seen = new Set<string>();
    return utxos.map((utxo, i) => {
      this.checkParent(utxo, parents[i]);
      const point = `${utxo.txId.toLowerCase()}:${utxo.outputIndex}`;
      if (seen.has(point)) fail('duplicate coin input'); seen.add(point);
      const descriptor = TBC20StablecoinCodec.parseCode(utxo.script);
      if (!descriptor.identity.equals(identity)) fail('coin inputs must share this coin identity');
      const tape = parents[i].outputs[utxo.outputIndex + 1]?.script;
      if (!tape || utxo.satoshis !== 500 || parents[i].outputs[utxo.outputIndex + 1].satoshis !== 0) fail('TBC20Stablecoin Code/Tape values must be 500/0 satoshis');
      const parsed = TBC20StablecoinCodec.parseTape(tape, descriptor);
      if (parsed.balance <= 0n) fail('coin input balance must be positive');
      if (utxo.ftBalance !== undefined && BigInt(utxo.ftBalance) !== parsed.balance) fail('claimed ftBalance differs from authenticated Tape');
      return { utxo, parent: parents[i], ancestors: resolverFor(proofs, i, utxos.length), descriptor, tape,
        balance: parsed.balance, lockTime: parsed.lockTime };
    });
  }

  private build(inputs: TBC20StablecoinInput[], fee: tbc.Transaction.IUnspentOutput, feeKey: tbc.PrivateKey,
    allocations: Allocation[], signer: tbc.PrivateKey | Buffer, extra?: { recipient?: string; satoshis?: number; data?: Buffer }): tbc.Transaction {
    if (inputs.length < 1 || inputs.length > 5) fail('at most five TBC20Stablecoin inputs plus one fee input are supported');
    this.checkFee(fee, feeKey);
    if (inputs.some(i => i.utxo.txId.toLowerCase() === fee.txId.toLowerCase() && i.utxo.outputIndex === fee.outputIndex)) fail('fee input duplicates a TBC20Stablecoin input');
    const admin = Buffer.isBuffer(signer);
    if (admin && (signer.length !== 32 || inputs.some(i => !hash160(signer).equals(i.descriptor.adminPubKeyHash)))) fail('wrong administrator');
    let lockTime = 0;
    if (!admin) {
      for (const input of inputs) {
        const key = (signer as tbc.PrivateKey).publicKey.toBuffer();
        if (hash160(key).equals(input.descriptor.adminPubKeyHash) || hash160(key.subarray(1)).equals(input.descriptor.adminPubKeyHash)) continue;
        const lock = input.lockTime;
        if (lock && lockTime && (lock < 500000000) !== (lockTime < 500000000)) fail('cannot combine height and timestamp locks under ordinary authorization');
        lockTime = Math.max(lockTime, lock);
      }
    }
    const tx = new tbc.Transaction();
    inputs.forEach(input => tx.addInputFromPrevTx(input.parent, input.utxo.outputIndex)); tx.from(fee);
    inputs.forEach((_, i) => tx.setInputSequence(i, 0xfffffffe)); tx.setLockTime(lockTime);
    const groups: TBC20StandardCurrentOutputGroup[] = [];
    for (const allocation of allocations) {
      const codeVout = tx.outputs.length;
      tx.addOutput(new tbc.Transaction.Output({ satoshis: 500, script: TBC20StablecoinCodec.replaceController(this.codeScript, allocation.controller) }));
      tx.addOutput(new tbc.Transaction.Output({ satoshis: 0, script: TBC20StablecoinCodec.setLockTime(TBC20StablecoinCodec.replaceTapeAmounts(allocation.tape, allocation.amounts), allocation.lockTime) }));
      groups.push({ codeVout, tapeVout: codeVout + 1 });
    }
    if (extra?.satoshis) {
      groups.push({ codeVout: tx.outputs.length }); tx.to(extra.recipient!, extra.satoshis);
    }
    if (extra?.data) {
      groups.push({ codeVout: tx.outputs.length });
      tx.addOutput(new tbc.Transaction.Output({ satoshis: 0, script: new tbc.Script().add(tbc.Opcode.OP_0).add(tbc.Opcode.OP_RETURN).add(extra.data) }));
    }
    const changeVout = tx.outputs.length;
    groups.push({ codeVout: changeVout });
    if (groups.length > 8) fail('transaction exceeds eight output groups');
    const total = tx.inputs.reduce((sum, input) => sum + BigInt(input.output!.satoshis), 0n);
    const spent = tx.outputs.reduce((sum, output) => sum + BigInt(output.satoshis), 0n);
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) fail('native input value exceeds safe range');
    const available = Number(total - spent);
    if (available < 104) fail('insufficient TBC for fees and change');
    const change = new tbc.Transaction.Output({ satoshis: available - 80, script: tbc.Script.buildPublicKeyHashOut(feeKey.toAddress()) }); tx.addOutput(change);
    const options = (vin: number) => ({ currentTx: tx, inputIndex: vin, preTx: inputs[vin].parent,
      preTxVout: inputs[vin].utxo.outputIndex, ancestorTransactions: inputs[vin].ancestors, outputGroups: groups });
    const pubkey = admin ? signer as Buffer : (signer as tbc.PrivateKey).publicKey.toBuffer();
    inputs.forEach((input, vin) => {
      const compressedAdmin = hash160(pubkey).equals(input.descriptor.adminPubKeyHash);
      const useXOnly = !admin && (hash160(pubkey.subarray(1)).equals(input.descriptor.adminPubKeyHash) ||
        (!compressedAdmin && input.descriptor.controller[20] === 0 && hash160(pubkey.subarray(1)).equals(input.descriptor.controller.subarray(0, 20))));
      tx.inputs[vin].setScript(buildTbc20StablecoinUnlockScriptWithSignature({ ...options(vin), signature: admin || useXOnly ? EMPTY_SCHNORR : MAX_DER,
        publicKey: useXOnly ? pubkey.subarray(1) : pubkey }));
    });
    const feeVin = inputs.length;
    tx.inputs[feeVin].setScript(new tbc.Script().add(MAX_DER).add(feeKey.publicKey.toBuffer()));
    const feeSat = Math.max(80, Math.ceil(tx.toBuffer().length * 80 / 1000));
    if (available - feeSat < 24) fail('insufficient TBC for the complete witness fee and change');
    (change as any).satoshis = available - feeSat;
    // All output values are fixed before obtaining real signatures. No automatic change callbacks remain.
    tx.fee(feeSat); tx.seal();
    inputs.forEach((_, vin) => tx.inputs[vin].setScript(admin
      ? buildTbc20StablecoinUnlockScriptWithSignature({ ...options(vin), signature: EMPTY_SCHNORR, publicKey: signer as Buffer })
      : buildTbc20StablecoinUnlockScript({ ...options(vin), privateKey: signer as tbc.PrivateKey })));
    const feeSig = (tbc.Transaction as any).sighash.sign(tx, feeKey, SIGHASH, feeVin, tx.inputs[feeVin].output!.script, tx.inputs[feeVin].output!.satoshisBN).toTxFormat();
    tx.inputs[feeVin].setScript(new tbc.Script().add(feeSig).add(feeKey.publicKey.toBuffer()));
    return tx;
  }

  private distribute(inputs: TBC20StablecoinInput[], recipients: { controller: Buffer; amount: bigint }[]): Allocation[] {
    const remaining = inputs.map(input => input.balance);
    return recipients.map(recipient => {
      let wanted = recipient.amount;
      const slots = Array<bigint>(6).fill(0n);
      for (let vin = 0; vin < inputs.length; vin++) {
        const take = remaining[vin] < wanted ? remaining[vin] : wanted;
        slots[vin] = take; remaining[vin] -= take; wanted -= take;
      }
      if (wanted > 0n) fail('insufficient TBC20Stablecoin balance');
      return { controller: recipient.controller, amounts: slots, tape: inputs[0].tape, lockTime: 0 };
    });
  }
  private send(key: tbc.PrivateKey, recipients: { address: string; amount: number | string }[], utxos: tbc.Transaction.IUnspentOutput[], fee: tbc.Transaction.IUnspentOutput,
    parents: tbc.Transaction[], proofs: TBC20StablecoinAncestors, extra?: { recipient?: string; satoshis?: number; data?: Buffer }): { tx: tbc.Transaction; changeVout?: number } {
    const inputs = this.inputs(utxos, parents, proofs);
    const targets = recipients.map(item => ({ controller: controller(item.address), amount: positive(item.amount, this.decimal) }));
    const total = inputs.reduce((sum, input) => sum + input.balance, 0n);
    const spent = targets.reduce((sum, output) => sum + output.amount, 0n);
    if (spent > total) fail('insufficient TBC20Stablecoin balance');
    const changeVout = spent < total ? targets.length * 2 : undefined;
    if (spent < total) targets.push({ controller: controller(key.toAddress().toString()), amount: total - spent });
    return { tx: this.build(inputs, fee, key, this.distribute(inputs, targets), key, extra), changeVout };
  }

  transfer(key: tbc.PrivateKey, recipient: string, value: number | string, utxos: tbc.Transaction.IUnspentOutput[], fee: tbc.Transaction.IUnspentOutput,
    parents: tbc.Transaction[], proofs: TBC20StablecoinAncestors, tbcAmount?: number | string): string {
    const raw = tbcAmount === undefined ? 0n : amount(tbcAmount, 6);
    if (raw > BigInt(Number.MAX_SAFE_INTEGER) || (raw > 0n && raw < 24n)) fail('additional TBC value is outside the supported range');
    return this.send(key, [{ address: recipient, amount: value }], utxos, fee, parents, proofs, { recipient, satoshis: Number(raw) }).tx.uncheckedSerialize();
  }

  transferWithAdditionalInfo(key: tbc.PrivateKey, recipient: string, value: number | string, utxos: tbc.Transaction.IUnspentOutput[], fee: tbc.Transaction.IUnspentOutput,
    parents: tbc.Transaction[], proofs: TBC20StablecoinAncestors, data: Buffer): string {
    if (!Buffer.isBuffer(data)) fail('additionalInfo must be a Buffer');
    return this.send(key, [{ address: recipient, amount: value }], utxos, fee, parents, proofs, { data }).tx.uncheckedSerialize();
  }

  batchTransfer(key: tbc.PrivateKey, recipients: { address: string; amount: number | string }[], utxos: tbc.Transaction.IUnspentOutput[], fee: tbc.Transaction.IUnspentOutput,
    parents: tbc.Transaction[], proofs: TBC20StablecoinAncestors): { txraw: string }[] {
    if (!Array.isArray(recipients) || !recipients.length) fail('receivers must not be empty');
    const inputs = this.inputs(utxos, parents, proofs);
    const required = recipients.reduce((sum, item) => { controller(item.address); return sum + positive(item.amount, this.decimal); }, 0n);
    if (required > inputs.reduce((sum, item) => sum + item.balance, 0n)) fail('insufficient TBC20Stablecoin balance for batch');
    const result: { txraw: string }[] = [];
    let currentUtxos = utxos, currentParents = parents, currentProofs = proofs, currentFee = fee;
    for (let start = 0; start < recipients.length; start += 5) {
      const built = this.send(key, recipients.slice(start, start + 5), currentUtxos, currentFee, currentParents, currentProofs);
      result.push({ txraw: built.tx.uncheckedSerialize() });
      if (start + 5 < recipients.length) {
        if (built.changeVout === undefined) fail('batch has no TBC20Stablecoin change for the next transaction');
        currentProofs = currentParents;
        currentParents = [built.tx]; currentUtxos = [utxoFrom(built.tx, built.changeVout, true)];
        currentFee = utxoFrom(built.tx, built.tx.outputs.length - 1);
      }
    }
    return result;
  }

  mergeCoin(key: tbc.PrivateKey, utxos: tbc.Transaction.IUnspentOutput[], fee: tbc.Transaction.IUnspentOutput,
    parents: tbc.Transaction[], proofs: TBC20StablecoinAncestors, localTxs: tbc.Transaction[] = []): { txraw: string }[] {
    const pending = this.inputs(utxos, parents, proofs);
    if (pending.length < 2) return [];
    const local = new Map<string, tbc.Transaction>([...localTxs, ...parents].map(tx => [tx.id, tx]));
    const result: { txraw: string }[] = [];
    let currentFee = fee;
    while (pending.length > 1) {
      const group = pending.splice(0, 5);
      const raw = group.reduce((sum, input) => sum + input.balance, 0n);
      const allocations = this.distribute(group, [{ controller: controller(key.toAddress().toString()), amount: raw }]);
      const tx = this.build(group, currentFee, key, allocations, key);
      result.push({ txraw: tx.uncheckedSerialize() }); local.set(tx.id, tx);
      const coin = utxoFrom(tx, 0, true);
      pending.unshift({ utxo: coin, parent: tx, ancestors: local, descriptor: TBC20StablecoinCodec.parseCode(coin.script),
        balance: raw, tape: tx.outputs[1].script, lockTime: 0 });
      currentFee = utxoFrom(tx, tx.outputs.length - 1);
    }
    return result;
  }

  freezeCoinUtxo(admin: Buffer, feeKey: tbc.PrivateKey, lockTime: number, utxos: tbc.Transaction.IUnspentOutput[], fee: tbc.Transaction.IUnspentOutput,
    parents: tbc.Transaction[], proofs: TBC20StablecoinAncestors): AdminPrepared<string> {
    return this.changeLocks(admin, feeKey, lockTime, utxos, fee, parents, proofs);
  }
  unfreezeCoinUtxo(admin: Buffer, feeKey: tbc.PrivateKey, utxos: tbc.Transaction.IUnspentOutput[], fee: tbc.Transaction.IUnspentOutput,
    parents: tbc.Transaction[], proofs: TBC20StablecoinAncestors): AdminPrepared<string> {
    return this.changeLocks(admin, feeKey, 0, utxos, fee, parents, proofs);
  }
  private changeLocks(admin: Buffer, feeKey: tbc.PrivateKey, lockTime: number, utxos: tbc.Transaction.IUnspentOutput[], fee: tbc.Transaction.IUnspentOutput,
    parents: tbc.Transaction[], proofs: TBC20StablecoinAncestors): AdminPrepared<string> {
    const inputs = this.inputs(utxos, parents, proofs);
    const groups = new Map<string, Allocation>();
    inputs.forEach((input, vin) => {
      const key = input.descriptor.controller.toString('hex');
      let allocation = groups.get(key);
      if (!allocation) {
        allocation = { controller: input.descriptor.controller, amounts: Array<bigint>(6).fill(0n), tape: input.tape, lockTime };
        groups.set(key, allocation);
      }
      allocation.amounts[vin] = input.balance;
    });
    const tx = this.build(inputs, fee, feeKey, [...groups.values()], admin);
    const outputGroups: TBC20StandardCurrentOutputGroup[] = [...groups.values()].map((_, i) => ({ codeVout: i * 2, tapeVout: i * 2 + 1 }));
    outputGroups.push({ codeVout: tx.outputs.length - 1 });
    const sighashes = inputs.map((_, inputIndex) => ({ inputIndex, sighash: sighash(tx, inputIndex) }));
    return this.guardPrepared({ tx, sighashes, finalize: signatures => {
      inputs.forEach((input, inputIndex) => tx.inputs[inputIndex].setScript(buildTbc20StablecoinUnlockScriptWithSignature({
        currentTx: tx, inputIndex, preTx: input.parent, preTxVout: input.utxo.outputIndex, ancestorTransactions: input.ancestors,
        outputGroups, publicKey: admin, signature: Buffer.concat([signatures[inputIndex], Buffer.from([SIGHASH])]) })));
      return tx.uncheckedSerialize();
    } }, admin);
  }

  static getCoinMintCode(adminHash: string, recipient: string, issuerHash: string, tapeSize: number): tbc.Script {
    if (!/^[0-9a-fA-F]{40}$/.test(adminHash) || !/^[0-9a-fA-F]{64}$/.test(issuerHash)) fail('invalid administrator or issuance code hash');
    return TBC20StablecoinCodec.instantiateCode({ adminPubKeyHash: Buffer.from(adminHash, 'hex'), coinNftCodeHash: Buffer.from(issuerHash, 'hex'), tapeSize, controller: controller(recipient) });
  }
  static setLockTimeInTape(tape: tbc.Script, lockTime: number): tbc.Script {
    return TBC20StablecoinCodec.setLockTime(tape, lockTime);
  }
  static getLockTimeFromTape(tape: tbc.Script): number { return TBC20StablecoinCodec.parseTape(tape).lockTime; }
  static getAddressFromCode(code: string): { address: string; type: 'address' | 'contract' } {
    const data = TBC20StablecoinCodec.parseCode(code).controller;
    return { address: data.subarray(0, 20).toString('hex'), type: data[20] === 0 ? 'address' : 'contract' };
  }
  static buildFtTransferCode(code: string, address: string): tbc.Script {
    return TBC20StablecoinCodec.replaceController(code, controller(address));
  }
  static buildFtTransferTape(tape: string, amountHex: string): tbc.Script {
    if (!/^[0-9a-fA-F]{96}$/.test(amountHex)) fail('amount data must contain six uint64 slots');
    const bytes = Buffer.from(amountHex, 'hex');
    return TBC20StablecoinCodec.replaceTapeAmounts(tape, Array.from({ length: 6 }, (_, i) => bytes.readBigUInt64LE(i * 8)));
  }
  static buildUtxo(tx: tbc.Transaction, vout: number): tbc.Transaction.IUnspentOutput {
    const output = tx.outputs[vout]; if (!output) fail('TBC20Stablecoin output index is out of range');
    const code = TBC20StablecoinCodec.parseCode(output.script); TBC20StablecoinCodec.parseTape(tx.outputs[vout + 1]?.script, code);
    if (output.satoshis !== 500 || tx.outputs[vout + 1].satoshis !== 0) fail('TBC20Stablecoin Code/Tape values must be 500/0');
    return utxoFrom(tx, vout, true);
  }
  static getUnlockScript = buildTbc20StablecoinUnlockScript;
  static getUnlockScriptWithSignature = buildTbc20StablecoinUnlockScriptWithSignature;

  mergeFt(...args: Parameters<TBC20Stablecoin['mergeCoin']>): { txraw: string }[] {
    return this.mergeCoin(...args);
  }
  batchTransferLegacy(key: tbc.PrivateKey, receivers: Map<string, number | string>,
    utxos: tbc.Transaction.IUnspentOutput[], fee: tbc.Transaction.IUnspentOutput,
    parents: tbc.Transaction[], proofs: TBC20StablecoinAncestors): { txraw: string }[] {
    return this.batchTransfer(key, [...receivers].map(([address, value]) => ({ address, amount: value })),
      utxos, fee, parents, proofs);
  }
  // Shadow inherited spellings so dispatch uses the stablecoin transaction builders.
  private static buildCoinNftTX = TBC20Stablecoin.buildCoinNftTx;
  private static buildFTtransferCode = TBC20Stablecoin.buildFtTransferCode;
  private static buildFTtransferTape = TBC20Stablecoin.buildFtTransferTape;
  private freezeCoinUTXO(...args: Parameters<TBC20Stablecoin['freezeCoinUtxo']>): AdminPrepared<string> {
    return this.freezeCoinUtxo(...args);
  }
  private unfreezeCoinUTXO(...args: Parameters<TBC20Stablecoin['unfreezeCoinUtxo']>): AdminPrepared<string> {
    return this.unfreezeCoinUtxo(...args);
  }
  private mergeFT(...args: Parameters<TBC20Stablecoin['mergeFt']>): { txraw: string }[] {
    return this.mergeFt(...args);
  }
  private batchTransfer_old(...args: Parameters<TBC20Stablecoin['batchTransferLegacy']>): { txraw: string }[] {
    return this.batchTransferLegacy(...args);
  }

  // Block inherited FT witness builders: TBC20 Stablecoin uses a different ABI.
  private _mergeCoin(...args: any[]): any { fail('use mergeCoin for TBC20 Stablecoin'); }
  private _mergeFT(...args: any[]): any { fail('use mergeCoin for TBC20 Stablecoin'); }
  private mergeFT_(...args: any[]): any { fail('use mergeCoin for TBC20 Stablecoin'); }
  private _batchTransfer(...args: any[]): any { fail('use batchTransfer for TBC20 Stablecoin'); }
  private _batchTransfer_old(...args: any[]): any { fail('use batchTransfer for TBC20 Stablecoin'); }
  static getBalanceFromTape(tape: string): bigint {
    return TBC20StablecoinCodec.parseTape(tape).balance;
  }
  private MintFT(...args: any[]): any { fail('TBC20Stablecoin issuance requires createCoin or mintCoin'); }
  private getFTmintCode(...args: any[]): any { fail('TBC20Stablecoin issuance requires getCoinMintCode'); }
  private transferContract(...args: any[]): any { fail('use getUnlockScript with an explicit contractController witness for contract-held TBC20Stablecoin'); }
  private getFTunlock(...args: any[]): any { fail('use TBC20Stablecoin.getUnlockScript for the TBC20 Stablecoin ABI'); }
  private getFTunlockSwap(...args: any[]): any { fail('use TBC20Stablecoin.getUnlockScript with contractController'); }
  private static getFTunlock(...args: any[]): any { fail('use TBC20Stablecoin.getUnlockScriptWithSignature for TBC20 Stablecoin'); }
  private static getFTunlockSwap(...args: any[]): any { fail('use TBC20Stablecoin.getUnlockScriptWithSignature with contractController'); }
}

module.exports = TBC20Stablecoin;
