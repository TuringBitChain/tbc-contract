```ts
import * as contract from "tbc-contract"；
import * as tbc from "tbc-lib-js"；
const fs = require('fs').promises;
const path = require('path');
const network= "testnet"
//const network= "mainnet"

//以下以1MB数据图片为例
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
    //创建合集
    const content = await encodeByBase64(filePath);
    const collection_data = {
      collectionName: "",
      description: "",
      supply: 10,
      file: content,
    };
    const utxos = await contract.API.getUTXOs(address,0.2,network);
    const txraw = contract.NFT.createCollection(address, privateKey, collection_data, utxos);
    const collection_id = await contract.API.broadcastTXraw(txraw,network);
    //创建合集下的NFT
    const content = await encodeByBase64(filePath);
    const nft_data = {
        nftName: "",
        symbol: "",
        description: "",
        attributes: "",
        file?: content,//file可为空，为空引用合集的照片
    };
    let utxos:tbc.Transaction.IUnspentOutput[] = [];
    if (nft_data){
        utxos = await contract.API.getUTXOs(address,0.2,network);
    }else{
        utxos = await contract.API.getUTXOs(address,0.001,network);
    }
    const nfttxo = await contract.API.fetchNFTTXO({ script: contract.NFT.buildMintScript(address).toBuffer().toString("hex"), tx_hash: collection_id, network });
    const txraw = contract.NFT.createNFT(collection_id,address,privateKey,nft_data, utxos, nfttxo);
    const contract_id = await contract.API.broadcastTXraw(txraw,network);
    //批量创建nft(使用合集图片数据)
    const number = 100;
    const nft_datas: { nftName: string, symbol: string, description: string, attributes: string }[] = [];
    for (let i = 0; i < number; i++) {
        nft_datas.push({
            nftName: "",
            symbol: "",
            description: "",
            attributes: "",
        })
    }
    const utxos = await contract.API.getUTXOs(address, 0.001 * number, network);
    const nfttxos = await contract.API.fetchNFTTXOs({ script: contract.NFT.buildMintScript(address).toBuffer().toString("hex"), tx_hash: collection_id, network });
    const selectedNfttxos = nfttxos.slice(0, nft_datas.length);
    const txraws = contract.NFT.batchCreateNFT(collection_id, address, privateKey, nft_datas, utxos, selectedNfttxos);
    await contract.API.broadcastTXsraw(txraws, network);
    //转移nft
    const nft = new contract.NFT(contract_id);
    const nftInfo = await contract.API.fetchNFTInfo(contract_id, network);
    nft.initialize(nftInfo);
    utxos = await contract.API.getUTXOs(address,0.001,network);
    const nfttxo = await contract.API.fetchNFTTXO({ script: contract.NFT.buildCodeScript(nftInfo.collectionId, nftInfo.collectionIndex).toBuffer().toString("hex"), network });
    const pre_tx = await contract.API.fetchTXraw(nfttxo.txId, network);
    const pre_pre_tx = await contract.API.fetchTXraw(pre_tx.toObject().inputs[0].prevTxId, network);
    const txraw = nft.transferNFT(address_from, address_to, privateKey, utxos, pre_tx, pre_pre_tx);
    await contract.API.broadcastTXraw(txraw,network);
}
 
main();
```
