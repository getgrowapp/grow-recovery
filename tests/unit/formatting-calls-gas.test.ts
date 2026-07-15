import { describe, expect, it } from "vitest";
import { formatTokenAmount } from "@/lib/formatting";
import {
  buildErc20TransferCall,
  buildMorphoRedeemCall,
  orderRecoveryCalls,
} from "@/lib/calls";
import {
  computeRedeemShares,
  estimateAssetsFromShareDecimals,
  isAmountDust,
} from "@/lib/morpho";
import {
  applyGasBuffer,
  hasSufficientEth,
  transferableEthAfterGas,
} from "@/lib/gas";
import { validateRecoveryConfig } from "@/lib/configValidation";
import { KeySession } from "@/lib/keySession";
import { predictGrowSmartAccountAddress } from "@/lib/account";
import { privateKeyToAccount } from "viem/accounts";
import { getEvmChain } from "@/config/chains";
import {
  countAssetsInGroups,
  groupEvmByNetwork,
} from "@/lib/positionSummary";
import type { DiscoveredAssets } from "@/lib/assets";
import {
  displayStableSymbol,
  RECOVERY_CONFIG,
} from "@/config/recovery";

describe("formatTokenAmount", () => {
  it("formats with decimals", () => {
    expect(formatTokenAmount(1_500_000n, 6)).toBe("1.5");
    expect(formatTokenAmount(1_000_000_000_000_000_000n, 18)).toBe("1");
  });
});

describe("displayStableSymbol", () => {
  it("maps Grow USD tickers to USDC/USDT by address", () => {
    expect(
      displayStableSymbol(
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "USD"
      )
    ).toBe("USDC");
    expect(
      displayStableSymbol(
        "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
        "USD"
      )
    ).toBe("USDT");
    expect(displayStableSymbol("0xsomething", "EURC")).toBe("EURC");
  });

  it("applies mapping on loaded recovery tokens and vault underlyings", () => {
    const baseUsdc = RECOVERY_CONFIG.tokens.find(
      (t) =>
        t.address.toLowerCase() ===
        "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
    );
    const baseUsdt = RECOVERY_CONFIG.tokens.find(
      (t) =>
        t.address.toLowerCase() ===
        "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2"
    );
    expect(baseUsdc?.symbol).toBe("USDC");
    expect(baseUsdt?.symbol).toBe("USDT");

    const steak = RECOVERY_CONFIG.morphoVaults.find(
      (v) => v.name === "steakUSDC"
    );
    expect(steak?.underlyingSymbol).toBe("USDC");
  });
});

describe("call construction", () => {
  it("builds ERC-20 transfer calldata", () => {
    const call = buildErc20TransferCall({
      token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      to: "0x3333333333333333333333333333333333333333",
      amount: 100n,
      symbol: "USDC",
    });
    expect(call.to).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
    expect(call.value).toBe(0n);
    expect(call.data.startsWith("0xa9059cbb")).toBe(true);
  });

  it("builds Morpho redeem calldata", () => {
    const call = buildMorphoRedeemCall({
      vault: "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183",
      shares: 50n,
      receiver: "0x3333333333333333333333333333333333333333",
      owner: "0x1111111111111111111111111111111111111111",
      vaultName: "steakUSDC",
    });
    expect(call.data.startsWith("0x")).toBe(true);
    expect(call.data.length).toBeGreaterThan(10);
    expect(call.label).toContain("steakUSDC");
  });

  it("orders morpho before erc20", () => {
    const morpho = buildMorphoRedeemCall({
      vault: "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183",
      shares: 1n,
      receiver: "0x3333333333333333333333333333333333333333",
      owner: "0x1111111111111111111111111111111111111111",
      vaultName: "v",
    });
    const erc20 = buildErc20TransferCall({
      token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      to: "0x3333333333333333333333333333333333333333",
      amount: 1n,
      symbol: "USDC",
    });
    const ordered = orderRecoveryCalls({ morpho: [morpho], erc20: [erc20] });
    expect(ordered[0]).toBe(morpho);
    expect(ordered[1]).toBe(erc20);
  });
});

describe("morpho redeem amount", () => {
  it("uses min(balance, maxRedeem)", () => {
    expect(
      computeRedeemShares({ shareBalance: 100n, maxRedeem: 40n })
    ).toEqual({
      redeemShares: 40n,
      lockedShares: 60n,
      fullyRedeemable: false,
    });
    expect(
      computeRedeemShares({ shareBalance: 100n, maxRedeem: 100n })
    ).toEqual({
      redeemShares: 100n,
      lockedShares: 0n,
      fullyRedeemable: true,
    });
  });
});

describe("isAmountDust", () => {
  it("hides Capify-style leftover when estimated under 0.01 underlying", () => {
    const estimated = estimateAssetsFromShareDecimals({
      shareBalance: 119_327n,
      shareDecimals: 8,
      underlyingDecimals: 18,
    });
    expect(estimated).toBe(119_327n * 10n ** 10n); // ~0.001193 ARS
    expect(
      isAmountDust({
        amount: estimated,
        decimals: 18,
        fractionDigits: 2,
      })
    ).toBe(true);
  });

  it("keeps meaningful Morpho positions and usable token amounts", () => {
    expect(
      isAmountDust({
        amount: 28n * 10n ** 18n,
        decimals: 18,
        fractionDigits: 2,
      })
    ).toBe(false);
    expect(
      isAmountDust({
        amount: 1_000n, // 0.001 USDC
        decimals: 6,
        fractionDigits: 6,
      })
    ).toBe(false);
    expect(
      isAmountDust({
        amount: 100n, // <0.000001 of 18-dec token
        decimals: 18,
        fractionDigits: 6,
      })
    ).toBe(true);
  });
});

describe("gas sufficiency", () => {
  it("applies buffer and decides sufficiency", () => {
    expect(applyGasBuffer(1000n, 12000)).toBe(1200n);
    expect(hasSufficientEth({ balanceWei: 1200n, requiredWei: 1200n })).toBe(
      true
    );
    expect(hasSufficientEth({ balanceWei: 1199n, requiredWei: 1200n })).toBe(
      false
    );
  });

  it("computes transferable eth after gas", () => {
    const value = transferableEthAfterGas({
      balanceWei: 10_000_000_000_000_000n,
      estimatedGasWei: 1_000_000_000_000_000n,
      dustRetainWei: 0n,
    });
    expect(value).toBeGreaterThan(0n);
    expect(
      transferableEthAfterGas({
        balanceWei: 1000n,
        estimatedGasWei: 1000n,
        dustRetainWei: 1n,
      })
    ).toBe(0n);
  });
});

describe("config validation", () => {
  it("accepts baked-in public multi-chain endpoints", () => {
    const issues = validateRecoveryConfig();
    expect(issues.filter((i) => i.level === "error")).toHaveLength(0);
  });
});

describe("key session clearing", () => {
  it("clears in-memory key", () => {
    const session = new KeySession();
    const pk =
      "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" as const;
    session.set(pk);
    expect(session.get()).toBe(pk);
    session.clear();
    expect(session.get()).toBeNull();
    expect(session.isSet).toBe(false);
  });
});

describe("address prediction", () => {
  it("is deterministic for a disposable fixture key", () => {
    const pk =
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
    const owner = privateKeyToAccount(pk);
    const a = predictGrowSmartAccountAddress(owner.address);
    const b = predictGrowSmartAccountAddress(owner.address);
    expect(a).toBe(b);
    expect(a.startsWith("0x")).toBe(true);
  });
});

describe("groupEvmByNetwork", () => {
  it("groups assets by network and reports gas presence", () => {
    const assets: DiscoveredAssets = {
      chains: [
        {
          chain: getEvmChain(8453),
          ethBalance: 0n,
          deployed: true,
          walletAssets: [
            {
              token: {
                address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                symbol: "USDC",
                decimals: 6,
                chainId: 8453,
                networkName: "Base",
                tokenType: "erc20",
              },
              balance: 1_500_000n,
            },
          ],
          morphoPositions: [],
        },
        {
          chain: getEvmChain(56),
          ethBalance: 10_000_000_000_000_000n,
          deployed: true,
          walletAssets: [],
          morphoPositions: [],
        },
      ],
    };

    const groups = groupEvmByNetwork(assets);
    expect(groups.map((g) => g.networkName)).toEqual(["Base", "BSC"]);
    expect(groups[0].hasGas).toBe(false);
    expect(groups[0].gasAmountLabel).toBe("No ETH");
    expect(groups[0].assets[0].title).toBe("USDC");
    expect(groups[1].hasGas).toBe(true);
    expect(groups[1].gasAmountLabel).toContain("BNB");
    expect(countAssetsInGroups(groups)).toBe(2);
  });
});
