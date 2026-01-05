# Falaj HTML Contract Interfaces

This repository hosts lightweight HTML + JavaScript interfaces for interacting with deployed Falaj smart contracts. The goal is to make it easy to test contract functionality and implementation robustness without a heavy front-end framework or build step.

## What's here

- `index.html` – a landing page that links to the contract interfaces.
- `IdentityRegistry.html` – a standalone interface for the `IdentityRegistry` contract.
- `AEDStablecoin.html` – a standalone interface for the `AEDStablecoin` contract.
- `BondToken.html` – a standalone interface for the `BondToken` contract.
- `DvPSettlement.html` – a standalone interface for the `DvPSettlement` contract.
- `FeeDistribution.html` – a standalone interface for the `FeeDistribution` contract.
- `PaymentProcessor.html` – a standalone interface for the `PaymentProcessor` contract.
- `RegulatedBridgeManager.html` – a standalone interface for the `RegulatedBridgeManager` contract.
- `ValidatorStakingManager.html` – a standalone interface for the `ValidatorStakingManager` contract.
- `js/` – shared JavaScript modules for wallet connection, contract wiring, and UI logic.
- `contract/abi/` – ABI JSON files consumed by the interfaces.

## Getting started

These pages use ES modules, so they must be served over HTTP (not opened directly from the filesystem).

```bash
# From the repository root
python3 -m http.server 8000
```

Then open:

- `http://localhost:8000/`
- `http://localhost:8000/IdentityRegistry.html`
- `http://localhost:8000/AEDStablecoin.html`
- `http://localhost:8000/BondToken.html`
- `http://localhost:8000/DvPSettlement.html`
- `http://localhost:8000/FeeDistribution.html`
- `http://localhost:8000/PaymentProcessor.html`
- `http://localhost:8000/RegulatedBridgeManager.html`
- `http://localhost:8000/ValidatorStakingManager.html`

## Logs panel

Each interface page includes a right-hand log panel with separate event and error streams. Use the Copy and Clear buttons to export or reset each log while testing contract flows.

## IdentityRegistry interface

The Identity Registry UI provides:

- Wallet connect/disconnect
- Write actions: add/change/remove/freeze participants, renew KYC, pause, precompile sync
- Access control: grant/revoke/renounce roles
- Read actions: participant lookups, role checks, allowed-to-transact checks, and registry summary data.

### Configuration

Contract and network configuration lives in `js/config.js`:

- `FALAJ_NETWORK` – network metadata for wallet connection
- `IDENTITY_REGISTRY_ADDRESS` – deployed contract address
- `IDENTITY_REGISTRY_ABI_URL` – ABI location under `contract/abi/`

Update these values to point at the correct deployment before testing.

## AEDStablecoin interface

The AED Stablecoin UI provides:

- Wallet connect/disconnect
- Token summary (supply, minted/burned, paused)
- Write actions: transfer, approve, mint, burn, pause, freeze, emergency transfer
- Read actions: balance, allowance, frozen status, transfer eligibility

### Configuration

Contract and network configuration lives in `js/config.js`:

- `AED_STABLECOIN_ADDRESS` – deployed contract address
- `AED_STABLECOIN_ABI_URL` – ABI location under `contract/abi/`

## BondToken interface

The Bond Token UI provides:

- Wallet connect/disconnect
- Bond summary (lifecycle state, issuer, ISIN, coupon, supply)
- Write actions: transfer, approve, activate, mark matured/redeemed, freeze/unfreeze, pause
- Read actions: balance, allowance, eligibility checks, transfer eligibility, time to maturity

### Configuration

Contract and network configuration lives in `js/config.js`:

- `BOND_TOKEN_ADDRESS` – deployed contract address
- `BOND_TOKEN_ABI_URL` – ABI location under `contract/abi/`

## DvPSettlement interface

The DvP Settlement UI provides:

- Wallet connect/disconnect
- Settlement creation, deposits, execution, cancellation, and timeout updates
- Read actions for settlement summaries, per-settlement details, and participant history

### Configuration

Contract and network configuration lives in `js/config.js`:

- `DVP_SETTLEMENT_ADDRESS` – deployed contract address
- `DVP_SETTLEMENT_ABI_URL` – ABI location under `contract/abi/`

## FeeDistribution interface

The Fee Distribution UI provides:

- Wallet connect/disconnect
- Collect, distribute, and withdraw fees
- Service provider and validator manager configuration
- Access control and distribution stats

### Configuration

Contract and network configuration lives in `js/config.js`:

- `FEE_DISTRIBUTION_ADDRESS` – deployed contract address
- `FEE_DISTRIBUTION_ABI_URL` – ABI location under `contract/abi/`

## PaymentProcessor interface

The Payment Processor UI provides:

- Wallet connect/disconnect
- Native/stablecoin deposits with payment references
- Protocol fee, exchange rate, and destination chain configuration
- Access control and fee withdrawals

### Configuration

Contract and network configuration lives in `js/config.js`:

- `PAYMENT_PROCESSOR_ADDRESS` – deployed contract address
- `PAYMENT_PROCESSOR_ABI_URL` – ABI location under `contract/abi/`

## RegulatedBridgeManager interface

The Regulated Bridge Manager UI provides:

- Wallet connect/disconnect
- Pause controls, warp message handling, and rescue actions
- Chain authorization and payment processor configuration
- Bridge stats and receive eligibility checks

### Configuration

Contract and network configuration lives in `js/config.js`:

- `REGULATED_BRIDGE_MANAGER_ADDRESS` – deployed contract address
- `REGULATED_BRIDGE_MANAGER_ABI_URL` – ABI location under `contract/abi/`

## ValidatorStakingManager interface

The Validator Staking Manager UI provides:

- Wallet connect/disconnect
- Stake/unstake, validator registration, slashing, and reward distribution
- Role management, fee distribution, grace period, and stake ratio updates
- Validator/issuer readouts and pagination helpers

### Configuration

Contract and network configuration lives in `js/config.js`:

- `VALIDATOR_STAKING_MANAGER_ADDRESS` – deployed contract address
- `VALIDATOR_STAKING_MANAGER_ABI_URL` – ABI location under `contract/abi/`

## Adding a new contract interface

1. Create a new HTML file modeled after `IdentityRegistry.html`.
2. Add a new JS module under `js/` for contract-specific logic.
3. Drop the ABI into `contract/abi/` and reference it from `js/config.js`.
4. Keep the UI simple, predictable, and focused on testing contract behavior.

## Notes

- These pages are intentionally minimal to make it easier to reason about contract behavior.
- No build step or framework is required; vanilla HTML/JS only.
- `notes/deployment_log.md` contains the latest contract addresses.
- `notes/Testnet_Details.md` contains details of the Falaj Testnet.
