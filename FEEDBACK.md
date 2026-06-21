# Kuot — Developer-experience feedback on the Circle / Arc stack

Real friction and wins from building Kuot end-to-end on Arc testnet during the Lepton
hackathon (building directly on the Circle Agent Stack). Each item is
concrete and reproducible.

## Circle Gateway / x402-batching SDK (`@circle-fin/x402-batching`)
1. **Win — Arc is first-class.** `CHAIN_CONFIGS.arcTestnet` ships the canonical USDC,
   GatewayWallet, and GatewayMinter addresses, so I could read them from the SDK instead
   of hardcoding. `GatewayClient.pay(url)` doing the full 402 handshake is excellent.
2. **Friction — server peer deps fail silently.** Importing `@circle-fin/x402-batching/server`
   throws `Cannot find module '@x402/evm/exact/server'` until you separately `npm i
   @x402/core @x402/evm`. These aren't listed as required peers anywhere obvious; the error
   only surfaces at runtime. Please declare them as peerDependencies or document them.
3. **Friction — `chain: 'arc'` needs a custom RPC with no clear default.** The type doc says
   "Arc mainnet has no public RPC until ~2026-06-22, pass a private RPC URL," but it's easy
   to miss and the failure mode (silent hang) is unfriendly. A clearer thrown error would help.
4. **Suggestion — settlement-failure surface.** The `onSettlementFailure`/lifecycle hooks are
   great, but there's no SDK-level helper to reconcile a batch that reverted *after* the
   response shipped. A `getBatchStatus(transferId)` + idempotent retry recipe would close the
   "inherent race condition" the x402 v2 notes describe.

## Arc network / RPC
5. **Win — gas in USDC just works.** `forge script ... --broadcast` deployed 7 contracts with
   no chain-specific flags; sub-second finality made the deploy + 8 live proof txs feel instant.
6. **Friction — USDC decimals trap.** Native USDC gas is 18 decimals but the ERC-20 interface
   at `0x3600…0000` is 6 decimals. `eth_getBalance` returns the 18-dec native value while
   `balanceOf` returns 6-dec — easy to off-by-1e12. A one-liner callout in the quickstart
   (not just the contract-addresses page) would save people.

## ARC CLI (`arc-canteen`)
7. **Bug — `login` crashes on Windows.** `arc-canteen login` dies with
   `UnicodeEncodeError: 'charmap' codec can't encode character '→'` because the rich
   console prints a `→` arrow under cp1252. Workaround: `PYTHONUTF8=1 arc-canteen login`.
   Fix: force UTF-8 in the entrypoint, or avoid non-ASCII glyphs in prompts.
8. **Friction — device code lost when backgrounded.** Running `login` non-interactively buries
   the device code in stdout; a `--code-only`/`--json` mode would help automation.

## Circle Developer-Controlled Wallets (`@circle-fin/developer-controlled-wallets`)
9. **Win — Arc enum present** (`Blockchain.ArcTestnet`), `requestTestnetTokens` is handy.
10. **Friction — `createTransaction` field is `amount: string[]`, not `amounts`.** The plural
    reads more naturally and the type error ("did you mean 'amount'?") is the only hint.

## App Kit Swap (`@circle-fin/app-kit`)
11. **Friction — peer-dep resolution.** Installing alongside `developer-controlled-wallets`
    fails `ERESOLVE` on a transitive `@solana/codecs-strings` peerOptional mismatch; needs
    `--legacy-peer-deps`. A loosened range or de-duped Solana dep would avoid this.
12. **Win — `SwapChain.Arc_Testnet` + `estimateSwap`/`swap` API is clean** and the sample's
    "undeployed wallet → retry with `allowanceStrategy: approve`" pattern is a nice touch.

## Overall
The stack let a single builder stand up a real, multi-contract, agentic payments app on a
brand-new L1 in a day, with genuine on-chain USDC flows. The rough edges are mostly missing
peer-dep declarations and one Windows Unicode crash — all low-effort fixes.
