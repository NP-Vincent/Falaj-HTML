import {
  EXPLORER_BASE,
  FALAJ_NETWORK,
  USDT_BOND_ABI_URL,
  USDT_BOND_ADDRESS
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

const ethers = window.ethers;

if (!ethers) {
  throw new Error('Ethers library not loaded. Ensure the ethers script is included before usdtBond.js.');
}

const BOND_STATE_LABELS = ['ISSUED', 'ACTIVE', 'MATURED', 'REDEEMED', 'FROZEN'];

let usdtBondAbi = null;
let usdtBond = null;
let tokenDecimals = 0;

function normalizeAbi(abiData) {
  if (Array.isArray(abiData)) {
    return abiData;
  }
  if (abiData?.abi && Array.isArray(abiData.abi)) {
    return abiData.abi;
  }
  throw new Error('Invalid USDT Bond ABI format.');
}

async function getUsdtBondAbi() {
  if (usdtBondAbi) {
    return usdtBondAbi;
  }
  const embedded = document.getElementById('usdt-bond-abi');
  if (embedded?.textContent?.trim()) {
    usdtBondAbi = normalizeAbi(JSON.parse(embedded.textContent));
    return usdtBondAbi;
  }
  const response = await fetch(USDT_BOND_ABI_URL);
  if (!response.ok) {
    throw new Error(`Failed to load USDT Bond ABI (${response.status})`);
  }
  usdtBondAbi = normalizeAbi(await response.json());
  return usdtBondAbi;
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
    'activate-btn',
    'mark-matured-btn',
    'mark-redeemed-btn',
    'freeze-btn',
    'unfreeze-btn',
    'pause-btn',
    'unpause-btn',
    'summary-btn',
    'roles-btn',
    'balance-btn',
    'allowance-btn',
    'eligible-btn',
    'can-transfer-btn',
    'time-to-maturity-btn'
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
  const raw = requireValue(value, 'Amount');
  const normalized = raw.replace(/,/g, '');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Amount must be a positive number.');
  }
  if (tokenDecimals === 0 && !Number.isInteger(parsed)) {
    throw new Error('Amount must be a whole number for this bond.');
  }
  return ethers.parseUnits(normalized, tokenDecimals);
}

function formatTokenAmount(amount) {
  return ethers.formatUnits(amount, tokenDecimals);
}

function formatBondState(value) {
  const index = Number(value);
  if (Number.isInteger(index) && BOND_STATE_LABELS[index]) {
    return `${BOND_STATE_LABELS[index]} (${index})`;
  }
  return `${value}`;
}

async function ensureUsdtBond() {
  if (usdtBond) {
    return usdtBond;
  }
  const signer = getSigner();
  if (!signer) {
    throw new Error('Wallet not connected.');
  }
  const abi = await getUsdtBondAbi();
  usdtBond = new ethers.Contract(USDT_BOND_ADDRESS, abi, signer);
  tokenDecimals = Number(await usdtBond.decimals());
  return usdtBond;
}

async function handleConnect() {
  await connectWallet();
  try {
    await ensureCorrectNetwork(FALAJ_NETWORK);
  } catch (err) {
    await switchNetwork(FALAJ_NETWORK);
  }
  await ensureUsdtBond();
  document.getElementById('connect-btn').style.display = 'none';
  document.getElementById('disconnect-btn').style.display = 'inline-block';
  setActionButtonsEnabled(true);
  show('Wallet connected.');
}

function handleDisconnect() {
  disconnectWallet();
  usdtBond = null;
  document.getElementById('connect-btn').style.display = 'inline-block';
  document.getElementById('disconnect-btn').style.display = 'none';
  setActionButtonsEnabled(false);
  show('Wallet disconnected.');
}

function renderContractAddress() {
  const target = document.getElementById('contract-address');
  const explorerLink = `${EXPLORER_BASE}/address/${USDT_BOND_ADDRESS}`;
  target.innerHTML = `Contract: <a href="${explorerLink}" target="_blank">${USDT_BOND_ADDRESS}</a>`;
}

async function handleTransfer() {
  const contract = await ensureUsdtBond();
  const to = parseAddress(document.getElementById('transfer-to').value, 'Recipient');
  const amount = parseTokenAmount(document.getElementById('transfer-amount').value);
  const tx = await contract.transfer(to, amount);
  show(`Transfer submitted: ${tx.hash}`);
  await tx.wait();
  show(`Transfer confirmed: ${tx.hash}`);
}

async function handleApprove() {
  const contract = await ensureUsdtBond();
  const spender = parseAddress(document.getElementById('approve-spender').value, 'Spender');
  const amount = parseTokenAmount(document.getElementById('approve-amount').value);
  const tx = await contract.approve(spender, amount);
  show(`Approve submitted: ${tx.hash}`);
  await tx.wait();
  show(`Approve confirmed: ${tx.hash}`);
}

async function handleActivate() {
  const contract = await ensureUsdtBond();
  const tx = await contract.activate();
  show(`Activate submitted: ${tx.hash}`);
  await tx.wait();
  show(`Activate confirmed: ${tx.hash}`);
}

async function handleMarkMatured() {
  const contract = await ensureUsdtBond();
  const tx = await contract.markMatured();
  show(`Mark matured submitted: ${tx.hash}`);
  await tx.wait();
  show(`Mark matured confirmed: ${tx.hash}`);
}

async function handleMarkRedeemed() {
  const contract = await ensureUsdtBond();
  const tx = await contract.markRedeemed();
  show(`Mark redeemed submitted: ${tx.hash}`);
  await tx.wait();
  show(`Mark redeemed confirmed: ${tx.hash}`);
}

async function handleFreeze() {
  const contract = await ensureUsdtBond();
  const reason = requireValue(document.getElementById('freeze-reason').value, 'Reason');
  const tx = await contract.freeze(reason);
  show(`Freeze submitted: ${tx.hash}`);
  await tx.wait();
  show(`Freeze confirmed: ${tx.hash}`);
}

async function handleUnfreeze() {
  const contract = await ensureUsdtBond();
  const rawState = document.getElementById('unfreeze-state').value;
  const state = Number(rawState);
  if (!Number.isInteger(state)) {
    throw new Error('Unfreeze state must be a number.');
  }
  const tx = await contract.unfreeze(state);
  show(`Unfreeze submitted: ${tx.hash}`);
  await tx.wait();
  show(`Unfreeze confirmed: ${tx.hash}`);
}

async function handlePause() {
  const contract = await ensureUsdtBond();
  const tx = await contract.pause();
  show(`Pause submitted: ${tx.hash}`);
  await tx.wait();
  show(`Pause confirmed: ${tx.hash}`);
}

async function handleUnpause() {
  const contract = await ensureUsdtBond();
  const tx = await contract.unpause();
  show(`Unpause submitted: ${tx.hash}`);
  await tx.wait();
  show(`Unpause confirmed: ${tx.hash}`);
}

async function handleSummary() {
  const contract = await ensureUsdtBond();
  const [
    name,
    symbol,
    decimals,
    bondDetails,
    paused,
    totalSupply
  ] = await Promise.all([
    contract.name(),
    contract.symbol(),
    contract.decimals(),
    contract.getBondDetails(),
    contract.paused(),
    contract.totalSupply()
  ]);
  const [
    isin,
    maturityDate,
    couponRate,
    creditRating,
    faceValue,
    state,
    issuer,
    detailSupply
  ] = bondDetails;
  const output = [
    `Name: ${name}`,
    `Symbol: ${symbol}`,
    `Decimals: ${decimals}`,
    `ISIN: ${isin}`,
    `Issuer: ${issuer}`,
    `State: ${formatBondState(state)}`,
    `Maturity Date: ${maturityDate}`,
    `Coupon Rate (bps): ${couponRate}`,
    `Credit Rating: ${creditRating}`,
    `Face Value: ${faceValue}`,
    `Total Supply: ${formatTokenAmount(totalSupply)}`,
    `Bond Detail Supply: ${formatTokenAmount(detailSupply)}`,
    `Paused: ${paused}`
  ];
  show(output.join('\n'));
}

async function handleRoles() {
  const contract = await ensureUsdtBond();
  const abi = await getUsdtBondAbi();
  const roles = await fetchRoleValues(contract, abi);
  if (!roles.length) {
    show('No role constants found in ABI.');
    return;
  }
  show(roles.map((role) => `${role.name}: ${role.value}`).join('\n'));
}

async function handleBalance() {
  const contract = await ensureUsdtBond();
  const account = parseAddress(document.getElementById('balance-account').value, 'Account');
  const balance = await contract.balanceOf(account);
  show(`Balance of ${account}: ${formatTokenAmount(balance)}`);
}

async function handleAllowance() {
  const contract = await ensureUsdtBond();
  const owner = parseAddress(document.getElementById('allowance-owner').value, 'Owner');
  const spender = parseAddress(document.getElementById('allowance-spender').value, 'Spender');
  const allowance = await contract.allowance(owner, spender);
  show(`Allowance ${owner} -> ${spender}: ${formatTokenAmount(allowance)}`);
}

async function handleEligibleInvestor() {
  const contract = await ensureUsdtBond();
  const account = parseAddress(document.getElementById('eligible-account').value, 'Investor');
  const eligible = await contract.isEligibleInvestor(account);
  show(`Eligible investor (${account}): ${eligible}`);
}

async function handleCanTransfer() {
  const contract = await ensureUsdtBond();
  const from = parseAddress(document.getElementById('can-transfer-from').value, 'From');
  const to = parseAddress(document.getElementById('can-transfer-to').value, 'To');
  const [allowed, reason] = await contract.canTransfer(from, to);
  show(`Allowed: ${allowed}\nReason: ${reason || 'N/A'}`);
}

async function handleTimeToMaturity() {
  const contract = await ensureUsdtBond();
  const seconds = await contract.timeToMaturity();
  show(`Time to maturity (seconds): ${seconds}`);
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
  wireButton('activate-btn', handleActivate);
  wireButton('mark-matured-btn', handleMarkMatured);
  wireButton('mark-redeemed-btn', handleMarkRedeemed);
  wireButton('freeze-btn', handleFreeze);
  wireButton('unfreeze-btn', handleUnfreeze);
  wireButton('pause-btn', handlePause);
  wireButton('unpause-btn', handleUnpause);
  wireButton('summary-btn', handleSummary);
  wireButton('roles-btn', handleRoles);
  wireButton('balance-btn', handleBalance);
  wireButton('allowance-btn', handleAllowance);
  wireButton('eligible-btn', handleEligibleInvestor);
  wireButton('can-transfer-btn', handleCanTransfer);
  wireButton('time-to-maturity-btn', handleTimeToMaturity);

  setActionButtonsEnabled(false);

  onAccountsChanged(() => {
    show('Account changed. Reconnect if needed.');
  });
  onChainChanged(() => {
    show('Network changed. Reconnect if needed.');
  });
}

boot();
