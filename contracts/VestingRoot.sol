// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract VestingRoot is AccessControlEnumerable {

    using Math for uint256;

    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    struct VestingPool {
        uint256 cliffStart;
        uint256 cliffPeriod;
        uint256 cliffEnd;
        uint256 vestingPeriod;
        uint256 vestingEnd;
        uint256 tge;
        bool set;
    }

    mapping(uint256 => VestingPool) internal pools;
    uint256 internal poolsLength;

    bool public cliffStarted;

    error CliffNotSetYet();
    error CliffAlreadySet();
    error InputArrayMismatchLength();
    error PoolIndexDoesNotExists(uint256 poolIndex);
    error AtLeastOnePoolRequired();

    event VestingCliffStarted();
    event PoolAdded(uint256 indexed index);
    event PoolUpdated(uint256 indexed index);

    modifier cliffSet() {
        if(!cliffStarted) {
            revert CliffNotSetYet();
        } 
        _;
    }

    modifier cliffNotSet() {
        if(cliffStarted) {
            revert CliffAlreadySet();
        }
        _;
    }

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MANAGER_ROLE, msg.sender); 
    }
    
    function addPools(uint256[] calldata cliffPeriods, uint256[] calldata vestingPeriods, uint256[] calldata tge) external cliffNotSet() onlyRole(MANAGER_ROLE) {
        
        uint256 inputArrayLength = cliffPeriods.length;

        if(inputArrayLength != vestingPeriods.length) {
            revert InputArrayMismatchLength();
        }

        if(inputArrayLength != tge.length) {
            revert InputArrayMismatchLength();
        }
            
        for(uint256 i; i < inputArrayLength; ) {            
            poolsLength++; // from 1
            pools[poolsLength].cliffPeriod = cliffPeriods[i];
            pools[poolsLength].vestingPeriod = vestingPeriods[i];
            pools[poolsLength].tge = tge[i];
            pools[poolsLength].set = true;
            emit PoolAdded(poolsLength);
            unchecked {
                i++;
            }            
        }        
    }

    function updatePools(uint256[] calldata poolIds, uint256[] calldata cliffPeriods, uint256[] calldata vestingPeriods, uint256[] calldata tge) external cliffNotSet() onlyRole(MANAGER_ROLE) {

        uint256 inputArrayLength = poolIds.length;

        if(inputArrayLength != cliffPeriods.length || vestingPeriods.length != tge.length) {
            revert InputArrayMismatchLength();
        }

        if(inputArrayLength != tge.length) {
            revert InputArrayMismatchLength();
        }

        for(uint256 i; i < inputArrayLength; ) {
            if(pools[poolIds[i]].set == false) {
                revert PoolIndexDoesNotExists(poolIds[i]);
            }
            pools[poolIds[i]].cliffPeriod = cliffPeriods[i];
            pools[poolIds[i]].vestingPeriod = vestingPeriods[i];
            pools[poolIds[i]].tge = tge[i];
            emit PoolUpdated(poolIds[i]);
            unchecked {
                i++;
            }
        }
    }

    function getPool(uint256 poolId) external view returns(uint256, uint256, uint256, uint256, uint256, uint256, bool) {             
        if(pools[poolId].set == false) {
              revert PoolIndexDoesNotExists(poolId);
        }
        return (pools[poolId].cliffStart, pools[poolId].cliffPeriod, pools[poolId].cliffEnd, pools[poolId].vestingPeriod, pools[poolId].vestingEnd, pools[poolId].tge, pools[poolId].set);
    }

    function getPoolIds() public view returns (uint256[] memory) {
        uint256[] memory poolIds = new uint256[](poolsLength);
        uint256 i;
        for(uint256 j = 1; j <= poolsLength; ) {
            poolIds[i] = j;
            unchecked { 
                i++;
                j++;
            }
        }
        return poolIds;
    }

    function getPoolIdsWithTge() external view returns (uint256[] memory, uint256[] memory) {
        uint256[] memory poolIds = new uint256[](poolsLength);
        uint256[] memory tge = new uint256[](poolsLength);
        uint256 i;
        for(uint256 j = 1; j <= poolsLength; ) {
            poolIds[i] = j;
            tge[i] = pools[j].tge;
            unchecked { 
                i++;
                j++;
            }
        }
        return (poolIds, tge);
    }

    function getPoolTge(uint256 poolId) public view returns(uint256) {
        if(pools[poolId].set == false) {
            revert PoolIndexDoesNotExists(poolId);
        }
        return pools[poolId].tge;
    }

    function setCliffStart() external cliffNotSet() onlyRole(MANAGER_ROLE) virtual {
        
        if(poolsLength == 0) {
            revert AtLeastOnePoolRequired();
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