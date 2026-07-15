import { formatUnits } from "viem";

export function formatTokenAmount(
  amount: bigint,
  decimals: number,
  maxFractionDigits = 6
): string {
  if (amount === 0n) return "0";
  const raw = formatUnits(amount, decimals);
  if (!raw.includes(".")) return raw;
  const [whole, frac = ""] = raw.split(".");
  const trimmed = frac.slice(0, maxFractionDigits).replace(/0+$/, "");
  if (trimmed) return `${whole}.${trimmed}`;
  if (whole !== "0") return whole;
  return `<0.${"0".repeat(Math.max(maxFractionDigits - 1, 0))}1`;
}

export function shortenAddress(address: string, chars = 4): string {
  if (address.length < chars * 2 + 2) return address;
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}
