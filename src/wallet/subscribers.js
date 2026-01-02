import { updateStore } from './store'

export const initializeSubscribers = (modal, handlers = {}) => {
  modal.subscribeProviders(state => {
    updateStore('providers', state)
    handlers.onProviders?.(state)
  })

  modal.subscribeAccount(state => {
    updateStore('accountState', state)
    handlers.onAccount?.(state)
  })

  modal.subscribeNetwork(state => {
    updateStore('networkState', state)
    handlers.onNetwork?.(state)
  })

  modal.subscribeState(state => {
    updateStore('appKitState', state)
    handlers.onState?.(state)
  })
}
