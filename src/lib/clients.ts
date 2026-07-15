import { createPublicClient, fallback, http, type Transport } from "viem";
import { createBundlerClient } from "viem/account-abstraction";
import type { MultiOwnerModularAccountV1 } from "@alchemy/smart-accounts";
import {
  getEvmChain,
  type RecoveryEvmChain,
  type RecoveryEvmChainId,
} from "@/config/chains";

export type BasePublicClient = ReturnType<typeof createEvmPublicClient>;
export type RecoveryBundlerClient = ReturnType<typeof createRecoveryBundlerClient>;

function rpcTransport(chain: RecoveryEvmChain): Transport {
  const urls = [
    chain.rpcUrl,
    ...(chain.rpcFallbacks ?? []),
  ].filter((url, i, arr) => Boolean(url) && arr.indexOf(url) === i);

  if (urls.length === 1) {
    return http(urls[0], { timeout: 45_000, retryCount: 2 });
  }

  return fallback(
    urls.map((url) => http(url, { timeout: 45_000, retryCount: 1 })),
    { rank: false }
  );
}

export function createEvmPublicClient(chain: RecoveryEvmChain) {
  return createPublicClient({
    chain: chain.viemChain,
    transport: rpcTransport(chain),
  });
}

export function createEvmPublicClientById(chainId: RecoveryEvmChainId) {
  return createEvmPublicClient(getEvmChain(chainId));
}

/** @deprecated Use createEvmPublicClientById — kept for older call sites. */
export function createBasePublicClient(rpcUrl: string) {
  return createPublicClient({
    chain: getEvmChain(8453).viemChain,
    transport: http(rpcUrl, { timeout: 45_000 }),
  });
}

export function createRecoveryBundlerClient(params: {
  chain: RecoveryEvmChain;
  account: MultiOwnerModularAccountV1;
}) {
  return createBundlerClient({
    account: params.account,
    chain: params.chain.viemChain,
    transport: http(params.chain.bundlerUrl, { timeout: 90_000 }) as Transport,
  });
}

export {
  testRpcConnectivity,
  testBundlerConnectivity,
} from "@/lib/endpoints";
