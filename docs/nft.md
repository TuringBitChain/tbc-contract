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
    const content = await contract.NFT.encodeByBase64(filePath);
    const collection_data = {
      collectionName: "";
      description: "";
      supply: 10;
      file: content;
    };
    const txraw1 = contract.NFT.createCollection(address, privateKey, collection_data, utxos);//创建合集
    const collection_id = await contract.API.broadcastTXraw(txraw1);

    const utxos = await contract.API.getUTXOs(address,0.01,network);
    const content = await contract.NFT.encodeByBase64(filePath);
    const nft_data = {
        nftName: "";
        symbol: "";
        discription: "";
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
