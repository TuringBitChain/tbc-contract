import * as tbc from 'tbc-lib-js';
import { TBC20 } from '../../contract/tbc20';
// These legacy modules use module.exports rather than TypeScript exports.
const NFT = require('../../contract/nft');
const PoolNFT = require('../../contract/poolNFT');
const PoolNFT2 = require('../../contract/poolNFT2.0');
import { decodePublishedFTCode } from '../../validator/ft-artifacts';
import { CoinTBC20 } from '../coin/coinTbc20Code';
import { parsePoolCode } from '../poolnft3/artifacts';
import { resolveSwapFeePolicy } from '../poolnft3/fees';
import { parseTBC721Code } from '../tbc721/tbc721unlock';
import { getOpCode } from './util';

/** The locking script of a Code output, never a txid, raw transaction, Hold or Tape. */
export type ContractCodeScript = tbc.Script | Buffer | string;

type CodeSize = { readonly codeBytes: number };
export type PoolVersionInfo = CodeSize & (
  | { readonly family: 'pool'; readonly version: 1; readonly sdk: 'poolNFT' }
  | { readonly family: 'pool'; readonly version: 2; readonly sdk: 'poolNFT2' }
  | { readonly family: 'pool'; readonly version: 3; readonly sdk: 'PoolNFT3' }
);
export type FTVersionInfo = CodeSize & (
  | { readonly family: 'ft'; readonly version: 'legacy'; readonly sdk: 'FT'; readonly legacyVersion: 1 | 2 | 3 | 4 }
  | { readonly family: 'ft'; readonly version: 'tbc20'; readonly sdk: 'TBC20' }
);
export type StableCoinVersionInfo = CodeSize & (
  | { readonly family: 'stablecoin'; readonly version: 'legacy'; readonly sdk: 'stableCoin'; readonly legacyVersion: 1 | 2 | 3 | 4 }
  | { readonly family: 'stablecoin'; readonly version: 'tbc20'; readonly sdk: 'Coin' }
);
export type NFTVersionInfo = CodeSize & (
  | { readonly family: 'nft'; readonly version: 'legacy'; readonly sdk: 'NFT'; readonly legacyVersion: 0 | 1 | 2 }
  | { readonly family: 'nft'; readonly version: 'tbc721'; readonly sdk: 'TBC721' }
);
export type ContractVersionInfo = PoolVersionInfo | FTVersionInfo | StableCoinVersionInfo | NFTVersionInfo;

type Chunk = tbc.Script['chunks'][number];
type Field = { name: string; width?: number; maxWidth?: number };
type PatternPart = { fixed: Buffer } | { field: Field } | { keyLength: true };
type Pattern = readonly PatternPart[];

function chunkBytes(chunk: Chunk): Buffer {
  return new tbc.Script().add(chunk).toBuffer();
}

function readCode(value: ContractCodeScript): tbc.Script | null {
  try {
    let bytes: Buffer;
    if (value instanceof tbc.Script) bytes = value.toBuffer();
    else if (Buffer.isBuffer(value)) bytes = value;
    else if (typeof value === 'string' && /^(?:[0-9a-fA-F]{2})+$/.test(value)) bytes = Buffer.from(value, 'hex');
    else return null;
    if (bytes.length === 0) return null;
    const script = tbc.Script.fromBuffer(bytes);
    // The library can preserve incomplete pushes; never classify those as Code.
    if (!script.toBuffer().equals(bytes) || script.chunks.some(c => c.buf !== undefined && c.len !== c.buf.length)) return null;
    return script;
  } catch { return null; }
}

// The legacy builders are the single source of template bytes. Only their
// explicit constructor pushes vary; every other opcode/byte must match.
function pattern(script: tbc.Script, fields: ReadonlyMap<string, Field>, keyLengthIndex = -1): Pattern {
  const seen = new Set<string>();
  const parts = script.chunks.map((chunk, index): PatternPart => {
    if (index === keyLengthIndex) return { keyLength: true };
    const field = chunk.buf && fields.get(chunk.buf.toString('hex'));
    if (field) { seen.add(field.name); return { field }; }
    return { fixed: chunkBytes(chunk) };
  });
  for (const field of fields.values()) {
    if (!seen.has(field.name)) throw new Error(`Contract version template is missing ${field.name}`);
  }
  return parts;
}

function matches(script: tbc.Script, template: Pattern): boolean {
  if (script.chunks.length !== template.length) return false;
  const fields = new Map<string, Buffer>();
  let keyLengthChunk: Chunk | undefined;
  for (let index = 0; index < template.length; index++) {
    const part = template[index], chunk = script.chunks[index];
    if ('fixed' in part) {
      if (!chunkBytes(chunk).equals(part.fixed)) return false;
    } else if ('keyLength' in part) {
      keyLengthChunk = chunk;
    } else {
      const data = chunk.buf;
      if (!data || data.length === 0 || (part.field.width !== undefined && data.length !== part.field.width)
          || (part.field.maxWidth !== undefined && data.length > part.field.maxWidth)) return false;
      // Preserve canonical SDK push encoding, including the constructor's length byte.
      if (!chunkBytes(chunk).equals(new tbc.Script().add(data).toBuffer())) return false;
      const previous = fields.get(part.field.name);
      if (previous && !previous.equals(data)) return false;
      fields.set(part.field.name, data);
    }
  }
  const ftSize = fields.get('ftSize');
  if (ftSize && !['1c06', '5c07', 'dc07', '1c08'].includes(ftSize.toString('hex'))) return false;
  const cost = fields.get('lpCost');
  if (cost && cost.readBigUInt64LE() === 0n) return false;
  if (keyLengthChunk) {
    const width = fields.get('key0')!.length;
    if (!chunkBytes(keyLengthChunk).equals(tbc.Script.fromASM(getOpCode(width)).toBuffer())) return false;
    for (const [name, data] of fields) if (name.startsWith('key') && data.length !== width) return false;
  }
  return true;
}

const rootTxid = '11'.repeat(32);
const rootVout = 0x12345678;
const rootBytes = Buffer.concat([Buffer.alloc(32, 0x11), Buffer.from('78563412', 'hex')]);
const rootFields = new Map<string, Field>([[rootBytes.toString('hex'), { name: 'root', width: 36 }]]);
type LegacyPoolPattern = { version: 1 | 2; template: Pattern };
type LegacyNFTPattern = { version: 0 | 1 | 2; template: Pattern };
let legacyPools: LegacyPoolPattern[] | undefined;
let legacyNFTs: LegacyNFTPattern[] | undefined;

function poolPatterns(): LegacyPoolPattern[] {
  if (legacyPools) return legacyPools;
  const v1 = PoolNFT.prototype, v2 = PoolNFT2.prototype;
  const feeAddress = resolveSwapFeePolicy(1).serviceFeeAddress;
  const costAddress = tbc.Address.fromPublicKeyHash(Buffer.alloc(20, 0x22)).toString();
  const cost = Buffer.alloc(8); cost.writeBigUInt64LE(1_000_000n);
  const tag = 'SDK_VERSION_TEMPLATE';
  const fields = new Map(rootFields);
  fields.set('5c07', { name: 'ftSize', width: 2 });
  fields.set(tbc.Address.fromString(feeAddress).hashBuffer.toString('hex'), { name: 'feeHash', width: 20 });
  fields.set(Buffer.from(tag).toString('hex'), { name: 'tag' });
  const result: LegacyPoolPattern[] = [
    { version: 1, template: pattern(v1.getPoolNftCode(rootTxid, rootVout), rootFields) },
    { version: 1, template: pattern(v1.getPoolNftCodeWithLock(rootTxid, rootVout), rootFields) },
    { version: 2, template: pattern(v2.getPoolNftCode(rootTxid, rootVout, 1, 2, tag), fields) },
  ];
  for (let count = 1; count <= 10; count++) {
    const keys = Array.from({ length: count }, (_, index) => Buffer.alloc(33, 0xa0 + index).toString('hex'));
    const lockedFields = new Map(fields);
    lockedFields.set('22'.repeat(20), { name: 'lpCostAddress', width: 20 });
    lockedFields.set(cost.toString('hex'), { name: 'lpCost', width: 8 });
    keys.forEach((key, index) => lockedFields.set(key, { name: `key${index}`, maxWidth: 65 }));
    const script: tbc.Script = v2.getPoolNftCodeWithLock(rootTxid, rootVout, 1, costAddress, 1, keys, 2, tag);
    const firstKey = script.chunks.findIndex(c => c.buf?.toString('hex') === keys[0]);
    const lengthIndex = firstKey - (count === 1 ? 3 : 4);
    if (lengthIndex < 0 || script.chunks[lengthIndex].buf?.toString('hex') !== '21') {
      throw new Error('Pool2 authorization template boundary changed');
    }
    result.push({ version: 2, template: pattern(script, lockedFields, lengthIndex) });
  }
  legacyPools = result;
  return result;
}

function nftPatterns(): LegacyNFTPattern[] {
  if (!legacyNFTs) legacyNFTs = [
    { version: 0, template: pattern(NFT.buildCodeScript_v0(rootTxid, rootVout), rootFields) },
    { version: 1, template: pattern(NFT.buildCodeScript_v1(rootTxid, rootVout), rootFields) },
    { version: 2, template: pattern(NFT.buildCodeScript(rootTxid, rootVout), rootFields) },
  ];
  return legacyNFTs;
}

function poolVersion(script: tbc.Script): PoolVersionInfo | null {
  const codeBytes = script.toBuffer().length;
  try {
    parsePoolCode(script);
    return Object.freeze({ family: 'pool', version: 3, sdk: 'PoolNFT3', codeBytes });
  } catch { /* Not a supported Pool3 template. Try the legacy builders. */ }
  if (script.chunks[0]?.opcodenum !== tbc.Opcode.OP_1 && script.chunks[0]?.opcodenum !== tbc.Opcode.OP_4) return null;
  for (const entry of poolPatterns()) {
    if (matches(script, entry.template)) return entry.version === 1
      ? Object.freeze({ family: 'pool', version: 1, sdk: 'poolNFT', codeBytes })
      : Object.freeze({ family: 'pool', version: 2, sdk: 'poolNFT2', codeBytes });
  }
  return null;
}

function ftVersion(script: tbc.Script): FTVersionInfo | null {
  const codeBytes = script.toBuffer().length;
  const legacy = decodePublishedFTCode(script.toHex());
  if (legacy && !legacy.coin) return Object.freeze({ family: 'ft', version: 'legacy', sdk: 'FT', legacyVersion: legacy.version, codeBytes });
  try {
    TBC20.validateCode(script);
    return Object.freeze({ family: 'ft', version: 'tbc20', sdk: 'TBC20', codeBytes });
  } catch { return null; }
}

function stableCoinVersion(script: tbc.Script): StableCoinVersionInfo | null {
  const codeBytes = script.toBuffer().length;
  const legacy = decodePublishedFTCode(script.toHex());
  if (legacy?.coin) return Object.freeze({ family: 'stablecoin', version: 'legacy', sdk: 'stableCoin', legacyVersion: legacy.version, codeBytes });
  try {
    CoinTBC20.parseCode(script);
    return Object.freeze({ family: 'stablecoin', version: 'tbc20', sdk: 'Coin', codeBytes });
  } catch { return null; }
}

function nftVersion(script: tbc.Script): NFTVersionInfo | null {
  const codeBytes = script.toBuffer().length;
  try {
    parseTBC721Code(script);
    return Object.freeze({ family: 'nft', version: 'tbc721', sdk: 'TBC721', codeBytes });
  } catch { /* Compare the complete legacy Code before recommending NFT. */ }
  for (const entry of nftPatterns()) {
    if (matches(script, entry.template)) return Object.freeze({ family: 'nft', version: 'legacy', sdk: 'NFT', legacyVersion: entry.version, codeBytes });
  }
  return null;
}

/** Local template recognition only, not proof of asset identity, validity or spendability. */
export function detectContractVersion(codeScript: ContractCodeScript): ContractVersionInfo | null {
  const script = readCode(codeScript);
  return script ? poolVersion(script) ?? ftVersion(script) ?? stableCoinVersion(script) ?? nftVersion(script) : null;
}

/** Recognizes Pool1/Pool2 (including authorization variants) and the supported Pool3 templates. */
export function detectPoolVersion(codeScript: ContractCodeScript): PoolVersionInfo | null {
  const script = readCode(codeScript);
  return script ? poolVersion(script) : null;
}

/** Ordinary FT only; stablecoins and LP tokens are not routed to FT/TBC20. */
export function detectFTVersion(codeScript: ContractCodeScript): FTVersionInfo | null {
  const script = readCode(codeScript);
  return script ? ftVersion(script) : null;
}

/** Coin TBC20 routes to the Coin business SDK, not the CoinTBC20 codec. */
export function detectStableCoinVersion(codeScript: ContractCodeScript): StableCoinVersionInfo | null {
  const script = readCode(codeScript);
  return script ? stableCoinVersion(script) : null;
}

/** Pass NFT Code, not its adjacent Hold/Tape or an issuance-certificate identifier. */
export function detectNFTVersion(codeScript: ContractCodeScript): NFTVersionInfo | null {
  const script = readCode(codeScript);
  return script ? nftVersion(script) : null;
}
