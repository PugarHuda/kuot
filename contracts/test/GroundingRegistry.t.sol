// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {GroundingRegistry} from "../src/GroundingRegistry.sol";

contract GroundingRegistryTest is Test {
    GroundingRegistry reg;
    address operator;
    address alice = address(0xA11CE);

    bytes32 queryId = keccak256("what are the top carbon capture methods?");
    bytes32 digest = keccak256("the synthesized answer text");
    bytes32 authorA = keccak256("0000-0002-1825-0097");
    bytes32 authorB = keccak256("0000-0001-2345-6789");
    bytes32 authorGhost = keccak256("0000-0009-9999-9999"); // cited but not grounding

    function setUp() public {
        operator = address(this);
        reg = new GroundingRegistry(operator);
    }

    function test_commitAndQuery() public {
        bytes32[] memory grounded = new bytes32[](2);
        grounded[0] = authorA;
        grounded[1] = authorB;
        reg.commit(queryId, digest, grounded);

        (bytes32 d,, uint32 count) = reg.proofs(queryId);
        assertEq(d, digest);
        assertEq(count, 2);
        assertTrue(reg.isGrounded(queryId, authorA));
        assertTrue(reg.isGrounded(queryId, authorB));
        assertFalse(reg.isGrounded(queryId, authorGhost)); // not grounded → not paid
        assertTrue(reg.verify(queryId, digest));
        assertFalse(reg.verify(queryId, keccak256("tampered")));
    }

    function test_revertDoubleCommit() public {
        bytes32[] memory g = new bytes32[](1);
        g[0] = authorA;
        reg.commit(queryId, digest, g);
        vm.expectRevert(GroundingRegistry.AlreadyCommitted.selector);
        reg.commit(queryId, digest, g);
    }

    function test_revertNotOperator() public {
        bytes32[] memory g = new bytes32[](1);
        g[0] = authorA;
        vm.prank(alice);
        vm.expectRevert(GroundingRegistry.NotOperator.selector);
        reg.commit(queryId, digest, g);
    }

    function test_verifyRevertsIfNotCommitted() public {
        vm.expectRevert(GroundingRegistry.NotCommitted.selector);
        reg.verify(queryId, digest);
    }
}
