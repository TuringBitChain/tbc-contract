```ts
import * as tbc from "tbc-lib-js"
import { API, FT, buildUTXO, buildFtPrePreTxData, fetchInBatches } from "tbc-contract"

const network= "testnet";
const privateKeyA = tbc.PrivateKey.fromString('');
const publicKeyA = tbc.PublicKey.fromPrivateKey(privateKeyA);
const addressA = tbc.Address.fromPrivateKey(privateKeyA).toString();
const addressB = "1FhSD1YezTXbdRGWzNbNvUj6qeKQ6gZDMq";

const ftName = 'test';
const ftSymbol = 'test';
const ftDecimal = 6;
const ftAmount = 100000000;//精度6，上限21亿
const ftContractTxid = "";
async function main() {
    try {
            //Mint
            {
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
            }
        
            //Transfer
            {
                const transferTokenAmount = 1000;//转移数量
                const Token = new FT(ftContractTxid);
                const TokenInfo = await API.fetchFtInfo(Token.contractTxid, network);//获取FT信息
                Token.initialize(TokenInfo);
                const tbc_amount = 0;  //如果同时转tbc和ft可设置此值,只转ft可忽略
                const utxo = await API.fetchUTXO(privateKeyA, tbc_amount + 0.01, network);//准备utxo 不转tbc可忽略 tbc_amount
                const transferTokenAmountBN = BigInt(Math.ceil(transferTokenAmount * Math.pow(10, Token.decimal)));
                const ftutxo_codeScript = FT.buildFTtransferCode(Token.codeScript, addressA).toBuffer().toString('hex');
                const ftutxos = await API.fetchFtUTXOs(Token.contractTxid, addressA, ftutxo_codeScript, network, transferTokenAmountBN);//准备ft utxo
                let preTXs: tbc.Transaction[] = [];
                let prepreTxDatas: string[] = [];
                for (let i = 0; i < ftutxos.length; i++) {
                    preTXs.push(await API.fetchTXraw(ftutxos[i].txId, network));//获取每个ft输入的父交易
                    prepreTxDatas.push(await API.fetchFtPrePreTxData(preTXs[i], ftutxos[i].outputIndex, network));//获取每个ft输入的爷交易
                }
                const transferTX = Token.transfer(privateKeyA, addressB, transferTokenAmount, ftutxos, utxo, preTXs, prepreTxDatas);//组装交易
                //const transferTX = Token.transfer(privateKeyA, addressB, transferTokenAmount, ftutxos, utxo, preTXs, prepreTxDatas, tbc_amount); 同时转ft和tbc交易
                await API.broadcastTXraw(transferTX, network);
            }

            //BatchTransfer
            {
                const receiveAddressAmount = new Map<string, number>();
                receiveAddressAmount.set(addressA, 500);
                receiveAddressAmount.set(addressB, 700);
                const sum = 500 + 700;
                const transferTokenAmount = sum;
                const Token = new FT(ftContractTxid);
                const TokenInfo = await API.fetchFtInfo(Token.contractTxid, network);//获取FT信息
                Token.initialize(TokenInfo);
                const times = receiveAddressAmount.size;
                const transferFee = 0.005 * times;
                const utxo = await API.fetchUTXO(privateKeyA, transferFee, network);
                const transferTokenAmountBN = BigInt(transferTokenAmount * Math.pow(10, Token.decimal));
                const ftutxo_codeScript = FT.buildFTtransferCode(Token.codeScript, addressA).toBuffer().toString('hex');
                const ftutxos = await API.fetchFtUTXOs(Token.contractTxid, addressA, ftutxo_codeScript, network, transferTokenAmountBN);
                let preTXs: tbc.Transaction[] = [];
                let prepreTxDatas: string[] = [];
                for (let i = 0; i < ftutxos.length; i++) {
                    preTXs.push(await API.fetchTXraw(ftutxos[i].txId, network));
                    prepreTxDatas.push(await API.fetchFtPrePreTxData(preTXs[i], ftutxos[i].outputIndex, network));
                }
                const transferTXs = Token.batchTransfer(privateKeyA, receiveAddressAmount, ftutxos, utxo, preTXs, prepreTxDatas);
                transferTXs.length > 0
                ? await API.broadcastTXsraw(transferTXs, network)
                : console.log("Transfer faild");
            }

            //Merge 将输入的ftutxo合并成一个 (要求ftutxo均在链上)
            {
                const Token = new FT(ftContractTxid);
                const TokenInfo = await API.fetchFtInfo(Token.contractTxid, network);//获取FT信息
                Token.initialize(TokenInfo);

                //网络请求拉取ftutxo
                {
                    const ftutxo_codeScript = FT.buildFTtransferCode(Token.codeScript, addressA).toBuffer().toString('hex');
                    const ftutxos = await API.fetchFtUTXOList(Token.contractTxid, addressA, ftutxo_codeScript, network);//准备多个ft utxo
                }
                //or手动输入ftutxo
                {
                    //从维护的ftutxo列表中选择
                    const ftutxos = ftutxos_manual;
                    //or从交易中选择ftutxo
                    const ftutxos: tbc.Transaction.IUnspentOutput[];
                    for (const tx of txs ) {
                        const ftutxo = buildUTXO(tx, vout, true);//tx: tbc.Transaction, vout: 输出序号(若来自转账交易，一般置vout为0), true: 构建ftutxo; false: 构建utxo
                        ftutxos.push(ftutxo);
                    }
                }
                const mergeFee = 0.005 * ftutxos.length;
                //网络请求获取utxo用于交易fee
                const utxo = await API.fetchUTXO(privateKeyA, mergeFee, network);
                //or手动输入utxo
                {
                    //从维护的utxo列表中选择
                    const utxo = utxo_manual;
                    //or从交易中选择utxo
                    const utxo = buildUTXO(tx, vout, false);
                }
                let localTX: tbc.Transaction[] = [];
                let preTXs: tbc.Transaction[] = [];
                let prepreTxDatas: string[] = [];

                // 分片获取 preTXs，每批处理 300 个
                const batchSize = 300;
                preTXs = await fetchInBatches<tbc.Transaction.IUnspentOutput, tbc.Transaction>(
                    ftutxos,
                    batchSize,
                    (batch) => Promise.all(batch.map(utxo => API.fetchTXraw(utxo.txId, network))),
                    'fetchFtPreTXData'
                );

                // 分片获取 prepreTxDatas
                prepreTxDatas = await fetchInBatches<tbc.Transaction.IUnspentOutput, string>(
                    ftutxos,
                    batchSize,
                    (batch) => Promise.all(batch.map(utxo => {
                        const globalIndex = ftutxos.indexOf(utxo);
                        return API.fetchFtPrePreTxData(preTXs[globalIndex], utxo.outputIndex, network);
                    })),
                    'fetchFtPrePreTxData'
                );
                const mergeTX = Token.mergeFT(privateKeyA, ftutxos, utxo, preTXs, prepreTxDatas, localTX);//组装交易
                mergeTX.length > 0
                ? await API.broadcastTXsraw(mergeTX, network)
                : console.log("Merge success");
            }
        
    } catch (error: any) {
        console.error('Error:', error);
    }
}

main();
```
