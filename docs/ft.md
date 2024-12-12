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
        const newToken = new FT({txidOrParams:{
            name: ftName,
            symbol: ftSymbol,
            amount: ftAmount,
            decimal: ftDecimal
        }, network: "testnet"});

        const utxo = await API.fetchUTXO(privateKeyA, 0.001, network);//准备utxo
        const mintTX = newToken.MintFT(privateKeyA, addressA, utxo);//组装交易
        await API.broadcastTXraw(mintTX, network);

        //Transfer
        const transferTokenAmount = 1000;//转移数量
        const Token = new FT({txidOrParams: "ae9107b33ba2ef5a4077396557915957942d2b25353e728f941561dfa0db5300", network:network});
        const TokenInfo = await API.fetchFtInfo(Token.contractTxid, network);//获取FT信息
        Token.initialize(TokenInfo);
        const utxo = await API.fetchUTXO(privateKeyA, 0.01, network);//准备utxo
        const transferTokenAmountBN = BigInt(transferTokenAmount * Math.pow(10, Token.decimal));
        const ftutxo_codeScript = FT.buildFTtransferCode(Token.codeScript, addressA).toBuffer().toString('hex');
        const ftutxo = await API.fetchFtUTXO(Token.contractTxid, addressA, transferTokenAmountBN, ftutxo_codeScript, network);//准备ft utxo
        const preTX = await API.fetchTXraw(ftutxo.txId, network);//获取ft输入的父交易
        const prepreTxData = await API.fetchFtPrePreTxData(preTX, ftutxo.outputIndex, network);//获取ft输入的爷交易
        const transferTX = Token.transfer(privateKeyA, addressB, transferTokenAmount, ftutxo, utxo, preTX, prepreTxData);//组装交易
        await API.broadcastTXraw(transferTX, network);

        //Merge
        const Token = new FT({txidOrParams: "ae9107b33ba2ef5a4077396557915957942d2b25353e728f941561dfa0db5300", network:network});
        const TokenInfo = await API.fetchFtInfo(Token.contractTxid, network);//获取FT信息
        Token.initialize(TokenInfo);
        const utxo = await API.fetchUTXO(privateKeyA, 0.01, network);//准备utxo
        const ftutxo_codeScript = FT.buildFTtransferCode(Token.codeScript, addressA).toBuffer().toString('hex');
        const ftutxos = await API.fetchFtUTXOs(Token.contractTxid, addressA, 5, ftutxo_codeScript, network);//准备多个ft utxo
        let preTXs: tbc.Transaction[] = [];
        let prepreTxDatas: string[] = [];
        for (let i = 0; i < ftutxos.length; i++) {
            preTXs.push(await API.fetchTXraw(ftutxos[i].txId, network));//获取每个ft输入的父交易
            prepreTxDatas.push(await API.fetchFtPrePreTxData(preTXs[i], ftutxos[i].outputIndex, network));//获取每个ft输入的爷交易
        }
        const mergeTX = Token.mergeFT(privateKeyA, ftutxos, utxo, preTXs, prepreTxDatas);//组装交易
        await API.broadcastTXraw(mergeTX, network);
    } catch (error) {
        console.error('Error:', error);
    }
}

main();
```