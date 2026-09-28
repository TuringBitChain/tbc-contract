import * as tbc from 'tbc-lib-js';
import { TBC20LP } from '../contract/tbc20-lp';
import { parsePoolCode } from '../util/tbc-amm/artifacts';
import type { PoolAuthorization } from '../util/tbc-amm/authorization';
import { assertPoolFeeRecipient, resolveSwapFeePolicy } from '../util/tbc-amm/fees';
import { TBC_AMM_CODE_DUST } from '../util/tbc-amm/math';
import { decodePoolTape } from '../util/tbc-amm/tape';
import type { DecodedPoolTape } from '../util/tbc-amm/tape';
import type { TBCAMMPoolInput } from '../util/tbc-amm/types';
import {
  ContractQuery,
  apiHex,
  apiInteger,
  apiNumber,
  apiTxid,
  apiUtxo,
  fetchAncestorTransactions,
  selectTokenUtxos,
} from './contract-query';
import type { ContractTokenUtxo } from './contract-query';

/** Current TBC AMM state, decoded from the indexed transaction. */
export interface TBCAMMInfo {
  contractTxid: string;
  parentTx: tbc.Transaction;
  codeScript: string;
  tapeScript: string;
  poolCodeHash: Buffer;
  tape: DecodedPoolTape;
  authorization: PoolAuthorization;
  poolVersion: 3;
  serviceProvider: string;
  currentContractTxid: string;
  currentContractVout: 0;
  currentContractSatoshi: number;
}

export interface TBCAMMUtxo extends tbc.Transaction.IUnspentOutput {
  parentTx: tbc.Transaction;
  tapeScript: string;
}

export interface TBC20LPUtxo extends ContractTokenUtxo {
  parentTx: tbc.Transaction;
  tapeScript: string;
  timelocked: boolean;
  lockTime: number;
}

function equalInteger(value: unknown, expected: bigint, label: string): void {
  if (apiInteger(value, label) !== expected) {
    throw new Error(`API: ${label} does not match the transaction`);
  }
}

function equalHex(value: unknown, expected: string, label: string): void {
  if (apiHex(value, label) !== expected.toLowerCase()) {
    throw new Error(`API: ${label} does not match the transaction`);
  }
}

export async function fetchTbcAmmInfo(
  query: ContractQuery,
  contractTxid: string
): Promise<TBCAMMInfo> {
  const poolId = apiTxid(contractTxid, 'Pool contract txid');
  const data = await query.data(`pool/poolinfo/poolid/${poolId}`);
  const txid = apiTxid(data.txid, 'Pool current txid');
  if (apiNumber(data.vout, 'Pool vout') !== 0) {
    throw new Error('API: TBC AMM Code must be at vout 0');
  }
  const parentTx = await query.tx(txid);
  const codeOutput = parentTx.outputs[0];
  const tapeOutput = parentTx.outputs[1];
  if (!codeOutput || !tapeOutput || tapeOutput.satoshis !== 0) {
    throw new Error('API: TBC AMM requires a Code/Tape pair at vout 0/1');
  }
  const code = parsePoolCode(codeOutput.script);
  const tape = decodePoolTape(tapeOutput.script);
  const codeScript = codeOutput.script.toHex();
  const tapeScript = tapeOutput.script.toHex();
  equalHex(data.pool_code_script, codeScript, 'Pool Code');
  equalInteger(data.value, BigInt(codeOutput.satoshis), 'Pool output value');
  equalInteger(data.lp_balance, tape.ftLpAmount, 'Pool LP balance');
  equalInteger(data.token_balance, tape.ftAAmount, 'Pool token balance');
  equalInteger(data.tbc_balance, tape.tbcAmount, 'Pool TBC balance');
  equalHex(data.ft_lp_partial_hash, tape.ftLpPartialHash.toString('hex'), 'Pool LP partial hash');
  // The shared index reports legacy version/hash summaries for this route.
  // The canonical Code and Tape determine the Pool profile and FT identity.
  equalHex(data.ft_contract_id, tape.ftAContractId, 'Pool token contract id');
  equalInteger(data.service_fee_rate, BigInt(tape.serviceFeeRate), 'Pool service fee rate');
  if (BigInt(codeOutput.satoshis) < TBC_AMM_CODE_DUST) {
    throw new Error('API: TBC AMM Code is below its retained value');
  }
  const controlled = code.authorization.kind === 'controller';
  if (tape.withSwapHashLock !== controlled || tape.withLpHashLock !== controlled) {
    throw new Error('API: Pool authorization flags do not match its Code');
  }
  const lpCode = TBC20LP.instantiateCode({
    poolCodeHash: code.poolCodeHash,
    tapeSize: code.ftTapeSize,
    controller: Buffer.alloc(21),
    timelocked: tape.withLpLocktime,
  });
  if (
    !TBC20LP.getCodeIdentity(lpCode).subarray(0, 32).equals(tape.ftLpPartialHash) ||
    lpCode.toBuffer().length !== tape.ftLpCodeSize
  ) {
    throw new Error('API: Pool LP identity does not match its Code and Tape');
  }
  const feePolicy = resolveSwapFeePolicy(tape.lpPlan, tape.serviceFeeRate);
  const recipient = assertPoolFeeRecipient(code.tbcFeeScriptHash, feePolicy);
  return {
    contractTxid: poolId,
    parentTx,
    codeScript,
    tapeScript,
    poolCodeHash: code.poolCodeHash,
    tape,
    authorization: code.authorization,
    poolVersion: 3,
    serviceProvider: recipient.address,
    currentContractTxid: txid,
    currentContractVout: 0,
    currentContractSatoshi: codeOutput.satoshis,
  };
}

export async function fetchTbcAmmUtxo(
  query: ContractQuery,
  contractTxid: string
): Promise<TBCAMMUtxo> {
  const info = await fetchTbcAmmInfo(query, contractTxid);
  return {
    txId: info.currentContractTxid,
    outputIndex: 0,
    script: info.codeScript,
    satoshis: info.currentContractSatoshi,
    parentTx: info.parentTx,
    tapeScript: info.tapeScript,
  };
}

/** Includes the transaction consumed by the current Pool's first input. */
export async function fetchTbcAmmInput(
  query: ContractQuery,
  contractTxid: string
): Promise<TBCAMMPoolInput> {
  const { parentTx } = await fetchTbcAmmInfo(query, contractTxid);
  const input = parentTx.inputs[0];
  if (!input) throw new Error('API: Pool transaction has no ancestor input');
  const ancestorTx = await query.tx(input.prevTxId.toString('hex'));
  if (!ancestorTx.outputs[input.outputIndex]) {
    throw new Error('API: Pool ancestor output does not exist');
  }
  return { parentTx, ancestorTx };
}

/** Accepts the canonical field and the historical alias, rejecting conflicts. */
function aliasedInteger(record: any, field: string, alias: string): bigint {
  const value = apiInteger(record[field] ?? record[alias], field);
  if (record[field] !== undefined && record[alias] !== undefined) {
    if (apiInteger(record[alias], alias) !== value) {
      throw new Error(`API: conflicting ${field} and ${alias}`);
    }
  }
  return value;
}

export async function fetchTbc20LpUtxoList(
  query: ContractQuery,
  codeScript: string
): Promise<TBC20LPUtxo[]> {
  const script = apiHex(codeScript, 'TBC20 LP Code');
  const descriptor = TBC20LP.parseCode(script);
  const scriptHash = tbc.crypto.Hash.sha256(Buffer.from(script, 'hex')).reverse().toString('hex');
  const data = await query.data(`pool/lputxo/scriptpubkeyhash/${scriptHash}`);
  if (!Array.isArray(data.utxos)) throw new Error('API: LP UTXOs must be an array');
  const seen = new Set<string>();
  const utxos = data.utxos.map((record: any) => {
    const balance = aliasedInteger(record, 'lp_balance', 'ftBalance');
    const value = aliasedInteger(record, 'tbc_balance', 'value');
    const outputIndex = aliasedInteger(record, 'index', 'vout');
    const utxo = apiUtxo(
      { ...record, index: outputIndex, tbc_balance: value, lp_balance: balance },
      script,
      'tbc_balance',
      'lp_balance'
    );
    const outpoint = `${utxo.txId}:${utxo.outputIndex}`;
    if (seen.has(outpoint)) throw new Error('API: duplicate LP UTXO');
    seen.add(outpoint);
    return { utxo, record };
  });
  const result: TBC20LPUtxo[] = [];
  for (let start = 0; start < utxos.length; start += 8) {
    result.push(...await Promise.all(utxos.slice(start, start + 8).map(async (
      { utxo, record }: { utxo: ContractTokenUtxo; record: any }
    ): Promise<TBC20LPUtxo> => {
      const parentTx = await query.tx(utxo.txId);
      const codeOutput = parentTx.outputs[utxo.outputIndex];
      const tapeOutput = parentTx.outputs[utxo.outputIndex + 1];
      if (
        !codeOutput || !tapeOutput || tapeOutput.satoshis !== 0 ||
        codeOutput.satoshis !== TBC20LP.codeSatoshis ||
        codeOutput.satoshis !== utxo.satoshis || codeOutput.script.toHex() !== script
      ) {
        throw new Error('API: LP UTXO does not match its transaction Code/Tape pair');
      }
      const tape = TBC20LP.parseTape(tapeOutput.script, descriptor);
      if (tape.balance !== utxo.ftBalance) {
        throw new Error('API: indexed LP balance does not match its Tape');
      }
      if (record.lock_time !== undefined &&
        apiNumber(record.lock_time, 'LP lock_time', 0xffffffff) !== tape.lockTime) {
        throw new Error('API: indexed LP lock_time does not match its Tape');
      }
      return {
        ...utxo,
        parentTx,
        tapeScript: tapeOutput.script.toHex(),
        timelocked: tape.timelocked,
        lockTime: tape.lockTime,
      };
    })));
  }
  return result;
}

export async function getTbc20LpBalance(query: ContractQuery, codeScript: string): Promise<bigint> {
  const utxos = await fetchTbc20LpUtxoList(query, codeScript);
  return utxos.reduce((sum, utxo) => sum + utxo.ftBalance, 0n);
}

export async function fetchTbc20LpUtxo(
  query: ContractQuery,
  codeScript: string,
  amountRaw: bigint
): Promise<TBC20LPUtxo> {
  if (typeof amountRaw !== 'bigint' || amountRaw <= 0n) {
    throw new Error('API: LP amountRaw must be a positive bigint');
  }
  return (await fetchTbc20LpUtxos(query, codeScript, amountRaw, 1))[0];
}

/** Selects up to five LP inputs whose nonzero locks use the same time domain. */
export async function fetchTbc20LpUtxos(
  query: ContractQuery,
  codeScript: string,
  amountRaw?: bigint,
  maxInputs = 5
): Promise<TBC20LPUtxo[]> {
  if (!Number.isInteger(maxInputs) || maxInputs < 1 || maxInputs > 5) {
    throw new Error('API: TBC20 LP maxInputs must be an integer from 1 to 5');
  }
  if (amountRaw !== undefined && (typeof amountRaw !== 'bigint' || amountRaw <= 0n)) {
    throw new Error('API: LP amountRaw must be a positive bigint');
  }
  const utxos = await fetchTbc20LpUtxoList(query, codeScript);
  return selectTokenUtxos(utxos, amountRaw, maxInputs);
}

/** Resolves nonzero parent Tape slots, including the Pool used for LP issuance. */
export async function fetchTbc20LpAncestors(
  query: ContractQuery,
  parentTx: tbc.Transaction,
  codeVout: number
): Promise<tbc.Transaction[]> {
  if (!(parentTx instanceof tbc.Transaction)) {
    throw new Error('API: LP parentTx must be a Transaction');
  }
  const vout = apiNumber(codeVout, 'LP codeVout', 0xffffffff);
  const code = parentTx.outputs[vout];
  const tape = parentTx.outputs[vout + 1];
  if (!code || code.satoshis !== TBC20LP.codeSatoshis || !tape || tape.satoshis !== 0) {
    throw new Error('API: LP parent output must be a Code/Tape pair');
  }
  const parsed = TBC20LP.parseTape(tape.script, TBC20LP.parseCode(code.script));
  return fetchAncestorTransactions(query, parentTx, parsed.amounts);
}
