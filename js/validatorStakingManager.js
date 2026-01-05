import {
  EXPLORER_BASE,
  FALAJ_NETWORK,
  VALIDATOR_STAKING_MANAGER_ABI_URL,
  VALIDATOR_STAKING_MANAGER_ADDRESS
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
  throw new Error('Ethers library not loaded. Ensure the ethers script is included before validatorStakingManager.js.');
}

let stakingManagerAbi = null;
let stakingManager = null;

function normalizeAbi(abiData) {
  if (Array.isArray(abiData)) {
    return abiData;
  }
  if (abiData?.abi && Array.isArray(abiData.abi)) {
    return abiData.abi;
  }
  throw new Error('Invalid Validator Staking Manager ABI format.');
}

async function getStakingManagerAbi() {
  if (stakingManagerAbi) {
    return stakingManagerAbi;
  }
  const embedded = document.getElementById('validator-staking-manager-abi');
  if (embedded?.textContent?.trim()) {
    stakingManagerAbi = normalizeAbi(JSON.parse(embedded.textContent));
    return stakingManagerAbi;
  }
  const response = await fetch(VALIDATOR_STAKING_MANAGER_ABI_URL);
  if (!response.ok) {
    throw new Error(`Failed to load Validator Staking Manager ABI (${response.status})`);
  }
  stakingManagerAbi = normalizeAbi(await response.json());
  return stakingManagerAbi;
}

function show(msg) {
  document.getElementById('msg').textContent = msg;
}

function setActionButtonsEnabled(enabled) {
  const actionButtons = [
    'stake-btn',
    'unstake-btn',
    'register-validator-btn',
    'deregister-validator-btn',
    'claim-rewards-btn',
    'distribute-rewards-btn',
    'slash-btn',
    'set-fee-distribution-btn',
    'set-grace-period-btn',
    'set-slash-receiver-btn',
    'set-stake-ratio-btn',
    'grant-role-btn',
    'revoke-role-btn',
    'renounce-role-btn',
    'summary-btn',
    'validator-details-btn',
    'validator-stake-btn',
    'required-stake-btn',
    'stake-deficit-btn',
    'is-validator-btn',
    'is-compliant-btn',
    'grace-deadline-btn',
    'validators-paginated-btn'
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

async function ensureStakingManager() {
  if (stakingManager) {
    return stakingManager;
  }
  const signer = getSigner();
  if (!signer) {
    throw new Error('Wallet not connected.');
  }
  const abi = await getStakingManagerAbi();
  stakingManager = new ethers.Contract(VALIDATOR_STAKING_MANAGER_ADDRESS, abi, signer);
  return stakingManager;
}

async function handleConnect() {
  await connectWallet();
  try {
    await ensureCorrectNetwork(FALAJ_NETWORK);
  } catch (err) {
    await switchNetwork(FALAJ_NETWORK);
  }
  await ensureStakingManager();
  document.getElementById('connect-btn').style.display = 'none';
  document.getElementById('disconnect-btn').style.display = 'inline-block';
  setActionButtonsEnabled(true);
  show('Wallet connected.');
}

function handleDisconnect() {
  disconnectWallet();
  stakingManager = null;
  document.getElementById('connect-btn').style.display = 'inline-block';
  document.getElementById('disconnect-btn').style.display = 'none';
  setActionButtonsEnabled(false);
  show('Wallet disconnected.');
}

function renderContractAddress() {
  const target = document.getElementById('contract-address');
  const explorerLink = `${EXPLORER_BASE}/address/${VALIDATOR_STAKING_MANAGER_ADDRESS}`;
  target.innerHTML = `Contract: <a href="${explorerLink}" target="_blank">${VALIDATOR_STAKING_MANAGER_ADDRESS}</a>`;
}

async function handleStake() {
  const contract = await ensureStakingManager();
  const amount = parseEtherAmount(document.getElementById('stake-amount').value, 'Stake amount');
  const tx = await contract.stake({ value: amount });
  show(`Stake submitted: ${tx.hash}`);
  await tx.wait();
  show(`Stake confirmed: ${tx.hash}`);
}

async function handleUnstake() {
  const contract = await ensureStakingManager();
  const amount = parseTokenAmount(document.getElementById('unstake-amount').value, 'Unstake amount');
  const tx = await contract.unstake(amount);
  show(`Unstake submitted: ${tx.hash}`);
  await tx.wait();
  show(`Unstake confirmed: ${tx.hash}`);
}

async function handleRegisterValidator() {
  const contract = await ensureStakingManager();
  const validator = parseAddress(document.getElementById('register-validator-address').value, 'Validator');
  const nodeId = parseBytes32(document.getElementById('register-node-id').value, 'Node ID');
  const tx = await contract.registerValidator(validator, nodeId);
  show(`Register validator submitted: ${tx.hash}`);
  await tx.wait();
  show(`Register validator confirmed: ${tx.hash}`);
}

async function handleDeregisterValidator() {
  const contract = await ensureStakingManager();
  const validator = parseAddress(document.getElementById('deregister-validator-address').value, 'Validator');
  const tx = await contract.deregisterValidator(validator);
  show(`Deregister validator submitted: ${tx.hash}`);
  await tx.wait();
  show(`Deregister validator confirmed: ${tx.hash}`);
}

async function handleClaimRewards() {
  const contract = await ensureStakingManager();
  const tx = await contract.claimRewards();
  show(`Claim rewards submitted: ${tx.hash}`);
  await tx.wait();
  show(`Claim rewards confirmed: ${tx.hash}`);
}

async function handleDistributeRewards() {
  const contract = await ensureStakingManager();
  const totalRewards = parseTokenAmount(document.getElementById('distribute-rewards-amount').value, 'Rewards amount');
  const tx = await contract.distributeRewards(totalRewards);
  show(`Distribute rewards submitted: ${tx.hash}`);
  await tx.wait();
  show(`Distribute rewards confirmed: ${tx.hash}`);
}

async function handleSlash() {
  const contract = await ensureStakingManager();
  const validator = parseAddress(document.getElementById('slash-validator').value, 'Validator');
  const amount = parseTokenAmount(document.getElementById('slash-amount').value, 'Slash amount');
  const reason = requireValue(document.getElementById('slash-reason').value, 'Slash reason');
  const tx = await contract.slash(validator, amount, reason);
  show(`Slash submitted: ${tx.hash}`);
  await tx.wait();
  show(`Slash confirmed: ${tx.hash}`);
}

async function handleSetFeeDistribution() {
  const contract = await ensureStakingManager();
  const feeDistribution = parseAddress(document.getElementById('fee-distribution-address').value, 'Fee distribution');
  const tx = await contract.setFeeDistribution(feeDistribution);
  show(`Fee distribution update submitted: ${tx.hash}`);
  await tx.wait();
  show(`Fee distribution update confirmed: ${tx.hash}`);
}

async function handleSetGracePeriod() {
  const contract = await ensureStakingManager();
  const secondsValue = parseUint(document.getElementById('grace-period-seconds').value, 'Grace period seconds');
  const tx = await contract.setGracePeriod(secondsValue);
  show(`Grace period submitted: ${tx.hash}`);
  await tx.wait();
  show(`Grace period confirmed: ${tx.hash}`);
}

async function handleSetSlashReceiver() {
  const contract = await ensureStakingManager();
  const receiver = parseAddress(document.getElementById('slash-receiver-address').value, 'Slash receiver');
  const tx = await contract.setSlashReceiver(receiver);
  show(`Slash receiver submitted: ${tx.hash}`);
  await tx.wait();
  show(`Slash receiver confirmed: ${tx.hash}`);
}

async function handleSetStakeRatio() {
  const contract = await ensureStakingManager();
  const ratio = parseUint(document.getElementById('stake-ratio-bps').value, 'Stake ratio (bps)');
  const tx = await contract.setStakeToIssuanceRatio(ratio);
  show(`Stake ratio submitted: ${tx.hash}`);
  await tx.wait();
  show(`Stake ratio confirmed: ${tx.hash}`);
}

async function handleGrantRole() {
  const contract = await ensureStakingManager();
  const role = parseRole(document.getElementById('grant-role-value').value);
  const account = parseAddress(document.getElementById('grant-role-account').value, 'Account');
  const tx = await contract.grantRole(role, account);
  show(`Grant role submitted: ${tx.hash}`);
  await tx.wait();
  show(`Grant role confirmed: ${tx.hash}`);
}

async function handleRevokeRole() {
  const contract = await ensureStakingManager();
  const role = parseRole(document.getElementById('revoke-role-value').value);
  const account = parseAddress(document.getElementById('revoke-role-account').value, 'Account');
  const tx = await contract.revokeRole(role, account);
  show(`Revoke role submitted: ${tx.hash}`);
  await tx.wait();
  show(`Revoke role confirmed: ${tx.hash}`);
}

async function handleRenounceRole() {
  const contract = await ensureStakingManager();
  const role = parseRole(document.getElementById('renounce-role-value').value);
  const account = parseAddress(document.getElementById('renounce-role-account').value, 'Account');
  const tx = await contract.renounceRole(role, account);
  show(`Renounce role submitted: ${tx.hash}`);
  await tx.wait();
  show(`Renounce role confirmed: ${tx.hash}`);
}

async function handleSummary() {
  const contract = await ensureStakingManager();
  const [
    contractBalance,
    totalStaked,
    totalPendingRewards,
    validatorCount,
    gracePeriod,
    stakeRatio,
    feeDistribution,
    slashReceiver
  ] = await Promise.all([
    contract.getContractBalance(),
    contract.getTotalStaked(),
    contract.getTotalPendingRewards(),
    contract.getValidatorCount(),
    contract.gracePeriod(),
    contract.stakeToIssuanceRatio(),
    contract.feeDistribution(),
    contract.slashReceiver()
  ]);
  const output = [
    `Contract balance: ${ethers.formatEther(contractBalance)} AVAX`,
    `Total staked: ${ethers.formatEther(totalStaked)} AVAX`,
    `Total pending rewards: ${ethers.formatEther(totalPendingRewards)} AVAX`,
    `Validator count: ${validatorCount}`,
    `Grace period (seconds): ${gracePeriod}`,
    `Stake ratio (bps): ${stakeRatio}`,
    `Fee distribution: ${feeDistribution}`,
    `Slash receiver: ${slashReceiver}`
  ];
  show(output.join('\n'));
}

async function handleValidatorDetails() {
  const contract = await ensureStakingManager();
  const validator = parseAddress(document.getElementById('validator-details-address').value, 'Validator');
  const details = await contract.getValidatorDetails(validator);
  const output = [
    `Registered: ${details.registered}`,
    `Node ID: ${details.nodeId}`,
    `Staked amount: ${ethers.formatEther(details.stakedAmount)} AVAX`,
    `Pending reward: ${ethers.formatEther(details.pendingReward)} AVAX`,
    `Required stake: ${ethers.formatEther(details.requiredStake)} AVAX`,
    `Compliant: ${details.compliant}`,
    `Grace period deadline: ${details.gracePeriodDeadline}`
  ];
  show(output.join('\n'));
}

async function handleValidatorStake() {
  const contract = await ensureStakingManager();
  const validator = parseAddress(document.getElementById('validator-stake-address').value, 'Validator');
  const stake = await contract.getStake(validator);
  show(`Stake: ${ethers.formatEther(stake)} AVAX`);
}

async function handleRequiredStake() {
  const contract = await ensureStakingManager();
  const issuer = parseAddress(document.getElementById('required-stake-issuer').value, 'Issuer');
  const required = await contract.getRequiredStake(issuer);
  show(`Required stake: ${ethers.formatEther(required)} AVAX`);
}

async function handleStakeDeficit() {
  const contract = await ensureStakingManager();
  const issuer = parseAddress(document.getElementById('stake-deficit-issuer').value, 'Issuer');
  const deficit = await contract.getStakeDeficit(issuer);
  show(`Stake deficit: ${ethers.formatEther(deficit)} AVAX`);
}

async function handleIsValidator() {
  const contract = await ensureStakingManager();
  const account = parseAddress(document.getElementById('is-validator-account').value, 'Account');
  const result = await contract.isValidator(account);
  show(`Is validator: ${result}`);
}

async function handleIsCompliant() {
  const contract = await ensureStakingManager();
  const issuer = parseAddress(document.getElementById('is-compliant-issuer').value, 'Issuer');
  const result = await contract.isCompliant(issuer);
  show(`Is compliant: ${result}`);
}

async function handleGraceDeadline() {
  const contract = await ensureStakingManager();
  const validator = parseAddress(document.getElementById('grace-deadline-validator').value, 'Validator');
  const deadline = await contract.getGracePeriodDeadline(validator);
  show(`Grace period deadline: ${deadline}`);
}

async function handleValidatorsPaginated() {
  const contract = await ensureStakingManager();
  const offset = parseUint(document.getElementById('validators-offset').value, 'Offset');
  const limit = parseUint(document.getElementById('validators-limit').value, 'Limit');
  const validators = await contract.getValidatorsPaginated(offset, limit);
  show(`Validators: ${validators.addresses.join(', ') || 'None'}`);
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

  wireButton('stake-btn', handleStake);
  wireButton('unstake-btn', handleUnstake);
  wireButton('register-validator-btn', handleRegisterValidator);
  wireButton('deregister-validator-btn', handleDeregisterValidator);
  wireButton('claim-rewards-btn', handleClaimRewards);
  wireButton('distribute-rewards-btn', handleDistributeRewards);
  wireButton('slash-btn', handleSlash);
  wireButton('set-fee-distribution-btn', handleSetFeeDistribution);
  wireButton('set-grace-period-btn', handleSetGracePeriod);
  wireButton('set-slash-receiver-btn', handleSetSlashReceiver);
  wireButton('set-stake-ratio-btn', handleSetStakeRatio);
  wireButton('grant-role-btn', handleGrantRole);
  wireButton('revoke-role-btn', handleRevokeRole);
  wireButton('renounce-role-btn', handleRenounceRole);
  wireButton('summary-btn', handleSummary);
  wireButton('validator-details-btn', handleValidatorDetails);
  wireButton('validator-stake-btn', handleValidatorStake);
  wireButton('required-stake-btn', handleRequiredStake);
  wireButton('stake-deficit-btn', handleStakeDeficit);
  wireButton('is-validator-btn', handleIsValidator);
  wireButton('is-compliant-btn', handleIsCompliant);
  wireButton('grace-deadline-btn', handleGraceDeadline);
  wireButton('validators-paginated-btn', handleValidatorsPaginated);

  setActionButtonsEnabled(false);

  onAccountsChanged(() => {
    show('Account changed. Reconnect if needed.');
  });
  onChainChanged(() => {
    show('Network changed. Reconnect if needed.');
  });
}

boot();
