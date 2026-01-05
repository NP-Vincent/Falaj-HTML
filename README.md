# Falaj HTML Contract Interfaces

This repository hosts lightweight HTML + JavaScript interfaces for interacting with deployed Falaj smart contracts. The goal is to make it easy to test contract functionality and implementation robustness without a heavy front-end framework or build step.

## What's here

- `IdentityRegistry.html` – a standalone interface for the `IdentityRegistry` contract.
- `js/` – shared JavaScript modules for wallet connection, contract wiring, and UI logic.
- `contract/abi/` – ABI JSON files consumed by the interfaces.

## Getting started

These pages use ES modules, so they must be served over HTTP (not opened directly from the filesystem).

```bash
# From the repository root
python3 -m http.server 8000
```

Then open:

- `http://localhost:8000/IdentityRegistry.html`

## IdentityRegistry interface

The Identity Registry UI provides:

- Wallet connect/disconnect
- Role reference table (labels ↔ bytes32 hashes)
- Write actions: add/change/remove/freeze participants, renew KYC, pause, precompile sync
- Access control: grant/revoke/renounce roles
- Read actions: role admin, has role, current role, allowed to transact, participant state, etc.

### Configuration

Contract and network configuration lives in `js/config.js`:

- `FALAJ_NETWORK` – network metadata for wallet connection
- `IDENTITY_REGISTRY_ADDRESS` – deployed contract address
- `IDENTITY_REGISTRY_ABI_URL` – ABI location under `contract/abi/`

Update these values to point at the correct deployment before testing.

## Adding a new contract interface

1. Create a new HTML file modeled after `IdentityRegistry.html`.
2. Add a new JS module under `js/` for contract-specific logic.
3. Drop the ABI into `contract/abi/` and reference it from `js/config.js`.
4. Keep the UI simple, predictable, and focused on testing contract behavior.

## Notes

- These pages are intentionally minimal to make it easier to reason about contract behavior.
- No build step or framework is required; vanilla HTML/JS only.
