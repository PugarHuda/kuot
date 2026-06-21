// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20B {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title BountyMarket — Sebutkan
/// @notice Anyone can sponsor research on a topic by depositing USDC. When a
///         Sebutkan query satisfies the topic, the operator settles the bounty,
///         paying the cited authors proportionally. Unsettled bounties are
///         refundable after expiry. Turns "I want research on X" into a funded,
///         author-paying request — no platform fee.
contract BountyMarket {
    IERC20B public immutable usdc;
    address public immutable operator;

    struct Bounty {
        address sponsor;
        bytes32 topicHash; // keccak256(lowercased topic)
        uint256 amount;
        uint64 expiresAt;
        bool settled;
        bool refunded;
    }

    uint256 public bountyCount;
    mapping(uint256 => Bounty) public bounties;

    event BountyCreated(uint256 indexed id, address indexed sponsor, bytes32 indexed topicHash, uint256 amount, uint64 expiresAt);
    event BountySettled(uint256 indexed id, bytes32 indexed queryId, uint256 totalPaid, uint256 authorCount);
    event BountyRefunded(uint256 indexed id, uint256 amount);
    event AuthorPaid(uint256 indexed id, address indexed author, uint256 amount);

    error NotOperator();
    error NotSponsor();
    error ZeroAmount();
    error Settled();
    error Refunded();
    error NotExpired();
    error BadWeights(uint256 got);
    error LenMismatch();
    error TransferFailed();

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    constructor(address _usdc, address _operator) {
        usdc = IERC20B(_usdc);
        operator = _operator;
    }

    /// @notice Sponsor funds a bounty for a topic (must approve USDC first).
    function create(bytes32 topicHash, uint256 amount, uint64 ttlSeconds) external returns (uint256 id) {
        if (amount == 0) revert ZeroAmount();
        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        id = bountyCount++;
        uint64 expiresAt = uint64(block.timestamp) + ttlSeconds;
        bounties[id] = Bounty(msg.sender, topicHash, amount, expiresAt, false, false);
        emit BountyCreated(id, msg.sender, topicHash, amount, expiresAt);
    }

    /// @notice Operator pays out the bounty to cited authors by weight (sum 10000).
    function settle(uint256 id, bytes32 queryId, address[] calldata authors, uint16[] calldata weightsBps)
        external
        onlyOperator
    {
        Bounty storage b = bounties[id];
        if (b.settled) revert Settled();
        if (b.refunded) revert Refunded();
        uint256 n = authors.length;
        if (n != weightsBps.length) revert LenMismatch();

        uint256 weightSum;
        for (uint256 i; i < n; ++i) weightSum += weightsBps[i];
        if (weightSum != 10_000) revert BadWeights(weightSum);

        b.settled = true;
        uint256 amount = b.amount;
        uint256 distributed;
        for (uint256 i; i < n; ++i) {
            uint256 share = i == n - 1 ? amount - distributed : (amount * weightsBps[i]) / 10_000;
            distributed += share;
            if (!usdc.transfer(authors[i], share)) revert TransferFailed();
            emit AuthorPaid(id, authors[i], share);
        }
        emit BountySettled(id, queryId, amount, n);
    }

    /// @notice Sponsor reclaims an unsettled bounty after it expires.
    function refund(uint256 id) external {
        Bounty storage b = bounties[id];
        if (msg.sender != b.sponsor) revert NotSponsor();
        if (b.settled) revert Settled();
        if (b.refunded) revert Refunded();
        if (block.timestamp < b.expiresAt) revert NotExpired();
        b.refunded = true;
        if (!usdc.transfer(b.sponsor, b.amount)) revert TransferFailed();
        emit BountyRefunded(id, b.amount);
    }
}
