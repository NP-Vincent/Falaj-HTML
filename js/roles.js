export function extractRoleFunctionNames(abi) {
  if (!Array.isArray(abi)) {
    return [];
  }
  const roles = new Set();
  abi.forEach((entry) => {
    if (entry?.type !== 'function') {
      return;
    }
    const name = entry.name;
    if (!name || name !== name.toUpperCase()) {
      return;
    }
    if (!name.includes('ROLE')) {
      return;
    }
    if (entry.inputs?.length) {
      return;
    }
    if (!entry.outputs || entry.outputs.length !== 1) {
      return;
    }
    const [output] = entry.outputs;
    if (output?.type !== 'bytes32') {
      return;
    }
    roles.add(name);
  });
  return Array.from(roles).sort();
}

export async function fetchRoleValues(contract, abi) {
  const roleNames = extractRoleFunctionNames(abi);
  if (!roleNames.length) {
    return [];
  }
  const results = [];
  for (const name of roleNames) {
    try {
      const value = await contract[name]();
      results.push({ name, value });
    } catch (err) {
      results.push({ name, value: `Error: ${err?.message || err}` });
    }
  }
  return results;
}
