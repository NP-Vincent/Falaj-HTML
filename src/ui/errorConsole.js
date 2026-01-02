const MAX_ENTRIES = 200

const safeStringify = value => {
  try {
    return JSON.stringify(
      value,
      (_, item) => (typeof item === 'bigint' ? item.toString() : item),
      2
    )
  } catch (error) {
    return `Unable to serialize value: ${error instanceof Error ? error.message : String(error)}`
  }
}

const formatValue = value => {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`
  }

  if (typeof value === 'object' && value !== null) {
    return safeStringify(value)
  }

  return String(value)
}

const formatArgs = args => args.map(formatValue).join(' ')

const formatErrorEvent = event => {
  if (event?.error) {
    return formatValue(event.error)
  }

  const details = [
    event?.message,
    event?.filename ? `Source: ${event.filename}:${event.lineno}:${event.colno}` : null
  ]
    .filter(Boolean)
    .join('\n')

  return details || 'Unknown error event'
}

const formatRejection = reason => {
  if (reason instanceof Error) {
    return formatValue(reason)
  }

  return formatValue(reason ?? 'Unhandled rejection with no reason')
}

export const initializeErrorConsole = ({ rootId = 'error-console' } = {}) => {
  const root = document.getElementById(rootId)
  if (!root) {
    return null
  }

  const output = root.querySelector('[data-error-console-output]')
  const clearButton = root.querySelector('[data-error-console-clear]')
  const copyButton = root.querySelector('[data-error-console-copy]')
  const entries = []

  const updateOutput = () => {
    if (!output) {
      return
    }

    output.textContent = entries.length
      ? entries.join('\n\n')
      : 'No errors captured yet.'
  }

  const addEntry = (source, message) => {
    const timestamp = new Date().toISOString()
    entries.push(`[${timestamp}] ${source}\n${message}`)

    if (entries.length > MAX_ENTRIES) {
      entries.splice(0, entries.length - MAX_ENTRIES)
    }

    updateOutput()
  }

  const handleErrorEvent = event => {
    addEntry('window.error', formatErrorEvent(event))
  }

  const handleRejection = event => {
    addEntry('unhandledrejection', formatRejection(event?.reason))
  }

  const originalConsoleError = console.error.bind(console)
  console.error = (...args) => {
    addEntry('console.error', formatArgs(args))
    originalConsoleError(...args)
  }

  clearButton?.addEventListener('click', () => {
    entries.splice(0, entries.length)
    updateOutput()
  })

  copyButton?.addEventListener('click', async () => {
    const textToCopy = entries.join('\n\n')

    if (!textToCopy) {
      addEntry('system', 'Copy requested with no error entries.')
      return
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = textToCopy
        textarea.setAttribute('readonly', 'true')
        textarea.style.position = 'absolute'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }

      addEntry('system', 'Error log copied to clipboard.')
    } catch (error) {
      addEntry(
        'system',
        `Failed to copy error log: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  })

  window.addEventListener('error', handleErrorEvent)
  window.addEventListener('unhandledrejection', handleRejection)

  updateOutput()

  return {
    addEntry
  }
}
