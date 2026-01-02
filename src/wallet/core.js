// core.js - shared wallet helpers for SQMU widgets
// This module relies on an injected EIP-1193 provider (Core or compatible).
import { DEFAULT_NETWORK_KEY, NETWORKS, WALLET_NAME } from '../../config.js'

const { ethers } = globalThis

const ACTIVE_NETWORK = NETWORKS[DEFAULT_NETWORK_KEY]
const ACTIVE_CHAIN_ID = ACTIVE_NETWORK?.chainId
const WALLET_LABEL = WALLET_NAME ?? 'wallet'

const ACTIVE_NETWORK_PARAMS = {
  chainId: ACTIVE_CHAIN_ID,
  chainName: ACTIVE_NETWORK?.name,
  nativeCurrency: ACTIVE_NETWORK?.currency,
  rpcUrls: ACTIVE_NETWORK?.rpcUrls,
  blockExplorerUrls: ACTIVE_NETWORK?.blockExplorerUrls
}

const resolveProvider = candidates => candidates.find(provider => provider?.request)

const getProvider = () =>
  resolveProvider([
    globalThis.core?.provider,
    globalThis.core?.ethereum,
    globalThis.avalanche?.provider,
    globalThis.avalanche,
    globalThis.ethereum
  ]) ?? null

const handleProviderUpdate = () => {
  window.location.reload()
}

const registerProviderListeners = ethereum => {
  ethereum.on?.('accountsChanged', handleProviderUpdate)
  ethereum.on?.('chainChanged', handleProviderUpdate)
}

const setStatus = (statusDiv, message, variant) => {
  if (!statusDiv) {
    return
  }

  if (variant) {
    statusDiv.innerHTML = `<span style="color:${variant};">${message}</span>`
  } else {
    statusDiv.innerText = message
  }
}

const handleWalletError = (statusDiv, err) => {
  if (err?.code === -32002) {
    setStatus(statusDiv, 'Request already pending. Check your wallet.', 'red')
    return
  }

  setStatus(statusDiv, err?.message ?? 'Wallet request failed.', 'red')
}

const getInjectedProviderConstructor = () =>
  ethers?.providers?.Web3Provider ?? ethers?.BrowserProvider

const getReadProviderConstructor = () =>
  ethers?.providers?.JsonRpcProvider ?? ethers?.JsonRpcProvider

const getRequiredProvider = () => {
  const ethereum = getProvider()
  if (!ethereum) {
    throw new Error(`${WALLET_LABEL} provider unavailable.`)
  }

  return ethereum
}

export async function addActiveNetwork(statusId) {
  const statusDiv = document.getElementById(statusId)
  const networkName = ACTIVE_NETWORK?.name ?? 'network'
  setStatus(statusDiv, `Adding ${networkName} to ${WALLET_LABEL}...`)

  try {
    const ethereum = getRequiredProvider()

    await ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [ACTIVE_NETWORK_PARAMS]
    })

    setStatus(statusDiv, `Added ${networkName}.`, 'green')
  } catch (err) {
    handleWalletError(statusDiv, err)
    throw err
  }
}

export async function connectWallet(statusId) {
  const statusDiv = document.getElementById(statusId)
  setStatus(statusDiv, `Connecting to ${WALLET_LABEL}...`)

  try {
    const ethereum = getRequiredProvider()

    const accounts = await ethereum.request({ method: 'eth_requestAccounts', params: [] })
    if (!accounts?.length) {
      throw new Error(`No accounts returned from ${WALLET_LABEL}.`)
    }

    registerProviderListeners(ethereum)

    let chainId = await ethereum.request({ method: 'eth_chainId', params: [] })
    if (ACTIVE_CHAIN_ID && chainId !== ACTIVE_CHAIN_ID) {
      try {
        await ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: ACTIVE_CHAIN_ID }]
        })
      } catch (switchErr) {
        if (switchErr.code === 4902) {
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [ACTIVE_NETWORK_PARAMS]
          })
          await ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: ACTIVE_CHAIN_ID }]
          })
        } else {
          throw switchErr
        }
      }
      chainId = await ethereum.request({ method: 'eth_chainId', params: [] })
    }

    const InjectedProvider = getInjectedProviderConstructor()
    if (!InjectedProvider) {
      throw new Error('Ethers provider unavailable. Check the CDN script tag.')
    }

    const provider = new InjectedProvider(ethereum)
    const signer = await provider.getSigner()

    setStatus(statusDiv, `Connected to ${ACTIVE_NETWORK?.name ?? 'network'}`, 'green')
    return { provider, signer }
  } catch (err) {
    handleWalletError(statusDiv, err)
    throw err
  }
}

export async function disconnectWallet(statusId) {
  const ethereum = getProvider()
  const statusDiv = document.getElementById(statusId)
  try {
    if (ethereum?.request) {
      await ethereum.request({
        method: 'wallet_revokePermissions',
        params: [{ eth_accounts: {} }]
      })
    }
  } catch (err) {
    console.warn('Wallet permission revoke failed:', err)
  } finally {
    setStatus(statusDiv, 'Disconnected', 'orange')
  }
}

export const createReadProvider = () => {
  const rpcUrl = ACTIVE_NETWORK?.rpcUrls?.[0]
  const ReadProvider = getReadProviderConstructor()
  if (!ReadProvider || !rpcUrl) {
    return null
  }

  return new ReadProvider(rpcUrl)
}
