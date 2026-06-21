// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CitationYieldUSYC} from "../src/CitationYieldUSYC.sol";
import {MockUSYC} from "../src/MockUSYC.sol";

/// Full ERC20 mock with allowance (the yield path uses transferFrom + approve).
contract MockUSDCFull {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function approve(address spender, uint256 a) external returns (bool) {
        allowance[msg.sender][spender] = a;
        return true;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function transferFrom(address from, address to, uint256 a) external returns (bool) {
        uint256 al = allowance[from][msg.sender];
        if (al != type(uint256).max) allowance[from][msg.sender] = al - a;
        balanceOf[from] -= a;
        balanceOf[to] += a;
        return true;
    }
}

contract MockRegistryY {
    mapping(bytes32 => address) public walletOf;
    function set(bytes32 h, address w) external {
        walletOf[h] = w;
    }
}

contract CitationYieldUSYCTest is Test {
    MockUSDCFull usdc;
    MockUSYC vault;
    MockRegistryY reg;
    CitationYieldUSYC yieldC;

    address operator;
    address alice = address(0xA11CE);
    bytes32 id = keccak256("0000-0002-1825-0097");

    function setUp() public {
        operator = address(this);
        usdc = new MockUSDCFull();
        vault = new MockUSYC(address(usdc));
        reg = new MockRegistryY();
        yieldC = new CitationYieldUSYC(address(usdc), address(vault), address(reg), operator);

        // Operator holds USDC and approves the yield contract to pull it on accrue.
        usdc.mint(operator, 1_000e6);
        usdc.approve(address(yieldC), type(uint256).max);
    }

    function test_accrueDepositsIntoVault() public {
        yieldC.accrue(id, 100e6);
        assertEq(yieldC.principal(id), 100e6);
        assertEq(yieldC.currentValue(id), 100e6); // no yield yet
        assertEq(yieldC.pendingYield(id), 0);
        assertEq(vault.totalAssets(), 100e6);
    }

    function test_yieldIsRealAndClaimable() public {
        yieldC.accrue(id, 100e6);

        // Simulate treasury yield: 50 USDC flows into the vault → shares appreciate.
        usdc.approve(address(vault), type(uint256).max);
        vault.simulateYield(50e6);

        // The identity's redeemable value now reflects principal + yield.
        assertEq(yieldC.currentValue(id), 150e6);
        assertEq(yieldC.pendingYield(id), 50e6);

        // Author binds wallet, then claims principal + yield straight to their wallet.
        reg.set(id, alice);
        vm.prank(alice);
        uint256 got = yieldC.claim(id);
        assertEq(got, 150e6);
        assertEq(usdc.balanceOf(alice), 150e6);
        assertEq(yieldC.shares(id), 0);
    }

    function test_claimRevertsIfNotBound() public {
        yieldC.accrue(id, 10e6);
        vm.prank(alice);
        vm.expectRevert(CitationYieldUSYC.NotBound.selector);
        yieldC.claim(id);
    }

    function test_claimRevertsIfNotYours() public {
        yieldC.accrue(id, 10e6);
        reg.set(id, alice);
        vm.prank(address(0xBEEF));
        vm.expectRevert(CitationYieldUSYC.NotYours.selector);
        yieldC.claim(id);
    }

    function test_onlyOperatorAccrues() public {
        vm.prank(alice);
        vm.expectRevert(CitationYieldUSYC.NotOperator.selector);
        yieldC.accrue(id, 1e6);
    }
}
