import * as tbc from 'tbc-lib-js';

export type PoolAuthorization =
  | { readonly kind: 'public' }
  | { readonly kind: 'controller'; readonly controllerPubKeyHashes: readonly string[] };

export const TBC_AMM_WHITELIST_PROFILE = 'tbc-amm-controller-whitelist-v1';
export const TBC_AMM_MAX_CONTROLLERS = 5;

/** Returns a canonical copy: a 1-of-N whitelist, not M-of-N multisig. */
export function normalizeControllerPubKeyHashes(hashes: readonly string[]): readonly string[] {
  if (!Array.isArray(hashes) || hashes.length < 1 || hashes.length > TBC_AMM_MAX_CONTROLLERS) {
    throw new Error('TBC AMM: controllerPubKeyHashes must contain 1-5 public-key hashes');
  }
  const normalized = hashes.map((hash) => {
    if (typeof hash !== 'string' || !/^[0-9a-fA-F]{40}$/.test(hash)) {
      throw new Error('TBC AMM: each controller public-key hash must be exactly 20 bytes of hex');
    }
    return hash.toLowerCase();
  });
  if (new Set(normalized).size !== normalized.length)
    throw new Error('TBC AMM: duplicate controller public-key hash');
  return Object.freeze(normalized.sort());
}

export function normalizePoolAuthorization(authorization: PoolAuthorization): PoolAuthorization {
  if (!authorization || typeof authorization !== 'object')
    throw new Error('TBC AMM: authorization is required');
  if (authorization.kind === 'public') {
    if ('controllerPubKeyHashes' in authorization)
      throw new Error('TBC AMM: a public pool cannot contain controller public-key hashes');
    return Object.freeze({ kind: 'public' });
  }
  if (authorization.kind !== 'controller') throw new Error('TBC AMM: unsupported authorization kind');
  return Object.freeze({
    kind: 'controller',
    controllerPubKeyHashes: normalizeControllerPubKeyHashes(authorization.controllerPubKeyHashes),
  });
}

/** Consumes HASH160(publicKey), leaving the original [signature, publicKey]. */
export function buildControllerMembershipScript(hashes: readonly string[]): Buffer {
  const canonical = normalizeControllerPubKeyHashes(hashes);
  const head = canonical
    .slice(0, -1)
    .map((hash) => `7614${hash}87637567`)
    .join('');
  return Buffer.from(
    `${head}14${canonical[canonical.length - 1]}88${'68'.repeat(canonical.length - 1)}`,
    'hex'
  );
}

/** Full isolated authorization fragment. No altstack use; consumes sig/publicKey. */
export function buildControllerAuthorizationScript(hashes: readonly string[]): tbc.Script {
  return tbc.Script.fromBuffer(
    Buffer.concat([
      Buffer.from('76a9', 'hex'),
      buildControllerMembershipScript(hashes),
      Buffer.from('ad', 'hex'),
    ])
  );
}

/** Strictly parses the SDK's canonical direct-push membership grammar. */
export function parseControllerMembershipScript(script: Buffer): readonly string[] {
  if (!Buffer.isBuffer(script)) throw new Error('TBC AMM: controller membership must be a Buffer');
  const hashes: string[] = [];
  let offset = 0;
  while (script[offset] === 0x76) {
    if (
      hashes.length >= TBC_AMM_MAX_CONTROLLERS - 1 ||
      script[offset + 1] !== 0x14 ||
      !script.subarray(offset + 22, offset + 26).equals(Buffer.from('87637567', 'hex'))
    ) {
      throw new Error('TBC AMM: noncanonical controller membership branch');
    }
    hashes.push(script.subarray(offset + 2, offset + 22).toString('hex'));
    offset += 26;
  }
  if (script[offset] !== 0x14 || script[offset + 21] !== 0x88)
    throw new Error('TBC AMM: missing terminal controller comparison');
  hashes.push(script.subarray(offset + 1, offset + 21).toString('hex'));
  offset += 22;
  if (!script.subarray(offset).equals(Buffer.alloc(hashes.length - 1, 0x68)))
    throw new Error('TBC AMM: noncanonical controller branch closure');
  const canonical = normalizeControllerPubKeyHashes(hashes);
  if (!buildControllerMembershipScript(canonical).equals(script))
    throw new Error('TBC AMM: controller public-key hashes must be sorted');
  return canonical;
}

export function assertPoolControllerPublicKey(
  authorization: PoolAuthorization,
  publicKey: Buffer | string | tbc.PublicKey
): void {
  const normalized = normalizePoolAuthorization(authorization);
  if (normalized.kind !== 'controller')
    throw new Error('TBC AMM: public pools do not require a controller signature');
  let bytes: Buffer;
  if (publicKey instanceof tbc.PublicKey) bytes = publicKey.toBuffer();
  else if (Buffer.isBuffer(publicKey)) bytes = Buffer.from(publicKey);
  else if (typeof publicKey === 'string' && /^[0-9a-fA-F]{66}$/.test(publicKey))
    bytes = Buffer.from(publicKey, 'hex');
  else throw new Error('TBC AMM: controller public key must be compressed 33-byte hex or Buffer');
  if (bytes.length !== 33) throw new Error('TBC AMM: controller public key must be compressed');
  tbc.PublicKey.fromBuffer(bytes);
  if (
    !normalized.controllerPubKeyHashes.includes(
      tbc.crypto.Hash.sha256ripemd160(bytes).toString('hex')
    )
  ) {
    throw new Error('TBC AMM: signer is not a member of the controller whitelist');
  }
}
