# Tauri + SvelteKit + TypeScript

This template should help get you started developing with Tauri, SvelteKit and TypeScript in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).

## Building against your Ledger

The app reads its Ledger's address and public key at build time, so neither is committed:

```sh
export VOUCHER_LEDGER_URL=http://<ledger-tailscale-address>:8787
export VOUCHER_LEDGER_PUBLIC_KEY=$(cat <ledger-data-dir>/public.key)
npx tauri android build --debug --apk --target x86_64
```
