// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./interfaces/IAllowList.sol";

/**
 * @title IdentityRegistry
 * @notice Chain-wide identity registry for GulfStable L1
 * @dev Manages KYC/AML whitelist with role-based access control
 *      Integrates with Avalanche Subnet-EVM precompiles for network-level restrictions
 *      Implements UUPS upgradeable pattern for future improvements
 *
 * Avalanche Precompile Integration:
 * - TxAllowList (0x0200000000000000000000000000000000000002): Controls who can send transactions
 * - ContractDeployerAllowList (0x0200000000000000000000000000000000000000): Controls who can deploy contracts
 *
 * Roles:
 * - REGULATOR: Can add/remove participants, pause registry, manage precompiles (Admin on precompiles)
 * - ISSUER_STABLECOIN: Can mint/burn AED stablecoin, can deploy contracts
 * - ISSUER_BOND: Can issue bond tokens, can deploy contracts
 * - CUSTODIAN: Holds assets on behalf of others
 * - PARTICIPANT: Basic transacting participant (after KYC)
 */
contract IdentityRegistry is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable
{
    // ============================================
    // Avalanche Precompile References
    // ============================================

    /// @notice TxAllowList precompile address
    address public constant TX_ALLOW_LIST_ADDR = 0x0200000000000000000000000000000000000002;

    /// @notice ContractDeployerAllowList precompile address
    address public constant CONTRACT_DEPLOYER_ALLOW_LIST_ADDR = 0x0200000000000000000000000000000000000000;

    /// @notice Whether to sync with Subnet-EVM precompiles (disabled for testing on non-Avalanche chains)
    bool public precompileSyncEnabled;

    // ============================================
    // Role Definitions
    // ============================================
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR");
    bytes32 public constant ISSUER_STABLECOIN_ROLE = keccak256("ISSUER_STABLECOIN");
    bytes32 public constant ISSUER_BOND_ROLE = keccak256("ISSUER_BOND");
    bytes32 public constant CUSTODIAN_ROLE = keccak256("CUSTODIAN");
    bytes32 public constant PARTICIPANT_ROLE = keccak256("PARTICIPANT");

    // ============================================
    // State Variables
    // ============================================

    mapping(address => bool) public isWhitelisted;
    mapping(address => bytes32) public participantRole;
    mapping(address => uint256) public kycExpiry;
    mapping(address => bool) public isFrozen;
    uint256 public participantCount;
    address[] private _participants;
    mapping(address => uint256) private _participantIndex;

    // ============================================
    // Events
    // ============================================

    event ParticipantAdded(address indexed account, bytes32 indexed role, uint256 kycExpiry, address indexed addedBy);
    event ParticipantRemoved(address indexed account, address indexed removedBy);
    event ParticipantFrozen(address indexed account, address indexed frozenBy, string reason);
    event ParticipantUnfrozen(address indexed account, address indexed unfrozenBy);
    event RoleChanged(address indexed account, bytes32 indexed oldRole, bytes32 indexed newRole, address changedBy);
    event KYCRenewed(address indexed account, uint256 newExpiry, address renewedBy);
    event PrecompileSyncToggled(bool enabled, address changedBy);

    // ============================================
    // Errors
    // ============================================

    error NotWhitelisted(address account);
    error AlreadyWhitelisted(address account);
    error AccountFrozen(address account);
    error InvalidRole(bytes32 role);
    error KYCExpired(address account);
    error ZeroAddress();

    // ============================================
    // Constructor (disabled for upgradeable pattern)
    // ============================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ============================================
    // Initializer (replaces constructor)
    // ============================================

    /**
     * @notice Initializes the IdentityRegistry contract
     * @param initialRegulator Address of the initial regulator (receives all admin roles)
     * @param enablePrecompileSync Whether to sync with Avalanche precompiles
     */
    function initialize(address initialRegulator, bool enablePrecompileSync) public initializer {
        if (initialRegulator == address(0)) revert ZeroAddress();

        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        precompileSyncEnabled = enablePrecompileSync;

        _grantRole(DEFAULT_ADMIN_ROLE, initialRegulator);
        _grantRole(REGULATOR_ROLE, initialRegulator);

        _setRoleAdmin(ISSUER_STABLECOIN_ROLE, REGULATOR_ROLE);
        _setRoleAdmin(ISSUER_BOND_ROLE, REGULATOR_ROLE);
        _setRoleAdmin(CUSTODIAN_ROLE, REGULATOR_ROLE);
        _setRoleAdmin(PARTICIPANT_ROLE, REGULATOR_ROLE);

        _addParticipant(initialRegulator, REGULATOR_ROLE, type(uint256).max);
    }

    // ============================================
    // UUPS Upgrade Authorization
    // ============================================

    /**
     * @notice Authorizes contract upgrades
     * @dev Only accounts with REGULATOR_ROLE can upgrade the contract
     * @param newImplementation Address of the new implementation contract
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(REGULATOR_ROLE) {}

    // ============================================
    // External Functions - Regulator Only
    // ============================================

    function setPrecompileSync(bool enabled) external onlyRole(REGULATOR_ROLE) {
        precompileSyncEnabled = enabled;
        emit PrecompileSyncToggled(enabled, msg.sender);
    }

    function addParticipant(address account, bytes32 role, uint256 _kycExpiry) external onlyRole(REGULATOR_ROLE) whenNotPaused {
        if (account == address(0)) revert ZeroAddress();
        if (isWhitelisted[account]) revert AlreadyWhitelisted(account);
        if (!_isValidRole(role)) revert InvalidRole(role);
        _addParticipant(account, role, _kycExpiry);
    }

    function removeParticipant(address account) external onlyRole(REGULATOR_ROLE) {
        if (!isWhitelisted[account]) revert NotWhitelisted(account);
        _removeParticipant(account);
    }

    function freezeAccount(address account, string calldata reason) external onlyRole(REGULATOR_ROLE) {
        if (!isWhitelisted[account]) revert NotWhitelisted(account);
        isFrozen[account] = true;
        if (precompileSyncEnabled) _setTxAllowListStatus(account, false);
        emit ParticipantFrozen(account, msg.sender, reason);
    }

    function unfreezeAccount(address account) external onlyRole(REGULATOR_ROLE) {
        if (!isWhitelisted[account]) revert NotWhitelisted(account);
        isFrozen[account] = false;
        if (precompileSyncEnabled) _setTxAllowListStatus(account, true);
        emit ParticipantUnfrozen(account, msg.sender);
    }

    function changeRole(address account, bytes32 newRole) external onlyRole(REGULATOR_ROLE) {
        if (!isWhitelisted[account]) revert NotWhitelisted(account);
        if (!_isValidRole(newRole)) revert InvalidRole(newRole);

        bytes32 oldRole = participantRole[account];
        _revokeRole(oldRole, account);
        _grantRole(newRole, account);
        participantRole[account] = newRole;

        if (precompileSyncEnabled) {
            bool wasDeployer = _isDeployerRole(oldRole);
            bool isDeployer = _isDeployerRole(newRole);
            if (wasDeployer && !isDeployer) _setContractDeployerStatus(account, false);
            else if (!wasDeployer && isDeployer) _setContractDeployerStatus(account, true);
        }

        emit RoleChanged(account, oldRole, newRole, msg.sender);
    }

    function renewKYC(address account, uint256 newExpiry) external onlyRole(REGULATOR_ROLE) {
        if (!isWhitelisted[account]) revert NotWhitelisted(account);
        kycExpiry[account] = newExpiry;
        emit KYCRenewed(account, newExpiry, msg.sender);
    }

    function pause() external onlyRole(REGULATOR_ROLE) { _pause(); }
    function unpause() external onlyRole(REGULATOR_ROLE) { _unpause(); }

    // ============================================
    // View Functions
    // ============================================

    function isAllowedToTransact(address account) external view returns (bool) {
        if (!isWhitelisted[account]) return false;
        if (isFrozen[account]) return false;
        if (kycExpiry[account] < block.timestamp) return false;
        return true;
    }

    function hasParticipantRole(address account, bytes32 role) external view returns (bool) {
        return participantRole[account] == role && isWhitelisted[account];
    }

    function getParticipant(address account) external view returns (bool whitelisted, bytes32 role, uint256 expiry, bool frozen) {
        return (isWhitelisted[account], participantRole[account], kycExpiry[account], isFrozen[account]);
    }

    function getParticipants(uint256 offset, uint256 limit) external view returns (address[] memory addresses) {
        uint256 total = _participants.length;
        if (offset >= total) return new address[](0);
        uint256 end = offset + limit > total ? total : offset + limit;
        addresses = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) addresses[i - offset] = _participants[i];
        return addresses;
    }

    // ============================================
    // Internal Functions
    // ============================================

    function _addParticipant(address account, bytes32 role, uint256 _kycExpiry) internal {
        isWhitelisted[account] = true;
        participantRole[account] = role;
        kycExpiry[account] = _kycExpiry;
        _grantRole(role, account);
        _participantIndex[account] = _participants.length;
        _participants.push(account);
        participantCount++;

        if (precompileSyncEnabled) {
            _setTxAllowListStatus(account, true);
            if (_isDeployerRole(role)) _setContractDeployerStatus(account, true);
            if (role == REGULATOR_ROLE) _setPrecompileAdmin(account);
        }

        emit ParticipantAdded(account, role, _kycExpiry, msg.sender);
    }

    function _removeParticipant(address account) internal {
        bytes32 role = participantRole[account];
        _revokeRole(role, account);
        isWhitelisted[account] = false;
        participantRole[account] = bytes32(0);
        kycExpiry[account] = 0;
        isFrozen[account] = false;

        if (precompileSyncEnabled) {
            _setTxAllowListStatus(account, false);
            if (_isDeployerRole(role)) _setContractDeployerStatus(account, false);
        }

        uint256 index = _participantIndex[account];
        uint256 lastIndex = _participants.length - 1;
        if (index != lastIndex) {
            address lastParticipant = _participants[lastIndex];
            _participants[index] = lastParticipant;
            _participantIndex[lastParticipant] = index;
        }
        _participants.pop();
        delete _participantIndex[account];
        participantCount--;

        emit ParticipantRemoved(account, msg.sender);
    }

    function _isValidRole(bytes32 role) internal pure returns (bool) {
        return role == REGULATOR_ROLE || role == ISSUER_STABLECOIN_ROLE || role == ISSUER_BOND_ROLE || role == CUSTODIAN_ROLE || role == PARTICIPANT_ROLE;
    }

    function _isDeployerRole(bytes32 role) internal pure returns (bool) {
        return role == REGULATOR_ROLE || role == ISSUER_STABLECOIN_ROLE || role == ISSUER_BOND_ROLE;
    }

    // ============================================
    // Precompile Interaction Functions
    // ============================================

    function _setTxAllowListStatus(address account, bool enabled) internal {
        IAllowList txAllowList = IAllowList(TX_ALLOW_LIST_ADDR);
        if (enabled) {
            try txAllowList.setEnabled(account) {} catch {}
        } else {
            try txAllowList.setNone(account) {} catch {}
        }
    }

    function _setContractDeployerStatus(address account, bool enabled) internal {
        IAllowList deployerAllowList = IAllowList(CONTRACT_DEPLOYER_ALLOW_LIST_ADDR);
        if (enabled) {
            try deployerAllowList.setEnabled(account) {} catch {}
        } else {
            try deployerAllowList.setNone(account) {} catch {}
        }
    }

    function _setPrecompileAdmin(address account) internal {
        IAllowList txAllowList = IAllowList(TX_ALLOW_LIST_ADDR);
        IAllowList deployerAllowList = IAllowList(CONTRACT_DEPLOYER_ALLOW_LIST_ADDR);
        try txAllowList.setAdmin(account) {} catch {}
        try deployerAllowList.setAdmin(account) {} catch {}
    }

    // ============================================
    // Storage Gap for Upgradeable Contracts
    // ============================================

    /**
     * @dev Reserved storage space to allow for layout changes in future upgrades.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
