const ethers = window.ethers;

if (!ethers) {
  throw new Error('Ethers library not loaded. Ensure the ethers script is included before wallet.js.');
}

let provider = null;
let signer = null;
let currentWallet = null;

function getInjectedProvider() {
  const injected = window.ethereum;
  if (!injected) {
    return null;
  }
  if (typeof injected.addListener !== 'function' && typeof injected.on === 'function') {
    injected.addListener = injected.on.bind(injected);
  }
  if (typeof injected.removeListener !== 'function' && typeof injected.off === 'function') {
    injected.removeListener = injected.off.bind(injected);
  }
  return injected;
}

export function getProvider() {
  return provider;
}

export function getSigner() {
  return signer;
}

export async function connectWallet(wallet = 'metamask') {
  const injectedProvider = getInjectedProvider();
  if (wallet === 'metamask' && injectedProvider) {
    provider = new ethers.BrowserProvider(injectedProvider);
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
  const injectedProvider = getInjectedProvider();
  if (!injectedProvider) {
    throw new Error('MetaMask not found');
  }
  const hex = ethers.toQuantity(network.chainId);
  try {
    await injectedProvider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hex }]
    });
  } catch (err) {
    if (err.code === 4902) {
      await injectedProvider.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId: hex, ...network }]
      });
      await injectedProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hex }]
      });
    } else {
      throw err;
    }
  }
  provider = new ethers.BrowserProvider(injectedProvider);
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
  const injectedProvider = getInjectedProvider();
  if (!injectedProvider?.on) {
    return () => {};
  }
  injectedProvider.on('accountsChanged', handler);
  return () => injectedProvider.removeListener?.('accountsChanged', handler);
}

export function onChainChanged(handler) {
  const injectedProvider = getInjectedProvider();
  if (!injectedProvider?.on) {
    return () => {};
  }
  injectedProvider.on('chainChanged', handler);
  return () => injectedProvider.removeListener?.('chainChanged', handler);
}
