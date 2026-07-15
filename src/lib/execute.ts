import type { Address, Hex } from "viem";
import { formatEther } from "viem";
import type { RecoveryCall } from "@/lib/calls";
import {
  applyGasBuffer,
  estimateUserOpCostWei,
  transferableEthAfterGas,
  hasSufficientEth,
} from "@/lib/gas";
import { buildNativeEthTransferCall } from "@/lib/calls";
import { humanizeRecoveryError, isStaleNonceError } from "@/lib/errors";
import {
  createEvmPublicClient,
  createRecoveryBundlerClient,
} from "@/lib/clients";
import { reconstructGrowAccount } from "@/lib/account";
import type { RecoveryEvmChain } from "@/config/chains";

export type GasEstimate = {
  estimatedCostWei: bigint;
  bufferedCostWei: bigint;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
};

function toCalls(calls: RecoveryCall[]) {
  return calls.map((c) => ({
    to: c.to,
    data: c.data,
    value: c.value,
  }));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toBigIntish(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(value);
  if (typeof value === "string" && value.length > 0) {
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Prefer Pimlico's required UserOp gas prices; fall back to public RPC fees.
 * Only reduce further when the wallet cannot cover that rate for estimated gas.
 */
async function resolveUserOpFees(
  publicClient: ReturnType<typeof createEvmPublicClient>,
  opts?: {
    gasUnits?: bigint;
    balanceWei?: bigint;
    bundlerUrl?: string;
  }
): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } | null> {
  // Pimlico currently rejects below ~1.15e6; keep a cushion above that.
  const MIN_PRIORITY = 1_500_000n;
  const MIN_MAX_FEE = 5_000_000n;
  const HARD_CAP_MAX_FEE = 5_000_000_000n; // 5 gwei — enough for Base + Pimlico

  let priority = MIN_PRIORITY;
  let maxFee = MIN_MAX_FEE;

  if (opts?.bundlerUrl) {
    try {
      const res = await fetch(opts.bundlerUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "pimlico_getUserOperationGasPrice",
          params: [],
        }),
      });
      const json = (await res.json()) as {
        result?: {
          slow?: { maxFeePerGas?: string; maxPriorityFeePerGas?: string };
          standard?: { maxFeePerGas?: string; maxPriorityFeePerGas?: string };
          fast?: { maxFeePerGas?: string; maxPriorityFeePerGas?: string };
        };
      };
      const tier = json.result?.standard ?? json.result?.fast ?? json.result?.slow;
      const pimlicoMax = toBigIntish(tier?.maxFeePerGas);
      const pimlicoPriority = toBigIntish(tier?.maxPriorityFeePerGas);
      if (pimlicoMax != null && pimlicoMax > 0n) maxFee = pimlicoMax;
      if (pimlicoPriority != null && pimlicoPriority > 0n) {
        priority = pimlicoPriority;
      }
    } catch {
      // fall through to public RPC
    }
  }

  if (maxFee === MIN_MAX_FEE || priority === MIN_PRIORITY) {
    try {
      const gasPrice = await publicClient.getGasPrice();
      if (maxFee === MIN_MAX_FEE) maxFee = gasPrice * 4n;
      try {
        const fees = await publicClient.estimateFeesPerGas();
        if (
          priority === MIN_PRIORITY &&
          fees.maxPriorityFeePerGas &&
          fees.maxPriorityFeePerGas > 0n
        ) {
          priority = fees.maxPriorityFeePerGas;
        }
      } catch {
        // keep
      }
    } catch {
      // keep mins
    }
  }

  if (priority < MIN_PRIORITY) priority = MIN_PRIORITY;
  if (maxFee < MIN_MAX_FEE) maxFee = MIN_MAX_FEE;
  // maxFee must always cover priority (EIP-1559).
  if (maxFee < priority) maxFee = priority;
  if (maxFee > HARD_CAP_MAX_FEE) maxFee = HARD_CAP_MAX_FEE;
  if (priority > maxFee) priority = maxFee;

  if (opts?.gasUnits && opts.gasUnits > 0n && opts.balanceWei != null) {
    const spendable = (opts.balanceWei * 80n) / 100n;
    const costAtFee = opts.gasUnits * maxFee;
    if (costAtFee > spendable) {
      const affordable = spendable / opts.gasUnits;
      // Never go below Pimlico's priority floor or the send will be rejected.
      if (affordable < priority) return null;
      maxFee = affordable;
      if (priority > maxFee) priority = maxFee;
    }
  }

  return { maxFeePerGas: maxFee, maxPriorityFeePerGas: priority };
}

function gasUnitsOf(prepared: {
  callGasLimit?: bigint | number | string;
  verificationGasLimit?: bigint | number | string;
  preVerificationGas?: bigint | number | string;
}): bigint {
  return (
    BigInt(prepared.callGasLimit ?? 0) +
    BigInt(prepared.verificationGasLimit ?? 0) +
    BigInt(prepared.preVerificationGas ?? 0)
  );
}

function gasFromPrepared(prepared: {
  callGasLimit?: bigint | number | string;
  verificationGasLimit?: bigint | number | string;
  preVerificationGas?: bigint | number | string;
  maxFeePerGas?: bigint | number | string;
}): GasEstimate {
  const callGasLimit = BigInt(prepared.callGasLimit ?? 0);
  const verificationGasLimit = BigInt(prepared.verificationGasLimit ?? 0);
  const preVerificationGas = BigInt(prepared.preVerificationGas ?? 0);
  const maxFeePerGas = BigInt(prepared.maxFeePerGas ?? 0);
  const estimatedCostWei = estimateUserOpCostWei({
    callGasLimit,
    verificationGasLimit,
    preVerificationGas,
    maxFeePerGas,
  });
  return {
    estimatedCostWei,
    bufferedCostWei: applyGasBuffer(estimatedCostWei),
    callGasLimit,
    verificationGasLimit,
    preVerificationGas,
    maxFeePerGas,
  };
}

async function freshBundler(params: {
  privateKey: Hex;
  chain: RecoveryEvmChain;
}) {
  const reconstructed = await reconstructGrowAccount({
    privateKey: params.privateKey,
    chain: params.chain,
  });
  const bundlerClient = createRecoveryBundlerClient({
    chain: params.chain,
    account: reconstructed.account,
  });
  return { reconstructed, bundlerClient };
}

/**
 * Prepare and send the same UserOperation.
 * Never prepare on one client and send on another — that causes stale nonce
 * errors with Modular Account + bundler clients.
 */
export async function estimateAndSubmitRecoveryCalls(params: {
  privateKey: Hex;
  chain: RecoveryEvmChain;
  smartAccountAddress: Address;
  calls: RecoveryCall[];
}): Promise<
  | { ok: true; txHash: Hex | null }
  | { ok: false; skipped: true; reason: string }
> {
  const publicClient = createEvmPublicClient(params.chain);
  const opCalls = toCalls(params.calls);

  let lastError: unknown;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      // Give a stuck bundler op time to land or drop before re-preparing.
      if (attempt > 0) await sleep(2500 * attempt);

      const { bundlerClient } = await freshBundler({
        privateKey: params.privateKey,
        chain: params.chain,
      });

      const balance = await publicClient.getBalance({
        address: params.smartAccountAddress,
      });

      // First prepare with Pimlico/network fees so we learn gas limits.
      let fees = await resolveUserOpFees(publicClient, {
        bundlerUrl: params.chain.bundlerUrl,
      });
      if (!fees) {
        return {
          ok: false,
          skipped: true,
          reason: `need more ${params.chain.nativeSymbol} for fees (wallet has ${formatEther(balance)})`,
        };
      }

      let prepared = await bundlerClient.prepareUserOperation({
        calls: opCalls,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      });

      // Refit fees to balance using actual gas limits (bundler may still pad).
      const units = gasUnitsOf(prepared);
      const fitted = await resolveUserOpFees(publicClient, {
        gasUnits: units > 0n ? units : 500_000n,
        balanceWei: balance,
        bundlerUrl: params.chain.bundlerUrl,
      });
      if (!fitted) {
        return {
          ok: false,
          skipped: true,
          reason: `need more ${params.chain.nativeSymbol} for fees (wallet has ${formatEther(balance)})`,
        };
      }

      if (
        fitted.maxFeePerGas !== fees.maxFeePerGas ||
        fitted.maxPriorityFeePerGas !== fees.maxPriorityFeePerGas ||
        BigInt(prepared.maxFeePerGas ?? 0) > fitted.maxFeePerGas
      ) {
        fees = fitted;
        prepared = await bundlerClient.prepareUserOperation({
          calls: opCalls,
          maxFeePerGas: fees.maxFeePerGas,
          maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        });
      }

      const estimate = gasFromPrepared({
        ...prepared,
        // Cost check against the fees we intend, not any leftover bundler pad.
        maxFeePerGas: fees.maxFeePerGas,
      });

      if (
        !hasSufficientEth({
          balanceWei: balance,
          requiredWei: estimate.bufferedCostWei,
        })
      ) {
        // Last resort: try send anyway when balance covers unbuffered cost —
        // client buffer should not block a clearly fundable Base transfer.
        if (
          !hasSufficientEth({
            balanceWei: balance,
            requiredWei: estimate.estimatedCostWei,
          })
        ) {
          return {
            ok: false,
            skipped: true,
            reason: `need about ${formatEther(estimate.estimatedCostWei)} ${params.chain.nativeSymbol} for fees (wallet has ${formatEther(balance)})`,
          };
        }
      }

      // prepareUserOperation always attaches a dummy stub signature for gas
      // estimation. sendUserOperation reuses parameters.signature when present,
      // so we must NOT pass that stub — omit it and let send sign the final op.
      const userOpHash = await bundlerClient.sendUserOperation({
        calls: opCalls,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        callGasLimit: prepared.callGasLimit,
        verificationGasLimit: prepared.verificationGasLimit,
        preVerificationGas: prepared.preVerificationGas,
        nonce: prepared.nonce,
        // Force fee fields on the prepared op if bundler ignored them earlier.
        ...(prepared.paymasterAndData != null
          ? { paymasterAndData: prepared.paymasterAndData }
          : {}),
      });
      const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash: userOpHash,
        timeout: 180_000,
      });

      if (receipt.success === false) {
        throw new Error(
          "UserOperation execution reverted on-chain."
        );
      }

      return {
        ok: true,
        txHash:
          (receipt.receipt?.transactionHash as Hex | undefined) ?? null,
      };
    } catch (error) {
      lastError = error;
      // Only retry sequence/mempool conflicts — not simulation/revert failures.
      if (!isStaleNonceError(error) || attempt === 4) {
        throw error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(humanizeRecoveryError(lastError));
}

/** Best-effort leftover gas move after a successful withdraw. */
export async function submitRemainingNativeTransfer(params: {
  privateKey: Hex;
  chain: RecoveryEvmChain;
  smartAccountAddress: Address;
  destination: Address;
}): Promise<{ moved: boolean; reason?: string }> {
  const publicClient = createEvmPublicClient(params.chain);
  const balance = await publicClient.getBalance({
    address: params.smartAccountAddress,
  });

  // Heuristic without preparing a UserOp (avoids burning a nonce).
  const roughGasReserve = balance / 4n;
  const transferable = transferableEthAfterGas({
    balanceWei: balance,
    estimatedGasWei: roughGasReserve > 0n ? roughGasReserve : balance,
  });

  if (transferable <= 0n) {
    return {
      moved: false,
      reason: "Not enough leftover gas token to move after fees.",
    };
  }

  const call = buildNativeEthTransferCall({
    to: params.destination,
    value: transferable,
  });

  const result = await estimateAndSubmitRecoveryCalls({
    privateKey: params.privateKey,
    chain: params.chain,
    smartAccountAddress: params.smartAccountAddress,
    calls: [call],
  });

  if (!result.ok) {
    return { moved: false, reason: result.reason };
  }
  return { moved: true };
}
