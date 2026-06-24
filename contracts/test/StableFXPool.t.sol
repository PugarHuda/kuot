// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {StableFXPool} from "../src/StableFXPool.sol";

/// Minimal 6-decimal ERC-20 (USDC/EURC-like) for tests.
contract MockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[t] += a;
        return true;
    }
}

contract StableFXPoolTest is Test {
    MockToken usdc;
    MockToken eurc;
    StableFXPool pool;
    address user = address(0xBEEF);

    uint256 constant PRICE = 920_000; // 0.92 EURC per USDC
    uint16 constant FEE = 30; // 0.30%

    function setUp() public {
        usdc = new MockToken();
        eurc = new MockToken();
        pool = new StableFXPool(address(usdc), address(eurc), PRICE, FEE);
        // Seed liquidity.
        usdc.mint(address(pool), 1_000_000_000); // 1000 USDC
        eurc.mint(address(pool), 1_000_000_000); // 1000 EURC
    }

    function test_quoteUsdcToEurc() public view {
        // 10 USDC -> 10 * 0.92 = 9.2 EURC, minus 0.30% fee.
        uint256 out = pool.quote(address(usdc), 10_000_000);
        uint256 expected = (10_000_000 * PRICE / 1e6) * (10000 - FEE) / 10000;
        assertEq(out, expected);
        assertEq(out, 9_172_400); // 9.2 EURC * 0.997
    }

    function test_swapUsdcToEurcMovesFunds() public {
        usdc.mint(user, 10_000_000);
        uint256 expected = pool.quote(address(usdc), 10_000_000);

        vm.startPrank(user);
        usdc.approve(address(pool), 10_000_000);
        uint256 out = pool.swap(address(usdc), 10_000_000, expected);
        vm.stopPrank();

        assertEq(out, expected);
        assertEq(eurc.balanceOf(user), expected, "user got EURC");
        assertEq(usdc.balanceOf(user), 0, "user spent USDC");
        assertEq(usdc.balanceOf(address(pool)), 1_000_000_000 + 10_000_000, "pool took USDC");
    }

    function test_swapEurcToUsdcInverse() public {
        eurc.mint(user, 9_200_000); // 9.2 EURC
        uint256 expected = pool.quote(address(eurc), 9_200_000);
        vm.startPrank(user);
        eurc.approve(address(pool), 9_200_000);
        uint256 out = pool.swap(address(eurc), 9_200_000, 0);
        vm.stopPrank();
        assertEq(out, expected);
        assertGt(usdc.balanceOf(user), 0);
    }

    function test_revertsOnSlippage() public {
        usdc.mint(user, 10_000_000);
        uint256 q = pool.quote(address(usdc), 10_000_000);
        vm.startPrank(user);
        usdc.approve(address(pool), 10_000_000);
        vm.expectRevert(StableFXPool.Slippage.selector);
        pool.swap(address(usdc), 10_000_000, q + 1); // demand more than quoted
        vm.stopPrank();
    }

    function test_revertsOnBadToken() public {
        vm.expectRevert(StableFXPool.BadToken.selector);
        pool.quote(address(0xDEAD), 1_000_000);
    }

    function test_onlyOwnerSetsPrice() public {
        vm.prank(user);
        vm.expectRevert(StableFXPool.NotOwner.selector);
        pool.setPrice(930_000, 20);

        pool.setPrice(930_000, 20); // owner (this) succeeds
        assertEq(pool.priceEurcPerUsdc1e6(), 930_000);
        assertEq(pool.feeBps(), 20);
    }

    function test_onlyOwnerWithdraws() public {
        vm.prank(user);
        vm.expectRevert(StableFXPool.NotOwner.selector);
        pool.withdraw(address(usdc), user, 1);

        pool.withdraw(address(usdc), address(this), 1_000_000);
        assertEq(usdc.balanceOf(address(this)), 1_000_000);
    }

    function testFuzz_quoteNeverExceedsUnfeeRate(uint96 amountIn) public view {
        vm.assume(amountIn > 0);
        uint256 out = pool.quote(address(usdc), amountIn);
        uint256 gross = uint256(amountIn) * PRICE / 1e6;
        assertLe(out, gross); // fee never increases output
    }
}
