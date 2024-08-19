// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";

contract EdenStakingRoot is AccessControlEnumerable {
    
    using Math for uint256;
    using SafeERC20 for IERC20;
    
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    uint256 public constant REQUEST_UNSTAKE_PERIOD = 7 days;
    
    enum OperationStatus {
        Off,
        Active
    }

    IERC20 public edenTokenContract;
    
    struct StakingPeriod {
        uint256 lengthInDays;
        uint256 annualPercentage;
    }

    StakingPeriod[] public stakingPeriods;
    uint256 stakingPeriodsLength;
  
    struct Stake {
        uint256 amount;
        uint256 startTime;
        uint256 rewardReleased;
        uint256 lastRewardTime;
        uint256 lastRestakeTime;
        uint256 requestUnstake;
        bool set;
    }

    mapping(address => Stake) public stakes;

    OperationStatus public restakeStatus;
    uint256 public restakeInterval = 90 days;

    OperationStatus public addFundsStatus;

    error InputArrayMismatchLength();
    error AtLeastOnePeriodRequired();
    error PeriodIndexDoesNotExists(uint256 index);
    error PeriodAlreadyExists(uint256 index);
    
    error AmountMustBeGreaterThanZero();
    error StakingAlreadyStarted(address staker);
    error StakingNotStarted(address staker);
    error NoReward(address staker);
    error RequestUnstakeReportedEarlier(address staker);
    error RequestUnstakeIsNotReported(address staker);   
    error RequestUnstakePeriodNotExpired(address staker);
    error RestakeIsNotActive();    
    error AddFundsIsNotActive();
    error RestakeIntervalNotPassed(address staker);

    event PeriodAdded(uint256 indexed index, uint256 lengthInDays, uint256 annualPercentage);
    event PeriodUpdated(uint256 indexed index, uint256 lengthInDays, uint256 annualPercentage);
    event PeriodDeleted(uint256 indexed index);

    event StakingStarted(address indexed staker, uint256 amount);    
    event RewardClaimed(address indexed staker, uint256 reward);
    event AddedFundsToStaking(address indexed staker, uint256 amount, uint256 reward);
    event RequestUnstakeReported(address indexed staker);            
    event Unstaked(address indexed staker, uint256 amount);
    event RewardRestaked(address indexed staker, uint256 reward, uint256 totalAmount);

    modifier isStaked(address staker) {
        if(stakes[staker].set == false) {
            revert StakingNotStarted(staker);
        }
        _;
    }

    constructor(
        IERC20 edenTokenContract_, 
        uint256[] memory lengthInDays,
        uint256[] memory annualPercentages
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MANAGER_ROLE, msg.sender); 
        edenTokenContract = edenTokenContract_;
        setPeriods(lengthInDays, annualPercentages);
    }

    //--------------------------------------
    
    function setPeriods(uint256[] memory lengthInDays, uint256[] memory annualPercentages) internal {
        uint256 inputArrayLength = lengthInDays.length;
        if(inputArrayLength != annualPercentages.length) {
            revert InputArrayMismatchLength();
        }

        for(uint256 i; i < inputArrayLength; ) {            
            stakingPeriods.push(StakingPeriod(lengthInDays[i], annualPercentages[i]));
            stakingPeriodsLength++;
            emit PeriodAdded(i, lengthInDays[i], annualPercentages[i]);
            unchecked {
                i++;
            }            
        }     
    }

    function addPeriod(uint256 lengthInDays, uint256 annualPercentage) public onlyRole(MANAGER_ROLE) {      
        stakingPeriods.push(StakingPeriod(lengthInDays, annualPercentage));
        stakingPeriodsLength++;
        emit PeriodAdded(stakingPeriodsLength - 1, lengthInDays, annualPercentage);
    }

    function updatePeriod(uint256 periodId, uint256 lengthInDays, uint256 annualPercentage) external onlyRole(MANAGER_ROLE) {        
        if(periodId >= stakingPeriodsLength) {
            revert PeriodIndexDoesNotExists(periodId);
        }

        StakingPeriod storage period = stakingPeriods[periodId];
        period.lengthInDays = lengthInDays;
        period.annualPercentage = annualPercentage;
        stakingPeriods[periodId] = period;

        emit PeriodUpdated(periodId, lengthInDays, annualPercentage);
    }

    function setRestakeInterval(uint256 interval) external onlyRole(MANAGER_ROLE) {        
        restakeInterval = interval;
    }

    function setRestakeStatus(OperationStatus status) external onlyRole(MANAGER_ROLE) {       
        restakeStatus = status;
    }

    function setAddFundsStatus(OperationStatus status) external onlyRole(MANAGER_ROLE) {       
        addFundsStatus = status;
    }

    //---------------------------------

    function startStaking(uint256 amount) external {
        if(amount == 0) {
            revert AmountMustBeGreaterThanZero();
        }
        
        address staker = _msgSender();
        if(stakes[staker].set == true) {
            revert StakingAlreadyStarted(staker);
        }

        Stake memory stake = Stake(amount, block.timestamp, 0, 0, block.timestamp, 0, true);
        stakes[staker] = stake;

        emit StakingStarted(staker, amount);

        edenTokenContract.safeTransferFrom(staker, address(this), amount);
    }

    function addFundsToStaking(uint256 amount) isStaked(_msgSender()) external {        
        
        if(addFundsStatus == OperationStatus.Off) {
            revert AddFundsIsNotActive();
        }

        if(amount == 0) {
            revert AmountMustBeGreaterThanZero();
        }

        address staker = _msgSender();        
        uint256 reward = calculateStakerReward(staker, 0);

        Stake storage stake = stakes[staker];
        stake.amount += amount;        
        stake.lastRewardTime = block.timestamp;
        stake.lastRestakeTime = block.timestamp;            
        stake.requestUnstake = 0;
      
        if(reward > 0) {
            stake.amount += reward;
        }

        emit AddedFundsToStaking(staker, amount, reward);

        edenTokenContract.safeTransferFrom(staker, address(this), amount);
    }

    function restakeReward() isStaked(_msgSender()) external {
        
        if(restakeStatus == OperationStatus.Off) {
            revert RestakeIsNotActive();
        }

        address staker = _msgSender();
        uint256 reward = calculateStakerReward(staker, 0);                
        if(reward == 0) {
            revert NoReward(staker);
        }
        
        Stake storage stake = stakes[staker];

        if(block.timestamp < stake.lastRestakeTime + restakeInterval) {
            revert RestakeIntervalNotPassed(staker);
        }

        stake.amount += reward;
        stake.lastRestakeTime = block.timestamp;
        
        emit RewardRestaked(staker, reward, stake.amount);
    }

    function claimReward() isStaked(_msgSender()) external {        
        address staker = _msgSender();

        uint256 reward = calculateStakerReward(staker, 0);                
        if(reward == 0) {
            revert NoReward(staker);
        }
        
        Stake storage stake = stakes[staker];
        stake.rewardReleased += reward;
        stake.lastRewardTime = block.timestamp;

        emit RewardClaimed(staker, reward);

        edenTokenContract.safeTransfer(staker, reward);
    }

    function requestUnstake() isStaked(_msgSender()) external {
        address staker = _msgSender();
        Stake storage stake = stakes[staker];
        if(stake.requestUnstake > 0) {
            revert RequestUnstakeReportedEarlier(staker);
        }
        stake.requestUnstake = block.timestamp;
        emit RequestUnstakeReported(staker);
    }

    function unstake() isStaked(_msgSender()) external {
        address staker = _msgSender();
        Stake storage stake = stakes[staker];
        
        if(stake.requestUnstake == 0) {
            revert RequestUnstakeIsNotReported(staker);       
        }
        
        if(block.timestamp < stake.requestUnstake + REQUEST_UNSTAKE_PERIOD) {
            revert RequestUnstakePeriodNotExpired(staker);     
        }
        
        uint256 reward = calculateStakerReward(staker, 0);           
        uint256 amountToUnstakeWithReward;

        if(reward > 0) {
            amountToUnstakeWithReward += reward;
            emit RewardClaimed(staker, reward);
        }

        amountToUnstakeWithReward += stake.amount;   
        emit Unstaked(staker, amountToUnstakeWithReward);

        delete stakes[staker];      

        edenTokenContract.safeTransfer(staker, amountToUnstakeWithReward);
    }

    //--------------------------------------

    function calculateStakerReward(address staker, uint256 timestamp) public isStaked(staker) view returns (uint256) {        
        uint256 totalDaysStaked = ((timestamp > 0 ? timestamp : block.timestamp) - (stakes[staker].lastRewardTime > 0 ? stakes[staker].lastRewardTime : stakes[staker].startTime)) / 1 days;      
        return totalDaysStaked > 0 ? calculateReward(stakes[staker].amount, totalDaysStaked) : 0;
    }

    function calculateReward(uint256 amount, uint256 totalDaysStaked) public view returns(uint256) {

        uint256 remainingDays = totalDaysStaked;
        uint256 reward = 0;
        uint256 currentAmount = amount;
        
        for (uint256 i; i < stakingPeriodsLength; i++) {
            if (remainingDays == 0) break;

            StakingPeriod storage period = stakingPeriods[i];
            uint256 daysInPeriod = period.lengthInDays;
            if (remainingDays < daysInPeriod) {
                daysInPeriod = remainingDays;
            }

            reward += computeReward(currentAmount, period.annualPercentage, daysInPeriod);
            remainingDays -= daysInPeriod;
        }

        return reward;

    }

    function computeReward(uint256 amount, uint256 annualRate, uint256 daysToCalculate) internal pure returns (uint256) {
        return (amount * annualRate * daysToCalculate) / (365 * 10000);
    }

}
