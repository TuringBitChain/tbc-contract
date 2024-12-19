```ts
import * as tbc from "tbc-lib-js"
import { API, FT, poolNFT } from "tbc-contract"

const network= "testnet";
const privateKeyA = tbc.PrivateKey.fromString('');
const poolNftContractId = "1FhSD1YezTXbdRGWzNbNvUj6qeKQ6gZDMq";

async function main() {
    try {
        const poolUse = new poolNFT({txidOrParams: poolNftContractId, network});
        await poolUse.initfromContractId();

        //准备utxo
        const utxo = await API.fetchUTXO(privateKeyA, 0.01, network);
        //Merge
        poolUse.mergeFTLP(privateKeyA, utxo);

        mergeFTLP
    } catch (error) {
        console.error('Error:', error);
    }
}

main();
```