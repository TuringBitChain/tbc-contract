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
exports.fetchTbc721StandardInfo = fetchTbc721StandardInfo;
exports.fetchTbc721StandardNfts = fetchTbc721StandardNfts;
exports.fetchTbc721StandardTxo = fetchTbc721StandardTxo;
exports.fetchTbc721StandardTxos = fetchTbc721StandardTxos;
const tbc = __importStar(require("tbc-lib-js"));
const contract_query_1 = require("./contract-query");
async function fetchTbc721StandardInfo(query, contractId) {
    const id = (0, contract_query_1.apiTxid)(contractId, 'NFT contract ID');
    const data = await query.data(`nft/nftinfo/nftid/${id}`);
    return {
        collectionId: (0, contract_query_1.apiTxid)(data.collection_id, 'NFT collection ID'),
        collectionIndex: (0, contract_query_1.apiNumber)(data.collection_index, 'NFT collection index', 0xffffffff),
        collectionName: (0, contract_query_1.apiString)(data.collection_name, 'NFT collection name'),
        nftName: (0, contract_query_1.apiString)(data.nft_name, 'NFT name'),
        nftSymbol: (0, contract_query_1.apiString)(data.nft_symbol, 'NFT symbol'),
        nftAttributes: data.nft_attributes == null ? '' : (0, contract_query_1.apiString)(data.nft_attributes, 'NFT attributes'),
        nftDescription: (0, contract_query_1.apiString)(data.nft_description, 'NFT description'),
        nftTransferTimeCount: (0, contract_query_1.apiNumber)(data.nft_transfer_count, 'NFT transfer count'),
        nftIcon: (0, contract_query_1.apiString)(data.nft_icon, 'NFT icon'),
    };
}
async function fetchTbc721StandardNfts(query, collectionId, address, start, end) {
    const id = (0, contract_query_1.apiTxid)(collectionId, 'NFT collection ID');
    if (typeof address !== 'string' || !tbc.Address.isValid(address))
        throw new Error('TBC721 Standard API: invalid owner address');
    if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(end) || end < start)
        throw new Error('TBC721 Standard API: collection range must contain nonnegative integers with end >= start');
    const data = await query.data(`nft/nftbycollection/collectionid/${id}/start/${start}/end/${end}`);
    if (!Array.isArray(data.nft_list))
        throw new Error('TBC721 Standard API: missing NFT list');
    return data.nft_list.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item))
            throw new Error('TBC721 Standard API: invalid NFT list item');
        return {
            holder: (0, contract_query_1.apiString)(item.nft_holder, 'NFT holder'),
            contractId: (0, contract_query_1.apiTxid)(item.nft_contract_id, 'NFT contract ID'),
        };
    }).filter((item) => item.holder === address)
        .map((item) => item.contractId);
}
async function fetchTxos(query, params) {
    if (!params || typeof params !== 'object')
        throw new Error('TBC721 Standard API: TXO query parameters are required');
    const script = (0, contract_query_1.apiHex)(params.script, 'NFT script');
    const txId = params.txId === undefined ? undefined : (0, contract_query_1.apiTxid)(params.txId, 'NFT transaction ID');
    const scriptHash = Buffer.from(tbc.crypto.Hash.sha256(Buffer.from(script, 'hex'))).reverse().toString('hex');
    // Mint NHold slots are ordinary outputs and use the shared UTXO endpoint.
    const path = txId === undefined ? 'nft/utxo' : 'utxo';
    const data = await query.data(`${path}/scriptpubkeyhash/${scriptHash}`);
    if (!Array.isArray(data.utxos))
        throw new Error('TBC721 Standard API: missing UTXO array');
    const outputs = data.utxos.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item))
            throw new Error('TBC721 Standard API: invalid UTXO record');
        const outputIndex = (0, contract_query_1.apiNumber)(item.index === undefined ? item.vout : item.index, 'NFT UTXO index', 0xffffffff);
        if (item.index !== undefined && item.vout !== undefined &&
            (0, contract_query_1.apiNumber)(item.vout, 'NFT UTXO vout', 0xffffffff) !== outputIndex)
            throw new Error('TBC721 Standard API: UTXO index and vout disagree');
        if (item.script_pubkey !== undefined && (0, contract_query_1.apiHex)(item.script_pubkey, 'NFT UTXO script_pubkey') !== script)
            throw new Error('TBC721 Standard API: indexed UTXO script differs from the requested script');
        return {
            txId: (0, contract_query_1.apiTxid)(item.txid, 'NFT UTXO transaction ID'),
            outputIndex,
            script,
            satoshis: (0, contract_query_1.apiNumber)(item.value, 'NFT UTXO value'),
        };
    });
    return outputs.filter(output => txId === undefined || output.txId.toLowerCase() === txId.toLowerCase())
        .sort((a, b) => a.outputIndex - b.outputIndex);
}
async function fetchTbc721StandardTxo(query, params) {
    const outputs = await fetchTxos(query, params);
    if (!outputs.length)
        throw new Error('TBC721 Standard API: no matching unspent NFT output');
    return outputs[0];
}
async function fetchTbc721StandardTxos(query, params) {
    (0, contract_query_1.apiTxid)(params?.txId, 'NFT transaction ID');
    const outputs = await fetchTxos(query, params);
    if (!outputs.length)
        throw new Error('TBC721 Standard API: no unspent mint slots; collection supply is exhausted');
    return outputs;
}
