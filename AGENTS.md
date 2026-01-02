# Agent Guidelines

- Keep the wallet connection logic in `src/wallet/` and UI helpers in `src/ui/`.
- ABI JSON files live in `src/abis/` and are used to generate UI forms.
- Prefer small, reusable functions over monolithic scripts.
- Run `npm run dev` to verify the UI locally when making UI changes.
