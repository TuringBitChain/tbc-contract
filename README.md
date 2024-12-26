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
    } catch (error) {
        console.error('Error:', error);
    }
}
main();
```

## NFT

```ts
import * as contract from "tbc-contract"
import * as tbc from "tbc-lib-js"
const network= "testnet"
const privateKey = tbc.PrivateKey.fromString("");
const address = privateKey.toAddress().toString();
const main = async ()=>{
	const utxos = await contract.API.selectUTXOs(address,amount_tbc,network);
	const content = await contract.NFT.encodeByBase64(filePath);
	const collection_data = {
    	collectionName: "";
    	description: "";
    	supply: 10;
    	file: content;
	};
	const nft_data = {
    	  nftName: "";
   		  symbol: "";
          discription: "";
          attributes: "";
          file?: content; //file可为空，为空引用合集的照片
	}
    const nftInfo = await contract.API.fetchNFTInfo(contract_id, network);
    const nfttxo1 = await contract.API.fetchNFTTXO({ script: contract.NFT.buildMintScript(address).toBuffer().toString("hex"), tx_hash: collection_id, network });
	const txraw1 = contract.NFT.createCollection(address, privateKey, collection_data, utxos);//创建合集
	const collection_id = await contract.API.broadcastTXraw(txraw1);
	const txraw2 = contract.NFT.createNFT(collection_id,address,privateKey,nft_data, utxos, nfttxo1);//创建合集下的NFT
	const contract_id = await contract.API.broadcastTXraw(txraw2);
    const nft = new contract.NFT(contract_id);
    nft.initialize(nftInfo);
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

        const utxo = await API.fetchUTXO(privateKeyA, 0.001, network);//准备utxo
        const mintTX = newToken.MintFT(privateKeyA, addressA, utxo);//组装交易
        await API.broadcastTXraw(mintTX, network);

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
    } catch (error) {
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
        //0.001为手续费
        const utxo = await API.fetchUTXO(privateKeyA, 0.001, network);
        const tx1 = await pool.createPoolNFT(privateKeyA, utxo);
        await API.broadcastTXraw(tx1, network);

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

    } catch (error) {
        console.error('Error:', error); 
    }
}

main();
```
