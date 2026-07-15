function pickString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    const cause =
      e.cause && typeof e.cause === "object"
        ? (e.cause as Record<string, unknown>)
        : null;
    const short = pickString(e.shortMessage, cause?.shortMessage);
    const details = pickString(e.details, cause?.details);
    const msg = pickString(e.message, cause?.message);
    if (short && details && !short.includes(details)) {
      return `${short} — ${details}`;
    }
    if (short) return short;
    if (details) return details;
    if (msg) return msg;
    if (error instanceof Error && error.message) return error.message;
    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown error";
    }
  }
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

export type RecoveryErrorKind = "vault" | "transfer" | "generic";

export function isStaleNonceError(error: unknown): boolean {
  const lower = errorText(error).toLowerCase();
  // Prefer AA25 / explicit nonce phrases. Do NOT match generic
  // "invalid" + "nonce" — simulation errors often JSON-dump the UserOp
  // (which always contains a nonce field) and get mislabeled.
  return (
    lower.includes("aa25") ||
    lower.includes("invalid account nonce") ||
    lower.includes("invalid or stale useroperation nonce") ||
    lower.includes("invalid or stale user operation nonce") ||
    lower.includes("stale nonce") ||
    lower.includes("nonce too low") ||
    lower.includes("nonce too high") ||
    /nonce\s+(is\s+)?(invalid|stale|too low|too high)/.test(lower)
  );
}

function shorten(message: string, max = 220): string {
  const trimmed = message.replace(/\s+/g, " ").trim();
  if (trimmed.length > max) return `${trimmed.slice(0, max - 1)}…`;
  return trimmed || "Something went wrong. Try again.";
}

export function humanizeRecoveryError(
  error: unknown,
  kind: RecoveryErrorKind = "generic"
): string {
  const message = errorText(error);
  const lower = message.toLowerCase();

  // Already humanized — don't remap again.
  if (
    lower.startsWith("not enough eth") ||
    lower.startsWith("base network rpc") ||
    lower.startsWith("couldn’t withdraw") ||
    lower.startsWith("couldn't withdraw") ||
    lower.startsWith("the transaction failed") ||
    lower.startsWith("the token send") ||
    lower.startsWith("the vault redeem") ||
    lower.startsWith("the withdrawal") ||
    lower.startsWith("withdrawal didn’t") ||
    lower.startsWith("withdrawal didn't") ||
    lower.startsWith("a previous transaction") ||
    lower.startsWith("select at least") ||
    lower.startsWith("recovery key") ||
    lower.startsWith("need more")
  ) {
    return message;
  }

  if (
    lower.includes("aa21") ||
    lower.includes("didn't pay prefund") ||
    /\bprefund\b/.test(lower)
  ) {
    return "Not enough ETH in your Grow wallet to pay network fees. Add a little ETH on Base and try again.";
  }
  if (lower.includes("need about") && lower.includes("for fees")) {
    return `Not enough ETH for network fees (${message}). On Base this is usually a tiny amount — add a bit more ETH and retry.`;
  }
  if (
    lower.includes("rpc request failed") ||
    lower.includes("http request failed") ||
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("502") ||
    lower.includes("503") ||
    lower.includes("fetch failed")
  ) {
    return "Base network RPC is busy or rate-limiting right now. Wait a few seconds and try again.";
  }
  if (isStaleNonceError(error)) {
    return "A previous transaction is still stuck in the network mempool. Wait 20–30 seconds, tap Refresh positions, then try again (one asset at a time).";
  }
  // Do NOT match bare "aa"+"gas" — UserOp JSON always has callGas* fields and
  // hex addresses often contain the letters "aa".
  if (
    lower.includes("insufficient funds") ||
    lower.includes("insufficient eth") ||
    lower.includes("exceeds the balance of the account")
  ) {
    return "Not enough ETH in your Grow wallet to pay network fees. Add a little more and try again.";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "The network took too long to respond. Check your connection and try again.";
  }

  if (
    lower.includes("aa24") ||
    lower.includes("signature check failed") ||
    lower.includes("invalid useroperation signature") ||
    lower.includes("invalid user operation signature") ||
    lower.includes("account signature check failed")
  ) {
    return "The recovery key couldn’t sign this wallet operation. Confirm you imported the Grow recovery/owner key for this smart wallet, then try again.";
  }
  if (
    lower.includes("maxfeepergas") &&
    (lower.includes("low") || lower.includes("underpriced"))
  ) {
    return "Network fee bid was too low for the bundler. Wait a few seconds and try again.";
  }

  const simulationFailed =
    (lower.includes("useroperation") || lower.includes("user operation")) &&
    (lower.includes("revert") || lower.includes("execution reverted"));

  if (simulationFailed) {
    if (kind === "vault") {
      return "The vault redeem failed simulation. It may be paused, or this vault isn’t redeemable right now.";
    }
    if (kind === "transfer") {
      return `The token send failed simulation. ${shorten(message, 160)}`;
    }
    return `The transaction failed simulation. ${shorten(message, 160)}`;
  }

  if (kind === "vault") {
    if (
      lower.includes("redeem") ||
      lower.includes("erc4626") ||
      /\bvault\b/.test(lower)
    ) {
      return "Couldn’t withdraw from this vault. Try again, or withdraw a different asset first.";
    }
  }

  // Only intentional wallet rejection — not every error that mentions "bundler".
  if (
    lower.includes("user rejected") ||
    lower.includes("user denied") ||
    lower.includes("rejected by user")
  ) {
    return "The transaction was cancelled.";
  }

  // Prefer the real bundler/RPC message so we can diagnose (truncated).
  return shorten(message);
}
