# Placeholders Grow / operators must replace

Public defaults are already set in `src/config/chains.ts` for Base, BSC, Arbitrum, Polygon, and World Chain.

Optional overrides before production use:

1. **`NEXT_PUBLIC_BASE_RPC_URL`** / Advanced Settings — private Alchemy/Infura/etc. if the public RPC rate-limits you.
2. **`NEXT_PUBLIC_BASE_BUNDLER_URL`** / Advanced Settings — Alchemy (or other) bundler if Pimlico public is insufficient; must support EntryPoint **v0.6**.
3. **`NEXT_PUBLIC_BASE_PATH`** — GitHub Pages project path if not served from domain root (example: `/grow-recovery`).
4. **`modularAccount.accountImplementationAddress`** — documentation-only for MultiOwner MA v1 (CREATE2 uses factory + salt + owners; implementation hash is baked into the factory). Replace if you publish an exact impl address for audits.
5. **`modularAccountV2Placeholders.*`** — only if Grow migrates to single-signer Modular Account V2 (factory / implementation / salt / SMA vs MA). **Do not use for current Grow wallets.**
6. **Token + Morpho vault lists** — re-verify `src/config/tokens.generated.json` and `src/config/vaults.generated.json` against current Grow supported Base assets before publishing a recovery release.

MAv2-only sentinels still in config:

- `REPLACE_WITH_EXACT_FACTORY_ADDRESS`
- `REPLACE_WITH_EXACT_IMPLEMENTATION_ADDRESS`
- `REPLACE_WITH_GROW_SALT_OR_DERIVATION_RULE`
