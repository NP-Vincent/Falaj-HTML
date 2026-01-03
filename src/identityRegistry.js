import {
  IDENTITY_REGISTRY_ADDRESS,
  IDENTITY_REGISTRY_ABI,
} from "./config.js";

const ethers = window.ethers;

function getEthersProvider(mmProvider) {
  if (ethers.BrowserProvider) {
    return new ethers.BrowserProvider(mmProvider);
  }

  return new ethers.providers.Web3Provider(mmProvider);
}

export function getIdentityRegistryContract(mmProvider) {
  const provider = getEthersProvider(mmProvider);
  return new ethers.Contract(
    IDENTITY_REGISTRY_ADDRESS,
    IDENTITY_REGISTRY_ABI,
    provider,
  );
}

export async function getIdentityRegistryContractWithSigner(mmProvider) {
  const provider = getEthersProvider(mmProvider);
  const signer = await provider.getSigner();
  return new ethers.Contract(
    IDENTITY_REGISTRY_ADDRESS,
    IDENTITY_REGISTRY_ABI,
    signer,
  );
}

export async function participantCount(mmProvider) {
  const contract = getIdentityRegistryContract(mmProvider);
  return contract.participantCount();
}

export async function getParticipant(mmProvider, account) {
  const contract = getIdentityRegistryContract(mmProvider);
  return contract.getParticipant(account);
}

export async function getRoleAdmin(mmProvider, role) {
  const contract = getIdentityRegistryContract(mmProvider);
  return contract.getRoleAdmin(role);
}

export async function hasRole(mmProvider, role, account) {
  const contract = getIdentityRegistryContract(mmProvider);
  return contract.hasRole(role, account);
}

export async function hasParticipantRole(mmProvider, role, account) {
  const contract = getIdentityRegistryContract(mmProvider);
  return contract.hasParticipantRole(role, account);
}

export async function isAllowedToTransact(mmProvider, account) {
  const contract = getIdentityRegistryContract(mmProvider);
  return contract.isAllowedToTransact(account);
}

export async function addParticipant(mmProvider, account, role, kycExpiry) {
  const contract = await getIdentityRegistryContractWithSigner(mmProvider);
  return contract.addParticipant(account, role, kycExpiry);
}

export async function changeRole(mmProvider, account, role) {
  const contract = await getIdentityRegistryContractWithSigner(mmProvider);
  return contract.changeRole(account, role);
}

export async function freezeAccount(mmProvider, account, reason) {
  const contract = await getIdentityRegistryContractWithSigner(mmProvider);
  return contract.freezeAccount(account, reason);
}

export async function unfreezeAccount(mmProvider, account) {
  const contract = await getIdentityRegistryContractWithSigner(mmProvider);
  return contract.unfreezeAccount(account);
}

export async function removeParticipant(mmProvider, account) {
  const contract = await getIdentityRegistryContractWithSigner(mmProvider);
  return contract.removeParticipant(account);
}

export async function renewKYC(mmProvider, account, newExpiry) {
  const contract = await getIdentityRegistryContractWithSigner(mmProvider);
  return contract.renewKYC(account, newExpiry);
}

export async function pause(mmProvider) {
  const contract = await getIdentityRegistryContractWithSigner(mmProvider);
  return contract.pause();
}

export async function unpause(mmProvider) {
  const contract = await getIdentityRegistryContractWithSigner(mmProvider);
  return contract.unpause();
}

export async function setPrecompileSync(mmProvider, enabled) {
  const contract = await getIdentityRegistryContractWithSigner(mmProvider);
  return contract.setPrecompileSync(enabled);
}
