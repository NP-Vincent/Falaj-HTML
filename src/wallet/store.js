export const store = {
  accountState: null,
  networkState: null,
  appKitState: null,
  providers: {},
  themeState: { themeMode: 'light', themeVariables: {} }
}

export const updateStore = (key, value) => {
  store[key] = value
}
