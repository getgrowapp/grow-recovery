import { isAddress } from "viem";
import {
  RECOVERY_CONFIG,
  isPlaceholderEndpoint,
  type RecoveryConfig,
} from "@/config/recovery";
import { isValidHttpUrl } from "@/lib/validation";

export type ConfigIssue = { level: "error" | "warn"; message: string };

export function validateRecoveryConfig(
  config: RecoveryConfig = RECOVERY_CONFIG
): ConfigIssue[] {
  const issues: ConfigIssue[] = [];

  for (const chain of config.evmChains) {
    if (isPlaceholderEndpoint(chain.rpcUrl) || !isValidHttpUrl(chain.rpcUrl)) {
      issues.push({
        level: "error",
        message: `Invalid RPC for ${chain.networkName}.`,
      });
    }
    if (
      isPlaceholderEndpoint(chain.bundlerUrl) ||
      !isValidHttpUrl(chain.bundlerUrl)
    ) {
      issues.push({
        level: "error",
        message: `Invalid bundler for ${chain.networkName}.`,
      });
    }
  }

  const ma = config.modularAccount;
  if (!isAddress(ma.factoryAddress, { strict: false })) {
    issues.push({ level: "error", message: "Factory address is invalid." });
  }

  for (const t of config.tokens.slice(0, 20)) {
    if (t.tokenType === "erc20" && !isAddress(t.address, { strict: false })) {
      issues.push({
        level: "error",
        message: `Token ${t.symbol} has invalid address.`,
      });
    }
  }

  return issues;
}
