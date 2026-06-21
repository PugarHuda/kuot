import Link from "next/link";

export const metadata = {
  title: "Docs — Kuot",
  description: "How Kuot works: one Agent Wallet policy permission, a redelegated agent mesh, x402, Venice, Circle Gateway, and on-chain author payouts.",
};

const SCAN = "https://testnet.arcscan.app/address/";
const CONTRACTS: [string, string, string][] = [
  ["AttributionLedger", "0xE92254E3722D190ffC77C0aCa6856610708b9246", "Records each citation attestation + splits USDC to authors"],
  ["NameRegistry", "0xE9DC8a36e8f14c85E687eEe26978692dA98cbeab", "Binds ORCID/OpenAlex identity → real author wallet"],
  ["UnclaimedEscrow", "0x851C251411Fe4F4bab586F775c7450f86A348EAD", "Holds unclaimed authors' shares until they claim"],
  ["AgentRegistry8004", "0x05465b9887D7952fAC76DF42D193aae55EbA5891", "ERC-8004 identity + reputation for the 5 agents"],
  ["BountyMarket", "0xeC274B5B770e24B0Aef8aF75EAAa7fC9CF7DF5c6", "Sponsor a topic; settled USDC pays the cited authors"],
  ["ShareRegistry", "0x52759E09d3C70ca281c59da3122a7AF8dFA51847", "Publishes results on-chain for public /r/<id> share links"],
  ["CitationYield", "0x3Fdf80368d464078a4733B3b264457D009E5cfA3", "12% APR loyalty yield on rewards left unclaimed"],
];
const ENDPOINTS: [string, string][] = [
  ["POST /api/research", "Run the agent mesh → synthesis + payout plan + agent trace"],
  ["POST /api/settle", "Record the on-chain attestation (operator-relayed)"],
  ["POST /api/agents/feedback", "Bump on-chain ERC-8004 reputation for contributors"],
  ["GET /api/activity · /api/agents · /api/bounties", "Live on-chain reads (attestations, reputation, bounties)"],
  ["GET /api/owed · /api/bonus", "An author's escrowed principal + accruing citation yield"],
  ["POST /api/claim", "Operator-relayed ORCID→wallet binding (NameRegistry)"],
  ["GET /api/paper/[id]", "x402-gated paper unlock (HTTP 402 → on-chain USDC)"],
  ["/api/facilitator/{supported,verify,settle}", "An x402 7710 facilitator on the Circle Gateway"],
  ["GET /api/venice-x402/quote · POST /pay", "Pay Venice itself via x402 (EIP-3009, USDC on Base)"],
  ["POST/GET /api/relayer-webhook", "Circle Gateway Ed25519 webhook receiver + status source"],
  ["POST/GET /api/share", "Publish/read a public result permalink"],
];
const PROOFS: [string, string, string][] = [
  ["Circle Gateway mainnet relay (single-hop, 7710+7702)", "0x6f4c8d539f9ea34f7e6e0d0730e4ae04fec1d986e5d0641b8b36ab00c6e8480c", "https://basescan.org/tx/"],
  ["A2A 2-hop redelegation (end-to-end, Base)", "0x9bab119c6ffd46c0a23bf14b4d7e4101ba672e4ca7d8fc5e9e8708ecde3793c8", "https://basescan.org/tx/"],
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
            An autonomous AI research agent that cites <em>and pays</em> its sources. You grant one
            scoped a wallet permission; the agent buys papers, reads them with Venice, and splits USDC
            back to every author it cites — gasless, non-custodial, attested on-chain.
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
            <li><b>2 · The agents work.</b> The Researcher pays for papers via <b>x402</b>, redelegates narrowed budgets (<b>Gateway settlement</b>) to specialists, and reasons with <b>Venice</b>.</li>
            <li><b>3 · Authors are paid.</b> The payout is attested on-chain and relayed gasless via the <b>Circle Gateway</b> relayer. Unclaimed shares wait in escrow (and earn a loyalty yield) until the author binds their <b>ORCID</b>.</li>
          </ol>

          <H id="mesh">The agent mesh (A2A)</H>
          <p className="mt-3 text-sm leading-relaxed text-[var(--ink)]/80">
            Five specialist agents, each a real on-chain principal in the ERC-8004 registry. The
            Researcher <b>redelegates</b> strictly narrower budgets — authority only ever shrinks:
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
            — and accrues a <b>12% APR citation-loyalty yield</b> (CitationYield, protocol-funded) the
            longer it stays unclaimed. To claim, an author proves their ORCID (OAuth) + signs once; the
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
            real <code>attestAndSplit</code> USDC transfers, and the x402 7710 facilitator. 100 tests (37 Foundry + 63 Vitest), no mocks in the critical path.
          </p>

          <H id="tech">Tech &amp; tracks</H>
          <p className="mt-3 text-sm leading-relaxed text-[var(--ink)]/80">
            <b>Circle Agent Stack</b> (Agent Wallet policy grant, Gateway settlement redeem, redelegation) ·
            <b> Venice AI</b> (chat, web-search, embeddings, image, TTS) · <b>Circle Gateway</b> permissionless
            relayer (EIP-7702, gas in USDC, Ed25519 webhooks) · <b>x402</b> · Next.js · viem · wagmi ·
            Foundry. Qualifies for Best Agent, Best A2A coordination, Best x402 + Gateway settlement, Best use of
            Venice AI, and Best Use of the Circle Gateway Permissionless Relayer.
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
