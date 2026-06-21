// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CitationYield} from "../src/CitationYield.sol";

contract MockUSDCY {
    mapping(address => uint256) public balanceOf;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a; balanceOf[to] += a; return true;
    }
}

contract MockRegistryY {
    mapping(bytes32 => address) public walletOf;
    function set(bytes32 id, address w) external { walletOf[id] = w; }
}

contract CitationYieldTest is Test {
    CitationYield y;
    MockUSDCY usdc;
    MockRegistryY reg;
    address operator = address(0xA11CE);
    address author = address(0xB0B);
    bytes32 id = keccak256("orcid:0000-0001");

    function setUp() public {
        usdc = new MockUSDCY();
        reg = new MockRegistryY();
        vm.prank(operator);
        y = new CitationYield(address(usdc), address(reg), operator, 1200); // 12% APR
        usdc.mint(address(y), 1_000_000); // 1 USDC reserve
    }

    function test_accrueSetsClockAndPrincipal() public {
        vm.prank(operator);
        y.accrue(id, 500_000); // 0.5 USDC cited
        assertEq(y.principal(id), 500_000);
        assertGt(y.since(id), 0);
    }

    function test_bonusGrowsWithTime() public {
        vm.prank(operator);
        y.accrue(id, 1_000_000); // 1 USDC
        assertEq(y.pendingBonus(id), 0); // t=0
        vm.warp(block.timestamp + 365 days);
        // 12% of 1 USDC over a year = 0.12 USDC, but capped by reserve (1 USDC) → 120000
        assertEq(y.pendingBonus(id), 120_000);
    }

    function test_bonusCappedAt50pct() public {
        vm.prank(operator);
        y.accrue(id, 1_000_000);
        vm.warp(block.timestamp + 365 days * 10); // 10y → 120% uncapped
        assertEq(y.pendingBonus(id), 500_000); // capped at 50% of principal
    }

    function test_claimBonusOnlyBoundWallet() public {
        vm.prank(operator);
        y.accrue(id, 1_000_000);
        vm.warp(block.timestamp + 365 days);
        reg.set(id, author);

        vm.prank(address(0xDEAD));
        vm.expectRevert(CitationYield.NotYours.selector);
        y.claimBonus(id);

        vm.prank(author);
        y.claimBonus(id);
        assertEq(usdc.balanceOf(author), 120_000);
        assertEq(y.pendingBonus(id), 0); // claimed
    }

    function test_revertAccrueNotOperator() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(CitationYield.NotOperator.selector);
        y.accrue(id, 1);
    }
}
