'use strict';

// No archive, installation, network request, or test transaction is produced.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const publicPool3Exports = [
  'PoolNFT3', 'poolNFT3', 'FTLPTBC20', 'privateKeySigner', 'decodePoolTape',
  'resolveSwapFeePolicy', 'calculateSwapFees', 'deriveFeeRecipient', 'validatePool3Transaction',
];
const existingExports = [
  'version', 'versionGuard', 'FT', 'TBC20', 'TokenValidator', 'TokenValidationError',
  'poolNFT', 'poolNFT2', 'API', 'NFT', 'MultiSig', 'piggyBank', 'orderBook', 'HTLC', 'stableCoin',
  'buildUTXO', 'buildFtPrePreTxData', 'getFtBalanceFromTape', 'selectTXfromLocal', 'fetchInBatches',
  'fetchWithRetry', 'getOpCode', 'getLpCostAddress', 'getLpCostAmount', 'isLock', 'fetchTBCLockTime',
  'safeJSONParse', 'parseDecimalToBigInt', 'fillCharLengthInFT', 'isCoinCodeScript',
];

function loadTypeScript() {
  try { return require('typescript'); } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    // The development image can supply tsc globally before npm install.
    const locate = process.platform === 'win32' ? 'where' : 'which';
    const executable = execFileSync(locate, ['tsc'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
    const real = fs.realpathSync(executable);
    return require(path.resolve(path.dirname(real), '../lib/typescript.js'));
  }
}

function assertNoDiagnostics(ts, diagnostics) {
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: name => name, getCurrentDirectory: () => root, getNewLine: () => '\n',
  }));
}

function compilerOptions(ts) {
  const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
  assertNoDiagnostics(ts, config.error ? [config.error] : []);
  const parsed = ts.convertCompilerOptionsFromJson(config.config.compilerOptions, root);
  assertNoDiagnostics(ts, parsed.errors);
  return { ...parsed.options, strict: true, noEmit: true, target: ts.ScriptTarget.ES2022 };
}

/** Virtual sources let CI check consumers and declaration parity without another config or generated file. */
function typeCheck(ts, rootNames, virtual = new Map(), publicationRoot) {
  const options = compilerOptions(ts);
  const host = ts.createCompilerHost(options);
  const original = { fileExists: host.fileExists.bind(host), readFile: host.readFile.bind(host),
    getSourceFile: host.getSourceFile.bind(host), directoryExists: host.directoryExists?.bind(host) };
  const publicationOnly = name => publicationRoot && name.startsWith(publicationRoot + path.sep);
  host.fileExists = name => virtual.has(name) || (!publicationOnly(name) && original.fileExists(name));
  host.readFile = name => virtual.get(name) ?? (publicationOnly(name) ? undefined : original.readFile(name));
  host.directoryExists = name => [...virtual.keys()].some(file => file.startsWith(name + path.sep)) ||
    (!publicationOnly(name) && !!original.directoryExists?.(name));
  host.getSourceFile = (name, languageVersion, onError, shouldCreate) => virtual.has(name)
    ? ts.createSourceFile(name, virtual.get(name), languageVersion, true)
    : publicationOnly(name) ? undefined : original.getSourceFile(name, languageVersion, onError, shouldCreate);
  // Virtual npm consumers still resolve their real peer dependency from this checkout.
  host.resolveModuleNames = (names, containingFile) => names.map(name => ts.resolveModuleName(name,
    name === 'tbc-lib-js' ? path.join(root, 'index.d.ts') : containingFile, options, host).resolvedModule);
  const program = ts.createProgram(rootNames, options, host);
  assertNoDiagnostics(ts, ts.getPreEmitDiagnostics(program));
  return program;
}

test('CommonJS root exposes only the supported Pool3 API and preserves every existing export', () => {
  const sdk = require('../..');
  assert.deepEqual(Object.keys(sdk).sort(), [...existingExports, ...publicPool3Exports].sort());
  for (const name of [...existingExports.filter(name => name !== 'version' && name !== 'HTLC'), ...publicPool3Exports]) {
    assert.equal(typeof sdk[name], 'function', name);
  }
  assert.equal(sdk.PoolNFT3, sdk.poolNFT3);
  assert.equal(typeof sdk.HTLC, 'object');
  assert.equal(sdk.calculateSwapFees(1000000n, sdk.resolveSwapFeePolicy()).totalFeeSat, 3500n);
});

test('npm publication needs only index.d.ts, compiled code and the four frozen artifacts', () => {
  const data = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))[0];
  const files = new Set(data.files.map(file => file.path));
  for (const name of ['pool', 'pool_hash_lock', 'ftlp_tbc20', 'ftlp_tbc20_locktime']) {
    assert(files.has(`lib/util/poolnft3/artifacts/${name}.json`));
  }
  assert.deepEqual([...files].filter(name => name.endsWith('.d.ts')), ['index.d.ts']);
  for (const name of ['lib/contract/poolNFT3.0.js', 'lib/contract/ftlpTbc20.js',
    'lib/util/poolnft3/transaction.js', 'lib/validator/poolnft3.js']) assert(files.has(name), name);
  assert(![...files].some(name => name.endsWith('.ts') && !name.endsWith('.d.ts')), 'TypeScript implementation sources must not be needed at runtime');
  assert(![...files].some(name => name.startsWith('tests/') || name.startsWith('test/')), 'Offline fixtures must not enter the npm package');

  const ts = loadTypeScript();
  // Check every relative declaration dependency before type-checking. This also
  // catches missing imports that skipLibCheck could otherwise hide.
  for (const name of files) {
    if (!name.endsWith('.d.ts')) continue;
    const source = fs.readFileSync(path.join(root, name), 'utf8');
    for (const imported of ts.preProcessFile(source).importedFiles) {
      if (!imported.fileName.startsWith('.')) continue;
      const stem = path.posix.normalize(path.posix.join(path.posix.dirname(name), imported.fileName));
      const declaration = stem.endsWith('.js') ? stem.slice(0, -3) + '.d.ts' : stem.endsWith('.d.ts') ? stem : stem + '.d.ts';
      assert(files.has(declaration) || files.has(stem + '/index.d.ts'), `${name} needs unpublished declaration ${declaration}`);
    }
  }

  // Compile against an in-memory publication view. No source .ts files from
  // lib are visible, so workspace sources cannot mask missing package types.
  const virtualRoot = path.join(os.tmpdir(), 'tbc-contract-pool3-publication-view');
  const virtual = new Map();
  for (const name of files) {
    if (name.endsWith('.d.ts')) virtual.set(path.join(virtualRoot, name), fs.readFileSync(path.join(root, name), 'utf8'));
  }
  const consumer = path.join(virtualRoot, 'test/pool3/pool3-types.test.ts');
  virtual.set(consumer, fs.readFileSync(path.join(__dirname, 'pool3-types.test.ts'), 'utf8'));
  const program = typeCheck(ts, [consumer], virtual, virtualRoot);
  const loadedTypes = program.getSourceFiles().filter(file => file.fileName.startsWith(virtualRoot + path.sep) && file.isDeclarationFile);
  assert.deepEqual(loadedTypes.map(file => file.fileName), [path.join(virtualRoot, 'index.d.ts')]);
});

test('Pool3 implementation is strict and its public types match index.d.ts in both directions', () => {
  const ts = loadTypeScript();
  const productionRoots = ['lib/contract/poolNFT3.0.ts', 'lib/contract/ftlpTbc20.ts',
    'lib/util/ftlpTbc20unlock.ts', 'lib/validator/poolnft3.ts',
    ...fs.readdirSync(path.join(root, 'lib/util/poolnft3')).filter(name => name.endsWith('.ts') && !name.endsWith('.d.ts'))
      .map(name => `lib/util/poolnft3/${name}`)].map(name => path.join(root, name));
  const compatibilityFile = path.join(__dirname, '__pool3-public-type-compatibility__.ts');
  const source = `
    import type * as Published from '../../index';
    import type * as Pool from '../../lib/contract/poolNFT3.0';
    import type * as LP from '../../lib/contract/ftlpTbc20';
    import type * as Signing from '../../lib/util/poolnft3/transaction';
    import type * as Tape from '../../lib/util/poolnft3/tape';
    import type * as Fees from '../../lib/util/poolnft3/fees';
    import type * as Validation from '../../lib/validator/poolnft3';
    type Public<T> = Pick<T, keyof T>;
    // Only implementation-private class members are erased. Every public argument,
    // return value and property is still checked in both directions.
    type Result<T> = T extends Pool.PoolNFT3 ? Surface<T> :
      T extends Pool.PreparedPool3Operation ? Public<T> : T;
    type Surface<T> = { [K in keyof T]: T[K] extends (...args: infer A) => infer R
      ? (...args: A) => Result<R> : T[K] };
    declare let implementation: {
      pool: Surface<Pool.PoolNFT3>;
      poolStatic: Surface<Omit<typeof Pool.PoolNFT3, 'prototype'>>;
      constructorArguments: ConstructorParameters<typeof Pool.PoolNFT3>;
      prepared: Public<Pool.PreparedPool3Operation>;
      lp: Omit<typeof LP.FTLPTBC20, 'prototype'>;
      signer: typeof Signing.privateKeySigner;
      decode: typeof Tape.decodePoolTape;
      policy: typeof Fees.resolveSwapFeePolicy;
      calculate: typeof Fees.calculateSwapFees;
      recipient: typeof Fees.deriveFeeRecipient;
      validate: typeof Validation.validatePool3Transaction;
    };
    declare let publication: {
      pool: Surface<Published.PoolNFT3>;
      poolStatic: Surface<Omit<typeof Published.PoolNFT3, 'prototype'>>;
      constructorArguments: ConstructorParameters<typeof Published.PoolNFT3>;
      prepared: Published.PreparedPool3Operation;
      lp: Omit<typeof Published.FTLPTBC20, 'prototype'>;
      signer: typeof Published.privateKeySigner;
      decode: typeof Published.decodePoolTape;
      policy: typeof Published.resolveSwapFeePolicy;
      calculate: typeof Published.calculateSwapFees;
      recipient: typeof Published.deriveFeeRecipient;
      validate: typeof Published.validatePool3Transaction;
    };
    implementation = publication;
    publication = implementation;
  `;
  const program = typeCheck(ts, [...productionRoots, compatibilityFile], new Map([[compatibilityFile, source]]));
  for (const file of productionRoots) assert(program.getSourceFile(file) && !program.getSourceFile(file).isDeclarationFile, file);
});
