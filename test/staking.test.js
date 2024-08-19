const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const totalSupply = ethers.toBigInt("7200000000000000000000000000");

const defaultAdminRole = '0x0000000000000000000000000000000000000000000000000000000000000000';
const managerRole = ethers.keccak256(ethers.toUtf8Bytes("MANAGER_ROLE"));

let token, staking, deployer, addr1, addr2, addr3, addr4, addr5, addr6, addr7, addr8;

const mainStakingPeriodsConfig = [
  [30, 60, 92, 183, 365000],
  [300, 450, 600, 900, 1200]
];

const basicStakingConfig = [
  [90, 210, 365],
  [2000, 3000, 4000],
  [ethers.parseUnits("10000000", "ether"),ethers.parseUnits("30000000", "ether"),ethers.parseUnits("50000000", "ether")]
];

//console.log(mainStakingPeriodsConfig, basicStakingConfig);

const secInDay = 86400;

describe("Complex tests", function () {

  // pass contracts state during tests
  before(async function () {
    [deployer, addr1, addr2, addr3, addr4, addr5, addr6, addr7, addr8] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("EdenToken");
    token = await Token.deploy(deployer.address);
    
    //const Token = await ethers.getContractFactory("BEP20Token");
    //token = await Token.deploy();

    const Staking = await ethers.getContractFactory("EdenStaking");
    staking = await Staking.deploy(token.target, basicStakingConfig[0], basicStakingConfig[1], basicStakingConfig[2], mainStakingPeriodsConfig[0], mainStakingPeriodsConfig[1]);

  });

  describe("Tokens ERC20", function () {

    it("It should have correct total supply", async function () {
      expect(await token.totalSupply()).to.be.equal(totalSupply);
    });

    it("It should have correct balance for owner after deply", async function () {
      expect(await token.balanceOf(deployer.address)).to.be.equal(totalSupply);
    });

    it("It should have correct miniting amount", async function () {

      const tokenToTransferd = ethers.parseUnits("200000000");
      
      await token.connect(deployer).transfer(addr1.address, tokenToTransferd)
      expect(await token.balanceOf(addr1.address)).to.be.equal(tokenToTransferd);
      await token.connect(deployer).transfer(addr2.address, tokenToTransferd)
      expect(await token.balanceOf(addr2.address)).to.be.equal(tokenToTransferd);
      await token.connect(deployer).transfer(addr3.address, tokenToTransferd)
      expect(await token.balanceOf(addr3.address)).to.be.equal(tokenToTransferd);
      await token.connect(deployer).transfer(addr4.address, tokenToTransferd)
      expect(await token.balanceOf(addr4.address)).to.be.equal(tokenToTransferd);
      await token.connect(deployer).transfer(addr5.address, tokenToTransferd)
      expect(await token.balanceOf(addr5.address)).to.be.equal(tokenToTransferd);
      await token.connect(deployer).transfer(addr6.address, tokenToTransferd)
      expect(await token.balanceOf(addr6.address)).to.be.equal(tokenToTransferd);
      await token.connect(deployer).transfer(addr7.address, tokenToTransferd)
      expect(await token.balanceOf(addr7.address)).to.be.equal(tokenToTransferd);

    });

  });

  describe("Basic Staking", function () {

    it("It should have correct configuration", async function () {

      const basicConfigLength = basicStakingConfig.length;
    
      for(let i = 0; i < basicConfigLength; i++) {
         const configItem = await staking.basicStakingConfigs(i);
         expect(configItem).to.be.eql([ethers.toBigInt(basicStakingConfig[0][i]),ethers.toBigInt(basicStakingConfig[1][i]),basicStakingConfig[2][i]]);
      }

      await expect(staking.updateBasicStaking(3, 222, 3300, ethers.parseUnits("33333333", "ether"))).to.be.revertedWithCustomError(staking, "BasicStakingConfigDoesNotExists");

      await expect(staking.updateBasicStaking(1, 222, 3300, ethers.parseUnits("33333333", "ether"))).to.emit(staking, "BasicStakingConfigUpdated").withArgs(1, 222, 3300, ethers.parseUnits("33333333", "ether"));

      const configItem = await staking.basicStakingConfigs(1);
      expect(configItem)
        .to
        .be.eql([ethers.toBigInt(222),ethers.toBigInt(3300),ethers.parseUnits("33333333", "ether")])        
      ;

      await staking.updateBasicStaking(1, 210, 3000, ethers.parseUnits("30000000", "ether"));
      const configItemRollbacked = await staking.basicStakingConfigs(1);
      expect(configItemRollbacked).to.be.eql([ethers.toBigInt(basicStakingConfig[0][1]),ethers.toBigInt(basicStakingConfig[1][1]),basicStakingConfig[2][1]]);

      await expect(staking.addBasicStaking(720, 6000, ethers.parseUnits("100000000", "ether"))).to.emit(staking, "BasicStakingConfigAdded").withArgs(3, 720, 6000, ethers.parseUnits("100000000", "ether"));
      const configItemAdded = await staking.basicStakingConfigs(3);
      
      expect(configItemAdded).to.be.eql([ethers.toBigInt(720),ethers.toBigInt(6000),ethers.parseUnits("100000000", "ether")]);
 
    });

    it("It should't stake correct", async function () {

      await expect(staking.connect(addr4).addBasicStaking(720, 6000, ethers.parseUnits("100000000", "ether"))).to.be.revertedWithCustomError(staking, "AccessControlUnauthorizedAccount").withArgs(addr4.address, managerRole);


      // for default amount
      await expect(staking.connect(addr1).stakeBasic(0, ethers.parseUnits("1500", "ether"))).to.be.revertedWithCustomError(staking, "BasicStakingInvalidAmount").withArgs(addr1.address, 0, ethers.parseUnits("1500", "ether"));
      await expect(staking.connect(addr1).stakeBasic(0, ethers.parseUnits("3000000", "ether"))).to.be.revertedWithCustomError(staking, "BasicStakingInvalidAmount").withArgs(addr1.address, 0, ethers.parseUnits("3000000", "ether"));


      await staking.setBasicStakingMinAmount(ethers.parseUnits("30000", "ether"));
      expect(await staking.basicStakingMinAmount()).to.be.eql(ethers.parseUnits("30000", "ether"));

      // back to default
      await staking.setBasicStakingMinAmount(ethers.parseUnits("25000", "ether"));
      expect(await staking.basicStakingMinAmount()).to.be.eql(ethers.parseUnits("25000", "ether"));

      await staking.setBasicStakingMaxAmount(ethers.parseUnits("3000000", "ether"));
      expect(await staking.basicStakingMaxAmount()).to.be.eql(ethers.parseUnits("3000000", "ether"));

      // back to default
      await staking.setBasicStakingMaxAmount(ethers.parseUnits("2500000", "ether"));
      expect(await staking.basicStakingMaxAmount()).to.be.eql(ethers.parseUnits("2500000", "ether"));

      await expect(staking.connect(addr3).setBasicStakingMaxAmount(ethers.parseUnits("2500000", "ether"))).to.be.revertedWithCustomError(staking, "AccessControlUnauthorizedAccount").withArgs(addr3.address, managerRole);

    });

    it("It should stake correct now", async function () {

      
      await expect(staking.connect(addr1).stakeBasic(0, ethers.parseUnits("2000000", "ether"))).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance")

      await token.connect(addr1).approve(staking.target, ethers.parseUnits("2000000", "ether"));

      await expect(staking.connect(addr1).stakeBasic(0, ethers.parseUnits("2000000", "ether"))).to.emit(staking, "BasicStakingAdded").withArgs(addr1.address, 0, ethers.parseUnits("2000000", "ether"));
    
      expect(await staking.basicStakes(0, addr1.address)).to.be.eql([ethers.parseUnits("2000000", "ether"), ethers.toBigInt(await time.latest()), true]);

      expect(await staking.basicStakesTotalAmount(0)).to.be.eql(ethers.parseUnits("2000000", "ether"));
      expect(await staking.basicStakesTotalAmount(1)).to.be.eql(ethers.parseUnits("0", "ether"));
      expect(await staking.basicStakesTotalAmount(2)).to.be.eql(ethers.parseUnits("0", "ether"));
      
      expect(await token.balanceOf(staking.target)).to.be.equal(ethers.parseUnits("2000000", "ether"));

      await token.connect(addr2).approve(staking.target, ethers.parseUnits("2000000", "ether"));
      await expect(staking.connect(addr2).stakeBasic(0, ethers.parseUnits("2000000", "ether"))).to.emit(staking, "BasicStakingAdded").withArgs(addr2.address, 0, ethers.parseUnits("2000000", "ether"));

      await token.connect(addr3).approve(staking.target, ethers.parseUnits("2000000", "ether"));
      await expect(staking.connect(addr3).stakeBasic(0, ethers.parseUnits("2000000", "ether"))).to.emit(staking, "BasicStakingAdded").withArgs(addr3.address, 0, ethers.parseUnits("2000000", "ether"));

      await token.connect(addr4).approve(staking.target, ethers.parseUnits("2000000", "ether"));
      await expect(staking.connect(addr4).stakeBasic(0, ethers.parseUnits("2000000", "ether"))).to.emit(staking, "BasicStakingAdded").withArgs(addr4.address, 0, ethers.parseUnits("2000000", "ether"));

      await token.connect(addr5).approve(staking.target, ethers.parseUnits("1500000", "ether"));
      await expect(staking.connect(addr5).stakeBasic(0, ethers.parseUnits("1500000", "ether"))).to.emit(staking, "BasicStakingAdded").withArgs(addr5.address, 0, ethers.parseUnits("1500000", "ether"));

      expect(await staking.basicStakesTotalAmount(0)).to.be.eql(ethers.parseUnits("9500000", "ether"));
      expect(await token.balanceOf(staking.target)).to.be.equal(ethers.parseUnits("9500000", "ether"));

      await token.connect(addr6).approve(staking.target, ethers.parseUnits("1500000", "ether"));
      await expect(staking.connect(addr6).stakeBasic(0, ethers.parseUnits("1500000", "ether"))).to.be.revertedWithCustomError(staking, "BasicStakingMaxStakingAmounExceeded").withArgs(0)

      await expect(staking.connect(addr5).stakeBasic(0, ethers.parseUnits("1500000", "ether"))).to.be.revertedWithCustomError(staking, "BasicStakingAlreadySet").withArgs(0, addr5.address);

      // config 1 i 2 
      await token.connect(addr2).approve(staking.target, ethers.parseUnits("2000000", "ether"));      
      await expect(staking.connect(addr2).stakeBasic(1, ethers.parseUnits("1000000", "ether"))).to.emit(staking, "BasicStakingAdded").withArgs(addr2.address, 1, ethers.parseUnits("1000000", "ether"));      
      await expect(staking.connect(addr2).stakeBasic(2, ethers.parseUnits("1000000", "ether"))).to.emit(staking, "BasicStakingAdded").withArgs(addr2.address, 2, ethers.parseUnits("1000000", "ether"));
      
      await token.connect(addr3).approve(staking.target, ethers.parseUnits("2400000", "ether"));      
      await expect(staking.connect(addr3).stakeBasic(1, ethers.parseUnits("1100000", "ether"))).to.emit(staking, "BasicStakingAdded").withArgs(addr3.address, 1, ethers.parseUnits("1100000", "ether"));      
      await expect(staking.connect(addr3).stakeBasic(2, ethers.parseUnits("1300000", "ether"))).to.emit(staking, "BasicStakingAdded").withArgs(addr3.address, 2, ethers.parseUnits("1300000", "ether"));
      
      await expect(staking.connect(addr3).stakeBasic(2, ethers.parseUnits("1500000", "ether"))).to.be.revertedWithCustomError(staking, "BasicStakingAlreadySet").withArgs(2, addr3.address);

      expect(await staking.basicStakesTotalAmount(1)).to.be.eql(ethers.parseUnits("2100000", "ether"));
      expect(await staking.basicStakesTotalAmount(2)).to.be.eql(ethers.parseUnits("2300000", "ether"));
      
      expect(await token.balanceOf(staking.target)).to.be.equal(ethers.parseUnits("13900000", "ether"));
     
    });

    it("Should't unstake correct", async function() {

      await expect(staking.connect(addr7).claimAndUnstakeBasicReward(8)).to.be.revertedWithCustomError(staking, "BasicStakingConfigDoesNotExists").withArgs(8);

      await expect(staking.connect(addr7).claimAndUnstakeBasicReward(0)).to.be.revertedWithCustomError(staking, "BasicStakingDoesNotExists").withArgs(0, addr7.address);

      let increaseTime = 5184000; // 60 days
      await time.increase(increaseTime);
      
      await expect(staking.connect(addr2).claimAndUnstakeBasicReward(0)).to.be.revertedWithCustomError(staking, "BasicStakingStillGoingOn").withArgs(0, addr2.address);

      increaseTime =  1296000; // 15days
      await time.increase(increaseTime);
      await expect(staking.connect(addr2).claimAndUnstakeBasicReward(0)).to.be.revertedWithCustomError(staking, "BasicStakingStillGoingOn").withArgs(0, addr2.address);

      increaseTime = 1382400; // 16days / total 91
      await time.increase(increaseTime);

      let basiStakes = await staking.basicStakes(0, addr2.address);
      expect(basiStakes[2]).to.true;

      // 2.4M
      await expect(staking.connect(addr2).claimAndUnstakeBasicReward(0))
        .to
          .emit(staking, "RewardClaimedAndUnstaked").withArgs(addr2.address, 0, ethers.parseUnits("2000000", "ether"), ethers.parseUnits("400000", "ether"))
          .emit(token, "Transfer").withArgs(staking.target, addr2.address, ethers.parseUnits("2400000", "ether"));

      basiStakes = await staking.basicStakes(0, addr2.address);
      expect(basiStakes[2]).to.false;
    

    });

  });

  describe("Main Staking", function () {

    it("It should have correct configuration", async function () {

      // 4 periods

      const mainStakingPeriodsConfigLength = mainStakingPeriodsConfig.length;
    
      for(let i = 0; i < mainStakingPeriodsConfigLength; i++) {
         const periodItem = await staking.stakingPeriods(i);
         expect(periodItem).to.be.eql([ethers.toBigInt(mainStakingPeriodsConfig[0][i]),ethers.toBigInt(mainStakingPeriodsConfig[1][i])]);
      }

      await expect(staking.connect(addr1).updatePeriod(0, 15, 150)).to.be.revertedWithCustomError(staking, "AccessControlUnauthorizedAccount").withArgs(addr1.address, managerRole);
      await expect(staking.updatePeriod(12, 15, 150)).to.be.revertedWithCustomError(staking, "PeriodIndexDoesNotExists").withArgs(12);

      await expect(staking.updatePeriod(0, 15, 150)).to.emit(staking, "PeriodUpdated").withArgs(0, 15, 150);
      
      expect(await staking.stakingPeriods(0)).to.be.eql([15n, 150n]);

      // default
      await expect(staking.updatePeriod(0, 30, 300)).to.emit(staking, "PeriodUpdated").withArgs(0, 30, 300);
      expect(await staking.stakingPeriods(0)).to.be.eql([30n, 300n]);

      // ok, but turned off
      //await expect(staking.addPeriod(1000, 7000)).to.emit(staking, "PeriodAdded").withArgs(5, 1000, 7000);
      //expect(await staking.stakingPeriods(5)).to.be.eql([1000n, 7000n]);
      
    });

    it("It should't stake correcta and stake", async function () {

      await expect(staking.connect(addr1).startStaking(0)).to.be.revertedWithCustomError(staking, "AmountMustBeGreaterThanZero");

      await expect(staking.connect(addr1).startStaking(ethers.parseUnits("200000", "ether"))).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance")
      
      await token.connect(addr1).approve(staking.target, ethers.parseUnits("200000", "ether"));
      await expect(staking.connect(addr1).startStaking(ethers.parseUnits("200000", "ether")))
        .to
          .emit(staking, "StakingStarted").withArgs(addr1.address, ethers.parseUnits("200000", "ether"))
          .emit(token, "Transfer").withArgs(addr1.address, staking.target, ethers.parseUnits("200000", "ether"));

      await token.connect(addr2).approve(staking.target, ethers.parseUnits("800000", "ether"));
      await expect(staking.connect(addr2).startStaking(ethers.parseUnits("800000", "ether"))).to.emit(staking, "StakingStarted").withArgs(addr2.address,ethers.parseUnits("800000", "ether"));

      await token.connect(addr3).approve(staking.target, ethers.parseUnits("2000000", "ether"));
      await expect(staking.connect(addr3).startStaking(ethers.parseUnits("2000000", "ether"))).to.emit(staking, "StakingStarted").withArgs(addr3.address,ethers.parseUnits("2000000", "ether"));

      await token.connect(addr4).approve(staking.target, ethers.parseUnits("1200000", "ether"));
      await expect(staking.connect(addr4).startStaking(ethers.parseUnits("1200000", "ether"))).to.emit(staking, "StakingStarted").withArgs(addr4.address,ethers.parseUnits("1200000", "ether"));

      await token.connect(addr4).approve(staking.target, ethers.parseUnits("1200000", "ether"));
      await expect(staking.connect(addr4).startStaking(ethers.parseUnits("1200000", "ether"))).to.be.revertedWithCustomError(staking, "StakingAlreadyStarted").withArgs(addr4.address);

      // TOTAL AMOUNT STAKED ?? 
   
    });

    it("Should calculate ok", async function () {

      await expect(staking.connect(addr7).claimReward()).to.be.revertedWithCustomError(staking, "StakingNotStarted");
      await expect(staking.connect(addr2).claimReward()).to.be.revertedWithCustomError(staking, "NoReward");

      const testAmount = ethers.parseUnits("800000", "ether"); // addr2
      
      expect(Math.round(ethers.formatUnits(await staking.calculateReward(testAmount, 20)), 0)).to.be.equal(1315);      
      expect(Math.round(ethers.formatUnits(await staking.calculateReward(testAmount, 40)), 0)).to.be.equal(2959);
      expect(Math.round(ethers.formatUnits(await staking.calculateReward(testAmount, 60)), 0)).to.be.equal(4932);
      expect(Math.round(ethers.formatUnits(await staking.calculateReward(testAmount, 80)), 0)).to.be.equal(6904);
      expect(Math.round(ethers.formatUnits(await staking.calculateReward(testAmount, 100)), 0)).to.be.equal(9205);
      expect(Math.round(ethers.formatUnits(await staking.calculateReward(testAmount, 150)), 0)).to.be.equal(15781);
      expect(Math.round(ethers.formatUnits(await staking.calculateReward(testAmount, 220)), 0)).to.be.equal(27485);
      expect(Math.round(ethers.formatUnits(await staking.calculateReward(testAmount, 350)), 0)).to.be.equal(53129);
      expect(Math.round(ethers.formatUnits(await staking.calculateReward(testAmount, 400)), 0)).to.be.equal(65293);
      expect(Math.round(ethers.formatUnits(await staking.calculateReward(testAmount, 800)), 0)).to.be.equal(170499);

    });

    it("Should claim reward correct", async function () {
      
      await expect(staking.connect(addr2).claimReward()).to.be.revertedWithCustomError(staking, "NoReward").withArgs(addr2.address);

      // after 100 days, 80k, addr2
      await time.increase(100 * secInDay);
    
      let rewardToClaim = 9205;

      let stakeData = await staking.stakes(addr2.address);
      //console.log(stakeData);
    
      let rewardToClaimWei = await staking.calculateStakerReward(addr2.address, 0);
      expect(Math.round(ethers.formatUnits(await staking.calculateStakerReward(addr2.address, 0)), 0)).to.be.equal(rewardToClaim);
      expect(Math.round(ethers.formatUnits(await staking.calculateReward(stakeData[0], 100)), 0)).to.be.equal(rewardToClaim);

      await expect(staking.connect(addr7).claimReward()).to.be.revertedWithCustomError(staking, "StakingNotStarted").withArgs(addr7.address);

      await expect(staking.connect(addr2).claimReward())
        .to
        .emit(staking, "RewardClaimed").withArgs(addr2.address, rewardToClaimWei)
        .emit(token, "Transfer").withArgs(staking.target, addr2.address, rewardToClaimWei);

      stakeData = await staking.stakes(addr2.address);

      expect(stakeData[2]).to.be.equal(rewardToClaimWei);
      expect(stakeData[3]).to.be.equal(await time.latest());

      // staking time resetted try claim again after 400d
      
      await time.increase(400 * secInDay); // in fact 100 + 400

      let rewardToClaim2 = 65293;
      let rewardToClaimWei2 = await staking.calculateStakerReward(addr2.address, 0);
      expect(Math.round(ethers.formatUnits(rewardToClaimWei2), 0)).to.be.equal(rewardToClaim2);
      expect(Math.round(ethers.formatUnits(await staking.calculateReward(stakeData[0], 400)), 0)).to.be.equal(rewardToClaim2);

      await expect(staking.connect(addr2).claimReward())
      .to
      .emit(staking, "RewardClaimed").withArgs(addr2.address, rewardToClaimWei2)
      .emit(token, "Transfer").withArgs(staking.target, addr2.address, rewardToClaimWei2);

      stakeData = await staking.stakes(addr2.address);

      expect(stakeData[2]).to.be.equal(rewardToClaimWei + rewardToClaimWei2);
      expect(stakeData[3]).to.be.equal(await time.latest());

    });

    it("Should unstake with unstake request", async function () {

      // move 30 days forward, unstake with reward claimg at once
      await time.increase(27 * secInDay);

      await expect(staking.connect(addr7).unstake()).to.be.revertedWithCustomError(staking, "StakingNotStarted").withArgs(addr7.address);

      await expect(staking.connect(addr2).unstake()).to.be.revertedWithCustomError(staking, "RequestUnstakeIsNotReported").withArgs(addr2.address);
      
      await expect(staking.connect(addr7).requestUnstake()).to.be.revertedWithCustomError(staking, "StakingNotStarted").withArgs(addr7.address);;

      await expect(staking.connect(addr2).requestUnstake()).to.emit(staking, "RequestUnstakeReported").withArgs(addr2.address);

      await expect(staking.connect(addr2).requestUnstake()).to.be.revertedWithCustomError(staking, "RequestUnstakeReportedEarlier").withArgs(addr2.address);

      // unstake
      await expect(staking.connect(addr2).unstake()).to.be.revertedWithCustomError(staking, "RequestUnstakePeriodNotExpired").withArgs(addr2.address);
    
      await time.increase(5 * secInDay);
      
      await expect(staking.connect(addr2).unstake()).to.be.revertedWithCustomError(staking, "RequestUnstakePeriodNotExpired").withArgs(addr2.address);

      await time.increase(3 * secInDay); // requestUnstake expired

      // 35 days  => 2465

      let stakeData = await staking.stakes(addr2.address);
      let rewardToClaim3 = 2466;
      let rewardToClaimWei3 = await staking.calculateStakerReward(addr2.address, 0);
      expect(Math.round(ethers.formatUnits(rewardToClaimWei3), 0)).to.be.equal(rewardToClaim3);
      expect(Math.round(ethers.formatUnits(await staking.calculateReward(stakeData[0], 35)), 0)).to.be.equal(rewardToClaim3);

      await expect(staking.connect(addr2).unstake())
        .to
        .emit(staking, "RewardClaimed").withArgs(addr2.address, rewardToClaimWei3)
        .emit(staking, "Unstaked").withArgs(addr2.address, rewardToClaimWei3 + stakeData[0])
        .emit(token, "Transfer").withArgs(staking.target, addr2.address, rewardToClaimWei3 + stakeData[0])
      ;
      
      stakeData = await staking.stakes(addr2.address);

      expect(stakeData[0]).to.be.equal(0);
      expect(stakeData[6]).to.be.false;

    });

    it("Should restakeReward restake", async function () {

      //addr3, 2M
      const baseStakeData = await staking.stakes(addr3.address);
  
      //console.log(await time.latest());
      // 252000 - 535 dni
      let rewardToClaimWei = await staking.calculateStakerReward(addr3.address, 0);

      await expect(staking.connect(addr3).restakeReward()).to.be.revertedWithCustomError(staking, "RestakeIsNotActive");
      
      await expect(staking.connect(addr1).setRestakeStatus(1)).to.be.revertedWithCustomError(staking, "AccessControlUnauthorizedAccount").withArgs(addr1.address, managerRole);

      await staking.setRestakeStatus(1);

      await expect(staking.connect(addr7).restakeReward()).to.be.revertedWithCustomError(staking, "StakingNotStarted").withArgs(addr7.address);

      await expect(staking.connect(addr3).restakeReward()).to.emit(staking, "RewardRestaked").withArgs(addr3.address, rewardToClaimWei, rewardToClaimWei + baseStakeData[0]);

      await expect(staking.connect(addr3).restakeReward()).to.be.revertedWithCustomError(staking, "RestakeIntervalNotPassed").withArgs(addr3.address);

      await staking.setRestakeInterval(180 * secInDay);

      expect(await staking.restakeInterval()).to.be.equal(180 * secInDay);

    });

    it("Should add funds to staking", async function () {

      // if reward > 0 the restake, set block.timestampm for rewardClaiming, restake and request unstake set to 0

      // to check request unstake to 0
      await expect(staking.connect(addr3).requestUnstake()).to.emit(staking, "RequestUnstakeReported").withArgs(addr3.address);

      const baseStakeData = await staking.stakes(addr3.address);
      //console.log(baseStakeData);

      await time.increase(50 * secInDay);

      await expect(staking.connect(addr3).addFundsToStaking(ethers.parseUnits("500000", "ether"))).to.be.revertedWithCustomError(staking, "AddFundsIsNotActive");

      await staking.setAddFundsStatus(1);

      await expect(staking.connect(addr3).addFundsToStaking(ethers.parseUnits("500000", "ether"))).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance")

      await expect(staking.connect(addr7).addFundsToStaking(ethers.parseUnits("500000", "ether"))).to.be.revertedWithCustomError(staking, "StakingNotStarted").withArgs(addr7.address);

      await token.connect(addr3).approve(staking.target, ethers.parseUnits("500000", "ether"));

      let rewardToClaimWei = await staking.calculateStakerReward(addr3.address, 0);

      await expect(staking.connect(addr3).addFundsToStaking(ethers.parseUnits("500000", "ether")))
        .to
        .emit(token, "Transfer").withArgs(addr3.address, staking.target, ethers.parseUnits("500000", "ether"))
        .emit(staking, "AddedFundsToStaking").withArgs(addr3.address, ethers.parseUnits("500000", "ether"), rewardToClaimWei);
      
      let stakeData = await staking.stakes(addr3.address);  

      expect(stakeData[0]).to.be.equal(baseStakeData[0] + ethers.parseUnits("500000", "ether") + rewardToClaimWei);
      
      //console.log(stakeData);

      expect(stakeData[3]).to.be.equal(await time.latest());
      expect(stakeData[4]).to.be.equal(await time.latest());
      expect(stakeData[5]).to.be.equal(0);

    });

  });

});
;

