/**
 * Agent reputation feedback loop — Kuot (ERC-8004)
 *
 * After a research run is settled, the agents that actually contributed earn
 * on-chain reputation in AgentRegistry8004. Reputation is *earned*, not given:
 * the orchestrator scores each agent (did its work survive the fact-check?) and
 * only the contributors get bumped. Over time, reputation can inform how much
 * budget an agent is trusted with — a real feedback loop, not a static badge.
 *
 * The operator owns the agent cards (it registered them), so only the operator
 * can bump — exactly the ERC-8004 trust model. Best-effort + sequential to keep
 * the operator nonce clean; a failed bump never blocks settlement.
 */
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PERMISSION_CHAIN } from "./chains";

const REGISTRY = process.env.NEXT_PUBLIC_AGENT_REGISTRY as Address | undefined;

/** On-chain principals for the mesh (same set the /api/agents reader uses). */
export const AGENT_ADDRESSES: Record<string, Address> = {
  researcher: "0x55f43e2DF8A86c1D8852A53D00A8D09bC6bA6369",
  planner: "0x45a945cdE6376995F1E5Ce94649B8258eb3f07E3",
  reader: "0x9a838E7ac55BAbFc9f610D87f182294b5166958F",
  factchecker: "0x817D520025F5cfe811977E3b88DA1Cad324d10a4",
  summarizer: "0x4896022A94eF9b8d7bA4f66EBD63e7Bb5AcEdDAa",
};

const BUMP_ABI = [
  {
    type: "function",
    name: "bumpReputation",
    stateMutability: "nonpayable",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [],
  },
] as const;

const rpcUrl = () => process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc.network";

/**
 * Bump on-chain reputation for the given agent ids (deduped). Returns a result
 * per agent. Sequential so the operator's nonce stays ordered. Best-effort:
 * individual failures are reported, not thrown.
 */
export async function bumpReputations(
  agentIds: string[],
): Promise<{ agent: string; txHash?: string; error?: string }[]> {
  if (!REGISTRY) return agentIds.map((agent) => ({ agent, error: "AGENT_REGISTRY not configured" }));
  const opKey = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;
  if (!opKey) return agentIds.map((agent) => ({ agent, error: "OPERATOR_PRIVATE_KEY not configured" }));

  const account = privateKeyToAccount(opKey);
  const wallet = createWalletClient({ account, chain: PERMISSION_CHAIN, transport: http(rpcUrl()) });
  const pub = createPublicClient({ chain: PERMISSION_CHAIN, transport: http(rpcUrl()) });

  const unique = [...new Set(agentIds)].filter((id) => AGENT_ADDRESSES[id]);
  const out: { agent: string; txHash?: string; error?: string }[] = [];
  // Manage the nonce explicitly: writeContract in a tight loop otherwise reuses
  // the same pending nonce → "replacement transaction underpriced". One nonce per bump.
  let nonce = await pub.getTransactionCount({ address: account.address, blockTag: "pending" });
  for (const id of unique) {
    try {
      const txHash = await wallet.writeContract({
        address: REGISTRY,
        abi: BUMP_ABI,
        functionName: "bumpReputation",
        args: [AGENT_ADDRESSES[id]],
        nonce,
      });
      nonce++;
      out.push({ agent: id, txHash });
    } catch (e) {
      // A nonce gap can desync our counter — resync from chain before continuing.
      try {
        nonce = await pub.getTransactionCount({ address: account.address, blockTag: "pending" });
      } catch {
        /* keep going */
      }
      out.push({ agent: id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
