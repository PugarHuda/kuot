// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {UnclaimedEscrow} from "../src/UnclaimedEscrow.sol";
import {AgentRegistry8004} from "../src/AgentRegistry8004.sol";

/// Deploy UnclaimedEscrow (against the existing NameRegistry) + AgentRegistry8004.
/// env: USDC_ADDRESS, NAME_REGISTRY, PRIVATE_KEY
contract DeployEscrow is Script {
    function run() external returns (UnclaimedEscrow escrow, AgentRegistry8004 agents) {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address registry = vm.envAddress("NAME_REGISTRY");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        escrow = new UnclaimedEscrow(usdc, registry, vm.addr(pk));
        agents = new AgentRegistry8004();
        vm.stopBroadcast();
        console.log("UnclaimedEscrow:", address(escrow));
        console.log("AgentRegistry8004:", address(agents));
    }
}
