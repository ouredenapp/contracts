// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "./includes/TransactionThrottler.sol";

contract EdenToken is ERC20, ERC20Burnable, ERC20Pausable, ERC20Permit, TransactionThrottler {
    
    constructor(address mintTo)
        ERC20("EDEN", "EDN")
        TransactionThrottler(msg.sender)
        ERC20Permit("EDEN")
    {
        _mint(mintTo, 7_200_000_000 * 10 ** decimals());
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    // The following functions are overrides required by Solidity.

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Pausable)
        transactionThrottler(from, to, value)
    {
        super._update(from, to, value);
    }
}

