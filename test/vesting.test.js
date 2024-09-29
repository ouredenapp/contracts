const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { merkleRoot, treeData, poolsData } = require("../scripts/tree.tests.js");

//deployer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
//a1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8  // 
//a2: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC  // 1, 
//a3: 0x90F79bf6EB2c4f870365E785982E1f101E93b906  // 1, 3, 5
//a4: 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65  // 2, 4
//a5: 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc  // 3, 
//a6: 0x976EA74026E726554dB657fA54763abd0C3a0aa9  // 4
//a7: 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955  // 5
//a8: 0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f  // 5

const totalSupply = ethers.toBigInt("7200000000000000000000000000");

const defaultAdminRole = '0x0000000000000000000000000000000000000000000000000000000000000000';
const managerRole = ethers.keccak256(ethers.toUtf8Bytes("MANAGER_ROLE"));
//const externalManagerRole = ethers.keccak256(ethers.toUtf8Bytes("EXTERNAL_MANAGER_ROLE"));

let token, vesting, deployer, addr1, addr2, addr3, addr4, addr5, addr6, addr7, addr8;

describe("Complex tests", function () {

  // pass contracts state during tests
  before(async function () {
    [deployer, addr1, addr2, addr3, addr4, addr5, addr6, addr7, addr8] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("EdenToken");
    token = await Token.deploy(deployer.address);

    const Vesting = await ethers.getContractFactory("EdenVesting");
    await expect(Vesting.deploy(ethers.ZeroAddress)).to.be.reverted;
    vesting = await Vesting.deploy(token.target);

  });

  /*
  async function loadFixtures() {

    const [deployer, addr1, addr2, addr3, addr4, addr5, addr6, addr7, addr8 ] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("BEP20Token");
    const token = await Token.deploy();

    const Vesting = await ethers.getContractFactory("EdenVesting");
    const vesting = await Vesting.deploy(token.target);

    const Claiming = await ethers.getContractFactory("EdenClaiming");
    const claiming = await Claiming.deploy(token.target, vesting.target);

    return { token, vesting, claiming, deployer, addr1, addr2, addr3, addr4, addr5, addr6, addr7, addr8 }
    
  }  
  */

  describe("Tokens ERC20", function () {

    it("It should have correct total supply", async function () {
      expect(await token.totalSupply()).to.be.equal(totalSupply);
    });

    it("It should have correct balance for owner after deply", async function () {
      expect(await token.balanceOf(deployer.address)).to.be.equal(totalSupply);
    });

  });

  describe("Claiming", function () {

    it("Should't claim if paused", async function () {

      await expect(vesting.claimEdenToken([treeData[2][addr4.address].proof, treeData[4][addr4.address].proof], [2, 4], [treeData[2][addr4.address].value[2], treeData[4][addr4.address].value[2]])).to.be.revertedWithCustomError(vesting, "EnforcedPause");

      await vesting.unpause();

      await expect(vesting.claimEdenToken([treeData[2][addr4.address].proof, treeData[4][addr4.address].proof], [2, 4], [treeData[2][addr4.address].value[2], treeData[4][addr4.address].value[2]])).to.be.revertedWithCustomError(vesting, "MerkleTreeNotSet");

      await vesting.pause();

    });

    it("Should't claim if merkle tree not set. Set root, try to claim without pool's", async function () {

      // first unpause
      await vesting.unpause();
      await expect(vesting.claimEdenToken([treeData[2][addr4.address].proof, treeData[4][addr4.address].proof], [2, 4], [treeData[2][addr4.address].value[2], treeData[4][addr4.address].value[2]])).to.be.revertedWithCustomError(vesting, "MerkleTreeNotSet");
      await expect(vesting.setMerkleRoot(merkleRoot)).to.be.revertedWithCustomError(vesting, "ExpectedPause");

      await vesting.pause();

      // check authority for set
      await expect(vesting.connect(addr1).setMerkleRoot(merkleRoot)).to.be.revertedWithCustomError(vesting, "AccessControlUnauthorizedAccount").withArgs(addr1.address, managerRole);

      // now set authority
      await vesting.grantRole(managerRole, addr1.address);

      // set by new auth
      await vesting.connect(addr1).setMerkleRoot(merkleRoot);

      expect(await vesting.merkleRoot()).to.be.equal(merkleRoot);

      // try again 
      await expect(vesting.claimEdenToken([treeData[2][addr4.address].proof, treeData[4][addr4.address].proof], [2, 4], [treeData[2][addr4.address].value[2], treeData[4][addr4.address].value[2]])).to.be.revertedWithCustomError(vesting, "EnforcedPause");

      // now addr1 is manager too 
      await vesting.connect(addr1).unpause();

      // addr4 is not the caller
      await expect(vesting.claimEdenToken([treeData[2][addr4.address].proof, treeData[4][addr4.address].proof], [2, 4], [treeData[2][addr4.address].value[2], treeData[4][addr4.address].value[2]])).to.be.revertedWithCustomError(vesting, "MerkleTreeValidationFailed");

      // test validation
      await expect(vesting.connect(addr5).claimEdenToken([treeData[2][addr4.address].proof, treeData[4][addr4.address].proof], [2, 4], [treeData[2][addr4.address].value[2], treeData[4][addr4.address].value[2]])).to.be.revertedWithCustomError(vesting, "MerkleTreeValidationFailed");

      // reverted while try to get tge from vesting pool      
      await expect(vesting.connect(addr4).claimEdenToken([treeData[2][addr4.address].proof, treeData[4][addr4.address].proof], [2, 4], [treeData[2][addr4.address].value[2], treeData[4][addr4.address].value[2]])).to.be.revertedWithCustomError(vesting, "PoolIndexDoesNotExists").withArgs(2);

      // ---- pools

      let cliffsPeriod = [];
      let vestingPeriod = [];
      let tge = [];

      for ([index, pool] of Object.entries(poolsData)) {
        cliffsPeriod.push(pool[0]);
        vestingPeriod.push(pool[1]);
        tge.push(pool[2]);
      }

      await expect(vesting.connect(addr5).addPools(cliffsPeriod, vestingPeriod, tge)).to.be.revertedWithCustomError(vesting, "AccessControlUnauthorizedAccount").withArgs(addr5.address, managerRole);

      // mismatch array length      
      await expect(vesting.addPools(cliffsPeriod.slice(0, 2), vestingPeriod, tge)).to.be.revertedWithCustomError(vesting, "InputArrayMismatchLength");

      // added
      await expect(vesting.addPools(cliffsPeriod, vestingPeriod, tge)).to.emit(vesting, "PoolAdded");

      // started from 1
      await expect(vesting.getPool(0)).to.be.revertedWithCustomError(vesting, "PoolIndexDoesNotExists").withArgs(0);

      // verify the pools corretness
      for ([index, pool] of Object.entries(poolsData)) {
        // use eql, isn't strict here
        expect(await vesting.getPool(index)).to.be.eql([0n, ethers.toBigInt(pool[0]), 0n, ethers.toBigInt(pool[1]), 0n, ethers.toBigInt(pool[2]), true]);
      }

      await expect(vesting.getPool(50)).to.be.revertedWithCustomError(vesting, "PoolIndexDoesNotExists").withArgs(50);

      const testPoolUpdate = poolsData[3];

      testPoolUpdate[0] = testPoolUpdate[0] * 2;
      testPoolUpdate[1] = testPoolUpdate[1] - testPoolUpdate[0];
      testPoolUpdate[2] = 60;

      await expect(vesting.updatePools(['50'], [testPoolUpdate[0]], [testPoolUpdate[1]], [testPoolUpdate[2]])).to.be.revertedWithCustomError(vesting, "PoolIndexDoesNotExists");

      await expect(vesting.updatePools(['3'], [testPoolUpdate[0]], [testPoolUpdate[1]], [testPoolUpdate[2]])).to.emit(vesting, "PoolUpdated");

      expect(await vesting.getPool(3)).to.be.eql([0n, ethers.toBigInt(testPoolUpdate[0]), 0n, ethers.toBigInt(testPoolUpdate[1]), 0n, ethers.toBigInt(testPoolUpdate[2]), true]);

    });

    it("Set vesting pools and continue previous - all as flow", async function () {
      // addr1 tge: 0  0: claiming for both tge 0 work; 0 to claim 100% to vesting

      const tokenToClaiming = "1000000000000000000000000000";
      await expect(token.connect(addr1).transfer(vesting.target, tokenToClaiming)).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance")

      await expect(vesting.connect(addr4).claimEdenToken([treeData[1][addr3.address].proof, treeData[3][addr3.address].proof, treeData[5][addr3.address].proof], [1, 3, 5], [treeData[1][addr3.address].value[2], treeData[3][addr3.address].value[2], treeData[5][addr3.address].value[2]])).to.be.revertedWithCustomError(vesting, "MerkleTreeValidationFailed");

      await expect(vesting.connect(addr3).claimEdenToken([treeData[1][addr3.address].proof, treeData[3][addr3.address].proof, treeData[5][addr3.address].proof], [1, 3, 5], [treeData[1][addr3.address].value[2], treeData[3][addr3.address].value[2], treeData[5][addr3.address].value[2]])).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance")

      // now it is owner of full balance, send to vesting
      await token.connect(deployer).transfer(vesting.target, tokenToClaiming);
      expect(await token.balanceOf(vesting.target)).to.be.equal(tokenToClaiming);

      // tge 0 here, so on;y wallet added
      await expect(vesting.connect(addr4).claimEdenToken([treeData[2][addr4.address].proof, treeData[4][addr4.address].proof], [2, 4], [treeData[2][addr4.address].value[2], treeData[4][addr4.address].value[2]]))
        .to
        .emit(vesting, "WalletAdded").withArgs(addr4.address, 2, "120000000000000000000000").withArgs(addr4.address, 4, "300000000000000000000000")
        .not.to.emit(vesting, "Claimed");

      // tge addr3 -> 1 - 2% -> 3200 | 3 -> 60% -> 72000 | tge 5 - 5% | tge - 5% - 15000
      await expect(vesting.connect(addr3).claimEdenToken([treeData[1][addr3.address].proof, treeData[3][addr3.address].proof, treeData[5][addr3.address].proof], [1, 3, 5], [treeData[1][addr3.address].value[2], treeData[3][addr3.address].value[2], treeData[5][addr3.address].value[2]]))
        .to
        .emit(vesting, "Claimed").withArgs(addr3.address, 1, "3200" + "000000000000000000").withArgs(addr3.address, 3, "72000" + "000000000000000000").withArgs(addr3.address, 5, "15000" + "000000000000000000")
        .emit(vesting, "WalletAdded").withArgs(addr3.address, 1, "156800" + "000000000000000000").withArgs(addr3.address, 3, "48000" + "000000000000000000").withArgs(addr3.address, 5, "285000" + "000000000000000000")

      await expect(vesting.connect(addr3).claimEdenToken([treeData[1][addr3.address].proof, treeData[3][addr3.address].proof, treeData[5][addr3.address].proof], [1, 3, 5], [treeData[1][addr3.address].value[2], treeData[3][addr3.address].value[2], treeData[5][addr3.address].value[2]]))
        .to.be.revertedWithCustomError(vesting, "AlreadyClaimed").withArgs(addr3.address, 1);         // on the first iteration

      await expect(vesting.connect(addr3).claimEdenToken([treeData[3][addr3.address].proof, treeData[1][addr3.address].proof, treeData[5][addr3.address].proof], [3, 1, 5], [treeData[3][addr3.address].value[2], treeData[1][addr3.address].value[2], treeData[5][addr3.address].value[2]]))
        .to.be.revertedWithCustomError(vesting, "AlreadyClaimed").withArgs(addr3.address, 3);         // on the first iteration, ordering

      // ----------------------------------

      // check claiming
      expect(await token.balanceOf(addr3.address)).to.be.equal("90200" + "000000000000000000");

      // check vesting

      expect(await vesting.walletsInVesting(1, addr3.address)).to.be.equal("156800000000000000000000");
      expect(await vesting.walletsInVesting(3, addr3.address)).to.be.equal("48000000000000000000000");
      expect(await vesting.walletsInVesting(5, addr3.address)).to.be.equal("285000000000000000000000");

      expect(await vesting.walletsInVesting(7, addr3.address)).to.be.equal("0"); //not set

      expect(await vesting.walletPools(addr3.address, 0)).to.be.equal(1);
      expect(await vesting.walletPools(addr3.address, 1)).to.be.equal(3);
      expect(await vesting.walletPools(addr3.address, 2)).to.be.equal(5);

      //expect(await vesting.walletPools(addr3.address, 3)).to.be.revertedWithoutReason(); // - ok, reverted, but some problems with catching it here

      // TO DO CLIFF START
      // CLAIM AFTER CLIFF START
      // VESTING CALCULATIOn
      // RELEASE AL or singular

      // cliff still not set yet, we already have pools and wallets in vesting

      // must be 0 for alle the cases
      expect(await vesting.releasedAmount(3, addr5.address)).to.be.equal(0);
      expect(await vesting.releasedAmount(83, addr5.address)).to.be.equal(0);
      expect(await vesting.releasedAmount(1, addr1.address)).to.be.equal(0);

      // cliff still not set      
      // addr4 -> pools: 2,4 -> all in vesting, no claim, 120000000000000000000000, 300000000000000000000000
      // addr3 -> pools: 1,3,5 -> 156800000000000000000000, 48000000000000000000000, 285000000000000000000000

      let [poolsIds, remaining] = await vesting.vestingAmountRemaining(addr4.address);

      expect(poolsIds).to.be.eql([2n, 4n]);
      expect(remaining).to.be.eql([120000000000000000000000n, 300000000000000000000000n]);

      [poolsIds, remaining] = await vesting.vestingAmountRemaining(addr3.address);

      // must be same as wallet in vesting above, cliff not started yet
      expect(poolsIds).to.be.eql([1n, 3n, 5n]);
      expect(remaining).to.be.eql([156800000000000000000000n, 48000000000000000000000n, 285000000000000000000000n]);

      const testedLength = poolsIds.length;
      for (let i = 0; i < testedLength; i++) {
        expect(await vesting.walletsInVesting(poolsIds[i], addr3.address)).to.be.equal(remaining[i]);
        expect(await vesting['vestingAmountRemaining(address,uint256)'](addr3.address, poolsIds[i])).to.be.equal(remaining[i]);
      }
      // 1920081493 5th Nov 2030
      // timestamp is not important here, we check cliff starts
      await expect(vesting["releasable(address,uint256)"](addr5.address, 1920081493)).to.be.revertedWithCustomError(vesting, 'CliffNotSetYet');

      // not in vesting, we dont check, returns 0
      let [pools, amount] = await vesting["releasable(address)"](addr5.address);
      expect(pools.length).to.be.equal(0);
      expect(amount.length).to.be.equal(0);

      await expect(vesting["releasable(address)"](addr3.address)).to.be.revertedWithCustomError(vesting, 'CliffNotSetYet');

      await expect(vesting["getWalletStats(address, uint256)"](addr3.address, 1920081493)).to.be.revertedWithCustomError(vesting, 'CliffNotSetYet');

      [pools, amount] = await vesting["getWalletStats(address, uint256)"](addr5.address, 1920081493);
      expect(pools.length).to.be.equal(0);
      expect(amount.length).to.be.equal(0);

      await expect(vesting["getWalletStats(address, uint256, uint256)"](addr5.address, 2, 1920081493)).to.be.revertedWithCustomError(vesting, 'CliffNotSetYet');


      await expect(vesting.connect(addr5).release(2)).to.be.revertedWithCustomError(vesting, 'CliffNotSetYet');

      await expect(vesting.connect(addr5).releaseAll()).to.be.revertedWithCustomError(vesting, 'CliffNotSetYet');


      await expect(vesting.connect(addr2).addVestingPoolWallet(addr4.address, "2", "1000000000000")).to.be.revertedWithCustomError(vesting, "AccessControlUnauthorizedAccount").withArgs(addr2.address, managerRole);

      await expect(vesting.addVestingPoolWallet(addr4.address, 2, "1000000000000")).to.be.revertedWithCustomError(vesting, "WalletAlreadyExists").withArgs(addr4.address, "2");

      await expect(vesting.addVestingPoolWallet(addr4.address, 12, "1000000000000")).to.be.revertedWithCustomError(vesting, "PoolIndexDoesNotExists").withArgs("12");

      expect(await vesting.getWalletPools(addr3.address)).to.be.eql([1n, 3n, 5n]);

      expect(await vesting.getWalletPools(addr7.address)).to.be.eql([]);

      // manually added, 
      await expect(vesting.addVestingPoolWallet(addr8.address, 10, "100000" + "000000000000000000")).to.emit(vesting, "WalletAdded").withArgs(addr8.address, 10, "100000" + "000000000000000000");
      await expect(vesting.addVestingPoolWallet(addr8.address, 9, "200000" + "000000000000000000")).to.emit(vesting, "WalletAdded").withArgs(addr8.address, 9, "200000" + "000000000000000000");
      //below added during vesting is active

      expect(await vesting.getWalletPools(addr8.address)).to.be.eql([10n, 9n]);
      await expect(vesting.removeVestingPoolWallet(addr8.address, 10)).to.emit(vesting, 'WalletDeleted').withArgs(addr8.address, 10);

      expect(await vesting.getWalletPools(addr8.address)).to.be.eql([9n]);
      await expect(vesting.removeVestingPoolWallet(addr8.address, 9)).to.emit(vesting, 'WalletDeleted').withArgs(addr8.address, 9);

      expect(await vesting.getWalletPools(addr8.address)).to.be.eql([]);

      //--------------------------------------------------      

      await expect(vesting.setCliffStart()).to.emit(vesting, "VestingCliffStarted");
      const cliffBlockTimeStamp = await time.latest();

      for ([index, pool] of Object.entries(poolsData)) {
        // use eql, isn't strict here
        const cliffEnd = ethers.toBigInt(cliffBlockTimeStamp) + ethers.toBigInt(pool[0]);
        expect(await vesting.getPool(index)).to.be.eql([ethers.toBigInt(cliffBlockTimeStamp), ethers.toBigInt(pool[0]), cliffEnd, ethers.toBigInt(pool[1]), cliffEnd + ethers.toBigInt(pool[1]), ethers.toBigInt(pool[2]), true]);
      }

      // now cliff is set, time is much more after vesting end to set cliffs.        
      const tryAccount = addr3;
      const tryPoolIndex = 2;
      const tryPool = 5;

      let [_cliffStart, _cliffPeriod, _cliffEnd, _vestingPeriod, _vestingEnd, _tge, _setted] = await vesting.getPool((await vesting.getWalletPools(tryAccount.address))[tryPoolIndex]);  // pool 1
      //console.log(_cliffStart, _cliffPeriod, _cliffEnd, _vestingPeriod, _vestingEnd, _tge, _setted);
      //console.log(await vesting.getPool(1));

      const _rewardPerWallet = await vesting.walletsInVesting(tryPool, tryAccount);

      // cliif not end
      expect(await vesting.vestingSchedule(tryAccount.address, tryPool, _cliffEnd - ethers.toBigInt(1000))).to.be.equal(0);

      // full realased here
      expect(await vesting.vestingSchedule(tryAccount.address, tryPool, 1920081493)).to.be.equal(await vesting.walletsInVesting(tryPool, tryAccount));

      const period_25 = _cliffEnd + ((_vestingEnd - _cliffEnd) / ethers.toBigInt("4"));
      expect(await vesting.vestingSchedule(tryAccount.address, tryPool, period_25)).to.be.equal(_rewardPerWallet / ethers.toBigInt("4"));

      const period_50 = _cliffEnd + ((_vestingEnd - _cliffEnd) / ethers.toBigInt("2"));
      expect(await vesting.vestingSchedule(tryAccount.address, tryPool, period_50)).to.be.equal(_rewardPerWallet / ethers.toBigInt("2"));

      const period_75 = _cliffEnd + (((_vestingEnd - _cliffEnd) / ethers.toBigInt("4")) * ethers.toBigInt("3"));
      expect(await vesting.vestingSchedule(tryAccount.address, tryPool, period_75)).to.be.equal((ethers.toBigInt("3") * _rewardPerWallet) / ethers.toBigInt("4"));

      const period_100 = _vestingEnd + ethers.toBigInt(100);
      expect(await vesting.vestingSchedule(tryAccount.address, tryPool, period_100)).to.be.equal(_rewardPerWallet); // all

      // cliff not end
      const period_during_cliff = _cliffStart + _cliffPeriod / ethers.toBigInt(2);
      expect(await vesting.vestingSchedule(tryAccount.address, tryPool, period_during_cliff)).to.be.equal(0); // 0

      //check other set cliff when it is open
      expect(await vesting["releasable(address, uint256)"](tryAccount.address, tryPool)).to.be.equal(0);

      expect(await vesting["releasable(address, uint256)"](tryAccount.address, tryPool)).to.be.equal(0);

      [pools, amount] = await vesting["releasable(address)"](addr5.address);
      expect(pools.length).to.be.equal(0);
      expect(amount.length).to.be.equal(0);

      expect(await vesting["getWalletStats(address, uint256, uint256)"](tryAccount.address, tryPool, period_50)).to.be.eql([_rewardPerWallet, _rewardPerWallet / ethers.toBigInt("2"), 0n, _rewardPerWallet]);
      expect(await vesting["getWalletStats(address, uint256, uint256)"](tryAccount.address, tryPool, period_25)).to.be.eql([_rewardPerWallet, _rewardPerWallet / ethers.toBigInt("4"), 0n, _rewardPerWallet]);
      expect(await vesting["getWalletStats(address, uint256, uint256)"](tryAccount.address, tryPool, period_75)).to.be.eql([_rewardPerWallet, ethers.toBigInt("3") * _rewardPerWallet / ethers.toBigInt("4"), 0n, _rewardPerWallet]);

      // cliff is set now
      await expect(vesting.connect(addr7).claimEdenToken([treeData[5][addr7.address].proof], [5], [treeData[5][addr7.address].value[2], "111"])).to.be.revertedWithCustomError(vesting, "InputArrayMismatchLength");

      await expect(vesting.connect(addr7).claimEdenToken([treeData[5][addr7.address].proof], [6], [treeData[5][addr7.address].value[2]])).to.be.revertedWithCustomError(vesting, "MerkleTreeValidationFailed");
      await expect(vesting.connect(addr4).claimEdenToken([treeData[5][addr7.address].proof], [5], [treeData[5][addr7.address].value[2]])).to.be.revertedWithCustomError(vesting, "MerkleTreeValidationFailed");

      // 5% - 100000 -> 5000
      await expect(vesting.connect(addr7).claimEdenToken([treeData[5][addr7.address].proof], [5], [treeData[5][addr7.address].value[2]]))
        .to
        .emit(vesting, "Claimed").withArgs(addr7.address, 5, "5000" + "000000000000000000")
        .emit(vesting, "WalletAdded").withArgs(addr7.address, 5, "95000" + "000000000000000000");

      const _rewardPerWallet_1 = await vesting.walletsInVesting(5, addr7.address);

      [_cliffStart, _cliffPeriod, _cliffEnd, _vestingPeriod, _vestingEnd, _tge, _setted] = await vesting.getPool(5);  // pool5

      const period_50_1 = _cliffEnd + ((_vestingEnd - _cliffEnd) / ethers.toBigInt("2"));
      expect(await vesting.vestingSchedule(addr7.address, 5, period_50_1)).to.be.equal(_rewardPerWallet_1 / ethers.toBigInt("2"));

      //--------------------------------------------------
      const increaseTime = 38880000; // 15 month

      await time.increase(increaseTime);

      let releasableAmount = await vesting["releasable(address, uint256)"](tryAccount.address, tryPool);

      expect(releasableAmount).to.be.equal(await vesting.vestingSchedule(tryAccount.address, tryPool, (await time.latest())));

      //console.log(await vesting.walletsInVesting(tryPool, tryAccount.address));

      await expect(vesting.release(tryPool)).to.be.revertedWithCustomError(vesting, "WalletNotSet");

      // important to check does reward is correct with mined block timestamp
      await time.setNextBlockTimestamp(await time.latest() + 60); // move one block forward
      releasableAmount = await vesting.vestingSchedule(tryAccount.address, tryPool, (await time.latest() + 60)); // must be checked like that, because releasable give amount from the next block 

      await expect(vesting.connect(tryAccount).release(tryPool))
        .to
        .emit(vesting, "Released").withArgs(tryAccount.address, tryPool, releasableAmount)
        .emit(token, "Transfer").withArgs(vesting.target, tryAccount.address, releasableAmount)
        ;

      expect(await vesting.releasedAmount(tryPool, tryAccount.address)).to.be.equal(releasableAmount);

      await time.increase(864000); // 10 dayt

      const releasableAmountAfter = await vesting.vestingSchedule(tryAccount.address, tryPool, (await time.latest()));
      const relasableAfter = await vesting["releasable(address,uint256)"](tryAccount.address, tryPool);

      expect((await vesting.releasedAmount(tryPool, tryAccount.address)) + relasableAfter).to.be.equal(releasableAmountAfter);

      // if released earlier cant remove
      await expect(vesting.connect(addr8).removeVestingPoolWallet(tryAccount.address, tryPool)).to.be.revertedWithCustomError(vesting, 'AccessControlUnauthorizedAccount');
      await expect(vesting.removeVestingPoolWallet(addr6.address, 9)).to.be.revertedWithCustomError(vesting, 'WalletNotSet');
      await expect(vesting.removeVestingPoolWallet(tryAccount.address, tryPool)).to.be.revertedWithCustomError(vesting, 'CannotRemoveWalletFromVestingPool').withArgs(tryAccount.address, tryPool);

      // releaseAll
      await expect(vesting.releaseAll()).to.be.revertedWithCustomError(vesting, "NoRewardToRelease");
      await expect(vesting.connect(addr5).releaseAll()).to.be.revertedWithCustomError(vesting, "NoRewardToRelease");

      await time.setNextBlockTimestamp(await time.latest() + 3600); // move one block forward
      let releasableAmount1 = await vesting.vestingSchedule(tryAccount.address, 1, (await time.latest() + 3600)); // no released yet
      let releasableAmount3 = await vesting.vestingSchedule(tryAccount.address, 3, (await time.latest() + 3600)); // no released yet
      let releasableAmount5 = await vesting.vestingSchedule(tryAccount.address, 5, (await time.latest() + 3600)) - (await vesting.releasedAmount(5, tryAccount.address)); // released earlier

      await expect(vesting.connect(tryAccount).releaseAll())
        .to
        .emit(vesting, "Released").withArgs(tryAccount.address, 1, releasableAmount1)
        .emit(vesting, "Released").withArgs(tryAccount.address, 3, releasableAmount3)
        .emit(vesting, "Released").withArgs(tryAccount.address, 5, releasableAmount5)
        .emit(token, "Transfer").withArgs(vesting.target, tryAccount.address, releasableAmount1 + releasableAmount3 + releasableAmount5);
      ;

      await time.increase(increaseTime); // next 15 months, after vesting end 3, 5, 1 is not end   
      await time.setNextBlockTimestamp(await time.latest() + 3600); // move one block forward

      releasableAmount1 = await vesting.vestingSchedule(tryAccount.address, 1, (await time.latest() + 3600)) - (await vesting.releasedAmount(1, tryAccount.address)); // released earlier
      releasableAmount3 = await vesting.vestingSchedule(tryAccount.address, 3, (await time.latest() + 3600)) - (await vesting.releasedAmount(3, tryAccount.address)); // released earlier
      releasableAmount5 = await vesting.vestingSchedule(tryAccount.address, 5, (await time.latest() + 3600)) - (await vesting.releasedAmount(5, tryAccount.address)); // released earlier
      //console.log(releasableAmount1, releasableAmount3, releasableAmount5);
      await expect(vesting.connect(tryAccount).releaseAll())
        .to
        .emit(vesting, "Released").withArgs(tryAccount.address, 1, releasableAmount1)
        .emit(vesting, "Released").withArgs(tryAccount.address, 3, releasableAmount3)
        .emit(vesting, "Released").withArgs(tryAccount.address, 5, releasableAmount5)
        .emit(token, "Transfer").withArgs(vesting.target, tryAccount.address, releasableAmount1 + releasableAmount3 + releasableAmount5);
      ;

      releasableAmount1 = await vesting.vestingSchedule(tryAccount.address, 1, (await time.latest())) - (await vesting.releasedAmount(1, tryAccount.address)); // released earlier
      releasableAmount3 = await vesting.vestingSchedule(tryAccount.address, 3, (await time.latest())) - (await vesting.releasedAmount(3, tryAccount.address)); // released earlier
      releasableAmount5 = await vesting.vestingSchedule(tryAccount.address, 5, (await time.latest())) - (await vesting.releasedAmount(5, tryAccount.address)); // released earlier

      //console.log(releasableAmount1, releasableAmount3, releasableAmount5);

      await time.increase(increaseTime); // next 15 months, after all vesting end 1, 3, 5
      await time.setNextBlockTimestamp(await time.latest() + 3600); // move one block forward

      releasableAmount1 = await vesting.vestingSchedule(tryAccount.address, 1, (await time.latest())) - (await vesting.releasedAmount(1, tryAccount.address)); // released earlier
      releasableAmount3 = await vesting.vestingSchedule(tryAccount.address, 3, (await time.latest())) - (await vesting.releasedAmount(3, tryAccount.address)); // released earlier
      releasableAmount5 = await vesting.vestingSchedule(tryAccount.address, 5, (await time.latest())) - (await vesting.releasedAmount(5, tryAccount.address)); // released earlier
      //console.log(releasableAmount1, releasableAmount3, releasableAmount5);
      await expect(vesting.connect(tryAccount).releaseAll())
        .to
        .emit(vesting, "Released").withArgs(tryAccount.address, 1, releasableAmount1)
        .emit(token, "Transfer").withArgs(vesting.target, tryAccount.address, releasableAmount1);
      ;

      releasableAmount1 = await vesting.vestingSchedule(tryAccount.address, 1, (await time.latest())) - (await vesting.releasedAmount(1, tryAccount.address)); // released earlier
      releasableAmount3 = await vesting.vestingSchedule(tryAccount.address, 3, (await time.latest())) - (await vesting.releasedAmount(3, tryAccount.address)); // released earlier
      releasableAmount5 = await vesting.vestingSchedule(tryAccount.address, 5, (await time.latest())) - (await vesting.releasedAmount(5, tryAccount.address)); // released earlier

      expect(releasableAmount1).to.be.equal(0);
      expect(releasableAmount3).to.be.equal(0);
      expect(releasableAmount5).to.be.equal(0);

      const amountInVesting1 = await vesting.walletsInVesting(1, tryAccount.address) 
      const amountInVesting3 = await vesting.walletsInVesting(3, tryAccount.address) 
      const amountInVesting5 = await vesting.walletsInVesting(5, tryAccount.address) 
      
      const aHundred = ethers.toBigInt("100");
      //console.log((aHundred - await vesting.getPoolTge(3)));

      expect(await token.balanceOf(tryAccount.address)).to.be.equal("580000000000000000000000");
      
      expect(await token.balanceOf(tryAccount.address)).to.be.equal(
        ((amountInVesting1 * aHundred) / (aHundred - await vesting.getPoolTge(1)))
        + ((amountInVesting3) * aHundred / (aHundred - await vesting.getPoolTge(3)))
        + ((amountInVesting5) * aHundred / (aHundred - await vesting.getPoolTge(5)))
      );

      // add wallet to vesting after vesting end
      await vesting.connect(addr1).addVestingPoolWallet(addr8.address, "10", 10000000000000000000000n);
      [_cliffStart, _cliffPeriod, _cliffEnd, _vestingPeriod, _vestingEnd, _tge, _setted] = await vesting.getPool((await vesting.getWalletPools(addr8.address))[0]);  // pool 10 here

      const period_25_2 = _cliffEnd + ((_vestingEnd - _cliffEnd) / ethers.toBigInt("4"));
      expect(await vesting.vestingSchedule(addr8.address, 10, period_25_2)).to.be.equal(10000000000000000000000n / ethers.toBigInt("4"));

      expect(await vesting["releasable(address,uint256)"](addr8.address, 10)).to.be.equal(10000000000000000000000n);

    });

  });
});
