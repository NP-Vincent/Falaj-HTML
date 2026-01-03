import { BLOCK_EXPLORER_URL, CHAIN_ID_HEX, RPC_URL } from "./config.js";

const ethers = window.ethers;

const MMSDK = new MetaMaskSDK.MetaMaskSDK({
  dappMetadata: {
    name: "Falaj",
  },
});

const FALAJ_CHAIN_CONFIG = {
  chainId: CHAIN_ID_HEX,
  chainName: "Falaj Testnet",
  nativeCurrency: {
    name: "E-AED",
    symbol: "E-AED",
    decimals: 18,
  },
  rpcUrls: [RPC_URL],
  blockExplorerUrls: [BLOCK_EXPLORER_URL],
};

export async function connectWallet() {
  await MMSDK.connect();
  const mmProvider = MMSDK.getProvider();
  const accounts = await mmProvider.request({ method: "eth_requestAccounts" });
  return { mmProvider, accounts };
}

export async function ensureChain(mmProvider) {
  const currentChainId = await mmProvider.request({ method: "eth_chainId" });
  if (currentChainId === CHAIN_ID_HEX) {
    return;
  }

  try {
    await mmProvider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  } catch (error) {
    if (error?.code !== 4902) {
      throw error;
    }

    await mmProvider.request({
      method: "wallet_addEthereumChain",
      params: [FALAJ_CHAIN_CONFIG],
    });
  }
}

export async function getEthersSigner(mmProvider) {
  const provider = new ethers.BrowserProvider(mmProvider);
  return provider.getSigner();
}

export async function getAccount(mmProvider) {
  return mmProvider.request({ method: "eth_accounts" });
}

export function subscribeProviderEvents(mmProvider, handlers) {
  if (handlers?.accountsChanged) {
    mmProvider.on("accountsChanged", handlers.accountsChanged);
  }

  if (handlers?.chainChanged) {
    mmProvider.on("chainChanged", handlers.chainChanged);
  }
}
