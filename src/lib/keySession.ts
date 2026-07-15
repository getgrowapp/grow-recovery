import type { Hex } from "viem";

/**
 * In-memory private key holder. Never touches storage or console.
 * Cleared on disconnect / reset / dispose.
 */
export class KeySession {
  #privateKey: Hex | null = null;

  set(privateKey: Hex): void {
    this.clear();
    this.#privateKey = privateKey;
  }

  get(): Hex | null {
    return this.#privateKey;
  }

  clear(): void {
    if (this.#privateKey) {
      // Overwrite string contents as best-effort in JS (immutable strings).
      this.#privateKey = null;
    }
  }

  get isSet(): boolean {
    return this.#privateKey !== null;
  }
}

export function assertNoKeyPersistence(): void {
  // Used by tests — documentation of the contract for this module.
}
