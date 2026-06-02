```ts
import * as tbc from "tbc-lib-js";
import * as crypto from "crypto";
import {
  API,
  HTLC,
  FT,
  parseDecimalToBigInt,
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


    // ==================== Token 版 HTLC（FT / StableCoin） ====================

    const tokenContractTxid = ""; // FT 或 StableCoin 合约 txid
    const tokenAmount = "1000"; // 锁定 token 数量，建议大数使用 string
    const tokenFee = 0.01; // Token HTLC 需要额外 TBC UTXO 支付手续费

    // DeployHTLCToken（部署 Token HTLC，带私钥签名）
    // 输出结构：0 为 HTLC 脚本，1 为锁到 HTLC hash160 的 FT Code，2 为对应 FT Tape。
    {
      const Token = new FT(tokenContractTxid);
      const tokenInfo = await API.fetchFtInfo(Token.contractTxid, network);
      Token.initialize(tokenInfo);

      const ftAmountBN = parseDecimalToBigInt(tokenAmount, Token.decimal);
      const ftCodeScript = FT.buildFTtransferCode(Token.codeScript, addressSender)
        .toBuffer()
        .toString("hex");
      const ftutxos = await API.fetchFtUTXOs(
        Token.contractTxid,
        addressSender,
        ftCodeScript,
        network,
        ftAmountBN,
      );
      const preTXs: tbc.Transaction[] = [];
      const prepreTxDatas: string[] = [];
      for (let i = 0; i < ftutxos.length; i++) {
        preTXs.push(await API.fetchTXraw(ftutxos[i].txId, network));
        prepreTxDatas.push(
          await API.fetchFtPrePreTxData(preTXs[i], ftutxos[i].outputIndex, network),
        );
      }

      const utxo = await API.fetchUTXO(privateKey_sender, tokenFee, network);
      const deployTokenTXRaw = HTLC.deployHTLCTokenWithSign(
        addressSender,
        addressReceiver,
        hashlock,
        timelock,
        tokenAmount,
        ftutxos,
        utxo,
        preTXs,
        prepreTxDatas,
        privateKey_sender.toString(),
      );
      const txid = await API.broadcastTXraw(deployTokenTXRaw, network);
      console.log("Token HTLC 合约部署成功，TXID:", txid);
    }

    // WithdrawHTLCToken（接收方提取 Token，带私钥签名）
    {
      const deployTokenTxid = ""; // deployHTLCToken 返回的 txid
      const deployTX = await API.fetchTXraw(deployTokenTxid, network);
      const htlcutxo = {
        txId: deployTokenTxid,
        outputIndex: 0,
        script: deployTX.outputs[0].script.toHex(),
        satoshis: deployTX.outputs[0].satoshis,
      };
      const ftutxo = {
        txId: deployTokenTxid,
        outputIndex: 1,
        script: deployTX.outputs[1].script.toHex(),
        satoshis: deployTX.outputs[1].satoshis,
      };
      const prepreTxData = await API.fetchFtPrePreTxData(
        deployTX,
        ftutxo.outputIndex,
        network,
      );
      const utxo = await API.fetchUTXO(privateKey_receiver, tokenFee, network);
      const withdrawTokenTXRaw = HTLC.withdrawHTLCTokenWithSign(
        privateKey_receiver.toString(),
        addressReceiver,
        htlcutxo,
        ftutxo,
        deployTX,
        prepreTxData,
        utxo,
        secret,
      );
      const txid = await API.broadcastTXraw(withdrawTokenTXRaw, network);
      console.log("Token 提取成功，TXID:", txid);
    }

    // RefundHTLCToken（发送方取回 Token，带私钥签名）
    // 超过 timelock 后可执行；StableCoin 会同时满足自身 lockTime。
    {
      const deployTokenTxid = ""; // deployHTLCToken 返回的 txid
      const deployTX = await API.fetchTXraw(deployTokenTxid, network);
      const htlcutxo = {
        txId: deployTokenTxid,
        outputIndex: 0,
        script: deployTX.outputs[0].script.toHex(),
        satoshis: deployTX.outputs[0].satoshis,
      };
      const ftutxo = {
        txId: deployTokenTxid,
        outputIndex: 1,
        script: deployTX.outputs[1].script.toHex(),
        satoshis: deployTX.outputs[1].satoshis,
      };
      const prepreTxData = await API.fetchFtPrePreTxData(
        deployTX,
        ftutxo.outputIndex,
        network,
      );
      const utxo = await API.fetchUTXO(privateKey_sender, tokenFee, network);
      const refundTokenTXRaw = HTLC.refundHTLCTokenWithSign(
        privateKey_sender.toString(),
        addressSender,
        htlcutxo,
        ftutxo,
        deployTX,
        prepreTxData,
        utxo,
        timelock,
      );
      const txid = await API.broadcastTXraw(refundTokenTXRaw, network);
      console.log("Token 退款成功，TXID:", txid);
    }

    // Token 版不带私钥签名的用法（前端构建交易、钱包外部签名场景）
    // sigs 顺序：deploy 为 [每个 FT 输入签名..., 手续费 UTXO 签名]；withdraw/refund 为 [HTLC 签名, FT Code 签名, 手续费 UTXO 签名]。
    {
      const Token = new FT(tokenContractTxid);
      const tokenInfo = await API.fetchFtInfo(Token.contractTxid, network);
      Token.initialize(tokenInfo);
      const ftAmountBN = parseDecimalToBigInt(tokenAmount, Token.decimal);
      const ftCodeScript = FT.buildFTtransferCode(Token.codeScript, addressSender)
        .toBuffer()
        .toString("hex");
      const ftutxos = await API.fetchFtUTXOs(
        Token.contractTxid,
        addressSender,
        ftCodeScript,
        network,
        ftAmountBN,
      );
      const preTXs: tbc.Transaction[] = [];
      const prepreTxDatas: string[] = [];
      for (let i = 0; i < ftutxos.length; i++) {
        preTXs.push(await API.fetchTXraw(ftutxos[i].txId, network));
        prepreTxDatas.push(
          await API.fetchFtPrePreTxData(preTXs[i], ftutxos[i].outputIndex, network),
        );
      }

      const utxo = await API.fetchUTXO(privateKey_sender, tokenFee, network);
      const deployRaw = HTLC.deployHTLCToken(
        addressSender,
        addressReceiver,
        hashlock,
        timelock,
        tokenAmount,
        ftutxos,
        utxo,
        preTXs,
        prepreTxDatas,
      );
      const deploySigs: string[] = []; // 外部钱包按输入顺序签名后填入
      const deployPublicKey = privateKey_sender.toPublicKey().toHex();
      const signedDeployRaw = HTLC.fillSigDeployHTLCToken(
        deployRaw,
        deploySigs,
        deployPublicKey,
        preTXs,
        prepreTxDatas,
      );
      console.log("Token HTLC 已填入部署签名:", signedDeployRaw);
    }

    // Token withdraw/refund 不带私钥签名时，先构建 raw，再用 fillSig* 填入外部签名。
    {
      const deployTokenTxid = "";
      const deployTX = await API.fetchTXraw(deployTokenTxid, network);
      const htlcutxo = {
        txId: deployTokenTxid,
        outputIndex: 0,
        script: deployTX.outputs[0].script.toHex(),
        satoshis: deployTX.outputs[0].satoshis,
      };
      const ftutxo = {
        txId: deployTokenTxid,
        outputIndex: 1,
        script: deployTX.outputs[1].script.toHex(),
        satoshis: deployTX.outputs[1].satoshis,
      };
      const prepreTxData = await API.fetchFtPrePreTxData(
        deployTX,
        ftutxo.outputIndex,
        network,
      );

      const receiverFeeUtxo = await API.fetchUTXO(privateKey_receiver, tokenFee, network);
      const withdrawRaw = HTLC.withdrawHTLCToken(
        addressReceiver,
        htlcutxo,
        ftutxo,
        deployTX,
        receiverFeeUtxo,
      );
      const withdrawSigs: string[] = []; // [HTLC, FTCode, tbcFee]
      const receiverPublicKey = privateKey_receiver.toPublicKey().toHex();
      const signedWithdrawRaw = HTLC.fillSigWithdrawHTLCToken(
        withdrawRaw,
        withdrawSigs,
        receiverPublicKey,
        secret,
        deployTX,
        prepreTxData,
      );
      console.log("Token HTLC 已填入提取签名:", signedWithdrawRaw);

      const senderFeeUtxo = await API.fetchUTXO(privateKey_sender, tokenFee, network);
      const refundRaw = HTLC.refundHTLCToken(
        addressSender,
        htlcutxo,
        ftutxo,
        deployTX,
        senderFeeUtxo,
        timelock,
      );
      const refundSigs: string[] = []; // [HTLC, FTCode, tbcFee]
      const senderPublicKey = privateKey_sender.toPublicKey().toHex();
      const signedRefundRaw = HTLC.fillSigRefundHTLCToken(
        refundRaw,
        refundSigs,
        senderPublicKey,
        deployTX,
        prepreTxData,
      );
      console.log("Token HTLC 已填入退款签名:", signedRefundRaw);
    }

  } catch (error: any) {
    console.error("Error:", error);
  }
}

main();
```
