const normalizeHex = value => value.toLowerCase()

export const normalizeCastInputToBytes32 = value => {
  const input = String(value ?? '').trim()
  if (!input) {
    throw new Error('Cast hash is required.')
  }

  const embeddedMatch = input.match(/0x[a-fA-F0-9]{64}/)
  if (embeddedMatch) {
    return normalizeHex(embeddedMatch[0])
  }

  const bareMatch = input.match(/\\b[a-fA-F0-9]{64}\\b/)
  if (bareMatch) {
    return `0x${normalizeHex(bareMatch[0])}`
  }

  const compact = input.startsWith('0x') ? input.slice(2) : input
  if (/^[a-fA-F0-9]{64}$/.test(compact)) {
    return `0x${normalizeHex(compact)}`
  }

  throw new Error('Provide a Warpcast URL or 0x-prefixed cast hash.')
}
