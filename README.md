<div align="center">

# TBC-Contract SDK

_Smart Contract SDK for TuringBitChain_

<div>
  <a href="https://github.com/TuringBitChain/tbc-contract/blob/master/LICENSE" target="_blank">
    <img src="https://img.shields.io/badge/License-OpenTBC-lightblue" alt="License"/>
  </a>
  <a href="https://www.npmjs.com/package/tbc-contract" target="_blank">
    <img src="https://img.shields.io/npm/v/tbc-contract?color=lightblue" alt="npm"/>
  </a>
  <a href="https://nodejs.org/" target="_blank">
    <img src="https://img.shields.io/badge/Node.js-22%2B-lightblue" alt="Node.js 22+"/>
  </a>
</div>

<p></p>

[中文](docs/快速开始.md) | [English](docs/Quick%20Start.md)

<p></p>

</div>

<p></p>

### Introduction

TBC-Contract is a smart-contract SDK for the TuringBitChain ecosystem. It provides end-to-end building blocks for on-chain data queries, UTXO fetching, transaction construction, signing, and broadcasting.

With this SDK, you can quickly integrate TBC transfers and contract workflows such as MultiSig, NFT, FT, and Pool while avoiding low-level transaction scripting and manual parameter assembly.

### Prerequisites

- Node.js 22+
- A testnet private key with enough TBC (testnet is recommended for beginners)

### Install

```bash
npm i tbc-contract
```


### Advanced Docs

1. MultiSig: [docs/multiSIg.md](docs/multiSIg.md)
2. NFT: [docs/nft.md](docs/nft.md)
3. FT: [docs/ft.md](docs/ft.md)
4. Pool: [docs/poolNFT2.0.md](docs/poolNFT2.0.md)

### Security Notes

- Never store private keys in plaintext on frontend apps.
- Never commit private keys or mnemonics to Git repositories.
- For production, use isolated signing services or hardware-based signing.
