import * as tbc from "tbc-lib-js";
import { getPrePreTxdata, getSize } from "../util/ftunlock";
import {
  getCurrentTxdata as nftGetCurrentTxdata,
  getPreTxdata as nftGetPreTxdata,
  getPrePreTxdata as nftGetPrePreTxdata,
} from "../util/nftunlock";
import {
  buildUTXO,
  buildFtPrePreTxData,
  parseDecimalToBigInt,
} from "../util/util";
const FT = require("./ft");
const NFT = require("./nft");

const SIGHASH_ALL_FORKID =
  (tbc.crypto.Signature as any).SIGHASH_ALL |
  (tbc.crypto.Signature as any).SIGHASH_FORKID;

/** Sighash to be signed externally by the MuSig2 admin ceremony. */
export interface AdminSighash {
  inputIndex: number;
  sighash: Buffer; // 32 bytes BIP340 msg
}

/** Returned by prepare* admin methods. `finalize(sigs)` produces the final tx raw. */
export interface AdminPrepared<R> {
  tx: tbc.Transaction;
  sighashes: AdminSighash[];
  finalize: (schnorrSigs64: Buffer[]) => R;
}

function computeInputSighash(
  tx: tbc.Transaction,
  inputIndex: number,
): Buffer {
  const preimageHex = tx.getPreimage(inputIndex, SIGHASH_ALL_FORKID);
  return tbc.crypto.Hash.sha256sha256(Buffer.from(preimageHex, "hex"));
}

function encodeSchnorrSig65Hex(sig64: Buffer): string {
  if (!Buffer.isBuffer(sig64) || sig64.length !== 64) {
    throw new Error("Schnorr signature must be 64 bytes");
  }
  return Buffer.concat([sig64, Buffer.from([SIGHASH_ALL_FORKID])]).toString(
    "hex",
  );
}

function hash160Hex(buf: Buffer): string {
  return tbc.crypto.Hash.sha256ripemd160(buf).toString("hex");
}

/**
 * A fixed-length 64-byte all-zero placeholder used as a stand-in Schnorr
 * signature while we pre-seed admin unlock scripts. Its byte length matches a
 * real BIP340 signature, so every size-dependent computation (fee estimate,
 * hashOutputs) that reads the in-memory tx produces the same result before
 * and after we swap in real signatures.
 */
const DUMMY_SCHNORR_SIG64 = Buffer.alloc(64);

/**
 * Pre-install dummy-signature unlock scripts on admin-signed inputs so
 * `_estimateSize` reflects the final broadcast size, then freeze the fee so
 * subsequent `_updateChangeOutput` calls — including the one inside
 * `tx.seal()` — cannot mutate the change output.
 *
 * Why this is load-bearing: tbc-lib-js recomputes the change output in
 * `seal()` via `_estimateFee = _estimateSize * feePerKb / 1000`. If admin
 * inputs are still empty at sighash time, the estimated fee is too low and
 * the initial change is too large; `seal()` then shrinks it. The Schnorr
 * MuSig signature was produced over the *old* hashOutputs, so the node
 * recomputes a different sighash and rejects with NULLFAIL. Freezing the fee
 * with `tx.fee()` converts `getFee()` to a constant and makes `seal()` a
 * no-op for the change output.
 */
function preseedAdminInputsAndFreezeFee(
  tx: tbc.Transaction,
  feePrivateKey: tbc.PrivateKey,
  adminUnlockBuilders: Array<{
    inputIndex: number;
    buildWithSig: (sig64: Buffer, t: tbc.Transaction) => tbc.Script;
  }>,
): void {
  for (const { inputIndex, buildWithSig } of adminUnlockBuilders) {
    tx.setInputScript({ inputIndex }, (t: tbc.Transaction) =>
      buildWithSig(DUMMY_SCHNORR_SIG64, t),
    );
  }
  tx.sign(feePrivateKey);
  const t = tx as any;
  t.fee(t.getFee());
  tx.sign(feePrivateKey);
}

class stableCoin extends FT {
  /**
   * Mints a new stableCoin and returns the raw transaction hex.
   * @param privateKey_from - The private key of the sender.
   * @param address_to - The recipient's address.
   * @param utxo - The UTXO to spend.
   * @returns The raw transaction hex string array.
   */
  /**
   * Creates a new stableCoin. Produces a coinNft-creation tx (ECDSA-signed
   * by the fee funder upfront) and a mint tx that requires two Schnorr
   * MuSig2 admin signatures (inputs 0 and 1). Call `finalize(sigs)` once the
   * external MuSig ceremony has produced the 64-byte Schnorr sigs for those
   * sighashes.
   *
   * @param aggPubkey32 - 32-byte x-only MuSig2 aggregate admin pubkey.
   * @param feePrivateKey - ECDSA key funding the txs and signing fee inputs.
   */
  createCoin(
    aggPubkey32: Buffer,
    feePrivateKey: tbc.PrivateKey,
    address_to: string,
    utxo: tbc.Transaction.IUnspentOutput,
    utxoTX: tbc.Transaction,
    mintMessage?: string,
  ): AdminPrepared<string[]> {
    if (!Buffer.isBuffer(aggPubkey32) || aggPubkey32.length !== 32) {
      throw new Error("aggPubkey32 must be 32 bytes (x-only)");
    }
    const adminPubHash = hash160Hex(aggPubkey32);
    const name = this.name;
    const symbol = this.symbol;
    const decimal = this.decimal;
    const totalSupply = parseDecimalToBigInt(this.totalSupply, decimal);

    // Prepare the amount in BN format and write it into a buffer
    const amountbn = new tbc.crypto.BN(totalSupply.toString());
    const amountwriter = new tbc.encoding.BufferWriter();
    amountwriter.writeUInt64LEBN(amountbn);
    for (let i = 1; i < 6; i++) {
      amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
    }
    const tapeAmount = amountwriter.toBuffer().toString("hex");

    // Convert name, symbol, and decimal to hex
    const nameHex = Buffer.from(name, "utf8").toString("hex");
    const symbolHex = Buffer.from(symbol, "utf8").toString("hex");
    const decimalHex = decimal.toString(16).padStart(2, "0");
    const lockTimeHex = "00000000";
    // Build the tape script
    const tapeScript = tbc.Script.fromASM(
      `OP_FALSE OP_RETURN ${tapeAmount} ${decimalHex} ${nameHex} ${symbolHex} ${lockTimeHex} 4654617065`,
    );
    const tapeSize = tapeScript.toBuffer().length;

    const data: coinNftData = {
      nftName: name + " NFT",
      nftSymbol: symbol + " NFT",
      description: `The sole issuance certificate for the stablecoin, dynamically recording cumulative supply and issuance history. Non-transferable, real-time updated, ensuring full transparency and auditability.`,
      coinDecimal: decimal,
      coinTotalSupply: "0",
    };
    const coinNftTX = stableCoin.buildCoinNftTX(
      feePrivateKey,
      adminPubHash,
      utxo,
      data,
    );
    const coinNftTXRaw = coinNftTX.uncheckedSerialize();
    data.coinTotalSupply = totalSupply.toString();
    const coinNftOutputs = stableCoin.buildCoinNftOutput(
      coinNftTX.outputs[0].script,
      coinNftTX.outputs[1].script,
      coinNft.getTapeScript(data),
    );

    // Build the code script for minting coin
    const originCodeHash = tbc.crypto.Hash.sha256(
      coinNftTX.outputs[0].script.toBuffer(),
    ).toString("hex");
    const codeScript = stableCoin.getCoinMintCode(
      adminPubHash,
      address_to,
      originCodeHash,
      tapeSize,
    );
    this.codeScript = codeScript.toBuffer().toString("hex");
    this.tapeScript = tapeScript.toBuffer().toString("hex");
    // Construct the mint transaction.
    // Inputs: 0=coinNft code (admin MuSig), 1=coinNft hold (admin MuSig),
    //         2=coinNft change back to fee funder (ECDSA).
    const tx = new tbc.Transaction()
      .addInputFromPrevTx(coinNftTX, 0)
      .addInputFromPrevTx(coinNftTX, 1)
      .addInputFromPrevTx(coinNftTX, 3);
    coinNftOutputs.forEach((output) => tx.addOutput(output));

    tx.addOutput(
      new tbc.Transaction.Output({
        script: codeScript,
        satoshis: 500,
      }),
    ).addOutput(
      new tbc.Transaction.Output({
        script: tapeScript,
        satoshis: 0,
      }),
    );
    if (mintMessage && mintMessage.length > 0) {
      const mintMessageHex = Buffer.from(mintMessage, "utf8").toString("hex");
      const msgScript = tbc.Script.fromASM(
        `OP_FALSE OP_RETURN ${mintMessageHex}`,
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: msgScript,
          satoshis: 0,
        }),
      );
    }
    tx.feePerKb(80).change(feePrivateKey.toAddress());

    // Pre-seed dummy Schnorr unlocks so the final byte layout is locked in
    // before we compute sighashes; then freeze the fee so seal() cannot
    // shift the change output and invalidate those sighashes.
    preseedAdminInputsAndFreezeFee(tx, feePrivateKey, [
      {
        inputIndex: 0,
        buildWithSig: (sig64, t) =>
          coinNft.buildUnlockScriptSchnorr(
            sig64,
            aggPubkey32,
            t,
            coinNftTX,
            utxoTX,
            0,
          ),
      },
      {
        inputIndex: 1,
        buildWithSig: (sig64) =>
          tbc.Script.fromASM(
            `${encodeSchnorrSig65Hex(sig64)} ${aggPubkey32.toString("hex")}`,
          ),
      },
    ]);

    const sighashes: AdminSighash[] = [
      { inputIndex: 0, sighash: computeInputSighash(tx, 0) },
      { inputIndex: 1, sighash: computeInputSighash(tx, 1) },
    ];

    const self = this;
    const finalize = (schnorrSigs64: Buffer[]): string[] => {
      if (!Array.isArray(schnorrSigs64) || schnorrSigs64.length !== 2) {
        throw new Error("createCoin.finalize: expected 2 Schnorr sigs");
      }
      tx.setInputScript(
        { inputIndex: 0 },
        (t: tbc.Transaction) =>
          coinNft.buildUnlockScriptSchnorr(
            schnorrSigs64[0],
            aggPubkey32,
            t,
            coinNftTX,
            utxoTX,
            0,
          ),
      ).setInputScript({ inputIndex: 1 }, () =>
        tbc.Script.fromASM(
          `${encodeSchnorrSig65Hex(schnorrSigs64[1])} ${aggPubkey32.toString("hex")}`,
        ),
      );
      // Fee input was signed at preseed; seal() re-signs via tx._privateKey.
      tx.seal();
      self.contractTxid = tx.hash;
      return [coinNftTXRaw, tx.uncheckedSerialize()];
    };

    return { tx, sighashes, finalize };
  }

  /**
   * Mints additional stableCoin supply. Returns the mint tx pending admin
   * MuSig2 signatures on inputs 0 (nft code) and 1 (nft hold). Fee input
   * (index 2) is signed with ECDSA using `feePrivateKey` inside `finalize`.
   *
   * @param aggPubkey32 - 32-byte x-only MuSig2 aggregate admin pubkey.
   * @param feePrivateKey - ECDSA key funding the fee input and change.
   */
  mintCoin(
    aggPubkey32: Buffer,
    feePrivateKey: tbc.PrivateKey,
    address_to: string,
    mintAmount: number | string,
    utxo: tbc.Transaction.IUnspentOutput,
    nftPreTX: tbc.Transaction,
    nftPrePreTX: tbc.Transaction,
    mintMessage?: string,
  ): AdminPrepared<string> {
    if (!Buffer.isBuffer(aggPubkey32) || aggPubkey32.length !== 32) {
      throw new Error("aggPubkey32 must be 32 bytes (x-only)");
    }
    const adminPubHash = hash160Hex(aggPubkey32);
    const name = this.name;
    const symbol = this.symbol;
    const decimal = this.decimal;
    const totalSupply = BigInt(this.totalSupply);
    const newMintAmount = parseDecimalToBigInt(mintAmount, decimal);
    const newTotalSupply = totalSupply + newMintAmount;
    const coinNftTX = nftPreTX;

    const amountbn = new tbc.crypto.BN(newMintAmount.toString());
    const amountwriter = new tbc.encoding.BufferWriter();
    amountwriter.writeUInt64LEBN(amountbn);
    for (let i = 1; i < 6; i++) {
      amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
    }
    const tapeAmount = amountwriter.toBuffer().toString("hex");

    const nameHex = Buffer.from(name, "utf8").toString("hex");
    const symbolHex = Buffer.from(symbol, "utf8").toString("hex");
    const decimalHex = decimal.toString(16).padStart(2, "0");
    const lockTimeHex = "00000000";
    const tapeScript = tbc.Script.fromASM(
      `OP_FALSE OP_RETURN ${tapeAmount} ${decimalHex} ${nameHex} ${symbolHex} ${lockTimeHex} 4654617065`,
    );
    const tapeSize = tapeScript.toBuffer().length;

    const coinNftOutputs = stableCoin.buildCoinNftOutput(
      coinNftTX.outputs[0].script,
      coinNftTX.outputs[1].script,
      coinNft.updateTapeScript(
        coinNftTX.outputs[2].script,
        newTotalSupply.toString(),
      ),
    );

    const originCodeHash = tbc.crypto.Hash.sha256(
      coinNftTX.outputs[0].script.toBuffer(),
    ).toString("hex");
    const codeScript = stableCoin.getCoinMintCode(
      adminPubHash,
      address_to,
      originCodeHash,
      tapeSize,
    );
    this.codeScript = codeScript.toBuffer().toString("hex");
    this.tapeScript = tapeScript.toBuffer().toString("hex");

    // Inputs: 0=nft code (admin MuSig), 1=nft hold (admin MuSig),
    //         2=fee utxo (ECDSA).
    const tx = new tbc.Transaction()
      .addInputFromPrevTx(coinNftTX, 0)
      .addInputFromPrevTx(coinNftTX, 1)
      .from(utxo);
    coinNftOutputs.forEach((output) => tx.addOutput(output));

    tx.addOutput(
      new tbc.Transaction.Output({
        script: codeScript,
        satoshis: 500,
      }),
    ).addOutput(
      new tbc.Transaction.Output({
        script: tapeScript,
        satoshis: 0,
      }),
    );
    if (mintMessage && mintMessage.length > 0) {
      const mintMessageHex = Buffer.from(mintMessage, "utf8").toString("hex");
      const msgScript = tbc.Script.fromASM(
        `OP_FALSE OP_RETURN ${mintMessageHex}`,
      );
      tx.addOutput(
        new tbc.Transaction.Output({
          script: msgScript,
          satoshis: 0,
        }),
      );
    }
    tx.feePerKb(80).change(feePrivateKey.toAddress());

    preseedAdminInputsAndFreezeFee(tx, feePrivateKey, [
      {
        inputIndex: 0,
        buildWithSig: (sig64, t) =>
          coinNft.buildUnlockScriptSchnorr(
            sig64,
            aggPubkey32,
            t,
            nftPreTX,
            nftPrePreTX,
            0,
          ),
      },
      {
        inputIndex: 1,
        buildWithSig: (sig64) =>
          tbc.Script.fromASM(
            `${encodeSchnorrSig65Hex(sig64)} ${aggPubkey32.toString("hex")}`,
          ),
      },
    ]);

    const sighashes: AdminSighash[] = [
      { inputIndex: 0, sighash: computeInputSighash(tx, 0) },
      { inputIndex: 1, sighash: computeInputSighash(tx, 1) },
    ];

    const finalize = (schnorrSigs64: Buffer[]): string => {
      if (!Array.isArray(schnorrSigs64) || schnorrSigs64.length !== 2) {
        throw new Error("mintCoin.finalize: expected 2 Schnorr sigs");
      }
      tx.setInputScript(
        { inputIndex: 0 },
        (t: tbc.Transaction) =>
          coinNft.buildUnlockScriptSchnorr(
            schnorrSigs64[0],
            aggPubkey32,
            t,
            nftPreTX,
            nftPrePreTX,
            0,
          ),
      ).setInputScript({ inputIndex: 1 }, () =>
        tbc.Script.fromASM(
          `${encodeSchnorrSig65Hex(schnorrSigs64[1])} ${aggPubkey32.toString("hex")}`,
        ),
      );
      tx.seal();
      return tx.uncheckedSerialize();
    };

    return { tx, sighashes, finalize };
  }

  /**
   * Transfers stableCoin to another address.
   * @param privateKey_from - The private key of the sender.
   * @param address_to - The recipient's address.
   * @param ft_amount - The amount of FT to transfer.
   * @param ftutxo_a - Array of FT UTXOs to spend.
   * @param utxo - Regular UTXO for transaction fees.
   * @param preTX - Array of previous transactions.
   * @param prepreTxData - Array of pre-previous transaction data.
   * @param tbc_amount - Optional TBC amount to send alongside.
   * @returns The raw transaction hex string.
   */
  transfer(
    privateKey_from: tbc.PrivateKey,
    address_to: string,
    ft_amount: number | string,
    ftutxo_a: tbc.Transaction.IUnspentOutput[],
    utxo: tbc.Transaction.IUnspentOutput,
    preTX: tbc.Transaction[],
    prepreTxData: string[],
    tbc_amount?: number | string,
  ): string {
    const privateKey = privateKey_from;
    const address_from = privateKey.toAddress().toString();
    const code = this.codeScript;
    const tape = this.tapeScript;
    const decimal = this.decimal;
    const isCoin = 1;
    const tapeAmountSetIn: bigint[] = [];
    if (
      (typeof ft_amount === "string" && parseFloat(ft_amount) < 0) ||
      (typeof ft_amount === "number" && ft_amount < 0)
    ) {
      throw new Error("Invalid amount input");
    }
    const amountbn = parseDecimalToBigInt(ft_amount, decimal);
    // Calculate the total available balance
    let tapeAmountSum = BigInt(0);
    let lockTimeMax = 0;
    for (let i = 0; i < ftutxo_a.length; i++) {
      tapeAmountSetIn.push(ftutxo_a[i].ftBalance!);
      tapeAmountSum += BigInt(tapeAmountSetIn[i]);
      lockTimeMax = Math.max(
        lockTimeMax,
        stableCoin.getLockTimeFromTape(
          preTX[i].outputs[ftutxo_a[i].outputIndex + 1].script,
        ),
      );
    }
    // Check if the balance is sufficient
    if (amountbn > tapeAmountSum) {
      throw new Error("Insufficient balance, please add more FT UTXOs");
    }
    // Validate the decimal and amount
    if (decimal > 18) {
      throw new Error("The maximum value for decimal cannot exceed 18");
    }
    const maxAmount = parseDecimalToBigInt(1, 18 - decimal);
    if (Number(ft_amount) > Number(maxAmount)) {
      throw new Error(
        `When decimal is ${decimal}, the maximum amount cannot exceed ${maxAmount}`,
      );
    }
    // Build the amount and change hex strings for the tape
    const { amountHex, changeHex } = FT.buildTapeAmount(
      amountbn,
      tapeAmountSetIn,
    );
    // Construct the transaction
    const tx = new tbc.Transaction().from(ftutxo_a).from(utxo);

    // Build the code script for the recipient
    const codeScript = FT.buildFTtransferCode(code, address_to);
    tx.addOutput(
      new tbc.Transaction.Output({
        script: codeScript,
        satoshis: 500,
      }),
    );
    // Build the tape script for the amount
    const tapeScript = FT.buildFTtransferTape(tape, amountHex);
    tx.addOutput(
      new tbc.Transaction.Output({
        script: tapeScript,
        satoshis: 0,
      }),
    );
    if (tbc_amount) {
      const amount_satoshis = Number(parseDecimalToBigInt(tbc_amount, 6));
      tx.to(address_to, amount_satoshis);
    }
    // If there's change, add outputs for the change
    if (amountbn < tapeAmountSum) {
      const changeCodeScript = FT.buildFTtransferCode(code, address_from);
      tx.addOutput(
        new tbc.Transaction.Output({
          script: changeCodeScript,
          satoshis: 500,
        }),
      );

      const changeTapeScript = FT.buildFTtransferTape(tape, changeHex);
      tx.addOutput(
        new tbc.Transaction.Output({
          script: changeTapeScript,
          satoshis: 0,
        }),
      );
    }
    tx.feePerKb(80);
    tx.change(address_from);
    // Set the input script asynchronously for the FT UTXO
    for (let i = 0; i < ftutxo_a.length; i++) {
      tx.setInputSequence(i, 4294967294);
      tx.setInputScript(
        {
          inputIndex: i,
        },
        (tx) => {
          const unlockingScript = this.getFTunlock(
            privateKey,
            tx,
            preTX[i],
            prepreTxData[i],
            i,
            ftutxo_a[i].outputIndex,
            isCoin,
          );
          return unlockingScript;
        },
      );
    }
    tx.sign(privateKey);
    tx.setLockTime(lockTimeMax);
    tx.seal();
    // console.log(tx.toObject());
    // console.log(tx.verify());
    const txraw = tx.uncheckedSerialize();
    return txraw;
  }

  /**
   * @deprecated Please use batchTransfer instead.
   * Batch transfers FT from one address to multiple addresses and returns unchecked transaction raw data.
   *
   * @param {tbc.PrivateKey} privateKey_from - The private key used to sign the transaction.
   * @param {Map<string, number | string>} receiveAddressAmount - Map of receiving addresses and amounts.
   * @param {tbc.Transaction.IUnspentOutput[]} ftutxo - List of FT UTXOs used to create the transaction.
   * @param {tbc.Transaction.IUnspentOutput} utxo - Unspent output used to create the transaction.
   * @param {tbc.Transaction[]} preTX - List of previous transactions.
   * @param {string[]} prepreTxData - List of previous transaction data.
   * @returns {Array<{ txraw: string }>} Returns an array containing unchecked transaction raw data.
   */
  batchTransfer_old(
    privateKey_from: tbc.PrivateKey,
    receiveAddressAmount: Map<string, number | string>,
    ftutxo: tbc.Transaction.IUnspentOutput[],
    utxo: tbc.Transaction.IUnspentOutput,
    preTX: tbc.Transaction[],
    prepreTxData: string[],
  ): Array<{ txraw: string }> {
    const privateKey = privateKey_from;
    let txsraw: Array<{ txraw: string }> = [];
    let tx = new tbc.Transaction();
    let ftutxoBalance = 0n;
    for (const utxo of ftutxo) {
      ftutxoBalance += BigInt(utxo.ftBalance!);
      console.log("coinUtxoBalance", ftutxoBalance);
    }
    let i = 0;
    for (const [address_to, amount] of receiveAddressAmount) {
      if (i === 0) {
        tx = this._batchTransfer_old(
          privateKey,
          address_to,
          amount,
          preTX,
          prepreTxData,
          txsraw,
          ftutxoBalance,
          ftutxo,
          utxo,
        );
        let prepretxdata = "";
        for (let j = 0; j < preTX.length; j++) {
          prepretxdata =
            getPrePreTxdata(preTX[j], tx.inputs[j].outputIndex) + prepretxdata;
        }
        prepretxdata = "57" + prepretxdata;
        prepreTxData = [prepretxdata];
      } else {
        tx = this._batchTransfer_old(
          privateKey,
          address_to,
          amount,
          preTX,
          prepreTxData,
          txsraw,
          ftutxoBalance,
        );
        prepreTxData = [
          "57" + getPrePreTxdata(preTX[0], tx.inputs[0].outputIndex),
        ];
      }
      preTX = [tx];
      ftutxoBalance -= parseDecimalToBigInt(amount, this.decimal);
      i++;
      console.log("coinUtxoBalance", ftutxoBalance);
    }
    return txsraw;
  }

  _batchTransfer_old(
    privateKey_from: tbc.PrivateKey,
    address_to: string,
    amount: number | string,
    preTX: tbc.Transaction[],
    prepreTxData: string[],
    txsraw: Array<{ txraw: string }>,
    ftutxoBalance: bigint,
    ftutxo?: tbc.Transaction.IUnspentOutput[],
    utxo?: tbc.Transaction.IUnspentOutput,
  ): tbc.Transaction {
    const privateKey = privateKey_from;
    const address_from = privateKey.toAddress().toString();
    const code = this.codeScript;
    const tape = this.tapeScript;
    const decimal = this.decimal;
    const isCoin = 1;
    const tapeAmountSetIn: bigint[] = [];
    let tapeAmountSum = ftutxoBalance;
    let lockTimeMax = 0;

    if (
      (typeof amount === "string" && parseFloat(amount) < 0) ||
      (typeof amount === "number" && amount < 0)
    ) {
      throw new Error("Invalid amount input");
    }
    const amountbn = parseDecimalToBigInt(amount, decimal);

    if (ftutxo) {
      for (let i = 0; i < ftutxo.length; i++) {
        tapeAmountSetIn.push(ftutxo[i].ftBalance!);
        lockTimeMax = Math.max(
          lockTimeMax,
          stableCoin.getLockTimeFromTape(
            preTX[i].outputs[ftutxo[i].outputIndex + 1].script,
          ),
        );
      }
    } else {
      tapeAmountSetIn.push(tapeAmountSum);
      lockTimeMax = stableCoin.getLockTimeFromTape(preTX[0].outputs[3].script);
    }

    const { amountHex, changeHex } = FT.buildTapeAmount(
      amountbn,
      tapeAmountSetIn,
    );
    const tx = new tbc.Transaction();
    ftutxo ? tx.from(ftutxo) : tx.addInputFromPrevTx(preTX[0], 2);
    utxo ? tx.from(utxo) : tx.addInputFromPrevTx(preTX[0], 4);

    const codeScript = FT.buildFTtransferCode(code, address_to);
    tx.addOutput(
      new tbc.Transaction.Output({
        script: codeScript,
        satoshis: 500,
      }),
    );
    const tapeScript = FT.buildFTtransferTape(tape, amountHex);
    tx.addOutput(
      new tbc.Transaction.Output({
        script: tapeScript,
        satoshis: 0,
      }),
    );

    if (amountbn < tapeAmountSum) {
      const changeCodeScript = FT.buildFTtransferCode(code, address_from);
      tx.addOutput(
        new tbc.Transaction.Output({
          script: changeCodeScript,
          satoshis: 500,
        }),
      );

      const changeTapeScript = FT.buildFTtransferTape(tape, changeHex);
      tx.addOutput(
        new tbc.Transaction.Output({
          script: changeTapeScript,
          satoshis: 0,
        }),
      );
    }
    tx.feePerKb(80);
    tx.change(address_from);

    if (ftutxo) {
      for (let i = 0; i < ftutxo.length; i++) {
        tx.setInputSequence(i, 4294967294);
        tx.setInputScript(
          {
            inputIndex: i,
          },
          (tx) => {
            const unlockingScript = this.getFTunlock(
              privateKey,
              tx,
              preTX[i],
              prepreTxData[i],
              i,
              ftutxo[i].outputIndex,
              isCoin,
            );
            return unlockingScript;
          },
        );
      }
    } else {
      tx.setInputSequence(0, 4294967294);
      tx.setInputScript(
        {
          inputIndex: 0,
        },
        (tx) => {
          const unlockingScript = this.getFTunlock(
            privateKey,
            tx,
            preTX[0],
            prepreTxData[0],
            0,
            2,
            isCoin,
          );
          return unlockingScript;
        },
      );
    }

    tx.sign(privateKey);
    tx.setLockTime(lockTimeMax);
    tx.seal();
    const txraw = tx.uncheckedSerialize();
    txsraw.push({ txraw: txraw });
    return tx;
  }

  /**
   * Batch transfers stableCoin to multiple recipients, with up to 5 recipients per transaction.
   * Creates chained transactions where each tx's FT change feeds into the next.
   * Supports duplicate addresses.
   *
   * @param {tbc.PrivateKey} privateKey_from - The private key used to sign the transaction.
   * @param {Array<{ address: string, amount: number | string }>} receivers - Array of receiving addresses and amounts.
   * @param {tbc.Transaction.IUnspentOutput[]} ftutxo - List of FT UTXOs used to create the transaction.
   * @param {tbc.Transaction.IUnspentOutput} utxo - Unspent output used to create the transaction.
   * @param {tbc.Transaction[]} preTX - List of previous transactions.
   * @param {string[]} prepreTxData - List of previous transaction data.
   * @returns {Array<{ txraw: string }>} Returns an array containing unchecked transaction raw data.
   */
  batchTransfer(
    privateKey_from: tbc.PrivateKey,
    receivers: { address: string, amount: number | string }[],
    ftutxo: tbc.Transaction.IUnspentOutput[],
    utxo: tbc.Transaction.IUnspentOutput,
    preTX: tbc.Transaction[],
    prepreTxData: string[],
  ): Array<{ txraw: string }> {
    const privateKey = privateKey_from;
    const txsraw: Array<{ txraw: string }> = [];
    let ftutxoBalance = 0n;
    for (const u of ftutxo) {
      ftutxoBalance += BigInt(u.ftBalance!);
    }
    // Group receivers into batches of 5
    const batches: { address: string, amount: number | string }[][] = [];
    for (let i = 0; i < receivers.length; i += 5) {
      batches.push(receivers.slice(i, i + 5));
    }
    let tx: tbc.Transaction;
    let prevBatchSize = 0;
    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      if (b === 0) {
        tx = this._batchTransfer(
          privateKey, batch, preTX, prepreTxData, txsraw, ftutxoBalance, ftutxo, utxo,
        );
        let prepretxdata = "";
        for (let j = 0; j < preTX.length; j++) {
          prepretxdata = getPrePreTxdata(preTX[j], tx.inputs[j].outputIndex) + prepretxdata;
        }
        prepretxdata = "57" + prepretxdata;
        prepreTxData = [prepretxdata];
      } else {
        tx = this._batchTransfer(
          privateKey, batch, preTX, prepreTxData, txsraw, ftutxoBalance,
          undefined, undefined, prevBatchSize,
        );
        prepreTxData = ["57" + getPrePreTxdata(preTX[0], tx.inputs[0].outputIndex)];
      }
      preTX = [tx];
      prevBatchSize = batch.length;
      for (const receiver of batch) {
        ftutxoBalance -= parseDecimalToBigInt(receiver.amount, this.decimal);
      }
    }
    return txsraw;
  }

  _batchTransfer(
    privateKey_from: tbc.PrivateKey,
    receivers: { address: string, amount: number | string }[],
    preTX: tbc.Transaction[],
    prepreTxData: string[],
    txsraw: Array<{ txraw: string }>,
    ftutxoBalance: bigint,
    ftutxo?: tbc.Transaction.IUnspentOutput[],
    utxo?: tbc.Transaction.IUnspentOutput,
    prevBatchSize?: number,
  ): tbc.Transaction {
    const privateKey = privateKey_from;
    const address_from = privateKey.toAddress().toString();
    const code = this.codeScript;
    const tape = this.tapeScript;
    const decimal = this.decimal;
    const isCoin = 1;
    const tapeAmountSetIn: bigint[] = [];
    const tapeAmountSum = ftutxoBalance;
    let lockTimeMax = 0;
    // Parse and validate each receiver's amount
    const receiverAmounts: bigint[] = [];
    let totalAmount = BigInt(0);
    for (const receiver of receivers) {
      if (
        (typeof receiver.amount === "string" && parseFloat(receiver.amount) < 0) ||
        (typeof receiver.amount === "number" && receiver.amount < 0)
      ) {
        throw new Error("Invalid amount input");
      }
      const amountbn = parseDecimalToBigInt(receiver.amount, decimal);
      receiverAmounts.push(amountbn);
      totalAmount += amountbn;
    }
    // FT change output index from previous tx (prev tx had prevBatchSize receivers)
    const ftChangeIndex = prevBatchSize! * 2;
    const tbcChangeIndex = prevBatchSize! * 2 + 2;
    if (ftutxo) {
      for (let i = 0; i < ftutxo.length; i++) {
        tapeAmountSetIn.push(ftutxo[i].ftBalance!);
        lockTimeMax = Math.max(
          lockTimeMax,
          stableCoin.getLockTimeFromTape(
            preTX[i].outputs[ftutxo[i].outputIndex + 1].script,
          ),
        );
      }
    } else {
      tapeAmountSetIn.push(tapeAmountSum);
      lockTimeMax = stableCoin.getLockTimeFromTape(preTX[0].outputs[ftChangeIndex + 1].script);
    }
    // Build tape hex for each receiver and change
    const tapeHexes = FT.buildMultiTapeAmounts(receiverAmounts, tapeAmountSetIn);
    // Construct the transaction
    const tx = new tbc.Transaction();
    ftutxo ? tx.from(ftutxo) : tx.addInputFromPrevTx(preTX[0], ftChangeIndex);
    utxo ? tx.from(utxo) : tx.addInputFromPrevTx(preTX[0], tbcChangeIndex);
    // Add outputs for each receiver (code + tape pair)
    for (let i = 0; i < receivers.length; i++) {
      const codeScript = FT.buildFTtransferCode(code, receivers[i].address);
      tx.addOutput(new tbc.Transaction.Output({
        script: codeScript,
        satoshis: 500,
      }));
      const tapeScript = FT.buildFTtransferTape(tape, tapeHexes[i]);
      tx.addOutput(new tbc.Transaction.Output({
        script: tapeScript,
        satoshis: 0,
      }));
    }
    // Add FT change output if there's remaining balance
    if (totalAmount < tapeAmountSum) {
      const changeCodeScript = FT.buildFTtransferCode(code, address_from);
      tx.addOutput(new tbc.Transaction.Output({
        script: changeCodeScript,
        satoshis: 500,
      }));
      const changeTapeScript = FT.buildFTtransferTape(tape, tapeHexes[receivers.length]);
      tx.addOutput(new tbc.Transaction.Output({
        script: changeTapeScript,
        satoshis: 0,
      }));
    }
    tx.feePerKb(80);
    tx.change(address_from);
    // Set unlock scripts
    if (ftutxo) {
      for (let i = 0; i < ftutxo.length; i++) {
        tx.setInputSequence(i, 4294967294);
        tx.setInputScript({ inputIndex: i }, (tx) => {
          return this.getFTunlock(
            privateKey, tx, preTX[i], prepreTxData[i], i, ftutxo[i].outputIndex, isCoin,
          );
        });
      }
    } else {
      tx.setInputSequence(0, 4294967294);
      tx.setInputScript({ inputIndex: 0 }, (tx) => {
        return this.getFTunlock(
          privateKey, tx, preTX[0], prepreTxData[0], 0, ftChangeIndex, isCoin,
        );
      });
    }
    tx.sign(privateKey);
    tx.setLockTime(lockTimeMax);
    tx.seal();
    const txraw = tx.uncheckedSerialize();
    txsraw.push({ txraw: txraw });
    return tx;
  }

  mergeCoin(
    privateKey_from: tbc.PrivateKey,
    ftutxo: tbc.Transaction.IUnspentOutput[],
    utxo: tbc.Transaction.IUnspentOutput,
    preTX: tbc.Transaction[],
    prepreTxData: string[],
    localTX: tbc.Transaction[],
  ): Array<{ txraw: string }> {
    const privateKey = privateKey_from;
    const preTxCopy = preTX;
    let ftutxos = ftutxo.slice(0, 5);
    let preTXs = preTX.slice(0, 5);
    let prepreTxDatas = prepreTxData.slice(0, 5);
    let txsraw: Array<{ txraw: string }> = [];
    let tx = new tbc.Transaction();

    for (let i = 0; ftutxos.length > 1; i++) {
      if (i === 0) {
        tx = this._mergeCoin(
          privateKey,
          ftutxos,
          preTXs,
          prepreTxDatas,
          txsraw,
          utxo,
        );
      } else {
        tx = this._mergeCoin(
          privateKey,
          ftutxos,
          preTXs,
          prepreTxDatas,
          txsraw,
        );
      }
      let index = (i + 1) * 5;
      preTXs = preTX.slice(index, index + 5);
      preTXs.push(tx);
      prepreTxDatas = prepreTxData.slice(index, index + 5);
      ftutxos = ftutxo.slice(index, index + 5);
    }

    if (txsraw.length <= 1 && ftutxos.length < 1) return txsraw;

    const utxoTX = preTXs.pop();
    const nonEmpty = preTXs.length;
    const newutxo = buildUTXO(utxoTX!, 2, false);
    for (const txraw of txsraw) {
      const tx = new tbc.Transaction(txraw.txraw);
      preTXs.push(tx);
      ftutxos.push(buildUTXO(tx, 0, true));
    }
    if (localTX.length === 0) {
      localTX = preTxCopy;
    }

    for (let i = nonEmpty; i < preTXs.length; i++) {
      prepreTxDatas.push(buildFtPrePreTxData(preTXs[i], 0, localTX));
    }
    localTX = preTXs;
    const txs = this.mergeFT(
      privateKey,
      ftutxos,
      newutxo,
      preTXs,
      prepreTxDatas,
      localTX,
    );
    txsraw = txsraw.concat(txs ?? []);
    return txsraw;
  }

  _mergeCoin(
    privateKey_from: tbc.PrivateKey,
    ftutxo: tbc.Transaction.IUnspentOutput[],
    preTX: tbc.Transaction[],
    prepreTxData: string[],
    txsraw: Array<{ txraw: string }>,
    utxo?: tbc.Transaction.IUnspentOutput,
  ): tbc.Transaction {
    const privateKey = privateKey_from;
    const address = privateKey.toAddress().toString();
    const isCoin = 1;
    const ftutxos = ftutxo;
    if (ftutxos.length === 0) {
      throw new Error("No FT UTXO available");
    } else if (ftutxos.length === 1) {
      return null as any;
    }
    const tapeAmountSetIn: bigint[] = [];
    let tapeAmountSum = BigInt(0);
    let lockTimeMax = 0;
    for (let i = 0; i < ftutxos.length; i++) {
      tapeAmountSetIn.push(ftutxos[i].ftBalance!);
      tapeAmountSum += BigInt(ftutxos[i].ftBalance!);
      lockTimeMax = Math.max(
        lockTimeMax,
        stableCoin.getLockTimeFromTape(
          preTX[i].outputs[ftutxos[i].outputIndex + 1].script,
        ),
      );
    }
    const { amountHex, changeHex } = FT.buildTapeAmount(
      tapeAmountSum,
      tapeAmountSetIn,
    );
    if (
      changeHex !=
      "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
    ) {
      throw new Error("Change amount is not zero");
    }
    const tx = new tbc.Transaction().from(ftutxos);
    utxo ? tx.from(utxo) : tx.addInputFromPrevTx(preTX[preTX.length - 1], 2);
    const codeScript = FT.buildFTtransferCode(this.codeScript, address);
    tx.addOutput(
      new tbc.Transaction.Output({
        script: codeScript,
        satoshis: 500,
      }),
    );
    const tapeScript = FT.buildFTtransferTape(this.tapeScript, amountHex);
    tx.addOutput(
      new tbc.Transaction.Output({
        script: tapeScript,
        satoshis: 0,
      }),
    );
    tx.feePerKb(80);
    tx.change(privateKey.toAddress());
    for (let i = 0; i < ftutxos.length && i < 5; i++) {
      tx.setInputSequence(i, 4294967294);
      tx.setInputScript(
        {
          inputIndex: i,
        },
        (tx) => {
          const unlockingScript = this.getFTunlock(
            privateKey,
            tx,
            preTX[i],
            prepreTxData[i],
            i,
            ftutxos[i].outputIndex,
            isCoin,
          );
          return unlockingScript;
        },
      );
    }
    tx.sign(privateKey);
    tx.setLockTime(lockTimeMax);
    tx.seal();
    const txraw = tx.uncheckedSerialize();
    txsraw.push({ txraw: txraw });
    return tx;
  }

  /**
   * Freezes a set of stableCoin FT UTXOs under a lockTime. Admin inputs
   * (the FT UTXOs) are gated by Schnorr MuSig2 and must be signed externally
   * via the returned sighashes. The fee input is ECDSA-signed by
   * `feePrivateKey` inside `finalize`.
   *
   * @param aggPubkey32 - 32-byte x-only MuSig2 aggregate admin pubkey.
   * @param feePrivateKey - ECDSA key funding the tx and signing the fee input.
   */
  freezeCoinUTXO(
    aggPubkey32: Buffer,
    feePrivateKey: tbc.PrivateKey,
    lock_time: number,
    ftutxo: tbc.Transaction.IUnspentOutput[],
    utxo: tbc.Transaction.IUnspentOutput,
    preTX: tbc.Transaction[],
    prepreTxData: string[],
  ): AdminPrepared<string> {
    if (!Buffer.isBuffer(aggPubkey32) || aggPubkey32.length !== 32) {
      throw new Error("aggPubkey32 must be 32 bytes (x-only)");
    }
    const controlData = stableCoin.getAddressFromCode(ftutxo[0].script);
    const address =
      controlData.type === "address"
        ? tbc.Address.fromHex("00" + controlData.address).toString()
        : controlData.address;
    const isCoin = true;
    const ftutxos = ftutxo;
    if (ftutxos.length === 0) {
      throw new Error("No FT UTXO available");
    }
    if (ftutxos.length > 5) {
      throw new Error("Too many FT UTXOs (max 5)");
    }
    const tapeAmountSetIn: bigint[] = [];
    let tapeAmountSum = BigInt(0);
    let lockTimeMax = 0;
    for (let i = 0; i < ftutxo.length; i++) {
      tapeAmountSetIn.push(ftutxo[i].ftBalance!);
      tapeAmountSum += BigInt(tapeAmountSetIn[i]);
      lockTimeMax = Math.max(
        lockTimeMax,
        stableCoin.getLockTimeFromTape(
          preTX[i].outputs[ftutxo[i].outputIndex + 1].script,
        ),
      );
    }
    const { amountHex, changeHex } = FT.buildTapeAmount(
      tapeAmountSum,
      tapeAmountSetIn,
    );
    if (
      changeHex !=
      "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
    ) {
      throw new Error("Change amount is not zero");
    }
    const tx = new tbc.Transaction();
    tx.from(ftutxos).from(utxo);
    const codeScript = FT.buildFTtransferCode(this.codeScript, address);
    tx.addOutput(
      new tbc.Transaction.Output({
        script: codeScript,
        satoshis: 500,
      }),
    );
    const tapeScript = stableCoin.setLockTimeInTape(
      FT.buildFTtransferTape(this.tapeScript, amountHex),
      lock_time,
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: tapeScript,
        satoshis: 0,
      }),
    );
    tx.feePerKb(80);
    tx.change(feePrivateKey.toAddress());
    for (let i = 0; i < ftutxos.length; i++) {
      tx.setInputSequence(i, 4294967294);
    }
    tx.setLockTime(lockTimeMax);

    const xOnlyHex = aggPubkey32.toString("hex");
    const adminBuilders = ftutxos.map((_, i) => ({
      inputIndex: i,
      buildWithSig: (sig64: Buffer, t: tbc.Transaction) =>
        FT.getFTunlock(
          encodeSchnorrSig65Hex(sig64),
          xOnlyHex,
          t,
          preTX[i],
          prepreTxData[i],
          i,
          ftutxos[i].outputIndex,
          isCoin,
        ),
    }));
    preseedAdminInputsAndFreezeFee(tx, feePrivateKey, adminBuilders);

    const sighashes: AdminSighash[] = [];
    for (let i = 0; i < ftutxos.length; i++) {
      sighashes.push({ inputIndex: i, sighash: computeInputSighash(tx, i) });
    }

    const finalize = (schnorrSigs64: Buffer[]): string => {
      if (!Array.isArray(schnorrSigs64) || schnorrSigs64.length !== ftutxos.length) {
        throw new Error(
          `freezeCoinUTXO.finalize: expected ${ftutxos.length} Schnorr sigs, got ${schnorrSigs64?.length}`,
        );
      }
      for (let i = 0; i < ftutxos.length; i++) {
        const sig65Hex = encodeSchnorrSig65Hex(schnorrSigs64[i]);
        const idx = i;
        tx.setInputScript({ inputIndex: idx }, (t: tbc.Transaction) =>
          FT.getFTunlock(
            sig65Hex,
            xOnlyHex,
            t,
            preTX[idx],
            prepreTxData[idx],
            idx,
            ftutxos[idx].outputIndex,
            isCoin,
          ),
        );
      }
      tx.seal();
      return tx.uncheckedSerialize();
    };

    return { tx, sighashes, finalize };
  }

  /**
   * Unfreezes a set of frozen stableCoin FT UTXOs. Admin inputs
   * (the FT UTXOs) are gated by Schnorr MuSig2 and must be signed externally
   * via the returned sighashes. The fee input is ECDSA-signed by
   * `feePrivateKey` inside `finalize`.
   *
   * @param aggPubkey32 - 32-byte x-only MuSig2 aggregate admin pubkey.
   * @param feePrivateKey - ECDSA key funding the tx and signing the fee input.
   */
  unfreezeCoinUTXO(
    aggPubkey32: Buffer,
    feePrivateKey: tbc.PrivateKey,
    ftutxo: tbc.Transaction.IUnspentOutput[],
    utxo: tbc.Transaction.IUnspentOutput,
    preTX: tbc.Transaction[],
    prepreTxData: string[],
  ): AdminPrepared<string> {
    if (!Buffer.isBuffer(aggPubkey32) || aggPubkey32.length !== 32) {
      throw new Error("aggPubkey32 must be 32 bytes (x-only)");
    }
    const controlData = stableCoin.getAddressFromCode(ftutxo[0].script);
    const address =
      controlData.type === "address"
        ? tbc.Address.fromHex("00" + controlData.address).toString()
        : controlData.address;
    const isCoin = true;
    const ftutxos = ftutxo;
    if (ftutxos.length === 0) {
      throw new Error("No FT UTXO available");
    }
    if (ftutxos.length > 5) {
      throw new Error("Too many FT UTXOs (max 5)");
    }
    const tapeAmountSetIn: bigint[] = [];
    let tapeAmountSum = BigInt(0);
    for (let i = 0; i < ftutxo.length; i++) {
      tapeAmountSetIn.push(ftutxo[i].ftBalance!);
      tapeAmountSum += BigInt(tapeAmountSetIn[i]);
    }
    const { amountHex, changeHex } = FT.buildTapeAmount(
      tapeAmountSum,
      tapeAmountSetIn,
    );
    if (
      changeHex !=
      "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
    ) {
      throw new Error("Change amount is not zero");
    }
    const tx = new tbc.Transaction();
    tx.from(ftutxos).from(utxo);
    const codeScript = FT.buildFTtransferCode(this.codeScript, address);
    tx.addOutput(
      new tbc.Transaction.Output({
        script: codeScript,
        satoshis: 500,
      }),
    );
    const tapeScript = stableCoin.setLockTimeInTape(
      FT.buildFTtransferTape(this.tapeScript, amountHex),
      0,
    );
    tx.addOutput(
      new tbc.Transaction.Output({
        script: tapeScript,
        satoshis: 0,
      }),
    );
    tx.feePerKb(80);
    tx.change(feePrivateKey.toAddress());
    for (let i = 0; i < ftutxos.length; i++) {
      tx.setInputSequence(i, 4294967294);
    }
    tx.setLockTime(0);

    const xOnlyHex = aggPubkey32.toString("hex");
    const adminBuilders = ftutxos.map((_, i) => ({
      inputIndex: i,
      buildWithSig: (sig64: Buffer, t: tbc.Transaction) =>
        FT.getFTunlock(
          encodeSchnorrSig65Hex(sig64),
          xOnlyHex,
          t,
          preTX[i],
          prepreTxData[i],
          i,
          ftutxos[i].outputIndex,
          isCoin,
        ),
    }));
    preseedAdminInputsAndFreezeFee(tx, feePrivateKey, adminBuilders);

    const sighashes: AdminSighash[] = [];
    for (let i = 0; i < ftutxos.length; i++) {
      sighashes.push({ inputIndex: i, sighash: computeInputSighash(tx, i) });
    }

    const finalize = (schnorrSigs64: Buffer[]): string => {
      if (!Array.isArray(schnorrSigs64) || schnorrSigs64.length !== ftutxos.length) {
        throw new Error(
          `unfreezeCoinUTXO.finalize: expected ${ftutxos.length} Schnorr sigs, got ${schnorrSigs64?.length}`,
        );
      }
      for (let i = 0; i < ftutxos.length; i++) {
        const sig65Hex = encodeSchnorrSig65Hex(schnorrSigs64[i]);
        const idx = i;
        tx.setInputScript({ inputIndex: idx }, (t: tbc.Transaction) =>
          FT.getFTunlock(
            sig65Hex,
            xOnlyHex,
            t,
            preTX[idx],
            prepreTxData[idx],
            idx,
            ftutxos[idx].outputIndex,
            isCoin,
          ),
        );
      }
      tx.seal();
      return tx.uncheckedSerialize();
    };

    return { tx, sighashes, finalize };
  }

  /**
   * @deprecated This method has been deprecated
   */
  transferContract(
    privateKey_from: tbc.PrivateKey,
    address_to: string,
    ft_amount: number | string,
    ftutxo_a: tbc.Transaction.IUnspentOutput[],
    utxo: tbc.Transaction.IUnspentOutput,
    utxoTX: tbc.Transaction,
    preTX: tbc.Transaction[],
    prepreTxData: string[],
    tbc_amount?: number | string,
  ): string {
    const privateKey = privateKey_from;
    const address_from = privateKey.toAddress().toString();
    const code = this.codeScript;
    const tape = this.tapeScript;
    const decimal = this.decimal;
    const isCoin = 1;
    const tapeAmountSetIn: bigint[] = [];
    if (
      (typeof ft_amount === "string" && parseFloat(ft_amount) < 0) ||
      (typeof ft_amount === "number" && ft_amount < 0)
    ) {
      throw new Error("Invalid amount input");
    }
    const amountbn = parseDecimalToBigInt(ft_amount, decimal);
    // Calculate the total available balance
    let tapeAmountSum = BigInt(0);
    let lockTimeMax = 0;
    for (let i = 0; i < ftutxo_a.length; i++) {
      tapeAmountSetIn.push(ftutxo_a[i].ftBalance!);
      tapeAmountSum += BigInt(tapeAmountSetIn[i]);
      lockTimeMax = Math.max(
        lockTimeMax,
        stableCoin.getLockTimeFromTape(
          preTX[i].outputs[ftutxo_a[i].outputIndex + 1].script,
        ),
      );
    }
    // Check if the balance is sufficient
    if (amountbn > tapeAmountSum) {
      throw new Error("Insufficient balance, please add more FT UTXOs");
    }
    // Validate the decimal and amount
    if (decimal > 18) {
      throw new Error("The maximum value for decimal cannot exceed 18");
    }
    const maxAmount = parseDecimalToBigInt(1, 18 - decimal);
    if (Number(ft_amount) > Number(maxAmount)) {
      throw new Error(
        `When decimal is ${decimal}, the maximum amount cannot exceed ${maxAmount}`,
      );
    }
    // Build the amount and change hex strings for the tape
    const { amountHex, changeHex } = FT.buildTapeAmount(
      amountbn,
      tapeAmountSetIn,
      1
    );
    // Construct the transaction
    const tx = new tbc.Transaction().from(utxo).from(ftutxo_a);

    // Build the code script for the recipient
    const codeScript = FT.buildFTtransferCode(code, address_to);
    tx.addOutput(
      new tbc.Transaction.Output({
        script: codeScript,
        satoshis: 500,
      }),
    );
    // Build the tape script for the amount
    const tapeScript = FT.buildFTtransferTape(tape, amountHex);
    tx.addOutput(
      new tbc.Transaction.Output({
        script: tapeScript,
        satoshis: 0,
      }),
    );
    if (tbc_amount) {
      const amount_satoshis = Number(parseDecimalToBigInt(tbc_amount, 6));
      tx.to(address_to, amount_satoshis);
    }
    // If there's change, add outputs for the change
    if (amountbn < tapeAmountSum) {
      const changeCodeScript = FT.buildFTtransferCode(code, address_from);
      tx.addOutput(
        new tbc.Transaction.Output({
          script: changeCodeScript,
          satoshis: 500,
        }),
      );

      const changeTapeScript = FT.buildFTtransferTape(tape, changeHex);
      tx.addOutput(
        new tbc.Transaction.Output({
          script: changeTapeScript,
          satoshis: 0,
        }),
      );
    }
    tx.feePerKb(80);
    tx.change(address_from);
    // Set the input script asynchronously for the FT UTXO
    for (let i = 0; i < ftutxo_a.length; i++) {
      tx.setInputSequence(i + 1, 4294967294);
      tx.setInputScript(
        {
          inputIndex: i + 1,
        },
        (tx) => {
          const unlockingScript = this.getFTunlockSwap(
            privateKey,
            tx,
            preTX[i],
            prepreTxData[i],
            utxoTX,
            i + 1,
            ftutxo_a[i].outputIndex,
            2,
            isCoin,
          );
          return unlockingScript;
        },
      );
    }
    tx.sign(privateKey);
    tx.setLockTime(lockTimeMax);
    tx.seal();
    // console.log(tx.toObject());
    // console.log(tx.verify());
    const txraw = tx.uncheckedSerialize();
    return txraw;
  }
  
  static buildCoinNftOutput(
    nftCodeScript: tbc.Script,
    nftHoldScript: tbc.Script,
    nftTapeScript: tbc.Script,
  ): tbc.Transaction.Output[] {
    return [
      new tbc.Transaction.Output({
        script: nftCodeScript,
        satoshis: 200,
      }),
      new tbc.Transaction.Output({
        script: nftHoldScript,
        satoshis: 100,
      }),
      new tbc.Transaction.Output({
        script: nftTapeScript,
        satoshis: 0,
      }),
    ];
  }

  /**
   * Build the coinNft creation transaction.
   * Funded and ECDSA-signed by `feePrivateKey`. The hold-script output is
   * sent to HASH160(adminPubHashHex) so that the later mint tx can be
   * unlocked by the Schnorr MuSig aggregate key.
   */
  static buildCoinNftTX(
    feePrivateKey: tbc.PrivateKey,
    adminPubHashHex: string,
    utxo: tbc.Transaction.IUnspentOutput,
    data: coinNftData,
  ): tbc.Transaction {
    const feeAddress = feePrivateKey.toAddress().toString();
    const nftCodeScript = coinNft.getCoinNftCode(utxo.txId, utxo.outputIndex);
    const nftHoldScript = coinNft.getHoldScriptFromHash(
      adminPubHashHex,
      data.nftName,
    );
    const nftTapeScript = coinNft.getTapeScript(data);
    const outputs = stableCoin.buildCoinNftOutput(
      nftCodeScript,
      nftHoldScript,
      nftTapeScript,
    );
    const tx = new tbc.Transaction()
      .from(utxo)
      .addOutput(outputs[0])
      .addOutput(outputs[1])
      .addOutput(outputs[2])
      .change(feeAddress);
    const txSize = tx.getEstimateSize();
    if (txSize < 1000) {
      tx.fee(80);
    } else {
      tx.feePerKb(80);
    }
    tx.sign(feePrivateKey).seal();
    return tx;
  }

  /**
   * Build the FT mint code script for stableCoin.
   * @param adminPubHashHex - HASH160 of the admin identity (20 bytes as hex).
   *   For Schnorr MuSig admin: HASH160(xOnly aggregate pubkey 32 bytes).
   * @param receiveAddress - Initial recipient address for the mint.
   * @param codeHash - sha256 of the coinNft code script (32 bytes as hex).
   * @param tapeSize - Length of the tape script in bytes.
   */
  static getCoinMintCode(
    adminPubHashHex: string,
    receiveAddress: string,
    codeHash: string,
    tapeSize: number,
  ): tbc.Script {
    const adminPubHash = adminPubHashHex;
    const publicKeyHash =
      tbc.Address.fromString(receiveAddress).hashBuffer.toString("hex");
    const hash = publicKeyHash + "00";
    const tapeSizeHex = getSize(tapeSize).toString("hex");

    // The codeScript is constructed with specific opcodes and parameters for FT minting
    const codeScript = new tbc.Script(
      `OP_9 OP_PICK OP_TOALTSTACK OP_1 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_5 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_4 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_3 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_2 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_1 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_0 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_DUP OP_SIZE OP_10 OP_SUB OP_SPLIT OP_NIP OP_4 OP_SPLIT OP_DROP OP_BIN2NUM OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_SIZE 0x01 0x28 OP_DIV OP_FROMALTSTACK OP_FROMALTSTACK OP_ROT OP_TOALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_TOALTSTACK OP_SHA256 OP_FROMALTSTACK OP_CAT OP_CAT OP_HASH256 OP_6 OP_PUSH_META 0x01 0x20 OP_SPLIT OP_4 OP_SPLIT OP_BIN2NUM 0x04 0xffffffff OP_BIN2NUM OP_NUMNOTEQUAL OP_1 OP_EQUALVERIFY OP_BIN2NUM OP_FROMALTSTACK OP_EQUALVERIFY OP_EQUALVERIFY OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_DUP OP_HASH160 OP_FROMALTSTACK OP_EQUAL OP_NOTIF OP_DUP OP_HASH160 0x14 0x${adminPubHash} OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_2 OP_PUSH_META OP_BIN2NUM OP_LESSTHANOREQUAL OP_VERIFY OP_TOALTSTACK OP_ENDIF OP_CHECKSIGVERIFY OP_ELSE OP_1 OP_EQUALVERIFY OP_FROMALTSTACK 0x01 0x22 OP_PICK 0x01 0x24 OP_SPLIT OP_DROP 0x01 0x20 OP_SPLIT OP_NIP OP_BIN2NUM OP_2 OP_MUL OP_NEGATE 0x01 0x1e OP_ADD OP_1 OP_SUB OP_PICK OP_HASH160 OP_EQUALVERIFY OP_0 OP_TOALTSTACK OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_2DROP OP_ELSE OP_SIZE 0x01 0x20 OP_EQUALVERIFY OP_OVER OP_SIZE OP_8 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_OVER 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_2 OP_PUSH_META OP_BIN2NUM OP_LESSTHANOREQUAL OP_VERIFY OP_TOALTSTACK OP_CHECKSIGVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_ELSE OP_TOALTSTACK OP_PARTIAL_HASH OP_DUP 0x20 0x${codeHash} OP_EQUALVERIFY OP_ENDIF OP_CAT OP_TOALTSTACK OP_SIZE 0x01 0x28 OP_DIV OP_FROMALTSTACK OP_FROMALTSTACK OP_ROT OP_TOALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_BIN2NUM OP_ROT OP_EQUALVERIFY OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_SIZE 0x01 0x28 OP_DIV OP_FROMALTSTACK OP_FROMALTSTACK OP_ROT OP_TOALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_BIN2NUM OP_ROT OP_EQUALVERIFY OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_SIZE 0x01 0x28 OP_DIV OP_FROMALTSTACK OP_FROMALTSTACK OP_ROT OP_TOALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_BIN2NUM OP_ROT OP_EQUALVERIFY OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_SIZE 0x01 0x28 OP_DIV OP_FROMALTSTACK OP_FROMALTSTACK OP_ROT OP_TOALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_BIN2NUM OP_ROT OP_EQUALVERIFY OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_SIZE 0x01 0x28 OP_DIV OP_FROMALTSTACK OP_FROMALTSTACK OP_ROT OP_TOALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_BIN2NUM OP_ROT OP_EQUALVERIFY OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_SIZE 0x01 0x28 OP_DIV OP_FROMALTSTACK OP_FROMALTSTACK OP_ROT OP_TOALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_BIN2NUM OP_ROT OP_EQUALVERIFY OP_EQUALVERIFY OP_ENDIF OP_7 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_0 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_SHA256 OP_7 OP_PUSH_META OP_EQUAL OP_NIP 0x36 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff OP_DROP OP_RETURN 0x15 0x${hash} 0x05 0x32436f6465`,
    );
    return codeScript;
  }

  static setLockTimeInTape(
    tapeScript: tbc.Script,
    lockTime: number,
  ): tbc.Script {
    if (lockTime !== 0 && lockTime < 500000000) {
      throw new Error("lockTime must be a Unix timestamp (>= 500000000)");
    } else if (lockTime > 4294967295) {
      throw new Error("lockTime exceeds the maximum value of 4294967295");
    }
    const lockTimeWriter = new tbc.encoding.BufferWriter();
    lockTimeWriter.writeUInt32LE(lockTime);
    const lockTimeHex = lockTimeWriter.toBuffer();
    tapeScript.chunks[tapeScript.chunks.length - 2].buf = lockTimeHex;
    const script = tapeScript.toASM();
    return tbc.Script.fromASM(script);
  }

  static getLockTimeFromTape(tapeScript: tbc.Script): number {
    const lockTimeChunk = tapeScript.chunks[tapeScript.chunks.length - 2].buf;
    const lockTimeReader = new tbc.encoding.BufferReader(lockTimeChunk);
    const lockTime = lockTimeReader.readUInt32LE();
    return lockTime;
  }

  static getAddressFromCode(codeScript: string): {
    address: string;
    type: "address" | "contract";
  } {
    const script = tbc.Script.fromHex(codeScript);
    const addressChunk =
      script.chunks[script.chunks.length - 2].buf.toString("hex");
    const address = addressChunk.slice(0, 40);
    const type = addressChunk.slice(40, 42) === "00" ? "address" : "contract";
    return { address, type };
  }

  /**
   * @deprecated This method has been deprecated
   * Creates a P2PKH script with OP_RETURN data.
   * @param address - The address string.
   * @param flag - The flag string to include in OP_RETURN.
   * @returns The combined P2PKH and OP_RETURN script.
   */
  static buildP2PKHWithCoinFlag(address: string, flag: string): tbc.Script {
    const publicKeyHash =
      tbc.Address.fromString(address).hashBuffer.toString("hex");
    const flagHex = Buffer.from(`for stable coin ${flag}`, "utf8").toString(
      "hex",
    );
    return tbc.Script.fromASM(
      `OP_DUP OP_HASH160 ${publicKeyHash} OP_EQUALVERIFY OP_CHECKSIG OP_RETURN ${flagHex}`,
    );
  }

  /**
   * @deprecated This method has been deprecated
   */
  static buildAdminP2PKHTX(
    privateKey_admin: tbc.PrivateKey,
    flag: string,
    utxo: tbc.Transaction.IUnspentOutput,
  ): tbc.Transaction {
    const address = privateKey_admin.toAddress().toString();
    const script = stableCoin.buildP2PKHWithCoinFlag(address, flag);
    const tx = new tbc.Transaction()
      .from(utxo)
      .addOutput(
        new tbc.Transaction.Output({
          script: script,
          satoshis: 3000,
        }),
      )
      .fee(80)
      .change(address);
    tx.sign(privateKey_admin).seal();
    return tx;
  }
}

class coinNft extends NFT {
  static getCoinNftCode(tx_hash: string, outputIndex: number): tbc.Script {
    const tx_id = Buffer.from(tx_hash, "hex").reverse().toString("hex");
    const writer = new tbc.encoding.BufferWriter();
    const vout = writer.writeUInt32LE(outputIndex).toBuffer().toString("hex");
    const tx_id_vout = "0x" + tx_id + vout;
    const code = new tbc.Script(
      "OP_1 OP_PICK OP_3 OP_SPLIT 0x01 0x14 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_OVER OP_TOALTSTACK OP_TOALTSTACK OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_OVER 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_HASH256 OP_6 OP_PUSH_META 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_OVER OP_TOALTSTACK OP_TOALTSTACK OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_SWAP OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUAL OP_IF OP_DROP OP_ELSE 0x24 " +
        tx_id_vout +
        " OP_EQUALVERIFY OP_ENDIF OP_OVER OP_FROMALTSTACK OP_EQUALVERIFY OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_DUP OP_HASH160 OP_FROMALTSTACK OP_EQUALVERIFY OP_CHECKSIG OP_RETURN 0x05 0x33436f6465",
    );
    return code;
  }

  static getHoldScript(address: string, flag: string): tbc.Script {
    const preScript = tbc.Script.buildPublicKeyHashOut(address);
    const flagHex = Buffer.from(`For Coin ${flag} NHold`, "utf8").toString(
      "hex",
    );
    const script = tbc.Script.fromASM(
      `${preScript.toASM()} OP_RETURN ${flagHex}`,
    );
    return script;
  }

  /**
   * Hold script variant that takes a raw 20-byte pubkey hash (hex).
   * Used when the admin identity is a Schnorr MuSig aggregate key rather than
   * a conventional address.
   */
  static getHoldScriptFromHash(pubKeyHashHex: string, flag: string): tbc.Script {
    if (!/^[0-9a-fA-F]{40}$/.test(pubKeyHashHex)) {
      throw new Error("pubKeyHashHex must be 20 bytes (40 hex chars)");
    }
    const flagHex = Buffer.from(`For Coin ${flag} NHold`, "utf8").toString(
      "hex",
    );
    return tbc.Script.fromASM(
      `OP_DUP OP_HASH160 ${pubKeyHashHex} OP_EQUALVERIFY OP_CHECKSIG OP_RETURN ${flagHex}`,
    );
  }

  /**
   * Schnorr-flavored variant of NFT.buildUnlockScript.
   * Produces the unlock script for an input spending an nft code output when
   * the authorizing signature is a BIP340 Schnorr signature over the SIGHASH
   * digest. The on-chain OP_CHECKSIG dispatches on sig length (64 → Schnorr)
   * and pubkey length (32 → x-only), so HASH160(xOnlyPubkey32) is what must
   * match the embedded admin pubkey hash.
   *
   * @param schnorrSig64 - 64-byte BIP340 signature
   * @param xOnlyPubkey32 - 32-byte x-only aggregate pubkey
   */
  static buildUnlockScriptSchnorr(
    schnorrSig64: Buffer,
    xOnlyPubkey32: Buffer,
    currentTX: tbc.Transaction,
    preTX: tbc.Transaction,
    prepreTxData: tbc.Transaction,
    currentUnlockIndex: number,
  ): tbc.Script {
    if (!Buffer.isBuffer(xOnlyPubkey32) || xOnlyPubkey32.length !== 32) {
      throw new Error("xOnlyPubkey32 must be 32 bytes");
    }
    const currenttxdata = nftGetCurrentTxdata(currentTX);
    const prepretxdata = nftGetPrePreTxdata(prepreTxData);
    const pretxdata = nftGetPreTxdata(preTX);
    const sig65Hex = encodeSchnorrSig65Hex(schnorrSig64);
    // length-prefixed push (65 bytes → 0x41, 32 bytes → 0x20)
    const sig = "41" + sig65Hex;
    const publicKey = "20" + xOnlyPubkey32.toString("hex");
    return new tbc.Script(
      sig + publicKey + currenttxdata + prepretxdata + pretxdata,
    );
  }

  static getTapeScript(data: coinNftData): tbc.Script {
    const dataHex = Buffer.from(JSON.stringify(data)).toString("hex");
    const tape = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${dataHex} 4e54617065`);
    return tape;
  }

  static updateTapeScript(
    tapeScript: tbc.Script,
    newTotalSupply: string,
  ): tbc.Script {
    const data =
      tapeScript.chunks[tapeScript.chunks.length - 2].buf.toString("utf8");
    const jsonData = JSON.parse(data);
    jsonData.coinTotalSupply = newTotalSupply;
    const dataHex = Buffer.from(JSON.stringify(jsonData)).toString("hex");
    const script = tbc.Script.fromASM(
      `OP_FALSE OP_RETURN ${dataHex} 4e54617065`,
    );
    return script;
  }

  static decodeTapeScript(
    tapeScript: tbc.Script
  ): any {
    const data =
      tapeScript.chunks[tapeScript.chunks.length - 2].buf.toString("utf8");
    const jsonData = JSON.parse(data);
    return jsonData;
  }
}

interface coinNftData {
  nftName: string;
  nftSymbol: string;
  description: string;
  coinDecimal: number;
  coinTotalSupply: string;
}

module.exports = stableCoin;
