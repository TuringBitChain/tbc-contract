import * as tbc from 'tbc-lib-js';
import { ContractQuery, apiHex, apiNumber, apiString, apiTxid } from './contract-query';

/** Indexed metadata accepted by TBC721 Standard.initialize(). */
export interface TBC721StandardInfo {
  collectionId: string;
  collectionIndex: number;
  collectionName: string;
  nftName: string;
  nftSymbol: string;
  nftAttributes: string;
  nftDescription: string;
  nftTransferTimeCount: number;
  nftIcon: string;
}

export async function fetchTbc721StandardInfo(query: ContractQuery, contractId: string): Promise<TBC721StandardInfo> {
  const id = apiTxid(contractId, 'NFT contract ID');
  const data = await query.data(`nft/nftinfo/nftid/${id}`);
  return {
    collectionId: apiTxid(data.collection_id, 'NFT collection ID'),
    collectionIndex: apiNumber(data.collection_index, 'NFT collection index', 0xffffffff),
    collectionName: apiString(data.collection_name, 'NFT collection name'),
    nftName: apiString(data.nft_name, 'NFT name'),
    nftSymbol: apiString(data.nft_symbol, 'NFT symbol'),
    nftAttributes: data.nft_attributes == null ? '' : apiString(data.nft_attributes, 'NFT attributes'),
    nftDescription: apiString(data.nft_description, 'NFT description'),
    nftTransferTimeCount: apiNumber(data.nft_transfer_count, 'NFT transfer count'),
    nftIcon: apiString(data.nft_icon, 'NFT icon'),
  };
}

export async function fetchTbc721StandardNfts(query: ContractQuery, collectionId: string,
  address: string, start: number, end: number): Promise<string[]> {
  const id = apiTxid(collectionId, 'NFT collection ID');
  if (typeof address !== 'string' || !tbc.Address.isValid(address))
    throw new Error('TBC721 Standard API: invalid owner address');
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(end) || end < start)
    throw new Error('TBC721 Standard API: collection range must contain nonnegative integers with end >= start');
  const data = await query.data(`nft/nftbycollection/collectionid/${id}/start/${start}/end/${end}`);
  if (!Array.isArray(data.nft_list)) throw new Error('TBC721 Standard API: missing NFT list');
  return data.nft_list.map((item: any) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error('TBC721 Standard API: invalid NFT list item');
    return {
      holder: apiString(item.nft_holder, 'NFT holder'),
      contractId: apiTxid(item.nft_contract_id, 'NFT contract ID'),
    };
  }).filter((item: { holder: string }) => item.holder === address)
    .map((item: { contractId: string }) => item.contractId);
}

async function fetchTxos(query: ContractQuery, params: { script: string; txId?: string }): Promise<tbc.Transaction.IUnspentOutput[]> {
  if (!params || typeof params !== 'object') throw new Error('TBC721 Standard API: TXO query parameters are required');
  const script = apiHex(params.script, 'NFT script');
  const txId = params.txId === undefined ? undefined : apiTxid(params.txId, 'NFT transaction ID');
  const scriptHash = Buffer.from(tbc.crypto.Hash.sha256(Buffer.from(script, 'hex'))).reverse().toString('hex');
  // Mint NHold slots are ordinary outputs and use the shared UTXO endpoint.
  const path = txId === undefined ? 'nft/utxo' : 'utxo';
  const data = await query.data(`${path}/scriptpubkeyhash/${scriptHash}`);
  if (!Array.isArray(data.utxos)) throw new Error('TBC721 Standard API: missing UTXO array');
  const outputs: tbc.Transaction.IUnspentOutput[] = data.utxos.map((item: any) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error('TBC721 Standard API: invalid UTXO record');
    const outputIndex = apiNumber(item.index === undefined ? item.vout : item.index, 'NFT UTXO index', 0xffffffff);
    if (item.index !== undefined && item.vout !== undefined &&
      apiNumber(item.vout, 'NFT UTXO vout', 0xffffffff) !== outputIndex)
      throw new Error('TBC721 Standard API: UTXO index and vout disagree');
    if (item.script_pubkey !== undefined && apiHex(item.script_pubkey, 'NFT UTXO script_pubkey') !== script)
      throw new Error('TBC721 Standard API: indexed UTXO script differs from the requested script');
    return {
      txId: apiTxid(item.txid, 'NFT UTXO transaction ID'),
      outputIndex,
      script,
      satoshis: apiNumber(item.value, 'NFT UTXO value'),
    };
  });
  return outputs.filter(output => txId === undefined || output.txId.toLowerCase() === txId.toLowerCase())
    .sort((a, b) => a.outputIndex - b.outputIndex);
}

export async function fetchTbc721StandardTxo(query: ContractQuery,
  params: { script: string; txId?: string }): Promise<tbc.Transaction.IUnspentOutput> {
  const outputs = await fetchTxos(query, params);
  if (!outputs.length) throw new Error('TBC721 Standard API: no matching unspent NFT output');
  return outputs[0];
}

export async function fetchTbc721StandardTxos(query: ContractQuery,
  params: { script: string; txId: string }): Promise<tbc.Transaction.IUnspentOutput[]> {
  apiTxid(params?.txId, 'NFT transaction ID');
  const outputs = await fetchTxos(query, params);
  if (!outputs.length) throw new Error('TBC721 Standard API: no unspent mint slots; collection supply is exhausted');
  return outputs;
}
