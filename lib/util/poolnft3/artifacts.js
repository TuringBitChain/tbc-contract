"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.POOL3_ARTIFACT_MANIFEST = void 0;
exports.getPool3Artifact = getPool3Artifact;
exports.assertPoolFtTapeSize = assertPoolFtTapeSize;
exports.instantiatePoolCode = instantiatePoolCode;
exports.parsePoolCode = parsePoolCode;
const node_crypto_1 = require("node:crypto");
const tbc = __importStar(require("tbc-lib-js"));
const authorization_1 = require("./authorization");
const SOURCE_BASE_COMMIT = 'dbe6d8ec3749c683e01f6ee22e045dba19978c3e';
const COMPILER_COMMIT = '8bc16116ce28868ccd671413026c545660b557cd';
exports.POOL3_ARTIFACT_MANIFEST = Object.freeze({
    // Pool sources include uncommitted fixes; the base commit alone cannot reproduce them.
    sourceCommit: null,
    sourceBaseCommit: SOURCE_BASE_COMMIT,
    sourceRevision: 'worktree',
    sourceChanges: Object.freeze(['src/pool.ct', 'src/pool_hash_lock.ct']),
    compiler: Object.freeze({ name: 'utxo_compiler', version: '1.0.0', commit: COMPILER_COMMIT }),
    whitelistProfile: authorization_1.POOL3_WHITELIST_PROFILE,
    artifacts: Object.freeze({
        pool: Object.freeze({
            sourceSha256: '38ba78e4e1f39e5517968cc7cbb76d4230f1e3c3d33c992015f06f5c71fba156',
            sourceArtifactSha256: 'd11738eb807aa0063d6923878f587632c57b74ac203ad93849a6e4453274955e',
            artifactSha256: 'f94d407c2a1678ad586c60048e05038ebf133f5af709a77c2d0a50652e70c1ee',
            canonicalArtifactSha256: '9288d5da5feea697b8ef5c7ad28608ee28cced98c27eaf9840e7dd071cad493b',
            templateSha256: 'c54269ba2618058c98a4e67dd0da6a580c8b1accad11e2b5e2c8798b09540955',
            fill: false,
            codeBytes: 5203,
            activeAbiFields: Object.freeze([66, 76, 56, 68]),
        }),
        pool_hash_lock: Object.freeze({
            sourceSha256: 'e32c03f2552fb0e181294e5176f95f6b7abc536365b81d502ab78cd4f306f529',
            sourceArtifactSha256: '2bda35b8174e9cf0a23ca1d33eb43fc7b1db16b1a39d90ebfeded7523cf92fd2',
            artifactSha256: '367274f4e0389a94e0ed0f56c5639265d20579a4e92c30aa5f3f34880f25aeb9',
            canonicalArtifactSha256: 'a1afb0a5b2c5d2d8d658c32c06f7f4c793dca8d62359a78f9db81799e78dff44',
            templateSha256: 'db78a594bc448cc7c2b8635a6ecc036fd551218579db17c49f42ff410e798f92',
            fill: false,
            codeBytes: 5228,
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
const ARTIFACTS = Object.freeze({
    pool: require('./artifacts/pool.json'),
    pool_hash_lock: require('./artifacts/pool_hash_lock.json'),
    ftlp_tbc20: require('./artifacts/ftlp_tbc20.json'),
    ftlp_tbc20_locktime: require('./artifacts/ftlp_tbc20_locktime.json'),
});
const sha256 = (data) => (0, node_crypto_1.createHash)('sha256').update(data).digest();
const verifiedArtifacts = new Set();
function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value))
            deepFreeze(child);
        Object.freeze(value);
    }
}
/** Validates the entire JSON (including ABI), then returns an immutable artifact. */
function getPool3Artifact(name) {
    if (!Object.prototype.hasOwnProperty.call(ARTIFACTS, name))
        throw new Error('Pool3: unknown artifact profile');
    const artifact = ARTIFACTS[name];
    if (verifiedArtifacts.has(name))
        return artifact;
    const manifest = exports.POOL3_ARTIFACT_MANIFEST.artifacts[name];
    if (sha256(JSON.stringify(artifact)).toString('hex') !== manifest.canonicalArtifactSha256 ||
        sha256(artifact.lock.hex).toString('hex') !== manifest.templateSha256 ||
        artifact.metadata.git_commit_hash !== COMPILER_COMMIT ||
        artifact.metadata.compiler_version !== '1.0.0') {
        throw new Error(`Pool3: frozen artifact integrity check failed: ${name}`);
    }
    deepFreeze(artifact);
    verifiedArtifacts.add(name);
    return artifact;
}
const CONTROLLER_TAIL = '76a9<self.Controller20>88ad516a09504f4f4c434f444532';
const CODE_END = Buffer.from('ad516a09504f4f4c434f444532', 'hex');
const TOKENS = /(<self\.(?:OriginalUTXO36|TbcFeeScriptHash32|FtTapeSize1)>)/;
function assertBytes(bytes, length, label) {
    if (!Buffer.isBuffer(bytes) || bytes.length !== length)
        throw new Error(`Pool3: ${label} must be exactly ${length} bytes`);
}
function assertPoolFtTapeSize(size, withLpLocktime = false) {
    const minimum = withLpLocktime ? 66 : 61;
    if (!Number.isSafeInteger(size) || size < minimum || size > 127)
        throw new Error(`Pool3: FT/LP Tape size must be ${minimum}-127 bytes`);
}
function templateFor(authorization) {
    if (authorization.kind === 'public')
        return getPool3Artifact('pool').lock.hex;
    const template = getPool3Artifact('pool_hash_lock').lock.hex;
    if (!template.endsWith(CONTROLLER_TAIL) ||
        (template.match(/<self\.Controller20>/g) ?? []).length !== 1) {
        throw new Error('Pool3: controller authorization replacement boundary changed');
    }
    return (template.slice(0, -CONTROLLER_TAIL.length) +
        '76a9' +
        (0, authorization_1.buildControllerMembershipScript)(authorization.controllerPubKeyHashes).toString('hex') +
        CODE_END.toString('hex'));
}
/** Instantiates only the pinned compiler template and the audited whitelist tail. */
function instantiatePoolCode(options) {
    if (!options || typeof options !== 'object')
        throw new Error('Pool3: Pool Code parameters are required');
    assertBytes(options.originalUTXO, 36, 'OriginalUTXO');
    assertBytes(options.tbcFeeScriptHash, 32, 'TbcFeeScriptHash (SHA256 of the P2PKH script)');
    assertPoolFtTapeSize(options.ftTapeSize);
    const authorization = (0, authorization_1.normalizePoolAuthorization)(options.authorization);
    const hex = templateFor(authorization)
        .replaceAll('<self.OriginalUTXO36>', `24${options.originalUTXO.toString('hex')}`)
        .replaceAll('<self.TbcFeeScriptHash32>', `20${options.tbcFeeScriptHash.toString('hex')}`)
        .replaceAll('<self.FtTapeSize1>', `01${options.ftTapeSize.toString(16).padStart(2, '0')}`);
    if (!/^[0-9a-f]+$/.test(hex) || hex.length % 2 !== 0)
        throw new Error('Pool3: unresolved constructor placeholder');
    return tbc.Script.fromHex(hex);
}
function parseBody(bytes, template) {
    let offset = 0;
    const values = new Map();
    for (const segment of template.split(TOKENS)) {
        if (TOKENS.test(segment)) {
            const length = segment === '<self.OriginalUTXO36>' ? 36 : segment === '<self.TbcFeeScriptHash32>' ? 32 : 1;
            if (bytes[offset] !== length || offset + 1 + length > bytes.length)
                throw new Error('Pool3: noncanonical constructor push');
            const value = Buffer.from(bytes.subarray(offset + 1, offset + 1 + length));
            const previous = values.get(segment);
            if (previous && !previous.equals(value))
                throw new Error('Pool3: inconsistent repeated constructor parameter');
            values.set(segment, value);
            offset += length + 1;
        }
        else {
            const expected = Buffer.from(segment, 'hex');
            if (!bytes.subarray(offset, offset + expected.length).equals(expected))
                throw new Error(`Pool3: unrecognized Pool template at byte ${offset}`);
            offset += expected.length;
        }
    }
    return { offset, values };
}
/** Rejects any changed body, extra branch, noncanonical push, or forged marker. */
function parsePoolCode(script) {
    const bytes = Buffer.isBuffer(script)
        ? Buffer.from(script)
        : script instanceof tbc.Script
            ? script.toBuffer()
            : undefined;
    if (!bytes)
        throw new Error('Pool3: Pool Code must be a Buffer or Script');
    for (const name of ['pool', 'pool_hash_lock']) {
        const artifact = getPool3Artifact(name);
        try {
            const template = name === 'pool'
                ? artifact.lock.hex
                : artifact.lock.hex.slice(0, -CONTROLLER_TAIL.length) + '76a9';
            const body = parseBody(bytes, template);
            let authorization;
            if (name === 'pool') {
                if (body.offset !== bytes.length)
                    continue;
                authorization = { kind: 'public' };
            }
            else {
                if (!artifact.lock.hex.endsWith(CONTROLLER_TAIL) ||
                    !bytes.subarray(-CODE_END.length).equals(CODE_END))
                    continue;
                const hashes = (0, authorization_1.parseControllerMembershipScript)(bytes.subarray(body.offset, bytes.length - CODE_END.length));
                authorization = { kind: 'controller', controllerPubKeyHashes: hashes };
            }
            const originalUTXO = body.values.get('<self.OriginalUTXO36>');
            const tbcFeeScriptHash = body.values.get('<self.TbcFeeScriptHash32>');
            const tape = body.values.get('<self.FtTapeSize1>');
            if (!originalUTXO || !tbcFeeScriptHash || !tape)
                continue;
            const parameters = {
                originalUTXO,
                tbcFeeScriptHash,
                ftTapeSize: tape[0],
                authorization,
            };
            if (!instantiatePoolCode(parameters).toBuffer().equals(bytes))
                continue;
            return {
                ...parameters,
                poolCodeHash: sha256(bytes),
                profile: name === 'pool' ? 'pool3-public-v1' : authorization_1.POOL3_WHITELIST_PROFILE,
            };
        }
        catch (_error) {
            /* Try the other pinned profile, never an arbitrary script. */
        }
    }
    throw new Error('Pool3: script does not match a supported canonical Pool Code template');
}
