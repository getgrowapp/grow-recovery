import { isValidHttpUrl } from "@/lib/validation";

export async function testRpcConnectivity(
  rpcUrl: string,
  expectedChainId?: number
): Promise<void> {
  if (!isValidHttpUrl(rpcUrl)) {
    throw new Error("RPC URL is invalid.");
  }
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_chainId",
      params: [],
    }),
  });
  if (!res.ok) {
    throw new Error(`RPC HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    result?: string;
    error?: { message?: string };
  };
  if (body.error) {
    throw new Error(body.error.message ?? "RPC error");
  }
  const chainId = Number.parseInt(body.result ?? "0x0", 16);
  if (expectedChainId != null && chainId !== expectedChainId) {
    throw new Error(
      `RPC chainId is ${chainId}, expected ${expectedChainId}.`
    );
  }
}

export async function testBundlerConnectivity(bundlerUrl: string): Promise<void> {
  if (!isValidHttpUrl(bundlerUrl)) {
    throw new Error("Bundler URL is invalid.");
  }
  const res = await fetch(bundlerUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_supportedEntryPoints",
      params: [],
    }),
  });
  if (!res.ok) {
    throw new Error(`Bundler HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    result?: string[];
    error?: { message?: string };
  };
  if (body.error) {
    throw new Error(body.error.message ?? "Bundler error");
  }
  if (!Array.isArray(body.result) || body.result.length === 0) {
    throw new Error("Bundler did not return any supported EntryPoints.");
  }
}

export async function testSolanaRpcConnectivity(rpcUrl: string): Promise<void> {
  if (!isValidHttpUrl(rpcUrl)) {
    throw new Error("Solana RPC URL is invalid.");
  }
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getHealth",
    }),
  });
  if (!res.ok) {
    throw new Error(`Solana RPC HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    result?: string;
    error?: { message?: string };
  };
  if (body.error) {
    throw new Error(body.error.message ?? "Solana RPC error");
  }
}
