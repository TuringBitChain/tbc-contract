'use strict';

// Entirely offline: only the initial funding transaction is a trusted fixture
// boundary. Every subsequent source/genesis/Pool/FT/LP input is really signed
// and executed. No network/indexer mocks or OP_TRUE asset scripts are used.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const tbc = require('tbc-lib-js');
const { PoolNFT3 } = require('../../lib/contract/poolNFT3.0.js');
const TBC20 = require('../../lib/contract/tbc20.js');
const { FTLPTBC20: LP } = require('../../lib/contract/ftlpTbc20.js');
const { privateKeySigner } = require('../../lib/util/poolnft3/transaction.js');
const { buildTBC20UnlockScriptWithSignature, replaceTBC20TapeAmounts } = require('../../lib/util/tbc20unlock.js');
const { buildPoolUnlockScript, getPoolUnlockLeafCount } = require('../../lib/util/poolnft3/witness.js');
const { validatePool3Transaction } = require('../../lib/validator/poolnft3.js');
const { POOL3_CODE_DUST } = require('../../lib/util/poolnft3/math.js');

const key = n => new tbc.PrivateKey(n.toString(16).padStart(64, '0'));
const owner = key(101), lpOwner = key(102), funder = key(103), poolFtSigner = key(104), lpRecipient = key(105);
const address = k => k.toAddress().toString();
const p2pkh = k => tbc.Script.buildPublicKeyHashOut(k.toAddress());
const hash = data => tbc.crypto.Hash.sha256(data);
const memberKeys = Array.from({ length: 5 }, (_, i) => key(201 + i));
const optionByOperation = { addLP: 1, removeLP: 2, swapFT: 3, swapTBC: 4 };
let nonce = 1;

async function quiet(fn) {
  const log = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = log; }
}

async function createHarness({ timelocked = false, controllerCount = 0 } = {}) {
  const chain = new Map(), signatures = [], history = [], spent = new Set();
  const signer = (k, label) => {
    const delegate = privateKeySigner(k);
    return { publicKey: delegate.publicKey, sign: request => {
      signatures.push({ label, inputIndex: request.inputIndex, role: request.role, outpoint: request.outpoint,
        outputs: request.transaction.outputs.map(o => `${o.satoshis}:${o.script.toHex()}`),
        lockTime: request.transaction.nLockTime, sighashType: request.sighashType });
      return delegate.sign(request);
    } };
  };
  const signers = {
    owner: signer(owner, 'FT owner'), lpOwner: signer(lpOwner, 'LP owner'), funding: signer(funder, 'funding'),
    poolFt: signer(poolFtSigner, 'arbitrary contract FT signer'), recipient: signer(lpRecipient, 'LP recipient'),
    controllers: memberKeys.slice(0, controllerCount).map((k, i) => signer(k, `Controller ${i}`)),
  };
  const register = tx => { chain.set(tx.id, tx); return tx; };
  const root = new tbc.Transaction(); root.nLockTime = nonce++;
  root.uncheckedAddInput(new tbc.Transaction.Input({ prevTxId: Buffer.alloc(32, 0x6a), outputIndex: 0,
    sequenceNumber: 0xffffffff, script: new tbc.Script() }));
  root.addOutput(new tbc.Transaction.Output({ script: p2pkh(owner), satoshis: 10_000_000_000 }));
  root.addOutput(new tbc.Transaction.Output({ script: p2pkh(funder), satoshis: 10_000_000_000 }));
  register(root);
  // A valid independent push in the FT extension makes Tape 66 bytes, leaving
  // enough room for the separate LP lock field without rewriting FT metadata.
  const token = new TBC20({ extensionData: Buffer.from('040102030409', 'hex') });
  const ftMint = token.mint(owner, address(owner), 2_000_000_000n, {
    txId: root.id, outputIndex: 0, script: root.outputs[0].script.toHex(), satoshis: root.outputs[0].satoshis,
  });
  register(ftMint.sourceTransaction); register(ftMint.transaction);
  const authorization = controllerCount ? { kind: 'controller', controllerPubKeyHashes: memberKeys.slice(0, controllerCount)
    .map(k => tbc.crypto.Hash.sha256ripemd160(k.publicKey.toBuffer()).toString('hex')) } : { kind: 'public' };
  const pool = new PoolNFT3({ ftGenesisTx: ftMint.transaction, authorization,
    lp: { kind: timelocked ? 'timelocked' : 'plain' }, lpPlan: 1 });

  function check(result, label) {
    const tx = result.transaction;
    assert.equal(result.validation.success, true, label);
    assert.equal(result.validation.valueConserved, true, label);
    assert.equal(result.validation.nodeAcceptanceChecked, false);
    assert.equal(result.validation.inputs.length, tx.inputs.length);
    for (const input of result.validation.inputs) {
      assert.equal(input.success, true, `${label}: input ${input.inputIndex}: ${input.error}`);
      assert.equal(input.stackDepth, 1);
      // The frozen LP template may leave two permitted altstack items.
    }
    assert.equal(result.txraw, tx.uncheckedSerialize());
    assert.equal(result.txid, tx.id);
    assert.equal(result.feeSat, tx.inputs.reduce((sum, i) => sum + BigInt(i.output.satoshis), 0n)
      - tx.outputs.reduce((sum, o) => sum + BigInt(o.satoshis), 0n));
    assert(result.reservedBytes >= result.txraw.length / 2);
    for (const input of tx.inputs) {
      const ref = `${input.prevTxId.toString('hex')}:${input.outputIndex}`;
      assert(!spent.has(ref), `${label} accidentally double spends ${ref}`);
      spent.add(ref);
      assert(chain.has(input.prevTxId.toString('hex')), `${label} missing real input parent`);
    }
    for (const asset of result.layout?.assetOutputs || []) {
      const code = tx.outputs[asset.codeVout], tape = tx.outputs[asset.tapeVout];
      assert.equal(asset.tapeVout, asset.codeVout + 1); assert.equal(code.satoshis, 500); assert.equal(tape.satoshis, 0);
      const data = asset.family === 'tbc20' ? TBC20.parseTape(tape.script) : LP.parseTape(tape.script, { timelocked, tapeSize: 66 });
      assert.deepEqual(data.amounts, asset.amountsByInput, `${label} ${asset.role} slots`);
      assert.equal(data.balance, asset.amountRaw);
    }
    const option = optionByOperation[result.layout?.operation];
    if (option) {
      assert.equal(tx.inputs.length, option === 3 ? 3 : 4);
      assert.equal(tx.inputs[0].script.chunks.length, getPoolUnlockLeafCount(option, controllerCount > 0));
      assert.equal(result.nextState.outpoint.txId, result.txid);
      for (let vin = 1; vin < tx.inputs.length; vin++) {
        const kind = result.layout.inputRoles[vin];
        if (!['user-ft', 'pool-ft', 'lp-owner'].includes(kind)) continue;
        assert.equal(tx.inputs[vin].script.chunks.length, 123);
        const input = tx.inputs[vin], parent = chain.get(input.prevTxId.toString('hex'));
        const family = kind === 'lp-owner' ? 'ftlp' : 'tbc20';
        const data = family === 'ftlp' ? LP.parseTape(parent.outputs[input.outputIndex + 1].script, { timelocked, tapeSize: 66 })
          : TBC20.parseTape(parent.outputs[input.outputIndex + 1].script);
        const allocated = result.layout.assetOutputs.filter(a => a.family === family)
          .reduce((sum, a) => sum + a.amountsByInput[vin], 0n);
        assert.equal(allocated, data.balance, `${label} conserves absolute vin ${vin}`);
      }
    }
    register(tx); history.push({ label, result });
    return result;
  }

  const minted = await pool.mintPoolNFT({ funding: { parentTx: root, outputIndex: 1, signer: signers.funding } });
  check(minted.source, 'Pool source'); check(minted, 'Pool genesis');
  assert.equal(minted.nextState.poolValue, POOL3_CODE_DUST);
  assert.equal(minted.transaction.outputs[1].script.toBuffer().length, 143);
  assert.equal(minted.transaction.outputs[1].script.toHex().slice(0, 8), '006a4c82');
  assert.deepEqual(minted.transactions.map(tx => tx.id), [minted.source.txid, minted.txid]);
  const asset = (result, role, signingIdentity = signers.owner) => {
    const output = result.layout.assetOutputs.find(a => a.role === role);
    assert(output, `${result.layout.operation} has ${role}`);
    return { parentTx: result.transaction, outputIndex: output.codeVout, signer: signingIdentity, ancestors: chain,
      amountRaw: output.amountRaw };
  };
  const fundingFrom = result => {
    assert.notEqual(result.changeVout, undefined, 'fixture funds always leave change');
    return { parentTx: result.transaction, outputIndex: result.changeVout, signer: signers.funding };
  };
  let currentPool = minted, currentFunding = fundingFrom(minted);
  let userFT = { parentTx: ftMint.transaction, outputIndex: 0, signer: signers.owner, ancestors: chain, amountRaw: 2_000_000_000n };
  function common(controllerIndex = 0) {
    const ancestor = chain.get(currentPool.transaction.inputs[0].prevTxId.toString('hex'));
    assert(ancestor);
    return { pool: { parentTx: currentPool.transaction, ancestorTx: ancestor },
      poolFT: asset(currentPool, 'pool-ft', signers.poolFt), funding: currentFunding,
      ...(controllerCount ? { controllerSigner: signers.controllers[controllerIndex] } : {}) };
  }
  async function run(method, options, label = method) {
    const count = signatures.length;
    const result = await pool[method](options);
    const called = signatures.slice(count);
    const expected = result.transaction.inputs.length - (optionByOperation[method] && !controllerCount ? 1 : 0);
    assert.equal(called.length, expected, `${label} signs each required input once`);
    assert.equal(new Set(called.map(call => call.inputIndex)).size, expected, `${label} never re-signs during fee estimation`);
    const actualOutputs = result.transaction.outputs.map(o => `${o.satoshis}:${o.script.toHex()}`);
    for (const call of called) {
      assert.equal(call.sighashType, 0x41);
      assert.deepEqual(call.outputs, actualOutputs, `${label} signs final outputs`);
      assert.equal(call.lockTime, result.transaction.nLockTime);
    }
    check(result, label); currentFunding = fundingFrom(result);
    if (result.nextState) currentPool = result;
    const change = result.layout.assetOutputs.find(a => a.role === 'ft-change');
    if (change) userFT = asset(result, 'ft-change', signers.owner);
    return result;
  }
  async function add(incrementSat, firstFtAmountRaw, controllerIndex = 0, lpLockTime = timelocked ? 0 : undefined) {
    return run('addLP', { ...common(controllerIndex), userFT, incrementSat, firstFtAmountRaw,
      lpReceiverAddress: address(lpOwner), lpLockTime, minLpOutRaw: 1n }, firstFtAmountRaw === undefined ? 'add LP' : 'first add LP');
  }
  return { pool, token, chain, signers, signatures, history, timelocked, controllerCount, minted, asset, common, run, add,
    get userFT() { return userFT; }, get currentPool() { return currentPool; }, get funding() { return currentFunding; } };
}

for (const timelocked of [false, true]) for (const controllerCount of [0, 2]) {
  test(`complete real-input Pool3 lifecycle: LP lock=${timelocked}, Controller count=${controllerCount}`, { concurrency: false }, () => quiet(async () => {
    const h = await createHarness({ timelocked, controllerCount });
    const first = await h.add(100_000_000n, 200_000_000n, 0, timelocked ? 100 : undefined);
    assert.equal(first.quote.isFirstAddLP, true);
    assert.equal(first.nextState.ftLpAmount, 100_000_000n);
    assert.equal(first.nextState.ftAAmount, 200_000_000n);
    const firstLP = h.asset(first, 'new-lp', h.signers.lpOwner);
    const second = await h.add(10_000_000n, undefined, controllerCount ? 1 : 0, timelocked ? 200 : undefined);
    const secondLP = h.asset(second, 'new-lp', h.signers.lpOwner);
    const lpTotal = second.nextState.ftLpAmount;
    assert.equal(second.quote.isFirstAddLP, false);
    const swappedFT = await h.run('swapFT', { ...h.common(), inputTbcSat: 1_000_000n, receiverAddress: address(owner), minFtOutRaw: 1n });
    assert.equal(swappedFT.nextState.ftLpAmount, lpTotal);
    assert.equal(swappedFT.layout.serviceFeeVout, 4);
    assert.equal(swappedFT.quote.fees.serviceFeePaidSat, 1000n);
    const swappedTBC = await h.run('swapTBC', { ...h.common(controllerCount ? 1 : 0), userFT: h.userFT,
      inputFtRaw: 1_000_000n, receiverAddress: address(owner), minTbcOutSat: 1n });
    assert.equal(swappedTBC.nextState.ftLpAmount, lpTotal);
    assert.equal(swappedTBC.layout.serviceFeeVout, 3);
    const snapshot = h.currentPool.txid;
    if (timelocked) {
      await assert.rejects(h.pool.transferLP({ inputs: [firstLP], funding: h.funding, receiverAddress: address(lpRecipient),
        amountRaw: firstLP.amountRaw / 2n, lockTime: 99 }), /lock|validation|matur|time/i);
    }
    const transferred = await h.run('transferLP', { inputs: [firstLP], funding: h.funding,
      receiverAddress: address(lpRecipient), amountRaw: firstLP.amountRaw / 2n,
      ...(timelocked ? { lockTime: 100 } : {}) });
    assert.equal(h.currentPool.txid, snapshot, 'LP transfer does not consume/update Pool');
    assert.equal(transferred.nextState, undefined);
    const mergeInputs = [h.asset(transferred, 'lp-transfer', h.signers.recipient),
      h.asset(transferred, 'lp-change', h.signers.lpOwner), secondLP];
    const merged = await h.run('transferLP', { inputs: mergeInputs, funding: h.funding, receiverAddress: address(lpOwner), amountRaw: lpTotal });
    const mergedAsset = merged.layout.assetOutputs.find(a => a.role === 'lp-transfer');
    assert.deepEqual(mergedAsset.amountsByInput, [...mergeInputs.map(i => i.amountRaw), 0n, 0n, 0n]);
    let heldLP = h.asset(merged, 'lp-transfer', h.signers.lpOwner);
    if (timelocked) {
      assert.equal(merged.transaction.nLockTime, 200);
      const unlocked = await h.run('unlockLP', { inputs: [heldLP], funding: h.funding, receiverAddress: address(lpOwner) });
      assert.equal(unlocked.layout.operation, 'unlockLP');
      heldLP = h.asset(unlocked, 'lp-transfer', h.signers.lpOwner);
      assert.equal(LP.parseTape(unlocked.transaction.outputs[heldLP.outputIndex + 1].script, { timelocked: true }).lockTime, 0);
      assert.deepEqual(LP.getCodeIdentity(heldLP.parentTx.outputs[heldLP.outputIndex].script),
        LP.getCodeIdentity(merged.transaction.outputs[0].script));
    } else {
      await assert.rejects(h.pool.unlockLP({ inputs: [heldLP], funding: h.funding, receiverAddress: address(lpOwner) }), /timelocked/);
    }
    const partial = await h.run('removeLP', { ...h.common(), userLP: heldLP, burnAmountRaw: lpTotal / 4n,
      receiverAddress: address(owner), minFtOutRaw: 1n, minTbcOutSat: 1n });
    assert.equal(partial.nextState.ftLpAmount, lpTotal - lpTotal / 4n);
    assert.equal(partial.transaction.outputs[partial.layout.userTbcVout].satoshis, Number(partial.quote.poolValueDecrementSat));
    const remainder = h.asset(partial, 'lp-change', h.signers.lpOwner);
    const all = await h.run('removeLP', { ...h.common(controllerCount ? 1 : 0), userLP: remainder,
      burnAmountRaw: remainder.amountRaw, receiverAddress: address(owner) });
    assert.equal(all.nextState.ftLpAmount, 0n); assert.equal(all.nextState.ftAAmount, 0n);
    assert.equal(all.nextState.tbcAmount, 0n); assert.equal(all.nextState.poolValue, POOL3_CODE_DUST);
    assert.equal(h.asset(all, 'pool-ft', h.signers.poolFt).amountRaw, 0n, 'full withdrawal retains the zero-balance FT input');
    const reinit = await h.add(10_000_000n, 20_000_000n, 0, timelocked ? 0 : undefined);
    assert.equal(reinit.quote.isFirstAddLP, true); assert.equal(reinit.nextState.ftLpAmount, 10_000_000n);
    assert.equal(reinit.transaction.outputs[0].script.toHex(), h.minted.transaction.outputs[0].script.toHex());
    const restored = PoolNFT3.fromPool(reinit.transaction, h.token ? h.chain.get(h.token.contractTxid) : undefined);
    assert.equal(restored.readPoolState(reinit.transaction).snapshotHash, reinit.nextState.snapshotHash);
  }));
}

for (const timelocked of [false, true]) for (let controllerCount = 1; controllerCount <= 5; controllerCount++) {
  test(`all-input authorization matrix: LP lock=${timelocked}, whitelist=${controllerCount}`, { concurrency: false }, () => quiet(async () => {
    const h = await createHarness({ timelocked, controllerCount });
    await h.add(100_000_000n, 200_000_000n);
    for (let member = 0; member < controllerCount; member++) {
      const added = await h.add(1_000_000n, undefined, member, timelocked ? 0 : undefined);
      await h.run('swapFT', { ...h.common(member), inputTbcSat: 10_000n, receiverAddress: address(owner), minFtOutRaw: 1n });
      const swap = await h.run('swapTBC', { ...h.common(member), userFT: h.userFT, inputFtRaw: 10_000n,
        receiverAddress: address(owner), minTbcOutSat: 1n });
      assert.equal(swap.quote.fees.serviceFeePaidSat, 0n);
      assert.equal(swap.transaction.outputs[3].script.toHex(), '006a', 'zero fee keeps the mandatory output');
      await h.run('removeLP', { ...h.common(member), userLP: h.asset(added, 'new-lp', h.signers.lpOwner),
        burnAmountRaw: 1000n, receiverAddress: address(owner) });
    }
    assert(h.history.every(({ result }) => result.validation.inputs.every(i => i.success)));
  }));
}

test('offline preparation rejects stale quotes, wrong assets, omitted Controller and fee underfunding', { concurrency: false }, () => quiet(async () => {
  const h = await createHarness({ controllerCount: 2 });
  const first = await h.add(100_000_000n, 200_000_000n);
  const common = h.common(), options = { ...common, inputTbcSat: 10000n, receiverAddress: address(owner), minFtOutRaw: 1n };
  const calls = h.signatures.length;
  assert.throws(() => h.pool.prepareSwapFT({ ...options, expectedSnapshotHash: '00'.repeat(32) }), /STALE_POOL_STATE/);
  assert.throws(() => h.pool.prepareSwapFT({ ...options, controllerSigner: undefined }), /Controller signer/);
  assert.throws(() => h.pool.prepareSwapFT({ ...options, controllerSigner: privateKeySigner(owner) }), /whitelist/);
  assert.throws(() => h.pool.prepareSwapTBC({ ...common, userFT: h.asset(first, 'new-lp', h.signers.lpOwner),
    inputFtRaw: 10000n, receiverAddress: address(owner), minTbcOutSat: 1n }), /codeScript|artifact|bytes|TBC20/i);
  assert.throws(() => h.pool.prepareSwapFT({ ...options, feePolicy: { minimumFeeSat: 100_000_000_000n } }), /insufficient TBC/);
  assert.equal(h.signatures.length, calls, 'all rejected preparations happen before external signing');
}));

test('small swaps retain zero-fee OP_RETURN positions and minimal ScriptNum Size pushes', { concurrency: false }, () => quiet(async () => {
  const h = await createHarness(); await h.add(100_000_000n, 200_000_000n);
  const ft = await h.run('swapFT', { ...h.common(), inputTbcSat: 9000n, receiverAddress: address(owner), minFtOutRaw: 1n });
  assert.equal(ft.quote.fees.serviceFeePaidSat, 0n);
  assert.equal(ft.transaction.outputs[4].satoshis, 0);
  assert.equal(ft.transaction.outputs[4].script.toHex(), '006a');
  const coin = await h.run('swapTBC', { ...h.common(), userFT: h.userFT, inputFtRaw: 10000n,
    receiverAddress: address(owner), minTbcOutSat: 1n });
  assert.equal(coin.quote.fees.serviceFeePaidSat, 0n);
  assert.equal(coin.transaction.outputs[3].script.toHex(), '006a');
}));

test('external finalize uses isolated final-output signing views and rejects changed-output signatures', { concurrency: false }, () => quiet(async () => {
  const h = await createHarness({ controllerCount: 2 }); await h.add(100_000_000n, 200_000_000n);
  const preparation = h.pool.prepareSwapFT({ ...h.common(), inputTbcSat: 1_000_000n,
    receiverAddress: address(owner), minFtOutRaw: 1n });
  const original = preparation.transaction.uncheckedSerialize();
  const exposed = preparation.transaction; exposed.outputs.at(-1).satoshis -= 1;
  assert.equal(preparation.transaction.uncheckedSerialize(), original, 'caller cannot mutate the private candidate');
  const selectKey = role => role === 'pool-controller' ? memberKeys[0] : role === 'pool-ft' ? poolFtSigner : funder;
  const sign = request => ({ inputIndex: request.inputIndex, publicKey: request.publicKey,
    signature: request.transaction.getSignature(request.inputIndex, selectKey(request.role)) });
  const bad = preparation.signingRequests;
  bad[0].transaction.outputs.at(-1).satoshis -= 1;
  assert.throws(() => preparation.finalize(bad.map(sign)), /invalid transaction signature/);
  const calls = h.signatures.length;
  const result = preparation.finalize(preparation.signingRequests.map(sign));
  assert.equal(result.validation.success, true);
  assert.equal(h.signatures.length, calls, 'finalize does not invoke any signing adapter');
  assert.equal(result.transaction.outputs.at(-1).satoshis, preparation.transaction.outputs.at(-1).satoshis);
}));

test('moving swapped FT from pool vin2 to funding vin1 fails after all proofs and signatures are rebuilt', { concurrency: false }, () => quiet(async () => {
  const h = await createHarness(); await h.add(100_000_000n, 200_000_000n);
  const common = h.common();
  const valid = await h.run('swapFT', { ...common, inputTbcSat: 10000n, receiverAddress: address(owner), minFtOutRaw: 1n });
  const tx = new tbc.Transaction(valid.txraw);
  tx.inputs.forEach((input, i) => { input.output = valid.transaction.inputs[i].output; });
  const moved = TBC20.parseTape(tx.outputs[3].script).amounts.slice();
  moved[1] = moved[2]; moved[2] = 0n;
  tx.outputs[3].setScript(replaceTBC20TapeAmounts(tx.outputs[3].script, moved));
  tx.inputs[0].setScript(buildPoolUnlockScript({ tx, preTx: common.pool.parentTx, prePreTx: common.pool.ancestorTx,
    inputTxs: [common.funding.parentTx, common.poolFT.parentTx], option: 3 }));
  const sig = (vin, k) => tbc.Transaction.sighash.sign(tx, k, 0x41, vin,
    tx.inputs[vin].output.script, tx.inputs[vin].output.satoshisBN).toTxFormat();
  tx.inputs[1].setScript(new tbc.Script().add(sig(1, funder)).add(funder.publicKey.toBuffer()));
  const groups = [{ codeVout: 0, tapeVout: 1 }, { codeVout: 2, tapeVout: 3 }, { codeVout: 4 },
    { codeVout: 5, tapeVout: 6 }, { codeVout: 7 }];
  tx.inputs[2].setScript(buildTBC20UnlockScriptWithSignature({ currentTx: tx, inputIndex: 2,
    preTx: common.poolFT.parentTx, preTxVout: common.poolFT.outputIndex, ancestorTransactions: h.chain,
    outputGroups: groups, signature: sig(2, poolFtSigner), publicKey: poolFtSigner.publicKey.toBuffer(),
    contractController: { transaction: common.pool.parentTx, currentInputIndex: 0 } }));
  const report = validatePool3Transaction(tx);
  assert.equal(report.success, false); assert.equal(report.inputs[0].success, false);
  assert.equal(report.inputs[1].success, true, 'funding signature was regenerated for changed outputs');
  assert.equal(report.inputs[2].success, false, 'real TBC20 independently rejects the input-source mismatch');
}));
