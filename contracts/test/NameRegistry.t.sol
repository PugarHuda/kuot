// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {NameRegistry} from "../src/NameRegistry.sol";

contract NameRegistryTest is Test {
    NameRegistry reg;
    address operator;
    address alice = address(0xA11CE);
    bytes32 authorHash = keccak256("https://openalex.org/A123");
    bytes sig = hex"deadbeef";

    function setUp() public {
        operator = address(this);
        reg = new NameRegistry(operator);
    }

    function test_bindAndResolve() public {
        reg.bind(authorHash, alice, sig);
        assertEq(reg.walletOf(authorHash), alice);
        assertEq(reg.bindingCount(), 1);
    }

    function test_unclaimedIsZero() public view {
        assertEq(reg.walletOf(keccak256("unknown")), address(0));
    }

    function test_revertDoubleBind() public {
        reg.bind(authorHash, alice, sig);
        vm.expectRevert(NameRegistry.AlreadyBound.selector);
        reg.bind(authorHash, alice, sig);
    }

    function test_revertZeroWallet() public {
        vm.expectRevert(NameRegistry.ZeroWallet.selector);
        reg.bind(authorHash, address(0), sig);
    }

    function test_revertNotOperator() public {
        vm.prank(alice);
        vm.expectRevert(NameRegistry.NotOperator.selector);
        reg.bind(authorHash, alice, sig);
    }

    function test_rebind() public {
        reg.bind(authorHash, alice, sig);
        address bob = address(0xB0B);
        reg.rebind(authorHash, bob, sig);
        assertEq(reg.walletOf(authorHash), bob);
    }
}
