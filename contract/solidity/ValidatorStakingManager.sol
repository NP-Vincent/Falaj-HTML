// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./IdentityRegistry.sol";
import "./AEDStablecoin.sol";
import "./interfaces/INativeMinter.sol";

/**
 * @title ValidatorStakingManager
 * @notice Manages validator staking, rewards, and slashing for GulfStable L1
 * @dev Handles validator economics including:
 *      - Validator registration and deregistration
 *      - Native E-AED staking (payable functions accept native token)
 *      - Issuance ratio enforcement (stake relative to circulating AED supply)
 *      - Pro-rata reward distribution with NativeMinter precompile for minting
 *      - Slashing with grace periods for rebalancing
 *
 * Architecture:
 * - E-AED is the NATIVE token of the L1 (not ERC-20)
 * - Staking accepts native E-AED via payable functions
 * - Rewards are minted via NativeMinter precompile (0x0200000000000000000000000000000000000001)
 * - Slashed tokens are transferred to a treasury/slash receiver address
 *
 * Integration Points:
 * - NativeMinter: Mint reward tokens via Avalanche L1 precompile
 * - IdentityRegistry: Role verification
 * - AEDStablecoin: Circulating supply for ratio calculations
 * - FeeDistribution: Reward distribution
 *
 * Upgradeability:
 * - UUPS pattern for future upgrades
 * - Only regulator can authorize upgrades
 */
contract ValidatorStakingManager is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    // ============================================
    // Role Definitions
    // ============================================

    /// @notice Role that can distribute rewards (FeeDistribution contract)
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR");

    // ============================================
    // Constants - Precompiles
    // ============================================

    /// @notice NativeMinter precompile address on Avalanche L1
    address public constant NATIVE_MINTER = 0x0200000000000000000000000000000000000001;

    // ============================================
    // State Variables - Contracts
    // ============================================

    /// @notice Reference to the identity registry
    IdentityRegistry public identityRegistry;

    /// @notice Reference to the AED stablecoin contract
    AEDStablecoin public aedStablecoin;

    /// @notice Address of the FeeDistribution contract
    address public feeDistribution;

    /// @notice Address to receive slashed tokens (treasury)
    address public slashReceiver;

    // ============================================
    // State Variables - Validator Registry
    // ============================================

    /// @notice Mapping of address to validator status
    mapping(address => bool) private _isValidator;

    /// @notice Mapping of validator address to node ID
    mapping(address => bytes32) public validatorNodeId;

    /// @notice Array of all registered validators
    address[] private _validators;

    /// @notice Index of validator in _validators array (1-indexed for existence check)
    mapping(address => uint256) private _validatorIndex;

    // ============================================
    // State Variables - Staking
    // ============================================

    /// @notice Staked amount per validator (native E-AED)
    mapping(address => uint256) private _stakes;

    /// @notice Total staked across all validators
    uint256 private _totalStaked;

    // ============================================
    // State Variables - Issuance Ratio
    // ============================================

    /// @notice Stake to issuance ratio in basis points (default 1000 = 10%)
    /// @dev Validators must stake this percentage of circulating supply they issued
    uint256 public stakeToIssuanceRatio;

    /// @notice Default stake to issuance ratio (10%)
    uint256 public constant DEFAULT_RATIO = 1000;

    /// @notice Maximum ratio (100%)
    uint256 public constant MAX_RATIO = 10000;

    // ============================================
    // State Variables - Rewards
    // ============================================

    /// @notice Pending rewards per validator
    mapping(address => uint256) private _pendingRewards;

    /// @notice Total pending rewards across all validators
    uint256 private _totalPendingRewards;

    // ============================================
    // State Variables - Slashing & Grace Period
    // ============================================

    /// @notice Grace period duration in seconds (default 7 days)
    uint256 public gracePeriod;

    /// @notice Default grace period (7 days)
    uint256 public constant DEFAULT_GRACE_PERIOD = 7 days;

    /// @notice Grace period deadline per validator (0 = not in grace period)
    mapping(address => uint256) private _gracePeriodDeadline;

    /// @notice Total amount slashed per validator (for tracking)
    mapping(address => uint256) public totalSlashed;

    // ============================================
    // Storage Gap for Upgradeability
    // ============================================

    /// @dev Reserved storage gap for future upgrades
    uint256[50] private __gap;

    // ============================================
    // Events
    // ============================================

    /// @notice Emitted when a validator is registered
    event ValidatorRegistered(address indexed validator, bytes32 nodeId);

    /// @notice Emitted when a validator is deregistered
    event ValidatorDeregistered(address indexed validator);

    /// @notice Emitted when a validator stakes native E-AED
    event Staked(address indexed validator, uint256 amount);

    /// @notice Emitted when a validator unstakes native E-AED
    event Unstaked(address indexed validator, uint256 amount);

    /// @notice Emitted when rewards are distributed to validators
    event RewardsDistributed(uint256 totalAmount, uint256 validatorCount);

    /// @notice Emitted when a validator claims their rewards (minted via NativeMinter)
    event RewardsClaimed(address indexed validator, uint256 amount);

    /// @notice Emitted when a validator is slashed
    event Slashed(address indexed validator, uint256 amount, string reason);

    /// @notice Emitted when a grace period starts for a validator
    event GracePeriodStarted(address indexed validator, uint256 deadline);

    /// @notice Emitted when FeeDistribution contract is set
    event FeeDistributionSet(address indexed feeDistribution);

    /// @notice Emitted when stake to issuance ratio is updated
    event StakeToIssuanceRatioUpdated(uint256 oldRatio, uint256 newRatio);

    /// @notice Emitted when grace period duration is updated
    event GracePeriodUpdated(uint256 oldPeriod, uint256 newPeriod);

    /// @notice Emitted when slash receiver is updated
    event SlashReceiverUpdated(address indexed oldReceiver, address indexed newReceiver);

    // ============================================
    // Errors
    // ============================================

    error NotRegulator(address account);
    error NotValidator(address account);
    error AlreadyValidator(address account);
    error NotCompliant(address account);
    error ZeroAddress();
    error ZeroAmount();
    error InvalidRatio(uint256 ratio);
    error InsufficientStake(address validator, uint256 available, uint256 required);
    error NoRewardsToClaim(address validator);
    error ValidatorInGracePeriod(address validator, uint256 deadline);
    error FeeDistributionNotSet();
    error InvalidNodeId();
    error TransferFailed();
    error SlashTransferFailed();

    // ============================================
    // Modifiers
    // ============================================

    modifier onlyRegulator() {
        if (!identityRegistry.hasRole(identityRegistry.REGULATOR_ROLE(), msg.sender)) {
            revert NotRegulator(msg.sender);
        }
        _;
    }

    modifier onlyValidator() {
        if (!_isValidator[msg.sender]) {
            revert NotValidator(msg.sender);
        }
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
     * @notice Initialize the ValidatorStakingManager contract
     * @dev Called once during proxy deployment
     * @param _identityRegistry Address of the IdentityRegistry contract
     * @param _aedStablecoin Address of the AEDStablecoin contract
     * @param _slashReceiver Address to receive slashed tokens (treasury)
     */
    function initialize(
        address _identityRegistry,
        address _aedStablecoin,
        address _slashReceiver
    ) external initializer {
        if (_identityRegistry == address(0)) revert ZeroAddress();
        if (_aedStablecoin == address(0)) revert ZeroAddress();
        if (_slashReceiver == address(0)) revert ZeroAddress();

        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        identityRegistry = IdentityRegistry(_identityRegistry);
        aedStablecoin = AEDStablecoin(_aedStablecoin);
        slashReceiver = _slashReceiver;

        stakeToIssuanceRatio = DEFAULT_RATIO;
        gracePeriod = DEFAULT_GRACE_PERIOD;

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
    // Receive Function - Accept Native E-AED
    // ============================================

    /**
     * @notice Receive native E-AED
     * @dev Allows contract to receive native E-AED for staking operations
     */
    receive() external payable {}

    // ============================================
    // External Functions - Validator Registration
    // ============================================

    /**
     * @notice Register a new validator
     * @dev Only callable by REGULATOR
     * @param validator Address of the validator to register
     * @param nodeId Avalanche node ID associated with this validator
     */
    function registerValidator(
        address validator,
        bytes32 nodeId
    ) external onlyRegulator {
        if (validator == address(0)) revert ZeroAddress();
        if (nodeId == bytes32(0)) revert InvalidNodeId();
        if (_isValidator[validator]) revert AlreadyValidator(validator);

        _isValidator[validator] = true;
        validatorNodeId[validator] = nodeId;
        _validatorIndex[validator] = _validators.length + 1; // 1-indexed
        _validators.push(validator);

        emit ValidatorRegistered(validator, nodeId);
    }

    /**
     * @notice Deregister a validator
     * @dev Only callable by REGULATOR. Validator must have zero stake.
     * @param validator Address of the validator to deregister
     */
    function deregisterValidator(address validator) external onlyRegulator {
        if (!_isValidator[validator]) revert NotValidator(validator);
        if (_stakes[validator] > 0) {
            revert InsufficientStake(validator, 0, _stakes[validator]);
        }

        // Remove from validators array (swap and pop)
        uint256 index = _validatorIndex[validator] - 1; // Convert to 0-indexed
        uint256 lastIndex = _validators.length - 1;

        if (index != lastIndex) {
            address lastValidator = _validators[lastIndex];
            _validators[index] = lastValidator;
            _validatorIndex[lastValidator] = index + 1; // Store as 1-indexed
        }

        _validators.pop();
        delete _validatorIndex[validator];
        delete _isValidator[validator];
        delete validatorNodeId[validator];
        delete _gracePeriodDeadline[validator];

        emit ValidatorDeregistered(validator);
    }

    // ============================================
    // External Functions - Staking Operations
    // ============================================

    /**
     * @notice Stake native E-AED tokens
     * @dev Payable function - validator sends native E-AED with the transaction
     */
    function stake() external payable onlyValidator nonReentrant {
        if (msg.value == 0) revert ZeroAmount();

        _stakes[msg.sender] += msg.value;
        _totalStaked += msg.value;

        // Clear grace period if compliance is restored
        if (_gracePeriodDeadline[msg.sender] > 0 && isCompliant(msg.sender)) {
            _gracePeriodDeadline[msg.sender] = 0;
        }

        emit Staked(msg.sender, msg.value);
    }

    /**
     * @notice Unstake native E-AED tokens
     * @dev Only allowed if validator remains compliant after unstaking
     * @param amount Amount of native E-AED to unstake
     */
    function unstake(uint256 amount) external onlyValidator nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (_stakes[msg.sender] < amount) {
            revert InsufficientStake(msg.sender, _stakes[msg.sender], amount);
        }

        // Calculate new stake after unstaking
        uint256 newStake = _stakes[msg.sender] - amount;
        uint256 requiredStake = getRequiredStake(msg.sender);

        // Only allow unstake if validator remains compliant or has no issuance
        if (newStake < requiredStake && requiredStake > 0) {
            revert NotCompliant(msg.sender);
        }

        _stakes[msg.sender] = newStake;
        _totalStaked -= amount;

        // Transfer native E-AED back to validator
        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit Unstaked(msg.sender, amount);
    }

    // ============================================
    // External Functions - Rewards
    // ============================================

    /**
     * @notice Distribute rewards to all validators
     * @dev Only callable by FeeDistribution contract (DISTRIBUTOR_ROLE)
     *      Rewards are distributed pro-rata based on stake weight
     * @param totalRewards Total amount of rewards to distribute
     */
    function distributeRewards(uint256 totalRewards) external onlyRole(DISTRIBUTOR_ROLE) nonReentrant {
        if (totalRewards == 0) revert ZeroAmount();
        if (_totalStaked == 0) return; // No validators staking

        uint256 validatorCount = _validators.length;
        uint256 distributed = 0;

        for (uint256 i = 0; i < validatorCount; i++) {
            address validator = _validators[i];
            uint256 validatorStake = _stakes[validator];

            if (validatorStake > 0) {
                // Pro-rata distribution based on stake weight
                uint256 reward = (totalRewards * validatorStake) / _totalStaked;
                _pendingRewards[validator] += reward;
                distributed += reward;
            }
        }

        _totalPendingRewards += distributed;

        emit RewardsDistributed(distributed, validatorCount);
    }

    /**
     * @notice Claim pending rewards
     * @dev Mints native E-AED rewards to the caller via NativeMinter precompile
     */
    function claimRewards() external onlyValidator nonReentrant {
        uint256 rewards = _pendingRewards[msg.sender];
        if (rewards == 0) revert NoRewardsToClaim(msg.sender);

        _pendingRewards[msg.sender] = 0;
        _totalPendingRewards -= rewards;

        // Mint rewards via NativeMinter precompile
        INativeMinter(NATIVE_MINTER).mintNativeCoin(msg.sender, rewards);

        emit RewardsClaimed(msg.sender, rewards);
    }

    // ============================================
    // External Functions - Slashing (Regulator Only)
    // ============================================

    /**
     * @notice Slash a validator's stake
     * @dev Only callable by REGULATOR. Starts grace period for rebalancing.
     *      Slashed native E-AED is transferred to the slash receiver (treasury).
     * @param validator Address of the validator to slash
     * @param amount Amount to slash from their stake
     * @param reason Reason for the slashing
     */
    function slash(
        address validator,
        uint256 amount,
        string calldata reason
    ) external onlyRegulator nonReentrant {
        if (!_isValidator[validator]) revert NotValidator(validator);
        if (amount == 0) revert ZeroAmount();
        if (_stakes[validator] < amount) {
            revert InsufficientStake(validator, _stakes[validator], amount);
        }

        // Reduce validator's stake
        _stakes[validator] -= amount;
        _totalStaked -= amount;
        totalSlashed[validator] += amount;

        // Transfer slashed native E-AED to treasury
        (bool success, ) = slashReceiver.call{value: amount}("");
        if (!success) revert SlashTransferFailed();

        // Start grace period for rebalancing
        uint256 deadline = block.timestamp + gracePeriod;
        _gracePeriodDeadline[validator] = deadline;

        emit Slashed(validator, amount, reason);
        emit GracePeriodStarted(validator, deadline);
    }

    // ============================================
    // External Functions - Configuration (Regulator Only)
    // ============================================

    /**
     * @notice Set the FeeDistribution contract address
     * @dev Grants DISTRIBUTOR_ROLE to the new address
     * @param _feeDistribution Address of the FeeDistribution contract
     */
    function setFeeDistribution(address _feeDistribution) external onlyRegulator {
        if (_feeDistribution == address(0)) revert ZeroAddress();

        // Revoke role from old address if set
        if (feeDistribution != address(0)) {
            _revokeRole(DISTRIBUTOR_ROLE, feeDistribution);
        }

        feeDistribution = _feeDistribution;
        _grantRole(DISTRIBUTOR_ROLE, _feeDistribution);

        emit FeeDistributionSet(_feeDistribution);
    }

    /**
     * @notice Set the slash receiver address
     * @dev Only callable by regulator
     * @param _slashReceiver New address to receive slashed tokens
     */
    function setSlashReceiver(address _slashReceiver) external onlyRegulator {
        if (_slashReceiver == address(0)) revert ZeroAddress();

        address oldReceiver = slashReceiver;
        slashReceiver = _slashReceiver;

        emit SlashReceiverUpdated(oldReceiver, _slashReceiver);
    }

    /**
     * @notice Set the stake to issuance ratio
     * @dev Ratio in basis points (100 = 1%, 1000 = 10%, 10000 = 100%)
     * @param ratioBasisPoints New ratio in basis points
     */
    function setStakeToIssuanceRatio(uint256 ratioBasisPoints) external onlyRegulator {
        if (ratioBasisPoints == 0 || ratioBasisPoints > MAX_RATIO) {
            revert InvalidRatio(ratioBasisPoints);
        }

        uint256 oldRatio = stakeToIssuanceRatio;
        stakeToIssuanceRatio = ratioBasisPoints;

        emit StakeToIssuanceRatioUpdated(oldRatio, ratioBasisPoints);
    }

    /**
     * @notice Set the grace period duration
     * @param seconds_ New grace period in seconds
     */
    function setGracePeriod(uint256 seconds_) external onlyRegulator {
        uint256 oldPeriod = gracePeriod;
        gracePeriod = seconds_;

        emit GracePeriodUpdated(oldPeriod, seconds_);
    }

    // ============================================
    // View Functions - Validator Registry
    // ============================================

    /**
     * @notice Check if an address is a registered validator
     * @param account Address to check
     * @return True if the address is a registered validator
     */
    function isValidator(address account) external view returns (bool) {
        return _isValidator[account];
    }

    /**
     * @notice Get the total number of registered validators
     * @return Number of validators
     */
    function getValidatorCount() external view returns (uint256) {
        return _validators.length;
    }

    /**
     * @notice Get all registered validators
     * @return Array of validator addresses
     */
    function getValidators() external view returns (address[] memory) {
        return _validators;
    }

    /**
     * @notice Get validators with pagination
     * @param offset Starting index
     * @param limit Maximum number of validators to return
     * @return addresses Array of validator addresses
     */
    function getValidatorsPaginated(
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory addresses) {
        uint256 total = _validators.length;
        if (offset >= total) return new address[](0);

        uint256 end = offset + limit > total ? total : offset + limit;
        addresses = new address[](end - offset);

        for (uint256 i = offset; i < end; i++) {
            addresses[i - offset] = _validators[i];
        }

        return addresses;
    }

    // ============================================
    // View Functions - Staking
    // ============================================

    /**
     * @notice Get the stake of a specific validator
     * @param validator Address of the validator
     * @return Staked amount (native E-AED)
     */
    function getStake(address validator) external view returns (uint256) {
        return _stakes[validator];
    }

    /**
     * @notice Get the total staked across all validators
     * @return Total staked amount (native E-AED)
     */
    function getTotalStaked() external view returns (uint256) {
        return _totalStaked;
    }

    // ============================================
    // View Functions - Issuance Compliance
    // ============================================

    /**
     * @notice Calculate the required stake for an issuer
     * @dev Based on circulating supply and stake-to-issuance ratio
     *      Currently all validators have equal requirements, but issuer param
     *      allows for future per-issuer stake requirements
     * @param issuer Address of the issuer (validator) - reserved for future use
     * @return Required stake amount (native E-AED)
     */
    function getRequiredStake(address issuer) public view returns (uint256) {
        // Silence unused variable warning - reserved for future per-issuer requirements
        issuer;

        // Get circulating supply from AEDStablecoin
        uint256 circulatingSupply = aedStablecoin.circulatingSupply();

        // If no issuance, no stake required
        if (circulatingSupply == 0) return 0;

        // Calculate required stake based on ratio
        // Required = (circulatingSupply * ratio) / 10000
        // This assumes each validator backs proportional to their stake
        // For simplicity, we divide by number of validators
        uint256 validatorCount = _validators.length;
        if (validatorCount == 0) return 0;

        uint256 perValidatorIssuance = circulatingSupply / validatorCount;
        return (perValidatorIssuance * stakeToIssuanceRatio) / MAX_RATIO;
    }

    /**
     * @notice Check if an issuer/validator is compliant with staking requirements
     * @param issuer Address of the issuer (validator)
     * @return True if stake >= required stake
     */
    function isCompliant(address issuer) public view returns (bool) {
        if (!_isValidator[issuer]) return false;

        uint256 requiredStake = getRequiredStake(issuer);
        return _stakes[issuer] >= requiredStake;
    }

    /**
     * @notice Get the stake deficit for an issuer
     * @dev Returns how much more stake is needed for compliance
     * @param issuer Address of the issuer (validator)
     * @return Stake deficit (0 if compliant)
     */
    function getStakeDeficit(address issuer) external view returns (uint256) {
        uint256 requiredStake = getRequiredStake(issuer);
        uint256 currentStake = _stakes[issuer];

        if (currentStake >= requiredStake) return 0;
        return requiredStake - currentStake;
    }

    // ============================================
    // View Functions - Rewards
    // ============================================

    /**
     * @notice Get pending rewards for a validator
     * @param validator Address of the validator
     * @return Pending reward amount
     */
    function pendingRewards(address validator) external view returns (uint256) {
        return _pendingRewards[validator];
    }

    /**
     * @notice Get total pending rewards across all validators
     * @return Total pending rewards
     */
    function getTotalPendingRewards() external view returns (uint256) {
        return _totalPendingRewards;
    }

    // ============================================
    // View Functions - Grace Period
    // ============================================

    /**
     * @notice Get the grace period deadline for a validator
     * @param validator Address of the validator
     * @return Deadline timestamp (0 if not in grace period)
     */
    function getGracePeriodDeadline(address validator) external view returns (uint256) {
        return _gracePeriodDeadline[validator];
    }

    /**
     * @notice Check if a validator is currently in a grace period
     * @param validator Address of the validator
     * @return True if in grace period
     */
    function isInGracePeriod(address validator) external view returns (bool) {
        uint256 deadline = _gracePeriodDeadline[validator];
        return deadline > 0 && block.timestamp < deadline;
    }

    /**
     * @notice Check if a validator's grace period has expired
     * @param validator Address of the validator
     * @return True if grace period has expired
     */
    function isGracePeriodExpired(address validator) external view returns (bool) {
        uint256 deadline = _gracePeriodDeadline[validator];
        return deadline > 0 && block.timestamp >= deadline;
    }

    // ============================================
    // View Functions - Validator Details
    // ============================================

    /**
     * @notice Get comprehensive details about a validator
     * @param validator Address of the validator
     * @return registered Whether the address is a registered validator
     * @return nodeId Avalanche node ID
     * @return stakedAmount Amount of native E-AED staked
     * @return pendingReward Pending reward amount
     * @return requiredStake Required stake for compliance
     * @return compliant Whether the validator is compliant
     * @return gracePeriodDeadline Grace period deadline (0 if none)
     */
    function getValidatorDetails(address validator) external view returns (
        bool registered,
        bytes32 nodeId,
        uint256 stakedAmount,
        uint256 pendingReward,
        uint256 requiredStake,
        bool compliant,
        uint256 gracePeriodDeadline
    ) {
        registered = _isValidator[validator];
        nodeId = validatorNodeId[validator];
        stakedAmount = _stakes[validator];
        pendingReward = _pendingRewards[validator];
        requiredStake = getRequiredStake(validator);
        compliant = isCompliant(validator);
        gracePeriodDeadline = _gracePeriodDeadline[validator];
    }

    // ============================================
    // View Functions - Contract Balance
    // ============================================

    /**
     * @notice Get the contract's native E-AED balance
     * @dev Should equal _totalStaked under normal operations
     * @return Contract balance in native E-AED
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
