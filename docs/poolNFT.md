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
                let lpAmount = 2; // 至少花费1个LP
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