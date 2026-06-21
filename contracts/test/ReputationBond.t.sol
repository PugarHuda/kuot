// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ReputationBond} from "../src/ReputationBond.sol";

contract MockUSDCB {
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

    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        uint256 al = allowance[f][msg.sender];
        if (al != type(uint256).max) allowance[f][msg.sender] = al - a;
        balanceOf[f] -= a;
        balanceOf[to] += a;
        return true;
    }
}

contract ReputationBondTest is Test {
    MockUSDCB usdc;
    ReputationBond bond;
    address arbiter;
    address broker = address(0xB0B);
    address provider = address(0xC0FFEE);
    address harmed = address(0xDEAD);
    bytes32 ctx = keccak256("queryId-123");

    function setUp() public {
        arbiter = address(this);
        usdc = new MockUSDCB();
        bond = new ReputationBond(address(usdc), arbiter);
        usdc.mint(broker, 100e6);
        vm.prank(broker);
        usdc.approve(address(bond), type(uint256).max);
    }

    function test_postBondBuildsDirectionalVector() public {
        vm.prank(broker);
        uint256 id = bond.postBond(provider, ctx, 10e6);
        assertEq(id, 0);
        assertEq(bond.trustVector(broker, provider, ctx), 10e6);
        assertEq(usdc.balanceOf(address(bond)), 10e6);
    }

    function test_slashPaysHarmedParty() public {
        vm.prank(broker);
        uint256 id = bond.postBond(provider, ctx, 10e6);

        // Outcome resolves against the route → arbiter slashes to the harmed party.
        bond.slash(id, harmed);
        assertEq(usdc.balanceOf(harmed), 10e6);
        assertEq(bond.trustVector(broker, provider, ctx), 0); // capital at risk gone
    }

    function test_releaseReturnsToStaker() public {
        vm.prank(broker);
        uint256 id = bond.postBond(provider, ctx, 10e6);
        bond.release(id);
        assertEq(usdc.balanceOf(broker), 100e6); // got it back
        assertEq(bond.trustVector(broker, provider, ctx), 0);
    }

    function test_revertSlashTwice() public {
        vm.prank(broker);
        uint256 id = bond.postBond(provider, ctx, 10e6);
        bond.slash(id, harmed);
        vm.expectRevert(ReputationBond.NotActive.selector);
        bond.slash(id, harmed);
    }

    function test_revertSlashNotArbiter() public {
        vm.prank(broker);
        uint256 id = bond.postBond(provider, ctx, 10e6);
        vm.prank(broker);
        vm.expectRevert(ReputationBond.NotArbiter.selector);
        bond.slash(id, harmed);
    }
}
