import * as tbc from 'tbc-lib-js';
import { TBC20 } from './tbc20';
import { FTLPTBC20 } from './ftlpTbc20';
import { buildFTLPUnlockScriptWithSignature } from '../util/ftlpTbc20unlock';
import {
  buildTBC20UnlockScriptWithSignature,
  getTBC20CodeIdentity,
  getTBC20Controller,
  replaceTBC20TapeAmounts,
} from '../util/tbc20unlock';
import {
  assertPoolControllerPublicKey,
  normalizePoolAuthorization,
} from '../util/poolnft3/authorization';
import {
  assertPoolFtTapeSize,
  instantiatePoolCode,
  parsePoolCode,
} from '../util/poolnft3/artifacts';
import {
  assertPoolAmount,
  decodePoolTape,
  encodePoolTape,
  replacePoolTapeAmounts,
} from '../util/poolnft3/tape';
import { deriveFeeRecipient, resolveSwapFeePolicy } from '../util/poolnft3/fees';
import {
  POOL3_CODE_DUST,
  quoteAddLP,
  quoteRemoveLP,
  quoteSwapFT,
  quoteSwapTBC,
} from '../util/poolnft3/math';
import { buildPoolUnlockScript } from '../util/poolnft3/witness';
import {
  addPool3Output,
  p2pkhInputPlan,
  pool3Fail,
  PreparedPool3Transaction,
  publicKeyBytes,
  referenceOutput,
} from '../util/poolnft3/transaction';
import type { TBC20CurrentOutputGroup } from '../util/tbc20unlock';
import type {
  Pool3InputPlan,
  Pool3Signature,
  Pool3TransactionResult,
  Pool3SigningRequest,
  Pool3SignedInput,
} from '../util/poolnft3/transaction';
import type {
  PoolNFT3Config,
  Pool3AddLPAmount,
  Pool3AddLPOptions,
  Pool3RemoveLPOptions,
  Pool3SwapFTOptions,
  Pool3SwapTBCOptions,
  Pool3TransferLPOptions,
  Pool3UnlockLPOptions,
  Pool3MintOptions,
  Pool3OperationOptions,
  Pool3AssetInput,
  Pool3AssetOutput,
  Pool3BuildResult,
  Pool3Layout,
  Pool3MintResult,
  Pool3State,
} from '../util/poolnft3/types';

export type Pool3Quote =
  | ReturnType<typeof quoteAddLP>
  | ReturnType<typeof quoteRemoveLP>
  | ReturnType<typeof quoteSwapFT>
  | ReturnType<typeof quoteSwapTBC>;
const sha = (data: Buffer): Buffer => tbc.crypto.Hash.sha256(data);
const h160 = (data: Buffer): Buffer => tbc.crypto.Hash.sha256ripemd160(data);
const ZERO_SLOTS = [0n, 0n, 0n, 0n, 0n, 0n] as const;
const BURN_CONTROLLER = Buffer.from('759d6677091e973b9e9d99f19c68fbf43e3f05f900', 'hex');
const slots = (entries: readonly (readonly [number, bigint])[]): bigint[] => {
  const amounts = [...ZERO_SLOTS] as bigint[];
  for (const [index, amount] of entries) {
    assertPoolAmount(amount, 'amount slot');
    amounts[index] = amount;
  }
  return amounts;
};
const signerAddress = (input: Pool3SignedInput): string =>
  tbc.PublicKey.fromBuffer(publicKeyBytes(input.signer.publicKey)).toAddress().toString();
const ownerController = (address: string): Buffer => TBC20.addressController(address);
const cloneTransaction = (tx: tbc.Transaction): tbc.Transaction =>
  new tbc.Transaction(tx.uncheckedSerialize());
function copyDetails<T>(value: T): T {
  if (Buffer.isBuffer(value)) return Buffer.from(value) as T;
  if (Array.isArray(value)) return value.map((item) => copyDetails(item)) as T;
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, copyDetails(item)])
    ) as T;
  return value;
}

export class PreparedPool3Operation {
  private readonly layoutValue: Pool3Layout;
  private readonly quoteValue: Pool3Quote | undefined;
  constructor(
    private readonly prepared: PreparedPool3Transaction,
    layout: Pool3Layout,
    quote: Pool3Quote | undefined,
    private readonly readState?: (tx: tbc.Transaction) => Pool3State
  ) {
    this.layoutValue = copyDetails(layout);
    this.quoteValue = copyDetails(quote);
  }
  get layout(): Pool3Layout {
    return copyDetails(this.layoutValue);
  }
  get quote(): Pool3Quote | undefined {
    return copyDetails(this.quoteValue);
  }
  get transaction(): tbc.Transaction {
    return this.prepared.transaction;
  }
  get signingRequests(): readonly Pool3SigningRequest[] {
    return this.prepared.signingRequests;
  }
  get feeSat(): bigint {
    return this.prepared.feeSat;
  }
  get changeVout(): number | undefined {
    return this.prepared.changeVout;
  }
  private result(result: Pool3TransactionResult): Pool3BuildResult {
    return {
      ...result,
      layout: this.layout,
      quote: this.quote,
      nextState: this.readState?.(result.transaction),
    };
  }
  finalize(signatures: readonly Pool3Signature[]): Pool3BuildResult {
    return this.result(this.prepared.finalize(signatures));
  }
  async sign(): Promise<Pool3BuildResult> {
    return this.result(await this.prepared.sign());
  }
}

/** Immutable pool configuration; each operation explicitly consumes a fresh Pool snapshot. */
export class PoolNFT3 {
  private readonly ftGenesis: tbc.Transaction;
  private readonly ftCode: tbc.Script;
  private readonly ftTape: tbc.Script;
  private readonly ftIdentity: Buffer;
  private readonly config: Required<Omit<PoolNFT3Config, 'ftGenesisTx' | 'serviceFeeRate'>>;
  private readonly feePolicy: ReturnType<typeof resolveSwapFeePolicy>;
  private readonly feeRecipient: ReturnType<typeof deriveFeeRecipient>;
  readonly tapeSize: number;

  constructor(options: PoolNFT3Config) {
    if (!options || !(options.ftGenesisTx instanceof tbc.Transaction))
      pool3Fail('ftGenesisTx is required');
    this.ftGenesis = cloneTransaction(options.ftGenesisTx);
    if (
      this.ftGenesis.inputs.length !== 1 ||
      this.ftGenesis.outputs.length < 2 ||
      this.ftGenesis.outputs.length > 3
    )
      pool3Fail('expected canonical TBC20 genesis Code/Tape at vout 0/1');
    const root = { parentTx: this.ftGenesis, outputIndex: 0 };
    this.ftCode = referenceOutput(root).script;
    this.ftTape = this.ftGenesis.outputs[1].script;
    if (this.ftGenesis.outputs[0].satoshis !== 500 || this.ftGenesis.outputs[1].satoshis !== 0)
      pool3Fail('FT genesis Code/Tape must be 500/0 sat');
    const tape = TBC20.parseTape(this.ftTape);
    this.tapeSize = tape.size;
    TBC20.validateCode(this.ftCode, this.tapeSize);
    const input = this.ftGenesis.inputs[0];
    const expectedCode = TBC20.instantiateCode({
      originalUTXO: { txId: input.prevTxId.toString('hex'), outputIndex: input.outputIndex },
      tapeSize: this.tapeSize,
      controller: getTBC20Controller(this.ftCode),
    });
    if (!expectedCode.toBuffer().equals(this.ftCode.toBuffer()))
      pool3Fail('FT reference is not its genesis transaction');
    if (tape.amounts[0] <= 0n || tape.amounts.slice(1).some((a) => a !== 0n))
      pool3Fail('invalid canonical FT genesis amounts');
    const lp = options.lp ?? { kind: 'plain' as const };
    if (lp.kind !== 'plain' && lp.kind !== 'timelocked') pool3Fail('unsupported LP kind');
    assertPoolFtTapeSize(this.tapeSize, lp.kind === 'timelocked');
    this.feePolicy = resolveSwapFeePolicy(options.lpPlan, options.serviceFeeRate);
    this.feeRecipient = deriveFeeRecipient(this.feePolicy.serviceFeeAddress);
    this.config = {
      authorization: normalizePoolAuthorization(options.authorization ?? { kind: 'public' }),
      lp: Object.freeze({ kind: lp.kind }),
      lpPlan: this.feePolicy.lpPlan,
    };
    this.ftIdentity = getTBC20CodeIdentity(this.ftCode);
  }

  static fromPool(poolTx: tbc.Transaction, ftGenesisTx: tbc.Transaction): PoolNFT3 {
    const code = parsePoolCode(poolTx.outputs[0].script);
    const tape = decodePoolTape(poolTx.outputs[1].script.toBuffer());
    const instance = new PoolNFT3({
      ftGenesisTx,
      authorization: code.authorization,
      lp: { kind: tape.withLpLocktime ? 'timelocked' : 'plain' },
      lpPlan: tape.lpPlan,
      serviceFeeRate: tape.serviceFeeRate,
    });
    instance.readPoolState(poolTx);
    return instance;
  }

  readPoolState(poolTx: tbc.Transaction): Pool3State {
    const code = referenceOutput({ parentTx: poolTx, outputIndex: 0 });
    if (poolTx.outputs.length < 2 || poolTx.outputs[1].satoshis !== 0)
      pool3Fail('Pool Tape must follow Code with zero satoshis');
    const parsed = parsePoolCode(code.script);
    const tape = decodePoolTape(poolTx.outputs[1].script.toBuffer());
    if (
      parsed.ftTapeSize !== this.tapeSize ||
      tape.ftAContractId !== this.ftGenesis.id ||
      tape.lpPlan !== this.feePolicy.lpPlan ||
      tape.serviceFeeRate !== this.feePolicy.totalFeeBps ||
      !parsed.tbcFeeScriptHash.equals(this.feeRecipient.feeScriptHash32)
    )
      pool3Fail('Pool FT identity, Tape size or fee configuration mismatch');
    if (
      JSON.stringify(parsed.authorization) !== JSON.stringify(this.config.authorization) ||
      tape.withSwapHashLock !== (parsed.authorization.kind === 'controller') ||
      tape.withLpHashLock !== (parsed.authorization.kind === 'controller') ||
      tape.withLpLocktime !== (this.config.lp.kind === 'timelocked')
    )
      pool3Fail('Pool flags or authorization do not match the trusted Code profile');
    if (
      !tape.ftAPartialHash.equals(this.ftIdentity.subarray(0, 32)) ||
      tape.ftACodeSize !== this.ftCode.toBuffer().length
    )
      pool3Fail('Pool underlying FT partial identity mismatch');
    const lp = this.makeLPCode(parsed.poolCodeHash, Buffer.alloc(21));
    const lpIdentity = FTLPTBC20.getCodeIdentity(lp);
    if (
      !tape.ftLpPartialHash.equals(lpIdentity.subarray(0, 32)) ||
      tape.ftLpCodeSize !== lp.toBuffer().length
    )
      pool3Fail('LP identity does not bind the final Pool Code');
    const poolValue = BigInt(code.satoshis);
    if (poolValue < POOL3_CODE_DUST) pool3Fail('Pool Code is below its reserve dust');
    const encodedValue = Buffer.alloc(8);
    encodedValue.writeBigUInt64LE(poolValue);
    const snapshotHash = sha(
      Buffer.concat([
        Buffer.from(poolTx.id, 'hex'),
        parsed.poolCodeHash,
        encodedValue,
        poolTx.outputs[1].script.toBuffer(),
      ])
    ).toString('hex');
    return {
      ftLpAmount: tape.ftLpAmount,
      ftAAmount: tape.ftAAmount,
      tbcAmount: tape.tbcAmount,
      poolValue,
      tape,
      poolCodeHash: parsed.poolCodeHash,
      codeScript: tbc.Script.fromBuffer(Buffer.from(code.script.toBuffer())),
      outpoint: { txId: poolTx.id, outputIndex: 0 },
      snapshotHash,
      controllerPubKeyHashes:
        parsed.authorization.kind === 'controller'
          ? parsed.authorization.controllerPubKeyHashes.slice()
          : [],
    };
  }

  quoteAddLP(
    poolTx: tbc.Transaction,
    incrementSat: bigint,
    firstFtAmountRaw?: bigint
  ): ReturnType<typeof quoteAddLP> & Pick<Pool3State, 'outpoint' | 'snapshotHash'>;
  quoteAddLP(
    poolTx: tbc.Transaction,
    amount: Pool3AddLPAmount
  ): ReturnType<typeof quoteAddLP> & Pick<Pool3State, 'outpoint' | 'snapshotHash'>;
  quoteAddLP(
    poolTx: tbc.Transaction,
    amount: bigint | Pool3AddLPAmount,
    firstFtAmountRaw?: bigint
  ) {
    const state = this.readPoolState(poolTx);
    return {
      ...quoteAddLP(state, amount, firstFtAmountRaw),
      outpoint: state.outpoint,
      snapshotHash: state.snapshotHash,
    };
  }
  quoteRemoveLP(poolTx: tbc.Transaction, burnRaw: bigint) {
    const state = this.readPoolState(poolTx);
    return {
      ...quoteRemoveLP(state, burnRaw),
      outpoint: state.outpoint,
      snapshotHash: state.snapshotHash,
    };
  }
  quoteSwapFT(poolTx: tbc.Transaction, inputTbcSat: bigint, minFtOutRaw = 0n) {
    const state = this.readPoolState(poolTx);
    return {
      ...quoteSwapFT(state, inputTbcSat, this.feePolicy, minFtOutRaw),
      outpoint: state.outpoint,
      snapshotHash: state.snapshotHash,
    };
  }
  quoteSwapTBC(poolTx: tbc.Transaction, inputFtRaw: bigint, minTbcOutSat = 0n) {
    const state = this.readPoolState(poolTx);
    return {
      ...quoteSwapTBC(state, inputFtRaw, this.feePolicy, minTbcOutSat),
      outpoint: state.outpoint,
      snapshotHash: state.snapshotHash,
    };
  }

  private makeLPCode(poolCodeHash: Buffer, controller: Buffer): tbc.Script {
    return FTLPTBC20.instantiateCode({
      poolCodeHash,
      controller,
      tapeSize: this.tapeSize,
      timelocked: this.config.lp.kind === 'timelocked',
    });
  }
  private makeLPTape(amounts: readonly bigint[], lockTime?: number): tbc.Script {
    return FTLPTBC20.buildTape({
      amounts,
      tapeSize: this.tapeSize,
      timelocked: this.config.lp.kind === 'timelocked',
      lockTime,
    });
  }
  private validateFT(
    input: Pool3AssetInput,
    state?: Pool3State
  ): { balance: bigint; code: tbc.Script; tape: tbc.Script } {
    const code = referenceOutput(input);
    const tapeOutput = input.parentTx.outputs[input.outputIndex + 1];
    if (code.satoshis !== 500 || !tapeOutput || tapeOutput.satoshis !== 0)
      pool3Fail('FT Code/Tape must be adjacent 500/0 outputs');
    TBC20.validateCode(code.script, this.tapeSize);
    const tape = TBC20.parseTape(tapeOutput.script);
    if (
      tape.size !== this.tapeSize ||
      !tape.extensionData.equals(TBC20.parseTape(this.ftTape).extensionData) ||
      !getTBC20CodeIdentity(code.script).equals(this.ftIdentity)
    )
      pool3Fail('wrong underlying FT identity or metadata');
    const controller = getTBC20Controller(code.script);
    if (state) {
      if (
        !controller.equals(Buffer.concat([h160(state.poolCodeHash), Buffer.from([1])])) ||
        tape.balance !== state.ftAAmount
      )
        pool3Fail('pool FT owner or balance does not match Pool state');
    } else if (
      controller[20] !== 0 ||
      !controller.subarray(0, 20).equals(h160(publicKeyBytes(input.signer.publicKey)))
    ) {
      pool3Fail('user FT must be owned by its supplied signer');
    }
    return { balance: tape.balance, code: code.script, tape: tapeOutput.script };
  }
  private validateLP(input: Pool3AssetInput, state?: Pool3State) {
    const output = referenceOutput(input);
    const tapeOutput = input.parentTx.outputs[input.outputIndex + 1];
    if (output.satoshis !== 500 || !tapeOutput || tapeOutput.satoshis !== 0)
      pool3Fail('LP Code/Tape must be adjacent 500/0 outputs');
    const code = FTLPTBC20.validateCode(output.script, {
      tapeSize: this.tapeSize,
      timelocked: this.config.lp.kind === 'timelocked',
    });
    if (
      code.controller[20] !== 0 ||
      !code.controller.subarray(0, 20).equals(h160(publicKeyBytes(input.signer.publicKey)))
    )
      pool3Fail('LP must be owned by its supplied signer');
    if (
      state &&
      (!code.poolCodeHash.equals(state.poolCodeHash) ||
        !code.identity.subarray(0, 32).equals(state.tape.ftLpPartialHash))
    )
      pool3Fail('LP belongs to a different Pool');
    const tape = FTLPTBC20.parseTape(tapeOutput.script, {
      timelocked: code.timelocked,
      tapeSize: this.tapeSize,
    });
    return { code, tape, codeScript: output.script };
  }
  private addAsset(
    outputs: tbc.Transaction.Output[],
    assets: Pool3AssetOutput[],
    role: Pool3AssetOutput['role'],
    family: Pool3AssetOutput['family'],
    code: tbc.Script,
    tape: tbc.Script,
    amounts: readonly bigint[]
  ): void {
    const codeVout = outputs.length;
    outputs.push(addPool3Output(code, 500n), addPool3Output(tape, 0n));
    assets.push({
      role,
      family,
      codeVout,
      tapeVout: codeVout + 1,
      amountRaw: amounts.reduce((sum, a) => sum + a, 0n),
      amountsByInput: amounts.slice(),
    });
  }
  private groups(
    tx: tbc.Transaction,
    assets: readonly Pool3AssetOutput[],
    hasPool: boolean
  ): TBC20CurrentOutputGroup[] {
    const paired = new Set(assets.map((a) => a.codeVout));
    if (hasPool) paired.add(0);
    const result: TBC20CurrentOutputGroup[] = [];
    for (let i = 0; i < tx.outputs.length; i++) {
      if (paired.has(i)) {
        result.push({ codeVout: i, tapeVout: i + 1 });
        i++;
      } else result.push({ codeVout: i });
    }
    return result;
  }
  private tokenPlan(
    input: Pool3AssetInput,
    inputIndex: number,
    family: 'tbc20' | 'ftlp',
    assets: readonly Pool3AssetOutput[],
    pool?: Pool3OperationOptions['pool'],
    poolOwned = false,
    sequence?: number
  ): Pool3InputPlan {
    return {
      reference: input,
      role: poolOwned ? 'pool-ft' : family === 'ftlp' ? 'lp-owner' : 'user-ft',
      signer: input.signer,
      sequence,
      unlock: (tx, signature, publicKey) => {
        const options = {
          currentTx: tx,
          inputIndex,
          preTx: input.parentTx,
          preTxVout: input.outputIndex,
          ancestorTransactions: input.ancestors,
          outputGroups: this.groups(tx, assets, !!pool),
          signature: signature!,
          publicKey: publicKey!,
          contractController: poolOwned
            ? { transaction: pool!.parentTx, currentInputIndex: 0 }
            : undefined,
        };
        return family === 'ftlp'
          ? buildFTLPUnlockScriptWithSignature(options)
          : buildTBC20UnlockScriptWithSignature(options);
      },
    };
  }
  private operation(
    options: Pool3OperationOptions,
    option: 1 | 2 | 3 | 4,
    quote: Pool3Quote,
    outputs: tbc.Transaction.Output[],
    layout: Pool3Layout,
    userInput?: Pool3AssetInput,
    lockTime?: number
  ): PreparedPool3Operation {
    const state = this.readPoolState(options.pool.parentTx);
    if (
      options.expectedSnapshotHash !== undefined &&
      options.expectedSnapshotHash !== state.snapshotHash
    )
      pool3Fail('STALE_POOL_STATE: quote snapshot differs from consumed Pool');
    this.validateFT(options.poolFT, state);
    const hashLocked = this.config.authorization.kind === 'controller';
    if (hashLocked) {
      if (!options.controllerSigner) pool3Fail('hash-locked Pool requires a Controller signer');
      assertPoolControllerPublicKey(
        this.config.authorization,
        publicKeyBytes(options.controllerSigner.publicKey)
      );
    } else if (options.controllerSigner !== undefined)
      pool3Fail('public Pool has no Controller signature field');
    const auxiliary =
      option === 3
        ? [options.funding, options.poolFT]
        : [userInput!, options.poolFT, options.funding];
    const plans: Pool3InputPlan[] = [
      {
        reference: { parentTx: options.pool.parentTx, outputIndex: 0 },
        role: 'pool-controller',
        signer: options.controllerSigner,
        unlock: (tx, signature, publicKey) =>
          buildPoolUnlockScript({
            tx,
            preTx: options.pool.parentTx,
            prePreTx: options.pool.ancestorTx,
            inputTxs: auxiliary.map((i) => i.parentTx),
            option,
            signature,
            publicKey,
          }),
      },
    ];
    if (option === 3) plans.push(p2pkhInputPlan(options.funding));
    else
      plans.push(
        this.tokenPlan(
          userInput!,
          1,
          option === 2 ? 'ftlp' : 'tbc20',
          layout.assetOutputs,
          options.pool,
          false,
          option === 2 && this.config.lp.kind === 'timelocked' ? 0xfffffffe : undefined
        )
      );
    plans.push(this.tokenPlan(options.poolFT, 2, 'tbc20', layout.assetOutputs, options.pool, true));
    if (option !== 3) plans.push(p2pkhInputPlan(options.funding));
    const prepared = new PreparedPool3Transaction({
      inputs: plans,
      outputs,
      changeAddress: options.changeAddress ?? signerAddress(options.funding),
      lockTime,
      feePolicy: options.feePolicy,
    });
    return new PreparedPool3Operation(prepared, layout, quote, (tx) => this.readPoolState(tx));
  }
  private poolOutputs(state: Pool3State, quote: Pool3Quote): tbc.Transaction.Output[] {
    return [
      addPool3Output(state.codeScript, quote.nextState.poolValue),
      addPool3Output(
        tbc.Script.fromBuffer(replacePoolTapeAmounts(encodePoolTape(state.tape), quote.nextState)),
        0n
      ),
    ];
  }
  private payment(address: string, value: bigint): tbc.Transaction.Output {
    ownerController(address);
    return addPool3Output(tbc.Script.buildPublicKeyHashOut(address), value);
  }

  private serviceFeeOutput(amountSat: bigint): tbc.Transaction.Output {
    // The contract reserves this vout even when the service fee rounds to zero.
    const script = amountSat > 0n ? this.feeRecipient.feeP2pkhScript25 : tbc.Script.fromHex('006a');
    return addPool3Output(script, amountSat);
  }

  /** Low-level genesis preparation: funding is the already selected mint root. */
  prepareMintPoolNFT(options: Pool3MintOptions): PreparedPool3Operation {
    const hashLocked = this.config.authorization.kind === 'controller';
    const code = instantiatePoolCode({
      originalUTXO: TBC20.encodeOriginalUTXO({
        txId: options.funding.parentTx.id,
        outputIndex: options.funding.outputIndex,
      }),
      tbcFeeScriptHash: this.feeRecipient.feeScriptHash32,
      ftTapeSize: this.tapeSize,
      authorization: this.config.authorization,
    });
    const poolHash = sha(code.toBuffer());
    const lp = this.makeLPCode(poolHash, Buffer.alloc(21));
    const lpIdentity = FTLPTBC20.getCodeIdentity(lp);
    const tape = encodePoolTape({
      ftLpPartialHash: lpIdentity.subarray(0, 32),
      ftLpCodeSize: lp.toBuffer().length,
      ftAPartialHash: this.ftIdentity.subarray(0, 32),
      ftACodeSize: this.ftCode.toBuffer().length,
      ftLpAmount: 0n,
      ftAAmount: 0n,
      tbcAmount: 0n,
      ftAContractId: this.ftGenesis.id,
      serviceFeeRate: this.feePolicy.totalFeeBps,
      lpPlan: this.feePolicy.lpPlan,
      withSwapHashLock: hashLocked,
      withLpLocktime: this.config.lp.kind === 'timelocked',
      withLpHashLock: hashLocked,
    });
    const outputs = [
      addPool3Output(code, POOL3_CODE_DUST),
      addPool3Output(tbc.Script.fromBuffer(tape), 0n),
    ];
    const assets: Pool3AssetOutput[] = [];
    this.addAsset(
      outputs,
      assets,
      'pool-ft',
      'tbc20',
      TBC20.replaceController(this.ftCode, Buffer.concat([h160(poolHash), Buffer.from([1])])),
      replaceTBC20TapeAmounts(this.ftTape, ZERO_SLOTS),
      ZERO_SLOTS
    );
    const prepared = new PreparedPool3Transaction({
      inputs: [p2pkhInputPlan(options.funding)],
      outputs,
      changeAddress: options.changeAddress ?? signerAddress(options.funding),
      feePolicy: options.feePolicy,
    });
    return new PreparedPool3Operation(
      prepared,
      { operation: 'mint', inputRoles: ['funding'], assetOutputs: assets, poolCodeVout: 0 },
      undefined,
      (tx) => this.readPoolState(tx)
    );
  }
  async mintPoolNFT(options: Pool3MintOptions): Promise<Pool3MintResult> {
    // Source's only output returns funding minus its miner fee to the same signer.
    const sourcePreparation = new PreparedPool3Transaction({
      inputs: [p2pkhInputPlan(options.funding)],
      outputs: [],
      changeAddress: signerAddress(options.funding),
      feePolicy: options.feePolicy,
    });
    if (sourcePreparation.changeVout !== 0) pool3Fail('insufficient funding for mint Source');
    const source = await sourcePreparation.sign();
    const genesis = await this.prepareMintPoolNFT({
      ...options,
      funding: { parentTx: source.transaction, outputIndex: 0, signer: options.funding.signer },
    }).sign();
    return { ...genesis, source, transactions: [source.transaction, genesis.transaction] };
  }

  prepareAddLP(options: Pool3AddLPOptions): PreparedPool3Operation {
    const state = this.readPoolState(options.pool.parentTx);
    const quote = quoteAddLP(state, options);
    if (options.minLpOutRaw !== undefined) {
      assertPoolAmount(options.minLpOutRaw, 'minLpOutRaw');
      if (quote.ftLpIncrementRaw < options.minLpOutRaw) pool3Fail('LP output is below minLpOutRaw');
    }
    if (options.maxFtInRaw !== undefined) {
      assertPoolAmount(options.maxFtInRaw, 'maxFtInRaw');
      if (quote.ftAIncrementRaw > options.maxFtInRaw) pool3Fail('FT input exceeds maxFtInRaw');
    }
    if (options.maxTbcInSat !== undefined) {
      assertPoolAmount(options.maxTbcInSat, 'maxTbcInSat');
      if (quote.tbcIncrementSat > options.maxTbcInSat)
        pool3Fail('TBC input exceeds maxTbcInSat');
    }
    const user = this.validateFT(options.userFT);
    const pool = this.validateFT(options.poolFT, state);
    if (user.balance < quote.ftAIncrementRaw)
      pool3Fail('insufficient user FT; consolidate into one input explicitly');
    const outputs = this.poolOutputs(state, quote);
    const assets: Pool3AssetOutput[] = [];
    const poolSlots = slots([
      [1, quote.ftAIncrementRaw],
      [2, state.ftAAmount],
    ]);
    this.addAsset(
      outputs,
      assets,
      'pool-ft',
      'tbc20',
      pool.code,
      replaceTBC20TapeAmounts(pool.tape, poolSlots),
      poolSlots
    );
    const lpSlots = slots([[0, quote.ftLpIncrementRaw]]);
    this.addAsset(
      outputs,
      assets,
      'new-lp',
      'ftlp',
      this.makeLPCode(state.poolCodeHash, ownerController(options.lpReceiverAddress)),
      this.makeLPTape(lpSlots, options.lpLockTime),
      lpSlots
    );
    if (user.balance > quote.ftAIncrementRaw) {
      const change = slots([[1, user.balance - quote.ftAIncrementRaw]]);
      this.addAsset(
        outputs,
        assets,
        'ft-change',
        'tbc20',
        user.code,
        replaceTBC20TapeAmounts(user.tape, change),
        change
      );
    }
    return this.operation(
      options,
      1,
      quote,
      outputs,
      {
        operation: 'addLP',
        inputRoles: ['pool-controller', 'user-ft', 'pool-ft', 'funding'],
        assetOutputs: assets,
        poolCodeVout: 0,
      },
      options.userFT
    );
  }
  async addLP(options: Pool3AddLPOptions): Promise<Pool3BuildResult> {
    return this.prepareAddLP(options).sign();
  }

  prepareRemoveLP(options: Pool3RemoveLPOptions): PreparedPool3Operation {
    const state = this.readPoolState(options.pool.parentTx);
    const quote = quoteRemoveLP(state, options.burnAmountRaw);
    const lp = this.validateLP(options.userLP, state);
    const pool = this.validateFT(options.poolFT, state);
    if (lp.tape.balance < options.burnAmountRaw)
      pool3Fail('insufficient LP; consolidate into one input explicitly');
    if (options.minFtOutRaw !== undefined) {
      assertPoolAmount(options.minFtOutRaw, 'minFtOutRaw');
      if (quote.ftADecrementRaw < options.minFtOutRaw) pool3Fail('FT payout is below minimum');
    }
    if (options.minTbcOutSat !== undefined) {
      assertPoolAmount(options.minTbcOutSat, 'minTbcOutSat');
      if (quote.poolValueDecrementSat < options.minTbcOutSat)
        pool3Fail('TBC payout is below minimum');
    }
    const outputs = this.poolOutputs(state, quote);
    const assets: Pool3AssetOutput[] = [];
    outputs.push(this.payment(options.receiverAddress, quote.poolValueDecrementSat));
    const ftOut = slots([[2, quote.ftADecrementRaw]]);
    this.addAsset(
      outputs,
      assets,
      'user-ft',
      'tbc20',
      TBC20.replaceController(pool.code, ownerController(options.receiverAddress)),
      replaceTBC20TapeAmounts(pool.tape, ftOut),
      ftOut
    );
    const burn = slots([[1, options.burnAmountRaw]]);
    this.addAsset(
      outputs,
      assets,
      'lp-burn',
      'ftlp',
      FTLPTBC20.replaceController(lp.codeScript, BURN_CONTROLLER),
      this.makeLPTape(burn, this.config.lp.kind === 'timelocked' ? 0 : undefined),
      burn
    );
    const poolChange = slots([[2, quote.nextState.ftAAmount]]);
    this.addAsset(
      outputs,
      assets,
      'pool-ft',
      'tbc20',
      pool.code,
      replaceTBC20TapeAmounts(pool.tape, poolChange),
      poolChange
    );
    if (lp.tape.balance > options.burnAmountRaw) {
      const change = slots([[1, lp.tape.balance - options.burnAmountRaw]]);
      this.addAsset(
        outputs,
        assets,
        'lp-change',
        'ftlp',
        lp.codeScript,
        this.makeLPTape(change, lp.code.timelocked ? lp.tape.lockTime : undefined),
        change
      );
    }
    return this.operation(
      options,
      2,
      quote,
      outputs,
      {
        operation: 'removeLP',
        inputRoles: ['pool-controller', 'lp-owner', 'pool-ft', 'funding'],
        assetOutputs: assets,
        poolCodeVout: 0,
        userTbcVout: 2,
      },
      options.userLP,
      options.lockTime ?? lp.tape.lockTime
    );
  }
  async removeLP(options: Pool3RemoveLPOptions): Promise<Pool3BuildResult> {
    return this.prepareRemoveLP(options).sign();
  }

  prepareSwapFT(options: Pool3SwapFTOptions): PreparedPool3Operation {
    assertPoolAmount(options.minFtOutRaw, 'minFtOutRaw');
    const state = this.readPoolState(options.pool.parentTx);
    const quote = quoteSwapFT(state, options.inputTbcSat, this.feePolicy, options.minFtOutRaw);
    const pool = this.validateFT(options.poolFT, state);
    const outputs = this.poolOutputs(state, quote);
    const assets: Pool3AssetOutput[] = [];
    const userSlots = slots([[2, quote.ftOutRaw]]);
    this.addAsset(
      outputs,
      assets,
      'user-ft',
      'tbc20',
      TBC20.replaceController(pool.code, ownerController(options.receiverAddress)),
      replaceTBC20TapeAmounts(pool.tape, userSlots),
      userSlots
    );
    outputs.push(this.serviceFeeOutput(quote.fees.serviceFeePaidSat));
    const poolSlots = slots([[2, quote.nextState.ftAAmount]]);
    this.addAsset(
      outputs,
      assets,
      'pool-ft',
      'tbc20',
      pool.code,
      replaceTBC20TapeAmounts(pool.tape, poolSlots),
      poolSlots
    );
    return this.operation(options, 3, quote, outputs, {
      operation: 'swapFT',
      inputRoles: ['pool-controller', 'funding', 'pool-ft'],
      assetOutputs: assets,
      poolCodeVout: 0,
      serviceFeeVout: 4,
    });
  }
  async swapFT(options: Pool3SwapFTOptions): Promise<Pool3BuildResult> {
    return this.prepareSwapFT(options).sign();
  }

  prepareSwapTBC(options: Pool3SwapTBCOptions): PreparedPool3Operation {
    assertPoolAmount(options.minTbcOutSat, 'minTbcOutSat');
    const state = this.readPoolState(options.pool.parentTx);
    const quote = quoteSwapTBC(state, options.inputFtRaw, this.feePolicy, options.minTbcOutSat);
    const user = this.validateFT(options.userFT);
    const pool = this.validateFT(options.poolFT, state);
    if (user.balance < options.inputFtRaw) pool3Fail('insufficient user FT');
    const outputs = this.poolOutputs(state, quote);
    const assets: Pool3AssetOutput[] = [];
    outputs.push(this.payment(options.receiverAddress, quote.tbcOutSat));
    outputs.push(this.serviceFeeOutput(quote.fees.serviceFeePaidSat));
    const poolSlots = slots([
      [1, options.inputFtRaw],
      [2, state.ftAAmount],
    ]);
    this.addAsset(
      outputs,
      assets,
      'pool-ft',
      'tbc20',
      pool.code,
      replaceTBC20TapeAmounts(pool.tape, poolSlots),
      poolSlots
    );
    if (user.balance > options.inputFtRaw) {
      const change = slots([[1, user.balance - options.inputFtRaw]]);
      this.addAsset(
        outputs,
        assets,
        'ft-change',
        'tbc20',
        user.code,
        replaceTBC20TapeAmounts(user.tape, change),
        change
      );
    }
    return this.operation(
      options,
      4,
      quote,
      outputs,
      {
        operation: 'swapTBC',
        inputRoles: ['pool-controller', 'user-ft', 'pool-ft', 'funding'],
        assetOutputs: assets,
        poolCodeVout: 0,
        serviceFeeVout: 3,
        userTbcVout: 2,
      },
      options.userFT
    );
  }
  async swapTBC(options: Pool3SwapTBCOptions): Promise<Pool3BuildResult> {
    return this.prepareSwapTBC(options).sign();
  }

  prepareTransferLP(options: Pool3TransferLPOptions): PreparedPool3Operation {
    return this.prepareLPTransfer(options, 'transferLP');
  }
  private prepareLPTransfer(
    options: Pool3TransferLPOptions,
    operation: 'transferLP' | 'unlockLP'
  ): PreparedPool3Operation {
    if (!Array.isArray(options.inputs) || options.inputs.length < 1 || options.inputs.length > 5)
      pool3Fail('LP transfer requires 1–5 LP inputs and one funding input');
    assertPoolAmount(options.amountRaw, 'amountRaw');
    if (options.amountRaw === 0n) pool3Fail('LP transfer amount must be positive');
    const inputs = options.inputs.map((input) => this.validateLP(input));
    if (inputs.some((input) => !input.code.identity.equals(inputs[0].code.identity)))
      pool3Fail('LP inputs must share one Pool and template identity');
    const locks = inputs.map((i) => i.tape.lockTime);
    const requiredLock = FTLPTBC20.getRequiredLockTime(locks);
    const lockTime = options.lockTime ?? requiredLock;
    const outputLockTime =
      this.config.lp.kind === 'timelocked' ? (options.outputLockTime ?? requiredLock) : undefined;
    if (this.config.lp.kind === 'plain' && options.outputLockTime !== undefined)
      pool3Fail('plain LP has no lockTime field');
    let remaining = options.amountRaw;
    const receiverSlots = [...ZERO_SLOTS] as bigint[];
    const changeSlots = [...ZERO_SLOTS] as bigint[];
    inputs.forEach((input, i) => {
      const used = input.tape.balance < remaining ? input.tape.balance : remaining;
      receiverSlots[i] = used;
      changeSlots[i] = input.tape.balance - used;
      remaining -= used;
    });
    if (remaining > 0n) pool3Fail('insufficient LP balance');
    const outputs: tbc.Transaction.Output[] = [];
    const assets: Pool3AssetOutput[] = [];
    this.addAsset(
      outputs,
      assets,
      'lp-transfer',
      'ftlp',
      FTLPTBC20.replaceController(inputs[0].codeScript, ownerController(options.receiverAddress)),
      this.makeLPTape(receiverSlots, outputLockTime),
      receiverSlots
    );
    if (changeSlots.some((a) => a > 0n)) {
      const ownerHashes = inputs
        .filter((_, i) => changeSlots[i] > 0n)
        .map((i) => i.code.controller.toString('hex'));
      if (!options.lpChangeAddress && new Set(ownerHashes).size > 1)
        pool3Fail('multiple LP change owners require an explicit lpChangeAddress');
      const changeController = options.lpChangeAddress
        ? ownerController(options.lpChangeAddress)
        : inputs[changeSlots.findIndex((a) => a > 0n)].code.controller;
      this.addAsset(
        outputs,
        assets,
        'lp-change',
        'ftlp',
        FTLPTBC20.replaceController(inputs[0].codeScript, changeController),
        this.makeLPTape(
          changeSlots,
          this.config.lp.kind === 'timelocked' ? requiredLock : undefined
        ),
        changeSlots
      );
    }
    const plans = options.inputs.map((input, i) =>
      this.tokenPlan(
        input,
        i,
        'ftlp',
        assets,
        undefined,
        false,
        this.config.lp.kind === 'timelocked' ? 0xfffffffe : undefined
      )
    );
    plans.push(p2pkhInputPlan(options.funding));
    const prepared = new PreparedPool3Transaction({
      inputs: plans,
      outputs,
      changeAddress: options.changeAddress ?? signerAddress(options.funding),
      lockTime,
      feePolicy: options.feePolicy,
    });
    return new PreparedPool3Operation(
      prepared,
      {
        operation,
        inputRoles: [...options.inputs.map(() => 'lp-owner'), 'funding'],
        assetOutputs: assets,
      },
      undefined
    );
  }
  async transferLP(options: Pool3TransferLPOptions): Promise<Pool3BuildResult> {
    return this.prepareTransferLP(options).sign();
  }

  prepareUnlockLP(options: Pool3UnlockLPOptions): PreparedPool3Operation {
    if (this.config.lp.kind !== 'timelocked')
      pool3Fail('unlockLP requires the timelocked LP template');
    const controller = ownerController(options.receiverAddress);
    const inputs = options.inputs.map((input) => this.validateLP(input));
    if (inputs.some((i) => !i.code.controller.equals(controller)))
      pool3Fail('unlockLP preserves ownership; use transferLP for another recipient');
    const amountRaw = inputs.reduce((sum, i) => sum + i.tape.balance, 0n);
    return this.prepareLPTransfer({ ...options, amountRaw, outputLockTime: 0 }, 'unlockLP');
  }
  async unlockLP(options: Pool3UnlockLPOptions): Promise<Pool3BuildResult> {
    return this.prepareUnlockLP(options).sign();
  }
}

export { PoolNFT3 as poolNFT3 };
export default PoolNFT3;
