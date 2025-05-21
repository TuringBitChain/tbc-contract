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
        const transferTX = Token.transfer(privateKeyA, addressA, transferTokenAmount, ftutxos, utxo, preTXs, prepreTxDatas);//组装交易
        //const transferTX = Token.transfer(privateKeyA, addressA, transferTokenAmount, ftutxos, utxo, preTXs, prepreTxDatas, tbc_amount); 同时转ft和tbc交易
        await API.broadcastTXraw(transferTX, network);

        //Merge
        const Token = new FT('ae9107b33ba2ef5a4077396557915957942d2b25353e728f941561dfa0db5300');
        const TokenInfo = await API.fetchFtInfo(Token.contractTxid, network);//获取FT信息
        Token.initialize(TokenInfo);
        const times = 5;
        const mergeFee = 0.005 * times;
        const utxo = await API.fetchUTXO(privateKeyA, mergeFee, network);//准备utxo
        const ftutxo_codeScript = FT.buildFTtransferCode(Token.codeScript, addressA).toBuffer().toString('hex');
        const ftutxos = await API.fetchFtUTXOList(Token.contractTxid, addressA, ftutxo_codeScript, network);//准备多个ft utxo
        let preTXs: tbc.Transaction[] = [];
        let prepreTxDatas: string[] = [];
        for (let i = 0; i < ftutxos.length && i < times * 5; i++) {
            preTXs.push(await API.fetchTXraw(ftutxos[i].txId, network));//获取每个ft输入的父交易
            prepreTxDatas.push(await API.fetchFtPrePreTxData(preTXs[i], ftutxos[i].outputIndex, network));//获取每个ft输入的爷交易
        }
        const mergeTX = Token.mergeFT(privateKeyA, ftutxos, utxo, preTXs, prepreTxDatas, times);//组装交易
        mergeTX.length > 0
          ? await API.broadcastTXsraw(mergeTX, network)
          : console.log("Merge success");
    } catch (error: any) {
        console.error('Error:', error);
    }
}

main();
```
