// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20U {
    function transfer(address to, uint256 amount) external returns (bool);
}

interface INameRegistry {
    function walletOf(bytes32 authorHash) external view returns (address);
}

/// @title UnclaimedEscrow — Sebutkan
/// @notice Holds USDC owed to authors who haven't claimed their wallet yet,
///         keyed by their identity hash (ORCID/OpenAlex id, same hash as
///         NameRegistry). When an author proves their ORCID and binds a wallet
///         in NameRegistry, they can withdraw everything Sebutkan accrued for
///         them. Nothing is lost — unclaimed rewards wait on-chain.
contract UnclaimedEscrow {
    IERC20U public immutable usdc;
    INameRegistry public immutable registry;
    address public immutable operator;

    mapping(bytes32 => uint256) public owed; // authorHash → USDC owed
    uint256 public totalOwed;

    event Recorded(bytes32 indexed authorHash, uint256 amount, uint256 owedTotal);
    event Withdrawn(bytes32 indexed authorHash, address indexed to, uint256 amount);

    error NotOperator();
    error NotBound();
    error NotYours();
    error Nothing();
    error TransferFailed();

    constructor(address _usdc, address _registry, address _operator) {
        usdc = IERC20U(_usdc);
        registry = INameRegistry(_registry);
        operator = _operator;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    /// @notice Record an amount owed to an unclaimed author. The operator must
    ///         have funded this contract with at least `amount` USDC.
    function record(bytes32 authorHash, uint256 amount) external onlyOperator {
        owed[authorHash] += amount;
        totalOwed += amount;
        emit Recorded(authorHash, amount, owed[authorHash]);
    }

    /// @notice Batch version — one tx for a whole payout's unclaimed authors.
    function recordMany(bytes32[] calldata hashes, uint256[] calldata amounts)
        external
        onlyOperator
    {
        uint256 n = hashes.length;
        require(n == amounts.length, "len");
        uint256 added;
        for (uint256 i; i < n; ++i) {
            owed[hashes[i]] += amounts[i];
            added += amounts[i];
            emit Recorded(hashes[i], amounts[i], owed[hashes[i]]);
        }
        totalOwed += added;
    }

    /// @notice Withdraw everything owed to an identity — callable only by the
    ///         wallet bound to that identity in NameRegistry.
    function withdraw(bytes32 authorHash) external {
        address bound = registry.walletOf(authorHash);
        if (bound == address(0)) revert NotBound();
        if (bound != msg.sender) revert NotYours();
        uint256 amt = owed[authorHash];
        if (amt == 0) revert Nothing();
        owed[authorHash] = 0;
        totalOwed -= amt;
        if (!usdc.transfer(msg.sender, amt)) revert TransferFailed();
        emit Withdrawn(authorHash, msg.sender, amt);
    }
}
