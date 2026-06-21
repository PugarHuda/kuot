// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @title AttributionLedger — Sebutkan
/// @notice The settlement contract: when the research agent finishes a query, it
///         calls `attestAndSplit` to pay the cited authors their share of the
///         spend, atomically, and emit an on-chain attestation of the citation.
///         This is the transaction Sebutkan relays gasless on mainnet via 1Shot.
/// @dev    The caller (the agent's session account, acting under an ERC-7710
///         delegation) must have approved this contract to move `amount` of USDC.
contract AttributionLedger {
    IERC20 public immutable usdc;

    /// @dev Weights are in basis points and must sum to exactly 10_000.
    struct Citation {
        address author;
        uint16 weightBps;
    }

    /// @notice Lifetime USDC routed to each author.
    mapping(address => uint256) public authorEarnings;
    /// @notice Guards against re-attesting the same query id.
    mapping(bytes32 => bool) public attested;

    event QueryAttested(
        bytes32 indexed queryId, address indexed payer, uint256 total, uint256 citationCount
    );
    event AuthorPaid(
        bytes32 indexed queryId, address indexed author, uint256 amount, uint16 weightBps
    );

    error AlreadyAttested();
    error NoCitations();
    error BadWeightSum(uint256 got);
    error ZeroAuthor();
    error TransferFailed();

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    /// @notice Pull `amount` USDC from the caller and split it across `cites`
    ///         by weight, then record the attestation.
    function attestAndSplit(bytes32 queryId, uint256 amount, Citation[] calldata cites) external {
        if (attested[queryId]) revert AlreadyAttested();
        uint256 n = cites.length;
        if (n == 0) revert NoCitations();

        uint256 weightSum;
        for (uint256 i; i < n; ++i) {
            if (cites[i].author == address(0)) revert ZeroAuthor();
            weightSum += cites[i].weightBps;
        }
        if (weightSum != 10_000) revert BadWeightSum(weightSum);

        attested[queryId] = true;
        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();

        uint256 distributed;
        for (uint256 i; i < n; ++i) {
            // Last author absorbs rounding dust so the full `amount` is paid out.
            uint256 share =
                i == n - 1 ? amount - distributed : (amount * cites[i].weightBps) / 10_000;
            distributed += share;
            authorEarnings[cites[i].author] += share;
            if (!usdc.transfer(cites[i].author, share)) revert TransferFailed();
            emit AuthorPaid(queryId, cites[i].author, share, cites[i].weightBps);
        }

        emit QueryAttested(queryId, msg.sender, amount, n);
    }

    /// @notice Record an on-chain attestation WITHOUT moving funds — for when the
    ///         payment rail is separate (e.g. gasless USDC transfers relayed via
    ///         1Shot under a transfer-only ERC-7715 permission). Same validation
    ///         as attestAndSplit; emits the same events for auditability.
    function attest(bytes32 queryId, uint256 total, Citation[] calldata cites) external {
        if (attested[queryId]) revert AlreadyAttested();
        uint256 n = cites.length;
        if (n == 0) revert NoCitations();

        uint256 weightSum;
        for (uint256 i; i < n; ++i) {
            if (cites[i].author == address(0)) revert ZeroAuthor();
            weightSum += cites[i].weightBps;
        }
        if (weightSum != 10_000) revert BadWeightSum(weightSum);

        attested[queryId] = true;
        uint256 distributed;
        for (uint256 i; i < n; ++i) {
            uint256 share =
                i == n - 1 ? total - distributed : (total * cites[i].weightBps) / 10_000;
            distributed += share;
            authorEarnings[cites[i].author] += share;
            emit AuthorPaid(queryId, cites[i].author, share, cites[i].weightBps);
        }
        emit QueryAttested(queryId, msg.sender, total, n);
    }
}
