import type { Address, Hex } from "viem";
import tokensGenerated from "./tokens.generated.json";
import vaultsGenerated from "./vaults.generated.json";
import { LIVE_NETWORK_LABELS, RECOVERY_EVM_CHAINS } from "./chains";

/**
 * Grow recovery configuration (all live-in-app networks).
 *
 * ## Account-type note
 *
 * Grow EVM smart wallets are MultiOwner Modular Accounts (factory
 * `0x000000e92D78D90000007F0082006FDA09BD5f11`, salt `0`, EntryPoint v0.6).
 * The **same smart-account address** is used on Base, BSC, Arbitrum, Polygon,
 * World Chain, and Ethereum. Solana uses a separate wallet / keypair.
 */

export type MorphoVaultVersion = "v1" | "v2";

/** Lending / yield protocol that holds the vault shares. */
export type YieldProtocol = "morpho" | "aave" | "capify";

export type RecoveryToken = {
  symbol: string;
  address: string;
  decimals: number;
  chainId: number;
  networkName: string;
  tokenType: "erc20" | "spl";
};

export type RecoveryMorphoVault = {
  name: string;
  address: Address;
  underlyingToken: Address;
  underlyingSymbol: string;
  version: MorphoVaultVersion;
  chainId: number;
  networkName: string;
  protocol: YieldProtocol;
};

export function yieldProtocolForVaultName(name: string): YieldProtocol {
  const lower = name.toLowerCase();
  if (lower.startsWith("caw")) return "capify";
  // Aave aToken tickers in Grow constants (aBasEURC, aArbUSDT0, …)
  if (/^a[a-z]{2,}/i.test(name) && !lower.startsWith("arb")) return "aave";
  if (lower.startsWith("aave")) return "aave";
  return "morpho";
}

/**
 * Grow stores Circle/Tether stables as ticker "USD". Map known contracts to
 * the proper display ticker (USDC / USDT). Case-insensitive for EVM addresses;
 * Solana mint addresses are matched as-is (base58).
 */
const STABLECOIN_DISPLAY_BY_ADDRESS: Record<string, "USDC" | "USDT"> = {
  // USDC
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC", // Base
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831": "USDC", // Arbitrum native
  "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8": "USDC", // Arbitrum bridged
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": "USDC", // BSC
  "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": "USDC", // Polygon native
  "0x2791bca1f2de4661ed88a30c99a7a9449aa84174": "USDC", // Polygon bridged
  "0x79a02482a880bce3f13e09da970dc34db4cd24d1": "USDC", // World Chain
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC", // Solana
  // USDT
  "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2": "USDT", // Base
  "0x55d398326f99059ff775485246999027b3197955": "USDT", // BSC
  "0xc2132d05d31c914a87c6611c10748aeb04b58e8f": "USDT", // Polygon
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT", // Solana
};

/** When symbol is USD (Grow's generic stable ticker), resolve USDC/USDT from address. */
export function displayStableSymbol(
  address: string,
  symbol: string
): string {
  if (symbol !== "USD") return symbol;
  const key = address.startsWith("0x") ? address.toLowerCase() : address;
  return STABLECOIN_DISPLAY_BY_ADDRESS[key] ?? symbol;
}

export const YIELD_PROTOCOL_LABEL: Record<YieldProtocol, string> = {
  morpho: "Morpho",
  aave: "Aave",
  capify: "Capify",
};

export const YIELD_PROTOCOL_TOOLTIP: Record<YieldProtocol, string> = {
  morpho:
    "Morpho is a lending protocol. This withdraws your vault shares into the underlying token in your Grow wallet. After that, check the token and send it out.",
  aave:
    "Aave is a lending protocol. This withdraws your aTokens into the underlying token in your Grow wallet. After that, check the token and send it out.",
  capify:
    "Capify is a lending protocol. This withdraws your yield shares into the underlying token in your Grow wallet. After that, check the token and send it out.",
};

export type ModularAccountConfig = {
  accountType: "multi-owner-modular-account-v1";
  entryPointVersion: "0.6";
  factoryAddress: Address;
  accountImplementationAddress: Hex | "REPLACE_WITH_EXACT_IMPLEMENTATION_ADDRESS";
  salt: bigint;
};

/** Alchemy MultiOwner Modular Account factory used by Grow. */
export const GROW_MULTI_OWNER_FACTORY =
  "0x000000e92D78D90000007F0082006FDA09BD5f11" as const satisfies Address;

export const GROW_SMART_ACCOUNT_SALT = BigInt(0);

export const RECOVERY_CONFIG = {
  liveNetworks: LIVE_NETWORK_LABELS,

  evmChains: RECOVERY_EVM_CHAINS,

  /** Default EVM chain for initial account/deployment checks (Base). */
  defaultEvmChainId: 8453 as const,

  modularAccount: {
    accountType: "multi-owner-modular-account-v1",
    entryPointVersion: "0.6",
    factoryAddress: GROW_MULTI_OWNER_FACTORY,
    accountImplementationAddress: "REPLACE_WITH_EXACT_IMPLEMENTATION_ADDRESS",
    salt: GROW_SMART_ACCOUNT_SALT,
  } as const satisfies ModularAccountConfig,

  modularAccountV2Placeholders: {
    accountType: "modular-account-v2",
    entryPointVersion: "0.7",
    factoryAddress: "REPLACE_WITH_EXACT_FACTORY_ADDRESS",
    accountImplementationAddress: "REPLACE_WITH_EXACT_IMPLEMENTATION_ADDRESS",
    salt: "REPLACE_WITH_GROW_SALT_OR_DERIVATION_RULE",
    mav2Type: "SMA",
    entityId: 0,
  } as const,

  tokens: (tokensGenerated as RecoveryToken[]).map((t) => ({
    ...t,
    symbol: displayStableSymbol(t.address, t.symbol),
  })),

  morphoVaults: vaultsGenerated.map((v) => ({
    name: v.name,
    address: v.address as Address,
    underlyingToken: v.underlyingToken as Address,
    underlyingSymbol: displayStableSymbol(
      v.underlyingToken,
      v.underlyingSymbol
    ),
    version: v.version as MorphoVaultVersion,
    chainId: v.chainId,
    networkName: v.networkName,
    protocol: yieldProtocolForVaultName(v.name),
  })) satisfies RecoveryMorphoVault[],

  gasEstimateBufferBps: 12000,

  nativeDustRetainWei: BigInt("50000000000000"),
} as const;

export type RecoveryConfig = typeof RECOVERY_CONFIG;

export function isPlaceholderEndpoint(url: string): boolean {
  return !url.trim() || url.includes("REPLACE_WITH_");
}

export function tokensForChain(chainId: number): RecoveryToken[] {
  return RECOVERY_CONFIG.tokens.filter(
    (t) => t.chainId === chainId && t.tokenType === "erc20"
  );
}

export function vaultsForChain(chainId: number): RecoveryMorphoVault[] {
  return RECOVERY_CONFIG.morphoVaults.filter((v) => v.chainId === chainId);
}

export function solanaTokens(): RecoveryToken[] {
  return RECOVERY_CONFIG.tokens.filter((t) => t.tokenType === "spl");
}
