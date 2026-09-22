// Compatibility entrypoint for the OrderBook adapter; HTLC shares the same codecs.
export {
  ContractToken as OrderBookToken,
  ContractTokenProof as OrderBookTokenProof,
  ContractTokenKind as OrderBookTokenKind,
  tokenKind, isCoinCodeScript, getFTPartialOffset, getFTVersion,
  isTokenProof, fetchTokenProof, modernCodeOffsets,
} from '../common/contractToken';
