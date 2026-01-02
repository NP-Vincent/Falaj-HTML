import { createAppKit } from '@reown/appkit'
import { mainnet, sepolia } from '@reown/appkit/networks'

const projectId =
  import.meta.env.VITE_PROJECT_ID ||
  'b56e18d47c72ab683b10814fe9495694'

if (!projectId) {
  throw new Error('VITE_PROJECT_ID is not set')
}

export const appKit = createAppKit({
  adapters: [],
  networks: [sepolia, mainnet],
  projectId,
  themeMode: 'light',
  features: {
    analytics: true,
    socials: [],
    email: false
  },
  themeVariables: {
    '--w3m-accent': '#2b2f3a'
  }
})
