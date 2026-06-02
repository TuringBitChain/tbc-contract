import * as tbc from "tbc-lib-js";
import {
  _isValidSHA256Hash,
  _isValidHexString,
  parseDecimalToBigInt,
  getFtBalanceFromTape,
  fillCharLengthInFT,
} from "../util/util";
const FT = require("./ft");
const stableCoin = require("./stableCoin");

const ft_v2_length = 1884;
const coin_length = 2012;

type FTVersion = 1 | 2 | 3;

const getFTVersion = (codeScript: string, isCoin: boolean): FTVersion => {
  const baseVersion =
    codeScript.length / 2 === ft_v2_length || isCoin ? 2 : 1;
  if (baseVersion !== 2) return 1;

  const fillCharLength = fillCharLengthInFT(codeScript);
  console.log(fillCharLength);
  return fillCharLength === 1 || fillCharLength === 2 ? 3 : 2;
};
// ==================== HTLC with TBC ====================

export function deployHTLC(
  sender: string,
  receiver: string,
  hashlock: string,
  timelock: number,
  amount: number | string,
  utxo: tbc.Transaction.IUnspentOutput,
) {
  if (!tbc.Address.isValid(sender) || !tbc.Address.isValid(receiver)) {
    throw new Error("Invalid sender or receiver address");
  }

  if (!_isValidSHA256Hash(hashlock)) {
    throw new Error("Invalid hashlock");
  }

  if (!Number.isInteger(timelock) || timelock <= 0) {
    throw new Error("Invalid timelock");
  }

  const senderPubHash =
    tbc.Address.fromString(sender).hashBuffer.toString("hex");
  const receiverPubHash =
    tbc.Address.fromString(receiver).hashBuffer.toString("hex");
  const script = getCode(senderPubHash, receiverPubHash, hashlock, timelock);
  const amountBN = parseDecimalToBigInt(amount, 6);
  const tx = new tbc.Transaction();
  tx.from(utxo);
  tx.addOutput(
    new tbc.Transaction.Output({
      script: script,
      satoshis: Number(amountBN),
    }),
  );
  tx.change(sender);
  tx.fee(80);
  const txraw = tx.uncheckedSerialize();
  return txraw;
}

export function withdraw(
  receiver: string,
  htlcutxo: tbc.Transaction.IUnspentOutput,
) {
  if (!tbc.Address.isValid(receiver)) {
    throw new Error("Invalid receiver address");
  }

  const tx = new tbc.Transaction();
  tx.from(htlcutxo);
  tx.to(receiver, htlcutxo.satoshis - 80);
  tx.fee(80);
  const txraw = tx.uncheckedSerialize();
  return txraw;
}

export function refund(
  sender: string,
  htlcutxo: tbc.Transaction.IUnspentOutput,
  timelock: number,
) {
  if (!tbc.Address.isValid(sender)) {
    throw new Error("Invalid sender address");
  }

  if (!Number.isInteger(timelock) || timelock <= 0) {
    throw new Error("Invalid timelock");
  }
  
  const tx = new tbc.Transaction();
  tx.from(htlcutxo);
  tx.to(sender, htlcutxo.satoshis - 80);
  tx.fee(80);
  tx.setInputSequence(0, 4294967294);
  tx.setLockTime(timelock);
  const txraw = tx.uncheckedSerialize();
  return txraw;
}

export function fillSigDepoly(
  deployHTLCTxRaw: string,
  sig: string,
  publicKey: string,
): string {
  if (!_isValidHexString(deployHTLCTxRaw))
    throw new Error("Invalid DeployHTLCTxRaw hex string");
  if (!tbc.PublicKey.isValid(publicKey)) throw new Error("Invalid PublicKey");
  if (!_isValidHexString(sig)) throw new Error("Invalid Signature");

  const tx = new tbc.Transaction(deployHTLCTxRaw);

  const scriptASM = `${sig} ${publicKey}`;
  tx.setInputScript({ inputIndex: 0 }, tbc.Script.fromASM(scriptASM));
  const txraw = tx.uncheckedSerialize();
  return txraw;
}

export function fillSigWithdraw(
  withdrawTxRaw: string,
  secret: string,
  sig: string,
  publicKey: string,
): string {
  if (!_isValidHexString(withdrawTxRaw))
    throw new Error("Invalid WithdrawTxRaw hex string");
  if (!tbc.PublicKey.isValid(publicKey)) throw new Error("Invalid PublicKey");
  if (!_isValidHexString(sig)) throw new Error("Invalid Signature");

  const tx = new tbc.Transaction(withdrawTxRaw);
  const scriptASM = `${sig} ${publicKey} ${secret} 1`;
  tx.setInputScript({ inputIndex: 0 }, tbc.Script.fromASM(scriptASM));
  const txraw = tx.uncheckedSerialize();
  return txraw;
}

export function fillSigRefund(
  refundTxRaw: string,
  sig: string,
  publicKey: string,
): string {
  if (!_isValidHexString(refundTxRaw))
    throw new Error("Invalid RefundTxRaw hex string");
  if (!tbc.PublicKey.isValid(publicKey)) throw new Error("Invalid PublicKey");
  if (!_isValidHexString(sig)) throw new Error("Invalid Signature");

  const tx = new tbc.Transaction(refundTxRaw);
  const scriptASM = `${sig} ${publicKey} 0`;
  tx.setInputScript({ inputIndex: 0 }, tbc.Script.fromASM(scriptASM));
  const txraw = tx.uncheckedSerialize();
  return txraw;
}

function getCode(
  senderPubHash: string,
  receiverPubHash: string,
  hashlock: string,
  timelock: number,
): tbc.Script {
  const writer = new tbc.encoding.BufferWriter();
  const timelockHex = writer.writeUInt32LE(timelock).toBuffer().toString("hex");
  const script = tbc.Script.fromASM(
    `OP_IF OP_SHA256 ${hashlock} OP_EQUALVERIFY OP_DUP OP_HASH160 ${receiverPubHash} OP_ELSE ${timelockHex} OP_BIN2NUM OP_2 OP_PUSH_META OP_BIN2NUM OP_2DUP OP_GREATERTHAN OP_NOTIF OP_2DUP 0065cd1d OP_GREATERTHANOREQUAL OP_IF 0065cd1d OP_GREATERTHANOREQUAL OP_VERIFY OP_LESSTHANOREQUAL OP_ELSE OP_2DROP OP_DROP OP_TRUE OP_ENDIF OP_ELSE OP_FALSE OP_ENDIF OP_VERIFY OP_6 OP_PUSH_META 24 OP_SPLIT OP_NIP OP_BIN2NUM ffffffff OP_NUMNOTEQUAL OP_VERIFY OP_DUP OP_HASH160 ${senderPubHash} OP_ENDIF OP_EQUALVERIFY OP_CHECKSIG`,
  );
  return script;
}

export function deployHTLCWithSign(
  sender: string,
  receiver: string,
  hashlock: string,
  timelock: number,
  amount: number | string,
  utxo: tbc.Transaction.IUnspentOutput,
  privateKey: string,
) {
  if (!tbc.Address.isValid(sender) || !tbc.Address.isValid(receiver)) {
    throw new Error("Invalid sender or receiver address");
  }

  if (!_isValidSHA256Hash(hashlock)) {
    throw new Error("Invalid hashlock");
  }

  if (!Number.isInteger(timelock) || timelock < 0) {
    throw new Error("Invalid timelock");
  }

  const senderPubHash =
    tbc.Address.fromString(sender).hashBuffer.toString("hex");
  const receiverPubHash =
    tbc.Address.fromString(receiver).hashBuffer.toString("hex");
  const script = getCode(senderPubHash, receiverPubHash, hashlock, timelock);
  const amountBN = parseDecimalToBigInt(amount, 6);
  const tx = new tbc.Transaction();
  tx.from(utxo);
  tx.addOutput(
    new tbc.Transaction.Output({
      script: script,
      satoshis: Number(amountBN),
    }),
  );
  tx.change(sender);
  tx.fee(80);
  tx.sign(privateKey);
  const txraw = tx.serialize();
  return txraw;
}

export function withdrawWithSign(
  privateKey: string,
  receiver: string,
  htlcutxo: tbc.Transaction.IUnspentOutput,
  secret: string,
) {
  if (!tbc.Address.isValid(receiver)) {
    throw new Error("Invalid receiver address");
  }

  const tx = new tbc.Transaction();
  tx.from(htlcutxo);
  tx.to(receiver, htlcutxo.satoshis - 80);
  tx.fee(80);

  const privateKeyObj = new tbc.PrivateKey(privateKey);
  const publicKey = privateKeyObj.toPublicKey().toHex();
  const sig = tx.getSignature(0, privateKeyObj);
  const scriptASM = `${sig} ${publicKey} ${secret} OP_TRUE`;
  tx.setInputScript({ inputIndex: 0 }, tbc.Script.fromASM(scriptASM));
  const txraw = tx.uncheckedSerialize();
  return txraw;
}

export function refundWithSign(
  sender: string,
  htlcutxo: tbc.Transaction.IUnspentOutput,
  privateKey: string,
  timelock: number,
) {
  if (!tbc.Address.isValid(sender)) {
    throw new Error("Invalid sender address");
  }

  const tx = new tbc.Transaction();
  tx.from(htlcutxo);
  tx.to(sender, htlcutxo.satoshis - 80);
  tx.fee(80);
  tx.setInputSequence(0, 4294967294);
  tx.setLockTime(timelock);
  const privateKeyObj = new tbc.PrivateKey(privateKey);
  const publicKey = privateKeyObj.toPublicKey().toHex();
  const sig = tx.getSignature(0, privateKeyObj);

  const scriptASM = `${sig} ${publicKey} OP_FALSE`;
  tx.setInputScript({ inputIndex: 0 }, tbc.Script.fromASM(scriptASM));
  console.log(tx.verify());
  const txraw = tx.uncheckedSerialize();
  return txraw;
}

// ==================== HTLC with Token (FT / StableCoin) ====================

// ========== Non-sign variants (build + fillSig pattern) ==========
// build functions return an unsigned raw tx with all SIGHASH-relevant fields
// frozen (inputs, outputs incl. change, sequences, lockTime). Only input
// scriptSigs are placeholders. fillSig functions slot in the externally-
// computed sigs without touching anything that affects SIGHASH.

export function deployHTLCToken(
  sender: string,
  receiver: string,
  hashlock: string,
  timelock: number,
  ftAmount: number | string,
  ftutxos: tbc.Transaction.IUnspentOutput[],
  utxo: tbc.Transaction.IUnspentOutput,
  preTX: tbc.Transaction[],
  prepreTxData: string[],
): string {
  if (!tbc.Address.isValid(sender) || !tbc.Address.isValid(receiver)) {
    throw new Error("Invalid sender or receiver address");
  }
  if (!_isValidSHA256Hash(hashlock)) {
    throw new Error("Invalid hashlock");
  }
  if (!Number.isInteger(timelock) || timelock < 0) {
    throw new Error("Invalid timelock");
  }
  if (!ftutxos || ftutxos.length === 0) {
    throw new Error("ftutxos must be non-empty");
  }
  if (ftutxos.length > 5) {
    throw new Error("ftutxos length must be <= 5");
  }
  if (preTX.length !== ftutxos.length || prepreTxData.length !== ftutxos.length) {
    throw new Error("preTX/prepreTxData length must match ftutxos length");
  }

  const senderPubHash =
    tbc.Address.fromString(sender).hashBuffer.toString("hex");
  const receiverPubHash =
    tbc.Address.fromString(receiver).hashBuffer.toString("hex");
  const htlcScript = getCode(senderPubHash, receiverPubHash, hashlock, timelock);

  const htlcHash160 = tbc.crypto.Hash.sha256ripemd160(
    tbc.crypto.Hash.sha256(htlcScript.toBuffer()),
  ).toString("hex");

  const ftCodeLen = ftutxos[0].script.length / 2;
  const isCoin = ftCodeLen === coin_length;
  if (ftCodeLen !== ft_v2_length && ftCodeLen !== coin_length) {
    throw new Error(
      `Unsupported FT code length ${ftCodeLen}; expected ${ft_v2_length} or ${coin_length}`,
    );
  }

  const amountbn = parseDecimalToBigInt(ftAmount, 6);
  if (amountbn <= 0n) {
    throw new Error("ftAmount must be positive");
  }
  const tapeAmountSetIn: bigint[] = [];
  let tapeAmountSum = 0n;
  for (let i = 0; i < ftutxos.length; i++) {
    tapeAmountSetIn.push(BigInt(ftutxos[i].ftBalance!));
    tapeAmountSum += tapeAmountSetIn[i];
  }
  if (amountbn > tapeAmountSum) {
    throw new Error("Insufficient FT balance, please add more FT UTXOs");
  }

  let lockTimeMax = 0;
  if (isCoin) {
    for (let i = 0; i < ftutxos.length; i++) {
      lockTimeMax = Math.max(
        lockTimeMax,
        stableCoin.getLockTimeFromTape(
          preTX[i].outputs[ftutxos[i].outputIndex + 1].script,
        ),
      );
    }
  }

  const { amountHex, changeHex } = FT.buildTapeAmount(
    amountbn,
    tapeAmountSetIn,
  );
  const ftCodeTemplate = ftutxos[0].script;
  const ftTapeTemplate =
    preTX[0].outputs[ftutxos[0].outputIndex + 1].script.toHex();

  const tx = new tbc.Transaction().from(ftutxos).from(utxo);

  tx.addOutput(
    new tbc.Transaction.Output({
      script: htlcScript,
      satoshis: 100,
    }),
  );
  tx.addOutput(
    new tbc.Transaction.Output({
      script: FT.buildFTtransferCode(ftCodeTemplate, htlcHash160),
      satoshis: 500,
    }),
  );
  tx.addOutput(
    new tbc.Transaction.Output({
      script: FT.buildFTtransferTape(ftTapeTemplate, amountHex),
      satoshis: 0,
    }),
  );
  if (amountbn < tapeAmountSum) {
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferCode(ftCodeTemplate, sender),
        satoshis: 500,
      }),
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferTape(ftTapeTemplate, changeHex),
        satoshis: 0,
      }),
    );
  }

  // Sequences + lockTime must be set BEFORE fee/change so they are frozen
  // in the SIGHASH that the external signer computes against this raw.
  if (isCoin) {
    for (let i = 0; i < ftutxos.length; i++) {
      tx.setInputSequence(i, 4294967294);
    }
    tx.setLockTime(lockTimeMax);
  }

  // Fee accounting: tx.getEstimateSize() does not know the eventual size of
  // the FT unlock scripts each FT input will carry (~2KB each). Pad accordingly.
  tx.change(sender);
  const txSize = tx.getEstimateSize() + ftutxos.length * 2000;
  tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));

  return tx.uncheckedSerialize();
}

export function fillSigDeployHTLCToken(
  deployRaw: string,
  sigs: string[],
  publicKey: string,
  preTX: tbc.Transaction[],
  prepreTxData: string[],
): string {
  if (!_isValidHexString(deployRaw)) {
    throw new Error("Invalid deployRaw hex string");
  }
  if (!tbc.PublicKey.isValid(publicKey)) {
    throw new Error("Invalid publicKey");
  }
  if (!Array.isArray(sigs) || sigs.some((s) => !_isValidHexString(s))) {
    throw new Error("Invalid sigs array");
  }
  if (preTX.length !== prepreTxData.length) {
    throw new Error("preTX/prepreTxData length mismatch");
  }
  if (sigs.length !== preTX.length + 1) {
    throw new Error(
      `sigs length must be ${preTX.length + 1} (one per FT input + one TBC fee)`,
    );
  }

  const tx = new tbc.Transaction(deployRaw);
  const ftInputCount = preTX.length;

  // isCoin from the first FT input's parent — its outputs[outputIndex] is
  // the FT Code being spent; its length distinguishes FT v2 from coin.
  const ftCodeLen =
    preTX[0].outputs[tx.inputs[0].outputIndex].script.toBuffer().length;
  const isCoin = ftCodeLen === coin_length;

  for (let i = 0; i < ftInputCount; i++) {
    tx.setInputScript({ inputIndex: i }, (currentTX) => {
      return FT.getFTunlock(
        sigs[i],
        publicKey,
        currentTX,
        preTX[i],
        prepreTxData[i],
        i,
        tx.inputs[i].outputIndex,
        isCoin,
      );
    });
  }

  // TBC fee input: standard P2PKH
  tx.setInputScript(
    { inputIndex: ftInputCount },
    tbc.Script.fromASM(`${sigs[ftInputCount]} ${publicKey}`),
  );

  return tx.uncheckedSerialize();
}

export function withdrawHTLCToken(
  receiver: string,
  htlcutxo: tbc.Transaction.IUnspentOutput,
  ftutxo: tbc.Transaction.IUnspentOutput,
  deployTX: tbc.Transaction,
  utxo: tbc.Transaction.IUnspentOutput,
): string {
  if (!tbc.Address.isValid(receiver)) {
    throw new Error("Invalid receiver address");
  }

  const ftCodeLen = ftutxo.script.length / 2;
  const isCoin = ftCodeLen === coin_length;
  if (ftCodeLen !== ft_v2_length && ftCodeLen !== coin_length) {
    throw new Error(
      `Unsupported FT code length ${ftCodeLen}; expected ${ft_v2_length} or ${coin_length}`,
    );
  }

  const ftTapeScript = deployTX.outputs[ftutxo.outputIndex + 1].script;
  const ftTapeTemplate = ftTapeScript.toHex();
  const totalAmount = getFtBalanceFromTape(ftTapeTemplate);
  if (totalAmount <= 0n) {
    throw new Error("FT tape encodes zero balance");
  }

  const { amountHex } = FT.buildTapeAmount(totalAmount, [totalAmount], 1);

  const tx = new tbc.Transaction().from(htlcutxo).from(ftutxo).from(utxo);

  tx.addOutput(
    new tbc.Transaction.Output({
      script: FT.buildFTtransferCode(ftutxo.script, receiver),
      satoshis: 500,
    }),
  );
  tx.addOutput(
    new tbc.Transaction.Output({
      script: FT.buildFTtransferTape(ftTapeTemplate, amountHex),
      satoshis: 0,
    }),
  );

  if (isCoin) {
    tx.setInputSequence(1, 4294967294);
    tx.setLockTime(stableCoin.getLockTimeFromTape(ftTapeScript));
  }

  tx.change(receiver);
  const txSize = tx.getEstimateSize() + 3000;
  tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));

  return tx.uncheckedSerialize();
}

export function fillSigWithdrawHTLCToken(
  withdrawRaw: string,
  sigs: string[],
  publicKey: string,
  secret: string,
  deployTX: tbc.Transaction,
  prepreTxData: string,
): string {
  if (!_isValidHexString(withdrawRaw)) {
    throw new Error("Invalid withdrawRaw hex string");
  }
  if (!tbc.PublicKey.isValid(publicKey)) {
    throw new Error("Invalid publicKey");
  }
  if (!_isValidHexString(secret)) {
    throw new Error("Invalid secret hex string");
  }
  if (!_isValidHexString(prepreTxData)) {
    throw new Error("Invalid prepreTxData hex string");
  }
  if (!Array.isArray(sigs) || sigs.length !== 3 || sigs.some((s) => !_isValidHexString(s))) {
    throw new Error("sigs must be 3 valid hex strings: [HTLC, FTCode, tbcFee]");
  }

  const tx = new tbc.Transaction(withdrawRaw);

  // FT Code UTXO is at deployTX.outputs[1]; its length distinguishes coin/ft.
  const isCoin = deployTX.outputs[1].script.toBuffer().length === coin_length;
  const ftVersion = getFTVersion(deployTX.outputs[1].script.toHex(), isCoin);
  const ftCodeOutputIndex = tx.inputs[1].outputIndex;

  // [0] HTLC unlock
  tx.setInputScript(
    { inputIndex: 0 },
    tbc.Script.fromASM(`${sigs[0]} ${publicKey} ${secret} OP_TRUE`),
  );

  // [1] FT Code unlock via getFTunlockSwap (callback to avoid early sig commit)
  tx.setInputScript({ inputIndex: 1 }, (currentTX) => {
    return FT.getFTunlockSwap(
      sigs[1],
      publicKey,
      currentTX,
      deployTX,
      prepreTxData,
      deployTX,
      1,
      ftCodeOutputIndex,
      ftVersion,
      isCoin,
    );
  });

  // [2] TBC fee P2PKH
  tx.setInputScript(
    { inputIndex: 2 },
    tbc.Script.fromASM(`${sigs[2]} ${publicKey}`),
  );

  return tx.uncheckedSerialize();
}

export function refundHTLCToken(
  sender: string,
  htlcutxo: tbc.Transaction.IUnspentOutput,
  ftutxo: tbc.Transaction.IUnspentOutput,
  deployTX: tbc.Transaction,
  utxo: tbc.Transaction.IUnspentOutput,
  timelock: number,
): string {
  if (!tbc.Address.isValid(sender)) {
    throw new Error("Invalid sender address");
  }
  if (!Number.isInteger(timelock) || timelock < 0) {
    throw new Error("Invalid timelock");
  }

  const ftCodeLen = ftutxo.script.length / 2;
  const isCoin = ftCodeLen === coin_length;
  if (ftCodeLen !== ft_v2_length && ftCodeLen !== coin_length) {
    throw new Error(
      `Unsupported FT code length ${ftCodeLen}; expected ${ft_v2_length} or ${coin_length}`,
    );
  }

  const ftTapeScript = deployTX.outputs[ftutxo.outputIndex + 1].script;
  const ftTapeTemplate = ftTapeScript.toHex();
  const totalAmount = getFtBalanceFromTape(ftTapeTemplate);
  if (totalAmount <= 0n) {
    throw new Error("FT tape encodes zero balance");
  }

  const { amountHex } = FT.buildTapeAmount(totalAmount, [totalAmount], 1);

  const tx = new tbc.Transaction().from(htlcutxo).from(ftutxo).from(utxo);

  tx.addOutput(
    new tbc.Transaction.Output({
      script: FT.buildFTtransferCode(ftutxo.script, sender),
      satoshis: 500,
    }),
  );
  tx.addOutput(
    new tbc.Transaction.Output({
      script: FT.buildFTtransferTape(ftTapeTemplate, amountHex),
      satoshis: 0,
    }),
  );

  tx.setInputSequence(0, 4294967294);
  if (isCoin) {
    tx.setInputSequence(1, 4294967294);
  }

  let txLockTime = timelock;
  if (isCoin) {
    const coinLockTime = stableCoin.getLockTimeFromTape(ftTapeScript);
    txLockTime = Math.max(timelock, coinLockTime);
  }
  tx.setLockTime(txLockTime);

  tx.change(sender);
  const txSize = tx.getEstimateSize() + 3000;
  tx.fee(txSize < 1000 ? 80 : Math.ceil((txSize / 1000) * 80));

  return tx.uncheckedSerialize();
}

export function fillSigRefundHTLCToken(
  refundRaw: string,
  sigs: string[],
  publicKey: string,
  deployTX: tbc.Transaction,
  prepreTxData: string,
): string {
  if (!_isValidHexString(refundRaw)) {
    throw new Error("Invalid refundRaw hex string");
  }
  if (!tbc.PublicKey.isValid(publicKey)) {
    throw new Error("Invalid publicKey");
  }
  if (!_isValidHexString(prepreTxData)) {
    throw new Error("Invalid prepreTxData hex string");
  }
  if (!Array.isArray(sigs) || sigs.length !== 3 || sigs.some((s) => !_isValidHexString(s))) {
    throw new Error("sigs must be 3 valid hex strings: [HTLC, FTCode, tbcFee]");
  }

  const tx = new tbc.Transaction(refundRaw);

  const isCoin = deployTX.outputs[1].script.toBuffer().length === coin_length;
  const ftVersion = getFTVersion(deployTX.outputs[1].script.toHex(), isCoin);
  const ftCodeOutputIndex = tx.inputs[1].outputIndex;

  tx.setInputScript(
    { inputIndex: 0 },
    tbc.Script.fromASM(`${sigs[0]} ${publicKey} OP_FALSE`),
  );

  tx.setInputScript({ inputIndex: 1 }, (currentTX) => {
    return FT.getFTunlockSwap(
      sigs[1],
      publicKey,
      currentTX,
      deployTX,
      prepreTxData,
      deployTX,
      1,
      ftCodeOutputIndex,
      ftVersion,
      isCoin,
    );
  });

  tx.setInputScript(
    { inputIndex: 2 },
    tbc.Script.fromASM(`${sigs[2]} ${publicKey}`),
  );

  return tx.uncheckedSerialize();
}

export function deployHTLCTokenWithSign(
  sender: string,
  receiver: string,
  hashlock: string,
  timelock: number,
  ftAmount: number | string,
  ftutxos: tbc.Transaction.IUnspentOutput[],
  utxo: tbc.Transaction.IUnspentOutput,
  preTX: tbc.Transaction[],
  prepreTxData: string[],
  privateKey: string,
): string {
  if (!tbc.Address.isValid(sender) || !tbc.Address.isValid(receiver)) {
    throw new Error("Invalid sender or receiver address");
  }
  if (!_isValidSHA256Hash(hashlock)) {
    throw new Error("Invalid hashlock");
  }
  if (!Number.isInteger(timelock) || timelock < 0) {
    throw new Error("Invalid timelock");
  }
  if (!ftutxos || ftutxos.length === 0) {
    throw new Error("ftutxos must be non-empty");
  }
  if (ftutxos.length > 5) {
    throw new Error("ftutxos length must be <= 5");
  }
  if (preTX.length !== ftutxos.length || prepreTxData.length !== ftutxos.length) {
    throw new Error("preTX/prepreTxData length must match ftutxos length");
  }

  const senderPubHash =
    tbc.Address.fromString(sender).hashBuffer.toString("hex");
  const receiverPubHash =
    tbc.Address.fromString(receiver).hashBuffer.toString("hex");
  const htlcScript = getCode(senderPubHash, receiverPubHash, hashlock, timelock);

  const htlcHash160 = tbc.crypto.Hash.sha256ripemd160(
    tbc.crypto.Hash.sha256(htlcScript.toBuffer()),
  ).toString("hex");

  const ftCodeLen = ftutxos[0].script.length / 2;
  const isCoin = ftCodeLen === coin_length;
  if (ftCodeLen !== ft_v2_length && ftCodeLen !== coin_length) {
    throw new Error(
      `Unsupported FT code length ${ftCodeLen}; expected ${ft_v2_length} or ${coin_length}`,
    );
  }

  const amountbn = parseDecimalToBigInt(ftAmount, 6);
  if (amountbn <= 0n) {
    throw new Error("ftAmount must be positive");
  }
  const tapeAmountSetIn: bigint[] = [];
  let tapeAmountSum = 0n;
  for (let i = 0; i < ftutxos.length; i++) {
    tapeAmountSetIn.push(BigInt(ftutxos[i].ftBalance!));
    tapeAmountSum += tapeAmountSetIn[i];
  }
  if (amountbn > tapeAmountSum) {
    throw new Error("Insufficient FT balance, please add more FT UTXOs");
  }

  let lockTimeMax = 0;
  if (isCoin) {
    for (let i = 0; i < ftutxos.length; i++) {
      lockTimeMax = Math.max(
        lockTimeMax,
        stableCoin.getLockTimeFromTape(
          preTX[i].outputs[ftutxos[i].outputIndex + 1].script,
        ),
      );
    }
  }

  const { amountHex, changeHex } = FT.buildTapeAmount(
    amountbn,
    tapeAmountSetIn,
  );
  const ftCodeTemplate = ftutxos[0].script;
  const ftTapeTemplate =
    preTX[0].outputs[ftutxos[0].outputIndex + 1].script.toHex();

  const tx = new tbc.Transaction().from(ftutxos).from(utxo);

  // [0] HTLC output
  tx.addOutput(
    new tbc.Transaction.Output({
      script: htlcScript,
      satoshis: 100,
    }),
  );

  // [1] FT Code with destination = hash160(sha256(htlcScript))
  tx.addOutput(
    new tbc.Transaction.Output({
      script: FT.buildFTtransferCode(ftCodeTemplate, htlcHash160),
      satoshis: 500,
    }),
  );

  // [2] FT Tape with locked amount
  tx.addOutput(
    new tbc.Transaction.Output({
      script: FT.buildFTtransferTape(ftTapeTemplate, amountHex),
      satoshis: 0,
    }),
  );

  // [3,4] FT change Code+Tape back to sender (if any)
  if (amountbn < tapeAmountSum) {
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferCode(ftCodeTemplate, sender),
        satoshis: 500,
      }),
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: FT.buildFTtransferTape(ftTapeTemplate, changeHex),
        satoshis: 0,
      }),
    );
  }

  tx.feePerKb(80);
  tx.change(sender);

  // setInputSequence + setLockTime for stableCoin before signing
  if (isCoin) {
    for (let i = 0; i < ftutxos.length; i++) {
      tx.setInputSequence(i, 4294967294);
    }
    tx.setLockTime(lockTimeMax);
  }

  const privateKeyObj = new tbc.PrivateKey(privateKey);
  const publicKey = privateKeyObj.toPublicKey().toHex();

  for (let i = 0; i < ftutxos.length; i++) {
    tx.setInputScript({ inputIndex: i }, (currentTX) => {
      const sig = currentTX.getSignature(i, privateKeyObj);
      return FT.getFTunlock(
        sig,
        publicKey,
        currentTX,
        preTX[i],
        prepreTxData[i],
        i,
        ftutxos[i].outputIndex,
        isCoin,
      );
    });
  }

  tx.sign(privateKeyObj);
  tx.seal();
  console.log("deployHTLCTokenWithSign fee:", tx.getFee(), "sat, size:", tx.toBuffer().length, "bytes");
  const txraw = tx.uncheckedSerialize();
  return txraw;
}

export function withdrawHTLCTokenWithSign(
  privateKey: string,
  receiver: string,
  htlcutxo: tbc.Transaction.IUnspentOutput,
  ftutxo: tbc.Transaction.IUnspentOutput,
  deployTX: tbc.Transaction,
  prepreTxData: string,
  utxo: tbc.Transaction.IUnspentOutput,
  secret: string,
): string {
  if (!tbc.Address.isValid(receiver)) {
    throw new Error("Invalid receiver address");
  }
  if (!_isValidHexString(prepreTxData)) {
    throw new Error("Invalid prepreTxData hex string");
  }
  if (!_isValidHexString(secret)) {
    throw new Error("Invalid secret hex string");
  }

  const ftCodeLen = ftutxo.script.length / 2;
  const isCoin = ftCodeLen === coin_length;
  const ftVersion = getFTVersion(deployTX.outputs[1].script.toHex(), isCoin);
  if (ftCodeLen !== ft_v2_length && ftCodeLen !== coin_length) {
    throw new Error(
      `Unsupported FT code length ${ftCodeLen}; expected ${ft_v2_length} or ${coin_length}`,
    );
  }

  const ftTapeScript =
    deployTX.outputs[ftutxo.outputIndex + 1].script;
  const ftTapeTemplate = ftTapeScript.toHex();
  const totalAmount = getFtBalanceFromTape(ftTapeTemplate);
  if (totalAmount <= 0n) {
    throw new Error("FT tape encodes zero balance");
  }

  const { amountHex } = FT.buildTapeAmount(totalAmount, [totalAmount], 1);

  const tx = new tbc.Transaction().from(htlcutxo).from(ftutxo).from(utxo);

  // [0] Receiver FT Code
  tx.addOutput(
    new tbc.Transaction.Output({
      script: FT.buildFTtransferCode(ftutxo.script, receiver),
      satoshis: 500,
    }),
  );

  // [1] Receiver FT Tape
  tx.addOutput(
    new tbc.Transaction.Output({
      script: FT.buildFTtransferTape(ftTapeTemplate, amountHex),
      satoshis: 0,
    }),
  );

  tx.feePerKb(80);
  tx.change(receiver);

  let lockTimeMax = 0;
  if (isCoin) {
    tx.setInputSequence(1, 4294967294);
    lockTimeMax = stableCoin.getLockTimeFromTape(ftTapeScript);
    tx.setLockTime(lockTimeMax);
  }

  const privateKeyObj = new tbc.PrivateKey(privateKey);
  const publicKey = privateKeyObj.toPublicKey().toHex();

  // [0] HTLC unlock: <sig> <pubKey> <secret> OP_TRUE — callback so sig
  // commits to the final tx state (after tx.change recomputes and tx.sign
  // fills the P2PKH input). See orderBook.matchOrder for the same pattern.
  tx.setInputScript({ inputIndex: 0 }, (currentTX) => {
    const sig = currentTX.getSignature(0, privateKeyObj);
    return tbc.Script.fromASM(`${sig} ${publicKey} ${secret} OP_TRUE`);
  });

  // [1] FT Code unlock via getFTunlockSwap
  tx.setInputScript({ inputIndex: 1 }, (currentTX) => {
    const sig = currentTX.getSignature(1, privateKeyObj);
    return FT.getFTunlockSwap(
      sig,
      publicKey,
      currentTX,
      deployTX,
      prepreTxData,
      deployTX,
      1,
      ftutxo.outputIndex,
      ftVersion,
      isCoin,
    );
  });

  tx.sign(privateKeyObj);
  tx.seal();
  console.log("withdrawHTLCTokenWithSign fee:", tx.getFee(), "sat, size:", tx.toBuffer().length, "bytes");
  // console.log(tx.verify());
  const txraw = tx.uncheckedSerialize();
  return txraw;
}

export function refundHTLCTokenWithSign(
  privateKey: string,
  sender: string,
  htlcutxo: tbc.Transaction.IUnspentOutput,
  ftutxo: tbc.Transaction.IUnspentOutput,
  deployTX: tbc.Transaction,
  prepreTxData: string,
  utxo: tbc.Transaction.IUnspentOutput,
  timelock: number,
): string {
  if (!tbc.Address.isValid(sender)) {
    throw new Error("Invalid sender address");
  }
  if (!Number.isInteger(timelock) || timelock < 0) {
    throw new Error("Invalid timelock");
  }
  if (!_isValidHexString(prepreTxData)) {
    throw new Error("Invalid prepreTxData hex string");
  }

  const ftCodeLen = ftutxo.script.length / 2;
  const isCoin = ftCodeLen === coin_length;
  const ftVersion = getFTVersion(deployTX.outputs[1].script.toHex(), isCoin);
  if (ftCodeLen !== ft_v2_length && ftCodeLen !== coin_length) {
    throw new Error(
      `Unsupported FT code length ${ftCodeLen}; expected ${ft_v2_length} or ${coin_length}`,
    );
  }

  const ftTapeScript =
    deployTX.outputs[ftutxo.outputIndex + 1].script;
  const ftTapeTemplate = ftTapeScript.toHex();
  const totalAmount = getFtBalanceFromTape(ftTapeTemplate);
  if (totalAmount <= 0n) {
    throw new Error("FT tape encodes zero balance");
  }

  const { amountHex } = FT.buildTapeAmount(totalAmount, [totalAmount], 1);

  const tx = new tbc.Transaction().from(htlcutxo).from(ftutxo).from(utxo);

  tx.addOutput(
    new tbc.Transaction.Output({
      script: FT.buildFTtransferCode(ftutxo.script, sender),
      satoshis: 500,
    }),
  );
  tx.addOutput(
    new tbc.Transaction.Output({
      script: FT.buildFTtransferTape(ftTapeTemplate, amountHex),
      satoshis: 0,
    }),
  );

  tx.feePerKb(80);
  tx.change(sender);

  // Sequence: HTLC input must be != 0xFFFFFFFF (htlc OP_ELSE branch enforces),
  // and stableCoin FT Code input also needs 0xFFFFFFFE.
  tx.setInputSequence(0, 4294967294);
  if (isCoin) {
    tx.setInputSequence(1, 4294967294);
  }

  let txLockTime = timelock;
  if (isCoin) {
    const coinLockTime = stableCoin.getLockTimeFromTape(ftTapeScript);
    txLockTime = Math.max(timelock, coinLockTime);
  }
  tx.setLockTime(txLockTime);

  const privateKeyObj = new tbc.PrivateKey(privateKey);
  const publicKey = privateKeyObj.toPublicKey().toHex();

  // [0] HTLC unlock: <sig> <pubKey> OP_FALSE — callback so sig commits to
  // the final tx state (matchOrder pattern).
  tx.setInputScript({ inputIndex: 0 }, (currentTX) => {
    const sig = currentTX.getSignature(0, privateKeyObj);
    return tbc.Script.fromASM(`${sig} ${publicKey} OP_FALSE`);
  });

  // [1] FT Code unlock via getFTunlockSwap
  tx.setInputScript({ inputIndex: 1 }, (currentTX) => {
    const sig = currentTX.getSignature(1, privateKeyObj);
    return FT.getFTunlockSwap(
      sig,
      publicKey,
      currentTX,
      deployTX,
      prepreTxData,
      deployTX,
      1,
      ftutxo.outputIndex,
      ftVersion,
      isCoin,
    );
  });

  tx.sign(privateKeyObj);
  tx.seal();
  console.log("refundHTLCTokenWithSign fee:", tx.getFee(), "sat, size:", tx.toBuffer().length, "bytes");
  const txraw = tx.uncheckedSerialize();
  return txraw;
}