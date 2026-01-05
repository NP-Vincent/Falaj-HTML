import {
  EXPLORER_BASE,
  FALAJ_NETWORK,
  PAYMENT_PROCESSOR_ABI_URL,
  PAYMENT_PROCESSOR_ADDRESS
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

const ethers = window.ethers;

if (!ethers) {
  throw new Error('Ethers library not loaded. Ensure the ethers script is included before paymentProcessor.js.');
}

let paymentProcessorAbi = null;
let paymentProcessor = null;

function normalizeAbi(abiData) {
  if (Array.isArray(abiData)) {
    return abiData;
  }
  if (abiData?.abi && Array.isArray(abiData.abi)) {
    return abiData.abi;
  }
  throw new Error('Invalid Payment Processor ABI format.');
}

async function getPaymentProcessorAbi() {
  if (paymentProcessorAbi) {
    return paymentProcessorAbi;
  }
  const embedded = document.getElementById('payment-processor-abi');
  if (embedded?.textContent?.trim()) {
    paymentProcessorAbi = normalizeAbi(JSON.parse(embedded.textContent));
    return paymentProcessorAbi;
  }
  const response = await fetch(PAYMENT_PROCESSOR_ABI_URL);
  if (!response.ok) {
    throw new Error(`Failed to load Payment Processor ABI (${response.status})`);
  }
  paymentProcessorAbi = normalizeAbi(await response.json());
  return paymentProcessorAbi;
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
    'deposit-avax-btn',
    'deposit-stablecoin-btn',
    'emergency-withdraw-btn',
    'pause-btn',
    'unpause-btn',
    'set-default-chain-btn',
    'set-destination-chain-btn',
    'set-exchange-rate-btn',
    'set-protocol-fee-btn',
    'withdraw-fees-btn',
    'grant-role-btn',
    'revoke-role-btn',
    'renounce-role-btn',
    'summary-btn',
    'exchange-rate-btn',
    'destination-manager-btn',
    'token-supported-btn',
    'calculate-aed-btn'
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

function parseRole(value) {
  const sanitized = requireValue(value, 'Role');
  if (sanitized.startsWith('0x') && sanitized.length === 66) {
    return sanitized;
  }
  return ethers.id(sanitized);
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

function parseEtherAmount(value, label) {
  const sanitized = requireValue(value, label);
  const amount = ethers.parseEther(sanitized);
  if (amount <= 0n) {
    throw new Error(`${label} must be greater than 0.`);
  }
  return amount;
}

async function ensurePaymentProcessor() {
  if (paymentProcessor) {
    return paymentProcessor;
  }
  const signer = getSigner();
  if (!signer) {
    throw new Error('Wallet not connected.');
  }
  const abi = await getPaymentProcessorAbi();
  paymentProcessor = new ethers.Contract(PAYMENT_PROCESSOR_ADDRESS, abi, signer);
  return paymentProcessor;
}

async function handleConnect() {
  await connectWallet();
  try {
    await ensureCorrectNetwork(FALAJ_NETWORK);
  } catch (err) {
    await switchNetwork(FALAJ_NETWORK);
  }
  await ensurePaymentProcessor();
  document.getElementById('connect-btn').style.display = 'none';
  document.getElementById('disconnect-btn').style.display = 'inline-block';
  setActionButtonsEnabled(true);
  show('Wallet connected.');
}

function handleDisconnect() {
  disconnectWallet();
  paymentProcessor = null;
  document.getElementById('connect-btn').style.display = 'inline-block';
  document.getElementById('disconnect-btn').style.display = 'none';
  setActionButtonsEnabled(false);
  show('Wallet disconnected.');
}

function renderContractAddress() {
  const target = document.getElementById('contract-address');
  const explorerLink = `${EXPLORER_BASE}/address/${PAYMENT_PROCESSOR_ADDRESS}`;
  target.innerHTML = `Contract: <a href="${explorerLink}" target="_blank">${PAYMENT_PROCESSOR_ADDRESS}</a>`;
}

async function handleDepositAVAX() {
  const contract = await ensurePaymentProcessor();
  const recipient = parseAddress(document.getElementById('deposit-avax-recipient').value, 'Recipient');
  const paymentRef = requireValue(document.getElementById('deposit-avax-ref').value, 'Payment reference');
  const amount = parseEtherAmount(document.getElementById('deposit-avax-amount').value, 'AVAX amount');
  const tx = await contract.depositAVAX(recipient, paymentRef, { value: amount });
  show(`AVAX deposit submitted: ${tx.hash}`);
  await tx.wait();
  show(`AVAX deposit confirmed: ${tx.hash}`);
}

async function handleDepositStablecoin() {
  const contract = await ensurePaymentProcessor();
  const token = parseAddress(document.getElementById('deposit-stablecoin-token').value, 'Token');
  const amount = parseTokenAmount(document.getElementById('deposit-stablecoin-amount').value, 'Token amount');
  const recipient = parseAddress(document.getElementById('deposit-stablecoin-recipient').value, 'Recipient');
  const paymentRef = requireValue(document.getElementById('deposit-stablecoin-ref').value, 'Payment reference');
  const tx = await contract.depositStablecoin(token, amount, recipient, paymentRef);
  show(`Stablecoin deposit submitted: ${tx.hash}`);
  await tx.wait();
  show(`Stablecoin deposit confirmed: ${tx.hash}`);
}

async function handleEmergencyWithdraw() {
  const contract = await ensurePaymentProcessor();
  const token = parseAddress(document.getElementById('emergency-token').value, 'Token');
  const to = parseAddress(document.getElementById('emergency-recipient').value, 'Recipient');
  const amount = parseTokenAmount(document.getElementById('emergency-amount').value, 'Token amount');
  const tx = await contract.emergencyWithdrawToken(token, to, amount);
  show(`Emergency withdraw submitted: ${tx.hash}`);
  await tx.wait();
  show(`Emergency withdraw confirmed: ${tx.hash}`);
}

async function handlePause() {
  const contract = await ensurePaymentProcessor();
  const tx = await contract.pause();
  show(`Pause submitted: ${tx.hash}`);
  await tx.wait();
  show(`Pause confirmed: ${tx.hash}`);
}

async function handleUnpause() {
  const contract = await ensurePaymentProcessor();
  const tx = await contract.unpause();
  show(`Unpause submitted: ${tx.hash}`);
  await tx.wait();
  show(`Unpause confirmed: ${tx.hash}`);
}

async function handleSetDefaultDestinationChain() {
  const contract = await ensurePaymentProcessor();
  const chainId = parseBytes32(document.getElementById('default-chain-id').value, 'Chain ID');
  const tx = await contract.setDefaultDestinationChain(chainId);
  show(`Default destination chain submitted: ${tx.hash}`);
  await tx.wait();
  show(`Default destination chain confirmed: ${tx.hash}`);
}

async function handleSetDestinationChain() {
  const contract = await ensurePaymentProcessor();
  const chainId = parseBytes32(document.getElementById('destination-chain-id').value, 'Chain ID');
  const manager = parseAddress(document.getElementById('destination-chain-manager').value, 'Bridge manager');
  const tx = await contract.setDestinationChain(chainId, manager);
  show(`Destination chain submitted: ${tx.hash}`);
  await tx.wait();
  show(`Destination chain confirmed: ${tx.hash}`);
}

async function handleSetExchangeRate() {
  const contract = await ensurePaymentProcessor();
  const token = parseAddress(document.getElementById('exchange-rate-token').value, 'Token');
  const rate = parseUint(document.getElementById('exchange-rate-value').value, 'Rate to AED', false);
  const tx = await contract.setExchangeRate(token, rate);
  show(`Exchange rate submitted: ${tx.hash}`);
  await tx.wait();
  show(`Exchange rate confirmed: ${tx.hash}`);
}

async function handleSetProtocolFee() {
  const contract = await ensurePaymentProcessor();
  const fee = parseUint(document.getElementById('protocol-fee-value').value, 'Protocol fee', true);
  const tx = await contract.setProtocolFee(fee);
  show(`Protocol fee submitted: ${tx.hash}`);
  await tx.wait();
  show(`Protocol fee confirmed: ${tx.hash}`);
}

async function handleWithdrawFees() {
  const contract = await ensurePaymentProcessor();
  const to = parseAddress(document.getElementById('withdraw-fees-to').value, 'Recipient');
  const tx = await contract.withdrawFees(to);
  show(`Withdraw fees submitted: ${tx.hash}`);
  await tx.wait();
  show(`Withdraw fees confirmed: ${tx.hash}`);
}

async function handleGrantRole() {
  const contract = await ensurePaymentProcessor();
  const role = parseRole(document.getElementById('grant-role-value').value);
  const account = parseAddress(document.getElementById('grant-role-account').value, 'Account');
  const tx = await contract.grantRole(role, account);
  show(`Grant role submitted: ${tx.hash}`);
  await tx.wait();
  show(`Grant role confirmed: ${tx.hash}`);
}

async function handleRevokeRole() {
  const contract = await ensurePaymentProcessor();
  const role = parseRole(document.getElementById('revoke-role-value').value);
  const account = parseAddress(document.getElementById('revoke-role-account').value, 'Account');
  const tx = await contract.revokeRole(role, account);
  show(`Revoke role submitted: ${tx.hash}`);
  await tx.wait();
  show(`Revoke role confirmed: ${tx.hash}`);
}

async function handleRenounceRole() {
  const contract = await ensurePaymentProcessor();
  const role = parseRole(document.getElementById('renounce-role-value').value);
  const account = parseAddress(document.getElementById('renounce-role-account').value, 'Account');
  const tx = await contract.renounceRole(role, account);
  show(`Renounce role submitted: ${tx.hash}`);
  await tx.wait();
  show(`Renounce role confirmed: ${tx.hash}`);
}

async function handleSummary() {
  const contract = await ensurePaymentProcessor();
  const [
    accumulatedFees,
    protocolFeeBps,
    totalAedValueProcessed,
    totalPaymentsProcessed,
    defaultDestinationChain,
    paused
  ] = await Promise.all([
    contract.accumulatedFees(),
    contract.protocolFeeBps(),
    contract.totalAedValueProcessed(),
    contract.totalPaymentsProcessed(),
    contract.defaultDestinationChain(),
    contract.paused()
  ]);
  const output = [
    `Accumulated fees: ${ethers.formatEther(accumulatedFees)} AVAX`,
    `Protocol fee (bps): ${protocolFeeBps}`,
    `Total AED value processed: ${ethers.formatEther(totalAedValueProcessed)} AED`,
    `Total payments processed: ${totalPaymentsProcessed}`,
    `Default destination chain: ${defaultDestinationChain}`,
    `Paused: ${paused}`
  ];
  show(output.join('\n'));
}

async function handleExchangeRate() {
  const contract = await ensurePaymentProcessor();
  const token = parseAddress(document.getElementById('exchange-rate-query-token').value, 'Token');
  const rate = await contract.getExchangeRate(token);
  show(`Exchange rate: ${rate}`);
}

async function handleDestinationManager() {
  const contract = await ensurePaymentProcessor();
  const chainId = parseBytes32(document.getElementById('destination-chain-query-id').value, 'Chain ID');
  const manager = await contract.getDestinationBridgeManager(chainId);
  show(`Bridge manager: ${manager}`);
}

async function handleTokenSupported() {
  const contract = await ensurePaymentProcessor();
  const token = parseAddress(document.getElementById('token-supported-token').value, 'Token');
  const supported = await contract.isTokenSupported(token);
  show(`Token supported: ${supported}`);
}

async function handleCalculateAed() {
  const contract = await ensurePaymentProcessor();
  const token = parseAddress(document.getElementById('calculate-aed-token').value, 'Token');
  const amount = parseTokenAmount(document.getElementById('calculate-aed-amount').value, 'Token amount');
  const aedAmount = await contract.calculateAedAmount(token, amount);
  show(`AED amount: ${ethers.formatEther(aedAmount)} AED`);
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

  wireButton('deposit-avax-btn', handleDepositAVAX);
  wireButton('deposit-stablecoin-btn', handleDepositStablecoin);
  wireButton('emergency-withdraw-btn', handleEmergencyWithdraw);
  wireButton('pause-btn', handlePause);
  wireButton('unpause-btn', handleUnpause);
  wireButton('set-default-chain-btn', handleSetDefaultDestinationChain);
  wireButton('set-destination-chain-btn', handleSetDestinationChain);
  wireButton('set-exchange-rate-btn', handleSetExchangeRate);
  wireButton('set-protocol-fee-btn', handleSetProtocolFee);
  wireButton('withdraw-fees-btn', handleWithdrawFees);
  wireButton('grant-role-btn', handleGrantRole);
  wireButton('revoke-role-btn', handleRevokeRole);
  wireButton('renounce-role-btn', handleRenounceRole);
  wireButton('summary-btn', handleSummary);
  wireButton('exchange-rate-btn', handleExchangeRate);
  wireButton('destination-manager-btn', handleDestinationManager);
  wireButton('token-supported-btn', handleTokenSupported);
  wireButton('calculate-aed-btn', handleCalculateAed);

  setActionButtonsEnabled(false);

  onAccountsChanged(() => {
    show('Account changed. Reconnect if needed.');
  });
  onChainChanged(() => {
    show('Network changed. Reconnect if needed.');
  });
}

boot();
