// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry8004} from "../src/AgentRegistry8004.sol";

contract AgentRegistry8004Test is Test {
    AgentRegistry8004 reg;
    address researcher = address(0xA1);
    address reader = address(0xA2);

    function setUp() public {
        reg = new AgentRegistry8004();
    }

    function test_registerAndRead() public {
        reg.register(researcher, "Researcher", "search,redelegate", "redelegation", keccak256("p"));
        AgentRegistry8004.AgentCard memory c = reg.getAgent(researcher);
        assertEq(c.name, "Researcher");
        assertEq(c.owner, address(this));
        assertEq(c.reputation, 0);
        assertEq(reg.agentCount(), 1);
    }

    function test_bumpReputation() public {
        reg.register(researcher, "Researcher", "x", "redelegation", bytes32(0));
        reg.bumpReputation(researcher);
        reg.bumpReputation(researcher);
        assertEq(reg.getAgent(researcher).reputation, 2);
    }

    function test_revertDoubleRegister() public {
        reg.register(researcher, "R", "x", "none", bytes32(0));
        vm.expectRevert(AgentRegistry8004.AlreadyRegistered.selector);
        reg.register(researcher, "R", "x", "none", bytes32(0));
    }

    function test_revertBumpNotOwner() public {
        reg.register(researcher, "R", "x", "none", bytes32(0));
        vm.prank(reader);
        vm.expectRevert(AgentRegistry8004.NotOwner.selector);
        reg.bumpReputation(researcher);
    }

    function test_revertGetUnknown() public {
        vm.expectRevert(AgentRegistry8004.NotFound.selector);
        reg.getAgent(reader);
    }
}
