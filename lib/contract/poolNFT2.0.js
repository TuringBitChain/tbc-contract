"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const tbc = __importStar(require("tbc-lib-js"));
const poolnftunlock_1 = require("../util/poolnftunlock");
const util_1 = require("../util/util");
const API = require("../api/api");
const FT = require("./ft");
const partial_sha256 = require("tbc-lib-js/lib/util/partial-sha256");
const BN = tbc.crypto.BN;
class poolNFT2 {
    ft_lp_amount;
    ft_a_amount;
    tbc_amount;
    ft_lp_partialhash;
    ft_a_partialhash;
    ft_a_contractTxid;
    poolnft_code;
    pool_version;
    contractTxid;
    network;
    service_fee_rate;
    service_provider;
    lp_plan;
    with_lock;
    with_lock_time;
    tbc_amount_full;
    ft_a_number;
    poolnft_code_dust = 1000;
    precision = BigInt(1000000);
    constructor(config) {
        this.ft_lp_amount = BigInt(0);
        this.ft_a_amount = BigInt(0);
        this.tbc_amount = BigInt(0);
        this.ft_a_number = 0;
        this.service_fee_rate = 25; //万分之25
        this.service_provider = "";
        this.ft_a_contractTxid = "";
        this.ft_lp_partialhash = "";
        this.ft_a_partialhash = "";
        this.poolnft_code = "";
        this.pool_version = 2;
        this.contractTxid = config?.txid ?? "";
        this.network = config?.network ?? "mainnet";
    }
    async initCreate(ftContractTxid) {
        if (!/^[0-9a-fA-F]{64}$/.test(ftContractTxid)) {
            throw new Error("Invalid Input: ftContractTxid must be a 32-byte hash value.");
        }
        else {
            this.ft_a_contractTxid = ftContractTxid;
        }
    }
    async initfromContractId() {
        const poolNFTInfo = await this.fetchPoolNftInfo(this.contractTxid);
        this.ft_lp_amount = poolNFTInfo.ft_lp_amount;
        this.ft_a_amount = poolNFTInfo.ft_a_amount;
        this.tbc_amount = poolNFTInfo.tbc_amount;
        this.ft_lp_partialhash = poolNFTInfo.ft_lp_partialhash;
        this.ft_a_partialhash = poolNFTInfo.ft_a_partialhash;
        this.ft_a_contractTxid = poolNFTInfo.ft_a_contractTxid;
        this.service_fee_rate =
            poolNFTInfo.service_fee_rate ?? this.service_fee_rate;
        this.service_provider = poolNFTInfo.service_provider;
        this.poolnft_code = poolNFTInfo.poolnft_code;
        this.pool_version = poolNFTInfo.pool_version;
        this.tbc_amount_full = BigInt(poolNFTInfo.currentContractSatoshi);
        const extraInfo = await this.getPoolNftExtraInfo();
        this.lp_plan = extraInfo.lpPlan;
        this.with_lock = extraInfo.withLock;
        this.with_lock_time = extraInfo.withLockTime;
    }
    /**
     * 创建一个池 NFT，并返回未检查的交易原始数据。
     *
     * @param {tbc.PrivateKey} privateKey_from - 用于创建池 NFT 的私钥。
     * @param {tbc.Transaction.IUnspentOutput} utxo - 用于创建交易的未花费输出。
     * @param {string} tag - 池 NFT 的标签。
     * @param {number} serviceFeeRate - 可选的服务费用率，默认为 25。
     * @param {1 | 2} lpPlan - 可选的lp手续费方案，默认为 1。
     * @param {boolean} withLockTime - 是否使用时间锁，默认为 false。
     * @returns {Promise<string>} 返回一个 Promise，解析为字符串形式的原始交易数据。
     *
     * 该函数执行以下主要步骤：
     * 1. 初始化 FT 实例并获取相关信息，包括合约交易 ID 和网络信息。
     * 2. 生成池 NFT 代码，使用 UTXO 的交易 ID 和输出索引。
     * 3. 计算 FT LP 代码，并生成相关的部分哈希值。
     * 4. 创建一个 BufferWriter 实例，并写入初始值（0）。
     * 5. 构建池 NFT 的脚本，包含部分哈希、金额数据和合约交易 ID。
     * 6. 创建新的交易实例，添加 UTXO 输入和多个输出，包括池 NFT 和脚本输出。
     * 7. 设置每千字节的交易费用，指定找零地址，并使用私钥对交易进行签名。
     * 8. 封装交易并返回序列化后的未检查交易数据以供发送。
     */
    async createPoolNFT(privateKey_from, utxo, tag, serviceFeeRate, lpPlan, withLockTime) {
        const privateKey = privateKey_from;
        const publicKeyHash = tbc.Address.fromPrivateKey(privateKey).hashBuffer.toString("hex");
        const flagHex = Buffer.from("for poolnft mint", "utf8").toString("hex");
        const txSource = new tbc.Transaction() //Build transcation
            .from(utxo)
            .addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromASM(`OP_DUP OP_HASH160 ${publicKeyHash} OP_EQUALVERIFY OP_CHECKSIG OP_RETURN ${flagHex}`),
            satoshis: 9800,
        }))
            .change(privateKey.toAddress());
        const txSize = txSource.getEstimateSize();
        txSource.fee(txSize < 1000 ? 80 : Math.ceil(txSize / 1000 * 80));
        txSource.sign(privateKey).seal();
        const txSourceRaw = txSource.uncheckedSerialize(); //Generate txraw
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        this.poolnft_code = this.getPoolNftCode(txSource.hash, 0, lpPlan || 1, tag)
            .toBuffer()
            .toString("hex");
        const ftlpCode = withLockTime ?? false
            ? this.getFtlpCodeWithLockTime(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex")).toString("hex"), privateKey.toAddress().toString(), FTA.tapeScript.length / 2)
            : this.getFtlpCode(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex")).toString("hex"), privateKey.toAddress().toString(), FTA.tapeScript.length / 2);
        this.ft_lp_partialhash = partial_sha256.calculate_partial_hash(ftlpCode.toBuffer().subarray(0, 1536));
        this.ft_a_partialhash = partial_sha256.calculate_partial_hash(Buffer.from(FTA.codeScript, "hex").subarray(0, 1536));
        this.service_fee_rate = serviceFeeRate ?? this.service_fee_rate;
        const poolnftTapeScript = this.getPoolNftTape(lpPlan || 1, false, withLockTime || false);
        const tx = new tbc.Transaction()
            .addInputFromPrevTx(txSource, 0)
            //poolNft
            .addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: this.poolnft_code_dust,
        }))
            .addOutput(new tbc.Transaction.Output({
            script: poolnftTapeScript,
            satoshis: 0,
        }));
        tx.feePerKb(80);
        tx.change(privateKey.toAddress());
        tx.setInputScript({
            inputIndex: 0,
            privateKey,
        }, (tx) => {
            const sig = tx.getSignature(0);
            const publickey = privateKey.toPublicKey().toBuffer().toString("hex");
            return tbc.Script.fromASM(`${sig} ${publickey}`);
        });
        tx.sign(privateKey);
        tx.seal();
        const txMintRaw = tx.uncheckedSerialize();
        const txraw = [];
        txraw.push(txSourceRaw);
        txraw.push(txMintRaw);
        return txraw;
    }
    /**
     * 创建一个加锁的池 NFT，并返回未检查的交易原始数据。
     *
     * @param {tbc.PrivateKey} privateKey_from - 用于创建池 NFT 的私钥。
     * @param {tbc.Transaction.IUnspentOutput} utxo - 用于创建交易的未花费输出。
     * @param {string} tag - 池 NFT 的标签。
     * @param {number} serviceFeeRate - 可选的服务费用率，默认为 25。
     * @param {1 | 2} lpPlan - 可选的lp手续费方案，默认为 1。
     * @param {boolean} withLockTime - 是否使用时间锁，默认为 false。
     * @returns {Promise<string>} 返回一个 Promise，解析为字符串形式的原始交易数据。
     *
     * 该函数执行以下主要步骤：
     * 1. 初始化 FT 实例并获取相关信息，包括合约交易 ID 和网络信息。
     * 2. 生成池 NFT 代码，使用 UTXO 的交易 ID 和输出索引。
     * 3. 计算 FT LP 代码，并生成相关的部分哈希值。
     * 4. 创建一个 BufferWriter 实例，并写入初始值（0）。
     * 5. 构建池 NFT 的脚本，包含部分哈希、金额数据和合约交易 ID。
     * 6. 创建新的交易实例，添加 UTXO 输入和多个输出，包括池 NFT 和脚本输出。
     * 7. 设置每千字节的交易费用，指定找零地址，并使用私钥对交易进行签名。
     * 8. 封装交易并返回序列化后的未检查交易数据以供发送。
     */
    async createPoolNftWithLock(privateKey_from, utxo, tag, lpCostAddress, lpCostTBC, pubKeyLock, serviceFeeRate, lpPlan, withLockTime) {
        const privateKey = privateKey_from;
        const publicKeyHash = tbc.Address.fromPrivateKey(privateKey).hashBuffer.toString("hex");
        const flagHex = Buffer.from("for poolnft mint", "utf8").toString("hex");
        const txSource = new tbc.Transaction() //Build transcation
            .from(utxo)
            .addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromASM(`OP_DUP OP_HASH160 ${publicKeyHash} OP_EQUALVERIFY OP_CHECKSIG OP_RETURN ${flagHex}`),
            satoshis: 9800,
        }))
            .change(privateKey.toAddress());
        const txSize = txSource.getEstimateSize();
        txSource.fee(txSize < 1000 ? 80 : Math.ceil(txSize / 1000 * 80));
        txSource.sign(privateKey).seal();
        const txSourceRaw = txSource.uncheckedSerialize(); //Generate txraw
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        this.poolnft_code = this.getPoolNftCodeWithLock(txSource.hash, 0, lpPlan || 1, lpCostAddress, lpCostTBC, pubKeyLock, tag)
            .toBuffer()
            .toString("hex");
        const ftlpCode = withLockTime ?? false
            ? this.getFtlpCodeWithLockTime(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex")).toString("hex"), privateKey.toAddress().toString(), FTA.tapeScript.length / 2)
            : this.getFtlpCode(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex")).toString("hex"), privateKey.toAddress().toString(), FTA.tapeScript.length / 2);
        this.ft_lp_partialhash = partial_sha256.calculate_partial_hash(ftlpCode.toBuffer().subarray(0, 1536));
        this.ft_a_partialhash = partial_sha256.calculate_partial_hash(Buffer.from(FTA.codeScript, "hex").subarray(0, 1536));
        this.service_fee_rate = serviceFeeRate ?? this.service_fee_rate;
        const poolnftTapeScript = this.getPoolNftTape(lpPlan || 1, true, withLockTime || false);
        const tx = new tbc.Transaction()
            .addInputFromPrevTx(txSource, 0)
            //poolNft
            .addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: this.poolnft_code_dust,
        }))
            .addOutput(new tbc.Transaction.Output({
            script: poolnftTapeScript,
            satoshis: 0,
        }));
        tx.feePerKb(80);
        tx.change(privateKey.toAddress());
        tx.setInputScript({
            inputIndex: 0,
            privateKey,
        }, (tx) => {
            const sig = tx.getSignature(0);
            const publickey = privateKey.toPublicKey().toBuffer().toString("hex");
            return tbc.Script.fromASM(`${sig} ${publickey}`);
        });
        tx.sign(privateKey);
        tx.seal();
        const txMintRaw = tx.uncheckedSerialize();
        const txraw = [];
        txraw.push(txSourceRaw);
        txraw.push(txMintRaw);
        return txraw;
    }
    /**
     * 初始化池 NFT 的创建过程，并返回未检查的交易原始数据。
     *
     * @param {tbc.PrivateKey} privateKey_from - 用于签名交易的私钥。
     * @param {string} address_to - FT-LP 接收地址。
     * @param {tbc.Transaction.IUnspentOutput} utxo - 用于创建交易的未花费输出。
     * @param {number} tbc_amount - 初始 TBC 数量。
     * @param {number} ft_a - 初始 FT-A 数量。
     * @param {number} lock_time - 可选的锁定时间，仅在启用时间锁时使用。
     * @returns {Promise<string>} 返回一个 Promise，解析为字符串形式的未检查交易数据。
     *
     * 该函数执行以下主要步骤：
     * 1. 初始化 FT 实例并获取相关信息，包括合约交易 ID 和网络信息。
     * 2. 根据输入参数计算 LP 和 FT-A 的金额，确保输入有效并处理不同情况。
     * 3. 检查 UTXO 是否有足够的 TBC 金额，抛出错误如果不足。
     * 4. 计算池 NFT 代码的哈希值，并验证 FT-A 的最大金额限制。
     * 5. 获取 FT-A 的 UTXO 和相关交易数据，确保有足够的 FT-A 金额进行交易。
     * 6. 构建用于池 NFT 和 FT-A 转移的脚本，并设置相关输出。
     * 7. 构建 FT LP 的脚本，包含名称和符号信息，并添加到交易中。
     * 8. 根据需要添加找零输出，确保所有金额正确处理。
     * 9. 设置每千字节的交易费用，并指定找零地址。
     * 10. 异步设置输入脚本以解锁相应的 UTXO，并签名交易。
     * 11. 封装交易并返回序列化后的未检查交易数据以供发送。
     */
    async initPoolNFT(privateKey_from, address_to, utxo, tbc_amount, ft_a, lock_time) {
        const privateKey = privateKey_from;
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        let amount_lpbn = BigInt(0);
        if (tbc_amount > 0 && ft_a > 0) {
            amount_lpbn = BigInt(Math.floor(tbc_amount * Math.pow(10, 6)));
            this.tbc_amount = BigInt(Math.floor(tbc_amount * Math.pow(10, 6)));
            this.ft_lp_amount = this.tbc_amount;
            this.ft_a_number = ft_a;
            this.ft_a_amount = BigInt(Math.floor(this.ft_a_number * Math.pow(10, FTA.decimal)));
        }
        else {
            throw new Error("Invalid amount Input");
        }
        const tapeAmountSetIn = [];
        if (utxo.satoshis < Number(this.tbc_amount)) {
            throw new Error("Insufficient TBC amount, please merge UTXOs");
        }
        const poolnft_codehash = tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex"));
        const poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(poolnft_codehash).toString("hex");
        const maxAmount = Math.floor(Math.pow(10, 18 - FTA.decimal));
        if (this.ft_a_number > maxAmount) {
            throw new Error(`When decimal is ${FTA.decimal}, the maximum amount cannot exceed ${maxAmount}`);
        }
        const ftutxo_codeScript = FT.buildFTtransferCode(FTA.codeScript, privateKey.toAddress().toString())
            .toBuffer()
            .toString("hex");
        let fttxo_a;
        try {
            fttxo_a = await API.fetchFtUTXO(this.ft_a_contractTxid, privateKey.toAddress().toString(), this.ft_a_amount, ftutxo_codeScript, this.network);
        }
        catch (error) {
            throw new Error(error.message);
        }
        const ftPreTX = await API.fetchTXraw(fttxo_a.txId, this.network);
        const ftPrePreTxData = await API.fetchFtPrePreTxData(ftPreTX, fttxo_a.outputIndex, this.network);
        if (fttxo_a.ftBalance < this.ft_a_amount) {
            throw new Error("Insufficient FT-A amount, please merge FT-A UTXOs");
        }
        tapeAmountSetIn.push(fttxo_a.ftBalance);
        let tapeAmountSum = BigInt(0);
        for (let i = 0; i < tapeAmountSetIn.length; i++) {
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
        }
        const { amountHex, changeHex } = FT.buildTapeAmount(this.ft_a_amount, tapeAmountSetIn, 1);
        const poolnftTapeScript = await this.updatePoolNftTape();
        // const poolnftTapeScript = this.getPoolNftTape(1, false, false);
        const poolnft = await this.fetchPoolNftUTXO(this.contractTxid);
        const tx = new tbc.Transaction()
            .from(poolnft)
            .from(fttxo_a)
            .from(utxo)
            //poolNft
            .addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: this.poolnft_code_dust + Number(this.tbc_amount),
        }))
            .addOutput(new tbc.Transaction.Output({
            script: poolnftTapeScript,
            satoshis: 0,
        }));
        //FTAbyC
        const ftCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
        const ftTapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftCodeScript,
            satoshis: fttxo_a.satoshis,
        })).addOutput(new tbc.Transaction.Output({
            script: ftTapeScript,
            satoshis: 0,
        }));
        //FTLP
        let ftlpCodeScript;
        let ftlpTapeScript;
        if (this.with_lock_time) {
            if (lock_time === undefined) {
                throw new Error("Lock time is required");
            }
            if (lock_time < 0 || lock_time > 4294967295) {
                throw new Error("Invalid lock time, must be between 0 and 4294967295");
            }
            const ftlp_amount = new tbc.crypto.BN(amount_lpbn.toString());
            const amountwriter = new tbc.encoding.BufferWriter();
            amountwriter.writeUInt64LEBN(ftlp_amount);
            for (let i = 1; i < 6; i++) {
                amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
            }
            const ftlpTapeAmount = amountwriter.toBuffer().toString("hex");
            const lockTimeWriter = new tbc.encoding.BufferWriter();
            lockTimeWriter.writeUInt32LE(lock_time);
            const lockTimeHex = lockTimeWriter.toBuffer().toString("hex");
            // Build the tape script
            const fillSize = FTA.tapeScript.length / 2 - 62;
            const opZeroArray = Array(fillSize).fill("OP_0").join(" ");
            ftlpTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${ftlpTapeAmount} ${lockTimeHex} ${opZeroArray} 4654617065`);
            const tapeSize = ftlpTapeScript.toBuffer().length;
            ftlpCodeScript = this.getFtlpCodeWithLockTime(poolnft_codehash.toString("hex"), address_to, tapeSize);
        }
        else {
            const nameHex = Buffer.from(FTA.name, "utf8").toString("hex");
            const symbolHex = Buffer.from(FTA.symbol, "utf8").toString("hex");
            const ftlp_amount = new tbc.crypto.BN(amount_lpbn.toString());
            const amountwriter = new tbc.encoding.BufferWriter();
            amountwriter.writeUInt64LEBN(ftlp_amount);
            for (let i = 1; i < 6; i++) {
                amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
            }
            const ftlpTapeAmount = amountwriter.toBuffer().toString("hex");
            // Build the tape script
            ftlpTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${ftlpTapeAmount} 06 ${nameHex} ${symbolHex} 4654617065`);
            const tapeSize = ftlpTapeScript.toBuffer().length;
            ftlpCodeScript = this.getFtlpCode(poolnft_codehash.toString("hex"), address_to, tapeSize);
        }
        tx.addOutput(new tbc.Transaction.Output({
            script: ftlpCodeScript,
            satoshis: 500,
        }));
        tx.addOutput(new tbc.Transaction.Output({
            script: ftlpTapeScript,
            satoshis: 0,
        }));
        if (this.ft_a_amount < tapeAmountSum) {
            const changeCodeScript = FT.buildFTtransferCode(FTA.codeScript, privateKey.toAddress().toString());
            tx.addOutput(new tbc.Transaction.Output({
                script: changeCodeScript,
                satoshis: fttxo_a.satoshis,
            }));
            const changeTapeScript = FT.buildFTtransferTape(FTA.tapeScript, changeHex);
            tx.addOutput(new tbc.Transaction.Output({
                script: changeTapeScript,
                satoshis: 0,
            }));
        }
        tx.feePerKb(80);
        tx.change(privateKey.toAddress());
        await tx.setInputScriptAsync({
            inputIndex: 0,
        }, async (tx) => {
            const unlockingScript = await this.getPoolNftUnlock(privateKey, tx, 0, poolnft.txId, poolnft.outputIndex, 0, 1);
            return unlockingScript;
        });
        await tx.setInputScriptAsync({
            inputIndex: 1,
        }, async (tx) => {
            const unlockingScript = await FTA.getFTunlock(privateKey, tx, ftPreTX, ftPrePreTxData, 1, fttxo_a.outputIndex);
            return unlockingScript;
        });
        tx.sign(privateKey);
        await tx.sealAsync();
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    /**
     * 增加流动性池中的 LP，并返回未检查的交易原始数据。
     *
     * @param {tbc.PrivateKey} privateKey_from - 用于签名交易的私钥。
     * @param {string} address_to - FT-LP 接收地址。
     * @param {tbc.Transaction.IUnspentOutput} utxo - 用于创建交易的未花费输出。
     * @param {number} amount_tbc - 增加的 TBC 数量。
     * @param {number} lock_time - 可选的锁定时间，仅在启用时间锁时使用。
     * @returns {Promise<string>} 返回一个 Promise，解析为字符串形式的未检查交易数据。
     *
     * 该函数执行以下主要步骤：
     * 1. 初始化 FT 实例并获取相关信息，包括合约交易 ID 和网络信息。
     * 2. 将输入的 TBC 数量转换为 BigInt，并更新流动性池的数据。
     * 3. 计算池 NFT 的哈希值，并验证是否有足够的 FT-A 和 TBC 金额进行交易。
     * 4. 获取 FT-A 的 UTXO 和相关交易数据，确保有足够的 FT-A 金额进行流动性增加。
     * 5. 构建用于池 NFT 和 FT-A 转移的脚本，并设置相关输出。
     * 6. 构建 FT LP 的脚本，包含名称和符号信息，并添加到交易中。
     * 7. 根据需要添加找零输出，确保所有金额正确处理。
     * 8. 设置每千字节的交易费用，并指定找零地址。
     * 9. 异步设置输入脚本以解锁相应的 UTXO，并签名交易。
     * 10. 封装交易并返回序列化后的未检查交易数据以供发送。
     */
    async increaseLP(privateKey_from, address_to, utxo, amount_tbc, lock_time) {
        const lockStatus = this.with_lock === true ? 1 : 0 || (0, util_1.isLock)(this.poolnft_code.length);
        // console.log(`Lock status: ${lockStatus}`);
        if (lockStatus) {
            const lpCostAmount = (0, util_1.getLpCostAmount)(this.poolnft_code);
            const lpCostTBC = Number((lpCostAmount / Math.pow(10, 6)).toFixed(6));
            amount_tbc -= lpCostTBC;
            if (amount_tbc <= 0)
                throw new Error(`TBC amount input must be greater than LP cost of ${lpCostTBC}`);
        }
        if (amount_tbc <= 0)
            throw new Error("Invalid TBC amount input");
        const privateKey = privateKey_from;
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        const amount_tbcbn = BigInt(Math.floor(amount_tbc * Math.pow(10, 6)));
        const changeDate = this.updatePoolNFT(amount_tbc, FTA.decimal, 2);
        const poolnft_codehash = tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex"));
        const poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(poolnft_codehash).toString("hex");
        const tapeAmountSetIn = [];
        const ftutxo_codeScript = FT.buildFTtransferCode(FTA.codeScript, privateKey.toAddress().toString())
            .toBuffer()
            .toString("hex");
        let fttxo_a;
        try {
            fttxo_a = await API.fetchFtUTXO(this.ft_a_contractTxid, privateKey.toAddress().toString(), changeDate.ft_a_difference, ftutxo_codeScript, this.network);
        }
        catch (error) {
            const errorMessage = error.message === "Insufficient FTbalance, please merge FT UTXOs"
                ? "Insufficient FT-A amount, please merge FT-A UTXOs"
                : error.message;
            throw new Error(errorMessage);
        }
        const ftPreTX = await API.fetchTXraw(fttxo_a.txId, this.network);
        const ftPrePreTxData = await API.fetchFtPrePreTxData(ftPreTX, fttxo_a.outputIndex, this.network);
        tapeAmountSetIn.push(fttxo_a.ftBalance);
        let tapeAmountSum = BigInt(0);
        for (let i = 0; i < tapeAmountSetIn.length; i++) {
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
        }
        if (changeDate.ft_a_difference > tapeAmountSum) {
            throw new Error("Insufficient balance, please merge FT UTXOs");
        }
        let { amountHex, changeHex } = FT.buildTapeAmount(changeDate.ft_a_difference, tapeAmountSetIn, 1);
        if (utxo.satoshis < Number(amount_tbcbn)) {
            throw new Error("Insufficient TBC amount, please merge UTXOs");
        }
        const poolnft = await this.fetchPoolNftUTXO(this.contractTxid);
        // Construct the transaction
        const tx = new tbc.Transaction().from(poolnft).from(fttxo_a).from(utxo);
        tx.addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: poolnft.satoshis + Number(changeDate.tbc_amount_difference),
        }));
        const poolnftTapeScript = await this.updatePoolNftTape();
        tx.addOutput(new tbc.Transaction.Output({
            script: poolnftTapeScript,
            satoshis: 0,
        }));
        // FTAbyC
        const ftabycCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftabycCodeScript,
            satoshis: fttxo_a.satoshis,
        }));
        const ftabycTapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftabycTapeScript,
            satoshis: 0,
        }));
        // FTLP
        let ftlpCodeScript;
        let ftlpTapeScript;
        if (this.with_lock_time) {
            if (lock_time === undefined) {
                throw new Error("Lock time is required");
            }
            if (lock_time < 0 || lock_time > 4294967295) {
                throw new Error("Invalid lock time, must be between 0 and 4294967295");
            }
            const ftlp_amount = new tbc.crypto.BN(changeDate.ft_lp_difference.toString());
            const amountwriter = new tbc.encoding.BufferWriter();
            amountwriter.writeUInt64LEBN(ftlp_amount);
            for (let i = 1; i < 6; i++) {
                amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
            }
            const ftlpTapeAmount = amountwriter.toBuffer().toString("hex");
            const lockTimeWriter = new tbc.encoding.BufferWriter();
            lockTimeWriter.writeUInt32LE(lock_time);
            const lockTimeHex = lockTimeWriter.toBuffer().toString("hex");
            // Build the tape script
            const fillSize = FTA.tapeScript.length / 2 - 62;
            const opZeroArray = Array(fillSize).fill("OP_0").join(" ");
            ftlpTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${ftlpTapeAmount} ${lockTimeHex} ${opZeroArray} 4654617065`);
            const tapeSize = ftlpTapeScript.toBuffer().length;
            ftlpCodeScript = this.getFtlpCodeWithLockTime(poolnft_codehash.toString("hex"), address_to, tapeSize);
        }
        else {
            const nameHex = Buffer.from(FTA.name, "utf8").toString("hex");
            const symbolHex = Buffer.from(FTA.symbol, "utf8").toString("hex");
            const ftlp_amount = new tbc.crypto.BN(changeDate.ft_lp_difference.toString());
            const amountwriter = new tbc.encoding.BufferWriter();
            amountwriter.writeUInt64LEBN(ftlp_amount);
            for (let i = 1; i < 6; i++) {
                amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
            }
            const ftlpTapeAmount = amountwriter.toBuffer().toString("hex");
            // Build the tape script
            ftlpTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${ftlpTapeAmount} 06 ${nameHex} ${symbolHex} 4654617065`);
            const tapeSize = ftlpTapeScript.toBuffer().length;
            ftlpCodeScript = this.getFtlpCode(poolnft_codehash.toString("hex"), address_to, tapeSize);
        }
        tx.addOutput(new tbc.Transaction.Output({
            script: ftlpCodeScript,
            satoshis: 500,
        }));
        tx.addOutput(new tbc.Transaction.Output({
            script: ftlpTapeScript,
            satoshis: 0,
        }));
        // P2PKH (若带锁则扣除)
        if (lockStatus) {
            const lpCostAddress = (0, util_1.getLpCostAddress)(this.poolnft_code);
            const lpCostAmount = (0, util_1.getLpCostAmount)(this.poolnft_code);
            // console.log(`Lock address: ${lpCostAddress}` + `, Lock amount: ${lpCostAmount}`);
            tx.to(lpCostAddress, lpCostAmount);
        }
        if (changeDate.ft_a_difference < tapeAmountSum) {
            // FTAbyA_change
            const ftabya_changeCodeScript = FT.buildFTtransferCode(FTA.codeScript, privateKey.toAddress().toString());
            tx.addOutput(new tbc.Transaction.Output({
                script: ftabya_changeCodeScript,
                satoshis: fttxo_a.satoshis,
            }));
            const ftabya_changeTapeScript = FT.buildFTtransferTape(FTA.tapeScript, changeHex);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftabya_changeTapeScript,
                satoshis: 0,
            }));
        }
        tx.feePerKb(80);
        tx.change(privateKey.toAddress());
        await tx.setInputScriptAsync({
            inputIndex: 0,
        }, async (tx) => {
            const unlockingScript = await this.getPoolNftUnlock(privateKey, tx, 0, poolnft.txId, poolnft.outputIndex, lockStatus, 1);
            return unlockingScript;
        });
        await tx.setInputScriptAsync({
            inputIndex: 1,
        }, async (tx) => {
            const unlockingScript = await FTA.getFTunlock(privateKey, tx, ftPreTX, ftPrePreTxData, 1, fttxo_a.outputIndex);
            return unlockingScript;
        });
        tx.sign(privateKey);
        await tx.sealAsync();
        // console.log(tx.verify());
        // console.log(tx.toObject());
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    /**
     * 消耗流动性池中的 LP，并返回未检查的交易原始数据。
     *
     * @param {tbc.PrivateKey} privateKey_from - 用于签名交易的私钥。
     * @param {string} address_to - 资产接收地址。
     * @param {tbc.Transaction.IUnspentOutput} utxo - 用于创建交易的未花费输出。
     * @param {number} amount_lp - 要消耗的 LP 数量。
     * @param {number} lock_time - 可选的锁定时间，仅在启用时间锁时使用。
     * @returns {Promise<string>} 返回一个 Promise，解析为字符串形式的未检查交易数据。
     *
     * 该函数执行以下主要步骤：
     * 1. 初始化 FT 实例并获取相关信息，包括合约交易 ID 和网络信息。
     * 2. 将输入的 LP 数量转换为 BigInt，并验证是否有足够的 LP 可供消耗。
     * 3. 更新池 NFT 的状态，并计算相关的哈希值。
     * 4. 获取流动性池 UTXO 和 FT UTXO，确保有足够的余额进行交易。
     * 5. 构建用于流动性池和 FT 转移的脚本，并设置相关输出。
     * 6. 构建 FT LP 的脚本，包含名称和符号信息，并添加到交易中。
     * 7. 根据需要添加找零输出，确保所有金额正确处理。
     * 8. 设置每千字节的交易费用，并指定找零地址。
     * 9. 异步设置输入脚本以解锁相应的 UTXO，并签名交易。
     * 10. 封装交易并返回序列化后的未检查交易数据以供发送。
     */
    async consumeLP(privateKey_from, address_to, utxo, amount_lp, lock_time) {
        let isNeedUnlock = false;
        let unlockTX;
        try {
            if (this.with_lock_time) {
                if (lock_time) {
                    if (lock_time < 0 || lock_time > 4294967295) {
                        throw new Error("Invalid lock time, must be between 0 and 4294967295");
                    }
                    if (!Number.isInteger(lock_time)) {
                        throw new Error("Lock time must be a positive integer");
                    }
                }
                const unlockTXraw = await this.unlockFTLP(privateKey_from, utxo, lock_time);
                if (unlockTXraw != null) {
                    isNeedUnlock = true;
                    const txid = await API.broadcastTXraw(unlockTXraw, this.network);
                    if (!txid)
                        throw new Error("Failed to broadcast unlock transaction");
                    unlockTX = new tbc.Transaction(unlockTXraw);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
                ;
            }
        }
        catch (error) {
            throw error;
        }
        const privateKey = privateKey_from;
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        const amount_lpbn = BigInt(Math.floor(amount_lp * Math.pow(10, 6)));
        if (this.ft_lp_amount < amount_lpbn) {
            throw new Error("Invalid FT-LP amount input");
        }
        const changeDate = this.updatePoolNFT(amount_lp, FTA.decimal, 1);
        const poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex"))).toString("hex");
        const tapeAmountSetIn = [];
        const lpTapeAmountSetIn = [];
        const ftPreTX = [];
        const ftPrePreTxData = [];
        const ftlpCode = this.with_lock_time ?? false
            ? this.getFtlpCodeWithLockTime(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex")).toString("hex"), privateKey.toAddress().toString(), FTA.tapeScript.length / 2)
            : this.getFtlpCode(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex")).toString("hex"), privateKey.toAddress().toString(), FTA.tapeScript.length / 2);
        // const ftlpCode = this.getFtlpCode(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, 'hex')).toString('hex'), privateKey.toAddress().toString(), FTA.tapeScript.length / 2);
        let fttxo_lp;
        try {
            fttxo_lp = await this.fetchFtlpUTXO(privateKey.toAddress().toString(), changeDate.ft_lp_difference);
        }
        catch (error) {
            throw new Error(error.message);
        }
        ftPreTX.push(await API.fetchTXraw(fttxo_lp.txId, this.network));
        ftPrePreTxData.push(await API.fetchFtPrePreTxData(ftPreTX[0], fttxo_lp.outputIndex, this.network));
        lpTapeAmountSetIn.push(fttxo_lp.ftBalance);
        const ftutxo_codeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160)
            .toBuffer()
            .toString("hex");
        let fttxo_c;
        try {
            fttxo_c = await API.fetchFtUTXOsforPool(this.ft_a_contractTxid, poolnft_codehash160, changeDate.ft_a_difference, 3, ftutxo_codeScript, this.network);
        }
        catch (error) {
            const errorMessage = error.message === "Insufficient FTbalance, please merge FT UTXOs"
                ? "Insufficient PoolFT, please merge FT UTXOs"
                : error.message;
            throw new Error(errorMessage);
        }
        let tapeAmountSum = BigInt(0);
        for (let i = 0; i < fttxo_c.length; i++) {
            ftPreTX.push(await API.fetchTXraw(fttxo_c[i].txId, this.network));
            ftPrePreTxData.push(await API.fetchFtPrePreTxData(ftPreTX[i + 1], fttxo_c[i].outputIndex, this.network));
            tapeAmountSetIn.push(fttxo_c[i].ftBalance);
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
        }
        // Build the amount and change hex strings for the tape
        let { amountHex, changeHex } = FT.buildTapeAmount(changeDate.ft_a_difference, tapeAmountSetIn, 2);
        const ftAbyA = amountHex;
        const ftAbyC = changeHex;
        ({ amountHex, changeHex } = FT.buildTapeAmount(changeDate.ft_lp_difference, lpTapeAmountSetIn, 1));
        const ftlpBurn = amountHex;
        const ftlpChange = changeHex;
        const poolnft = await this.fetchPoolNftUTXO(this.contractTxid);
        const contractTX = await API.fetchTXraw(poolnft.txId, this.network);
        // Construct the transaction
        const tx = new tbc.Transaction()
            .from(poolnft)
            .from(fttxo_lp)
            .from(fttxo_c);
        if (this.with_lock_time && isNeedUnlock)
            tx.addInputFromPrevTx(unlockTX, 2);
        else
            tx.from(utxo);
        //poolNft
        tx.addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: poolnft.satoshis - Number(changeDate.tbc_amount_full_difference),
        }));
        const poolnftTapeScript = await this.updatePoolNftTape();
        tx.addOutput(new tbc.Transaction.Output({
            script: poolnftTapeScript,
            satoshis: 0,
        }));
        //FTAbyA
        const ftCodeScript = FT.buildFTtransferCode(FTA.codeScript, address_to);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftCodeScript,
            satoshis: 500,
        }));
        const ftTapeScript = FT.buildFTtransferTape(FTA.tapeScript, ftAbyA);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftTapeScript,
            satoshis: 0,
        }));
        //P2PKH
        tx.to(privateKey.toAddress().toString(), Number(changeDate.tbc_amount_full_difference));
        //FTLP_Burn
        let ftlpCodeScript = FT.buildFTtransferCode(ftlpCode.toBuffer().toString("hex"), "1BitcoinEaterAddressDontSendf59kuE");
        let ftlpTapeScript;
        const amountwriter = new tbc.encoding.BufferWriter();
        for (let i = 0; i < 6; i++) {
            amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
        }
        const ftlpTapeAmount = amountwriter.toBuffer().toString("hex");
        if (this.with_lock_time) {
            tx.setInputSequence(1, 4294967294);
            // tx.setLockTime((await API.fetchBlockHeaders(this.network))[0].height - 2);
            const lockTimeHex = Buffer.from("00000000", "hex").toString("hex");
            const fillSize = FTA.tapeScript.length / 2 - 62;
            const opZeroArray = Array(fillSize).fill("OP_0").join(" ");
            ftlpTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${ftlpTapeAmount} ${lockTimeHex} ${opZeroArray} 4654617065`);
            // ftlpCodeScript = FT.buildFTtransferCode(ftlpCode.toBuffer().toString('hex'), '1BitcoinEaterAddressDontSendf59kuE');
        }
        else {
            const nameHex = Buffer.from(FTA.name, "utf8").toString("hex");
            const symbolHex = Buffer.from(FTA.symbol, "utf8").toString("hex");
            ftlpTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${ftlpTapeAmount} 06 ${nameHex} ${symbolHex} 4654617065`);
            // ftlpCodeScript = FT.buildFTtransferCode(ftlpCode.toBuffer().toString('hex'), '1BitcoinEaterAddressDontSendf59kuE');
        }
        tx.addOutput(new tbc.Transaction.Output({
            script: ftlpCodeScript,
            satoshis: fttxo_lp.satoshis,
        }));
        ftlpTapeScript = FT.buildFTtransferTape(ftlpTapeScript.toBuffer().toString("hex"), ftlpBurn);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftlpTapeScript,
            satoshis: 0,
        }));
        // FTLP_change
        if (fttxo_lp.ftBalance > changeDate.ft_lp_difference) {
            const ftlp_changeCodeScript = FT.buildFTtransferCode(ftlpCode.toBuffer().toString("hex"), address_to);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftlp_changeCodeScript,
                satoshis: fttxo_lp.satoshis,
            }));
            const ftlp_changeTapeScript = FT.buildFTtransferTape(ftlpTapeScript.toBuffer().toString("hex"), ftlpChange);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftlp_changeTapeScript,
                satoshis: 0,
            }));
        }
        // FTAbyC_change
        if (changeDate.ft_a_difference < tapeAmountSum) {
            const ftabycCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftabycCodeScript,
                satoshis: 500,
            }));
            const ftabycTapeScript = FT.buildFTtransferTape(FTA.tapeScript, ftAbyC);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftabycTapeScript,
                satoshis: 0,
            }));
        }
        tx.feePerKb(80);
        tx.change(privateKey.toAddress());
        await tx.setInputScriptAsync({
            inputIndex: 0,
        }, async (tx) => {
            const unlockingScript = await this.getPoolNftUnlock(privateKey, tx, 0, poolnft.txId, poolnft.outputIndex, (0, util_1.isLock)(this.poolnft_code.length), 2);
            return unlockingScript;
        });
        await tx.setInputScriptAsync({
            inputIndex: 1,
        }, async (tx) => {
            const unlockingScript = await FTA.getFTunlock(privateKey, tx, ftPreTX[0], ftPrePreTxData[0], 1, fttxo_lp.outputIndex);
            return unlockingScript;
        });
        for (let i = 0; i < fttxo_c.length; i++) {
            await tx.setInputScriptAsync({
                inputIndex: i + 2,
            }, async (tx) => {
                const unlockingScript = await FTA.getFTunlockSwap(privateKey, tx, ftPreTX[i + 1], ftPrePreTxData[i + 1], contractTX, i + 2, fttxo_c[i].outputIndex);
                return unlockingScript;
            });
        }
        tx.sign(privateKey);
        await tx.sealAsync();
        const txraw = tx.uncheckedSerialize();
        // console.log(txraw);
        return txraw;
    }
    /**
     * 将指定数量的 TBC 交换为 FT-A，并返回未检查的交易原始数据。
     *
     * @param {tbc.PrivateKey} privateKey_from - 用于签名交易的私钥。
     * @param {string} address_to - 接收 FT-A 的地址。
     * @param {tbc.Transaction.IUnspentOutput} utxo - 用于创建交易的未花费输出。
     * @param {number} amount_tbc - 要交换的 TBC 数量。
     * @param {1 | 2} [lpPlan] - 流动性池计划，默认为 1。
     * @returns {Promise<string>} 返回一个 Promise，解析为字符串形式的未检查交易数据。
     *
     * 该函数执行以下主要步骤：
     * 1. 初始化 FT 实例并获取相关信息，包括合约交易 ID 和网络信息。
     * 2. 将输入的 TBC 数量转换为 BigInt，并验证是否有足够的 TBC 余额进行交换。
     * 3. 更新 TBC 和 FT-A 的余额，计算新的 FT-A 数量。
     * 4. 获取池 NFT 的哈希值，并准备 FT UTXO 的转移脚本。
     * 5. 检查是否有足够的 FT 可供交换，抛出错误如果不足。
     * 6. 构建用于池 NFT 和 FT 转移的脚本，并设置相关输出。
     * 7. 设置每千字节的交易费用，并指定找零地址。
     * 8. 异步设置输入脚本以解锁相应的 UTXO，并签名交易。
     * 9. 封装交易并返回序列化后的未检查交易数据以供发送。
     */
    async swaptoToken_baseTBC(privateKey_from, address_to, utxo, amount_tbc, lpPlan) {
        const privateKey = privateKey_from;
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        lpPlan =
            this.lp_plan === 1 || this.lp_plan === 2
                ? this.lp_plan
                : lpPlan || 1;
        if (amount_tbc <= 0) {
            throw new Error("Invalid TBC amount input");
        }
        // const poolMul = this.ft_a_amount * this.tbc_amount;
        const poolMul = new BN(this.ft_a_amount.toString()).mul(new BN(this.tbc_amount.toString()));
        const ft_a_amount = this.ft_a_amount;
        const amount_tbcbn = BigInt(Math.floor(amount_tbc * Math.pow(10, 6)));
        const serviceFee = (amount_tbcbn * BigInt(this.service_fee_rate + 10)) / BigInt(10000);
        const serviceFeeLP = (amount_tbcbn * BigInt(lpPlan === 1 ? this.service_fee_rate : 5)) /
            BigInt(10000);
        const serviceFeeA = serviceFee - serviceFeeLP;
        const amount_tbcbn_swap = amount_tbcbn - serviceFee;
        let amount_tbcbn_swap_lp = amount_tbcbn;
        if (serviceFeeA >= 42) {
            amount_tbcbn_swap_lp = amount_tbcbn - serviceFeeA;
        }
        this.tbc_amount = BigInt(this.tbc_amount) + BigInt(amount_tbcbn_swap);
        // console.log(`poolMul: ${poolMul}, amount_tbcbn_swap: ${amount_tbcbn_swap}, tbc_amount: ${this.tbc_amount}`);
        // console.log(poolMul.toString());
        // console.log(new tbc.crypto.BN(poolMul.toString()).toString());
        // console.log(new tbc.crypto.BN(this.tbc_amount.toString()).toNumber());
        // console.log(new tbc.crypto.BN(poolMul.toString()).div(new tbc.crypto.BN(this.tbc_amount.toString())));
        this.ft_a_amount = BigInt(poolMul.div(new BN(this.tbc_amount.toString())).toString());
        // this.ft_a_amount = BigInt(poolMul) / BigInt(this.tbc_amount);
        // console.log(`ft_a_amount: ${this.ft_a_amount}`);
        const ft_a_amount_decrement = BigInt(ft_a_amount) - BigInt(this.ft_a_amount);
        // console.log(`ft_a_amount_decrement: ${ft_a_amount_decrement}`);
        const poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex"))).toString("hex");
        const tapeAmountSetIn = [];
        const ftutxo_codeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160)
            .toBuffer()
            .toString("hex");
        let fttxo_c;
        try {
            fttxo_c = await API.fetchFtUTXOsforPool(this.ft_a_contractTxid, poolnft_codehash160, ft_a_amount_decrement, 4, ftutxo_codeScript, this.network);
        }
        catch (error) {
            const errorMessage = error.message === "Insufficient FTbalance, please merge FT UTXOs"
                ? "Insufficient PoolFT, please merge FT UTXOs"
                : error.message;
            throw new Error(errorMessage);
        }
        const ftPreTX = [];
        const ftPrePreTxData = [];
        let tapeAmountSum = BigInt(0);
        for (let i = 0; i < fttxo_c.length; i++) {
            ftPreTX.push(await API.fetchTXraw(fttxo_c[i].txId, this.network));
            ftPrePreTxData.push(await API.fetchFtPrePreTxData(ftPreTX[i], fttxo_c[i].outputIndex, this.network));
            tapeAmountSetIn.push(fttxo_c[i].ftBalance);
            tapeAmountSum += BigInt(new BN(tapeAmountSetIn[i].toString()).toString());
        }
        // Build the amount and change hex strings for the tape
        const { amountHex, changeHex } = FT.buildTapeAmount(ft_a_amount_decrement, tapeAmountSetIn, 2);
        if (utxo.satoshis < Number(amount_tbcbn)) {
            throw new Error("Insufficient TBC amount, please merge UTXOs");
        }
        const poolnft = await this.fetchPoolNftUTXO(this.contractTxid);
        const contractTX = await API.fetchTXraw(poolnft.txId, this.network);
        // Construct the transaction
        const tx = new tbc.Transaction().from(poolnft).from(utxo).from(fttxo_c);
        tx.addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: poolnft.satoshis + Number(amount_tbcbn_swap_lp),
        }));
        const poolnftTapeScript = await this.updatePoolNftTape();
        tx.addOutput(new tbc.Transaction.Output({
            script: poolnftTapeScript,
            satoshis: 0,
        }));
        // FTAbyA
        const ftCodeScript = FT.buildFTtransferCode(FTA.codeScript, address_to);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftCodeScript,
            satoshis: 500,
        }));
        const ftTapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftTapeScript,
            satoshis: 0,
        }));
        // P2PKH_ServiceFee
        if (serviceFeeA >= BigInt(42)) {
            tx.to(lpPlan === 1
                ? "13oCEJaqyyiC8iRrfup6PDL2GKZ3xQrsZL"
                : "1Fa6Uy64Ub4qNdB896zX2pNMx4a8zMhtCy", Number(serviceFeeA));
        }
        // FTAbyC_Change
        if (ft_a_amount_decrement < tapeAmountSum) {
            const ftabycCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftabycCodeScript,
                satoshis: 500,
            }));
            const ftabycTapeScript = FT.buildFTtransferTape(FTA.tapeScript, changeHex);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftabycTapeScript,
                satoshis: 0,
            }));
        }
        tx.feePerKb(80);
        tx.change(privateKey.toAddress());
        await tx.setInputScriptAsync({
            inputIndex: 0,
        }, async (tx) => {
            const unlockingScript = await this.getPoolNftUnlock(privateKey, tx, 0, poolnft.txId, poolnft.outputIndex, (0, util_1.isLock)(this.poolnft_code.length), 3, 1);
            return unlockingScript;
        });
        for (let i = 0; i < fttxo_c.length; i++) {
            await tx.setInputScriptAsync({
                inputIndex: i + 2,
            }, async (tx) => {
                const unlockingScript = await FTA.getFTunlockSwap(privateKey, tx, ftPreTX[i], ftPrePreTxData[i], contractTX, i + 2, fttxo_c[i].outputIndex);
                return unlockingScript;
            });
        }
        tx.sign(privateKey);
        // console.log(tx.verify());
        await tx.sealAsync();
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    /**
     * 将指定数量的 FT-A 交换为 TBC，并返回未检查的交易原始数据。
     *
     * @param {tbc.PrivateKey} privateKey_from - 用于签名交易的私钥。
     * @param {string} address_to - 接收 TBC 的地址。
     * @param {tbc.Transaction.IUnspentOutput} utxo - 用于创建交易的未花费输出。
     * @param {number} amount_token - 要交换的 FT-A 数量。
     * @param {1 | 2} [lpPlan] - 流动性池计划，默认为 1。
     * @returns {Promise<string>} 返回一个 Promise，解析为字符串形式的未检查交易数据。
     *
     * 该函数执行以下主要步骤：
     * 1. 初始化 FT 实例并获取相关信息，包括合约交易 ID 和网络信息。
     * 2. 将输入的 FT-A 数量转换为 BigInt，并验证是否有足够的 FT-A 余额进行交换。
     * 3. 计算池 NFT 的哈希值，并更新 FT-A 和 TBC 的余额。
     * 4. 获取与 FT-A 相关的 UTXO 和相关交易数据，确保有足够的 FT-A 金额进行交换。
     * 5. 获取与池 NFT 相关的 FT UTXO，并验证其余额是否足够。
     * 6. 构建用于池 NFT 和 FT 转移的脚本，并设置相关输出。
     * 7. 设置每千字节的交易费用，并指定找零地址。
     * 8. 异步设置输入脚本以解锁相应的 UTXO，并签名交易。
     * 9. 封装交易并返回序列化后的未检查交易数据以供发送。
     */
    async swaptoTBC_baseToken(privateKey_from, address_to, utxo, amount_token, lpPlan) {
        const privateKey = privateKey_from;
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        lpPlan =
            this.lp_plan === 1 || this.lp_plan === 2
                ? this.lp_plan
                : lpPlan || 1;
        const amount_ftbn = BigInt(Math.floor(amount_token * Math.pow(10, FTA.decimal)));
        if (amount_token <= 0) {
            throw new Error("Invalid FT amount input");
        }
        const poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex"))).toString("hex");
        // const poolMul = this.ft_a_amount * this.tbc_amount;
        // console.log(`tbc_amount: ${this.tbc_amount}, ft_a_amount: ${this.ft_a_amount}`);
        const poolMul = new tbc.crypto.BN(this.ft_a_amount.toString()).mul(new tbc.crypto.BN(this.tbc_amount.toString()));
        const tbc_amount = this.tbc_amount;
        // this.ft_a_amount = BigInt(this.ft_a_amount) + BigInt(amount_ftbn);
        this.ft_a_amount = BigInt(new BN(this.ft_a_amount.toString())
            .add(new BN(amount_ftbn.toString()))
            .toString());
        // console.log(`poolMul: ${poolMul}, amount_ftbn: ${amount_ftbn}, ft_a_amount: ${this.ft_a_amount}`);
        // console.log(BigInt(new BN(this.ft_a_amount.toString()).add(new BN(amount_ftbn.toString())).toString()));
        // this.tbc_amount = BigInt(poolMul) / BigInt(this.ft_a_amount);
        this.tbc_amount = BigInt(poolMul.div(new tbc.crypto.BN(this.ft_a_amount.toString())).toString());
        // console.log(`tbc_amount: ${this.tbc_amount}`);
        const tbc_amount_decrement = BigInt(tbc_amount) - BigInt(this.tbc_amount);
        const serviceFee = (tbc_amount_decrement * BigInt(this.service_fee_rate + 10)) /
            BigInt(10000);
        const serviceFeeLP = (tbc_amount_decrement *
            BigInt(lpPlan === 1 ? this.service_fee_rate : 5)) /
            BigInt(10000);
        const serviceFeeA = serviceFee - serviceFeeLP;
        const tbc_amount_decrement_swap = tbc_amount_decrement - serviceFee;
        let tbc_amount_decrement_swap_lp = tbc_amount_decrement_swap;
        if (serviceFeeA >= 42) {
            tbc_amount_decrement_swap_lp = tbc_amount_decrement - serviceFeeLP;
        }
        const tapeAmountSetIn = [];
        const ftPreTX = [];
        const ftPrePreTxData = [];
        const ftutxo_codeScript_a = FT.buildFTtransferCode(FTA.codeScript, privateKey.toAddress().toString())
            .toBuffer()
            .toString("hex");
        let fttxo_a;
        try {
            fttxo_a = await API.fetchFtUTXO(this.ft_a_contractTxid, privateKey.toAddress().toString(), amount_ftbn, ftutxo_codeScript_a, this.network);
        }
        catch (error) {
            throw new Error(error.message);
        }
        ftPreTX.push(await API.fetchTXraw(fttxo_a.txId, this.network));
        ftPrePreTxData.push(await API.fetchFtPrePreTxData(ftPreTX[0], fttxo_a.outputIndex, this.network));
        tapeAmountSetIn.push(BigInt(fttxo_a.ftBalance));
        // Build the amount and change hex strings for the tape
        const { amountHex, changeHex } = FT.buildTapeAmount(BigInt(amount_ftbn), tapeAmountSetIn, 1);
        const poolnft = await this.fetchPoolNftUTXO(this.contractTxid);
        //const contractTX = await API.fetchTXraw(poolnft.txId, this.network);
        // Construct the transaction
        const tx = new tbc.Transaction().from(poolnft).from(fttxo_a).from(utxo);
        //poolNft
        tx.addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: poolnft.satoshis - Number(tbc_amount_decrement_swap_lp),
        }));
        const poolnftTapeScript = await this.updatePoolNftTape();
        tx.addOutput(new tbc.Transaction.Output({
            script: poolnftTapeScript,
            satoshis: 0,
        }));
        tx.to(address_to, Number(tbc_amount_decrement_swap));
        // FTAbyC
        const ftCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftCodeScript,
            satoshis: fttxo_a.satoshis,
        }));
        const ftTapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftTapeScript,
            satoshis: 0,
        }));
        // P2PKH_ServiceFee
        if (serviceFeeA >= BigInt(42)) {
            tx.to(lpPlan === 1
                ? "13oCEJaqyyiC8iRrfup6PDL2GKZ3xQrsZL"
                : "1Fa6Uy64Ub4qNdB896zX2pNMx4a8zMhtCy", Number(serviceFeeA));
        }
        // FTAbyA_change
        if (amount_ftbn < fttxo_a.ftBalance) {
            const ftabyaCodeScript = FT.buildFTtransferCode(FTA.codeScript, privateKey.toAddress().toString());
            tx.addOutput(new tbc.Transaction.Output({
                script: ftabyaCodeScript,
                satoshis: fttxo_a.satoshis,
            }));
            const ftabyaTapeScript = FT.buildFTtransferTape(FTA.tapeScript, changeHex);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftabyaTapeScript,
                satoshis: 0,
            }));
        }
        tx.feePerKb(80);
        tx.change(privateKey.toAddress());
        await tx.setInputScriptAsync({
            inputIndex: 0,
        }, async (tx) => {
            const unlockingScript = await this.getPoolNftUnlock(privateKey, tx, 0, poolnft.txId, poolnft.outputIndex, (0, util_1.isLock)(this.poolnft_code.length), 3, 2);
            return unlockingScript;
        });
        await tx.setInputScriptAsync({
            inputIndex: 1,
        }, async (tx) => {
            const unlockingScript = await FTA.getFTunlock(privateKey, tx, ftPreTX[0], ftPrePreTxData[0], 1, fttxo_a.outputIndex);
            return unlockingScript;
        });
        tx.sign(privateKey);
        await tx.sealAsync();
        // console.log(tx.verify());
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    /**
     * 将指定数量的 FT-A 交换为 TBC，并返回交易原始数据(本地输入utxo)。
     *
     * @param {tbc.PrivateKey} privateKey_from - 用于签名交易的私钥。
     * @param {string} address_to - 接收 TBC 的地址。
     * @param {tbc.Transaction.IUnspentOutput} ftutxo - 用于创建交易的 FT-A 未花费输出。
     * @param {tbc.Transaction[]} ftPreTX - 之前的 FT-A 交易列表。
     * @param {string[]} ftPrePreTxData - 之前的 FT-A 交易数据列表。
     * @param {number} amount_token - 要交换的 FT-A 数量。
     * @param {1 | 2} [lpPlan] - 流动性池计划，默认为 1。
     * @param {tbc.Transaction.IUnspentOutput} utxo - 用于创建交易的未花费输出。
     * @returns {Promise<string>} 返回一个 Promise，解析为字符串形式的未检查交易数据。
     *
     */
    async swaptoTBC_baseToken_local(privateKey_from, address_to, ftutxo, ftPreTX, ftPrePreTxData, amount_token, lpPlan, utxo) {
        const privateKey = privateKey_from;
        const fttxo_a = ftutxo;
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        lpPlan =
            this.lp_plan === 1 || this.lp_plan === 2
                ? this.lp_plan
                : lpPlan || 1;
        const amount_ftbn = BigInt(Math.floor(amount_token * Math.pow(10, FTA.decimal)));
        if (amount_token <= 0) {
            throw new Error("Invalid FT amount input");
        }
        const poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex"))).toString("hex");
        // const poolMul = this.ft_a_amount * this.tbc_amount;
        const poolMul = new tbc.crypto.BN(this.ft_a_amount.toString()).mul(new tbc.crypto.BN(this.tbc_amount.toString()));
        const tbc_amount = this.tbc_amount;
        // this.ft_a_amount = BigInt(this.ft_a_amount) + BigInt(amount_ftbn);
        this.ft_a_amount = BigInt(new BN(this.ft_a_amount.toString())
            .add(new BN(amount_ftbn.toString()))
            .toString());
        // this.tbc_amount = BigInt(poolMul) / BigInt(this.ft_a_amount);
        this.tbc_amount = BigInt(poolMul.div(new tbc.crypto.BN(this.ft_a_amount.toString())).toString());
        const tbc_amount_decrement = BigInt(tbc_amount) - BigInt(this.tbc_amount);
        const serviceFee = (tbc_amount_decrement * BigInt(this.service_fee_rate + 10)) /
            BigInt(10000);
        const serviceFeeLP = (tbc_amount_decrement *
            BigInt(lpPlan === 1 ? this.service_fee_rate : 5)) /
            BigInt(10000);
        const serviceFeeA = serviceFee - serviceFeeLP;
        const tbc_amount_decrement_swap = tbc_amount_decrement - serviceFee;
        let tbc_amount_decrement_swap_lp = tbc_amount_decrement_swap;
        if (serviceFeeA >= 42) {
            tbc_amount_decrement_swap_lp = tbc_amount_decrement - serviceFeeLP;
        }
        const tapeAmountSetIn = [];
        tapeAmountSetIn.push(BigInt(fttxo_a.ftBalance));
        // Build the amount and change hex strings for the tape
        const { amountHex, changeHex } = FT.buildTapeAmount(BigInt(amount_ftbn), tapeAmountSetIn, 1);
        const poolnft = await this.fetchPoolNftUTXO(this.contractTxid);
        // Construct the transaction
        const tx = new tbc.Transaction().from(poolnft).from(fttxo_a);
        utxo
            ? tx.from(utxo)
            : tx.addInputFromPrevTx(ftPreTX[0], ftPreTX[0].outputs.length - 1);
        //poolNft
        tx.addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: poolnft.satoshis - Number(tbc_amount_decrement_swap_lp),
        }));
        const poolnftTapeScript = await this.updatePoolNftTape();
        tx.addOutput(new tbc.Transaction.Output({
            script: poolnftTapeScript,
            satoshis: 0,
        }));
        tx.to(address_to, Number(tbc_amount_decrement_swap));
        // FTAbyC
        const ftCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftCodeScript,
            satoshis: fttxo_a.satoshis,
        }));
        const ftTapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftTapeScript,
            satoshis: 0,
        }));
        // P2PKH_ServiceFee
        if (serviceFeeA >= BigInt(42)) {
            tx.to(lpPlan === 1
                ? "13oCEJaqyyiC8iRrfup6PDL2GKZ3xQrsZL"
                : "1Fa6Uy64Ub4qNdB896zX2pNMx4a8zMhtCy", Number(serviceFeeA));
        }
        // FTAbyA_change
        if (amount_ftbn < fttxo_a.ftBalance) {
            const ftabyaCodeScript = FT.buildFTtransferCode(FTA.codeScript, privateKey.toAddress().toString());
            tx.addOutput(new tbc.Transaction.Output({
                script: ftabyaCodeScript,
                satoshis: fttxo_a.satoshis,
            }));
            const ftabyaTapeScript = FT.buildFTtransferTape(FTA.tapeScript, changeHex);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftabyaTapeScript,
                satoshis: 0,
            }));
        }
        tx.feePerKb(80);
        tx.change(privateKey.toAddress());
        const poolNftPreTX = await API.fetchTXraw(poolnft.txId, this.network);
        const poolNftPrePreTX = await API.fetchTXraw(poolNftPreTX.inputs[poolnft.outputIndex].prevTxId.toString("hex"), this.network);
        const inputsTXs = ftPreTX;
        inputsTXs.push(utxo ? await API.fetchTXraw(utxo.txId, this.network) : ftPreTX[0]);
        tx.setInputScript({
            inputIndex: 0,
        }, (tx) => {
            const unlockingScript = this.getPoolNftUnlockOffLine(privateKey, tx, 0, poolNftPreTX, poolNftPrePreTX, inputsTXs, (0, util_1.isLock)(this.poolnft_code.length), 3, 2);
            return unlockingScript;
        });
        tx.setInputScript({
            inputIndex: 1,
        }, (tx) => {
            const unlockingScript = FTA.getFTunlock(privateKey, tx, ftPreTX[0], ftPrePreTxData[0], 1, fttxo_a.outputIndex);
            return unlockingScript;
        });
        tx.sign(privateKey);
        tx.seal();
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    /**
     * 根据合约交易 ID 获取池 NFT 的相关信息。
     *
     * @param {string} contractTxid - 池 NFT 合约的交易 ID。
     * @returns {Promise<PoolNFTInfo>} 返回一个 Promise，解析为包含池 NFT 信息的对象。
     *
     * 该函数执行以下主要步骤：
     * 1. 根据网络环境（测试网或主网）构建请求 URL。
     * 2. 发送 HTTP 请求以获取池 NFT 的信息。
     * 3. 处理响应数据，将其映射到 `PoolNFTInfo` 对象中，包括：
     *    - FT-LP 余额
     *    - FT-A 余额
     *    - TBC 余额
     *    - FT-LP 部分哈希
     *    - FT-A 部分哈希
     *    - FT-A 合约交易 ID
     *    - 池 NFT 代码脚本
     *    - 当前合约交易 ID
     *    - 当前合约输出索引
     *    - 当前合约余额
     * 4. 返回包含上述信息的 `PoolNFTInfo` 对象。
     * 5. 如果请求失败，抛出一个错误。
     */
    async fetchPoolNftInfo(contractTxid) {
        const url_testnet = `https://api.tbcdev.org/api/tbc/pool/poolinfo/poolid/${contractTxid}`;
        const url_mainnet = `https://api.turingbitchain.io/api/tbc/pool/poolinfo/poolid/${contractTxid}`;
        let url = "";
        if (this.network == "testnet") {
            url = url_testnet;
        }
        else if (this.network == "mainnet") {
            url = url_mainnet;
        }
        else {
            url =
                (this.network.endsWith("/") ? this.network : this.network + "/") +
                    `pool/poolinfo/poolid/${contractTxid}`;
        }
        try {
            const response = await (await fetch(url)).json();
            const data = response.data;
            const poolNftInfo = {
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
        }
        catch (error) {
            throw new Error("Failed to fetch PoolNFTInfo.");
        }
    }
    /**
     * 根据合约交易 ID 获取池 NFT 的未花费交易输出 (UTXO)。
     *
     * @param {string} contractTxid - 池 NFT 合约的交易 ID。
     * @returns {Promise<tbc.Transaction.IUnspentOutput>} 返回一个 Promise，解析为包含池 NFT UTXO 的对象。
     *
     * 该函数执行以下主要步骤：
     * 1. 调用 `fetchPoolNFTInfo` 方法获取与指定合约交易 ID 相关的池 NFT 信息。
     * 2. 创建一个 `tbc.Transaction.IUnspentOutput` 对象，包含以下信息：
     *    - `txId`: 当前合约的交易 ID。
     *    - `outputIndex`: 当前合约的输出索引。
     *    - `script`: 池 NFT 的代码脚本。
     *    - `satoshis`: 当前合约的余额（以 satoshis 为单位）。
     * 3. 返回构建好的池 NFT UTXO 对象。
     * 4. 如果在获取信息时发生错误，则抛出一个错误。
     */
    async fetchPoolNftUTXO(contractTxid) {
        try {
            const poolNftInfo = await this.fetchPoolNftInfo(contractTxid);
            const poolnft = {
                txId: poolNftInfo.currentContractTxid,
                outputIndex: poolNftInfo.currentContractVout,
                script: poolNftInfo.poolnft_code,
                satoshis: poolNftInfo.currentContractSatoshi,
            };
            return poolnft;
        }
        catch (error) {
            throw new Error("Failed to fetch PoolNFT UTXO.");
        }
    }
    /**
     * 根据 FT-LP 代码和指定金额获取相应的未花费交易输出 (UTXO)。
     *
     * @param {string} address - 地址。
     * @param {bigint} amount - 要获取的 FT-LP 数量（以 BigInt 表示）。
     * @returns {Promise<tbc.Transaction.IUnspentOutput>} 返回一个 Promise，解析为包含 FT-LP UTXO 的对象。
     *
     * @throws {Error} 如果请求失败或未能找到足够的 UTXO，将抛出错误。
     */
    async fetchFtlpUTXO(address, amount) {
        try {
            const ftUtxoList = await this.fetchFtlpUTXOList(address);
            const checkLockTime = async (utxo) => {
                if (!this.with_lock_time)
                    return true;
                const ftlpTapeScript = (await API.fetchTXraw(utxo.txId, this.network))
                    .outputs[utxo.outputIndex + 1].script;
                const lockTimeFromTape = new tbc.encoding.BufferReader(ftlpTapeScript.chunks[3].buf).readInt32LE();
                return lockTimeFromTape === 0;
            };
            let ftlp = null;
            for (const utxo of ftUtxoList) {
                if (utxo.ftBalance >= amount && (await checkLockTime(utxo))) {
                    ftlp = utxo;
                    break;
                }
            }
            if (!ftlp) {
                const validUtxos = await Promise.all(ftUtxoList.map(async (utxo) => ({
                    utxo,
                    isValid: await checkLockTime(utxo),
                })));
                const ftlpBalance = validUtxos
                    .filter(({ isValid }) => isValid)
                    .reduce((sum, { utxo }) => sum + BigInt(utxo.ftBalance), BigInt(0));
                if (ftlpBalance < amount) {
                    throw new Error("Insufficient FT-LP amount");
                }
                else {
                    throw new Error("Please merge FT-LP UTXOs");
                }
            }
            return ftlp;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * 获取指定地址的FTLP余额。
     *
     * @param {string} address - 要计算 LP 余额的地址。
     * @returns {Promise<bigint>} 返回一个Promise对象，解析为bigint类型的FTLP余额。
     * @throws {Error} 如果请求失败，抛出错误信息。
     */
    async fetchFtlpBalance(address) {
        try {
            const ftUtxoList = await this.fetchFtlpUTXOList(address);
            let ftlpBalance = BigInt(0);
            for (let i = 0; i < ftUtxoList.length; i++) {
                ftlpBalance += BigInt(ftUtxoList[i].ftBalance);
            }
            return ftlpBalance;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * 获取指定地址的所有FTLP未花费交易输出(UTXO)列表。
     *
     * @param {string} address - 要查询FTLP UTXO的地址。
     * @returns {Promise<tbc.Transaction.IUnspentOutput[]>} 返回一个Promise，解析为FTLP UTXO数组。
     * @throws {Error} 如果获取失败，抛出错误信息。
     *
     * 该函数执行以下主要步骤：
     * 1. 初始化FT实例并获取相关信息，包括合约交易ID和网络信息。
     * 2. 根据是否带时间锁生成相应的FTLP代码脚本。
     * 3. 计算FTLP代码的哈希值用于查询。
     * 4. 根据网络类型构建查询URL（测试网、主网或自定义网络）。
     * 5. 发送HTTP请求获取该地址下所有的FTLP UTXO数据。
     * 6. 将响应数据转换为标准的UTXO格式并返回。
     *
     * 返回的UTXO对象包含：
     * - txId: 交易ID
     * - outputIndex: 输出索引
     * - script: FTLP脚本（十六进制字符串）
     * - satoshis: UTXO的satoshis数量
     * - ftBalance: FTLP余额
     */
    async fetchFtlpUTXOList(address) {
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        const ftlpCode = this.with_lock_time ?? false
            ? this.getFtlpCodeWithLockTime(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex")).toString("hex"), address, FTA.tapeScript.length / 2).toBuffer()
            : this.getFtlpCode(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex")).toString("hex"), address, FTA.tapeScript.length / 2).toBuffer();
        const ftlpHash = tbc.crypto.Hash.sha256(ftlpCode).reverse().toString("hex");
        const url_testnet = `https://api.tbcdev.org/api/tbc/pool/lputxo/scriptpubkeyhash/${ftlpHash}`;
        const url_mainnet = `https://api.turingbitchain.io/api/tbc/pool/lputxo/scriptpubkeyhash/${ftlpHash}`;
        let url = "";
        if (this.network == "testnet") {
            url = url_testnet;
        }
        else if (this.network == "mainnet") {
            url = url_mainnet;
        }
        else {
            url =
                (this.network.endsWith("/") ? this.network : this.network + "/") +
                    `pool/lputxo/scriptpubkeyhash/${ftlpHash}`;
        }
        const response = await (await fetch(url)).json();
        const ftUtxoList = response.data.utxos;
        const ftUtxoArray = ftUtxoList.map(data => ({
            txId: data.txid,
            outputIndex: data.index,
            script: ftlpCode.toString("hex"),
            satoshis: data.tbc_balance,
            ftBalance: data.lp_balance,
        }));
        return ftUtxoArray;
    }
    /**
     * 获取指定地址的FTLP锁定时间信息列表。
     *
     * @param {string} address - 要查询FTLP锁定时间的地址。
     * @returns {Promise<Array<{ftBalance: bigint, lockTime: number}>>} 返回一个Promise，解析为包含FTLP余额和锁定时间信息的数组。
     * @throws {Error} 如果查询失败，抛出错误信息。
     *
     * 该函数执行以下主要步骤：
     * 1. 获取指定地址的所有FTLP UTXO列表。
     * 2. 批量处理每个UTXO，提取其对应的锁定时间信息。
     * 3. 对于每个UTXO：
     *    - 获取交易ID和输出索引
     *    - 提取FTLP余额
     *    - 从交易的tape脚本中读取锁定时间
     *    - 根据锁定时间值判断是区块高度锁定还是时间戳锁定
     * 4. 输出锁定信息到控制台（区块高度或UTC时间）
     * 5. 返回包含所有FTLP余额和对应锁定时间的数组
     *
     * 锁定时间解释：
     * - 如果 lockTime < 500000000：表示按区块高度锁定
     * - 如果 lockTime >= 500000000：表示按Unix时间戳锁定
     */
    async fetchFtlpLockTime(address) {
        try {
            const ftUtxoList = await this.fetchFtlpUTXOList(address);
            let lockTimeList = [];
            const batchSize = 1;
            const lockTimeResults = await (0, util_1.fetchInBatches)(ftUtxoList, batchSize, async (batch) => {
                const results = await Promise.all(batch.map(async (utxo) => {
                    const txid = utxo.txId;
                    const index = utxo.outputIndex + 1;
                    const lpBalance = utxo.ftBalance;
                    const ftlpTapeScript = (await API.fetchTXraw(txid, this.network)).outputs[index].script;
                    const lockTime = new tbc.encoding.BufferReader(ftlpTapeScript.chunks[3].buf).readInt32LE();
                    if (lockTime < 500000000)
                        console.log(lpBalance, "Freeze before block height:", lockTime);
                    else
                        console.log(lpBalance, "Freeze before UTC time:", new Date(lockTime * 1000).toISOString());
                    return { ftBalance: lpBalance, lockTime };
                }));
                return results;
            }, "fetchFtlpLockTime");
            lockTimeList = lockTimeResults.flat();
            return lockTimeList;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * @deprecated 此方法已弃用，请勿使用。
     *
     * 计算指定地址的 LP（流动性提供者）收入。
     *
     * 该方法获取 FT（可替代代币）信息，初始化后，根据提供的地址计算 LP 收入。
     * 它使用池的 LP 数量、TBC（代币余额币）数量和其他参数来确定收入。
     *
     * @param {string} address - 要计算 LP 收入的地址。
     * @param {bigint} recordData - 记录的数据。
     * @returns {Promise<bigint>} 一个 Promise，解析为计算出的 LP 收入（bigint类型）。
     */
    async getLpIncome(address, recordData) {
        const my_lp_amount = await this.fetchFtlpBalance(address);
        const pool_lp_amount = BigInt(this.ft_lp_amount);
        const pool_tbc_amount_full = BigInt(this.tbc_amount_full - BigInt(this.poolnft_code_dust));
        const ratio = (pool_lp_amount * BigInt(this.precision)) / BigInt(my_lp_amount);
        const my_tbc_amount = (pool_tbc_amount_full * BigInt(this.precision)) / ratio;
        const my_income = my_tbc_amount - recordData;
        return my_income;
    }
    /**
     * 合并 FT-LP UTXO，并返回合并交易的原始数据或成功标志。
     *
     * @param {tbc.PrivateKey} privateKey_from - 用于签名交易的私钥。
     * @param {tbc.Transaction.IUnspentOutput} utxo - 用于创建交易的未花费输出。
     * @param {number} [lock_time] - 可选的锁定时间参数。
     * @returns {Promise<boolean | string>} 返回一个 Promise，解析为布尔值表示合并是否成功，或返回合并交易的原始数据。
     *
     * 该函数执行以下主要步骤：
     * 1. 初始化 FT 实例并获取相关信息，包括合约交易 ID 和网络信息。
     * 2. 计算 FT-LP 代码的哈希值，并构建请求 URL（根据网络环境选择测试网或主网）。
     * 3. 发送 HTTP 请求以获取与指定 FT-LP 代码相关的 UTXO 列表。
     * 4. 检查 UTXO 列表，如果没有可用的 FT UTXO，则抛出错误。
     * 5. 如果只有一个 UTXO，记录成功并返回 true；否则，遍历 UTXO 列表，收集余额和交易信息。
     * 6. 验证是否有足够的 FT-LP 金额进行合并，如果不足则抛出错误。
     * 7. 构建用于合并的交易，包括输入和输出，设置交易费用和找零地址。
     * 8. 异步设置输入脚本以解锁相应的 UTXO，并签名交易。
     * 9. 封装交易并返回序列化后的未检查交易数据以供发送。
     *
     * @throws {Error} 如果请求失败或未能找到足够的 UTXO，将抛出错误。
     */
    async mergeFTLP(privateKey_from, utxo, lock_time) {
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        const privateKey = privateKey_from;
        const address = privateKey.toAddress().toString();
        try {
            const ftUtxoList = await this.fetchFtlpUTXOList(address);
            const ftutxo_codeScript = ftUtxoList[0].script;
            // console.log(response.ftUtxoList);
            let ftutxo = [];
            let lockTimeMax = 0;
            if (ftUtxoList.length === 0) {
                throw new Error("No FT UTXO available");
            }
            if (ftUtxoList.length === 1) {
                console.log("Merge Success!");
                return true;
            }
            else {
                if (this.with_lock_time) {
                    const currentBlockHeight = (await API.fetchBlockHeaders(this.network))[0].height - 2; // subtract 2 to ensure safety
                    const currentTime = Math.floor(Date.now() / 1000) - 1800; // subtract 30 minutes to ensure safety
                    for (let i = 0; i < ftUtxoList.length && ftutxo.length < 6; i++) {
                        const ftlpTapeScript = (await API.fetchTXraw(ftUtxoList[i].txId, this.network)).outputs[ftUtxoList[i].outputIndex + 1].script;
                        const lockTimeFromTape = new tbc.encoding.BufferReader(ftlpTapeScript.chunks[3].buf).readInt32LE();
                        if (lock_time) {
                            if (lockTimeFromTape === 0) {
                                ftutxo.push(ftUtxoList[i]);
                            }
                            else if (lock_time < 500000000 && lockTimeFromTape <= lock_time) {
                                ftutxo.push(ftUtxoList[i]);
                            }
                            else if (lockTimeFromTape >= 500000000 && lockTimeFromTape <= lock_time) {
                                ftutxo.push(ftUtxoList[i]);
                            }
                        }
                        else {
                            lockTimeMax = Math.max(lockTimeMax, lockTimeFromTape);
                            if (lockTimeFromTape < 500000000 &&
                                lockTimeFromTape <= currentBlockHeight)
                                ftutxo.push(ftUtxoList[i]);
                            else if (lockTimeFromTape >= 500000000 && lockTimeFromTape <= currentTime)
                                ftutxo.push(ftUtxoList[i]);
                        }
                    }
                    if (!lock_time) {
                        lockTimeMax < 500000000
                            ? (lockTimeMax = Math.min(lockTimeMax, currentBlockHeight))
                            : (lockTimeMax = Math.min(lockTimeMax, currentTime));
                    }
                    if (ftutxo.length === 0) {
                        throw new Error("No unlockable FTLP UTXO");
                    }
                }
                else {
                    for (let i = 0; i < ftUtxoList.length && i < 5; i++) {
                        ftutxo.push(ftUtxoList[i]);
                    }
                }
            }
            const tapeAmountSetIn = [];
            const ftPreTX = [];
            const ftPrePreTxData = [];
            let tapeAmountSum = BigInt(0);
            for (let i = 0; i < ftutxo.length; i++) {
                tapeAmountSetIn.push(ftutxo[i].ftBalance);
                tapeAmountSum += BigInt(ftutxo[i].ftBalance);
                ftPreTX.push(await API.fetchTXraw(ftutxo[i].txId, this.network));
                ftPrePreTxData.push(await API.fetchFtPrePreTxData(ftPreTX[i], ftutxo[i].outputIndex, this.network));
            }
            const { amountHex, changeHex } = FT.buildTapeAmount(tapeAmountSum, tapeAmountSetIn);
            if (changeHex !=
                "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000") {
                throw new Error("Change amount is not zero");
            }
            const tx = new tbc.Transaction().from(ftutxo).from(utxo);
            const codeScript = FT.buildFTtransferCode(ftutxo_codeScript, address);
            tx.addOutput(new tbc.Transaction.Output({
                script: codeScript,
                satoshis: 500,
            }));
            let tapeScript;
            if (this.with_lock_time) {
                const amountwriter = new tbc.encoding.BufferWriter();
                for (let i = 0; i < 6; i++) {
                    amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
                }
                const ftlpTapeAmount = amountwriter.toBuffer().toString("hex");
                const lockTimeHex = Buffer.from("00000000", "hex").toString("hex");
                const fillSize = FTA.tapeScript.length / 2 - 62;
                const opZeroArray = Array(fillSize).fill("OP_0").join(" ");
                const ftlpTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${ftlpTapeAmount} ${lockTimeHex} ${opZeroArray} 4654617065`);
                tapeScript = FT.buildFTtransferTape(ftlpTapeScript.toHex(), amountHex);
            }
            else {
                tapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
            }
            tx.addOutput(new tbc.Transaction.Output({
                script: tapeScript,
                satoshis: 0,
            }));
            tx.feePerKb(80);
            tx.change(privateKey.toAddress());
            for (let i = 0; i < ftutxo.length; i++) {
                if (this.with_lock_time)
                    tx.setInputSequence(i, 4294967294);
                await tx.setInputScriptAsync({
                    inputIndex: i,
                }, async (tx) => {
                    const unlockingScript = await FTA.getFTunlock(privateKey, tx, ftPreTX[i], ftPrePreTxData[i], i, ftutxo[i].outputIndex);
                    return unlockingScript;
                });
            }
            tx.sign(privateKey);
            if (this.with_lock_time)
                tx.setLockTime(lock_time || lockTimeMax);
            await tx.sealAsync();
            const txraw = tx.uncheckedSerialize();
            console.log("Merge FTLPUTXO:");
            //await API.broadcastTXraw(txraw, this.network);
            // // wait 5 seconds
            // await new Promise(resolve => setTimeout(resolve, 5000));
            // await this.mergeFTLP(privateKey);
            return txraw;
        }
        catch (error) {
            throw new Error("Merge Faild!." + error.message);
        }
    }
    /**
    * 销毁FTLP代币。
    *
    * @param {tbc.PrivateKey} privateKey_from - 用于签名交易的私钥。
    * @param {tbc.Transaction.IUnspentOutput} utxo - 用于创建交易的未花费输出。
    * @returns {Promise<string>} 返回一个Promise，解析为字符串形式的未检查交易数据。
    *
    * 该函数执行以下主要步骤：
    * 1. 初始化FT实例并获取相关信息，包括合约交易ID和网络信息。
    * 2. 获取指定地址的所有FTLP UTXO列表（最多5个）。
    * 3. 如果没有可用的FT UTXO，则抛出错误。
    * 4. 获取所有FTLP UTXO的前置交易数据和余额信息。
    * 5. 构建销毁交易的金额数据，确保找零金额为零。
    * 6. 创建交易，将所有FTLP UTXO作为输入，将代币转移到黑洞地址（1BitcoinEaterAddressDontSendf59kuE）。
    * 7. 构建代码脚本和tape脚本用于销毁操作。
    * 8. 设置每千字节的交易费用，并指定找零地址。
    * 9. 为每个输入设置解锁脚本并签名交易。
    * 10. 封装交易并返回序列化后的未检查交易数据。
    *
    * @throws {Error} 如果没有可用的FT UTXO或找零金额不为零，将抛出错误。
    */
    async burnFTLP(privateKey_from, utxo) {
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        const privateKey = privateKey_from;
        const address = privateKey.toAddress().toString();
        try {
            const ftUtxoList = await this.fetchFtlpUTXOList(address);
            const ftutxo_codeScript = ftUtxoList[0].script;
            let ftutxo = [];
            if (ftUtxoList.length === 0) {
                throw new Error("No FT UTXO available");
            }
            for (let i = 0; i < ftUtxoList.length && i < 5; i++) {
                ftutxo.push(ftUtxoList[i]);
            }
            const tapeAmountSetIn = [];
            const ftPreTX = [];
            const ftPrePreTxData = [];
            let tapeAmountSum = BigInt(0);
            for (let i = 0; i < ftutxo.length; i++) {
                tapeAmountSetIn.push(ftutxo[i].ftBalance);
                tapeAmountSum += BigInt(ftutxo[i].ftBalance);
                ftPreTX.push(await API.fetchTXraw(ftutxo[i].txId, this.network));
                ftPrePreTxData.push(await API.fetchFtPrePreTxData(ftPreTX[i], ftutxo[i].outputIndex, this.network));
            }
            const { amountHex, changeHex } = FT.buildTapeAmount(tapeAmountSum, tapeAmountSetIn);
            if (changeHex !=
                "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000") {
                throw new Error("Change amount is not zero");
            }
            const tx = new tbc.Transaction().from(ftutxo).from(utxo);
            const codeScript = FT.buildFTtransferCode(ftutxo_codeScript, "1BitcoinEaterAddressDontSendf59kuE");
            tx.addOutput(new tbc.Transaction.Output({
                script: codeScript,
                satoshis: 500,
            }));
            const tapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
            tx.addOutput(new tbc.Transaction.Output({
                script: tapeScript,
                satoshis: 0,
            }));
            tx.feePerKb(80);
            tx.change(privateKey.toAddress());
            for (let i = 0; i < ftutxo.length; i++) {
                tx.setInputScript({
                    inputIndex: i,
                }, (tx) => {
                    const unlockingScript = FTA.getFTunlock(privateKey, tx, ftPreTX[i], ftPrePreTxData[i], i, ftutxo[i].outputIndex);
                    return unlockingScript;
                });
            }
            tx.sign(privateKey);
            tx.seal();
            const txraw = tx.uncheckedSerialize();
            return txraw;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * 合并池中的 FT UTXO，并返回合并交易的原始数据。
     *
     * @param {tbc.PrivateKey} privateKey_from - 用于签名交易的私钥。
     * @param {tbc.Transaction.IUnspentOutput} utxo - 用于创建交易的未花费输出。
     * @param {number} [times] - 可选参数，指定合并操作的次数， 默认为1。
     * @returns {Promise<Array<{ txraw: string }>>} 返回一个 Promise，解析为包含交易原始数据的数组。
     * @throws {Error} 如果请求失败或未能找到足够的 UTXO，将抛出错误。
     */
    async mergeFTinPool(privateKey_from, utxo, times) {
        const privateKey = privateKey_from;
        try {
            const FTA = new FT(this.ft_a_contractTxid);
            const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
            FTA.initialize(FTAInfo);
            const poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex"))).toString("hex");
            const ftutxo_codeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160)
                .toBuffer()
                .toString("hex");
            const ftutxolist = await API.fetchFtUTXOList(this.ft_a_contractTxid, poolnft_codehash160, ftutxo_codeScript, this.network);
            ftutxolist.sort((a, b) => (b.ftBalance > a.ftBalance ? 1 : -1));
            let ftutxos = ftutxolist.slice(0, 4);
            let txsraw = [];
            const poolnft = await this.fetchPoolNftUTXO(this.contractTxid);
            let poolnftPreTX = await API.fetchTXraw(poolnft.txId, this.network);
            let poolnftPrePreTX = await API.fetchTXraw(poolnftPreTX.inputs[0].prevTxId.toString("hex"), this.network);
            let tx = new tbc.Transaction();
            for (let i = 0; i < (times ?? 1) && ftutxos.length > 1; i++) {
                let retryCount = 0;
                const maxRetries = 3;
                let success = false;
                while (!success && retryCount < maxRetries) {
                    try {
                        if (i === 0) {
                            tx = await this._mergeFTinPool(privateKey, poolnftPreTX, poolnftPrePreTX, ftutxos, FTA, txsraw, utxo);
                        }
                        else {
                            tx = await this._mergeFTinPool(privateKey, poolnftPreTX, poolnftPrePreTX, ftutxos, FTA, txsraw);
                        }
                        poolnftPrePreTX = poolnftPreTX;
                        poolnftPreTX = tx;
                        ftutxos = ftutxolist.slice((i + 1) * 4, (i + 2) * 4);
                        success = true;
                    }
                    catch (error) {
                        retryCount++;
                        if (retryCount >= maxRetries) {
                            console.error(`Merge success ${i + 1} times`);
                            return txsraw;
                        }
                    }
                }
            }
            //console.log("txsraw:", txsraw);
            return txsraw;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * 将FT UTXO合并到池NFT的交易中。
     *
     * @param privateKey - 用于签名交易的私钥。
     * @param poolnftPreTX - 包含池NFT UTXO的前一个交易。
     * @param poolnftPrePreTX - 用于验证的`poolnftPreTX`之前的交易。
     * @param ftutxos - 要合并到池中的可替代代币UTXO数组。
     * @param FTA - 用于处理FT操作的FT（可替代代币）类的实例。
     * @param txsraw - 用于存储原始序列化交易的数组。
     * @param utxo - （可选）要包含在交易中的额外UTXO。
     * @returns 一个Promise，解析为构建并签名的交易。
     * @throws 如果合并操作失败，则抛出错误。
     */
    async _mergeFTinPool(privateKey, poolnftPreTX, poolnftPrePreTX, ftutxos, FTA, txsraw, utxo) {
        const poolnft = {
            txId: poolnftPreTX.hash,
            outputIndex: 0,
            script: this.poolnft_code,
            satoshis: poolnftPreTX.outputs[0].satoshis,
        };
        const poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex"))).toString("hex");
        try {
            const tapeAmountSetIn = [];
            let ftPreTX = [];
            let ftPrePreTxData = [];
            let tapeAmountSum = BigInt(0);
            for (let i = 0; i < ftutxos.length; i++) {
                tapeAmountSetIn.push(ftutxos[i].ftBalance);
                tapeAmountSum += BigInt(ftutxos[i].ftBalance);
                // ftPreTX.push(await API.fetchTXraw(ftutxos[i].txId, this.network));
                // ftPrePreTxData.push(await API.fetchFtPrePreTxData(ftPreTX[i], ftutxos[i].outputIndex, this.network));
            }
            const batchSize = 300;
            ftPreTX = await (0, util_1.fetchInBatches)(ftutxos, batchSize, (batch) => Promise.all(batch.map((utxo) => API.fetchTXraw(utxo.txId, this.network))), "fetchFtPreTXData");
            ftPrePreTxData = await (0, util_1.fetchInBatches)(ftutxos, batchSize, (batch) => Promise.all(batch.map((utxo) => {
                const globalIndex = ftutxos.indexOf(utxo);
                return API.fetchFtPrePreTxData(ftPreTX[globalIndex], utxo.outputIndex, this.network);
            })), "fetchFtPrePreTxData");
            const { amountHex, changeHex } = FT.buildTapeAmount(tapeAmountSum, tapeAmountSetIn, 1);
            if (changeHex !=
                "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000") {
                throw new Error("Change amount is not zero");
            }
            // const contractTX = await API.fetchTXraw(poolnft.txId, this.network);
            const tx = new tbc.Transaction().from(poolnft).from(ftutxos);
            utxo ? tx.from(utxo) : tx.addInputFromPrevTx(poolnftPreTX, 4);
            //poolNft
            tx.addOutput(new tbc.Transaction.Output({
                script: tbc.Script.fromHex(this.poolnft_code),
                satoshis: poolnft.satoshis,
            }));
            const poolnftTapeScript = await this.updatePoolNftTape();
            tx.addOutput(new tbc.Transaction.Output({
                script: poolnftTapeScript,
                satoshis: 0,
            }));
            //FTAbyC
            const codeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
            tx.addOutput(new tbc.Transaction.Output({
                script: codeScript,
                satoshis: 500,
            }));
            const tapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
            tx.addOutput(new tbc.Transaction.Output({
                script: tapeScript,
                satoshis: 0,
            }));
            tx.feePerKb(80);
            tx.change(privateKey.toAddress());
            //除第一个输入，剩余的输入交易存入inputsTXs
            const inputsTXs = ftPreTX;
            inputsTXs.push(utxo ? await API.fetchTXraw(utxo.txId, this.network) : poolnftPreTX);
            await tx.setInputScriptAsync({
                inputIndex: 0,
            }, async (tx) => {
                const unlockingScript = await this.getPoolNftUnlockOffLine(privateKey, tx, 0, poolnftPreTX, poolnftPrePreTX, inputsTXs, (0, util_1.isLock)(this.poolnft_code.length), 4);
                return unlockingScript;
            });
            const contractTX = poolnftPreTX;
            for (let i = 0; i < ftutxos.length; i++) {
                await tx.setInputScriptAsync({
                    inputIndex: i + 1,
                }, async (tx) => {
                    const unlockingScript = await FTA.getFTunlockSwap(privateKey, tx, ftPreTX[i], ftPrePreTxData[i], contractTX, i + 1, ftutxos[i].outputIndex);
                    return unlockingScript;
                });
            }
            tx.sign(privateKey);
            await tx.sealAsync();
            const txraw = tx.uncheckedSerialize();
            txsraw.push({ txraw: txraw });
            console.log(txraw.length / 2000);
            console.log("Merge FtUTXOinPool");
            // console.log(tx.toObject());
            // console.log(tx.verify());
            return tx;
        }
        catch (error) {
            throw new Error("Merge Faild!." + error.message);
        }
    }
    /**
     * @deprecated 此方法已弃用，请勿使用。
     * 初始化带时间锁的池 NFT 的创建过程。
     *
     * @param {tbc.PrivateKey} privateKey_from - 用于签名交易的私钥。
     * @param {string} address_to - FT-LP 接收地址。
     * @param {tbc.Transaction.IUnspentOutput} utxo - 用于创建交易的未花费输出。
     * @param {number} tbc_amount - TBC 数量。
     * @param {number} ft_a - FT-A 数量。
     * @param {number} lock_time - 时间锁参数。
     * @returns {Promise<string>} 返回一个 Promise，解析为字符串形式的未检查交易数据。
     *
     * 该函数执行以下主要步骤：
     * 1. 初始化 FT 实例并获取相关信息，包括合约交易 ID 和网络信息。
     * 2. 根据输入参数计算 LP 和 FT-A 的金额，确保输入有效并处理不同情况。
     * 3. 检查 UTXO 是否有足够的 TBC 金额，抛出错误如果不足。
     * 4. 计算池 NFT 代码的哈希值，并验证 FT-A 的最大金额限制。
     * 5. 获取 FT-A 的 UTXO 和相关交易数据，确保有足够的 FT-A 金额进行交易。
     * 6. 构建用于池 NFT 和 FT-A 转移的脚本，并设置相关输出。
     * 7. 构建带锁时间的 FT LP 脚本，包含锁定信息，并添加到交易中。
     * 8. 根据需要添加找零输出，确保所有金额正确处理。
     * 9. 设置每千字节的交易费用，并指定找零地址。
     * 10. 异步设置输入脚本以解锁相应的 UTXO，并签名交易。
     * 11. 封装交易并返回序列化后的未检查交易数据以供发送。
     */
    async initPoolNFTWithLockTime(privateKey_from, address_to, utxo, tbc_amount, ft_a, lock_time) {
        const privateKey = privateKey_from;
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        let amount_lpbn = BigInt(0);
        if (tbc_amount > 0 && ft_a > 0) {
            amount_lpbn = BigInt(Math.floor(tbc_amount * Math.pow(10, 6)));
            this.tbc_amount = BigInt(Math.floor(tbc_amount * Math.pow(10, 6)));
            this.ft_lp_amount = this.tbc_amount;
            this.ft_a_number = ft_a;
            this.ft_a_amount = BigInt(Math.floor(this.ft_a_number * Math.pow(10, FTA.decimal)));
        }
        else {
            throw new Error("Invalid amount Input");
        }
        const tapeAmountSetIn = [];
        if (utxo.satoshis < Number(this.tbc_amount)) {
            throw new Error("Insufficient TBC amount, please merge UTXOs");
        }
        const poolnft_codehash = tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex"));
        const poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(poolnft_codehash).toString("hex");
        const maxAmount = Math.floor(Math.pow(10, 18 - FTA.decimal));
        if (this.ft_a_number > maxAmount) {
            throw new Error(`When decimal is ${FTA.decimal}, the maximum amount cannot exceed ${maxAmount}`);
        }
        const ftutxo_codeScript = FT.buildFTtransferCode(FTA.codeScript, privateKey.toAddress().toString())
            .toBuffer()
            .toString("hex");
        let fttxo_a;
        try {
            fttxo_a = await API.fetchFtUTXO(this.ft_a_contractTxid, privateKey.toAddress().toString(), this.ft_a_amount, ftutxo_codeScript, this.network);
        }
        catch (error) {
            throw new Error(error.message);
        }
        const ftPreTX = await API.fetchTXraw(fttxo_a.txId, this.network);
        const ftPrePreTxData = await API.fetchFtPrePreTxData(ftPreTX, fttxo_a.outputIndex, this.network);
        if (fttxo_a.ftBalance < this.ft_a_amount) {
            throw new Error("Insufficient FT-A amount, please merge FT-A UTXOs");
        }
        tapeAmountSetIn.push(fttxo_a.ftBalance);
        let tapeAmountSum = BigInt(0);
        for (let i = 0; i < tapeAmountSetIn.length; i++) {
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
        }
        const { amountHex, changeHex } = FT.buildTapeAmount(this.ft_a_amount, tapeAmountSetIn, 1);
        const poolnftTapeScript = await this.updatePoolNftTape();
        const poolnft = await this.fetchPoolNftUTXO(this.contractTxid);
        const tx = new tbc.Transaction()
            .from(poolnft)
            .from(fttxo_a)
            .from(utxo)
            //poolNft
            .addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: this.poolnft_code_dust + Number(this.tbc_amount),
        }))
            .addOutput(new tbc.Transaction.Output({
            script: poolnftTapeScript,
            satoshis: 0,
        }));
        //FTAbyC
        const ftCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
        const ftTapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftCodeScript,
            satoshis: fttxo_a.satoshis,
        })).addOutput(new tbc.Transaction.Output({
            script: ftTapeScript,
            satoshis: 0,
        }));
        //FTLP
        const ftlp_amount = new tbc.crypto.BN(amount_lpbn.toString());
        const amountwriter = new tbc.encoding.BufferWriter();
        amountwriter.writeUInt64LEBN(ftlp_amount);
        for (let i = 1; i < 6; i++) {
            amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
        }
        const ftlpTapeAmount = amountwriter.toBuffer().toString("hex");
        if (lock_time < 0 || lock_time > 4294967295) {
            throw new Error("Invalid lock time, must be between 0 and 4294967295");
        }
        const lockTimeWriter = new tbc.encoding.BufferWriter();
        lockTimeWriter.writeUInt32LE(lock_time);
        const lockTimeHex = lockTimeWriter.toBuffer().toString("hex");
        // Build the tape script
        const fillSize = FTA.tapeScript.length / 2 - 62;
        const opZeroArray = Array(fillSize).fill("OP_0").join(" ");
        const ftlpTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${ftlpTapeAmount} ${lockTimeHex} ${opZeroArray} 4654617065`);
        const tapeSize = ftlpTapeScript.toBuffer().length;
        const ftlpCodeScript = this.getFtlpCodeWithLockTime(poolnft_codehash.toString("hex"), address_to, tapeSize);
        // console.log(partial_sha256.calculate_partial_hash(ftlpCodeScript.toBuffer().subarray(0, 1536)));
        tx.addOutput(new tbc.Transaction.Output({
            script: ftlpCodeScript,
            satoshis: 500,
        }));
        tx.addOutput(new tbc.Transaction.Output({
            script: ftlpTapeScript,
            satoshis: 0,
        }));
        if (this.ft_a_amount < tapeAmountSum) {
            const changeCodeScript = FT.buildFTtransferCode(FTA.codeScript, privateKey.toAddress().toString());
            tx.addOutput(new tbc.Transaction.Output({
                script: changeCodeScript,
                satoshis: fttxo_a.satoshis,
            }));
            const changeTapeScript = FT.buildFTtransferTape(FTA.tapeScript, changeHex);
            tx.addOutput(new tbc.Transaction.Output({
                script: changeTapeScript,
                satoshis: 0,
            }));
        }
        tx.feePerKb(80);
        tx.change(privateKey.toAddress());
        await tx.setInputScriptAsync({
            inputIndex: 0,
        }, async (tx) => {
            const unlockingScript = await this.getPoolNftUnlock(privateKey, tx, 0, poolnft.txId, poolnft.outputIndex, 0, 1);
            return unlockingScript;
        });
        await tx.setInputScriptAsync({
            inputIndex: 1,
        }, async (tx) => {
            const unlockingScript = await FTA.getFTunlock(privateKey, tx, ftPreTX, ftPrePreTxData, 1, fttxo_a.outputIndex);
            return unlockingScript;
        });
        tx.sign(privateKey);
        await tx.sealAsync();
        // console.log(tx.verify());
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    /**
     * @deprecated 此方法已弃用，请勿使用。
     * 增加带时间锁的流动性池中的 LP。
     *
     * @param {tbc.PrivateKey} privateKey_from - 用于签名交易的私钥。
     * @param {string} address_to - LP 接收地址。
     * @param {tbc.Transaction.IUnspentOutput} utxo - 用于创建交易的未花费输出。
     * @param {number} amount_tbc - 增加的 TBC 数量。
     * @param {number} lock_time - 时间锁参数。
     * @returns {Promise<string>} 返回一个 Promise，解析为字符串形式的未检查交易数据。
     *
     * 该函数执行以下主要步骤：
     * 1. 初始化 FT 实例并获取相关信息，包括合约交易 ID 和网络信息。
     * 2. 将输入的 TBC 数量转换为 BigInt，并更新流动性池的数据。
     * 3. 计算池 NFT 的哈希值，并验证是否有足够的 FT-A 和 TBC 金额进行交易。
     * 4. 获取 FT-A 的 UTXO 和相关交易数据，确保有足够的 FT-A 金额进行流动性增加。
     * 5. 构建用于池 NFT 和 FT-A 转移的脚本，并设置相关输出。
     * 6. 构建带锁时间的 FT LP 脚本，包含锁定信息，并添加到交易中。
     * 7. 根据需要添加找零输出，确保所有金额正确处理。
     * 8. 设置每千字节的交易费用，并指定找零地址。
     * 9. 异步设置输入脚本以解锁相应的 UTXO，并签名交易。
     * 10. 封装交易并返回序列化后的未检查交易数据以供发送。
     */
    async increaseLpWithLockTime(privateKey_from, address_to, utxo, amount_tbc, lock_time) {
        const lockStatus = this.with_lock === true ? 1 : 0 || (0, util_1.isLock)(this.poolnft_code.length);
        // console.log(`Lock status: ${lockStatus}`);
        if (lockStatus)
            amount_tbc -= 5;
        if (amount_tbc <= 0)
            throw new Error("Invalid TBC amount input");
        const privateKey = privateKey_from;
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        const amount_tbcbn = BigInt(Math.floor(amount_tbc * Math.pow(10, 6)));
        const changeDate = this.updatePoolNFT(amount_tbc, FTA.decimal, 2);
        const poolnft_codehash = tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex"));
        const poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(poolnft_codehash).toString("hex");
        const tapeAmountSetIn = [];
        const ftutxo_codeScript = FT.buildFTtransferCode(FTA.codeScript, privateKey.toAddress().toString())
            .toBuffer()
            .toString("hex");
        let fttxo_a;
        try {
            fttxo_a = await API.fetchFtUTXO(this.ft_a_contractTxid, privateKey.toAddress().toString(), changeDate.ft_a_difference, ftutxo_codeScript, this.network);
        }
        catch (error) {
            const errorMessage = error.message === "Insufficient FTbalance, please merge FT UTXOs"
                ? "Insufficient FT-A amount, please merge FT-A UTXOs"
                : error.message;
            throw new Error(errorMessage);
        }
        const ftPreTX = await API.fetchTXraw(fttxo_a.txId, this.network);
        const ftPrePreTxData = await API.fetchFtPrePreTxData(ftPreTX, fttxo_a.outputIndex, this.network);
        tapeAmountSetIn.push(fttxo_a.ftBalance);
        let tapeAmountSum = BigInt(0);
        for (let i = 0; i < tapeAmountSetIn.length; i++) {
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
        }
        if (changeDate.ft_a_difference > tapeAmountSum) {
            throw new Error("Insufficient balance, please merge FT UTXOs");
        }
        let { amountHex, changeHex } = FT.buildTapeAmount(changeDate.ft_a_difference, tapeAmountSetIn, 1);
        if (utxo.satoshis < Number(amount_tbcbn)) {
            throw new Error("Insufficient TBC amount, please merge UTXOs");
        }
        const poolnft = await this.fetchPoolNftUTXO(this.contractTxid);
        // Construct the transaction
        const tx = new tbc.Transaction().from(poolnft).from(fttxo_a).from(utxo);
        tx.addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: poolnft.satoshis + Number(changeDate.tbc_amount_difference),
        }));
        const poolnftTapeScript = await this.updatePoolNftTape();
        tx.addOutput(new tbc.Transaction.Output({
            script: poolnftTapeScript,
            satoshis: 0,
        }));
        // FTAbyC
        const ftabycCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftabycCodeScript,
            satoshis: fttxo_a.satoshis,
        }));
        const ftabycTapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftabycTapeScript,
            satoshis: 0,
        }));
        // FTLP
        const ftlp_amount = new tbc.crypto.BN(changeDate.ft_lp_difference.toString());
        const amountwriter = new tbc.encoding.BufferWriter();
        amountwriter.writeUInt64LEBN(ftlp_amount);
        for (let i = 1; i < 6; i++) {
            amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
        }
        const ftlpTapeAmount = amountwriter.toBuffer().toString("hex");
        if (lock_time < 0 || lock_time > 4294967295) {
            throw new Error("Invalid lock time, must be between 0 and 4294967295");
        }
        const lockTimeWriter = new tbc.encoding.BufferWriter();
        lockTimeWriter.writeUInt32LE(lock_time);
        const lockTimeHex = lockTimeWriter.toBuffer().toString("hex");
        // Build the tape script
        const fillSize = FTA.tapeScript.length / 2 - 62;
        const opZeroArray = Array(fillSize).fill("OP_0").join(" ");
        const ftlpTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${ftlpTapeAmount} ${lockTimeHex} ${opZeroArray} 4654617065`);
        const tapeSize = ftlpTapeScript.toBuffer().length;
        const ftlpCodeScript = this.getFtlpCodeWithLockTime(poolnft_codehash.toString("hex"), address_to, tapeSize);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftlpCodeScript,
            satoshis: 500,
        }));
        tx.addOutput(new tbc.Transaction.Output({
            script: ftlpTapeScript,
            satoshis: 0,
        }));
        // P2PKH (若带锁则扣除)
        if (lockStatus) {
            const lpCostAddress = (0, util_1.getLpCostAddress)(this.poolnft_code);
            const lpCostAmount = (0, util_1.getLpCostAmount)(this.poolnft_code);
            // console.log(`Lock address: ${lpCostAddress}` + `, Lock amount: ${lpCostAmount}`);
            tx.to(lpCostAddress, lpCostAmount);
        }
        if (changeDate.ft_a_difference < tapeAmountSum) {
            // FTAbyA_change
            const ftabya_changeCodeScript = FT.buildFTtransferCode(FTA.codeScript, privateKey.toAddress().toString());
            tx.addOutput(new tbc.Transaction.Output({
                script: ftabya_changeCodeScript,
                satoshis: fttxo_a.satoshis,
            }));
            const ftabya_changeTapeScript = FT.buildFTtransferTape(FTA.tapeScript, changeHex);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftabya_changeTapeScript,
                satoshis: 0,
            }));
        }
        tx.feePerKb(80);
        tx.change(privateKey.toAddress());
        await tx.setInputScriptAsync({
            inputIndex: 0,
        }, async (tx) => {
            const unlockingScript = await this.getPoolNftUnlock(privateKey, tx, 0, poolnft.txId, poolnft.outputIndex, lockStatus, 1);
            return unlockingScript;
        });
        await tx.setInputScriptAsync({
            inputIndex: 1,
        }, async (tx) => {
            const unlockingScript = await FTA.getFTunlock(privateKey, tx, ftPreTX, ftPrePreTxData, 1, fttxo_a.outputIndex);
            return unlockingScript;
        });
        tx.sign(privateKey);
        await tx.sealAsync();
        // console.log(tx.verify());
        // console.log(tx.toObject());
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    /**
     * @deprecated 此方法已弃用，请勿使用。
     * 消耗带时间锁流动性池中的 LP。
     *
     * @param {tbc.PrivateKey} privateKey_from - 用于签名交易的私钥。
     * @param {string} address_to - LP 转移接收地址。
     * @param {tbc.Transaction.IUnspentOutput} utxo - 用于创建交易的未花费输出。
     * @param {number} amount_lp - 要消耗的 LP 数量。
     * @returns {Promise<string>} 返回一个 Promise，解析为字符串形式的未检查交易数据。
     *
     * 该函数执行以下主要步骤：
     * 1. 初始化 FT 实例并获取相关信息，包括合约交易 ID 和网络信息。
     * 2. 将输入的 LP 数量转换为 BigInt，并验证是否有足够的 LP 可供消耗。
     * 3. 更新池 NFT 的状态，并计算相关的哈希值。
     * 4. 获取带锁的流动性池 UTXO 和 FT UTXO，确保有足够的余额进行交易。
     * 5. 构建用于流动性池和 FT 转移的脚本，并设置相关输出。
     * 6. 构建带锁时间的 FT LP 脚本，包含锁定信息，并添加到交易中。
     * 7. 根据需要添加找零输出，确保所有金额正确处理。
     * 8. 设置每千字节的交易费用，并指定找零地址。
     * 9. 异步设置输入脚本以解锁相应的 UTXO，并签名交易。
     * 10. 设置输入序列和锁定时间。
     * 11. 封装交易并返回序列化后的未检查交易数据以供发送。
     */
    async consumeLpWithLockTime(privateKey_from, address_to, utxo, amount_lp) {
        const privateKey = privateKey_from;
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        const amount_lpbn = BigInt(Math.floor(amount_lp * Math.pow(10, 6)));
        if (this.ft_lp_amount < amount_lpbn) {
            throw new Error("Invalid FT-LP amount input");
        }
        const changeDate = this.updatePoolNFT(amount_lp, FTA.decimal, 1);
        const poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex"))).toString("hex");
        const tapeAmountSetIn = [];
        const lpTapeAmountSetIn = [];
        const ftPreTX = [];
        const ftPrePreTxData = [];
        const ftlpCode = this.getFtlpCodeWithLockTime(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex")).toString("hex"), privateKey.toAddress().toString(), FTA.tapeScript.length / 2);
        let fttxo_lp;
        try {
            fttxo_lp = await this.fetchFtlpUTXO(privateKey.toAddress().toString(), changeDate.ft_lp_difference);
            // fttxo_lp = {
            //     txId: "8d946b6459eed3c98fa50c286b5d6d223217cdf8c73e99dc4f8ae9ab51753f69",
            //     outputIndex: 4,
            //     satoshis: 500,
            //     script: "",
            //     ftBalance: 3000000n
            // };
        }
        catch (error) {
            throw new Error(error.message);
        }
        ftPreTX.push(await API.fetchTXraw(fttxo_lp.txId, this.network));
        ftPrePreTxData.push(await API.fetchFtPrePreTxData(ftPreTX[0], fttxo_lp.outputIndex, this.network));
        lpTapeAmountSetIn.push(fttxo_lp.ftBalance);
        const ftutxo_codeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160)
            .toBuffer()
            .toString("hex");
        let fttxo_c;
        try {
            fttxo_c = await API.fetchFtUTXOsforPool(this.ft_a_contractTxid, poolnft_codehash160, changeDate.ft_a_difference, 3, ftutxo_codeScript, this.network);
        }
        catch (error) {
            const errorMessage = error.message === "Insufficient FTbalance, please merge FT UTXOs"
                ? "Insufficient PoolFT, please merge FT UTXOs"
                : error.message;
            throw new Error(errorMessage);
        }
        let tapeAmountSum = BigInt(0);
        for (let i = 0; i < fttxo_c.length; i++) {
            ftPreTX.push(await API.fetchTXraw(fttxo_c[i].txId, this.network));
            ftPrePreTxData.push(await API.fetchFtPrePreTxData(ftPreTX[i + 1], fttxo_c[i].outputIndex, this.network));
            tapeAmountSetIn.push(fttxo_c[i].ftBalance);
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
        }
        // Build the amount and change hex strings for the tape
        let { amountHex, changeHex } = FT.buildTapeAmount(changeDate.ft_a_difference, tapeAmountSetIn, 2);
        const ftAbyA = amountHex;
        const ftAbyC = changeHex;
        ({ amountHex, changeHex } = FT.buildTapeAmount(changeDate.ft_lp_difference, lpTapeAmountSetIn, 1));
        const ftlpBurn = amountHex;
        const ftlpChange = changeHex;
        const poolnft = await this.fetchPoolNftUTXO(this.contractTxid);
        const contractTX = await API.fetchTXraw(poolnft.txId, this.network);
        // Construct the transaction
        const tx = new tbc.Transaction()
            .from(poolnft)
            .from(fttxo_lp)
            .from(fttxo_c)
            .from(utxo);
        //poolNft
        tx.addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: poolnft.satoshis - Number(changeDate.tbc_amount_full_difference),
        }));
        const poolnftTapeScript = await this.updatePoolNftTape();
        tx.addOutput(new tbc.Transaction.Output({
            script: poolnftTapeScript,
            satoshis: 0,
        }));
        //FTAbyA
        const ftCodeScript = FT.buildFTtransferCode(FTA.codeScript, address_to);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftCodeScript,
            satoshis: 500,
        }));
        const ftTapeScript = FT.buildFTtransferTape(FTA.tapeScript, ftAbyA);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftTapeScript,
            satoshis: 0,
        }));
        //P2PKH
        tx.to(privateKey.toAddress().toString(), Number(changeDate.tbc_amount_full_difference));
        //FTLP_Burn
        const amountwriter = new tbc.encoding.BufferWriter();
        for (let i = 0; i < 6; i++) {
            amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
        }
        const ftlpTapeAmount = amountwriter.toBuffer().toString("hex");
        const lockTimeHex = Buffer.from("00000000", "hex").toString("hex");
        const fillSize = FTA.tapeScript.length / 2 - 62;
        const opZeroArray = Array(fillSize).fill("OP_0").join(" ");
        let ftlpTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${ftlpTapeAmount} ${lockTimeHex} ${opZeroArray} 4654617065`);
        const ftlpCodeScript = FT.buildFTtransferCode(ftlpCode.toBuffer().toString("hex"), "1BitcoinEaterAddressDontSendf59kuE");
        tx.addOutput(new tbc.Transaction.Output({
            script: ftlpCodeScript,
            satoshis: fttxo_lp.satoshis,
        }));
        ftlpTapeScript = FT.buildFTtransferTape(ftlpTapeScript.toBuffer().toString("hex"), ftlpBurn);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftlpTapeScript,
            satoshis: 0,
        }));
        // FTLP_change
        if (fttxo_lp.ftBalance > changeDate.ft_lp_difference) {
            const ftlp_changeCodeScript = FT.buildFTtransferCode(ftlpCode.toBuffer().toString("hex"), address_to);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftlp_changeCodeScript,
                satoshis: fttxo_lp.satoshis,
            }));
            const ftlp_changeTapeScript = FT.buildFTtransferTape(ftlpTapeScript.toBuffer().toString("hex"), ftlpChange);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftlp_changeTapeScript,
                satoshis: 0,
            }));
        }
        // FTAbyC_change
        if (changeDate.ft_a_difference < tapeAmountSum) {
            const ftabycCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftabycCodeScript,
                satoshis: 500,
            }));
            const ftabycTapeScript = FT.buildFTtransferTape(FTA.tapeScript, ftAbyC);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftabycTapeScript,
                satoshis: 0,
            }));
        }
        tx.feePerKb(80);
        tx.change(privateKey.toAddress());
        await tx.setInputScriptAsync({
            inputIndex: 0,
        }, async (tx) => {
            const unlockingScript = await this.getPoolNftUnlock(privateKey, tx, 0, poolnft.txId, poolnft.outputIndex, (0, util_1.isLock)(this.poolnft_code.length), 2);
            return unlockingScript;
        });
        tx.setInputSequence(1, 4294967294);
        await tx.setInputScriptAsync({
            inputIndex: 1,
        }, async (tx) => {
            const unlockingScript = await FTA.getFTunlock(privateKey, tx, ftPreTX[0], ftPrePreTxData[0], 1, fttxo_lp.outputIndex);
            return unlockingScript;
        });
        for (let i = 0; i < fttxo_c.length; i++) {
            await tx.setInputScriptAsync({
                inputIndex: i + 2,
            }, async (tx) => {
                const unlockingScript = await FTA.getFTunlockSwap(privateKey, tx, ftPreTX[i + 1], ftPrePreTxData[i + 1], contractTX, i + 2, fttxo_c[i].outputIndex);
                return unlockingScript;
            });
        }
        tx.sign(privateKey);
        tx.setLockTime((await API.fetchBlockHeaders(this.network))[0].height - 2);
        // .setInputSequence(0, 4294967294);
        await tx.sealAsync();
        // console.log(tx.verify());
        const txraw = tx.uncheckedSerialize();
        // console.log(txraw);
        return txraw;
    }
    async unlockFTLP(privateKey_from, utxo, lock_time) {
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        const privateKey = privateKey_from;
        const address = privateKey.toAddress().toString();
        try {
            const ftUtxoList = await this.fetchFtlpUTXOList(address);
            const ftutxo_codeScript = ftUtxoList[0].script;
            let ftutxo = [];
            let lockTimeMax = 0;
            let zeroLockTimeCount = 0;
            if (ftUtxoList.length === 0) {
                throw new Error("No FT UTXO available");
            }
            const currentBlockHeight = (await API.fetchBlockHeaders(this.network))[0].height - 2; // subtract 2 to ensure safety
            const currentTime = Math.floor(Date.now() / 1000) - 1800; // subtract 30 minutes to ensure safety
            for (let i = 0; i < ftUtxoList.length && ftutxo.length < 6; i++) {
                const ftlpTapeScript = (await API.fetchTXraw(ftUtxoList[i].txId, this.network)).outputs[ftUtxoList[i].outputIndex + 1].script;
                const lockTimeFromTape = new tbc.encoding.BufferReader(ftlpTapeScript.chunks[3].buf).readInt32LE();
                if (lock_time) {
                    if (lockTimeFromTape === 0) {
                        ftutxo.push(ftUtxoList[i]);
                        zeroLockTimeCount += 1;
                    }
                    else if (lock_time < 500000000 && lockTimeFromTape <= lock_time) {
                        ftutxo.push(ftUtxoList[i]);
                    }
                    else if (lockTimeFromTape >= 500000000 && lockTimeFromTape <= lock_time) {
                        ftutxo.push(ftUtxoList[i]);
                    }
                }
                else {
                    lockTimeMax = Math.max(lockTimeMax, lockTimeFromTape);
                    if (lockTimeFromTape === 0) {
                        ftutxo.push(ftUtxoList[i]);
                        zeroLockTimeCount += 1;
                    }
                    else if (lockTimeFromTape < 500000000 &&
                        lockTimeFromTape <= currentBlockHeight)
                        ftutxo.push(ftUtxoList[i]);
                    else if (lockTimeFromTape >= 500000000 && lockTimeFromTape <= currentTime)
                        ftutxo.push(ftUtxoList[i]);
                }
            }
            if (zeroLockTimeCount === ftutxo.length && zeroLockTimeCount === 1)
                return null;
            if (!lock_time) {
                lockTimeMax < 500000000
                    ? (lockTimeMax = Math.min(lockTimeMax, currentBlockHeight))
                    : (lockTimeMax = Math.min(lockTimeMax, currentTime));
            }
            if (ftutxo.length === 0) {
                throw new Error("No unlockable FTLP UTXO");
            }
            const tapeAmountSetIn = [];
            const ftPreTX = [];
            const ftPrePreTxData = [];
            let tapeAmountSum = BigInt(0);
            for (let i = 0; i < ftutxo.length; i++) {
                tapeAmountSetIn.push(ftutxo[i].ftBalance);
                tapeAmountSum += BigInt(ftutxo[i].ftBalance);
                ftPreTX.push(await API.fetchTXraw(ftutxo[i].txId, this.network));
                ftPrePreTxData.push(await API.fetchFtPrePreTxData(ftPreTX[i], ftutxo[i].outputIndex, this.network));
            }
            const { amountHex, changeHex } = FT.buildTapeAmount(tapeAmountSum, tapeAmountSetIn);
            if (changeHex !=
                "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000") {
                throw new Error("Change amount is not zero");
            }
            const tx = new tbc.Transaction().from(ftutxo).from(utxo);
            const codeScript = FT.buildFTtransferCode(ftutxo_codeScript, address);
            tx.addOutput(new tbc.Transaction.Output({
                script: codeScript,
                satoshis: 500,
            }));
            const amountwriter = new tbc.encoding.BufferWriter();
            for (let i = 0; i < 6; i++) {
                amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
            }
            const ftlpTapeAmount = amountwriter.toBuffer().toString("hex");
            const lockTimeHex = Buffer.from("00000000", "hex").toString("hex");
            const fillSize = FTA.tapeScript.length / 2 - 62;
            const opZeroArray = Array(fillSize).fill("OP_0").join(" ");
            const ftlpTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${ftlpTapeAmount} ${lockTimeHex} ${opZeroArray} 4654617065`);
            const tapeScript = FT.buildFTtransferTape(ftlpTapeScript.toHex(), amountHex);
            // const originalBuffer = originalTapeScript.toBuffer();
            // const lockTime = Buffer.from('0400000000', 'hex');
            // const modifiedBuffer = Buffer.concat([
            //     originalBuffer.slice(0, 51),
            //     lockTime,
            //     originalBuffer.slice(51)
            // ]);
            // const tapeScript = tbc.Script.fromBuffer(modifiedBuffer);
            tx.addOutput(new tbc.Transaction.Output({
                script: tapeScript,
                satoshis: 0,
            }));
            tx.feePerKb(80);
            tx.change(privateKey.toAddress());
            for (let i = 0; i < ftutxo.length; i++) {
                tx.setInputSequence(i, 4294967294);
                tx.setInputScript({
                    inputIndex: i,
                }, (tx) => {
                    const unlockingScript = FTA.getFTunlock(privateKey, tx, ftPreTX[i], ftPrePreTxData[i], i, ftutxo[i].outputIndex);
                    return unlockingScript;
                });
            }
            tx.sign(privateKey);
            tx.setLockTime(lock_time || lockTimeMax);
            tx.seal();
            const txraw = tx.uncheckedSerialize();
            return txraw;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * 离线生成池NFT解锁脚本。
     *
     * @param {tbc.PrivateKey} privateKey_from - 用于签名交易的私钥。
     * @param {tbc.Transaction} currentTX - 当前交易对象。
     * @param {number} currentUnlockIndex - 当前解锁的输入索引。
     * @param {tbc.Transaction} poolnftPreTX - 池NFT的前一个交易。
     * @param {tbc.Transaction} poolnftPrePreTX - 池NFT的前前一个交易。
     * @param {tbc.Transaction[]} inputsTXs - 当前交易的输入交易数组。
     * @param {1 | 2 | 3 | 4} option - 解锁选项：
     * @param {1 | 2} [swapOption] - 交换选项（可选）：
     * @returns {tbc.Script} 返回生成的解锁脚本。
     *
     * 该函数执行以下主要步骤：
     * 1. 获取池NFT的前一个交易和前前一个交易的相关数据。
     * 2. 构建当前交易的输入和输出数据。
     * 3. 根据选项生成签名和公钥，并构建解锁脚本。
     * 4. 返回生成的解锁脚本。
     */
    getPoolNftUnlockOffLine(privateKey_from, currentTX, currentUnlockIndex, poolnftPreTX, poolnftPrePreTX, inputsTXs, withLock, option, swapOption) {
        const privateKey = privateKey_from;
        const preTX = poolnftPreTX;
        const pretxdata = (0, poolnftunlock_1.getPoolNFTPreTxdata)(preTX);
        const prepreTX = poolnftPrePreTX;
        const prepretxdata = (0, poolnftunlock_1.getPoolNFTPrePreTxdata)(prepreTX);
        let currentinputsdata = (0, poolnftunlock_1.getCurrentInputsdata)(currentTX);
        let currentinputstxdata = "";
        for (let i = 1; i < currentTX.inputs.length; i++) {
            const inputsTX = inputsTXs[i - 1];
            if (option == 3) {
                currentinputstxdata =
                    (0, poolnftunlock_1.getInputsTxdataSwap)(inputsTX, currentTX.inputs[i].outputIndex) +
                        currentinputstxdata;
            }
            else {
                currentinputstxdata += (0, poolnftunlock_1.getInputsTxdata)(inputsTX, currentTX.inputs[i].outputIndex);
            }
        }
        currentinputstxdata = "51" + currentinputstxdata;
        const currenttxoutputsdata = (0, poolnftunlock_1.getCurrentTxOutputsDataforPool2)(currentTX, option, withLock, swapOption);
        let unlockingScript = new tbc.Script("");
        const optionHex = option + 50;
        const poolCode = currentTX.outputs[0].script;
        const sub = poolCode.chunks[poolCode.chunks.length - 2].buf.length + 1;
        const poolCodeLength = poolCode.toBuffer().length - sub;
        if (poolCodeLength > 3284 ||
            poolCode.chunks[poolCode.chunks.length - 4].opcodenum === 81) {
            switch (option) {
                case 1:
                    unlockingScript = new tbc.Script(`${currentinputstxdata}${currentinputsdata}${currenttxoutputsdata}${optionHex}${prepretxdata}${pretxdata}`);
                    break;
                case 2:
                    unlockingScript = new tbc.Script(`${currenttxoutputsdata}${currentinputstxdata}${currentinputsdata}${optionHex}${prepretxdata}${pretxdata}`);
                    break;
                case 3:
                    if (withLock) {
                        const signature = currentTX.getSignature(currentUnlockIndex, privateKey);
                        const sig = (signature.length / 2).toString(16).padStart(2, "0") + signature;
                        const publicKey = (privateKey.toPublicKey().toString().length / 2)
                            .toString(16)
                            .padStart(2, "0") + privateKey.toPublicKey().toString();
                        unlockingScript = new tbc.Script(`${sig}${publicKey}${currenttxoutputsdata}${currentinputstxdata}${currentinputsdata}${optionHex}${prepretxdata}${pretxdata}`);
                    }
                    else {
                        unlockingScript = new tbc.Script(`${currenttxoutputsdata}${currentinputstxdata}${currentinputsdata}${optionHex}${prepretxdata}${pretxdata}`);
                    }
                    break;
                case 4:
                    unlockingScript = new tbc.Script(`${currenttxoutputsdata}${currentinputstxdata}${currentinputsdata}${optionHex}${prepretxdata}${pretxdata}`);
                    break;
                default:
                    throw new Error("Invalid option.");
            }
        }
        else {
            const signature = currentTX.getSignature(currentUnlockIndex, privateKey);
            const sig = (signature.length / 2).toString(16).padStart(2, "0") + signature;
            const publicKey = (privateKey.toPublicKey().toString().length / 2)
                .toString(16)
                .padStart(2, "0") + privateKey.toPublicKey().toString();
            switch (option) {
                case 1:
                    unlockingScript = new tbc.Script(`${sig}${publicKey}${currentinputstxdata}${currentinputsdata}${currenttxoutputsdata}${optionHex}${prepretxdata}${pretxdata}`);
                    break;
                case 2:
                    unlockingScript = new tbc.Script(`${sig}${publicKey}${currenttxoutputsdata}${currentinputstxdata}${currentinputsdata}${optionHex}${prepretxdata}${pretxdata}`);
                    break;
                case 3:
                    unlockingScript = new tbc.Script(`${sig}${publicKey}${currenttxoutputsdata}${currentinputstxdata}${currentinputsdata}${optionHex}${prepretxdata}${pretxdata}`);
                    break;
                case 4:
                    unlockingScript = new tbc.Script(`${sig}${publicKey}${currenttxoutputsdata}${currentinputstxdata}${currentinputsdata}${optionHex}${prepretxdata}${pretxdata}`);
                    break;
                default:
                    throw new Error("Invalid option.");
            }
        }
        return unlockingScript;
    }
    /**
     * 异步生成池NFT解锁脚本。
     *
     * @param {tbc.PrivateKey} privateKey_from - 用于签名交易的私钥。
     * @param {tbc.Transaction} currentTX - 当前交易对象。
     * @param {number} currentUnlockIndex - 当前解锁的输入索引。
     * @param {string} preTxId - 前一个交易的交易ID。
     * @param {number} preVout - 前一个交易的输出索引。
     * @param {1 | 2 | 3 | 4} option - 解锁选项：
     * @param {1 | 2} [swapOption] - 交换选项（可选）：
     * @returns {Promise<tbc.Script>} 返回一个Promise，解析为生成的解锁脚本。
     *
     * 该函数执行以下主要步骤：
     * 1. 获取池NFT的前一个交易和前前一个交易的相关数据。
     * 2. 构建当前交易的输入和输出数据。
     * 3. 根据选项生成签名和公钥，并构建解锁脚本。
     * 4. 返回生成的解锁脚本。
     */
    async getPoolNftUnlock(privateKey_from, currentTX, currentUnlockIndex, preTxId, preVout, withLock, option, swapOption) {
        const privateKey = privateKey_from;
        const preTX = await API.fetchTXraw(preTxId, this.network);
        const pretxdata = (0, poolnftunlock_1.getPoolNFTPreTxdata)(preTX);
        const prepreTX = await API.fetchTXraw(preTX.inputs[preVout].prevTxId.toString("hex"), this.network);
        const prepretxdata = (0, poolnftunlock_1.getPoolNFTPrePreTxdata)(prepreTX);
        let currentinputsdata = (0, poolnftunlock_1.getCurrentInputsdata)(currentTX);
        let currentinputstxdata = "";
        for (let i = 1; i < currentTX.inputs.length; i++) {
            const inputsTX = await API.fetchTXraw(currentTX.inputs[i].prevTxId.toString("hex"), this.network);
            if (option == 3) {
                currentinputstxdata =
                    (0, poolnftunlock_1.getInputsTxdataSwap)(inputsTX, currentTX.inputs[i].outputIndex) +
                        currentinputstxdata;
            }
            else {
                currentinputstxdata += (0, poolnftunlock_1.getInputsTxdata)(inputsTX, currentTX.inputs[i].outputIndex);
            }
        }
        currentinputstxdata = "51" + currentinputstxdata;
        const currenttxoutputsdata = (0, poolnftunlock_1.getCurrentTxOutputsDataforPool2)(currentTX, option, withLock, swapOption);
        let unlockingScript = new tbc.Script("");
        const optionHex = option + 50;
        const poolCode = currentTX.outputs[0].script;
        const sub = poolCode.chunks[poolCode.chunks.length - 2].buf.length + 1;
        const poolCodeLength = poolCode.toBuffer().length - sub;
        // console.log(poolCode.toBuffer().length, sub, poolCode.chunks[poolCode.chunks.length - 2], poolCode.chunks[poolCode.chunks.length - 4].opcodenum);
        if (poolCodeLength > 3284 ||
            poolCode.chunks[poolCode.chunks.length - 4].opcodenum === 81) {
            switch (option) {
                case 1:
                    unlockingScript = new tbc.Script(`${currentinputstxdata}${currentinputsdata}${currenttxoutputsdata}${optionHex}${prepretxdata}${pretxdata}`);
                    break;
                case 2:
                    unlockingScript = new tbc.Script(`${currenttxoutputsdata}${currentinputstxdata}${currentinputsdata}${optionHex}${prepretxdata}${pretxdata}`);
                    break;
                case 3:
                    if (withLock) {
                        const signature = currentTX.getSignature(currentUnlockIndex, privateKey);
                        const sig = (signature.length / 2).toString(16).padStart(2, "0") + signature;
                        const publicKey = (privateKey.toPublicKey().toString().length / 2)
                            .toString(16)
                            .padStart(2, "0") + privateKey.toPublicKey().toString();
                        unlockingScript = new tbc.Script(`${sig}${publicKey}${currenttxoutputsdata}${currentinputstxdata}${currentinputsdata}${optionHex}${prepretxdata}${pretxdata}`);
                    }
                    else {
                        unlockingScript = new tbc.Script(`${currenttxoutputsdata}${currentinputstxdata}${currentinputsdata}${optionHex}${prepretxdata}${pretxdata}`);
                    }
                    break;
                case 4:
                    unlockingScript = new tbc.Script(`${currenttxoutputsdata}${currentinputstxdata}${currentinputsdata}${optionHex}${prepretxdata}${pretxdata}`);
                    break;
                default:
                    throw new Error("Invalid option.");
            }
        }
        else {
            // console.log("poolCodeLength:", poolCodeLength);
            const signature = currentTX.getSignature(currentUnlockIndex, privateKey);
            const sig = (signature.length / 2).toString(16).padStart(2, "0") + signature;
            const publicKey = (privateKey.toPublicKey().toString().length / 2)
                .toString(16)
                .padStart(2, "0") + privateKey.toPublicKey().toString();
            switch (option) {
                case 1:
                    unlockingScript = new tbc.Script(`${sig}${publicKey}${currentinputstxdata}${currentinputsdata}${currenttxoutputsdata}${optionHex}${prepretxdata}${pretxdata}`);
                    break;
                case 2:
                    unlockingScript = new tbc.Script(`${sig}${publicKey}${currenttxoutputsdata}${currentinputstxdata}${currentinputsdata}${optionHex}${prepretxdata}${pretxdata}`);
                    break;
                case 3:
                    unlockingScript = new tbc.Script(`${sig}${publicKey}${currenttxoutputsdata}${currentinputstxdata}${currentinputsdata}${optionHex}${prepretxdata}${pretxdata}`);
                    break;
                case 4:
                    unlockingScript = new tbc.Script(`${sig}${publicKey}${currenttxoutputsdata}${currentinputstxdata}${currentinputsdata}${optionHex}${prepretxdata}${pretxdata}`);
                    break;
                default:
                    throw new Error("Invalid option.");
            }
        }
        return unlockingScript;
    }
    /**
     * 更新池 NFT 的相关金额，并返回金额差异。
     *
     * @param {number} increment - 增加的金额，单位取决于选项。
     * @param {number} ft_a_decimal - FT-A 的小数位数，用于计算。
     * @param {1 | 2 | 3} option - 指定更新类型：
     *        1 - 更新 FT-LP 金额；
     *        2 - 更新 TBC 金额；
     *        3 - 更新 FT-A 金额。
     * @returns {poolNFTDifference} 返回一个对象，包含各类金额的差异：
     *          - ft_lp_difference: FT-LP 金额的变化；
     *          - ft_a_difference: FT-A 金额的变化；
     *          - tbc_amount_difference: TBC 金额的变化。
     *
     * 该函数执行以下主要步骤：
     * 1. 保存当前 FT-A、FT-LP 和 TBC 的金额。
     * 2. 根据指定的选项更新相应的金额：
     *    - 如果选项为 1，调用 `updateWhenFtLpChange` 方法更新 FT-LP 金额；
     *    - 如果选项为 2，调用 `updateWhenTbcAmountChange` 方法更新 TBC 金额；
     *    - 如果选项为 3，调用 `updateWhenFtAChange` 方法更新 FT-A 金额。
     * 3. 根据更新后的 TBC 金额与之前的 TBC 金额进行比较，计算各类金额的差异并返回。
     */
    updatePoolNFT(increment, ft_a_decimal, option) {
        const ft_a_old = this.ft_a_amount;
        const ft_lp_old = this.ft_lp_amount;
        const tbc_amount_old = this.tbc_amount;
        const tbc_amount_full_old = this.tbc_amount_full;
        if (option == 1) {
            const ftLpIncrement = BigInt(Math.floor(increment * Math.pow(10, 6)));
            this.updateWhenFtLpChange(ftLpIncrement);
        }
        else if (option == 2) {
            const tbcIncrement = BigInt(Math.floor(increment * Math.pow(10, 6)));
            this.updateWhenTbcAmountChange(tbcIncrement);
        }
        else {
            const ftAIncrement = BigInt(Math.floor(increment * Math.pow(10, ft_a_decimal)));
            this.updateWhenFtAChange(ftAIncrement);
        }
        if (this.tbc_amount > tbc_amount_old) {
            return {
                ft_lp_difference: BigInt(this.ft_lp_amount) - BigInt(ft_lp_old),
                ft_a_difference: BigInt(this.ft_a_amount) - BigInt(ft_a_old),
                tbc_amount_difference: BigInt(this.tbc_amount) - BigInt(tbc_amount_old),
                tbc_amount_full_difference: BigInt(this.tbc_amount_full) - BigInt(tbc_amount_full_old),
            };
        }
        else {
            return {
                ft_lp_difference: BigInt(ft_lp_old) - BigInt(this.ft_lp_amount),
                ft_a_difference: BigInt(ft_a_old) - BigInt(this.ft_a_amount),
                tbc_amount_difference: BigInt(tbc_amount_old) - BigInt(this.tbc_amount),
                tbc_amount_full_difference: BigInt(tbc_amount_full_old) - BigInt(this.tbc_amount_full),
            };
        }
    }
    updateWhenFtLpChange(incrementBN) {
        const increment = BigInt(incrementBN);
        if (increment == BigInt(0)) {
            return;
        }
        else if (increment > BigInt(0) &&
            increment <= BigInt(this.ft_lp_amount)) {
            const ratio = (BigInt(this.ft_lp_amount) * BigInt(this.precision)) / increment;
            this.ft_lp_amount = BigInt(this.ft_lp_amount) - BigInt(increment);
            this.ft_a_amount =
                BigInt(this.ft_a_amount) -
                    (BigInt(this.ft_a_amount) * BigInt(this.precision)) / ratio;
            this.tbc_amount =
                BigInt(this.tbc_amount) -
                    (BigInt(this.tbc_amount) * BigInt(this.precision)) / ratio;
            this.tbc_amount_full =
                BigInt(this.tbc_amount_full) -
                    (BigInt(this.tbc_amount_full - BigInt(this.poolnft_code_dust)) *
                        BigInt(this.precision)) /
                        ratio;
        }
        else {
            throw new Error("Increment is invalid!");
        }
    }
    updateWhenFtAChange(incrementBN) {
        const increment = BigInt(incrementBN);
        if (increment == BigInt(0)) {
            return;
        }
        else if (increment > BigInt(0) && increment <= BigInt(this.ft_a_amount)) {
            const ratio = (BigInt(this.ft_a_amount) * BigInt(this.precision)) / increment;
            this.ft_a_amount = BigInt(this.ft_a_amount) + BigInt(increment);
            this.ft_lp_amount =
                BigInt(this.ft_lp_amount) +
                    (BigInt(this.ft_lp_amount) * BigInt(this.precision)) / ratio;
            this.tbc_amount =
                BigInt(this.ft_a_amount) +
                    (BigInt(this.ft_a_amount) * BigInt(this.precision)) / ratio;
            this.tbc_amount_full =
                BigInt(this.tbc_amount_full) +
                    (BigInt(this.tbc_amount_full) * BigInt(this.precision)) / ratio;
        }
        else if (increment > BigInt(this.ft_a_amount)) {
            const ratio = (BigInt(increment) * BigInt(this.precision)) / BigInt(this.ft_a_amount);
            this.ft_a_amount = BigInt(this.ft_a_amount) + BigInt(increment);
            this.ft_lp_amount =
                BigInt(this.ft_lp_amount) +
                    (BigInt(this.ft_lp_amount) * ratio) / BigInt(this.precision);
            this.tbc_amount =
                BigInt(this.tbc_amount) +
                    (BigInt(this.tbc_amount) * ratio) / BigInt(this.precision);
            this.tbc_amount_full =
                BigInt(this.tbc_amount_full) +
                    (BigInt(this.tbc_amount_full) * ratio) / BigInt(this.precision);
        }
        else {
            throw new Error("Increment is invalid!");
        }
    }
    updateWhenTbcAmountChange(incrementBN) {
        const increment = BigInt(incrementBN);
        if (increment == BigInt(0)) {
            return;
        }
        else if (increment > BigInt(0) && increment <= BigInt(this.tbc_amount)) {
            const ratio = ((BigInt(this.tbc_amount_full) - BigInt(this.poolnft_code_dust)) *
                BigInt(this.precision)) /
                increment;
            this.tbc_amount = BigInt(this.tbc_amount) + BigInt(increment);
            this.ft_lp_amount =
                BigInt(this.ft_lp_amount) +
                    (BigInt(this.ft_lp_amount) * BigInt(this.precision)) / ratio;
            this.ft_a_amount =
                BigInt(this.ft_a_amount) +
                    (BigInt(this.ft_a_amount) * BigInt(this.precision)) / ratio;
            this.tbc_amount_full = BigInt(this.tbc_amount_full) + BigInt(increment);
        }
        else if (increment > BigInt(this.tbc_amount)) {
            const ratio = (BigInt(increment) * BigInt(this.precision)) /
                (BigInt(this.tbc_amount_full) - BigInt(this.poolnft_code_dust));
            this.tbc_amount = BigInt(this.tbc_amount) + BigInt(increment);
            this.ft_lp_amount =
                BigInt(this.ft_lp_amount) +
                    (BigInt(this.ft_lp_amount) * ratio) / BigInt(this.precision);
            this.ft_a_amount =
                BigInt(this.ft_a_amount) +
                    (BigInt(this.ft_a_amount) * ratio) / BigInt(this.precision);
            this.tbc_amount_full = BigInt(this.tbc_amount_full) + BigInt(increment);
        }
        else {
            throw new Error("Increment is invalid!");
        }
    }
    getPoolNftTape(lpPlan, withLock, withLockTime) {
        const writer = new tbc.encoding.BufferWriter();
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_lp_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_a_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.tbc_amount));
        const amountData = writer.toBuffer().toString("hex");
        const serviceFeeRateHex = this.service_fee_rate
            .toString(16)
            .padStart(2, "0");
        const lpPlanHex = lpPlan.toString(16).padStart(2, "0");
        const withLockHex = (withLock ? 1 : 0).toString(16).padStart(2, "0");
        const withLockTimeHex = (withLockTime ? 1 : 0)
            .toString(16)
            .padStart(2, "0");
        const poolnftTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${this.ft_lp_partialhash + this.ft_a_partialhash} ${amountData} ${this.ft_a_contractTxid} ${serviceFeeRateHex} ${lpPlanHex} ${withLockHex} ${withLockTimeHex} 4e54617065`);
        return poolnftTapeScript;
    }
    async updatePoolNftTape() {
        let poolnftTapeScriptTemp = await this.fetchPoolNftTape();
        const writer = new tbc.encoding.BufferWriter();
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_lp_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_a_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.tbc_amount));
        const amountData = writer.toBuffer().toString("hex");
        poolnftTapeScriptTemp.chunks[3].buf = Buffer.from(amountData, "hex");
        const poolnftTapeScript = tbc.Script.fromASM(poolnftTapeScriptTemp.toASM());
        return poolnftTapeScript;
    }
    async fetchPoolNftTape() {
        const poolnftTapeScript = (await API.fetchTXraw(this.contractTxid, this.network)).outputs[1].script;
        return poolnftTapeScript;
    }
    async getPoolNftExtraInfo() {
        const poolnftTapeScript = await this.fetchPoolNftTape();
        const extraInfo = {
            serviceFeeRate: poolnftTapeScript.chunks[5]?.buf
                ? parseInt(poolnftTapeScript.chunks[5].buf.toString("hex"), 16)
                : null,
            lpPlan: poolnftTapeScript.chunks[6]?.buf
                ? parseInt(poolnftTapeScript.chunks[6].buf.toString("hex"), 16)
                : null,
            withLock: poolnftTapeScript.chunks[7]?.buf
                ? parseInt(poolnftTapeScript.chunks[7].buf.toString("hex"), 16) === 1
                : null,
            withLockTime: poolnftTapeScript.chunks[8]?.buf
                ? parseInt(poolnftTapeScript.chunks[8].buf.toString("hex"), 16) === 1
                : null,
        };
        return extraInfo;
    }
    getPoolNftCode(txid, vout, lpPlan, tag) {
        const writer = new tbc.encoding.BufferWriter();
        writer.writeReverse(Buffer.from(txid, "hex"));
        writer.writeUInt32LE(vout);
        const utxoHex = writer.toBuffer().toString("hex");
        const tagWriter = new tbc.encoding.BufferWriter();
        const pumpPublicKeyHash = tbc.Address.fromString(lpPlan === 1
            ? "13oCEJaqyyiC8iRrfup6PDL2GKZ3xQrsZL"
            : "1Fa6Uy64Ub4qNdB896zX2pNMx4a8zMhtCy").hashBuffer.toString("hex");
        const tagValue = tag || "NULL";
        const tagLengthHex = tagValue.length.toString(16).padStart(2, "0");
        tagWriter.write(Buffer.from(tagValue, "utf8"));
        const tagHex = tagWriter.toBuffer().toString("hex");
        const poolNftCode = new tbc.Script(`OP_4 OP_PICK OP_BIN2NUM OP_TOALTSTACK OP_1 OP_PICK OP_3 OP_SPLIT OP_NIP 0x01 0x20 OP_SPLIT 0x01 0x20 OP_SPLIT OP_1 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_TOALTSTACK OP_BIN2NUM OP_TOALTSTACK OP_BIN2NUM OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_1 OP_PICK OP_TOALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_1 OP_PICK 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_HASH256 OP_6 OP_PUSH_META 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_1 OP_PICK OP_TOALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_SWAP OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUAL OP_IF OP_DROP OP_ELSE 0x24 0x${utxoHex} OP_EQUALVERIFY OP_ENDIF OP_DUP OP_1 OP_EQUAL OP_IF OP_DROP OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_4 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_HASH160 OP_SWAP OP_TOALTSTACK OP_EQUAL OP_0 OP_EQUALVERIFY OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_8 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_BIN2NUM OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_4 OP_ROLL OP_TOALTSTACK OP_4 OP_ROLL OP_DUP OP_HASH160 OP_TOALTSTACK OP_9 OP_ROLL OP_EQUALVERIFY OP_6 OP_ROLL OP_BIN2NUM OP_SWAP OP_2DUP OP_GREATERTHAN OP_1 OP_EQUALVERIFY OP_2DUP OP_SUB OP_2DUP OP_GREATERTHANOREQUAL OP_IF OP_DUP OP_TOALTSTACK OP_SWAP 0x02 0xe803 OP_BIN2NUM OP_SUB 0x03 0x40420f OP_BIN2NUM OP_MUL OP_SWAP OP_DIV OP_NIP OP_SWAP OP_FROMALTSTACK OP_ADD OP_TOALTSTACK OP_2DUP OP_SWAP 0x03 0x40420f OP_BIN2NUM OP_MUL OP_SWAP OP_DIV OP_5 OP_PICK OP_EQUALVERIFY OP_SWAP OP_4 OP_ROLL OP_ADD OP_TOALTSTACK OP_2DUP OP_SWAP 0x03 0x40420f OP_BIN2NUM OP_MUL OP_SWAP OP_DIV OP_3 OP_PICK OP_EQUALVERIFY OP_DROP OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK 0x03 0x40420f OP_BIN2NUM OP_MUL OP_SWAP 0x02 0xe803 OP_BIN2NUM OP_SUB OP_3 OP_PICK OP_0 OP_EQUAL OP_NOTIF OP_DIV OP_NIP OP_SWAP OP_FROMALTSTACK OP_ADD OP_TOALTSTACK OP_2DUP OP_MUL 0x03 0x40420f OP_BIN2NUM OP_DIV OP_5 OP_PICK OP_EQUALVERIFY OP_SWAP OP_4 OP_ROLL OP_ADD OP_TOALTSTACK OP_2DUP OP_MUL 0x03 0x40420f OP_BIN2NUM OP_DIV OP_3 OP_PICK OP_EQUALVERIFY OP_DROP OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_ELSE OP_2DROP OP_DROP OP_FROMALTSTACK OP_ADD OP_TOALTSTACK OP_3 OP_ROLL OP_ADD OP_TOALTSTACK OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_ENDIF OP_ENDIF OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_3 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_1 OP_EQUALVERIFY OP_ELSE OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY OP_TOALTSTACK OP_0 OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_2DROP OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_4 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_HASH160 OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP 0x14 0x759d6677091e973b9e9d99f19c68fbf43e3f05f9 OP_EQUALVERIFY OP_OVER OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_FROMALTSTACK OP_4 OP_PICK OP_BIN2NUM OP_TOALTSTACK OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_2 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_BIN2NUM OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_6 OP_ROLL OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK 0x02 0xe803 OP_BIN2NUM OP_SUB OP_7 OP_ROLL 0x02 0xe803 OP_BIN2NUM OP_SUB OP_2DUP OP_2DUP OP_GREATERTHAN OP_1 OP_EQUALVERIFY OP_SUB OP_8 OP_PICK OP_EQUALVERIFY OP_DROP OP_3 OP_ROLL OP_4 OP_ROLL OP_2DUP OP_SUB OP_TOALTSTACK OP_SWAP 0x03 0x40420f OP_BIN2NUM OP_MUL OP_SWAP OP_DIV OP_2DUP OP_SWAP 0x03 0x40420f OP_BIN2NUM OP_MUL OP_SWAP OP_DIV OP_6 OP_ROLL OP_EQUALVERIFY OP_SWAP OP_DROP OP_2DUP OP_SWAP 0x03 0x40420f OP_BIN2NUM OP_MUL OP_SWAP OP_DIV OP_SWAP OP_TOALTSTACK OP_SUB OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_2DUP OP_SWAP 0x03 0x40420f OP_BIN2NUM OP_MUL OP_SWAP OP_DIV OP_3 OP_PICK OP_EQUALVERIFY OP_DROP OP_SWAP OP_SUB OP_FROMALTSTACK OP_FROMALTSTACK OP_2 OP_ROLL OP_2 OP_ROLL OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_3 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_ELSE OP_DUP OP_3 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY 0x01 0x28 OP_SPLIT OP_NIP OP_FROMALTSTACK OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_0 OP_TOALTSTACK OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_2DROP OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_6 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_2 OP_PICK OP_3 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP 0x14 0x${pumpPublicKeyHash} OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_OVER OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_SWAP OP_4 OP_ROLL OP_BIN2NUM OP_FROMALTSTACK OP_FROMALTSTACK OP_6 OP_ROLL OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_2DUP OP_MUL OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_6 OP_PICK OP_DUP OP_TOALTSTACK OP_2 OP_PICK OP_GREATERTHAN OP_1 OP_EQUALVERIFY OP_5 OP_PICK OP_2DUP OP_SWAP OP_GREATERTHAN OP_1 OP_EQUALVERIFY OP_7 OP_PICK OP_GREATERTHANOREQUAL OP_1 OP_EQUALVERIFY OP_2DROP OP_2 OP_ROLL OP_SUB OP_DUP OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_DIV OP_EQUALVERIFY OP_4 OP_ROLL OP_EQUALVERIFY OP_3 OP_ROLL OP_BIN2NUM OP_EQUALVERIFY OP_2DROP OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_7 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_7 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_7 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_7 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_7 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_DROP OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_2 OP_PICK OP_3 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP 0x14 0x${pumpPublicKeyHash} OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_10 OP_PICK OP_BIN2NUM OP_SUB OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_4 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_2 OP_ROLL OP_EQUALVERIFY OP_OVER OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_FROMALTSTACK OP_4 OP_PICK OP_BIN2NUM OP_TOALTSTACK OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_SWAP OP_4 OP_ROLL OP_BIN2NUM OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_7 OP_ROLL OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_2DUP OP_MUL OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_6 OP_ROLL OP_2DUP OP_GREATERTHAN OP_1 OP_EQUALVERIFY OP_SUB OP_5 OP_PICK OP_EQUALVERIFY OP_5 OP_PICK OP_SUB OP_4 OP_ROLL OP_GREATERTHANOREQUAL OP_1 OP_EQUALVERIFY OP_2 OP_ROLL OP_ADD OP_DUP OP_FROMALTSTACK OP_SWAP OP_DIV OP_3 OP_ROLL OP_EQUALVERIFY OP_2 OP_ROLL OP_EQUALVERIFY OP_SWAP OP_BIN2NUM OP_EQUALVERIFY OP_ENDIF OP_ENDIF OP_ELSE OP_4 OP_EQUALVERIFY OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_0 OP_TOALTSTACK OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_2DROP OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_6 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_BIN2NUM OP_FROMALTSTACK OP_3 OP_ROLL OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_4 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_3 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_FROMALTSTACK OP_EQUALVERIFY OP_ENDIF OP_ENDIF OP_ENDIF OP_2 OP_PUSH_META OP_BIN2NUM OP_0 OP_EQUALVERIFY OP_TRUE OP_RETURN 0x${tagLengthHex} 0x${tagHex} 0x05 0x32436f6465`);
        return poolNftCode;
    }
    getPoolNftCodeWithLock(txid, vout, lpPlan, lpCostAddress, lpCostTBC, pubKeyLock, tag) {
        if (pubKeyLock.length < 1 || pubKeyLock.length > 10)
            throw new Error("pubKeyLock must be an array with 1 to 10 elements");
        let pubKeyLockHexLength = pubKeyLock[0].length;
        for (const pubKeyLockHex of pubKeyLock) {
            if (pubKeyLockHexLength !== pubKeyLockHex.length)
                throw new Error("pubKeyLock must be an array with elements of the same length");
            if (pubKeyLockHex === "")
                throw new Error("pubKeyLock cannot contain empty strings");
            pubKeyLockHexLength = pubKeyLockHex.length;
        }
        if (lpCostAddress === "")
            throw new Error("lpCostAddress cannot be an empty string");
        if (lpCostTBC <= 0)
            throw new Error("lpCostTBC must be greater than 0");
        const writer = new tbc.encoding.BufferWriter();
        writer.writeReverse(Buffer.from(txid, "hex"));
        writer.writeUInt32LE(vout);
        const utxoHex = writer.toBuffer().toString("hex");
        const lpCostAddressHex = lpCostAddress instanceof tbc.Address
            ? lpCostAddress.hashBuffer.toString("hex")
            : tbc.Address.fromString(lpCostAddress).hashBuffer.toString("hex");
        // console.log("lpCostAddressHex:", lpCostAddressHex);
        const lpCostWriter = new tbc.encoding.BufferWriter();
        const lpCostAmount = new BN(lpCostTBC).mul(new BN(Math.pow(10, 6)));
        lpCostWriter.writeUInt64LEBN(lpCostAmount);
        const lpCostAmountHex = lpCostWriter.toBuffer().toString("hex");
        const tagWriter = new tbc.encoding.BufferWriter();
        const pumpPublicKeyHash = tbc.Address.fromString(lpPlan === 1
            ? "13oCEJaqyyiC8iRrfup6PDL2GKZ3xQrsZL"
            : "1Fa6Uy64Ub4qNdB896zX2pNMx4a8zMhtCy").hashBuffer.toString("hex");
        const tagValue = tag || "NULL";
        const tagLengthHex = tagValue.length.toString(16).padStart(2, "0");
        tagWriter.write(Buffer.from(tagValue, "utf8"));
        const tagHex = tagWriter.toBuffer().toString("hex");
        const pubKeyLockLength = pubKeyLock[0].length / 2;
        const scriptLength = (0, util_1.getOpCode)(pubKeyLockLength);
        const poolNftCodePre = new tbc.Script(`OP_4 OP_PICK OP_BIN2NUM OP_TOALTSTACK OP_1 OP_PICK OP_3 OP_SPLIT OP_NIP 0x01 0x20 OP_SPLIT 0x01 0x20 OP_SPLIT OP_1 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_TOALTSTACK OP_BIN2NUM OP_TOALTSTACK OP_BIN2NUM OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_1 OP_PICK OP_TOALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_1 OP_PICK 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_HASH256 OP_6 OP_PUSH_META 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_1 OP_PICK OP_TOALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_SWAP OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUAL OP_IF OP_DROP OP_ELSE 0x24 0x${utxoHex} OP_EQUALVERIFY OP_ENDIF OP_DUP OP_1 OP_EQUAL OP_IF OP_DROP OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_4 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_HASH160 OP_SWAP OP_TOALTSTACK OP_EQUAL OP_0 OP_EQUALVERIFY OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_2 OP_PICK OP_3 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP 0x14 0x${lpCostAddressHex} OP_EQUALVERIFY OP_PARTIAL_HASH OP_OVER 0x08 0x${lpCostAmountHex} OP_EQUALVERIFY OP_CAT OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_8 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_BIN2NUM OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_4 OP_ROLL OP_TOALTSTACK OP_4 OP_ROLL OP_DUP OP_HASH160 OP_TOALTSTACK OP_9 OP_ROLL OP_EQUALVERIFY OP_6 OP_ROLL OP_BIN2NUM OP_SWAP OP_2DUP OP_GREATERTHAN OP_1 OP_EQUALVERIFY OP_2DUP OP_SUB OP_2DUP OP_GREATERTHANOREQUAL OP_IF OP_DUP OP_TOALTSTACK OP_SWAP 0x02 0xe803 OP_BIN2NUM OP_SUB 0x03 0x40420f OP_BIN2NUM OP_MUL OP_SWAP OP_DIV OP_NIP OP_SWAP OP_FROMALTSTACK OP_ADD OP_TOALTSTACK OP_2DUP OP_SWAP 0x03 0x40420f OP_BIN2NUM OP_MUL OP_SWAP OP_DIV OP_5 OP_PICK OP_EQUALVERIFY OP_SWAP OP_4 OP_ROLL OP_ADD OP_TOALTSTACK OP_2DUP OP_SWAP 0x03 0x40420f OP_BIN2NUM OP_MUL OP_SWAP OP_DIV OP_3 OP_PICK OP_EQUALVERIFY OP_DROP OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK 0x03 0x40420f OP_BIN2NUM OP_MUL OP_SWAP 0x02 0xe803 OP_BIN2NUM OP_SUB OP_3 OP_PICK OP_0 OP_EQUAL OP_NOTIF OP_DIV OP_NIP OP_SWAP OP_FROMALTSTACK OP_ADD OP_TOALTSTACK OP_2DUP OP_MUL 0x03 0x40420f OP_BIN2NUM OP_DIV OP_5 OP_PICK OP_EQUALVERIFY OP_SWAP OP_4 OP_ROLL OP_ADD OP_TOALTSTACK OP_2DUP OP_MUL 0x03 0x40420f OP_BIN2NUM OP_DIV OP_3 OP_PICK OP_EQUALVERIFY OP_DROP OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_ELSE OP_2DROP OP_DROP OP_FROMALTSTACK OP_ADD OP_TOALTSTACK OP_3 OP_ROLL OP_ADD OP_TOALTSTACK OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_ENDIF OP_ENDIF OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_3 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_1 OP_EQUALVERIFY OP_ELSE OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY OP_TOALTSTACK OP_0 OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_2DROP OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_4 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_HASH160 OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP 0x14 0x759d6677091e973b9e9d99f19c68fbf43e3f05f9 OP_EQUALVERIFY OP_OVER OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_FROMALTSTACK OP_4 OP_PICK OP_BIN2NUM OP_TOALTSTACK OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_2 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_BIN2NUM OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_6 OP_ROLL OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK 0x02 0xe803 OP_BIN2NUM OP_SUB OP_7 OP_ROLL 0x02 0xe803 OP_BIN2NUM OP_SUB OP_2DUP OP_2DUP OP_GREATERTHAN OP_1 OP_EQUALVERIFY OP_SUB OP_8 OP_PICK OP_EQUALVERIFY OP_DROP OP_3 OP_ROLL OP_4 OP_ROLL OP_2DUP OP_SUB OP_TOALTSTACK OP_SWAP 0x03 0x40420f OP_BIN2NUM OP_MUL OP_SWAP OP_DIV OP_2DUP OP_SWAP 0x03 0x40420f OP_BIN2NUM OP_MUL OP_SWAP OP_DIV OP_6 OP_ROLL OP_EQUALVERIFY OP_SWAP OP_DROP OP_2DUP OP_SWAP 0x03 0x40420f OP_BIN2NUM OP_MUL OP_SWAP OP_DIV OP_SWAP OP_TOALTSTACK OP_SUB OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_2DUP OP_SWAP 0x03 0x40420f OP_BIN2NUM OP_MUL OP_SWAP OP_DIV OP_3 OP_PICK OP_EQUALVERIFY OP_DROP OP_SWAP OP_SUB OP_FROMALTSTACK OP_FROMALTSTACK OP_2 OP_ROLL OP_2 OP_ROLL OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_3 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_ELSE OP_DUP OP_3 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY 0x01 0x28 OP_SPLIT OP_NIP OP_FROMALTSTACK OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_0 OP_TOALTSTACK OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_2DROP OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_6 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_2 OP_PICK OP_3 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP 0x14 0x${pumpPublicKeyHash} OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_OVER OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_SWAP OP_4 OP_ROLL OP_BIN2NUM OP_FROMALTSTACK OP_FROMALTSTACK OP_6 OP_ROLL OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_2DUP OP_MUL OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_6 OP_PICK OP_DUP OP_TOALTSTACK OP_2 OP_PICK OP_GREATERTHAN OP_1 OP_EQUALVERIFY OP_5 OP_PICK OP_2DUP OP_SWAP OP_GREATERTHAN OP_1 OP_EQUALVERIFY OP_7 OP_PICK OP_GREATERTHANOREQUAL OP_1 OP_EQUALVERIFY OP_2DROP OP_2 OP_ROLL OP_SUB OP_DUP OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_DIV OP_EQUALVERIFY OP_4 OP_ROLL OP_EQUALVERIFY OP_3 OP_ROLL OP_BIN2NUM OP_EQUALVERIFY OP_2DROP OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_7 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_7 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_7 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_7 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_7 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_DROP OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_2 OP_PICK OP_3 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP 0x14 0x${pumpPublicKeyHash} OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_10 OP_PICK OP_BIN2NUM OP_SUB OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_4 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_2 OP_ROLL OP_EQUALVERIFY OP_OVER OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_FROMALTSTACK OP_4 OP_PICK OP_BIN2NUM OP_TOALTSTACK OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_SWAP OP_4 OP_ROLL OP_BIN2NUM OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_7 OP_ROLL OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_2DUP OP_MUL OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_6 OP_ROLL OP_2DUP OP_GREATERTHAN OP_1 OP_EQUALVERIFY OP_SUB OP_5 OP_PICK OP_EQUALVERIFY OP_5 OP_PICK OP_SUB OP_4 OP_ROLL OP_GREATERTHANOREQUAL OP_1 OP_EQUALVERIFY OP_2 OP_ROLL OP_ADD OP_DUP OP_FROMALTSTACK OP_SWAP OP_DIV OP_3 OP_ROLL OP_EQUALVERIFY OP_2 OP_ROLL OP_EQUALVERIFY OP_SWAP OP_BIN2NUM OP_EQUALVERIFY OP_ENDIF OP_ENDIF`);
        const poolNftCodeLast = new tbc.Script(`OP_ELSE OP_4 OP_EQUALVERIFY OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_0 OP_TOALTSTACK OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_2DROP OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_6 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_BIN2NUM OP_FROMALTSTACK OP_3 OP_ROLL OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_4 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_3 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_FROMALTSTACK OP_EQUALVERIFY OP_ENDIF OP_ENDIF OP_ENDIF OP_2 OP_PUSH_META OP_BIN2NUM OP_0 OP_EQUALVERIFY OP_TRUE OP_RETURN 0x${tagLengthHex} 0x${tagHex} 0x05 0x32436f6465`);
        const firstCode = tbc.Script.fromASM(`OP_DUP ${scriptLength} OP_SPLIT OP_DROP`);
        let lastCode = new tbc.Script();
        if (pubKeyLock.length === 1) {
            lastCode = tbc.Script.fromASM(`${pubKeyLock[0]} OP_EQUALVERIFY OP_CHECKSIGVERIFY`);
        }
        else {
            let script = "";
            for (let i = 0; i < pubKeyLock.length - 1; i++) {
                script += `OP_DUP ${pubKeyLock[i]} OP_EQUAL OP_IF OP_DROP OP_ELSE `;
            }
            script += `${pubKeyLock[pubKeyLock.length - 1]} OP_EQUALVERIFY `;
            for (let i = 0; i < pubKeyLock.length - 1; i++) {
                script += "OP_ENDIF ";
            }
            script += "OP_CHECKSIGVERIFY";
            lastCode = tbc.Script.fromASM(script.trim());
        }
        const code = tbc.Script.fromString(poolNftCodePre.toString() +
            " " +
            firstCode.toString() +
            " " +
            lastCode.toString() +
            " " +
            poolNftCodeLast.toString());
        return code;
        //OP_DUP OP_1 OP_SPLIT OP_NIP OP_5 OP_SPLIT OP_DROP 0x05 0x0000000000 OP_EQUALVERIFY
    }
    getFtlpCode(poolNftCodeHash, address, tapeSize) {
        const codeHash = poolNftCodeHash;
        const publicKeyHash = tbc.Address.fromString(address).hashBuffer.toString("hex");
        const hash = publicKeyHash + "00";
        const tapeSizeHex = (0, poolnftunlock_1.getSize)(tapeSize).toString("hex");
        const ftlpcode = new tbc.Script(`OP_9 OP_PICK OP_TOALTSTACK OP_1 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_5 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_4 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_3 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_2 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_1 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_0 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_TOALTSTACK OP_SHA256 OP_FROMALTSTACK OP_CAT OP_CAT OP_HASH256 OP_6 OP_PUSH_META 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_DUP OP_HASH160 OP_FROMALTSTACK OP_EQUALVERIFY OP_CHECKSIGVERIFY OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_ELSE OP_TOALTSTACK OP_PARTIAL_HASH OP_DUP 0x20 0x${codeHash} OP_EQUALVERIFY OP_ENDIF OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_7 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_0 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_SHA256 OP_7 OP_PUSH_META OP_EQUAL OP_NIP OP_PUSHDATA1 0x82 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff OP_DROP OP_RETURN 0x15 0x${hash} 0x05 0x02436f6465`);
        return ftlpcode;
    }
    getFtlpCodeWithLockTime(poolNftCodeHash, address, tapeSize) {
        const codeHash = poolNftCodeHash;
        const publicKeyHash = tbc.Address.fromString(address).hashBuffer.toString("hex");
        const hash = publicKeyHash + "00";
        const tapeSizeHex = (0, poolnftunlock_1.getSize)(tapeSize).toString("hex");
        const ftlpcode = new tbc.Script(`OP_9 OP_PICK OP_TOALTSTACK OP_1 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_1 OP_SPLIT OP_NIP OP_4 OP_SPLIT OP_DROP OP_BIN2NUM OP_2 OP_PUSH_META OP_BIN2NUM OP_LESSTHANOREQUAL OP_1 OP_EQUALVERIFY OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_5 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_4 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_3 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_2 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_1 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_0 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_TOALTSTACK OP_SHA256 OP_FROMALTSTACK OP_CAT OP_CAT OP_HASH256 OP_6 OP_PUSH_META 0x01 0x20 OP_SPLIT OP_4 OP_SPLIT OP_NIP OP_BIN2NUM 0x04 0xffffffff OP_BIN2NUM OP_NUMNOTEQUAL OP_1 OP_EQUALVERIFY OP_EQUALVERIFY OP_DUP OP_HASH160 OP_FROMALTSTACK OP_EQUALVERIFY OP_CHECKSIGVERIFY OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_ELSE OP_TOALTSTACK OP_PARTIAL_HASH OP_DUP 0x20 0x${codeHash} OP_EQUALVERIFY OP_ENDIF OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_7 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_0 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_SHA256 OP_7 OP_PUSH_META OP_EQUAL OP_NIP OP_PUSHDATA1 0x6a 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff OP_DROP OP_RETURN 0x15 0x${hash} 0x05 0x02436f6465`);
        return ftlpcode;
    }
}
module.exports = poolNFT2;
