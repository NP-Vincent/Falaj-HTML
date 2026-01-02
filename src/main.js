import {
  addActiveNetwork,
  connectWallet,
  createReadProvider,
  disconnectWallet
} from './wallet/core.js'
import {
  CONTRACT_ADDRESSES,
  DEFAULT_NETWORK_KEY,
  NETWORKS,
  WALLET_NAME
} from '../config.js'
import { createContractRenderer } from './ui/contracts.js'
import { setJson } from './ui/dom.js'
import { initializeErrorConsole } from './ui/errorConsole.js'

const { ethers } = globalThis

if (!ethers) {
  throw new Error('Ethers library failed to load. Check the CDN script tag.')
}

const contractConfigSources = [
  { id: 'AEDStablecoin', path: 'src/abis/AEDStablecoin.json' },
  { id: 'BondToken', path: 'src/abis/BondToken.json' },
  { id: 'DvPSettlement', path: 'src/abis/DvPSettlement.json' },
  { id: 'IdentityRegistry', path: 'src/abis/IdentityRegistry.json' }
]

const loadContractConfigs = async () => {
  const contracts = await Promise.all(
    contractConfigSources.map(async source => {
      const response = await fetch(source.path)

      if (!response.ok) {
        throw new Error(`Failed to load ${source.path}`)
      }

      return response.json()
    })
  )

  return contracts.map((contract, index) => {
    const fallbackName = contractConfigSources[index]?.id ?? contract.name
    const name = contract.name ?? fallbackName

    return {
      id: name,
      name,
      address: CONTRACT_ADDRESSES[name] ?? contract.address,
      abi: contract.abi
    }
  })
}

const contractsRoot = document.getElementById('contracts')
const connectionStatus = document.getElementById('connection-status')

let browserProvider = null
let signer = null
let contractConfigs = []
const readProvider = createReadProvider()

initializeErrorConsole()

const buildContract = (address, abi) => {
  const runner = signer ?? browserProvider ?? readProvider
  if (!runner) {
    throw new Error('No provider available. Check the RPC configuration.')
  }

  return new ethers.Contract(address, abi, runner)
}

const contractRenderer = createContractRenderer({
  buildContract,
  parseEther: ethers.parseEther
})

const getContractsForPage = () => {
  const pageContractName = document.body?.dataset?.contract
  if (!pageContractName) {
    return contractConfigs
  }

  return contractConfigs.filter(contract => contract.name === pageContractName)
}

const renderContracts = () => {
  contractRenderer.renderContracts(contractsRoot, getContractsForPage(), {
    emptyMessage: 'No matching contract configuration found.'
  })
}

const connectButton = document.getElementById('connect-wallet')
const disconnectButton = document.getElementById('disconnect-wallet')
const addNetworkButton = document.getElementById('add-network')
const walletIntro = document.getElementById('walletIntro')

const ACTIVE_NETWORK = NETWORKS[DEFAULT_NETWORK_KEY]
const NETWORK_NAME = ACTIVE_NETWORK?.name ?? 'network'
const WALLET_LABEL = WALLET_NAME ?? 'wallet'

if (walletIntro) {
  walletIntro.textContent = `Connect with ${WALLET_LABEL} on ${NETWORK_NAME} to interact with the deployed Solidity contracts.`
}
if (connectButton) {
  connectButton.textContent = `Connect ${WALLET_LABEL}`
}

const renderWalletDetails = async () => {
  if (!browserProvider || !signer) {
    setJson('account-state', null)
    setJson('network-state', null)
    return
  }

  const [address, network] = await Promise.all([
    signer.getAddress(),
    browserProvider.getNetwork()
  ])

  setJson('account-state', { address })
  setJson('network-state', {
    chainId: network.chainId?.toString?.() ?? String(network.chainId),
    name: network.name
  })
}

connectButton?.addEventListener('click', async () => {
  try {
    const wallet = await connectWallet(connectionStatus.id)
    browserProvider = wallet.provider
    signer = wallet.signer
    await renderWalletDetails()
  } catch (error) {
    console.error(error)
  }
})

disconnectButton?.addEventListener('click', async () => {
  try {
    await disconnectWallet(connectionStatus.id)
  } finally {
    browserProvider = null
    signer = null
    await renderWalletDetails()
  }
})

addNetworkButton?.addEventListener('click', async () => {
  try {
    await addActiveNetwork(connectionStatus.id)
  } catch (error) {
    console.error(error)
  }
})

const initializeContracts = async () => {
  try {
    contractConfigs = await loadContractConfigs()
  } catch (error) {
    console.error(error)
    contractConfigs = []
  }

  renderContracts()
}

initializeContracts()
