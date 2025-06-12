var contract = module.exports;

contract.version = 'v' + require('./package.json').version;
contract.versionGuard = function (version) {
  if (version !== undefined) {
    var message = `
      More than one instance of tbc found.
      Please make sure to require tbc and check that submodules do
      not also include their own tbc dependency.`;
    console.warn(message);
  }
};
contract.versionGuard(globalThis.contract);
globalThis.contract = contract;
contract.FT = require("./lib/contract/ft.js");
contract.poolNFT = require("./lib/contract/poolNFT.js");
contract.poolNFT2 = require("./lib/contract/poolNFT2.0.js");
contract.API = require("./lib/api/api.js");
contract.NFT = require("./lib/contract/nft.js");
contract.MultiSig = require("./lib/contract/multiSig.js");

contract.buildUTXO = require("./lib/util/util").buildUTXO;
contract.buildFtPrePreTxData = require("./lib/util/util").buildFtPrePreTxData;
contract.selectTXfromLocal = require("./lib/util/util").selectTXfromLocal;
contract.fetchInBatches = require("./lib/util/util").fetchInBatches;
contract.fetchWithRetry = require("./lib/util/util").fetchWithRetry;