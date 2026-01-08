const ethers = window.ethers;

if (!ethers) {
  throw new Error('Ethers library not loaded. Ensure the ethers script is included before wallet.js.');
}

let provider = null;
let signer = null;
let currentWallet = null;

export function getProvider() {
  return provider;
}

export function getSigner() {
  return signer;
}

export async function connectWallet(wallet = 'metamask') {
  if (wallet === 'metamask' && window.ethereum) {
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send('eth_requestAccounts', []);
    signer = await provider.getSigner();
    currentWallet = wallet;
    return { provider, signer, wallet: currentWallet };
  }
  throw new Error('MetaMask not found');
}

export function disconnectWallet() {
  provider = null;
  signer = null;
  currentWallet = null;
}

export async function switchNetwork(network) {
  if (!window.ethereum) {
    throw new Error('MetaMask not found');
  }
  const hex = ethers.toQuantity(network.chainId);
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hex }]
    });
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId: hex, ...network }]
      });
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hex }]
      });
    } else {
      throw err;
    }
  }
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  return { provider, signer };
}

export async function ensureCorrectNetwork(network) {
  if (!provider) throw new Error('No wallet/provider connected');
  const currentNetwork = await provider.getNetwork();
  if (Number(currentNetwork.chainId) !== Number(network.chainId)) {
    throw new Error(
      `Your wallet is on the wrong network. Please switch to ${network.chainName} (${network.chainId}).`
    );
  }
}

export function onAccountsChanged(handler) {
  if (!window.ethereum?.on) {
    return () => {};
  }
  window.ethereum.on('accountsChanged', handler);
  return () => window.ethereum.removeListener?.('accountsChanged', handler);
}

export function onChainChanged(handler) {
  if (!window.ethereum?.on) {
    return () => {};
  }
  window.ethereum.on('chainChanged', handler);
  return () => window.ethereum.removeListener?.('chainChanged', handler);
}
