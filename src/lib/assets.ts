import type { Address } from "viem";
import {
  tokensForChain,
  vaultsForChain,
  type RecoveryMorphoVault,
  type RecoveryToken,
} from "@/config/recovery";
import { erc20Abi } from "@/abis/erc20";
import { erc4626Abi } from "@/abis/erc4626";
import {
  computeRedeemShares,
  estimateAssetsFromShareDecimals,
  isAmountDust,
} from "@/lib/morpho";
import {
  buildErc20TransferCall,
  buildMorphoRedeemCall,
  orderRecoveryCalls,
  type RecoveryCall,
} from "@/lib/calls";
import type { RecoveryEvmChain } from "@/config/chains";
import { createEvmPublicClient } from "@/lib/clients";
import { RECOVERY_EVM_CHAINS } from "@/config/chains";

export type TokenBalanceRow = {
  token: RecoveryToken;
  balance: bigint;
};

export type MorphoPositionRow = {
  vault: RecoveryMorphoVault;
  shareBalance: bigint;
  /** Vault share token decimals (not underlying). */
  shareDecimals: number;
  maxRedeem: bigint;
  redeemShares: bigint;
  lockedShares: bigint;
  fullyRedeemable: boolean;
  maxRedeemSupported: boolean;
};

export type ChainAssets = {
  chain: RecoveryEvmChain;
  ethBalance: bigint;
  deployed: boolean;
  walletAssets: TokenBalanceRow[];
  morphoPositions: MorphoPositionRow[];
  error?: string;
};

export type DiscoveredAssets = {
  chains: ChainAssets[];
};

const MULTICALL_CHUNK = 80;

async function readBalancesChunked(
  publicClient: ReturnType<typeof createEvmPublicClient>,
  smartAccountAddress: Address,
  tokens: RecoveryToken[]
): Promise<TokenBalanceRow[]> {
  const rows: TokenBalanceRow[] = [];
  for (let i = 0; i < tokens.length; i += MULTICALL_CHUNK) {
    const chunk = tokens.slice(i, i + MULTICALL_CHUNK);
    try {
      const results = await publicClient.multicall({
        allowFailure: true,
        contracts: chunk.map((token) => ({
          address: token.address as Address,
          abi: erc20Abi,
          functionName: "balanceOf" as const,
          args: [smartAccountAddress] as const,
        })),
      });
      results.forEach((result, idx) => {
        if (result.status === "success" && typeof result.result === "bigint") {
          if (result.result > 0n) {
            rows.push({ token: chunk[idx], balance: result.result });
          }
        }
      });
    } catch {
      // Fallback: skip chunk on RPC failure
    }
  }
  return rows;
}

async function discoverMorphoPositions(
  publicClient: ReturnType<typeof createEvmPublicClient>,
  smartAccountAddress: Address,
  vaults: RecoveryMorphoVault[]
): Promise<MorphoPositionRow[]> {
  if (vaults.length === 0) return [];

  const shareBalances: { vault: RecoveryMorphoVault; shareBalance: bigint }[] =
    [];

  for (let i = 0; i < vaults.length; i += MULTICALL_CHUNK) {
    const chunk = vaults.slice(i, i + MULTICALL_CHUNK);
    try {
      const results = await publicClient.multicall({
        allowFailure: true,
        contracts: chunk.map((vault) => ({
          address: vault.address,
          abi: erc4626Abi,
          functionName: "balanceOf" as const,
          args: [smartAccountAddress] as const,
        })),
      });
      results.forEach((result, idx) => {
        if (
          result.status === "success" &&
          typeof result.result === "bigint" &&
          result.result > 0n
        ) {
          shareBalances.push({
            vault: chunk[idx],
            shareBalance: result.result,
          });
        }
      });
    } catch {
      // Fall back to per-vault reads if multicall is unavailable.
      for (const vault of chunk) {
        try {
          const shareBalance = await publicClient.readContract({
            address: vault.address,
            abi: erc4626Abi,
            functionName: "balanceOf",
            args: [smartAccountAddress],
          });
          if (shareBalance > 0n) {
            shareBalances.push({ vault, shareBalance });
          }
        } catch {
          // skip unreadable vault
        }
      }
    }
  }

  const morphoPositions: MorphoPositionRow[] = [];
  for (const { vault, shareBalance } of shareBalances) {
    let shareDecimals = 18;
    try {
      shareDecimals = Number(
        await publicClient.readContract({
          address: vault.address,
          abi: erc4626Abi,
          functionName: "decimals",
        })
      );
    } catch {
      shareDecimals = 18;
    }

    let maxRedeem = shareBalance;
    let maxRedeemSupported = true;
    try {
      maxRedeem = await publicClient.readContract({
        address: vault.address,
        abi: erc4626Abi,
        functionName: "maxRedeem",
        args: [smartAccountAddress],
      });
    } catch {
      maxRedeemSupported = false;
      maxRedeem = shareBalance;
    }

    // Some vaults return maxRedeem=0 while shares exist. For recovery, treat
    // that as "maxRedeem unavailable" and attempt a full share exit.
    if (maxRedeemSupported && maxRedeem === 0n && shareBalance > 0n) {
      maxRedeemSupported = false;
      maxRedeem = shareBalance;
    }

    const { redeemShares, lockedShares, fullyRedeemable } = computeRedeemShares(
      { shareBalance, maxRedeem }
    );

    morphoPositions.push({
      vault,
      shareBalance,
      shareDecimals,
      maxRedeem,
      redeemShares,
      lockedShares,
      fullyRedeemable: maxRedeemSupported ? fullyRedeemable : false,
      maxRedeemSupported,
    });
  }

  return morphoPositions;
}

async function discoverChainAssets(params: {
  chain: RecoveryEvmChain;
  smartAccountAddress: Address;
}): Promise<ChainAssets> {
  const publicClient = createEvmPublicClient(params.chain);
  try {
    const [ethBalance, code] = await Promise.all([
      publicClient.getBalance({ address: params.smartAccountAddress }),
      publicClient.getCode({ address: params.smartAccountAddress }),
    ]);
    const deployed = Boolean(code && code !== "0x");

    // Yield vaults first — higher value, smaller list, avoids public-RPC
    // rate limits after large token multicalls.
    const morphoPositions = await discoverMorphoPositions(
      publicClient,
      params.smartAccountAddress,
      vaultsForChain(params.chain.chainId)
    );

    const vaultAddresses = new Set(
      morphoPositions.map((p) => p.vault.address.toLowerCase())
    );
    // Also exclude configured vaults (even if zero) so share tokens aren't
    // accidentally treated as transferable ERC-20s.
    for (const vault of vaultsForChain(params.chain.chainId)) {
      vaultAddresses.add(vault.address.toLowerCase());
    }

    const walletAssets = (
      await readBalancesChunked(
        publicClient,
        params.smartAccountAddress,
        tokensForChain(params.chain.chainId)
      )
    )
      .filter((row) => !vaultAddresses.has(row.token.address.toLowerCase()))
      // Hide amounts that already render as "<0.000001".
      .filter(
        (row) =>
          !isAmountDust({
            amount: row.balance,
            decimals: row.token.decimals,
            fractionDigits: 6,
          })
      );

    const tokenDecimalsByAddress = new Map(
      tokensForChain(params.chain.chainId).map((t) => [
        t.address.toLowerCase(),
        t.decimals,
      ])
    );

    // Hide vault leftovers that aren't worth another UserOp (< 0.01 underlying).
    // Capify wrappers often revert on previewRedeem — fall back to decimal scale.
    const visiblePositions: MorphoPositionRow[] = [];
    for (const pos of morphoPositions) {
      const underlyingDecimals =
        tokenDecimalsByAddress.get(
          pos.vault.underlyingToken.toLowerCase()
        ) ?? 18;

      let assetsFromShares: bigint;
      try {
        assetsFromShares = await publicClient.readContract({
          address: pos.vault.address,
          abi: erc4626Abi,
          functionName: "previewRedeem",
          args: [pos.shareBalance],
        });
      } catch {
        assetsFromShares = estimateAssetsFromShareDecimals({
          shareBalance: pos.shareBalance,
          shareDecimals: pos.shareDecimals,
          underlyingDecimals,
        });
      }

      if (
        isAmountDust({
          amount: assetsFromShares,
          decimals: underlyingDecimals,
          fractionDigits: 2, // < 0.01 underlying
        })
      ) {
        continue;
      }
      visiblePositions.push(pos);
    }

    return {
      chain: params.chain,
      ethBalance,
      deployed,
      walletAssets,
      morphoPositions: visiblePositions,
    };
  } catch (e) {
    return {
      chain: params.chain,
      ethBalance: 0n,
      deployed: false,
      walletAssets: [],
      morphoPositions: [],
      error: e instanceof Error ? e.message : "Failed to load chain",
    };
  }
}

export async function discoverAllEvmAssets(params: {
  smartAccountAddress: Address;
}): Promise<DiscoveredAssets> {
  const chains = await Promise.all(
    RECOVERY_EVM_CHAINS.map((chain) =>
      discoverChainAssets({
        chain,
        smartAccountAddress: params.smartAccountAddress,
      })
    )
  );
  return { chains };
}

export function buildPrimaryRecoveryCalls(params: {
  smartAccountAddress: Address;
  destination: Address;
  walletAssets: TokenBalanceRow[];
  morphoPositions: MorphoPositionRow[];
}): {
  calls: RecoveryCall[];
  transferableTokenCount: number;
  redeemableVaultCount: number;
  blockedVaultCount: number;
} {
  // Vault exits are a separate step (redeem into the Grow wallet first).
  // This path only sends ERC-20 token balances to the destination.
  void params.morphoPositions;
  const erc20Calls: RecoveryCall[] = params.walletAssets
    .filter((row) => row.balance > 0n)
    .map((row) =>
      buildErc20TransferCall({
        token: row.token.address as Address,
        to: params.destination,
        amount: row.balance,
        symbol: row.token.symbol,
      })
    );

  return {
    calls: orderRecoveryCalls({ morpho: [], erc20: erc20Calls }),
    transferableTokenCount: erc20Calls.length,
    redeemableVaultCount: 0,
    blockedVaultCount: 0,
  };
}

/** Redeem vault shares into the Grow smart wallet (not the destination). */
export function buildVaultExitToWalletCalls(params: {
  smartAccountAddress: Address;
  position: MorphoPositionRow;
}): RecoveryCall[] {
  const shares =
    params.position.redeemShares > 0n
      ? params.position.redeemShares
      : params.position.shareBalance;
  if (shares === 0n) return [];

  return [
    buildMorphoRedeemCall({
      vault: params.position.vault.address,
      shares,
      receiver: params.smartAccountAddress,
      owner: params.smartAccountAddress,
      vaultName: params.position.vault.name,
    }),
  ];
}
