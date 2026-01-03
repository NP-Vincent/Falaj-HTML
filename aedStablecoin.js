// === CONFIGURATION ===
import {
  AED_STABLECOIN_ABI_URL,
  AED_STABLECOIN_ADDRESS,
  EXPLORER_BASE,
  FALAJ_NETWORK
} from './config.js';
import {
  connectWallet,
  disconnectWallet,
  ensureCorrectNetwork,
  getSigner,
  onAccountsChanged,
  onChainChanged,
  switchNetwork
} from './wallet.js';

const AED_STABLECOIN_ABI = await fetch(AED_STABLECOIN_ABI_URL).then((response) => {
  if (!response.ok) {
    throw new Error(`Failed to load AED Stablecoin ABI (${response.status})`);
  }
  return response.json();
});

// === STATE ===
let stablecoin = null;
let tokenDecimals = 18;
let tokenSymbol = 'AED';

// === UI UTILS ===
function show(msg) {
  document.getElementById('msg').textContent = msg;
}

function setActionButtonsEnabled(enabled) {
  const actionButtons = [
    'transfer-btn',
    'approve-btn',
    'mint-btn',
    'burn-btn',
    'pause-btn',
    'unpause-btn',
    'freeze-btn',
    'unfreeze-btn',
    'emergency-btn'
  ];
  actionButtons.forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !enabled;
  });
}

function requireValue(value, label) {
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function parseTokenAmount(value) {
  const sanitized = requireValue(value, 'Amount');
  const parsed = Number(sanitized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Amount must be a positive number.');
  }
  return ethers.parseUnits(String(parsed), tokenDecimals);
}

// === WALLET CONNECTION LOGIC ===
function syncStablecoinWithSigner() {
  const signer = getSigner();
  stablecoin = signer
    ? new ethers.Contract(AED_STABLECOIN_ADDRESS, AED_STABLECOIN_ABI, signer)
    : null;
}

function handleDisconnectUi() {
  stablecoin = null;
  setActionButtonsEnabled(false);
  document.getElementById('disconnect-btn').style.display = 'none';
  show('Wallet disconnected');
}

async function refreshTokenMetadata() {
  const signer = getSigner();
  if (!stablecoin || !signer) return;
  const [decimals, symbol] = await Promise.all([
    stablecoin.decimals(),
    stablecoin.symbol()
  ]);
  tokenDecimals = Number(decimals);
  tokenSymbol = symbol;
}

async function getWalletBalance() {
  const signer = getSigner();
  if (!stablecoin || !signer) return null;
  const address = await signer.getAddress();
  const balance = await stablecoin.balanceOf(address);
  return ethers.formatUnits(balance, tokenDecimals);
}

// === MAIN UI HANDLING ===
document.addEventListener('DOMContentLoaded', async () => {
  // Setup UI with params
  const params = new URLSearchParams(location.search);
  document.getElementById('prop-title').textContent = params.get('title') || '';
  document.getElementById('price-aed').textContent = params.get('aed') ? `AED ${params.get('aed')}` : '';
  document.getElementById('price-usd').textContent = params.get('usd') ? `USD ${params.get('usd')}` : '';

  setActionButtonsEnabled(false);

  // Connect Wallet
  document.getElementById('connect-btn').onclick = async () => {
    show('Connecting...');
    try {
      await connectWallet('metamask');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      syncStablecoinWithSigner();
      await refreshTokenMetadata();
      const balance = await getWalletBalance();
      document.getElementById('disconnect-btn').style.display = '';
      document.getElementById('disconnect-btn').onclick = () => {
        disconnectWallet();
        handleDisconnectUi();
      };
      show(`Wallet connected to ${FALAJ_NETWORK.chainName}\nToken: ${tokenSymbol}\nBalance: ${balance ?? '0'} ${tokenSymbol}`);
      setActionButtonsEnabled(true);
    } catch (err) {
      show('Connection or network switch failed:\n' + (err.message || err));
      disconnectWallet();
      handleDisconnectUi();
    }
  };

  document.getElementById('transfer-btn').onclick = async () => {
    try {
      show('Preparing transfer...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      syncStablecoinWithSigner();
      await refreshTokenMetadata();
      const to = requireValue(document.getElementById('transfer-to').value.trim(), 'Recipient address');
      const amount = parseTokenAmount(document.getElementById('transfer-amount').value.trim());
      const tx = await stablecoin.transfer(to, amount);
      const receipt = await tx.wait();
      show(`✅ Transfer complete\nTx hash: ${receipt.transactionHash}\nExplorer: ${EXPLORER_BASE}`);
    } catch (err) {
      show('Transfer failed:\n' + (err.message || err));
    }
  };

  document.getElementById('approve-btn').onclick = async () => {
    try {
      show('Preparing approval...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      syncStablecoinWithSigner();
      await refreshTokenMetadata();
      const spender = requireValue(document.getElementById('approve-spender').value.trim(), 'Spender address');
      const amount = parseTokenAmount(document.getElementById('approve-amount').value.trim());
      const tx = await stablecoin.approve(spender, amount);
      const receipt = await tx.wait();
      show(`✅ Approval complete\nTx hash: ${receipt.transactionHash}\nExplorer: ${EXPLORER_BASE}`);
    } catch (err) {
      show('Approval failed:\n' + (err.message || err));
    }
  };

  document.getElementById('mint-btn').onclick = async () => {
    try {
      show('Preparing mint...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      syncStablecoinWithSigner();
      await refreshTokenMetadata();
      const to = requireValue(document.getElementById('mint-to').value.trim(), 'Recipient address');
      const amount = parseTokenAmount(document.getElementById('mint-amount').value.trim());
      const tx = await stablecoin.mint(to, amount);
      const receipt = await tx.wait();
      show(`✅ Mint complete\nTx hash: ${receipt.transactionHash}\nExplorer: ${EXPLORER_BASE}`);
    } catch (err) {
      show('Mint failed:\n' + (err.message || err));
    }
  };

  document.getElementById('burn-btn').onclick = async () => {
    try {
      show('Preparing burn...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      syncStablecoinWithSigner();
      await refreshTokenMetadata();
      const from = requireValue(document.getElementById('burn-from').value.trim(), 'From address');
      const amount = parseTokenAmount(document.getElementById('burn-amount').value.trim());
      const tx = await stablecoin.burnFrom(from, amount);
      const receipt = await tx.wait();
      show(`✅ Burn complete\nTx hash: ${receipt.transactionHash}\nExplorer: ${EXPLORER_BASE}`);
    } catch (err) {
      show('Burn failed:\n' + (err.message || err));
    }
  };

  document.getElementById('pause-btn').onclick = async () => {
    try {
      show('Pausing token...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      syncStablecoinWithSigner();
      const tx = await stablecoin.pause();
      const receipt = await tx.wait();
      show(`✅ Token paused\nTx hash: ${receipt.transactionHash}\nExplorer: ${EXPLORER_BASE}`);
    } catch (err) {
      show('Pause failed:\n' + (err.message || err));
    }
  };

  document.getElementById('unpause-btn').onclick = async () => {
    try {
      show('Unpausing token...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      syncStablecoinWithSigner();
      const tx = await stablecoin.unpause();
      const receipt = await tx.wait();
      show(`✅ Token unpaused\nTx hash: ${receipt.transactionHash}\nExplorer: ${EXPLORER_BASE}`);
    } catch (err) {
      show('Unpause failed:\n' + (err.message || err));
    }
  };

  document.getElementById('freeze-btn').onclick = async () => {
    try {
      show('Freezing account...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      syncStablecoinWithSigner();
      const account = requireValue(document.getElementById('freeze-account').value.trim(), 'Account address');
      const tx = await stablecoin.freezeAccount(account);
      const receipt = await tx.wait();
      show(`✅ Account frozen\nTx hash: ${receipt.transactionHash}\nExplorer: ${EXPLORER_BASE}`);
    } catch (err) {
      show('Freeze failed:\n' + (err.message || err));
    }
  };

  document.getElementById('unfreeze-btn').onclick = async () => {
    try {
      show('Unfreezing account...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      syncStablecoinWithSigner();
      const account = requireValue(document.getElementById('freeze-account').value.trim(), 'Account address');
      const tx = await stablecoin.unfreezeAccount(account);
      const receipt = await tx.wait();
      show(`✅ Account unfrozen\nTx hash: ${receipt.transactionHash}\nExplorer: ${EXPLORER_BASE}`);
    } catch (err) {
      show('Unfreeze failed:\n' + (err.message || err));
    }
  };

  document.getElementById('emergency-btn').onclick = async () => {
    try {
      show('Preparing emergency transfer...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      syncStablecoinWithSigner();
      await refreshTokenMetadata();
      const from = requireValue(document.getElementById('emergency-from').value.trim(), 'From address');
      const to = requireValue(document.getElementById('emergency-to').value.trim(), 'To address');
      const amount = parseTokenAmount(document.getElementById('emergency-amount').value.trim());
      const tx = await stablecoin.emergencyTransfer(from, to, amount);
      const receipt = await tx.wait();
      show(`✅ Emergency transfer complete\nTx hash: ${receipt.transactionHash}\nExplorer: ${EXPLORER_BASE}`);
    } catch (err) {
      show('Emergency transfer failed:\n' + (err.message || err));
    }
  };

  // Disconnect
  document.getElementById('disconnect-btn').onclick = () => {
    disconnectWallet();
    handleDisconnectUi();
  };

  onAccountsChanged((accounts) => {
    if (!accounts || accounts.length === 0) {
      disconnectWallet();
      handleDisconnectUi();
    }
  });

  onChainChanged(() => {
    disconnectWallet();
    handleDisconnectUi();
    show('Network changed. Please reconnect your wallet.');
  });
});
