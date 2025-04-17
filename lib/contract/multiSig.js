"use strict";
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
      }
    : function (o, v) {
        o["default"] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o)
            if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== "default") __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, "__esModule", { value: true });
const tbc = __importStar(require("tbc-lib-js"));
const FT = require("./ft");
class MultiSig {
  /**
   * Create a multi-signature transaction
   * @param address_from The address from which the transaction is sent
   * @param pubKeys An array of public keys involved in the multi-signature
   * @param signatureCount The number of signatures required to authorize the transaction
   * @param publicKeyCount The total number of public keys in the multi-signature
   * @param amount_tbc The amount to be sent in TBC
   * @param utxos An array of unspent transaction outputs to be used as inputs
   * @param privateKey The private key used to sign the transaction
   * @returns The raw serialized transaction string
   */
  static createMultiSigWallet(
    address_from,
    pubKeys,
    signatureCount,
    publicKeyCount,
    tbc_amount,
    utxos,
    privateKey
  ) {
    const address = MultiSig.getMultiSigAddress(
      pubKeys,
      signatureCount,
      publicKeyCount
    );
    const script_asm = MultiSig.getMultiSigLockScript(address);
    const tx = new tbc.Transaction();
    tx.from(utxos);
    tx.addOutput(
      new tbc.Transaction.Output({
        script: tbc.Script.fromASM(script_asm),
        satoshis: tbc_amount,
      })
    );
    for (let i = 0; i < publicKeyCount; i++) {
      tx.addOutput(
        new tbc.Transaction.Output({
          script: MultiSig.buildHoldScript(pubKeys[i]),
          satoshis: 200,
        })
      );
    }
    tx.addOutput(
      new tbc.Transaction.Output({
        script: MultiSig.buildTapeScript(address, pubKeys),
        satoshis: 0,
      })
    ).change(address_from);
    const txSize = tx.getEstimateSize();
    if (txSize < 1000) {
      tx.fee(80);
    } else {
      tx.feePerKb(100);
    }
    tx.sign(privateKey).seal();
    const raw = tx.uncheckedSerialize();
    return raw;
  }
  /**
   * Create a P2PKH to multi-signature transaction
   * @param address_from The address from which the transaction is sent
   * @param address_to The address to which the transaction is sent
   * @param amount_tbc The amount to be sent in TBC
   * @param utxos An array of unspent transaction outputs to be used as inputs
   * @param privateKey The private key used to sign the transaction
   * @returns The raw serialized transaction string
   */
  static p2pkhToMultiSig_sendTBC(
    address_from,
    address_to,
    amount_tbc,
    utxos,
    privateKey
  ) {
    const script_asm = MultiSig.getMultiSigLockScript(address_to);
    const amount_satoshis = Math.floor(amount_tbc * Math.pow(10, 6));
    const tx = new tbc.Transaction()
      .from(utxos)
      .addOutput(
        new tbc.Transaction.Output({
          script: tbc.Script.fromASM(script_asm),
          satoshis: amount_satoshis,
        })
      )
      .change(address_from);
    const txSize = tx.getEstimateSize();
    if (txSize < 1000) {
      tx.fee(80);
    } else {
      tx.feePerKb(100);
    }
    tx.sign(privateKey).seal();
    const raw = tx.uncheckedSerialize();
    return raw;
  }
  /**
   * Build a multi-signature transaction
   * @param address_from The address from which the transaction is sent
   * @param address_to The address to which the transaction is sent
   * @param amount_tbc The amount to be sent in TBC
   * @param utxos An array of unspent transaction outputs to be used as inputs
   * @returns The raw serialized transaction string
   */
  static buildMultiSigTransaction_sendTBC(
    address_from,
    address_to,
    amount_tbc,
    utxos
  ) {
    const script_asm_from = MultiSig.getMultiSigLockScript(address_from);
    const amount_satoshis = Math.floor(amount_tbc * Math.pow(10, 6));
    let count = 0;
    let amounts = [];
    for (let i = 0; i < utxos.length; i++) {
      count += utxos[i].satoshis;
      amounts.push(utxos[i].satoshis);
    }
    const tx = new tbc.Transaction().from(utxos).fee(300);
    if (address_to.startsWith("1")) {
      tx.to(address_to, amount_satoshis).addOutput(
        new tbc.Transaction.Output({
          script: tbc.Script.fromASM(script_asm_from),
          satoshis: count - amount_satoshis - 300,
        })
      );
    } else {
      const script_asm_to = MultiSig.getMultiSigLockScript(address_to);
      tx.addOutput(
        new tbc.Transaction.Output({
          script: tbc.Script.fromASM(script_asm_to),
          satoshis: amount_satoshis,
        })
      ).addOutput(
        new tbc.Transaction.Output({
          script: tbc.Script.fromASM(script_asm_from),
          satoshis: count - amount_satoshis - 300,
        })
      );
    }
    const txraw = tx.uncheckedSerialize();
    return { txraw, amounts };
  }
  /**
   * Sign a multi-signature transaction
   * @param address_from The address from which the transaction is sent
   * @param multiSigTxraw The raw serialized transaction string
   * @param privateKey The private key used to sign the transaction
   * @returns An array of signatures
   */
  static signMultiSigTransaction_sendTBC(
    address_from,
    multiSigTxraw,
    privateKey
  ) {
    const script_asm = MultiSig.getMultiSigLockScript(address_from);
    const { txraw, amounts } = multiSigTxraw;
    const tx = new tbc.Transaction(txraw);
    for (let i = 0; i < amounts.length; i++) {
      tx.inputs[i].output = new tbc.Transaction.Output({
        script: tbc.Script.fromASM(script_asm),
        satoshis: amounts[i],
      });
    }
    let sigs = [];
    for (let i = 0; i < amounts.length; i++) {
      sigs[i] = tx.getSignature(i, privateKey);
    }
    return sigs;
  }
  /**
   * Create a multi-signature transaction from a raw transaction string
   * @param txraw The raw serialized transaction string
   * @param sigs An array of signatures
   * @param pubkeys An array of public keys
   * @returns The raw serialized transaction string
   */
  static finishMultiSigTransaction_sendTBC(txraw, sigs, pubKeys) {
    let multiPubKeys = "";
    for (let i = 0; i < pubKeys.length; i++) {
      multiPubKeys = multiPubKeys + pubKeys[i];
    }
    const tx = new tbc.Transaction(txraw);
    for (let j = 0; j < sigs.length; j++) {
      tx.setInputScript(
        {
          inputIndex: j,
        },
        (tx) => {
          let signature = "";
          for (let i = 0; i < sigs[j].length; i++) {
            if (i < sigs[j].length - 1) {
              signature = signature + sigs[j][i] + " ";
            } else {
              signature = signature + sigs[j][i];
            }
          }
          const unlockingScript = tbc.Script.fromASM(
            `OP_0 ${signature} ${multiPubKeys}`
          );
          return unlockingScript;
        }
      );
    }
    return tx.uncheckedSerialize();
  }
  /**
   * Transfer FT from a multi-signature address to another address
   * @param address_from The address from which the transaction is sent
   * @param address_to The address to which the transaction is sent
   * @param ft The FT contract
   * @param ft_amount The amount to be sent in FT
   * @param utxo The UTXO to be used as input
   * @param ftutxos An array of UTXOs to be used as inputs
   * @param preTX An array of previous transactions
   * @param prepreTxData An array of previous transaction data
   * @param privateKey The private key used to sign the transaction
   * @returns The raw serialized transaction string
   */
  static p2pkhToMultiSig_transferFT(
    address_from,
    address_to,
    ft,
    ft_amount,
    utxo,
    ftutxos,
    preTXs,
    prepreTxDatas,
    privateKey,
    tbc_amount
  ) {
    const code = ft.codeScript;
    const tape = ft.tapeScript;
    const decimal = ft.decimal;
    const tapeAmountSetIn = [];
    if (ft_amount < 0) {
      throw new Error("Invalid amount");
    }
    const amountbn = BigInt(Math.floor(ft_amount * Math.pow(10, decimal)));
    let tapeAmountSum = BigInt(0);
    for (let i = 0; i < ftutxos.length; i++) {
      tapeAmountSetIn.push(ftutxos[i].ftBalance);
      tapeAmountSum += BigInt(tapeAmountSetIn[i]);
    }
    if (amountbn > tapeAmountSum) {
      throw new Error("Insufficient balance, please add more FT UTXOs");
    }
    if (decimal > 18) {
      throw new Error("The maximum value for decimal cannot exceed 18");
    }
    const maxAmount = Math.floor(Math.pow(10, 18 - decimal));
    if (ft_amount > maxAmount) {
      throw new Error(
        `When decimal is ${decimal}, the maximum amount cannot exceed ${maxAmount}`
      );
    }
    const { amountHex, changeHex } = FT.buildTapeAmount(
      amountbn,
      tapeAmountSetIn
    );
    const script_asm = MultiSig.getMultiSigLockScript(address_to);
    const tx = new tbc.Transaction().from(ftutxos).from(utxo);
    const hash = tbc.crypto.Hash.sha256ripemd160(
      tbc.crypto.Hash.sha256(tbc.Script.fromASM(script_asm).toBuffer())
    ).toString("hex");
    const codeScript = FT.buildFTtransferCode(code, hash);
    tx.addOutput(
      new tbc.Transaction.Output({
        script: codeScript,
        satoshis: 2000,
      })
    );
    const tapeScript = FT.buildFTtransferTape(tape, amountHex);
    tx.addOutput(
      new tbc.Transaction.Output({
        script: tapeScript,
        satoshis: 0,
      })
    );
    if (amountbn < tapeAmountSum) {
      const changeCodeScript = FT.buildFTtransferCode(code, address_from);
      tx.addOutput(
        new tbc.Transaction.Output({
          script: changeCodeScript,
          satoshis: 2000,
        })
      );
      const changeTapeScript = FT.buildFTtransferTape(tape, changeHex);
      tx.addOutput(
        new tbc.Transaction.Output({
          script: changeTapeScript,
          satoshis: 0,
        })
      );
    }
    if (tbc_amount) {
      const amount_satoshis = Math.floor(tbc_amount * Math.pow(10, 6));
      tx.addOutput(
        new tbc.Transaction.Output({
          script: tbc.Script.fromASM(script_asm),
          satoshis: amount_satoshis,
        })
      );
    }
    tx.change(address_from);
    const txSize = tx.getEstimateSize();
    if (txSize < 1000) {
      tx.fee(80);
    } else {
      tx.feePerKb(100);
    }
    for (let i = 0; i < ftutxos.length; i++) {
      tx.setInputScript(
        {
          inputIndex: i,
        },
        (tx) => {
          const unlockingScript = ft.getFTunlock(
            privateKey,
            tx,
            preTXs[i],
            prepreTxDatas[i],
            i,
            ftutxos[i].outputIndex
          );
          return unlockingScript;
        }
      );
    }
    tx.sign(privateKey).seal();
    return tx.uncheckedSerialize();
  }
  /**
   * Build a multi-signature transaction for transferring FT
   * @param address_from The address from which the transaction is sent
   * @param address_to The address to which the transaction is sent
   * @param ft The FT contract
   * @param ft_amount The amount to be sent in FT
   * @param utxo The UTXO to be used as input
   * @param ftutxos An array of UTXOs to be used as inputs
   * @param preTX An array of previous transactions
   * @param prepreTxData An array of previous transaction data
   * @param privateKey The private key used to sign the transaction
   * @returns The raw serialized transaction string
   */
  static buildMultiSigTransaction_transferFT(
    address_from,
    address_to,
    ft,
    ft_amount,
    utxo,
    ftutxos,
    preTXs,
    prepreTxDatas,
    contractTX,
    privateKey,
    tbc_amount
  ) {
    const code = ft.codeScript;
    const tape = ft.tapeScript;
    const decimal = ft.decimal;
    const tapeAmountSetIn = [];
    if (ft_amount < 0) {
      throw new Error("Invalid amount");
    }
    const script_asm_from = MultiSig.getMultiSigLockScript(address_from);
    const hash_from = tbc.crypto.Hash.sha256ripemd160(
      tbc.crypto.Hash.sha256(tbc.Script.fromASM(script_asm_from).toBuffer())
    ).toString("hex");
    const amountbn = BigInt(Math.floor(ft_amount * Math.pow(10, decimal)));
    let tapeAmountSum = BigInt(0);
    for (let i = 0; i < ftutxos.length; i++) {
      tapeAmountSetIn.push(ftutxos[i].ftBalance);
      tapeAmountSum += BigInt(tapeAmountSetIn[i]);
    }
    if (amountbn > tapeAmountSum) {
      throw new Error("Insufficient balance, please add more FT UTXOs");
    }
    if (decimal > 18) {
      throw new Error("The maximum value for decimal cannot exceed 18");
    }
    const maxAmount = Math.floor(Math.pow(10, 18 - decimal));
    if (ft_amount > maxAmount) {
      throw new Error(
        `When decimal is ${decimal}, the maximum amount cannot exceed ${maxAmount}`
      );
    }
    const { amountHex, changeHex } = FT.buildTapeAmount(
      amountbn,
      tapeAmountSetIn,
      1
    );
    const tx = new tbc.Transaction().from(utxo).from(ftutxos);
    let codeScript;
    if (address_to.startsWith("1")) {
      codeScript = FT.buildFTtransferCode(code, address_to);
    } else {
      const hash_to = tbc.crypto.Hash.sha256ripemd160(
        tbc.crypto.Hash.sha256(
          tbc.Script.fromASM(
            MultiSig.getMultiSigLockScript(address_to)
          ).toBuffer()
        )
      ).toString("hex");
      codeScript = FT.buildFTtransferCode(code, hash_to);
    }
    tx.addOutput(
      new tbc.Transaction.Output({
        script: codeScript,
        satoshis: 2000,
      })
    );
    const tapeScript = FT.buildFTtransferTape(tape, amountHex);
    tx.addOutput(
      new tbc.Transaction.Output({
        script: tapeScript,
        satoshis: 0,
      })
    );
    if (amountbn < tapeAmountSum) {
      const changeCodeScript = FT.buildFTtransferCode(code, hash_from);
      tx.addOutput(
        new tbc.Transaction.Output({
          script: changeCodeScript,
          satoshis: 2000,
        })
      );
      const changeTapeScript = FT.buildFTtransferTape(tape, changeHex);
      tx.addOutput(
        new tbc.Transaction.Output({
          script: changeTapeScript,
          satoshis: 0,
        })
      );
    }
    let amount_satoshis = 0;
    if (tbc_amount) {
      amount_satoshis = Math.floor(tbc_amount * Math.pow(10, 6));
      if (address_to.startsWith("1")) {
        tx.addOutput(
          new tbc.Transaction.Output({
            script: tbc.Script.buildPublicKeyHashOut(address_to),
            satoshis: amount_satoshis,
          })
        );
      } else {
        tx.addOutput(
          new tbc.Transaction.Output({
            script: tbc.Script.fromASM(
              MultiSig.getMultiSigLockScript(address_to)
            ),
            satoshis: amount_satoshis,
          })
        );
      }
    }
    switch (ftutxos.length) {
      case 1:
        tx.addOutput(
          new tbc.Transaction.Output({
            script: tbc.Script.fromASM(script_asm_from),
            satoshis: utxo.satoshis - amount_satoshis - 4000,
          })
        );
        break;
      case 2:
        tx.addOutput(
          new tbc.Transaction.Output({
            script: tbc.Script.fromASM(script_asm_from),
            satoshis: utxo.satoshis - amount_satoshis - 5500,
          })
        );
        break;
      case 3:
        tx.addOutput(
          new tbc.Transaction.Output({
            script: tbc.Script.fromASM(script_asm_from),
            satoshis: utxo.satoshis - amount_satoshis - 7000,
          })
        );
        break;
      case 4:
        tx.addOutput(
          new tbc.Transaction.Output({
            script: tbc.Script.fromASM(script_asm_from),
            satoshis: utxo.satoshis - amount_satoshis - 8500,
          })
        );
        break;
      case 5:
        tx.addOutput(
          new tbc.Transaction.Output({
            script: tbc.Script.fromASM(script_asm_from),
            satoshis: utxo.satoshis - amount_satoshis - 10000,
          })
        );
        break;
    }
    for (let i = 0; i < ftutxos.length; i++) {
      tx.setInputScript(
        {
          inputIndex: i + 1,
        },
        (tx) => {
          const unlockingScript = ft.getFTunlockSwap(
            privateKey,
            tx,
            preTXs[i],
            prepreTxDatas[i],
            contractTX,
            i + 1,
            ftutxos[i].outputIndex
          );
          return unlockingScript;
        }
      );
    }
    const txraw = tx.uncheckedSerialize();
    return { txraw, amounts: [utxo.satoshis] };
  }
  /**
   * Sign a multi-signature transaction for transferring FT
   * @param address_from The address from which the transaction is sent
   * @param multiSigTxraw The raw serialized transaction string
   * @param privateKey The private key used to sign the transaction
   * @returns An array of signatures
   */
  static signMultiSigTransaction_transferFT(
    multiSig_address,
    multiSigTxraw,
    privateKey
  ) {
    const script_asm = MultiSig.getMultiSigLockScript(multiSig_address);
    const { txraw, amounts } = multiSigTxraw;
    const tx = new tbc.Transaction(txraw);
    tx.inputs[0].output = new tbc.Transaction.Output({
      script: tbc.Script.fromASM(script_asm),
      satoshis: amounts[0],
    });
    let sigs = [];
    sigs[0] = tx.getSignature(0, privateKey);
    return sigs;
  }
  /**
   * Finish a multi-signature transaction for transferring FT
   * @param txraw The raw serialized transaction string
   * @param sigs An array of signatures
   * @param pubkeys The public keys
   * @returns The raw serialized transaction string
   */
  static finishMultiSigTransaction_transferFT(txraw, sigs, pubKeys) {
    let multiPubKeys = "";
    for (let i = 0; i < pubKeys.length; i++) {
      multiPubKeys = multiPubKeys + pubKeys[i];
    }
    const tx = new tbc.Transaction(txraw);
    tx.setInputScript(
      {
        inputIndex: 0,
      },
      (tx) => {
        let signature = "";
        for (let i = 0; i < sigs[0].length; i++) {
          if (i < sigs[0].length - 1) {
            signature = signature + sigs[0][i] + " ";
          } else {
            signature = signature + sigs[0][i];
          }
        }
        const unlockingScript = tbc.Script.fromASM(
          `OP_0 ${signature} ${multiPubKeys}`
        );
        return unlockingScript;
      }
    );
    return tx.uncheckedSerialize();
  }
  /**
   * Get multi-signature address
   * @param pubkeys Public keys
   * @param signatureCount Number of signatures
   * @param publicKeyCount Number of public keys
   * @returns Multi-signature address
   */
  static getMultiSigAddress(pubKeys, signatureCount, publicKeyCount) {
    if (signatureCount < 1 || signatureCount > 6) {
      throw new Error("Invalid signatureCount.");
    } else if (publicKeyCount < 3 || publicKeyCount > 10) {
      throw new Error("Invalid publicKeyCount.");
    } else if (signatureCount > publicKeyCount) {
      throw new Error("SignatureCount must be less than publicKeyCount.");
    }
    const hash = MultiSig.getHash(pubKeys);
    const prefix = (signatureCount << 4) | (publicKeyCount & 0x0f);
    const versionBuffer = Buffer.from([prefix]);
    const addressBuffer = Buffer.concat([versionBuffer, hash]);
    const addressHash = tbc.crypto.Hash.sha256sha256(addressBuffer);
    const checksum = addressHash.subarray(0, 4);
    const addressWithChecksum = Buffer.concat([addressBuffer, checksum]);
    return tbc.encoding.Base58.encode(addressWithChecksum);
  }
  /**
   * Get the signature and public key count from a multi-signature address
   * @param address Multi-signature address
   * @returns Signature and public key count
   */
  static getSignatureAndPublicKeyCount(address) {
    const buf = Buffer.from(tbc.encoding.Base58.decode(address));
    const prefix = buf[0];
    const signatureCount = (prefix >> 4) & 0x0f;
    const publicKeyCount = prefix & 0x0f;
    return { signatureCount, publicKeyCount };
  }
  /**
   * Verify a multi-signature address
   * @param pubkeys Public keys
   * @param address Multi-signature address
   * @returns True if the address is valid, false otherwise
   */
  static verifyMultiSigAddress(pubKeys, address) {
    const hash_from_pubkeys = MultiSig.getHash(pubKeys).toString("hex");
    const buf = Buffer.from(tbc.encoding.Base58.decode(address));
    const hash_from_address = Buffer.from(buf.subarray(1, 21)).toString("hex");
    return hash_from_pubkeys === hash_from_address;
  }
  /**
   * Generate a multi-signature lock script(script_asm) from a multi-signature address
   * @param address Multi-signature address
   * @returns Lock script for the multi-signature contract
   * @throws Error if signature count or public key count is invalid
   *
   * The generated lock script performs the following:
   * 1. Splits the input public keys
   * 2. Duplicates and concatenates the public keys
   * 3. Verifies the hash matches the address
   * 4. Checks that the required number of signatures are valid
   */
  static getMultiSigLockScript(address) {
    const buf = Buffer.from(tbc.encoding.Base58.decode(address));
    const { signatureCount, publicKeyCount } =
      MultiSig.getSignatureAndPublicKeyCount(address);
    if (signatureCount < 1 || signatureCount > 6) {
      throw new Error("Invalid signatureCount.");
    } else if (publicKeyCount < 3 || publicKeyCount > 10) {
      throw new Error("Invalid publicKeyCount.");
    } else if (signatureCount > publicKeyCount) {
      throw new Error("SignatureCount must be less than publicKeyCount.");
    }
    const hash = Buffer.from(buf.subarray(1, 21)).toString("hex");
    let lockScriptPrefix = "";
    for (let i = 0; i < publicKeyCount - 1; i++) {
      lockScriptPrefix = lockScriptPrefix + "21 OP_SPLIT ";
    }
    for (let i = 0; i < publicKeyCount; i++) {
      lockScriptPrefix = lockScriptPrefix + `OP_${publicKeyCount - 1} OP_PICK `;
    }
    for (let i = 0; i < publicKeyCount - 1; i++) {
      lockScriptPrefix = lockScriptPrefix + `OP_CAT `;
    }
    const script_asm =
      `OP_${signatureCount} OP_SWAP ` +
      lockScriptPrefix +
      `OP_HASH160 ${hash} OP_EQUALVERIFY OP_${publicKeyCount} OP_CHECKMULTISIG`;
    return script_asm;
  }
  /**
   * Get the combine hash from a multi-signature address
   * @param address Multi-signature address
   * @returns Combine hash
   */
  static getCombineHash(address) {
    const combine_hash =
      tbc.crypto.Hash.sha256ripemd160(
        tbc.crypto.Hash.sha256(
          tbc.Script.fromASM(MultiSig.getMultiSigLockScript(address)).toBuffer()
        )
      ).toString("hex") + "01";
    return combine_hash;
  }
  static getHash(pubKeys) {
    let multiPubKeys = "";
    for (let i = 0; i < pubKeys.length; i++) {
      multiPubKeys = multiPubKeys + pubKeys[i];
    }
    const buf = Buffer.from(multiPubKeys, "hex");
    const hash = tbc.crypto.Hash.sha256ripemd160(buf);
    return hash;
  }
  static buildHoldScript(pubKey) {
    const publicKeyHash = tbc.crypto.Hash.sha256ripemd160(
      Buffer.from(pubKey, "hex")
    ).toString("hex");
    return new tbc.Script(
      "OP_DUP OP_HASH160" +
        " 0x14 0x" +
        publicKeyHash +
        " OP_EQUALVERIFY OP_CHECKSIG OP_RETURN 0x08 0x6d756c7469736967"
    );
  }
  static buildTapeScript(address, pubKeys) {
    const data = {
      address: address,
      pubkeys: pubKeys,
    };
    const dataHex = Buffer.from(JSON.stringify(data)).toString("hex");
    return tbc.Script.fromASM("OP_FALSE OP_RETURN " + dataHex + " 4d54617065");
  }
}
module.exports = MultiSig;
