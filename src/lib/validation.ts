import {
  getAddress,
  isAddress,
  isHex,
  type Address,
  type Hex,
} from "viem";

export type PrivateKeyValidation =
  | { ok: true; privateKey: Hex }
  | { ok: false; error: string };

export type DestinationValidation =
  | { ok: true; address: Address; isOwnerEoa: boolean }
  | { ok: false; error: string };

/** Validate a 32-byte hex private key (with or without 0x). */
export function validatePrivateKey(input: string): PrivateKeyValidation {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "Private key is required." };
  }
  const hex = (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as Hex;
  if (!isHex(hex)) {
    return { ok: false, error: "Private key must be hex." };
  }
  const body = hex.slice(2);
  if (body.length !== 64) {
    return { ok: false, error: "Private key must be exactly 32 bytes (64 hex chars)." };
  }
  if (!/^[0-9a-fA-F]+$/.test(body)) {
    return { ok: false, error: "Private key contains invalid hex characters." };
  }
  if (/^0+$/.test(body)) {
    return { ok: false, error: "Private key cannot be zero." };
  }
  return { ok: true, privateKey: hex.toLowerCase() as Hex };
}

export function validateDestination(params: {
  input: string;
  smartAccountAddress: Address;
  ownerAddress: Address;
}): DestinationValidation {
  const trimmed = params.input.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a wallet address." };
  }
  if (!isAddress(trimmed, { strict: false })) {
    return { ok: false, error: "That doesn’t look like a valid wallet address." };
  }
  let address: Address;
  try {
    address = getAddress(trimmed);
  } catch {
    return { ok: false, error: "That doesn’t look like a valid wallet address." };
  }
  if (address === "0x0000000000000000000000000000000000000000") {
    return { ok: false, error: "Enter a real wallet address." };
  }
  if (address.toLowerCase() === params.smartAccountAddress.toLowerCase()) {
    return {
      ok: false,
      error: "Enter a different wallet — not this Grow wallet.",
    };
  }
  const isOwnerEoa =
    address.toLowerCase() === params.ownerAddress.toLowerCase();
  return { ok: true, address, isOwnerEoa };
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
