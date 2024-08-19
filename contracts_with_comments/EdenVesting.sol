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

    // the token contract which is used for vesting
    IERC20 public edenTokenContract;

    // merkle root for used merkle tree
    bytes32 public merkleRoot;
    
    // mapping representing claimed tokens
    // mapping(wallets => mapping(poolId => claimed, as bool)
    // a single wallat may be assigned to severals pools
    mapping(address => mapping(uint256 => bool)) public claimedTokens;
    
    // wallets which already be added to the vesting
    // mapping(poolId => mapping(wallet => amount)
    mapping(uint256 => mapping(address => uint256)) public walletsInVesting;

    // Amount of the tokes which are released during vesting process
    // mapping(poolId => mapping(wallet => amount)
    mapping(uint256 => mapping(address => uint256)) public releasedAmount;
    
    // auxiliary mapping to improve performance 
    // mapping(wallet => assignwedPoolIds[])
    mapping(address => uint256[]) public walletPools;
    
    error MerkleTreeNotSet();
    error MerkleTreeValidationFailed();
    error AlreadyClaimed(address wallet, uint256 pool);
    error NoRewardToRelease();
    error WalletAlreadyExists(address wallet, uint256 pooId);
    error WalletNotSet(address wallet, uint256 pooId);
    error CannotRemoveWalletFromVestingPool(address wallet, uint256 pooId);

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

    // by default the contract is paused 
    constructor(IERC20 edenTokenContract_) {
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

    // only manager may set merkle root and the contract must be paused for a moment
    function setMerkleRoot(bytes32 _newMerkleRoot) external whenPaused onlyRole(MANAGER_ROLE) {
        merkleRoot = _newMerkleRoot;
    }

    // the main vesting contract function
    // here wallet may claim amount of tokens by tge indicator and the rest tokens are set to the vesting
    // the merkle tree struct looks like: [poolId, walletAddress, amountOfAssignedTokensToUse]
    // the wallet/user may claim all of their pools at once, but is not mandatory.
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

        // may proceed more than one from pool at once
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

            // in the case when the tge indicator is equal to zero then user haven't tokens to claim.
            if(amountToClaimTGE > 0) {
                emit Claimed(claimant, poolIds[i], amountToClaimTGE);  
            }

            unchecked {
                i++;
            }
        }
        
        // complex operations are seperated to the other function
        setVestingPoolsWallet(claimant, vestingPools, vestingAmount);

        if(totalPoolsAmountToClaim > 0) {
            // external operation should be executed at the end 
            // it's prevent before reentracy too
            edenTokenContract.safeTransfer(claimant, totalPoolsAmountToClaim);
        }
    }
    
    // simply calculations as internal pure
    function calculateAmountToClaiming(uint256 totalAmount, uint256 percentage) internal pure returns(uint256) {
        return (totalAmount * percentage) / 100;
    }

    function isClaimedTokens(address wallet, uint256 poolId) external view returns (bool) {
        return claimedTokens[wallet][poolId];
    }

    // ovveride the function above with different types of arguments.
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

    // calculate releasble tokens from vesting by wallet from pools when wallet are assigned, it's returns two array with available pools and the tokens amount.
    function releasable(address wallet) public view returns (uint256[] memory, uint256[] memory) {
        uint256 walletPoolsLength = walletPools[wallet].length; 
        uint256[] memory poolsReleasable = new uint256[](walletPoolsLength);
        for(uint256 i; i < walletPoolsLength; ) {
            poolsReleasable[i] = vestingSchedule(wallet, walletPools[wallet][i], block.timestamp) - releasedAmount[walletPools[wallet][i]][wallet];
        }       
        return (walletPools[wallet], poolsReleasable);
    }

    // overrided, for singular wallet and pool
    function releasable(address wallet, uint256 poolId) public view returns (uint256) {
        return vestingSchedule(wallet, poolId, block.timestamp) - releasedAmount[poolId][wallet];
    }

    // calculate remiang amount of tokens from vesting, until the periods will end, it's returns two array with available pools and the remaing tokens amount.
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
    
    // overrided, for singular wallet and pool
    function vestingAmountRemaining(address wallet, uint256 poolId) public view returns(uint256) {                
        return walletsInVesting[poolId][wallet] - releasedAmount[poolId][wallet];
    }

    // one function for fetch complex wallet stats
    // if timestamp is zero, then block.timestamp is used
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

    // like above but per given pool
    function getWalletStats(address wallet, uint256 poolId, uint256 timestamp) external view returns(uint256 releaseAmount, uint256 releasableAmount, uint256 released, uint256 remainingAmount) {
        released = releasedAmount[poolId][wallet];
        releasableAmount = vestingSchedule(wallet, poolId, timestamp == 0 ? block.timestamp : timestamp) - released;        
        releaseAmount = walletsInVesting[poolId][wallet];
        remainingAmount = vestingAmountRemaining(wallet, poolId);
    }
    
    // cliffSet in release is not require, for clarify only
    // function for releasing available tokens from vesting by pool
    function release(uint256 poolId) external cliffSet() isSetInVesting(_msgSender(), poolId) {   
         address sender = _msgSender();
         uint256 amount = releasable(sender, poolId);
         if(amount <= 0) {
             revert NoRewardToRelease();
         }
         releasedAmount[poolId][sender] += amount;
         emit Released(sender, poolId, amount);
         // the external operation at the end
         edenTokenContract.safeTransfer(sender, amount);
    }

    // function for releasing available tokens from all vesting pools
    function releaseAll() external cliffSet() {        
        address sender = _msgSender();        
        uint256 totalReleasable;

        uint256 walletPoolsLength = walletPools[sender].length;        
        for(uint256 i; i < walletPoolsLength; ) {
                       
            uint256 amount = releasable(sender, walletPools[sender][i]);
            if(amount >= 0) {
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

    // the auxiliary function which are groups some complex operations, look for: claimEdenToken
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

    // This function allows the manager to add the wallet for given wallet and pool
    // It may by used after cliffs started
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

    // The function for removing wallet from given pool of the vesting, only manager
    // Some additional condistions are checked inside
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
    
    // vesting scheduler function
    // it calculate real vesting amount by wallet, pool and given timestamp
    // if timestamp is zero, then block.timestamp is used
    // we have periods: before vesting started, during vetsing, after vesting
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

}