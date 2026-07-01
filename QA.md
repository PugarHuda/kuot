# Kuot — QA & testing report

Last run against production `https://kuot-azure.vercel.app` + the test suites. All green.

## Automated
| Suite | Result | How to run |
|---|---|---|
| Vitest (TS unit) | **117 / 117 pass** (+4 opt-in live skipped) | `npm test` |
| Foundry (Solidity, incl. fuzz) | **59 / 59 pass** | `cd contracts && forge test` |
| Playwright (E2E browser click-through) | **21 / 21 pass** (12-page smoke + cited ORCID lookup + any-wallet budget + Cite-button + nav) | `npm run e2e` |
| Live integration — Crossref fallback (real API) | **1 / 1 pass** | `LIVE_CORPUS=1 npx vitest run -t "live integration"` |
| Live integration — full pipeline + settle read-back + burst load | **4 / 4 pass** | `LIVE_API=1 npx vitest run integration.live` |
| `tsc --noEmit` | clean | |
| `next build` | compiles | |

The load test (12-request burst to `/api/share`) caught a real concurrency bug — concurrent on-chain writes
collided on the operator nonce → 502s. Fixed (write coalescing + re-read + deterministic content); burst is
now 12/12 → 200.

## Live pages (all 200, or 307 redirect; 0 client-side JS errors)
`/` · `/dashboard` · `/dashboard/research` · `/dashboard/library` · `/dashboard/agents` ·
`/dashboard/bounties` · `/dashboard/claim` · `/dashboard/activity` · `/leaderboard` (→307) ·
`/docs` · `/slide`

## API — happy paths
| Endpoint | Result |
|---|---|
| `GET /api/activity` | 3 attestations, 19 author payouts (live on-chain read, paginated) |
| `GET /api/agents` · `/api/bounties` · `/api/author?address=` | 200 |
| `POST /api/research` | `venice: live` (real LLM) |
| `GET /api/summaries/<id>` | 402 Gateway-batched challenge |
| `GET /api/auth/orcid/demo-verify` | 307 → `/claim?verified=…` |

## API — negative / edge cases (correct error handling)
| Case | Expected | Got |
|---|---|---|
| `POST /api/research` empty query | 400 | 400 ✓ |
| `POST /api/research` malformed JSON | 400 | 400 ✓ |
| `GET /api/summaries/<unknown>` | 404 | 404 ✓ |
| `GET /api/author` no address | 400 | 400 ✓ |
| `GET /api/author` bad address | 400 | 400 ✓ |
| ORCID demo-verify bad orcid | err redirect | `err=demo_bad_orcid` ✓ |
| `GET /api/dev/gateway-pay` no token | 403 | 403 ✓ |

## Paid flows (real on-chain settlement on Arc)
| Flow | Result |
|---|---|
| reverse-x402 cite (demo header) | 200 + recursive split (`recursiveBps: 7000`) |
| Gateway batched settlement (`/api/dev/gateway-pay`) | `settled: true`, buyer Gateway balance decremented (e.g. 0.9995 → 0.9994 USDC) |

## Security
No server secrets present in the client bundle — verified absent: Circle API key, Venice key,
operator/agent private key, personal Arc RPC token, Circle entity secret, dev-pay token. The only
exposed RPC is the public no-token Arc endpoint.

## Load / concurrency
| Test | Result |
|---|---|
| 6 parallel `POST /api/research` (Venice + corpus + agent mesh) | **6/6 → 200, `venice: live`**, ~27s wall | no rate-limit failures or crashes |
| 10 parallel reverse-x402 cites (`GET /api/summaries`) | all served, ~3s wall |
| Note | concurrent *settlements* share one operator nonce (serialize) — expected, documented |

## Cross-browser / responsive
- `<meta name="viewport" content="width=device-width, initial-scale=1">` present.
- Landing page is responsive (16 `sm:`/`lg:` breakpoints; stacks on mobile).
- Dashboard sidebar is fixed `w-60` (no mobile collapse) → cramped on small phones. The product is
  **desktop-optimized** (the primary review surface); mobile is functional but tight.

## Known limitations (documented, non-blocking)
- Research page retains some legacy client-side payment logic behind Kuot-labelled UI (full rewrite
  deferred to avoid destabilizing the working flow).
- StableFX (USDC↔EURC) route not yet available on Arc testnet (Circle-side); code is correct.
- Activity uses paginated `getLogs` (Arc's fast blocks exceed the 10k range cap); lookback is bounded.
