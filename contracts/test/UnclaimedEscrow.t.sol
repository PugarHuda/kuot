// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {UnclaimedEscrow} from "../src/UnclaimedEscrow.sol";

contract MockUSDC2 {
    mapping(address => uint256) public balanceOf;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }
}

contract MockRegistry {
    mapping(bytes32 => address) public walletOf;
    function set(bytes32 h, address w) external { walletOf[h] = w; }
}

contract UnclaimedEscrowTest is Test {
    UnclaimedEscrow escrow;
    MockUSDC2 usdc;
    MockRegistry reg;
    address operator;
    address alice = address(0xA11CE);
    bytes32 hash = keccak256("0000-0002-1825-0097");

    function setUp() public {
        operator = address(this);
        usdc = new MockUSDC2();
        reg = new MockRegistry();
        escrow = new UnclaimedEscrow(address(usdc), address(reg), operator);
        usdc.mint(address(escrow), 100e6); // fund the escrow
    }

    function test_recordAndWithdraw() public {
        escrow.record(hash, 30e6);
        assertEq(escrow.owed(hash), 30e6);
        assertEq(escrow.totalOwed(), 30e6);

        reg.set(hash, alice); // alice claims her ORCID
        vm.prank(alice);
        escrow.withdraw(hash);
        assertEq(usdc.balanceOf(alice), 30e6);
        assertEq(escrow.owed(hash), 0);
    }

    function test_withdrawRevertsIfUnbound() public {
        escrow.record(hash, 10e6);
        vm.prank(alice);
        vm.expectRevert(UnclaimedEscrow.NotBound.selector);
        escrow.withdraw(hash);
    }

    function test_withdrawRevertsIfNotYours() public {
        escrow.record(hash, 10e6);
        reg.set(hash, alice);
        vm.prank(address(0xBEEF));
        vm.expectRevert(UnclaimedEscrow.NotYours.selector);
        escrow.withdraw(hash);
    }

    function test_onlyOperatorRecords() public {
        vm.prank(alice);
        vm.expectRevert(UnclaimedEscrow.NotOperator.selector);
        escrow.record(hash, 1e6);
    }
}
