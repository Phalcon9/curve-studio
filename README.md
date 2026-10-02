# Curve Studio

Design, simulate and publish [Meteora Dynamic Bonding Curve](https://docs.meteora.ag/developer-guide/guides/dynamic-bonding-curve) (DBC) launch configs, and earn on every token launched with yours.

A DBC config is permanent once it is created: dozens of parameters (Q64.64 sqrt prices, up to 20 curve segments, fee schedulers, migration fees, LP splits) that decide how every token launched on it trades. Today they are hand-rolled or copied, nobody sees the real market caps or sniper fees until tokens trade, and whoever designs a good one earns nothing when others reuse it.

Curve Studio turns a config into a product:

- **Design in USD, deploy in any quote.** A preset is a small JSON spec ("start at $5k, graduate at $70k, 50% anti-sniper fee decaying over 2 minutes"). It compiles to validated SDK `ConfigParameters` for SOL, USDC or a tokenized stock, landing on the same USD market caps.
- **Simulate with the real swap math.** Undeployed configs are filled to graduation with the SDK's own `swapQuotePartialFill`, so start/graduation market cap, raise, sniper-fee decay and fee split are what the program will do, not an approximation.
- **Royalties enforced on-chain.** Publishing makes the author's wallet the config's `feeClaimer`: every token launched on it pays the author the partner share of trading fees plus a SOL launch fee. No custom program, no escrow.
- **A marketplace with no backend.** Published presets are listed in an on-chain registry anyone can read (see below). Authors, including existing launchpads, can list any config they are the fee claimer of.
- **Launch on any config.** The launch page reads any DBC config from chain (ours or another launchpad's), explains its economics in plain numbers, and creates the token plus the creator's first buy in one transaction, with the first buy exempt from the anti-sniper fee.
- **Trade, then get paid.** Every token gets a page with its curve position and a buy/sell box. The Earnings page shows what an author or creator is owed across all their pools and claims it: trading fees and launch fees for authors, trading fees for creators.

## Beyond memecoins

DBC is almost only used for memecoins against SOL. Two curve kinds show it as a general primary-issuance engine:

- **NAV primary issuance** (`navBand`): a near-flat curve pinned within ±bandBps of a reference NAV. A fund or RWA token sells its primary allocation at NAV, then graduates into a tight 10 bps DAMM v2 market.
- **Stock-quoted launches**: raise in TSLAx, NVDAx or SPYx instead of SOL. These are Token-2022 mints with transfer-hook / permanent-delegate / pausable extensions; each was verified to hold a Meteora token badge in both DBC and DAMM v2, and config creation simulates cleanly on mainnet. With compounding fees after graduation, the token's DAMM v2 pool keeps accumulating the stock.

## Built-in presets

Figures from `pnpm --filter @curve-studio/core summary` (SOL at $200; identical in USD for every quote):

| Preset | Category | Market cap | Raise to graduate | Notes |
| --- | --- | --- | --- | --- |
| Classic | meme | $5k → $70k | ≈ $14.8k | 50% → 1% fee over 2 min |
| Long Curve | meme | $10k → $1M | ≈ $200k | two segments, 20% of supply seeds DAMM v2 |
| Stock-Quoted Launch | stock | $25k → $500k | ≈ $146k | 16 liquidity-weighted segments, compounding LP fees |
| NAV Primary Issuance | rwa | ±0.5% around $1 NAV | ≈ $250k | flat curve, 10 bps DAMM v2 pool |
| Stepped Raise | icm | $100k → $1M | ≈ $184k | deep seed tier, then priced-up rounds |

## The preset registry

There is no Curve Studio program and no server. Listing a preset is one small transaction:

1. a memo with the listing JSON (`{"app":"curve-studio","v":1,"config":…,"name":…,"tagline":…,"category":…}`), signed by the author;
2. a 0-lamport transfer to the registry address `EWpPb84bEbgrNYrnZehvyPvEB2Ukor8hBcYPDw7u6HaA`, a PDA of the memo program that nobody holds the key to.

The marketplace calls `getSignaturesForAddress` on the registry address, reads each transaction's memo, and keeps a listing only if the config's on-chain `feeClaimer` signed it, so nobody can list or rename a config they don't own. The newest listing per config wins. Economics are always read from the config account itself, never from the memo. Optionally the same transaction creates the author's DBC partner metadata (`createPartnerMetadata`), so the marketplace and other Meteora tooling show a name instead of an address.

Publishing from the Design page sends the config and its listing as two transactions under one wallet prompt (a 16-segment config leaves no room for the memo in the same transaction). The parsing and verification rules live in [`packages/core/src/registry.ts`](packages/core/src/registry.ts) with tests.

## Where fees go

DBC splits each trading fee 80% trading / 20% protocol. The trading part is split between the preset author (`feeClaimer`) and the token creator by the preset's `creatorSharePct`. A swap that passes a referral account carves 20% out of the protocol share; that never raises the trader's cost. With the Classic preset: author 40%, creator 40%, protocol 16%, referral 4% (asserted in [`presets.test.ts`](packages/core/test/presets.test.ts)). The author also receives 90% of the SOL launch fee on every pool created on their config.

Swaps placed on a token page pass the app's referral account when `VITE_REFERRAL_WALLET` is set and that wallet already holds a token account for the fee token (`pnpm --filter @curve-studio/studio setup-referral <wallet> mainnet-beta <payer.json>` opens them for every known quote). The creator's bundled first buy never carries a referral: the program only grants the min-fee first buy without one.

## Repository

```
packages/core   preset spec, compiler, simulator (no UI, fully tested)
  src/presets/spec.ts      quote-agnostic preset format (5 curve kinds)
  src/presets/compile.ts   PresetSpec + QuoteContext -> validated ConfigParameters
  src/presets/library.ts   built-in presets
  src/sim/pool.ts          on-chain-shaped state for configs that aren't deployed yet
  src/sim/simulate.ts      CurveSim: fill, summary, sniper table, buy quotes
  src/registry.ts          listing memo format, parsing and owner verification
  src/fees.ts              claimable author/creator fees, referral fee token
  scripts/                 summary of every preset; inspect any deployed config
apps/studio     React + Vite app: Design, Marketplace, Launch, token pages, Earnings
  src/lib/market.ts        reads the registry (cached per signature in localStorage)
  src/lib/earnings.ts      finds a wallet's configs and pools, builds claim transactions
  src/lib/trade.ts         token state, quotes and swap transactions with referral
```

## Running it

Requires Node 22+ and pnpm 10.

```sh
pnpm install
pnpm test                 # core test suite
pnpm typecheck
pnpm --filter @curve-studio/studio dev
```

Copy `apps/studio/.env.example` to `apps/studio/.env.local`. **Mainnet needs a dedicated RPC:** `api.mainnet-beta.solana.com` answers every request carrying a browser `Origin` header with 403, so set `VITE_MAINNET_RPC` (a free Helius or Triton key works). Devnet works with the public endpoint. Optionally set `VITE_REFERRAL_WALLET` to earn the swap referral share.

Scripts:

```sh
pnpm --filter @curve-studio/core summary                       # economics of every preset × quote
QUOTE_USD=200 pnpm --filter @curve-studio/core inspect <config> mainnet-beta   # break down any deployed config
pnpm --filter @curve-studio/studio simulate-launch <config> <creator> [firstBuy] [cluster]   # dry-run a launch tx
pnpm --filter @curve-studio/studio setup-referral <wallet> [cluster] [payer.json]   # open referral token accounts
```

Any wallet's earnings can be viewed read-only at `?view=earnings&wallet=<address>`; claiming needs that wallet connected.

## How it was verified

Beyond the unit tests (`pnpm test`), every transaction the app builds was simulated against real chain state (signature checks off, nothing spent):

| Transaction | Where | Result |
| --- | --- | --- |
| Create config, all 5 presets (SOL, TSLAx, SPYx, NVDAx quotes) | devnet + mainnet | ok |
| Listing memo + registry ping + partner metadata | devnet | ok |
| Create pool + first buy + partner launch-fee claim | devnet | ok |
| Partner trading-fee claim, creator trading-fee claim | mainnet pools | ok |
| Buy and sell with and without referral | live mainnet pools | ok |

## Known limits

- Dynamic (volatility) fees are not simulated, so simulated fees are a lower bound.
- The marketplace reads the newest 1000 registry transactions. Spam pings cost the spammer fees but could push old listings out of that window; paginating with `before` is the fix if it happens.
- On configs that collect fees in the output token, a buy's referral fee is paid in the new token, so buys there rarely carry a referral.
- After graduation, LP fees from the DAMM v2 position are claimed on meteora.ag, not here.
- USD targets are converted at the quote's price when the config is published; a stock-quoted preset's USD market caps move with the stock afterwards.
- Devnet has no xStocks or mainnet USDC; stock presets can only be published on mainnet.
