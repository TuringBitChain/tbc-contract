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
2. TBC20 Standard: [docs/tbc20-standard.md](docs/tbc20-standard.md)
3. TBC20 Stablecoin: [docs/tbc20-stablecoin.md](docs/tbc20-stablecoin.md)
4. TBC721 Standard: [docs/tbc721-standard.md](docs/tbc721-standard.md)
5. Pool 3.0 and TBC20 LP: [docs/poolNFT3.0.md](docs/poolNFT3.0.md)

### Security Notes

- Never store private keys in plaintext on frontend apps.
- Never commit private keys or mnemonics to Git repositories.
- For production, use isolated signing services or hardware-based signing.
