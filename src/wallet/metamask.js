// wallet.js - shared wallet helpers for SQMU widgets
// This module relies on ethers.js loaded via CDN.
import MetaMaskSDK from 'https://cdn.jsdelivr.net/npm/@metamask/sdk@0.21.2/dist/browser/es/metamask-sdk.js'
import { DEFAULT_NETWORK_KEY, NETWORKS } from '../../config.js'

const MMSDK = new MetaMaskSDK.MetaMaskSDK({
  dappMetadata: { name: 'SQMU Wallet', url: window.location.href },
  infuraAPIKey: '822e08935dea4fb48f668ff353ac863a'
})

const ACTIVE_NETWORK = NETWORKS[DEFAULT_NETWORK_KEY]
const ACTIVE_CHAIN_ID = ACTIVE_NETWORK?.chainId

const ACTIVE_NETWORK_PARAMS = {
  chainId: ACTIVE_CHAIN_ID,
  chainName: ACTIVE_NETWORK?.name,
  nativeCurrency: ACTIVE_NETWORK?.currency,
  rpcUrls: ACTIVE_NETWORK?.rpcUrls,
  blockExplorerUrls: ACTIVE_NETWORK?.blockExplorerUrls
}

const handleProviderUpdate = () => {
  window.location.reload()
}

const registerProviderListeners = ethereum => {
  ethereum.on?.('accountsChanged', handleProviderUpdate)
  ethereum.on?.('chainChanged', handleProviderUpdate)
}

export async function addActiveNetwork(statusId) {
  const statusDiv = document.getElementById(statusId)
  const networkName = ACTIVE_NETWORK?.name ?? 'network'
  statusDiv.innerText = `Adding ${networkName} to MetaMask...`

  try {
    const ethereum = MMSDK.getProvider()
    if (!ethereum) {
      throw new Error('MetaMask provider unavailable.')
    }

    await ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [ACTIVE_NETWORK_PARAMS]
    })

    statusDiv.innerHTML = `<span style="color:green;">Added ${networkName}.</span>`
  } catch (err) {
    if (!err.handled) {
      if (err.code === -32002) {
        statusDiv.innerHTML =
          '<span style="color:red;">Request already pending. Check MetaMask.</span>'
      } else {
        statusDiv.innerHTML = `<span style="color:red;">${err.message}</span>`
      }
    }
    throw err
  }
}

export async function connectWallet(statusId) {
  const statusDiv = document.getElementById(statusId)
  statusDiv.innerText = 'Connecting to MetaMask...'

  try {
    const accounts = await MMSDK.connect()
    if (!accounts?.length) {
      throw new Error('No accounts returned from MetaMask.')
    }
    const ethereum = MMSDK.getProvider()
    if (!ethereum) {
      throw new Error('MetaMask provider unavailable after connecting.')
    }
    registerProviderListeners(ethereum)
    // MMSDK.connect already exposes the account; no additional eth_accounts
    // request is made to prevent duplicate MetaMask popups
    let chainId = await ethereum.request({ method: 'eth_chainId', params: [] })
    if (chainId !== ACTIVE_CHAIN_ID) {
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
          const isWalletConnect =
            MMSDK.isWalletConnect || ethereum.isWalletConnect || ethereum.wc
          const unsupportedMethod =
            switchErr.code === 4200 || switchErr.code === -32601
          if (isWalletConnect && unsupportedMethod) {
            statusDiv.innerHTML =
              `<span style="color:red;">Please switch to the ${ACTIVE_NETWORK?.name ?? 'selected'} network manually in MetaMask Mobile.</span>`
            switchErr.handled = true
            throw switchErr
          }
          throw switchErr
        }
      }
      chainId = await ethereum.request({ method: 'eth_chainId', params: [] })
    }

    const provider = new ethers.BrowserProvider(ethereum)
    const signer = await provider.getSigner()

    statusDiv.innerHTML =
      `<span style="color:green;">Connected to ${ACTIVE_NETWORK?.name ?? 'network'}</span>`
    return { provider, signer }
  } catch (err) {
    if (!err.handled) {
      if (err.code === -32002) {
        statusDiv.innerHTML =
          '<span style="color:red;">Request already pending. Check MetaMask.</span>'
      } else {
        statusDiv.innerHTML = `<span style="color:red;">${err.message}</span>`
      }
    }
    throw err
  }
}

export async function disconnectWallet(statusId) {
  const ethereum = MMSDK.getProvider()
  const statusDiv = document.getElementById(statusId)
  try {
    await ethereum.request({
      method: 'wallet_revokePermissions',
      params: [{ eth_accounts: {} }]
    })
  } catch (err) {
    console.warn('MetaMask permission revoke failed:', err)
  } finally {
    // Terminate the MetaMask SDK connection so the dapp fully disconnects
    MMSDK.terminate()
    statusDiv.innerHTML = '<span style="color:orange;">Disconnected</span>'
  }
}
