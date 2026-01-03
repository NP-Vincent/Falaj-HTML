// === CONFIGURATION ===
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

const ethers = window.ethers;

if (!ethers) {
  throw new Error('Ethers library not loaded. Ensure the ethers script is included before identityRegistry.js.');
}

let identityRegistryAbi = null;

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

// === STATE ===
let registry = null;

// === UI UTILS ===
function show(msg) {
  document.getElementById('msg').textContent = msg;
}

function setActionButtonsEnabled(enabled) {
  const actionButtons = [
    'add-participant-btn',
    'change-role-btn',
    'renew-kyc-btn',
    'remove-participant-btn',
    'freeze-btn',
    'unfreeze-btn',
    'pause-btn',
    'unpause-btn',
    'precompile-btn',
    'lookup-btn',
    'current-role-btn',
    'check-role-btn',
    'allowed-btn',
    'state-btn',
    'participants-btn'
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
  return value;
}

function parseExpiry(value) {
  const sanitized = requireValue(value, 'Expiry timestamp');
  const parsed = Number(sanitized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Expiry timestamp must be a positive number.');
  }
  return BigInt(Math.trunc(parsed));
}

function parseRole(value) {
  const sanitized = requireValue(value, 'Role');
  if (sanitized.startsWith('0x') && sanitized.length === 66) {
    return sanitized;
  }
  return ethers.id(sanitized);
}

const ROLE_LABELS = [
  'REGULATOR',
  'ISSUER_STABLECOIN',
  'ISSUER_BOND',
  'CUSTODIAN',
  'PARTICIPANT'
];

const ROLE_HASHES = ROLE_LABELS.reduce((acc, label) => {
  acc[label] = ethers.id(label);
  return acc;
}, {});

function formatRole(roleHash) {
  const match = Object.entries(ROLE_HASHES).find(([, hash]) => hash.toLowerCase() === roleHash.toLowerCase());
  return match ? `${match[0]} (${roleHash})` : roleHash;
}

function formatExpiry(expiry) {
  const expiryNumber = Number(expiry);
  if (!Number.isFinite(expiryNumber) || expiryNumber <= 0) {
    return `${expiry}`;
  }
  const date = new Date(expiryNumber * 1000);
  return `${expiry} (${date.toISOString()})`;
}

function parsePagination(value, label) {
  const sanitized = requireValue(value, label);
  const parsed = Number(sanitized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return BigInt(Math.trunc(parsed));
}

// === WALLET CONNECTION LOGIC ===
async function syncRegistryWithSigner() {
  const signer = getSigner();
  if (!signer) {
    registry = null;
    return;
  }
  const abi = await getIdentityRegistryAbi();
  registry = new ethers.Contract(IDENTITY_REGISTRY_ADDRESS, abi, signer);
}

function handleDisconnectUi() {
  registry = null;
  setActionButtonsEnabled(false);
  document.getElementById('disconnect-btn').style.display = 'none';
  show('Wallet disconnected');
}

// === MAIN UI HANDLING ===
document.addEventListener('DOMContentLoaded', async () => {
  setActionButtonsEnabled(false);

  // Connect Wallet
  document.getElementById('connect-btn').onclick = async () => {
    show('Connecting...');
    try {
      await connectWallet('metamask');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      document.getElementById('disconnect-btn').style.display = '';
      document.getElementById('disconnect-btn').onclick = () => {
        disconnectWallet();
        handleDisconnectUi();
      };
      const signer = getSigner();
      const address = await signer.getAddress();
      show(`Wallet connected to ${FALAJ_NETWORK.chainName}\nAddress: ${address}`);
      setActionButtonsEnabled(true);
    } catch (err) {
      show('Connection or network switch failed:\n' + (err.message || err));
      disconnectWallet();
      handleDisconnectUi();
    }
  };

  document.getElementById('add-participant-btn').onclick = async () => {
    try {
      show('Adding participant...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      await syncRegistryWithSigner();
      const account = requireValue(document.getElementById('add-account').value.trim(), 'Account address');
      const role = parseRole(document.getElementById('add-role').value.trim());
      const expiry = parseExpiry(document.getElementById('add-expiry').value.trim());
      const tx = await registry.addParticipant(account, role, expiry);
      const receipt = await tx.wait();
      show(`✅ Participant added\nTx hash: ${receipt.transactionHash}\nExplorer: ${EXPLORER_BASE}`);
    } catch (err) {
      show('Add participant failed:\n' + (err.message || err));
    }
  };

  document.getElementById('change-role-btn').onclick = async () => {
    try {
      show('Changing role...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      await syncRegistryWithSigner();
      const account = requireValue(document.getElementById('change-account').value.trim(), 'Account address');
      const role = parseRole(document.getElementById('change-role').value.trim());
      const tx = await registry.changeRole(account, role);
      const receipt = await tx.wait();
      show(`✅ Role changed\nTx hash: ${receipt.transactionHash}\nExplorer: ${EXPLORER_BASE}`);
    } catch (err) {
      show('Change role failed:\n' + (err.message || err));
    }
  };

  document.getElementById('renew-kyc-btn').onclick = async () => {
    try {
      show('Renewing KYC...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      await syncRegistryWithSigner();
      const account = requireValue(document.getElementById('renew-account').value.trim(), 'Account address');
      const expiry = parseExpiry(document.getElementById('renew-expiry').value.trim());
      const tx = await registry.renewKYC(account, expiry);
      const receipt = await tx.wait();
      show(`✅ KYC renewed\nTx hash: ${receipt.transactionHash}\nExplorer: ${EXPLORER_BASE}`);
    } catch (err) {
      show('Renew KYC failed:\n' + (err.message || err));
    }
  };

  document.getElementById('remove-participant-btn').onclick = async () => {
    try {
      show('Removing participant...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      await syncRegistryWithSigner();
      const account = requireValue(document.getElementById('remove-account').value.trim(), 'Account address');
      const tx = await registry.removeParticipant(account);
      const receipt = await tx.wait();
      show(`✅ Participant removed\nTx hash: ${receipt.transactionHash}\nExplorer: ${EXPLORER_BASE}`);
    } catch (err) {
      show('Remove participant failed:\n' + (err.message || err));
    }
  };

  document.getElementById('freeze-btn').onclick = async () => {
    try {
      show('Freezing participant...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      await syncRegistryWithSigner();
      const account = requireValue(document.getElementById('freeze-account').value.trim(), 'Account address');
      const reason = requireValue(document.getElementById('freeze-reason').value.trim(), 'Reason');
      const tx = await registry.freezeAccount(account, reason);
      const receipt = await tx.wait();
      show(`✅ Participant frozen\nTx hash: ${receipt.transactionHash}\nExplorer: ${EXPLORER_BASE}`);
    } catch (err) {
      show('Freeze failed:\n' + (err.message || err));
    }
  };

  document.getElementById('unfreeze-btn').onclick = async () => {
    try {
      show('Unfreezing participant...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      await syncRegistryWithSigner();
      const account = requireValue(document.getElementById('freeze-account').value.trim(), 'Account address');
      const tx = await registry.unfreezeAccount(account);
      const receipt = await tx.wait();
      show(`✅ Participant unfrozen\nTx hash: ${receipt.transactionHash}\nExplorer: ${EXPLORER_BASE}`);
    } catch (err) {
      show('Unfreeze failed:\n' + (err.message || err));
    }
  };

  document.getElementById('pause-btn').onclick = async () => {
    try {
      show('Pausing registry...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      await syncRegistryWithSigner();
      const tx = await registry.pause();
      const receipt = await tx.wait();
      show(`✅ Registry paused\nTx hash: ${receipt.transactionHash}\nExplorer: ${EXPLORER_BASE}`);
    } catch (err) {
      show('Pause failed:\n' + (err.message || err));
    }
  };

  document.getElementById('unpause-btn').onclick = async () => {
    try {
      show('Unpausing registry...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      await syncRegistryWithSigner();
      const tx = await registry.unpause();
      const receipt = await tx.wait();
      show(`✅ Registry unpaused\nTx hash: ${receipt.transactionHash}\nExplorer: ${EXPLORER_BASE}`);
    } catch (err) {
      show('Unpause failed:\n' + (err.message || err));
    }
  };

  document.getElementById('precompile-btn').onclick = async () => {
    try {
      show('Updating precompile sync...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      await syncRegistryWithSigner();
      const enabled = document.getElementById('precompile-enabled').value === 'true';
      const tx = await registry.setPrecompileSync(enabled);
      const receipt = await tx.wait();
      show(`✅ Precompile sync updated (${enabled ? 'enabled' : 'disabled'})\nTx hash: ${receipt.transactionHash}\nExplorer: ${EXPLORER_BASE}`);
    } catch (err) {
      show('Precompile sync update failed:\n' + (err.message || err));
    }
  };

  document.getElementById('lookup-btn').onclick = async () => {
    try {
      show('Fetching participant...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      await syncRegistryWithSigner();
      const account = requireValue(document.getElementById('lookup-account').value.trim(), 'Account address');
      const participant = await registry.getParticipant(account);
      show(
        `Participant details for ${account}\n`
        + `Whitelisted: ${participant[0]}\n`
        + `Role: ${formatRole(participant[1])}\n`
        + `KYC expiry: ${formatExpiry(participant[2])}\n`
        + `Frozen: ${participant[3]}`
      );
    } catch (err) {
      show('Lookup failed:\n' + (err.message || err));
    }
  };

  document.getElementById('current-role-btn').onclick = async () => {
    try {
      show('Fetching current role...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      await syncRegistryWithSigner();
      const account = requireValue(document.getElementById('current-role-account').value.trim(), 'Account address');
      const role = await registry.participantRole(account);
      show(`Current role for ${account}\nRole: ${formatRole(role)}`);
    } catch (err) {
      show('Current role lookup failed:\n' + (err.message || err));
    }
  };

  document.getElementById('check-role-btn').onclick = async () => {
    try {
      show('Checking role...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      await syncRegistryWithSigner();
      const account = requireValue(document.getElementById('check-role-account').value.trim(), 'Account address');
      const roleValue = parseRole(document.getElementById('check-role-value').value.trim());
      const hasRole = await registry.hasParticipantRole(account, roleValue);
      show(`Role check for ${account}\nRole: ${formatRole(roleValue)}\nHas role: ${hasRole}`);
    } catch (err) {
      show('Role check failed:\n' + (err.message || err));
    }
  };

  document.getElementById('allowed-btn').onclick = async () => {
    try {
      show('Checking allowlist...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      await syncRegistryWithSigner();
      const account = requireValue(document.getElementById('allowed-account').value.trim(), 'Account address');
      const allowed = await registry.isAllowedToTransact(account);
      show(`Allowed to transact for ${account}\nAllowed: ${allowed}`);
    } catch (err) {
      show('Allowlist check failed:\n' + (err.message || err));
    }
  };

  document.getElementById('state-btn').onclick = async () => {
    try {
      show('Fetching participant state...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      await syncRegistryWithSigner();
      const account = requireValue(document.getElementById('state-account').value.trim(), 'Account address');
      const [whitelisted, role, expiry, frozen, allowed] = await Promise.all([
        registry.isWhitelisted(account),
        registry.participantRole(account),
        registry.kycExpiry(account),
        registry.isFrozen(account),
        registry.isAllowedToTransact(account)
      ]);
      const syncEnabled = await registry.precompileSyncEnabled();
      show(
        `Participant state for ${account}\n`
        + `Whitelisted: ${whitelisted}\n`
        + `Role: ${formatRole(role)}\n`
        + `KYC expiry: ${formatExpiry(expiry)}\n`
        + `Frozen: ${frozen}\n`
        + `Allowed to transact: ${allowed}\n`
        + `Precompile sync enabled: ${syncEnabled}`
      );
    } catch (err) {
      show('Participant state failed:\n' + (err.message || err));
    }
  };

  document.getElementById('participants-btn').onclick = async () => {
    try {
      show('Fetching participants...');
      await switchNetwork(FALAJ_NETWORK);
      await ensureCorrectNetwork(FALAJ_NETWORK);
      await syncRegistryWithSigner();
      const offset = parsePagination(document.getElementById('participants-offset').value.trim(), 'Offset');
      const limit = parsePagination(document.getElementById('participants-limit').value.trim(), 'Limit');
      const [participants, total] = await Promise.all([
        registry.getParticipants(offset, limit),
        registry.participantCount()
      ]);
      const formatted = participants.length ? participants.join('\n') : 'No participants found for this range.';
      show(
        `Participants (${offset} - ${offset + limit - 1n})\n`
        + `Total registered: ${total}\n`
        + `${formatted}`
      );
    } catch (err) {
      show('Participants fetch failed:\n' + (err.message || err));
    }
  };

  // Disconnect
  document.getElementById('disconnect-btn').onclick = () => {
    disconnectWallet();
    handleDisconnectUi();
  };

  onAccountsChanged((accounts) => {
    if (!accounts || accounts.length === 0) {
      disconnectWallet();
      handleDisconnectUi();
    }
  });

  onChainChanged(() => {
    disconnectWallet();
    handleDisconnectUi();
    show('Network changed. Please reconnect your wallet.');
  });
});
