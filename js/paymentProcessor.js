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
import { parseDecimalAmount } from './amounts.js';

const ethers = window.ethers;

if (!ethers) {
  throw new Error('Ethers library not loaded. Ensure the ethers script is included before paymentProcessor.js.');
}

let paymentProcessorAbi = null;
let paymentProcessor = null;
const RATE_DECIMALS = 18n;
const AED_STABLECOIN_DECIMALS = 2n;
const AED_DISPLAY_DECIMALS = Number(AED_STABLECOIN_DECIMALS);
const NATIVE_AVAX_DECIMALS = 18;
const NATIVE_EAED_DECIMALS = 18;
const HARDCODED_TOKENS = [
  {
    chain: 'Avalanche Fuji C-Chain',
    symbol: 'USDC',
    address: '0x5425890298aed601595a70AB815c96711a31Bc65',
    decimals: 6
  },
  {
    chain: 'Avalanche Fuji C-Chain',
    symbol: 'EUROe',
    address: '0xA089a21902914C3f3325dBE2334E9B466071E5f1',
    decimals: 6
  },
  {
    chain: 'Falaj Testnet',
    symbol: 'AED Stablecoin',
    address: '0xa5be895EB6DD499b688AE4bD42Fd78500cE24b0F',
    decimals: 2
  }
];
const NATIVE_TOKEN_REFERENCES = [
  {
    chain: 'Avalanche Fuji C-Chain',
    symbol: 'AVAX',
    address: 'native',
    decimals: NATIVE_AVAX_DECIMALS
  },
  {
    chain: 'Falaj Testnet',
    symbol: 'E-AED',
    address: 'native',
    decimals: NATIVE_EAED_DECIMALS
  }
];
const HARDCODED_TOKEN_MAP = new Map(
  HARDCODED_TOKENS.map((token) => [token.address.toLowerCase(), token])
);
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
  if (['native', 'avax', 'e-aed', 'eaed', '0x0'].includes(lowered)) {
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
  return parseDecimalAmount(value, decimals, label);
}

function calculateAedAmount(amount, rate, sourceDecimals) {
  const divisor = 10n ** (BigInt(sourceDecimals) + RATE_DECIMALS - AED_STABLECOIN_DECIMALS);
  return (amount * rate) / divisor;
}

function parseEtherAmount(value, label) {
  return parseDecimalAmount(value, NATIVE_AVAX_DECIMALS, label);
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

async function getExchangeRate(contract, token) {
  const rate = await contract.getExchangeRate(token);
  if (rate === 0n) {
    throw new Error(`Token ${token} is not supported. Configure an exchange rate first.`);
  }
  return rate;
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
    return { decimals: NATIVE_AVAX_DECIMALS, source: 'native (AVAX)' };
  }
  const hardcoded = HARDCODED_TOKEN_MAP.get(tokenAddress.toLowerCase());
  if (hardcoded) {
    return { decimals: hardcoded.decimals, source: `hardcoded (${hardcoded.symbol})` };
  }
  const signer = getSigner();
  const provider = signer?.provider ?? signer;
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  try {
    const decimals = await token.decimals();
    return { decimals: Number(decimals), source: 'onchain' };
  } catch (err) {
    logEvent(`Warning: failed to read token decimals for ${tokenAddress}. Using fallback of 18.`);
    return { decimals: 18, source: 'fallback' };
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
  const { decimals: tokenDecimals, source } = await getTokenDecimals(token);
  const amount = parseTokenAmountWithDecimals(
    document.getElementById('deposit-stablecoin-amount').value,
    'Token amount',
    tokenDecimals
  );
  const recipient = await resolveRecipient('deposit-stablecoin-recipient');
  const paymentRef = requireValue(document.getElementById('deposit-stablecoin-ref').value, 'Payment reference');
  if (source === 'fallback') {
    logEvent(`Using fallback decimals (18). Verify token decimals for ${token}.`);
  }
  const exchangeRate = await getExchangeRate(contract, token);
  const aedAmount = calculateAedAmount(amount, exchangeRate, tokenDecimals);
  logEvent(`Token decimals: ${tokenDecimals} (${source})`);
  logEvent(`Exchange rate (18 decimals): ${exchangeRate}`);
  logEvent(
    `AED amount (${AED_DISPLAY_DECIMALS} decimals): ${ethers.formatUnits(aedAmount, AED_DISPLAY_DECIMALS)} AED`
  );
  if (aedAmount === 0n) {
    throw new Error('AED amount rounds to 0. Increase the token amount or update the exchange rate.');
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
  const { decimals: tokenDecimals, source } = await getTokenDecimals(token);
  const amount = parseTokenAmountWithDecimals(
    document.getElementById('emergency-amount').value,
    'Token amount',
    tokenDecimals
  );
  logEvent(`Token decimals: ${tokenDecimals} (${source})`);
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
    `Total AED value processed: ${ethers.formatUnits(totalAedValueProcessed, AED_DISPLAY_DECIMALS)} AED`,
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
  const { decimals: tokenDecimals, source } = await getTokenDecimals(token);
  const amount = parseTokenAmountWithDecimals(
    document.getElementById('calculate-aed-amount').value,
    'Token amount',
    tokenDecimals
  );
  const aedAmount = await contract.calculateAedAmount(token, amount);
  show(
    [
      `Token decimals: ${tokenDecimals} (${source})`,
      `Token amount (display): ${ethers.formatUnits(amount, tokenDecimals)}`,
      `Token amount (base units): ${amount}`,
      `AED amount (${AED_DISPLAY_DECIMALS} decimals): ${ethers.formatUnits(aedAmount, AED_DISPLAY_DECIMALS)} AED`
    ].join('\n')
  );
}

async function handleTokenDecimals() {
  const token = parseTokenAddress(document.getElementById('token-decimals-token').value, 'Token');
  const { decimals: tokenDecimals, source } = await getTokenDecimals(token);
  show(`Token decimals: ${tokenDecimals} (${source})`);
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

function renderTokenReference() {
  const list = document.getElementById('token-reference-list');
  if (!list) return;
  list.innerHTML = '';
  NATIVE_TOKEN_REFERENCES.forEach((token) => {
    const item = document.createElement('li');
    item.textContent = `${token.symbol} (${token.chain}) — ${token.address} (decimals: ${token.decimals})`;
    list.appendChild(item);
  });
  HARDCODED_TOKENS.forEach((token) => {
    const item = document.createElement('li');
    item.textContent = `${token.symbol} (${token.chain}) — ${token.address} (decimals: ${token.decimals})`;
    list.appendChild(item);
  });

  const datalist = document.getElementById('payment-processor-token-list');
  if (!datalist) return;
  datalist.innerHTML = '';
  const nativeOption = document.createElement('option');
  nativeOption.value = 'native';
  nativeOption.label = `Native AVAX (${NATIVE_AVAX_DECIMALS} decimals)`;
  datalist.appendChild(nativeOption);
  HARDCODED_TOKENS.forEach((token) => {
    const option = document.createElement('option');
    option.value = token.address;
    option.label = `${token.symbol} (${token.chain})`;
    datalist.appendChild(option);
  });
}

function boot() {
  initLogs();
  renderContractAddress();
  renderTokenReference();
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
