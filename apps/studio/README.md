# @curve-studio/studio

The Curve Studio web app. See the [root README](../../README.md) for what it does.

```sh
pnpm dev          # http://localhost:5173
pnpm build        # typecheck + production build into dist/
pnpm lint
pnpm setup-referral <wallet> [devnet|mainnet-beta] [payer.json]
```

Environment (optional, in `.env.local`; see `.env.example`):

| Variable | Default |
| --- | --- |
| `VITE_DEVNET_RPC` | `https://api.devnet.solana.com` |
| `VITE_MAINNET_RPC` | `https://api.mainnet-beta.solana.com` (refuses browser requests: set your own) |
| `VITE_REFERRAL_WALLET` | unset: swaps carry no referral |
