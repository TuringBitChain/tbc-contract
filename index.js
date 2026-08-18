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
contract.TBC20 = require("./lib/contract/tbc20.js");
var tokenValidator = require("./lib/validator/tbc20.js");
// The validator core is shared by TBC20 and registered ordinary FT v1-v4.
// Only expose the protocol-neutral public names from the package root.
contract.TokenValidator = tokenValidator.TokenValidator || tokenValidator;
contract.TokenValidationError =
  tokenValidator.TokenValidationError ||
  contract.TokenValidator.TokenValidationError;
contract.poolNFT = require("./lib/contract/poolNFT.js");
contract.poolNFT2 = require("./lib/contract/poolNFT2.0.js");
contract.API = require("./lib/api/api.js");
contract.NFT = require("./lib/contract/nft.js");
contract.MultiSig = require("./lib/contract/multiSig.js");
contract.piggyBank = require("./lib/contract/piggyBank.js");
contract.orderBook = require("./lib/contract/orderBook.js");
contract.HTLC = require("./lib/contract/htlc.js");
contract.stableCoin = require("./lib/contract/stableCoin.js");

contract.buildUTXO = require("./lib/util/util").buildUTXO;
contract.buildFtPrePreTxData = require("./lib/util/util").buildFtPrePreTxData;
contract.getFtBalanceFromTape = require("./lib/util/util").getFtBalanceFromTape;
contract.selectTXfromLocal = require("./lib/util/util").selectTXfromLocal;
contract.fetchInBatches = require("./lib/util/util").fetchInBatches;
contract.fetchWithRetry = require("./lib/util/util").fetchWithRetry;
contract.getOpCode = require("./lib/util/util").getOpCode;
contract.getLpCostAddress = require("./lib/util/util").getLpCostAddress;
contract.getLpCostAmount = require("./lib/util/util").getLpCostAmount;
contract.isLock = require("./lib/util/util").isLock;
contract.fetchTBCLockTime = require("./lib/util/util").fetchTBCLockTime;
contract.safeJSONParse = require("./lib/util/util").safeJSONParse;
contract.parseDecimalToBigInt = require("./lib/util/util").parseDecimalToBigInt;
contract.fillCharLengthInFT = require("./lib/util/util").fillCharLengthInFT;
contract.isCoinCodeScript = require("./lib/util/util").isCoinCodeScript;
