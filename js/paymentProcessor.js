import {
  AVALANCHE_TESTNET_C_NETWORK,
  AVALANCHE_FUJI_C_CHAIN_EXPLORER_BASE,
  PAYMENT_PROCESSOR_ABI_URL,
  PAYMENT_PROCESSOR_ADDRESS
} from './config.js';
import {
  connectWallet,
  disconnectWallet,
  ensureCorrectNetwork,
  getProvider,
  getSigner,
  onAccountsChanged,
  onChainChanged,
  switchNetwork
} from './wallet.js';
import { initLogs, logEvent, logError } from './logs.js';
import { fetchRoleValues } from './roles.js';

const ethers = window.ethers;

if (!ethers) {
  throw new Error('Ethers library not loaded. Ensure the ethers script is included before paymentProcessor.js.');
}

let paymentProcessorAbi = null;
let paymentProcessor = null;
const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)'
];

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
    'set-teleporter-messenger-btn',
    'set-teleporter-gas-btn',
    'set-teleporter-relayers-btn',
    'withdraw-fees-btn',
    'grant-role-btn',
    'revoke-role-btn',
    'renounce-role-btn',
    'summary-btn',
    'roles-btn',
    'exchange-rate-btn',
    'destination-manager-btn',
    'teleporter-gas-btn',
    'teleporter-relayers-btn',
    'token-supported-btn',
    'token-decimals-btn',
    'calculate-aed-btn'
  ];
  actionButtons.forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !enabled;
  });
}

function requireValue(value, label) {
  const sanitized = `${value ?? ''}`.trim();
  if (!sanitized) {
    throw new Error(`${label} is required.`);
  }
  return sanitized;
}

function parseAddress(value, label) {
  const address = requireValue(value, label);
  if (!ethers.isAddress(address)) {
    throw new Error(`${label} must be a valid address.`);
  }
  return address;
}

function parseTokenAddress(value, label) {
  const sanitized = requireValue(value, label);
  const lowered = sanitized.toLowerCase();
  if (lowered === 'native' || lowered === 'avax' || lowered === '0x0') {
    return ethers.ZeroAddress;
  }
  if (!ethers.isAddress(sanitized)) {
    throw new Error(`${label} must be a valid address or 'native'.`);
  }
  return sanitized;
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

function parseAddressList(value, label) {
  const sanitized = requireValue(value, label);
  const addresses = sanitized
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!addresses.length) {
    throw new Error(`${label} is required.`);
  }
  const invalid = addresses.find((address) => !ethers.isAddress(address));
  if (invalid) {
    throw new Error(`${label} contains an invalid address: ${invalid}`);
  }
  return addresses;
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

function parseTokenAmountWithDecimals(value, label, decimals) {
  const sanitized = requireValue(value, label);
  const amount = ethers.parseUnits(sanitized, decimals);
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

async function resolveRecipient(inputId) {
  const input = document.getElementById(inputId);
  const raw = input ? input.value : '';
  if (raw && raw.trim()) {
    return parseAddress(raw, 'Recipient');
  }
  const signer = getSigner();
  if (!signer) {
    throw new Error('Recipient is required.');
  }
  const address = signer.getAddress ? await signer.getAddress() : signer.address;
  logEvent('Recipient not provided. Using the connected wallet address.');
  return address;
}

async function getSignerBalance(signer) {
  const provider = getProvider();
  const balanceProvider = provider?.getBalance ? provider : signer?.provider;
  if (!balanceProvider?.getBalance) {
    return null;
  }
  const address = signer.getAddress ? await signer.getAddress() : signer.address;
  return balanceProvider.getBalance(address);
}

async function getTokenDecimals(tokenAddress) {
  if (tokenAddress === ethers.ZeroAddress) {
    return { decimals: 18, isFallback: false };
  }
  const signer = getSigner();
  const provider = signer?.provider ?? signer;
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  try {
    const decimals = await token.decimals();
    return { decimals: Number(decimals), isFallback: false };
  } catch (err) {
    logEvent(`Warning: failed to read token decimals for ${tokenAddress}. Using fallback of 18.`);
    return { decimals: 18, isFallback: true };
  }
}

async function ensureTokenAllowance(tokenAddress, spender, requiredAmount, tokenDecimals) {
  const signer = getSigner();
  if (!signer) {
    throw new Error('Wallet not connected.');
  }
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const owner = await signer.getAddress();
  const currentAllowance = await token.allowance(owner, spender);
  if (currentAllowance >= requiredAmount) {
    logEvent(
      `Allowance sufficient: ${ethers.formatUnits(currentAllowance, tokenDecimals)} tokens approved for ${spender}.`
    );
    return;
  }
  show(
    `Approving ${ethers.formatUnits(
      requiredAmount,
      tokenDecimals
    )} tokens for ${spender} (current allowance ${ethers.formatUnits(currentAllowance, tokenDecimals)}).`
  );
  const approvalTx = await token.approve(spender, requiredAmount);
  show(`Approve submitted: ${approvalTx.hash}`);
  await approvalTx.wait();
  show(`Approve confirmed: ${approvalTx.hash}`);
}

async function handleConnect() {
  await connectWallet();
  try {
    await ensureCorrectNetwork(AVALANCHE_TESTNET_C_NETWORK);
  } catch (err) {
    await switchNetwork(AVALANCHE_TESTNET_C_NETWORK);
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
  const explorerLink = `${AVALANCHE_FUJI_C_CHAIN_EXPLORER_BASE}/address/${PAYMENT_PROCESSOR_ADDRESS}`;
  target.innerHTML = `Contract: <a href="${explorerLink}" target="_blank">${PAYMENT_PROCESSOR_ADDRESS}</a>`;
}

async function handleDepositAVAX() {
  const contract = await ensurePaymentProcessor();
  const signer = getSigner();
  const recipient = await resolveRecipient('deposit-avax-recipient');
  const paymentRef = requireValue(document.getElementById('deposit-avax-ref').value, 'Payment reference');
  const amount = parseEtherAmount(document.getElementById('deposit-avax-amount').value, 'AVAX amount');
  if (signer) {
    const balance = await getSignerBalance(signer);
    if (balance !== null && amount > balance) {
      throw new Error(
        `Insufficient AVAX balance. Wallet balance: ${ethers.formatEther(
          balance
        )} AVAX. Ensure the amount is entered in AVAX (not wei).`
      );
    }
  }
  const tx = await contract.depositAVAX(recipient, paymentRef, { value: amount });
  show(`AVAX deposit submitted: ${tx.hash}`);
  await tx.wait();
  show(`AVAX deposit confirmed: ${tx.hash}`);
}

async function handleDepositStablecoin() {
  const contract = await ensurePaymentProcessor();
  const token = parseAddress(document.getElementById('deposit-stablecoin-token').value, 'Token');
  const { decimals: tokenDecimals, isFallback } = await getTokenDecimals(token);
  const amount = parseTokenAmountWithDecimals(
    document.getElementById('deposit-stablecoin-amount').value,
    'Token amount',
    tokenDecimals
  );
  const recipient = await resolveRecipient('deposit-stablecoin-recipient');
  const paymentRef = requireValue(document.getElementById('deposit-stablecoin-ref').value, 'Payment reference');
  if (isFallback) {
    logEvent(`Using fallback decimals (18). Verify token decimals for ${token}.`);
  }
  await ensureTokenAllowance(token, contract.target, amount, tokenDecimals);
  const tx = await contract.depositStablecoin(token, amount, recipient, paymentRef);
  show(`Stablecoin deposit submitted: ${tx.hash}`);
  await tx.wait();
  show(`Stablecoin deposit confirmed: ${tx.hash}`);
}

async function handleEmergencyWithdraw() {
  const contract = await ensurePaymentProcessor();
  const token = parseAddress(document.getElementById('emergency-token').value, 'Token');
  const to = parseAddress(document.getElementById('emergency-recipient').value, 'Recipient');
  const { decimals: tokenDecimals } = await getTokenDecimals(token);
  const amount = parseTokenAmountWithDecimals(
    document.getElementById('emergency-amount').value,
    'Token amount',
    tokenDecimals
  );
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
  const token = parseTokenAddress(document.getElementById('exchange-rate-token').value, 'Token');
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

async function handleSetTeleporterMessenger() {
  const contract = await ensurePaymentProcessor();
  const messenger = parseAddress(document.getElementById('teleporter-messenger').value, 'Teleporter messenger');
  const tx = await contract.setTeleporterMessenger(messenger);
  show(`Teleporter messenger update submitted: ${tx.hash}`);
  await tx.wait();
  show(`Teleporter messenger update confirmed: ${tx.hash}`);
}

async function handleSetTeleporterGasConfig() {
  const contract = await ensurePaymentProcessor();
  const chainId = parseBytes32(document.getElementById('teleporter-gas-chain-id').value, 'Chain ID');
  const gasLimit = parseUint(document.getElementById('teleporter-gas-limit').value, 'Required gas limit', false);
  const relayerFee = parseUint(document.getElementById('teleporter-relayer-fee').value, 'Relayer fee', true);
  const tx = await contract.setTeleporterGasConfig(chainId, gasLimit, relayerFee);
  show(`Teleporter gas config submitted: ${tx.hash}`);
  await tx.wait();
  show(`Teleporter gas config confirmed: ${tx.hash}`);
}

async function handleSetTeleporterAllowedRelayers() {
  const contract = await ensurePaymentProcessor();
  const chainId = parseBytes32(
    document.getElementById('teleporter-relayer-chain-id').value,
    'Chain ID'
  );
  const relayers = parseAddressList(
    document.getElementById('teleporter-relayer-addresses').value,
    'Relayer addresses'
  );
  const tx = await contract.setTeleporterAllowedRelayers(chainId, relayers);
  show(`Teleporter relayers update submitted: ${tx.hash}`);
  await tx.wait();
  show(`Teleporter relayers update confirmed: ${tx.hash}`);
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
    paused,
    teleporterMessenger
  ] = await Promise.all([
    contract.accumulatedFees(),
    contract.protocolFeeBps(),
    contract.totalAedValueProcessed(),
    contract.totalPaymentsProcessed(),
    contract.defaultDestinationChain(),
    contract.paused(),
    contract.teleporterMessenger()
  ]);
  const output = [
    `Accumulated fees: ${ethers.formatEther(accumulatedFees)} AVAX`,
    `Protocol fee (bps): ${protocolFeeBps}`,
    `Total AED value processed: ${ethers.formatUnits(totalAedValueProcessed, 2)} AED`,
    `Total payments processed: ${totalPaymentsProcessed}`,
    `Default destination chain: ${defaultDestinationChain}`,
    `Teleporter messenger: ${teleporterMessenger}`,
    `Paused: ${paused}`
  ];
  show(output.join('\n'));
}

async function handleRoles() {
  const contract = await ensurePaymentProcessor();
  const abi = await getPaymentProcessorAbi();
  const roles = await fetchRoleValues(contract, abi);
  if (!roles.length) {
    show('No role constants found in ABI.');
    return;
  }
  show(roles.map((role) => `${role.name}: ${role.value}`).join('\n'));
}

async function handleExchangeRate() {
  const contract = await ensurePaymentProcessor();
  const token = parseTokenAddress(document.getElementById('exchange-rate-query-token').value, 'Token');
  const rate = await contract.getExchangeRate(token);
  show(`Exchange rate: ${rate}`);
}

async function handleDestinationManager() {
  const contract = await ensurePaymentProcessor();
  const chainId = parseBytes32(document.getElementById('destination-chain-query-id').value, 'Chain ID');
  const manager = await contract.getDestinationBridgeManager(chainId);
  show(`Bridge manager: ${manager}`);
}

async function handleTeleporterGasConfig() {
  const contract = await ensurePaymentProcessor();
  const chainId = parseBytes32(document.getElementById('teleporter-gas-query-id').value, 'Chain ID');
  const [requiredGasLimit, relayerFee] = await Promise.all([
    contract.teleporterRequiredGasLimit(chainId),
    contract.teleporterRelayerFee(chainId)
  ]);
  show(`Required gas limit: ${requiredGasLimit}\nRelayer fee: ${relayerFee}`);
}

async function handleTeleporterAllowedRelayers() {
  const contract = await ensurePaymentProcessor();
  const chainId = parseBytes32(document.getElementById('teleporter-relayer-query-id').value, 'Chain ID');
  const relayers = await contract.getTeleporterAllowedRelayers(chainId);
  const output = relayers.length ? relayers.join('\n') : 'No relayers configured.';
  show(`Allowed relayers:\n${output}`);
}

async function handleTokenSupported() {
  const contract = await ensurePaymentProcessor();
  const token = parseTokenAddress(document.getElementById('token-supported-token').value, 'Token');
  const supported = await contract.isTokenSupported(token);
  show(`Token supported: ${supported}`);
}

async function handleCalculateAed() {
  const contract = await ensurePaymentProcessor();
  const token = parseTokenAddress(document.getElementById('calculate-aed-token').value, 'Token');
  const { decimals: tokenDecimals, isFallback } = await getTokenDecimals(token);
  const amount = parseTokenAmountWithDecimals(
    document.getElementById('calculate-aed-amount').value,
    'Token amount',
    tokenDecimals
  );
  const aedAmount = await contract.calculateAedAmount(token, amount);
  const decimalsNote = isFallback ? ' (fallback used)' : '';
  show(
    [
      `Token decimals: ${tokenDecimals}${decimalsNote}`,
      `Token amount (display): ${ethers.formatUnits(amount, tokenDecimals)}`,
      `Token amount (base units): ${amount}`,
      `AED amount (2 decimals): ${ethers.formatUnits(aedAmount, 2)} AED`
    ].join('\n')
  );
}

async function handleTokenDecimals() {
  const token = parseTokenAddress(document.getElementById('token-decimals-token').value, 'Token');
  const { decimals: tokenDecimals, isFallback } = await getTokenDecimals(token);
  const decimalsNote = isFallback ? ' (fallback used)' : '';
  show(`Token decimals: ${tokenDecimals}${decimalsNote}`);
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
  wireButton('set-teleporter-messenger-btn', handleSetTeleporterMessenger);
  wireButton('set-teleporter-gas-btn', handleSetTeleporterGasConfig);
  wireButton('set-teleporter-relayers-btn', handleSetTeleporterAllowedRelayers);
  wireButton('withdraw-fees-btn', handleWithdrawFees);
  wireButton('grant-role-btn', handleGrantRole);
  wireButton('revoke-role-btn', handleRevokeRole);
  wireButton('renounce-role-btn', handleRenounceRole);
  wireButton('summary-btn', handleSummary);
  wireButton('roles-btn', handleRoles);
  wireButton('exchange-rate-btn', handleExchangeRate);
  wireButton('destination-manager-btn', handleDestinationManager);
  wireButton('teleporter-gas-btn', handleTeleporterGasConfig);
  wireButton('teleporter-relayers-btn', handleTeleporterAllowedRelayers);
  wireButton('token-supported-btn', handleTokenSupported);
  wireButton('token-decimals-btn', handleTokenDecimals);
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
