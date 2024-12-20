```ts
import * as tbc from "tbc-lib-js";
import { API, FT, poolNFT } from "tbc-contract";

const network = "testnet";
const privateKeyA = tbc.PrivateKey.fromString('');
const addressA = tbc.Address.fromPrivateKey(privateKeyA).toString();
const ftContractTxid = "";
const poolNftContractId = "";

const fee = 0.01;   //可能的交易手续费，确保交易一定成功，根据需要取值，一般为0.01

async function main() {
    try {
        // Step 1: 创建 poolNFT，并初始化
        const pool = new poolNFT({network: "testnet"});
        await pool.initCreate(ftContractTxid);
        //0.001为手续费
        const utxo = await API.fetchUTXO(privateKeyA, 0.001, network);
        const tx1 = await pool.createPoolNFT(privateKeyA, utxo);
        await API.broadcastTXraw(tx1);

        // Step 2: 使用已创建的 poolNFT 进行初始化
        const poolUse = new poolNFT({txidOrParams: poolNftContractId, network:"testnet"});
        await poolUse.initfromContractId();

        // Step 2.1: 为刚创建的 poolNFT 注入初始资金
        {
            let tbcAmount = 30;
            let ftAmount = 1000;
            // 准备 utxo
            const utxo = await API.fetchUTXO(privateKeyA, tbcAmount + fee, network);
            let tx2 = await poolUse.initPoolNFT(privateKeyA, addressA, utxo, tbcAmount, ftAmount);
            await API.broadcastTXraw(tx2);
        }

        // Step 2.2: 为已完成初始资金注入的 poolNFT 添加流动性
        {
            let tbcAmount = 0.1; // 至少添加0.1个TBC
            // 准备 utxo
            const utxo = await API.fetchUTXO(privateKeyA, tbcAmount + fee, network);
            const tx3 = await poolUse.increaseLP(privateKeyA, addressA, utxo, tbcAmount);
            await API.broadcastTXraw(tx3);
        }

        // Step 2.3: 花费拥有的 LP
        {
            let lpAmount = 2; // 至少花费1个LP
            // 准备 utxo
            const utxo = await API.fetchUTXO(privateKeyA, fee, network);
            const tx4 = await poolUse.consumeLP(privateKeyA, addressA, utxo, lpAmount);
            await API.broadcastTXraw(tx4);
        }

        // Step 2.4: 用 TBC 兑换 Token (输入参数为要交换的Token数量)
        {
            let ftAmount = 100; // 期望得到的ft数量
            // 准备 utxo
            const utxo = await API.fetchUTXO(privateKeyA, fee, network);
            const tx5 = await poolUse.swaptoToken(privateKeyA, addressA, utxo, ftAmount);
            await API.broadcastTXraw(tx5);
        }

        // Step 2.5: 用 TBC 兑换 Token
        {
            let tbcAmount = 0.1; // 用于兑换的tbc数量
            // 准备 utxo
            const utxo = await API.fetchUTXO(privateKeyA, tbcAmount + fee, network);
            const tx6 = await poolUse.swaptoToken_baseTBC(privateKeyA, addressA, utxo, tbcAmount);
            await API.broadcastTXraw(tx6);
        }

        // Step 2.6: Token 兑换 TBC(输入参数为要交换的TBC数量)
        {
            let tbcAmount = 0.1; // 期望得到的tbc数量，至少兑换0.1个TBC
            // 准备 utxo
            const utxo = await API.fetchUTXO(privateKeyA, tbcAmount + fee, network);
            const tx7 = await poolUse.swaptoTBC(privateKeyA, addressA, utxo, tbcAmount);
            await API.broadcastTXraw(tx7);
        }

        // Step 2.7: 用基础 Token 兑换 TBC
        {
            let ftAmount = 100; // 用于兑换的ft数量，至少兑换0.1个TBC
            // 准备 utxo
            const utxo = await API.fetchUTXO(privateKeyA, fee, network);
            const tx8 = await poolUse.swaptoTBC_baseToken(privateKeyA, addressA, utxo, ftAmount);
            await API.broadcastTXraw(tx8);
        }

        // 获取 Pool NFT 信息和 UTXO
        {
            const poolNFTInfo = await poolUse.fetchPoolNFTInfo(poolUse.contractTxid);
            const poolnftUTXO = await poolUse.fetchPoolNftUTXO(poolUse.contractTxid);
        }

        // 获取 FTLP 信息
        {
            const FTA = new FT(poolUse.ft_a_contractTxid);
            const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, network);
            await FTA.initialize(FTAInfo);

            let amount = 0.1;
            const ftlpCode = poolUse.getFTLPcode(
                tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, 'hex')).toString('hex'),
                address,
                FTA.tapeScript.length / 2
            );
            
            const fttxo_lp = await this.fetchFtlpUTXO(ftlpCode.toBuffer().toString('hex'), amount);
        }

        // 合并 FT LP 的操作
        {
            const utxo = await API.fetchUTXO(privateKeyA, fee, network); 
            const tx9 = await poolUse.mergeFTLP(privateKeyA, utxo); 
            await API.broadcastTXraw(tx9); 
        }

    } catch (error) {
        console.error('Error:', error); 
    }
}

main();
```
