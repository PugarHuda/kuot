import { readFileSync } from "node:fs";
import { GatewayClient } from "@circle-fin/x402-batching/client";
function loadEnv(p=".env"){try{for(const l of readFileSync(p,"utf8").split(/\r?\n/)){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/\s+#.*$/,"").trim();}}catch{}}
loadEnv();
const pk=process.env.AGENT_PRIVATE_KEY??process.env.PRIVATE_KEY;
const url=process.argv[2]??"https://kuot-azure.vercel.app/api/summaries/14c966d503a1d1b2";
const c=new GatewayClient({chain:"arcTestnet",privateKey:pk.startsWith("0x")?pk:`0x${pk}`,rpcUrl:process.env.ARC_RPC_URL});
console.log("buyer:",c.address,"\npaying (Gateway batched) →",url);
const r=await c.pay(url);
console.log("paid:",r.formattedAmount,"USDC | settlement tx:",r.transaction,"| status:",r.status);
console.log("recursive plan:",JSON.stringify(r.data?.recursive?.authors?.slice(0,3)??r.data?.settlement??r.data,(k,v)=>typeof v==="bigint"?v.toString():v).slice(0,300));
