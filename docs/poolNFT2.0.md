```ts
import * as tbc from "tbc-lib-js";
import { API, FT, poolNFT2 } from "tbc-contract";

const network = "testnet";
const privateKeyA = tbc.PrivateKey.fromString('');
const addressA = tbc.Address.fromPrivateKey(privateKeyA).toString();
const ftContractTxid = "";
const poolNftContractId = "";

const fee = 0.01;   //可能的交易手续费，根据需要取值
const serviceRate = 25; //swap手续费率，默认千分之二点五
const lpPlan = 2;  //lp手续费方案, 方案1: LP 0.25%  swap服务商 0.09%  协议0.01%; 方案2: LP 0.05%  swap服务商 0.29%  协议0.01%
const tag = "tbc"; //池子标签，用于区分创建者
async function main() {
    try {
        // Step 1: 创建 poolNFT
        const pool = new poolNFT2({network: network});
        pool.initCreate(ftContractTxid);
        const utxo = await API.fetchUTXO(privateKeyA, fee, network);
        const tx1 = await pool.createPoolNFT(privateKeyA, utxo, tag, serviceRate, lpPlan);
        // or 创建带锁的 poolNFT (最多十个公钥)
        const pubKeyLock = ["pubkey1","pubkey2"];
        const lpCostAddress = "";//设置添加流动性扣款地址
        const lpCostTBC = 5;//设置添加流动性扣款TBC数量
        const tx1 = await pool.createPoolNftWithLock(privateKeyA, utxo, tag, lpCostAddress, lpCostTBC, pubKeyLock, serviceRate, lpPlan);
        await API.broadcastTXraw(tx1[0], network);
        console.log("poolNFT Contract ID:");
        await API.broadcastTXraw(tx1[1], network);

        // Step 2: 使用已创建的 poolNFT
        const poolUse = new poolNFT2({txid: poolNftContractId, network: network});
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
                let tbcAmount = 0.1;
                // 准备 utxo
                const utxo = await API.fetchUTXO(privateKeyA, tbcAmount + fee, network);
                const tx3 = await poolUse.increaseLP(privateKeyA, addressA, utxo, tbcAmount);
                await API.broadcastTXraw(tx3, network);
            }

            // Step 2.3: 花费拥有的 LP
            {
                let lpAmount = 13;
                // 准备 utxo
                const utxo = await API.fetchUTXO(privateKeyA, fee, network);
                const tx4 = await poolUse.consumeLP(privateKeyA, addressA, utxo, lpAmount);
                await API.broadcastTXraw(tx4, network);
            }

            // Step 2.4: 用 TBC 兑换 Token
            {
                let tbcAmount = 0.1;
                // 准备 utxo
                const utxo = await API.fetchUTXO(privateKeyA, tbcAmount + fee, network);
                const tx6 = await poolUse.swaptoToken_baseTBC(privateKeyA, addressA, utxo, tbcAmount, lpPlan);
                await API.broadcastTXraw(tx6, network);
            }

            // Step 2.5.1: 用 Token 兑换 TBC
            {
                let ftAmount = 100;
                // 准备 utxo
                const utxo = await API.fetchUTXO(privateKeyA, fee, network);
                const tx8 = await poolUse.swaptoTBC_baseToken(privateKeyA, addressA, utxo, ftAmount, lpPlan);
                await API.broadcastTXraw(tx8, network);
            }

            // Step 2.5.2: 用 Token 兑换 TBC(本地输入ftutxo)
            {
                let ftAmount = 100;
                // 使用独立utxo
                {
                    // 准备 utxo 网络请求拉取
                    const utxo = await API.fetchUTXO(privateKeyA, fee, network);
                    // or 本地维护的utxo列表中选择
                    const utxo = utxo_manual;
                    const ftutxo = ftutxo_local;//一个ftutxo
                    const ftPreTX = ftPreTX_local;//列表
                    const ftPrePreTxData = ftPrePreTxData_local;//列表
                    const tx8 = await poolUse.swaptoTBC_baseToken_local(privateKeyA, addressA, ftutxo, ftPreTX, ftPrePreTxData, ftAmount, lpPlan, utxo);//utxo末尾参数
                }
                // or从本地ftutxo交易中选择(手动输入的本地ftutxo所在交易的最后一个输出)
                {
                    const ftutxo = ftutxo_local;//一个ftutxo
                    const ftPreTX = ftPreTX_local;//列表
                    const ftPrePreTxData = ftPrePreTxData_local;//列表
                    const tx8 = await poolUse.swaptoTBC_baseToken_local(privateKeyA, addressA, ftutxo, ftPreTX, ftPrePreTxData, ftAmount, lpPlan);//没有utxo参数
                }
                await API.broadcastTXraw(tx8, network);
            }


            // 获取 Pool NFT 信息和 UTXO
            {
                const poolNftInfo = await poolUse.fetchPoolNftInfo(poolUse.contractTxid);
                const poolNftUTXO = await poolUse.fetchPoolNftUTXO(poolUse.contractTxid);
            }

            // 获取 FT-LP UTXO
            {
                const FTA = new FT(poolUse.ft_a_contractTxid);
                const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, network);
                FTA.initialize(FTAInfo);

                let amount = 0.1;
                let lpAmountBN = BigInt(Math.floor(amount * Math.pow(10, 6)));
                const ftlpCode = poolUse.getFtlpCode(
                    tbc.crypto.Hash.sha256(Buffer.from(poolUse.poolnft_code, 'hex')).toString('hex'),
                    addressA,
                    FTA.tapeScript.length / 2
                );
                
                const ftutxo_lp = await poolUse.fetchFtlpUTXO(ftlpCode.toBuffer().toString('hex'), lpAmountBN);
            }

            // 获取指定地址 LP 收益数值
            {
                const lpIncome = await poolUse.getLpIncome(addressA);
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

            //合并池子中的 FT，一次合并最多4合一，合并10次大约30s
            {
                const times = 10;
                const mergeFee = 0.005 * times;
                const utxo = await API.fetchUTXO(privateKeyA, mergeFee, network); 
                const tx10 = await poolUse.mergeFTinPool(privateKeyA, utxo, times);
                tx10.length > 0
                  ? await API.broadcastTXsraw(tx10, network)
                  : console.log("Merge success");
            }

    } catch (error: any) {
        console.error('Error:', error); 
    }
}

main();
```