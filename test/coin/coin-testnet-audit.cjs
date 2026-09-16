'use strict';

// Independent offline evidence audit. Does not import a campaign runner, load
// wallet secrets, call a network API, sign, or broadcast. Only --write-report
// writes a file, after the complete audit has passed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const tbc = require('tbc-lib-js');
const { CoinTBC20: Coin } = require('../../lib/contract/coinTbc20.js');
const TBC721 = require('../../lib/contract/tbc721.js');

const ROOT = path.resolve(__dirname, '../..');
const DIRECTORY = path.resolve(ROOT, 'test/coin-testnet-20260916-r1');
const ENDPOINT = 'https://api.tbcdev.org/api/tbc/';
const ARTIFACT_FILE = 'lib/util/coin_tbc20.json';
const ARTIFACT = require('../../lib/util/coin_tbc20.json');
const ABI = ARTIFACT.unlock.main.match(/<[^>]+>/g);
const PUBLIC_KEY_INDEX = ABI.indexOf('<publicKey>');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const sum = values => values.reduce((total, value) => total + BigInt(value), 0n);
const json = value => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item, 2);
const marker = (script, text) => script.toBuffer().subarray(-text.length).equals(Buffer.from(text));
const outpoint = input => `${input.prevTxId.toString('hex')}:${input.outputIndex}`;

// Both issuance certificate templates have only the original funding outpoint
// as a variable. Match the complete Code, rather than trusting a tail marker.
const NFT_BEFORE = 'OP_1 OP_PICK OP_3 OP_SPLIT 0x01 0x14 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_OVER OP_TOALTSTACK OP_TOALTSTACK OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_OVER 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_HASH256 OP_6 OP_PUSH_META 0x01 0x20 OP_SPLIT OP_4 OP_SPLIT OP_DROP OP_BIN2NUM OP_0 OP_EQUALVERIFY OP_EQUALVERIFY OP_OVER OP_TOALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP 0x01 0x20 OP_SPLIT OP_BIN2NUM OP_TOALTSTACK OP_3 OP_ROLL OP_EQUALVERIFY OP_SWAP OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_ROT OP_EQUAL OP_IF OP_0 OP_EQUALVERIFY OP_DROP OP_ELSE OP_DROP 0x24 ';
const NFT_AFTER = ' OP_EQUALVERIFY OP_ENDIF OP_OVER OP_FROMALTSTACK OP_EQUALVERIFY OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_DUP OP_HASH160 OP_FROMALTSTACK OP_EQUALVERIFY OP_CHECKSIG OP_RETURN 0x05 0x33436f6465';

function certificate(tx) {
  if (!tx.outputs[0]) return null;
  const current = marker(tx.outputs[0].script, 'TBC721CODE3');
  if (!current && !marker(tx.outputs[0].script, '3Code')) return null;
  const [code, hold, tape] = tx.outputs;
  assert(hold && tape, 'issuer must have Code/Hold/Tape outputs');
  let root;
  if (current) {
    root = TBC721.parseCode(code.script).originalUTXO;
  } else {
    const roots = code.script.chunks.filter(chunk => chunk.buf?.length === 36);
    assert.equal(roots.length, 1, 'issuer template has one funding outpoint');
    root = roots[0].buf;
    const expected = new tbc.Script(NFT_BEFORE + '0x' + root.toString('hex') + NFT_AFTER);
    assert.equal(code.script.toHex(), expected.toHex(), 'complete real Coin NFT template');
  }
  assert.equal(code.satoshis, 200); assert.equal(hold.satoshis, 100); assert.equal(tape.satoshis, 0);
  const hc = hold.script.chunks, tc = tape.script.chunks;
  assert.equal(hc.length, 7, 'issuer Hold shape');
  assert.deepEqual(hc.map(c => c.opcodenum).slice(0, 5), [0x76, 0xa9, 20, 0x88, 0xac]);
  assert.equal(hc[5].opcodenum, 0x6a); assert(hc[6].buf?.toString().endsWith(' NHold'));
  assert(tape.script.isSafeDataOut()); assert.equal(tc.length, 4);
  assert.equal(tc[3].buf?.toString(), 'NTape');
  const metadata = JSON.parse(tc[2].buf.toString('utf8'));
  assert(typeof metadata.coinTotalSupply === 'string' && /^(0|[1-9][0-9]*)$/.test(metadata.coinTotalSupply));
  assert(Number.isInteger(metadata.coinDecimal) && metadata.coinDecimal >= 0 && metadata.coinDecimal <= 18);
  return { hash: sha(code.script.toBuffer()), supply: BigInt(metadata.coinTotalSupply), metadata,
    adminHash: hc[2].buf.toString('hex'), root, txid: tx.id };
}

function coins(tx) {
  return tx.outputs.flatMap((output, vout) => {
    if (!marker(output.script, 'COINTBC20CODE2')) return [];
    const code = Coin.parseCode(output.script), tapeOutput = tx.outputs[vout + 1];
    assert(tapeOutput, 'Coin Code must have an adjacent Tape');
    const tape = Coin.parseTape(tapeOutput.script, code);
    assert.equal(output.satoshis, 500); assert.equal(tapeOutput.satoshis, 0);
    assert.equal(code.codeSize, 2981); assert(tapeOutput.script.isSafeDataOut());
    assert(tape.balance > 0n, 'campaign Coin outputs carry positive balances');
    assert.equal(tbc.Script.fromBuffer(tapeOutput.script.toBuffer()).toHex(), tapeOutput.script.toHex());
    return [{ vout, identity: code.identity.toString('hex'), code, ...tape }];
  });
}

function verifyInputs(tx, transactions) {
  assert.equal(tx.version, 10); assert(tx.inputs.length && tx.outputs.length);
  const seen = new Set();
  for (const input of tx.inputs) {
    assert(!seen.has(outpoint(input)), 'duplicate input inside transaction'); seen.add(outpoint(input));
    const parent = transactions.get(input.prevTxId.toString('hex'));
    const previous = parent?.outputs[input.outputIndex];
    assert(previous, 'raw evidence must contain every real input prevout');
    assert(Number.isSafeInteger(previous.satoshis) && previous.satoshis >= 0);
    input.output = new tbc.Transaction.Output({ satoshis: previous.satoshis,
      script: tbc.Script.fromBuffer(Buffer.from(previous.script.toBuffer())) });
  }
  const Interpreter = tbc.Script.Interpreter;
  const settings = [Interpreter.MAX_SCRIPT_ELEMENT_SIZE, Interpreter.MAXIMUM_ELEMENT_SIZE, console.log];
  Interpreter.MAX_SCRIPT_ELEMENT_SIZE = Number.MAX_SAFE_INTEGER;
  Interpreter.MAXIMUM_ELEMENT_SIZE = Number.MAX_SAFE_INTEGER;
  console.log = () => {};
  let inputs;
  try {
    inputs = tx.inputs.map((input, inputIndex) => {
      const vm = new Interpreter();
      const ok = vm.verify(input.script, input.output.script, tx, inputIndex, Interpreter.DEFAULT_FLAGS, input.output.satoshisBN);
      return { inputIndex, success: ok && vm.stack.length === 1,
        error: vm.errstr || (ok && vm.stack.length !== 1 ? 'non-clean final main stack' : ''),
        stackDepth: vm.stack.length, altStackDepth: vm.altstack.length };
    });
  } finally {
    [Interpreter.MAX_SCRIPT_ELEMENT_SIZE, Interpreter.MAXIMUM_ELEMENT_SIZE, console.log] = settings;
  }
  tx.outputs.forEach(output => assert(Number.isSafeInteger(output.satoshis) && output.satoshis >= 0));
  const feeSat = sum(tx.inputs.map(input => input.output.satoshis)) - sum(tx.outputs.map(output => output.satoshis));
  assert(feeSat >= 0n && feeSat <= 100000n, 'per-transaction fee is within campaign bounds');
  return { inputs, feeSat, bytes: tx.uncheckedSerialize().length / 2 };
}

function verifyProvenance(config) {
  const artifactRaw = fs.readFileSync(path.join(ROOT, ARTIFACT_FILE));
  assert([sha(artifactRaw), sha(JSON.stringify(ARTIFACT))].includes(config.artifactSHA), 'recorded Coin artifact SHA256 matches current artifact');
  assert(config.sdkFiles && Object.keys(config.sdkFiles).length > 0, 'SDK file hashes are required');
  for (const [relative, hash] of Object.entries(config.sdkFiles)) {
    const file = path.resolve(ROOT, relative);
    assert(file.startsWith(ROOT + path.sep) && !path.isAbsolute(relative), 'SDK hash path must stay in repository');
    assert.equal(sha(fs.readFileSync(file)), hash, `recorded SDK file differs: ${relative}`);
  }
  assert(config.signerPublicKeys && Object.keys(config.signerPublicKeys).length > 0, 'public signer identities are required');
  for (const publicKey of Object.values(config.signerPublicKeys)) assert(/^(?:[0-9a-f]{64}|(?:02|03)[0-9a-f]{64})$/.test(publicKey), 'public key must be x-only or compressed');
  return { artifactSHA: config.artifactSHA, sdkFiles: config.sdkFiles, signerPublicKeys: config.signerPublicKeys };
}

function auditCeremonies(events, config) {
  const ceremonies = events.filter(event => event.type === 'musig2-signature');
  const participants = new Set(), nonces = new Set(), messages = new Set(), aggregateKeys = new Set();
  for (const event of ceremonies) {
    assert(Number.isInteger(event.inputIndex) && event.inputIndex >= 0, 'MuSig2 input index');
    assert(/^[0-9a-f]{64}$/.test(event.sighash), 'MuSig2 32-byte message');
    assert(/^[0-9a-f]{64}$/.test(event.aggregatePublicKey), 'MuSig2 32-byte aggregate public key');
    assert(Array.isArray(event.participants) && event.participants.length === 2 && new Set(event.participants).size === 2,
      'MuSig2 ceremony has two distinct participants');
    assert(Array.isArray(event.publicNonces) && event.publicNonces.length === 2, 'MuSig2 ceremony has two public nonces');
    assert.equal(event.partialVerified, true, 'runner records successful partial verification');
    assert.equal(event.aggregateVerified, true, 'runner records successful aggregate verification');
    for (const [index, participant] of event.participants.entries()) {
      assert(/^(?:02|03)[0-9a-f]{64}$/.test(participant), 'MuSig2 participant is a compressed public key');
      tbc.PublicKey.fromBuffer(Buffer.from(participant, 'hex'));
      const nonce = event.publicNonces[index];
      assert(/^(?:(?:02|03)[0-9a-f]{64}){2}$/.test(nonce), 'MuSig2 public nonce contains two compressed curve points');
      const bytes = Buffer.from(nonce, 'hex');
      tbc.PublicKey.fromBuffer(bytes.subarray(0, 33)); tbc.PublicKey.fromBuffer(bytes.subarray(33));
      const reference = `${participant}:${nonce}`;
      assert(!nonces.has(reference), 'MuSig2 participant reused a public nonce across signing calls');
      nonces.add(reference); participants.add(participant);
    }
    const M = tbc.crypto.MuSig2, pubkeys = event.participants.map(publicKey => Buffer.from(publicKey, 'hex'));
    const aggregate = M.getAggPubkey(M.keyAgg(M.keySort(pubkeys))).toString('hex');
    assert.equal(aggregate, event.aggregatePublicKey, 'recorded participants independently reproduce aggregate public key');
    if (config.aggregateAdmin !== undefined) assert.equal(aggregate, config.aggregateAdmin, 'ceremony aggregate matches campaign administrator');
    messages.add(event.sighash); aggregateKeys.add(aggregate);
  }
  return { messages: ceremonies.length, distinctSighashes: messages.size, participants: participants.size,
    participations: nonces.size, duplicatePublicNonces: 0, aggregatePublicKeys: [...aggregateKeys],
    aggregateKeysIndependentlyRecomputed: true,
    verificationScope: 'Nonce shapes, per-participant uniqueness and aggregate public keys are independently checked. partialVerified and aggregateVerified are runner-reported booleans; partial signatures are not present for independent verification. Accepted raw input signatures are independently executed by the VM.' };
}

function verifyObservation(event, tx) {
  assert.equal(event.rawMatches, true); assert(Number.isInteger(event.confirmations) && event.confirmations >= 0);
  if (event.lockTime !== undefined) assert.equal(event.lockTime, tx.nLockTime, 'observed lock time matches saved raw');
  if (event.observedTip !== undefined) assert(Number.isInteger(event.observedTip) && event.observedTip >= 0);
  if (event.confirmations === 0) {
    assert(event.blockhash == null && event.blockheight == null, 'unconfirmed observation has no confirmed block');
    return;
  }
  assert(/^[0-9a-f]{64}$/.test(event.blockhash), 'confirmation requires recorded block identity');
  assert(Number.isInteger(event.blockheight) && event.blockheight > 0, 'confirmation requires recorded positive block height');
  assert.equal(event.blockMembershipVerified, true, 'observer records block membership verification');
  if (!tx.nLockTime || !tx.inputs.some(input => input.sequenceNumber !== 0xffffffff)) return;
  if (tx.nLockTime < 500000000) {
    assert(tx.nLockTime < event.blockheight, 'recorded confirming height strictly satisfies transaction lock');
    return;
  }
  const finality = event.timestampFinality;
  assert(finality?.verified === true && Array.isArray(finality.headers) && finality.headers.length === 11,
    'confirmed timestamp lock requires eleven recorded previous block headers');
  assert.equal(new Set(finality.headers.map(header => header.hash)).size, 11, 'previous headers are distinct');
  for (const [index, header] of finality.headers.entries()) {
    assert(/^[0-9a-f]{64}$/.test(header.hash) && /^[0-9a-f]{64}$/.test(header.previoushash));
    assert.equal(header.height, event.blockheight - index - 1, 'previous header heights are consecutive');
    assert(Number.isInteger(header.time) && header.time >= 0 && header.time <= 0xffffffff);
    if (index < 10) assert.equal(header.previoushash, finality.headers[index + 1].hash, 'recorded previous headers link by hash');
  }
  if (event.blockPreviousHash !== undefined) assert.equal(event.blockPreviousHash, finality.headers[0].hash, 'previous header chain is bound to recorded confirming block');
  const median = finality.headers.map(header => header.time).sort((a, b) => a - b)[5];
  assert.equal(finality.previousBlockMTP, median, 'recorded MTP equals independently computed median');
  assert(tx.nLockTime < median, 'recorded previous-block MTP strictly satisfies transaction lock');
}

function auditCoinJournal(directory = DIRECTORY) {
  const source = fs.readFileSync(path.join(directory, 'journal.jsonl'), 'utf8');
  const completeLength = source.lastIndexOf('\n') + 1;
  assert(completeLength > 0, 'journal has no complete record');
  const events = source.slice(0, completeLength).trim().split('\n').map(JSON.parse);
  const configs = events.filter(event => event.type === 'campaign-init');
  assert.equal(configs.length, 1, 'one campaign-init is required');
  const config = configs[0];
  assert.equal(config.network, 'testnet'); assert.equal(config.endpoint, ENDPOINT);
  assert(BigInt(config.allocatedSat) > 0n && BigInt(config.allocatedSat) <= 1000000n, 'campaign allocation is at most one million satoshis');
  assert(config.wallet && config.funding && /^[0-9a-f]{64}$/.test(config.funding.txid));
  assert(Number.isInteger(config.funding.index) && config.funding.index >= 0);
  assert(BigInt(config.allocatedSat) <= BigInt(config.funding.value));
  const provenance = verifyProvenance(config);
  const musig2 = auditCeremonies(events, config);
  const transactions = new Map(), transactionCoins = new Map();
  const rawEventTypes = new Set(['parent', 'prepared', 'broadcast-attempt', 'accepted', 'rejected', 'replay-verified']);
  for (const id of new Set(events.filter(event => rawEventTypes.has(event.type)).map(event => event.txid))) {
    assert(/^[0-9a-f]{64}$/.test(id), 'raw transaction id');
    const raw = fs.readFileSync(path.join(directory, `${id}.raw`), 'utf8');
    assert(/^(?:[0-9a-f]{2})+$/.test(raw), 'raw file is exact lowercase hex without whitespace');
    const tx = new tbc.Transaction(raw);
    assert.equal(tx.id, id, 'raw filename matches transaction id');
    assert.equal(tx.uncheckedSerialize(), raw, 'raw serialization round-trip');
    transactions.set(id, tx);
  }
  const funding = transactions.get(config.funding.txid)?.outputs[config.funding.index];
  assert(funding, 'funding raw output exists'); assert.equal(BigInt(funding.satoshis), BigInt(config.funding.value));
  assert.equal(funding.script.toHex(), tbc.Script.buildPublicKeyHashOut(config.wallet).toHex(), 'funding belongs to recorded campaign wallet');
  const externalFunding = `${config.funding.txid}:${config.funding.index}`;
  const known = new Set(), acceptedIds = new Set(), spent = new Set(), pending = new Set();
  const prepared = new Map(), responses = new Map();
  const supplies = new Map(), certificates = new Map(), accepted = [], rejections = [], observations = new Map();
  const inputLocks = new Set(), outputLocks = new Set(), attemptedLocks = new Set(), tapeSizes = new Set();
  const branches = { administrator: 0, address: 0, contract: 0 };
  const lockCoverage = new Map();
  const lockEntry = lockTime => {
    if (!lockCoverage.has(lockTime)) lockCoverage.set(lockTime, { lockTime, outputs: 0, administratorSpends: 0, addressSpends: 0, contractSpends: 0 });
    return lockCoverage.get(lockTime);
  };
  let minerFeesSat = 0n, acceptedInputs = 0, maxInputs = 0, maxCoinInputs = 0, maxBytes = 0, minFeeRateSatPerKB = Infinity;

  const getCoins = tx => {
    if (!transactionCoins.has(tx.id)) transactionCoins.set(tx.id, coins(tx));
    return transactionCoins.get(tx.id);
  };
  for (const event of events) {
    if (event.type === 'parent') { known.add(event.txid); continue; }
    if (event.type === 'prepared') { prepared.set(event.txid, event); continue; }
    if (event.type === 'broadcast-attempt') {
      assert(prepared.has(event.txid), 'attempt must follow prepared evidence');
      assert.equal(event.endpoint, ENDPOINT + 'broadcasttx');
      assert.equal(pending.size, 0, 'unknown attempt must be reconciled before further broadcasts');
      pending.add(event.txid); continue;
    }
    if (event.type === 'broadcast-response') { assert(pending.has(event.txid)); responses.set(event.txid, event); continue; }
    if (event.type === 'chain-observation') {
      assert(acceptedIds.has(event.txid), 'observation must refer to an accepted transaction');
      verifyObservation(event, transactions.get(event.txid));
      observations.set(event.txid, event); continue;
    }
    if (event.type === 'replay-verified') {
      assert(pending.has(event.txid) && acceptedIds.has(event.txid));
      assert.equal(event.rawMatches, true); pending.delete(event.txid); continue;
    }
    if (!['accepted', 'rejected'].includes(event.type)) continue;
    assert(pending.has(event.txid), 'outcome must follow a pending attempt');
    const tx = transactions.get(event.txid), prep = prepared.get(event.txid), response = responses.get(event.txid);
    assert(prep && response, 'outcome requires preparation and node response');
    for (const input of tx.inputs) assert(known.has(input.prevTxId.toString('hex')), 'child appears before its accepted parent');
    const inspection = verifyInputs(tx, transactions);
    attemptedLocks.add(tx.nLockTime);
    assert.equal(inspection.feeSat, BigInt(prep.feeSat)); assert.equal(inspection.bytes, prep.bytes);
    const failures = inspection.inputs.filter(input => !input.success).map(input => input.inputIndex);
    assert.deepEqual(failures, prep.expectedLocalFailures || [], `${event.label}: actual failing input indices differ from intended probe`);
    // A contract-controller P2PKH input may also fund the fee at vin 0, with
    // Coin at vin 1. Check actual prevout scripts, not a last-input convention.
    const feeVins = tx.inputs.flatMap((input, vin) => input.output.script.isPublicKeyHashOut() ? [vin] : []);
    assert(feeVins.length > 0, 'campaign transaction has a real P2PKH fee prevout');
    assert(feeVins.every(vin => inspection.inputs[vin].success), 'fee input must pass, including negative probes');
    const nodeSuccess = response.status >= 200 && response.status < 300 && String(response.body?.code) === '200' && response.body?.data?.txid === tx.id;
    if (event.type === 'rejected') {
      assert(!nodeSuccess && response.body?.error === 'BROADCAST_REJECTED', 'rejection must have an explicit node rejection');
      const reason = response.body?.data?.error || '';
      assert(/^RPC error -26: /.test(reason), 'rejection carries a deterministic node policy/script error');
      if (failures.length > 0) assert(/\bmandatory-script-verify-flag-failed\b|\bScript failed\b/i.test(reason),
        'script negative requires explicit node script-failure evidence; a policy rejection does not prove the script was evaluated');
      if (/non-final|nonfinal|non-BIP68-final/i.test(reason)) assert.equal(failures.length, 0, 'finality-policy rejection is not a script failure');
      rejections.push({ txid: tx.id, label: event.label, reason, failures,
        kind: failures.length ? 'script' : 'policy-or-conflict', inputs: inspection.inputs });
      pending.delete(event.txid); continue;
    }
    assert(nodeSuccess, 'accepted outcome must match a successful node acknowledgement');
    assert.equal(event.rawRetrieved, true, 'acceptance includes exact raw retrieval');
    assert.equal(failures.length, 0); assert.equal(inspection.feeSat, BigInt(event.feeSat));
    assert(!acceptedIds.has(tx.id), 'accepted transaction cannot be counted twice');
    for (const input of tx.inputs) {
      assert(!spent.has(outpoint(input)), 'accepted double spend');
      assert(acceptedIds.has(input.prevTxId.toString('hex')) || outpoint(input) === externalFunding,
        'all external value must come from the single declared funding outpoint');
      spent.add(outpoint(input));
    }
    const outgoing = getCoins(tx), incoming = [];
    for (const [vin, input] of tx.inputs.entries()) {
      const parent = transactions.get(input.prevTxId.toString('hex'));
      const coin = getCoins(parent).find(item => item.vout === input.outputIndex);
      if (!coin) continue;
      incoming.push({ ...coin, vin }); inputLocks.add(coin.lockTime);
      assert.equal(input.sequenceNumber, 0xfffffffe, 'Coin input itself must use non-final sequence');
      assert.equal(input.script.chunks.length, 123, 'full Coin ABI remains in use');
      assert.equal(sum(outgoing.filter(item => item.identity === coin.identity).map(item => item.amounts[vin])), coin.balance,
        'Coin conservation follows its physical input slot');
      const pub = input.script.chunks[PUBLIC_KEY_INDEX]?.buf;
      assert(pub, 'Coin public key ABI field');
      const administrator = tbc.crypto.Hash.sha256ripemd160(pub).toString('hex') === coin.code.adminPubKeyHash.toString('hex');
      const branch = administrator ? 'administrator' : coin.code.controller[20] === 0 ? 'address' : 'contract';
      branches[branch]++; lockEntry(coin.lockTime)[branch + 'Spends']++;
    }
    const nft = certificate(tx);
    if (nft) {
      const previous = tx.inputs[0].outputIndex === 0 ? certificate(transactions.get(tx.inputs[0].prevTxId.toString('hex'))) : null;
      if (previous) {
        assert.equal(previous.hash, nft.hash, 'issuer Code continuity');
        assert.equal(previous.adminHash, nft.adminHash, 'issuer Hold administrator continuity');
        assert.equal(tx.inputs[1].prevTxId.toString('hex'), previous.txid); assert.equal(tx.inputs[1].outputIndex, 1);
        assert(nft.supply >= previous.supply, 'issuer cumulative supply cannot decrease');
      } else {
        const root = Buffer.alloc(36); Buffer.from(tx.inputs[0].prevTxId).reverse().copy(root);
        root.writeUInt32LE(tx.inputs[0].outputIndex, 32);
        assert(nft.root.equals(root), 'issuer creation binds actual funding outpoint'); assert.equal(nft.supply, 0n);
      }
      certificates.set(nft.hash, nft);
    }
    for (const identity of new Set([...incoming, ...outgoing].map(item => item.identity))) {
      const outputs = outgoing.filter(item => item.identity === identity), inputs = incoming.filter(item => item.identity === identity);
      const incomingRaw = sum(inputs.map(item => item.balance)), outgoingRaw = sum(outputs.map(item => item.balance));
      const descriptor = (outputs[0] || inputs[0]).code, hash = descriptor.coinNftCodeHash.toString('hex');
      const entry = supplies.get(identity) || { identity, issuerCodeHash: hash, adminPubKeyHash: descriptor.adminPubKeyHash.toString('hex'), issuedRaw: 0n, issuanceTransactions: [] };
      if (outgoingRaw !== incomingRaw) {
        assert.equal(incomingRaw, 0n, 'issuance does not mix existing Coin inputs');
        assert(outgoingRaw > 0n && nft, 'new Coin supply requires issuer outputs');
        const issuerInput = tx.inputs[0], parent = transactions.get(issuerInput.prevTxId.toString('hex')), previous = certificate(parent);
        assert.equal(issuerInput.outputIndex, 0); assert(previous && previous.hash === hash && nft.hash === hash, 'mint uses its bound real issuer at vin0/vout0');
        assert.equal(previous.adminHash, entry.adminPubKeyHash); assert.equal(nft.supply - previous.supply, outgoingRaw, 'issuer supply delta matches atomic mint amount');
        for (const output of outputs) assert.deepEqual(output.amounts.slice(1), [0n, 0n, 0n, 0n, 0n], 'mint occupies only issuer input slot zero');
        entry.issuedRaw += outgoingRaw; entry.issuanceTransactions.push(tx.id);
      }
      supplies.set(identity, entry);
    }
    for (const coin of outgoing) { outputLocks.add(coin.lockTime); tapeSizes.add(coin.tapeSize); lockEntry(coin.lockTime).outputs++; }
    minerFeesSat += inspection.feeSat; acceptedInputs += tx.inputs.length;
    maxInputs = Math.max(maxInputs, tx.inputs.length); maxCoinInputs = Math.max(maxCoinInputs, incoming.length);
    maxBytes = Math.max(maxBytes, inspection.bytes); minFeeRateSatPerKB = Math.min(minFeeRateSatPerKB, Number(inspection.feeSat) * 1000 / inspection.bytes);
    assert(inspection.feeSat >= BigInt(Math.max(80, Math.ceil(inspection.bytes * 80 / 1000))), 'final raw fee meets 80 sat/KB with 80 sat minimum');
    acceptedIds.add(tx.id); known.add(tx.id); accepted.push(event); pending.delete(tx.id);
  }
  assert(accepted.length > 0, 'audit requires accepted campaign transactions');
  const liveOutputs = [], liveByIdentity = new Map();
  let liveSat = 0n;
  for (const event of accepted) {
    const tx = transactions.get(event.txid), txCoins = getCoins(tx), nft = certificate(tx);
    for (const [vout, output] of tx.outputs.entries()) {
      if (spent.has(`${tx.id}:${vout}`)) continue;
      liveSat += BigInt(output.satoshis);
      if (output.script.toHex().startsWith('006a')) { assert.equal(output.satoshis, 0); continue; }
      const coin = txCoins.find(item => item.vout === vout);
      if (coin) liveByIdentity.set(coin.identity, (liveByIdentity.get(coin.identity) || 0n) + coin.balance);
      liveOutputs.push({ txid: tx.id, vout, satoshis: output.satoshis,
        kind: coin ? 'coin-code' : nft && vout === 0 ? 'issuer-code' : nft && vout === 1 ? 'issuer-hold' : output.script.isPublicKeyHashOut() ? 'p2pkh' : 'other',
        ...(coin ? { identity: coin.identity, amountRaw: coin.balance, lockTime: coin.lockTime } : {}) });
    }
  }
  assert.equal(liveSat + minerFeesSat, BigInt(config.funding.value), 'all funding, including split return, Code and Hold, reconciles');
  if (config.maximumFeeSat !== undefined) assert(minerFeesSat <= BigInt(config.maximumFeeSat), 'campaign cumulative fee budget');
  const issuerSupply = new Map();
  for (const entry of supplies.values()) {
    entry.liveRaw = liveByIdentity.get(entry.identity) || 0n;
    assert.equal(entry.liveRaw, entry.issuedRaw, 'atomic Coin supply conserved per complete template identity');
    issuerSupply.set(entry.issuerCodeHash, (issuerSupply.get(entry.issuerCodeHash) || 0n) + entry.liveRaw);
  }
  for (const [hash, latest] of certificates) {
    assert(!spent.has(`${latest.txid}:0`) && !spent.has(`${latest.txid}:1`), 'latest certificate and Hold remain live');
    assert.equal(issuerSupply.get(hash) || 0n, latest.supply, 'latest issuer Tape supply equals live Coin supply');
  }
  const attempts = events.filter(event => event.type === 'broadcast-attempt');
  let minimumBroadcastIntervalMs = Infinity, maximumRollingSecondBroadcasts = 0;
  for (let start = 0, end = 0; start < attempts.length; start++) {
    assert(Number.isFinite(attempts[start].epochMs));
    if (start) minimumBroadcastIntervalMs = Math.min(minimumBroadcastIntervalMs, attempts[start].epochMs - attempts[start - 1].epochMs);
    while (end < attempts.length && attempts[end].epochMs < attempts[start].epochMs + 1000) end++;
    maximumRollingSecondBroadcasts = Math.max(maximumRollingSecondBroadcasts, end - start);
  }
  assert(maximumRollingSecondBroadcasts <= 5 && minimumBroadcastIntervalMs >= 250, 'broadcast throttle is respected');
  const observed = [...observations.values()];
  return JSON.parse(json({ auditAt: new Date().toISOString(), snapshotLastEvent: events.at(-1).at,
    ignoredIncompleteTrailingBytes: source.length - completeLength, eventCount: events.length,
    network: config.network, endpoint: config.endpoint, provenance, musig2,
    accepted: accepted.length, rejected: rejections.length, replayVerified: events.filter(event => event.type === 'replay-verified').length,
    rawFilesValidated: transactions.size, acceptedInputsRevalidated: acceptedInputs, allAcceptedRawInputScriptsPassed: true,
    acceptedDoubleSpends: 0, unresolved: [...pending], maximumRollingSecondBroadcasts,
    minimumBroadcastIntervalMs: Number.isFinite(minimumBroadcastIntervalMs) ? minimumBroadcastIntervalMs : null,
    limits: { maximumInputs: maxInputs, maximumCoinInputs: maxCoinInputs, maximumTransactionBytes: maxBytes, minimumFeeRateSatPerKB: minFeeRateSatPerKB },
    coin: { codeBytes: 2981, tapeSizes: [...tapeSizes].sort((a, b) => a - b), branches, supplies: [...supplies.values()],
      lockCoverage: [...lockCoverage.values()].sort((a, b) => a.lockTime - b.lockTime),
      outputLockTimes: [...outputLocks].sort((a, b) => a - b), consumedLockTimes: [...inputLocks].sort((a, b) => a - b),
      attemptedTransactionLockTimes: [...attemptedLocks].sort((a, b) => a - b) },
    issuers: [...certificates.values()].map(({ root, ...value }) => value), rejections, liveOutputs,
    globalSatoshis: { initialSat: config.funding.value, allocatedSat: config.allocatedSat, liveSat, minerFeesSat, conserved: true },
    nodeObservations: { observedAccepted: observed.length, confirmed: observed.filter(event => event.confirmations > 0).length,
      evidenceScope: 'Block heights, raw lock times, recorded header links and MTP arithmetic are checked offline. Block membership flags and header data are observer records, not independently authenticated block or Merkle proofs.',
      unconfirmed: observed.filter(event => event.confirmations === 0).length, unobserved: accepted.filter(event => !observations.has(event.txid)).map(event => event.txid), latest: observed,
      nonzeroTransactionLockTimes: accepted.filter(event => transactions.get(event.txid).nLockTime > 0).map(event => ({
        txid: event.txid, label: event.label, nLockTime: transactions.get(event.txid).nLockTime, observation: observations.get(event.txid) || null })) },
    scope: 'Offline journal/raw audit only. Recorded acknowledgements and chain observations are evidence, not fresh UTXO, finality, confirmation, timestamp-maturity, or indexer claims.' }));
}

module.exports = { auditCoinJournal, DIRECTORY };
if (require.main === module) {
  try {
    const args = process.argv.slice(2), positionals = args.filter(arg => !arg.startsWith('--'));
    assert(args.every(arg => !arg.startsWith('--') || arg === '--write-report') && positionals.length <= 1,
      'usage: node test/coin/coin-testnet-audit.cjs [evidence-directory] [--write-report]');
    const directory = positionals.length ? path.resolve(positionals[0]) : DIRECTORY;
    const report = auditCoinJournal(directory);
    if (args.includes('--write-report')) {
      const fd = fs.openSync(path.join(directory, 'audit-report.json'), 'w', 0o600);
      try { fs.writeSync(fd, json(report) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    }
    process.stdout.write(json(report) + '\n');
  } catch (error) { process.stderr.write(error.stack + '\n'); process.exitCode = 1; }
}
