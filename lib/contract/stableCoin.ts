import * as tbc from 'tbc-lib-js';
import { CoinTBC20 } from './coinTbc20';
import { buildCoinTBC20UnlockScript, buildCoinTBC20UnlockScriptWithSignature } from '../util/coinTbc20unlock';
import type { CoinCodeDescriptor } from './coinTbc20';
import type { TBC20TransactionResolver, TBC20CurrentOutputGroup } from '../util/tbc20unlock';
import type { AdminPrepared, AdminSighash } from './stableCoinLegacy';
const Legacy = require('./stableCoinLegacy');

export type { AdminPrepared, AdminSighash } from './stableCoinLegacy';
/** New coins use authenticated ancestor transactions; legacy coins retain their hex proofs. */
export type CoinAncestors = TBC20TransactionResolver | readonly TBC20TransactionResolver[] | string[];
export interface CoinDefinition { name: string; symbol: string; amount: number | string; decimal: number }

const SIGHASH = 0x41;
const MAX_SLOT = (1n << 63n) - 1n;
const MAX_DER = Buffer.from('304502210080000000000000000000000000000000000000000000000000000000000000000220010000000000000000000000000000000000000000000000000000000000000041', 'hex');
const EMPTY_SCHNORR = Buffer.concat([Buffer.alloc(64), Buffer.from([SIGHASH])]);
const hash160 = (b: Buffer): Buffer => tbc.crypto.Hash.sha256ripemd160(b);
const sha = (b: Buffer): Buffer => tbc.crypto.Hash.sha256(b);
function fail(message: string): never { throw new Error(`stableCoin: ${message}`); }
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
function oldCode(code: string): boolean {
  return typeof code === 'string' && [2012, 2076].includes(code.length / 2) && code.endsWith('0532436f6465');
}
function oldTape(tape: tbc.Script): boolean { return tape.toHex().endsWith('054654617065'); }
function resolverFor(proofs: CoinAncestors, index: number, count: number): TBC20TransactionResolver {
  if (typeof proofs === 'function' || (proofs && !Array.isArray(proofs) && typeof (proofs as any).get === 'function'))
    return proofs as TBC20TransactionResolver;
  if (!Array.isArray(proofs)) return fail('ancestor transactions or a resolver are required');
  if (proofs.some(p => typeof p === 'string')) fail('Coin TBC20 requires ancestor transactions, not legacy FT proof strings');
  if ((proofs as unknown[]).every(p => p instanceof tbc.Transaction)) return proofs as unknown as tbc.Transaction[];
  if (proofs.length !== count) fail('per-input ancestor resolvers must match coin input count');
  return proofs[index] as unknown as TBC20TransactionResolver;
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
    ...(coin ? { ftBalance: CoinTBC20.parseTape(tx.outputs[vout + 1].script).balance } : {}) };
}
interface CoinInput { utxo: tbc.Transaction.IUnspentOutput; parent: tbc.Transaction; ancestors: TBC20TransactionResolver;
  descriptor: CoinCodeDescriptor; balance: bigint; tape: tbc.Script; lockTime: number }
interface Allocation { controller: Buffer; amounts: bigint[]; tape: tbc.Script; lockTime: number }

/** Creates Coin TBC20 by default and continues to spend initialized legacy stablecoins. */
class stableCoin extends Legacy {
  private initialAmount?: string;
  private creating = false;

  constructor(config: string | CoinDefinition) {
    super(typeof config === 'string' ? config : '0'.repeat(64));
    if (typeof config === 'string') return;
    if (!config || typeof config.name !== 'string' || typeof config.symbol !== 'string') fail('name and symbol are required');
    decimal(config.decimal);
    const raw = positive(config.amount, config.decimal);
    if (raw > MAX_SLOT) fail('initial supply exceeds the Coin Tape slot limit');
    this.name = config.name; this.symbol = config.symbol; this.decimal = config.decimal;
    this.initialAmount = String(config.amount); this.totalSupply = 0n; this.contractTxid = '';
  }

  initialize(info: { codeScript: string; tapeScript: string; totalSupply: bigint | string; decimal: number;
    name: string; symbol: string; contractTxid?: string }): void {
    if (this.creating) fail('finish the pending issuance before reinitializing');
    decimal(info.decimal);
    if (!oldCode(info.codeScript)) {
      const code = CoinTBC20.parseCode(info.codeScript);
      CoinTBC20.parseTape(info.tapeScript, code);
    }
    if (BigInt(info.totalSupply) < 0n) fail('totalSupply must be nonnegative atomic units');
    super.initialize({ ...info, totalSupply: BigInt(info.totalSupply) });
    if (info.contractTxid) this.contractTxid = info.contractTxid;
    this.initialAmount = undefined;
  }

  private isLegacy(): boolean { return oldCode(this.codeScript); }

  protected buildIssuanceScripts(adminHash: string, recipient: string, issuerHash: string, raw: bigint): { codeScript: tbc.Script; tapeScript: tbc.Script } {
    if (this.isLegacy()) return super.buildIssuanceScripts(adminHash, recipient, issuerHash, raw);
    if (raw <= 0n || raw > MAX_SLOT) fail('issuance amount exceeds the Coin Tape slot range');
    let tapeScript: tbc.Script;
    if (this.codeScript) {
      const previous = CoinTBC20.parseCode(this.codeScript);
      if (!previous.coinNftCodeHash.equals(Buffer.from(issuerHash, 'hex')) || !previous.adminPubKeyHash.equals(Buffer.from(adminHash, 'hex')))
        fail('issuance certificate or administrator differs from this coin');
      tapeScript = CoinTBC20.setLockTime(CoinTBC20.replaceTapeAmounts(this.tapeScript, [raw, 0n, 0n, 0n, 0n, 0n]), 0);
    } else {
      const metadata = new tbc.Script().add(Buffer.from([this.decimal])).add(Buffer.from(this.name, 'utf8')).add(Buffer.from(this.symbol, 'utf8')).toBuffer();
      tapeScript = CoinTBC20.buildTape({ amounts: [raw, 0n, 0n, 0n, 0n, 0n], tapeSize: 66 + metadata.length, lockTime: 0, metadata });
    }
    return { tapeScript, codeScript: stableCoin.getCoinMintCode(adminHash, recipient, issuerHash, tapeScript.toBuffer().length) };
  }

  createCoin(admin: Buffer, feeKey: tbc.PrivateKey, recipient: string, fee: tbc.Transaction.IUnspentOutput,
    funding: tbc.Transaction, message?: string): AdminPrepared<string[]> {
    if (!this.initialAmount || this.codeScript || this.creating) fail('createCoin requires a fresh coin definition');
    this.checkFee(fee, feeKey);
    this.checkParent(fee, funding);
    const raw = positive(this.initialAmount, this.decimal);
    const snapshot = this.issuanceState();
    try {
      this.totalSupply = this.initialAmount;
      const prepared: AdminPrepared<string[]> = super.createCoin(admin, feeKey, recipient, fee, funding, message);
      this.totalSupply = 0n; this.creating = true;
      return this.guardPrepared(prepared, admin, () => {
        this.totalSupply = raw; this.contractTxid = prepared.tx.id; this.creating = false; this.initialAmount = undefined;
      });
    } catch (error) { Object.assign(this, snapshot); this.creating = false; throw error; }
  }

  mintCoin(admin: Buffer, feeKey: tbc.PrivateKey, recipient: string, humanAmount: number | string,
    fee: tbc.Transaction.IUnspentOutput, parent: tbc.Transaction, grandparent: tbc.Transaction, message?: string): AdminPrepared<string> {
    if (this.isLegacy()) return super.mintCoin(admin, feeKey, recipient, humanAmount, fee, parent, grandparent, message);
    const code = CoinTBC20.parseCode(this.codeScript);
    if (!Buffer.isBuffer(admin) || admin.length !== 32 || !hash160(admin).equals(code.adminPubKeyHash)) fail('wrong administrator');
    if (!(parent instanceof tbc.Transaction) || !parent.outputs[0] || !sha(parent.outputs[0].script.toBuffer()).equals(code.coinNftCodeHash)) fail('wrong issuance certificate');
    this.checkFee(fee, feeKey);
    const data = JSON.parse(parent.outputs[2].script.chunks.at(-2)!.buf!.toString('utf8'));
    const previousSupply = BigInt(data.coinTotalSupply);
    if (previousSupply < 0n || data.coinDecimal !== this.decimal) fail('invalid issuance certificate metadata');
    const raw = positive(humanAmount, this.decimal);
    if (raw > MAX_SLOT) fail('mint amount exceeds the Coin Tape slot limit');
    if (this.creating) fail('finish the pending issuance first');
    const snapshot = this.issuanceState();
    try {
      this.totalSupply = previousSupply;
      const prepared: AdminPrepared<string> = super.mintCoin(admin, feeKey, recipient, humanAmount, fee, parent, grandparent, message);
      this.creating = true;
      return this.guardPrepared(prepared, admin, () => { this.totalSupply = previousSupply + raw; this.creating = false; });
    } catch (error) { Object.assign(this, snapshot); this.creating = false; throw error; }
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
  private inputs(utxos: tbc.Transaction.IUnspentOutput[], parents: tbc.Transaction[], proofs: CoinAncestors): CoinInput[] {
    if (!Array.isArray(utxos) || !utxos.length || !Array.isArray(parents) || parents.length !== utxos.length) fail('coin UTXOs and parents must have matching nonzero lengths');
    const identity = CoinTBC20.getCodeIdentity(this.codeScript);
    const seen = new Set<string>();
    return utxos.map((utxo, i) => {
      this.checkParent(utxo, parents[i]);
      const point = `${utxo.txId.toLowerCase()}:${utxo.outputIndex}`;
      if (seen.has(point)) fail('duplicate coin input'); seen.add(point);
      const descriptor = CoinTBC20.parseCode(utxo.script);
      if (!descriptor.identity.equals(identity)) fail('coin inputs must share this coin identity');
      const tape = parents[i].outputs[utxo.outputIndex + 1]?.script;
      if (!tape || utxo.satoshis !== 500 || parents[i].outputs[utxo.outputIndex + 1].satoshis !== 0) fail('Coin Code/Tape values must be 500/0 satoshis');
      const parsed = CoinTBC20.parseTape(tape, descriptor);
      if (parsed.balance <= 0n) fail('coin input balance must be positive');
      if (utxo.ftBalance !== undefined && BigInt(utxo.ftBalance) !== parsed.balance) fail('claimed ftBalance differs from authenticated Tape');
      return { utxo, parent: parents[i], ancestors: resolverFor(proofs, i, utxos.length), descriptor, tape,
        balance: parsed.balance, lockTime: parsed.lockTime };
    });
  }

  private build(inputs: CoinInput[], fee: tbc.Transaction.IUnspentOutput, feeKey: tbc.PrivateKey,
    allocations: Allocation[], signer: tbc.PrivateKey | Buffer, extra?: { recipient?: string; satoshis?: number; data?: Buffer }): tbc.Transaction {
    if (inputs.length < 1 || inputs.length > 5) fail('at most five Coin inputs plus one fee input are supported');
    this.checkFee(fee, feeKey);
    if (inputs.some(i => i.utxo.txId.toLowerCase() === fee.txId.toLowerCase() && i.utxo.outputIndex === fee.outputIndex)) fail('fee input duplicates a Coin input');
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
    const groups: TBC20CurrentOutputGroup[] = [];
    for (const allocation of allocations) {
      const codeVout = tx.outputs.length;
      tx.addOutput(new tbc.Transaction.Output({ satoshis: 500, script: CoinTBC20.replaceController(this.codeScript, allocation.controller) }));
      tx.addOutput(new tbc.Transaction.Output({ satoshis: 0, script: CoinTBC20.setLockTime(CoinTBC20.replaceTapeAmounts(allocation.tape, allocation.amounts), allocation.lockTime) }));
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
      tx.inputs[vin].setScript(buildCoinTBC20UnlockScriptWithSignature({ ...options(vin), signature: admin || useXOnly ? EMPTY_SCHNORR : MAX_DER,
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
      ? buildCoinTBC20UnlockScriptWithSignature({ ...options(vin), signature: EMPTY_SCHNORR, publicKey: signer as Buffer })
      : buildCoinTBC20UnlockScript({ ...options(vin), privateKey: signer as tbc.PrivateKey })));
    const feeSig = (tbc.Transaction as any).sighash.sign(tx, feeKey, SIGHASH, feeVin, tx.inputs[feeVin].output!.script, tx.inputs[feeVin].output!.satoshisBN).toTxFormat();
    tx.inputs[feeVin].setScript(new tbc.Script().add(feeSig).add(feeKey.publicKey.toBuffer()));
    return tx;
  }

  private distribute(inputs: CoinInput[], recipients: { controller: Buffer; amount: bigint }[]): Allocation[] {
    const remaining = inputs.map(input => input.balance);
    return recipients.map(recipient => {
      let wanted = recipient.amount;
      const slots = Array<bigint>(6).fill(0n);
      for (let vin = 0; vin < inputs.length; vin++) {
        const take = remaining[vin] < wanted ? remaining[vin] : wanted;
        slots[vin] = take; remaining[vin] -= take; wanted -= take;
      }
      if (wanted > 0n) fail('insufficient Coin balance');
      return { controller: recipient.controller, amounts: slots, tape: inputs[0].tape, lockTime: 0 };
    });
  }
  private send(key: tbc.PrivateKey, recipients: { address: string; amount: number | string }[], utxos: tbc.Transaction.IUnspentOutput[], fee: tbc.Transaction.IUnspentOutput,
    parents: tbc.Transaction[], proofs: CoinAncestors, extra?: { recipient?: string; satoshis?: number; data?: Buffer }): { tx: tbc.Transaction; changeVout?: number } {
    const inputs = this.inputs(utxos, parents, proofs);
    const targets = recipients.map(item => ({ controller: controller(item.address), amount: positive(item.amount, this.decimal) }));
    const total = inputs.reduce((sum, input) => sum + input.balance, 0n);
    const spent = targets.reduce((sum, output) => sum + output.amount, 0n);
    if (spent > total) fail('insufficient Coin balance');
    const changeVout = spent < total ? targets.length * 2 : undefined;
    if (spent < total) targets.push({ controller: controller(key.toAddress().toString()), amount: total - spent });
    return { tx: this.build(inputs, fee, key, this.distribute(inputs, targets), key, extra), changeVout };
  }

  transfer(key: tbc.PrivateKey, recipient: string, value: number | string, utxos: tbc.Transaction.IUnspentOutput[], fee: tbc.Transaction.IUnspentOutput,
    parents: tbc.Transaction[], proofs: CoinAncestors, tbcAmount?: number | string): string {
    if (this.isLegacy()) return super.transfer(key, recipient, value, utxos, fee, parents, proofs, tbcAmount);
    const raw = tbcAmount === undefined ? 0n : amount(tbcAmount, 6);
    if (raw > BigInt(Number.MAX_SAFE_INTEGER) || (raw > 0n && raw < 24n)) fail('additional TBC value is outside the supported range');
    return this.send(key, [{ address: recipient, amount: value }], utxos, fee, parents, proofs, { recipient, satoshis: Number(raw) }).tx.uncheckedSerialize();
  }

  transferWithAdditionalInfo(key: tbc.PrivateKey, recipient: string, value: number | string, utxos: tbc.Transaction.IUnspentOutput[], fee: tbc.Transaction.IUnspentOutput,
    parents: tbc.Transaction[], proofs: CoinAncestors, data: Buffer): string {
    if (this.isLegacy()) return super.transfer(key, recipient, value, utxos, fee, parents, proofs, undefined, data);
    if (!Buffer.isBuffer(data)) fail('additionalInfo must be a Buffer');
    return this.send(key, [{ address: recipient, amount: value }], utxos, fee, parents, proofs, { data }).tx.uncheckedSerialize();
  }

  batchTransfer(key: tbc.PrivateKey, recipients: { address: string; amount: number | string }[], utxos: tbc.Transaction.IUnspentOutput[], fee: tbc.Transaction.IUnspentOutput,
    parents: tbc.Transaction[], proofs: CoinAncestors): { txraw: string }[] {
    if (this.isLegacy()) return super.batchTransfer(key, recipients, utxos, fee, parents, proofs);
    if (!Array.isArray(recipients) || !recipients.length) fail('receivers must not be empty');
    const inputs = this.inputs(utxos, parents, proofs);
    const required = recipients.reduce((sum, item) => { controller(item.address); return sum + positive(item.amount, this.decimal); }, 0n);
    if (required > inputs.reduce((sum, item) => sum + item.balance, 0n)) fail('insufficient Coin balance for batch');
    const result: { txraw: string }[] = [];
    let currentUTXOs = utxos, currentParents = parents, currentProofs = proofs, currentFee = fee;
    for (let start = 0; start < recipients.length; start += 5) {
      const built = this.send(key, recipients.slice(start, start + 5), currentUTXOs, currentFee, currentParents, currentProofs);
      result.push({ txraw: built.tx.uncheckedSerialize() });
      if (start + 5 < recipients.length) {
        if (built.changeVout === undefined) fail('batch has no Coin change for the next transaction');
        currentProofs = currentParents;
        currentParents = [built.tx]; currentUTXOs = [utxoFrom(built.tx, built.changeVout, true)];
        currentFee = utxoFrom(built.tx, built.tx.outputs.length - 1);
      }
    }
    return result;
  }

  mergeCoin(key: tbc.PrivateKey, utxos: tbc.Transaction.IUnspentOutput[], fee: tbc.Transaction.IUnspentOutput,
    parents: tbc.Transaction[], proofs: CoinAncestors, localTX: tbc.Transaction[] = []): { txraw: string }[] {
    if (this.isLegacy()) return super.mergeCoin(key, utxos, fee, parents, proofs, localTX);
    const pending = this.inputs(utxos, parents, proofs);
    if (pending.length < 2) return [];
    const local = new Map<string, tbc.Transaction>([...localTX, ...parents].map(tx => [tx.id, tx]));
    const result: { txraw: string }[] = [];
    let currentFee = fee;
    while (pending.length > 1) {
      const group = pending.splice(0, 5);
      const raw = group.reduce((sum, input) => sum + input.balance, 0n);
      const allocations = this.distribute(group, [{ controller: controller(key.toAddress().toString()), amount: raw }]);
      const tx = this.build(group, currentFee, key, allocations, key);
      result.push({ txraw: tx.uncheckedSerialize() }); local.set(tx.id, tx);
      const coin = utxoFrom(tx, 0, true);
      pending.unshift({ utxo: coin, parent: tx, ancestors: local, descriptor: CoinTBC20.parseCode(coin.script),
        balance: raw, tape: tx.outputs[1].script, lockTime: 0 });
      currentFee = utxoFrom(tx, tx.outputs.length - 1);
    }
    return result;
  }

  freezeCoinUTXO(admin: Buffer, feeKey: tbc.PrivateKey, lockTime: number, utxos: tbc.Transaction.IUnspentOutput[], fee: tbc.Transaction.IUnspentOutput,
    parents: tbc.Transaction[], proofs: CoinAncestors): AdminPrepared<string> {
    if (this.isLegacy()) return super.freezeCoinUTXO(admin, feeKey, lockTime, utxos, fee, parents, proofs);
    return this.changeLocks(admin, feeKey, lockTime, utxos, fee, parents, proofs);
  }
  unfreezeCoinUTXO(admin: Buffer, feeKey: tbc.PrivateKey, utxos: tbc.Transaction.IUnspentOutput[], fee: tbc.Transaction.IUnspentOutput,
    parents: tbc.Transaction[], proofs: CoinAncestors): AdminPrepared<string> {
    if (this.isLegacy()) return super.unfreezeCoinUTXO(admin, feeKey, utxos, fee, parents, proofs);
    return this.changeLocks(admin, feeKey, 0, utxos, fee, parents, proofs);
  }
  private changeLocks(admin: Buffer, feeKey: tbc.PrivateKey, lockTime: number, utxos: tbc.Transaction.IUnspentOutput[], fee: tbc.Transaction.IUnspentOutput,
    parents: tbc.Transaction[], proofs: CoinAncestors): AdminPrepared<string> {
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
    const outputGroups: TBC20CurrentOutputGroup[] = [...groups.values()].map((_, i) => ({ codeVout: i * 2, tapeVout: i * 2 + 1 }));
    outputGroups.push({ codeVout: tx.outputs.length - 1 });
    const sighashes = inputs.map((_, inputIndex) => ({ inputIndex, sighash: sighash(tx, inputIndex) }));
    return this.guardPrepared({ tx, sighashes, finalize: signatures => {
      inputs.forEach((input, inputIndex) => tx.inputs[inputIndex].setScript(buildCoinTBC20UnlockScriptWithSignature({
        currentTx: tx, inputIndex, preTx: input.parent, preTxVout: input.utxo.outputIndex, ancestorTransactions: input.ancestors,
        outputGroups, publicKey: admin, signature: Buffer.concat([signatures[inputIndex], Buffer.from([SIGHASH])]) })));
      return tx.uncheckedSerialize();
    } }, admin);
  }

  static getCoinMintCode(adminHash: string, recipient: string, issuerHash: string, tapeSize: number): tbc.Script {
    if (!/^[0-9a-fA-F]{40}$/.test(adminHash) || !/^[0-9a-fA-F]{64}$/.test(issuerHash)) fail('invalid administrator or issuance code hash');
    return CoinTBC20.instantiateCode({ adminPubKeyHash: Buffer.from(adminHash, 'hex'), coinNftCodeHash: Buffer.from(issuerHash, 'hex'), tapeSize, controller: controller(recipient) });
  }
  static setLockTimeInTape(tape: tbc.Script, lockTime: number): tbc.Script {
    return oldTape(tape) ? Legacy.setLockTimeInTape(tape, lockTime) : CoinTBC20.setLockTime(tape, lockTime);
  }
  static getLockTimeFromTape(tape: tbc.Script): number { return oldTape(tape) ? Legacy.getLockTimeFromTape(tape) : CoinTBC20.parseTape(tape).lockTime; }
  static getAddressFromCode(code: string): { address: string; type: 'address' | 'contract' } {
    if (oldCode(code)) return Legacy.getAddressFromCode(code);
    const data = CoinTBC20.parseCode(code).controller;
    return { address: data.subarray(0, 20).toString('hex'), type: data[20] === 0 ? 'address' : 'contract' };
  }
  static buildFTtransferCode(code: string, address: string): tbc.Script {
    return oldCode(code) ? Legacy.buildFTtransferCode(code, address) : CoinTBC20.replaceController(code, controller(address));
  }
  static buildFTtransferTape(tape: string, amountHex: string): tbc.Script {
    if (oldTape(tbc.Script.fromHex(tape))) return Legacy.buildFTtransferTape(tape, amountHex);
    if (!/^[0-9a-fA-F]{96}$/.test(amountHex)) fail('amount data must contain six uint64 slots');
    const bytes = Buffer.from(amountHex, 'hex');
    return CoinTBC20.replaceTapeAmounts(tape, Array.from({ length: 6 }, (_, i) => bytes.readBigUInt64LE(i * 8)));
  }
  static buildUTXO(tx: tbc.Transaction, vout: number): tbc.Transaction.IUnspentOutput {
    const output = tx.outputs[vout]; if (!output) fail('Coin output index is out of range');
    const code = CoinTBC20.parseCode(output.script); CoinTBC20.parseTape(tx.outputs[vout + 1]?.script, code);
    if (output.satoshis !== 500 || tx.outputs[vout + 1].satoshis !== 0) fail('Coin Code/Tape values must be 500/0');
    return utxoFrom(tx, vout, true);
  }
  static getUnlockScript = buildCoinTBC20UnlockScript;
  static getUnlockScriptWithSignature = buildCoinTBC20UnlockScriptWithSignature;

  mergeFT(...args: any[]): { txraw: string }[] {
    return (this.mergeCoin as any)(...args);
  }
  batchTransfer_old(key: tbc.PrivateKey, receivers: Map<string, number | string>, ...args: any[]): { txraw: string }[] {
    return (this.batchTransfer as any)(key, [...receivers].map(([address, value]) => ({ address, amount: value })), ...args);
  }
  // Legacy batching internals remain available only to the legacy dispatcher.
  _mergeCoin(...args: any[]): any { if (this.isLegacy()) return super._mergeCoin(...args); fail('use mergeCoin for Coin TBC20'); }
  _mergeFT(...args: any[]): any { if (this.isLegacy()) return super._mergeFT(...args); fail('use mergeCoin for Coin TBC20'); }
  mergeFT_(...args: any[]): any { if (this.isLegacy()) return super.mergeFT_(...args); fail('use mergeCoin for Coin TBC20'); }
  _batchTransfer(...args: any[]): any { if (this.isLegacy()) return super._batchTransfer(...args); fail('use batchTransfer for Coin TBC20'); }
  _batchTransfer_old(...args: any[]): any { if (this.isLegacy()) return super._batchTransfer_old(...args); fail('use batchTransfer for Coin TBC20'); }
  static getBalanceFromTape(tape: string): bigint {
    return oldTape(tbc.Script.fromHex(tape)) ? Legacy.getBalanceFromTape(tape) : CoinTBC20.parseTape(tape).balance;
  }
  MintFT(...args: any[]): any { if (this.isLegacy()) return super.MintFT(...args); fail('Coin issuance requires createCoin or mintCoin'); }
  getFTmintCode(...args: any[]): any { if (this.isLegacy()) return super.getFTmintCode(...args); fail('Coin issuance requires getCoinMintCode'); }
  transferContract(...args: any[]): any { if (this.isLegacy()) return super.transferContract(...args); fail('use getUnlockScript with an explicit contractController witness for contract-held Coin'); }
  getFTunlock(...args: any[]): any { if (this.isLegacy()) return super.getFTunlock(...args); fail('use stableCoin.getUnlockScript for the Coin TBC20 ABI'); }
  getFTunlockSwap(...args: any[]): any { if (this.isLegacy()) return super.getFTunlockSwap(...args); fail('use stableCoin.getUnlockScript with contractController'); }
  static getFTunlock(...args: any[]): any { if (oldCode(args[2]?.inputs[args[5]]?.output?.script?.toHex() || '')) return Legacy.getFTunlock(...args); fail('use stableCoin.getUnlockScriptWithSignature for Coin TBC20'); }
  static getFTunlockSwap(...args: any[]): any { if (oldCode(args[2]?.inputs[args[6]]?.output?.script?.toHex() || '')) return Legacy.getFTunlockSwap(...args); fail('use stableCoin.getUnlockScriptWithSignature with contractController'); }
}

module.exports = stableCoin;
