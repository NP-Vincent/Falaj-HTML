# Agent Instructions

## Repository purpose

This repo contains lightweight HTML + JavaScript pages used to exercise deployed Falaj smart contracts. The focus is on clear, direct contract interactions for testing and verification.

## Working conventions

- Use vanilla HTML, CSS, and ES modules (no build step).
- Keep UI changes minimal and oriented around test actions.
- Contract addresses, network metadata, and ABI paths live in `js/config.js`.
- Place ABI JSON files under `contract/abi/` and reference them via `js/config.js`.
- Prefer small, readable functions over abstractions.

## Documentation

- Update `README.md` whenever a new interface or major capability is added.
- Provide clear instructions for running via a simple HTTP server.
- `notes/deployment_log.md` contains the latest contract addresses.
- `notes/Testnet_Details.md` contains details of the Falaj Testnet.

## Testing

- If you add functionality, include manual test notes in your PR summary.
