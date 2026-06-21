// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20B {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title ReputationBond — Kuot (Lepton · Arc)
/// @notice Reputation as capital at risk, not a number you ask to be trusted.
///         An agent (e.g. a broker that routes a citation, or a researcher
///         standing behind an answer) posts a USDC bond DIRECTIONALLY — keyed by
///         (from → to, context) — instead of a single global score. If the
///         outcome resolves against it (a provably-false citation, an
///         under-delivered route), an arbiter slashes the bond to the harmed
///         party; otherwise it is released back. Trust is "a vector from Alice to
///         Bob in a context", which is exactly what a single reputation score
///         cannot express. The natural ERC-8004 application the planning work
///         flags as a near-empty lane.
contract ReputationBond {
    IERC20B public immutable usdc;
    address public immutable arbiter;

    enum State {
        Active,
        Slashed,
        Released
    }

    struct Bond {
        address from; // who staked
        address to; // who/what it vouches for
        bytes32 context; // e.g. keccak256(queryId) or a topic
        uint256 amount;
        State state;
    }

    Bond[] public bonds;

    /// @notice Directional trust vector: from → to → context → live bonded USDC.
    ///         This is the capital-at-risk "score", and it is inherently contextual.
    mapping(address => mapping(address => mapping(bytes32 => uint256))) public bonded;

    event BondPosted(uint256 indexed id, address indexed from, address indexed to, bytes32 context, uint256 amount);
    event BondSlashed(uint256 indexed id, address beneficiary, uint256 amount);
    event BondReleased(uint256 indexed id, uint256 amount);

    error NotArbiter();
    error NotActive();
    error ZeroAmount();
    error TransferFailed();

    constructor(address _usdc, address _arbiter) {
        usdc = IERC20B(_usdc);
        arbiter = _arbiter;
    }

    modifier onlyArbiter() {
        if (msg.sender != arbiter) revert NotArbiter();
        _;
    }

    /// @notice Stake `amount` USDC behind `to` in `context`. Caller must approve first.
    function postBond(address to, bytes32 context, uint256 amount) external returns (uint256 id) {
        if (amount == 0) revert ZeroAmount();
        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        bonds.push(Bond({from: msg.sender, to: to, context: context, amount: amount, state: State.Active}));
        bonded[msg.sender][to][context] += amount;
        id = bonds.length - 1;
        emit BondPosted(id, msg.sender, to, context, amount);
    }

    /// @notice Slash an active bond to `beneficiary` (the harmed party) when the
    ///         outcome resolves against it. Arbiter-only; settles in one tx on Arc.
    function slash(uint256 id, address beneficiary) external onlyArbiter {
        Bond storage b = bonds[id];
        if (b.state != State.Active) revert NotActive();
        b.state = State.Slashed;
        bonded[b.from][b.to][b.context] -= b.amount;
        if (!usdc.transfer(beneficiary, b.amount)) revert TransferFailed();
        emit BondSlashed(id, beneficiary, b.amount);
    }

    /// @notice Release an active bond back to the staker (outcome held up).
    function release(uint256 id) external onlyArbiter {
        Bond storage b = bonds[id];
        if (b.state != State.Active) revert NotActive();
        b.state = State.Released;
        bonded[b.from][b.to][b.context] -= b.amount;
        if (!usdc.transfer(b.from, b.amount)) revert TransferFailed();
        emit BondReleased(id, b.amount);
    }

    /// @notice The directional, contextual trust vector (live capital at risk).
    function trustVector(address from, address to, bytes32 context) external view returns (uint256) {
        return bonded[from][to][context];
    }

    function bondCount() external view returns (uint256) {
        return bonds.length;
    }
}
