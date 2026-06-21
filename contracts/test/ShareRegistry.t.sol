// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ShareRegistry} from "../src/ShareRegistry.sol";

contract ShareRegistryTest is Test {
    ShareRegistry reg;
    address operator = address(0xA11CE);
    bytes8 id = bytes8(0x1122334455667788);

    function setUp() public {
        vm.prank(operator);
        reg = new ShareRegistry(operator);
    }

    function test_publishAndRead() public {
        vm.prank(operator);
        reg.publish(id, "{\"q\":\"carbon capture\"}");
        assertEq(reg.content(id), "{\"q\":\"carbon capture\"}");
        assertTrue(reg.exists(id));
    }

    function test_overwrite() public {
        vm.startPrank(operator);
        reg.publish(id, "first");
        reg.publish(id, "second");
        vm.stopPrank();
        assertEq(reg.content(id), "second");
    }

    function test_revertNonOperator() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(ShareRegistry.NotOperator.selector);
        reg.publish(id, "x");
    }

    function test_unknownIdIsEmpty() public view {
        assertEq(reg.content(bytes8(0xdeaddeaddeaddead)), "");
        assertFalse(reg.exists(bytes8(0xdeaddeaddeaddead)));
    }
}
