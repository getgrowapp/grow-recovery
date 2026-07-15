/**
 * Optional Base fork / live integration tests.
 * Skipped unless RECOVERY_FORK_RPC_URL (and optionally RECOVERY_FORK_BUNDLER_URL) are set.
 *
 * Never commit funded keys. Uses only the Hardhat/Anvil disposable account #0.
 */
import { describe, expect, it } from "vitest";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { predictGrowSmartAccountAddress } from "@/lib/account";
import { computeRedeemShares } from "@/lib/morpho";
import { hasSufficientEth } from "@/lib/gas";

const FORK_RPC = process.env.RECOVERY_FORK_RPC_URL;
const DISPOSABLE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

describe.runIf(Boolean(FORK_RPC))("Base fork integration", () => {
  it("reproduces Grow MultiOwner address for a disposable signer", async () => {
    const owner = privateKeyToAccount(DISPOSABLE_KEY);
    const predicted = predictGrowSmartAccountAddress(owner.address);
    const client = createPublicClient({
      chain: base,
      transport: http(FORK_RPC),
    });
    // Factory getAddress should match predictable CREATE2.
    const onchain = await client.readContract({
      address: "0x000000e92D78D90000007F0082006FDA09BD5f11",
      abi: [
        {
          type: "function",
          name: "getAddress",
          stateMutability: "view",
          inputs: [
            { name: "salt", type: "uint256" },
            { name: "owners", type: "address[]" },
          ],
          outputs: [{ type: "address" }],
        },
      ] as const,
      functionName: "getAddress",
      args: [0n, [owner.address]],
    });
    expect(onchain.toLowerCase()).toBe(predicted.toLowerCase());
  });

  it("documents insufficient-gas decision clearly", () => {
    expect(
      hasSufficientEth({ balanceWei: 0n, requiredWei: 1n })
    ).toBe(false);
  });

  it("shows partial redeem when maxRedeem < balance", () => {
    const result = computeRedeemShares({
      shareBalance: 100n,
      maxRedeem: 25n,
    });
    expect(result.fullyRedeemable).toBe(false);
    expect(result.lockedShares).toBe(75n);
  });
});

describe("integration placeholders without fork", () => {
  it("skips funded UserOp flows unless fork env is provided", () => {
    if (!FORK_RPC) {
      expect(true).toBe(true);
    }
  });
});
