import {
  EXPLORER_BASE,
  FALAJ_NETWORK,
  IDENTITY_REGISTRY_ABI_URL,
  IDENTITY_REGISTRY_ADDRESS
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
  throw new Error('Ethers library not loaded. Ensure the ethers script is included before identityRegistry.js.');
}

let identityRegistryAbi = null;
let identityRegistry = null;

function normalizeAbi(abiData) {
  if (Array.isArray(abiData)) {
    return abiData;
  }
  if (abiData?.abi && Array.isArray(abiData.abi)) {
    return abiData.abi;
  }
  throw new Error('Invalid Identity Registry ABI format.');
}

async function getIdentityRegistryAbi() {
  if (identityRegistryAbi) {
    return identityRegistryAbi;
  }
  const embedded = document.getElementById('identity-registry-abi');
  if (embedded?.textContent?.trim()) {
    identityRegistryAbi = normalizeAbi(JSON.parse(embedded.textContent));
    return identityRegistryAbi;
  }
  const response = await fetch(IDENTITY_REGISTRY_ABI_URL);
  if (!response.ok) {
    throw new Error(`Failed to load Identity Registry ABI (${response.status})`);
  }
  identityRegistryAbi = normalizeAbi(await response.json());
  return identityRegistryAbi;
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
    'add-participant-btn',
    'change-role-btn',
    'renew-kyc-btn',
    'freeze-btn',
    'unfreeze-btn',
    'remove-participant-btn',
    'pause-btn',
    'unpause-btn',
    'set-precompile-sync-btn',
    'grant-role-btn',
    'revoke-role-btn',
    'renounce-role-btn',
    'summary-btn',
    'get-participant-btn',
    'get-participants-btn',
    'role-admin-btn',
    'has-role-btn',
    'has-participant-role-btn',
    'participant-role-btn',
    'roles-btn',
    'allowed-btn',
    'whitelisted-btn',
    'frozen-btn',
    'kyc-expiry-btn'
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

async function ensureIdentityRegistry() {
  if (identityRegistry) {
    return identityRegistry;
  }
  const signer = getSigner();
  if (!signer) {
    throw new Error('Wallet not connected.');
  }
  const abi = await getIdentityRegistryAbi();
  identityRegistry = new ethers.Contract(IDENTITY_REGISTRY_ADDRESS, abi, signer);
  return identityRegistry;
}

async function handleConnect() {
  await connectWallet();
  try {
    await ensureCorrectNetwork(FALAJ_NETWORK);
  } catch (err) {
    await switchNetwork(FALAJ_NETWORK);
  }
  await ensureIdentityRegistry();
  document.getElementById('connect-btn').style.display = 'none';
  document.getElementById('disconnect-btn').style.display = 'inline-block';
  setActionButtonsEnabled(true);
  show('Wallet connected.');
}

function handleDisconnect() {
  disconnectWallet();
  identityRegistry = null;
  document.getElementById('connect-btn').style.display = 'inline-block';
  document.getElementById('disconnect-btn').style.display = 'none';
  setActionButtonsEnabled(false);
  show('Wallet disconnected.');
}

function renderContractAddress() {
  const target = document.getElementById('contract-address');
  const explorerLink = `${EXPLORER_BASE}/address/${IDENTITY_REGISTRY_ADDRESS}`;
  target.innerHTML = `Contract: <a href="${explorerLink}" target="_blank">${IDENTITY_REGISTRY_ADDRESS}</a>`;
}

async function handleAddParticipant() {
  const contract = await ensureIdentityRegistry();
  const account = parseAddress(document.getElementById('add-participant-account').value, 'Participant address');
  const role = parseRole(document.getElementById('add-participant-role').value);
  const expiry = parseUint(document.getElementById('add-participant-expiry').value, 'KYC expiry');
  const tx = await contract.addParticipant(account, role, expiry);
  show(`Add participant submitted: ${tx.hash}`);
  await tx.wait();
  show(`Add participant confirmed: ${tx.hash}`);
}

async function handleChangeRole() {
  const contract = await ensureIdentityRegistry();
  const account = parseAddress(document.getElementById('change-role-account').value, 'Participant address');
  const role = parseRole(document.getElementById('change-role-value').value);
  const tx = await contract.changeRole(account, role);
  show(`Change role submitted: ${tx.hash}`);
  await tx.wait();
  show(`Change role confirmed: ${tx.hash}`);
}

async function handleRenewKyc() {
  const contract = await ensureIdentityRegistry();
  const account = parseAddress(document.getElementById('renew-kyc-account').value, 'Participant address');
  const expiry = parseUint(document.getElementById('renew-kyc-expiry').value, 'New expiry');
  const tx = await contract.renewKYC(account, expiry);
  show(`Renew KYC submitted: ${tx.hash}`);
  await tx.wait();
  show(`Renew KYC confirmed: ${tx.hash}`);
}

async function handleFreeze() {
  const contract = await ensureIdentityRegistry();
  const account = parseAddress(document.getElementById('freeze-account').value, 'Participant address');
  const reason = requireValue(document.getElementById('freeze-reason').value, 'Reason');
  const tx = await contract.freezeAccount(account, reason);
  show(`Freeze account submitted: ${tx.hash}`);
  await tx.wait();
  show(`Freeze account confirmed: ${tx.hash}`);
}

async function handleUnfreeze() {
  const contract = await ensureIdentityRegistry();
  const account = parseAddress(document.getElementById('unfreeze-account').value, 'Participant address');
  const tx = await contract.unfreezeAccount(account);
  show(`Unfreeze account submitted: ${tx.hash}`);
  await tx.wait();
  show(`Unfreeze account confirmed: ${tx.hash}`);
}

async function handleRemoveParticipant() {
  const contract = await ensureIdentityRegistry();
  const account = parseAddress(document.getElementById('remove-participant-account').value, 'Participant address');
  const tx = await contract.removeParticipant(account);
  show(`Remove participant submitted: ${tx.hash}`);
  await tx.wait();
  show(`Remove participant confirmed: ${tx.hash}`);
}

async function handlePause() {
  const contract = await ensureIdentityRegistry();
  const tx = await contract.pause();
  show(`Pause submitted: ${tx.hash}`);
  await tx.wait();
  show(`Paused: ${tx.hash}`);
}

async function handleUnpause() {
  const contract = await ensureIdentityRegistry();
  const tx = await contract.unpause();
  show(`Unpause submitted: ${tx.hash}`);
  await tx.wait();
  show(`Unpaused: ${tx.hash}`);
}

async function handleSetPrecompileSync() {
  const contract = await ensureIdentityRegistry();
  const enabledValue = document.getElementById('precompile-sync-enabled').value;
  const enabled = enabledValue === 'true';
  const tx = await contract.setPrecompileSync(enabled);
  show(`Precompile sync update submitted: ${tx.hash}`);
  await tx.wait();
  show(`Precompile sync updated: ${tx.hash}`);
}

async function handleGrantRole() {
  const contract = await ensureIdentityRegistry();
  const account = parseAddress(document.getElementById('grant-role-account').value, 'Account');
  const role = parseRole(document.getElementById('grant-role-value').value);
  const tx = await contract.grantRole(role, account);
  show(`Grant role submitted: ${tx.hash}`);
  await tx.wait();
  show(`Grant role confirmed: ${tx.hash}`);
}

async function handleRevokeRole() {
  const contract = await ensureIdentityRegistry();
  const account = parseAddress(document.getElementById('revoke-role-account').value, 'Account');
  const role = parseRole(document.getElementById('revoke-role-value').value);
  const tx = await contract.revokeRole(role, account);
  show(`Revoke role submitted: ${tx.hash}`);
  await tx.wait();
  show(`Revoke role confirmed: ${tx.hash}`);
}

async function handleRenounceRole() {
  const contract = await ensureIdentityRegistry();
  const account = parseAddress(document.getElementById('renounce-role-account').value, 'Account');
  const role = parseRole(document.getElementById('renounce-role-value').value);
  const tx = await contract.renounceRole(role, account);
  show(`Renounce role submitted: ${tx.hash}`);
  await tx.wait();
  show(`Renounce role confirmed: ${tx.hash}`);
}

async function handleSummary() {
  const contract = await ensureIdentityRegistry();
  const [
    count,
    paused,
    precompileSyncEnabled,
    defaultAdminRole,
    custodianRole,
    regulatorRole,
    participantRole,
    issuerBondRole,
    issuerStablecoinRole
  ] = await Promise.all([
    contract.participantCount(),
    contract.paused(),
    contract.precompileSyncEnabled(),
    contract.DEFAULT_ADMIN_ROLE(),
    contract.CUSTODIAN_ROLE(),
    contract.REGULATOR_ROLE(),
    contract.PARTICIPANT_ROLE(),
    contract.ISSUER_BOND_ROLE(),
    contract.ISSUER_STABLECOIN_ROLE()
  ]);
  const lines = [
    `Participant count: ${count}`,
    `Paused: ${paused}`,
    `Precompile sync enabled: ${precompileSyncEnabled}`,
    `DEFAULT_ADMIN_ROLE: ${defaultAdminRole}`,
    `CUSTODIAN_ROLE: ${custodianRole}`,
    `REGULATOR_ROLE: ${regulatorRole}`,
    `PARTICIPANT_ROLE: ${participantRole}`,
    `ISSUER_BOND_ROLE: ${issuerBondRole}`,
    `ISSUER_STABLECOIN_ROLE: ${issuerStablecoinRole}`
  ];
  show(lines.join('\n'));
}

async function handleGetParticipant() {
  const contract = await ensureIdentityRegistry();
  const account = parseAddress(document.getElementById('get-participant-account').value, 'Participant address');
  const [whitelisted, role, expiry, frozen] = await contract.getParticipant(account);
  show([
    `Participant: ${account}`,
    `Whitelisted: ${whitelisted}`,
    `Role: ${role}`,
    `KYC expiry: ${expiry}`,
    `Frozen: ${frozen}`
  ].join('\n'));
}

async function handleGetParticipants() {
  const contract = await ensureIdentityRegistry();
  const offset = parseUint(document.getElementById('get-participants-offset').value, 'Offset');
  const limit = parseUint(document.getElementById('get-participants-limit').value, 'Limit', false);
  const participants = await contract.getParticipants(offset, limit);
  if (!participants.length) {
    show('No participants returned.');
    return;
  }
  show(`Participants: ${participants.join(', ')}`);
}

async function handleRoleAdmin() {
  const contract = await ensureIdentityRegistry();
  const role = parseRole(document.getElementById('role-admin-value').value);
  const admin = await contract.getRoleAdmin(role);
  show(`Role admin: ${admin}`);
}

async function handleHasRole() {
  const contract = await ensureIdentityRegistry();
  const account = parseAddress(document.getElementById('has-role-account').value, 'Account');
  const role = parseRole(document.getElementById('has-role-value').value);
  const hasRole = await contract.hasRole(role, account);
  show(`Has role: ${hasRole}`);
}

async function handleHasParticipantRole() {
  const contract = await ensureIdentityRegistry();
  const account = parseAddress(document.getElementById('has-participant-role-account').value, 'Participant address');
  const role = parseRole(document.getElementById('has-participant-role-value').value);
  const hasRole = await contract.hasParticipantRole(role, account);
  show(`Has participant role: ${hasRole}`);
}

async function handleParticipantRole() {
  const contract = await ensureIdentityRegistry();
  const account = parseAddress(document.getElementById('participant-role-account').value, 'Participant address');
  const role = await contract.participantRole(account);
  show(`Participant role: ${role}`);
}

async function handleRoles() {
  const contract = await ensureIdentityRegistry();
  const abi = await getIdentityRegistryAbi();
  const roles = await fetchRoleValues(contract, abi);
  if (!roles.length) {
    show('No role constants found in ABI.');
    return;
  }
  show(roles.map((role) => `${role.name}: ${role.value}`).join('\n'));
}

async function handleAllowedToTransact() {
  const contract = await ensureIdentityRegistry();
  const account = parseAddress(document.getElementById('allowed-account').value, 'Participant address');
  const allowed = await contract.isAllowedToTransact(account);
  show(`Allowed to transact: ${allowed}`);
}

async function handleIsWhitelisted() {
  const contract = await ensureIdentityRegistry();
  const account = parseAddress(document.getElementById('whitelisted-account').value, 'Participant address');
  const whitelisted = await contract.isWhitelisted(account);
  show(`Whitelisted: ${whitelisted}`);
}

async function handleIsFrozen() {
  const contract = await ensureIdentityRegistry();
  const account = parseAddress(document.getElementById('frozen-account').value, 'Participant address');
  const frozen = await contract.isFrozen(account);
  show(`Frozen: ${frozen}`);
}

async function handleKycExpiry() {
  const contract = await ensureIdentityRegistry();
  const account = parseAddress(document.getElementById('kyc-expiry-account').value, 'Participant address');
  const expiry = await contract.kycExpiry(account);
  show(`KYC expiry: ${expiry}`);
}

function wireButton(id, handler) {
  const button = document.getElementById(id);
  if (!button) return;
  button.addEventListener('click', async () => {
    try {
      await handler();
    } catch (err) {
      showError(err.message || String(err));
    }
  });
}

function boot() {
  initLogs();
  renderContractAddress();

  document.getElementById('connect-btn').addEventListener('click', async () => {
    try {
      await handleConnect();
    } catch (err) {
      showError(err.message || String(err));
    }
  });
  document.getElementById('disconnect-btn').addEventListener('click', handleDisconnect);

  wireButton('add-participant-btn', handleAddParticipant);
  wireButton('change-role-btn', handleChangeRole);
  wireButton('renew-kyc-btn', handleRenewKyc);
  wireButton('freeze-btn', handleFreeze);
  wireButton('unfreeze-btn', handleUnfreeze);
  wireButton('remove-participant-btn', handleRemoveParticipant);
  wireButton('pause-btn', handlePause);
  wireButton('unpause-btn', handleUnpause);
  wireButton('set-precompile-sync-btn', handleSetPrecompileSync);
  wireButton('grant-role-btn', handleGrantRole);
  wireButton('revoke-role-btn', handleRevokeRole);
  wireButton('renounce-role-btn', handleRenounceRole);
  wireButton('summary-btn', handleSummary);
  wireButton('get-participant-btn', handleGetParticipant);
  wireButton('get-participants-btn', handleGetParticipants);
  wireButton('role-admin-btn', handleRoleAdmin);
  wireButton('has-role-btn', handleHasRole);
  wireButton('has-participant-role-btn', handleHasParticipantRole);
  wireButton('participant-role-btn', handleParticipantRole);
  wireButton('roles-btn', handleRoles);
  wireButton('allowed-btn', handleAllowedToTransact);
  wireButton('whitelisted-btn', handleIsWhitelisted);
  wireButton('frozen-btn', handleIsFrozen);
  wireButton('kyc-expiry-btn', handleKycExpiry);

  setActionButtonsEnabled(false);

  onAccountsChanged(() => {
    show('Account changed. Reconnect if needed.');
  });
  onChainChanged(() => {
    show('Network changed. Reconnect if needed.');
  });
}

boot();
