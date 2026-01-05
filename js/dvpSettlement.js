import {
  DVP_SETTLEMENT_ABI_URL,
  DVP_SETTLEMENT_ADDRESS,
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

const ethers = window.ethers;

if (!ethers) {
  throw new Error('Ethers library not loaded. Ensure the ethers script is included before dvpSettlement.js.');
}

const AED_DECIMALS = 2;
const SETTLEMENT_STATUS_LABELS = [
  'CREATED',
  'SELLER_DEPOSITED',
  'BUYER_DEPOSITED',
  'FULLY_FUNDED',
  'EXECUTED',
  'CANCELLED'
];

let dvpAbi = null;
let dvpSettlement = null;

function normalizeAbi(abiData) {
  if (Array.isArray(abiData)) {
    return abiData;
  }
  if (abiData?.abi && Array.isArray(abiData.abi)) {
    return abiData.abi;
  }
  throw new Error('Invalid DvP Settlement ABI format.');
}

async function getDvpAbi() {
  if (dvpAbi) {
    return dvpAbi;
  }
  const embedded = document.getElementById('dvp-settlement-abi');
  if (embedded?.textContent?.trim()) {
    dvpAbi = normalizeAbi(JSON.parse(embedded.textContent));
    return dvpAbi;
  }
  const response = await fetch(DVP_SETTLEMENT_ABI_URL);
  if (!response.ok) {
    throw new Error(`Failed to load DvP Settlement ABI (${response.status})`);
  }
  dvpAbi = normalizeAbi(await response.json());
  return dvpAbi;
}

function show(msg) {
  document.getElementById('msg').textContent = msg;
}

function setActionButtonsEnabled(enabled) {
  const actionButtons = [
    'create-btn',
    'deposit-bond-btn',
    'deposit-aed-btn',
    'execute-btn',
    'cancel-btn',
    'claim-btn',
    'timeout-btn',
    'pause-btn',
    'unpause-btn',
    'summary-btn',
    'get-btn',
    'can-execute-btn',
    'participant-btn'
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

function parsePositiveNumber(value, label) {
  const raw = requireValue(value, label);
  const normalized = raw.replace(/,/g, '');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return normalized;
}

function parseId(value, label = 'Settlement ID') {
  const raw = requireValue(value, label);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return BigInt(parsed);
}

function parseNonNegativeInteger(value, label) {
  const raw = requireValue(value, label);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return BigInt(parsed);
}

function parseBondAmount(value) {
  const normalized = parsePositiveNumber(value, 'Bond amount');
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed)) {
    throw new Error('Bond amount must be a whole number.');
  }
  return ethers.parseUnits(normalized, 0);
}

function parseAedAmount(value) {
  const normalized = parsePositiveNumber(value, 'AED amount');
  return ethers.parseUnits(normalized, AED_DECIMALS);
}

function formatAmount(amount, decimals) {
  return ethers.formatUnits(amount, decimals);
}

function formatStatus(status) {
  const index = Number(status);
  if (Number.isInteger(index) && SETTLEMENT_STATUS_LABELS[index]) {
    return `${SETTLEMENT_STATUS_LABELS[index]} (${index})`;
  }
  return `${status}`;
}

async function ensureDvpSettlement() {
  if (dvpSettlement) {
    return dvpSettlement;
  }
  const signer = getSigner();
  if (!signer) {
    throw new Error('Wallet not connected.');
  }
  const abi = await getDvpAbi();
  dvpSettlement = new ethers.Contract(DVP_SETTLEMENT_ADDRESS, abi, signer);
  return dvpSettlement;
}

async function handleConnect() {
  await connectWallet();
  try {
    await ensureCorrectNetwork(FALAJ_NETWORK);
  } catch (err) {
    await switchNetwork(FALAJ_NETWORK);
  }
  await ensureDvpSettlement();
  document.getElementById('connect-btn').style.display = 'none';
  document.getElementById('disconnect-btn').style.display = 'inline-block';
  setActionButtonsEnabled(true);
  show('Wallet connected.');
}

function handleDisconnect() {
  disconnectWallet();
  dvpSettlement = null;
  document.getElementById('connect-btn').style.display = 'inline-block';
  document.getElementById('disconnect-btn').style.display = 'none';
  setActionButtonsEnabled(false);
  show('Wallet disconnected.');
}

function renderContractAddress() {
  const target = document.getElementById('contract-address');
  const explorerLink = `${EXPLORER_BASE}/address/${DVP_SETTLEMENT_ADDRESS}`;
  target.innerHTML = `Contract: <a href="${explorerLink}" target="_blank">${DVP_SETTLEMENT_ADDRESS}</a>`;
}

async function handleCreateSettlement() {
  const contract = await ensureDvpSettlement();
  const bondToken = parseAddress(document.getElementById('create-bond-token').value, 'Bond token');
  const bondAmount = parseBondAmount(document.getElementById('create-bond-amount').value);
  const aedAmount = parseAedAmount(document.getElementById('create-aed-amount').value);
  const buyer = parseAddress(document.getElementById('create-buyer').value, 'Buyer');
  const tx = await contract.createSettlement(bondToken, bondAmount, aedAmount, buyer);
  show(`Create settlement submitted: ${tx.hash}`);
  const receipt = await tx.wait();
  show(`Create settlement confirmed: ${tx.hash}\nLogs: ${receipt.logs.length}`);
}

async function handleDepositBond() {
  const contract = await ensureDvpSettlement();
  const id = parseId(document.getElementById('deposit-bond-id').value);
  const tx = await contract.depositBond(id);
  show(`Bond deposit submitted: ${tx.hash}`);
  await tx.wait();
  show(`Bond deposit confirmed: ${tx.hash}`);
}

async function handleDepositAed() {
  const contract = await ensureDvpSettlement();
  const id = parseId(document.getElementById('deposit-aed-id').value);
  const tx = await contract.depositAED(id);
  show(`AED deposit submitted: ${tx.hash}`);
  await tx.wait();
  show(`AED deposit confirmed: ${tx.hash}`);
}

async function handleExecute() {
  const contract = await ensureDvpSettlement();
  const id = parseId(document.getElementById('execute-id').value);
  const tx = await contract.execute(id);
  show(`Execute submitted: ${tx.hash}`);
  await tx.wait();
  show(`Execute confirmed: ${tx.hash}`);
}

async function handleCancel() {
  const contract = await ensureDvpSettlement();
  const id = parseId(document.getElementById('cancel-id').value);
  const reason = requireValue(document.getElementById('cancel-reason').value, 'Reason');
  const tx = await contract.cancel(id, reason);
  show(`Cancel submitted: ${tx.hash}`);
  await tx.wait();
  show(`Cancel confirmed: ${tx.hash}`);
}

async function handleClaimExpired() {
  const contract = await ensureDvpSettlement();
  const id = parseId(document.getElementById('claim-id').value);
  const tx = await contract.claimExpiredRefund(id);
  show(`Claim refund submitted: ${tx.hash}`);
  await tx.wait();
  show(`Claim refund confirmed: ${tx.hash}`);
}

async function handleUpdateTimeout() {
  const contract = await ensureDvpSettlement();
  const secondsRaw = parsePositiveNumber(document.getElementById('timeout-seconds').value, 'Timeout');
  const tx = await contract.setSettlementTimeout(BigInt(Math.trunc(Number(secondsRaw))));
  show(`Update timeout submitted: ${tx.hash}`);
  await tx.wait();
  show(`Update timeout confirmed: ${tx.hash}`);
}

async function handlePause() {
  const contract = await ensureDvpSettlement();
  const tx = await contract.pause();
  show(`Pause submitted: ${tx.hash}`);
  await tx.wait();
  show(`Pause confirmed: ${tx.hash}`);
}

async function handleUnpause() {
  const contract = await ensureDvpSettlement();
  const tx = await contract.unpause();
  show(`Unpause submitted: ${tx.hash}`);
  await tx.wait();
  show(`Unpause confirmed: ${tx.hash}`);
}

async function handleSummary() {
  const contract = await ensureDvpSettlement();
  const [
    settlementCount,
    settlementTimeout,
    identityRegistry,
    aedStablecoin,
    paused
  ] = await Promise.all([
    contract.settlementCount(),
    contract.settlementTimeout(),
    contract.identityRegistry(),
    contract.aedStablecoin(),
    contract.paused()
  ]);
  const output = [
    `Settlement count: ${settlementCount}`,
    `Settlement timeout (seconds): ${settlementTimeout}`,
    `Identity registry: ${identityRegistry}`,
    `AED stablecoin: ${aedStablecoin}`,
    `Paused: ${paused}`
  ];
  show(output.join('\n'));
}

async function handleGetSettlement() {
  const contract = await ensureDvpSettlement();
  const id = parseId(document.getElementById('get-id').value);
  const [settlement, bondDeposited, aedDeposited] = await Promise.all([
    contract.getSettlement(id),
    contract.bondDeposited(id),
    contract.aedDeposited(id)
  ]);
  const output = [
    `Settlement ID: ${settlement.id}`,
    `Seller: ${settlement.seller}`,
    `Buyer: ${settlement.buyer}`,
    `Bond token: ${settlement.bondToken}`,
    `Bond amount: ${formatAmount(settlement.bondAmount, 0)}`,
    `AED amount: ${formatAmount(settlement.aedAmount, AED_DECIMALS)}`,
    `Status: ${formatStatus(settlement.status)}`,
    `Created at: ${settlement.createdAt}`,
    `Expires at: ${settlement.expiresAt}`,
    `Executed at: ${settlement.executedAt}`,
    `Bond deposited: ${bondDeposited}`,
    `AED deposited: ${aedDeposited}`
  ];
  show(output.join('\n'));
}

async function handleCanExecute() {
  const contract = await ensureDvpSettlement();
  const id = parseId(document.getElementById('can-execute-id').value);
  const [ready, reason] = await contract.canExecute(id);
  show(`Ready: ${ready}\nReason: ${reason || 'N/A'}`);
}

async function handleParticipantSettlements() {
  const contract = await ensureDvpSettlement();
  const participant = parseAddress(document.getElementById('participant-address').value, 'Participant');
  const offset = parseNonNegativeInteger(document.getElementById('participant-offset').value, 'Offset');
  const limit = parseNonNegativeInteger(document.getElementById('participant-limit').value, 'Limit');
  if (limit === 0n) {
    throw new Error('Limit must be greater than 0.');
  }
  const settlements = await contract.getSettlementsForParticipant(participant, offset, limit);
  if (!settlements.length) {
    show('No settlements found for participant.');
    return;
  }
  const output = settlements.map((settlement) => {
    return [
      `ID: ${settlement.id}`,
      `  Status: ${formatStatus(settlement.status)}`,
      `  Seller: ${settlement.seller}`,
      `  Buyer: ${settlement.buyer}`,
      `  Bond token: ${settlement.bondToken}`,
      `  Bond amount: ${formatAmount(settlement.bondAmount, 0)}`,
      `  AED amount: ${formatAmount(settlement.aedAmount, AED_DECIMALS)}`,
      `  Expires at: ${settlement.expiresAt}`
    ].join('\n');
  });
  show(output.join('\n\n'));
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

  wireButton('create-btn', handleCreateSettlement);
  wireButton('deposit-bond-btn', handleDepositBond);
  wireButton('deposit-aed-btn', handleDepositAed);
  wireButton('execute-btn', handleExecute);
  wireButton('cancel-btn', handleCancel);
  wireButton('claim-btn', handleClaimExpired);
  wireButton('timeout-btn', handleUpdateTimeout);
  wireButton('pause-btn', handlePause);
  wireButton('unpause-btn', handleUnpause);
  wireButton('summary-btn', handleSummary);
  wireButton('get-btn', handleGetSettlement);
  wireButton('can-execute-btn', handleCanExecute);
  wireButton('participant-btn', handleParticipantSettlements);

  setActionButtonsEnabled(false);

  onAccountsChanged(() => {
    show('Account changed. Reconnect if needed.');
  });
  onChainChanged(() => {
    show('Network changed. Reconnect if needed.');
  });
}

boot();
