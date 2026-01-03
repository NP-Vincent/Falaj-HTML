import { CHAIN_ID_HEX, IDENTITY_REGISTRY_ADDRESS } from "./config.js";
import { connectWallet, ensureChain } from "./metamask.js";
import {
  addParticipant,
  changeRole,
  freezeAccount,
  getIdentityRegistryContractWithSigner,
  getParticipant,
  getRoleAdmin,
  hasRole,
  hasParticipantRole,
  isAllowedToTransact,
  participantCount,
  pause,
  removeParticipant,
  renewKYC,
  setPrecompileSync,
  unfreezeAccount,
  unpause,
} from "./identityRegistry.js";
import {
  renderError,
  renderTx,
  setConnectedState,
  setDisconnectedState,
  setStatus,
} from "./ui.js";

const ethers = window.ethers;

const DEFAULT_ADMIN_ROLE =
  ethers.constants?.HashZero ??
  ethers.ZeroHash ??
  "0x0000000000000000000000000000000000000000000000000000000000000000";

const state = {
  mmProvider: null,
  contract: null,
  account: null,
};

function requireElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element #${id}`);
  }
  return element;
}

function setText(id, text) {
  requireElement(id).textContent = text;
}

function isValidAddress(value) {
  if (!value) {
    return false;
  }
  if (ethers.utils?.isAddress) {
    return ethers.utils.isAddress(value);
  }
  if (ethers.isAddress) {
    return ethers.isAddress(value);
  }
  return false;
}

function requireConnected() {
  if (!state.mmProvider || !state.account) {
    throw new Error("Connect your wallet first.");
  }
}

function toggleActionButtons(enabled) {
  document.querySelectorAll(".action-btn").forEach((button) => {
    button.disabled = !enabled;
  });
}

function toggleConnectionButtons(connected) {
  requireElement("connect-btn").style.display = connected ? "none" : "inline";
  requireElement("disconnect-btn").style.display = connected
    ? "inline"
    : "none";
}

function normalizeRole(value) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return DEFAULT_ADMIN_ROLE;
  }
  return trimmed;
}

function formatValue(value) {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return String(value);
}

async function handleConnect() {
  try {
    const { mmProvider, accounts } = await connectWallet();
    state.mmProvider = mmProvider;
    await ensureChain(mmProvider);

    state.contract = await getIdentityRegistryContractWithSigner(mmProvider);
    await participantCount(mmProvider);

    const chainId = await mmProvider.request({ method: "eth_chainId" });

    state.account = accounts?.[0] ?? null;

    setConnectedState({
      account: state.account,
      chainId,
      contractAddress: IDENTITY_REGISTRY_ADDRESS,
    });
    toggleActionButtons(true);
    toggleConnectionButtons(true);
  } catch (error) {
    renderError(error);
  }
}

async function handleDisconnect() {
  state.mmProvider = null;
  state.contract = null;
  state.account = null;
  setDisconnectedState();
  toggleActionButtons(false);
  toggleConnectionButtons(false);
}

async function handleParticipantCount() {
  try {
    requireConnected();
    const count = await participantCount(state.mmProvider);
    setText("participant-count", formatValue(count));
    setStatus("Loaded participant count", "read");
  } catch (error) {
    renderError(error);
  }
}

async function handleGetParticipant() {
  try {
    requireConnected();
    const address = requireElement("participant-address").value.trim();
    if (!isValidAddress(address)) {
      throw new Error("Enter a valid participant address.");
    }

    const participant = await getParticipant(state.mmProvider, address);
    setText("participant-whitelisted", formatValue(participant?.whitelisted));
    setText("participant-role", formatValue(participant?.role));
    setText("participant-expiry", formatValue(participant?.expiry));
    setText("participant-frozen", formatValue(participant?.frozen));
    setStatus("Loaded participant details", "read");
  } catch (error) {
    renderError(error);
  }
}

async function handleReadAdmin() {
  try {
    requireConnected();
    const role = normalizeRole(requireElement("admin-role").value);
    const adminRole = await getRoleAdmin(state.mmProvider, role);
    setText("outOwner", adminRole);
    setStatus("Read admin role", "read");
  } catch (error) {
    renderError(error);
  }
}

async function handleCheckStatus() {
  try {
    requireConnected();
    const address = requireElement("inputAddress").value.trim();
    const role = normalizeRole(requireElement("role-input").value);
    if (!isValidAddress(address)) {
      throw new Error("Enter a valid address.");
    }

    const hasAdminRole = await hasRole(state.mmProvider, role, address);

    setText("outStatus", hasAdminRole ? "Yes" : "No");
    setStatus("Checked role status", "read");
  } catch (error) {
    renderError(error);
  }
}

async function handleCheckParticipantRole() {
  try {
    requireConnected();
    const address = requireElement("participant-role-address").value.trim();
    const role = normalizeRole(requireElement("participant-role-input").value);
    if (!isValidAddress(address)) {
      throw new Error("Enter a valid address.");
    }

    const hasRoleResult = await hasParticipantRole(
      state.mmProvider,
      role,
      address,
    );
    setText("participant-role-status", hasRoleResult ? "Yes" : "No");
    setStatus("Checked participant role status", "read");
  } catch (error) {
    renderError(error);
  }
}

async function handleCheckTransactAllowed() {
  try {
    requireConnected();
    const address = requireElement("transact-address").value.trim();
    if (!isValidAddress(address)) {
      throw new Error("Enter a valid address.");
    }

    const allowed = await isAllowedToTransact(state.mmProvider, address);
    setText("transact-status", allowed ? "Yes" : "No");
    setStatus("Checked transaction allowance", "read");
  } catch (error) {
    renderError(error);
  }
}

async function handleAddParticipant() {
  try {
    requireConnected();
    const address = requireElement("add-address").value.trim();
    const role = normalizeRole(requireElement("add-role").value);
    const expiry = requireElement("add-expiry").value.trim();
    if (!isValidAddress(address)) {
      throw new Error("Enter a valid address to add.");
    }
    if (!expiry) {
      throw new Error("Enter a KYC expiry (unix timestamp).");
    }

    const tx = await addParticipant(state.mmProvider, address, role, expiry);
    renderTx(tx.hash);
    const receipt = await tx.wait();
    const blockNumber = receipt?.blockNumber ? String(receipt.blockNumber) : "-";
    setText("add-participant-tx", tx.hash);
    setText("add-participant-block", blockNumber);
    setStatus(`Participant added in block ${blockNumber}`, "transaction");
  } catch (error) {
    renderError(error);
  }
}

async function handleChangeRole() {
  try {
    requireConnected();
    const address = requireElement("change-address").value.trim();
    const role = normalizeRole(requireElement("change-role").value);
    if (!isValidAddress(address)) {
      throw new Error("Enter a valid address.");
    }

    const tx = await changeRole(state.mmProvider, address, role);
    renderTx(tx.hash);
    const receipt = await tx.wait();
    const blockNumber = receipt?.blockNumber ? String(receipt.blockNumber) : "-";
    setText("change-role-tx", tx.hash);
    setText("change-role-block", blockNumber);
    setStatus(`Role updated in block ${blockNumber}`, "transaction");
  } catch (error) {
    renderError(error);
  }
}

async function handleRenewKYC() {
  try {
    requireConnected();
    const address = requireElement("renew-address").value.trim();
    const expiry = requireElement("renew-expiry").value.trim();
    if (!isValidAddress(address)) {
      throw new Error("Enter a valid address.");
    }
    if (!expiry) {
      throw new Error("Enter a new expiry timestamp.");
    }

    const tx = await renewKYC(state.mmProvider, address, expiry);
    renderTx(tx.hash);
    const receipt = await tx.wait();
    const blockNumber = receipt?.blockNumber ? String(receipt.blockNumber) : "-";
    setText("renew-kyc-tx", tx.hash);
    setText("renew-kyc-block", blockNumber);
    setStatus(`KYC renewed in block ${blockNumber}`, "transaction");
  } catch (error) {
    renderError(error);
  }
}

async function handleFreezeAccount() {
  try {
    requireConnected();
    const address = requireElement("freezeAddress").value.trim();
    const reason = requireElement("freezeReason").value.trim();

    if (!isValidAddress(address)) {
      throw new Error("Enter a valid address to freeze.");
    }

    const tx = await freezeAccount(state.mmProvider, address, reason || "N/A");
    renderTx(tx.hash);
    setText("outFreezeTx", tx.hash);

    const receipt = await tx.wait();
    const blockNumber = receipt?.blockNumber ? String(receipt.blockNumber) : "-";
    setText("outFreezeBlock", blockNumber);
    setStatus(`Confirmed in block ${blockNumber}`, "transaction");
  } catch (error) {
    renderError(error);
  }
}

async function handleUnfreezeAccount() {
  try {
    requireConnected();
    const address = requireElement("unfreezeAddress").value.trim();
    if (!isValidAddress(address)) {
      throw new Error("Enter a valid address to unfreeze.");
    }

    const tx = await unfreezeAccount(state.mmProvider, address);
    renderTx(tx.hash);
    setText("outUnfreezeTx", tx.hash);

    const receipt = await tx.wait();
    const blockNumber = receipt?.blockNumber ? String(receipt.blockNumber) : "-";
    setText("outUnfreezeBlock", blockNumber);
    setStatus(`Unfrozen in block ${blockNumber}`, "transaction");
  } catch (error) {
    renderError(error);
  }
}

async function handleRemoveParticipant() {
  try {
    requireConnected();
    const address = requireElement("remove-address").value.trim();
    if (!isValidAddress(address)) {
      throw new Error("Enter a valid address to remove.");
    }

    const tx = await removeParticipant(state.mmProvider, address);
    renderTx(tx.hash);
    const receipt = await tx.wait();
    const blockNumber = receipt?.blockNumber ? String(receipt.blockNumber) : "-";
    setText("remove-participant-tx", tx.hash);
    setText("remove-participant-block", blockNumber);
    setStatus(`Participant removed in block ${blockNumber}`, "transaction");
  } catch (error) {
    renderError(error);
  }
}

async function handlePause() {
  try {
    requireConnected();
    const tx = await pause(state.mmProvider);
    renderTx(tx.hash);
    const receipt = await tx.wait();
    const blockNumber = receipt?.blockNumber ? String(receipt.blockNumber) : "-";
    setText("pause-tx", tx.hash);
    setText("pause-block", blockNumber);
    setStatus(`Paused in block ${blockNumber}`, "transaction");
  } catch (error) {
    renderError(error);
  }
}

async function handleUnpause() {
  try {
    requireConnected();
    const tx = await unpause(state.mmProvider);
    renderTx(tx.hash);
    const receipt = await tx.wait();
    const blockNumber = receipt?.blockNumber ? String(receipt.blockNumber) : "-";
    setText("unpause-tx", tx.hash);
    setText("unpause-block", blockNumber);
    setStatus(`Unpaused in block ${blockNumber}`, "transaction");
  } catch (error) {
    renderError(error);
  }
}

async function handlePrecompileSync() {
  try {
    requireConnected();
    const enabled = requireElement("precompile-enabled").checked;
    const tx = await setPrecompileSync(state.mmProvider, enabled);
    renderTx(tx.hash);
    const receipt = await tx.wait();
    const blockNumber = receipt?.blockNumber ? String(receipt.blockNumber) : "-";
    setText("precompile-tx", tx.hash);
    setText("precompile-block", blockNumber);
    setStatus(`Precompile sync updated in block ${blockNumber}`, "transaction");
  } catch (error) {
    renderError(error);
  }
}

function init() {
  setDisconnectedState();
  setText("chain", CHAIN_ID_HEX);
  setText("contract", IDENTITY_REGISTRY_ADDRESS);
  toggleActionButtons(false);
  toggleConnectionButtons(false);

  requireElement("connect-btn").addEventListener("click", handleConnect);
  requireElement("disconnect-btn").addEventListener("click", handleDisconnect);
  requireElement("participant-count-btn").addEventListener(
    "click",
    handleParticipantCount,
  );
  requireElement("participant-get-btn").addEventListener(
    "click",
    handleGetParticipant,
  );
  requireElement("btnReadAdmin").addEventListener("click", handleReadAdmin);
  requireElement("btnCheckStatus").addEventListener("click", handleCheckStatus);
  requireElement("btnCheckParticipantRole").addEventListener(
    "click",
    handleCheckParticipantRole,
  );
  requireElement("btnCheckTransact").addEventListener(
    "click",
    handleCheckTransactAllowed,
  );
  requireElement("add-participant-btn").addEventListener(
    "click",
    handleAddParticipant,
  );
  requireElement("change-role-btn").addEventListener(
    "click",
    handleChangeRole,
  );
  requireElement("renew-kyc-btn").addEventListener("click", handleRenewKYC);
  requireElement("btnFreeze").addEventListener("click", handleFreezeAccount);
  requireElement("btnUnfreeze").addEventListener("click", handleUnfreezeAccount);
  requireElement("remove-participant-btn").addEventListener(
    "click",
    handleRemoveParticipant,
  );
  requireElement("pause-btn").addEventListener("click", handlePause);
  requireElement("unpause-btn").addEventListener("click", handleUnpause);
  requireElement("precompile-btn").addEventListener(
    "click",
    handlePrecompileSync,
  );
}

window.addEventListener("DOMContentLoaded", init);
