// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20FX {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

/// @title StableFXPool — kuot
/// @notice A real on-chain USDC<->EURC swap pool on Arc. Circle's StableFX
///         (App Kit Swap) has no Arc-testnet route yet, so Kuot runs its own thin
///         FX pool: the operator seeds USDC+EURC liquidity and an author who elects
///         euros gets a REAL on-chain swap before payout — not a bypass. Both legs
///         are 6-decimal stablecoins, so the FX rate is oracle-set (constant price)
///         with a small fee, the way an FX desk quotes a stable pair.
contract StableFXPool {
    IERC20FX public immutable usdc;
    IERC20FX public immutable eurc;
    address public owner;
    /// EURC per 1 USDC, scaled by 1e6 (e.g. 920000 == 0.92 EURC per USDC).
    uint256 public priceEurcPerUsdc1e6;
    uint16 public feeBps; // swap fee in basis points (e.g. 30 == 0.30%)

    event Swapped(address indexed who, address indexed tokenIn, uint256 amountIn, uint256 amountOut);
    event PriceSet(uint256 priceEurcPerUsdc1e6, uint16 feeBps);

    error NotOwner();
    error BadToken();
    error Slippage();
    error ZeroAmount();

    constructor(address _usdc, address _eurc, uint256 _price1e6, uint16 _feeBps) {
        usdc = IERC20FX(_usdc);
        eurc = IERC20FX(_eurc);
        owner = msg.sender;
        priceEurcPerUsdc1e6 = _price1e6;
        feeBps = _feeBps;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// Owner (operator) updates the oracle rate + fee.
    function setPrice(uint256 _price1e6, uint16 _feeBps) external onlyOwner {
        priceEurcPerUsdc1e6 = _price1e6;
        feeBps = _feeBps;
        emit PriceSet(_price1e6, _feeBps);
    }

    /// Net amountOut for swapping `amountIn` of `tokenIn` into the other token.
    function quote(address tokenIn, uint256 amountIn) public view returns (uint256 amountOut) {
        if (amountIn == 0) revert ZeroAmount();
        if (tokenIn == address(usdc)) {
            amountOut = (amountIn * priceEurcPerUsdc1e6) / 1e6;
        } else if (tokenIn == address(eurc)) {
            amountOut = (amountIn * 1e6) / priceEurcPerUsdc1e6;
        } else {
            revert BadToken();
        }
        amountOut = (amountOut * (10000 - feeBps)) / 10000;
    }

    /// Swap `amountIn` of `tokenIn` for the other token; sends >= `minOut` to caller.
    /// Caller must approve this pool for `amountIn` of `tokenIn` first.
    function swap(address tokenIn, uint256 amountIn, uint256 minOut) external returns (uint256 amountOut) {
        amountOut = quote(tokenIn, amountIn);
        if (amountOut < minOut) revert Slippage();
        IERC20FX tIn = IERC20FX(tokenIn);
        IERC20FX tOut = tokenIn == address(usdc) ? eurc : usdc;
        require(tIn.transferFrom(msg.sender, address(this), amountIn), "transferFrom failed");
        require(tOut.transfer(msg.sender, amountOut), "transfer failed");
        emit Swapped(msg.sender, tokenIn, amountIn, amountOut);
    }

    /// Owner liquidity management (seed / rebalance / reclaim).
    function withdraw(address token, address to, uint256 amount) external onlyOwner {
        require(IERC20FX(token).transfer(to, amount), "transfer failed");
    }

    function reserves() external view returns (uint256 usdcBal, uint256 eurcBal) {
        return (usdc.balanceOf(address(this)), eurc.balanceOf(address(this)));
    }
}
