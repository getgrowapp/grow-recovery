# Grow Recovery

Minimal, open-source recovery web app for Grow users across every EVM network that is **live in the app**:

**Base · BSC · World Chain · Polygon · Arbitrum · Ethereum**

Import your EVM smart-wallet recovery key (same address on all EVM chains), preview configured balances, and move supported assets — **without** Grow’s backend, paymaster, or application. For Solana assets, import your Solana key into Phantom or another Solana wallet.

> This tool only recovers assets and protocol positions explicitly listed in its open-source configuration. Unknown tokens, unsupported protocols, NFTs, borrowed positions, and arbitrary contracts are not automatically recovered.

## Security model

- Runs as a **static** site (GitHub Pages compatible). No application server.
- Private key stays in **browser memory** only (`KeySession`). Cleared on Disconnect / unmount.
- No analytics, no third-party scripts, no third-party fonts, `noindex` metadata, CSP meta tag.
- Self-funded ERC-4337 UserOperations only (no paymaster / gas manager).
- Never request token approvals or arbitrary user calldata.

Read [SECURITY.md](./SECURITY.md).

**Persistent UI warning:** only use this tool from the official Grow GitHub repository. Never share your recovery key. The page does not send your key to Grow.

## Why MetaMask does not show your assets

Grow holds balances on a **smart account** address (ERC-4337), not on the EOA derived from the recovery key.

Importing the recovery key into MetaMask shows the **owner EOA**. Your USDC / vault shares live at the **Modular Account** address displayed in the Grow app (and in this tool after import). You must interact through UserOperations from that smart account — which this tool does.

## How MAv2 / Grow address reconstruction works

Grow’s product code creates wallets with Account Kit `createMultiOwnerModularAccountClient` against:

| Parameter | Value |
|-----------|--------|
| Factory | `0x000000e92D78D90000007F0082006FDA09BD5f11` |
| Salt | `0` |
| Owners | `[recoverySignerEoa]` (sorted per MultiOwner rules) |
| EntryPoint | **v0.6** |

In `@alchemy/smart-accounts@5.x` this maps to:

- `predictMultiOwnerModularAccountV1Address`
- `toMultiOwnerModularAccountV1`

**Naming note:** internal docs often say “Modular Account V2”. Alchemy’s single-signer **Modular Account V2** (factory `0x00000000000017c61b5bEe81050EC8eFc9c6fecd`, EntryPoint **v0.7**) is a different account type. Using MAv2 prediction would produce the **wrong address** for current Grow wallets.

This repository therefore reconstructs the MultiOwner account Grow actually deploys. Single-signer MAv2 placeholders remain in `src/config/recovery.ts` for a future account type.

If prediction still disagrees with the in-app address (extra owners, different salt, etc.), paste the Grow smart-account address into the optional override field. The tool verifies the imported signer is an on-chain owner before enabling transactions.

## Exact configuration Grow must publish / maintain

Edit `src/config/recovery.ts` (and regenerate token/vault lists when assets change):

1. **Account:** factory, salt, account type (keep MultiOwner values above for production Grow).
2. **Tokens:** Base ERC-20s users may hold (direct `transfer`).
3. **Morpho / ERC-4626 vaults:** vault share contracts with `redeem(shares, receiver, owner)`.
4. **Endpoints:** public Base RPC + ERC-4337 bundler supporting EntryPoint v0.6 (env or Advanced Settings).

### Placeholders operators must replace before production use

| Placeholder / setting | Purpose |
|-----------------------|---------|
| `NEXT_PUBLIC_BASE_RPC_URL` / Advanced RPC | Base HTTP JSON-RPC |
| `NEXT_PUBLIC_BASE_BUNDLER_URL` / Advanced bundler | ERC-4337 bundler URL |
| `NEXT_PUBLIC_BASE_PATH` | GitHub Pages project base path (e.g. `/grow-recovery`) |
| `modularAccount.accountImplementationAddress` | Optional documentation field (not required for MultiOwner CREATE2) |
| `modularAccountV2Placeholders.*` | Only if Grow migrates to single-signer MAv2 |

Token and vault addresses were sourced from Grow backend generated constants (`assets`, `assetYieldOptions`) for Base. Re-verify before relying on them for production recovery.

## Gas / self-funded flow

1. Send ETH to the **smart account** address (shown after import).
2. The tool estimates the UserOperation (no paymaster).
3. Primary recovery batch: Morpho `redeem` calls, then ERC-20 `transfer`s.
4. Remaining ETH is moved in a **separate** step that retains gas + dust.

If the account is undeployed, the first successful UserOperation deploys it via factory init code (self-funded).

## Local development

```bash
cd grow-recovery
npm install
npm run dev
```

Open the URL printed by Next.js. Prefer a private window without wallet extensions.

Defaults (no `.env` needed) are in `src/config/chains.ts` (public RPC + Pimlico bundler per EVM chain).

Override via optional `NEXT_PUBLIC_*` env vars if those rate-limit you.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Local Next.js |
| `npm run build` | Static export to `out/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test:unit` | Vitest unit tests |
| `npm run test:e2e` | Playwright UI tests |
| `npm run test:fork` | Optional Base fork tests (`RECOVERY_FORK_RPC_URL`) |

## Static GitHub Pages deployment

1. Enable GitHub Pages (GitHub Actions source).
2. Set repository Variables: `NEXT_PUBLIC_BASE_RPC_URL`, `NEXT_PUBLIC_BASE_BUNDLER_URL`.
3. Push to `main` — workflow `.github/workflows/grow-recovery-ci-pages.yml` runs tests and deploys `grow-recovery/out`.

### Verify the deployed site against source

1. Note the git commit SHA of the deployment.
2. Clone the repo at that SHA; confirm `grow-recovery` contents match.
3. Rebuild locally with the same `NEXT_PUBLIC_*` values; diff `out/` against the hosted assets when practical.
4. Confirm the UI warning text and CSP are present in the served HTML.

## Supported assets (MVP)

- Configured Base ERC-20 balances via `balanceOf` + `transfer`.
- Configured Morpho / ERC-4626 vault shares via `maxRedeem` / `previewRedeem` / `redeem`.
- Native ETH for gas + separate remaining-ETH transfer.

Fee-wrapper share tokens used by Grow yield options are included when they appear as vault-share assets in Grow constants. Behavior depends on each contract remaining standard ERC-4626.

## Limitations

- Base only (8453) in this version.
- No portfolio discovery APIs; unlisted tokens are invisible.
- No NFR / NFT / debt / arbitrary protocol unwind.
- Partial vault liquidity (`maxRedeem < balance`) is reported, not force-exited.
- Vault share tokens are **not** transferred when a vault is in the Morpho list; they are redeemed when possible.
- Self-funded EntryPoint deposit behavior should be validated against your bundler before relying on the tool with real funds.
- Never commit real user keys. Tests use disposable Anvil/Hardhat keys only.

## Stack

- Next.js (static export) + TypeScript
- `viem` + `viem/account-abstraction`
- `@alchemy/smart-accounts` (`toMultiOwnerModularAccountV1`)

## License

Same as the parent Grow repository unless otherwise noted.
