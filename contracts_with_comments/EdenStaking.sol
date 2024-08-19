// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./EdenStakingRoot.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// here is implemented basic staking
// given address may stake given amount for given period and after period is passed the may claim reward. That's all.
contract EdenStaking is EdenStakingRoot {
    
    using SafeERC20 for IERC20;

    // basic staking structure
    // main limitation is the basic staking have maxStakingAmount, this is sum all of staked tokens by period
    struct BasicStakingConfig {
        uint256 lengthInDays;
        uint256 annualPercentage;
        uint256 maxStakingAmount;
    }

    // similar like complex vesting in parent contract
    BasicStakingConfig[] public basicStakingConfigs;
    uint256 basicStakingLength;

    struct BasicStaking {
        uint256 amount;
        uint256 startTime;
        bool set;
    }
    
    // basic stakes mapping(periodId => mapping(address => stakeData))
    mapping (uint256 => mapping(address => BasicStaking)) public basicStakes;
    
    // auxiliary variable for storing current sum of staked token by period (maxStakingAmount)
    mapping (uint256 => uint256) public basicStakesTotalAmount;
    
    // min/max token amount for basic staking by address
    uint256 public basicStakingMinAmount = 25_000 ether;
    uint256 public basicStakingMaxAmount = 2_000_000 ether;

    error BasicStakingConfigDoesNotExists(uint256 stakingConfig);
    error BasicStakingAlreadySet(uint256 stakingConfig, address staker);
    error BasicStakingMaxStakingAmounExceeded(uint256 basicStakingId);
    error BasicStakingInvalidAmount(address stakter, uint256 stakingConfig, uint256 amount);
    error BasicStakingDoesNotExists(uint256 basicStakingId, address staker);
    error BasicStakingStillGoingOn(uint256 stakingConfig, address staker);
    
    event BasicStakingConfigAdded(uint256 indexed index, uint256 basicLengthInDays, uint256 basicAnnualPercentage, uint256 basicMaxStakingAmount);
    event BasicStakingConfigUpdated(uint256 indexed basicStakingId, uint256 lengthInDaysTo, uint256 annualPercentage, uint256 basicMaxStakingAmount);    
    event BasicStakingAdded(address indexed staker, uint256 stakingConfig, uint256 amount);    
    event RewardClaimedAndUnstaked(address indexed staker, uint256 stakingConfig, uint256 amount, uint256 reward);

    // we passed the token contract and all periods data in constructor for both staking (basic, complex)
    constructor(
        IERC20 edenTokenContract_,
        uint256[] memory basicLengthInDays,
        uint256[] memory basicAnnualPercentages,
        uint256[] memory basicMaxStakingAmounts,
        uint256[] memory mainLengthInDaysTo,
        uint256[] memory mainAnnualPercentages
    ) EdenStakingRoot(edenTokenContract_, mainLengthInDaysTo, mainAnnualPercentages) {
        setBasicStakingConfigs(basicLengthInDays, basicAnnualPercentages, basicMaxStakingAmounts);
    }

    // it's clear
    function setBasicStakingConfigs(uint256[] memory basicLengthInDays, uint256[] memory basicAnnualPercentages, uint256[] memory basicMaxStakingAmounts) internal {

        uint256 inputArrayLength = basicLengthInDays.length;
        if(inputArrayLength != basicAnnualPercentages.length) {
            revert InputArrayMismatchLength();
        }

        if(inputArrayLength != basicMaxStakingAmounts.length) {
            revert InputArrayMismatchLength();
        }

        for(uint256 i; i < inputArrayLength; ) {            
            basicStakingConfigs.push(BasicStakingConfig(basicLengthInDays[i], basicAnnualPercentages[i], basicMaxStakingAmounts[i]));
            basicStakingLength++;
            emit BasicStakingConfigAdded(i, basicLengthInDays[i], basicAnnualPercentages[i], basicMaxStakingAmounts[i]);
            unchecked {
                i++;
            }            
        }     

    }
    
    // it's clear
    function addBasicStaking(uint256 basicLengthInDays, uint256 basicAnnualPercentage, uint256 basicMaxStakingAmount) public onlyRole(MANAGER_ROLE) {      
        basicStakingConfigs.push(BasicStakingConfig(basicLengthInDays, basicAnnualPercentage, basicMaxStakingAmount));
        basicStakingLength++;
        emit BasicStakingConfigAdded(basicStakingLength - 1, basicLengthInDays, basicAnnualPercentage, basicMaxStakingAmount);
    }

    // it's clear
    function updateBasicStaking(uint256 basicStakingId, uint256 lengthInDaysTo, uint256 annualPercentage, uint256 basicMaxStakingAmount) external onlyRole(MANAGER_ROLE) {        
        if(basicStakingId >= basicStakingLength) {
            revert BasicStakingConfigDoesNotExists(basicStakingId);
        }

        BasicStakingConfig storage basicStaking = basicStakingConfigs[basicStakingId];
        basicStaking.lengthInDays = lengthInDaysTo;
        basicStaking.annualPercentage = annualPercentage;
        basicStaking.maxStakingAmount = basicMaxStakingAmount;
        basicStakingConfigs[basicStakingId] = basicStaking;

        emit BasicStakingConfigUpdated(basicStakingId, lengthInDaysTo, annualPercentage, basicMaxStakingAmount);
    }

    // it's clear
    function setBasicStakingMinAmount(uint256 minAmount)  external onlyRole(MANAGER_ROLE) {
        basicStakingMinAmount = minAmount;        
    }
    
    // it's clear
    function setBasicStakingMaxAmount(uint256 maxAmount)  external onlyRole(MANAGER_ROLE) {
        basicStakingMaxAmount = maxAmount;        
    }

    //------------------------------------------

    // add sender funds to the basic staking
    // with additional conditions are checked, look on the custom errors below
    function stakeBasic(uint256 basicStakingId, uint256 amount) external {
        address staker = _msgSender();
        
        if(basicStakingId >= basicStakingLength) {
            revert BasicStakingConfigDoesNotExists(basicStakingId);
        }
        
        if(basicStakes[basicStakingId][staker].set == true) {
            revert BasicStakingAlreadySet(basicStakingId, staker);
        }

        if(amount < basicStakingMinAmount || amount > basicStakingMaxAmount) {
            revert BasicStakingInvalidAmount(staker, basicStakingId, amount);
        }

        if(basicStakesTotalAmount[basicStakingId] + amount > basicStakingConfigs[basicStakingId].maxStakingAmount) {
            revert BasicStakingMaxStakingAmounExceeded(basicStakingId);  
        }
        
        emit BasicStakingAdded(staker, basicStakingId, amount);
        basicStakes[basicStakingId][staker] = BasicStaking(amount, block.timestamp, true);
        basicStakesTotalAmount[basicStakingId] += amount;
        edenTokenContract.safeTransferFrom(staker, address(this), amount);

    }
    
    // claim reward and unstake any fund from basic staking
    // with additional conditions are checked, look on the custom errors below
    function claimAndUnstakeBasicReward(uint256 basicStakingId)  external {            
        address staker = _msgSender();

        if(basicStakingId >= basicStakingLength) {
            revert BasicStakingConfigDoesNotExists(basicStakingId);
        }    

        if(basicStakes[basicStakingId][staker].set == false) {
            revert BasicStakingDoesNotExists(basicStakingId, staker);
        }  

        if(block.timestamp < basicStakes[basicStakingId][staker].startTime + (basicStakingConfigs[basicStakingId].lengthInDays * 1 days)) {
            revert BasicStakingStillGoingOn(basicStakingId, staker); 
        }

        uint256 amountToUnstake = basicStakes[basicStakingId][staker].amount;
        uint256 reward = (amountToUnstake * basicStakingConfigs[basicStakingId].annualPercentage)/10000;

        emit RewardClaimedAndUnstaked(staker, basicStakingId, amountToUnstake, reward);

        delete basicStakes[basicStakingId][staker];

        edenTokenContract.safeTransfer(staker, amountToUnstake + reward);

    }
}
