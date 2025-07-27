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
    //创建合集
    const content = await encodeByBase64(filePath);
    const collection_data = {
      collectionName: "",
      description: "",
      supply: 10,
      file: content,
    };
    const utxos = await contract.API.getUTXOs(address,0.2,network);//大约每100KB图片0.05tbc手续费
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
    const number = 1000;
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
    const utxos = await contract.API.getUTXOs(address,0.01,network);
    const nfttxo = await contract.API.fetchNFTTXO({ script: contract.NFT.buildCodeScript(nftInfo.collectionId, nftInfo.collectionIndex).toBuffer().toString("hex"), network });
    const pre_tx = await contract.API.fetchTXraw(nfttxo.txId, network);
    const pre_pre_tx = await contract.API.fetchTXraw(pre_tx.toObject().inputs[0].prevTxId, network);
    const txraw = nft.transferNFT(address_from, address_to, privateKey, utxos, pre_tx, pre_pre_tx);
    await contract.API.broadcastTXraw(txraw,network);
    //批量转移nft
    const number = 100;
    const utxos = await contract.API.getUTXOs(address, 0.01 * number, network);
    const tx = new tbc.Transaction().from(utxos);
    for (let i = 0; i < number; i++) {
        tx.addOutput(new tbc.Transaction.Output({
            script: tbc.Script.buildPublicKeyHashOut(address),
            satoshis: 5000
        }));
    }
    tx.change(address);
    const txSize = tx.getEstimateSize();
    if (txSize < 1000) {
        tx.fee(80);
    }
    else {
        tx.feePerKb(80);
    }
    tx.sign(privateKey).seal();
    const txid = await contract.API.broadcastTXraw(tx.uncheckedSerialize(), network);
    const utxos_created: tbc.Transaction.IUnspentOutput[] = [];
    for (let i = 0; i < number; i++) {
        utxos_created.push({
            txId: txid,
            outputIndex: i,
            script: tbc.Script.buildPublicKeyHashOut(address).toHex(),
            satoshis: 5000
        });
    }
    let addresses: string[] = [];
    for (let i = 0; i < number; i++) {
        addresses.push(address);
    }
    const nftContractIds = await contract.API.fetchNFTs(collection_id, address, number, network);
    const nftInfoPromises = nftContractIds.map((contractId: string, index: number) =>
        contract.API.fetchNFTInfo(contractId, network)
    );
    const nftInfos = await Promise.all(nftInfoPromises);
    let nfts: contract.NFT[] = [];
    for (let i = 0; i < number; i++) {
        const nft = new contract.NFT(nftContractIds[i]);
        nft.initialize(nftInfos[i]);
        nfts.push(nft);
    }
    const nfttxoPromises = nftInfos.map((nftInfo, index) => {
        const script = contract.NFT.buildCodeScript(nftInfo.collectionId, nftInfo.collectionIndex).toBuffer().toString("hex");
        return contract.API.fetchNFTTXO({
            script: script,
            network
        });
    });
    const nfttxos = await Promise.all(nfttxoPromises);;
    const preTxPromises = nfttxos.map((nfttxo, index) =>
        contract.API.fetchTXraw(nfttxo.txId, network)
    );
    const preTxs = await Promise.all(preTxPromises);
    const collectionTx = await contract.API.fetchTXraw(collection_id, network);
    const prePreTxPromises = preTxs.map((preTx, index) => {
        const nftInfo = nftInfos[index];
        if (nftInfo.nftTransferTimeCount === 0) {
            return Promise.resolve(collectionTx);
        }
        return contract.API.fetchTXraw(preTx.toObject().inputs[0].prevTxId, network);
    });
    const prePreTxs = await Promise.all(prePreTxPromises);
    const txraws = nfts.map((nft, i) => {
        const txraw = nft.transferNFT(address, addresses[i], privateKey, [utxos_created[i]], preTxs[i], prePreTxs[i], true);
        return txraw;
    });
    await contract.API.broadcastTXsraw(txraws.map(txHex => ({ txHex })), network);
}

main();
```
