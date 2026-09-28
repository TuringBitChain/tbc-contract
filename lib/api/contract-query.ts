import * as tbc from 'tbc-lib-js';

export interface ContractTokenUtxo extends tbc.Transaction.IUnspentOutput {
  ftBalance: bigint;
  lockTime?: number;
}

/** Keeps numeric tokens exact without touching numbers inside strings. */
function parseResponse(text: string): any {
  const exact = text.replace(/"(?:\\.|[^"\\])*"|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (token, number: string | undefined) => {
      if (number && !/^-?\d+$/.test(number)) {
        // Integer fields must reject fractional/exponent syntax before Number
        // can round it to an apparently valid integer (for example 1e-324).
        return `"${number}"`;
      }
      if (number) {
        const value = BigInt(number);
        if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
          return `"${number}"`;
        }
      }
      return token;
    });
  return JSON.parse(exact);
}

export function apiInteger(value: unknown, label: string): bigint {
  if ((typeof value === 'number' && !Number.isSafeInteger(value)) ||
      (typeof value !== 'bigint' && typeof value !== 'number' &&
        !(typeof value === 'string' && /^\d+$/.test(value)))) {
    throw new Error(`Contract API: ${label} must be an exact nonnegative integer`);
  }
  const result = BigInt(value as bigint | number | string);
  if (result < 0n) throw new Error(`Contract API: ${label} must be nonnegative`);
  return result;
}

export function apiNumber(value: unknown, label: string, maximum = Number.MAX_SAFE_INTEGER): number {
  const result = apiInteger(value, label);
  if (result > BigInt(maximum)) throw new Error(`Contract API: ${label} exceeds ${maximum}`);
  return Number(result);
}

export function apiString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`Contract API: ${label} must be a string`);
  return value;
}

export function apiTxid(value: unknown, label = 'txid'): string {
  if (typeof value !== 'string' || !/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`Contract API: invalid ${label}`);
  }
  return value.toLowerCase();
}

export function apiHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(?:[a-fA-F0-9]{2})+$/.test(value)) {
    throw new Error(`Contract API: invalid ${label}`);
  }
  return value.toLowerCase();
}

export function apiController(addressOrHash: string): Buffer {
  if (tbc.Address.isValid(addressOrHash)) {
    const address = tbc.Address.fromString(addressOrHash);
    if ((address as any).type !== (tbc.Address as any).PayToPublicKeyHash) {
      throw new Error('Contract API: address controller must be a P2PKH address');
    }
    return Buffer.concat([address.hashBuffer, Buffer.from([0])]);
  }
  if (typeof addressOrHash !== 'string' || !/^[a-fA-F0-9]{40}$/.test(addressOrHash)) {
    throw new Error('Contract API: invalid address or controller hash');
  }
  return Buffer.concat([Buffer.from(addressOrHash, 'hex'), Buffer.from([1])]);
}

export function apiScriptHash(script: string): string {
  return tbc.crypto.Hash.sha256(Buffer.from(apiHex(script, 'script'), 'hex')).reverse().toString('hex');
}

export function apiUtxo(
  record: any, script: string, valueField = 'tbc_value', balanceField = 'ft_value',
): ContractTokenUtxo {
  return {
    txId: apiTxid(record?.txid, 'UTXO txid'),
    outputIndex: apiNumber(record?.index, 'UTXO index', 0xffffffff),
    script,
    satoshis: apiNumber(record?.[valueField], `UTXO ${valueField}`),
    ftBalance: apiInteger(record?.[balanceField], `UTXO ${balanceField}`),
  };
}

/** A per-query cache prevents duplicate raw-transaction requests. */
export class ContractQuery {
  private readonly transactions = new Map<string, Promise<tbc.Transaction>>();
  constructor(private readonly baseUrl: string) {}

  async data(path: string): Promise<any> {
    const response = await fetch(this.baseUrl + path);
    let body: any;
    try { body = parseResponse(await response.text()); }
    catch { throw new Error(`Contract API HTTP ${response.status}: invalid JSON response`); }
    if (!response.ok || String(body?.code) !== '200' || body?.error) {
      const detail = [body?.error, body?.message].filter(value => typeof value === 'string' && value);
      const error = new Error(`Contract API HTTP ${response.status}, code ${body?.code ?? 'missing'}: ${detail.join(': ') || response.statusText}`);
      Object.assign(error, { code: body?.error || body?.code, status: response.status, requestId: body?.request_id });
      throw error;
    }
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
      throw new Error('Contract API: success response is missing a data object');
    }
    return body.data;
  }

  tx(txid: string): Promise<tbc.Transaction> {
    const id = apiTxid(txid);
    let pending = this.transactions.get(id);
    if (!pending) {
      pending = this.data(`txraw/txid/${id}`).then(data => {
        const tx = new tbc.Transaction(apiHex(data.txraw, 'transaction hex'));
        if (tx.id.toLowerCase() !== id) throw new Error('Contract API: returned transaction does not match the requested txid');
        return tx;
      });
      this.transactions.set(id, pending);
    }
    return pending;
  }
}

export async function fetchAncestorTransactions(
  query: ContractQuery, parentTx: tbc.Transaction, amounts: readonly bigint[],
): Promise<tbc.Transaction[]> {
  if (!(parentTx instanceof tbc.Transaction) || parentTx.inputs.length > 6) {
    throw new Error('Contract API: token parent transaction must have at most six inputs');
  }
  const ids = new Set<string>();
  amounts.forEach((amount, vin) => {
    if (amount === 0n) return;
    const input = parentTx.inputs[vin];
    if (!input) throw new Error('Contract API: Tape amount references a missing parent input');
    ids.add(input.prevTxId.toString('hex'));
  });
  return Promise.all([...ids].map(id => query.tx(id)));
}

/** Selects a bounded set without combining height locks and timestamp locks. */
export function selectTokenUtxos<T extends ContractTokenUtxo>(
  list: readonly T[], amountRaw: bigint | undefined, maxInputs: number,
): T[] {
  if (!Number.isSafeInteger(maxInputs) || maxInputs < 1 || maxInputs > 5) {
    throw new Error('Contract API: maxInputs must be an integer from 1 to 5');
  }
  if (amountRaw !== undefined && (typeof amountRaw !== 'bigint' || amountRaw <= 0n)) {
    throw new Error('Contract API: amountRaw must be a positive bigint in raw units');
  }
  const balance = (items: readonly T[]) => items.reduce((sum, item) => sum + item.ftBalance, 0n);
  const ordered = [...list].sort((a, b) => a.ftBalance === b.ftBalance ? 0 : a.ftBalance > b.ftBalance ? -1 : 1);
  const candidates = [false, true].map(timestamp => {
    const compatible = ordered.filter(item => !item.lockTime || (item.lockTime >= 500_000_000) === timestamp);
    const selected: T[] = [];
    for (const item of compatible) {
      if (selected.length === maxInputs) break;
      selected.push(item);
      if (amountRaw !== undefined && balance(selected) >= amountRaw) break;
    }
    return selected;
  });
  if (amountRaw !== undefined) {
    const selected = candidates.filter(items => balance(items) >= amountRaw).sort((a, b) => a.length - b.length)[0];
    if (selected) return selected;
    if (balance(list) < amountRaw) throw new Error('Contract API: insufficient token balance');
    throw new Error('Contract API: balance is fragmented across the input limit or incompatible lock-time domains');
  }
  return candidates.sort((a, b) => balance(a) === balance(b) ? 0 : balance(a) > balance(b) ? -1 : 1)[0];
}
