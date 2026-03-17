# TBC-Contract SDK Quick Start

TBC-Contract is a smart-contract SDK for the TuringBitChain ecosystem. It provides end-to-end building blocks for on-chain data queries, UTXO fetching, transaction construction, signing, and broadcasting. With it, developers can quickly integrate TBC transfers and contract workflows such as MultiSig, NFT, FT, and Pool while avoiding low-level transaction scripting details.

This guide is for first-time developers using TBC-Contract, you will:
1. Install the SDK
2. Query address balance
3. Build and broadcast a TBC transfer transaction
4. Continue with advanced modules in a recommended order

## 1. Prerequisites

- Node.js 22+
- A testnet private key with enough TBC (recommended to start on testnet)

## 2. Install

```bash
npm i tbc-contract
```

## 3. Minimal Runnable Example (Balance + Transfer)

Create a file (for example, `quickstart.js`) and paste:

```js
import * as tbc from "tbc-lib-js";
import { API } from "tbc-contract";

const network = "testnet";

// Use env vars for private keys. Never hardcode secrets.
const wif = process.env.TBC_WIF || "";
const toAddress = process.env.TBC_TO || "";

async function main() {
  if (!wif || !toAddress) {
    throw new Error("Please set TBC_WIF and TBC_TO environment variables.");
  }

  const privateKey = tbc.PrivateKey.fromString(wif);
  const fromAddress = tbc.Address.fromPrivateKey(privateKey).toString();

  // 1) Query balance
  const balance = await API.getTBCbalance(fromAddress, network);
  console.log("From address:", fromAddress);
  console.log("Balance:", balance, "TBC");

  // 2) Build transaction
  const amount = 1;
  const utxo = await API.fetchUTXO(privateKey, amount + 0.00008, network);

  const tx = new tbc.Transaction()
    .from(utxo)
    .to(toAddress, Math.floor(amount * 10 ** 6))
    .change(fromAddress);

  const txSize = tx.getEstimateSize();
  tx.fee(txSize < 1000 ? 80 : Math.ceil(txSize / 1000) * 80);

  tx.sign(privateKey);
  tx.seal();

  const txraw = tx.serialize();

  // 3) Broadcast
  const txid = await API.broadcastTXraw(txraw, network);
  console.log("Broadcast success, txid:", txid);
}

main().catch((err) => {
  console.error("Quick start failed:", err);
  process.exit(1);
});
```

Run:

```bash
TBC_WIF="your-wif" TBC_TO="target-address" node quickstart.js
```

## 4. SDK Contracts

1. MultiSig: [multiSIg.md](multiSIg.md)
2. NFT: [nft.md](nft.md)
3. FT: [ft.md](ft.md)
4. Pool: [poolNFT2.0.md](poolNFT2.0.md)

## 5. Security Notes

- Never store private keys in plaintext on frontend apps.
- Never commit keys or mnemonics to Git.
- For production, use isolated signing services or hardware-based signing.
