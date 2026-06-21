// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {GroundingRegistry} from "../src/GroundingRegistry.sol";
import {ReputationBond} from "../src/ReputationBond.sol";
import {MockUSYC} from "../src/MockUSYC.sol";
import {CitationYieldUSYC} from "../src/CitationYieldUSYC.sol";

/// Deploy the Kuot (Lepton · Arc) differentiator contracts:
///   GroundingRegistry · ReputationBond · MockUSYC + CitationYieldUSYC.
///
///   forge script script/DeployKuot.s.sol --rpc-url $ARC_RPC_URL --broadcast
///
/// env: USDC_ADDRESS (Arc erc20 USDC), NAME_REGISTRY (deployed NameRegistry), PRIVATE_KEY.
/// On Arc mainnet, set USYC_VAULT to the real USYC vault and skip MockUSYC.
contract DeployKuot is Script {
    function run()
        external
        returns (GroundingRegistry grounding, ReputationBond bond, MockUSYC vault, CitationYieldUSYC yieldC)
    {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address registry = vm.envAddress("NAME_REGISTRY");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address operator = vm.addr(pk);

        // Use a real USYC vault on mainnet if provided, else deploy the testnet mock.
        address usycVault = vm.envOr("USYC_VAULT", address(0));

        vm.startBroadcast(pk);
        grounding = new GroundingRegistry(operator);
        bond = new ReputationBond(usdc, operator);
        if (usycVault == address(0)) {
            vault = new MockUSYC(usdc);
            usycVault = address(vault);
        }
        yieldC = new CitationYieldUSYC(usdc, usycVault, registry, operator);
        vm.stopBroadcast();

        console.log("GroundingRegistry:", address(grounding));
        console.log("ReputationBond:", address(bond));
        console.log("USYC vault:", usycVault);
        console.log("CitationYieldUSYC:", address(yieldC));
        console.log("operator:", operator);
    }
}
