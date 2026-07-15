import type { DiscoveredAssets, ChainAssets } from "@/lib/assets";
import { formatTokenAmount } from "@/lib/formatting";
import type { SolanaDiscovered } from "@/lib/solana";
import { formatSol } from "@/lib/solana";
import {
  YIELD_PROTOCOL_LABEL,
  type YieldProtocol,
} from "@/config/recovery";

export type NetworkAssetRow = {
  id: string;
  title: string;
  amountLabel: string;
  kind: "token" | "vault" | "native";
  kindLabel: string;
  contractAddress: string | null;
  protocol?: YieldProtocol;
};

export type NetworkGroup = {
  id: string;
  networkName: string;
  chainId: number;
  nativeSymbol: string;
  /** True when the wallet holds any native gas token on this network. */
  hasGas: boolean;
  gasAmountLabel: string;
  assets: NetworkAssetRow[];
};

function chainHasFunds(chain: ChainAssets): boolean {
  return (
    chain.ethBalance > 0n ||
    chain.walletAssets.length > 0 ||
    chain.morphoPositions.length > 0
  );
}

function assetsForChain(chain: ChainAssets): NetworkAssetRow[] {
  const rows: NetworkAssetRow[] = [];

  for (const pos of chain.morphoPositions) {
    rows.push({
      id: `vault-${pos.vault.address}`,
      title: pos.vault.name,
      amountLabel: formatTokenAmount(pos.shareBalance, pos.shareDecimals),
      kind: "vault",
      kindLabel: YIELD_PROTOCOL_LABEL[pos.vault.protocol],
      contractAddress: pos.vault.address,
      protocol: pos.vault.protocol,
    });
  }

  for (const row of chain.walletAssets) {
    rows.push({
      id: `token-${row.token.address}`,
      title: row.token.symbol,
      amountLabel: formatTokenAmount(row.balance, row.token.decimals),
      kind: "token",
      kindLabel: "Token",
      contractAddress: row.token.address,
    });
  }

  if (chain.ethBalance > 0n) {
    rows.push({
      id: `native-${chain.chain.chainId}`,
      title: chain.chain.nativeSymbol,
      amountLabel: `${formatTokenAmount(chain.ethBalance, 18)} ${chain.chain.nativeSymbol}`,
      kind: "native",
      kindLabel: "Native (gas)",
      contractAddress: null,
    });
  }

  return rows;
}

/** Group discovered EVM balances by network, with per-network gas status. */
export function groupEvmByNetwork(assets: DiscoveredAssets): NetworkGroup[] {
  return assets.chains
    .filter(chainHasFunds)
    .map((chain) => {
      const hasGas = chain.ethBalance > 0n;
      return {
        id: `evm-${chain.chain.chainId}`,
        networkName: chain.chain.networkName,
        chainId: chain.chain.chainId,
        nativeSymbol: chain.chain.nativeSymbol,
        hasGas,
        gasAmountLabel: hasGas
          ? `${formatTokenAmount(chain.ethBalance, 18)} ${chain.chain.nativeSymbol}`
          : `No ${chain.chain.nativeSymbol}`,
        assets: assetsForChain(chain),
      };
    })
    .sort((a, b) => a.networkName.localeCompare(b.networkName));
}

export function groupSolanaByNetwork(
  discovered: SolanaDiscovered
): NetworkGroup[] {
  const assets: NetworkAssetRow[] = [];

  for (const row of discovered.tokens) {
    assets.push({
      id: `spl-${row.token.address}`,
      title: row.token.symbol,
      amountLabel: formatTokenAmount(row.balance, row.token.decimals),
      kind: "token",
      kindLabel: "Token",
      contractAddress: row.token.address,
    });
  }

  if (discovered.solLamports > 0n) {
    assets.push({
      id: "native-sol",
      title: "SOL",
      amountLabel: formatSol(discovered.solLamports),
      kind: "native",
      kindLabel: "Native (gas)",
      contractAddress: null,
    });
  }

  if (assets.length === 0) return [];

  const hasGas = discovered.solLamports > 0n;
  return [
    {
      id: "solana",
      networkName: "Solana",
      chainId: 792703809,
      nativeSymbol: "SOL",
      hasGas,
      gasAmountLabel: hasGas
        ? formatSol(discovered.solLamports)
        : "No SOL",
      assets,
    },
  ];
}

export function countAssetsInGroups(groups: NetworkGroup[]): number {
  return groups.reduce((n, g) => n + g.assets.length, 0);
}

/** Stable checkbox id: chain + asset row id. */
export function selectionKey(chainId: number, assetId: string): string {
  return `${chainId}:${assetId}`;
}

/** Only plain tokens can be sent. Vaults must be exited first. */
export function isSelectableAsset(asset: NetworkAssetRow): boolean {
  return asset.kind === "token";
}

export function selectableKeysForGroup(group: NetworkGroup): string[] {
  return group.assets
    .filter(isSelectableAsset)
    .map((a) => selectionKey(group.chainId, a.id));
}

export function allSelectableKeys(groups: NetworkGroup[]): string[] {
  return groups.flatMap(selectableKeysForGroup);
}

export function chainsWithMovableAssets(assets: DiscoveredAssets) {
  return assets.chains.filter(
    (c) =>
      c.walletAssets.length > 0 ||
      c.morphoPositions.some(
        (p) =>
          p.redeemShares > 0n ||
          (p.vault.protocol === "aave" && p.shareBalance > 0n)
      )
  );
}

export function hasTokenBalances(assets: DiscoveredAssets | null): boolean {
  if (!assets) return false;
  return assets.chains.some((c) => c.walletAssets.length > 0);
}

export function protocolsWithPositions(
  assets: DiscoveredAssets | null
): YieldProtocol[] {
  if (!assets) return [];
  const found = new Set<YieldProtocol>();
  for (const chain of assets.chains) {
    for (const pos of chain.morphoPositions) {
      if (pos.shareBalance > 0n) found.add(pos.vault.protocol);
    }
  }
  const order: YieldProtocol[] = ["morpho", "aave", "capify"];
  return order.filter((p) => found.has(p));
}
