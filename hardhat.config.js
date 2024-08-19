require("@nomicfoundation/hardhat-toolbox");
require("hardhat-gas-reporter");
require('dotenv').config();

const mnemonic = process.env.DEPLOYER_MNEMONIC;

task("get-address-hd-wallet", "Get address and private key from loaded mnemonics by index.")
  .addParam("index", "Wallet index")
  .setAction((taskArgs) => { 
      const index = parseInt(taskArgs.index);      
      const hdNode = hre.ethers.HDNodeWallet.fromMnemonic(hre.ethers.Mnemonic.fromPhrase(mnemonic), `m/44'/60'/0'/0/${index}`)
      console.log(index + ' address: ' + hdNode.address);
      console.log(index + ' private key: ' + hdNode.privateKey);
  });

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
        {
          version: "0.8.24",
          settings: {
            optimizer: { 
              enabled: true,
              runs: 200,
            }
            //evmVersion: 'london',
          } 
        },  
        {
          version: "0.5.16",
          settings: {
            optimizer: { 
              enabled: true,
              runs: 200,
            }
            //evmVersion: 'london',
          } 
        },      
    ]
  },
  etherscan: {
    apiKey: {
      bscTestnet: process.env.BSC_TESTNET_APIKEY,
      bsc: process.env.BSC_TESTNET_APIKEY
    }
  },
  gasReporter: {
    currency: 'USD',
    gasPrice: 10,
    enabled: true,
  },
  networks: {
  	localhost: {
      url: "http://127.0.0.1:8545",
    },
    hardhat: {
    },
    testnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      gasPrice: "auto",
      accounts: {mnemonic: mnemonic} 
    },
    mainnet: {
      url: "https://bsc-dataseed.binance.org/",
      chainId: 56,
      gasPrice: "auto",
      accounts: {mnemonic: mnemonic}
    }    
  }
}
