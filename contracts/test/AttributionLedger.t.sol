// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AttributionLedger} from "../src/AttributionLedger.sol";

/// Minimal ERC-20 with 6 decimals (USDC-like) for tests.
contract MockUSDC {
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

contract AttributionLedgerTest is Test {
    AttributionLedger ledger;
    MockUSDC usdc;
    address agent = address(0xA9E27);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        usdc = new MockUSDC();
        ledger = new AttributionLedger(address(usdc));
        usdc.mint(agent, 1_000e6);
        vm.prank(agent);
        usdc.approve(address(ledger), type(uint256).max);
    }

    function _cites(uint16 wA, uint16 wB) internal view returns (AttributionLedger.Citation[] memory c) {
        c = new AttributionLedger.Citation[](2);
        c[0] = AttributionLedger.Citation(alice, wA);
        c[1] = AttributionLedger.Citation(bob, wB);
    }

    function test_splitsByWeight() public {
        vm.prank(agent);
        ledger.attestAndSplit(keccak256("q1"), 100e6, _cites(7000, 3000));
        assertEq(usdc.balanceOf(alice), 70e6);
        assertEq(usdc.balanceOf(bob), 30e6);
        assertEq(ledger.authorEarnings(alice), 70e6);
        assertTrue(ledger.attested(keccak256("q1")));
    }

    function test_dustGoesToLastAuthor() public {
        // 100 wei / 3333:6667 → rounding; full amount must still be distributed.
        vm.prank(agent);
        ledger.attestAndSplit(keccak256("q2"), 100, _cites(3333, 6667));
        assertEq(usdc.balanceOf(alice) + usdc.balanceOf(bob), 100);
    }

    function test_revertsOnBadWeightSum() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AttributionLedger.BadWeightSum.selector, 9999));
        ledger.attestAndSplit(keccak256("q3"), 100e6, _cites(7000, 2999));
    }

    function test_revertsOnDoubleAttest() public {
        vm.startPrank(agent);
        ledger.attestAndSplit(keccak256("q4"), 10e6, _cites(5000, 5000));
        vm.expectRevert(AttributionLedger.AlreadyAttested.selector);
        ledger.attestAndSplit(keccak256("q4"), 10e6, _cites(5000, 5000));
        vm.stopPrank();
    }

    function test_revertsOnZeroAuthor() public {
        AttributionLedger.Citation[] memory c = new AttributionLedger.Citation[](1);
        c[0] = AttributionLedger.Citation(address(0), 10000);
        vm.prank(agent);
        vm.expectRevert(AttributionLedger.ZeroAuthor.selector);
        ledger.attestAndSplit(keccak256("q5"), 10e6, c);
    }

    function test_attestRecordsWithoutMovingFunds() public {
        uint256 before = usdc.balanceOf(agent);
        vm.prank(agent);
        ledger.attest(keccak256("qa1"), 100e6, _cites(7000, 3000));
        assertEq(usdc.balanceOf(agent), before, "no funds moved");
        assertEq(ledger.authorEarnings(alice), 70e6);
        assertTrue(ledger.attested(keccak256("qa1")));
    }

    function test_attestRevertsOnBadWeight() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AttributionLedger.BadWeightSum.selector, 9999));
        ledger.attest(keccak256("qa2"), 100e6, _cites(7000, 2999));
    }

    /// Fund conservation: authors always receive exactly `amount` in total.
    function testFuzz_fundConservation(uint256 amount, uint16 wA) public {
        amount = bound(amount, 1, 1_000e6);
        wA = uint16(bound(wA, 1, 9999));
        uint16 wB = uint16(10_000 - wA);
        vm.prank(agent);
        ledger.attestAndSplit(keccak256(abi.encode(amount, wA)), amount, _cites(wA, wB));
        assertEq(usdc.balanceOf(alice) + usdc.balanceOf(bob), amount);
    }
}
