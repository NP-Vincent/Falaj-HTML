// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./IdentityRegistry.sol";

/**
 * @title AEDStablecoin
 * @notice UAE Dirham-pegged stablecoin for GulfStable L1
 * @dev ERC-20 with compliance controls per CBUAE Payment Token regulations
 *      Upgradeable via UUPS proxy pattern
 *
 * Key Features:
 * - Only licensed issuer can mint/burn (CBUAE requirement)
 * - Transfers only between whitelisted addresses
 * - Regulator can pause entire token or freeze individual accounts
 * - No yield generation (payment token, not security)
 * - UUPS upgradeable with regulator-controlled upgrade authorization
 */
contract AEDStablecoin is
    Initializable,
    UUPSUpgradeable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    PausableUpgradeable,
    AccessControlUpgradeable
{
    // ============================================
    // State Variables
    // ============================================

    /// @notice Reference to the identity registry (storage variable for upgradeability)
    IdentityRegistry public identityRegistry;

    /// @notice Total minted (for reserve ratio calculation)
    uint256 public totalMinted;

    /// @notice Total burned
    uint256 public totalBurned;

    /// @notice Mapping of frozen accounts
    mapping(address => bool) public isFrozen;

    // ============================================
    // Events
    // ============================================

    event Mint(address indexed to, uint256 amount, address indexed minter);
    event Burn(address indexed from, uint256 amount, address indexed burner);
    event AccountFrozen(address indexed account, address indexed frozenBy);
    event AccountUnfrozen(address indexed account, address indexed unfrozenBy);
    event EmergencyWithdrawal(address indexed to, uint256 amount);

    // ============================================
    // Errors
    // ============================================

    error NotWhitelisted(address account);
    error AccountIsFrozen(address account);
    error KYCExpired(address account);
    error TransferNotAllowed(address from, address to);
    error ZeroAmount();
    error ZeroAddress();
    error NotAuthorizedForUpgrade();

    // ============================================
    // Modifiers
    // ============================================

    modifier onlyIssuer() {
        require(
            identityRegistry.hasRole(
                identityRegistry.ISSUER_STABLECOIN_ROLE(),
                msg.sender
            ),
            "AEDStablecoin: caller is not issuer"
        );
        _;
    }

    modifier onlyRegulator() {
        require(
            identityRegistry.hasRole(
                identityRegistry.REGULATOR_ROLE(),
                msg.sender
            ),
            "AEDStablecoin: caller is not regulator"
        );
        _;
    }

    modifier notFrozen(address account) {
        if (isFrozen[account]) revert AccountIsFrozen(account);
        _;
    }

    // ============================================
    // Constructor & Initializer
    // ============================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the upgradeable contract
     * @param _identityRegistry Address of the identity registry contract
     */
    function initialize(address _identityRegistry) public initializer {
        if (_identityRegistry == address(0)) revert ZeroAddress();

        __ERC20_init("UAE Dirham Stablecoin", "AED");
        __ERC20Burnable_init();
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        identityRegistry = IdentityRegistry(_identityRegistry);

        // Grant default admin role to the deployer (can be transferred later)
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ============================================
    // UUPS Upgrade Authorization
    // ============================================

    /**
     * @notice Authorize contract upgrades (regulator only via identity registry)
     * @dev Required by UUPS pattern
     * @param newImplementation Address of the new implementation
     */
    function _authorizeUpgrade(address newImplementation) internal override {
        if (
            !identityRegistry.hasRole(
                identityRegistry.REGULATOR_ROLE(),
                msg.sender
            )
        ) {
            revert NotAuthorizedForUpgrade();
        }
    }

    // ============================================
    // External Functions - Issuer Only
    // ============================================

    /**
     * @notice Mint new tokens (only licensed issuer)
     * @param to Recipient address (must be whitelisted)
     * @param amount Amount to mint
     */
    function mint(
        address to,
        uint256 amount
    ) external onlyIssuer whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        if (!identityRegistry.isWhitelisted(to)) revert NotWhitelisted(to);
        if (isFrozen[to]) revert AccountIsFrozen(to);

        totalMinted += amount;
        _mint(to, amount);

        emit Mint(to, amount, msg.sender);
    }

    /**
     * @notice Burn tokens from an account (only licensed issuer)
     * @param from Account to burn from (must be whitelisted)
     * @param amount Amount to burn
     */
    function burnFrom(
        address from,
        uint256 amount
    ) public override onlyIssuer whenNotPaused {
        if (amount == 0) revert ZeroAmount();

        totalBurned += amount;
        super.burnFrom(from, amount);

        emit Burn(from, amount, msg.sender);
    }

    // ============================================
    // External Functions - Regulator Only
    // ============================================

    /**
     * @notice Pause all token transfers
     */
    function pause() external onlyRegulator {
        _pause();
    }

    /**
     * @notice Unpause token transfers
     */
    function unpause() external onlyRegulator {
        _unpause();
    }

    /**
     * @notice Freeze an individual account
     * @param account Address to freeze
     */
    function freezeAccount(address account) external onlyRegulator {
        isFrozen[account] = true;
        emit AccountFrozen(account, msg.sender);
    }

    /**
     * @notice Unfreeze an individual account
     * @param account Address to unfreeze
     */
    function unfreezeAccount(address account) external onlyRegulator {
        isFrozen[account] = false;
        emit AccountUnfrozen(account, msg.sender);
    }

    /**
     * @notice Emergency withdrawal from frozen account (regulator only)
     * @dev For legal/regulatory seizure scenarios
     * @param from Frozen account
     * @param to Destination (e.g., escrow account)
     * @param amount Amount to transfer
     */
    function emergencyTransfer(
        address from,
        address to,
        uint256 amount
    ) external onlyRegulator {
        require(isFrozen[from], "Account not frozen");
        require(identityRegistry.isWhitelisted(to), "Destination not whitelisted");

        _transfer(from, to, amount);
        emit EmergencyWithdrawal(to, amount);
    }

    // ============================================
    // View Functions
    // ============================================

    /**
     * @notice Get the current circulating supply
     * @return Circulating supply (minted - burned)
     */
    function circulatingSupply() external view returns (uint256) {
        return totalMinted - totalBurned;
    }

    /**
     * @notice Check if a transfer would be allowed
     * @param from Sender address
     * @param to Recipient address
     * @return allowed Whether the transfer would succeed
     * @return reason Reason if not allowed
     */
    function canTransfer(
        address from,
        address to
    ) external view returns (bool allowed, string memory reason) {
        if (paused()) return (false, "Token is paused");
        if (isFrozen[from]) return (false, "Sender is frozen");
        if (isFrozen[to]) return (false, "Recipient is frozen");
        if (!identityRegistry.isWhitelisted(from)) return (false, "Sender not whitelisted");
        if (!identityRegistry.isWhitelisted(to)) return (false, "Recipient not whitelisted");

        // Check KYC expiry
        (, , uint256 fromExpiry, ) = identityRegistry.getParticipant(from);
        (, , uint256 toExpiry, ) = identityRegistry.getParticipant(to);

        if (fromExpiry < block.timestamp) return (false, "Sender KYC expired");
        if (toExpiry < block.timestamp) return (false, "Recipient KYC expired");

        return (true, "");
    }

    // ============================================
    // Internal Functions
    // ============================================

    /**
     * @notice Hook called before any transfer
     * @dev Enforces compliance checks
     */
    function _update(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20Upgradeable) whenNotPaused {
        // Skip checks for mint (from = 0) and burn (to = 0)
        if (from != address(0) && to != address(0)) {
            // Check frozen status
            if (isFrozen[from]) revert AccountIsFrozen(from);
            if (isFrozen[to]) revert AccountIsFrozen(to);

            // Check whitelist status
            if (!identityRegistry.isWhitelisted(from)) revert NotWhitelisted(from);
            if (!identityRegistry.isWhitelisted(to)) revert NotWhitelisted(to);

            // Check KYC expiry
            (, , uint256 fromExpiry, ) = identityRegistry.getParticipant(from);
            (, , uint256 toExpiry, ) = identityRegistry.getParticipant(to);

            if (fromExpiry < block.timestamp) revert KYCExpired(from);
            if (toExpiry < block.timestamp) revert KYCExpired(to);
        }

        super._update(from, to, amount);
    }

    // ============================================
    // ERC20 Overrides
    // ============================================

    /**
     * @notice Returns the number of decimals (2 for AED, like fiat)
     */
    function decimals() public pure override returns (uint8) {
        return 2;
    }

    // ============================================
    // Storage Gap for Future Upgrades
    // ============================================

    /**
     * @dev Reserved storage space to allow for layout changes in future upgrades
     */
    uint256[50] private __gap;
}
