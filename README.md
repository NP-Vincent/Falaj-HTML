# Falaj Contract Console

A lightweight HTML + JavaScript console for interacting with the Falaj Solidity contracts. The UI uses the **MetaMask SDK** for wallet connection and **ethers.js** for contract calls.

## Features

- Connect with the MetaMask SDK (EIP-155 provider).
- Auto-generated forms for every function in each ABI.
- Supports read (view/pure) and write (transaction) calls.
- Contract addresses prefilled from the ABI metadata (editable).

## Project Structure

```
src/
  abis/               # ABI JSON files with contract metadata
  contracts/          # Solidity source files
  styles/             # App styles
  ui/                 # DOM helper utilities
  main.js             # App entry point
src/wallet/metamask.js # MetaMask SDK connection helpers
index.html
```

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the dev server:

   ```bash
   npm run dev
   ```

Open `http://localhost:3011` to view the interface.

## Usage Notes

- Contract forms are generated from the ABI JSON files in `src/abis/`.
- Use comma-separated values for array inputs.
- For payable functions, provide an ETH value (in ether units).

## MetaMask SDK Setup

The MetaMask SDK is loaded via CDN in `index.html` and the per-dapp configuration lives in
`src/wallet/metamask.js`. Update the SDK configuration to match your environment:

- `dappMetadata`: Adjust the name and URL shown in MetaMask.
- `infuraAPIKey`: Replace with your Infura project key if you want to use your own API key.
- `SCROLL_PARAMS`: Update the chain settings if you want to target a different network.

## Static Hosting Workflow

1. Build the production bundle:

   ```bash
   npm run build
   ```

2. Upload the generated `dist/` directory to your static host (GitHub Pages, Netlify, S3, etc.).
3. Ensure the host serves `index.html` at the root so the contract console loads properly.
