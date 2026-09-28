import * as tbc from 'tbc-lib-js';
import { TBC20Standard } from '../contract/tbc20-standard';
import { TBC20StablecoinCodec } from '../util/tbc20-stablecoin/tbc20-stablecoin-codec';
import {
  ContractQuery, ContractTokenUtxo, apiController, apiHex, apiInteger, apiNumber,
  apiString, apiTxid, apiUtxo, fetchAncestorTransactions, selectTokenUtxos,
} from './contract-query';

interface TokenInfo {
  contractTxid: string;
  codeScript: string;
  tapeScript: string;
  totalSupply: bigint;
  decimal: number;
  name: string;
  symbol: string;
}

export interface TBC20StandardInfo extends TokenInfo {
  /** Exact display amount corresponding to totalSupply. */
  supply: string;
}

export interface TBC20StablecoinInfo extends TokenInfo {
  /** Transaction containing the current issuance certificate. */
  issuanceTxid: string;
}

export interface TBC20StandardUtxo extends ContractTokenUtxo {
  parentTx: tbc.Transaction;
  tapeScript: string;
}

export interface TBC20StablecoinUtxo extends TBC20StandardUtxo {
  /** Read from the parent Tape, including when the index omits lock_time. */
  lockTime: number;
}

type Family = 'standard' | 'stablecoin';
const route = (family: Family) => family === 'standard'
  ? { prefix: 'ft', id: 'contract' } : { prefix: 'stablecoin', id: 'stablecoinid' };

function tokenTape(family: Family, code: string, tape: string) {
  if (family === 'standard') {
    const parsed = TBC20Standard.parseTape(tape);
    TBC20Standard.validateCode(code, parsed.size);
    return { ...parsed, lockTime: 0 };
  }
  return TBC20StablecoinCodec.parseTape(tape, TBC20StablecoinCodec.parseCode(code));
}

function tokenInfo(data: any, contractTxid: string, family: Family): TokenInfo {
  const codeScript = apiHex(data.code_script, 'code_script');
  const tapeScript = apiHex(data.tape_script, 'tape_script');
  tokenTape(family, codeScript, tapeScript);
  return {
    contractTxid,
    codeScript,
    tapeScript,
    totalSupply: apiInteger(family === 'standard' ? data.amount : data.supply, 'totalSupply'),
    decimal: apiNumber(data.decimal, 'decimal', 18),
    name: apiString(data.name, 'name'),
    symbol: apiString(data.symbol, 'symbol'),
  };
}

export async function fetchTbc20StandardInfo(query: ContractQuery, contractTxid: string): Promise<TBC20StandardInfo> {
  const id = apiTxid(contractTxid, 'contractTxid');
  const info = tokenInfo(await query.data(`ft/info/contract/${id}`), id, 'standard');
  return { ...info, supply: TBC20Standard.rawToHuman(info.totalSupply, info.decimal) };
}

export async function fetchTbc20StablecoinInfo(query: ContractQuery, contractTxid: string): Promise<TBC20StablecoinInfo> {
  const id = apiTxid(contractTxid, 'contractTxid');
  const data = await query.data(`stablecoin/info/stablecoinid/${id}`);
  return { ...tokenInfo(data, id, 'stablecoin'), issuanceTxid: apiTxid(data.utxo?.txid, 'issuance txid') };
}

export async function getTokenBalance(
  query: ContractQuery, family: Family, contractTxid: string, addressOrHash: string,
): Promise<bigint> {
  const id = apiTxid(contractTxid, 'contractTxid');
  const controller = apiController(addressOrHash).toString('hex');
  const { prefix, id: idName } = route(family);
  const data = await query.data(`${prefix}/tokenbalance/combinescript/${controller}/${idName}/${id}`);
  return apiInteger(data.balance, 'balance');
}

export async function fetchTokenUtxoList(
  query: ContractQuery, family: 'standard', contractTxid: string, addressOrHash: string, codeScript: string,
): Promise<TBC20StandardUtxo[]>;
export async function fetchTokenUtxoList(
  query: ContractQuery, family: 'stablecoin', contractTxid: string, addressOrHash: string, codeScript: string,
): Promise<TBC20StablecoinUtxo[]>;
export async function fetchTokenUtxoList(
  query: ContractQuery, family: Family, contractTxid: string, addressOrHash: string, codeScript: string,
): Promise<TBC20StandardUtxo[] | TBC20StablecoinUtxo[]> {
  const id = apiTxid(contractTxid, 'contractTxid');
  const controller = apiController(addressOrHash);
  const sourceCode = apiHex(codeScript, 'codeScript');
  const expectedCode = family === 'standard'
    ? TBC20Standard.replaceController(sourceCode, controller).toHex()
    : TBC20StablecoinCodec.replaceController(sourceCode, controller).toHex();
  const { prefix, id: idName } = route(family);
  const data = await query.data(`${prefix}/utxo/combinescript/${controller.toString('hex')}/${idName}/${id}`);
  if (!Array.isArray(data.utxos)) throw new Error('Contract API: missing token UTXO array');
  const seen = new Set<string>();
  const indexed: { utxo: ContractTokenUtxo; record: any }[] = data.utxos.map((record: any) => {
    const utxo = apiUtxo(record, expectedCode);
    const point = `${utxo.txId}:${utxo.outputIndex}`;
    if (seen.has(point)) throw new Error('Contract API: duplicate token outpoint');
    seen.add(point);
    if (utxo.satoshis !== 500) throw new Error('Contract API: token Code must contain 500 satoshis');
    return { utxo, record };
  });
  const result: TBC20StandardUtxo[] = [];
  // Bound raw-transaction requests while retaining index order.
  for (let start = 0; start < indexed.length; start += 8) {
    result.push(...await Promise.all(indexed.slice(start, start + 8).map(async ({ utxo, record }) => {
      const parentTx = await query.tx(utxo.txId);
      const code = parentTx.outputs[utxo.outputIndex];
      const tape = parentTx.outputs[utxo.outputIndex + 1];
      if (!code || code.satoshis !== 500 || code.script.toHex() !== expectedCode || !tape || tape.satoshis !== 0) {
        throw new Error('Contract API: indexed token output does not match its parent Code/Tape');
      }
      const tapeScript = tape.script.toHex();
      const parsed = tokenTape(family, expectedCode, tapeScript);
      if (parsed.balance !== utxo.ftBalance) throw new Error('Contract API: indexed token balance differs from its Tape');
      if (family === 'stablecoin' && record.lock_time !== undefined &&
          apiNumber(record.lock_time, 'lock_time', 0xffffffff) !== parsed.lockTime) {
        throw new Error('Contract API: indexed lock_time differs from its Tape');
      }
      return { ...utxo, parentTx, tapeScript, ...(family === 'stablecoin' ? { lockTime: parsed.lockTime } : {}) };
    })));
  }
  return result;
}

export async function fetchTokenUtxos(
  query: ContractQuery, family: 'standard', contractTxid: string, addressOrHash: string,
  amountRaw: bigint | undefined, codeScript: string, maxInputs: number,
): Promise<TBC20StandardUtxo[]>;
export async function fetchTokenUtxos(
  query: ContractQuery, family: 'stablecoin', contractTxid: string, addressOrHash: string,
  amountRaw: bigint | undefined, codeScript: string, maxInputs: number,
): Promise<TBC20StablecoinUtxo[]>;
export async function fetchTokenUtxos(
  query: ContractQuery, family: Family, contractTxid: string, addressOrHash: string,
  amountRaw: bigint | undefined, codeScript: string, maxInputs: number,
): Promise<TBC20StandardUtxo[]> {
  const list = family === 'standard'
    ? await fetchTokenUtxoList(query, family, contractTxid, addressOrHash, codeScript)
    : await fetchTokenUtxoList(query, family, contractTxid, addressOrHash, codeScript);
  return selectTokenUtxos(list, amountRaw, maxInputs);
}

export async function fetchTokenAncestors(
  query: ContractQuery, family: Family, parentTx: tbc.Transaction, codeVout: number,
): Promise<tbc.Transaction[]> {
  if (!(parentTx instanceof tbc.Transaction)) throw new Error('Contract API: parentTx must be a Transaction');
  const vout = apiNumber(codeVout, 'codeVout', 0xffffffff);
  const code = parentTx.outputs[vout];
  const tape = parentTx.outputs[vout + 1];
  if (!code || code.satoshis !== 500 || !tape || tape.satoshis !== 0) {
    throw new Error('Contract API: parent output must be a token Code/Tape pair');
  }
  const parsed = tokenTape(family, code.script.toHex(), tape.script.toHex());
  return fetchAncestorTransactions(query, parentTx, parsed.amounts);
}
