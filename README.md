TBC-CONTRACT
===
To get started, install the library using the following command:

```shell
npm i tbc-contract
```

## Build Transcation

```ts
import * as tbc from 'tbc-lib-js';
import { API } from "tbc-contract"

const network = "testnet";//Choose testnet or mainnet
const privateKeyA = tbc.PrivateKey.fromString('L1u2TmR7hMMMSV...');//Import privatekey
const addressA = privateKeyA.toAddress().toString();//Address of privateKeyA
const addressB = "1FhSD1YezTXbdRGWzNbNvUj6qeKQ6gZDMq";//The address to receive tbc

async function main() {
    try {
        const tbcAmount = 10;//The number of tbc transferred to addressB
        const utxo = await API.fetchUTXO(privateKeyA, tbcAmount + 0.0008, network);//Fetch UTXO for the transcation
        const tx = new tbc.Transaction()//Build transcation
            .from(utxo)
            .to(addressB,tbcAmount)
            .change(addressA)
            .sign(privateKeyA)
            .seal();
        const txraw = tx.serialize();//Generate txraw
        await API.broadcastTXraw(txraw, network);//Broadcast txraw
    } catch (error: any) {
        console.error('Error:', error);
    }
}
main();
```

## NFT

```ts
import * as contract from "tbc-contract"；
import * as tbc from "tbc-lib-js"；
const fs = require('fs').promises;
const path = require('path');
const network= "testnet"
//const network= "mainnet"

// 将图片转换为base64
async function encodeByBase64(filePath: string): Promise<string> {
    try {
        const data = await fs.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
        const base64Data = `data:${mimeType};base64,${data.toString("base64")}`;
        return base64Data;
    } catch (err) {
            throw new Error(`Failed to read or encode file: ${err.message}`);
    }
}
const privateKey = tbc.PrivateKey.fromString("");
const address = privateKey.toAddress().toString();
const main = async ()=>{
    const utxos = await contract.API.getUTXOs(address,0.01,network);
    const content = await encodeByBase64(filePath);
    const collection_data = {
      collectionName: "";
      description: "";
      supply: 10;
      file: content;
    };
    const txraw1 = contract.NFT.createCollection(address, privateKey, collection_data, utxos);//创建合集
    const collection_id = await contract.API.broadcastTXraw(txraw1);

    const utxos = await contract.API.getUTXOs(address,0.01,network);
    const content = await encodeByBase64(filePath);
    const nft_data = {
        nftName: "";
        symbol: "";
        description: "";
        attributes: "";
        file?: content; //file可为空，为空引用合集的照片
    }
    const nfttxo1 = await contract.API.fetchNFTTXO({ script: contract.NFT.buildMintScript(address).toBuffer().toString("hex"), tx_hash: collection_id, network });
    const txraw2 = contract.NFT.createNFT(collection_id,address,privateKey,nft_data, utxos, nfttxo1);//创建合集下的NFT
    const contract_id = await contract.API.broadcastTXraw(txraw2);

    const nft = new contract.NFT(contract_id);
    const nftInfo = await contract.API.fetchNFTInfo(contract_id, network);
    nft.initialize(nftInfo);
    const utxos = await contract.API.getUTXOs(address,1,network);//第一次转移nft需要准备较多的utxo，后续转移nft需要准备较少的utxo
    const nfttxo2 = await contract.API.fetchNFTTXO({ script: contract.NFT.buildCodeScript(nftInfo.collectionId, nftInfo.collectionIndex).toBuffer().toString("hex"), network });
    const pre_tx = await contract.API.fetchTXraw(nfttxo2.txId, network);
    const pre_pre_tx = await contract.API.fetchTXraw(pre_tx.toObject().inputs[0].prevTxId, network);
    const txraw3 = nft.transferNFT(address_from, address_to, privateKey, utxos, pre_tx, pre_pre_tx);//转移nft
    await contract.API.broadcastTXraw(txraw3);
}
 
main();

```


## FT

```ts
import * as tbc from "tbc-lib-js"
import { API, FT, poolNFT } from "tbc-contract"

const network= "testnet";
const privateKeyA = tbc.PrivateKey.fromString('');
const publicKeyA = tbc.PublicKey.fromPrivateKey(privateKeyA);
const addressA = tbc.Address.fromPrivateKey(privateKeyA).toString();
const addressB = "1FhSD1YezTXbdRGWzNbNvUj6qeKQ6gZDMq";

const ftName = 'test';
const ftSymbol = 'test';
const ftDecimal = 6;
const ftAmount = 100000000;

async function main() {
    try {
        //Mint
        const newToken = new FT({
            name: ftName,
            symbol: ftSymbol,
            amount: ftAmount,
            decimal: ftDecimal
        });

        const utxo = await API.fetchUTXO(privateKeyA, 0.01, network);//准备utxo
        const mintTX = newToken.MintFT(privateKeyA, addressA, utxo);//组装交易
        await API.broadcastTXraw(mintTX[0], network);
        console.log("FT Contract ID:");
        await API.broadcastTXraw(mintTX[1], network);

        //Transfer
        const transferTokenAmount = 1000;//转移数量
        const Token = new FT('ae9107b33ba2ef5a4077396557915957942d2b25353e728f941561dfa0db5300');
        const TokenInfo = await API.fetchFtInfo(Token.contractTxid, network);//获取FT信息
        Token.initialize(TokenInfo);
        const utxo = await API.fetchUTXO(privateKeyA, 0.01, network);//准备utxo
        const transferTokenAmountBN = BigInt(transferTokenAmount * Math.pow(10, Token.decimal));
        const ftutxo_codeScript = FT.buildFTtransferCode(Token.codeScript, addressA).toBuffer().toString('hex');
        const ftutxos = await API.fetchFtUTXOs(Token.contractTxid, addressA, ftutxo_codeScript, network, transferTokenAmountBN);//准备ft utxo
        let preTXs: tbc.Transaction[] = [];
        let prepreTxDatas: string[] = [];
        for (let i = 0; i < ftutxos.length; i++) {
            preTXs.push(await API.fetchTXraw(ftutxos[i].txId, network));//获取每个ft输入的父交易
            prepreTxDatas.push(await API.fetchFtPrePreTxData(preTXs[i], ftutxos[i].outputIndex, network));//获取每个ft输入的爷交易
        }
        const transferTX = Token.transfer(privateKeyA, addressA, transferTokenAmount, ftutxos, utxo, preTXs, prepreTxDatas);//组装交易
        await API.broadcastTXraw(transferTX, network);

        //Merge
        const Token = new FT('ae9107b33ba2ef5a4077396557915957942d2b25353e728f941561dfa0db5300');
        const TokenInfo = await API.fetchFtInfo(Token.contractTxid, network);//获取FT信息
        Token.initialize(TokenInfo);
        const utxo = await API.fetchUTXO(privateKeyA, 0.01, network);//准备utxo
        const ftutxo_codeScript = FT.buildFTtransferCode(Token.codeScript, addressA).toBuffer().toString('hex');
        const ftutxos = await API.fetchFtUTXOs(Token.contractTxid, addressA, ftutxo_codeScript, network);//准备多个ft utxo
        let preTXs: tbc.Transaction[] = [];
        let prepreTxDatas: string[] = [];
        for (let i = 0; i < ftutxos.length; i++) {
            preTXs.push(await API.fetchTXraw(ftutxos[i].txId, network));//获取每个ft输入的父交易
            prepreTxDatas.push(await API.fetchFtPrePreTxData(preTXs[i], ftutxos[i].outputIndex, network));//获取每个ft输入的爷交易
        }
        const mergeTX = Token.mergeFT(privateKeyA, ftutxos, utxo, preTXs, prepreTxDatas);//组装交易
        if (typeof mergeTX === 'string') {
            await API.broadcastTXraw(mergeTX, network); 
        } else {
            console.log("Merge success");
        }
    } catch (error: any) {
        console.error('Error:', error);
    }
}
main();
```

## poolNFT

```ts
import * as tbc from "tbc-lib-js";
import { API, FT, poolNFT } from "tbc-contract";

const network = "testnet";
const privateKeyA = tbc.PrivateKey.fromString('');
const addressA = tbc.Address.fromPrivateKey(privateKeyA).toString();
const ftContractTxid = "";
const poolNftContractId = "";

const fee = 0.01;   //可能的交易手续费，根据需要取值

async function main() {
    try {
        // Step 1: 创建 poolNFT，并初始化
        const pool = new poolNFT({network: "testnet"});
        await pool.initCreate(ftContractTxid);
        const utxo = await API.fetchUTXO(privateKeyA, fee, network);
        const tx1 = await pool.createPoolNFT(privateKeyA, utxo);
        await API.broadcastTXraw(tx1[0], network);
        console.log("poolNFT Contract ID:");
        await API.broadcastTXraw(tx1[1], network);

        // Step 2: 使用已创建的 poolNFT
        const poolUse = new poolNFT({txidOrParams: poolNftContractId, network:"testnet"});
        await poolUse.initfromContractId();

            // Step 2.1: 为刚创建的 poolNFT 注入初始资金
            {
                let tbcAmount = 30;
                let ftAmount = 1000;
                // 准备 utxo
                const utxo = await API.fetchUTXO(privateKeyA, tbcAmount + fee, network);
                let tx2 = await poolUse.initPoolNFT(privateKeyA, addressA, utxo, tbcAmount, ftAmount);
                await API.broadcastTXraw(tx2, network);
            }

            // Step 2.2: 为已完成初始资金注入的 poolNFT 添加流动性
            {
                let tbcAmount = 0.1; // 至少添加0.1个TBC
                // 准备 utxo
                const utxo = await API.fetchUTXO(privateKeyA, tbcAmount + fee, network);
                const tx3 = await poolUse.increaseLP(privateKeyA, addressA, utxo, tbcAmount);
                await API.broadcastTXraw(tx3, network);
            }

            // Step 2.3: 花费拥有的 LP
            {
                let lpAmount = 2; // 至少花费0.1个LP，若花费的LP高于池子LP的10%，必须满足池子LP与花费的LP比值没有余数（即被整除）
                // 准备 utxo
                const utxo = await API.fetchUTXO(privateKeyA, fee, network);
                const tx4 = await poolUse.consumeLP(privateKeyA, addressA, utxo, lpAmount);
                await API.broadcastTXraw(tx4, network);
            }

            // Step 2.4: 用 TBC 兑换 Token
            {
                let tbcAmount = 0.1; // 用于兑换的tbc数量，至少0.1tbc
                // 准备 utxo
                const utxo = await API.fetchUTXO(privateKeyA, tbcAmount + fee, network);
                const tx6 = await poolUse.swaptoToken_baseTBC(privateKeyA, addressA, utxo, tbcAmount);
                await API.broadcastTXraw(tx6, network);
            }

            // Step 2.5: 用 Token 兑换 TBC
            {
                let ftAmount = 100; // 用于兑换的ft数量，至少兑换0.1个TBC
                // 准备 utxo
                const utxo = await API.fetchUTXO(privateKeyA, fee, network);
                const tx8 = await poolUse.swaptoTBC_baseToken(privateKeyA, addressA, utxo, ftAmount);
                await API.broadcastTXraw(tx8, network);
            }

            // 获取 Pool NFT 信息和 UTXO
            {
                const poolNFTInfo = await poolUse.fetchPoolNFTInfo(poolUse.contractTxid);
                const poolnftUTXO = await poolUse.fetchPoolNftUTXO(poolUse.contractTxid);
            }

            // 获取 FT-LP UTXO
            {
                const FTA = new FT(poolUse.ft_a_contractTxid);
                const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, network);
                await FTA.initialize(FTAInfo);

                let amount = 0.1;
                let lpAmountBN = BigInt(Math.ceil(amount * Math.pow(10, 6)));
                const ftlpCode = poolUse.getFTLPcode(
                    tbc.crypto.Hash.sha256(Buffer.from(poolUse.poolnft_code, 'hex')).toString('hex'),
                    addressA,
                    FTA.tapeScript.length / 2
                );
                
                const ftutxo_lp = await poolUse.fetchFtlpUTXO(ftlpCode.toBuffer().toString('hex'), lpAmountBN);
            }

            // 合并 FT-LP 的操作，一次合并最多5合一
            {
                const utxo = await API.fetchUTXO(privateKeyA, fee, network); 
                const tx9 = await poolUse.mergeFTLP(privateKeyA, utxo); 
                if (typeof tx9 === 'string') {
                    await API.broadcastTXraw(tx9, network); 
                } else {
                    console.log("Merge success");
                }
            }

            //合并池子中的 FT、TBC，一次合并最多4合一
            {
                const utxo = await API.fetchUTXO(privateKeyA, fee, network); 
                const tx10 = await poolUse.mergeFTinPool(privateKeyA, utxo);
                if (typeof tx10 === 'string') {
                    await API.broadcastTXraw(tx10, network); 
                } else {
                    console.log("Merge success");
                }
            }

    } catch (error: any) {
        console.error('Error:', error); 
    }
}

main();
```
## MultiSig

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
const utxos = await contract.API.getUTXOs(address_from, amount_tbc + 0.0003, network);
const txraw = contract.MultiSig.createMultiSigWallet(address_from, pubKeys, signatureCount, publicKeyCount, amount_tbc, utxos, privateKey);
await contract.API.broadcastTXraw(txraw, network);

//普通地址向多签地址转tbc
const amount_tbc = 10//转移的tbc数量
const utxos = await contract.API.getUTXOs(address_from, amount_tbc + 0.0003, network);
const txraw = contract.MultiSig.p2pkhToMultiSig_sendTBC(address_from, multiSigAddress, amount_tbc, utxos, privateKey);
await contract.API.broadcastTXraw(txraw, network);

//多签地址向普通地址/多签地址转tbc
const const amount_tbc = 10//转移的tbc数量
const script_asm = contract.MultiSig.getMultiSigLockScript(multiSigAddress);
const umtxos = await contract.API.getUMTXOs(script_asm, amount_tbc+0.0003, network);
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
const transferTokenAmountBN = BigInt(Math.ceil(transferTokenAmount * Math.pow(10, Token.decimal)));
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

//多签地址向普通地址/多签地址转ft
const multiSigAddress = contract.MultiSig.getMultiSigAddress(pubkeys, signatureCount, publicKeyCount);
const script_asm = contract.MultiSig.getMultiSigLockScript(multiSigAddress);
const umtxo = await contract.API.fetchUMTXO(script_asm, network);
const Token = new contract.FT('ac3e93dff3460aab4956e092e4078e9b7c34c29fc160772adbf1778556726809');
const TokenInfo = await contract.API.fetchFtInfo(Token.contractTxid, network);
Token.initialize(TokenInfo);
const transferTokenAmount = 600;//转移数量
const transferTokenAmountBN = BigInt(Math.ceil(transferTokenAmount * Math.pow(10, Token.decimal)));
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
const multiTxraw = contract.MultiSig.buildMultiSigTransaction_transferFT(multiSigAddress,address_to, Token, transferTokenAmount, umtxo, ftutxos, preTXs, prepreTxDatas, contractTX, privateKeyC);
const sig1 = contract.MultiSig.signMultiSigTransaction_transferFT(multiSigAddress, Token, multiTxraw, privateKeyC);
const sig2 = contract.MultiSig.signMultiSigTransaction_transferFT(multiSigAddress, Token, multiTxraw, privateKeyA);
const sig3 = contract.MultiSig.signMultiSigTransaction_transferFT(multiSigAddress, Token, multiTxraw, privateKeyB);
    let sigs: string[][] = [];
    for (let i = 0; i < sig1.length; i++) {
        sigs[i] = [sig1[i], sig2[i]];
    }//sigs可由sig1 sig2或sig1 sig3 或sig2 sig3组成
const txraw = contract.MultiSig.finishMultiSigTransaction_transferFT(multiTxraw.txraw, sigs, pubkeys);
await contract.API.broadcastTXraw(txraw, network);
```


