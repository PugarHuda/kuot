/**
 * Seed a SETTLED bounty so the Bounties page shows both states (open + settled).
 * The operator settles an existing open bounty using its already-deposited USDC
 * (no new funds needed): pays the cited authors by weight (sum 10000).
 *
 *   node scripts/seed-bounty-settle.mjs            # read-only: list bounties + contract USDC
 *   node scripts/seed-bounty-settle.mjs --id 1     # settle bounty #1 to demo authors
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, keccak256, encodePacked, erc20Abi, parseAbiItem, getAddress, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const env = {};
for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const RPC = "https://ethereum-sepolia-rpc.publicnode.com"; // reliable getLogs/reads
const MARKET = env.NEXT_PUBLIC_BOUNTY_MARKET;
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const opKey = env.OPERATOR_PRIVATE_KEY;
if (!MARKET || !opKey) throw new Error("missing NEXT_PUBLIC_BOUNTY_MARKET / OPERATOR_PRIVATE_KEY");

// Two demo author wallets (vanity), 60/40 split.
const AUTHORS = [
  getAddress("0x000000125959e1ef4e240e750eab8eD0F4d8832E"),
  getAddress("0xA10BffFFA5f1d211dBdEBec06047fDE73a6e0aef"),
];
const WEIGHTS = [6000, 4000];

const SETTLE_ABI = [
  { type: "function", name: "settle", stateMutability: "nonpayable", inputs: [
    { name: "id", type: "uint256" }, { name: "queryId", type: "bytes32" },
    { name: "authors", type: "address[]" }, { name: "weightsBps", type: "uint16[]" },
  ], outputs: [] },
  { type: "function", name: "bounties", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [
    { name: "sponsor", type: "address" }, { name: "topicHash", type: "bytes32" }, { name: "amount", type: "uint256" },
    { name: "expiresAt", type: "uint64" }, { name: "settled", type: "bool" }, { name: "refunded", type: "bool" },
  ] },
];

const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });

const marketUsdc = await pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [MARKET] });
console.log(`BountyMarket ${MARKET}\n  holds ${formatUnits(marketUsdc, 6)} USDC`);

// Read bounties 0..5 directly (avoids getLogs block-range limits).
for (let i = 0n; i < 6n; i++) {
  try {
    const b = await pub.readContract({ address: MARKET, abi: SETTLE_ABI, functionName: "bounties", args: [i] });
    if (b[0] === "0x0000000000000000000000000000000000000000") continue;
    console.log(`  #${i}  ${formatUnits(b[2], 6)} USDC  settled=${b[4]} refunded=${b[5]}`);
  } catch {
    break;
  }
}

const idArg = process.argv.indexOf("--id");
if (idArg === -1) {
  console.log("\n(read-only) re-run with --id <n> to settle that bounty to demo authors.");
  process.exit(0);
}
const id = BigInt(process.argv[idArg + 1]);

const account = privateKeyToAccount(opKey.startsWith("0x") ? opKey : `0x${opKey}`);
const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) });
const b = await pub.readContract({ address: MARKET, abi: SETTLE_ABI, functionName: "bounties", args: [id] });
if (b[4]) { console.log(`Bounty #${id} already settled.`); process.exit(0); }
if (marketUsdc < b[2]) { console.log(`Market only holds ${formatUnits(marketUsdc,6)} USDC < bounty ${formatUnits(b[2],6)} — cannot settle.`); process.exit(1); }

const queryId = keccak256(encodePacked(["string"], [`bounty-${id}-settlement`]));
console.log(`\nSettling #${id} (${formatUnits(b[2],6)} USDC) → ${AUTHORS[0]} 60% / ${AUTHORS[1]} 40%`);
const tx = await wallet.writeContract({ address: MARKET, abi: SETTLE_ABI, functionName: "settle", args: [id, queryId, AUTHORS, WEIGHTS] });
console.log(`tx ${tx}`);
await pub.waitForTransactionReceipt({ hash: tx });
console.log("settled ✓");
