// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "./IdentityRegistry.sol";
import "./AEDStablecoin.sol";
import "./BondToken.sol";

/**
 * @title DvPSettlement
 * @notice Atomic Delivery-versus-Payment settlement for bonds and stablecoin
 * @dev Ensures both legs of a trade execute or neither does
 *
 * Key Features:
 * - Atomic swap: bond tokens <-> AED stablecoin
 * - No counterparty risk
 * - Both parties must deposit before execution
 * - Regulator can cancel settlements if needed
 * - UUPS upgradeable pattern for future improvements
 */
contract DvPSettlement is
    Initializable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    using SafeERC20 for IERC20;

    // ============================================
    // Enums & Structs
    // ============================================

    enum SettlementStatus {
        CREATED,
        SELLER_DEPOSITED,
        BUYER_DEPOSITED,
        FULLY_FUNDED,
        EXECUTED,
        CANCELLED
    }

    struct Settlement {
        uint256 id;
        address seller;
        address buyer;
        address bondToken;
        uint256 bondAmount;
        uint256 aedAmount;
        SettlementStatus status;
        uint256 createdAt;
        uint256 expiresAt;
        uint256 executedAt;
    }

    // ============================================
    // State Variables
    // ============================================

    /// @notice Reference to the identity registry
    IdentityRegistry public identityRegistry;

    /// @notice Reference to AED stablecoin
    AEDStablecoin public aedStablecoin;

    /// @notice Settlement counter
    uint256 public settlementCount;

    /// @notice Settlement timeout (default 24 hours)
    uint256 public settlementTimeout;

    /// @notice Mapping of settlement ID to Settlement
    mapping(uint256 => Settlement) public settlements;

    /// @notice Mapping to track if bond is deposited
    mapping(uint256 => bool) public bondDeposited;

    /// @notice Mapping to track if AED is deposited
    mapping(uint256 => bool) public aedDeposited;

    // ============================================
    // Events
    // ============================================

    event SettlementCreated(
        uint256 indexed id,
        address indexed seller,
        address indexed buyer,
        address bondToken,
        uint256 bondAmount,
        uint256 aedAmount,
        uint256 expiresAt
    );

    event BondDeposited(uint256 indexed id, address indexed seller, uint256 amount);
    event AEDDeposited(uint256 indexed id, address indexed buyer, uint256 amount);

    event SettlementExecuted(
        uint256 indexed id,
        address indexed seller,
        address indexed buyer,
        uint256 bondAmount,
        uint256 aedAmount,
        uint256 timestamp
    );

    event SettlementCancelled(uint256 indexed id, address indexed cancelledBy, string reason);
    event SettlementExpired(uint256 indexed id);

    // ============================================
    // Errors
    // ============================================

    error NotWhitelisted(address account);
    error InvalidSettlement(uint256 id);
    error NotSeller();
    error NotBuyer();
    error AlreadyDeposited();
    error NotFullyFunded();
    error SettlementExpiredError();
    error InvalidBondToken();
    error ZeroAmount();
    error SettlementNotActive();

    // ============================================
    // Modifiers
    // ============================================

    modifier onlyRegulator() {
        require(
            identityRegistry.hasRole(
                identityRegistry.REGULATOR_ROLE(),
                msg.sender
            ),
            "DvPSettlement: caller is not regulator"
        );
        _;
    }

    modifier validSettlement(uint256 id) {
        if (id == 0 || id > settlementCount) revert InvalidSettlement(id);
        _;
    }

    modifier onlyWhitelisted(address account) {
        if (!identityRegistry.isWhitelisted(account)) revert NotWhitelisted(account);
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
     * @notice Initialize the DvP Settlement contract
     * @param _identityRegistry Address of the identity registry contract
     * @param _aedStablecoin Address of the AED stablecoin contract
     */
    function initialize(
        address _identityRegistry,
        address _aedStablecoin
    ) public initializer {
        require(_identityRegistry != address(0), "Invalid registry");
        require(_aedStablecoin != address(0), "Invalid stablecoin");

        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        identityRegistry = IdentityRegistry(_identityRegistry);
        aedStablecoin = AEDStablecoin(_aedStablecoin);
        settlementTimeout = 24 hours;
    }

    // ============================================
    // UUPS Upgrade Authorization
    // ============================================

    /**
     * @notice Authorize upgrade to new implementation
     * @dev Only accounts with REGULATOR_ROLE can upgrade
     * @param newImplementation Address of new implementation contract
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRegulator {}

    // ============================================
    // External Functions - Settlement Creation
    // ============================================

    /**
     * @notice Create a new settlement
     * @param bondToken Address of the bond token contract
     * @param bondAmount Amount of bonds to sell
     * @param aedAmount Amount of AED to receive
     * @param buyer Address of the buyer
     * @return id Settlement ID
     */
    function createSettlement(
        address bondToken,
        uint256 bondAmount,
        uint256 aedAmount,
        address buyer
    )
        external
        whenNotPaused
        onlyWhitelisted(msg.sender)
        onlyWhitelisted(buyer)
        returns (uint256 id)
    {
        if (bondAmount == 0 || aedAmount == 0) revert ZeroAmount();
        if (bondToken == address(0)) revert InvalidBondToken();

        // Verify bond token is valid
        BondToken bond = BondToken(bondToken);
        require(bond.state() == BondToken.BondState.ACTIVE, "Bond not active");

        settlementCount++;
        id = settlementCount;

        settlements[id] = Settlement({
            id: id,
            seller: msg.sender,
            buyer: buyer,
            bondToken: bondToken,
            bondAmount: bondAmount,
            aedAmount: aedAmount,
            status: SettlementStatus.CREATED,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + settlementTimeout,
            executedAt: 0
        });

        emit SettlementCreated(
            id,
            msg.sender,
            buyer,
            bondToken,
            bondAmount,
            aedAmount,
            block.timestamp + settlementTimeout
        );

        return id;
    }

    /**
     * @notice Deposit bond tokens (seller)
     * @param id Settlement ID
     */
    function depositBond(uint256 id)
        external
        nonReentrant
        whenNotPaused
        validSettlement(id)
    {
        Settlement storage s = settlements[id];

        if (msg.sender != s.seller) revert NotSeller();
        if (bondDeposited[id]) revert AlreadyDeposited();
        if (block.timestamp > s.expiresAt) revert SettlementExpiredError();
        if (s.status == SettlementStatus.EXECUTED || s.status == SettlementStatus.CANCELLED) {
            revert SettlementNotActive();
        }

        // Transfer bonds to this contract
        IERC20(s.bondToken).safeTransferFrom(msg.sender, address(this), s.bondAmount);

        bondDeposited[id] = true;

        // Update status
        if (aedDeposited[id]) {
            s.status = SettlementStatus.FULLY_FUNDED;
        } else {
            s.status = SettlementStatus.SELLER_DEPOSITED;
        }

        emit BondDeposited(id, msg.sender, s.bondAmount);
    }

    /**
     * @notice Deposit AED tokens (buyer)
     * @param id Settlement ID
     */
    function depositAED(uint256 id)
        external
        nonReentrant
        whenNotPaused
        validSettlement(id)
    {
        Settlement storage s = settlements[id];

        if (msg.sender != s.buyer) revert NotBuyer();
        if (aedDeposited[id]) revert AlreadyDeposited();
        if (block.timestamp > s.expiresAt) revert SettlementExpiredError();
        if (s.status == SettlementStatus.EXECUTED || s.status == SettlementStatus.CANCELLED) {
            revert SettlementNotActive();
        }

        // Transfer AED to this contract
        IERC20(address(aedStablecoin)).safeTransferFrom(msg.sender, address(this), s.aedAmount);

        aedDeposited[id] = true;

        // Update status
        if (bondDeposited[id]) {
            s.status = SettlementStatus.FULLY_FUNDED;
        } else {
            s.status = SettlementStatus.BUYER_DEPOSITED;
        }

        emit AEDDeposited(id, msg.sender, s.aedAmount);
    }

    /**
     * @notice Execute the settlement (atomic swap)
     * @param id Settlement ID
     */
    function execute(uint256 id)
        external
        nonReentrant
        whenNotPaused
        validSettlement(id)
    {
        Settlement storage s = settlements[id];

        if (s.status != SettlementStatus.FULLY_FUNDED) revert NotFullyFunded();
        if (block.timestamp > s.expiresAt) revert SettlementExpiredError();

        // Mark as executed BEFORE transfers (reentrancy protection)
        s.status = SettlementStatus.EXECUTED;
        s.executedAt = block.timestamp;

        // ATOMIC: Transfer bonds to buyer
        IERC20(s.bondToken).safeTransfer(s.buyer, s.bondAmount);

        // ATOMIC: Transfer AED to seller
        IERC20(address(aedStablecoin)).safeTransfer(s.seller, s.aedAmount);

        emit SettlementExecuted(
            id,
            s.seller,
            s.buyer,
            s.bondAmount,
            s.aedAmount,
            block.timestamp
        );
    }

    /**
     * @notice Cancel a settlement and refund deposits
     * @param id Settlement ID
     * @param reason Reason for cancellation
     */
    function cancel(uint256 id, string calldata reason)
        external
        nonReentrant
        validSettlement(id)
    {
        Settlement storage s = settlements[id];

        // Only seller, buyer, or regulator can cancel
        require(
            msg.sender == s.seller ||
            msg.sender == s.buyer ||
            identityRegistry.hasRole(identityRegistry.REGULATOR_ROLE(), msg.sender),
            "Not authorized to cancel"
        );

        require(
            s.status != SettlementStatus.EXECUTED &&
            s.status != SettlementStatus.CANCELLED,
            "Settlement not active"
        );

        // Mark as cancelled
        s.status = SettlementStatus.CANCELLED;

        // Refund deposits
        if (bondDeposited[id]) {
            IERC20(s.bondToken).safeTransfer(s.seller, s.bondAmount);
            bondDeposited[id] = false;
        }

        if (aedDeposited[id]) {
            IERC20(address(aedStablecoin)).safeTransfer(s.buyer, s.aedAmount);
            aedDeposited[id] = false;
        }

        emit SettlementCancelled(id, msg.sender, reason);
    }

    /**
     * @notice Claim refund for expired settlement
     * @param id Settlement ID
     */
    function claimExpiredRefund(uint256 id)
        external
        nonReentrant
        validSettlement(id)
    {
        Settlement storage s = settlements[id];

        require(block.timestamp > s.expiresAt, "Not expired");
        require(
            s.status != SettlementStatus.EXECUTED &&
            s.status != SettlementStatus.CANCELLED,
            "Settlement not active"
        );

        // Mark as cancelled
        s.status = SettlementStatus.CANCELLED;

        // Refund deposits
        if (bondDeposited[id]) {
            IERC20(s.bondToken).safeTransfer(s.seller, s.bondAmount);
            bondDeposited[id] = false;
        }

        if (aedDeposited[id]) {
            IERC20(address(aedStablecoin)).safeTransfer(s.buyer, s.aedAmount);
            aedDeposited[id] = false;
        }

        emit SettlementExpired(id);
    }

    // ============================================
    // External Functions - Regulator
    // ============================================

    /**
     * @notice Update settlement timeout
     * @param newTimeout New timeout in seconds
     */
    function setSettlementTimeout(uint256 newTimeout) external onlyRegulator {
        require(newTimeout >= 1 hours && newTimeout <= 7 days, "Invalid timeout");
        settlementTimeout = newTimeout;
    }

    /**
     * @notice Pause all settlements
     */
    function pause() external onlyRegulator {
        _pause();
    }

    /**
     * @notice Unpause settlements
     */
    function unpause() external onlyRegulator {
        _unpause();
    }

    // ============================================
    // View Functions
    // ============================================

    /**
     * @notice Get settlement details
     * @param id Settlement ID
     */
    function getSettlement(uint256 id)
        external
        view
        validSettlement(id)
        returns (Settlement memory)
    {
        return settlements[id];
    }

    /**
     * @notice Check if settlement is ready to execute
     * @param id Settlement ID
     * @return ready Whether settlement can be executed
     * @return reason Reason if not ready
     */
    function canExecute(uint256 id)
        external
        view
        validSettlement(id)
        returns (bool ready, string memory reason)
    {
        Settlement storage s = settlements[id];

        if (s.status == SettlementStatus.EXECUTED) return (false, "Already executed");
        if (s.status == SettlementStatus.CANCELLED) return (false, "Cancelled");
        if (s.status != SettlementStatus.FULLY_FUNDED) return (false, "Not fully funded");
        if (block.timestamp > s.expiresAt) return (false, "Expired");
        if (paused()) return (false, "Contract paused");

        return (true, "");
    }

    /**
     * @notice Get all settlements for an address (paginated)
     * @param participant Address to query
     * @param offset Start index
     * @param limit Max results
     */
    function getSettlementsForParticipant(
        address participant,
        uint256 offset,
        uint256 limit
    ) external view returns (Settlement[] memory result) {
        // Count matching settlements first
        uint256 count = 0;
        for (uint256 i = 1; i <= settlementCount; i++) {
            if (settlements[i].seller == participant || settlements[i].buyer == participant) {
                count++;
            }
        }

        if (offset >= count) return new Settlement[](0);

        uint256 end = offset + limit;
        if (end > count) end = count;

        result = new Settlement[](end - offset);
        uint256 resultIndex = 0;
        uint256 matchIndex = 0;

        for (uint256 i = 1; i <= settlementCount && resultIndex < result.length; i++) {
            if (settlements[i].seller == participant || settlements[i].buyer == participant) {
                if (matchIndex >= offset) {
                    result[resultIndex] = settlements[i];
                    resultIndex++;
                }
                matchIndex++;
            }
        }

        return result;
    }

    // ============================================
    // Storage Gap for Upgrades
    // ============================================

    /**
     * @dev Reserved storage space to allow for layout changes in future upgrades
     */
    uint256[50] private __gap;
}
