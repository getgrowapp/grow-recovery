"use client";

import { useState, type MouseEvent } from "react";

export function CopyAddressButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      className={`copy-address-btn${copied ? " copied" : ""}`}
      onClick={onCopy}
      title={copied ? "Copied" : `Copy contract ${address}`}
      aria-label={copied ? "Copied contract address" : "Copy contract address"}
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M6.2 11.4 2.8 8l1.1-1.1 2.3 2.3 5.1-5.1L12.4 5.2 6.2 11.4z"
          />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M6 2h7a1 1 0 0 1 1 1v7h-1.5V3.5H6V2zm-3 3h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm.5 1.5v6h6v-6h-6z"
          />
        </svg>
      )}
    </button>
  );
}
