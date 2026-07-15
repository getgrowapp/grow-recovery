# Security policy — Grow Recovery

## Purpose

This is an emergency recovery tool. Users import a **private key** for their Grow Modular Account fallback signer and move explicitly configured assets on Base. There is no Grow backend, paymaster, analytics, or remote key handling.

## Trust boundaries

- **Trusted:** the code from the official Grow GitHub repository and the RPC/bundler endpoints *you* configure.
- **Untrusted:** any hosting mirror, shortened link, browser extension, or modified build that is not byte-for-byte (or commit-for-commit) equivalent to the official source.

## Private key rules

The recovery key must never be:

- sent to Grow or any server owned by this project
- placed in a URL, query string, analytics event, crash report, cookie, `localStorage`, `sessionStorage`, or other persisted state
- printed to the console

The key is held only in an in-memory `KeySession` and cleared on disconnect, flow reset, or component unmount. JavaScript string immutability means perfect memory wiping is not guaranteed by the language runtime; close the tab after use.

## Self-funded execution

UserOperations are submitted to your configured ERC-4337 bundler **without** a paymaster. The Modular Account’s ETH balance pays gas. Prefund / AA21-class errors are surfaced to the user.

## Threat model notes

- Phishing: always verify the URL and compare the deployed static site against the tagged source commit.
- Malicious RPC/bundler: a hostile endpoint can deanonymize addresses/balances and censor transactions; it cannot receive your private key from this app’s intended design, but you should still use reputable providers.
- Supply chain: pin and audit dependency updates; prefer reproducible builds from CI.

## Reporting

If you find a vulnerability in this recovery tool, contact Grow through the security contact published in the parent repository. Do not open a public issue that includes private keys or user funds details.

## Limitations

This tool only recovers assets and protocol positions explicitly listed in its open-source configuration. Unknown tokens, unsupported protocols, NFTs, borrowed positions, and arbitrary contracts are not automatically recovered.
