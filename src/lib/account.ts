import {
  getAddress,
  type Address,
  type Hex,
  type LocalAccount,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  predictMultiOwnerModularAccountV1Address,
  toMultiOwnerModularAccountV1,
  type MultiOwnerModularAccountV1,
} from "@alchemy/smart-accounts";
import {
  GROW_MULTI_OWNER_FACTORY,
  GROW_SMART_ACCOUNT_SALT,
  RECOVERY_CONFIG,
} from "@/config/recovery";
import type { RecoveryEvmChain } from "@/config/chains";
import { createEvmPublicClient, type BasePublicClient } from "@/lib/clients";

export type ReconstructedAccount = {
  owner: LocalAccount;
  ownerAddress: Address;
  predictedAddress: Address;
  accountAddress: Address;
  /** Account bound to a specific chain's public client (for UserOps on that chain). */
  account: MultiOwnerModularAccountV1;
  chain: RecoveryEvmChain;
};

function sortOwners(owners: readonly Address[]): Address[] {
  return [...owners]
    .map((a) => getAddress(a))
    .filter((a) => a !== "0x0000000000000000000000000000000000000000")
    .sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));
}

export function predictGrowSmartAccountAddress(ownerAddress: Address): Address {
  if (RECOVERY_CONFIG.modularAccount.accountType !== "multi-owner-modular-account-v1") {
    throw new Error("Grow recovery requires multi-owner-modular-account-v1.");
  }
  return predictMultiOwnerModularAccountV1Address({
    salt: GROW_SMART_ACCOUNT_SALT,
    ownerAddresses: sortOwners([ownerAddress]),
    factoryAddress: GROW_MULTI_OWNER_FACTORY,
  });
}

export async function reconstructGrowAccount(params: {
  privateKey: Hex;
  chain: RecoveryEvmChain;
}): Promise<ReconstructedAccount> {
  const owner = privateKeyToAccount(params.privateKey);
  const ownerAddress = getAddress(owner.address);
  const accountAddress = predictGrowSmartAccountAddress(ownerAddress);
  const publicClient = createEvmPublicClient(params.chain);

  const account = await toMultiOwnerModularAccountV1({
    client: publicClient,
    owners: [owner],
    salt: GROW_SMART_ACCOUNT_SALT,
    factory: GROW_MULTI_OWNER_FACTORY,
    accountAddress,
  });

  return {
    owner,
    ownerAddress,
    predictedAddress: accountAddress,
    accountAddress,
    account,
    chain: params.chain,
  };
}

export async function isContractDeployed(
  publicClient: BasePublicClient,
  address: Address
): Promise<boolean> {
  const code = await publicClient.getCode({ address });
  return Boolean(code && code !== "0x");
}
