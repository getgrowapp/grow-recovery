"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getEvmChain } from "@/config/chains";
import { KeySession } from "@/lib/keySession";
import { validateDestination, validatePrivateKey } from "@/lib/validation";
import {
  testBundlerConnectivity,
  testRpcConnectivity,
} from "@/lib/endpoints";
import { predictGrowSmartAccountAddress } from "@/lib/account";
import {
  buildPrimaryRecoveryCalls,
  buildVaultExitToWalletCalls,
  discoverAllEvmAssets,
  type DiscoveredAssets,
} from "@/lib/assets";
import {
  estimateAndSubmitRecoveryCalls,
  submitRemainingNativeTransfer,
} from "@/lib/execute";
import { humanizeRecoveryError } from "@/lib/errors";
import {
  allSelectableKeys,
  countAssetsInGroups,
  groupEvmByNetwork,
  isSelectableAsset,
  selectableKeysForGroup,
  selectionKey,
} from "@/lib/positionSummary";
import {
  GasDepositModal,
  type GasDepositInfo,
} from "@/components/GasDepositModal";
import { CopyAddressButton } from "@/components/CopyAddressButton";
import {
  YIELD_PROTOCOL_LABEL,
  YIELD_PROTOCOL_TOOLTIP,
  type YieldProtocol,
} from "@/config/recovery";

type Step = "import" | "positions";

const WARNING =
  "Only use this tool from the official Grow GitHub repository. Never share your recovery key with anyone. This page runs locally in your browser and does not send your key to Grow.";

export function RecoveryApp() {
  const evmKeyRef = useRef(new KeySession());

  const [step, setStep] = useState<Step>("import");
  const [ack, setAck] = useState(false);
  const [privateKeyInput, setPrivateKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [endpointsOk, setEndpointsOk] = useState(false);
  const [endpointMsg, setEndpointMsg] = useState<string | null>(null);

  const [ownerAddress, setOwnerAddress] = useState<Address | null>(null);
  const [smartAccountAddress, setSmartAccountAddress] = useState<Address | null>(
    null
  );
  const [assets, setAssets] = useState<DiscoveredAssets | null>(null);

  const [destinationInput, setDestinationInput] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [gasDeposit, setGasDeposit] = useState<GasDepositInfo | null>(null);
  const [vaultBusyKey, setVaultBusyKey] = useState<string | null>(null);
  const [progressNote, setProgressNote] = useState<string | null>(null);
  const [resultNote, setResultNote] = useState<string | null>(null);

  const clearAll = () => {
    evmKeyRef.current.clear();
    setPrivateKeyInput("");
    setShowKey(false);
    setAck(false);
    setOwnerAddress(null);
    setSmartAccountAddress(null);
    setAssets(null);
    setDestinationInput("");
    setSelectedIds(new Set());
    setGasDeposit(null);
    setVaultBusyKey(null);
    setProgressNote(null);
    setResultNote(null);
    setError(null);
    setStep("import");
  };

  useEffect(() => {
    const session = evmKeyRef.current;
    return () => {
      session.clear();
    };
  }, []);

  useEffect(() => {
    const onBlur = () => setShowKey(false);
    const onVisibility = () => {
      if (document.visibilityState !== "visible") setShowKey(false);
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const base = getEvmChain(8453);
        await testRpcConnectivity(base.rpcUrl, base.chainId);
        await testBundlerConnectivity(base.bundlerUrl);
        if (!cancelled) {
          setEndpointsOk(true);
          setEndpointMsg(null);
        }
      } catch (e) {
        if (!cancelled) {
          setEndpointsOk(false);
          setEndpointMsg(humanizeRecoveryError(e));
        }
      }
    };
    setEndpointsOk(false);
    void probe();
    return () => {
      cancelled = true;
    };
  }, []);

  // Hot reload / incomplete state can leave an empty positions screen.
  useEffect(() => {
    if (step !== "positions") return;
    if (!smartAccountAddress && !loadingPositions && !busy) {
      setStep("import");
    }
  }, [step, smartAccountAddress, loadingPositions, busy]);

  const networkGroups = useMemo(() => {
    if (assets) return groupEvmByNetwork(assets);
    return [];
  }, [assets]);

  const assetCount = useMemo(
    () => countAssetsInGroups(networkGroups),
    [networkGroups]
  );

  const selectableIds = useMemo(
    () => allSelectableKeys(networkGroups),
    [networkGroups]
  );

  const selectableIdsKey = selectableIds.join("|");

  // Default: everything selected. Refresh re-selects current balances.
  useEffect(() => {
    setSelectedIds(new Set(selectableIds));
  }, [selectableIdsKey, selectableIds]);

  const selectedCount = useMemo(() => {
    let n = 0;
    for (const id of selectableIds) {
      if (selectedIds.has(id)) n += 1;
    }
    return n;
  }, [selectableIds, selectedIds]);

  const toggleAsset = (key: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleNetwork = (keys: string[], selectAll: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (selectAll) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  };

  const loadEvmPositions = async (address: Address) => {
    setLoadingPositions(true);
    setError(null);
    try {
      const discovered = await discoverAllEvmAssets({
        smartAccountAddress: address,
      });
      setAssets(discovered);
      return discovered;
    } catch (e) {
      setError(humanizeRecoveryError(e));
      return null;
    } finally {
      setLoadingPositions(false);
    }
  };

  /** Wait for RPCs to catch up after a tx, then refresh until settled (or give up). */
  const refreshUntilSettled = async (params: {
    smartAccountAddress: Address;
    isSettled: (discovered: DiscoveredAssets) => boolean;
  }) => {
    setProgressNote("Refreshing balances…");

    // Bundler receipt can land before public RPC balances update.
    await new Promise((r) => setTimeout(r, 2000));

    let discovered: DiscoveredAssets | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0) {
        setProgressNote(`Refreshing balances… (${attempt + 1}/5)`);
        await new Promise((r) => setTimeout(r, 1500));
      }
      discovered = await loadEvmPositions(params.smartAccountAddress);
      if (!discovered) break;
      if (params.isSettled(discovered)) break;
    }

    return discovered;
  };

  const refreshAfterVaultExit = async (params: {
    smartAccountAddress: Address;
    chainId: number;
    vaultAddress: string;
  }) => {
    const vaultLower = params.vaultAddress.toLowerCase();
    return refreshUntilSettled({
      smartAccountAddress: params.smartAccountAddress,
      isSettled: (discovered) => {
        const chain = discovered.chains.find(
          (c) => c.chain.chainId === params.chainId
        );
        return !chain?.morphoPositions.some(
          (p) =>
            p.vault.address.toLowerCase() === vaultLower && p.shareBalance > 0n
        );
      },
    });
  };

  const importAccount = async () => {
    setError(null);
    setBusy(true);
    try {
      if (!ack) throw new Error("Acknowledge the security warning first.");
      if (!endpointsOk) {
        throw new Error(
          endpointMsg ?? "Network is unavailable. Try again in a moment."
        );
      }

      const pk = validatePrivateKey(privateKeyInput);
      if (!pk.ok) throw new Error(pk.error);
      evmKeyRef.current.set(pk.privateKey);
      setPrivateKeyInput("");
      setShowKey(false);

      const owner = privateKeyToAccount(pk.privateKey);
      const scw = predictGrowSmartAccountAddress(owner.address);
      setOwnerAddress(owner.address);
      setSmartAccountAddress(scw);
      setStep("positions");
      setBusy(false);
      await loadEvmPositions(scw);
    } catch (e) {
      evmKeyRef.current.clear();
      setError(humanizeRecoveryError(e));
    } finally {
      setBusy(false);
      setLoadingPositions(false);
    }
  };

  const withdrawSelectedEvm = async () => {
    if (!smartAccountAddress || !ownerAddress) return;
    if (selectedCount === 0) {
      setError("Select at least one asset to withdraw.");
      return;
    }
    const pk = evmKeyRef.current.get();
    if (!pk) {
      setError("Recovery key cleared from memory. Import again.");
      return;
    }

    const dest = validateDestination({
      input: destinationInput,
      smartAccountAddress,
      ownerAddress,
    });
    if (!dest.ok) {
      setError(dest.error);
      return;
    }

    setBusy(true);
    setError(null);
    setResultNote(null);
    setProgressNote("Refreshing balances…");

    try {
      const refreshed = await discoverAllEvmAssets({
        smartAccountAddress,
      });
      setAssets(refreshed);

      const notes: string[] = [];
      /** Tokens successfully submitted for transfer — used to wait for RPC settle. */
      const movedTokens: Array<{ chainId: number; tokenAddress: string }> = [];

      for (const chainAssets of refreshed.chains) {
        const chain = chainAssets.chain;
        const walletAssets = chainAssets.walletAssets.filter((row) =>
          selectedIds.has(
            selectionKey(chain.chainId, `token-${row.token.address}`)
          )
        );
        if (walletAssets.length === 0) continue;

        setProgressNote(`Sending tokens on ${chain.networkName}…`);
        const built = buildPrimaryRecoveryCalls({
          smartAccountAddress,
          destination: dest.address,
          walletAssets,
          morphoPositions: [],
        });
        if (built.calls.length === 0) continue;

        const result = await estimateAndSubmitRecoveryCalls({
          privateKey: pk,
          chain,
          smartAccountAddress,
          calls: built.calls,
        });
        if (!result.ok) {
          notes.push(
            `${chain.networkName}: skipped — ${result.reason}.`
          );
          continue;
        }
        notes.push(
          `${chain.networkName}: moved` +
            (result.txHash ? ` (${result.txHash.slice(0, 10)}…)` : "")
        );
        for (const row of walletAssets) {
          movedTokens.push({
            chainId: chain.chainId,
            tokenAddress: row.token.address,
          });
        }

        // Do NOT sweep leftover gas while yield vaults remain — Morpho/Capify/
        // Aave exits still need ETH/BNB for the next UserOp.
        const hasVaultSharesLeft = chainAssets.morphoPositions.some(
          (p) => p.shareBalance > 0n
        );
        if (hasVaultSharesLeft) continue;

        try {
          const leftover = await submitRemainingNativeTransfer({
            privateKey: pk,
            chain,
            smartAccountAddress,
            destination: dest.address,
          });
          if (leftover.moved) {
            notes.push(
              `${chain.networkName}: moved remaining ${chain.nativeSymbol}`
            );
          }
        } catch {
          // leave dust
        }
      }

      setResultNote(notes.join(" ") || "Nothing moved.");

      if (movedTokens.length > 0) {
        await refreshUntilSettled({
          smartAccountAddress,
          isSettled: (discovered) =>
            movedTokens.every((moved) => {
              const chain = discovered.chains.find(
                (c) => c.chain.chainId === moved.chainId
              );
              const still = chain?.walletAssets.find(
                (row) =>
                  row.token.address.toLowerCase() ===
                    moved.tokenAddress.toLowerCase() && row.balance > 0n
              );
              return !still;
            }),
        });
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const moved of movedTokens) {
            next.delete(
              selectionKey(moved.chainId, `token-${moved.tokenAddress}`)
            );
          }
          return next;
        });
      } else {
        setProgressNote(null);
        await loadEvmPositions(smartAccountAddress);
      }
      setProgressNote(null);
    } catch (e) {
      console.error("[recovery] transfer failed", e);
      setError(humanizeRecoveryError(e, "transfer"));
      setProgressNote(null);
    } finally {
      setBusy(false);
    }
  };

  const exitVaultToWallet = async (params: {
    chainId: number;
    vaultAddress: string;
    protocol: YieldProtocol;
  }) => {
    if (!smartAccountAddress) return;
    const pk = evmKeyRef.current.get();
    if (!pk) {
      setError("Recovery key cleared from memory. Import again.");
      return;
    }

    const key = selectionKey(
      params.chainId,
      `vault-${params.vaultAddress}`
    );
    const chain = getEvmChain(params.chainId);
    const label = YIELD_PROTOCOL_LABEL[params.protocol];

    setVaultBusyKey(key);
    setBusy(true);
    setError(null);
    setResultNote(null);
    setProgressNote(`Withdrawing from ${label} on ${chain.networkName}…`);

    try {
      const preflight = await discoverAllEvmAssets({ smartAccountAddress });
      setAssets(preflight);

      const chainAssets = preflight.chains.find(
        (c) => c.chain.chainId === params.chainId
      );
      const position = chainAssets?.morphoPositions.find(
        (p) =>
          p.vault.address.toLowerCase() === params.vaultAddress.toLowerCase()
      );
      if (!position || position.shareBalance === 0n) {
        throw new Error(`No ${label} balance left to withdraw.`);
      }

      const calls = buildVaultExitToWalletCalls({
        smartAccountAddress,
        position,
      });
      if (calls.length === 0) {
        throw new Error(`Nothing redeemable from ${label} right now.`);
      }

      const result = await estimateAndSubmitRecoveryCalls({
        privateKey: pk,
        chain,
        smartAccountAddress,
        calls,
      });
      if (!result.ok) {
        throw new Error(
          `Need more ${chain.nativeSymbol} for fees (${result.reason}).`
        );
      }

      const afterExit = await refreshAfterVaultExit({
        smartAccountAddress,
        chainId: params.chainId,
        vaultAddress: params.vaultAddress,
      });

      const stillThere = afterExit?.chains
        .find((c) => c.chain.chainId === params.chainId)
        ?.morphoPositions.some(
          (p) =>
            p.vault.address.toLowerCase() ===
              params.vaultAddress.toLowerCase() && p.shareBalance > 0n
        );

      if (stillThere) {
        setResultNote(
          `Submitted ${label} withdraw` +
            (result.txHash ? ` (${result.txHash.slice(0, 10)}…)` : "") +
            `. Balances still show vault shares — tap Refresh positions in a moment.`
        );
      } else {
        setResultNote(
          `Withdrew from ${label} into your Grow wallet` +
            (result.txHash ? ` (${result.txHash.slice(0, 10)}…)` : "") +
            `. Select the underlying token below to send it out.`
        );
      }
      setProgressNote(null);
    } catch (e) {
      console.error("[recovery] vault exit failed", e);
      setError(humanizeRecoveryError(e, "vault"));
      setProgressNote(null);
    } finally {
      setVaultBusyKey(null);
      setBusy(false);
    }
  };

  const logoSrc = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/getgrow-logo.png`;

  return (
    <div className="page">
      <div className="card">
        <div className="brand-row">
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="brand-mark"
              src={logoSrc}
              alt="Grow"
              width={36}
              height={36}
            />
            <span className="brand-text">
              Grow <span className="brand-sub">Recovery</span>
            </span>
          </div>
          {step === "positions" && (
            <button type="button" className="btn secondary" onClick={clearAll}>
              Disconnect
            </button>
          )}
        </div>

        {step === "import" && (
          <>
            <h1>Recover your Grow account</h1>
            <p className="lede">
              Import your EVM recovery key to recover assets on Base, BSC,
              Arbitrum, Polygon, World Chain, and Ethereum. Next you’ll see your balances
              and can send them to another wallet. This page runs only on your
              device — Grow never sees your key.
            </p>
            <p className="muted" style={{ marginTop: -8, marginBottom: 14 }}>
              For Solana assets, import your Solana recovery key into Phantom
              or another Solana wallet.
            </p>

            <div className="warning" role="alert">
              <strong>Security warning</strong>
              {WARNING}
            </div>

            {endpointMsg && !endpointsOk && (
              <p className="error endpoint-status">{endpointMsg}</p>
            )}

            <label className="checkbox">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              <span>I understand this warning and accept the risks.</span>
            </label>

            <div className="field">
              <label htmlFor="pk">EVM recovery key</label>
              <div className="row">
                <input
                  id="pk"
                  type={showKey ? "text" : "password"}
                  value={privateKeyInput}
                  disabled={!ack}
                  onChange={(e) => setPrivateKeyInput(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={
                    ack ? "0x…" : "Acknowledge warning to enable"
                  }
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn secondary"
                  disabled={!ack}
                  onClick={() => setShowKey((v) => !v)}
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error && <p className="error">{error}</p>}

            <div className="btn-row">
              <button
                type="button"
                className="btn"
                disabled={!ack || !endpointsOk || busy || !privateKeyInput}
                onClick={() => void importAccount()}
              >
                {busy ? "Importing…" : "Import & show positions"}
              </button>
            </div>
          </>
        )}

        {step === "positions" && (
          <>
            <div className="positions-header">
              <h1>Your positions</h1>
              <button
                type="button"
                className="btn secondary positions-refresh"
                disabled={busy || loadingPositions}
                onClick={() => {
                  if (smartAccountAddress) {
                    void loadEvmPositions(smartAccountAddress);
                  }
                }}
              >
                {loadingPositions ? "Refreshing…" : "Refresh positions"}
              </button>
            </div>
            <p className="lede">
              First withdraw from Morpho, Capify, or Aave into your Grow wallet.
              Then check the tokens you want to send to your own address.
            </p>

            {smartAccountAddress && (
              <p className="wallet-chip">
                Smart wallet · {smartAccountAddress}
              </p>
            )}

            <div className="summary-bar">
              <span>
                <strong>{assetCount}</strong> assets
              </span>
              <span>
                <strong>{networkGroups.length}</strong> network
                {networkGroups.length === 1 ? "" : "s"} with funds
              </span>
            </div>

            {loadingPositions && (
              <p className="muted">Loading balances across networks…</p>
            )}

            {!loadingPositions && networkGroups.length === 0 && (
              <p className="muted">
                No supported balances found. If you expect funds, they may be on
                an unsupported token or need a moment to index.
              </p>
            )}

            {networkGroups.map((group) => {
              const networkKeys = selectableKeysForGroup(group);
              const selectedInNetwork = networkKeys.filter((k) =>
                selectedIds.has(k)
              ).length;
              const allSelected =
                networkKeys.length > 0 &&
                selectedInNetwork === networkKeys.length;
              const someSelected =
                selectedInNetwork > 0 && selectedInNetwork < networkKeys.length;

              return (
                <section key={group.id} className="chain-block">
                  <header>
                    <label className="network-check">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected;
                        }}
                        disabled={networkKeys.length === 0}
                        onChange={() =>
                          toggleNetwork(networkKeys, !allSelected)
                        }
                      />
                      <h4>{group.networkName}</h4>
                    </label>
                    <button
                      type="button"
                      className={`gas-badge gas-badge-btn ${
                        group.hasGas ? "ok" : "need"
                      }`}
                      title={`Show QR to deposit ${group.nativeSymbol}`}
                      onClick={() => {
                        if (!smartAccountAddress) return;
                        setGasDeposit({
                          networkName: group.networkName,
                          nativeSymbol: group.nativeSymbol,
                          address: smartAccountAddress,
                        });
                      }}
                    >
                      {group.hasGas
                        ? `Has gas · ${group.gasAmountLabel}`
                        : `No gas · add ${group.nativeSymbol}`}
                    </button>
                  </header>
                  <ul className="asset-list">
                    {group.assets.map((asset) => {
                      const selectable = isSelectableAsset(asset);
                      const key = selectionKey(group.chainId, asset.id);
                      const isVault = asset.kind === "vault" && asset.protocol;
                      const vaultWorking = vaultBusyKey === key;
                      return (
                        <li
                          key={asset.id}
                          className={isVault ? "has-vault-exit" : undefined}
                        >
                          <div className="asset-row-main">
                            {selectable ? (
                              <label className="asset-check">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(key)}
                                  onChange={() => toggleAsset(key)}
                                />
                                <span>
                                  {asset.title}
                                  <span className="detail-kind">
                                    {" "}
                                    · {asset.kindLabel}
                                  </span>
                                </span>
                              </label>
                            ) : (
                              <span className="asset-check muted-row">
                                <input
                                  type="checkbox"
                                  checked={false}
                                  disabled
                                  aria-label={`${asset.title} (withdraw first)`}
                                />
                                <span>
                                  {asset.title}
                                  <span className="detail-kind">
                                    {" "}
                                    · {asset.kindLabel}
                                  </span>
                                </span>
                              </span>
                            )}
                            {asset.contractAddress && (
                              <CopyAddressButton
                                address={asset.contractAddress}
                              />
                            )}
                          </div>
                          {isVault &&
                            asset.protocol &&
                            asset.contractAddress && (
                              <span className="vault-exit">
                                <button
                                  type="button"
                                  className="btn secondary vault-exit-btn"
                                  disabled={busy || loadingPositions}
                                  onClick={() =>
                                    void exitVaultToWallet({
                                      chainId: group.chainId,
                                      vaultAddress: asset.contractAddress!,
                                      protocol: asset.protocol!,
                                    })
                                  }
                                >
                                  {vaultWorking
                                    ? "Withdrawing…"
                                    : `Withdraw from ${YIELD_PROTOCOL_LABEL[asset.protocol]}`}
                                </button>
                                <span
                                  className="info-tip"
                                  tabIndex={0}
                                  aria-label={
                                    YIELD_PROTOCOL_TOOLTIP[asset.protocol]
                                  }
                                  data-tip={
                                    YIELD_PROTOCOL_TOOLTIP[asset.protocol]
                                  }
                                >
                                  i
                                </span>
                              </span>
                            )}
                          <div className="asset-row-actions">
                            <span className="mono">{asset.amountLabel}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}

            <div className="section">
              <h3>Send selected to</h3>
              <div className="field">
                <label htmlFor="dest">Wallet address</label>
                <input
                  id="dest"
                  value={destinationInput}
                  onChange={(e) => setDestinationInput(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste the address where you want your funds"
                />
              </div>
              <p className="muted">
                Use a wallet you control (for example MetaMask). Funds from
                every network are sent to this same address. Add a little ETH,
                BNB, or POL to your Grow wallet on each network that has assets
                so withdrawals can go through.
              </p>
            </div>

            {progressNote && <p className="muted">{progressNote}</p>}
            {error && <p className="error">{error}</p>}
            {resultNote && <p className="ok">{resultNote}</p>}

            <div className="withdraw-action">
              <button
                type="button"
                className="btn"
                disabled={
                  busy ||
                  loadingPositions ||
                  selectedCount === 0 ||
                  !destinationInput.trim()
                }
                onClick={() => void withdrawSelectedEvm()}
              >
                {busy
                  ? "Working…"
                  : `Send selected${selectedCount ? ` (${selectedCount})` : ""}`}
              </button>
            </div>

            <p className="footer-note">
              Only assets listed in this tool’s open-source config are recovered.
              Unknown tokens and unsupported protocols are left in place.
            </p>
          </>
        )}
      </div>

      {gasDeposit && (
        <GasDepositModal
          info={gasDeposit}
          onClose={() => setGasDeposit(null)}
        />
      )}
    </div>
  );
}
