import { ethers } from "ethers";
import {
  IDENTITY_REGISTRY_ADDRESS,
  IDENTITY_REGISTRY_ABI,
} from "./config.js";

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

export async function getRoleAdmin(mmProvider, role) {
  const contract = getIdentityRegistryContract(mmProvider);
  return contract.getRoleAdmin(role);
}

export async function hasRole(mmProvider, role, account) {
  const contract = getIdentityRegistryContract(mmProvider);
  return contract.hasRole(role, account);
}

export async function freezeAccount(mmProvider, account, reason) {
  const contract = await getIdentityRegistryContractWithSigner(mmProvider);
  return contract.freezeAccount(account, reason);
}
