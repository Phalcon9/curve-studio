# Curve Studio

Design, simulate and publish [Meteora Dynamic Bonding Curve](https://docs.meteora.ag/developer-guide/guides/dynamic-bonding-curve) (DBC) launch configs, and earn on every token launched with yours.

A DBC config is permanent once it is created: dozens of parameters (Q64.64 sqrt prices, up to 20 curve segments, fee schedulers, migration fees, LP splits) that decide how every token launched on it trades. Today they are hand-rolled or copied, nobody sees the real market caps or sniper fees until tokens trade, and whoever designs a good one earns nothing when others reuse it.

Curve Studio turns a config into a product:

- **Design in USD, deploy in any quote.** A preset is a small JSON spec ("start at $5k, graduate at $70k, 50% anti-sniper fee decaying over 2 minutes"). It compiles to validated SDK `ConfigParameters` for SOL, USDC or a tokenized stock, landing on the same USD market caps.
- **Simulate with the real swap math.** Undeployed configs are filled to graduation with the SDK's own `swapQuotePartialFill`, so start/graduation market cap, raise, sniper-fee decay and fee split are what the program will do, not an approximation.
- **Royalties enforced on-chain.** Publishing makes the author's wallet the config's `feeClaimer`: every token launched on it pays the author the partner share of trading fees plus a SOL launch fee. No custom program, no escrow.
- **Launch on any config.** The launch page reads any DBC config from chain (ours or another launchpad's), explains its economics in plain numbers, and creates the token plus the creator's first buy in one transaction, with the first buy exempt from the anti-sniper fee.

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

## Where fees go

DBC splits each trading fee 80% trading / 20% protocol. The trading part is split between the preset author (`feeClaimer`) and the token creator by the preset's `creatorSharePct`. A swap that passes a referral account carves 20% out of the protocol share; that never raises the trader's cost. With the Classic preset: author 40%, creator 40%, protocol 16%, referral 4% (asserted in [`presets.test.ts`](packages/core/test/presets.test.ts)). The author also receives 90% of the SOL launch fee on every pool created on their config.

## Repository

```
packages/core   preset spec, compiler, simulator (no UI, fully tested)
  src/presets/spec.ts      quote-agnostic preset format (5 curve kinds)
  src/presets/compile.ts   PresetSpec + QuoteContext -> validated ConfigParameters
  src/presets/library.ts   built-in presets
  src/sim/pool.ts          port of the program's get_migration_threshold_price (not in the SDK)
  src/sim/simulate.ts      CurveSim: fill, summary, sniper table, buy quotes
  scripts/                 summary of every preset; inspect any deployed config
apps/studio     React + Vite app (Design and Launch pages, wallet adapter)
```

## Running it

Requires Node 22+ and pnpm 10.

```sh
pnpm install
pnpm test                 # core test suite
pnpm typecheck
pnpm --filter @curve-studio/studio dev
```

Optional: copy `apps/studio/.env.example` to `apps/studio/.env.local` and set RPC endpoints. The public mainnet RPC rate-limits `getProgramAccounts`, which the token lists use.

Scripts:

```sh
pnpm --filter @curve-studio/core summary                       # economics of every preset × quote
QUOTE_USD=200 pnpm --filter @curve-studio/core inspect <config> mainnet-beta   # break down any deployed config
pnpm --filter @curve-studio/studio simulate-launch <config> <creator> [firstBuy] [cluster]   # dry-run a launch tx
```

## Known limits

- Dynamic (volatility) fees are not simulated, so simulated fees are a lower bound.
- USD targets are converted at the quote's price when the config is published; a stock-quoted preset's USD market caps move with the stock afterwards.
- Devnet has no xStocks or mainnet USDC; stock presets can only be published on mainnet.
