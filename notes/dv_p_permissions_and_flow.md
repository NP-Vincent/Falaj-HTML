### Key contract details

#### **IdentityRegistry.sol**

- Stores whitelisting, KYC expiry and freeze status for participants.
- Defines roles (e.g., **REGULATOR**, **ISSUER\_STABLECOIN**, **ISSUER\_BOND**, **CUSTODIAN**, **PARTICIPANT**) and integrates with Avalanche precompile allow‑lists.
- The `addParticipant`, `removeParticipant`, `freezeAccount`, `unfreezeAccount` and `changeRole` functions manage participants and synchronise them with the TxAllowList and ContractDeployerAllowList precompiles when `precompileSyncEnabled` is truegithub.com.
- Only addresses with **REGULATOR\_ROLE** can call these management functions and authorise UUPS upgrades.

#### **AEDStablecoin.sol**

- ERC‑20 token representing a dirham‑pegged stablecoin.
- Uses the IdentityRegistry to enforce whitelist/kyc checks: transfers are only allowed between whitelisted addresses whose KYC hasn’t expired and who are not frozen.
- Only addresses with **ISSUER\_STABLECOIN\_ROLE** can call `mint` and `burnFrom`. The regulator (REGULATOR\_ROLE) can pause/unpause the entire token and freeze/unfreeze individual accounts.
- Overrides `decimals()` to return `2`, reflecting AED’s two‑decimal fiat denominationgithub.com.
- When the buyer wants to deposit AED into the settlement contract, they must first call `` on this contract to give the settlement contract an allowance for the payment amount.

#### **USDTBond.sol (BondToken)**

- ERC‑20 representing tokenised bonds with a lifecycle: **ISSUED → ACTIVE → MATURED → REDEEMED/FROZEN**.
- Only addresses with **ISSUER\_BOND\_ROLE** can activate or redeem the bond and perform UUPS upgrades. The regulator can mark the bond matured or freeze/unfreeze transfers.
- Transfer hooks ensure bonds are tradeable only when the bond state is `ACTIVE`, both parties are whitelisted and the recipient passes `isEligibleInvestor` (whitelisted and KYC‑valid).
- Overrides `decimals()` to return `0` (bonds are issued in whole units).
- Before a seller can deposit bonds into DvPSettlement, they must call `` on the BondToken contract to allow the settlement contract to transfer the specified amount.

#### **DvPSettlement.sol**

- Provides an escrow‑style DvP mechanism that atomically swaps bonds for AED.
- `createSettlement` checks that both seller and buyer are whitelisted in the IdentityRegistry and that the bond token is `ACTIVE`. It records bond amount, AED amount and sets a timeout (default 24 h).
- `depositBond` and `depositAED` move tokens into the settlement contract using `IERC20.safeTransferFrom`; thus, each depositor **must approve** the settlement contract as spender beforehand. If both sides deposit before expiry, the status moves to `FULLY_FUNDED`.
- `execute` performs the atomic swap (transfer bonds to buyer, AED to seller) only when fully funded and before expiry.
- The regulator (REGULATOR\_ROLE) can adjust settlement timeouts, pause/unpause the contract and cancel settlements.

### Correct approval calls

To settle a trade via `DvPSettlement` the two EOAs must set allowances on the **token contracts**, not on the settlement contract itself. The correct calls are:

| ActorToken contract & functionPurpose |                                                                   |                                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Seller**                            | `BondToken.approve(address dvpSettlement, uint256 bondAmount)`    | Allows the settlement contract to transfer `bondAmount` of bonds from the seller during `depositBond`. |
| **Buyer**                             | `AEDStablecoin.approve(address dvpSettlement, uint256 aedAmount)` | Allows the settlement contract to transfer `aedAmount` of AED from the buyer during `depositAED`.      |

These are standard ERC‑20 `approve` calls on the **BondToken** and **AEDStablecoin** contracts. They correspond to the `approve` function inherited from OpenZeppelin’s ERC‑20 implementation.

### Summary of prerequisites for a successful DvP settlement

1. **Identity Registry setup**
   - The regulator must have enabled precompile sync and registered both EOAs as participants with appropriate roles (e.g., **PARTICIPANT\_ROLE**) and valid KYC expiry.
   - The `DvPSettlement` contract address should be set as `Enabled` on the TxAllowList (via a `registerContract` helper in IdentityRegistry), so it can submit transactions.
2. **Bond token status**
   - The BondToken (USDTBond) must be in `ACTIVE` state for trading. The issuer activates the bond with `activate()`.
3. **Whitelisting and KYC**
   - Both seller and buyer EOAs must be whitelisted and have unexpired KYC. Frozen accounts cannot participate.
4. **Allowances**
   - Seller calls `BondToken.approve(dvpSettlement, bondAmount)`.
   - Buyer calls `AEDStablecoin.approve(dvpSettlement, aedAmount)`.
5. **Creating and funding the settlement**
   - Seller calls `createSettlement(bondToken, bondAmount, aedAmount, buyer)` on `DvPSettlement`.
   - Seller calls `depositBond(id)`.
   - Buyer calls `depositAED(id)`.
   - Once both deposits are in, status becomes `FULLY_FUNDED`.
6. **Execution**
   - Either party (or anyone) calls `execute(id)` before expiry. The contract atomically transfers bonds to the buyer and AED to the seller.
