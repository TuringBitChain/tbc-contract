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
        const newToken = new FT({txidOrParams:{
            name: ftName,
            symbol: ftSymbol,
            amount: ftAmount,
            decimal: ftDecimal
        }, network:"testnet"});

        const utxo = await API.fetchUTXO(privateKeyA, 0.001, "testnet");
        const mintTX = newToken.MintFT(privateKeyA, addressA, utxo);
        await API.broadcastTXraw(mintTX, "testnet");

        const Token = new FT('ae9107b33ba2ef5a4077396557915957942d2b25353e728f941561dfa0db5300');
        await Token.initialize()
        const transferTX = await Token.transfer(privateKeyA, addressB, 100000);
        //console.log(transferTX)
        await Token.broadcastTXraw(transferTX)
        // await Token.mergeFT(privateKeyB)
        
        // console.log(await FT.getFTbalance('6e3f499646a6f1accb8ec5055391f49ba74cc988429988ec75966bbd01a25068', '1AYCU2ZrENLJCPpkkTPkFk5tuooPxBN5So'))
        // const address = addressA
        // const url = `https://turingwallet.xyz/v1/tbc/main/address/${address}/get/balance`;
        // const response = await axios.get(url);
        // console.log(response.data.data.balance);
    } catch (error) {
        console.error('Error:', error);
    }
}

main();
```