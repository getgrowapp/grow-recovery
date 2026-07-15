import { describe, expect, it } from "vitest";
import { validateDestination, validatePrivateKey } from "@/lib/validation";

describe("validatePrivateKey", () => {
  it("accepts 32-byte hex with 0x", () => {
    const pk =
      "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const result = validatePrivateKey(pk);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.privateKey).toBe(pk);
  });

  it("accepts without 0x", () => {
    const result = validatePrivateKey(
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    );
    expect(result.ok).toBe(true);
  });

  it("rejects short keys", () => {
    const result = validatePrivateKey("0x1234");
    expect(result.ok).toBe(false);
  });

  it("rejects zero key", () => {
    const result = validatePrivateKey(`0x${"0".repeat(64)}`);
    expect(result.ok).toBe(false);
  });
});

describe("validateDestination", () => {
  const smart = "0x1111111111111111111111111111111111111111" as const;
  const owner = "0x2222222222222222222222222222222222222222" as const;
  const other = "0x3333333333333333333333333333333333333333" as const;

  it("accepts a distinct address", () => {
    const result = validateDestination({
      input: other,
      smartAccountAddress: smart,
      ownerAddress: owner,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects zero address", () => {
    const result = validateDestination({
      input: "0x0000000000000000000000000000000000000000",
      smartAccountAddress: smart,
      ownerAddress: owner,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects grow wallet address", () => {
    const result = validateDestination({
      input: smart,
      smartAccountAddress: smart,
      ownerAddress: owner,
    });
    expect(result.ok).toBe(false);
  });

  it("allows owner wallet address", () => {
    const result = validateDestination({
      input: owner,
      smartAccountAddress: smart,
      ownerAddress: owner,
    });
    expect(result.ok).toBe(true);
  });
});
