// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20Y {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address a) external view returns (uint256);
}

/// @notice Minimal ERC-4626 subset for the yield-bearing vault (USYC on Arc, or
///         MockUSYC on testnet). Shares appreciate against USDC as the underlying
///         treasury accrues — that appreciation IS the citation-loyalty yield.
interface IERC4626Y {
    function asset() external view returns (address);
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
    function convertToAssets(uint256 shares) external view returns (uint256 assets);
}

interface INameRegistryY {
    function walletOf(bytes32 authorHash) external view returns (address);
}

/// @title CitationYieldUSYC — Kuot (Lepton · Arc)
/// @notice Real, yield-bearing escrow for citation rewards that sit unclaimed.
///         Unlike the legacy CitationYield (a self-funded "transparent APR"), this
///         deposits each unclaimed author's USDC into a tokenized-treasury vault
///         (USYC on Arc; MockUSYC on testnet) so the yield is genuinely earned
///         on-chain, not subsidised. When the author proves their ORCID and binds
///         a wallet in NameRegistry, they redeem principal + accrued yield.
contract CitationYieldUSYC {
    IERC20Y public immutable usdc;
    IERC4626Y public immutable vault; // USYC / MockUSYC
    INameRegistryY public immutable registry;
    address public immutable operator;

    mapping(bytes32 => uint256) public shares; // identity → vault shares held for them
    mapping(bytes32 => uint256) public principal; // identity → USDC principal recorded
    mapping(bytes32 => uint64) public since; // identity → first-cited timestamp
    mapping(bytes32 => bool) public claimed; // identity → already redeemed

    event Accrued(bytes32 indexed id, uint256 principal, uint256 sharesMinted, uint64 since);
    event Claimed(bytes32 indexed id, address indexed to, uint256 assets, uint256 yieldEarned);

    error NotOperator();
    error NotBound();
    error NotYours();
    error Nothing();
    error TransferFailed();

    constructor(address _usdc, address _vault, address _registry, address _operator) {
        usdc = IERC20Y(_usdc);
        vault = IERC4626Y(_vault);
        registry = INameRegistryY(_registry);
        operator = _operator;
        // Pre-approve the vault to pull USDC on deposit (max allowance, one-time).
        usdc.approve(_vault, type(uint256).max);
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    /// @notice Record an unclaimed author's reward: pull `amount` USDC from the
    ///         operator and deposit it into the yield vault, crediting the shares
    ///         to the author's identity. Sets the loyalty clock on first citation.
    function accrue(bytes32 id, uint256 amount) public onlyOperator {
        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        uint256 minted = vault.deposit(amount, address(this));
        shares[id] += minted;
        principal[id] += amount;
        if (since[id] == 0) since[id] = uint64(block.timestamp);
        claimed[id] = false;
        emit Accrued(id, principal[id], minted, since[id]);
    }

    /// @notice Batch version — one tx for a whole payout's unclaimed authors.
    function accrueMany(bytes32[] calldata ids, uint256[] calldata amounts) external onlyOperator {
        require(ids.length == amounts.length, "len");
        for (uint256 i; i < ids.length; ++i) accrue(ids[i], amounts[i]);
    }

    /// @notice Current redeemable USDC value of an identity's shares (principal + yield).
    function currentValue(bytes32 id) public view returns (uint256) {
        return vault.convertToAssets(shares[id]);
    }

    /// @notice Yield earned so far for an identity (current value minus principal).
    function pendingYield(bytes32 id) public view returns (uint256) {
        uint256 v = currentValue(id);
        uint256 p = principal[id];
        return v > p ? v - p : 0;
    }

    /// @notice Redeem principal + accrued yield — only the wallet bound to `id` in
    ///         NameRegistry. Burns the vault shares and sends USDC straight to the
    ///         author. One-time per identity.
    function claim(bytes32 id) external returns (uint256 assets) {
        address bound = registry.walletOf(id);
        if (bound == address(0)) revert NotBound();
        if (bound != msg.sender) revert NotYours();
        uint256 s = shares[id];
        if (s == 0) revert Nothing();
        uint256 p = principal[id];
        shares[id] = 0;
        principal[id] = 0;
        claimed[id] = true;
        assets = vault.redeem(s, msg.sender, address(this));
        emit Claimed(id, msg.sender, assets, assets > p ? assets - p : 0);
    }
}
