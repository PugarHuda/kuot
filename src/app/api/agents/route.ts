import { NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { PERMISSION_CHAIN } from "@/lib/chains";

export const runtime = "nodejs";

const REGISTRY = process.env.NEXT_PUBLIC_AGENT_REGISTRY as Address | undefined;

// On-chain principals for the agent mesh (registered in AgentRegistry8004).
const ADDRESSES: Record<string, Address> = {
  researcher: "0x55f43e2DF8A86c1D8852A53D00A8D09bC6bA6369",
  planner: "0x45a945cdE6376995F1E5Ce94649B8258eb3f07E3",
  reader: "0x9a838E7ac55BAbFc9f610D87f182294b5166958F",
  factchecker: "0x817D520025F5cfe811977E3b88DA1Cad324d10a4",
  summarizer: "0x4896022A94eF9b8d7bA4f66EBD63e7Bb5AcEdDAa",
};

const ABI = [
  {
    type: "function",
    name: "getAgent",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "agent", type: "address" },
          { name: "owner", type: "address" },
          { name: "name", type: "string" },
          { name: "capabilities", type: "string" },
          { name: "trustMethod", type: "string" },
          { name: "trustProof", type: "bytes32" },
          { name: "reputation", type: "uint64" },
          { name: "registeredAt", type: "uint64" },
        ],
      },
    ],
  },
] as const;

/** GET /api/agents → on-chain reputation per agent (ERC-8004 registry). */
export async function GET() {
  if (!REGISTRY) return NextResponse.json({ registry: null, agents: {} });
  const rpc = process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc.network";
  const client = createPublicClient({ chain: PERMISSION_CHAIN, transport: http(rpc) });

  const out: Record<string, { address: string; reputation: number; trustMethod: string }> = {};
  await Promise.all(
    Object.entries(ADDRESSES).map(async ([id, address]) => {
      try {
        const c = (await client.readContract({ address: REGISTRY, abi: ABI, functionName: "getAgent", args: [address] })) as {
          reputation: bigint;
          trustMethod: string;
        };
        out[id] = { address, reputation: Number(c.reputation), trustMethod: c.trustMethod };
      } catch {
        out[id] = { address, reputation: 0, trustMethod: "—" };
      }
    }),
  );
  return NextResponse.json({ registry: REGISTRY, agents: out });
}
