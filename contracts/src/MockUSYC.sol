// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20M {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address a) external view returns (uint256);
}

/// @title MockUSYC — Kuot (Lepton testnet)
/// @notice A minimal ERC-4626-style yield vault over USDC, standing in for Circle's
///         tokenized-treasury token USYC on testnet (real USYC access is gated to
///         non-US institutions with a $100k minimum). The mechanism is REAL: shares
///         appreciate as the vault's USDC balance grows. To simulate treasury yield
///         on a testnet, anyone can transfer USDC to this contract (or call
///         `simulateYield`) — `convertToAssets` then returns more than was deposited.
///         CitationYieldUSYC points at this on testnet and at USYC on Arc mainnet.
contract MockUSYC {
    IERC20M public immutable asset; // USDC
    string public constant name = "Mock USYC (Kuot testnet)";
    string public constant symbol = "mUSYC";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    event Deposit(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);
    event Withdraw(address indexed caller, address indexed receiver, address indexed owner, uint256 assets, uint256 shares);

    constructor(address _usdc) {
        asset = IERC20M(_usdc);
    }

    /// @notice Total USDC under management (balance held by this vault).
    function totalAssets() public view returns (uint256) {
        return asset.balanceOf(address(this));
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 ts = totalSupply;
        uint256 ta = totalAssets();
        return (ts == 0 || ta == 0) ? assets : (assets * ts) / ta;
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 ts = totalSupply;
        return ts == 0 ? shares : (shares * totalAssets()) / ts;
    }

    /// @notice Deposit USDC, mint shares to `receiver`. Shares computed against the
    ///         pre-deposit assets/supply ratio (standard ERC-4626).
    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        shares = convertToShares(assets);
        require(asset.transferFrom(msg.sender, address(this), assets), "deposit xfer");
        totalSupply += shares;
        balanceOf[receiver] += shares;
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    /// @notice Burn `shares` from `owner`, send the corresponding USDC to `receiver`.
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets) {
        require(balanceOf[owner] >= shares, "redeem bal");
        assets = convertToAssets(shares);
        balanceOf[owner] -= shares;
        totalSupply -= shares;
        require(asset.transfer(receiver, assets), "redeem xfer");
        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    /// @notice Testnet helper: pull `amount` USDC in as "treasury yield" so existing
    ///         shares appreciate. Caller must have approved this vault.
    function simulateYield(uint256 amount) external {
        require(asset.transferFrom(msg.sender, address(this), amount), "yield xfer");
    }
}
