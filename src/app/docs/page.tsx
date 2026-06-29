import Link from "next/link";

export const metadata = {
  title: "Docs — Kuot",
  description: "How Kuot works: an agent that pays its sources via x402 nanopayments on Arc, proof-of-grounding, recursive reverse-x402, USYC yield, and Circle Gateway.",
};

const SCAN = "https://testnet.arcscan.app/address/";
const CONTRACTS: [string, string, string][] = [
  ["AttributionLedger", "0x6a1AB9C4Cfd7bd65397DC5dDa92d19fA8D49173e", "Records each citation attestation + splits USDC to authors"],
  ["NameRegistry", "0x4bc59e385Be039C42eB32f00C473a8e1B1a76E1C", "Binds ORCID/OpenAlex identity → real author wallet"],
  ["UnclaimedEscrow", "0xf7E7c1619F9C5F3cDcCd1B209fdE0AedA4025812", "Holds unclaimed authors' shares until they claim"],
  ["GroundingRegistry", "0x18FfEEbb779eDF44733C8EFcefeF70fB929636D1", "Commits a tamper-evident digest of each grounded answer"],
  ["ReputationBond", "0xEBfe7B62cC6e383551c61d13437157E0Fe46f463", "Directional trust bond — capital staked behind a citation, slashable"],
  ["AgentRegistry8004", "0x53aaF8397E518f2529e1682b9A03D73537B23f9d", "ERC-8004 identity + reputation for the 5 agents"],
  ["StableFXPool", "0x3B95B94BE1F0cAE3CFF64Ebdc82cB9397deDCEff", "On-chain USDC↔EURC swap so EU authors can take EURC"],
  ["MockUSYC", "0xEe59BD14b54F48D769032c0950a773d41E12115d", "ERC-4626 yield vault (USYC-style stand-in on testnet)"],
  ["CitationYieldUSYC", "0x9E48A2D1501A1DB6A77b7bb325B2C22070be28d8", "Routes unclaimed rewards into the vault; redeem principal + yield"],
  ["ShareRegistry", "0x25BC0d7eA9B574CF47D7018cfBc5a1627F3227Df", "Publishes results on-chain for public /r/<id> share links + reverse-x402"],
  ["BountyMarket", "0x9B06C9314d124FF13a1BA8213882F19332E0444a", "Sponsor a topic with USDC; settled payout splits to the cited authors"],
];
const ENDPOINTS: [string, string][] = [
  ["POST /api/research", "Run the agent mesh → synthesis + payout plan + agent trace"],
  ["POST /api/settle", "Record the on-chain attestation (operator-relayed)"],
  ["POST /api/agents/feedback", "Bump on-chain ERC-8004 reputation for contributors"],
  ["GET /api/activity · /api/agents · /api/bounties", "Live on-chain reads (attestations, reputation, bounties)"],
  ["GET /api/owed · /api/bonus", "An author's escrowed principal + accruing citation yield"],
  ["POST /api/claim", "Operator-relayed ORCID→wallet binding (NameRegistry)"],
  ["GET /api/paper/[id]", "x402-gated paper unlock (HTTP 402 → on-chain USDC)"],
  ["/api/facilitator/{supported,verify,settle}", "x402 + Circle Gateway facilitator (verify + settle)"],
  ["GET /api/venice-x402/quote · POST /pay", "Pay Venice itself via x402 (EIP-3009, USDC on Base)"],
  ["POST/GET /api/relayer-webhook", "Circle Gateway Ed25519 webhook receiver + status source"],
  ["POST/GET /api/share", "Publish/read a public result permalink"],
];
const PROOFS: [string, string, string][] = [
  ["Grounding proof committed on Arc", "0xad77a890ee39fe4327d3455f2c140bf21d4ff02dc4f332419f118329463c01ed", "https://testnet.arcscan.app/tx/"],
  ["Settlement on Arc (attestAndSplit)", "0xd4f7988cc5ce80bcfa165eac7dcc9a6ac55f571ac0cebfe648b9df5418a7e36e", "https://testnet.arcscan.app/tx/"],
];

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="serif mt-12 scroll-mt-20 text-2xl font-semibold tracking-tight">
      {children}
    </h2>
  );
}

export default function Docs() {
  const toc = [
    ["overview", "Overview"],
    ["how", "How it works"],
    ["mesh", "The agent mesh"],
    ["rewards", "Author rewards"],
    ["contracts", "Smart contracts"],
    ["api", "API"],
    ["proof", "On-chain proof"],
    ["tech", "Tech & tracks"],
  ];
  return (
    <main className="relative min-h-dvh bg-[var(--paper)]">
      <div className="paper-grid pointer-events-none absolute inset-0 -z-10" />
      <div className="mx-auto flex w-full max-w-5xl gap-10 px-6 py-12">
        {/* TOC */}
        <nav className="sticky top-12 hidden h-fit w-44 shrink-0 lg:block">
          <Link href="/" className="text-xs text-[var(--muted)] hover:text-[var(--accent)]">← home</Link>
          <ul className="mt-4 space-y-1.5 text-xs">
            {toc.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-[var(--ink)]/70 hover:text-[var(--accent)]">{label}</a>
              </li>
            ))}
          </ul>
          <div className="mt-6 space-y-1.5 text-xs">
            <a href="https://github.com/PugarHuda/kuot" className="block link-accent">GitHub ↗</a>
            <Link href="/dashboard" className="block link-accent">Live app ↗</Link>
            <Link href="/slide" className="block link-accent">Pitch deck ↗</Link>
          </div>
        </nav>

        {/* Content */}
        <article className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--accent)]">Documentation</p>
          <h1 className="serif mt-1 text-4xl font-semibold tracking-tight">Kuot</h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--ink)]/80">
            An autonomous AI research agent that cites <em>and pays</em> its sources. br
            Kuot runs under a Circle Agent Wallet spending cap; the agent buys papers, reads them with Venice, and splits USDC
            back to every author it cites — gas-free, non-custodial, attested on-chain.
          </p>

          <H id="overview">Overview</H>
          <p className="mt-3 text-sm leading-relaxed text-[var(--ink)]/80">
            Most &ldquo;AI + crypto&rdquo; agents hold a blanket token approval or custody your funds.
            Kuot does neither: the user signs a single <b>a Circle Agent Wallet spending policy</b> — a
            periodic USDC budget (e.g. &ldquo;10 USDC/day, expires 24h&rdquo;) — and the agent operates
            inside a cryptographically enforced cap it can never exceed. Every citation becomes an
            on-chain payment to its author.
          </p>

          <H id="how">How it works</H>
          <ol className="mt-3 space-y-3 text-sm leading-relaxed text-[var(--ink)]/80">
            <li><b>1 · Grant once.</b> Sign one Agent Wallet policy permission via a wallet. Keep custody; never sign again.</li>
            <li><b>2 · The agents work.</b> The Researcher pays for papers via <b>x402</b>, delegates narrowed scopes to specialists, and reasons with <b>Venice</b>.</li>
            <li><b>3 · Authors are paid.</b> The payout is attested on-chain and relayed gas-free via the <b>Circle Gateway</b>. Unclaimed shares wait in escrow (and earn a loyalty yield) until the author binds their <b>ORCID</b>.</li>
          </ol>

          <H id="mesh">The agent mesh (A2A)</H>
          <p className="mt-3 text-sm leading-relaxed text-[var(--ink)]/80">
            Five specialist agents, each a real on-chain principal in the ERC-8004 registry. The
            Researcher delegates strictly narrower scopes to specialists — authority only ever shrinks:
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {[
              ["Planner", "decomposes the question into focused sub-questions"],
              ["Reader fan-out", "one parallel sub-agent per sub-question (scaled by budget)"],
              ["Citation-Matcher", "Venice embeddings → relevance-weighted payouts"],
              ["Fact-checker", "can reject a weak answer and force a revision round"],
              ["Summarizer", "condenses the verified result to a TL;DR"],
            ].map(([a, b]) => (
              <li key={a} className="rounded-md bg-[var(--paper-2)] px-3 py-2">
                <b className="text-[var(--accent)]">{a}</b> — {b}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-[var(--ink)]/70">
            Contributors earn on-chain reputation after settlement, and an agent memory (recall of related
            prior runs) keeps the mesh from being amnesiac.
          </p>

          <H id="rewards">Author rewards</H>
          <p className="mt-3 text-sm leading-relaxed text-[var(--ink)]/80">
            Cited authors who haven&apos;t claimed a wallet have their share recorded on-chain in
            UnclaimedEscrow, keyed by identity. It <b>accumulates</b> every time the agent cites them again
            — and the unclaimed share sits in a real <b>ERC-4626 vault</b> (CitationYieldUSYC) that accrues
            yield the longer it stays unclaimed. On testnet this is a USYC-style stand-in (real USYC is
            institution-gated), so the yield is seeded, not from treasuries — but the deposit/redeem path is
            real on-chain. To claim, an author proves their ORCID (OAuth) + signs once; the
            operator relays the binding (zero gas for the author), then they withdraw principal + bonus.
          </p>

          <H id="contracts">Smart contracts <span className="text-sm font-normal text-[var(--muted)]">(Ethereum Arc)</span></H>
          <div className="mt-3 overflow-hidden rounded-lg border border-[var(--rule)]">
            <table className="w-full text-left text-xs">
              <tbody>
                {CONTRACTS.map(([name, addr, desc]) => (
                  <tr key={addr} className="border-b border-[var(--rule)] last:border-0">
                    <td className="whitespace-nowrap p-3 align-top">
                      <a href={SCAN + addr} target="_blank" rel="noreferrer" className="font-medium text-[var(--accent)] underline">{name}</a>
                      <div className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">{addr.slice(0, 10)}…{addr.slice(-6)}</div>
                    </td>
                    <td className="p-3 align-top text-[var(--ink)]/75">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <H id="api">API</H>
          <div className="mt-3 overflow-hidden rounded-lg border border-[var(--rule)]">
            <table className="w-full text-left text-xs">
              <tbody>
                {ENDPOINTS.map(([ep, desc]) => (
                  <tr key={ep} className="border-b border-[var(--rule)] last:border-0">
                    <td className="whitespace-nowrap p-3 align-top font-mono text-[11px] text-[var(--accent)]">{ep}</td>
                    <td className="p-3 align-top text-[var(--ink)]/75">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <H id="proof">On-chain proof</H>
          <ul className="mt-3 space-y-2 text-sm">
            {PROOFS.map(([label, tx, base]) => (
              <li key={tx} className="rounded-md bg-[var(--paper-2)] p-3">
                <div className="font-medium">{label}</div>
                <a href={base + tx} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-[var(--accent)] underline break-all">{tx}</a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-[var(--ink)]/70">
            Plus live attestations on the <Link href="/dashboard/activity" className="link-accent">Activity</Link> page,
            real <code>attestAndSplit</code> USDC transfers, and the x402 + Gateway facilitator. 161 tests (59 Foundry + 102 Vitest), no mocks in the critical path.
          </p>

          <H id="tech">Tech &amp; tracks</H>
          <p className="mt-3 text-sm leading-relaxed text-[var(--ink)]/80">
            <b>Circle Agent Stack</b> (Agent Wallets, Gateway nanopayments, App Kit Swap) ·
            <b> Venice AI</b> (chat, web-search, embeddings, image, TTS) · <b>Circle Gateway</b> permissionless
            (batching, gas in USDC, Ed25519 webhooks) · <b>x402</b> · Next.js · viem · wagmi ·
            Foundry. Spans RFB-1 Autonomous Paying Agents, RFB-3 Agent-to-Agent, and RFB-6 Creator Monetization.
          </p>

          <footer className="mt-12 border-t border-[var(--rule)] pt-5 text-xs text-[var(--muted)]">
            <Link href="/dashboard" className="link-accent">Open the app →</Link>{" · "}
            <a href="https://github.com/PugarHuda/kuot" className="link-accent">GitHub</a>{" · "}
            <Link href="/slide" className="link-accent">Pitch deck</Link>
          </footer>
        </article>
      </div>
    </main>
  );
}
