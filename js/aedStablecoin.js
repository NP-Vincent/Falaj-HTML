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
import { initLogs, logEvent, logError } from './logs.js';
import { fetchRoleValues } from './roles.js';
import { parseDecimalAmount } from './amounts.js';

const ethers = window.ethers;

if (!ethers) {
  throw new Error('Ethers library not loaded. Ensure the ethers script is included before aedStablecoin.js.');
}

let stablecoinAbi = null;
let stablecoin = null;
let tokenDecimals = 2;

function normalizeAbi(abiData) {
  if (Array.isArray(abiData)) {
    return abiData;
  }
  if (abiData?.abi && Array.isArray(abiData.abi)) {
    return abiData.abi;
  }
  throw new Error('Invalid AED Stablecoin ABI format.');
}

async function getStablecoinAbi() {
  if (stablecoinAbi) {
    return stablecoinAbi;
  }
  const embedded = document.getElementById('aed-stablecoin-abi');
  if (embedded?.textContent?.trim()) {
    stablecoinAbi = normalizeAbi(JSON.parse(embedded.textContent));
    return stablecoinAbi;
  }
  const response = await fetch(AED_STABLECOIN_ABI_URL);
  if (!response.ok) {
    throw new Error(`Failed to load AED Stablecoin ABI (${response.status})`);
  }
  stablecoinAbi = normalizeAbi(await response.json());
  return stablecoinAbi;
}

function show(msg) {
  document.getElementById('msg').textContent = msg;
  logEvent(msg);
}

function showError(msg) {
  document.getElementById('msg').textContent = msg;
  logError(msg);
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
    'emergency-btn',
    'summary-btn',
    'roles-btn',
    'balance-btn',
    'allowance-btn',
    'frozen-btn',
    'can-transfer-btn'
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

function parseTokenAmount(value) {
  return parseDecimalAmount(value, tokenDecimals, 'Amount');
}

function formatTokenAmount(amount) {
  return ethers.formatUnits(amount, tokenDecimals);
}

async function ensureStablecoin() {
  if (stablecoin) {
    return stablecoin;
  }
  const signer = getSigner();
  if (!signer) {
    throw new Error('Wallet not connected.');
  }
  const abi = await getStablecoinAbi();
  stablecoin = new ethers.Contract(AED_STABLECOIN_ADDRESS, abi, signer);
  tokenDecimals = Number(await stablecoin.decimals());
  return stablecoin;
}

async function handleConnect() {
  await connectWallet();
  try {
    await ensureCorrectNetwork(FALAJ_NETWORK);
  } catch (err) {
    await switchNetwork(FALAJ_NETWORK);
  }
  await ensureStablecoin();
  document.getElementById('connect-btn').style.display = 'none';
  document.getElementById('disconnect-btn').style.display = 'inline-block';
  setActionButtonsEnabled(true);
  show('Wallet connected.');
}

function handleDisconnect() {
  disconnectWallet();
  stablecoin = null;
  document.getElementById('connect-btn').style.display = 'inline-block';
  document.getElementById('disconnect-btn').style.display = 'none';
  setActionButtonsEnabled(false);
  show('Wallet disconnected.');
}

function renderContractAddress() {
  const target = document.getElementById('contract-address');
  const explorerLink = `${EXPLORER_BASE}/address/${AED_STABLECOIN_ADDRESS}`;
  target.innerHTML = `Contract: <a href="${explorerLink}" target="_blank">${AED_STABLECOIN_ADDRESS}</a>`;
}

async function handleTransfer() {
  const contract = await ensureStablecoin();
  const to = parseAddress(document.getElementById('transfer-to').value, 'Recipient');
  const amount = parseTokenAmount(document.getElementById('transfer-amount').value);
  const tx = await contract.transfer(to, amount);
  show(`Transfer submitted: ${tx.hash}`);
  await tx.wait();
  show(`Transfer confirmed: ${tx.hash}`);
}

async function handleApprove() {
  const contract = await ensureStablecoin();
  const spender = parseAddress(document.getElementById('approve-spender').value, 'Spender');
  const amount = parseTokenAmount(document.getElementById('approve-amount').value);
  const tx = await contract.approve(spender, amount);
  show(`Approve submitted: ${tx.hash}`);
  await tx.wait();
  show(`Approve confirmed: ${tx.hash}`);
}

async function handleMint() {
  const contract = await ensureStablecoin();
  const to = parseAddress(document.getElementById('mint-to').value, 'Recipient');
  const amount = parseTokenAmount(document.getElementById('mint-amount').value);
  const tx = await contract.mint(to, amount);
  show(`Mint submitted: ${tx.hash}`);
  await tx.wait();
  show(`Mint confirmed: ${tx.hash}`);
}

async function handleBurnFrom() {
  const contract = await ensureStablecoin();
  const from = parseAddress(document.getElementById('burn-from').value, 'From');
  const amount = parseTokenAmount(document.getElementById('burn-amount').value);
  const tx = await contract.burnFrom(from, amount);
  show(`Burn submitted: ${tx.hash}`);
  await tx.wait();
  show(`Burn confirmed: ${tx.hash}`);
}

async function handlePause() {
  const contract = await ensureStablecoin();
  const tx = await contract.pause();
  show(`Pause submitted: ${tx.hash}`);
  await tx.wait();
  show(`Pause confirmed: ${tx.hash}`);
}

async function handleUnpause() {
  const contract = await ensureStablecoin();
  const tx = await contract.unpause();
  show(`Unpause submitted: ${tx.hash}`);
  await tx.wait();
  show(`Unpause confirmed: ${tx.hash}`);
}

async function handleFreeze() {
  const contract = await ensureStablecoin();
  const account = parseAddress(document.getElementById('freeze-account').value, 'Account');
  const tx = await contract.freezeAccount(account);
  show(`Freeze submitted: ${tx.hash}`);
  await tx.wait();
  show(`Freeze confirmed: ${tx.hash}`);
}

async function handleUnfreeze() {
  const contract = await ensureStablecoin();
  const account = parseAddress(document.getElementById('freeze-account').value, 'Account');
  const tx = await contract.unfreezeAccount(account);
  show(`Unfreeze submitted: ${tx.hash}`);
  await tx.wait();
  show(`Unfreeze confirmed: ${tx.hash}`);
}

async function handleEmergencyTransfer() {
  const contract = await ensureStablecoin();
  const from = parseAddress(document.getElementById('emergency-from').value, 'From');
  const to = parseAddress(document.getElementById('emergency-to').value, 'To');
  const amount = parseTokenAmount(document.getElementById('emergency-amount').value);
  const tx = await contract.emergencyTransfer(from, to, amount);
  show(`Emergency transfer submitted: ${tx.hash}`);
  await tx.wait();
  show(`Emergency transfer confirmed: ${tx.hash}`);
}

async function handleSummary() {
  const contract = await ensureStablecoin();
  const [name, symbol, decimals, totalSupply, totalMinted, totalBurned, circulatingSupply, paused] =
    await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals(),
      contract.totalSupply(),
      contract.totalMinted(),
      contract.totalBurned(),
      contract.circulatingSupply(),
      contract.paused()
    ]);
  const output = [
    `Name: ${name}`,
    `Symbol: ${symbol}`,
    `Decimals: ${decimals}`,
    `Total Supply: ${formatTokenAmount(totalSupply)}`,
    `Total Minted: ${formatTokenAmount(totalMinted)}`,
    `Total Burned: ${formatTokenAmount(totalBurned)}`,
    `Circulating Supply: ${formatTokenAmount(circulatingSupply)}`,
    `Paused: ${paused}`
  ];
  show(output.join('\n'));
}

async function handleRoles() {
  const contract = await ensureStablecoin();
  const abi = await getStablecoinAbi();
  const roles = await fetchRoleValues(contract, abi);
  if (!roles.length) {
    show('No role constants found in ABI.');
    return;
  }
  show(roles.map((role) => `${role.name}: ${role.value}`).join('\n'));
}

async function handleBalance() {
  const contract = await ensureStablecoin();
  const account = parseAddress(document.getElementById('balance-account').value, 'Account');
  const balance = await contract.balanceOf(account);
  show(`Balance of ${account}: ${formatTokenAmount(balance)} AED`);
}

async function handleAllowance() {
  const contract = await ensureStablecoin();
  const owner = parseAddress(document.getElementById('allowance-owner').value, 'Owner');
  const spender = parseAddress(document.getElementById('allowance-spender').value, 'Spender');
  const allowance = await contract.allowance(owner, spender);
  show(`Allowance ${owner} -> ${spender}: ${formatTokenAmount(allowance)} AED`);
}

async function handleFrozen() {
  const contract = await ensureStablecoin();
  const account = parseAddress(document.getElementById('frozen-account').value, 'Account');
  const frozen = await contract.isFrozen(account);
  show(`Frozen status for ${account}: ${frozen}`);
}

async function handleCanTransfer() {
  const contract = await ensureStablecoin();
  const from = parseAddress(document.getElementById('can-transfer-from').value, 'From');
  const to = parseAddress(document.getElementById('can-transfer-to').value, 'To');
  const [allowed, reason] = await contract.canTransfer(from, to);
  show(`Allowed: ${allowed}\nReason: ${reason || 'N/A'}`);
}

function wireButton(id, handler) {
  const button = document.getElementById(id);
  if (!button) return;
  button.addEventListener('click', async () => {
    try {
      show('Working...');
      await handler();
    } catch (err) {
      showError(`Error: ${err.message || err}`);
    }
  });
}

function boot() {
  initLogs();
  renderContractAddress();
  document.getElementById('connect-btn').addEventListener('click', () => {
    handleConnect().catch((err) => showError(`Error: ${err.message || err}`));
  });
  document.getElementById('disconnect-btn').addEventListener('click', handleDisconnect);

  wireButton('transfer-btn', handleTransfer);
  wireButton('approve-btn', handleApprove);
  wireButton('mint-btn', handleMint);
  wireButton('burn-btn', handleBurnFrom);
  wireButton('pause-btn', handlePause);
  wireButton('unpause-btn', handleUnpause);
  wireButton('freeze-btn', handleFreeze);
  wireButton('unfreeze-btn', handleUnfreeze);
  wireButton('emergency-btn', handleEmergencyTransfer);
  wireButton('summary-btn', handleSummary);
  wireButton('roles-btn', handleRoles);
  wireButton('balance-btn', handleBalance);
  wireButton('allowance-btn', handleAllowance);
  wireButton('frozen-btn', handleFrozen);
  wireButton('can-transfer-btn', handleCanTransfer);

  setActionButtonsEnabled(false);

  onAccountsChanged(() => {
    show('Account changed. Reconnect if needed.');
  });
  onChainChanged(() => {
    show('Network changed. Reconnect if needed.');
  });
}

boot();
