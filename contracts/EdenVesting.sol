// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import './VestingRoot.sol';

contract EdenVesting is VestingRoot, Pausable {

    using Math for uint256;
    using SafeERC20 for IERC20;

    IERC20 public edenTokenContract;

    bytes32 public merkleRoot;
    mapping(address => mapping(uint256 => bool)) public claimedTokens;
    
    mapping(uint256 => mapping(address => uint256)) public walletsInVesting;
    mapping(uint256 => mapping(address => uint256)) public releasedAmount;
    mapping(address => uint256[]) public walletPools;
    
    uint256 private immutable minCliffStartBalance = 100_000_000 ether;

    error MerkleTreeNotSet();
    error MerkleTreeValidationFailed();
    error AlreadyClaimed(address wallet, uint256 pool);
    error NoRewardToRelease();
    error WalletAlreadyExists(address wallet, uint256 pooId);
    error WalletNotSet(address wallet, uint256 pooId);
    error CannotRemoveWalletFromVestingPool(address wallet, uint256 pooId);
    error ZeroAddressOccured();
    error ZeroBytesOccured();
    error InsufficientBalance();

    event Claimed(address indexed to, uint256 poolId, uint256 amount);
    event WalletAdded(address indexed wallet, uint256 pooId, uint256 vestingAmount);
    event WalletDeleted(address indexed wallet, uint256 pooId);    
    event WalletAlreadyExistsEvent(address indexed wallet, uint256 pooId);    
    event Released(address indexed wallet, uint256 poolId, uint256 amount);    

    modifier isSetInVesting(address wallet, uint256 poolId) {
        if(walletsInVesting[poolId][wallet] == 0) {
            revert WalletNotSet(wallet, poolId);
        }
        _;
    }

    constructor(IERC20 edenTokenContract_) {
        if(address(edenTokenContract_) == address(0)) {
            revert ZeroAddressOccured();    
        }    
        edenTokenContract = edenTokenContract_;
        _pause();
    }

    // -------------------------

    function pause() public onlyRole(MANAGER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(MANAGER_ROLE) {
        _unpause();
    }

    function setMerkleRoot(bytes32 _newMerkleRoot) external whenPaused onlyRole(MANAGER_ROLE) {
        if(_newMerkleRoot == bytes32(0)) {
            revert ZeroBytesOccured();
        }
        merkleRoot = _newMerkleRoot;
    }

     function claimEdenToken(bytes32[][] calldata proof, uint256[] calldata poolIds, uint256[] calldata totalAmount) external whenNotPaused {

        if(merkleRoot == bytes32(0)) {
            revert MerkleTreeNotSet();            
        }
        
        uint256 proofsLength = proof.length;
        if(poolIds.length != proofsLength) {
            revert InputArrayMismatchLength();
        }
        if(totalAmount.length != proofsLength) {
            revert InputArrayMismatchLength();
        }

        address claimant = _msgSender();
        
        uint256 totalPoolsAmountToClaim;
        uint256[] memory vestingPools = new uint256[](proofsLength);
        uint256[] memory vestingAmount = new uint256[](proofsLength);

        for(uint256 i; i < proofsLength; ) {

            if(!MerkleProof.verify(proof[i], merkleRoot, getLeaf(poolIds[i], claimant, totalAmount[i]))) {
                revert MerkleTreeValidationFailed();
            }

            if(claimedTokens[claimant][poolIds[i]] == true) {
                revert AlreadyClaimed(claimant, poolIds[i]);
            }

            uint256 amountToClaimTGE = calculateAmountToClaiming(totalAmount[i], getPoolTge(poolIds[i]));            
            
            vestingPools[i] = poolIds[i];
            vestingAmount[i] = totalAmount[i] - amountToClaimTGE;
            
            totalPoolsAmountToClaim += amountToClaimTGE;

            claimedTokens[claimant][poolIds[i]] = true;

            if(amountToClaimTGE > 0) {
                emit Claimed(claimant, poolIds[i], amountToClaimTGE);  
            }

            unchecked {
                i++;
            }
        }
        
        setVestingPoolsWallet(claimant, vestingPools, vestingAmount);
        if(totalPoolsAmountToClaim > 0) {
            edenTokenContract.safeTransfer(claimant, totalPoolsAmountToClaim);
        }
    }
    
    function calculateAmountToClaiming(uint256 totalAmount, uint256 percentage) internal pure returns(uint256) {
        return (totalAmount * percentage) / 100;
    }

    function isClaimedTokens(address wallet, uint256 poolId) external view returns (bool) {
        return claimedTokens[wallet][poolId];
    }

    function isClaimedTokens(address[] calldata wallets, uint256[] calldata poolIds) external view returns (bool[] memory) {        
        
        uint256 inputLength = wallets.length;
        if(inputLength != poolIds.length) {
            revert InputArrayMismatchLength();
        }

        bool[] memory isClaimed = new bool[](inputLength);        

        for(uint256 i; i < inputLength;) {
            isClaimed[i] = claimedTokens[wallets[i]][poolIds[i]];
            unchecked {
                 i++;
            }
        }

        return isClaimed;
    }

    function getLeaf(uint256 poolId, address wallet, uint256 amount) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(poolId, wallet, amount))));
    }

    // -------------------------

    function releasable(address wallet) public view returns (uint256[] memory, uint256[] memory) {
        uint256 walletPoolsLength = walletPools[wallet].length; 
        uint256[] memory poolsReleasable = new uint256[](walletPoolsLength);
        for(uint256 i; i < walletPoolsLength; ) {
            poolsReleasable[i] = vestingSchedule(wallet, walletPools[wallet][i], block.timestamp) - releasedAmount[walletPools[wallet][i]][wallet];
        }       
        return (walletPools[wallet], poolsReleasable);
    }

    function releasable(address wallet, uint256 poolId) public view returns (uint256) {
        return vestingSchedule(wallet, poolId, block.timestamp) - releasedAmount[poolId][wallet];
    }

    function vestingAmountRemaining(address wallet) public view returns(uint256[] memory, uint256[] memory) {                
        uint256 walletPoolsLength = walletPools[wallet].length; 
        uint256[] memory remaining = new uint256[](walletPoolsLength);
        for(uint256 i; i < walletPoolsLength; ) {
             remaining[i] = walletsInVesting[walletPools[wallet][i]][wallet] - releasedAmount[walletPools[wallet][i]][wallet];
             unchecked {
                i++;
             }
        }  
        return (walletPools[wallet], remaining);
    }

    function vestingAmountRemaining(address wallet, uint256 poolId) public view returns(uint256) {                
        return walletsInVesting[poolId][wallet] - releasedAmount[poolId][wallet];
    }

    function getWalletStats(address wallet, uint256 timestamp) external view returns(uint256[] memory, uint256[][] memory) {
        uint256 walletPoolsLength = walletPools[wallet].length; 
        uint256[][] memory stats = new uint256[][](walletPoolsLength);
        for(uint256 i; i < walletPoolsLength; ) {
            stats[i] = new uint256[](4);
            stats[i][0] = releasedAmount[walletPools[wallet][i]][wallet];
            stats[i][1] = vestingSchedule(wallet, walletPools[wallet][i], timestamp == 0 ? block.timestamp : timestamp) - stats[i][0];        
            stats[i][2] = walletsInVesting[walletPools[wallet][i]][wallet];
            stats[i][3] = vestingAmountRemaining(wallet, walletPools[wallet][i]);            
            unchecked {
                i++;
            }
        }
        return (walletPools[wallet], stats);
    }

    function getWalletStats(address wallet, uint256 poolId, uint256 timestamp) external view returns(uint256 releaseAmount, uint256 releasableAmount, uint256 released, uint256 remainingAmount) {
        released = releasedAmount[poolId][wallet];
        releasableAmount = vestingSchedule(wallet, poolId, timestamp == 0 ? block.timestamp : timestamp) - released;        
        releaseAmount = walletsInVesting[poolId][wallet];
        remainingAmount = vestingAmountRemaining(wallet, poolId);
    }
    
    // cliffSet in release is not require, for clarify only
    function release(uint256 poolId) external cliffSet() isSetInVesting(_msgSender(), poolId) {   
         address sender = _msgSender();
         uint256 amount = releasable(sender, poolId);
         if(amount <= 0) {
             revert NoRewardToRelease();
         }
         releasedAmount[poolId][sender] += amount;
         emit Released(sender, poolId, amount);
         edenTokenContract.safeTransfer(sender, amount);
    }

    function releaseAll() external cliffSet() {        
        address sender = _msgSender();        
        uint256 totalReleasable;

        uint256 walletPoolsLength = walletPools[sender].length;        
        for(uint256 i; i < walletPoolsLength; ) {
                       
            uint256 amount = releasable(sender, walletPools[sender][i]);
            if(amount != 0) {
                totalReleasable += amount;
                releasedAmount[walletPools[sender][i]][sender] += amount;
                emit Released(sender, walletPools[sender][i], amount);
            }

            unchecked {
                i++;
            }
        }

        if(totalReleasable <= 0) {
            revert NoRewardToRelease();
        }

        edenTokenContract.safeTransfer(sender, totalReleasable);
    }

    function getWalletPools(address wallet) public view returns(uint256[] memory) {
        return walletPools[wallet];
    }

    function setVestingPoolsWallet(address wallet, uint256[] memory poolIds, uint256[] memory vestingAmount) internal {

        uint256 poolIdsLength = poolIds.length;
        if(poolIdsLength != vestingAmount.length) {
            revert InputArrayMismatchLength();
        }

        for(uint256 i; i < poolIdsLength; ) {

            if(pools[poolIds[i]].set == false) {
                revert PoolIndexDoesNotExists(poolIds[i]);
            }
            
            if(walletsInVesting[poolIds[i]][wallet] > 0) {
                emit WalletAlreadyExistsEvent(wallet, poolIds[i]); 
            } else {
                walletsInVesting[poolIds[i]][wallet] = vestingAmount[i];
                walletPools[wallet].push(poolIds[i]);
                emit WalletAdded(wallet, poolIds[i], vestingAmount[i]);
            }
            
            unchecked {
                i++;
            }
        }

    }

    function addVestingPoolWallet(address wallet, uint256 poolId, uint256 vestingAmount) external onlyRole(MANAGER_ROLE) {
        
        if(!pools[poolId].set) {
            revert PoolIndexDoesNotExists(poolId);
        }    

        if(walletsInVesting[poolId][wallet] > 0) {            
            revert WalletAlreadyExists(wallet, poolId);
        } 

        emit WalletAdded(wallet, poolId, vestingAmount);  
        walletsInVesting[poolId][wallet] = vestingAmount;
        walletPools[wallet].push(poolId);
    }

    function removeVestingPoolWallet(address wallet, uint256 poolId) external isSetInVesting(wallet, poolId) onlyRole(MANAGER_ROLE) {    
        if(releasedAmount[poolId][wallet] > 0) {
            revert CannotRemoveWalletFromVestingPool(wallet, poolId);
        }      
        delete walletsInVesting[poolId][wallet];        
        uint256[] storage pools = walletPools[wallet];
        uint256 poolsLength = pools.length;
        for (uint256 i; i < poolsLength; i++) {
            if (pools[i] == poolId) {
                pools[i] = pools[poolsLength - 1];
                pools.pop();
                break;
            }
        }
        if(walletPools[wallet].length == 0) {
            delete walletPools[wallet];
        }
        emit WalletDeleted(wallet, poolId);           
    }
    
    function vestingSchedule(address wallet, uint256 poolId, uint256 timestamp) public view virtual cliffSet() returns (uint256) {
        
        if(pools[poolId].set == false) {
            revert PoolIndexDoesNotExists(poolId);
        }

        if (walletsInVesting[poolId][wallet] == 0 || timestamp < pools[poolId].cliffEnd) {
            return 0;
        } else if (timestamp >= pools[poolId].vestingEnd) {
            return walletsInVesting[poolId][wallet];
        } else {
            return (walletsInVesting[poolId][wallet] * (timestamp - pools[poolId].cliffEnd)) / pools[poolId].vestingPeriod;
        }

    }

    // -------------------------------------

     function setCliffStart() external cliffNotSet() onlyRole(MANAGER_ROLE) override {
        
        if(poolsLength == 0) {
            revert AtLeastOnePoolRequired();
        }

        if(edenTokenContract.balanceOf(address(this)) < minCliffStartBalance) {
            revert InsufficientBalance();
        }

        uint256 cliffStart = block.timestamp;
        for(uint256 i = 1; i <= poolsLength; ) {
            uint256 cliffEnd = cliffStart + pools[i].cliffPeriod;
            pools[i].cliffStart = cliffStart;        
            pools[i].cliffEnd = cliffEnd;
            pools[i].vestingEnd = cliffEnd + pools[i].vestingPeriod;
            unchecked {
                i++;
            }
        }

        cliffStarted = true;
        emit VestingCliffStarted();    
    }


}