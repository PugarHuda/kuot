// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title NameRegistry — kuot
/// @notice On-chain binding from an author identity hash (keccak of the
///         OpenAlex/ORCID id) to a real wallet. An author proves wallet control
///         off-chain with an EIP-191 signature over keccak256(authorId, wallet);
///         the operator relays the binding here (gasless UX for the author).
///         AttributionLedger payouts then route to the *real* claimed wallet
///         instead of a placeholder. The signature is stored as public consent
///         evidence — anyone can verify the binding was authorized.
contract NameRegistry {
    struct Binding {
        address wallet;
        uint64 signedAt;
        bytes signature;
    }

    address public immutable operator;
    mapping(bytes32 => Binding) public bindings;
    uint256 public bindingCount;

    event Bound(bytes32 indexed authorHash, address indexed wallet, uint64 signedAt);
    event Rebound(bytes32 indexed authorHash, address indexed from, address indexed to);

    error NotOperator();
    error AlreadyBound();
    error NotBound();
    error ZeroWallet();

    constructor(address _operator) {
        operator = _operator;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    function bind(bytes32 authorHash, address wallet, bytes calldata signature)
        external
        onlyOperator
    {
        if (wallet == address(0)) revert ZeroWallet();
        if (bindings[authorHash].wallet != address(0)) revert AlreadyBound();
        bindings[authorHash] =
            Binding({wallet: wallet, signedAt: uint64(block.timestamp), signature: signature});
        unchecked {
            ++bindingCount;
        }
        emit Bound(authorHash, wallet, uint64(block.timestamp));
    }

    function rebind(bytes32 authorHash, address newWallet, bytes calldata signature)
        external
        onlyOperator
    {
        if (newWallet == address(0)) revert ZeroWallet();
        address prev = bindings[authorHash].wallet;
        if (prev == address(0)) revert NotBound();
        bindings[authorHash] =
            Binding({wallet: newWallet, signedAt: uint64(block.timestamp), signature: signature});
        emit Rebound(authorHash, prev, newWallet);
    }

    /// @notice Resolve a claimed wallet, or address(0) if unclaimed.
    function walletOf(bytes32 authorHash) external view returns (address) {
        return bindings[authorHash].wallet;
    }
}
