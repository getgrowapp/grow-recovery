import { RECOVERY_CONFIG } from "@/config/recovery";

export function applyGasBuffer(estimateWei: bigint, bufferBps = RECOVERY_CONFIG.gasEstimateBufferBps): bigint {
  return (estimateWei * BigInt(bufferBps)) / BigInt(10000);
}

export function hasSufficientEth(params: {
  balanceWei: bigint;
  requiredWei: bigint;
}): boolean {
  return params.balanceWei >= params.requiredWei;
}

/**
 * Conservative ETH left to transfer after retaining estimated gas + dust.
 * Returns 0n when not enough remains.
 */
export function transferableEthAfterGas(params: {
  balanceWei: bigint;
  estimatedGasWei: bigint;
  dustRetainWei?: bigint;
}): bigint {
  const retain =
    applyGasBuffer(params.estimatedGasWei) +
    (params.dustRetainWei ?? RECOVERY_CONFIG.nativeDustRetainWei);
  if (params.balanceWei <= retain) return BigInt(0);
  return params.balanceWei - retain;
}

/** Rough UserOperation cost from gas fields (no L1 data fee for Base MVP). */
export function estimateUserOpCostWei(params: {
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
}): bigint {
  const gasUnits =
    params.callGasLimit +
    params.verificationGasLimit +
    params.preVerificationGas;
  return gasUnits * params.maxFeePerGas;
}
