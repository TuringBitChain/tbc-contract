import * as tbc from 'tbc-lib-js';
import {
  detectContractVersion, detectPoolVersion, detectFTVersion,
  detectStableCoinVersion, detectNFTVersion,
} from '../../index';
import type { ContractVersionInfo, ContractCodeScript, PoolVersionInfo, FTVersionInfo,
  StableCoinVersionInfo, NFTVersionInfo } from '../../index';

const input: ContractCodeScript = new tbc.Script();
const all: ContractVersionInfo | null = detectContractVersion(input);
const pool: PoolVersionInfo | null = detectPoolVersion(Buffer.from('51', 'hex'));
const ft: FTVersionInfo | null = detectFTVersion('51');
const coin: StableCoinVersionInfo | null = detectStableCoinVersion(input);
const nft: NFTVersionInfo | null = detectNFTVersion(input);
if (all?.family === 'pool' && all.version === 3) {
  const route: 'PoolNFT3' = all.sdk;
}
if (ft?.version === 'legacy') {
  const version: 1 | 2 | 3 | 4 = ft.legacyVersion;
  const route: 'FT' = ft.sdk;
}
if (coin?.version === 'tbc20') { const route: 'Coin' = coin.sdk; }
if (nft?.version === 'legacy') { const version: 0 | 1 | 2 = nft.legacyVersion; }
// @ts-expect-error A transaction must first be narrowed to a Code output script.
detectContractVersion(new tbc.Transaction());
// @ts-expect-error Class instances are never detector inputs.
detectFTVersion({});
