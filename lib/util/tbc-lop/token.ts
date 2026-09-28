// Token adapter for TBC LOP; TBC HTLC shares the same codecs.
export {
  ContractToken as TBCLOPToken,
  ContractTokenProof as TBCLOPTokenProof,
  ContractTokenKind as TBCLOPTokenKind,
  tokenKind, isCoinCodeScript, getFTPartialOffset, getFTVersion,
  isTokenProof, fetchTokenProof, modernCodeOffsets,
} from '../common/contractToken';
