'use strict'

var contract = module.exports

// module information
contract.version = 'v' + require('./package.json').version
contract.versionGuard = function (version) {
  if (version !== undefined) {
    var message = `
      More than one instance of tbc found.
      Please make sure to require tbc and check that submodules do
      not also include their own tbc dependency.`
    console.warn(message)
  }
}
contract.versionGuard(globalThis.contract)
globalThis.contract = contract.version

contract.FT = require('./lib/contract/ft')
contract.poolNFT = require('./lib/contract/poolNFT')
contract.API = require('./lib/api/api')
contract.NFT = require('./lib/contract/nft')