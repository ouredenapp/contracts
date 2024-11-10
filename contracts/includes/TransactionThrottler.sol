// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract TransactionThrottler is Ownable {
    bool internal _restrictionActive;

    uint256 private constant _delayBetweenTx = 30;
    uint256 private _maxTransferAmount;
    uint256 private _maxWalletAmount;

    mapping(address => bool) private _isWhitelisted;
    mapping(address => bool) private _isUnthrottled;
    mapping(address => uint256) private _previousTx;

    event RestrictionActiveChanged(bool active);
    event MaxTransferAmountChanged(uint256 maxTransferAmount);
    event MarkedWhitelisted(address indexed account, bool isWhitelisted);
    event MarkedUnthrottled(address indexed account, bool isUnthrottled);

    error ZeroAddressIsProhibited();
    error MaxTransferAmountExceeded();
    error TransactionProtectionIntervalLimit();

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setMaxTransferAmount(uint256 amount) external virtual onlyOwner {
        _maxTransferAmount = amount;
        emit MaxTransferAmountChanged(_maxTransferAmount);
    }

    function setRestrictionActive(bool active) external onlyOwner {
        _restrictionActive = active;
        emit RestrictionActiveChanged(_restrictionActive);
    }

    function unthrottleAccount(
        address account,
        bool unthrottled
    ) public virtual onlyOwner {
        if (account == address(0)) {
            revert ZeroAddressIsProhibited();
        }
        _isUnthrottled[account] = unthrottled;
        emit MarkedUnthrottled(account, unthrottled);
    }

    function isUnthrottled(address account) external view returns (bool) {
        return _isUnthrottled[account];
    }

    function whitelistAccount(
        address account,
        bool whitelisted
    ) public virtual onlyOwner {
        if (account == address(0)) {
            revert ZeroAddressIsProhibited();
        }
        _isWhitelisted[account] = whitelisted;
        emit MarkedWhitelisted(account, whitelisted);
    }

    function isWhitelisted(address account) external view returns (bool) {
        return _isWhitelisted[account];
    }

    modifier transactionThrottler(
        address sender,
        address recipient,
        uint256 amount
    ) virtual {
        if (
            _restrictionActive &&
            !_isUnthrottled[recipient] &&
            !_isUnthrottled[sender]
        ) {
            if (_maxTransferAmount > 0) {
                if (amount > _maxTransferAmount) {
                    revert MaxTransferAmountExceeded();
                }
            }

            if (!_isWhitelisted[recipient]) {
                if (
                    _previousTx[recipient] + _delayBetweenTx > block.timestamp
                ) {
                    revert TransactionProtectionIntervalLimit();
                }
                _previousTx[recipient] = block.timestamp;
            }

            if (!_isWhitelisted[sender]) {
                if (_previousTx[sender] + _delayBetweenTx > block.timestamp) {
                    revert TransactionProtectionIntervalLimit();
                }
                _previousTx[sender] = block.timestamp;
            }
        }
        _;
    }
}
