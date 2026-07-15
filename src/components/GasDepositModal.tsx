"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export type GasDepositInfo = {
  networkName: string;
  nativeSymbol: string;
  address: string;
};

type Props = {
  info: GasDepositInfo;
  onClose: () => void;
};

export function GasDepositModal({ info, onClose }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(info.address, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#111315", light: "#ffffff" },
    }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [info.address]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(info.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gas-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="gas-modal-title">
          Add {info.nativeSymbol} on {info.networkName}
        </h2>
        <p className="muted">
          Send a little {info.nativeSymbol} to this Grow wallet so withdrawals
          on {info.networkName} can pay network fees.
        </p>

        <div className="qr-wrap">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt={`QR code for ${info.address}`} width={220} height={220} />
          ) : (
            <div className="qr-placeholder" />
          )}
        </div>

        <p className="modal-address mono">{info.address}</p>

        <div className="btn-row">
          <button type="button" className="btn secondary" onClick={copy}>
            {copied ? "Copied" : "Copy address"}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
