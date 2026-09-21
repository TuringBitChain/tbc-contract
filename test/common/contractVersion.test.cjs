'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { gunzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const tbc = require('tbc-lib-js');
const sdk = require('../..');
const local = require('../../lib/util/common/contractVersion');
const { instantiatePoolCode } = require('../../lib/util/poolnft3/artifacts');
const { buildTBC721Code } = require('../../lib/util/tbc721/tbc721unlock');
const { decodePublishedFTCode } = require('../../lib/validator/ft-artifacts');
const txid = 'a1'.repeat(32);
const address = tbc.Address.fromPublicKeyHash(Buffer.alloc(20, 0x35)).toString();
const controller = Buffer.concat([Buffer.alloc(20, 0x35), Buffer.from([0])]);
const pool2 = new sdk.poolNFT2();
const detectors = {
  pool: sdk.detectPoolVersion, ft: sdk.detectFTVersion,
  stablecoin: sdk.detectStableCoinVersion, nft: sdk.detectNFTVersion,
};
const ordinary = sdk.FT.prototype.getFTmintCode(txid, 7, address, 75);
const token = sdk.TBC20.instantiateCode({ originalUTXO: { txId: txid, outputIndex: 8 }, tapeSize: 66, controller });
const legacyCoin = sdk.stableCoin.getCoinMintCode('27'.repeat(20), address, '38'.repeat(32), 75);
const coin = sdk.CoinTBC20.instantiateCode({ coinNftCodeHash: Buffer.alloc(32, 0x38),
  adminPubKeyHash: Buffer.alloc(20, 0x27), tapeSize: 66, controller });
const publicPool3 = instantiatePoolCode({ originalUTXO: Buffer.alloc(36, 0x43),
  tbcFeeScriptHash: Buffer.alloc(32, 0x54), ftTapeSize: 66, authorization: { kind: 'public' } });
const samples = [
  { code: ordinary, family: 'ft', version: 'legacy', sdk: 'FT', legacyVersion: 4 },
  { code: token, family: 'ft', version: 'tbc20', sdk: 'TBC20' },
  { code: legacyCoin, family: 'stablecoin', version: 'legacy', sdk: 'stableCoin', legacyVersion: 4 },
  { code: coin, family: 'stablecoin', version: 'tbc20', sdk: 'Coin' },
  { code: pool2.getPoolNftCode(txid, 9, 1, 4, 'routing'), family: 'pool', version: 2, sdk: 'poolNFT2' },
  { code: publicPool3, family: 'pool', version: 3, sdk: 'PoolNFT3' },
  { code: sdk.NFT.buildCodeScript(txid, 10), family: 'nft', version: 'legacy', sdk: 'NFT', legacyVersion: 2 },
  { code: buildTBC721Code(txid, 11), family: 'nft', version: 'tbc721', sdk: 'TBC721' },
];

for (const { code, ...expected } of samples) {
  test(`routes ${expected.sdk} from Script, Buffer and hex without cross-family matches`, () => {
    const before = code.toHex();
    for (const value of [code, code.toBuffer(), code.toHex(), code.toHex().toUpperCase()]) {
      const result = sdk.detectContractVersion(value);
      assert.deepEqual(result, { ...expected, codeBytes: code.toBuffer().length });
      assert(Object.isFrozen(result));
      for (const [family, detect] of Object.entries(detectors)) {
        assert.deepEqual(detect(value), family === expected.family ? result : null);
      }
      assert.equal(typeof sdk[result.sdk], 'function');
    }
    assert.equal(code.toHex(), before);
  });
  test(`rejects changed fixed bytes, truncation, suffix-only imitations and trailing data for ${expected.sdk}`, () => {
    const original = code.toBuffer();
    const changed = Buffer.from(original); changed[0] = tbc.Opcode.OP_NOP;
    const fake = Buffer.alloc(original.length, tbc.Opcode.OP_NOP);
    original.subarray(-28).copy(fake, fake.length - 28);
    for (const value of [changed, original.subarray(0, -1), fake, Buffer.concat([original, Buffer.from([0x51])])]) {
      assert.equal(sdk.detectContractVersion(value), null);
    }
  });
}

test('root exports refer to the common implementation', () => {
  for (const name of ['detectContractVersion', 'detectPoolVersion', 'detectFTVersion', 'detectStableCoinVersion', 'detectNFTVersion']) {
    assert.equal(sdk[name], local[name]);
  }
});

test('malformed or non-Code inputs return null, never a default legacy SDK', () => {
  for (const value of [null, undefined, 12, {}, [], '', '0', 'zz', '0x51', '51 garbage', 'OP_TRUE',
    '01', '4c02ff', Buffer.from('4dffff', 'hex'), Buffer.alloc(0), new tbc.Script(), '00'.repeat(32),
    tbc.Script.buildPublicKeyHashOut(address), new tbc.Script().add('OP_RETURN').add(Buffer.from('TBC20CODE2'))]) {
    for (const detect of [sdk.detectContractVersion, ...Object.values(detectors)]) assert.equal(detect(value), null);
  }
});

test('Hold, Tape and LP are not routed as the four business-asset families', () => {
  const nonCodes = [sdk.NFT.buildHoldScript(address), sdk.NFT.buildTapeScript({ nftName: 'not code' }),
    sdk.TBC20.buildTape([1n, 0n, 0n, 0n, 0n, 0n], 61),
    pool2.getFtlpCode('19'.repeat(32), address, 75, false, 4),
  ];
  for (const timelocked of [false, true]) nonCodes.push(sdk.FTLPTBC20.instantiateCode({
    poolCodeHash: Buffer.alloc(32, 0x19), tapeSize: 66, controller, timelocked,
  }));
  for (const code of nonCodes) assert.equal(sdk.detectContractVersion(code), null);
});

test('recognizes legacy NFT v0/v1/v2 and Pool1 without routing them to Pool2', () => {
  for (const [version, method] of [[0, 'buildCodeScript_v0'], [1, 'buildCodeScript_v1'], [2, 'buildCodeScript']]) {
    const result = sdk.detectNFTVersion(sdk.NFT[method]('bf'.repeat(32), 0xffffffff));
    assert.equal(result.sdk, 'NFT'); assert.equal(result.legacyVersion, version);
  }
  for (const method of ['getPoolNftCode', 'getPoolNftCodeWithLock']) {
    const result = sdk.detectPoolVersion(sdk.poolNFT.prototype[method]('ce'.repeat(32), 0xffffffff));
    assert.equal(result.sdk, 'poolNFT'); assert.equal(result.version, 1);
  }
});

test('Pool2 public templates accept all fee plans, supported FT sizes, roots and tags', () => {
  for (let plan = 1; plan <= 6; plan++) for (const version of [1, 2, 3, 4]) for (const isCoin of [false, true]) {
    const code = pool2.getPoolNftCode('da'.repeat(32), 65536 + plan, plan, version, 'tag-' + plan, isCoin);
    assert.equal(sdk.detectPoolVersion(code)?.sdk, 'poolNFT2');
  }
});

test('Pool2 authorization matches 1–10 equal-length public-key prefixes and their exact length operand', () => {
  for (let count = 1; count <= 10; count++) for (const width of [1, 15, 16, 17, 33, 65]) {
    const keys = Array.from({ length: count }, (_, i) => Buffer.alloc(width, 0x80 + i).toString('hex'));
    const code = pool2.getPoolNftCodeWithLock(txid, count, 6, address, 0.000123, keys, 4, 'AUTH');
    assert.equal(sdk.detectPoolVersion(code)?.sdk, 'poolNFT2', `${count} keys of ${width} bytes`);
  }
});

test('Pool2 rejects inconsistent repeated FT sizes, fee hashes and noncanonical root pushes', () => {
  const code = pool2.getPoolNftCode(txid, 7, 1, 2);
  const chunks = code.chunks;
  for (const width of [2, 20]) {
    const index = chunks.findIndex(c => c.buf?.length === width);
    assert(index >= 0);
    const altered = new tbc.Script();
    chunks.forEach((chunk, i) => altered.add(i === index
      ? Buffer.alloc(width, 0x78) : chunk));
    assert.equal(sdk.detectPoolVersion(altered), null);
  }
  const noncanonical = new tbc.Script();
  for (const chunk of chunks) noncanonical.add(chunk.buf?.length === 36
    ? { opcodenum: tbc.Opcode.OP_PUSHDATA1, len: 36, buf: chunk.buf } : chunk);
  assert.equal(sdk.detectPoolVersion(noncanonical), null);
});

test('Pool3 public and 1–5-member controller templates recognize allowed Tape sizes', () => {
  for (const size of [61, 66, 127]) for (let count = 0; count <= 5; count++) {
    const code = instantiatePoolCode({ originalUTXO: Buffer.alloc(36, 0xc1),
      tbcFeeScriptHash: Buffer.alloc(32, 0xd2), ftTapeSize: size,
      authorization: count ? { kind: 'controller', controllerPubKeyHashes:
        Array.from({ length: count }, (_, i) => (i + 17).toString(16).repeat(20)) } : { kind: 'public' },
    });
    assert.equal(sdk.detectPoolVersion(code)?.sdk, 'PoolNFT3');
  }
});

test('TBC20 and Coin recognition permits address and contract controllers without conflating identities', () => {
  const contractController = Buffer.concat([Buffer.alloc(20, 0x98), Buffer.from([1])]);
  assert.equal(sdk.detectFTVersion(sdk.TBC20.replaceController(token, contractController)).sdk, 'TBC20');
  assert.equal(sdk.detectStableCoinVersion(sdk.CoinTBC20.replaceController(coin, contractController)).sdk, 'Coin');
  const bytes = token.toBuffer();
  const marker = Buffer.concat([Buffer.from([21]), controller]);
  const at = bytes.indexOf(marker); assert(at >= 0);
  bytes[at + 21] = 0x80;
  assert.equal(sdk.detectFTVersion(bytes), null);
});

// Historical real SDK scripts are pinned by raw SHA256; no npm, Git, RPC or signing is used.
const historical = [
  {
    "label": "FT v1",
    "version": 1,
    "commit": "ed1cf42",
    "bytes": 1564,
    "sha256": "52aef7cccd00da1457d6e0e6c5fbe6554a23a37e61b95bee9cd2f9425af3ab7f",
    "gzipBase64": "H4sIAAAAAAACA+2Uv0oDQRDG9wofQFBsLCKkSG1hZ6OQUri7nElKScIdzoCi7CYbjlmS5gYsTd7hUqQWkkoQK3ufRiObP+SEwzQ2gcwWCz+++b5ld9i6Blf3g4HZK1du7lvsm1pmyZ4SSRNV4JSGxikZCRKieAkrWfi8on4u9XKpm0vFL4p2SwnJ054m8DXAlAgpJUiRKE2vJ07BSEbXtJ0D4y7O3JCuHvE4dNnTIwYCJRitnGxLxymYipE9wZwGEx5HyksachGwcrc6RIXoFI1UYDOCLj8kDZQAIRb3N5QQQjBA9Lf30tUKt0AnuMqIMQDMm1RfOeWkkR2eWKKqDb1uvB4eVHVd12QtMB7MHxOmSISIfhcAIJTWxctMYSJYRtO1YnmJ/5CHtDlxodll7jK3NtN+doKly4hpdZK0j2b5JW8PT2of3+fvjy9X4evss3Px9fR2diz2Ti/vmq0fIsQl/xwGAAA="
  },
  {
    "label": "FT v2",
    "version": 2,
    "commit": "a611267",
    "bytes": 1884,
    "sha256": "0cafd5352a5cc961b32d2dcbedd905c14df06b3d492230440a792fe5b21d1a20",
    "gzipBase64": "H4sIAAAAAAACA+2Tv0oDQRDGd4s8gKCdSJQIqS3sbBRSCnfJmaSUJNzhjCjKbrLhmCXX3IKFRZJ3uAiphaQSxMrep9HI5g+JEIyFTSC7xcKPb79vmdkpK3BU5HV0Kle4vK2ZvC4tbNGSLK6i9Hi2q3lWCxAQhFNYWITtGc0vpe5S6iyl7AdFeySE5CpXEeQVwJAIKSFIkChJLgY8rYVBR9f5tnYmb64IR/VM33cMP1A8owVP63rL7T7yvbbTUT3DwKqu/YinTSMqGYFEEGzYcoYJET01xoVOvIHpB9KNK2LSklk/bDMQJaKttwQr9prmLq6gAPAxs7ViMcaYAQh+9566WuEa6JgpGsQQAMaXZCR5Lq4sjlsoUJa6bjOcjxvKsiorshYYdsbfH4ZIhIj5JgCAL6yLuzC3MTMiGM4V0yL+Qx7S6sSJZpO5yVzbTGYQmRGOQUyKg7h+OPrLElc7+6X3r5O3++dz/2X00Tj9fHg93mWpo7Obau0bsw6CO1wHAAA="
  },
  {
    "label": "FT v3",
    "version": 3,
    "commit": "662dcb8",
    "bytes": 1884,
    "sha256": "3ba79bd4e6db384018bf986d31b0bfa86d027f01ffbc6d2b1fca03d6ee9f30e4",
    "gzipBase64": "H4sIAAAAAAACA+1Tu0oDQRSdKfwAQTuRiClSW9jZKKQUdvOuRNaQxXvFF3eSCcsdkmYHFCzM/sMmYC0klSBW9n6ND3ZVTMCYxiaQme6cM+cw93JqGhzdLfXMUr54eFa3BVMdu9QRoER4hFeoSjIXGZkzBATgB51vvDiB3/4QhWmEO41wphFikkAkAIKYkV3taoaCBhgxI8cMMTIPykOZMWTRMU25YhxDiZVHju7bu4ZjA5mL5KYOTFNmTLNoqONGN3L91unpvk2/7J00ujJjW92qJWQGf4H9jmHMzINWOu64NLR3vnJDjz738r0U5gGiQkSZNaQgEZfb9hrPQ48AoJFdnnGEEMICgP+3+5cvXFiAuVFWLCIKGwBA+kh1lcyH3ngnA0JVjdx2kHYybQWqmq5pTgww6KVtgBEyI2KhDclQKXFxx8odCkv+6EfxNcx/yEOenfipWWQuMuc2U9ikqORYxLgyDJsHdLy6UX1+23m6vN9vPLy/tHZfrx6318TS1t7pUf0DWePVLVwHAAA="
  },
  {
    "label": "FT v4 early 2012B",
    "version": 4,
    "commit": "e8baf8c",
    "bytes": 2012,
    "sha256": "baf2d27bc0aff75e8f2127b2303b8a829a37533bbb5eca2724e37b4032337fc3",
    "gzipBase64": "H4sIAAAAAAACA+1UsWobQRTcJegDAklnzIW4UO0iXRobXAbuJFlSac5Gh98ziRPenlYcb9E198CBFJb8DSeB64BUBYwr9/4aW+ZONpZDFKdIE6LdbubtDMvsbNuCb9PGwFV26nufDqTmWgub+gqMyvbxBE1DV4dOVx0BAURJ/wGvP8FPH4naMiJYRvjLCPWUQCQAgpyRAxtYhpoFmHI3jXX1DBNgzhlyZB7vTrTn6o76KIK+i/Ur5zsqdEPy7UjOO74kujrUb23iYu25uBgOht/0+qk/sCMp7x8edVLtSTdtCSEzRCvs1xjmzDzuas+R5I2JnEcmyEKah/RzQsxjRDSIqDccGdCe6zd7stuTr3ichQQAnY2Xz6wXSikBgOgPneav4d4GPgvAf3GwKYioJAGAUsOkRu9k4WLvE0LTGga9pOx92Tw0bdu2XAhgMigbB1NkRsRaD4p8qFAJFj6QTAlF08eJ+1z+gh/y847zmZXnyvOf9VRSFJV8Qcybkyxem/1m0eHrN62r2/eXX75/6PyYXXe3bk4u3q2pyub2x/2DO6f+kAbcBwAA"
  }
];
for (const fixture of historical) test(`recognizes ${fixture.label} from ${fixture.commit}`, () => {
  const code = gunzipSync(Buffer.from(fixture.gzipBase64, 'base64'));
  assert.equal(code.length, fixture.bytes);
  assert.equal(createHash('sha256').update(code).digest('hex'), fixture.sha256);
  assert.equal(decodePublishedFTCode(code.toString('hex')).version, fixture.version);
  assert.equal(sdk.detectFTVersion(code).legacyVersion, fixture.version);
  assert.equal(sdk.detectStableCoinVersion(code), null);
});
