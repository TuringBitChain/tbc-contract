import * as tbc from 'tbc-lib-js';

export interface Pool3InputValidation {
  inputIndex: number;
  success: boolean;
  error: string;
  stackDepth: number;
  altStackDepth: number;
}
export interface Pool3ValidationReport {
  success: boolean;
  inputs: readonly Pool3InputValidation[];
  valueConserved: boolean;
  /** Local execution does not establish UTXO availability or node finality. */
  nodeAcceptanceChecked: false;
}
interface Interpreter {
  verify(
    unlock: tbc.Script,
    lock: tbc.Script,
    tx: tbc.Transaction,
    vin: number,
    flags: number,
    value: tbc.crypto.BN
  ): boolean;
  errstr: string;
  stack: { length: number };
  altstack: { length: number };
}
const Interpreter = (
  tbc.Script as unknown as {
    Interpreter: {
      new (): Interpreter;
      DEFAULT_FLAGS: number;
      MAXIMUM_ELEMENT_SIZE: number;
      MAX_SCRIPT_ELEMENT_SIZE: number;
    };
  }
).Interpreter;

/** Executes every previous locking script, not only the Pool state input. */
export function validatePool3Transaction(tx: tbc.Transaction): Pool3ValidationReport {
  if (
    !(tx instanceof tbc.Transaction) ||
    (tx as tbc.Transaction & { version: number }).version !== 10 ||
    !tx.inputs.length ||
    !tx.outputs.length
  )
    throw new Error('PoolNFT3 validation requires a version 10 transaction');
  const seen = new Set<string>();
  let inputSat = 0n;
  const inputs = tx.inputs.map((input, inputIndex): Pool3InputValidation => {
    const outpoint = `${input.prevTxId.toString('hex')}:${input.outputIndex}`;
    if (seen.has(outpoint)) throw new Error('PoolNFT3 validation: duplicate input');
    seen.add(outpoint);
    if (!input.output || !Number.isSafeInteger(input.output.satoshis) || input.output.satoshis < 0)
      throw new Error('PoolNFT3 validation: missing or unsafe prevout');
    inputSat += BigInt(input.output.satoshis);
    const vm = new Interpreter();
    // Input.verify mutates this library-global BIN2NUM limit. Keep Pool3
    // execution deterministic without changing other SDK validators. BN
    // arithmetic remains unrestricted: proportional products can exceed 8 bytes.
    const previousElementSize = Interpreter.MAXIMUM_ELEMENT_SIZE;
    const previousScriptElementSize = Interpreter.MAX_SCRIPT_ELEMENT_SIZE;
    let ok: boolean;
    try {
      Interpreter.MAXIMUM_ELEMENT_SIZE = 8;
      // Match Input.verify for ordinary byte strings, independently of BIN2NUM.
      Interpreter.MAX_SCRIPT_ELEMENT_SIZE = Number.MAX_SAFE_INTEGER;
      ok = vm.verify(
        input.script,
        input.output.script,
        tx,
        inputIndex,
        Interpreter.DEFAULT_FLAGS,
        input.output.satoshisBN
      );
    } finally {
      Interpreter.MAXIMUM_ELEMENT_SIZE = previousElementSize;
      Interpreter.MAX_SCRIPT_ELEMENT_SIZE = previousScriptElementSize;
    }
    // Current FTLP artifacts intentionally leave bookkeeping on altstack.
    // Acceptance requires the interpreter result and one main-stack result;
    // report altstack depth without inventing an extra consensus condition.
    return {
      inputIndex,
      success: ok && vm.stack.length === 1,
      error: vm.errstr || (ok && vm.stack.length !== 1 ? 'non-clean final main stack' : ''),
      stackDepth: vm.stack.length,
      altStackDepth: vm.altstack.length,
    };
  });
  const outputSat = tx.outputs.reduce((sum, output) => {
    if (!Number.isSafeInteger(output.satoshis) || output.satoshis < 0)
      throw new Error('PoolNFT3 validation: unsafe output');
    return sum + BigInt(output.satoshis);
  }, 0n);
  const valueConserved = inputSat >= outputSat;
  return {
    success: valueConserved && inputs.every((i) => i.success),
    inputs,
    valueConserved,
    nodeAcceptanceChecked: false,
  };
}
