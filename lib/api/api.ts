import * as tbc from "tbc-lib-js";
import { getPrePreTxdata } from "../util/ftunlock";
import { findMinFiveSum } from "../util/utxoSelect";

interface NFTInfo {
  collectionId: string;
  collectionIndex: number;
  collectionName: string;
  nftName: string;
  nftSymbol: string;
  nft_attributes: string;
  nftDescription: string;
  nftTransferTimeCount: number;
  nftIcon: string;
}

interface FtInfo {
  contractTxid?: string;
  codeScript: string;
  tapeScript: string;
  totalSupply: number;
  decimal: number;
  name: string;
  symbol: string;
}

interface PoolNFTInfo {
  ft_lp_amount: bigint;
  ft_a_amount: bigint;
  tbc_amount: bigint;
  ft_lp_partialhash: string;
  ft_a_partialhash: string;
  ft_a_contractTxid: string;
  service_fee_rate: number;
  service_provider: string;
  poolnft_code: string;
  pool_version: number;
  currentContractTxid: string;
  currentContractVout: number;
  currentContractSatoshi: number;
}

interface FTUnspentOutput {
  txid: string;
  index: number;
  tbc_value: number;
  ftContractId: string;
  ft_value: bigint;
  height: number;
  decimal: number;
}

class API {
  private static mainnetURL: string = "https://api.tbcdev.org/api/tbc/";
  private static testnetURL: string = "https://api.tbcdev.org/api/tbc/";

  /**
   * Get the base URL for the specified network.
   *
   * @param {("testnet" | "mainnet" | string)} network - The network type or custom URL.
   * @returns {string} The base URL for the specified network.
   */
  private static getBaseURL(network: "testnet" | "mainnet" | string): string {
    if (network === "testnet") {
      return this.testnetURL;
    } else if (network === "mainnet") {
      return this.mainnetURL;
    } else {
      return network.endsWith("/") ? network : network + "/";
    }
  }

  /**
   * Fetches the TBC balance for a given address.
   *
   * @param {string} address - The address to fetch the TBC balance for.
   * @param {("testnet" | "mainnet" | string)} [network] - The network type or custom URL. Defaults to "mainnet" if not specified.
   * @returns {Promise<number>} Returns a Promise that resolves to the TBC balance.
   * @throws {Error} Throws an error if the request fails.
   */
  static async getTBCbalance(
    address: string,
    network?: "testnet" | "mainnet" | string
  ): Promise<number> {
    if (!tbc.Address.isValid(address)) {
      throw new Error("Invalid address input");
    }
    let base_url = API.getBaseURL(network || "mainnet");
    const url = base_url + `balance/address/${address}`;
    try {
      const response = await (await fetch(url)).json();
      return response.data.balance;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  /**
   * Fetches a UTXO that satisfies the required amount.
   *
   * @param {tbc.PrivateKey} privateKey - The private key object.
   * @param {number} amount - The required amount.
   * @param {("testnet" | "mainnet")} [network] - The network type.
   * @returns {Promise<tbc.Transaction.IUnspentOutput>} Returns a Promise that resolves to the UTXO.
   * @throws {Error} Throws an error if the request fails or if the balance is insufficient.
   */
  static async fetchUTXO(
    privateKey: tbc.PrivateKey,
    amount: number,
    network?: "testnet" | "mainnet" | string
  ): Promise<tbc.Transaction.IUnspentOutput> {
    let base_url = network
      ? API.getBaseURL(network)
      : API.getBaseURL("mainnet");
    const address = privateKey.toAddress().toString();
    const url = base_url + `utxo/address/${address}`;
    const scriptPubKey = tbc.Script.buildPublicKeyHashOut(address)
      .toBuffer()
      .toString("hex");
    const amount_bn = Math.floor(amount * Math.pow(10, 6));
    try {
      const response = await (await fetch(url)).json();
      const utxoList = response.data.utxos;
      if (utxoList.length === 0) {
        throw new Error("The tbc balance in the account is zero.");
      }
      if (utxoList.length === 1 && utxoList[0].value > amount_bn) {
        const utxo: tbc.Transaction.IUnspentOutput = {
          txId: utxoList[0].txid,
          outputIndex: utxoList[0].index,
          script: scriptPubKey,
          satoshis: utxoList[0].value,
        };
        return utxo;
      } else if (utxoList.length === 1 && utxoList[0].value <= amount_bn) {
        throw new Error("Insufficient tbc balance");
      }
      let data = utxoList[0];
      for (let i = 0; i < utxoList.length; i++) {
        if (utxoList[i].value > amount_bn) {
          data = utxoList[i];
          break;
        }
      }
      if (data.value < amount_bn) {
        const totalBalance = await this.getTBCbalance(address, network);
        if (totalBalance <= amount_bn) {
          throw new Error("Insufficient tbc balance");
        } else {
          console.log("Merge UTXO");
          await API.mergeUTXO(privateKey, network);
          await new Promise((resolve) => setTimeout(resolve, 3000));
          return await API.fetchUTXO(privateKey, amount, network);
        }
      }
      const utxo: tbc.Transaction.IUnspentOutput = {
        txId: data.txid,
        outputIndex: data.index,
        script: scriptPubKey,
        satoshis: data.value,
      };
      return utxo;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  /**
   * Merges UTXOs for a given private key.
   *
   * @param {tbc.PrivateKey} privateKey - The private key object.
   * @param {("testnet" | "mainnet")} [network] - The network type.
   * @returns {Promise<boolean>} Returns a Promise that resolves to a boolean indicating whether the merge was successful.
   * @throws {Error} Throws an error if the merge fails.
   */
  static async mergeUTXO(
    privateKey: tbc.PrivateKey,
    network?: "testnet" | "mainnet" | string
  ): Promise<boolean> {
    let base_url = network
      ? API.getBaseURL(network)
      : API.getBaseURL("mainnet");
    const address = tbc.Address.fromPrivateKey(privateKey).toString();
    const url = base_url + `utxo/address/${address}`;
    const scriptPubKey = tbc.Script.buildPublicKeyHashOut(address)
      .toBuffer()
      .toString("hex");
    try {
      const response = await (await fetch(url)).json();
      const utxoList = response.data.utxos;
      let sumAmount = 0;
      let utxo: tbc.Transaction.IUnspentOutput[] = [];
      if (utxoList.length === 0) {
        throw new Error("No UTXO available");
      }
      if (utxoList.length === 1) {
        console.log("Merge Success!");
        return true;
      } else {
        for (let i = 0; i < utxoList.length; i++) {
          sumAmount += utxoList[i].value;
          utxo.push({
            txId: utxoList[i].txid,
            outputIndex: utxoList[i].index,
            script: scriptPubKey,
            satoshis: utxoList[i].value,
          });
        }
      }
      const tx = new tbc.Transaction().from(utxo);
      const txSize = tx.getEstimateSize() + 100;
      const fee = txSize < 1000 ? 80 : Math.ceil(txSize / 1000) * 80;
      tx.to(address, sumAmount - fee)
        .fee(fee)
        .change(address)
        .sign(privateKey)
        .seal();
      const txraw = tx.uncheckedSerialize();
      await API.broadcastTXraw(txraw, network);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await API.mergeUTXO(privateKey, network);
      return true;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  /**
   * Get the FT balance for a specified contract transaction ID and address or hash.
   *
   * @param {string} contractTxid - The contract transaction ID.
   * @param {string} addressOrHash - The address or hash.
   * @param {("testnet" | "mainnet")} [network] - The network type.
   * @returns {Promise<bigint>} Returns a Promise that resolves to the FT balance.
   * @throws {Error} Throws an error if the address or hash is invalid, or if the request fails.
   */
  static async getFTbalance(
    contractTxid: string,
    addressOrHash: string,
    network?: "testnet" | "mainnet" | string
  ): Promise<bigint> {
    let base_url = network
      ? API.getBaseURL(network)
      : API.getBaseURL("mainnet");
    let hash = "";
    if (tbc.Address.isValid(addressOrHash)) {
      // If the recipient is an address
      const publicKeyHash =
        tbc.Address.fromString(addressOrHash).hashBuffer.toString("hex");
      hash = publicKeyHash + "00";
    } else {
      // If the recipient is a hash
      if (addressOrHash.length !== 40) {
        throw new Error("Invalid address or hash");
      }
      hash = addressOrHash + "01";
    }
    const url =
      base_url +
      `ft/tokenbalance/combinescript/${hash}/contract/${contractTxid}`;
    try {
      const response = await (await fetch(url)).json();
      const ftBalance = response.data.balance;
      return ftBalance;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  /**
   * Fetches a list of FT UTXOs for a specified contract transaction ID and address or hash.
   *
   * @param {string} contractTxid - The contract transaction ID.
   * @param {string} addressOrHash - The recipient's address or hash.
   * @param {string} codeScript - The code script.
   * @param {("testnet" | "mainnet")} [network] - The network type. Defaults to "mainnet" if not specified.
   * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of FT UTXOs.
   * @throws {Error} Throws an error if the request fails or if no UTXOs are found.
   */
  static async fetchFtUTXOList(
    contractTxid: string,
    addressOrHash: string,
    codeScript: string,
    network?: "testnet" | "mainnet" | string
  ): Promise<tbc.Transaction.IUnspentOutput[]> {
    let base_url = network
      ? API.getBaseURL(network)
      : API.getBaseURL("mainnet");
    let hash = "";
    if (tbc.Address.isValid(addressOrHash)) {
      // If the recipient is an address
      const publicKeyHash =
        tbc.Address.fromString(addressOrHash).hashBuffer.toString("hex");
      hash = publicKeyHash + "00";
    } else {
      // If the recipient is a hash
      if (addressOrHash.length !== 40) {
        throw new Error("Invalid address or hash");
      }
      hash = addressOrHash + "01";
    }
    const url =
      base_url + `ft/utxo/combinescript/${hash}/contract/${contractTxid}`;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(
          `Failed to fetch from URL: ${url}, status: ${response.status}`
        );
      }
      const responseData = await response.json();
      if (responseData.data.utxos.length === 0) {
        throw new Error("The ft balance in the account is zero.");
      }
      let ftutxos: tbc.Transaction.IUnspentOutput[] = [];
      for (let i = 0; i < responseData.data.utxos.length; i++) {
        const data = responseData.data.utxos[i];
        ftutxos.push({
          txId: data.txid,
          outputIndex: data.index,
          script: codeScript,
          satoshis: data.tbc_value,
          ftBalance: data.ft_value,
        });
      }
      return ftutxos;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }
  /**
   * Fetches an FT UTXO that satisfies the required amount.
   *
   * @param {string} contractTxid - The contract transaction ID.
   * @param {string} addressOrHash - The recipient's address or hash.
   * @param {bigint} amount - The required amount.
   * @param {string} codeScript - The code script.
   * @param {("testnet" | "mainnet")} [network] - The network type.
   * @returns {Promise<tbc.Transaction.IUnspentOutput>} Returns a Promise that resolves to the FT UTXO.
   * @throws {Error} Throws an error if the request fails or if the FT balance is insufficient.
   */
  static async fetchFtUTXO(
    contractTxid: string,
    addressOrHash: string,
    amount: bigint,
    codeScript: string,
    network?: "testnet" | "mainnet" | string
  ): Promise<tbc.Transaction.IUnspentOutput> {
    try {
      const ftutxolist = await API.fetchFtUTXOList(
        contractTxid,
        addressOrHash,
        codeScript,
        network
      );
      let ftutxo = ftutxolist[0];
      for (let i = 0; i < ftutxolist.length; i++) {
        if (ftutxolist[i].ftBalance >= amount) {
          ftutxo = ftutxolist[i];
          break;
        }
      }
      if (ftutxo.ftBalance < amount) {
        const totalBalance = await API.getFTbalance(
          contractTxid,
          addressOrHash,
          network
        );
        if (totalBalance >= amount) {
          throw new Error("Insufficient FTbalance, please merge FT UTXOs");
        } else {
          throw new Error("FTbalance not enough!");
        }
      }
      return ftutxo;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  /**
   * Fetches FT UTXOs for a specified contract transaction ID and address or hash.
   *
   * @param {string} contractTxid - The contract transaction ID.
   * @param {string} addressOrHash - The recipient's address or hash.
   * @param {string} codeScript - The code script.
   * @param {("testnet" | "mainnet")} [network] - The network type. Defaults to "mainnet" if not specified.
   * @param {bigint} [amount] - The required amount. If not specified, fetches up to 5 UTXOs.
   * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of FT UTXOs.
   * @throws {Error} Throws an error if the request fails or if the FT balance is insufficient.
   */
  static async fetchFtUTXOs(
    contractTxid: string,
    addressOrHash: string,
    codeScript: string,
    network?: "testnet" | "mainnet" | string,
    amount?: bigint
  ): Promise<tbc.Transaction.IUnspentOutput[]> {
    try {
      const ftutxolist = await API.fetchFtUTXOList(
        contractTxid,
        addressOrHash,
        codeScript,
        network
      );
      ftutxolist.sort((a, b) => (b.ftBalance > a.ftBalance ? 1 : -1));
      let sumBalance = BigInt(0);
      let ftutxos: tbc.Transaction.IUnspentOutput[] = [];
      if (!amount) {
        for (let i = 0; i < ftutxolist.length && i < 5; i++) {
          ftutxos.push(ftutxolist[i]);
        }
      } else {
        for (let i = 0; i < ftutxolist.length && i < 5; i++) {
          sumBalance += BigInt(ftutxolist[i].ftBalance);
          ftutxos.push(ftutxolist[i]);
          if (sumBalance >= amount) break;
        }
        if (sumBalance < amount) {
          const totalBalance = await API.getFTbalance(
            contractTxid,
            addressOrHash,
            network
          );
          if (totalBalance >= amount) {
            throw new Error("Insufficient FTbalance, please merge FT UTXOs");
          } else {
            throw new Error("FTbalance not enough!");
          }
        }
      }
      return ftutxos;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  /**
   * Fetches a specified number of FT UTXOs that satisfy the required amount for a pool.
   *
   * @param {string} contractTxid - The contract transaction ID.
   * @param {string} addressOrHash - The recipient's address or hash.
   * @param {bigint} amount - The required amount.
   * @param {number} number - The number of FT UTXOs to fetch.
   * @param {string} codeScript - The code script.
   * @param {("testnet" | "mainnet")} [network] - The network type.
   * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of FT UTXOs.
   * @throws {Error} Throws an error if the request fails or if the FT balance is insufficient.
   */
  static async fetchFtUTXOsforPool(
    contractTxid: string,
    addressOrHash: string,
    amount: bigint,
    number: number,
    codeScript: string,
    network?: "testnet" | "mainnet" | string
  ): Promise<tbc.Transaction.IUnspentOutput[]> {
    if (number <= 0 || !Number.isInteger(number)) {
      throw new Error("Number must be a positive integer greater than 0");
    }
    try {
      const ftutxolist = await API.fetchFtUTXOList(
        contractTxid,
        addressOrHash,
        codeScript,
        network
      );
      ftutxolist.sort((a, b) => (b.ftBalance > a.ftBalance ? 1 : -1));
      let sumBalance = BigInt(0);
      let ftutxos: tbc.Transaction.IUnspentOutput[] = [];
      for (let i = 0; i < ftutxolist.length && i < number; i++) {
        sumBalance += BigInt(ftutxolist[i].ftBalance);
        ftutxos.push(ftutxolist[i]);
        if (sumBalance >= amount && i >= 1) break;
      }
      if (sumBalance < amount) {
        const totalBalance = await API.getFTbalance(
          contractTxid,
          addressOrHash,
          network
        );
        if (totalBalance >= amount) {
          throw new Error("Insufficient FTbalance, please merge FT UTXOs");
        } else {
          throw new Error("FTbalance not enough!");
        }
      }
      return ftutxos;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  /**
   * Fetches the FT information for a given contract transaction ID.
   *
   * @param {string} contractTxid - The contract transaction ID.
   * @param {("testnet" | "mainnet")} [network] - The network type.
   * @returns {Promise<FtInfo>} Returns a Promise that resolves to an FtInfo object containing the FT information.
   * @throws {Error} Throws an error if the request to fetch FT information fails.
   */
  static async fetchFtInfo(
    contractTxid: string,
    network?: "testnet" | "mainnet" | string
  ): Promise<FtInfo> {
    let base_url = network
      ? API.getBaseURL(network)
      : API.getBaseURL("mainnet");
    const url = base_url + `ft/info/contract/${contractTxid}`;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(
          `Failed to fetch from URL: ${url}, status: ${response.status}`
        );
      }
      const data = await response.json();
      const ftInfo: FtInfo = {
        codeScript: data.data.code_script,
        tapeScript: data.data.tape_script,
        totalSupply: data.data.amount,
        decimal: data.data.decimal,
        name: data.data.name,
        symbol: data.data.symbol,
      };
      return ftInfo;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  /**
   * Fetches the pre-pre transaction data for a given transaction.
   *
   * @param {tbc.Transaction} preTX - The previous transaction.
   * @param {number} preTxVout - The output index of the previous transaction.
   * @param {("testnet" | "mainnet")} [network] - The network type.
   * @returns {Promise<string>} Returns a Promise that resolves to the pre-pre transaction data.
   * @throws {Error} Throws an error if the request fails.
   */
  static async fetchFtPrePreTxData(
    preTX: tbc.Transaction,
    preTxVout: number,
    network?: "testnet" | "mainnet" | string
  ): Promise<string> {
    const preTXtape = Buffer.from(
      preTX.outputs[preTxVout + 1].script.toBuffer().subarray(3, 51)
    ).toString("hex");
    let prepretxdata = "";
    for (let i = preTXtape.length - 16; i >= 0; i -= 16) {
      const chunk = preTXtape.substring(i, i + 16);
      if (chunk != "0000000000000000") {
        const inputIndex = i / 16;
        const prepreTX = await API.fetchTXraw(
          preTX.inputs[inputIndex].prevTxId.toString("hex"),
          network
        );
        prepretxdata =
          prepretxdata +
          getPrePreTxdata(prepreTX, preTX.inputs[inputIndex].outputIndex);
      }
    }
    prepretxdata = "57" + prepretxdata;
    return prepretxdata;
  }

  /**
   * Fetches the Pool NFT information for a given contract transaction ID.
   *
   * @param {string} contractTxid - The contract transaction ID.
   * @param {("testnet" | "mainnet")} [network] - The network type. Defaults to "mainnet" if not specified.
   * @returns {Promise<PoolNFTInfo>} Returns a Promise that resolves to a PoolNFTInfo object containing the Pool NFT information.
   * @throws {Error} Throws an error if the request to fetch Pool NFT information fails.
   */
  static async fetchPoolNftInfo(
    contractTxid: string,
    network?: "testnet" | "mainnet" | string
  ): Promise<PoolNFTInfo> {
    let base_url = network
      ? API.getBaseURL(network)
      : API.getBaseURL("mainnet");
    const url = base_url + `pool/poolinfo/poolid/${contractTxid}`;
    try {
      const response = await (await fetch(url)).json();
      const data = response.data;
      const poolNftInfo: PoolNFTInfo = {
        ft_lp_amount: data.lp_balance,
        ft_a_amount: data.token_balance,
        tbc_amount: data.tbc_balance,
        ft_lp_partialhash: data.ft_lp_partial_hash,
        ft_a_partialhash: data.ft_a_partial_hash,
        ft_a_contractTxid: data.ft_contract_id,
        service_fee_rate: data.service_fee_rate,
        service_provider: data.service_provider,
        poolnft_code: data.pool_code_script,
        pool_version: data.version,
        currentContractTxid: data.txid,
        currentContractVout: data.vout,
        currentContractSatoshi: data.value,
      };
      return poolNftInfo;
    } catch (error: any) {
      throw new Error("Failed to fetch PoolNFTInfo.");
    }
  }

  /**
   * Fetches the Pool NFT UTXO for a given contract transaction ID.
   *
   * @param {string} contractTxid - The contract transaction ID.
   * @param {("testnet" | "mainnet")} [network] - The network type. Defaults to "mainnet" if not specified.
   * @returns {Promise<tbc.Transaction.IUnspentOutput>} Returns a Promise that resolves to a Pool NFT UTXO.
   * @throws {Error} Throws an error if the request to fetch Pool NFT UTXO fails.
   */
  static async fetchPoolNftUTXO(
    contractTxid: string,
    network?: "testnet" | "mainnet" | string
  ): Promise<tbc.Transaction.IUnspentOutput> {
    try {
      const poolNftInfo = await API.fetchPoolNftInfo(contractTxid, network);
      const poolnft: tbc.Transaction.IUnspentOutput = {
        txId: poolNftInfo.currentContractTxid,
        outputIndex: poolNftInfo.currentContractVout,
        script: poolNftInfo.poolnft_code,
        satoshis: poolNftInfo.currentContractSatoshi,
      };
      return poolnft;
    } catch (error: any) {
      throw new Error("Failed to fetch PoolNFT UTXO.");
    }
  }

  /**
   * Fetches the FT LP balance for a given FT LP code.
   *
   * @param {string} ftlpCode - The FT LP code.
   * @param {("testnet" | "mainnet")} [network] - The network type. Defaults to "mainnet" if not specified.
   * @returns {Promise<bigint>} Returns a Promise that resolves to the FT LP balance.
   * @throws {Error} Throws an error if the request to fetch FT LP balance fails.
   */
  static async fetchFtlpBalance(
    ftlpCode: string,
    network?: "testnet" | "mainnet" | string
  ): Promise<bigint> {
    const ftlpHash = tbc.crypto.Hash.sha256(Buffer.from(ftlpCode, "hex"))
      .reverse()
      .toString("hex");
    let base_url = network
      ? API.getBaseURL(network)
      : API.getBaseURL("mainnet");
    const url = base_url + `pool/lputxo/scriptpubkeyhash/${ftlpHash}`;
    try {
      const response = await (await fetch(url)).json();
      const data = response.data;
      let ftlpBalance = BigInt(0);
      for (let i = 0; i < data.utxos.length; i++) {
        ftlpBalance += BigInt(data.utxos[i].ftBalance);
      }
      return ftlpBalance;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  /**
   * Fetches an FT LP UTXO that satisfies the required amount for a given FT LP code.
   *
   * @param {string} ftlpCode - The FT LP code.
   * @param {bigint} amount - The required amount.
   * @param {("testnet" | "mainnet")} [network] - The network type. Defaults to "mainnet" if not specified.
   * @returns {Promise<tbc.Transaction.IUnspentOutput>} Returns a Promise that resolves to an FT LP UTXO.
   * @throws {Error} Throws an error if the request to fetch FT LP UTXO fails or if no suitable UTXO is found.
   */
  static async fetchFtlpUTXO(
    ftlpCode: string,
    amount: bigint,
    network?: "testnet" | "mainnet" | string
  ): Promise<tbc.Transaction.IUnspentOutput> {
    const ftlpHash = tbc.crypto.Hash.sha256(Buffer.from(ftlpCode, "hex"))
      .reverse()
      .toString("hex");
    let base_url = network
      ? API.getBaseURL(network)
      : API.getBaseURL("mainnet");
    const url = base_url + `pool/lputxo/scriptpubkeyhash/${ftlpHash}`;
    try {
      const response = await (await fetch(url)).json();
      let data = response.data.utxos[0];
      for (let i = 0; i < response.data.utxos.length; i++) {
        if (response.data.utxos[i].lp_balance >= amount) {
          data = response.data.utxos[i];
          break;
        }
      }
      let ftlpBalance = BigInt(0);
      if (data.lp_balance < amount) {
        for (let i = 0; i < response.data.utxos.length; i++) {
          ftlpBalance += BigInt(response.data.utxos[i].lp_balance);
        }
        if (ftlpBalance < amount) {
          throw new Error("Insufficient FT-LP amount");
        } else {
          throw new Error("Please merge FT-LP UTXOs");
        }
      }
      const ftlp: tbc.Transaction.IUnspentOutput = {
        txId: data.txid,
        outputIndex: data.index,
        script: ftlpCode,
        satoshis: data.tbc_balance,
        ftBalance: data.lp_balance,
      };
      return ftlp;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  /**
   * Fetches the raw transaction data for a given transaction ID.
   *
   * @param {string} txid - The transaction ID to fetch.
   * @param {("testnet" | "mainnet")} [network] - The network type.
   * @returns {Promise<tbc.Transaction>} Returns a Promise that resolves to the transaction object.
   * @throws {Error} Throws an error if the request fails.
   */
  static async fetchTXraw(
    txid: string,
    network?: "testnet" | "mainnet" | string
  ): Promise<tbc.Transaction> {
    let base_url = network
      ? API.getBaseURL(network)
      : API.getBaseURL("mainnet");
    const url = base_url + `txraw/txid/${txid}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch TXraw: ${response.statusText}`);
      }
      const data = await response.json();
      const txraw = data.data.txraw;
      const tx = new tbc.Transaction();
      tx.fromString(txraw);
      return tx;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  /**
   * Broadcasts the raw transaction to the network.
   *
   * @param {string} txraw - The raw transaction hex.
   * @param {("testnet" | "mainnet")} [network] - The network type.
   * @returns {Promise<string>} Returns a Promise that resolves to the transaction ID from the broadcast API.
   * @throws {Error} Throws an error if the request fails.
   */
  static async broadcastTXraw(
    txraw: string,
    network?: "testnet" | "mainnet" | string
  ): Promise<string> {
    let base_url = network
      ? API.getBaseURL(network)
      : API.getBaseURL("mainnet");
    const url = base_url + `broadcasttx`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          txraw: txraw,
        }),
      });

      const data = await response.json();

      if (data.code === "200") {
        console.log("txid:", data.data.txid);
        return data.data.txid;
      }

      if (data.code === "400" || data.error) {
        const errorMessage =
          data.data?.error || data.message || "Broadcast failed";
        throw new Error(errorMessage);
      }

      throw new Error(
        `Unexpected response: ${data.message || "Unknown error"}`
      );
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  /**
   * Broadcast multiple raw transactions in batch.
   *
   * @param {Array<{ txraw: string }>} txrawList - An array containing multiple transactions in the format [{ txraw: "string" }].
   * @param {("testnet" | "mainnet")} [network] - The network type, either "testnet" or "mainnet".
   * @returns {Promise<any>} Returns a Promise that resolves to the broadcast results with success/failure information.
   * @throws {Error} Throws an error if the broadcast completely fails.
   */
  static async broadcastTXsraw(
    txrawList: Array<{ txraw: string }>,
    network?: "testnet" | "mainnet" | string
  ): Promise<any> {
    let base_url = network
      ? API.getBaseURL(network)
      : API.getBaseURL("mainnet");
    const url = base_url + `broadcasttxs`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(txrawList),
      });

      const data = await response.json();

      if (data.code === "200") {
        console.log(
          `Broadcast success! ${data.data.success} succeeded, ${data.data.failed} failed`
        );
        return data.data;
      }

      if (data.code === "400" && data.message.includes("partial failure")) {
        console.log(
          `Partial failure: ${data.data.success} succeeded, ${data.data.failed} failed`
        );
        return data.data;
      }

      if (data.code === "400") {
        const errorMessage = data.message || "Broadcast failed";
        throw new Error(errorMessage);
      }

      throw new Error(
        `Unexpected response: ${data.message || "Unknown error"}`
      );
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  /**
   * Fetches the UTXOs for a given address.
   *
   * @param {string} address - The address to fetch UTXOs for.
   * @param {("testnet" | "mainnet")} [network] - The network type.
   * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of UTXOs.
   * @throws {Error} Throws an error if the request fails.
   */
  static async fetchUTXOs(
    address: string,
    network?: "testnet" | "mainnet" | string
  ): Promise<tbc.Transaction.IUnspentOutput[]> {
    let base_url = network
      ? API.getBaseURL(network)
      : API.getBaseURL("mainnet");
    const url = base_url + `utxo/address/${address}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch UTXO: ".concat(response.statusText));
      }
      const data = await response.json();
      const utxoList = data.data.utxos;
      if (utxoList.length === 0) {
        throw new Error("The balance in the account is zero.");
      }
      const scriptPubKey = tbc.Script.buildPublicKeyHashOut(address)
        .toBuffer()
        .toString("hex");

      return utxoList.map((utxo) => ({
        txId: utxo.txid,
        outputIndex: utxo.index,
        script: scriptPubKey,
        satoshis: utxo.value,
      }));
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  /**
   * Get UTXOs for a given address and amount.
   *
   * @param {string} address - The address to fetch UTXOs for.
   * @param {number} amount_tbc - The required amount in TBC.
   * @param {("testnet" | "mainnet")} [network] - The network type.
   * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of selected UTXOs.
   * @throws {Error} Throws an error if the balance is insufficient.
   */
  static async getUTXOs(
    address: string,
    amount_tbc: number,
    network?: "testnet" | "mainnet" | string
  ): Promise<tbc.Transaction.IUnspentOutput[]> {
    try {
      let utxos: tbc.Transaction.IUnspentOutput[] = [];
      if (network) {
        utxos = await this.fetchUTXOs(address, network);
      } else {
        utxos = await this.fetchUTXOs(address);
      }

      const amount_satoshis = amount_tbc * Math.pow(10, 6);

      let totalAmount = 0;

      for (const utxo of utxos) {
        totalAmount += utxo.satoshis;
      }

      if (totalAmount < amount_satoshis) {
        throw new Error("Insufficient tbc balance");
      }

      return utxos;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  /**
   * Fetches an NFT UTXO based on the provided script and optional transaction hash.
   *
   * @param {Object} params - The parameters for fetching the NFT UTXO.
   * @param {string} params.script - The script to fetch the UTXO for.
   * @param {string} [params.tx_hash] - The optional transaction hash to filter the UTXOs.
   * @param {("testnet" | "mainnet")} [params.network] - The network type.
   * @returns {Promise<tbc.Transaction.IUnspentOutput>} Returns a Promise that resolves to the NFT UTXO.
   * @throws {Error} Throws an error if the request fails or no matching UTXO is found.
   */
  static async fetchNFTTXO(params: {
    script: string;
    tx_hash?: string;
    network?: "testnet" | "mainnet" | string;
  }): Promise<tbc.Transaction.IUnspentOutput> {
    const { script, tx_hash, network } = params;
    let base_url = network
      ? API.getBaseURL(network)
      : API.getBaseURL("mainnet");
    const script_hash = Buffer.from(
      tbc.crypto.Hash.sha256(Buffer.from(script, "hex")).toString("hex"),
      "hex"
    )
      .reverse()
      .toString("hex");
    const url = base_url + `utxo/scriptpubkeyhash/${script_hash}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch UTXO: ".concat(response.statusText));
      }
      const data = await response.json();
      const utxoList = data.data.utxos;
      if (tx_hash) {
        const filteredUTXOs = utxoList.filter((item) => item.txid === tx_hash);

        if (filteredUTXOs.length === 0) {
          throw new Error("No matching UTXO found.");
        }

        const min_vout_utxo = filteredUTXOs.reduce((prev, current) =>
          prev.index < current.index ? prev : current
        );

        return {
          txId: min_vout_utxo.txid,
          outputIndex: min_vout_utxo.index,
          script: script,
          satoshis: min_vout_utxo.value,
        };
      } else {
        return {
          txId: utxoList[0].txid,
          outputIndex: utxoList[0].index,
          script: script,
          satoshis: utxoList[0].value,
        };
      }
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  /**
   * Fetches the NFT UTXOs for a given script and transaction hash.
   *
   * @param {Object} params - The parameters for fetching the NFT UTXOs.
   * @param {string} params.script - The script to fetch the UTXOs for.
   * @param {string} params.tx_hash - The transaction hash to filter the UTXOs.
   * @param {("testnet" | "mainnet")} [params.network] - The network type.
   * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of NFT UTXOs.
   * @throws {Error} Throws an error if the request fails or no matching UTXO is found.
   */
  static async fetchNFTTXOs(params: {
    script: string;
    tx_hash: string;
    network?: "testnet" | "mainnet" | string;
  }): Promise<tbc.Transaction.IUnspentOutput[]> {
    const { script, tx_hash, network } = params;
    let base_url = network
      ? API.getBaseURL(network)
      : API.getBaseURL("mainnet");
    const script_hash = Buffer.from(
      tbc.crypto.Hash.sha256(Buffer.from(script, "hex")).toString("hex"),
      "hex"
    )
      .reverse()
      .toString("hex");
    const url = base_url + `utxo/scriptpubkeyhash/${script_hash}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch UTXO: ".concat(response.statusText));
      }
      const data = await response.json();
      const utxoList = data.data.utxos;
      const filteredUTXOs = utxoList.filter((item) => item.txid === tx_hash);

      if (filteredUTXOs.length === 0) {
        throw new Error("The collection supply has been exhausted.");
      }

      const sortedUTXOs = filteredUTXOs.sort((a, b) => a.index - b.index);

      return sortedUTXOs.map((utxo) => ({
        txId: utxo.txid,
        outputIndex: utxo.index,
        script: script,
        satoshis: utxo.value,
      }));
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  /**
   * Fetches the NFT information for a given contract ID.
   *
   * @param {string} contract_id - The contract ID to fetch NFT information for.
   * @param {("testnet" | "mainnet")} [network] - The network type.
   * @returns {Promise<NFTInfo>} Returns a Promise that resolves to an NFTInfo object containing the NFT information.
   * @throws {Error} Throws an error if the request to fetch NFT information fails.
   */
  static async fetchNFTInfo(
    contract_id: string,
    network?: "testnet" | "mainnet" | string
  ): Promise<NFTInfo> {
    let base_url = network
      ? API.getBaseURL(network)
      : API.getBaseURL("mainnet");
    const url = base_url + `nft/nftinfo/nftid/${contract_id}`;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(
          "Failed to fetch NFTInfo: ".concat(response.statusText)
        );
      }
      const data = await response.json();

      const nftInfo: NFTInfo = {
        collectionId: data.data.collection_id,
        collectionIndex: data.data.collection_index,
        collectionName: data.data.collection_name,
        nftName: data.data.nft_name,
        nftSymbol: data.data.nft_symbol,
        nft_attributes: data.data.nft_attributes,
        nftDescription: data.data.nft_description,
        nftTransferTimeCount: data.data.nft_transfer_count,
        nftIcon: data.data.nft_icon,
      };

      return nftInfo;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  /**
   * Fetches the NFTs for a given collection ID and address.
   *
   * @param {string} collection_id - The collection ID to fetch NFTs for.
   * @param {string} address - The address to filter NFTs by.
   * @param {number} number - The number of NFTs to fetch.
   * @param {("testnet" | "mainnet")} [network] - The network type.
   * @returns {Promise<string[]>} Returns a Promise that resolves to an array of NFT contract IDs.
   * @throws {Error} Throws an error if the request fails.
   */
  static async fetchNFTs(
    collection_id: string,
    address: string,
    start: number,
    end: number,
    network?: "testnet" | "mainnet" | string
  ): Promise<string[]> {
    let base_url = network
      ? API.getBaseURL(network)
      : API.getBaseURL("mainnet");
    const url =
      base_url +
      `nft/nftbycollection/collectionid/${collection_id}/start/${start}/end/${end}`;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch NFTs: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.data.nft_list && Array.isArray(data.data.nft_list)) {
        const filteredNFTs = data.data.nft_list.filter(
          (nft: any) => nft.nft_holder === address
        );
        return filteredNFTs.map((nft: any) => nft.nft_contract_id);
      }
      return [];
    } catch (error: any) {
      throw new Error(`Error fetching NFTs: ${error.message}`);
    }
  }

  /**
   * Fetches the UMTXO for a given script.
   *
   * @param {string} script_asm - The script to fetch the UMTXO for.
   * @param {("testnet" | "mainnet")} [network] - The network type.
   * @returns {Promise<tbc.Transaction.IUnspentOutput>} Returns a Promise that resolves to the UMTXO.
   * @throws {Error} Throws an error if the request fails.
   */
  static async fetchUMTXO(
    script_asm: string,
    tbc_amount: number,
    network?: "testnet" | "mainnet" | string
  ): Promise<tbc.Transaction.IUnspentOutput> {
    const multiScript = tbc.Script.fromASM(script_asm).toHex();
    const amount_satoshis = Math.floor(tbc_amount * Math.pow(10, 6));
    const script_hash = Buffer.from(
      tbc.crypto.Hash.sha256(Buffer.from(multiScript, "hex")).toString("hex"),
      "hex"
    )
      .reverse()
      .toString("hex");
    let base_url = network
      ? API.getBaseURL(network)
      : API.getBaseURL("mainnet");
    const url = base_url + `utxo/scriptpubkeyhash/${script_hash}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch UTXO: ${response.statusText}`);
      }
      const data = await response.json();
      const utxoList = data.data.utxos;
      if (utxoList.length === 0) {
        throw new Error("The balance in the account is zero.");
      }
      let selectedUTXO = utxoList[0];
      for (let i = 0; i < utxoList.length; i++) {
        if (
          utxoList[i].value > amount_satoshis &&
          utxoList[i].value < 3200000000
        ) {
          selectedUTXO = utxoList[i];
          break;
        }
      }

      if (selectedUTXO.value < amount_satoshis) {
        let balance = 0;
        for (let i = 0; i < utxoList.length; i++) {
          balance += utxoList[i].value;
        }
        if (balance < amount_satoshis) {
          throw new Error("Insufficient tbc balance");
        } else {
          throw new Error("Please mergeUTXO");
        }
      }

      const umtxo: tbc.Transaction.IUnspentOutput = {
        txId: selectedUTXO.txid,
        outputIndex: selectedUTXO.index,
        script: multiScript,
        satoshis: selectedUTXO.value,
      };
      return umtxo;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  /**
   * Fetches all UMTXOs for a given script.
   *
   * @param {string} script_asm - The script to fetch UMTXOs for.
   * @param {("testnet" | "mainnet")} [network] - The network type.
   * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of UMTXOs.
   * @throws {Error} Throws an error if the request fails.
   */
  static async fetchUMTXOs(
    script_asm: string,
    network?: "testnet" | "mainnet" | string
  ): Promise<tbc.Transaction.IUnspentOutput[]> {
    const multiScript = tbc.Script.fromASM(script_asm).toHex();

    const script_hash = Buffer.from(
      tbc.crypto.Hash.sha256(Buffer.from(multiScript, "hex")).toString("hex"),
      "hex"
    )
      .reverse()
      .toString("hex");
    let base_url = network
      ? API.getBaseURL(network)
      : API.getBaseURL("mainnet");
    const url = base_url + `utxo/scriptpubkeyhash/${script_hash}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch UTXO: ${response.statusText}`);
      }
      const data = await response.json();
      const utxoList = data.data.utxos;
      if (utxoList.length === 0) {
        throw new Error("The balance in the account is zero.");
      }
      const umtxos = utxoList.map((utxo) => {
        return {
          txId: utxo.txid,
          outputIndex: utxo.index,
          script: multiScript,
          satoshis: utxo.value,
        } as tbc.Transaction.IUnspentOutput;
      });

      return umtxos;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  /**
   * Get UMTXOs for a given address and amount.
   *
   * @param {string} address - The address to fetch UMTXOs for.
   * @param {number} amount_tbc - The required amount in TBC.
   * @param {("testnet" | "mainnet")} [network] - The network type.
   * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of selected UMTXOs.
   * @throws {Error} Throws an error if the balance is insufficient.
   */
  static async getUMTXOs(
    script_asm: string,
    amount_tbc: number,
    network?: "testnet" | "mainnet" | string
  ): Promise<tbc.Transaction.IUnspentOutput[]> {
    try {
      let umtxos: tbc.Transaction.IUnspentOutput[] = [];
      if (network) {
        umtxos = await this.fetchUMTXOs(script_asm, network);
      } else {
        umtxos = await this.fetchUMTXOs(script_asm);
      }
      const amount_satoshis = amount_tbc * Math.pow(10, 6);

      let totalSatoshis = 0;

      for (const umtxo of umtxos) {
        totalSatoshis += umtxo.satoshis;
      }

      if (totalSatoshis < amount_satoshis) {
        throw new Error("Insufficient tbc balance");
      }

      return umtxos;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  /**
   * Fetches the FT UTXOs for a given contract and multiSig address.
   *
   * @param {string} contractTxid - The contract TXID.
   * @param {string} addressOrHash - The address or hash to fetch UMTXOs for.
   * @param {string} codeScript - The code script.
   * @param {("testnet" | "mainnet")} [network] - The network type.
   * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of UMTXOs.
   * @throws {Error} Throws an error if the request fails.
   */
  static async fetchFtUTXOS_multiSig(
    contractTxid: string,
    addressOrHash: string,
    codeScript: string,
    network?: "testnet" | "mainnet" | string
  ): Promise<tbc.Transaction.IUnspentOutput[]> {
    let base_url = network
      ? API.getBaseURL(network)
      : API.getBaseURL("mainnet");
    let hash = "";
    if (tbc.Address.isValid(addressOrHash)) {
      const publicKeyHash =
        tbc.Address.fromString(addressOrHash).hashBuffer.toString("hex");
      hash = publicKeyHash + "00";
    } else {
      if (addressOrHash.length !== 40) {
        throw new Error("Invalid address or hash");
      }
      hash = addressOrHash + "01";
    }
    try {
      const url =
        base_url + `ft/utxo/combinescript/${hash}/contract/${contractTxid}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(
          `Failed to fetch from URL: ${url}, status: ${response.status}`
        );
      }
      const responseData = await response.json();
      const utxoList = responseData.data.utxos;
      if (utxoList.length === 0) {
        throw new Error("The ft balance in the account is zero.");
      }
      let sortedData: FTUnspentOutput[] = utxoList.sort(
        (a: FTUnspentOutput, b: FTUnspentOutput) => {
          if (a.ft_value < b.ft_value) return -1;
          if (a.ft_value > b.ft_value) return 1;
          return 0;
        }
      );
      let ftutxos: tbc.Transaction.IUnspentOutput[] = [];
      for (let i = 0; i < sortedData.length; i++) {
        ftutxos.push({
          txId: sortedData[i].txid,
          outputIndex: sortedData[i].index,
          script: codeScript,
          satoshis: sortedData[i].tbc_value,
          ftBalance: sortedData[i].ft_value,
        });
      }
      return ftutxos;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  /**
   * Fetches the FT UTXOs for a given contract and multiSig address.
   *
   * @param {string} contractTxid - The contract TXID.
   * @param {string} addressOrHash - The address or hash to fetch UMTXOs for.
   * @param {string} codeScript - The code script.
   * @param {bigint} amount - The amount to fetch UMTXOs for.
   * @param {("testnet" | "mainnet")} [network] - The network type.
   * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} Returns a Promise that resolves to an array of UMTXOs.
   * @throws {Error} Throws an error if the request fails.
   */
  static async getFtUTXOS_multiSig(
    contractTxid: string,
    addressOrHash: string,
    codeScript: string,
    amount: bigint,
    network?: "testnet" | "mainnet" | string
  ): Promise<tbc.Transaction.IUnspentOutput[]> {
    let base_url = network
      ? API.getBaseURL(network)
      : API.getBaseURL("mainnet");
    let hash = "";
    if (tbc.Address.isValid(addressOrHash)) {
      const publicKeyHash =
        tbc.Address.fromString(addressOrHash).hashBuffer.toString("hex");
      hash = publicKeyHash + "00";
    } else {
      if (addressOrHash.length !== 40) {
        throw new Error("Invalid address or hash");
      }
      hash = addressOrHash + "01";
    }
    try {
      const url =
        base_url + `ft/utxo/combinescript/${hash}/contract/${contractTxid}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(
          `Failed to fetch from URL: ${url}, status: ${response.status}`
        );
      }
      const responseData = await response.json();
      const utxoList = responseData.data.utxos;
      if (utxoList.length === 0) {
        throw new Error("The ft balance in the account is zero.");
      }
      let sortedData: FTUnspentOutput[] = utxoList.sort(
        (a: FTUnspentOutput, b: FTUnspentOutput) => {
          if (a.ft_value < b.ft_value) return -1;
          if (a.ft_value > b.ft_value) return 1;
          return 0;
        }
      );
      let ftutxos: tbc.Transaction.IUnspentOutput[] = [];
      for (let i = 0; i < sortedData.length; i++) {
        ftutxos.push({
          txId: sortedData[i].txid,
          outputIndex: sortedData[i].index,
          script: codeScript,
          satoshis: sortedData[i].tbc_value,
          ftBalance: sortedData[i].ft_value,
        });
      }
      const ftBalanceArray: bigint[] = ftutxos.map((item) =>
        BigInt(item.ftBalance)
      );

      const totalBalance = ftBalanceArray.reduce(
        (sum, balance) => sum + balance,
        0n
      );
      if (totalBalance < amount) {
        throw new Error("Insufficient FT balance");
      }

      if (ftutxos.length <= 5) {
        return ftutxos;
      }

      const result_five = findMinFiveSum(ftBalanceArray, amount);
      if (result_five) {
        return [
          ftutxos[result_five[0]],
          ftutxos[result_five[1]],
          ftutxos[result_five[2]],
          ftutxos[result_five[3]],
          ftutxos[result_five[4]],
        ];
      } else {
        throw new Error("Please merge MultiSig UTXO");
      }
    } catch (error: any) {
      throw new Error(error.message);
    }
  }
}

module.exports = API;
