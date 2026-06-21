// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {BountyMarket} from "../src/BountyMarket.sol";

contract MockUSDC3 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) { balanceOf[msg.sender] -= a; balanceOf[to] += a; return true; }
    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[t] += a; return true;
    }
}

contract BountyMarketTest is Test {
    BountyMarket market;
    MockUSDC3 usdc;
    address operator;
    address sponsor = address(0x5);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    bytes32 topic = keccak256("carbon capture");

    function setUp() public {
        operator = address(this);
        usdc = new MockUSDC3();
        market = new BountyMarket(address(usdc), operator);
        usdc.mint(sponsor, 100e6);
        vm.prank(sponsor);
        usdc.approve(address(market), type(uint256).max);
    }

    function _create() internal returns (uint256) {
        vm.prank(sponsor);
        return market.create(topic, 50e6, 1 days);
    }

    function test_createAndSettle() public {
        uint256 id = _create();
        address[] memory a = new address[](2);
        a[0] = alice; a[1] = bob;
        uint16[] memory w = new uint16[](2);
        w[0] = 7000; w[1] = 3000;
        market.settle(id, keccak256("q"), a, w);
        assertEq(usdc.balanceOf(alice), 35e6);
        assertEq(usdc.balanceOf(bob), 15e6);
        (, , , , bool settled,) = market.bounties(id);
        assertTrue(settled);
    }

    function test_revertBadWeights() public {
        uint256 id = _create();
        address[] memory a = new address[](1);
        a[0] = alice;
        uint16[] memory w = new uint16[](1);
        w[0] = 9999;
        vm.expectRevert(abi.encodeWithSelector(BountyMarket.BadWeights.selector, 9999));
        market.settle(id, keccak256("q"), a, w);
    }

    function test_revertSettleNotOperator() public {
        uint256 id = _create();
        address[] memory a = new address[](1);
        a[0] = alice;
        uint16[] memory w = new uint16[](1);
        w[0] = 10000;
        vm.prank(sponsor);
        vm.expectRevert(BountyMarket.NotOperator.selector);
        market.settle(id, keccak256("q"), a, w);
    }

    function test_refundAfterExpiry() public {
        uint256 id = _create();
        vm.warp(block.timestamp + 2 days);
        vm.prank(sponsor);
        market.refund(id);
        assertEq(usdc.balanceOf(sponsor), 100e6);
    }

    function test_revertRefundBeforeExpiry() public {
        uint256 id = _create();
        vm.prank(sponsor);
        vm.expectRevert(BountyMarket.NotExpired.selector);
        market.refund(id);
    }
}
