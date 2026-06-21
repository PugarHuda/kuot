// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title GroundingRegistry — Kuot (Lepton · Arc)
/// @notice Proof-of-grounding: binds each query's settlement to cryptographic
///         evidence that an author's work actually grounded the generated answer.
///         The operator commits the answer digest (keccak256 of the synthesis) plus
///         the set of author identities whose work was genuinely used as a source.
///         A citation is only paid if it is `isGrounded` — closing the x402
///         "pay-then-maybe-delivered" gap (you pay for a source only once it's
///         proven to have grounded the answer), and making every payout auditable
///         against a tamper-evident digest.
contract GroundingRegistry {
    address public immutable operator;

    struct Proof {
        bytes32 digest; // keccak256(synthesis) — tamper-evidence
        uint64 at; // commit timestamp
        uint32 groundedCount; // number of grounded authors
    }

    mapping(bytes32 => Proof) public proofs; // queryId → proof
    mapping(bytes32 => mapping(bytes32 => bool)) public grounded; // queryId → authorHash → used as source

    event Committed(bytes32 indexed queryId, bytes32 digest, uint32 groundedCount);

    error NotOperator();
    error AlreadyCommitted();
    error NotCommitted();

    constructor(address _operator) {
        operator = _operator;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    /// @notice Commit the grounding proof for a query: the answer digest and the
    ///         author identities whose work grounded it. One-time per query.
    function commit(bytes32 queryId, bytes32 digest, bytes32[] calldata groundedHashes) external onlyOperator {
        if (proofs[queryId].at != 0) revert AlreadyCommitted();
        proofs[queryId] = Proof({digest: digest, at: uint64(block.timestamp), groundedCount: uint32(groundedHashes.length)});
        for (uint256 i; i < groundedHashes.length; ++i) {
            grounded[queryId][groundedHashes[i]] = true;
        }
        emit Committed(queryId, digest, uint32(groundedHashes.length));
    }

    /// @notice Was this author's work proven to ground this query's answer?
    function isGrounded(bytes32 queryId, bytes32 authorHash) external view returns (bool) {
        return grounded[queryId][authorHash];
    }

    /// @notice Verify a synthesis against the committed digest (tamper-evidence).
    function verify(bytes32 queryId, bytes32 digest) external view returns (bool) {
        Proof memory p = proofs[queryId];
        if (p.at == 0) revert NotCommitted();
        return p.digest == digest;
    }
}
