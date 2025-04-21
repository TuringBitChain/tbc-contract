```ts
import * as tbc from "tbc-lib-js"
import * as contract from "tbc-contract"
const network = "testnet 
//const network = "mainnet"
//签名数为1-6 公钥数为3-10 签名数小于等于公钥数 公钥数组按字母序排列 下为2/3多签示例

//计算多签地址
const multiSigAddress = contract.MultiSig.getMultiSigAddress(pubKeys, signatureCount, publicKeyCount);

//创建多签钱包
const amount_tbc = 1 //创建时候往多签地址下存的tbc数量
const utxos = await contract.API.getUTXOs(address_from, amount_tbc + 0.001, network);
const txraw = contract.MultiSig.createMultiSigWallet(address_from, pubKeys, signatureCount, publicKeyCount, amount_tbc, utxos, privateKey);
await contract.API.broadcastTXraw(txraw, network);

//普通地址向多签地址转tbc
const amount_tbc = 10//转移的tbc数量
const utxos = await contract.API.getUTXOs(address_from, amount_tbc + 0.001, network);
const txraw = contract.MultiSig.p2pkhToMultiSig_sendTBC(address_from, multiSigAddress, amount_tbc, utxos, privateKey);
await contract.API.broadcastTXraw(txraw, network);

//多签地址向普通地址/多签地址转tbc
const const amount_tbc = 10//转移的tbc数量
const script_asm = contract.MultiSig.getMultiSigLockScript(multiSigAddress);
const umtxos = await contract.API.getUMTXOs(script_asm, amount_tbc+0.001, network);
const multiTxraw = contract.MultiSig.buildMultiSigTransaction_sendTBC(multiSigAddress, address_to, amount_tbc, umtxos);
const sig1 = contract.MultiSig.signMultiSigTransaction_sendTBC(multiSigAddress, multiTxraw, privateKeyA);
const sig2 = contract.MultiSig.signMultiSigTransaction_sendTBC(multiSigAddress, multiTxraw, privateKeyB);
const sig3 = contract.MultiSig.signMultiSigTransaction_sendTBC(multiSigAddress, multiTxraw, privateKeyC);
let sigs: string[][] = [];
for (let i = 0; i < sig1.length; i++) {
        sigs[i] = [sig1[i], sig2[i]];
}//sigs可由sig1 sig2或sig1 sig3 或sig2 sig3组成
const txraw =contract.MultiSig.finishMultiSigTransaction_sendTBC(multiTxraw.txraw, sigs, pubKeys);
await contract.API.broadcastTXraw(txraw, network);

//普通地址向多签地址转ft
const utxo = await contract.API.fetchUTXO(privateKey, 0.01, network); 
const Token = new contract.FT('ac3e93dff3460aab4956e092e4078e9b7c34c29fc160772adbf1778556726809');
const TokenInfo = await contract.API.fetchFtInfo(Token.contractTxid, network);
Token.initialize(TokenInfo);
const transferTokenAmount = 10000;//转移数量
const transferTokenAmountBN = BigInt(Math.floor(transferTokenAmount * Math.pow(10, Token.decimal)));
const ftutxo_codeScript = contract.FT.buildFTtransferCode(Token.codeScript, address_from).toBuffer().toString('hex');
const ftutxos = await contract.API.fetchFtUTXOs(Token.contractTxid, address_from, ftutxo_codeScript, network, transferTokenAmountBN);//准备ft utxo
let preTXs: tbc.Transaction[] = [];
let prepreTxDatas: string[] = [];
for (let i = 0; i < ftutxos.length; i++) {
    preTXs.push(await contract.API.fetchTXraw(ftutxos[i].txId, network));//获取每个ft输入的父交易
    prepreTxDatas.push(await contract.API.fetchFtPrePreTxData(preTXs[i], ftutxos[i].outputIndex, network));//获取每个ft输入的爷交易
}
const transferTX = contract.MultiSig.p2pkhToMultiSig_transferFT(address_from, multiSigAddress, Token, transferTokenAmount, utxo, ftutxos, preTXs, prepreTxDatas, privateKey);//组装交易
await contract.API.broadcastTXraw(transferTX, network);

//普通地址向多签地址同时转ft和tbc
const tbc_amount = 1; //可选参数 如果转ft同时需要转tbc，可设置tbc数量
const utxo = await contract.API.fetchUTXO(privateKey, 0.01 + tbc_amount, network); 
const Token = new contract.FT('ac3e93dff3460aab4956e092e4078e9b7c34c29fc160772adbf1778556726809');
const TokenInfo = await contract.API.fetchFtInfo(Token.contractTxid, network);
Token.initialize(TokenInfo);
const transferTokenAmount = 10000;//转移数量
const transferTokenAmountBN = BigInt(Math.floor(transferTokenAmount * Math.pow(10, Token.decimal)));
const ftutxo_codeScript = contract.FT.buildFTtransferCode(Token.codeScript, address_from).toBuffer().toString('hex');
const ftutxos = await contract.API.fetchFtUTXOs(Token.contractTxid, address_from, ftutxo_codeScript, network, transferTokenAmountBN);//准备ft utxo
let preTXs: tbc.Transaction[] = [];
let prepreTxDatas: string[] = [];
for (let i = 0; i < ftutxos.length; i++) {
    preTXs.push(await contract.API.fetchTXraw(ftutxos[i].txId, network));//获取每个ft输入的父交易
    prepreTxDatas.push(await contract.API.fetchFtPrePreTxData(preTXs[i], ftutxos[i].outputIndex, network));//获取每个ft输入的爷交易
}
const transferTX = contract.MultiSig.p2pkhToMultiSig_transferFT(address_from, multiSigAddress, Token, transferTokenAmount, utxo, ftutxos, preTXs, prepreTxDatas, privateKey,tbc_amount);//组装交易
await contract.API.broadcastTXraw(transferTX, network);

//多签地址向普通地址/多签地址转ft
const multiSigAddress = contract.MultiSig.getMultiSigAddress(pubkeys, signatureCount, publicKeyCount);
const script_asm = contract.MultiSig.getMultiSigLockScript(multiSigAddress);
const umtxo = await contract.API.fetchUMTXO(script_asm, 0.01, network);
const Token = new contract.FT('ac3e93dff3460aab4956e092e4078e9b7c34c29fc160772adbf1778556726809');
const TokenInfo = await contract.API.fetchFtInfo(Token.contractTxid, network);
Token.initialize(TokenInfo);
const transferTokenAmount = 600;//转移数量
const transferTokenAmountBN = BigInt(Math.floor(transferTokenAmount * Math.pow(10, Token.decimal)));
const hash_from = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(tbc.Script.fromASM(script_asm).toBuffer())).toString("hex");
const ftutxo_codeScript = contract.FT.buildFTtransferCode(Token.codeScript, hash_from).toBuffer().toString('hex');
const ftutxos = await contract.API.getFtUTXOS_multiSig(Token.contractTxid, hash_from, ftutxo_codeScript, transferTokenAmountBN, network);//准备ft utxo
let preTXs: tbc.Transaction[] = [];
let prepreTxDatas: string[] = [];
for (let i = 0; i < ftutxos.length; i++) {
     preTXs.push(await contract.API.fetchTXraw(ftutxos[i].txId, network));//获取每个ft输入的父交易
     prepreTxDatas.push(await contract.API.fetchFtPrePreTxData(preTXs[i], ftutxos[i].outputIndex, network));//获取每个ft输入的爷交易
}
const contractTX = await contract.API.fetchTXraw(umtxo.txId, network);
const multiTxraw = contract.MultiSig.buildMultiSigTransaction_transferFT(multiSigAddress,address_to, Token, transferTokenAmount, umtxo, ftutxos, preTXs, prepreTxDatas, contractTX, privateKeyC);
const sig1 = contract.MultiSig.signMultiSigTransaction_transferFT(multiSigAddress,  multiTxraw, privateKeyC);
const sig2 = contract.MultiSig.signMultiSigTransaction_transferFT(multiSigAddress,  multiTxraw, privateKeyA);
const sig3 = contract.MultiSig.signMultiSigTransaction_transferFT(multiSigAddress,  multiTxraw, privateKeyB);
    let sigs: string[][] = [];
    for (let i = 0; i < sig1.length; i++) {
        sigs[i] = [sig1[i], sig2[i]];
    }//sigs可由sig1 sig2或sig1 sig3 或sig2 sig3组成
const txraw = contract.MultiSig.finishMultiSigTransaction_transferFT(multiTxraw.txraw, sigs, pubkeys);
await contract.API.broadcastTXraw(txraw, network);

//多签地址向普通地址/多签地址同时转ft和tbc
const tbc_amount = 1; //可选参数 如果转ft同时需要转tbc，可设置tbc数量
const multiSigAddress = contract.MultiSig.getMultiSigAddress(pubkeys, signatureCount, publicKeyCount);
const script_asm = contract.MultiSig.getMultiSigLockScript(multiSigAddress);
const umtxo = await contract.API.fetchUMTXO(script_asm ,0.01 + tbc_amount, network);
const Token = new contract.FT('ac3e93dff3460aab4956e092e4078e9b7c34c29fc160772adbf1778556726809');
const TokenInfo = await contract.API.fetchFtInfo(Token.contractTxid, network);
Token.initialize(TokenInfo);
const transferTokenAmount = 600;//转移数量
const transferTokenAmountBN = BigInt(Math.floor(transferTokenAmount * Math.pow(10, Token.decimal)));
const hash_from = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(tbc.Script.fromASM(script_asm).toBuffer())).toString("hex");
const ftutxo_codeScript = contract.FT.buildFTtransferCode(Token.codeScript, hash_from).toBuffer().toString('hex');
const ftutxos = await contract.API.fetchFtUTXOS_multiSig(Token.contractTxid, hash_from, ftutxo_codeScript, transferTokenAmountBN, network);//准备ft utxo
let preTXs: tbc.Transaction[] = [];
let prepreTxDatas: string[] = [];
for (let i = 0; i < ftutxos.length; i++) {
     preTXs.push(await contract.API.fetchTXraw(ftutxos[i].txId, network));//获取每个ft输入的父交易
     prepreTxDatas.push(await contract.API.fetchFtPrePreTxData(preTXs[i], ftutxos[i].outputIndex, network));//获取每个ft输入的爷交易
}
const contractTX = await contract.API.fetchTXraw(umtxo.txId, network);
const multiTxraw = contract.MultiSig.buildMultiSigTransaction_transferFT(multiSigAddress,address_to, Token, transferTokenAmount, umtxo, ftutxos, preTXs, prepreTxDatas, contractTX, privateKeyC,tbc_amount);
const sig1 = contract.MultiSig.signMultiSigTransaction_transferFT(multiSigAddress, multiTxraw, privateKeyC);
const sig2 = contract.MultiSig.signMultiSigTransaction_transferFT(multiSigAddress, multiTxraw, privateKeyA);
const sig3 = contract.MultiSig.signMultiSigTransaction_transferFT(multiSigAddress, multiTxraw, privateKeyB);
    let sigs: string[][] = [];
    for (let i = 0; i < sig1.length; i++) {
        sigs[i] = [sig1[i], sig2[i]];
    }//sigs可由sig1 sig2或sig1 sig3 或sig2 sig3组成
const txraw = contract.MultiSig.finishMultiSigTransaction_transferFT(multiTxraw.txraw, sigs, pubkeys);
await contract.API.broadcastTXraw(txraw, network);
```
