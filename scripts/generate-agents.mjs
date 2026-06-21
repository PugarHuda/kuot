/**
 * Generate REAL key-controlled wallets for the 4 specialist agents and register
 * them in AgentRegistry8004 (replacing the earlier vanity 0x1111… placeholders).
 * Seeds reputation so the mesh reads sensibly, and appends the keys to .env.
 *
 * Run: node scripts/generate-agents.mjs   (needs OPERATOR_PRIVATE_KEY + NEXT_PUBLIC_AGENT_REGISTRY)
 */
import { appendFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, getAddress } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { sepolia } from "viem/chains";

const RPC = process.env.NEXT_PUBLIC_SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";
const REG = getAddress(process.env.NEXT_PUBLIC_AGENT_REGISTRY);
const opKey = process.env.OPERATOR_PRIVATE_KEY;
if (!opKey) throw new Error("set OPERATOR_PRIVATE_KEY");

const account = privateKeyToAccount(opKey);
const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) });

const ABI = [
  { type: "function", name: "register", stateMutability: "nonpayable", inputs: [{ name: "agent", type: "address" }, { name: "name", type: "string" }, { name: "capabilities", type: "string" }, { name: "trustMethod", type: "string" }, { name: "trustProof", type: "bytes32" }], outputs: [] },
  { type: "function", name: "bumpReputation", stateMutability: "nonpayable", inputs: [{ name: "agent", type: "address" }], outputs: [] },
  { type: "function", name: "getAgent", stateMutability: "view", inputs: [{ name: "agent", type: "address" }], outputs: [{ type: "tuple", components: [{ name: "agent", type: "address" }, { name: "owner", type: "address" }, { name: "name", type: "string" }, { name: "capabilities", type: "string" }, { name: "trustMethod", type: "string" }, { name: "trustProof", type: "bytes32" }, { name: "reputation", type: "uint64" }, { name: "registeredAt", type: "uint64" }] }] },
];

const AGENTS = [
  { id: "planner", name: "Planner agent", caps: "decompose-question,task-planning", rep: 1, env: "NEXT_PUBLIC_AGENT_PLANNER" },
  { id: "reader", name: "Reader agent", caps: "read,answer-subquestion,venice-chat,venice-search", rep: 3, env: "NEXT_PUBLIC_AGENT_READER" },
  { id: "factchecker", name: "Fact-checker agent", caps: "verify,venice-search", rep: 2, env: "NEXT_PUBLIC_AGENT_FACTCHECKER" },
  { id: "summarizer", name: "Summarizer agent", caps: "summarize,venice-chat", rep: 2, env: "NEXT_PUBLIC_AGENT_SUMMARIZER" },
];

async function send(fn, args) {
  const tx = await wallet.writeContract({ address: REG, abi: ABI, functionName: fn, args });
  await pub.waitForTransactionReceipt({ hash: tx });
  return tx;
}

async function main() {
  console.log("operator/owner:", account.address, "| registry:", REG, "\n");
  const lines = ["", "# Real agent wallets (generated " + "by generate-agents.mjs) — key-controlled, registered on-chain"];
  const summary = {};
  for (const a of AGENTS) {
    const pk = generatePrivateKey();
    const addr = privateKeyToAccount(pk).address;
    summary[a.id] = addr;
    lines.push(`${a.env}=${addr}`);
    lines.push(`${a.env}_KEY=${pk}`);
    console.log(`registering ${a.name} → ${addr}`);
    await send("register", [addr, a.name, a.caps, "redelegation", "0x0000000000000000000000000000000000000000000000000000000000000000"]);
    for (let i = 0; i < a.rep; i++) await send("bumpReputation", [addr]);
    const card = await pub.readContract({ address: REG, abi: ABI, functionName: "getAgent", args: [addr] });
    console.log(`  ✓ registered, reputation ${card.reputation}`);
  }
  appendFileSync(".env", lines.join("\n") + "\n");
  console.log("\nKeys appended to .env (gitignored). Update src maps with these addresses:");
  console.log(JSON.stringify(summary, null, 2));
}
main().catch((e) => console.log("err", e.message?.slice(0, 200)));
