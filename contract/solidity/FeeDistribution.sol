// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./IdentityRegistry.sol";

/**
 * @title IValidatorStakingManager
 * @notice Interface for the ValidatorStakingManager contract
 */
interface IValidatorStakingManager {
    function distributeRewards(uint256 amount) external;
}

/**
 * @title FeeDistribution
 * @notice Fee collection and distribution contract for GulfStable L1
 * @dev Collects native E-AED fees and distributes them between validators and service provider
 *
 * Architecture:
 * - E-AED is the NATIVE token of the L1 (not ERC-20)
 * - Fees are collected via receive() function (native E-AED)
 * - Distribution splits between validators (95% default) and service provider (5% default)
 * - Validators claim rewards via ValidatorStakingManager which mints via NativeMinter
 *
 * Distribution Split:
 * - Validators: 95% (default) via ValidatorStakingManager.distributeRewards()
 * - Service Provider: 5% (configurable) for platform operations
 *
 * Upgradeability:
 * - UUPS pattern for future upgrades
 * - Only regulator can authorize upgrades
 */
contract FeeDistribution is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    // ============================================
    // Constants
    // ============================================

    /// @notice Maximum service provider fee (10% = 1000 basis points)
    uint256 public constant MAX_SERVICE_PROVIDER_FEE = 1000;

    /// @notice Basis points denominator (100% = 10000)
    uint256 public constant BASIS_POINTS = 10000;

    // ============================================
    // State Variables
    // ============================================

    /// @notice Reference to the identity registry
    IdentityRegistry public identityRegistry;

    /// @notice ValidatorStakingManager contract
    IValidatorStakingManager public validatorStakingManager;

    /// @notice Service provider address
    address public serviceProvider;

    /// @notice Service provider fee in basis points (default 500 = 5%)
    uint256 public serviceProviderFee;

    /// @notice Accumulated fees pending distribution (native E-AED)
    uint256 public pendingFees;

    /// @notice Service provider's accumulated balance (native E-AED)
    uint256 public serviceProviderBalance;

    /// @notice Timestamp of last distribution
    uint256 public lastDistribution;

    /// @notice Total amount distributed to validators
    uint256 public totalDistributedToValidators;

    /// @notice Total amount distributed to service provider
    uint256 public totalDistributedToServiceProvider;

    // ============================================
    // Storage Gap for Upgradeability
    // ============================================

    /// @dev Reserved storage gap for future upgrades
    uint256[50] private __gap;

    // ============================================
    // Events
    // ============================================

    event FeesCollected(uint256 amount, address indexed from);
    event FeesDistributed(uint256 validatorShare, uint256 providerShare, uint256 timestamp);
    event ServiceProviderWithdrawal(address indexed to, uint256 amount);
    event ServiceProviderFeeUpdated(uint256 oldFee, uint256 newFee);
    event ServiceProviderUpdated(address indexed oldProvider, address indexed newProvider);
    event ValidatorStakingManagerUpdated(address indexed oldManager, address indexed newManager);

    // ============================================
    // Errors
    // ============================================

    error ZeroAddress();
    error ZeroAmount();
    error InvalidFee(uint256 fee);
    error NoPendingFees();
    error NoBalanceToWithdraw();
    error OnlyServiceProvider();
    error ValidatorStakingManagerNotSet();
    error TransferFailed();
    error NotRegulator(address account);

    // ============================================
    // Modifiers
    // ============================================

    modifier onlyRegulator() {
        if (!identityRegistry.hasRole(identityRegistry.REGULATOR_ROLE(), msg.sender)) {
            revert NotRegulator(msg.sender);
        }
        _;
    }

    modifier onlyServiceProviderAccount() {
        if (msg.sender != serviceProvider) revert OnlyServiceProvider();
        _;
    }

    // ============================================
    // Initializer (replaces constructor for UUPS)
    // ============================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the FeeDistribution contract
     * @dev Called once during proxy deployment
     * @param _identityRegistry Address of the IdentityRegistry contract
     * @param _validatorStakingManager Address of the ValidatorStakingManager contract (can be zero)
     * @param _serviceProvider Initial service provider address
     */
    function initialize(
        address _identityRegistry,
        address _validatorStakingManager,
        address _serviceProvider
    ) external initializer {
        if (_identityRegistry == address(0)) revert ZeroAddress();
        if (_serviceProvider == address(0)) revert ZeroAddress();

        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        identityRegistry = IdentityRegistry(_identityRegistry);
        serviceProvider = _serviceProvider;

        // ValidatorStakingManager can be zero initially and set later
        if (_validatorStakingManager != address(0)) {
            validatorStakingManager = IValidatorStakingManager(_validatorStakingManager);
        }

        // Default service provider fee: 5% (500 basis points)
        serviceProviderFee = 500;

        lastDistribution = block.timestamp;

        // Grant DEFAULT_ADMIN_ROLE to deployer for initial setup
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ============================================
    // UUPS Upgrade Authorization
    // ============================================

    /**
     * @notice Authorize contract upgrade
     * @dev Only regulator can authorize upgrades
     * @param newImplementation Address of new implementation
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRegulator {
        // Regulator authorization is sufficient
    }

    // ============================================
    // External Functions - Fee Collection (Native E-AED)
    // ============================================

    /**
     * @notice Accept native E-AED fees
     * @dev Primary method for collecting transaction fees
     *      Native E-AED is added to pendingFees for distribution
     */
    receive() external payable {
        if (msg.value > 0) {
            pendingFees += msg.value;
            emit FeesCollected(msg.value, msg.sender);
        }
    }

    /**
     * @notice Explicitly collect native E-AED fees
     * @dev Alternative to receive() for explicit fee collection
     */
    function collectFees() external payable {
        if (msg.value > 0) {
            pendingFees += msg.value;
            emit FeesCollected(msg.value, msg.sender);
        }
    }

    // ============================================
    // External Functions - Distribution
    // ============================================

    /**
     * @notice Distribute accumulated native E-AED fees to validators and service provider
     * @dev Can be called by regulator or automated keeper
     *      - Validator share is tracked in ValidatorStakingManager
     *      - Validators claim their rewards via NativeMinter precompile
     *      - Service provider share is accumulated and can be withdrawn
     */
    function distribute() external nonReentrant onlyRegulator {
        uint256 totalFees = pendingFees;
        if (totalFees == 0) revert NoPendingFees();
        if (address(validatorStakingManager) == address(0)) revert ValidatorStakingManagerNotSet();

        // Reset pending fees before external calls (CEI pattern)
        pendingFees = 0;

        // Calculate shares
        uint256 providerShare = (totalFees * serviceProviderFee) / BASIS_POINTS;
        uint256 validatorShare = totalFees - providerShare;

        // Add to service provider balance
        serviceProviderBalance += providerShare;
        totalDistributedToServiceProvider += providerShare;

        // Notify ValidatorStakingManager of rewards to distribute
        // Note: The rewards are tracked, validators claim via NativeMinter
        if (validatorShare > 0) {
            validatorStakingManager.distributeRewards(validatorShare);
            totalDistributedToValidators += validatorShare;
        }

        lastDistribution = block.timestamp;

        emit FeesDistributed(validatorShare, providerShare, block.timestamp);
    }

    // ============================================
    // External Functions - Service Provider
    // ============================================

    /**
     * @notice Withdraw accumulated service provider fees in native E-AED
     * @dev Only callable by service provider
     *      Transfers native E-AED to the service provider
     */
    function withdrawServiceProviderFees() external nonReentrant onlyServiceProviderAccount {
        uint256 amount = serviceProviderBalance;
        if (amount == 0) revert NoBalanceToWithdraw();

        // Reset balance before transfer (CEI pattern)
        serviceProviderBalance = 0;

        // Transfer native E-AED to service provider
        (bool success, ) = serviceProvider.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit ServiceProviderWithdrawal(serviceProvider, amount);
    }

    /**
     * @notice Withdraw service provider fees to a specific address
     * @dev Only callable by service provider
     * @param to Address to send the fees to
     */
    function withdrawServiceProviderFeesTo(address to) external nonReentrant onlyServiceProviderAccount {
        if (to == address(0)) revert ZeroAddress();

        uint256 amount = serviceProviderBalance;
        if (amount == 0) revert NoBalanceToWithdraw();

        // Reset balance before transfer (CEI pattern)
        serviceProviderBalance = 0;

        // Transfer native E-AED to specified address
        (bool success, ) = to.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit ServiceProviderWithdrawal(to, amount);
    }

    // ============================================
    // External Functions - Regulator Only
    // ============================================

    /**
     * @notice Set the service provider fee
     * @param basisPoints Fee in basis points (e.g., 500 = 5%)
     */
    function setServiceProviderFee(uint256 basisPoints) external onlyRegulator {
        if (basisPoints > MAX_SERVICE_PROVIDER_FEE) revert InvalidFee(basisPoints);

        uint256 oldFee = serviceProviderFee;
        serviceProviderFee = basisPoints;

        emit ServiceProviderFeeUpdated(oldFee, basisPoints);
    }

    /**
     * @notice Set the service provider address
     * @param provider New service provider address
     */
    function setServiceProvider(address provider) external onlyRegulator {
        if (provider == address(0)) revert ZeroAddress();

        address oldProvider = serviceProvider;
        serviceProvider = provider;

        emit ServiceProviderUpdated(oldProvider, provider);
    }

    /**
     * @notice Set the ValidatorStakingManager address
     * @param manager New ValidatorStakingManager address
     */
    function setValidatorStakingManager(address manager) external onlyRegulator {
        if (manager == address(0)) revert ZeroAddress();

        address oldManager = address(validatorStakingManager);
        validatorStakingManager = IValidatorStakingManager(manager);

        emit ValidatorStakingManagerUpdated(oldManager, manager);
    }

    // ============================================
    // View Functions
    // ============================================

    /**
     * @notice Get the amount of native E-AED fees pending distribution
     * @return Amount of native E-AED pending distribution
     */
    function pendingDistribution() external view returns (uint256) {
        return pendingFees;
    }

    /**
     * @notice Get the timestamp of the last distribution
     * @return Unix timestamp of last distribution
     */
    function getLastDistribution() external view returns (uint256) {
        return lastDistribution;
    }

    /**
     * @notice Get the current service provider fee in basis points
     * @return Fee in basis points (e.g., 500 = 5%)
     */
    function getServiceProviderFee() external view returns (uint256) {
        return serviceProviderFee;
    }

    /**
     * @notice Get the total amount distributed to date
     * @return Total native E-AED distributed (validators + service provider)
     */
    function getTotalDistributed() external view returns (uint256) {
        return totalDistributedToValidators + totalDistributedToServiceProvider;
    }

    /**
     * @notice Get detailed distribution statistics
     * @return validators Total distributed to validators
     * @return provider Total distributed to service provider
     * @return pending Current pending fees
     * @return providerBalance Current withdrawable service provider balance
     */
    function getDistributionStats() external view returns (
        uint256 validators,
        uint256 provider,
        uint256 pending,
        uint256 providerBalance
    ) {
        return (
            totalDistributedToValidators,
            totalDistributedToServiceProvider,
            pendingFees,
            serviceProviderBalance
        );
    }

    /**
     * @notice Get the contract's native E-AED balance
     * @dev Should equal pendingFees + serviceProviderBalance under normal operations
     * @return Contract balance in native E-AED
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
