import * as tbc from 'tbc-lib-js';
import { TBC20 } from '../../contract/tbc20';
import { CoinTBC20 } from '../coin/coinTbc20Code';
import { buildCoinTBC20UnlockScriptWithSignature } from '../coin/coinTbc20unlock';
import {
  TBC20TransactionResolver, TBC20CurrentOutputGroup,
  buildTBC20UnlockScriptWithSignature, readTBC20TapeAmounts,
  replaceTBC20TapeAmounts,
} from '../tbc20/tbc20unlock';
import { getFTPartialOffset as legacyOffset, getFTVersion as legacyVersion,
  isCoinCodeScript as legacyCoin } from '../ft/ftscript';
const LegacyFT = require('../../contract/ft');
const API = require('../../api/api');

/** Legacy FT uses encoded proofs; TBC20 families require authenticated ancestor transactions. */
export type ContractTokenProof = string | TBC20TransactionResolver;
export type ContractTokenKind = 'legacy' | 'tbc20' | 'coinTbc20';
export const modernCodeOffsets = new Map([
  [TBC20.codeBytes, TBC20.partialOffset],
  [CoinTBC20.codeSize, CoinTBC20.partialOffset],
]);

export function tokenKind(code: string): ContractTokenKind {
  const bytes = Buffer.from(code, 'hex');
  if (bytes.subarray(-14).equals(Buffer.from('COINTBC20CODE2'))) {
    CoinTBC20.parseCode(code);
    return 'coinTbc20';
  }
  if (bytes.subarray(-10).equals(Buffer.from('TBC20CODE2'))) {
    TBC20.validateCode(code);
    return 'tbc20';
  }
  return 'legacy';
}

export function isCoinCodeScript(code: string): boolean {
  const kind = tokenKind(code);
  return kind === 'coinTbc20' || (kind === 'legacy' && legacyCoin(code));
}

export function getFTPartialOffset(code: string): number {
  return tokenKind(code) === 'legacy' ? legacyOffset(code) : modernCodeOffsets.get(code.length / 2)!;
}

// Only used by the legacy unlocker; modern unlockers read the complete template.
export function getFTVersion(code: string, isCoin?: boolean): 1 | 2 | 3 | 4 {
  return tokenKind(code) === 'legacy' ? legacyVersion(code, isCoin) : 4;
}

export function isTokenProof(proof: ContractTokenProof): boolean {
  return typeof proof === 'string' ? /^(?:[0-9a-fA-F]{2})+$/.test(proof)
    : Array.isArray(proof) || typeof proof === 'function' ||
      (proof !== null && typeof (proof as ReadonlyMap<string, tbc.Transaction>)?.get === 'function');
}

export async function fetchTokenProof(parent: tbc.Transaction, vout: number, network: string): Promise<ContractTokenProof> {
  if (tokenKind(parent.outputs[vout].script.toHex()) === 'legacy')
    return API.fetchFtPrePreTxData(parent, vout, network);
  const amounts = readTBC20TapeAmounts(parent.outputs[vout + 1].script);
  const ids = new Set<string>();
  amounts.forEach((amount, vin) => {
    if (amount === 0n) return;
    if (!parent.inputs[vin]) throw new Error('Token contract: Tape references a missing parent input');
    ids.add(parent.inputs[vin].prevTxId.toString('hex'));
  });
  return Promise.all([...ids].map(id => API.fetchTXraw(id, network)));
}

function outputGroups(tx: tbc.Transaction): TBC20CurrentOutputGroup[] {
  const groups: TBC20CurrentOutputGroup[] = [];
  for (let i = 0; i < tx.outputs.length; i++) {
    const next = tx.outputs[i + 1]?.script.toBuffer();
    const tape = next?.subarray(0, 3).equals(Buffer.from('006a30', 'hex')) &&
      (next.subarray(-9).equals(Buffer.from('TBC20TAPE')) || next.subarray(-5).equals(Buffer.from('FTape')));
    groups.push(tape ? { codeVout: i, tapeVout: ++i } : { codeVout: i });
  }
  return groups;
}

function attachParent(tx: tbc.Transaction, vin: number, parent: tbc.Transaction, vout: number): void {
  const input = tx.inputs[vin], output = parent.outputs[vout];
  if (!input || !output || input.prevTxId.toString('hex') !== parent.hash || input.outputIndex !== vout)
    throw new Error('Token contract: input does not spend the supplied parent output');
  if (input.output && (!input.output.script.equals(output.script) || input.output.satoshis !== output.satoshis))
    throw new Error('Token contract: previous-output metadata differs from parent');
  input.output = output;
}

function modernUnlock(signature: string, publicKey: string, tx: tbc.Transaction,
  parent: tbc.Transaction, proof: ContractTokenProof, vin: number, vout: number,
  contract?: tbc.Transaction, contractVin = 0): tbc.Script {
  if (typeof proof === 'string') throw new Error('Token contract: TBC20 requires ancestor transactions, not legacy proof hex');
  if (tx.inputs.length > 6) throw new Error('Token contract: TBC20 transactions must have at most six inputs to remain spendable');
  attachParent(tx, vin, parent, vout);
  if (contract) attachParent(tx, contractVin, contract, tx.inputs[contractVin].outputIndex);
  const build = tokenKind(parent.outputs[vout].script.toHex()) === 'coinTbc20'
    ? buildCoinTBC20UnlockScriptWithSignature : buildTBC20UnlockScriptWithSignature;
  return build({ currentTx: tx, inputIndex: vin, preTx: parent, preTxVout: vout,
    signature, publicKey, ancestorTransactions: proof, outputGroups: outputGroups(tx),
    contractController: contract ? { transaction: contract, currentInputIndex: contractVin } : undefined });
}

/** Shared contract-token dispatch, keeping the public legacy FT class unchanged. */
export class ContractToken extends LegacyFT {
  constructor(id: string) { super(id); }

  static buildFTtransferCode(code: string, destination: string): tbc.Script {
    const kind = tokenKind(code);
    if (kind === 'legacy') return LegacyFT.buildFTtransferCode(code, destination);
    const controller = /^[0-9a-fA-F]{40}$/.test(destination)
      ? Buffer.concat([Buffer.from(destination, 'hex'), Buffer.from([1])])
      : TBC20.addressController(destination);
    return kind === 'coinTbc20' ? CoinTBC20.replaceController(code, controller) : TBC20.replaceController(code, controller);
  }

  static buildFTtransferTape(tape: string, amounts: string): tbc.Script {
    if (!Buffer.from(tape, 'hex').subarray(-9).equals(Buffer.from('TBC20TAPE')))
      return LegacyFT.buildFTtransferTape(tape, amounts);
    if (!/^[0-9a-fA-F]{96}$/.test(amounts)) throw new Error('Token contract: amounts must contain six uint64 slots');
    const data = Buffer.from(amounts, 'hex');
    return replaceTBC20TapeAmounts(tape, Array.from({ length: 6 }, (_, i) => data.readBigUInt64LE(i * 8)));
  }

  static getFTunlock(sig: string, pub: string, tx: tbc.Transaction, parent: tbc.Transaction,
    proof: ContractTokenProof, vin: number, vout: number, isCoin?: boolean): tbc.Script {
    if (tokenKind(parent.outputs[vout].script.toHex()) === 'legacy') {
      if (typeof proof !== 'string') throw new Error('Token contract: legacy FT requires encoded proof hex');
      return LegacyFT.getFTunlock(sig, pub, tx, parent, proof, vin, vout, isCoin);
    }
    return modernUnlock(sig, pub, tx, parent, proof, vin, vout);
  }

  static getFTunlockSwap(sig: string, pub: string, tx: tbc.Transaction, parent: tbc.Transaction,
    proof: ContractTokenProof, contract: tbc.Transaction, vin: number, vout: number,
    version?: number, isCoin?: boolean, multipleContracts?: boolean): tbc.Script {
    if (tokenKind(parent.outputs[vout].script.toHex()) === 'legacy') {
      if (typeof proof !== 'string') throw new Error('Token contract: legacy FT requires encoded proof hex');
      return LegacyFT.getFTunlockSwap(sig, pub, tx, parent, proof, contract, vin, vout, version, isCoin, multipleContracts);
    }
    return modernUnlock(sig, pub, tx, parent, proof, vin, vout, contract, multipleContracts ? vin - 1 : 0);
  }

  getFTunlock(key: tbc.PrivateKey, tx: tbc.Transaction, parent: tbc.Transaction,
    proof: ContractTokenProof, vin: number, vout: number, isCoin?: boolean): tbc.Script {
    attachParent(tx, vin, parent, vout);
    return ContractToken.getFTunlock(tx.getSignature(vin, key) as string, key.publicKey.toString(), tx, parent, proof, vin, vout, isCoin);
  }

  getFTunlockSwap(key: tbc.PrivateKey, tx: tbc.Transaction, parent: tbc.Transaction,
    proof: ContractTokenProof, contract: tbc.Transaction, vin: number, vout: number,
    version?: number, isCoin?: boolean, multipleContracts?: boolean): tbc.Script {
    attachParent(tx, vin, parent, vout);
    return ContractToken.getFTunlockSwap(tx.getSignature(vin, key) as string, key.publicKey.toString(), tx, parent, proof, contract, vin, vout, version, isCoin, multipleContracts);
  }
}
