/**
 * Bridge Ethereum-Sepolia ETH → Base-Sepolia ETH (to fund CCTP mint gas).
 * Uses the canonical Base Sepolia L1StandardBridge (OP Stack). depositETH bridges
 * msg.value to the SAME address on L2. Arrives on Base Sepolia in ~1-3 min.
 *
 *   node scripts/bridge-to-base.mjs [amountETH=0.03]
 */
import { createPublicClient, createWalletClient, http, defineChain, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";

const env = {};
for (const l of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const RPC = process.env.SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";
const amount = parseEther(String(process.argv[2] ?? "0.03"));
const sep = defineChain({ id: 11155111, name: "Sepolia", nativeCurrency: { decimals: 18, name: "ETH", symbol: "ETH" }, rpcUrls: { default: { http: [RPC] } } });
const op = privateKeyToAccount(env.OPERATOR_PRIVATE_KEY);
const pub = createPublicClient({ chain: sep, transport: http(RPC) });
const wallet = createWalletClient({ account: op, chain: sep, transport: http(RPC) });

// Base Sepolia L1StandardBridge (deployed on Ethereum Sepolia).
const BRIDGE = "0xfd0Bf71F60660E2f608ed56e1659C450eB113120";
const ABI = [{ type: "function", name: "depositETH", stateMutability: "payable", inputs: [{ name: "_minGasLimit", type: "uint32" }, { name: "_extraData", type: "bytes" }], outputs: [] }];

const code = await pub.getCode({ address: BRIDGE });
if (!code || code.length <= 2) throw new Error("L1StandardBridge has no code at " + BRIDGE);
const bal = await pub.getBalance({ address: op.address });
console.log(`operator ${op.address}\nSepolia balance ${formatEther(bal)} ETH → bridging ${formatEther(amount)} to Base Sepolia`);
if (bal < amount) throw new Error("insufficient Sepolia ETH");

const hash = await wallet.writeContract({ address: BRIDGE, abi: ABI, functionName: "depositETH", args: [200000, "0x"], value: amount });
console.log(`L1 deposit tx: ${hash}\n  explorer: https://sepolia.etherscan.io/tx/${hash}`);
const rcpt = await pub.waitForTransactionReceipt({ hash });
console.log(`✅ deposited on L1 (status ${rcpt.status}). ETH lands on Base Sepolia (same address) in ~1-3 min.`);
