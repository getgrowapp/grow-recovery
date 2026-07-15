import {
  encodeFunctionData,
  type Address,
  type Hex,
} from "viem";
import { erc20Abi } from "@/abis/erc20";
import { erc4626Abi } from "@/abis/erc4626";

export type RecoveryCall = {
  to: Address;
  data: Hex;
  value: bigint;
  label: string;
};

export function buildErc20TransferCall(params: {
  token: Address;
  to: Address;
  amount: bigint;
  symbol: string;
}): RecoveryCall {
  return {
    to: params.token,
    value: BigInt(0),
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [params.to, params.amount],
    }),
    label: `Transfer ${params.symbol}`,
  };
}

export function buildMorphoRedeemCall(params: {
  vault: Address;
  shares: bigint;
  receiver: Address;
  owner: Address;
  vaultName: string;
}): RecoveryCall {
  return {
    to: params.vault,
    value: BigInt(0),
    data: encodeFunctionData({
      abi: erc4626Abi,
      functionName: "redeem",
      args: [params.shares, params.receiver, params.owner],
    }),
    label: `Redeem ${params.vaultName}`,
  };
}

export function buildNativeEthTransferCall(params: {
  to: Address;
  value: bigint;
}): RecoveryCall {
  return {
    to: params.to,
    value: params.value,
    data: "0x",
    label: "Transfer remaining ETH",
  };
}

/** Order: Morpho redemptions first, then ERC-20 transfers. */
export function orderRecoveryCalls(params: {
  morpho: RecoveryCall[];
  erc20: RecoveryCall[];
}): RecoveryCall[] {
  return [...params.morpho, ...params.erc20];
}
