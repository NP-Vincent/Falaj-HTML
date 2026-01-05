import {
  EXPLORER_BASE,
  FALAJ_NETWORK,
  FEE_DISTRIBUTION_ABI_URL,
  FEE_DISTRIBUTION_ADDRESS
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
  throw new Error('Ethers library not loaded. Ensure the ethers script is included before feeDistribution.js.');
}

let feeDistributionAbi = null;
let feeDistribution = null;

function normalizeAbi(abiData) {
  if (Array.isArray(abiData)) {
    return abiData;
  }
  if (abiData?.abi && Array.isArray(abiData.abi)) {
    return abiData.abi;
  }
  throw new Error('Invalid Fee Distribution ABI format.');
}

async function getFeeDistributionAbi() {
  if (feeDistributionAbi) {
    return feeDistributionAbi;
  }
  const embedded = document.getElementById('fee-distribution-abi');
  if (embedded?.textContent?.trim()) {
    feeDistributionAbi = normalizeAbi(JSON.parse(embedded.textContent));
    return feeDistributionAbi;
  }
  const response = await fetch(FEE_DISTRIBUTION_ABI_URL);
  if (!response.ok) {
    throw new Error(`Failed to load Fee Distribution ABI (${response.status})`);
  }
  feeDistributionAbi = normalizeAbi(await response.json());
  return feeDistributionAbi;
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
    'collect-fees-btn',
    'distribute-btn',
    'withdraw-fees-btn',
    'withdraw-fees-to-btn',
    'set-service-provider-btn',
    'set-service-provider-fee-btn',
    'set-validator-manager-btn',
    'grant-role-btn',
    'revoke-role-btn',
    'renounce-role-btn',
    'summary-btn',
    'stats-btn',
    'role-admin-btn',
    'has-role-btn'
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

function parseEtherAmount(value, label) {
  const sanitized = requireValue(value, label);
  const amount = ethers.parseEther(sanitized);
  if (amount <= 0n) {
    throw new Error(`${label} must be greater than 0.`);
  }
  return amount;
}

async function ensureFeeDistribution() {
  if (feeDistribution) {
    return feeDistribution;
  }
  const signer = getSigner();
  if (!signer) {
    throw new Error('Wallet not connected.');
  }
  const abi = await getFeeDistributionAbi();
  feeDistribution = new ethers.Contract(FEE_DISTRIBUTION_ADDRESS, abi, signer);
  return feeDistribution;
}

async function handleConnect() {
  await connectWallet();
  try {
    await ensureCorrectNetwork(FALAJ_NETWORK);
  } catch (err) {
    await switchNetwork(FALAJ_NETWORK);
  }
  await ensureFeeDistribution();
  document.getElementById('connect-btn').style.display = 'none';
  document.getElementById('disconnect-btn').style.display = 'inline-block';
  setActionButtonsEnabled(true);
  show('Wallet connected.');
}

function handleDisconnect() {
  disconnectWallet();
  feeDistribution = null;
  document.getElementById('connect-btn').style.display = 'inline-block';
  document.getElementById('disconnect-btn').style.display = 'none';
  setActionButtonsEnabled(false);
  show('Wallet disconnected.');
}

function renderContractAddress() {
  const target = document.getElementById('contract-address');
  const explorerLink = `${EXPLORER_BASE}/address/${FEE_DISTRIBUTION_ADDRESS}`;
  target.innerHTML = `Contract: <a href="${explorerLink}" target="_blank">${FEE_DISTRIBUTION_ADDRESS}</a>`;
}

async function handleCollectFees() {
  const contract = await ensureFeeDistribution();
  const amount = parseEtherAmount(document.getElementById('collect-fees-amount').value, 'Fee amount');
  const tx = await contract.collectFees({ value: amount });
  show(`Collect fees submitted: ${tx.hash}`);
  await tx.wait();
  show(`Collect fees confirmed: ${tx.hash}`);
}

async function handleDistribute() {
  const contract = await ensureFeeDistribution();
  const tx = await contract.distribute();
  show(`Distribution submitted: ${tx.hash}`);
  await tx.wait();
  show(`Distribution confirmed: ${tx.hash}`);
}

async function handleWithdrawFees() {
  const contract = await ensureFeeDistribution();
  const tx = await contract.withdrawServiceProviderFees();
  show(`Withdraw fees submitted: ${tx.hash}`);
  await tx.wait();
  show(`Withdraw fees confirmed: ${tx.hash}`);
}

async function handleWithdrawFeesTo() {
  const contract = await ensureFeeDistribution();
  const to = parseAddress(document.getElementById('withdraw-fees-to').value, 'Recipient');
  const tx = await contract.withdrawServiceProviderFeesTo(to);
  show(`Withdraw fees submitted: ${tx.hash}`);
  await tx.wait();
  show(`Withdraw fees confirmed: ${tx.hash}`);
}

async function handleSetServiceProvider() {
  const contract = await ensureFeeDistribution();
  const provider = parseAddress(document.getElementById('service-provider-address').value, 'Service provider');
  const tx = await contract.setServiceProvider(provider);
  show(`Service provider update submitted: ${tx.hash}`);
  await tx.wait();
  show(`Service provider update confirmed: ${tx.hash}`);
}

async function handleSetServiceProviderFee() {
  const contract = await ensureFeeDistribution();
  const fee = parseUint(document.getElementById('service-provider-fee').value, 'Service provider fee');
  const tx = await contract.setServiceProviderFee(fee);
  show(`Service provider fee submitted: ${tx.hash}`);
  await tx.wait();
  show(`Service provider fee confirmed: ${tx.hash}`);
}

async function handleSetValidatorManager() {
  const contract = await ensureFeeDistribution();
  const manager = parseAddress(document.getElementById('validator-manager-address').value, 'Validator staking manager');
  const tx = await contract.setValidatorStakingManager(manager);
  show(`Validator manager update submitted: ${tx.hash}`);
  await tx.wait();
  show(`Validator manager update confirmed: ${tx.hash}`);
}

async function handleGrantRole() {
  const contract = await ensureFeeDistribution();
  const role = parseRole(document.getElementById('grant-role-value').value);
  const account = parseAddress(document.getElementById('grant-role-account').value, 'Account');
  const tx = await contract.grantRole(role, account);
  show(`Grant role submitted: ${tx.hash}`);
  await tx.wait();
  show(`Grant role confirmed: ${tx.hash}`);
}

async function handleRevokeRole() {
  const contract = await ensureFeeDistribution();
  const role = parseRole(document.getElementById('revoke-role-value').value);
  const account = parseAddress(document.getElementById('revoke-role-account').value, 'Account');
  const tx = await contract.revokeRole(role, account);
  show(`Revoke role submitted: ${tx.hash}`);
  await tx.wait();
  show(`Revoke role confirmed: ${tx.hash}`);
}

async function handleRenounceRole() {
  const contract = await ensureFeeDistribution();
  const role = parseRole(document.getElementById('renounce-role-value').value);
  const account = parseAddress(document.getElementById('renounce-role-account').value, 'Account');
  const tx = await contract.renounceRole(role, account);
  show(`Renounce role submitted: ${tx.hash}`);
  await tx.wait();
  show(`Renounce role confirmed: ${tx.hash}`);
}

async function handleSummary() {
  const contract = await ensureFeeDistribution();
  const [
    balance,
    pendingFees,
    pendingDistribution,
    serviceProvider,
    validatorStakingManager,
    serviceProviderFee,
    totalValidators,
    totalProvider,
    lastDistribution
  ] = await Promise.all([
    contract.getContractBalance(),
    contract.pendingFees(),
    contract.pendingDistribution(),
    contract.serviceProvider(),
    contract.validatorStakingManager(),
    contract.serviceProviderFee(),
    contract.totalDistributedToValidators(),
    contract.totalDistributedToServiceProvider(),
    contract.getLastDistribution()
  ]);
  const output = [
    `Contract balance: ${ethers.formatEther(balance)} AVAX`,
    `Pending fees: ${ethers.formatEther(pendingFees)} AVAX`,
    `Pending distribution: ${ethers.formatEther(pendingDistribution)} AVAX`,
    `Service provider: ${serviceProvider}`,
    `Validator staking manager: ${validatorStakingManager}`,
    `Service provider fee (bps): ${serviceProviderFee}`,
    `Total distributed to validators: ${ethers.formatEther(totalValidators)} AVAX`,
    `Total distributed to provider: ${ethers.formatEther(totalProvider)} AVAX`,
    `Last distribution timestamp: ${lastDistribution}`
  ];
  show(output.join('\n'));
}

async function handleStats() {
  const contract = await ensureFeeDistribution();
  const stats = await contract.getDistributionStats();
  const output = [
    `Validators distribution: ${ethers.formatEther(stats.validators)} AVAX`,
    `Provider distribution: ${ethers.formatEther(stats.provider)} AVAX`,
    `Pending distribution: ${ethers.formatEther(stats.pending)} AVAX`,
    `Provider balance: ${ethers.formatEther(stats.providerBalance)} AVAX`
  ];
  show(output.join('\n'));
}

async function handleRoleAdmin() {
  const contract = await ensureFeeDistribution();
  const role = parseRole(document.getElementById('role-admin-value').value);
  const admin = await contract.getRoleAdmin(role);
  show(`Role admin: ${admin}`);
}

async function handleHasRole() {
  const contract = await ensureFeeDistribution();
  const role = parseRole(document.getElementById('has-role-value').value);
  const account = parseAddress(document.getElementById('has-role-account').value, 'Account');
  const hasRole = await contract.hasRole(role, account);
  show(`Has role: ${hasRole}`);
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

  wireButton('collect-fees-btn', handleCollectFees);
  wireButton('distribute-btn', handleDistribute);
  wireButton('withdraw-fees-btn', handleWithdrawFees);
  wireButton('withdraw-fees-to-btn', handleWithdrawFeesTo);
  wireButton('set-service-provider-btn', handleSetServiceProvider);
  wireButton('set-service-provider-fee-btn', handleSetServiceProviderFee);
  wireButton('set-validator-manager-btn', handleSetValidatorManager);
  wireButton('grant-role-btn', handleGrantRole);
  wireButton('revoke-role-btn', handleRevokeRole);
  wireButton('renounce-role-btn', handleRenounceRole);
  wireButton('summary-btn', handleSummary);
  wireButton('stats-btn', handleStats);
  wireButton('role-admin-btn', handleRoleAdmin);
  wireButton('has-role-btn', handleHasRole);

  setActionButtonsEnabled(false);

  onAccountsChanged(() => {
    show('Account changed. Reconnect if needed.');
  });
  onChainChanged(() => {
    show('Network changed. Reconnect if needed.');
  });
}

boot();
