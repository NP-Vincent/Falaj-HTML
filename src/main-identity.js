import { ethers } from "ethers";
import { CHAIN_ID_HEX, IDENTITY_REGISTRY_ADDRESS } from "./config.js";
import { connectWallet, ensureChain } from "./metamask.js";
import {
  freezeAccount,
  getIdentityRegistryContractWithSigner,
  getRoleAdmin,
  hasRole,
  participantCount,
} from "./identityRegistry.js";
import {
  renderError,
  renderTx,
  setConnectedState,
  setDisconnectedState,
  setStatus,
} from "./ui.js";

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
  } catch (error) {
    renderError(error);
  }
}

async function handleReadAdmin() {
  try {
    requireConnected();
    const adminRole = await getRoleAdmin(state.mmProvider, DEFAULT_ADMIN_ROLE);
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
    if (!isValidAddress(address)) {
      throw new Error("Enter a valid address.");
    }

    const hasAdminRole = await hasRole(
      state.mmProvider,
      DEFAULT_ADMIN_ROLE,
      address,
    );

    setText("outStatus", hasAdminRole ? "Yes" : "No");
    setStatus("Checked role status", "read");
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

function init() {
  setDisconnectedState();
  setText("chain", CHAIN_ID_HEX);
  setText("contract", IDENTITY_REGISTRY_ADDRESS);

  requireElement("btnConnect").addEventListener("click", handleConnect);
  requireElement("btnReadAdmin").addEventListener("click", handleReadAdmin);
  requireElement("btnCheckStatus").addEventListener("click", handleCheckStatus);
  requireElement("btnFreeze").addEventListener("click", handleFreezeAccount);
}

window.addEventListener("DOMContentLoaded", init);
