const notificationCenters = new Map()

const getVariantClass = variant => {
  if (variant === 'success') return 'notification-success'
  if (variant === 'error') return 'notification-error'
  if (variant === 'warning') return 'notification-warning'
  return null
}

const removeNotification = node => {
  if (!node) return
  if (node.parentElement) {
    node.parentElement.removeChild(node)
  }
}

const createNotification = ({ message, variant }) => {
  const wrapper = document.createElement('div')
  wrapper.className = 'notification'

  const variantClass = getVariantClass(variant)
  if (variantClass) {
    wrapper.classList.add(variantClass)
  }

  const messageNode = document.createElement('p')
  messageNode.className = 'notification-message'
  messageNode.textContent = message

  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'notification-close'
  closeButton.setAttribute('aria-label', 'Dismiss notification')
  closeButton.textContent = '×'
  closeButton.addEventListener('click', () => {
    removeNotification(wrapper)
  })

  wrapper.appendChild(messageNode)
  wrapper.appendChild(closeButton)

  return wrapper
}

export const mountNotificationCenter = (root, { role = 'default' } = {}) => {
  if (!root) return
  notificationCenters.set(role, root)
}

export const notify = ({ message, variant = 'info', role = 'default', timeout = 5000 } = {}) => {
  if (!message) return

  const tray = notificationCenters.get(role)
  if (!tray) {
    console.warn('Notification tray not mounted for role:', role)
    return
  }

  const notification = createNotification({ message, variant })
  tray.appendChild(notification)

  if (timeout && typeof window !== 'undefined') {
    window.setTimeout(() => {
      removeNotification(notification)
    }, timeout)
  }
}
