import * as tbc from 'tbc-lib-js'
import { API } from '../api/api';
import * as partial_sha256 from 'tbc-lib-js/lib/util/partial-sha256'
import { FT } from './ft';
const version = 10;
const vliolength = '10';
const amountlength = '08';
const hashlength = '20';

interface PoolNFTInfo {
    ft_lp_amount: bigint;
    ft_a_amount: bigint;
    tbc_amount: bigint;
    ft_lp_partialhash: string;
    ft_a_partialhash: string;
    ft_a_contractTxid: string;
    poolnft_code: string;
    currentContractTxid: string;
    currentContractVout: number;
    currentContractSatoshi: number;
}

interface poolNFTDifference {
    ft_lp_difference: bigint;
    ft_a_difference: bigint;
    tbc_amount_difference: bigint;
}

export class poolNFT {
    ft_lp_amount: bigint;
    ft_a_amount: bigint;
    tbc_amount: bigint;
    ft_lp_partialhash: string;
    ft_a_partialhash: string;
    ft_a_contractTxid: string;
    poolnft_code: string;
    contractTxid: string;
    private ft_a_number: number;
    //private precision = BigInt(1);
    network: "testnet" | "mainnet"

    constructor(config?: { txidOrParams?: string | {ftContractTxid: string, tbc_amount: number, ft_a: number}, network?: "testnet" | "mainnet" }) {
        this.ft_lp_amount = BigInt(0);
        this.ft_a_amount = BigInt(0);
        this.tbc_amount = BigInt(0);
        this.ft_a_number = 0;
        this.ft_a_contractTxid = '';
        this.ft_lp_partialhash = '';
        this.ft_a_partialhash = '';
        this.poolnft_code = '';
        this.contractTxid = '';
        this.network = config?.network ?? "mainnet";
        if (typeof config!.txidOrParams === 'string') {
            this.contractTxid = config!.txidOrParams;
        } else if (config!.txidOrParams) {
            if (config!.txidOrParams.ft_a <= 0 || config!.txidOrParams.tbc_amount <= 0) {
                throw new Error("Invalid number.")
            }
            this.ft_a_amount = BigInt(0);
            this.tbc_amount = BigInt(config!.txidOrParams.tbc_amount * Math.pow(10, 6));
            this.ft_lp_amount = this.tbc_amount;
            this.ft_a_number = config!.txidOrParams.ft_a;
            this.ft_a_contractTxid = config!.txidOrParams.ftContractTxid;
        }
    }

    async initCreate(ftContractTxid?: string) {
        if (!ftContractTxid && this.ft_a_contractTxid != '') {
            const FTA = new FT({txidOrParams: this.ft_a_contractTxid, network: this.network});
            await FTA.initialize();
            this.ft_a_amount = BigInt(this.ft_a_number * Math.pow(10, FTA.decimal));
        } else if (ftContractTxid) {
            this.ft_a_contractTxid = ftContractTxid;
        } else {
            throw new Error('Invalid Input');
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

    async createPoolNFT(privateKey_from: tbc.PrivateKey): Promise<string> {
        const privateKey = privateKey_from;
        const FTA = new FT({txidOrParams: this.ft_a_contractTxid, network: this.network});
        await FTA.initialize();
        const utxo = await API.fetchUTXO(privateKey, 0.1, this.network);
        this.poolnft_code = this.getPoolNftCode(utxo.txId, utxo.outputIndex).toBuffer().toString('hex');
        const ftlpCode = this.getFTLPcode(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code,'hex')).toString('hex'), privateKey.toAddress().toString(), FTA.tapeScript.length / 2);
        this.ft_lp_partialhash = partial_sha256.calculate_partial_hash(ftlpCode.toBuffer().subarray(0, 1536));
        this.ft_a_partialhash = partial_sha256.calculate_partial_hash(Buffer.from(FTA.codeScript,'hex').subarray(0, 1536));
        // if (!amount_lp && this.ft_lp_amount != BigInt(0)) {
        //     this.ft_lp_amount = this.ft_lp_amount;
        // } else if (amount_lp) {
        //     this.ft_lp_amount = BigInt(amount_lp * Math.pow(10, 6));
        // } else {
        //     throw new Error('Invalid Input');
        // }
        const writer = new tbc.encoding.BufferWriter();
        writer.writeUInt64LEBN(new tbc.crypto.BN(0));
        writer.writeUInt64LEBN(new tbc.crypto.BN(0));
        writer.writeUInt64LEBN(new tbc.crypto.BN(0));
        const amountData = writer.toBuffer().toString('hex');
        const poolnftTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${this.ft_lp_partialhash + this.ft_a_partialhash} ${amountData} ${this.ft_a_contractTxid} 4e54617065`)

        const tx = new tbc.Transaction()
        .from(utxo)
        //poolNft
        .addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: 2000,
        }))
        .addOutput(new tbc.Transaction.Output({
            script: poolnftTapeScript,
            satoshis: 0,
        }))
        tx.feePerKb(100);
        tx.change(privateKey.toAddress());
        tx.sign(privateKey);
        tx.seal();
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }

    async initPoolNFT(privateKey_from: tbc.PrivateKey, address_to: string, tbc_amount?: number, ft_a?: number): Promise<string> {
        const privateKey = privateKey_from;
        const FTA = new FT({txidOrParams: this.ft_a_contractTxid, network: this.network});
        await FTA.initialize();
        let amount_lpbn = BigInt(0);
        if (tbc_amount && ft_a) {
            amount_lpbn = BigInt(tbc_amount / 10 * Math.pow(10, 6));
            this.tbc_amount = BigInt(tbc_amount * Math.pow(10, 6));
            this.ft_lp_amount = this.tbc_amount - amount_lpbn;
            this.ft_a_number = ft_a;
            this.ft_a_amount = BigInt(this.ft_a_number * Math.pow(10, FTA.decimal));
        } else if (!tbc_amount && !ft_a && this.tbc_amount != BigInt(0) && this.ft_a_amount != BigInt(0)) {
            amount_lpbn = BigInt(BigInt(this.tbc_amount) / BigInt(10));
            this.tbc_amount = this.tbc_amount;
            this.ft_lp_amount = this.tbc_amount - amount_lpbn;
            this.ft_a_amount = this.ft_a_amount;
        } else {
            throw new Error('Invalid Input');
        }
        
        const tapeAmountSetIn: bigint[] = [];
        const utxo = await API.fetchUTXO(privateKey, 0.1, this.network);
        if (utxo.satoshis < this.tbc_amount) { 
            throw new Error('Insufficient TBC amount, please merge UTXOs');
        }
        const poolnft_codehash = tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, 'hex'));
        const poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(poolnft_codehash).toString('hex');
        const maxAmount = Math.pow(10, 18 - FTA.decimal);
        if (this.ft_a_number > maxAmount) {
            throw new Error(`When decimal is ${FTA.decimal}, the maximum amount cannot exceed ${maxAmount}`);
        }
        const fttxo_a = await FTA.fetchFtTXO(this.ft_a_contractTxid, privateKey.toAddress().toString(), this.ft_a_amount);
        if (fttxo_a.ftBalance! < this.ft_a_amount) {
            throw new Error('Insufficient FT-A amount, please merge FT-A UTXOs');
        }
        tapeAmountSetIn.push(fttxo_a.ftBalance!);
        let tapeAmountSum = BigInt(0);
        for (let i = 0; i < tapeAmountSetIn.length; i++) {
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
        }
        const { amountHex, changeHex } = FT.buildTapeAmount(this.ft_a_amount, tapeAmountSetIn,1);
        const writer = new tbc.encoding.BufferWriter();
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_lp_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_a_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.tbc_amount));
        const amountData = writer.toBuffer().toString('hex');
        const poolnftTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${this.ft_lp_partialhash + this.ft_a_partialhash} ${amountData} ${this.ft_a_contractTxid} 4e54617065`)
        const poolnft = await this.fetchPoolNftUTXO(this.contractTxid);
        const tx = new tbc.Transaction()
            .from(poolnft)
            .from(fttxo_a)
            .from(utxo)
            //poolNft
            .addOutput(new tbc.Transaction.Output({
                script: tbc.Script.fromHex(this.poolnft_code),
                satoshis: 2000,
            }))
            .addOutput(new tbc.Transaction.Output({
                script: poolnftTapeScript,
                satoshis: 0,
            }))
        //FTAbyC
        const ftCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
        const ftTapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftCodeScript,
            satoshis: Number(this.tbc_amount),
        }))
        .addOutput(new tbc.Transaction.Output({
            script: ftTapeScript,
            satoshis: 0
        }))
        //FTLP
        const nameHex = Buffer.from(FTA.name, 'utf8').toString('hex');
        const symbolHex = Buffer.from(FTA.symbol, 'utf8').toString('hex');
        const ftlp_amount = new tbc.crypto.BN(amount_lpbn.toString());
        const amountwriter = new tbc.encoding.BufferWriter();
        amountwriter.writeUInt64LEBN(ftlp_amount);
        for (let i = 1; i < 6; i++) {
            amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
        }
        const ftlpTapeAmount = amountwriter.toBuffer().toString('hex');
        // Build the tape script
        const ftlpTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${ftlpTapeAmount} 06 ${nameHex} ${symbolHex} 4654617065`);
        const tapeSize = ftlpTapeScript.toBuffer().length;
        const ftlpCodeScript = this.getFTLPcode(poolnft_codehash.toString('hex'), address_to, tapeSize);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftlpCodeScript,
            satoshis: 2000
        }));
        tx.addOutput(new tbc.Transaction.Output({
            script: ftlpTapeScript,
            satoshis: 0
        }));
        if (this.ft_a_amount < tapeAmountSum) {
            const changeCodeScript = FT.buildFTtransferCode(FTA.codeScript, privateKey.toAddress().toString());
            tx.addOutput(new tbc.Transaction.Output({
                script: changeCodeScript,
                satoshis: 2000
            }));
            const changeTapeScript = FT.buildFTtransferTape(FTA.tapeScript, changeHex);
            tx.addOutput(new tbc.Transaction.Output({
                script: changeTapeScript,
                satoshis: 0
            }));
        }
        tx.feePerKb(100);
        tx.change(privateKey.toAddress())
        await tx.setInputScriptAsync({
            inputIndex: 0,
        }, async (tx) => {
            const unlockingScript = await this.getPoolNFTunlock(privateKey, tx, 0, poolnft.txId, poolnft.outputIndex, 1);
            return unlockingScript;
        });
        await tx.setInputScriptAsync({
            inputIndex: 1,
        }, async (tx) => {
            const unlockingScript = await FTA.getFTunlock(privateKey, tx, 1, fttxo_a.txId, fttxo_a.outputIndex);
            return unlockingScript;
        });
        tx.sign(privateKey);
        await tx.sealAsync();
        const txraw = tx.uncheckedSerialize();
        //console.log(tx.verify());
        return txraw;
    }

    async increaseLP(privateKey_from: tbc.PrivateKey, address_to: string, amount_tbc: number): Promise<string> {
        const privateKey = privateKey_from;
        const FTA = new FT({txidOrParams: this.ft_a_contractTxid, network: this.network});
        await FTA.initialize();
        const amount_tbcbn = BigInt(amount_tbc * Math.pow(10, 6));
        const changeDate = this.updatePoolNFT(amount_tbc, FTA.decimal, 2);
        const poolnft_codehash = tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code, 'hex'));
        const poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(poolnft_codehash).toString('hex');
        const tapeAmountSetIn: bigint[] = [];
        // Fetch FT UTXO for the transfer
        const fttxo_a = await FTA.fetchFtTXO(this.ft_a_contractTxid, privateKey.toAddress().toString(), changeDate.ft_a_difference);
        tapeAmountSetIn.push(fttxo_a.ftBalance!);
        // Calculate the total available balance
        let tapeAmountSum = BigInt(0);
        for (let i = 0; i < tapeAmountSetIn.length; i++) {
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
        }
        // Check if the balance is sufficient
        if (changeDate.ft_a_difference > tapeAmountSum) {
            throw new Error('Insufficient balance, please merge FT UTXOs');
        }
        // Build the amount and change hex strings for the tape
        let { amountHex, changeHex } = FT.buildTapeAmount(changeDate.ft_a_difference, tapeAmountSetIn, 1);
        const utxo = await API.fetchUTXO(privateKey, 0.1, this.network);
        if (utxo.satoshis < amount_tbcbn) { 
            throw new Error('Insufficient TBC amount, please merge UTXOs');
        }
        const poolnft = await this.fetchPoolNftUTXO(this.contractTxid);
        // Construct the transaction
        const tx = new tbc.Transaction()
            .from(poolnft)
            .from(fttxo_a)
            .from(utxo);
        tx.addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: 2000
        }));
        const writer = new tbc.encoding.BufferWriter();
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_lp_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_a_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.tbc_amount));
        const amountData = writer.toBuffer().toString('hex');
        const poolnftTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${this.ft_lp_partialhash + this.ft_a_partialhash} ${amountData} ${this.ft_a_contractTxid} 4e54617065`)
        tx.addOutput(new tbc.Transaction.Output({
            script: poolnftTapeScript,
            satoshis: 0
        }));
        // FTAbyC
        const ftabycCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftabycCodeScript,
            satoshis: Number(changeDate.tbc_amount_difference)
        }));
        const ftabycTapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftabycTapeScript,
            satoshis: 0
        }));

        //FTLP
        const nameHex = Buffer.from(FTA.name, 'utf8').toString('hex');
        const symbolHex = Buffer.from(FTA.symbol, 'utf8').toString('hex');
        const ftlp_amount = new tbc.crypto.BN(changeDate.ft_lp_difference.toString());
        const amountwriter = new tbc.encoding.BufferWriter();
        amountwriter.writeUInt64LEBN(ftlp_amount);
        for (let i = 1; i < 6; i++) {
            amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
        }
        const ftlpTapeAmount = amountwriter.toBuffer().toString('hex');
        // Build the tape script
        const ftlpTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${ftlpTapeAmount} 06 ${nameHex} ${symbolHex} 4654617065`);
        const tapeSize = ftlpTapeScript.toBuffer().length;
        const ftlpCodeScript = this.getFTLPcode(poolnft_codehash.toString('hex'), address_to, tapeSize);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftlpCodeScript,
            satoshis: 2000
        }));
        tx.addOutput(new tbc.Transaction.Output({
            script: ftlpTapeScript,
            satoshis: 0
        }));
        if (changeDate.ft_a_difference < tapeAmountSum) {
            // FTAbyA_change
            const ftabya_changeCodeScript = FT.buildFTtransferCode(FTA.codeScript, privateKey.toAddress().toString());
            tx.addOutput(new tbc.Transaction.Output({
                script: ftabya_changeCodeScript,
                satoshis: 2000
            }));
            const ftabya_changeTapeScript = FT.buildFTtransferTape(FTA.tapeScript, changeHex);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftabya_changeTapeScript,
                satoshis: 0
            }));
        }
        tx.feePerKb(100)
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
            const unlockingScript = await FTA.getFTunlock(privateKey, tx, 1, fttxo_a.txId, fttxo_a.outputIndex);
            return unlockingScript;
        });
        tx.sign(privateKey);
        await tx.sealAsync();
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }

    async consumLP(privateKey_from: tbc.PrivateKey, address_to: string, amount_lp: number): Promise<string> {
        const privateKey = privateKey_from;
        const FTA = new FT({txidOrParams: this.ft_a_contractTxid, network: this.network});
        await FTA.initialize();
        const amount_lpbn = BigInt(amount_lp * Math.pow(10, 6));
        if (this.ft_lp_amount < amount_lpbn) {
            throw new Error('Invalid FT-LP amount input');
        }
        const changeDate = this.updatePoolNFT(amount_lp, FTA.decimal, 1);
        const poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code,'hex'))).toString('hex');
        const tapeAmountSetIn: bigint[] = [];
        const lpTapeAmountSetIn: bigint[] = [];
        const ftlpCode = this.getFTLPcode(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code,'hex')).toString('hex'), privateKey.toAddress().toString(), FTA.tapeScript.length / 2);
        const fttxo_lp = await this.fetchFtlpUTXO(ftlpCode.toBuffer().toString('hex'), amount_lpbn);
        if (fttxo_lp.ftBalance === undefined) {
            throw new Error('ftBalance is undefined');
        } else if (fttxo_lp.ftBalance! < amount_lpbn) {
            throw new Error('Insufficient FT-LP amount, please merge FT-LP UTXOs');
        }
        lpTapeAmountSetIn.push(fttxo_lp.ftBalance);
        // Fetch FT UTXO for the transfer
        const fttxo_c = await FTA.fetchFtTXO(this.ft_a_contractTxid, poolnft_codehash160, changeDate.ft_a_difference);
        if (fttxo_c.ftBalance === undefined) {
            throw new Error('ftBalance is undefined');
        } else if (BigInt(fttxo_c.satoshis) < changeDate.tbc_amount_difference) {
            throw new Error('PoolFtUTXO tbc_amount is insufficient, please merge UTXOs');
        }
        tapeAmountSetIn.push(fttxo_c.ftBalance);
        // Calculate the total available balance
        let tapeAmountSum = BigInt(0);
        for (let i = 0; i < tapeAmountSetIn.length; i++) {
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
        }
        // Check if the balance is sufficient
        if (changeDate.ft_a_difference > tapeAmountSum) {
            throw new Error('Insufficient FT, please merge FT UTXOs');
        }
        // Build the amount and change hex strings for the tape
        let { amountHex, changeHex } = FT.buildTapeAmount(changeDate.ft_a_difference, tapeAmountSetIn, 2);
        const ftAbyA = amountHex;
        const ftAbyC = changeHex;
        ({ amountHex, changeHex } = FT.buildTapeAmount(amount_lpbn, lpTapeAmountSetIn, 1));
        const ftlpBurn = amountHex;
        const ftlpChange = changeHex;
        const utxo = await API.fetchUTXO(privateKey, 0.1, this.network);
        const poolnft = await this.fetchPoolNftUTXO(this.contractTxid);
        // Construct the transaction
        const tx = new tbc.Transaction()
            .from(poolnft)
            .from(fttxo_lp)
            .from(fttxo_c)
            .from(utxo);
        //poolNft
        tx.addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: 2000
        }));
        const writer = new tbc.encoding.BufferWriter();
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_lp_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_a_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.tbc_amount));
        const amountData = writer.toBuffer().toString('hex');
        const poolnftTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${this.ft_lp_partialhash + this.ft_a_partialhash} ${amountData} ${this.ft_a_contractTxid} 4e54617065`)
        tx.addOutput(new tbc.Transaction.Output({
            script: poolnftTapeScript,
            satoshis: 0
        }));
        //FTAbyA
        const ftCodeScript = FT.buildFTtransferCode(FTA.codeScript, address_to);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftCodeScript,
            satoshis: 2000
        }));
        const ftTapeScript = FT.buildFTtransferTape(FTA.tapeScript, ftAbyA);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftTapeScript,
            satoshis: 0
        }));
        //P2PKH
        tx.to(privateKey.toAddress().toString(), Number(changeDate.tbc_amount_difference));
        //FTLP_Burn
        const nameHex = Buffer.from(FTA.name, 'utf8').toString('hex');
        const symbolHex = Buffer.from(FTA.symbol, 'utf8').toString('hex');
        const amountwriter = new tbc.encoding.BufferWriter();
        for (let i = 0; i < 6; i++) {
            amountwriter.writeUInt64LEBN(new tbc.crypto.BN(0));
        }
        const ftlpTapeAmount = amountwriter.toBuffer().toString('hex');
        let ftlpTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${ftlpTapeAmount} 06 ${nameHex} ${symbolHex} 4654617065`);
        const ftlpCodeScript = FT.buildFTtransferCode(ftlpCode.toBuffer().toString('hex'), '1BitcoinEaterAddressDontSendf59kuE');
        tx.addOutput(new tbc.Transaction.Output({
            script: ftlpCodeScript,
            satoshis: 2000
        }));
        ftlpTapeScript = FT.buildFTtransferTape(ftlpTapeScript.toBuffer().toString('hex'), ftlpBurn);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftlpTapeScript,
            satoshis: 0
        }));
        // FTLP_change
        if (fttxo_lp.ftBalance! > amount_lpbn) {
            const ftlp_changeCodeScript = FT.buildFTtransferCode(ftlpCode.toBuffer().toString('hex'), address_to);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftlp_changeCodeScript,
                satoshis: 2000
            }));
            const ftlp_changeTapeScript = FT.buildFTtransferTape(ftlpTapeScript.toBuffer().toString('hex'), ftlpChange);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftlp_changeTapeScript,
                satoshis: 0
            }));
        }
        // FTAbyC_change
        if (changeDate.ft_a_difference < tapeAmountSum) {
            const ftabycCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftabycCodeScript,
                satoshis: fttxo_c.satoshis - Number(changeDate.tbc_amount_difference)
            }));
            const ftabycTapeScript = FT.buildFTtransferTape(FTA.tapeScript, ftAbyC);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftabycTapeScript,
                satoshis: 0
            }));
        }
        tx.feePerKb(100)
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
            const unlockingScript = await FTA.getFTunlock(privateKey, tx, 1, fttxo_lp.txId, fttxo_lp.outputIndex);
            return unlockingScript;
        });
        await tx.setInputScriptAsync({
            inputIndex: 2,
        }, async (tx) => {
            const unlockingScript = await FTA.getFTunlockSwap(privateKey, tx, 2, fttxo_c.txId, fttxo_c.outputIndex);
            return unlockingScript;
        });

        tx.sign(privateKey);
        await tx.sealAsync();
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }

    async swaptoToken(privateKey_from: tbc.PrivateKey, address_to: string, amount_token: number): Promise<string> {
        const privateKey = privateKey_from;
        const FTA = new FT({txidOrParams: this.ft_a_contractTxid, network: this.network});
        await FTA.initialize();
        const amount_ftbn = BigInt(amount_token * Math.pow(10, FTA.decimal));
        if (this.ft_a_amount < amount_ftbn) {
            throw new Error('Invalid FT-A amount input');
        }
        const poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code,'hex'))).toString('hex');
        const poolMul = this.ft_a_amount * this.tbc_amount;
        const tbc_amount = this.tbc_amount;
        this.ft_a_amount = BigInt(this.ft_a_amount) - BigInt(amount_ftbn);
        this.tbc_amount = BigInt(poolMul) / BigInt(this.ft_a_amount);
        const tbc_amount_increment = BigInt(this.tbc_amount) - BigInt(tbc_amount);
        const tapeAmountSetIn: bigint[] = [];

        // Fetch FT UTXO for the transfer
        const fttxo_c = await FTA.fetchFtTXO(this.ft_a_contractTxid, poolnft_codehash160, amount_ftbn);
        tapeAmountSetIn.push(fttxo_c.ftBalance!);
        // Calculate the total available balance
        let tapeAmountSum = BigInt(0);
        for (let i = 0; i < tapeAmountSetIn.length; i++) {
            tapeAmountSum += BigInt(tapeAmountSetIn[i]);
        }
        // Check if the balance is sufficient
        if (amount_ftbn > tapeAmountSum) {
            throw new Error('Insufficient FT, please merge FT UTXOs');
        }
        // Build the amount and change hex strings for the tape
        const { amountHex, changeHex } = FT.buildTapeAmount(amount_ftbn, tapeAmountSetIn, 2);
        const utxo = await API.fetchUTXO(privateKey, Number(tbc_amount_increment) / Math.pow(10, 6), this.network);
        if (BigInt(utxo.satoshis) < tbc_amount_increment) {
            throw new Error('Insufficient TBC amount, please merge UTXOs');
        }
        const poolnft = await this.fetchPoolNftUTXO(this.contractTxid);
        // Construct the transaction
        const tx = new tbc.Transaction()
            .from(poolnft)
            .from(utxo)
            .from(fttxo_c);
        tx.addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: 2000
        }));
        const writer = new tbc.encoding.BufferWriter();
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_lp_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_a_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.tbc_amount));
        const amountData = writer.toBuffer().toString('hex');
        const poolnftTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${this.ft_lp_partialhash + this.ft_a_partialhash} ${amountData} ${this.ft_a_contractTxid} 4e54617065`)
        tx.addOutput(new tbc.Transaction.Output({
            script: poolnftTapeScript,
            satoshis: 0
        }));
        // FTAbyA
        const ftCodeScript = FT.buildFTtransferCode(FTA.codeScript, address_to);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftCodeScript,
            satoshis: 2000
        }));
        const ftTapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftTapeScript,
            satoshis: 0
        }));
        // FTAbyC
        const ftabycCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftabycCodeScript,
            satoshis: fttxo_c.satoshis + Number(tbc_amount_increment)
        }));
        const ftabycTapeScript = FT.buildFTtransferTape(FTA.tapeScript, changeHex);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftabycTapeScript,
            satoshis: 0
        }));
        tx.feePerKb(100)
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
            const unlockingScript = await FTA.getFTunlockSwap(privateKey, tx, 2, fttxo_c.txId, fttxo_c.outputIndex);
            return unlockingScript;
        });
        tx.sign(privateKey);
        await tx.sealAsync();
        const txraw = tx.uncheckedSerialize();
        return txraw;
    }

    async swaptoTBC(privateKey_from: tbc.PrivateKey, address_to: string, amount_tbc: number): Promise<string> {
        const privateKey = privateKey_from;
        const FTA = new FT({txidOrParams: this.ft_a_contractTxid, network: this.network});
        await FTA.initialize();
        const amount_tbcbn = BigInt(amount_tbc * Math.pow(10, 6));
        if (this.tbc_amount < amount_tbcbn) {
            throw new Error('Invalid tbc amount input');
        }
        const poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code,'hex'))).toString('hex');
        const poolMul = this.ft_a_amount * this.tbc_amount;
        const ft_a_amount = this.ft_a_amount;
        this.tbc_amount = BigInt(this.tbc_amount) - BigInt(amount_tbcbn);
        this.ft_a_amount = BigInt(poolMul) / BigInt(this.tbc_amount);
        const ft_a_amount_increment = BigInt(this.ft_a_amount) - BigInt(ft_a_amount);
        const tapeAmountSetIn: bigint[] = [];
        // Fetch FT UTXO for the transfer
        const fttxo_a = await FTA.fetchFtTXO(this.ft_a_contractTxid, privateKey.toAddress().toString(), amount_tbcbn);
        if (fttxo_a.ftBalance! < ft_a_amount_increment) {
            throw new Error('Insufficient FT-A amount, please merge FT-A UTXOs');
        }
        tapeAmountSetIn.push(fttxo_a.ftBalance!);
        const fttxo_c = await FTA.fetchFtTXO(this.ft_a_contractTxid, poolnft_codehash160, amount_tbcbn);
        tapeAmountSetIn.push(fttxo_c.ftBalance!);
         // Check if the balance is sufficient
         if (amount_tbcbn > BigInt(fttxo_c.satoshis)) {
            throw new Error('Insufficient PoolTbc, please merge FT UTXOs');
        }
        // Build the amount and change hex strings for the tape
        const { amountHex, changeHex } = FT.buildTapeAmount(BigInt(ft_a_amount_increment) + BigInt(fttxo_c.ftBalance!), tapeAmountSetIn, 1);
        const utxo = await API.fetchUTXO(privateKey, 0.1, this.network);
        const poolnft = await this.fetchPoolNftUTXO(this.contractTxid);
        // Construct the transaction
        const tx = new tbc.Transaction()
            .from(poolnft)
            .from(fttxo_a)
            .from(fttxo_c)
            .from(utxo);
        //poolNft
        tx.addOutput(new tbc.Transaction.Output({
            script: tbc.Script.fromHex(this.poolnft_code),
            satoshis: 2000
        }));
        const writer = new tbc.encoding.BufferWriter();
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_lp_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_a_amount));
        writer.writeUInt64LEBN(new tbc.crypto.BN(this.tbc_amount));
        const amountData = writer.toBuffer().toString('hex');
        const poolnftTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${this.ft_lp_partialhash + this.ft_a_partialhash} ${amountData} ${this.ft_a_contractTxid} 4e54617065`)
        tx.addOutput(new tbc.Transaction.Output({
            script: poolnftTapeScript,
            satoshis: 0
        }));
        tx.to(address_to, Number(amount_tbcbn));
        // FTAbyC
        const ftCodeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftCodeScript,
            satoshis: fttxo_c.satoshis - Number(amount_tbcbn)
        }));
        const ftTapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
        tx.addOutput(new tbc.Transaction.Output({
            script: ftTapeScript,
            satoshis: 0
        }));
        // FTAbyA_change
        if (ft_a_amount_increment < fttxo_a.ftBalance!) {
            const ftabycCodeScript = FT.buildFTtransferCode(FTA.codeScript, privateKey.toAddress().toString());
            tx.addOutput(new tbc.Transaction.Output({
                script: ftabycCodeScript,
                satoshis: 2000
            }));
            const ftabycTapeScript = FT.buildFTtransferTape(FTA.tapeScript, changeHex);
            tx.addOutput(new tbc.Transaction.Output({
                script: ftabycTapeScript,
                satoshis: 0
            }));
        }
        tx.feePerKb(100)
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
            const unlockingScript = await FTA.getFTunlock(privateKey, tx, 1, fttxo_a.txId, fttxo_a.outputIndex);
            return unlockingScript;
        });
        await tx.setInputScriptAsync({
            inputIndex: 2,
        }, async (tx) => {
            const unlockingScript = await FTA.getFTunlockSwap(privateKey, tx, 2, fttxo_c.txId, fttxo_c.outputIndex);
            return unlockingScript;
        });
        tx.sign(privateKey);
        await tx.sealAsync();
        const txraw = tx.uncheckedSerialize();
        //console.log(tx.verify());
        return txraw;
    }

    async fetchPoolNFTInfo(contractTxid: string): Promise<PoolNFTInfo> {
        const url_testnet = `http://tbcdev.org:5000/v1/tbc/main/ft/pool/nft/info/contract/id/${contractTxid}`;
        const url_mainnet = `https://turingwallet.xyz/v1/tbc/main/ft/pool/nft/info/contract/id/${contractTxid}`;
        let url = this.network == "testnet" ? url_testnet : url_mainnet;
        try {
            const response = await (await fetch(url)).json();
            let data = response;
            const poolNftInfo: PoolNFTInfo = {
                ft_lp_amount: data.ft_lp_balance,
                ft_a_amount: data.ft_a_balance,
                tbc_amount: data.tbc_balance,
                ft_lp_partialhash: data.ft_lp_partial_hash,
                ft_a_partialhash: data.ft_a_partial_hash,
                ft_a_contractTxid: data.ft_a_contract_txid,
                poolnft_code: data.pool_nft_code_script,
                currentContractTxid: data.current_pool_nft_txid,
                currentContractVout: data.current_pool_nft_vout,
                currentContractSatoshi: data.current_pool_nft_balance
            }
            return poolNftInfo;
        } catch (error) {
            throw new Error("Failed to fetch PoolNFTInfo.");
        }
    }

    async fetchPoolNftUTXO(contractTxid: string): Promise<tbc.Transaction.IUnspentOutput> {
        try {
            const poolNftInfo = await this.fetchPoolNFTInfo(contractTxid);
            const poolnft: tbc.Transaction.IUnspentOutput = {
                txId: poolNftInfo.currentContractTxid,
                outputIndex: poolNftInfo.currentContractVout,
                script: poolNftInfo.poolnft_code,
                satoshis: poolNftInfo.currentContractSatoshi
            }
            return poolnft;
        } catch (error) {
            throw new Error("Failed to fetch PoolNFT UTXO.");
        }
    }

    async fetchFtlpUTXO(ftlpCode: string, amount: bigint): Promise<tbc.Transaction.IUnspentOutput> {
        const ftlpHash = tbc.crypto.Hash.sha256(Buffer.from(ftlpCode, 'hex')).reverse().toString('hex');
        const url_testnet = `http://tbcdev.org:5000/v1/tbc/main/ft/lp/unspent/by/script/hash${ftlpHash}`;
        const url_mainnet = `https://turingwallet.xyz/v1/tbc/main/ft/lp/unspent/by/script/hash${ftlpHash}`;
        let url = this.network == "testnet" ? url_testnet : url_mainnet;
        try {
            const response = await (await fetch(url)).json();
            let data = response.ftUtxoList[0];
            for (let i = 0; i < response.ftUtxoList.length; i++) {
                if (response.ftUtxoList[i].ftBalance >= amount) {
                    data = response.ftUtxoList[i];
                    break;
                }
            }
            let ftlpBalance = BigInt(0);
            if (data.ftBalance < amount) {
                for (let i = 0; i < response.ftUtxoList.length; i++) {
                    ftlpBalance += BigInt(response.ftUtxoList[i].ftBalance);
                }
                if (ftlpBalance < amount) {
                    throw new Error('Insufficient FT-LP amount');
                } else {
                    throw new Error('Please merge FT-LP UTXOs');
                }
            }
            const ftlp: tbc.Transaction.IUnspentOutput = {
                txId: data.utxoId,
                outputIndex: data.utxoVout,
                script: ftlpCode,
                satoshis: data.utxoBalance,
                ftBalance: data.ftBalance
            }
            return ftlp;
        } catch (error) {
            throw new Error("Failed to fetch FTLP UTXO.");
        }
    }

    async mergeFTLP(privateKey_from: tbc.PrivateKey): Promise<boolean> {
        const FTA = new FT({txidOrParams: this.ft_a_contractTxid, network: this.network});
        await FTA.initialize();
        const privateKey = privateKey_from;
        const address = privateKey.toAddress().toString();
        const ftlpCodeScript = this.getFTLPcode(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code,'hex')).toString('hex'), address, FTA.tapeScript.length / 2);
        const ftlpCodeHash = tbc.crypto.Hash.sha256(ftlpCodeScript.toBuffer());
        const url_testnet = `http://tbcdev.org:5000/v1/tbc/main/ft/lp/unspent/by/script/hash${ftlpCodeHash}`;
        const url_mainnet = `https://turingwallet.xyz/v1/tbc/main/ft/lp/unspent/by/script/hash${ftlpCodeHash}`;
        let url = this.network == "testnet" ? url_testnet : url_mainnet;
        const fttxo_codeScript = FT.buildFTtransferCode(ftlpCodeScript.toBuffer().toString(), address).toBuffer().toString('hex');
        try {
            const response = await (await fetch(url)).json();
            let fttxo: tbc.Transaction.IUnspentOutput[] = [];
            if (response.ftUtxoList.length === 0) {
                throw new Error('No FT UTXO available');
            }
            if (response.ftUtxoList.length === 1) {
                console.log('Merge Success!');
                return true;
            } else {
                for (let i = 0; i < response.ftUtxoList.length && i < 5; i++) {
                    fttxo.push({
                        txId: response.ftUtxoList[i].utxoId,
                        outputIndex: response.ftUtxoList[i].utxoVout,
                        script: fttxo_codeScript,
                        satoshis: response.ftUtxoList[i].utxoBalance,
                        ftBalance: response.ftUtxoList[i].ftBalance
                    });
                }
            }
            const tapeAmountSetIn: bigint[] = [];
            let tapeAmountSum = BigInt(0);
            for (let i = 0; i < fttxo.length; i++) {
                tapeAmountSetIn.push(fttxo[i].ftBalance!);
                tapeAmountSum += BigInt(fttxo[i].ftBalance!);
            }
            const { amountHex, changeHex } = FT.buildTapeAmount(tapeAmountSum, tapeAmountSetIn);
            if (changeHex != '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000') {
                throw new Error('Change amount is not zero');
            }
            const utxo = await API.fetchUTXO(privateKey, 0.1, this.network);
            const tx = new tbc.Transaction()
                .from(fttxo)
                .from(utxo);
            const codeScript = FT.buildFTtransferCode(fttxo_codeScript, address);
            tx.addOutput(new tbc.Transaction.Output({
                script: codeScript,
                satoshis: 2000
            }));
            const tapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
            tx.addOutput(new tbc.Transaction.Output({
                script: tapeScript,
                satoshis: 0
            }));
            tx.feePerKb(100)
            .change(privateKey.toAddress());
            for (let i = 0; i < fttxo.length; i++) {
                await tx.setInputScriptAsync({
                    inputIndex: i,
                }, async (tx) => {
                    const unlockingScript = await FTA.getFTunlock(privateKey, tx, i, fttxo[i].txId, fttxo[i].outputIndex);
                    return unlockingScript;
                });
            }
            tx.sign(privateKey);
            await tx.sealAsync();
            const txraw = tx.uncheckedSerialize();
            console.log('Merge FTLPUTXO:');
            await poolNFT.broadcastTXraw(txraw, this.network);
            // wait 5 seconds
            await new Promise(resolve => setTimeout(resolve, 5000));
            await this.mergeFTLP(privateKey);
            return true;
        } catch (error) {
            throw new Error("Merge Faild!.");
        }
    }

    async mergeFTinPool(privateKey_from: tbc.PrivateKey): Promise<boolean> {
        const FTA = new FT({txidOrParams: this.ft_a_contractTxid, network: this.network});
        await FTA.initialize();
        const privateKey = privateKey_from;
        const address = privateKey.toAddress().toString();
        const poolnft_codehash160 = tbc.crypto.Hash.sha256ripemd160(tbc.crypto.Hash.sha256(Buffer.from(this.poolnft_code,'hex'))).toString('hex');
        const hash = poolnft_codehash160 + '01';
        const contractTxid = this.ft_a_contractTxid;
        const url_testnet = `http://tbcdev.org:5000/v1/tbc/main/ft/utxo/combine/script/${hash}/contract/${contractTxid}`;
        const url_mainnet = `https://turingwallet.xyz/v1/tbc/main/ft/utxo/combine/script/${hash}/contract/${contractTxid}`;
        let url = this.network == "testnet" ? url_testnet : url_mainnet;
        const fttxo_codeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160).toBuffer().toString('hex');
        try {
            const response = await (await fetch(url)).json();
            let fttxo: tbc.Transaction.IUnspentOutput[] = [];
            if (response.ftUtxoList.length === 0) {
                throw new Error('No FT UTXO available');
            }
            if (response.ftUtxoList.length === 1) {
                console.log('Merge Success!');
                return true;
            } else {
                for (let i = 0; i < response.ftUtxoList.length && i < 4; i++) {
                    fttxo.push({
                        txId: response.ftUtxoList[i].utxoId,
                        outputIndex: response.ftUtxoList[i].utxoVout,
                        script: fttxo_codeScript,
                        satoshis: response.ftUtxoList[i].utxoBalance,
                        ftBalance: response.ftUtxoList[i].ftBalance
                    });
                }
            }
            const tapeAmountSetIn: bigint[] = [];
            let tapeAmountSum = BigInt(0);
            let tbcAmountSum  = 0;
            for (let i = 0; i < fttxo.length; i++) {
                tapeAmountSetIn.push(fttxo[i].ftBalance!);
                tapeAmountSum += BigInt(fttxo[i].ftBalance!);
                tbcAmountSum += fttxo[i].satoshis;
            }
            const { amountHex, changeHex } = FT.buildTapeAmount(tapeAmountSum, tapeAmountSetIn, 1);
            if (changeHex != '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000') {
                throw new Error('Change amount is not zero');
            }
            const poolnft = await this.fetchPoolNftUTXO(this.contractTxid);
            const utxo = await API.fetchUTXO(privateKey, 0.1, this.network);
            const tx = new tbc.Transaction()
                .from(poolnft)
                .from(fttxo)
                .from(utxo);
            //poolNft
            tx.addOutput(new tbc.Transaction.Output({
                script: tbc.Script.fromHex(this.poolnft_code),
                satoshis: 2000
            }));
            const writer = new tbc.encoding.BufferWriter();
            writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_lp_amount));
            writer.writeUInt64LEBN(new tbc.crypto.BN(this.ft_a_amount));
            writer.writeUInt64LEBN(new tbc.crypto.BN(this.tbc_amount));
            const amountData = writer.toBuffer().toString('hex');
            const poolnftTapeScript = tbc.Script.fromASM(`OP_FALSE OP_RETURN ${this.ft_lp_partialhash + this.ft_a_partialhash} ${amountData} ${this.ft_a_contractTxid} 4e54617065`)
            tx.addOutput(new tbc.Transaction.Output({
                script: poolnftTapeScript,
                satoshis: 0
            }));
            //FTAbyC
            const codeScript = FT.buildFTtransferCode(FTA.codeScript, poolnft_codehash160);
            tx.addOutput(new tbc.Transaction.Output({
                script: codeScript,
                satoshis: tbcAmountSum
            }));
            const tapeScript = FT.buildFTtransferTape(FTA.tapeScript, amountHex);
            tx.addOutput(new tbc.Transaction.Output({
                script: tapeScript,
                satoshis: 0
            }));
            tx.feePerKb(100)
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
                    const unlockingScript = await FTA.getFTunlock(privateKey, tx, i + 1, fttxo[i].txId, fttxo[i].outputIndex);
                    return unlockingScript;
                });
            }
            tx.sign(privateKey);
            await tx.sealAsync();
            const txraw = tx.uncheckedSerialize();
            console.log('Merge FtUTXOinPool:');
            await poolNFT.broadcastTXraw(txraw, this.network);
            // wait 5 seconds
            await new Promise(resolve => setTimeout(resolve, 5000));
            await this.mergeFTinPool(privateKey);
            return true;
        } catch (error) {
            throw new Error("Merge Faild!.");
        }
    }

    static async broadcastTXraw(txraw: string, network?: "testnet" | "mainnet"): Promise<string> {
        if (network) {
            network = network;
        } else {
            network = "mainnet";
        }
        const url_testnet = 'http://tbcdev.org:5000/v1/tbc/main/broadcast/tx/raw';
        const url_mainnet = 'https://turingwallet.xyz/v1/tbc/main/broadcast/tx/raw';
        let url = network == "testnet" ? url_testnet : url_mainnet;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    txHex: txraw
                })
            });
    
            if (!response.ok) {
                throw new Error(`Failed to broadcast TXraw: ${response.statusText}`);
            }
    
            const data = await response.json();
            console.log('txid:', data.result);
            if (data.error) {
                console.log('error:', data.error);
            }
            return data.result;
        } catch (error) {
            throw new Error("Failed to broadcast TXraw.");
        }
    }

    async getPoolNFTunlock(privateKey_from: tbc.PrivateKey, currentTX: tbc.Transaction, currentUnlockIndex: number, preTxId: string, preVout: number, option: 1 | 2 | 3 | 4, swapOption?: 1 | 2): Promise<tbc.Script> {
        const privateKey = privateKey_from;
        const preTX = await API.fetchTXraw(preTxId, this.network);
        const pretxdata = getPoolNFTPreTxdata(preTX);
        const prepreTX = await API.fetchTXraw(preTX.inputs[preVout].prevTxId.toString('hex'), this.network);
        const prepretxdata = getPoolNFTPrePreTxdata(prepreTX);
        let currentinputsdata = getCurrentInputsdata(currentTX);
        let currentinputstxdata = '';
        for (let i = 1; i < currentTX.inputs.length; i++) {
            const inputsTX = await API.fetchTXraw(currentTX.inputs[i].prevTxId.toString('hex'), this.network);
            if (option == 3) {
                currentinputstxdata = getInputsTxdataSwap(inputsTX, currentTX.inputs[i].outputIndex) + currentinputstxdata;
            } else {
                currentinputstxdata += getInputsTxdata(inputsTX, currentTX.inputs[i].outputIndex);
            }
        }
        currentinputstxdata = '51' + currentinputstxdata;
        
        const currenttxoutputsdata = getCurrentTxOutputsdata(currentTX,option,swapOption);
        const sig = (currentTX.getSignature(currentUnlockIndex, privateKey).length / 2).toString(16).padStart(2, '0') + currentTX.getSignature(currentUnlockIndex, privateKey);
        const publicKey = (privateKey.toPublicKey().toString().length / 2).toString(16).padStart(2, '0') + privateKey.toPublicKey().toString();
        let unlockingScript = new tbc.Script('');
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

    getPoolNftCode(txid: string, vout: number): tbc.Script {
        const writer = new tbc.encoding.BufferWriter();
        writer.writeReverse(Buffer.from(txid, 'hex'));
        writer.writeUInt32LE(vout);
        const utxoHex = writer.toBuffer().toString('hex');
        const poolNftCode = new tbc.Script(`OP_1 OP_PICK OP_3 OP_SPLIT OP_NIP 0x01 0x20 OP_SPLIT 0x01 0x20 OP_SPLIT OP_1 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_TOALTSTACK OP_BIN2NUM OP_TOALTSTACK OP_BIN2NUM OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_1 OP_PICK OP_TOALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_1 OP_PICK 0x01 0x24 OP_SPLIT OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_HASH256 OP_6 OP_PUSH_META 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_1 OP_PICK OP_TOALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_SWAP OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUAL OP_IF OP_DROP OP_ELSE 0x24 0x${utxoHex} OP_EQUALVERIFY OP_ENDIF OP_DUP OP_1 OP_EQUAL OP_IF OP_DROP OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_4 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_HASH160 OP_SWAP OP_TOALTSTACK OP_EQUAL OP_0 OP_EQUALVERIFY OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_8 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_DUP 0x03 0xa08601 OP_BIN2NUM OP_GREATERTHANOREQUAL OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_2DUP OP_2DUP OP_GREATERTHAN OP_NOTIF OP_SWAP OP_ENDIF OP_DIV 0x04 0x00e1f505 OP_BIN2NUM OP_LESSTHANOREQUAL OP_1 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_TOALTSTACK OP_3 OP_ROLL OP_DUP OP_HASH160 OP_TOALTSTACK OP_8 OP_ROLL OP_EQUALVERIFY OP_5 OP_ROLL OP_DUP OP_TOALTSTACK OP_2DUP OP_2DUP OP_ADD OP_TOALTSTACK OP_DIV OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_DUP OP_10 OP_LESSTHAN OP_IF OP_TOALTSTACK OP_MOD OP_0 OP_EQUALVERIFY OP_ELSE OP_TOALTSTACK OP_2DROP OP_ENDIF OP_FROMALTSTACK OP_2DUP OP_DIV OP_5 OP_PICK OP_EQUALVERIFY OP_SWAP OP_4 OP_ROLL OP_ADD OP_TOALTSTACK OP_2DUP OP_DIV OP_3 OP_PICK OP_EQUALVERIFY OP_DROP OP_SWAP OP_SUB OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DROP OP_ELSE OP_DROP OP_2DROP OP_3 OP_ROLL OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_4 OP_ROLL OP_SUB OP_SWAP OP_TOALTSTACK OP_SWAP OP_FROMALTSTACK OP_3 OP_ROLL OP_DROP OP_ENDIF OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_3 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_5 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_1 OP_EQUALVERIFY OP_ELSE OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY OP_TOALTSTACK OP_0 OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUAL OP_IF OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_ELSE OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_3 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_4 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_HASH160 OP_3 OP_ROLL OP_EQUALVERIFY OP_7 OP_PICK OP_BIN2NUM OP_SUB OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP 0x14 0x759d6677091e973b9e9d99f19c68fbf43e3f05f9 OP_EQUALVERIFY OP_2 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_DUP 0x03 0x40420f OP_BIN2NUM OP_GREATERTHANOREQUAL OP_1 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_DUP OP_TOALTSTACK OP_SUB OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_2 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_2DUP OP_2DUP OP_GREATERTHAN OP_NOTIF OP_SWAP OP_ENDIF OP_DIV 0x04 0x00e1f505 OP_BIN2NUM OP_LESSTHANOREQUAL OP_1 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_5 OP_ROLL OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_5 OP_ROLL OP_2DUP OP_2DUP OP_SUB OP_TOALTSTACK OP_DIV OP_DUP OP_10 OP_LESSTHAN OP_IF OP_TOALTSTACK OP_MOD OP_0 OP_EQUALVERIFY OP_ELSE OP_TOALTSTACK OP_2DROP OP_ENDIF OP_FROMALTSTACK OP_2DUP OP_DIV OP_5 OP_PICK OP_EQUALVERIFY OP_SWAP OP_4 OP_ROLL OP_SUB OP_TOALTSTACK OP_2DUP OP_DIV OP_3 OP_PICK OP_EQUALVERIFY OP_DROP OP_SWAP OP_ADD OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_3 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_ELSE OP_DUP OP_3 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY 0x01 0x28 OP_SPLIT OP_NIP OP_FROMALTSTACK OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_0 OP_TOALTSTACK OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_8 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_8 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_DROP OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_7 OP_PICK OP_BIN2NUM OP_2DUP OP_LESSTHAN OP_1 OP_EQUALVERIFY OP_SWAP OP_SUB OP_DUP 0x03 0xa08601 OP_BIN2NUM OP_GREATERTHANOREQUAL OP_1 OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_DUP OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_2 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_2DUP OP_2DUP OP_GREATERTHAN OP_NOTIF OP_SWAP OP_ENDIF OP_DIV 0x04 0x00e1f505 OP_BIN2NUM OP_LESSTHANOREQUAL OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_4 OP_ROLL OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_2DUP OP_MUL OP_TOALTSTACK OP_4 OP_ROLL OP_ADD OP_TOALTSTACK OP_2 OP_ROLL OP_SUB OP_FROMALTSTACK OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_2DUP OP_FROMALTSTACK OP_SWAP OP_DIV OP_EQUALVERIFY OP_4 OP_ROLL OP_EQUALVERIFY OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_7 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_7 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_0 OP_EQUALVERIFY OP_0 OP_0 OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_9 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_9 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_IF OP_9 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_9 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_9 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_IF OP_9 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_9 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_9 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_IF OP_9 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x01 0x19 OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_ELSE OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_9 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_9 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUAL OP_IF OP_9 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_ENDIF OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK 0x01 0x28 OP_SPLIT OP_TOALTSTACK 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_DROP OP_DUP OP_0 OP_EQUAL OP_IF OP_TOALTSTACK OP_ELSE OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_ENDIF OP_DUP OP_0 OP_EQUAL OP_IF OP_DROP OP_ELSE OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_ENDIF OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_4 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_9 OP_PICK OP_EQUALVERIFY OP_DUP OP_TOALTSTACK OP_HASH160 OP_4 OP_ROLL OP_EQUALVERIFY OP_8 OP_PICK OP_BIN2NUM OP_SUB OP_TOALTSTACK OP_2 OP_PICK OP_3 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_SWAP OP_BIN2NUM OP_ADD OP_2DUP OP_LESSTHAN OP_1 OP_EQUALVERIFY OP_SWAP OP_SUB OP_TOALTSTACK OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_TOALTSTACK OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_5 OP_PICK OP_BIN2NUM OP_DUP OP_TOALTSTACK OP_DUP 0x03 0xa08601 OP_BIN2NUM OP_GREATERTHANOREQUAL OP_1 OP_EQUALVERIFY OP_SUB OP_0 OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_2DUP OP_2DUP OP_GREATERTHAN OP_NOTIF OP_SWAP OP_ENDIF OP_DIV 0x04 0x00e1f505 OP_BIN2NUM OP_LESSTHANOREQUAL OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_4 OP_ROLL OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_2DUP OP_MUL OP_TOALTSTACK OP_4 OP_ROLL OP_SUB OP_TOALTSTACK OP_2 OP_ROLL OP_ADD OP_FROMALTSTACK OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_SWAP OP_BIN2NUM OP_2DUP OP_FROMALTSTACK OP_SWAP OP_DIV OP_EQUALVERIFY OP_4 OP_ROLL OP_EQUALVERIFY OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_ENDIF OP_ELSE OP_4 OP_EQUALVERIFY OP_DUP OP_SHA256 OP_5 OP_PUSH_META OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_0 OP_TOALTSTACK OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_OVER 0x02 0x1c06 OP_EQUAL OP_IF OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_6 OP_PICK OP_EQUALVERIFY OP_TOALTSTACK OP_6 OP_PICK OP_BIN2NUM OP_ADD OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_SIZE 0x01 0x28 OP_SUB OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_2 OP_ROLL OP_EQUALVERIFY OP_TOALTSTACK OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_DROP OP_DUP 0x01 0x19 OP_EQUALVERIFY OP_PARTIAL_HASH OP_CAT OP_TOALTSTACK OP_2 OP_PICK 0x02 0x1c06 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_7 OP_PICK OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_HASH160 OP_7 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_7 OP_PICK OP_BIN2NUM OP_EQUALVERIFY OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_2DUP OP_SHA256 OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_3 OP_PICK OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_CAT OP_CAT OP_SHA256 OP_7 OP_PUSH_META OP_EQUALVERIFY OP_NIP OP_2 OP_ROLL OP_DROP OP_SWAP OP_FROMALTSTACK OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4e54617065 OP_EQUALVERIFY 0x01 0x44 OP_SPLIT OP_NIP OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_3 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_2 OP_ROLL OP_EQUALVERIFY OP_BIN2NUM OP_EQUALVERIFY OP_ENDIF OP_ENDIF OP_ENDIF OP_CHECKSIG OP_RETURN 0x05 0x32436f6465`);
        return poolNftCode;
        //OP_DUP OP_1 OP_SPLIT OP_NIP OP_4 OP_SPLIT OP_DROP 0x04 0x00000000 OP_EQUALVERIFY 
    }

    getFTLPcode(poolNftCodeHash: string, address: string, tapeSize: number): tbc.Script {
        const codeHash = poolNftCodeHash;
        const publicKeyHash = tbc.Address.fromString(address).hashBuffer.toString('hex');
        const hash = publicKeyHash + '00';
        const tapeSizeHex = getSize(tapeSize).toString('hex');

        const ftlpcode = new tbc.Script(`OP_9 OP_PICK OP_TOALTSTACK OP_1 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_5 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_4 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_3 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_2 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_1 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_SWAP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_DUP OP_0 0x01 0x28 OP_MUL OP_SPLIT 0x01 0x20 OP_SPLIT OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_ENDIF OP_ADD OP_FROMALTSTACK OP_DROP OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_FROMALTSTACK OP_CAT OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_TOALTSTACK OP_3 OP_PICK OP_1 OP_SPLIT OP_NIP 0x01 0x14 OP_SPLIT OP_DROP OP_TOALTSTACK OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_TOALTSTACK OP_SHA256 OP_FROMALTSTACK OP_CAT OP_CAT OP_HASH256 OP_6 OP_PUSH_META 0x01 0x20 OP_SPLIT OP_DROP OP_EQUALVERIFY OP_DUP OP_HASH160 OP_FROMALTSTACK OP_EQUALVERIFY OP_CHECKSIGVERIFY OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUAL OP_IF OP_TOALTSTACK OP_PARTIAL_HASH OP_ELSE OP_TOALTSTACK OP_PARTIAL_HASH OP_DUP 0x20 0x${codeHash} OP_EQUALVERIFY OP_ENDIF OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_2 OP_PICK OP_2 OP_PICK OP_CAT OP_FROMALTSTACK OP_DUP OP_TOALTSTACK OP_EQUALVERIFY OP_TOALTSTACK OP_PARTIAL_HASH OP_CAT OP_CAT OP_FROMALTSTACK OP_CAT OP_SHA256 OP_CAT OP_CAT OP_CAT OP_HASH256 OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_SWAP OP_TOALTSTACK OP_EQUALVERIFY OP_ENDIF OP_7 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_SWAP OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_DUP OP_2 OP_EQUAL OP_IF OP_DROP OP_DUP OP_SIZE OP_DUP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUALVERIFY OP_3 OP_SPLIT OP_SWAP OP_DROP OP_FROMALTSTACK OP_DUP OP_8 OP_MUL OP_2 OP_ROLL OP_SWAP OP_SPLIT OP_8 OP_SPLIT OP_DROP OP_BIN2NUM OP_DUP OP_0 OP_EQUAL OP_NOTIF OP_FROMALTSTACK OP_FROMALTSTACK OP_DUP OP_9 OP_PICK OP_9 OP_PICK OP_CAT OP_EQUALVERIFY OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_FROMALTSTACK OP_SWAP OP_SUB OP_TOALTSTACK OP_DROP OP_TOALTSTACK OP_SHA256 OP_CAT OP_TOALTSTACK OP_PARTIAL_HASH OP_FROMALTSTACK OP_CAT OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ELSE OP_DROP 0x01 0x${tapeSizeHex} OP_EQUAL OP_IF OP_2 OP_PICK OP_SIZE OP_5 OP_SUB OP_SPLIT 0x05 0x4654617065 OP_EQUAL OP_0 OP_EQUALVERIFY OP_DROP OP_ENDIF OP_PARTIAL_HASH OP_CAT OP_FROMALTSTACK OP_FROMALTSTACK OP_FROMALTSTACK OP_3 OP_ROLL OP_FROMALTSTACK OP_CAT OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_TOALTSTACK OP_ENDIF OP_ENDIF OP_1 OP_EQUALVERIFY OP_FROMALTSTACK OP_FROMALTSTACK OP_0 OP_EQUALVERIFY OP_DROP OP_FROMALTSTACK OP_FROMALTSTACK OP_SHA256 OP_7 OP_PUSH_META OP_EQUAL OP_NIP OP_PUSHDATA1 0x82 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff OP_DROP OP_RETURN 0x15 0x${hash} 0x05 0x02436f6465`)
        return ftlpcode;
    }
    
    updatePoolNFT(increment: number, ft_a_decimal: number, option: 1 | 2 | 3): poolNFTDifference {
        const ft_a_old = this.ft_a_amount;
        const ft_lp_old = this.ft_lp_amount;
        const tbc_amount_old = this.tbc_amount;
        if (option == 1) {
            const ftLpIncrement = BigInt(increment * Math.pow(10, 6));
            this.updateWhenFtLpChange(ftLpIncrement);
        } else if (option == 2) {
            const tbcIncrement = BigInt(increment * Math.pow(10, 6));
            this.updateWhenTbcAmountChange(tbcIncrement);
        } else {
            const ftAIncrement = BigInt(increment * Math.pow(10, ft_a_decimal));
            this.updateWhenFtAChange(ftAIncrement);
        }
        if (this.tbc_amount > tbc_amount_old) {
            return {
                ft_lp_difference: BigInt(ft_lp_old) - BigInt(this.ft_lp_amount),
                ft_a_difference: BigInt(this.ft_a_amount) - BigInt(ft_a_old),
                tbc_amount_difference: BigInt(this.tbc_amount) - BigInt(tbc_amount_old)
            }
        } else {
            return {
                ft_lp_difference: BigInt(this.ft_lp_amount) - BigInt(ft_lp_old),
                ft_a_difference: BigInt(ft_a_old) - BigInt(this.ft_a_amount),
                tbc_amount_difference: BigInt(tbc_amount_old) - BigInt(this.tbc_amount)
            }
        }
    }

    private updateWhenFtLpChange(incrementBN: bigint) {
        const increment = BigInt(incrementBN);
        if (increment == BigInt(0)) {
            return;
        } else if (increment > BigInt(0) && increment <= BigInt(this.ft_lp_amount)) {
            const ratio = BigInt(this.ft_lp_amount) / increment;
            this.ft_lp_amount = BigInt(this.ft_lp_amount) + BigInt(increment);
            this.ft_a_amount = BigInt(this.ft_a_amount) - BigInt(this.ft_a_amount) / ratio;
            this.tbc_amount = BigInt(this.tbc_amount) - BigInt(this.tbc_amount) / ratio;
        } else {
            throw new Error("Increment is invalid!")
        }
    }

    private updateWhenFtAChange(incrementBN: bigint) {
        const increment = BigInt(incrementBN);
        if (increment == BigInt(0)) {
            return;
        } else if (increment > BigInt(0) && increment <= BigInt(this.ft_a_amount)) {
            const ratio = BigInt(this.ft_a_amount) / increment;
            this.ft_a_amount = BigInt(this.ft_a_amount) + BigInt(increment);
            this.ft_lp_amount = BigInt(this.ft_lp_amount) - BigInt(this.ft_lp_amount) / ratio;
            this.tbc_amount = BigInt(this.ft_a_amount) + BigInt(this.ft_a_amount) / ratio;
        } else {
            throw new Error("Increment is invalid!")
        }
    }

    private updateWhenTbcAmountChange(incrementBN: bigint) {
        const increment = BigInt(incrementBN);
        if (increment == BigInt(0)) {
            return;
        } else if (increment > BigInt(0) && increment <= BigInt(this.tbc_amount)) {
            const ratio = BigInt(this.tbc_amount) / increment;
            this.tbc_amount = BigInt(this.tbc_amount) + BigInt(increment);
            this.ft_lp_amount = BigInt(this.ft_lp_amount) - BigInt(this.ft_lp_amount) / ratio;
            this.ft_a_amount = BigInt(this.ft_a_amount) + BigInt(this.ft_a_amount) / ratio;
        } else {
            throw new Error("Increment is invalid!")
        }
    }

}

function getInputsTxdata(tx: tbc.Transaction, vout: number): string {
    const writer = new tbc.encoding.BufferWriter();
    writer.write(Buffer.from(vliolength, 'hex'));
    writer.writeUInt32LE(version);
    writer.writeUInt32LE(tx.nLockTime);
    writer.writeInt32LE(tx.inputs.length);
    writer.writeInt32LE(tx.outputs.length);

    const inputWriter = new tbc.encoding.BufferWriter();
    const inputWriter2 = new tbc.encoding.BufferWriter();
    for (const input of tx.inputs) {
        inputWriter.writeReverse(input.prevTxId);
        inputWriter.writeUInt32LE(input.outputIndex);
        inputWriter.writeUInt32LE(input.sequenceNumber);
        inputWriter2.write(tbc.crypto.Hash.sha256(input.script.toBuffer()));
    }
    writer.write(Buffer.from(hashlength, 'hex'));
    writer.write(tbc.crypto.Hash.sha256(inputWriter.toBuffer()));
    writer.write(Buffer.from(hashlength, 'hex'));
    writer.write(tbc.crypto.Hash.sha256(inputWriter2.toBuffer()));

    const { outputs1, outputs1length, outputs2, outputs2length } = getInputsTxOutputsData(tx, vout);
    writer.write(Buffer.from(outputs1length, 'hex'));
    writer.write(Buffer.from(outputs1, 'hex'));

    const lockingscript = tx.outputs[vout].script.toBuffer()
    if(lockingscript.length == 1564){
        const size = getSize(lockingscript.length)//size小端序
        const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536))
        const suffixdata = lockingscript.subarray(1536)

        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[vout].satoshisBN);
        writer.write(getLengthHex(suffixdata.length));//suffixdata
        writer.write(suffixdata);
        writer.write(Buffer.from(hashlength, 'hex'));//partialhash
        writer.write(Buffer.from(partialhash, 'hex'));
        writer.write(getLengthHex(size.length));
        writer.write(size);
    }
    else{
        const size = getSize(lockingscript.length)//size小端序
        const partialhash = '00'
        const suffixdata = lockingscript

        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[vout].satoshisBN);
        writer.write(getLengthHex(suffixdata.length));//suffixdata为完整锁定脚本
        writer.write(suffixdata);
        writer.write(Buffer.from(partialhash, 'hex'));//partialhash为空
        writer.write(getLengthHex(size.length));
        writer.write(size);
    }

    writer.write(Buffer.from(outputs2length, 'hex'));
    writer.write(Buffer.from(outputs2, 'hex'));
    writer.write(Buffer.from('52', 'hex'));
    
    const inputstxdata = writer.toBuffer().toString('hex');

    return `${inputstxdata}`;
}

function getInputsTxdataSwap(tx: tbc.Transaction, vout: number): string {
    const writer = new tbc.encoding.BufferWriter();
    writer.write(Buffer.from(vliolength, 'hex'));
    writer.writeUInt32LE(version);
    writer.writeUInt32LE(tx.nLockTime);
    writer.writeInt32LE(tx.inputs.length);
    writer.writeInt32LE(tx.outputs.length);

    const inputWriter = new tbc.encoding.BufferWriter();
    const inputWriter2 = new tbc.encoding.BufferWriter();
    for (const input of tx.inputs) {
        inputWriter.writeReverse(input.prevTxId);
        inputWriter.writeUInt32LE(input.outputIndex);
        inputWriter.writeUInt32LE(input.sequenceNumber);
        inputWriter2.write(tbc.crypto.Hash.sha256(input.script.toBuffer()));
    }
    writer.write(Buffer.from(hashlength, 'hex'));
    writer.write(tbc.crypto.Hash.sha256(inputWriter.toBuffer()));
    writer.write(Buffer.from(hashlength, 'hex'));
    writer.write(tbc.crypto.Hash.sha256(inputWriter2.toBuffer()));

    const lockingscript = tx.outputs[vout].script.toBuffer()
    if(lockingscript.length == 1564){
        const { outputs1, outputs1length, outputs2, outputs2length } = getInputsTxOutputsData(tx, vout,true);
        writer.write(Buffer.from(outputs1length, 'hex'));
        writer.write(Buffer.from(outputs1, 'hex'));

        const size = getSize(lockingscript.length)//size小端序
        const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536))
        const suffixdata = lockingscript.subarray(1536)
        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[vout].satoshisBN);
        writer.write(getLengthHex(suffixdata.length));//suffixdata
        writer.write(suffixdata);
        writer.write(Buffer.from(hashlength, 'hex'));//partialhash
        writer.write(Buffer.from(partialhash, 'hex'));
        writer.write(getLengthHex(size.length));
        writer.write(size);
        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[vout + 1].satoshisBN);
        writer.write(getLengthHex(tx.outputs[vout + 1].script.toBuffer().length));
        writer.write(tx.outputs[vout + 1].script.toBuffer());

        writer.write(Buffer.from(outputs2length, 'hex'));
        writer.write(Buffer.from(outputs2, 'hex'));
    }
    else{
        const { outputs1, outputs1length, outputs2, outputs2length } = getInputsTxOutputsData(tx, vout);
        writer.write(Buffer.from(outputs1length, 'hex'));
        writer.write(Buffer.from(outputs1, 'hex'));

        const size = getSize(lockingscript.length)//size小端序
        const partialhash = '00'
        const suffixdata = lockingscript
        writer.write(Buffer.from(amountlength, 'hex'));
        writer.writeUInt64LEBN(tx.outputs[vout].satoshisBN);
        writer.write(getLengthHex(suffixdata.length));//suffixdata为完整锁定脚本
        writer.write(suffixdata);
        writer.write(Buffer.from(partialhash, 'hex'));//partialhash为空
        writer.write(getLengthHex(size.length));
        writer.write(size);

        writer.write(Buffer.from(outputs2length, 'hex'));
        writer.write(Buffer.from(outputs2, 'hex'));
    }
    writer.write(Buffer.from('52', 'hex'));
    
    const inputstxdata = writer.toBuffer().toString('hex');

    return `${inputstxdata}`;
}

function getCurrentInputsdata(tx: tbc.Transaction): string {
    const writer = new tbc.encoding.BufferWriter();
    const inputWriter = new tbc.encoding.BufferWriter();
    for (const input of tx.inputs) {
        inputWriter.writeReverse(input.prevTxId);
        inputWriter.writeUInt32LE(input.outputIndex);
        inputWriter.writeUInt32LE(input.sequenceNumber);
    }
    writer.write(getLengthHex(inputWriter.toBuffer().length));
    writer.write(inputWriter.toBuffer());
    const currentinputsdata = writer.toBuffer().toString('hex');
    return `${currentinputsdata}`
}

function getCurrentTxOutputsdata(tx: tbc.Transaction, option: number, swapOption?: number): string {
    const writer = new tbc.encoding.BufferWriter();
    let lockingscript = tx.outputs[2].script.toBuffer()//FTAbyC code部分
    let size = getSize(lockingscript.length)
    let partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536))
    let suffixdata = lockingscript.subarray(1536)
    switch (option) {
        //添加流动性
        case 1:
            //poolnft输出
            writer.write(Buffer.from(amountlength, 'hex'));//poolnftcodehash
            writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
            writer.write(Buffer.from(hashlength, 'hex'));
            writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
            writer.write(Buffer.from(amountlength, 'hex'));//poolnfttape
            writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
            writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length))
            writer.write(tx.outputs[1].script.toBuffer());

            //FTAbyC输出
            lockingscript = tx.outputs[2].script.toBuffer()//FTAbyC code部分
            size = getSize(lockingscript.length)
            partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536))
            suffixdata = lockingscript.subarray(1536)
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(tx.outputs[2].satoshisBN);
            writer.write(getLengthHex(suffixdata.length));//suffixdata
            writer.write(suffixdata);
            writer.write(Buffer.from(hashlength, 'hex'));//partialhash
            writer.write(Buffer.from(partialhash, 'hex'));
            writer.write(getLengthHex(size.length));
            writer.write(size);
            writer.write(Buffer.from(amountlength, 'hex'));//FTAbyC tape部分
            writer.writeUInt64LEBN(tx.outputs[3].satoshisBN);
            writer.write(getLengthHex(tx.outputs[3].script.toBuffer().length))
            writer.write(tx.outputs[3].script.toBuffer());

            //FT-LP输出
            lockingscript = tx.outputs[4].script.toBuffer()//FT-LP code部分
            size = getSize(lockingscript.length)
            //之后要修改部分，根据FT-LP的设计
            partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536))
            suffixdata = lockingscript.subarray(1536)
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(tx.outputs[4].satoshisBN);
            writer.write(getLengthHex(suffixdata.length));//suffixdata
            writer.write(suffixdata);
            writer.write(Buffer.from(hashlength, 'hex'));//partialhash
            writer.write(Buffer.from(partialhash, 'hex'));
            writer.write(getLengthHex(size.length));
            writer.write(size);
            writer.write(Buffer.from(amountlength, 'hex'));//FT-LP tape部分
            writer.writeUInt64LEBN(tx.outputs[5].satoshisBN);
            writer.write(getLengthHex(tx.outputs[5].script.toBuffer().length))
            writer.write(tx.outputs[5].script.toBuffer());

            //可能的FTAbyA找零、普通P2PKH找零输出，要求若两者均存在，FTAbyA找零在前
            switch (tx.outputs.length) {
                //无任何找零
                case 6:
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from('00', 'hex'));
                    break;
                //只有普通找零
                case 7:
                    const lockingscript = tx.outputs[6].script.toBuffer();
                    const size = getSize(lockingscript.length); // size小端序
                    const partialhash = '00';
                    const suffixdata = lockingscript;
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from(amountlength, 'hex'));
                    writer.writeUInt64LEBN(tx.outputs[6].satoshisBN);
                    writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                    writer.write(suffixdata);
                    writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                    writer.write(getLengthHex(size.length));
                    writer.write(size);
                    break;
                //只有FTAbyA找零
                case 8:
                    for (let i = 6; i < tx.outputs.length; i++) {
                        const lockingscript = tx.outputs[i].script.toBuffer();
                        const size = getSize(lockingscript.length); // size小端序
                        const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                        const suffixdata = lockingscript.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata
                        writer.write(suffixdata);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash, 'hex'));
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                        writer.write(tx.outputs[i + 1].script.toBuffer());
                        writer.write(Buffer.from('00', 'hex'));
                        i++;
                    }
                    break;
                //同时存在FTAbyA找零和普通找零
                case 9:
                    for (let i = 6; i < tx.outputs.length; i++) {
                        const lockingscript = tx.outputs[i].script.toBuffer();
                        if (lockingscript.length == 1564) {
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                            const suffixdata = lockingscript.subarray(1536);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata
                            writer.write(suffixdata);
                            writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                            writer.write(Buffer.from(partialhash, 'hex'));
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                            writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                            writer.write(tx.outputs[i + 1].script.toBuffer());
                            i++;
                        } else {
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = '00';
                            const suffixdata = lockingscript;
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                            writer.write(suffixdata);
                            writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                        }
                    }
                    break;
                default:
                    throw new Error('Invalid transaction');
            }
            break;
        //LP换Tokens
        case 2:
            //poolnft输出
            writer.write(Buffer.from(amountlength, 'hex'));//poolnftcodehash
            writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
            writer.write(Buffer.from(hashlength, 'hex'));
            writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
            writer.write(Buffer.from(amountlength, 'hex'));//poolnfttape
            writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
            writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length))
            writer.write(tx.outputs[1].script.toBuffer());
            for (let i = 2; i < 7; i++) {
                const lockingscript = tx.outputs[i].script.toBuffer();
                if (lockingscript.length == 1564) {
                    const size = getSize(lockingscript.length); // size小端序
                    const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                    const suffixdata = lockingscript.subarray(1536);
    
                    writer.write(Buffer.from(amountlength, 'hex'));
                    writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                    writer.write(getLengthHex(suffixdata.length)); // suffixdata
                    writer.write(suffixdata);
                    writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                    writer.write(Buffer.from(partialhash, 'hex'));
                    writer.write(getLengthHex(size.length));
                    writer.write(size);
    
                    writer.write(Buffer.from(amountlength, 'hex'));
                    writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                    writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                    writer.write(tx.outputs[i + 1].script.toBuffer());
                    i++;
                } else {
                    const size = getSize(lockingscript.length); // size小端序
                    const partialhash = '00';
                    const suffixdata = lockingscript;
    
                    writer.write(Buffer.from(amountlength, 'hex'));
                    writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                    writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                    writer.write(suffixdata);
                    writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                    writer.write(getLengthHex(size.length));
                    writer.write(size);
                }
            }
            //可能的FT-LP找零、FTAbyC找零、普通P2PKH找零输出，要求顺序保持一致
            switch (tx.outputs.length) {
                //无任何找零
                case 7:
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from('00', 'hex'));
                    break;
                //只有普通找零
                case 8:
                    lockingscript = tx.outputs[7].script.toBuffer();
                    size = getSize(lockingscript.length); // size小端序
                    partialhash = '00';
                    suffixdata = lockingscript;
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from('00', 'hex'));
                    writer.write(Buffer.from(amountlength, 'hex'));
                    writer.writeUInt64LEBN(tx.outputs[7].satoshisBN);
                    writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                    writer.write(suffixdata);
                    writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                    writer.write(getLengthHex(size.length));
                    writer.write(size);
                    break;
                //可能的FT-PL或FTAbyC找零
                case 9:
                    lockingscript = tx.outputs[7].script.toBuffer();
                    if(lockingscript.subarray(1404, 1409).toString('hex') === 'ffffffffff') {
                        const size = getSize(lockingscript.length); // size小端序
                        const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                        const suffixdata = lockingscript.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[7].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata
                        writer.write(suffixdata);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash, 'hex'));
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[8].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[8].script.toBuffer().length));
                        writer.write(tx.outputs[8].script.toBuffer());
                        writer.write(Buffer.from('00', 'hex'));
                        writer.write(Buffer.from('00', 'hex'));
                    }
                    else {
                        writer.write(Buffer.from('00', 'hex'));
                        const size = getSize(lockingscript.length); // size小端序
                        const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                        const suffixdata = lockingscript.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[7].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata
                        writer.write(suffixdata);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash, 'hex'));
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[8].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[8].script.toBuffer().length));
                        writer.write(tx.outputs[8].script.toBuffer());
                        writer.write(Buffer.from('00', 'hex'));
                    }
                    break;
                //可能的FT-PL或FTAbyC找零 + 普通找零
                case 10:
                    lockingscript = tx.outputs[7].script.toBuffer();
                    if(lockingscript.subarray(1404, 1409).toString('hex') === 'ffffffffff') {
                        size = getSize(lockingscript.length); // size小端序
                        partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                        suffixdata = lockingscript.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[7].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata
                        writer.write(suffixdata);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash, 'hex'));
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[8].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[8].script.toBuffer().length));
                        writer.write(tx.outputs[8].script.toBuffer());
                        writer.write(Buffer.from('00', 'hex'));
                        lockingscript = tx.outputs[9].script.toBuffer();
                        size = getSize(lockingscript.length); // size小端序
                        partialhash = '00';
                        suffixdata = lockingscript;
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[9].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                        writer.write(suffixdata);
                        writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                    }
                    else {
                        writer.write(Buffer.from('00', 'hex'));
                        size = getSize(lockingscript.length); // size小端序
                        partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                        suffixdata = lockingscript.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[7].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata
                        writer.write(suffixdata);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash, 'hex'));
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[8].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[8].script.toBuffer().length));
                        writer.write(tx.outputs[8].script.toBuffer());
                        lockingscript = tx.outputs[9].script.toBuffer();
                        size = getSize(lockingscript.length); // size小端序
                        partialhash = '00';
                        suffixdata = lockingscript;
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[9].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                        writer.write(suffixdata);
                        writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                    }
                    break;
                    //只有FT-PL、FTAbyC找零
                    case 11:
                        for (let i = 7; i < tx.outputs.length; i++) {
                            const lockingscript = tx.outputs[i].script.toBuffer();
                            if (lockingscript.length == 1564) {
                                const size = getSize(lockingscript.length); // size小端序
                                const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                                const suffixdata = lockingscript.subarray(1536);
                                writer.write(Buffer.from(amountlength, 'hex'));
                                writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                                writer.write(getLengthHex(suffixdata.length)); // suffixdata
                                writer.write(suffixdata);
                                writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                                writer.write(Buffer.from(partialhash, 'hex'));
                                writer.write(getLengthHex(size.length));
                                writer.write(size);
                                writer.write(Buffer.from(amountlength, 'hex'));
                                writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                                writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                                writer.write(tx.outputs[i + 1].script.toBuffer());
                                i++;
                            } else {
                                const size = getSize(lockingscript.length); // size小端序
                                const partialhash = '00';
                                const suffixdata = lockingscript;
                                writer.write(Buffer.from(amountlength, 'hex'));
                                writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                                writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                                writer.write(suffixdata);
                                writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                                writer.write(getLengthHex(size.length));
                                writer.write(size);
                            }
                        }
                        writer.write(Buffer.from('00', 'hex'));
                        break;
                //完整输出
                case 12:
                    for (let i = 7; i < tx.outputs.length; i++) {
                        const lockingscript = tx.outputs[i].script.toBuffer();
                        if (lockingscript.length == 1564) {
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                            const suffixdata = lockingscript.subarray(1536);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata
                            writer.write(suffixdata);
                            writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                            writer.write(Buffer.from(partialhash, 'hex'));
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                            writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                            writer.write(tx.outputs[i + 1].script.toBuffer());
                            i++;
                        } else {
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = '00';
                            const suffixdata = lockingscript;
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                            writer.write(suffixdata);
                            writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                        }
                    }
                    break;
                default:
                    throw new Error('Invalid transaction');
            }
            break;
        case 3:
            switch (swapOption) {
                //TBC换Tokens
                case 1:
                    //poolnft输出
                    writer.write(Buffer.from(amountlength, 'hex'));//poolnftcodehash
                    writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
                    writer.write(Buffer.from(hashlength, 'hex'));
                    writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
                    writer.write(Buffer.from(amountlength, 'hex'));//poolnfttape
                    writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
                    writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length))
                    writer.write(tx.outputs[1].script.toBuffer());
                    //FTAbyA、FTAbyC输出
                    for (let i = 2; i < 6; i++) {
                        const lockingscript = tx.outputs[i].script.toBuffer();
                        const size = getSize(lockingscript.length); // size小端序
                        const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                        const suffixdata = lockingscript.subarray(1536);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata
                        writer.write(suffixdata);
                        writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                        writer.write(Buffer.from(partialhash, 'hex'));
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                        writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                        writer.write(tx.outputs[i + 1].script.toBuffer());
                        i++;
                    }
                    //若有普通找零
                    if (tx.outputs.length == 7) {
                        const lockingscript = tx.outputs[6].script.toBuffer();
                        const size = getSize(lockingscript.length); // size小端序
                        const partialhash = '00';
                        const suffixdata = lockingscript;
                        writer.write(Buffer.from(amountlength, 'hex'));
                        writer.writeUInt64LEBN(tx.outputs[6].satoshisBN);
                        writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                        writer.write(suffixdata);
                        writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                        writer.write(getLengthHex(size.length));
                        writer.write(size);
                    } else {
                        writer.write(Buffer.from('00', 'hex'));
                    }
                    break;
                //Tokens换TBC
                case 2:
                    //poolnft输出
                    writer.write(Buffer.from(amountlength, 'hex'));//poolnftcodehash
                    writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
                    writer.write(Buffer.from(hashlength, 'hex'));
                    writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
                    writer.write(Buffer.from(amountlength, 'hex'));//poolnfttape
                    writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
                    writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length))
                    writer.write(tx.outputs[1].script.toBuffer());
                    for (let i = 2; i < 5; i++) {
                        const lockingscript = tx.outputs[i].script.toBuffer();
                        if (lockingscript.length == 1564) {
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                            const suffixdata = lockingscript.subarray(1536);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata
                            writer.write(suffixdata);
                            writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                            writer.write(Buffer.from(partialhash, 'hex'));
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                            writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                            writer.write(tx.outputs[i + 1].script.toBuffer());
                            i++;
                        } else {
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = '00';
                            const suffixdata = lockingscript;
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                            writer.write(suffixdata);
                            writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                        }
                    }
                    switch (tx.outputs.length) {
                        //只有普通找零
                        case 6:
                            writer.write(Buffer.from('00', 'hex'));
                            const lockingscript = tx.outputs[5].script.toBuffer();
                            const size = getSize(lockingscript.length); // size小端序
                            const partialhash = '00';
                            const suffixdata = lockingscript;
                            writer.write(Buffer.from(amountlength, 'hex'));
                            writer.writeUInt64LEBN(tx.outputs[5].satoshisBN);
                            writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                            writer.write(suffixdata);
                            writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                            writer.write(getLengthHex(size.length));
                            writer.write(size);
                            break;
                        //只有FTAbyA找零
                        case 7:
                            for (let i = 5; i < tx.outputs.length; i++) {
                                const lockingscript = tx.outputs[i].script.toBuffer();
                                const size = getSize(lockingscript.length); // size小端序
                                const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                                const suffixdata = lockingscript.subarray(1536);
                                writer.write(Buffer.from(amountlength, 'hex'));
                                writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                                writer.write(getLengthHex(suffixdata.length)); // suffixdata
                                writer.write(suffixdata);
                                writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                                writer.write(Buffer.from(partialhash, 'hex'));
                                writer.write(getLengthHex(size.length));
                                writer.write(size);
                                writer.write(Buffer.from(amountlength, 'hex'));
                                writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                                writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                                writer.write(tx.outputs[i + 1].script.toBuffer());
                                i++;
                            }
                            writer.write(Buffer.from('00', 'hex'));
                            break;
                        //完整输出
                        case 8:
                            for (let i = 5; i < tx.outputs.length; i++) {
                                const lockingscript = tx.outputs[i].script.toBuffer();
                                if (lockingscript.length == 1564) {
                                    const size = getSize(lockingscript.length); // size小端序
                                    const partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536));
                                    const suffixdata = lockingscript.subarray(1536);
                                    writer.write(Buffer.from(amountlength, 'hex'));
                                    writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                                    writer.write(getLengthHex(suffixdata.length)); // suffixdata
                                    writer.write(suffixdata);
                                    writer.write(Buffer.from(hashlength, 'hex')); // partialhash
                                    writer.write(Buffer.from(partialhash, 'hex'));
                                    writer.write(getLengthHex(size.length));
                                    writer.write(size);
                                    writer.write(Buffer.from(amountlength, 'hex'));
                                    writer.writeUInt64LEBN(tx.outputs[i + 1].satoshisBN);
                                    writer.write(getLengthHex(tx.outputs[i + 1].script.toBuffer().length));
                                    writer.write(tx.outputs[i + 1].script.toBuffer());
                                    i++;
                                } else {
                                    const size = getSize(lockingscript.length); // size小端序
                                    const partialhash = '00';
                                    const suffixdata = lockingscript;
                                    writer.write(Buffer.from(amountlength, 'hex'));
                                    writer.writeUInt64LEBN(tx.outputs[i].satoshisBN);
                                    writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
                                    writer.write(suffixdata);
                                    writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
                                    writer.write(getLengthHex(size.length));
                                    writer.write(size);
                                }
                            }
                            break;
                    }
                    break;
            }
            break;
        case 4:
            //poolnft输出
            writer.write(Buffer.from(amountlength, 'hex'));//poolnftcodehash
            writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
            writer.write(Buffer.from(hashlength, 'hex'));
            writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
            writer.write(Buffer.from(amountlength, 'hex'));//poolnfttape
            writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
            writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length))
            writer.write(tx.outputs[1].script.toBuffer());

            //FTAbyC输出
            lockingscript = tx.outputs[2].script.toBuffer()//FTAbyC code部分
            size = getSize(lockingscript.length)
            partialhash = partial_sha256.calculate_partial_hash(lockingscript.subarray(0, 1536))
            suffixdata = lockingscript.subarray(1536)
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(tx.outputs[2].satoshisBN);
            writer.write(getLengthHex(suffixdata.length));//suffixdata
            writer.write(suffixdata);
            writer.write(Buffer.from(hashlength, 'hex'));//partialhash
            writer.write(Buffer.from(partialhash, 'hex'));
            writer.write(getLengthHex(size.length));
            writer.write(size);
            writer.write(Buffer.from(amountlength, 'hex'));//FTAbyC tape部分
            writer.writeUInt64LEBN(tx.outputs[3].satoshisBN);
            writer.write(getLengthHex(tx.outputs[3].script.toBuffer().length))
            writer.write(tx.outputs[3].script.toBuffer());

            //普通找零
            lockingscript = tx.outputs[4].script.toBuffer();
            size = getSize(lockingscript.length); // size小端序
            partialhash = '00';
            suffixdata = lockingscript;
            writer.write(Buffer.from(amountlength, 'hex'));
            writer.writeUInt64LEBN(tx.outputs[4].satoshisBN);
            writer.write(getLengthHex(suffixdata.length)); // suffixdata为完整锁定脚本
            writer.write(suffixdata);
            writer.write(Buffer.from(partialhash, 'hex')); // partialhash为空
            writer.write(getLengthHex(size.length));
            writer.write(size);
    }
    const currenttxoutputsdata = writer.toBuffer().toString('hex');
    return `${currenttxoutputsdata}`;
}

function getPoolNFTPreTxdata(tx: tbc.Transaction): string {
    const writer = new tbc.encoding.BufferWriter();
    writer.write(Buffer.from(vliolength, 'hex'));
    writer.writeUInt32LE(version);
    writer.writeUInt32LE(tx.nLockTime);
    writer.writeInt32LE(tx.inputs.length);
    writer.writeInt32LE(tx.outputs.length);
   
    const inputWriter = new tbc.encoding.BufferWriter();
    const inputWriter2 = new tbc.encoding.BufferWriter();
    for (const input of tx.inputs) {
        inputWriter.writeReverse(input.prevTxId);
        inputWriter.writeUInt32LE(input.outputIndex);
        inputWriter.writeUInt32LE(input.sequenceNumber);
        inputWriter2.write(tbc.crypto.Hash.sha256(input.script.toBuffer()));
    }
    writer.write(getLengthHex(inputWriter.toBuffer().length));
    writer.write(inputWriter.toBuffer());
    writer.write(Buffer.from(hashlength, 'hex'));
    writer.write(tbc.crypto.Hash.sha256(inputWriter2.toBuffer()));
    writer.write(Buffer.from(amountlength, 'hex'));
    writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
    writer.write(Buffer.from(hashlength, 'hex'));
    writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
    writer.write(Buffer.from(amountlength, 'hex'));
    writer.writeUInt64LEBN(tx.outputs[1].satoshisBN);
    writer.write(getLengthHex(tx.outputs[1].script.toBuffer().length));
    writer.write(tx.outputs[1].script.toBuffer());
    writer.write(Buffer.from(getOutputsData(tx,2), 'hex'));
    return writer.toBuffer().toString('hex');
}

function getPoolNFTPrePreTxdata(tx: tbc.Transaction): string {
    const writer = new tbc.encoding.BufferWriter();
    writer.write(Buffer.from(vliolength, 'hex'));
    writer.writeUInt32LE(version);
    writer.writeUInt32LE(tx.nLockTime);
    writer.writeInt32LE(tx.inputs.length);
    writer.writeInt32LE(tx.outputs.length);
   
    const inputWriter = new tbc.encoding.BufferWriter();
    const inputWriter2 = new tbc.encoding.BufferWriter();
    for (const input of tx.inputs) {
        inputWriter.writeReverse(input.prevTxId);
        inputWriter.writeUInt32LE(input.outputIndex);
        inputWriter.writeUInt32LE(input.sequenceNumber);
        inputWriter2.write(tbc.crypto.Hash.sha256(input.script.toBuffer()));
    }
    writer.write(Buffer.from(hashlength, 'hex'));
    writer.write(tbc.crypto.Hash.sha256(inputWriter.toBuffer()));
    writer.write(Buffer.from(hashlength, 'hex'));
    writer.write(tbc.crypto.Hash.sha256(inputWriter2.toBuffer()));
    writer.write(Buffer.from(amountlength, 'hex'));
    writer.writeUInt64LEBN(tx.outputs[0].satoshisBN);
    writer.write(Buffer.from(hashlength, 'hex'));
    writer.write(tbc.crypto.Hash.sha256(tx.outputs[0].script.toBuffer()));
    writer.write(Buffer.from(getOutputsData(tx,1), 'hex'));
    return writer.toBuffer().toString('hex');
}

function getOutputsData(tx: tbc.Transaction, index: number) {

    let outputs = '';
    let outputslength = '';

    const outputWriter = new tbc.encoding.BufferWriter();
    for (let i = index; i < tx.outputs.length; i++) {
        outputWriter.writeUInt64LEBN(tx.outputs[i].satoshisBN);
        outputWriter.write(tbc.crypto.Hash.sha256(tx.outputs[i].script.toBuffer()));
    }
    outputs = outputWriter.toBuffer().toString('hex'); 

    if (outputs === '') {
        outputs = '00';
        outputslength = '';
    } else {
        outputslength = getLengthHex(outputs.length / 2).toString('hex');
    }

    return outputslength + outputs;
}

function getInputsTxOutputsData(tx: tbc.Transaction, vout: number, isTape: boolean = false) {
    let offset = 0;
    if (isTape) {
        offset = 2;
    } else {
        offset = 1;
    }
    let outputs1 = ''; // outputs前部分
    let outputs1length = '';
    let outputs2 = ''; // outputs剩余部分
    let outputs2length = '';

    if (vout === 0) {
        outputs1 = '00';
        outputs1length = '';
    } else {
        const outputWriter1 = new tbc.encoding.BufferWriter();
        for (let i = 0; i < vout; i++) {
            outputWriter1.writeUInt64LEBN(tx.outputs[i].satoshisBN);
            outputWriter1.write(tbc.crypto.Hash.sha256(tx.outputs[i].script.toBuffer()));
        }
        outputs1 = outputWriter1.toBuffer().toString('hex'); // outputs前部分
        outputs1length = getLengthHex(outputs1.length / 2).toString('hex');
    }

    const outputWriter2 = new tbc.encoding.BufferWriter();
    for (let i = vout + offset; i < tx.outputs.length; i++) {//爷交易outputs2从vout+1开始
        outputWriter2.writeUInt64LEBN(tx.outputs[i].satoshisBN);
        outputWriter2.write(tbc.crypto.Hash.sha256(tx.outputs[i].script.toBuffer()));
    }
    outputs2 = outputWriter2.toBuffer().toString('hex'); // outputs剩余部分

    if (outputs2 === '') {
        outputs2 = '00';
        outputs2length = '';
    } else {
        outputs2length = getLengthHex(outputs2.length / 2).toString('hex');
    }

    return { outputs1, outputs1length, outputs2, outputs2length };
}

//计算交易某些数据长度，根据长度添加OP_PUSHDATA1或OP_PUSHDATA2
function getLengthHex(length: number): Buffer {
    if (length < 76) {
        return Buffer.from(length.toString(16).padStart(2, '0'), 'hex');
    } else if (length > 75 && length < 256) {
        return Buffer.concat([Buffer.from('4c', 'hex') , Buffer.from(length.toString(16), 'hex')]);
    } else {
        return Buffer.concat([Buffer.from('4d', 'hex') , Buffer.from(length.toString(16).padStart(4, '0'), 'hex').reverse()]);
    }
}

function getSize(length: number): Buffer {
    if (length < 256) {
        return Buffer.from(length.toString(16).padStart(2, '0'), 'hex');
    } 
    else {
        return Buffer.from(length.toString(16).padStart(4, '0'), 'hex').reverse();
    }
}

export default poolNFT;
