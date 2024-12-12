```ts
import * as contract from "tbc-contract"
import * as tbc from "tbc-lib-js"
const network= "testnet"

//测试链私钥
const privateKeyA = tbc.PrivateKey.fromString('L1u2TmR7hMMMSV9Bx2Lyt3sujbboqEFqnKygnPRnQERhKB4qptuK');
const publicKeyA = tbc.PublicKey.fromPrivateKey(privateKeyA);
const addressA = tbc.Address.fromPrivateKey(privateKeyA).toString();
//addressA = 143KgKGcse57nXBnXyJwtQrf2KP4KWto59

const addressB = "1FhSD1YezTXbdRGWzNbNvUj6qeKQ6gZDMq";

const ftName = 'test_package';
const ftSymbol = 'tp';
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
        }, network:"testnet"});

        const utxo = await API.fetchUTXO(privateKeyA, 0.001, "testnet");
        const mintTX = newToken.MintFT(privateKeyA, addressA, utxo);
        await API.broadcastTXraw(mintTX, "testnet");

        //Transfer
        const transferTokenAmount = 1000;
        const Token = new FT({txidOrParams: "ae9107b33ba2ef5a4077396557915957942d2b25353e728f941561dfa0db5300", network:"testnet"});
        const TokenInfo = await API.fetchFtInfo(Token.contractTxid, "testnet");
        Token.initialize(TokenInfo);
        const utxo = await API.fetchUTXO(privateKeyA, 0.01, "testnet");
        const transferTokenAmountBN = BigInt(transferTokenAmount * Math.pow(10, Token.decimal));
        const ftutxo = await API.fetchFtUTXO(Token.contractTxid, addressA, transferTokenAmountBN, Token.codeScript, "testnet");
        const preTX = await API.fetchTXraw(ftutxo.txId, "testnet");
        const prepreTxData = await API.fetchFtPrePreTxData(preTX, ftutxo.outputIndex, "testnet");
        const transferTX = Token.transfer(privateKeyA, addressB, transferTokenAmount, ftutxo, utxo, preTX, prepreTxData);
        await API.broadcastTXraw(transferTX, "testnet");
    } catch (error) {
        console.error('Error:', error);
    }
}

main();
```