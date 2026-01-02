import { createContractRenderer } from './ui/contracts'
import { appKit } from './wallet/appKit'
import { initializeSubscribers } from './wallet/subscribers'
import { setJson, setText } from './ui/dom'

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
      address: contract.address,
      abi: contract.abi
    }
  })
}

const contractsRoot = document.getElementById('contracts')
const connectionStatus = document.getElementById('connection-status')

let browserProvider = null
let signer = null
let contractConfigs = []

const buildContract = (address, abi) => {
  if (!browserProvider) {
    throw new Error('Connect a wallet to initialize the provider.')
  }

  return new ethers.Contract(address, abi, signer ?? browserProvider)
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

const updateConnectionStatus = isConnected => {
  connectionStatus.textContent = isConnected
    ? 'Connected'
    : 'Not connected'
}

initializeSubscribers(appKit, {
  onProviders: async providers => {
    const eip155 = providers?.eip155

    if (eip155) {
      browserProvider = new ethers.BrowserProvider(eip155)
      signer = await browserProvider.getSigner()
    } else {
      browserProvider = null
      signer = null
    }
  },
  onAccount: account => {
    setJson('account-state', account)
  },
  onNetwork: network => {
    setJson('network-state', network)
  },
  onState: state => {
    updateConnectionStatus(appKit.getIsConnectedState())
    setText('modal-state', state?.open ? 'Open' : 'Closed')
  }
})

updateConnectionStatus(appKit.getIsConnectedState())

const openModalButton = document.getElementById('open-connect-modal')
const disconnectButton = document.getElementById('disconnect')

openModalButton?.addEventListener('click', () => appKit.open())

disconnectButton?.addEventListener('click', () => {
  appKit.disconnect()
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
