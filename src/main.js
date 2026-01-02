import { ethers } from 'ethers'
import AEDStablecoin from './abis/AEDStablecoin.json'
import BondToken from './abis/BondToken.json'
import DvPSettlement from './abis/DvPSettlement.json'
import IdentityRegistry from './abis/IdentityRegistry.json'
import { createContractRenderer } from './ui/contracts'
import { appKit } from './wallet/appKit'
import { initializeSubscribers } from './wallet/subscribers'
import { setJson, setText } from './ui/dom'
import './styles/app.css'

const contractConfigs = [
  AEDStablecoin,
  BondToken,
  DvPSettlement,
  IdentityRegistry
].map(contract => ({
  id: contract.name,
  name: contract.name,
  address: contract.address,
  abi: contract.abi
}))

const contractsRoot = document.getElementById('contracts')
const connectionStatus = document.getElementById('connection-status')

let browserProvider = null
let signer = null

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
renderContracts()

const openModalButton = document.getElementById('open-connect-modal')
const disconnectButton = document.getElementById('disconnect')

openModalButton?.addEventListener('click', () => appKit.open())

disconnectButton?.addEventListener('click', () => {
  appKit.disconnect()
})
