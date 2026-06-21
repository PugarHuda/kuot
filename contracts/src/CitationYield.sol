// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20Y {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address a) external view returns (uint256);
}

interface INameRegistryY {
    function walletOf(bytes32 authorHash) external view returns (address);
}

/// @title CitationYield — kuot
/// @notice A transparent, protocol-funded "citation-loyalty" yield on rewards that
///         sit unclaimed: the longer an author waits before claiming, the more
///         bonus accrues (linear APR), paid from this contract's reserve. This is
///         NOT a fake DeFi yield — it's a real on-chain incentive funded by the
///         protocol reserve. Principal still lives in UnclaimedEscrow; this only
///         adds the bonus. Authority to claim is gated by NameRegistry (same as
///         the escrow): only the wallet bound to the identity can claim.
contract CitationYield {
    IERC20Y public immutable usdc;
    INameRegistryY public immutable registry;
    address public immutable operator;
    /// @notice Annual yield in basis points (e.g. 1200 = 12% APR).
    uint16 public apyBps;
    /// @notice Bonus is capped at this fraction of principal (bps, e.g. 5000 = 50%).
    uint16 public constant MAX_BONUS_BPS = 5000;

    mapping(bytes32 => uint256) public principal; // identity → cited USDC
    mapping(bytes32 => uint64) public since; // identity → first-cited timestamp
    mapping(bytes32 => bool) public claimed; // identity → bonus already taken

    event Accrued(bytes32 indexed id, uint256 principal, uint64 since);
    event BonusClaimed(bytes32 indexed id, address indexed to, uint256 bonus);
    event ApySet(uint16 apyBps);

    error NotOperator();
    error NotBound();
    error NotYours();
    error Nothing();
    error TransferFailed();

    constructor(address _usdc, address _registry, address _operator, uint16 _apyBps) {
        usdc = IERC20Y(_usdc);
        registry = INameRegistryY(_registry);
        operator = _operator;
        apyBps = _apyBps;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    function setApy(uint16 _apyBps) external onlyOperator {
        apyBps = _apyBps;
        emit ApySet(_apyBps);
    }

    /// @notice Record cited principal for an identity (mirrors UnclaimedEscrow).
    ///         Sets the loyalty clock on first citation.
    function accrue(bytes32 id, uint256 amount) public onlyOperator {
        if (since[id] == 0) since[id] = uint64(block.timestamp);
        principal[id] += amount;
        emit Accrued(id, principal[id], since[id]);
    }

    function accrueMany(bytes32[] calldata ids, uint256[] calldata amounts) external onlyOperator {
        require(ids.length == amounts.length, "len");
        for (uint256 i; i < ids.length; ++i) accrue(ids[i], amounts[i]);
    }

    /// @notice Bonus accrued so far (linear APR · elapsed), capped, and bounded by
    ///         the reserve balance so it's always payable.
    function pendingBonus(bytes32 id) public view returns (uint256) {
        if (since[id] == 0 || claimed[id]) return 0;
        uint256 elapsed = block.timestamp - since[id];
        uint256 bonus = (principal[id] * apyBps * elapsed) / (365 days * 10_000);
        uint256 cap = (principal[id] * MAX_BONUS_BPS) / 10_000;
        if (bonus > cap) bonus = cap;
        uint256 bal = usdc.balanceOf(address(this));
        return bonus > bal ? bal : bonus;
    }

    /// @notice Claim the accrued bonus — only the wallet bound to `id` in
    ///         NameRegistry. One-time per identity.
    function claimBonus(bytes32 id) external {
        address bound = registry.walletOf(id);
        if (bound == address(0)) revert NotBound();
        if (bound != msg.sender) revert NotYours();
        uint256 bonus = pendingBonus(id);
        if (bonus == 0) revert Nothing();
        claimed[id] = true;
        if (!usdc.transfer(msg.sender, bonus)) revert TransferFailed();
        emit BonusClaimed(id, msg.sender, bonus);
    }
}
