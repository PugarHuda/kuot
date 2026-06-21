# Kuot — QA & testing report

Last run against production `https://kuot-azure.vercel.app` + the test suites. All green.

## Automated
| Suite | Result |
|---|---|
| Vitest (TS unit/integration) | **80 / 80 pass** |
| Foundry (Solidity) | **51 / 51 pass** |
| `tsc --noEmit` | clean |
| `next build` | compiles |

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

## Known limitations (documented, non-blocking)
- Research page retains some legacy client-side payment logic behind Kuot-labelled UI (full rewrite
  deferred to avoid destabilizing the working flow).
- StableFX (USDC↔EURC) route not yet available on Arc testnet (Circle-side); code is correct.
- Activity uses paginated `getLogs` (Arc's fast blocks exceed the 10k range cap); lookback is bounded.
