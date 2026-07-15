import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";
import { SOLANA_NETWORK } from "@/config/chains";
import { solanaTokens, type RecoveryToken } from "@/config/recovery";

export type SolanaTokenBalance = {
  token: RecoveryToken;
  balance: bigint;
  ata: string;
};

export type SolanaDiscovered = {
  address: string;
  solLamports: bigint;
  tokens: SolanaTokenBalance[];
};

export function parseSolanaSecretKey(input: string): Keypair {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Solana secret key is required.");

  // JSON byte array (Solana CLI format)
  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed) as number[];
    if (!Array.isArray(arr) || arr.length < 32) {
      throw new Error("Invalid Solana secret key JSON array.");
    }
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }

  // Base58 secret key (64-byte secret or 32-byte seed)
  try {
    const bytes = bs58.decode(trimmed);
    if (bytes.length === 64) return Keypair.fromSecretKey(bytes);
    if (bytes.length === 32) return Keypair.fromSeed(bytes);
    throw new Error("Solana secret key must decode to 32 or 64 bytes.");
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Solana")) throw e;
    throw new Error("Solana secret key must be base58 or a JSON byte array.");
  }
}

export function createSolanaConnection(rpcUrl = SOLANA_NETWORK.rpcUrl): Connection {
  return new Connection(rpcUrl, "confirmed");
}

export async function discoverSolanaAssets(
  keypair: Keypair,
  connection = createSolanaConnection()
): Promise<SolanaDiscovered> {
  const address = keypair.publicKey.toBase58();
  const solLamports = BigInt(
    await connection.getBalance(keypair.publicKey, "confirmed")
  );

  const tokens: SolanaTokenBalance[] = [];
  for (const token of solanaTokens()) {
    try {
      const mint = new PublicKey(token.address);
      const ata = getAssociatedTokenAddressSync(mint, keypair.publicKey);
      const account = await getAccount(connection, ata, "confirmed");
      if (account.amount > 0n) {
        tokens.push({
          token,
          balance: account.amount,
          ata: ata.toBase58(),
        });
      }
    } catch {
      // no ATA / zero
    }
  }

  return { address, solLamports, tokens };
}

export async function moveSolanaAssets(params: {
  keypair: Keypair;
  destination: string;
  tokens: SolanaTokenBalance[];
  moveSol: boolean;
  retainLamports?: bigint;
  connection?: Connection;
}): Promise<{ signatures: string[] }> {
  const connection = params.connection ?? createSolanaConnection();
  const dest = new PublicKey(params.destination);
  if (dest.equals(params.keypair.publicKey)) {
    throw new Error("Destination cannot be the same Solana wallet.");
  }

  const signatures: string[] = [];

  for (const row of params.tokens) {
    const mint = new PublicKey(row.token.address);
    const fromAta = getAssociatedTokenAddressSync(mint, params.keypair.publicKey);
    const toAta = getAssociatedTokenAddressSync(mint, dest);

    const tx = new Transaction();
    try {
      await getAccount(connection, toAta, "confirmed");
    } catch {
      tx.add(
        createAssociatedTokenAccountInstruction(
          params.keypair.publicKey,
          toAta,
          dest,
          mint,
          TOKEN_PROGRAM_ID
        )
      );
    }
    tx.add(
      createTransferInstruction(
        fromAta,
        toAta,
        params.keypair.publicKey,
        row.balance
      )
    );
    const sig = await sendAndConfirmTransaction(connection, tx, [params.keypair], {
      commitment: "confirmed",
    });
    signatures.push(sig);
  }

  if (params.moveSol) {
    const balance = await connection.getBalance(params.keypair.publicKey);
    const retain = Number(params.retainLamports ?? 5_000_000n); // ~0.005 SOL fees buffer
    const transferable = balance - retain;
    if (transferable > 0) {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: params.keypair.publicKey,
          toPubkey: dest,
          lamports: transferable,
        })
      );
      const sig = await sendAndConfirmTransaction(
        connection,
        tx,
        [params.keypair],
        { commitment: "confirmed" }
      );
      signatures.push(sig);
    }
  }

  return { signatures };
}

export function formatSol(lamports: bigint): string {
  return (Number(lamports) / LAMPORTS_PER_SOL).toFixed(6);
}
