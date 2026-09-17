import { createHash } from 'node:crypto';
import * as tbc from 'tbc-lib-js';
import {
  POOL3_WHITELIST_PROFILE,
  buildControllerMembershipScript,
  normalizePoolAuthorization,
  parseControllerMembershipScript,
} from './authorization';
import type { PoolAuthorization } from './authorization';

export type Pool3ArtifactName = 'pool' | 'pool_hash_lock' | 'ftlp_tbc20' | 'ftlp_tbc20_locktime';
export interface Pool3Artifact {
  readonly metadata: {
    readonly compiler_name: string;
    readonly compiler_version: string;
    readonly git_commit_hash: string;
    readonly build_timestamp: number;
    readonly source_file: string;
  };
  readonly lock: { readonly hex: string; readonly asm: string };
  readonly unlock: { readonly main: string };
  readonly constructorParams: readonly { readonly name: string; readonly type: string }[];
  readonly abi: readonly {
    readonly type: string;
    readonly name: string;
    readonly index?: number;
    readonly params: readonly { readonly name: string; readonly type: string }[];
  }[];
  readonly structs: readonly {
    readonly name: string;
    readonly type: string;
    readonly fields: readonly { readonly name: string; readonly type: string }[];
  }[];
  readonly functions: readonly {
    readonly name: string;
    readonly type: string;
    readonly params: readonly { readonly name: string; readonly type: string }[];
  }[];
}

const SOURCE_BASE_COMMIT = 'f715aa5d5e4a03ba3b6517355e49f197969d0c59';
const COMPILER_COMMIT = '8bc16116ce28868ccd671413026c545660b557cd';
export const POOL3_ARTIFACT_MANIFEST = Object.freeze({
  // The hash-lock Pool source includes an uncommitted fix beyond the base commit.
  sourceCommit: null,
  sourceBaseCommit: SOURCE_BASE_COMMIT,
  sourceRevision: 'worktree' as const,
  sourceChanges: Object.freeze(['src/pool_hash_lock.ct']),
  compiler: Object.freeze({ name: 'utxo_compiler', version: '1.0.0', commit: COMPILER_COMMIT }),
  whitelistProfile: POOL3_WHITELIST_PROFILE,
  artifacts: Object.freeze({
    pool: Object.freeze({
      sourceSha256: '84e54c34b69b11bdb360e52895a9d76d48ff4006ad63be4a3624c578d16d1ea4',
      sourceArtifactSha256: '1c13ff9379ceb83ebd7c40a962c07136bc4ed59ff03b6eea035ca4a9444830e7',
      artifactSha256: 'cb33cb440e611fb68c50f24aedf6168214cd5942ee490fc98e39c7aa39df547d',
      canonicalArtifactSha256: '01182f693bcb21111bd44ca53ce505564cd7432f8e1479820a5ef6942589ed51',
      templateSha256: 'c98ecae0a22452ce37bcaf24be0c836521d3de3a75aa8f16cef587b8b6f031b2',
      fill: false,
      codeBytes: 5289,
      activeAbiFields: Object.freeze([66, 76, 56, 68]),
    }),
    pool_hash_lock: Object.freeze({
      sourceSha256: 'c999f2aa8b5d1a7c05736703abeb9c5a8d6ab9de73f1a52e723113d2e13b58d2',
      sourceArtifactSha256: 'd40381b3a5ea56942eefa8e845a31c84fd27f41631966a83ae216d1cf723f112',
      artifactSha256: '59244df222b013b62d1c754b1e15aa56e3ffd244b8e848cc206f3cde85e3b81d',
      canonicalArtifactSha256: 'ecca9ef8ddedf1430cb5270a2a3c77e9e397889df337d9362c47074f291334ce',
      templateSha256: 'cf7f95c0483b56ad24825591acbce6e82e37890aa0047fc63183d3fb7a7a4ffc',
      fill: false,
      codeBytes: 5314,
      activeAbiFields: Object.freeze([68, 78, 58, 70]),
    }),
    ftlp_tbc20: Object.freeze({
      sourceSha256: '578b40b052dddddf500e1a4db03cd8c45f5160568900d6e3e4242445940ddd7b',
      sourceArtifactSha256: '11aaa0a25012b77e2a36d07455997ecf706689f4bb351e81789494ad12da7ef0',
      artifactSha256: '58b4a58251d365261be9411df711c5f54c7cc758316593fc1c614f418b37f75d',
      canonicalArtifactSha256: '25eebbe10d2aed9c35a8e3c6c7f5ac73b3d10ab023bf382b094022990d444849',
      templateSha256: '7a6c905a0b0dcfceebc859de67b4212e2e17ed9ce348b50aec4a5c184a59ced4',
      fill: true,
      codeBytes: 2659,
      partialOffset: 2624,
      activeAbiFields: Object.freeze([123]),
    }),
    ftlp_tbc20_locktime: Object.freeze({
      sourceSha256: 'ba0a56d68b1c76b8d8db3f8a174cdf8b42a2e15291a01379ed529c49f2a9ed01',
      sourceArtifactSha256: 'ee9ecb880916ff60004a36ab37a412baa5d0e97e78a7a182d00f44d0bf204795',
      artifactSha256: 'd908137b0354f87409ce36a8792f4d74745c6e0f21b673b85e62f304cfd970ec',
      canonicalArtifactSha256: '44f76c2c7dcbd439859010c69f9b179aa53f6033af3ef03846c5e19ed681de5f',
      templateSha256: '116e6c843ebe4737e8cab0bb2a1da35a51883aaf01d35b1a0db1919700ff4f1f',
      fill: true,
      codeBytes: 2851,
      partialOffset: 2816,
      activeAbiFields: Object.freeze([123]),
    }),
  }),
});

const ARTIFACTS: Readonly<Record<Pool3ArtifactName, Pool3Artifact>> = Object.freeze({
  pool: require('./artifacts/pool.json') as Pool3Artifact,
  pool_hash_lock: require('./artifacts/pool_hash_lock.json') as Pool3Artifact,
  ftlp_tbc20: require('./artifacts/ftlp_tbc20.json') as Pool3Artifact,
  ftlp_tbc20_locktime: require('./artifacts/ftlp_tbc20_locktime.json') as Pool3Artifact,
});
const sha256 = (data: Buffer | string): Buffer => createHash('sha256').update(data).digest();
const verifiedArtifacts = new Set<Pool3ArtifactName>();
function deepFreeze(value: unknown): void {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
}

/** Validates the entire JSON (including ABI), then returns an immutable artifact. */
export function getPool3Artifact(name: Pool3ArtifactName): Pool3Artifact {
  if (!Object.prototype.hasOwnProperty.call(ARTIFACTS, name))
    throw new Error('Pool3: unknown artifact profile');
  const artifact = ARTIFACTS[name];
  if (verifiedArtifacts.has(name)) return artifact;
  const manifest = POOL3_ARTIFACT_MANIFEST.artifacts[name];
  if (
    sha256(JSON.stringify(artifact)).toString('hex') !== manifest.canonicalArtifactSha256 ||
    sha256(artifact.lock.hex).toString('hex') !== manifest.templateSha256 ||
    artifact.metadata.git_commit_hash !== COMPILER_COMMIT ||
    artifact.metadata.compiler_version !== '1.0.0'
  ) {
    throw new Error(`Pool3: frozen artifact integrity check failed: ${name}`);
  }
  deepFreeze(artifact);
  verifiedArtifacts.add(name);
  return artifact;
}

export interface PoolCodeParameters {
  readonly originalUTXO: Buffer;
  readonly tbcFeeScriptHash: Buffer;
  readonly ftTapeSize: number;
  readonly authorization: PoolAuthorization;
}
export interface ParsedPoolCode extends PoolCodeParameters {
  readonly poolCodeHash: Buffer;
  readonly profile: 'pool3-public-v1' | typeof POOL3_WHITELIST_PROFILE;
}

const CONTROLLER_TAIL = '76a9<self.Controller20>88ad516a09504f4f4c434f444532';
const CODE_END = Buffer.from('ad516a09504f4f4c434f444532', 'hex');
const TOKENS = /(<self\.(?:OriginalUTXO36|TbcFeeScriptHash32|FtTapeSize1)>)/;

function assertBytes(bytes: Buffer, length: number, label: string): void {
  if (!Buffer.isBuffer(bytes) || bytes.length !== length)
    throw new Error(`Pool3: ${label} must be exactly ${length} bytes`);
}
export function assertPoolFtTapeSize(size: number, withLpLocktime = false): void {
  const minimum = withLpLocktime ? 66 : 61;
  if (!Number.isSafeInteger(size) || size < minimum || size > 127)
    throw new Error(`Pool3: FT/LP Tape size must be ${minimum}-127 bytes`);
}
function templateFor(authorization: PoolAuthorization): string {
  if (authorization.kind === 'public') return getPool3Artifact('pool').lock.hex;
  const template = getPool3Artifact('pool_hash_lock').lock.hex;
  if (
    !template.endsWith(CONTROLLER_TAIL) ||
    (template.match(/<self\.Controller20>/g) ?? []).length !== 1
  ) {
    throw new Error('Pool3: controller authorization replacement boundary changed');
  }
  return (
    template.slice(0, -CONTROLLER_TAIL.length) +
    '76a9' +
    buildControllerMembershipScript(authorization.controllerPubKeyHashes).toString('hex') +
    CODE_END.toString('hex')
  );
}

/** Instantiates only the pinned compiler template and the audited whitelist tail. */
export function instantiatePoolCode(options: PoolCodeParameters): tbc.Script {
  if (!options || typeof options !== 'object')
    throw new Error('Pool3: Pool Code parameters are required');
  assertBytes(options.originalUTXO, 36, 'OriginalUTXO');
  assertBytes(options.tbcFeeScriptHash, 32, 'TbcFeeScriptHash (SHA256 of the P2PKH script)');
  assertPoolFtTapeSize(options.ftTapeSize);
  const authorization = normalizePoolAuthorization(options.authorization);
  const hex = templateFor(authorization)
    .replaceAll('<self.OriginalUTXO36>', `24${options.originalUTXO.toString('hex')}`)
    .replaceAll('<self.TbcFeeScriptHash32>', `20${options.tbcFeeScriptHash.toString('hex')}`)
    .replaceAll('<self.FtTapeSize1>', `01${options.ftTapeSize.toString(16).padStart(2, '0')}`);
  if (!/^[0-9a-f]+$/.test(hex) || hex.length % 2 !== 0)
    throw new Error('Pool3: unresolved constructor placeholder');
  return tbc.Script.fromHex(hex);
}

function parseBody(
  bytes: Buffer,
  template: string
): { offset: number; values: Map<string, Buffer> } {
  let offset = 0;
  const values = new Map<string, Buffer>();
  for (const segment of template.split(TOKENS)) {
    if (TOKENS.test(segment)) {
      const length =
        segment === '<self.OriginalUTXO36>' ? 36 : segment === '<self.TbcFeeScriptHash32>' ? 32 : 1;
      if (bytes[offset] !== length || offset + 1 + length > bytes.length)
        throw new Error('Pool3: noncanonical constructor push');
      const value = Buffer.from(bytes.subarray(offset + 1, offset + 1 + length));
      const previous = values.get(segment);
      if (previous && !previous.equals(value))
        throw new Error('Pool3: inconsistent repeated constructor parameter');
      values.set(segment, value);
      offset += length + 1;
    } else {
      const expected = Buffer.from(segment, 'hex');
      if (!bytes.subarray(offset, offset + expected.length).equals(expected))
        throw new Error(`Pool3: unrecognized Pool template at byte ${offset}`);
      offset += expected.length;
    }
  }
  return { offset, values };
}

/** Rejects any changed body, extra branch, noncanonical push, or forged marker. */
export function parsePoolCode(script: Buffer | tbc.Script): ParsedPoolCode {
  const bytes = Buffer.isBuffer(script)
    ? Buffer.from(script)
    : script instanceof tbc.Script
      ? script.toBuffer()
      : undefined;
  if (!bytes) throw new Error('Pool3: Pool Code must be a Buffer or Script');
  for (const name of ['pool', 'pool_hash_lock'] as const) {
    const artifact = getPool3Artifact(name);
    try {
      const template =
        name === 'pool'
          ? artifact.lock.hex
          : artifact.lock.hex.slice(0, -CONTROLLER_TAIL.length) + '76a9';
      const body = parseBody(bytes, template);
      let authorization: PoolAuthorization;
      if (name === 'pool') {
        if (body.offset !== bytes.length) continue;
        authorization = { kind: 'public' };
      } else {
        if (
          !artifact.lock.hex.endsWith(CONTROLLER_TAIL) ||
          !bytes.subarray(-CODE_END.length).equals(CODE_END)
        )
          continue;
        const hashes = parseControllerMembershipScript(
          bytes.subarray(body.offset, bytes.length - CODE_END.length)
        );
        authorization = { kind: 'controller', controllerPubKeyHashes: hashes };
      }
      const originalUTXO = body.values.get('<self.OriginalUTXO36>');
      const tbcFeeScriptHash = body.values.get('<self.TbcFeeScriptHash32>');
      const tape = body.values.get('<self.FtTapeSize1>');
      if (!originalUTXO || !tbcFeeScriptHash || !tape) continue;
      const parameters: PoolCodeParameters = {
        originalUTXO,
        tbcFeeScriptHash,
        ftTapeSize: tape[0],
        authorization,
      };
      if (!instantiatePoolCode(parameters).toBuffer().equals(bytes)) continue;
      return {
        ...parameters,
        poolCodeHash: sha256(bytes),
        profile: name === 'pool' ? 'pool3-public-v1' : POOL3_WHITELIST_PROFILE,
      };
    } catch (_error) {
      /* Try the other pinned profile, never an arbitrary script. */
    }
  }
  throw new Error('Pool3: script does not match a supported canonical Pool Code template');
}
