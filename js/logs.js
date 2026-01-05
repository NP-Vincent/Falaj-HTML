const MAX_LOG_ENTRIES = 200;
let initialized = false;

function formatTimestamp(date = new Date()) {
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function getLogContainer(type) {
  return document.querySelector(`[data-log-list="${type}"]`);
}

function createEmptyState() {
  const empty = document.createElement('div');
  empty.className = 'log-empty';
  empty.textContent = 'No entries yet.';
  return empty;
}

function ensureEmptyState(container) {
  if (!container) {
    return;
  }
  if (container.children.length === 0) {
    container.appendChild(createEmptyState());
  }
}

function clearLog(type) {
  const container = getLogContainer(type);
  if (!container) {
    return;
  }
  container.innerHTML = '';
  ensureEmptyState(container);
}

function appendLog(type, message) {
  const container = getLogContainer(type);
  if (!container) {
    return;
  }
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = `[${formatTimestamp()}] ${message}`;

  const empty = container.querySelector('.log-empty');
  if (empty) {
    empty.remove();
  }

  container.appendChild(entry);

  const entries = container.querySelectorAll('.log-entry');
  if (entries.length > MAX_LOG_ENTRIES) {
    entries[0].remove();
  }

  container.scrollTop = container.scrollHeight;
}

async function copyLog(type) {
  const container = getLogContainer(type);
  if (!container) {
    return;
  }
  const entries = [...container.querySelectorAll('.log-entry')].map((entry) => entry.textContent);
  const text = entries.join('\n');

  if (!text) {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    window.prompt('Copy log entries:', text);
  }
}

function handleActionClick(event) {
  const button = event.target.closest('[data-log-action]');
  if (!button) {
    return;
  }
  const action = button.dataset.logAction;
  const target = button.dataset.logTarget;
  if (!target) {
    return;
  }
  if (action === 'copy') {
    copyLog(target);
  }
  if (action === 'clear') {
    clearLog(target);
  }
}

function handleWindowError(event) {
  if (event?.message) {
    logError(event.message);
  }
}

function handleUnhandledRejection(event) {
  if (event?.reason) {
    const reason = event.reason?.message || event.reason;
    logError(`Unhandled rejection: ${reason}`);
  }
}

export function initLogs() {
  if (initialized) {
    return;
  }
  initialized = true;
  document.addEventListener('click', handleActionClick);
  ensureEmptyState(getLogContainer('event'));
  ensureEmptyState(getLogContainer('error'));
  window.addEventListener('error', handleWindowError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);
}

export function logEvent(message) {
  if (!message) {
    return;
  }
  appendLog('event', message);
}

export function logError(message) {
  if (!message) {
    return;
  }
  appendLog('error', message);
}
