```ts
import * as tbc from "tbc-lib-js";
import * as crypto from "crypto";
import {
  API,
  HTLC,
} from "tbc-contract";

const network = "testnet";
const privateKey_sender = tbc.PrivateKey.fromString(""); // 发送方私钥
const addressSender = tbc.Address.fromPrivateKey(privateKey_sender).toString();

const privateKey_receiver = tbc.PrivateKey.fromString(""); // 接收方私钥
const addressReceiver = tbc.Address.fromPrivateKey(privateKey_receiver).toString();

// 生成 secret 和 hashlock
const secret = crypto.randomBytes(32).toString("hex"); // 随机生成 32 字节原像
const hashlock = crypto.createHash("sha256")
  .update(Buffer.from(secret, "hex"))
  .digest("hex"); // SHA256(secret)

const timelock = 1774427165; // 时间锁（unix时间），超过该时间后发送方可退款
const amount = 0.001; // 锁定金额（TBC），精度 6 位
const fee = 0.001; // 交易gas手续费
async function main() {
  try {
    // ==================== 带私钥签名的用法 ====================

    // DeployHTLC（部署 HTLC 合约）
    // 发送方创建一个 HTLC 合约，将资金锁定在合约中。
    // 接收方需提供 secret 原像才能提取；超过 timelock 后发送方可退款。
    {
      const utxo = await API.fetchUTXO(privateKey_sender, amount + fee, network);
      const deployTXRaw = HTLC.deployHTLCWithSign(
        addressSender,                  // 发送方地址
        addressReceiver,                // 接收方地址
        hashlock,                       // SHA256 哈希锁
        timelock,                       // 时间锁（unix时间戳）
        amount,                         // 锁定金额
        utxo,                           // UTXO
        privateKey_sender.toString(),   // 发送方私钥
      );
      const txid = await API.broadcastTXraw(deployTXRaw, network);
      console.log("HTLC 合约部署成功，TXID:", txid);
      // 记录 txid 和 secret，后续 withdraw 或 refund 需要用到
    }

    // Withdraw（接收方提取资金）
    // 接收方使用 secret 原像解锁 HTLC 合约，提取资金。
    // 必须在 timelock 到期之前完成。
    {
      const htlcTxid = ""; // deployHTLC 返回的 txid
      const outputIndex = 0;
      // 从链上获取 HTLC 交易，构造 UTXO
      const htlcTX = await API.fetchTXraw(htlcTxid, network);
      const htlcutxo = {
        txId: htlcTxid,
        outputIndex: outputIndex,
        script: htlcTX.outputs[outputIndex].script.toHex(),
        satoshis: htlcTX.outputs[outputIndex].satoshis,
      };
      const withdrawTXRaw = HTLC.withdrawWithSign(
        privateKey_receiver.toString(), // 接收方私钥
        addressReceiver,                // 接收方地址
        htlcutxo,                       // HTLC 合约 UTXO
        secret,                         // 原像（preimage）
      );
      const txid = await API.broadcastTXraw(withdrawTXRaw, network);
      console.log("提取成功，TXID:", txid);
    }

    // Refund（发送方退款）
    // 超过 timelock（unix时间戳）之后，发送方可以将锁定的资金退回。
    {
      const htlcTxid = ""; // deployHTLC 返回的 txid
      const outputIndex = 0;
      const htlcTX = await API.fetchTXraw(htlcTxid, network);
      const htlcutxo = {
        txId: htlcTxid,
        outputIndex: outputIndex,
        script: htlcTX.outputs[outputIndex].script.toHex(),
        satoshis: htlcTX.outputs[outputIndex].satoshis,
      };
      const refundTXRaw = HTLC.refundWithSign(
        addressSender,                  // 发送方地址
        htlcutxo,                       // HTLC 合约 UTXO
        privateKey_sender.toString(),   // 发送方私钥
        timelock,                       // 时间锁（需与部署时一致）
      );
      const txid = await API.broadcastTXraw(refundTXRaw, network);
      console.log("退款成功，TXID:", txid);
    }

    // ==================== 不带私钥签名的用法（前端构建交易钱包签名场景） ====================

    // DeployHTLC（部署 HTLC 合约，不签名）
    // 返回未签名的交易原文，需调用 fillSigDepoly 填入签名后再广播。
    {
      const utxo = await API.fetchUTXO(privateKey_sender, amount + fee, network);
      const deployTXRaw = HTLC.deployHTLC(
        addressSender,
        addressReceiver,
        hashlock,
        timelock,
        amount,
        utxo,
      );
      const sig = ""; // 前端对交易签名后获得
      const publicKey = privateKey_sender.toPublicKey().toHex();
      const signedTXRaw = HTLC.fillSigDepoly(deployTXRaw, sig, publicKey);
      const txid = await API.broadcastTXraw(signedTXRaw, network);
      console.log("HTLC 合约部署成功，TXID:", txid);
    }

    // Withdraw（接收方提取，不签名）
    {
      const htlcTxid = "";
      const outputIndex = 0;
      const htlcTX = await API.fetchTXraw(htlcTxid, network);
      const htlcutxo = {
        txId: htlcTxid,
        outputIndex: outputIndex,
        script: htlcTX.outputs[outputIndex].script.toHex(),
        satoshis: htlcTX.outputs[outputIndex].satoshis,
      };
      const withdrawTXRaw = HTLC.withdraw(addressReceiver, htlcutxo);
      const sig = "";
      const publicKey = privateKey_receiver.toPublicKey().toHex();
      const signedTXRaw = HTLC.fillSigWithdraw(withdrawTXRaw, secret, sig, publicKey);
      const txid = await API.broadcastTXraw(signedTXRaw, network);
      console.log("提取成功，TXID:", txid);
    }

    // Refund（发送方退款，不签名）
    {
      const htlcTxid = "";
      const outputIndex = 0;
      const htlcTX = await API.fetchTXraw(htlcTxid, network);
      const htlcutxo = {
        txId: htlcTxid,
        outputIndex: outputIndex,
        script: htlcTX.outputs[outputIndex].script.toHex(),
        satoshis: htlcTX.outputs[outputIndex].satoshis,
      };
      const refundTXRaw = HTLC.refund(addressSender, htlcutxo, timelock);
      const sig = "";
      const publicKey = privateKey_sender.toPublicKey().toHex();
      const signedTXRaw = HTLC.fillSigRefund(refundTXRaw, sig, publicKey);
      const txid = await API.broadcastTXraw(signedTXRaw, network);
      console.log("退款成功，TXID:", txid);
    }
  } catch (error: any) {
    console.error("Error:", error);
  }
}

main();
```
