/**
 * Seed REAL BountyMarket activity on Arc (chain 5042002): create two funded
 * bounties (operator-sponsored) and settle one to the top real cited authors so
 * the Bounties page shows both states — open + settled — with on-chain USDC.
 *
 *   node scripts/seed-bounty-arc.mjs
 *
 * No mock: USDC is real (gas-native Arc USDC), authors are the real top
 * recipients from the live AuthorPaid leaderboard, settle sums to 10000 bps.
 */
import { readFileSync } from "node:fs";
import {
  createPublicClient, createWalletClient, http, keccak256, toBytes,
  erc20Abi, getAddress, formatUnits, parseUnits, defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const env = {};
for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const RPC = env.ARC_RPC_URL;
const MARKET = getAddress(env.NEXT_PUBLIC_BOUNTY_MARKET);
const USDC = getAddress("0x3600000000000000000000000000000000000000");
const account = privateKeyToAccount(env.OPERATOR_PRIVATE_KEY);

const arc = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: [RPC] } },
});

const BOUNTY_ABI = [
  { type: "function", name: "create", stateMutability: "nonpayable",
    inputs: [{ name: "topicHash", type: "bytes32" }, { name: "amount", type: "uint256" }, { name: "ttlSeconds", type: "uint64" }],
    outputs: [{ type: "uint256" }] },
  { type: "function", name: "bountyCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "settle", stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }, { name: "queryId", type: "bytes32" },
      { name: "authors", type: "address[]" }, { name: "weightsBps", type: "uint16[]" }], outputs: [] },
];

const topicHash = (t) => keccak256(toBytes(t.trim().toLowerCase()));

const pub = createPublicClient({ chain: arc, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: arc, transport: http(RPC) });

async function realAuthors() {
  const res = await fetch("https://kuot-azure.vercel.app/api/activity");
  const { leaderboard = [] } = await res.json();
  return leaderboard
    .map((x) => x.author)
    .filter((a) => /^0x[0-9a-fA-F]{40}$/.test(a))
    .slice(0, 3)
    .map((a) => getAddress(a));
}

async function createBounty(topic, usdc, ttlSeconds) {
  const amount = parseUnits(String(usdc), 6);
  const allowance = await pub.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [account.address, MARKET] });
  if (allowance < amount) {
    const ah = await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: "approve", args: [MARKET, amount * 4n] });
    await pub.waitForTransactionReceipt({ hash: ah });
    console.log(`  approved USDC -> market (${ah})`);
  }
  const idBefore = await pub.readContract({ address: MARKET, abi: BOUNTY_ABI, functionName: "bountyCount" });
  const h = await wallet.writeContract({ address: MARKET, abi: BOUNTY_ABI, functionName: "create", args: [topicHash(topic), amount, BigInt(ttlSeconds)] });
  const rcpt = await pub.waitForTransactionReceipt({ hash: h });
  console.log(`  bounty #${idBefore} "${topic}" funded ${usdc} USDC  tx ${h}  (${rcpt.status})`);
  return idBefore;
}

async function settleBounty(id, authors) {
  // Even weights summing to exactly 10000 bps (last absorbs the remainder).
  const n = authors.length;
  const base = Math.floor(10000 / n);
  const weights = authors.map((_, i) => (i === n - 1 ? 10000 - base * (n - 1) : base));
  const queryId = keccak256(toBytes(`bounty-${id}-settle`));
  const h = await wallet.writeContract({ address: MARKET, abi: BOUNTY_ABI, functionName: "settle", args: [id, queryId, authors, weights] });
  const rcpt = await pub.waitForTransactionReceipt({ hash: h });
  console.log(`  settled #${id} -> ${n} authors ${JSON.stringify(weights)}  tx ${h}  (${rcpt.status})`);
}

console.log(`BountyMarket ${MARKET} on Arc, operator ${account.address}`);
const openId = await createBounty("best carbon capture methods 2026", 0.3, 7 * 24 * 3600);
const settleId = await createBounty("mrna vaccine durability 2026", 0.3, 7 * 24 * 3600);
const authors = await realAuthors();
if (authors.length) await settleBounty(settleId, authors);
else console.log("  no real author wallets found — left bounty open");
console.log(`done: #${openId} open, #${settleId} settled`);
