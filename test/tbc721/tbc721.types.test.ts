/** Compile-only package-root consumer fixture; no transaction is broadcast. */
import { PrivateKey, Transaction, Script } from 'tbc-lib-js';
import { NFT, TBC721 } from '../..';

declare const privateKey: PrivateKey;
declare const address: string;
declare const transaction: Transaction;
declare const parent: Transaction;
declare const grandparent: Transaction;
declare const funding: Transaction.IUnspentOutput;
declare const signature: Buffer;
declare const publicKey: Buffer;

const code: Script = TBC721.buildCodeScript(parent.id, 5);
const alias: Script = TBC721.getNftCode(parent.id, 5);
const parsed = TBC721.parseCode(code);
const root: Buffer = parsed.originalUTXO;
const txid: string = parsed.txid;
const outputIndex: number = parsed.outputIndex;
const detected: boolean = TBC721.isTBC721Code(code.toHex());
const version: 3 | -1 = TBC721.getNFTVersion(code);
const localUnlock: Script = TBC721.buildUnlockScript(privateKey, transaction, parent, grandparent);
const externalUnlock: Script = TBC721.buildUnlockScript(signature, publicKey, transaction, parent, grandparent, 0);
const schnorr: Script = TBC721.buildUnlockScriptSchnorr(signature, publicKey, transaction, parent, grandparent, 0);
const hold: Script = TBC721.getHoldScriptFromHash('00'.repeat(20), 'Curr');

const sdk = new TBC721(parent.id);
const old = new NFT(parent.id);
const metadata = { nftName: 'Test', symbol: 'TEST', description: 'Description', attributes: '{}' };
const collection: string = TBC721.createCollection(address, privateKey,
  { collectionName: 'Collection', description: 'Description', supply: 5, file: '' }, [funding]);
const mint: string = TBC721.createNFT(parent.id, address, privateKey, metadata, [funding], funding);
const batch: Array<{ txraw: string }> = TBC721.batchCreateNFT(parent.id, address, privateKey, [metadata], [funding], [funding]);
const sent: string = sdk.transferNFT(address, address, privateKey, [funding], parent, grandparent);
const paid: string = sdk.transferNFTWithTBC(address, address, address, privateKey, [funding], parent, grandparent, '0.001234');
const legacy: string = old.transferNFT(address, address, privateKey, [funding], parent, grandparent);
void [alias, root, txid, outputIndex, detected, version, localUnlock, externalUnlock, schnorr, hold,
  collection, mint, batch, sent, paid, legacy];
