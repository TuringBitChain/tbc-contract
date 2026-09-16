import * as tbc from "tbc-lib-js";

export type FTVersion = 1 | 2 | 3 | 4;

export const FT_V1_CODE_LENGTH = 1564;
export const FT_V1_PARTIAL_OFFSET = 1536;
export const FT_V2_CODE_LENGTH = 1884;
export const FT_V2_PARTIAL_OFFSET = 1856;
export const LEGACY_COIN_CODE_LENGTH = 2012;
export const LEGACY_COIN_PARTIAL_OFFSET = 1984;
export const FT_V4_CODE_LENGTH = 2076;
export const FT_V4_PARTIAL_OFFSET = 2048;

// Published stableCoin templates used three different padding lengths while
// keeping the same 2012-byte code size:
//   1.5.1-1.5.2: 11 bytes, 1.5.3-1.6.0: 54 bytes, 1.6.1+: 2 bytes.
// A 28-byte all-FF padding belongs to the pre-release 2012-byte FT v4
// template, so it must not be treated as a coin.
const LEGACY_COIN_FILL_LENGTHS = new Set([2, 11, 54]);
const LEGACY_FT_V4_FILL_LENGTH = 28;
const V4_COIN_FILL_LENGTH = 10;
const FT_CODE_MARKER = Buffer.from("32436f6465", "hex");

export function fillCharLengthInFT(codeScript: string): number {
  const fillChunk = getFTFillChunk(codeScript);
  if (fillChunk.opcodenum === 95) {
    return 1;
  }
  if (fillChunk.buf) {
    return fillChunk.buf.length;
  }
  return fillChunk.opcodenum;
}

export function isCoinCodeScript(codeScript: string): boolean {
  const codeLength = codeScript.length / 2;
  const code = tbc.Script.fromHex(codeScript);
  const fillChunk = getFTFillChunk(code);
  if (!isAllFF(fillChunk.buf)) return false;
  if (!hasFTCodeMarker(code)) return false;

  return (
    (codeLength === LEGACY_COIN_CODE_LENGTH &&
      LEGACY_COIN_FILL_LENGTHS.has(fillChunk.buf.length)) ||
    (codeLength === FT_V4_CODE_LENGTH &&
      fillChunk.buf.length === V4_COIN_FILL_LENGTH)
  );
}

export function getFTVersion(
  codeScript: string,
  isCoin = isCoinCodeScript(codeScript),
): FTVersion {
  const codeLength = codeScript.length / 2;
  if (codeLength === FT_V4_CODE_LENGTH) return 4;

  const fillCharLength = fillCharLengthInFT(codeScript);
  if (
    codeLength === LEGACY_COIN_CODE_LENGTH &&
    !isCoin &&
    fillCharLength === LEGACY_FT_V4_FILL_LENGTH
  ) {
    return 4;
  }

  const isVersion2Family =
    codeLength === FT_V2_CODE_LENGTH ||
    codeLength === LEGACY_COIN_CODE_LENGTH ||
    isCoin;
  if (!isVersion2Family) return 1;

  return fillCharLength === 1 || fillCharLength === 2 ? 3 : 2;
}

export function getFTPartialOffsetByLength(
  codeLength: number,
): number | null {
  if (codeLength === FT_V1_CODE_LENGTH) return FT_V1_PARTIAL_OFFSET;
  if (codeLength === FT_V2_CODE_LENGTH) return FT_V2_PARTIAL_OFFSET;
  if (codeLength === LEGACY_COIN_CODE_LENGTH) {
    return LEGACY_COIN_PARTIAL_OFFSET;
  }
  if (codeLength === FT_V4_CODE_LENGTH) return FT_V4_PARTIAL_OFFSET;
  return null;
}

export function getFTPartialOffset(codeScript: string): number {
  const codeLength = codeScript.length / 2;
  const offset = getFTPartialOffsetByLength(codeLength);
  if (offset === null) {
    throw new Error(`Unsupported FT code length ${codeLength}`);
  }
  return offset;
}

export function isFTCodeLength(codeLength: number): boolean {
  return getFTPartialOffsetByLength(codeLength) !== null;
}

function getFTFillChunk(codeScript: string | tbc.Script): any {
  const code =
    typeof codeScript === "string" ? tbc.Script.fromHex(codeScript) : codeScript;
  return code.chunks[code.chunks.length - 5];
}

function hasFTCodeMarker(code: tbc.Script): boolean {
  const marker = code.chunks[code.chunks.length - 1]?.buf;
  return marker !== undefined && marker.equals(FT_CODE_MARKER);
}

function isAllFF(buffer: Buffer | undefined): buffer is Buffer {
  return buffer !== undefined && buffer.every((byte) => byte === 0xff);
}
