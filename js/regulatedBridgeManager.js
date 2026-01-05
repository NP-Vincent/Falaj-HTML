import {
  EXPLORER_BASE,
  FALAJ_NETWORK,
  REGULATED_BRIDGE_MANAGER_ABI_URL,
  REGULATED_BRIDGE_MANAGER_ADDRESS
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

const ethers = window.ethers;

if (!ethers) {
  throw new Error('Ethers library not loaded. Ensure the ethers script is included before regulatedBridgeManager.js.');
}

let bridgeManagerAbi = null;
let bridgeManager = null;

function normalizeAbi(abiData) {
  if (Array.isArray(abiData)) {
    return abiData;
  }
  if (abiData?.abi && Array.isArray(abiData.abi)) {
    return abiData.abi;
  }
  throw new Error('Invalid Regulated Bridge Manager ABI format.');
}

async function getBridgeManagerAbi() {
  if (bridgeManagerAbi) {
    return bridgeManagerAbi;
  }
  const embedded = document.getElementById('regulated-bridge-manager-abi');
  if (embedded?.textContent?.trim()) {
    bridgeManagerAbi = normalizeAbi(JSON.parse(embedded.textContent));
    return bridgeManagerAbi;
  }
  const response = await fetch(REGULATED_BRIDGE_MANAGER_ABI_URL);
  if (!response.ok) {
    throw new Error(`Failed to load Regulated Bridge Manager ABI (${response.status})`);
  }
  bridgeManagerAbi = normalizeAbi(await response.json());
  return bridgeManagerAbi;
}

function show(msg) {
  document.getElementById('msg').textContent = msg;
}

function setActionButtonsEnabled(enabled) {
  const actionButtons = [
    'pause-btn',
    'unpause-btn',
    'receive-warp-btn',
    'rescue-tokens-btn',
    'set-stablecoin-btn',
    'set-authorized-chain-btn',
    'set-bridge-reserve-btn',
    'set-minting-mode-btn',
    'set-payment-processor-btn',
    'summary-btn',
    'bridge-stats-btn',
    'can-receive-btn',
    'authorized-chain-btn',
    'payment-processor-btn',
    'message-processed-btn'
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
  return value.trim();
}

function parseAddress(value, label) {
  const address = requireValue(value, label);
  if (!ethers.isAddress(address)) {
    throw new Error(`${label} must be a valid address.`);
  }
  return address;
}

function parseBytes32(value, label) {
  const sanitized = requireValue(value, label);
  if (sanitized.startsWith('0x') && sanitized.length === 66) {
    return sanitized;
  }
  return ethers.id(sanitized);
}

function parseUint(value, label, allowZero = true) {
  const sanitized = requireValue(value, label);
  if (!/^\d+$/.test(sanitized)) {
    throw new Error(`${label} must be a whole number.`);
  }
  const parsed = BigInt(sanitized);
  if (!allowZero && parsed === 0n) {
    throw new Error(`${label} must be greater than 0.`);
  }
  return parsed;
}

function parseTokenAmount(value, label) {
  const sanitized = requireValue(value, label);
  const amount = ethers.parseUnits(sanitized, 18);
  if (amount <= 0n) {
    throw new Error(`${label} must be greater than 0.`);
  }
  return amount;
}

async function ensureBridgeManager() {
  if (bridgeManager) {
    return bridgeManager;
  }
  const signer = getSigner();
  if (!signer) {
    throw new Error('Wallet not connected.');
  }
  const abi = await getBridgeManagerAbi();
  bridgeManager = new ethers.Contract(REGULATED_BRIDGE_MANAGER_ADDRESS, abi, signer);
  return bridgeManager;
}

async function handleConnect() {
  await connectWallet();
  try {
    await ensureCorrectNetwork(FALAJ_NETWORK);
  } catch (err) {
    await switchNetwork(FALAJ_NETWORK);
  }
  await ensureBridgeManager();
  document.getElementById('connect-btn').style.display = 'none';
  document.getElementById('disconnect-btn').style.display = 'inline-block';
  setActionButtonsEnabled(true);
  show('Wallet connected.');
}

function handleDisconnect() {
  disconnectWallet();
  bridgeManager = null;
  document.getElementById('connect-btn').style.display = 'inline-block';
  document.getElementById('disconnect-btn').style.display = 'none';
  setActionButtonsEnabled(false);
  show('Wallet disconnected.');
}

function renderContractAddress() {
  const target = document.getElementById('contract-address');
  const explorerLink = `${EXPLORER_BASE}/address/${REGULATED_BRIDGE_MANAGER_ADDRESS}`;
  target.innerHTML = `Contract: <a href="${explorerLink}" target="_blank">${REGULATED_BRIDGE_MANAGER_ADDRESS}</a>`;
}

async function handlePause() {
  const contract = await ensureBridgeManager();
  const tx = await contract.pause();
  show(`Pause submitted: ${tx.hash}`);
  await tx.wait();
  show(`Pause confirmed: ${tx.hash}`);
}

async function handleUnpause() {
  const contract = await ensureBridgeManager();
  const tx = await contract.unpause();
  show(`Unpause submitted: ${tx.hash}`);
  await tx.wait();
  show(`Unpause confirmed: ${tx.hash}`);
}

async function handleReceiveWarp() {
  const contract = await ensureBridgeManager();
  const index = parseUint(document.getElementById('warp-index').value, 'Warp message index', false);
  const success = await contract.receiveWarpMessage(index);
  show(`Warp message processed: ${success}`);
}

async function handleRescueTokens() {
  const contract = await ensureBridgeManager();
  const token = parseAddress(document.getElementById('rescue-token').value, 'Token');
  const amount = parseTokenAmount(document.getElementById('rescue-amount').value, 'Token amount');
  const tx = await contract.rescueTokens(token, amount);
  show(`Rescue submitted: ${tx.hash}`);
  await tx.wait();
  show(`Rescue confirmed: ${tx.hash}`);
}

async function handleSetStablecoin() {
  const contract = await ensureBridgeManager();
  const stablecoin = parseAddress(document.getElementById('stablecoin-address').value, 'Stablecoin');
  const tx = await contract.setAEDStablecoin(stablecoin);
  show(`Stablecoin update submitted: ${tx.hash}`);
  await tx.wait();
  show(`Stablecoin update confirmed: ${tx.hash}`);
}

async function handleSetAuthorizedChain() {
  const contract = await ensureBridgeManager();
  const chainId = parseBytes32(document.getElementById('authorized-chain-id').value, 'Chain ID');
  const authorized = document.getElementById('authorized-chain-enabled').value === 'true';
  const tx = await contract.setAuthorizedSourceChain(chainId, authorized);
  show(`Authorized chain update submitted: ${tx.hash}`);
  await tx.wait();
  show(`Authorized chain update confirmed: ${tx.hash}`);
}

async function handleSetBridgeReserve() {
  const contract = await ensureBridgeManager();
  const reserve = parseAddress(document.getElementById('bridge-reserve-address').value, 'Bridge reserve');
  const tx = await contract.setBridgeReserve(reserve);
  show(`Bridge reserve update submitted: ${tx.hash}`);
  await tx.wait();
  show(`Bridge reserve update confirmed: ${tx.hash}`);
}

async function handleSetMintingMode() {
  const contract = await ensureBridgeManager();
  const useMinting = document.getElementById('minting-mode').value === 'true';
  const tx = await contract.setMintingMode(useMinting);
  show(`Minting mode update submitted: ${tx.hash}`);
  await tx.wait();
  show(`Minting mode update confirmed: ${tx.hash}`);
}

async function handleSetPaymentProcessor() {
  const contract = await ensureBridgeManager();
  const chainId = parseBytes32(document.getElementById('payment-chain-id').value, 'Chain ID');
  const processor = parseAddress(document.getElementById('payment-processor-address').value, 'Payment processor');
  const tx = await contract.setPaymentProcessor(chainId, processor);
  show(`Payment processor update submitted: ${tx.hash}`);
  await tx.wait();
  show(`Payment processor update confirmed: ${tx.hash}`);
}

async function handleSummary() {
  const contract = await ensureBridgeManager();
  const [
    stablecoin,
    bridgeReserve,
    useMinting,
    totalBridgedIn,
    totalTransactions,
    paused
  ] = await Promise.all([
    contract.aedStablecoin(),
    contract.bridgeReserve(),
    contract.useMinting(),
    contract.totalBridgedIn(),
    contract.totalBridgeTransactions(),
    contract.paused()
  ]);
  const output = [
    `AED stablecoin: ${stablecoin}`,
    `Bridge reserve: ${bridgeReserve}`,
    `Use minting: ${useMinting}`,
    `Total bridged in: ${ethers.formatEther(totalBridgedIn)} AED`,
    `Total bridge transactions: ${totalTransactions}`,
    `Paused: ${paused}`
  ];
  show(output.join('\n'));
}

async function handleBridgeStats() {
  const contract = await ensureBridgeManager();
  const stats = await contract.getBridgeStats();
  const output = [
    `Total bridged in: ${ethers.formatEther(stats._totalBridgedIn)} AED`,
    `Total transactions: ${stats._totalTransactions}`
  ];
  show(output.join('\n'));
}

async function handleCanReceive() {
  const contract = await ensureBridgeManager();
  const recipient = parseAddress(document.getElementById('can-receive-recipient').value, 'Recipient');
  const result = await contract.canReceive(recipient);
  show(`Allowed: ${result.allowed}\nReason: ${result.reason || 'N/A'}`);
}

async function handleAuthorizedChain() {
  const contract = await ensureBridgeManager();
  const chainId = parseBytes32(document.getElementById('authorized-chain-query-id').value, 'Chain ID');
  const authorized = await contract.isAuthorizedSourceChain(chainId);
  show(`Authorized: ${authorized}`);
}

async function handlePaymentProcessor() {
  const contract = await ensureBridgeManager();
  const chainId = parseBytes32(document.getElementById('payment-chain-query-id').value, 'Chain ID');
  const processor = await contract.getPaymentProcessor(chainId);
  show(`Payment processor: ${processor}`);
}

async function handleMessageProcessed() {
  const contract = await ensureBridgeManager();
  const messageId = parseBytes32(document.getElementById('message-id').value, 'Message ID');
  const processed = await contract.isMessageProcessed(messageId);
  show(`Message processed: ${processed}`);
}

function wireButton(id, handler) {
  const button = document.getElementById(id);
  if (!button) return;
  button.addEventListener('click', async () => {
    try {
      show('Working...');
      await handler();
    } catch (err) {
      show(`Error: ${err.message || err}`);
    }
  });
}

function boot() {
  renderContractAddress();
  document.getElementById('connect-btn').addEventListener('click', () => {
    handleConnect().catch((err) => show(`Error: ${err.message || err}`));
  });
  document.getElementById('disconnect-btn').addEventListener('click', handleDisconnect);

  wireButton('pause-btn', handlePause);
  wireButton('unpause-btn', handleUnpause);
  wireButton('receive-warp-btn', handleReceiveWarp);
  wireButton('rescue-tokens-btn', handleRescueTokens);
  wireButton('set-stablecoin-btn', handleSetStablecoin);
  wireButton('set-authorized-chain-btn', handleSetAuthorizedChain);
  wireButton('set-bridge-reserve-btn', handleSetBridgeReserve);
  wireButton('set-minting-mode-btn', handleSetMintingMode);
  wireButton('set-payment-processor-btn', handleSetPaymentProcessor);
  wireButton('summary-btn', handleSummary);
  wireButton('bridge-stats-btn', handleBridgeStats);
  wireButton('can-receive-btn', handleCanReceive);
  wireButton('authorized-chain-btn', handleAuthorizedChain);
  wireButton('payment-processor-btn', handlePaymentProcessor);
  wireButton('message-processed-btn', handleMessageProcessed);

  setActionButtonsEnabled(false);

  onAccountsChanged(() => {
    show('Account changed. Reconnect if needed.');
  });
  onChainChanged(() => {
    show('Network changed. Reconnect if needed.');
  });
}

boot();
