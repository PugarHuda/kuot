import { readFileSync } from "node:fs";
import { initiateDeveloperControlledWalletsClient, Blockchain } from "@circle-fin/developer-controlled-wallets";
for(const l of readFileSync(".env","utf8").split(/\r?\n/)){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/\s+#.*$/,"").trim();}
const c=initiateDeveloperControlledWalletsClient({apiKey:process.env.CIRCLE_API_KEY,entitySecret:process.env.CIRCLE_ENTITY_SECRET});
// find (or create) an Arc agent wallet holding USDC
const wls=(await c.listWallets({blockchain:Blockchain.ArcTestnet})).data?.wallets ?? [];
let w=wls.find(x=>x.address?.toLowerCase()==="0x69906004c174c84ba9082f0f85dfa08ca7eb7cea") ?? wls[0];
console.log("agent wallet:", w?.id, w?.address);
const bals=(await c.getWalletTokenBalance({id:w.id})).data?.tokenBalances ?? [];
const usdc=bals.find(b=>b.token?.symbol==="USDC");
console.log("USDC balance:", usdc?.amount, "| tokenId:", usdc?.token?.id);
if(!usdc || Number(usdc.amount)<0.05){ console.log("insufficient USDC in agent wallet"); process.exit(0); }
console.log("Agent Wallet pays 0.05 USDC to an author (Circle createTransaction)…");
const tx=await c.createTransaction({walletId:w.id, tokenId:usdc.token.id, destinationAddress:"0x31481ADc889B5e00b70846F59967DAF09CBe4a3e", amount:["0.05"], fee:{type:"level",config:{feeLevel:"MEDIUM"}}});
console.log("  tx id:", tx.data?.id, "| state:", tx.data?.state);
