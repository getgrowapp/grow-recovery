/**
 * Compute redeemable Morpho / ERC-4626 share amount.
 * Uses the lower of share balance and maxRedeem.
 */
export function computeRedeemShares(params: {
  shareBalance: bigint;
  maxRedeem: bigint;
}): {
  redeemShares: bigint;
  lockedShares: bigint;
  fullyRedeemable: boolean;
} {
  const redeemShares =
    params.shareBalance < params.maxRedeem
      ? params.shareBalance
      : params.maxRedeem;
  const lockedShares = params.shareBalance - redeemShares;
  return {
    redeemShares,
    lockedShares,
    fullyRedeemable:
      lockedShares === BigInt(0) && params.shareBalance > BigInt(0),
  };
}

/**
 * True when amount is below 10^(-fractionDigits) of one full token.
 * Absolute size check — not relative to other balances.
 */
export function isAmountDust(params: {
  amount: bigint;
  decimals: number;
  /** Hide below 10^(-fractionDigits) of one full token. */
  fractionDigits?: number;
}): boolean {
  const fractionDigits = params.fractionDigits ?? 6;
  const decimals = Math.max(0, params.decimals);
  if (params.amount === 0n) return true;
  if (decimals <= fractionDigits) {
    return params.amount < 1n;
  }
  const threshold = 10n ** BigInt(decimals - fractionDigits);
  return params.amount < threshold;
}

/**
 * Estimate underlying assets from shares when previewRedeem is unavailable.
 * Scales by decimal difference (common for Capify-style 8-dec share wrappers).
 */
export function estimateAssetsFromShareDecimals(params: {
  shareBalance: bigint;
  shareDecimals: number;
  underlyingDecimals: number;
}): bigint {
  const shareDecimals = Math.max(0, params.shareDecimals);
  const underlyingDecimals = Math.max(0, params.underlyingDecimals);
  if (underlyingDecimals === shareDecimals) return params.shareBalance;
  if (underlyingDecimals > shareDecimals) {
    return (
      params.shareBalance *
      10n ** BigInt(underlyingDecimals - shareDecimals)
    );
  }
  const divisor = 10n ** BigInt(shareDecimals - underlyingDecimals);
  return params.shareBalance / divisor;
}
