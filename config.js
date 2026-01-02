export const NETWORKS = {
  falaj: {
    key: 'falaj',
    name: 'Falaj Testnet',
    chainId: '0x12699',
    currency: { name: 'E-AED', symbol: 'E-AED', decimals: 18 },
    rpcUrls: [
      'https://nodes-prod.18.182.4.86.sslip.io/ext/bc/H3hnSLUCbiQaY92f34SyiUFCpfiHqm1HkGtig5BDBKKk3ZJYB/rpc'
    ],
    blockExplorerUrls: [
      'https://build.avax.network/explorer/H3hnSLUCbiQaY92f34SyiUFCpfiHqm1HkGtig5BDBKKk3ZJYB'
    ],
    blockchainId: 'H3hnSLUCbiQaY92f34SyiUFCpfiHqm1HkGtig5BDBKKk3ZJYB',
    subnetId: 'Umsy6NpNisVtZ3KfXscumZcMPpVYat2m4tJSmAa3WJzPWkh9Q',
    vmId: 'srEXiWaHuhNyGwPUi444Tu47ZEDwxTWrbQiuD7FmgSAQ6X7Dy'
  },
  fuji: {
    key: 'fuji',
    name: 'Avalanche Fuji C-Chain',
    chainId: '0xA869',
    currency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
    rpcUrls: ['https://api.avax-test.network/ext/bc/C/rpc'],
    blockExplorerUrls: ['https://subnets-test.avax.network/c-chain']
  }
}

export const DEFAULT_NETWORK_KEY = 'falaj'
export const WALLET_NAME = 'Core Wallet'

export const CONTRACT_ADDRESSES = {
  AEDStablecoin: '0xa5be895EB6DD499b688AE4bD42Fd78500cE24b0F',
  BondToken: '0x67CEe293144b8d8f02A83C53E4d4CcA6D2552726',
  DvPSettlement: '0x99383F536F47961C3A1A427f8bbC89324Cc952D8',
  IdentityRegistry: '0x189c4B40C5d073231e8fcd65370F55B55f25321c'
}

export const FALAJ_CONTRACTS = {
  validatorManagerProxy: '0xfacade0000000000000000000000000000000000',
  teleporterMessenger: '0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf',
  teleporterRegistry: '0x75fd8d3f961e2e8fcb810e87021f9cdd26a3fce6',
  predeployedSenderCChain: '0x05c474824e7d2cc67cf22b456f7cf60c0e3a1289',
  icmDemoV1: '0xab9541ba5e7e496645473231c561e36036e7665e',
  icmDemoV2: '0x3a2ba0fa33ecc8c6be5e7c23185d7ca07493b5e4',
  validatorMessagesLibrary: '0xa4d55132bfc92369dc17918d9e12b42cfea958f8',
  validatorManager: '0xa15acf1dc3f57879515024b45933b7326d3e22c4'
}
