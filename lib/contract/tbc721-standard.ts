import * as tbc from 'tbc-lib-js';
import { buildTbc721StandardCode, buildTbc721StandardUnlockScript, parseTbc721StandardCode } from '../util/tbc721-standard/tbc721-standard-unlock';
import type { TBC721StandardCodeDescriptor } from '../util/tbc721-standard/tbc721-standard-unlock';
import { parseDecimalToBigInt } from '../util/common/util';

const NFT = require('./nft');

interface CollectionData { collectionName: string; description: string; supply: number; file: string }
interface NFTData { nftName: string; symbol: string; description: string; attributes: string; file?: string }

function checkFunding(utxos: tbc.Transaction.IUnspentOutput[], privateKey: tbc.PrivateKey,
  reserved: string[] = []): void {
  if (!(privateKey instanceof tbc.PrivateKey) || !Array.isArray(utxos))
    throw new Error('TBC721Standard: a private key and funding UTXO array are required');
  const script = tbc.Script.buildPublicKeyHashOut(privateKey.toAddress()).toHex();
  const seen = new Set(reserved.map(point => point.toLowerCase()));
  for (const utxo of utxos) {
    if (!utxo || !/^[0-9a-fA-F]{64}$/.test(utxo.txId) || !Number.isInteger(utxo.outputIndex) ||
        utxo.outputIndex < 0 || utxo.outputIndex > 0xffffffff || !Number.isSafeInteger(utxo.satoshis) ||
        utxo.satoshis <= 0 || typeof utxo.script !== 'string' || utxo.script.toLowerCase() !== script)
      throw new Error('TBC721Standard: funding UTXOs must be positive P2PKH outputs owned by the signing key');
    const point = `${utxo.txId.toLowerCase()}:${utxo.outputIndex}`;
    if (seen.has(point)) throw new Error('TBC721Standard: duplicate funding or NFT input');
    seen.add(point);
  }
}

function p2pkhUnlock(tx: tbc.Transaction, vin: number, privateKey: tbc.PrivateKey): tbc.Script {
  return new tbc.Script().add(signature(tx, vin, privateKey)).add(privateKey.toPublicKey().toBuffer());
}

function signature(tx: tbc.Transaction, vin: number, privateKey: tbc.PrivateKey): Buffer {
  const result = tx.getSignature(vin, privateKey);
  if (typeof result !== 'string') throw new Error('TBC721Standard: expected a single input signature');
  return Buffer.from(result, 'hex');
}

function finish(tx: tbc.Transaction, privateKey: tbc.PrivateKey): string {
  // Generic Code/Hold inputs already contain provisional callback witnesses;
  // reserve two extra bytes per input for DER length changes at final signing.
  tx.fee(Math.max(80, Math.ceil((tx.getEstimateSize() + tx.inputs.length * 2) * 80 / 1000)))
    .sign(privateKey).seal();
  const inputValue = tx.inputs.reduce((sum, input) => {
    if (!input.output) throw new Error('TBC721Standard: missing input previous-output metadata');
    return sum + input.output.satoshis;
  }, 0);
  const outputValue = tx.outputs.reduce((sum, output) => sum + output.satoshis, 0);
  if (inputValue - outputValue < Math.max(80, Math.ceil(tx.toBuffer().length * 80 / 1000)))
    throw new Error('TBC721Standard: insufficient funds for outputs and transaction fee');
  return tx.uncheckedSerialize();
}

/** TBC721 Standard collection, minting and transfer operations with Code/Hold/Tape outputs. */
class TBC721Standard extends NFT {
  constructor(contractId: string) { super(contractId); }

  get contractId(): string { return this.contract_id; }
  set contractId(value: string) { this.contract_id = value; }
  get collectionId(): string { return this.collection_id; }
  set collectionId(value: string) { this.collection_id = value; }
  get collectionIndex(): number { return this.collection_index; }
  set collectionIndex(value: number) { this.collection_index = value; }
  get collectionName(): string { return this.collection_name; }
  set collectionName(value: string) { this.collection_name = value; }
  get transferCount(): number { return this.transfer_count; }
  set transferCount(value: number) { this.transfer_count = value; }

  static decodeNftDataFromHex(hex: string): any {
    return NFT.decodeNFTDataFromHex(hex);
  }

  static encodeNftDataToHex(data: any): string {
    return NFT.encodeNFTDataToHex(data);
  }

  static buildCodeScript(txid: string, outputIndex: number): tbc.Script {
    return buildTbc721StandardCode(txid, outputIndex);
  }

  static getNftCode(txid: string, outputIndex: number): tbc.Script {
    return TBC721Standard.buildCodeScript(txid, outputIndex);
  }

  static parseCode(codeScript: string | tbc.Script): TBC721StandardCodeDescriptor {
    return parseTbc721StandardCode(codeScript);
  }

  static isTbc721StandardCode(codeScript: string | tbc.Script): boolean {
    try { TBC721Standard.parseCode(codeScript); return true; } catch { return false; }
  }

  static getNftVersion(codeScript: string | tbc.Script): 3 | -1 {
    return TBC721Standard.isTbc721StandardCode(codeScript) ? 3 : -1;
  }

  static buildUnlockScript(privateKey: tbc.PrivateKey, currentTx: tbc.Transaction,
    parentTx: tbc.Transaction, grandparentTx: tbc.Transaction, currentUnlockIndex?: number): tbc.Script;
  static buildUnlockScript(signature: Buffer, publicKey: Buffer, currentTx: tbc.Transaction,
    parentTx: tbc.Transaction, grandparentTx: tbc.Transaction, currentUnlockIndex?: number): tbc.Script;
  static buildUnlockScript(
    keyOrSignature: tbc.PrivateKey | Buffer,
    publicKeyOrTx: Buffer | tbc.Transaction,
    currentOrParentTx: tbc.Transaction,
    parentOrGrandparentTx: tbc.Transaction,
    grandparentOrIndex?: tbc.Transaction | number,
    currentUnlockIndex = 0,
  ): tbc.Script {
    if (Buffer.isBuffer(keyOrSignature)) {
      return buildTbc721StandardUnlockScript(keyOrSignature, publicKeyOrTx as Buffer, currentOrParentTx,
        parentOrGrandparentTx, grandparentOrIndex as tbc.Transaction, currentUnlockIndex);
    }
    const tx = publicKeyOrTx as tbc.Transaction;
    const index = typeof grandparentOrIndex === 'number' ? grandparentOrIndex : 0;
    return buildTbc721StandardUnlockScript(signature(tx, index, keyOrSignature),
      keyOrSignature.toPublicKey().toBuffer(), tx, currentOrParentTx, parentOrGrandparentTx, index);
  }

  static buildUnlockScriptSchnorr(schnorrSig64: Buffer, xOnlyPubkey32: Buffer,
    currentTx: tbc.Transaction, parentTx: tbc.Transaction, grandparentTx: tbc.Transaction,
    currentUnlockIndex = 0): tbc.Script {
    if (!Buffer.isBuffer(schnorrSig64) || schnorrSig64.length !== 64)
      throw new Error('TBC721Standard: Schnorr signature must contain 64 bytes');
    if (!Buffer.isBuffer(xOnlyPubkey32) || xOnlyPubkey32.length !== 32)
      throw new Error('TBC721Standard: x-only public key must contain 32 bytes');
    return buildTbc721StandardUnlockScript(Buffer.concat([schnorrSig64, Buffer.from([0x41])]),
      xOnlyPubkey32, currentTx, parentTx, grandparentTx, currentUnlockIndex);
  }

  static getHoldScriptFromHash(pubKeyHashHex: string, flag: string): tbc.Script {
    if (!/^[0-9a-fA-F]{40}$/.test(pubKeyHashHex)) throw new Error('TBC721Standard: Hold hash must contain 20 bytes');
    return new tbc.Script().add(tbc.Opcode.OP_DUP).add(tbc.Opcode.OP_HASH160)
      .add(Buffer.from(pubKeyHashHex, 'hex')).add(tbc.Opcode.OP_EQUALVERIFY).add(tbc.Opcode.OP_CHECKSIG)
      .add(tbc.Opcode.OP_RETURN).add(Buffer.from(`For Coin ${flag} NHold`, 'utf8'));
  }

  static createCollection(address: string, privateKey: tbc.PrivateKey, data: CollectionData,
    utxos: tbc.Transaction.IUnspentOutput[]): string {
    checkFunding(utxos, privateKey);
    if (!Number.isSafeInteger(data.supply) || data.supply <= 0)
      throw new Error('TBC721Standard: collection supply must be a positive safe integer');
    const tx = new tbc.Transaction().from(utxos);
    (tx as any).version = 10;
    tx.addOutput(new tbc.Transaction.Output({ script: TBC721Standard.buildTapeScript(data), satoshis: 0 }));
    for (let index = 0; index < data.supply; index++)
      tx.addOutput(new tbc.Transaction.Output({ script: TBC721Standard.buildMintScript(address), satoshis: 100 }));
    return finish(tx.change(address), privateKey);
  }

  static createNft(collectionId: string, address: string, privateKey: tbc.PrivateKey,
    data: NFTData, utxos: tbc.Transaction.IUnspentOutput[], nftUtxo: tbc.Transaction.IUnspentOutput): string {
    checkFunding(utxos, privateKey, [`${nftUtxo.txId}:${nftUtxo.outputIndex}`]);
    if (collectionId.toLowerCase() !== nftUtxo.txId.toLowerCase())
      throw new Error('TBC721Standard: mint slot must belong to the supplied collection');
    if (nftUtxo.satoshis !== 100 || nftUtxo.script.toLowerCase() !== TBC721Standard.buildMintScript(privateKey.toAddress().toString()).toHex())
      throw new Error('TBC721Standard: mint slot must be a 100-satoshi Mint NHold output owned by the signing key');
    const outputIndex = Buffer.alloc(4);
    outputIndex.writeUInt32LE(nftUtxo.outputIndex);
    const metadata = { ...data, file: data.file || collectionId + outputIndex.toString('hex') };
    const tx = new tbc.Transaction().from(nftUtxo).from(utxos);
    (tx as any).version = 10;
    tx.addOutput(new tbc.Transaction.Output({ script: TBC721Standard.buildCodeScript(nftUtxo.txId, nftUtxo.outputIndex), satoshis: 200 }))
      .addOutput(new tbc.Transaction.Output({ script: TBC721Standard.buildHoldScript(address), satoshis: 100 }))
      .addOutput(new tbc.Transaction.Output({ script: TBC721Standard.buildTapeScript(metadata), satoshis: 0 }))
      .change(address)
      .setInputScript({ inputIndex: 0, privateKey }, currentTx => p2pkhUnlock(currentTx, 0, privateKey));
    return finish(tx, privateKey);
  }

  static batchCreateNft(collectionId: string, address: string, privateKey: tbc.PrivateKey,
    metadataItems: NFTData[], utxos: tbc.Transaction.IUnspentOutput[],
    nftUtxos: tbc.Transaction.IUnspentOutput[]): Array<{ txraw: string }> {
    if (metadataItems.length !== nftUtxos.length) throw new Error('TBC721Standard: NFT metadata and mint slot counts must match');
    if (new Set(nftUtxos.map(slot => `${slot.txId.toLowerCase()}:${slot.outputIndex}`)).size !== nftUtxos.length)
      throw new Error('TBC721Standard: duplicate NFT mint slot');
    const results: Array<{ txraw: string }> = [];
    let funding = utxos;
    for (let index = 0; index < metadataItems.length; index++) {
      const txraw = TBC721Standard.createNft(collectionId, address, privateKey, metadataItems[index], funding, nftUtxos[index]);
      results.push({ txraw });
      if (index + 1 < metadataItems.length) {
        const tx = new tbc.Transaction(txraw);
        if (tx.outputs.length !== 4) throw new Error('TBC721Standard: insufficient change to continue batch minting');
        funding = [{ txId: tx.id, outputIndex: 3, script: tx.outputs[3].script.toHex(), satoshis: tx.outputs[3].satoshis }];
      }
    }
    return results;
  }

  private transfer(fromAddress: string, toAddress: string, privateKey: tbc.PrivateKey,
    utxos: tbc.Transaction.IUnspentOutput[], parentTx: tbc.Transaction, grandparentTx: tbc.Transaction,
    batch: boolean, payment?: { address: string; satoshis: number }): string {
    checkFunding(utxos, privateKey, [`${parentTx.id}:0`, `${parentTx.id}:1`]);
    TBC721Standard.parseCode(parentTx.outputs[0]?.script);
    if (parentTx.outputs.length < 3 || parentTx.outputs[0].satoshis !== 200 || parentTx.outputs[1].satoshis !== 100 ||
        parentTx.outputs[2].satoshis !== 0 || !parentTx.outputs[2].script.toHex().startsWith('006a') ||
        !parentTx.outputs[2].script.toHex().endsWith('054e54617065') ||
        !parentTx.outputs[1].script.equals(TBC721Standard.buildHoldScript(privateKey.toAddress().toString())))
      throw new Error('TBC721Standard: expected canonical Code/Hold/Tape outputs');
    const tx = new tbc.Transaction().addInputFromPrevTx(parentTx, 0).addInputFromPrevTx(parentTx, 1).from(utxos);
    (tx as any).version = 10;
    tx.addOutput(new tbc.Transaction.Output({ script: parentTx.outputs[0].script, satoshis: 200 }))
      .addOutput(new tbc.Transaction.Output({ script: TBC721Standard.buildHoldScript(toAddress), satoshis: 100 }))
      .addOutput(new tbc.Transaction.Output({ script: parentTx.outputs[2].script, satoshis: 0 }));
    if (payment) tx.addOutput(new tbc.Transaction.Output({
      script: tbc.Script.buildPublicKeyHashOut(payment.address), satoshis: payment.satoshis,
    }));
    if (!batch) tx.change(fromAddress);
    tx.setInputScript({ inputIndex: 0, privateKey }, currentTx =>
      TBC721Standard.buildUnlockScript(privateKey, currentTx, parentTx, grandparentTx))
      .setInputScript({ inputIndex: 1, privateKey }, currentTx => p2pkhUnlock(currentTx, 1, privateKey));
    return finish(tx, privateKey);
  }

  transferNft(fromAddress: string, toAddress: string, privateKey: tbc.PrivateKey,
    utxos: tbc.Transaction.IUnspentOutput[], parentTx: tbc.Transaction, grandparentTx: tbc.Transaction,
    batch = false): string {
    return this.transfer(fromAddress, toAddress, privateKey, utxos, parentTx, grandparentTx, batch);
  }

  transferNftWithTbc(fromAddress: string, nftRecipient: string, tbcRecipient: string,
    privateKey: tbc.PrivateKey, utxos: tbc.Transaction.IUnspentOutput[], parentTx: tbc.Transaction,
    grandparentTx: tbc.Transaction, tbcAmount: number | string): string {
    const text = String(tbcAmount);
    if (!/^\d+(\.\d+)?$/.test(text) || /[1-9]/.test((text.split('.')[1] || '').slice(6)))
      throw new Error('TBC721Standard: TBC payment must be a nonnegative decimal with at most six significant decimal places');
    const satoshis = Number(parseDecimalToBigInt(tbcAmount, 6));
    if (!Number.isSafeInteger(satoshis) || satoshis < 24)
      throw new Error('TBC721Standard: TBC payment must be at least 24 satoshis and within the safe integer range');
    return this.transfer(fromAddress, nftRecipient, privateKey, utxos, parentTx, grandparentTx,
      false, { address: tbcRecipient, satoshis });
  }

  // Shadow inherited entry points so dispatch always uses the Standard covenant.
  private static createNFT = TBC721Standard.createNft;
  private static batchCreateNFT = TBC721Standard.batchCreateNft;
  private static getNFTVersion = TBC721Standard.getNftVersion;
  private static decodeNFTDataFromHex = TBC721Standard.decodeNftDataFromHex;
  private static encodeNFTDataToHex = TBC721Standard.encodeNftDataToHex;
  private transferNFT(...args: Parameters<TBC721Standard['transferNft']>): string {
    return this.transferNft(...args);
  }
  private transferNFTWithTBC(...args: Parameters<TBC721Standard['transferNftWithTbc']>): string {
    return this.transferNftWithTbc(...args);
  }
  private static buildCodeScript_v0(): never { throw new Error('Use NFT for legacy version 0 scripts'); }
  private static buildCodeScript_v1(): never { throw new Error('Use NFT for legacy version 1 scripts'); }
  private transferNFT_v0(): never { throw new Error('Use NFT for legacy version 0 transfers'); }
  private transferNFT_v1(): never { throw new Error('Use NFT for legacy version 1 transfers'); }
  private transferNFTWithTBC_v1(): never { throw new Error('Use NFT for legacy version 1 transfers'); }
}

module.exports = TBC721Standard;
