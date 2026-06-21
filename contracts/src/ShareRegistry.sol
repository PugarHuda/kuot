// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title ShareRegistry — Sebutkan
/// @notice Durable, zero-infra store for publicly shared research results. The
///         operator publishes a finished result's JSON on-chain under a short id
///         derived from the same queryId that AttributionLedger attests — so the
///         share link and the paid attestation line up. Anyone reads it back with
///         a single `content` view call (no indexer, no external DB, no TTL).
contract ShareRegistry {
    address public immutable operator;

    /// @dev id → result JSON (UTF-8). id = first 8 bytes of keccak256(query).
    mapping(bytes8 => string) private store;
    /// @dev id → unix timestamp it was published (0 = never).
    mapping(bytes8 => uint64) public publishedAt;

    event Shared(bytes8 indexed id, address indexed publisher, uint256 length);

    error NotOperator();

    constructor(address operator_) {
        operator = operator_ == address(0) ? msg.sender : operator_;
    }

    /// @notice Publish (or overwrite) a shared result. Operator-only — the server
    ///         derives the id and relays so users pay no gas.
    function publish(bytes8 id, string calldata json) external {
        if (msg.sender != operator) revert NotOperator();
        store[id] = json;
        publishedAt[id] = uint64(block.timestamp);
        emit Shared(id, msg.sender, bytes(json).length);
    }

    /// @notice Read a shared result's JSON (empty string if never published).
    function content(bytes8 id) external view returns (string memory) {
        return store[id];
    }

    /// @notice True if an id has been published.
    function exists(bytes8 id) external view returns (bool) {
        return publishedAt[id] != 0;
    }
}
