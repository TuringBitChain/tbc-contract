import * as tbc from "tbc-lib-js";
import {
  _isValidSHA256Hash,
  _isValidHexString,
  parseDecimalToBigInt,
} from "../util/util";

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
