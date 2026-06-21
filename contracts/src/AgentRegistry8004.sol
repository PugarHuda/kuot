// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title AgentRegistry8004 — kuot
/// @notice Minimal on-chain identity registry for the agent mesh, aligned with
///         the ERC-8004 Trustless Agents draft. Each agent publishes a card
///         (name, capabilities, trust method + proof) and accrues reputation as
///         it completes tasks. Verifiable agent identity is what the "Best Agent"
///         track rewards: the Researcher/Reader/Fact-checker/Summarizer are real
///         on-chain principals, not anonymous scripts.
contract AgentRegistry8004 {
    struct AgentCard {
        address agent; // principal
        address owner; // controller (can update + bump reputation)
        string name;
        string capabilities; // free-form / JSON skill list
        string trustMethod; // "redelegation" | "orcid" | "none"
        bytes32 trustProof; // opaque proof hash
        uint64 reputation; // completed-task counter
        uint64 registeredAt;
    }

    mapping(address => AgentCard) private cards;
    address[] public agents;

    event AgentRegistered(address indexed agent, address indexed owner, string name);
    event ReputationBumped(address indexed agent, uint64 reputation);
    event CapabilitiesUpdated(address indexed agent, string capabilities);

    error AlreadyRegistered();
    error NotFound();
    error NotOwner();

    function register(
        address agent,
        string calldata name,
        string calldata capabilities,
        string calldata trustMethod,
        bytes32 trustProof
    ) external {
        if (cards[agent].owner != address(0)) revert AlreadyRegistered();
        cards[agent] = AgentCard({
            agent: agent,
            owner: msg.sender,
            name: name,
            capabilities: capabilities,
            trustMethod: trustMethod,
            trustProof: trustProof,
            reputation: 0,
            registeredAt: uint64(block.timestamp)
        });
        agents.push(agent);
        emit AgentRegistered(agent, msg.sender, name);
    }

    function bumpReputation(address agent) external {
        AgentCard storage c = cards[agent];
        if (c.owner == address(0)) revert NotFound();
        if (c.owner != msg.sender) revert NotOwner();
        unchecked {
            c.reputation += 1;
        }
        emit ReputationBumped(agent, c.reputation);
    }

    function updateCapabilities(address agent, string calldata capabilities) external {
        AgentCard storage c = cards[agent];
        if (c.owner == address(0)) revert NotFound();
        if (c.owner != msg.sender) revert NotOwner();
        c.capabilities = capabilities;
        emit CapabilitiesUpdated(agent, capabilities);
    }

    function getAgent(address agent) external view returns (AgentCard memory) {
        AgentCard memory c = cards[agent];
        if (c.owner == address(0)) revert NotFound();
        return c;
    }

    function agentCount() external view returns (uint256) {
        return agents.length;
    }
}
