const ethers = window.ethers;

if (!ethers) {
  throw new Error('Ethers library not loaded. Ensure the ethers script is included before amounts.js.');
}

const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

function normalizeDecimals(decimals, label) {
  const parsed = typeof decimals === 'bigint' ? Number(decimals) : Number(decimals);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} decimals must be a non-negative integer.`);
  }
  return parsed;
}

function parseDecimalAmount(value, decimals, label, options = {}) {
  const { allowZero = false, integerOnly = false } = options;
  const normalizedDecimals = normalizeDecimals(decimals, label);
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  const sanitized = trimmed.replace(/,/g, '');
  if (/e/i.test(sanitized)) {
    throw new Error(`${label} must be a standard decimal value.`);
  }
  if (!DECIMAL_PATTERN.test(sanitized)) {
    throw new Error(`${label} must be a valid decimal number.`);
  }
  if (integerOnly && sanitized.includes('.')) {
    throw new Error(`${label} must be a whole number.`);
  }
  try {
    const amount = ethers.parseUnits(sanitized, normalizedDecimals);
    if (!allowZero && amount <= 0n) {
      throw new Error(`${label} must be greater than 0.`);
    }
    return amount;
  } catch (err) {
    throw new Error(`${label} must be a valid amount.`);
  }
}

export { parseDecimalAmount };
