const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const totalSupply = ethers.toBigInt("7200000000000000000000000000");

let token, staking, deployer, addr1, addr2, addr3, addr4, addr5, addr6, addr7, addr8;

const secInDay = 86400;

describe("Complex tests", function () {

  before(async function () {
    [deployer, addr1, addr2, addr3, addr4, addr5, addr6, addr7, addr8] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("EdenToken");
    token = await Token.deploy(addr1.address);

  });

  describe("Tokens ERC20", function () {

    it("It should have correct total supply", async function () {
      expect(await token.totalSupply()).to.be.equal(totalSupply);
    });

    it("It should have correct balance for owner after deply", async function () {
      expect(await token.balanceOf(addr1.address)).to.be.equal(totalSupply);
    });

    it("It should have correct miniting amount", async function () {

      const tokenToTransferd = ethers.parseUnits("2000000", "ether");
      
      await token.setRestrictionActive(1); // default false

      // transaction throttler, go ahead 24h (coz mint)
      await time.increase(1 * secInDay);
      
      await token.connect(addr1).transfer(addr2.address, tokenToTransferd)
      expect(await token.balanceOf(addr2.address)).to.be.equal(tokenToTransferd);

      await expect(token.connect(addr1).transfer(addr2.address, tokenToTransferd)).to.be.revertedWithCustomError(token, "TransactionProtectionIntervalLimit")
      
      await time.increase(60);
      
      await token.connect(addr1).transfer(addr2.address, tokenToTransferd);
      expect(await token.balanceOf(addr2.address)).to.be.equal(tokenToTransferd * 2n);

      await token.unthrottleAccount(addr1.address, true);
      await token.connect(addr1).transfer(addr2.address, tokenToTransferd);
      expect(await token.balanceOf(addr2.address)).to.be.equal(tokenToTransferd * 3n);

      await token.connect(addr1).transfer(addr2.address, tokenToTransferd);
      expect(await token.balanceOf(addr2.address)).to.be.equal(tokenToTransferd * 4n);
      
      await time.increase(60); // coz addr2 was part of the transaction above

      await token.connect(addr2).transfer(addr3.address, tokenToTransferd);
      expect(await token.balanceOf(addr3.address)).to.be.equal(tokenToTransferd);
      expect(await token.balanceOf(addr2.address)).to.be.equal(tokenToTransferd * 3n);

      await token.setMaxTransferAmount(ethers.parseUnits("10000"));
      await expect(token.connect(addr2).transfer(addr3.address, tokenToTransferd)).to.be.revertedWithCustomError(token, "MaxTransferAmountExceeded");

      await time.increase(60);

      await token.setMaxTransferAmount(0); // resetted to unlimited
      await token.connect(addr2).transfer(addr3.address, tokenToTransferd);

      const tokenToTransferd2 = ethers.parseUnits("20000", "ether");
      await expect(token.connect(addr2).transfer(addr4.address, tokenToTransferd2)).to.be.revertedWithCustomError(token, "TransactionProtectionIntervalLimit");

      await token.whitelistAccount(addr4.address, true);
      
      await expect(token.connect(addr2).transfer(addr4.address, tokenToTransferd2)).to.be.revertedWithCustomError(token, "TransactionProtectionIntervalLimit");

      await token.whitelistAccount(addr2.address, true);

      await token.connect(addr2).transfer(addr4.address, tokenToTransferd2);

      expect(await token.balanceOf(addr4.address)).to.be.equal(tokenToTransferd2);
      
      await token.setRestrictionActive(0);
      
      const tokenToTransferd3 = ethers.parseUnits("200", "ether")
      await token.connect(addr4).transfer(addr5.address, tokenToTransferd3);
      await token.connect(addr4).transfer(addr6.address, tokenToTransferd3);
      await token.connect(addr4).transfer(addr7.address, tokenToTransferd3);

    });

  });

});
;

