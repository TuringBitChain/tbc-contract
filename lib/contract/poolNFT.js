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
const API = require("../api/api");
const FT = require("./ft");
const partial_sha256 = require("tbc-lib-js/lib/util/partial-sha256");
class poolNFT {
    ft_lp_amount;
    ft_a_amount;
    tbc_amount;
    ft_lp_partialhash;
    ft_a_partialhash;
    ft_a_contractTxid;
    poolnft_code;
    contractTxid;
    ft_a_number;
    precision = BigInt(1000000);
    network;
    constructor(config) {
        this.ft_lp_amount = BigInt(0);
        this.ft_a_amount = BigInt(0);
        this.tbc_amount = BigInt(0);
        this.ft_a_number = 0;
        this.ft_a_contractTxid = "";
        this.ft_lp_partialhash = "";
        this.ft_a_partialhash = "";
        this.poolnft_code = "";
        this.contractTxid = "";
        this.network = config?.network ?? "mainnet";
        if (typeof config.txidOrParams === "string") {
            this.contractTxid = config.txidOrParams;
        }
        else if (config.txidOrParams) {
            if (config.txidOrParams.ft_a <= 0 ||
                config.txidOrParams.tbc_amount <= 0) {
                throw new Error("Invalid number.");
            }
            this.ft_a_amount = BigInt(0);
            this.tbc_amount = BigInt(Math.floor(config.txidOrParams.tbc_amount * Math.pow(10, 6)));
            this.ft_lp_amount = this.tbc_amount;
            this.ft_a_number = config.txidOrParams.ft_a;
            this.ft_a_contractTxid = config.txidOrParams.ftContractTxid;
        }
    }
    async initCreate(ftContractTxid) {
        if (!ftContractTxid && this.ft_a_contractTxid != "") {
            const FTA = new FT(this.ft_a_contractTxid);
            const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
            FTA.initialize(FTAInfo);
            this.ft_a_amount = BigInt(Math.floor(this.ft_a_number * Math.pow(10, FTA.decimal)));
        }
        else if (ftContractTxid) {
            this.ft_a_contractTxid = ftContractTxid;
        }
        else {
            throw new Error("Invalid Input");
        }
    }
    async initfromContractId() {
        const poolNFTInfo = await this.fetchPoolNFTInfo(this.contractTxid);
        this.ft_lp_amount = poolNFTInfo.ft_lp_amount;
        this.ft_a_amount = poolNFTInfo.ft_a_amount;
        this.tbc_amount = poolNFTInfo.tbc_amount;
        this.ft_lp_partialhash = poolNFTInfo.ft_lp_partialhash;
        this.ft_a_partialhash = poolNFTInfo.ft_a_partialhash;
        this.ft_a_contractTxid = poolNFTInfo.ft_a_contractTxid;
        this.poolnft_code = poolNFTInfo.poolnft_code;
    }
    /**
     * 创建一个池 NFT，并返回未检查的交易原始数据。
     *
     * @param {tbc.PrivateKey} privateKey_from - 用于创建池 NFT 的私钥。
     * @param {tbc.Transaction.IUnspentOutput} utxo - 用于创建交易的未花费输出。
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
    async createPoolNFT(privateKey_from, utxo) {
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
        if (txSize < 1000) {
            txSource.fee(80);
        }
        else {
            txSource.feePerKb(100);
        }
        txSource.sign(privateKey).seal();
        const txSourceRaw = txSource.uncheckedSerialize(); //Generate txraw
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        //const utxo = await API.fetchUTXO(privateKey, 0.1, this.network);
        this.poolnft_code = this.getPoolNftCode(txSource.hash, 0)
            .toBuffer()
            .toString("hex");
        //this.poolnft_code = this.getPoolNftCode(utxo.txId, utxo.outputIndex).toBuffer().toString('hex');
        const ftlpCode = this.getFTLPcode(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex")).toString("hex"), privateKey.toAddress().toString(), FTA.tapeScript.length / 2);
        this.ft_lp_partialhash = partial_sha256.calculate_partial_hash(ftlpCode.toBuffer().subarray(0, 1536));
        this.ft_a_partialhash = partial_sha256.calculate_partial_hash(Buffer.from(FTA.codeScript, "hex").subarray(0, 1536));
        const writer = new tbc.encoding.BufferWriter();
        writer.writeUInt64LEBN(new tbc.crypto.BN(0));
        writer.writeUInt64LEBN(new tbc.crypto.BN(0));
        writer.writeUInt64LEBN(new tbc.crypto.BN(0));
        const amountData = writer.toBuffer().toString("hex");
        const poolnftTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${this.ft_lp_partialhash + this.ft_a_partialhash} ${amountData} ${this.ft_a_contractTxid} 4e54617065`);
        const tx = new tbc.Transaction()
            .addInputFromPrevTx(txSource, 0)
            //.from(utxo)
            //poolNft
            .addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: 1000,
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
    async createPoolNftWithLock(privateKey_from, utxo) {
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
        if (txSize < 1000) {
            txSource.fee(80);
        }
        else {
            txSource.feePerKb(100);
        }
        txSource.sign(privateKey).seal();
        const txSourceRaw = txSource.uncheckedSerialize(); //Generate txraw
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        //const utxo = await API.fetchUTXO(privateKey, 0.1, this.network);
        this.poolnft_code = this.getPoolNftCodeWithLock(txSource.hash, 0)
            .toBuffer()
            .toString("hex");
        const ftlpCode = this.getFTLPcode(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex")).toString("hex"), privateKey.toAddress().toString(), FTA.tapeScript.length / 2);
        this.ft_lp_partialhash = partial_sha256.calculate_partial_hash(ftlpCode.toBuffer().subarray(0, 1536));
        this.ft_a_partialhash = partial_sha256.calculate_partial_hash(Buffer.from(FTA.codeScript, "hex").subarray(0, 1536));
        const writer = new tbc.encoding.BufferWriter();
        writer.writeUInt64LEBN(new tbc.crypto.BN(0));
        writer.writeUInt64LEBN(new tbc.crypto.BN(0));
        writer.writeUInt64LEBN(new tbc.crypto.BN(0));
        const amountData = writer.toBuffer().toString("hex");
        const poolnftTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${this.ft_lp_partialhash + this.ft_a_partialhash} ${amountData} ${this.ft_a_contractTxid} 4e54617065`);
        const tx = new tbc.Transaction()
            .addInputFromPrevTx(txSource, 0)
            //.from(utxo)
            //poolNft
            .addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: 1000,
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
     * @param {string} address_to - NFT 接收地址。
     * @param {tbc.Transaction.IUnspentOutput} utxo - 用于创建交易的未花费输出。
     * @param {number} [tbc_amount] - 可选的 TBC 数量，用于交易。
     * @param {number} [ft_a] - 可选的 FT-A 数量，用于交易。
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
    async initPoolNFT(privateKey_from, address_to, utxo, tbc_amount, ft_a) {
        const privateKey = privateKey_from;
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        let amount_lpbn = BigInt(0);
        if (tbc_amount && ft_a) {
            amount_lpbn = BigInt(Math.floor(tbc_amount * Math.pow(10, 6)));
            this.tbc_amount = BigInt(Math.floor(tbc_amount * Math.pow(10, 6)));
            this.ft_lp_amount = this.tbc_amount;
            this.ft_a_number = ft_a;
            this.ft_a_amount = BigInt(Math.floor(this.ft_a_number * Math.pow(10, FTA.decimal)));
        }
        else if (!tbc_amount &&
            !ft_a &&
            this.tbc_amount != BigInt(0) &&
            this.ft_a_amount != BigInt(0)) {
            amount_lpbn = BigInt(this.tbc_amount);
            this.tbc_amount = this.tbc_amount;
            this.ft_lp_amount = this.tbc_amount;
            this.ft_a_amount = this.ft_a_amount;
        }
        else {
            throw new Error("Invalid Input");
        }
        const tapeAmountSetIn = [];
        //const utxo = await API.fetchUTXO(privateKey, 0.1, this.network);
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
            const errorMessage = error.message === "Insufficient FTbalance, please merge FT UTXOs"
                ? "Insufficient FT-A amount, please merge FT-A UTXOs"
                : error.message;
            throw new Error(errorMessage);
        }
        const ftPreTX = await API.fetchTXraw(fttxo_a.txId, this.network);
        const ftPrePreTxData = await API.fetchFtPrePreTxData(ftPreTX, fttxo_a.outputIndex, this.network);
        //const fttxo_a = await FTA.fetchFtUTXO(this.ft_a_contractTxid, privateKey.toAddress().toString(), this.ft_a_amount);
        if (fttxo_a.ftBalance < this.ft_a_amount) {
            throw new Error("Insufficient FT-A amount, please merge FT-A UTXOs");
        }
        tapeAmountSetIn.push(fttxo_a.ftBalance);
        let tapeAmountSum = BigInt(0);
        for (let i = 0; i < tapeAmountSetIn.length; i++) {
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
        }
        const { amountHex, changeHex } = FT.buildTapeAmount(this.ft_a_amount, tapeAmountSetIn, 1);
        const writer = new tbc.encoding.BufferWriter();
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_lp_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_a_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.tbc_amount));
        const amountData = writer.toBuffer().toString("hex");
        const poolnftTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${this.ft_lp_partialhash + this.ft_a_partialhash} ${amountData} ${this.ft_a_contractTxid} 4e54617065`);
        const poolnft = await this.fetchPoolNftUTXO(this.contractTxid);
        const tx = new tbc.Transaction()
            .from(poolnft)
            .from(fttxo_a)
            .from(utxo)
            //poolNft
            .addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: 1000,
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
            satoshis: Number(this.tbc_amount),
        })).addOutput(new tbc.Transaction.Output({
            script: ftTapeScript,
            satoshis: 0,
        }));
        //FTLP
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
        const ftlpTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${ftlpTapeAmount} 06 ${nameHex} ${symbolHex} 4654617065`);
        const tapeSize = ftlpTapeScript.toBuffer().length;
        const ftlpCodeScript = this.getFTLPcode(poolnft_codehash.toString("hex"), address_to, tapeSize);
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
                satoshis: 500,
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
            const unlockingScript = await this.getPoolNFTunlock(privateKey, tx, 0, poolnft.txId, poolnft.outputIndex, 1);
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
     * @param {string} address_to - LP 接收地址。
     * @param {tbc.Transaction.IUnspentOutput} utxo - 用于创建交易的未花费输出。
     * @param {number} amount_tbc - 增加的 TBC 数量。
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
    async increaseLP(privateKey_from, address_to, utxo, amount_tbc) {
        const privateKey = privateKey_from;
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        const amount_tbcbn = BigInt(Math.floor(amount_tbc * Math.pow(10, 6)));
        const changeDate = this.updatePoolNFT(amount_tbc, FTA.decimal, 2);
        const poolnft_codehash = tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex"));
        const poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(poolnft_codehash).toString("hex");
        const tapeAmountSetIn = [];
        // Fetch FT UTXO for the transfer
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
        //const fttxo_a = await FTA.fetchFtUTXO(this.ft_a_contractTxid, privateKey.toAddress().toString(), changeDate.ft_a_difference);
        tapeAmountSetIn.push(fttxo_a.ftBalance);
        // Calculate the total available balance
        let tapeAmountSum = BigInt(0);
        for (let i = 0; i < tapeAmountSetIn.length; i++) {
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
        }
        // Check if the balance is sufficient
        if (changeDate.ft_a_difference > tapeAmountSum) {
            throw new Error("Insufficient balance, please merge FT UTXOs");
        }
        // Build the amount and change hex strings for the tape
        let { amountHex, changeHex } = FT.buildTapeAmount(changeDate.ft_a_difference, tapeAmountSetIn, 1);
        //const utxo = await API.fetchUTXO(privateKey, 0.1, this.network);
        if (utxo.satoshis < Number(amount_tbcbn)) {
            throw new Error("Insufficient TBC amount, please merge UTXOs");
        }
        const poolnft = await this.fetchPoolNftUTXO(this.contractTxid);
        // Construct the transaction
        const tx = new tbc.Transaction().from(poolnft).from(fttxo_a).from(utxo);
        tx.addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: 1000,
        }));
        const writer = new tbc.encoding.BufferWriter();
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_lp_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_a_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.tbc_amount));
        const amountData = writer.toBuffer().toString("hex");
        const poolnftTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${this.ft_lp_partialhash + this.ft_a_partialhash} ${amountData} ${this.ft_a_contractTxid} 4e54617065`);
        tx.addOutput(new tbc.Transaction.Output({
            script: poolnftTapeScript,
            satoshis: 0,
        }));
        // FTAbyC
        const ftabycCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftabycCodeScript,
            satoshis: Number(changeDate.tbc_amount_difference),
        }));
        const ftabycTapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftabycTapeScript,
            satoshis: 0,
        }));
        //FTLP
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
        const ftlpTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${ftlpTapeAmount} 06 ${nameHex} ${symbolHex} 4654617065`);
        const tapeSize = ftlpTapeScript.toBuffer().length;
        const ftlpCodeScript = this.getFTLPcode(poolnft_codehash.toString("hex"), address_to, tapeSize);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftlpCodeScript,
            satoshis: 500,
        }));
        tx.addOutput(new tbc.Transaction.Output({
            script: ftlpTapeScript,
            satoshis: 0,
        }));
        if (changeDate.ft_a_difference < tapeAmountSum) {
            // FTAbyA_change
            const ftabya_changeCodeScript = FT.buildFTtransferCode(FTA.codeScript, privateKey.toAddress().toString());
            tx.addOutput(new tbc.Transaction.Output({
                script: ftabya_changeCodeScript,
                satoshis: 500,
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
            const unlockingScript = await this.getPoolNFTunlock(privateKey, tx, 0, poolnft.txId, poolnft.outputIndex, 1);
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
     * 消耗流动性池中的 LP，并返回未检查的交易原始数据。
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
     * 4. 获取流动性池 UTXO 和 FT UTXO，确保有足够的余额进行交易。
     * 5. 构建用于流动性池和 FT 转移的脚本，并设置相关输出。
     * 6. 构建 FT LP 的脚本，包含名称和符号信息，并添加到交易中。
     * 7. 根据需要添加找零输出，确保所有金额正确处理。
     * 8. 设置每千字节的交易费用，并指定找零地址。
     * 9. 异步设置输入脚本以解锁相应的 UTXO，并签名交易。
     * 10. 封装交易并返回序列化后的未检查交易数据以供发送。
     */
    async consumeLP(privateKey_from, address_to, utxo, amount_lp) {
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
        const ftlpCode = this.getFTLPcode(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex")).toString("hex"), privateKey.toAddress().toString(), FTA.tapeScript.length / 2);
        let fttxo_lp;
        try {
            fttxo_lp = await this.fetchFtlpUTXO(ftlpCode.toBuffer().toString("hex"), changeDate.ft_lp_difference);
        }
        catch (error) {
            throw new Error(error.message);
        }
        ftPreTX.push(await API.fetchTXraw(fttxo_lp.txId, this.network));
        ftPrePreTxData.push(await API.fetchFtPrePreTxData(ftPreTX[0], fttxo_lp.outputIndex, this.network));
        lpTapeAmountSetIn.push(fttxo_lp.ftBalance);
        // Fetch FT UTXO for the transfer
        const ftutxo_codeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160)
            .toBuffer()
            .toString("hex");
        let fttxo_c;
        try {
            fttxo_c = await API.fetchFtUTXO(this.ft_a_contractTxid, poolnft_codehash160, changeDate.ft_a_difference, ftutxo_codeScript, this.network);
            if (fttxo_c.satoshis < Number(changeDate.tbc_amount_difference)) {
                throw new Error("Insufficient PoolTbc, please merge FT UTXOs");
            }
        }
        catch (error) {
            const errorMessage = error.message === "Insufficient FTbalance, please merge FT UTXOs"
                ? "Insufficient PoolTbc, please merge FT UTXOs"
                : error.message;
            throw new Error(errorMessage);
        }
        ftPreTX.push(await API.fetchTXraw(fttxo_c.txId, this.network));
        ftPrePreTxData.push(await API.fetchFtPrePreTxData(ftPreTX[1], fttxo_c.outputIndex, this.network));
        //const fttxo_c = await FTA.fetchFtUTXO(this.ft_a_contractTxid, poolnft_codehash160, changeDate.ft_a_difference);
        // if (fttxo_c.ftBalance === undefined) {
        //     throw new Error('ftBalance is undefined');
        // } else if (fttxo_c.satoshis < Number(changeDate.tbc_amount_difference)) {
        //     throw new Error('PoolFtUTXO tbc_amount is insufficient, please merge UTXOs');
        // }
        tapeAmountSetIn.push(fttxo_c.ftBalance);
        // Calculate the total available balance
        let tapeAmountSum = BigInt(0);
        for (let i = 0; i < tapeAmountSetIn.length; i++) {
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
        }
        // Build the amount and change hex strings for the tape
        let { amountHex, changeHex } = FT.buildTapeAmount(changeDate.ft_a_difference, tapeAmountSetIn, 2);
        const ftAbyA = amountHex;
        const ftAbyC = changeHex;
        ({ amountHex, changeHex } = FT.buildTapeAmount(changeDate.ft_lp_difference, lpTapeAmountSetIn, 1));
        const ftlpBurn = amountHex;
        const ftlpChange = changeHex;
        //const utxo = await API.fetchUTXO(privateKey, 0.1, this.network);
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
            satoshis: 1000,
        }));
        const writer = new tbc.encoding.BufferWriter();
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_lp_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_a_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.tbc_amount));
        const amountData = writer.toBuffer().toString("hex");
        const poolnftTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${this.ft_lp_partialhash + this.ft_a_partialhash} ${amountData} ${this.ft_a_contractTxid} 4e54617065`);
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
        tx.to(privateKey.toAddress().toString(), Number(changeDate.tbc_amount_difference));
        //FTLP_Burn
        const nameHex = Buffer.from(FTA.name, "utf8").toString("hex");
        const symbolHex = Buffer.from(FTA.symbol, "utf8").toString("hex");
        const amountwriter = new tbc.encoding.BufferWriter();
        for (let i = 0; i < 6; i++) {
            amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
        }
        const ftlpTapeAmount = amountwriter.toBuffer().toString("hex");
        let ftlpTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${ftlpTapeAmount} 06 ${nameHex} ${symbolHex} 4654617065`);
        const ftlpCodeScript = FT.buildFTtransferCode(ftlpCode.toBuffer().toString("hex"), "1BitcoinEaterAddressDontSendf59kuE");
        tx.addOutput(new tbc.Transaction.Output({
            script: ftlpCodeScript,
            satoshis: 500,
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
                satoshis: 500,
            }));
            const ftlp_changeTapeScript = FT.buildFTtransferTape(ftlpTapeScript.toBuffer().toString("hex"), ftlpChange);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftlp_changeTapeScript,
                satoshis: 0,
            }));
        }
        // FTAbyC_change
        if (changeDate.ft_a_difference < tapeAmountSum ||
            fttxo_c.satoshis > Number(changeDate.tbc_amount_difference)) {
            const ftabycCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftabycCodeScript,
                satoshis: fttxo_c.satoshis - Number(changeDate.tbc_amount_difference),
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
            const unlockingScript = await this.getPoolNFTunlock(privateKey, tx, 0, poolnft.txId, poolnft.outputIndex, 2);
            return unlockingScript;
        });
        await tx.setInputScriptAsync({
            inputIndex: 1,
        }, async (tx) => {
            const unlockingScript = await FTA.getFTunlock(privateKey, tx, ftPreTX[0], ftPrePreTxData[0], 1, fttxo_lp.outputIndex);
            return unlockingScript;
        });
        await tx.setInputScriptAsync({
            inputIndex: 2,
        }, async (tx) => {
            const unlockingScript = await FTA.getFTunlockSwap(privateKey, tx, ftPreTX[1], ftPrePreTxData[1], contractTX, 2, fttxo_c.outputIndex);
            return unlockingScript;
        });
        tx.sign(privateKey);
        await tx.sealAsync();
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    /**
     * @deprecated 方法已弃用，请使用 swaptoToken_baseTBC 方法。
     * 将 FT-A 交换为指定数量的代币，并返回未检查的交易原始数据。
     *
     * @param {tbc.PrivateKey} privateKey_from - 用于签名交易的私钥。
     * @param {string} address_to - 接收代币的地址。
     * @param {tbc.Transaction.IUnspentOutput} utxo - 用于创建交易的未花费输出。
     * @param {number} amount_token - 要交换的代币数量。
     * @returns {Promise<string>} 返回一个 Promise，解析为字符串形式的未检查交易数据。
     *
     * 该函数执行以下主要步骤：
     * 1. 初始化 FT 实例并获取相关信息，包括合约交易 ID 和网络信息。
     * 2. 将输入的代币数量转换为 BigInt，并验证是否有足够的 FT-A 余额进行交换。
     * 3. 计算池 NFT 的哈希值，并更新 FT-A 和 TBC 的余额。
     * 4. 获取 FT UTXO 和相关交易数据，确保有足够的 FT 进行交换。
     * 5. 构建用于池 NFT 和 FT 转移的脚本，并设置相关输出。
     * 6. 构建 FT-A 的转移脚本和相应的输出，确保所有金额正确处理。
     * 7. 设置每千字节的交易费用，并指定找零地址。
     * 8. 异步设置输入脚本以解锁相应的 UTXO，并签名交易。
     * 9. 封装交易并返回序列化后的未检查交易数据以供发送。
     */
    async swaptoToken(privateKey_from, address_to, utxo, amount_token) {
        const privateKey = privateKey_from;
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        const amount_ftbn = BigInt(Math.floor(amount_token * Math.pow(10, FTA.decimal)));
        if (this.ft_a_amount < amount_ftbn) {
            throw new Error("Invalid FT-A amount input");
        }
        const poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex"))).toString("hex");
        const poolMul = this.ft_a_amount * this.tbc_amount;
        const tbc_amount = this.tbc_amount;
        this.ft_a_amount = BigInt(this.ft_a_amount) - BigInt(amount_ftbn);
        this.tbc_amount = BigInt(poolMul) / BigInt(this.ft_a_amount);
        const tbc_amount_increment = BigInt(this.tbc_amount) - BigInt(tbc_amount);
        const tapeAmountSetIn = [];
        // Fetch FT UTXO for the transfer
        const ftutxo_codeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160)
            .toBuffer()
            .toString("hex");
        let fttxo_c;
        try {
            fttxo_c = await API.fetchFtUTXO(this.ft_a_contractTxid, poolnft_codehash160, amount_ftbn, ftutxo_codeScript, this.network);
        }
        catch (error) {
            const errorMessage = error.message === "Insufficient FTbalance, please merge FT UTXOs"
                ? "Insufficient PoolFT, please merge FT UTXOs"
                : error.message;
            throw new Error(errorMessage);
        }
        const ftPreTX = await API.fetchTXraw(fttxo_c.txId, this.network);
        const ftPrePreTxData = await API.fetchFtPrePreTxData(ftPreTX, fttxo_c.outputIndex, this.network);
        //const fttxo_c = await FTA.fetchFtUTXO(this.ft_a_contractTxid, poolnft_codehash160, amount_ftbn);
        tapeAmountSetIn.push(fttxo_c.ftBalance);
        // Calculate the total available balance
        let tapeAmountSum = BigInt(0);
        for (let i = 0; i < tapeAmountSetIn.length; i++) {
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
        }
        // Build the amount and change hex strings for the tape
        const { amountHex, changeHex } = FT.buildTapeAmount(amount_ftbn, tapeAmountSetIn, 2);
        //const utxo = await API.fetchUTXO(privateKey, Number(tbc_amount_increment) / Math.pow(10, 6), this.network);
        if (utxo.satoshis < Number(tbc_amount_increment)) {
            throw new Error("Insufficient TBC amount, please merge UTXOs");
        }
        const poolnft = await this.fetchPoolNftUTXO(this.contractTxid);
        const contractTX = await API.fetchTXraw(poolnft.txId, this.network);
        // Construct the transaction
        const tx = new tbc.Transaction().from(poolnft).from(utxo).from(fttxo_c);
        tx.addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: 1000,
        }));
        const writer = new tbc.encoding.BufferWriter();
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_lp_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_a_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.tbc_amount));
        const amountData = writer.toBuffer().toString("hex");
        const poolnftTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${this.ft_lp_partialhash + this.ft_a_partialhash} ${amountData} ${this.ft_a_contractTxid} 4e54617065`);
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
        // FTAbyC
        const ftabycCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftabycCodeScript,
            satoshis: fttxo_c.satoshis + Number(tbc_amount_increment),
        }));
        const ftabycTapeScript = FT.buildFTtransferTape(FTA.tapeScript, changeHex);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftabycTapeScript,
            satoshis: 0,
        }));
        tx.feePerKb(80);
        tx.change(privateKey.toAddress());
        await tx.setInputScriptAsync({
            inputIndex: 0,
        }, async (tx) => {
            const unlockingScript = await this.getPoolNFTunlock(privateKey, tx, 0, poolnft.txId, poolnft.outputIndex, 3, 1);
            return unlockingScript;
        });
        await tx.setInputScriptAsync({
            inputIndex: 2,
        }, async (tx) => {
            const unlockingScript = await FTA.getFTunlockSwap(privateKey, tx, ftPreTX, ftPrePreTxData, contractTX, 2, fttxo_c.outputIndex);
            return unlockingScript;
        });
        tx.sign(privateKey);
        await tx.sealAsync();
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    /**
     * 将指定数量的 TBC 交换为 FT-A，并返回未检查的交易原始数据。
     *
     * @param {tbc.PrivateKey} privateKey_from - 用于签名交易的私钥。
     * @param {string} address_to - 接收 FT-A 的地址。
     * @param {tbc.Transaction.IUnspentOutput} utxo - 用于创建交易的未花费输出。
     * @param {number} amount_tbc - 要交换的 TBC 数量。
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
    async swaptoToken_baseTBC(privateKey_from, address_to, utxo, amount_tbc) {
        const privateKey = privateKey_from;
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        if (amount_tbc <= 0) {
            throw new Error("Invalid TBC amount input");
        }
        const poolMul = this.ft_a_amount * this.tbc_amount;
        const ft_a_amount = this.ft_a_amount;
        const amount_tbcbn = BigInt(Math.floor(amount_tbc * Math.pow(10, 6)));
        this.tbc_amount = BigInt(this.tbc_amount) + BigInt(amount_tbcbn);
        this.ft_a_amount = BigInt(poolMul) / BigInt(this.tbc_amount);
        const ft_a_amount_decrement = BigInt(ft_a_amount) - BigInt(this.ft_a_amount);
        const poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex"))).toString("hex");
        const tapeAmountSetIn = [];
        // Fetch FT UTXO for the transfer
        const ftutxo_codeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160)
            .toBuffer()
            .toString("hex");
        let fttxo_c;
        try {
            fttxo_c = await API.fetchFtUTXO(this.ft_a_contractTxid, poolnft_codehash160, ft_a_amount_decrement, ftutxo_codeScript, this.network);
        }
        catch (error) {
            const errorMessage = error.message === "Insufficient FTbalance, please merge FT UTXOs"
                ? "Insufficient PoolFT, please merge FT UTXOs"
                : error.message;
            throw new Error(errorMessage);
        }
        const ftPreTX = await API.fetchTXraw(fttxo_c.txId, this.network);
        const ftPrePreTxData = await API.fetchFtPrePreTxData(ftPreTX, fttxo_c.outputIndex, this.network);
        tapeAmountSetIn.push(BigInt(fttxo_c.ftBalance));
        // Calculate the total available balance
        let tapeAmountSum = BigInt(0);
        for (let i = 0; i < tapeAmountSetIn.length; i++) {
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
        }
        // Build the amount and change hex strings for the tape
        const { amountHex, changeHex } = FT.buildTapeAmount(ft_a_amount_decrement, tapeAmountSetIn, 2);
        //const utxo = await FTA.fetchUTXO(privateKey.toAddress().toString());
        if (utxo.satoshis < Number(amount_tbcbn)) {
            throw new Error("Insufficient TBC amount, please merge UTXOs");
        }
        const poolnft = await this.fetchPoolNftUTXO(this.contractTxid);
        const contractTX = await API.fetchTXraw(poolnft.txId, this.network);
        // Construct the transaction
        const tx = new tbc.Transaction().from(poolnft).from(utxo).from(fttxo_c);
        tx.addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: 1000,
        }));
        const writer = new tbc.encoding.BufferWriter();
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_lp_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_a_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.tbc_amount));
        const amountData = writer.toBuffer().toString("hex");
        const poolnftTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${this.ft_lp_partialhash + this.ft_a_partialhash} ${amountData} ${this.ft_a_contractTxid} 4e54617065`);
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
        // FTAbyC
        const ftabycCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftabycCodeScript,
            satoshis: fttxo_c.satoshis + Number(amount_tbcbn),
        }));
        const ftabycTapeScript = FT.buildFTtransferTape(FTA.tapeScript, changeHex);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftabycTapeScript,
            satoshis: 0,
        }));
        tx.feePerKb(80);
        tx.change(privateKey.toAddress());
        await tx.setInputScriptAsync({
            inputIndex: 0,
        }, async (tx) => {
            const unlockingScript = await this.getPoolNFTunlock(privateKey, tx, 0, poolnft.txId, poolnft.outputIndex, 3, 1);
            return unlockingScript;
        });
        await tx.setInputScriptAsync({
            inputIndex: 2,
        }, async (tx) => {
            const unlockingScript = await FTA.getFTunlockSwap(privateKey, tx, ftPreTX, ftPrePreTxData, contractTX, 2, fttxo_c.outputIndex);
            return unlockingScript;
        });
        tx.sign(privateKey);
        await tx.sealAsync();
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }
    /**
     * @deprecated 方法已弃用，请使用 swaptoTBC_baseToken 方法。
     * 将指定数量的 FT-A 交换为 TBC，并返回未检查的交易原始数据。
     *
     * @param {tbc.PrivateKey} privateKey_from - 用于签名交易的私钥。
     * @param {string} address_to - 接收 TBC 的地址。
     * @param {tbc.Transaction.IUnspentOutput} utxo - 用于创建交易的未花费输出。
     * @param {number} amount_tbc - 要交换的 TBC 数量。
     * @returns {Promise<string>} 返回一个 Promise，解析为字符串形式的未检查交易数据。
     *
     * 该函数执行以下主要步骤：
     * 1. 初始化 FT 实例并获取相关信息，包括合约交易 ID 和网络信息。
     * 2. 将输入的 TBC 数量转换为 BigInt，并验证是否有足够的 TBC 余额进行交换。
     * 3. 计算池 NFT 的哈希值，并更新 FT-A 和 TBC 的余额。
     * 4. 获取 FT-A 的 UTXO 和相关交易数据，确保有足够的 FT-A 金额进行交换。
     * 5. 获取与池 NFT 相关的 FT UTXO，并验证其余额是否足够。
     * 6. 构建用于池 NFT 和 FT 转移的脚本，并设置相关输出。
     * 7. 设置每千字节的交易费用，并指定找零地址。
     * 8. 异步设置输入脚本以解锁相应的 UTXO，并签名交易。
     * 9. 封装交易并返回序列化后的未检查交易数据以供发送。
     */
    async swaptoTBC(privateKey_from, address_to, utxo, amount_tbc) {
        const privateKey = privateKey_from;
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        const amount_tbcbn = BigInt(Math.floor(amount_tbc * Math.pow(10, 6)));
        if (this.tbc_amount < amount_tbcbn) {
            throw new Error("Invalid tbc amount input");
        }
        const poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex"))).toString("hex");
        const poolMul = this.ft_a_amount * this.tbc_amount;
        const ft_a_amount = this.ft_a_amount;
        this.tbc_amount = BigInt(this.tbc_amount) - BigInt(amount_tbcbn);
        this.ft_a_amount = BigInt(poolMul) / BigInt(this.tbc_amount);
        const ft_a_amount_increment = BigInt(this.ft_a_amount) - BigInt(ft_a_amount);
        const tapeAmountSetIn = [];
        const ftPreTX = [];
        const ftPrePreTxData = [];
        // Fetch FT UTXO for the transfer
        const ftutxo_codeScript_a = FT.buildFTtransferCode(FTA.codeScript, privateKey.toAddress().toString())
            .toBuffer()
            .toString("hex");
        let fttxo_a;
        try {
            fttxo_a = await API.fetchFtUTXO(this.ft_a_contractTxid, privateKey.toAddress().toString(), ft_a_amount_increment, ftutxo_codeScript_a, this.network);
        }
        catch (error) {
            const errorMessage = error.message === "Insufficient FTbalance, please merge FT UTXOs"
                ? "Insufficient FT-A amount, please merge FT-A UTXOs"
                : error.message;
            throw new Error(errorMessage);
        }
        ftPreTX.push(await API.fetchTXraw(fttxo_a.txId, this.network));
        ftPrePreTxData.push(await API.fetchFtPrePreTxData(ftPreTX[0], fttxo_a.outputIndex, this.network));
        //const fttxo_a = await FTA.fetchFtUTXO(this.ft_a_contractTxid, privateKey.toAddress().toString(), amount_tbcbn);
        tapeAmountSetIn.push(fttxo_a.ftBalance);
        const ftutxo_codeScript_c = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160)
            .toBuffer()
            .toString("hex");
        let fttxo_c;
        try {
            fttxo_c = await API.fetchFtUTXO(this.ft_a_contractTxid, poolnft_codehash160, BigInt(0), ftutxo_codeScript_c, this.network);
            if (fttxo_c.satoshis < Number(amount_tbcbn)) {
                throw new Error("Insufficient PoolTbc, please merge FT UTXOs");
            }
        }
        catch (error) {
            const errorMessage = error.message === "Insufficient FTbalance, please merge FT UTXOs"
                ? "Insufficient PoolTbc, please merge FT UTXOs"
                : error.message;
            throw new Error(errorMessage);
        }
        ftPreTX.push(await API.fetchTXraw(fttxo_c.txId, this.network));
        ftPrePreTxData.push(await API.fetchFtPrePreTxData(ftPreTX[1], fttxo_c.outputIndex, this.network));
        //const fttxo_c = await FTA.fetchFtUTXO(this.ft_a_contractTxid, poolnft_codehash160, amount_tbcbn);
        tapeAmountSetIn.push(fttxo_c.ftBalance);
        // Build the amount and change hex strings for the tape
        const { amountHex, changeHex } = FT.buildTapeAmount(BigInt(ft_a_amount_increment) + BigInt(fttxo_c.ftBalance), tapeAmountSetIn, 1);
        //const utxo = await API.fetchUTXO(privateKey, 0.1, this.network);
        const poolnft = await this.fetchPoolNftUTXO(this.contractTxid);
        const contractTX = await API.fetchTXraw(poolnft.txId, this.network);
        // Construct the transaction
        const tx = new tbc.Transaction()
            .from(poolnft)
            .from(fttxo_a)
            .from(fttxo_c)
            .from(utxo);
        //poolNft
        tx.addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: 1000,
        }));
        const writer = new tbc.encoding.BufferWriter();
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_lp_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_a_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.tbc_amount));
        const amountData = writer.toBuffer().toString("hex");
        const poolnftTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${this.ft_lp_partialhash + this.ft_a_partialhash} ${amountData} ${this.ft_a_contractTxid} 4e54617065`);
        tx.addOutput(new tbc.Transaction.Output({
            script: poolnftTapeScript,
            satoshis: 0,
        }));
        tx.to(address_to, Number(amount_tbcbn));
        // FTAbyC
        const ftCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftCodeScript,
            satoshis: fttxo_c.satoshis - Number(amount_tbcbn),
        }));
        const ftTapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftTapeScript,
            satoshis: 0,
        }));
        // FTAbyA_change
        if (ft_a_amount_increment < fttxo_a.ftBalance) {
            const ftabycCodeScript = FT.buildFTtransferCode(FTA.codeScript, privateKey.toAddress().toString());
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
            const unlockingScript = await this.getPoolNFTunlock(privateKey, tx, 0, poolnft.txId, poolnft.outputIndex, 3, 2);
            return unlockingScript;
        });
        await tx.setInputScriptAsync({
            inputIndex: 1,
        }, async (tx) => {
            const unlockingScript = await FTA.getFTunlock(privateKey, tx, ftPreTX[0], ftPrePreTxData[0], 1, fttxo_a.outputIndex);
            return unlockingScript;
        });
        await tx.setInputScriptAsync({
            inputIndex: 2,
        }, async (tx) => {
            const unlockingScript = await FTA.getFTunlockSwap(privateKey, tx, ftPreTX[1], ftPrePreTxData[1], contractTX, 2, fttxo_c.outputIndex);
            return unlockingScript;
        });
        tx.sign(privateKey);
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
    async swaptoTBC_baseToken(privateKey_from, address_to, utxo, amount_token) {
        const privateKey = privateKey_from;
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        const amount_ftbn = BigInt(Math.floor(amount_token * Math.pow(10, FTA.decimal)));
        if (amount_token <= 0) {
            throw new Error("Invalid FT amount input");
        }
        const poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex"))).toString("hex");
        const poolMul = this.ft_a_amount * this.tbc_amount;
        const tbc_amount = this.tbc_amount;
        this.ft_a_amount = BigInt(this.ft_a_amount) + BigInt(amount_ftbn);
        this.tbc_amount = BigInt(poolMul) / BigInt(this.ft_a_amount);
        const tbc_amount_decrement = BigInt(tbc_amount) - BigInt(this.tbc_amount);
        const tapeAmountSetIn = [];
        const ftPreTX = [];
        const ftPrePreTxData = [];
        // Fetch FT UTXO for the transfer
        const ftutxo_codeScript_a = FT.buildFTtransferCode(FTA.codeScript, privateKey.toAddress().toString())
            .toBuffer()
            .toString("hex");
        let fttxo_a;
        try {
            fttxo_a = await API.fetchFtUTXO(this.ft_a_contractTxid, privateKey.toAddress().toString(), amount_ftbn, ftutxo_codeScript_a, this.network);
        }
        catch (error) {
            const errorMessage = error.message === "Insufficient FTbalance, please merge FT UTXOs"
                ? "Insufficient FT-A amount, please merge FT-A UTXOs"
                : error.message;
            throw new Error(errorMessage);
        }
        ftPreTX.push(await API.fetchTXraw(fttxo_a.txId, this.network));
        ftPrePreTxData.push(await API.fetchFtPrePreTxData(ftPreTX[0], fttxo_a.outputIndex, this.network));
        // await FTA.mergeFT(privateKey)
        // if (fttxo_a.ftBalance! < amount_ftbn) {
        //     throw new Error('Insufficient FT-A amount, please merge FT-A UTXOs');
        // }
        tapeAmountSetIn.push(BigInt(fttxo_a.ftBalance));
        const ftutxo_codeScript_c = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160)
            .toBuffer()
            .toString("hex");
        let fttxo_c;
        try {
            fttxo_c = await API.fetchFtUTXO(this.ft_a_contractTxid, poolnft_codehash160, BigInt(0), ftutxo_codeScript_c, this.network);
            if (fttxo_c.satoshis < Number(tbc_amount_decrement)) {
                throw new Error("Insufficient PoolTbc, please merge FT UTXOs");
            }
        }
        catch (error) {
            const errorMessage = error.message === "Insufficient FTbalance, please merge FT UTXOs"
                ? "Insufficient PoolTbc, please merge FT UTXOs"
                : error.message;
            throw new Error(errorMessage);
        }
        ftPreTX.push(await API.fetchTXraw(fttxo_c.txId, this.network));
        ftPrePreTxData.push(await API.fetchFtPrePreTxData(ftPreTX[1], fttxo_c.outputIndex, this.network));
        tapeAmountSetIn.push(BigInt(fttxo_c.ftBalance));
        // Build the amount and change hex strings for the tape
        const { amountHex, changeHex } = FT.buildTapeAmount(BigInt(amount_ftbn) + BigInt(fttxo_c.ftBalance), tapeAmountSetIn, 1);
        //const utxo = await FTA.fetchUTXO(privateKey.toAddress().toString());
        const poolnft = await this.fetchPoolNftUTXO(this.contractTxid);
        const contractTX = await API.fetchTXraw(poolnft.txId, this.network);
        // Construct the transaction
        const tx = new tbc.Transaction()
            .from(poolnft)
            .from(fttxo_a)
            .from(fttxo_c)
            .from(utxo);
        //poolNft
        tx.addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: 1000,
        }));
        const writer = new tbc.encoding.BufferWriter();
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_lp_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_a_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.tbc_amount));
        const amountData = writer.toBuffer().toString("hex");
        const poolnftTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${this.ft_lp_partialhash + this.ft_a_partialhash} ${amountData} ${this.ft_a_contractTxid} 4e54617065`);
        tx.addOutput(new tbc.Transaction.Output({
            script: poolnftTapeScript,
            satoshis: 0,
        }));
        tx.to(address_to, Number(tbc_amount_decrement));
        // FTAbyC
        const ftCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftCodeScript,
            satoshis: fttxo_c.satoshis - Number(tbc_amount_decrement),
        }));
        const ftTapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftTapeScript,
            satoshis: 0,
        }));
        // FTAbyA_change
        if (amount_ftbn < fttxo_a.ftBalance) {
            const ftabyaCodeScript = FT.buildFTtransferCode(FTA.codeScript, privateKey.toAddress().toString());
            tx.addOutput(new tbc.Transaction.Output({
                script: ftabyaCodeScript,
                satoshis: 500,
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
            const unlockingScript = await this.getPoolNFTunlock(privateKey, tx, 0, poolnft.txId, poolnft.outputIndex, 3, 2);
            return unlockingScript;
        });
        await tx.setInputScriptAsync({
            inputIndex: 1,
        }, async (tx) => {
            const unlockingScript = await FTA.getFTunlock(privateKey, tx, ftPreTX[0], ftPrePreTxData[0], 1, fttxo_a.outputIndex);
            return unlockingScript;
        });
        await tx.setInputScriptAsync({
            inputIndex: 2,
        }, async (tx) => {
            const unlockingScript = await FTA.getFTunlockSwap(privateKey, tx, ftPreTX[1], ftPrePreTxData[1], contractTX, 2, fttxo_c.outputIndex);
            return unlockingScript;
        });
        tx.sign(privateKey);
        await tx.sealAsync();
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
    async fetchPoolNFTInfo(contractTxid) {
        const url_testnet = `https://api.tbcdev.org/api/tbc/pool/poolinfo/poolid/${contractTxid}`;
        const url_mainnet = `https://api.tbcdev.org/api/tbc/pool/poolinfo/poolid/${contractTxid}`;
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
            let data = response.data;
            const poolNftInfo = {
                ft_lp_amount: data.lp_balance,
                ft_a_amount: data.token_balance,
                tbc_amount: data.tbc_balance,
                ft_lp_partialhash: data.ft_lp_partial_hash,
                ft_a_partialhash: data.ft_a_partial_hash,
                ft_a_contractTxid: data.ft_contract_txid,
                poolnft_code: data.pool_code_script,
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
            const poolNftInfo = await this.fetchPoolNFTInfo(contractTxid);
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
     * @param {string} ftlpCode - FT-LP 的代码，以十六进制字符串形式提供。
     * @param {bigint} amount - 要获取的 FT-LP 数量（以 BigInt 表示）。
     * @returns {Promise<tbc.Transaction.IUnspentOutput>} 返回一个 Promise，解析为包含 FT-LP UTXO 的对象。
     *
     * 该函数执行以下主要步骤：
     * 1. 计算 FT-LP 代码的 SHA-256 哈希值，并构建请求 URL（根据网络环境选择测试网或主网）。
     * 2. 发送 HTTP 请求以获取与指定 FT-LP 代码相关的 UTXO 列表。
     * 3. 遍历 UTXO 列表，查找余额大于或等于所需金额的 UTXO。
     * 4. 如果找到合适的 UTXO，则返回该 UTXO；否则，检查所有 UTXO 的总余额：
     *    - 如果总余额小于所需金额，抛出错误 "Insufficient FT-LP amount"。
     *    - 如果总余额足够但没有单个 UTXO 满足条件，抛出错误 "Please merge FT-LP UTXOs"。
     * 5. 返回包含以下信息的 FT-LP UTXO 对象：
     *    - `txId`: UTXO 的交易 ID。
     *    - `outputIndex`: UTXO 的输出索引。
     *    - `script`: FT-LP 的代码脚本。
     *    - `satoshis`: UTXO 的余额（以 satoshis 为单位）。
     *
     * @throws {Error} 如果请求失败或未能找到足够的 UTXO，将抛出错误。
     */
    async fetchFtlpUTXO(ftlpCode, amount) {
        const ftlpHash = tbc.crypto.Hash.sha256(Buffer.from(ftlpCode, "hex"))
            .reverse()
            .toString("hex");
        const url_testnet = `https://api.tbcdev.org/api/tbc/pool/lputxo/scriptpubkeyhash/${ftlpHash}`;
        const url_mainnet = `https://api.tbcdev.org/api/tbc/pool/lputxo/scriptpubkeyhash/${ftlpHash}`;
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
                }
                else {
                    throw new Error("Please merge FT-LP UTXOs");
                }
            }
            const ftlp = {
                txId: data.txid,
                outputIndex: data.index,
                script: ftlpCode,
                satoshis: data.tbc_balance,
                ftBalance: data.lp_balance,
            };
            return ftlp;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    /**
     * 合并 FT-LP UTXO，并返回合并交易的原始数据或成功标志。
     *
     * @param {tbc.PrivateKey} privateKey_from - 用于签名交易的私钥。
     * @param {tbc.Transaction.IUnspentOutput} utxo - 用于创建交易的未花费输出。
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
    async mergeFTLP(privateKey_from, utxo) {
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        const privateKey = privateKey_from;
        const address = privateKey.toAddress().toString();
        const ftlpCodeScript = this.getFTLPcode(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex")).toString("hex"), address, FTA.tapeScript.length / 2);
        const ftlpCodeHash = tbc.crypto.Hash.sha256(ftlpCodeScript.toBuffer())
            .reverse()
            .toString("hex");
        const url_testnet = `https://api.tbcdev.org/api/tbc/pool/lputxo/scriptpubkeyhash/${ftlpCodeHash}`;
        const url_mainnet = `https://api.tbcdev.org/api/tbc/pool/lputxo/scriptpubkeyhash/${ftlpCodeHash}`;
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
                    `pool/lputxo/scriptpubkeyhash/${ftlpCodeHash}`;
        }
        const fttxo_codeScript = ftlpCodeScript.toBuffer().toString("hex");
        try {
            const response = await (await fetch(url)).json();
            const data = response.data.utxos;
            let fttxo = [];
            if (data.length === 0) {
                throw new Error("No FT UTXO available");
            }
            if (data.length === 1) {
                console.log("Merge Success!");
                return true;
            }
            else {
                for (let i = 0; i < data.length && i < 5; i++) {
                    fttxo.push({
                        txId: data[i].txid,
                        outputIndex: data[i].index,
                        script: fttxo_codeScript,
                        satoshis: data[i].tbc_balance,
                        ftBalance: data[i].lp_balance,
                    });
                }
            }
            const tapeAmountSetIn = [];
            const ftPreTX = [];
            const ftPrePreTxData = [];
            let tapeAmountSum = BigInt(0);
            for (let i = 0; i < fttxo.length; i++) {
                tapeAmountSetIn.push(fttxo[i].ftBalance);
                tapeAmountSum += BigInt(fttxo[i].ftBalance);
                ftPreTX.push(await API.fetchTXraw(fttxo[i].txId, this.network));
                ftPrePreTxData.push(await API.fetchFtPrePreTxData(ftPreTX[i], fttxo[i].outputIndex, this.network));
            }
            const { amountHex, changeHex } = FT.buildTapeAmount(tapeAmountSum, tapeAmountSetIn);
            if (changeHex !=
                "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000") {
                throw new Error("Change amount is not zero");
            }
            //const utxo = await API.fetchUTXO(privateKey, 0.1, this.network);
            const tx = new tbc.Transaction().from(fttxo).from(utxo);
            const codeScript = FT.buildFTtransferCode(fttxo_codeScript, address);
            tx.addOutput(new tbc.Transaction.Output({
                script: codeScript,
                satoshis: 500,
            }));
            const tapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
            tx.addOutput(new tbc.Transaction.Output({
                script: tapeScript,
                satoshis: 0,
            }));
            tx.feePerKb(80).change(privateKey.toAddress());
            for (let i = 0; i < fttxo.length; i++) {
                await tx.setInputScriptAsync({
                    inputIndex: i,
                }, async (tx) => {
                    const unlockingScript = await FTA.getFTunlock(privateKey, tx, ftPreTX[i], ftPrePreTxData[i], i, fttxo[i].outputIndex);
                    return unlockingScript;
                });
            }
            tx.sign(privateKey);
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
     * 合并 FT UTXO 到池中，并返回合并交易的原始数据或成功标志。
     *
     * @param {tbc.PrivateKey} privateKey_from - 用于签名交易的私钥。
     * @param {tbc.Transaction.IUnspentOutput} utxo - 用于创建交易的未花费输出。
     * @returns {Promise<boolean | string>} 返回一个 Promise，解析为布尔值表示合并是否成功，或返回合并交易的原始数据。
     *
     * 该函数执行以下主要步骤：
     * 1. 初始化 FT 实例并获取相关信息，包括合约交易 ID 和网络信息。
     * 2. 计算池 NFT 的哈希值，并构建请求 URL（根据网络环境选择测试网或主网）。
     * 3. 发送 HTTP 请求以获取与指定池 NFT 代码相关的 FT UTXO 列表。
     * 4. 检查 UTXO 列表，如果没有可用的 FT UTXO，则抛出错误。
     * 5. 如果只有一个 UTXO，记录成功并返回 true；否则，收集多个 UTXO 的信息以进行合并。
     * 6. 验证是否有足够的 FT 金额进行合并，如果不足则抛出错误。
     * 7. 构建用于合并的交易，包括输入和输出，设置交易费用和找零地址。
     * 8. 异步设置输入脚本以解锁相应的 UTXO，并签名交易。
     * 9. 封装交易并返回序列化后的未检查交易数据以供发送。
     *
     * @throws {Error} 如果请求失败或未能找到足够的 UTXO，将抛出错误。
     */
    async mergeFTinPool(privateKey_from, utxo) {
        const FTA = new FT(this.ft_a_contractTxid);
        const FTAInfo = await API.fetchFtInfo(FTA.contractTxid, this.network);
        FTA.initialize(FTAInfo);
        const privateKey = privateKey_from;
        const address = privateKey.toAddress().toString();
        const poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, "hex"))).toString("hex");
        const hash = poolnft_codehash160 + "01";
        const contractTxid = this.ft_a_contractTxid;
        const url_testnet = `https://api.tbcdev.org/api/tbc/ft/utxo/combinescript/${hash}/contract/${contractTxid}`;
        const url_mainnet = `https://api.tbcdev.org/api/tbc/ft/utxo/combinescript/${hash}/contract/${contractTxid}`;
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
                    `ft/utxo/combinescript/${hash}/contract/${contractTxid}`;
        }
        const fttxo_codeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160)
            .toBuffer()
            .toString("hex");
        try {
            const response = await (await fetch(url)).json();
            const data = response.data.utxos;
            let fttxo = [];
            if (data.length === 0) {
                throw new Error("No FT UTXO available");
            }
            if (data.length === 1) {
                console.log("Merge Success!");
                return true;
            }
            else {
                for (let i = 0; i < data.length && i < 4; i++) {
                    fttxo.push({
                        txId: data[i].txid,
                        outputIndex: data[i].index,
                        script: fttxo_codeScript,
                        satoshis: data[i].tbc_balance,
                        ftBalance: data[i].ft_balance,
                    });
                }
            }
            const tapeAmountSetIn = [];
            const ftPreTX = [];
            const ftPrePreTxData = [];
            let tapeAmountSum = BigInt(0);
            let tbcAmountSum = 0;
            for (let i = 0; i < fttxo.length; i++) {
                tapeAmountSetIn.push(fttxo[i].ftBalance);
                tapeAmountSum += BigInt(fttxo[i].ftBalance);
                tbcAmountSum += fttxo[i].satoshis;
                ftPreTX.push(await API.fetchTXraw(fttxo[i].txId, this.network));
                ftPrePreTxData.push(await API.fetchFtPrePreTxData(ftPreTX[i], fttxo[i].outputIndex, this.network));
            }
            const { amountHex, changeHex } = FT.buildTapeAmount(tapeAmountSum, tapeAmountSetIn, 1);
            if (changeHex !=
                "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000") {
                throw new Error("Change amount is not zero");
            }
            const poolnft = await this.fetchPoolNftUTXO(this.contractTxid);
            const contractTX = await API.fetchTXraw(poolnft.txId, this.network);
            //const utxo = await API.fetchUTXO(privateKey, 0.1, this.network);
            const tx = new tbc.Transaction().from(poolnft).from(fttxo).from(utxo);
            //poolNft
            tx.addOutput(new tbc.Transaction.Output({
                script: tbc.Script.fromHex(this.poolnft_code),
                satoshis: 1000,
            }));
            const writer = new tbc.encoding.BufferWriter();
            writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_lp_amount));
            writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_a_amount));
            writer.writeUInt64LEBN(new tbc.crypto.BN(this.tbc_amount));
            const amountData = writer.toBuffer().toString("hex");
            const poolnftTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${this.ft_lp_partialhash + this.ft_a_partialhash} ${amountData} ${this.ft_a_contractTxid} 4e54617065`);
            tx.addOutput(new tbc.Transaction.Output({
                script: poolnftTapeScript,
                satoshis: 0,
            }));
            //FTAbyC
            const codeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
            tx.addOutput(new tbc.Transaction.Output({
                script: codeScript,
                satoshis: tbcAmountSum,
            }));
            const tapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
            tx.addOutput(new tbc.Transaction.Output({
                script: tapeScript,
                satoshis: 0,
            }));
            tx.feePerKb(80);
            tx.change(privateKey.toAddress());
            await tx.setInputScriptAsync({
                inputIndex: 0,
            }, async (tx) => {
                const unlockingScript = await this.getPoolNFTunlock(privateKey, tx, 0, poolnft.txId, poolnft.outputIndex, 4);
                return unlockingScript;
            });
            for (let i = 0; i < fttxo.length; i++) {
                await tx.setInputScriptAsync({
                    inputIndex: i + 1,
                }, async (tx) => {
                    const unlockingScript = await FTA.getFTunlockSwap(privateKey, tx, ftPreTX[i], ftPrePreTxData[i], contractTX, i + 1, fttxo[i].outputIndex);
                    return unlockingScript;
                });
            }
            tx.sign(privateKey);
            await tx.sealAsync();
            const txraw = tx.uncheckedSerialize();
            console.log("Merge FtUTXOinPool:");
            // await API.broadcastTXraw(txraw, this.network);
            // // wait 5 seconds
            // await new Promise(resolve => setTimeout(resolve, 5000));
            // await this.mergeFTinPool(privateKey);
            return txraw;
        }
        catch (error) {
            console.log(error);
            throw new Error("Merge Faild!." + error.message);
        }
    }
    /**
     * 合并 FT UTXO 到池中，并返回合并交易的原始数据或成功标志。
     *
     * @param {tbc.PrivateKey} privateKey_from - 用于签名交易的私钥。
     * @param {tbc.Transaction.IUnspentOutput} utxo - 用于创建交易的未花费输出。
     * @returns {Promise<boolean | string>} 返回一个 Promise，解析为布尔值表示合并是否成功，或返回合并交易的原始数据。
     *
     * 该函数执行以下主要步骤：
     * 1. 初始化 FT 实例并获取相关信息，包括合约交易 ID 和网络信息。
     * 2. 计算池 NFT 的哈希值，并构建请求 URL（根据网络环境选择测试网或主网）。
     * 3. 发送 HTTP 请求以获取与指定池 NFT 代码相关的 FT UTXO 列表。
     * 4. 检查 UTXO 列表，如果没有可用的 FT UTXO，则抛出错误。
     * 5. 如果只有一个 UTXO，记录成功并返回 true；否则，收集多个 UTXO 的信息以进行合并。
     * 6. 验证是否有足够的 FT 金额进行合并，如果不足则抛出错误。
     * 7. 构建用于合并的交易，包括输入和输出，设置交易费用和找零地址。
     * 8. 异步设置输入脚本以解锁相应的 UTXO，并签名交易。
     * 9. 封装交易并返回序列化后的未检查交易数据以供发送。
     *
     * @throws {Error} 如果请求失败或未能找到足够的 UTXO，将抛出错误。
     */
    async getPoolNFTunlock(privateKey_from, currentTX, currentUnlockIndex, preTxId, preVout, option, swapOption) {
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
        const currenttxoutputsdata = (0, poolnftunlock_1.getCurrentTxOutputsDataforPool1)(currentTX, option, swapOption);
        const sig = (currentTX.getSignature(currentUnlockIndex, privateKey).length / 2)
            .toString(16)
            .padStart(2, "0") +
            currentTX.getSignature(currentUnlockIndex, privateKey);
        const publicKey = (privateKey.toPublicKey().toString().length / 2)
            .toString(16)
            .padStart(2, "0") + privateKey.toPublicKey().toString();
        let unlockingScript = new tbc.Script("");
        const optionHex = option + 50;
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
            };
        }
        else {
            return {
                ft_lp_difference: BigInt(ft_lp_old) - BigInt(this.ft_lp_amount),
                ft_a_difference: BigInt(ft_a_old) - BigInt(this.ft_a_amount),
                tbc_amount_difference: BigInt(tbc_amount_old) - BigInt(this.tbc_amount),
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
            const ratio = (BigInt(this.tbc_amount) * BigInt(this.precision)) / increment;
            this.tbc_amount = BigInt(this.tbc_amount) + BigInt(increment);
            this.ft_lp_amount =
                BigInt(this.ft_lp_amount) +
                    (BigInt(this.ft_lp_amount) * BigInt(this.precision)) / ratio;
            this.ft_a_amount =
                BigInt(this.ft_a_amount) +
                    (BigInt(this.ft_a_amount) * BigInt(this.precision)) / ratio;
        }
        else {
            throw new Error("Increment is invalid!");
        }
    }
    getPoolNftCode(txid, vout) {
        const writer = new tbc.encoding.BufferWriter();
        writer.writeReverse(Buffer.from(txid, "hex"));
        writer.writeUInt32LE(vout);
        const utxoHex = writer.toBuffer().toString("hex");
        const poolNftCode = new tbc.Script(`OP_1 OP_PICK OP_3 OP_SPLIT OP_NIP 0x01 0x20 OP_SPLIT 0x01 0x20 OP_SPLIT OP_1 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_TOALTSTACK OP_BIN2NUM OP_TOALTSTACK OP_BIN2NUM OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_1 OP_PICK OP_TOALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_1 OP_PICK 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_HASH256 OP_6 OP_PUSH_META 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_1 OP_PICK OP_TOALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_SWAP OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUAL OP_IF OP_DROP OP_ELSE 0x24 0x${utxoHex} OP_EQUALVERIFY OP_ENDIF OP_DUP OP_1 OP_EQUAL OP_IF OP_DROP OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_4 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_HASH160 OP_SWAP OP_TOALTSTACK OP_EQUAL OP_0 OP_EQUALVERIFY OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_8 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_DUP 0x03 0xa08601 OP_BIN2NUM OP_GREATERTHANOREQUAL OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_2DUP OP_2DUP OP_GREATERTHAN OP_NOTIF OP_SWAP OP_ENDIF OP_DIV 0x04 0x00e1f505 OP_BIN2NUM OP_LESSTHANOREQUAL OP_1 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_TOALTSTACK OP_3 OP_ROLL OP_DUP OP_HASH160 OP_TOALTSTACK OP_8 OP_ROLL OP_EQUALVERIFY OP_5 OP_ROLL OP_2DUP OP_ADD OP_TOALTSTACK OP_SWAP 0x03 0x40420f OP_MUL OP_SWAP OP_DIV OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_2DUP OP_SWAP 0x03 0x40420f OP_MUL OP_SWAP OP_DIV OP_5 OP_PICK OP_EQUALVERIFY OP_SWAP OP_4 OP_ROLL OP_ADD OP_TOALTSTACK OP_2DUP OP_SWAP 0x03 0x40420f OP_MUL OP_SWAP OP_DIV OP_3 OP_PICK OP_EQUALVERIFY OP_DROP OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_ELSE OP_DROP OP_3 OP_ROLL OP_ADD OP_TOALTSTACK OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_ENDIF OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_3 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_1 OP_EQUALVERIFY OP_ELSE OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY OP_TOALTSTACK OP_0 OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_4 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_HASH160 OP_3 OP_ROLL OP_EQUALVERIFY OP_7 OP_PICK OP_BIN2NUM OP_SUB OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP 0x14 0x759d6677091e973b9e9d99f19c68fbf43e3f05f9 OP_EQUALVERIFY OP_2 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_DUP 0x03 0xa08601 OP_BIN2NUM OP_GREATERTHANOREQUAL OP_1 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_DUP OP_TOALTSTACK OP_SUB OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_2 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_5 OP_ROLL OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_2 OP_ROLL OP_3 OP_ROLL OP_2DUP OP_2DUP OP_SUB OP_TOALTSTACK OP_SWAP 0x03 0x40420f OP_MUL OP_SWAP OP_DIV OP_DUP OP_10 OP_LESSTHAN OP_IF OP_TOALTSTACK OP_MOD OP_0 OP_EQUALVERIFY OP_ELSE OP_TOALTSTACK OP_2DROP OP_ENDIF OP_FROMALTSTACK OP_2DUP OP_SWAP 0x03 0x40420f OP_MUL OP_SWAP OP_DIV OP_5 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_3 OP_ROLL OP_SUB OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_2DUP OP_SWAP 0x03 0x40420f OP_MUL OP_SWAP OP_DIV OP_3 OP_PICK OP_EQUALVERIFY OP_DROP OP_SWAP OP_SUB OP_FROMALTSTACK OP_FROMALTSTACK OP_2 OP_ROLL OP_2 OP_ROLL OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_3 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_ELSE OP_DUP OP_3 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY 0x01 0x28 OP_SPLIT OP_NIP OP_FROMALTSTACK OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_0 OP_TOALTSTACK OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_DROP OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_7 OP_PICK OP_BIN2NUM OP_2DUP OP_LESSTHAN OP_1 OP_EQUALVERIFY OP_SWAP OP_SUB OP_DUP 0x03 0xa08601 OP_BIN2NUM OP_GREATERTHANOREQUAL OP_1 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_2 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_2DUP OP_2DUP OP_GREATERTHAN OP_NOTIF OP_SWAP OP_ENDIF OP_DIV 0x04 0x00e1f505 OP_BIN2NUM OP_LESSTHANOREQUAL OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_4 OP_ROLL OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_2DUP OP_MUL OP_TOALTSTACK OP_4 OP_ROLL OP_ADD OP_TOALTSTACK OP_2 OP_ROLL OP_SUB OP_FROMALTSTACK OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_SWAP OP_2DUP OP_FROMALTSTACK OP_SWAP OP_DIV OP_EQUALVERIFY OP_3 OP_ROLL OP_EQUALVERIFY OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_7 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_0 OP_0 OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_9 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_9 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_IF OP_9 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_9 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_9 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_IF OP_9 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_9 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_9 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_IF OP_9 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_9 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_9 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_IF OP_9 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_DROP OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_4 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_9 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_4 OP_ROLL OP_EQUALVERIFY OP_8 OP_PICK OP_BIN2NUM OP_SUB OP_TOALTSTACK OP_2 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_2DUP OP_LESSTHAN OP_1 OP_EQUALVERIFY OP_SWAP OP_SUB OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_DUP OP_TOALTSTACK OP_DUP 0x03 0xa08601 OP_BIN2NUM OP_GREATERTHANOREQUAL OP_1 OP_EQUALVERIFY OP_SUB OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_2DUP OP_2DUP OP_GREATERTHAN OP_NOTIF OP_SWAP OP_ENDIF OP_DIV 0x04 0x00e1f505 OP_BIN2NUM OP_LESSTHANOREQUAL OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_4 OP_ROLL OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_2DUP OP_MUL OP_TOALTSTACK OP_4 OP_ROLL OP_SUB OP_TOALTSTACK OP_2 OP_ROLL OP_ADD OP_FROMALTSTACK OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_2DUP OP_FROMALTSTACK OP_SWAP OP_DIV OP_EQUALVERIFY OP_4 OP_ROLL OP_EQUALVERIFY OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_ENDIF OP_ELSE OP_4 OP_EQUALVERIFY OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_0 OP_TOALTSTACK OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_DROP OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_7 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_7 OP_PICK OP_BIN2NUM OP_EQUALVERIFY OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_DROP OP_SWAP OP_FROMALTSTACK OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_3 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_ENDIF OP_ENDIF OP_ENDIF OP_CHECKSIG OP_RETURN 0x05 0x32436f6465`);
        return poolNftCode;
    }
    getPoolNftCodeWithLock(txid, vout) {
        const writer = new tbc.encoding.BufferWriter();
        writer.writeReverse(Buffer.from(txid, "hex"));
        writer.writeUInt32LE(vout);
        const utxoHex = writer.toBuffer().toString("hex");
        const poolNftCode = new tbc.Script(`OP_1 OP_PICK OP_3 OP_SPLIT OP_NIP 0x01 0x20 OP_SPLIT 0x01 0x20 OP_SPLIT OP_1 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_TOALTSTACK OP_BIN2NUM OP_TOALTSTACK OP_BIN2NUM OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_1 OP_PICK OP_TOALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_1 OP_PICK 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_HASH256 OP_6 OP_PUSH_META 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_1 OP_PICK OP_TOALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_SWAP OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUAL OP_IF OP_DROP OP_ELSE 0x24 0x${utxoHex} OP_EQUALVERIFY OP_ENDIF OP_DUP OP_1 OP_EQUAL OP_IF OP_DROP OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_4 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_HASH160 OP_SWAP OP_TOALTSTACK OP_EQUAL OP_0 OP_EQUALVERIFY OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_8 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_DUP 0x03 0xa08601 OP_BIN2NUM OP_GREATERTHANOREQUAL OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_2DUP OP_2DUP OP_GREATERTHAN OP_NOTIF OP_SWAP OP_ENDIF OP_DIV 0x04 0x00e1f505 OP_BIN2NUM OP_LESSTHANOREQUAL OP_1 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_TOALTSTACK OP_3 OP_ROLL OP_DUP OP_HASH160 OP_TOALTSTACK OP_8 OP_ROLL OP_EQUALVERIFY OP_5 OP_ROLL OP_2DUP OP_ADD OP_TOALTSTACK OP_SWAP 0x03 0x40420f OP_MUL OP_SWAP OP_DIV OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_2DUP OP_SWAP 0x03 0x40420f OP_MUL OP_SWAP OP_DIV OP_5 OP_PICK OP_EQUALVERIFY OP_SWAP OP_4 OP_ROLL OP_ADD OP_TOALTSTACK OP_2DUP OP_SWAP 0x03 0x40420f OP_MUL OP_SWAP OP_DIV OP_3 OP_PICK OP_EQUALVERIFY OP_DROP OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_ELSE OP_DROP OP_3 OP_ROLL OP_ADD OP_TOALTSTACK OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_ENDIF OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_3 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_1 OP_EQUALVERIFY OP_ELSE OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY OP_TOALTSTACK OP_0 OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_4 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_HASH160 OP_3 OP_ROLL OP_EQUALVERIFY OP_7 OP_PICK OP_BIN2NUM OP_SUB OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP 0x14 0x759d6677091e973b9e9d99f19c68fbf43e3f05f9 OP_EQUALVERIFY OP_2 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_DUP 0x03 0xa08601 OP_BIN2NUM OP_GREATERTHANOREQUAL OP_1 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_DUP OP_TOALTSTACK OP_SUB OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_2 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_5 OP_ROLL OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_2 OP_ROLL OP_3 OP_ROLL OP_2DUP OP_2DUP OP_SUB OP_TOALTSTACK OP_SWAP 0x03 0x40420f OP_MUL OP_SWAP OP_DIV OP_DUP OP_10 OP_LESSTHAN OP_IF OP_TOALTSTACK OP_MOD OP_0 OP_EQUALVERIFY OP_ELSE OP_TOALTSTACK OP_2DROP OP_ENDIF OP_FROMALTSTACK OP_2DUP OP_SWAP 0x03 0x40420f OP_MUL OP_SWAP OP_DIV OP_5 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_3 OP_ROLL OP_SUB OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_2DUP OP_SWAP 0x03 0x40420f OP_MUL OP_SWAP OP_DIV OP_3 OP_PICK OP_EQUALVERIFY OP_DROP OP_SWAP OP_SUB OP_FROMALTSTACK OP_FROMALTSTACK OP_2 OP_ROLL OP_2 OP_ROLL OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_3 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_ELSE OP_DUP OP_3 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY 0x01 0x28 OP_SPLIT OP_NIP OP_FROMALTSTACK OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_0 OP_TOALTSTACK OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_DROP OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_7 OP_PICK OP_BIN2NUM OP_2DUP OP_LESSTHAN OP_1 OP_EQUALVERIFY OP_SWAP OP_SUB OP_DUP 0x03 0xa08601 OP_BIN2NUM OP_GREATERTHANOREQUAL OP_1 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_2 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_2DUP OP_2DUP OP_GREATERTHAN OP_NOTIF OP_SWAP OP_ENDIF OP_DIV 0x04 0x00e1f505 OP_BIN2NUM OP_LESSTHANOREQUAL OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_4 OP_ROLL OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_2DUP OP_MUL OP_TOALTSTACK OP_4 OP_ROLL OP_ADD OP_TOALTSTACK OP_2 OP_ROLL OP_SUB OP_FROMALTSTACK OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_SWAP OP_2DUP OP_FROMALTSTACK OP_SWAP OP_DIV OP_EQUALVERIFY OP_3 OP_ROLL OP_EQUALVERIFY OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_7 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_0 OP_0 OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_9 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_9 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_IF OP_9 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_9 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_9 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_IF OP_9 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_9 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_9 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_IF OP_9 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_9 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_9 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_IF OP_9 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_DROP OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_4 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_9 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_4 OP_ROLL OP_EQUALVERIFY OP_8 OP_PICK OP_BIN2NUM OP_SUB OP_TOALTSTACK OP_2 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_2DUP OP_LESSTHAN OP_1 OP_EQUALVERIFY OP_SWAP OP_SUB OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_DUP OP_TOALTSTACK OP_DUP 0x03 0xa08601 OP_BIN2NUM OP_GREATERTHANOREQUAL OP_1 OP_EQUALVERIFY OP_SUB OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_2DUP OP_2DUP OP_GREATERTHAN OP_NOTIF OP_SWAP OP_ENDIF OP_DIV 0x04 0x00e1f505 OP_BIN2NUM OP_LESSTHANOREQUAL OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_4 OP_ROLL OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_2DUP OP_MUL OP_TOALTSTACK OP_4 OP_ROLL OP_SUB OP_TOALTSTACK OP_2 OP_ROLL OP_ADD OP_FROMALTSTACK OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_2DUP OP_FROMALTSTACK OP_SWAP OP_DIV OP_EQUALVERIFY OP_4 OP_ROLL OP_EQUALVERIFY OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_ENDIF OP_ELSE OP_4 OP_EQUALVERIFY OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_0 OP_TOALTSTACK OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_DROP OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_7 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_7 OP_PICK OP_BIN2NUM OP_EQUALVERIFY OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_DROP OP_SWAP OP_FROMALTSTACK OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_3 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_ENDIF OP_ENDIF OP_ENDIF OP_DUP OP_1 OP_SPLIT OP_NIP OP_5 OP_SPLIT OP_DROP 0x05 0x0000000000 OP_EQUALVERIFY OP_CHECKSIG OP_RETURN 0x05 0x32436f6465`);
        return poolNftCode;
        //OP_DUP OP_1 OP_SPLIT OP_NIP OP_5 OP_SPLIT OP_DROP 0x05 0x0000000000 OP_EQUALVERIFY
    }
    getFTLPcode(poolNftCodeHash, address, tapeSize) {
        const codeHash = poolNftCodeHash;
        const publicKeyHash = tbc.Address.fromString(address).hashBuffer.toString("hex");
        const hash = publicKeyHash + "00";
        const tapeSizeHex = (0, poolnftunlock_1.getSize)(tapeSize).toString("hex");
        const ftlpcode = new tbc.Script(`OP_9 OP_PICK OP_TOALTSTACK OP_1 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_5 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_4 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_3 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_2 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_1 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_0 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_TOALTSTACK OP_SHA256 OP_FROMALTSTACK OP_CAT OP_CAT OP_HASH256 OP_6 OP_PUSH_META 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_DUP OP_HASH160 OP_FROMALTSTACK OP_EQUALVERIFY OP_CHECKSIGVERIFY OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_ELSE OP_TOALTSTACK OP_PARTIAL_HASH OP_DUP 0x20 0x${codeHash} OP_EQUALVERIFY OP_ENDIF OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_7 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_0 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_SHA256 OP_7 OP_PUSH_META OP_EQUAL OP_NIP OP_PUSHDATA1 0x82 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff OP_DROP OP_RETURN 0x15 0x${hash} 0x05 0x02436f6465`);
        return ftlpcode;
    }
}
module.exports = poolNFT;
