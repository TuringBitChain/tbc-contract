TBC-CONTRACT
===
To get started, install the library using the following command:

```shell
npm i tbc-contract
```

## Build Transcation

```ts
import * as tbc from 'tbc-lib-js';
import { API } from "tbc-contract"

const network = "testnet";//Choose testnet or mainnet
const privateKeyA = tbc.PrivateKey.fromString('L1u2TmR7hMMMSV...');//Import privatekey
const addressA = privateKeyA.toAddress().toString();//Address of privateKeyA
const addressB = "1FhSD1YezTXbdRGWzNbNvUj6qeKQ6gZDMq";//The address to receive tbc

async function main() {
    try {
        const tbcAmount = 10;//The number of tbc transferred to addressB
        const utxo = await API.fetchUTXO(privateKeyA, tbcAmount + 0.00008, network);//Fetch UTXO for the transcation
        const tx = new tbc.Transaction()//Build transcation
            .from(utxo)
            .to(addressB,tbcAmount)
            .change(addressA)
        const txSize = tx.getEstimateSize();
        tx.fee(txSize < 1000 ? 80 : Math.ceil(txSize / 1000) * 80);
        tx.sign(privateKeyA);
        tx.seal();
        const txraw = tx.serialize();//Generate txraw
        await API.broadcastTXraw(txraw, network);//Broadcast txraw
    } catch (error: any) {
        console.error('Error:', error);
    }
}
main();
```
For other contract transactions, refer to the [docs](https://github.com/TuringBitChain/tbc-contract/tree/master/docs).