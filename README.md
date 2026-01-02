# Falaj Contract Console

A lightweight HTML + JavaScript console for interacting with the Falaj Solidity contracts. The UI uses **Reown AppKit Core** for wallet connection and **ethers.js** for contract calls.

## Features

- Connect with AppKit Core (EIP-155 provider).
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
  wallet/             # AppKit initialization + subscriber logic
  main.js             # App entry point
index.html
```

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. (Optional) Provide your AppKit project ID:

   ```bash
   export VITE_PROJECT_ID=your_project_id
   ```

3. Start the dev server:

   ```bash
   npm run dev
   ```

Open `http://localhost:3011` to view the interface.

## Usage Notes

- Contract forms are generated from the ABI JSON files in `src/abis/`.
- Use comma-separated values for array inputs.
- For payable functions, provide an ETH value (in ether units).
