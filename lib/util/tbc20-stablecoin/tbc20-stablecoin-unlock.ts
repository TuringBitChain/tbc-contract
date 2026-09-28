import * as tbc from 'tbc-lib-js';
import { TBC20StablecoinCodec } from './tbc20-stablecoin-codec';
import {
  encodeTbc20StandardUnsignedLe,
  getTbc20StandardContractTxData,
  getTbc20StandardCurrentInputsData,
  getTbc20StandardCurrentOutputData,
  getTbc20StandardPrePreTxArray,
  getTbc20StandardPreTxData,
  readTbc20StandardTapeAmounts,
} from '../tbc20-standard/tbc20-standard-unlock';
import type { TBC20StablecoinCodeDescriptor } from './tbc20-stablecoin-codec';
import type {
  TBC20StandardContractTxData,
  TBC20StandardOutputData,
  TBC20StandardOutputGroupData,
  TBC20StandardPrePreTxData,
  TBC20StandardPreTxData,
  TBC20StandardTransactionResolver,
  TBC20StandardUnlockWithPrivateKeyOptions,
  TBC20StandardUnlockWithSignatureOptions,
} from '../tbc20-standard/tbc20-standard-unlock';

export type TBC20StablecoinUnlockWithSignatureOptions = TBC20StandardUnlockWithSignatureOptions;
export type TBC20StablecoinUnlockWithPrivateKeyOptions = TBC20StandardUnlockWithPrivateKeyOptions;

function fail(message: string): never {
  throw new Error(`TBC20 Stablecoin unlock: ${message}`);
}

function bytes(value: Buffer | string, name: string): Buffer {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (typeof value !== 'string' || value.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(value)) {
    fail(`${name} must be a Buffer or hexadecimal string`);
  }
  return Buffer.from(value, 'hex');
}

function index(value: number, length: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value >= length) fail(`${name} is out of range`);
}

function assertLinked(
  tx: tbc.Transaction,
  vin: number,
  parent: tbc.Transaction,
  vout: number
): void {
  if (!(tx instanceof tbc.Transaction) || !(parent instanceof tbc.Transaction))
    fail('current and parent transactions are required');
  index(vin, tx.inputs.length, 'inputIndex');
  index(vout, parent.outputs.length, 'preTxVout');
  const input = tx.inputs[vin];
  const output = parent.outputs[vout];
  if (
    input.prevTxId.toString('hex').toLowerCase() !== parent.hash.toLowerCase() ||
    input.outputIndex !== vout
  ) {
    fail('current input does not spend the specified parent output');
  }
  if (
    !input.output ||
    !input.output.script.equals(output.script) ||
    input.output.satoshis !== output.satoshis
  ) {
    fail('current input previous-output metadata does not match its authenticated parent');
  }
}

function lookup(resolver: TBC20StandardTransactionResolver, txid: string): tbc.Transaction | undefined {
  if (typeof resolver === 'function') return resolver(txid);
  if (Array.isArray(resolver)) return resolver.find((tx) => tx.hash.toLowerCase() === txid);
  if (resolver && typeof (resolver as ReadonlyMap<string, tbc.Transaction>).get === 'function') {
    return (resolver as ReadonlyMap<string, tbc.Transaction>).get(txid);
  }
  return fail('ancestorTransactions must be a resolver, array or map');
}

function ancestors(
  options: TBC20StablecoinUnlockWithSignatureOptions,
  descriptor: TBC20StablecoinCodeDescriptor,
  amounts: readonly bigint[]
): TBC20StandardPrePreTxData[] {
  // Resolve each TXID once. The same immutable view supplies prechecks and ABI proofs.
  const resolved = new Map<string, tbc.Transaction>();
  for (let slot = 0; slot < 6; slot += 1) {
    if (amounts[slot] === 0n) continue;
    index(slot, options.preTx.inputs.length, 'nonzero parent Tape slot');
    const source = options.preTx.inputs[slot];
    const txid = source.prevTxId.toString('hex').toLowerCase();
    let parent = resolved.get(txid);
    if (!parent) {
      parent = lookup(options.ancestorTransactions, txid);
      if (!(parent instanceof tbc.Transaction) || parent.hash.toLowerCase() !== txid) {
        fail(`missing or mismatched TBC20Stablecoin ancestor ${txid}`);
      }
      resolved.set(txid, parent);
    }
    index(source.outputIndex, parent.outputs.length, 'TBC20Stablecoin ancestor vout');
    const code = parent.outputs[source.outputIndex].script;
    let sameIdentity = false;
    try {
      sameIdentity = TBC20StablecoinCodec.getCodeIdentity(code).equals(descriptor.identity);
    } catch {
      /* TBC20Stablecoin certificate issuance is checked separately. */
    }
    if (
      !sameIdentity &&
      !(
        slot === 0 &&
        source.outputIndex === 0 &&
        tbc.crypto.Hash.sha256(code.toBuffer()).equals(descriptor.coinNftCodeHash)
      )
    ) {
      fail(
        `parent Tape slot ${slot} is neither the same TBC20Stablecoin identity nor its authorized TBC20Stablecoin certificate issuance source`
      );
    }
  }
  return getTbc20StandardPrePreTxArray(options.preTx, options.preTxVout, resolved);
}

function controllerProof(
  options: TBC20StablecoinUnlockWithSignatureOptions,
  descriptor: TBC20StablecoinCodeDescriptor,
  publicKey: Buffer
): { data: TBC20StandardContractTxData; vin: number } {
  const expected = descriptor.controller.subarray(0, 20);
  const publicKeyHash = tbc.crypto.Hash.sha256ripemd160(publicKey);
  const administrator = publicKeyHash.equals(descriptor.adminPubKeyHash);
  if (administrator || descriptor.controller[20] === 0) {
    if (options.contractController) fail('contractController must be omitted for administrator or address-held TBC20Stablecoin');
    if (!administrator && !publicKeyHash.equals(expected))
      fail('publicKey does not belong to the TBC20Stablecoin owner');
    return {
      vin: 0,
      data: {
        vlio: Buffer.alloc(0),
        txInputsHashData: Buffer.alloc(0),
        outputsFirstPart: Buffer.alloc(0),
        outputsMiddlePart: { value: Buffer.alloc(0), lockingScript: Buffer.alloc(0) },
        outputsLastPart: Buffer.alloc(0),
      },
    };
  }
  const witness = options.contractController;
  if (!witness) fail('contract-held TBC20Stablecoin requires an explicit controlling-contract witness');
  index(witness.currentInputIndex, options.currentTx.inputs.length, 'contract currentInputIndex');
  if (witness.currentInputIndex === options.inputIndex)
    fail('a TBC20Stablecoin input cannot be its own controlling-contract input');
  const controllingInput = options.currentTx.inputs[witness.currentInputIndex];
  assertLinked(
    options.currentTx,
    witness.currentInputIndex,
    witness.transaction,
    controllingInput.outputIndex
  );
  const hash = tbc.crypto.Hash.sha256(
    witness.transaction.outputs[controllingInput.outputIndex].script.toBuffer()
  );
  if (!tbc.crypto.Hash.sha256ripemd160(hash).equals(expected))
    fail('controlling-contract hash does not match TBC20Stablecoin Controller');
  return {
    vin: witness.currentInputIndex,
    data: getTbc20StandardContractTxData(witness.transaction, controllingInput.outputIndex),
  };
}

function verifyOutputAllocations(
  options: TBC20StablecoinUnlockWithSignatureOptions,
  descriptor: TBC20StablecoinCodeDescriptor,
  inputBalance: bigint
): TBC20StandardOutputGroupData[] {
  const groups = getTbc20StandardCurrentOutputData(options.currentTx, options.outputGroups);
  let allocated = 0n;
  for (const group of options.outputGroups) {
    const code = options.currentTx.outputs[group.codeVout];
    const codeBytes = code.script.toBuffer();
    if (
      codeBytes.length === descriptor.tapeSize &&
      codeBytes.subarray(-9).equals(Buffer.from('TBC20TAPE'))
    ) {
      fail('an FT/TBC20Stablecoin Tape cannot be hidden in a Code output field');
    }
    if (group.tapeVout === undefined) continue;
    const tape = options.currentTx.outputs[group.tapeVout];
    if (tape.script.toBuffer().length !== descriptor.tapeSize) continue;
    const amount = readTbc20StandardTapeAmounts(tape.script)[options.inputIndex];
    allocated += amount;
    if (amount === 0n) continue;
    const recipient = TBC20StablecoinCodec.validateCode(code.script, {
      coinNftCodeHash: descriptor.coinNftCodeHash,
      tapeSize: descriptor.tapeSize,
      adminPubKeyHash: descriptor.adminPubKeyHash,
    });
    if (!recipient.identity.equals(descriptor.identity))
      fail('TBC20Stablecoin output changes its source identity');
    TBC20StablecoinCodec.parseTape(tape.script, recipient);
    if (code.satoshis !== 500 || tape.satoshis !== 0)
      fail('TBC20Stablecoin output Code/Tape values must be 500/0 satoshis');
  }
  if (allocated !== inputBalance)
    fail("TBC20Stablecoin output amounts do not conserve this input's absolute vin slot");
  return groups;
}

function push(script: tbc.Script, value: Buffer): void {
  if (value.length === 1 && value[0] >= 1 && value[0] <= 16)
    script.add(tbc.Opcode.smallInt(value[0]));
  else if (value.length === 1 && value[0] === 0x81) script.add(tbc.Opcode.OP_1NEGATE);
  else script.add(value);
}

function pushOutput(script: tbc.Script, data: TBC20StandardOutputData): void {
  push(script, data.value);
  push(script, data.lockingScript.suffixData);
  push(script, data.lockingScript.partialHash);
  push(script, data.lockingScript.size);
}

function pushGroup(script: tbc.Script, data: TBC20StandardOutputGroupData): void {
  pushOutput(script, data.code);
  push(script, data.tape.value);
  push(script, data.tape.lockingScript);
}

function pushAncestor(script: tbc.Script, data: TBC20StandardPrePreTxData): void {
  push(script, data.vlio);
  push(script, data.txInputsHashData);
  push(script, data.outputsFirstPart);
  pushOutput(script, data.outputsVerifiedData);
  push(script, data.outputsLastPart);
}

function pushParent(script: tbc.Script, data: TBC20StandardPreTxData): void {
  push(script, data.vlio);
  data.inputs.forEach((input) => push(script, input));
  push(script, data.unlockingScriptHash);
  push(script, data.outputsFirstPart);
  pushGroup(script, data.outputsGotData);
  push(script, data.outputsLastPart);
}

/** Build the frozen 123-field TBC20Stablecoin ABI; does not sign, fetch, broadcast or mutate the transaction. */
export function buildTbc20StablecoinUnlockScriptWithSignature(
  options: TBC20StablecoinUnlockWithSignatureOptions
): tbc.Script {
  if (!options || typeof options !== 'object') fail('unlock options are required');
  assertLinked(options.currentTx, options.inputIndex, options.preTx, options.preTxVout);
  if (options.currentTx.inputs.length > 6 || options.inputIndex >= 6)
    fail('TBC20Stablecoin transactions support at most six total inputs');
  const descriptor = TBC20StablecoinCodec.parseCode(options.preTx.outputs[options.preTxVout].script);
  const preData = getTbc20StandardPreTxData(options.preTx, options.preTxVout);
  const tape = TBC20StablecoinCodec.parseTape(preData.outputsGotData.tape.lockingScript, descriptor);
  const signature = bytes(options.signature, 'signature');
  const publicKey =
    options.publicKey instanceof tbc.PublicKey
      ? options.publicKey.toBuffer()
      : bytes(options.publicKey, 'publicKey');
  if (signature.length === 65) {
    if (signature[64] !== 0x41 || publicKey.length !== 32)
      fail('Schnorr signature must be 65 bytes ending in 41 with a 32-byte x-only publicKey');
    tbc.PublicKey.fromXOnly(publicKey);
  } else {
    if (signature.length > 72 || !tbc.crypto.Signature.isTxDER(signature))
      fail('signature must be canonical DER of at most 72 bytes or a 65-byte Schnorr transaction signature');
    const decoded = tbc.crypto.Signature.fromTxFormat(signature) as unknown as {
      hasLowS(): boolean; hasDefinedHashtype(): boolean; nhashtype: number;
    };
    if (!decoded.hasLowS() || !decoded.hasDefinedHashtype() || decoded.nhashtype !== 0x41)
      fail('DER signature must be low-S and use SIGHASH_ALL | SIGHASH_FORKID (0x41)');
    if (publicKey.length !== 33) fail('DER signature requires a compressed 33-byte publicKey');
    tbc.PublicKey.fromBuffer(publicKey);
  }
  const administrator = tbc.crypto.Hash.sha256ripemd160(publicKey).equals(descriptor.adminPubKeyHash);
  TBC20StablecoinCodec.verifyInputLock(options.currentTx, options.inputIndex,
    preData.outputsGotData.tape.lockingScript, descriptor, administrator);
  const contract = controllerProof(options, descriptor, publicKey);
  const outputs = verifyOutputAllocations(options, descriptor, tape.balance);
  const inputs = getTbc20StandardCurrentInputsData(options.currentTx);
  const preceding = ancestors(options, descriptor, tape.amounts);

  const result = new tbc.Script();
  outputs.forEach((output) => pushGroup(result, output));
  push(result, inputs);
  push(result, encodeTbc20StandardUnsignedLe(options.inputIndex));
  preceding.forEach((ancestor) => pushAncestor(result, ancestor));
  push(result, signature);
  push(result, publicKey);
  push(result, contract.data.vlio);
  push(result, contract.data.txInputsHashData);
  push(result, contract.data.outputsFirstPart);
  push(result, contract.data.outputsMiddlePart.value);
  push(result, contract.data.outputsMiddlePart.lockingScript);
  push(result, contract.data.outputsLastPart);
  push(result, encodeTbc20StandardUnsignedLe(contract.vin));
  pushParent(result, preData);
  if (result.chunks.length !== 123) fail('internal TBC20Stablecoin ABI error: expected exactly 123 pushes');
  return result;
}

export function buildTbc20StablecoinUnlockScript(options: TBC20StablecoinUnlockWithPrivateKeyOptions): tbc.Script {
  if (!options || !(options.privateKey instanceof tbc.PrivateKey))
    fail('privateKey must be a tbc.PrivateKey');
  assertLinked(options.currentTx, options.inputIndex, options.preTx, options.preTxVout);
  const descriptor = TBC20StablecoinCodec.parseCode(options.preTx.outputs[options.preTxVout].script);
  const signingPublicKey = options.privateKey.toPublicKey();
  const xOnly = signingPublicKey.toXOnly();
  const xOnlyHash = tbc.crypto.Hash.sha256ripemd160(xOnly);
  const compressedAdministrator = tbc.crypto.Hash.sha256ripemd160(signingPublicKey.toBuffer())
    .equals(descriptor.adminPubKeyHash);
  if (xOnlyHash.equals(descriptor.adminPubKeyHash) ||
      (!compressedAdministrator && descriptor.controller[20] === 0 &&
        xOnlyHash.equals(descriptor.controller.subarray(0, 20)))) {
    const previousOutput = options.currentTx.inputs[options.inputIndex].output!;
    const signature = tbc.Transaction.Sighash.signSchnorr(options.currentTx, options.privateKey,
      0x41, options.inputIndex, previousOutput.script, previousOutput.satoshisBN,
      tbc.Script.Interpreter.DEFAULT_FLAGS).toTxFormat();
    return buildTbc20StablecoinUnlockScriptWithSignature({ ...options, signature, publicKey: xOnly });
  }
  const signature = options.currentTx.getSignature(options.inputIndex, options.privateKey);
  if (typeof signature !== 'string') fail('privateKey did not produce one transaction signature');
  return buildTbc20StablecoinUnlockScriptWithSignature({
    ...options,
    signature,
    publicKey: signingPublicKey,
  });
}
