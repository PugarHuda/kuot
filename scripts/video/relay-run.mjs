// Map operator key → delegator, force Base mainnet + mainnet relayer, run the real relay.
process.env.DELEGATOR_PRIVATE_KEY = process.env.OPERATOR_PRIVATE_KEY;
process.env.CHAIN_ID = process.env.CHAIN_ID || "8453";
process.env.ONESHOT_RELAYER_URL = "https://relayer.1shotapi.com/relayers";
await import("../relay-mainnet-1shot.mjs");
