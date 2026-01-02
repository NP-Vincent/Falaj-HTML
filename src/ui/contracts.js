export const createContractRenderer = ({ buildContract, parseEther }) => {
  const formatValue = value => {
    if (typeof value === 'bigint') {
      return value.toString()
    }

    if (Array.isArray(value)) {
      return value.map(formatValue)
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, val]) => [key, formatValue(val)])
      )
    }

    return value
  }

  const parseInput = (type, value) => {
    if (type === 'bool') {
      return value === 'true' || value === '1'
    }

    if (type.endsWith('[]')) {
      const itemType = type.replace('[]', '')
      return value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
        .map(item => parseInput(itemType, item))
    }

    return value
  }

  const renderFunctionForm = (contractCard, contractMeta, fn) => {
    const isRead = fn.stateMutability === 'view' || fn.stateMutability === 'pure'
    const form = document.createElement('form')
    form.className = 'function-card'
    const inputElements = []

    const header = document.createElement('div')
    header.className = 'function-header'
    header.innerHTML = `
      <div>
        <h4>${fn.name}</h4>
        <p>${
          fn.inputs
            .map(input => `${input.type} ${input.name || ''}`.trim())
            .join(', ') || 'No inputs'
        }</p>
      </div>
      <span class="badge ${isRead ? 'badge-read' : 'badge-write'}">${
        isRead ? 'Read' : 'Write'
      }</span>
    `

    const fields = document.createElement('div')
    fields.className = 'function-fields'

    fn.inputs.forEach((input, index) => {
      const fieldName = input.name || `${fn.name}-${index}`
      const wrapper = document.createElement('label')
      wrapper.innerHTML = `
        <span>${input.name || input.type}</span>
        <input name="${fieldName}" placeholder="${input.type}" />
      `
      const field = wrapper.querySelector('input')
      inputElements.push({ field, type: input.type })
      fields.appendChild(wrapper)
    })

    if (!isRead && fn.stateMutability === 'payable') {
      const valueInput = document.createElement('label')
      valueInput.innerHTML = `
        <span>ETH Value</span>
        <input name="value" placeholder="0.0" />
      `
      fields.appendChild(valueInput)
    }

    const actions = document.createElement('div')
    actions.className = 'function-actions'
    const button = document.createElement('button')
    button.type = 'submit'
    button.textContent = isRead ? 'Run Read' : 'Send Tx'
    actions.appendChild(button)

    const output = document.createElement('pre')
    output.className = 'function-output'
    output.textContent = ''

    form.appendChild(header)
    form.appendChild(fields)
    form.appendChild(actions)
    form.appendChild(output)

    form.addEventListener('submit', async event => {
      event.preventDefault()
      output.textContent = 'Working...'

      try {
        const address = contractCard
          .querySelector('input[name="address"]')
          .value.trim()
        const contract = buildContract(address, contractMeta.abi)
        const args = inputElements.map(({ field, type }) =>
          parseInput(type, field?.value?.trim() ?? '')
        )

        if (isRead) {
          const result = await contract[fn.name](...args)
          output.textContent = JSON.stringify(formatValue(result), null, 2)
        } else {
          const overrides = {}
          if (fn.stateMutability === 'payable') {
            const valueField = form.querySelector('input[name="value"]')
            if (valueField?.value) {
              overrides.value = parseEther(valueField.value)
            }
          }

          const tx = await contract[fn.name](...args, overrides)
          output.textContent = `Transaction sent: ${tx.hash}`
        }
      } catch (error) {
        output.textContent = error instanceof Error ? error.message : String(error)
      }
    })

    return form
  }

  const renderContractCard = contractMeta => {
    const card = document.createElement('section')
    card.className = 'contract-card'
    card.innerHTML = `
      <header>
        <div>
          <h3>${contractMeta.name}</h3>
          <p class="muted">Address: <input name="address" value="${
            contractMeta.address
          }" /></p>
        </div>
      </header>
    `

    const functionsWrapper = document.createElement('div')
    functionsWrapper.className = 'function-list'

    contractMeta.abi
      .filter(entry => entry.type === 'function')
      .forEach(fn => {
        functionsWrapper.appendChild(renderFunctionForm(card, contractMeta, fn))
      })

    card.appendChild(functionsWrapper)
    return card
  }

  const renderContracts = (root, contracts, options = {}) => {
    const { emptyMessage = 'No contracts configured.' } = options
    root.innerHTML = ''

    if (!contracts.length) {
      const message = document.createElement('p')
      message.className = 'empty-state'
      message.textContent = emptyMessage
      root.appendChild(message)
      return
    }

    contracts.forEach(contract => {
      root.appendChild(renderContractCard(contract))
    })
  }

  return {
    renderContracts
  }
}
