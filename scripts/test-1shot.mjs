/**
 * End-to-end test of the 1Shot relayer send path with a LOCAL signer.
 * Proves relayer_send7710Transaction works (gasless) without needing a browser.
 *
 * Run: DELEGATOR_PRIVATE_KEY=0x... node scripts/test-1shot.mjs
 * Requires the delegator to hold USDC on Sepolia (fee + work are USDC transfers).
 */
import { randomBytes } from "node:crypto";
import {
  Implementation,
  ScopeType,
  createDelegation,
  toMetaMaskSmartAccount,
} from "@metamask/smart-accounts-kit";
import { createPublicClient, encodeFunctionData, erc20Abi, getAddress, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia as chain } from "viem/chains";
import { bytesToHex } from "viem/utils";

const RELAYER = "https://relayer.1shotapi.dev/relayers"; // testnet
let _id = 0;
async function rpc(method, params) {
  const res = await fetch(RELAYER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++_id, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.code} ${json.error.message}`);
  return json.result;
}
function toRelayerJson(v) {
  if (typeof v === "bigint") return `0x${v.toString(16)}`;
  if (v instanceof Uint8Array) return `0x${Buffer.from(v).toString("hex")}`;
  if (Array.isArray(v)) return v.map(toRelayerJson);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, val] of Object.entries(v)) o[k] = toRelayerJson(val);
    return o;
  }
  return v;
}

const pk = process.env.DELEGATOR_PRIVATE_KEY;
if (!pk) throw new Error("set DELEGATOR_PRIVATE_KEY");
const delegator = privateKeyToAccount(pk);
const publicClient = createPublicClient({ chain, transport: http("https://ethereum-sepolia-rpc.publicnode.com") });

console.log("delegator:", delegator.address, "chain:", chain.id);

const caps = (await rpc("relayer_getCapabilities", [String(chain.id)]))[String(chain.id)];
console.log("targetAddress:", caps.targetAddress, "feeCollector:", caps.feeCollector);
const usdc = caps.tokens.find((t) => t.symbol === "USDC");
const decimals = Number(usdc.decimals);

const fee = await rpc("relayer_getFeeData", { chainId: String(chain.id), token: usdc.address });
const nativeCost = 200_000n * BigInt(fee.gasPrice);
const convertedAtoms = BigInt(Math.ceil((Number(nativeCost) / 1e18) * fee.rate * 10 ** decimals));
const minFeeAtoms = parseUnits(fee.minFee, decimals);
const feeAmount = convertedAtoms > minFeeAtoms ? convertedAtoms : minFeeAtoms;
const workAmount = 10_000n; // 0.01 USDC to a destination
const destination = "0x000000000000000000000000000000000000dEaD";
console.log("feeAmount:", feeAmount.toString(), "workAmount:", workAmount.toString());

const smartAccount = await toMetaMaskSmartAccount({
  client: publicClient,
  implementation: Implementation.Stateless7702,
  address: delegator.address,
  signer: { account: delegator },
});

// EIP-7702 authorization (first use): upgrade EOA -> stateless delegator.
const env = smartAccount.environment;
const impl = env.implementations.EIP7702StatelessDeleGatorImpl;
const nonce = await publicClient.getTransactionCount({ address: delegator.address, blockTag: "pending" });
const auth = await delegator.signAuthorization({ chainId: chain.id, contractAddress: getAddress(impl), nonce });
const authorizationList = [
  { address: auth.address, chainId: auth.chainId, nonce: auth.nonce, r: auth.r, s: auth.s, yParity: auth.yParity ?? 0 },
];

const delegation = createDelegation({
  to: caps.targetAddress,
  from: smartAccount.address,
  environment: smartAccount.environment,
  salt: bytesToHex(Uint8Array.from(randomBytes(32))),
  scope: { type: ScopeType.Erc20TransferAmount, tokenAddress: usdc.address, maxAmount: feeAmount + workAmount },
});
const signature = await smartAccount.signDelegation({ delegation });
const signedDelegation = { ...delegation, signature };

const feeCalldata = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [caps.feeCollector, feeAmount] });
const workCalldata = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [destination, workAmount] });

const taskId = await rpc("relayer_send7710Transaction", {
  chainId: String(chain.id),
  context: fee.context,
  authorizationList,
  transactions: [
    {
      permissionContext: [toRelayerJson(signedDelegation)],
      executions: [
        { target: usdc.address, value: "0", data: feeCalldata },
        { target: usdc.address, value: "0", data: workCalldata },
      ],
    },
  ],
});
console.log("✅ relayer_send7710Transaction OK — TaskId:", taskId);

// poll status
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const s = await rpc("relayer_getStatus", [typeof taskId === "string" ? taskId : taskId.TaskId ?? taskId]);
  console.log("status:", JSON.stringify(s));
  if (["Confirmed", "Rejected", "Reverted"].includes(s.status)) break;
}
