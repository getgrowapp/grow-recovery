import type { Chain } from "viem";
import { arbitrum, base, bsc, mainnet, polygon, worldchain } from "viem/chains";

export type RecoveryEvmChainId = 1 | 8453 | 56 | 42161 | 137 | 480;

export type RecoveryEvmChain = {
  chainId: RecoveryEvmChainId;
  networkName: string;
  viemChain: Chain;
  /** Native gas token symbol for UI. */
  nativeSymbol: string;
  rpcUrl: string;
  /** Extra public RPCs tried when the primary rate-limits or fails. */
  rpcFallbacks?: readonly string[];
  bundlerUrl: string;
  explorerTxBase: string;
};

/** CI may inject empty NEXT_PUBLIC_* vars; treat blank as unset. */
function envUrl(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

/**
 * Public keyless endpoints for Grow live-in-app EVM networks.
 * Bundlers: Pimlico public ERC-4337 (EntryPoint v0.6).
 */
export const RECOVERY_EVM_CHAINS: readonly RecoveryEvmChain[] = [
  {
    chainId: 8453,
    networkName: "Base",
    viemChain: base,
    nativeSymbol: "ETH",
    // mainnet.base.org rate-limits quickly under recovery multicalls.
    rpcUrl: envUrl(
      process.env.NEXT_PUBLIC_BASE_RPC_URL,
      "https://base.publicnode.com"
    ),
    rpcFallbacks: [
      "https://1rpc.io/base",
      "https://mainnet.base.org",
    ],
    bundlerUrl: envUrl(
      process.env.NEXT_PUBLIC_BASE_BUNDLER_URL,
      "https://public.pimlico.io/v2/8453/rpc"
    ),
    explorerTxBase: "https://basescan.org/tx/",
  },
  {
    chainId: 56,
    networkName: "BSC",
    viemChain: bsc,
    nativeSymbol: "BNB",
    rpcUrl: envUrl(
      process.env.NEXT_PUBLIC_BSC_RPC_URL,
      "https://bsc-dataseed.binance.org"
    ),
    rpcFallbacks: [
      "https://bsc-dataseed1.binance.org",
      "https://bsc.publicnode.com",
    ],
    bundlerUrl: envUrl(
      process.env.NEXT_PUBLIC_BSC_BUNDLER_URL,
      "https://public.pimlico.io/v2/56/rpc"
    ),
    explorerTxBase: "https://bscscan.com/tx/",
  },
  {
    chainId: 42161,
    networkName: "Arbitrum",
    viemChain: arbitrum,
    nativeSymbol: "ETH",
    rpcUrl: envUrl(
      process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL,
      "https://arb1.arbitrum.io/rpc"
    ),
    rpcFallbacks: [
      "https://arbitrum.publicnode.com",
      "https://1rpc.io/arb",
    ],
    bundlerUrl: envUrl(
      process.env.NEXT_PUBLIC_ARBITRUM_BUNDLER_URL,
      "https://public.pimlico.io/v2/42161/rpc"
    ),
    explorerTxBase: "https://arbiscan.io/tx/",
  },
  {
    chainId: 137,
    networkName: "Polygon",
    viemChain: polygon,
    nativeSymbol: "POL",
    rpcUrl: envUrl(
      process.env.NEXT_PUBLIC_POLYGON_RPC_URL,
      "https://polygon-rpc.com"
    ),
    rpcFallbacks: [
      "https://polygon.publicnode.com",
      "https://1rpc.io/matic",
    ],
    bundlerUrl: envUrl(
      process.env.NEXT_PUBLIC_POLYGON_BUNDLER_URL,
      "https://public.pimlico.io/v2/137/rpc"
    ),
    explorerTxBase: "https://polygonscan.com/tx/",
  },
  {
    chainId: 480,
    networkName: "World Chain",
    viemChain: worldchain,
    nativeSymbol: "ETH",
    rpcUrl: envUrl(
      process.env.NEXT_PUBLIC_WORLDCHAIN_RPC_URL,
      "https://worldchain-mainnet.g.alchemy.com/public"
    ),
    bundlerUrl: envUrl(
      process.env.NEXT_PUBLIC_WORLDCHAIN_BUNDLER_URL,
      "https://public.pimlico.io/v2/480/rpc"
    ),
    explorerTxBase: "https://worldscan.org/tx/",
  },
  {
    chainId: 1,
    networkName: "Ethereum",
    viemChain: mainnet,
    nativeSymbol: "ETH",
    rpcUrl: envUrl(
      process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL,
      "https://ethereum.publicnode.com"
    ),
    rpcFallbacks: [
      "https://eth.llamarpc.com",
      "https://1rpc.io/eth",
    ],
    bundlerUrl: envUrl(
      process.env.NEXT_PUBLIC_ETHEREUM_BUNDLER_URL,
      "https://public.pimlico.io/v2/1/rpc"
    ),
    explorerTxBase: "https://etherscan.io/tx/",
  },
] as const;

export const SOLANA_NETWORK = {
  networkName: "Solana",
  rpcUrl: envUrl(
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
    "https://api.mainnet-beta.solana.com"
  ),
  explorerTxBase: "https://solscan.io/tx/",
} as const;

export const LIVE_NETWORK_LABELS = [
  "Base",
  "BSC",
  "World Chain",
  "Polygon",
  "Arbitrum",
  "Ethereum",
] as const;

export function getEvmChain(chainId: number): RecoveryEvmChain {
  const found = RECOVERY_EVM_CHAINS.find((c) => c.chainId === chainId);
  if (!found) throw new Error(`Unsupported EVM chain ${chainId}`);
  return found;
}
