import { readFileSync } from "node:fs";
import { GatewayClient } from "@circle-fin/x402-batching/client";
for(const l of readFileSync(".env","utf8").split(/\r?\n/)){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/\s+#.*$/,"").trim();}
const c=new GatewayClient({chain:"arcTestnet",privateKey:process.env.PRIVATE_KEY,rpcUrl:process.env.ARC_RPC_URL});
const bal=async()=>(await c.getBalances()).gateway.formattedTotal;
console.log("Gateway balance BEFORE:", await bal());
try{
  const r=await c.pay("https://kuot-azure.vercel.app/api/summaries/14c966d503a1d1b2");
  console.log("status:",r.status,"| settlement:",JSON.stringify(r.data?.settlement));
}catch(e){console.log("payerr:",e.message);}
await new Promise(r=>setTimeout(r,4000));
console.log("Gateway balance AFTER: ", await bal());
