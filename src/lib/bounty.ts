/** BountyMarket — shared ABI + helpers (Kuot). */
import { keccak256, toBytes, type Address } from "viem";

export const BOUNTY_MARKET = process.env.NEXT_PUBLIC_BOUNTY_MARKET as Address | undefined;

/** Topic hash agreed between sponsor and agent: keccak256(lowercased topic). */
export function topicHash(topic: string): `0x${string}` {
  return keccak256(toBytes(topic.trim().toLowerCase()));
}

export const BOUNTY_ABI = [
  {
    type: "function",
    name: "create",
    stateMutability: "nonpayable",
    inputs: [
      { name: "topicHash", type: "bytes32" },
      { name: "amount", type: "uint256" },
      { name: "ttlSeconds", type: "uint64" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "bountyCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "bounties",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "sponsor", type: "address" },
      { name: "topicHash", type: "bytes32" },
      { name: "amount", type: "uint256" },
      { name: "expiresAt", type: "uint64" },
      { name: "settled", type: "bool" },
      { name: "refunded", type: "bool" },
    ],
  },
] as const;

export const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;
