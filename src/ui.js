const DEFAULT_VALUE = "-";

function requireElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element #${id}`);
  }
  return element;
}

function setText(id, text) {
  const element = requireElement(id);
  element.textContent = text;
}

function normalizeLabel(kind) {
  if (!kind) {
    return "Status";
  }
  const normalized = String(kind).trim();
  if (!normalized) {
    return "Status";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function setStatus(text, kind) {
  const label = normalizeLabel(kind);
  const message = text ? `${label}: ${text}` : `${label}`;
  setText("status", message);
}

export function setConnectedState({ account, chainId, contractAddress }) {
  setText("account", account ?? DEFAULT_VALUE);
  setText("chain", chainId ?? DEFAULT_VALUE);
  setText("contract", contractAddress ?? DEFAULT_VALUE);
  setStatus("Connected", "status");
}

export function setDisconnectedState() {
  setText("account", DEFAULT_VALUE);
  setText("chain", DEFAULT_VALUE);
  setText("contract", DEFAULT_VALUE);
  setStatus("Disconnected", "status");
}

export function renderTx(hash) {
  const message = hash
    ? `Transaction submitted: ${hash}`
    : "Transaction submitted";
  setStatus(message, "transaction");
}

function extractRevertReason(message) {
  const normalized = String(message || "");
  const match = normalized.match(/revert\s+([^"'].*)$/i);
  if (!match) {
    return null;
  }
  return match[1].trim();
}

function formatError(err) {
  if (!err) {
    return { summary: "Unknown error", detail: null, kind: "error" };
  }

  const code = err.code ?? err?.error?.code;
  const message =
    err.reason ||
    err?.error?.message ||
    err?.data?.message ||
    err?.message ||
    String(err);

  if (code === 4001) {
    return {
      summary: "User rejected the request",
      detail: null,
      kind: "rejected",
    };
  }

  if (code === -32002) {
    return {
      summary: "Wallet request already pending",
      detail: null,
      kind: "rpc",
    };
  }

  if (code === -32000 || code === -32603) {
    const reason = extractRevertReason(message) || message;
    return {
      summary: "RPC error",
      detail: reason,
      kind: "rpc",
    };
  }

  const revertReason = extractRevertReason(message);
  if (revertReason) {
    return {
      summary: "Transaction reverted",
      detail: revertReason,
      kind: "revert",
    };
  }

  return {
    summary: "Error",
    detail: message,
    kind: "error",
  };
}

export function renderError(err) {
  const { summary, detail, kind } = formatError(err);
  const message = detail ? `${summary}: ${detail}` : summary;
  setStatus(message, kind);
}
