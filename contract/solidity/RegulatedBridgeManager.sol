// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./IdentityRegistry.sol";
import "./AEDStablecoin.sol";

/**
 * @title ITeleporterMessenger
 * @notice Interface for Teleporter cross-chain messaging
 */
interface ITeleporterMessenger {
    /**
     * @notice Send a cross-chain Teleporter message
     * @param destinationChainId Destination chain identifier
     * @param destinationAddress Destination contract address
     * @param payload The message payload to send
     * @return messageId The unique identifier for the sent message
     */
    function sendCrossChainMessage(
        bytes32 destinationChainId,
        address destinationAddress,
        bytes calldata payload
    ) external payable returns (bytes32 messageId);
}

/**
 * @title RegulatedBridgeManager
 * @notice Cross-chain bridge manager for GulfStable L1 (UUPS Upgradeable)
 * @dev Receives Teleporter messages from C-Chain PaymentProcessor and executes regulated AED transfers
 *
 * Key Features:
 * - Integrates with Teleporter messaging
 * - Validates source chain and sender authorization
 * - Enforces compliance checks via IdentityRegistry
 * - Prevents replay attacks with message tracking
 * - Supports both minting and reserve-based transfers
 * - UUPS upgradeable pattern for future improvements
 */
contract RegulatedBridgeManager is
    Initializable,
    UUPSUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    // ============================================
    // Teleporter Messenger
    // ============================================

    /// @notice Teleporter messenger contract address
    ITeleporterMessenger public teleporterMessenger;

    /// @notice Cross-chain payment payload structure (decoded from Teleporter message)
    struct CrossChainPayment {
        address recipient;
        uint256 aedAmount;
        bytes32 paymentRef;
        uint256 sourceChainId;
        uint256 timestamp;
        address sourceSender;
    }

    // ============================================
    // State Variables
    // ============================================

    /// @notice Reference to the identity registry
    IdentityRegistry public identityRegistry;

    /// @notice Reference to the AED stablecoin contract
    AEDStablecoin public aedStablecoin;

    /// @notice Bridge reserve address (for reserve-based transfers)
    address public bridgeReserve;

    /// @notice Whether to use minting (true) or reserve transfers (false)
    bool public useMinting;

    /// @notice Mapping of processed message IDs to prevent replay attacks
    mapping(bytes32 => bool) public processedMessages;

    /// @notice Mapping of authorized source chain IDs
    mapping(bytes32 => bool) public authorizedSourceChains;

    /// @notice Mapping of authorized payment processors per source chain
    mapping(bytes32 => address) public paymentProcessors;

    /// @notice Total amount received via bridge
    uint256 public totalBridgedIn;

    /// @notice Total number of successful bridge transactions
    uint256 public totalBridgeTransactions;

    // ============================================
    // Events
    // ============================================

    event CrossChainPaymentReceived(
        bytes32 indexed messageId,
        address indexed recipient,
        uint256 amount,
        bytes32 sourceChainId,
        bytes32 paymentRef
    );

    event CrossChainPaymentFailed(
        bytes32 indexed messageId,
        address indexed recipient,
        string reason
    );

    event SourceChainAuthorized(
        bytes32 indexed chainId,
        bool authorized
    );

    event PaymentProcessorUpdated(
        bytes32 indexed chainId,
        address processor
    );

    event BridgeReserveUpdated(
        address indexed oldReserve,
        address indexed newReserve
    );

    event AEDStablecoinUpdated(
        address indexed oldStablecoin,
        address indexed newStablecoin
    );

    event TeleporterMessengerUpdated(
        address indexed oldMessenger,
        address indexed newMessenger
    );

    event MintingModeUpdated(
        bool useMinting
    );

    event TokensRescued(
        address indexed token,
        address indexed to,
        uint256 amount
    );

    // ============================================
    // Errors
    // ============================================

    error NotRegulator();
    error TeleporterMessengerNotConfigured();
    error UnauthorizedTeleporterMessenger(address sender);
    error UnauthorizedSourceChain(bytes32 chainId);
    error UnauthorizedSender(address sender, bytes32 chainId);
    error SourceChainIdMismatch(uint256 payloadChainId, bytes32 sourceChainId);
    error PayloadSenderMismatch(address payloadSender, address originSenderAddress);
    error MessageAlreadyProcessed(bytes32 messageId);
    error RecipientNotWhitelisted(address recipient);
    error RecipientFrozen(address recipient);
    error RecipientKYCExpired(address recipient);
    error TransferFailed();
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientReserve();
    error AEDStablecoinNotSet();
    error BridgeReserveNotSet();

    // ============================================
    // Modifiers
    // ============================================

    modifier onlyRegulator() {
        if (!identityRegistry.hasRole(identityRegistry.REGULATOR_ROLE(), msg.sender)) {
            revert NotRegulator();
        }
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
     * @notice Initialize the bridge manager
     * @param _identityRegistry Address of the IdentityRegistry contract
     * @param _aedStablecoin Address of the AEDStablecoin contract
     */
    function initialize(
        address _identityRegistry,
        address _aedStablecoin
    ) public initializer {
        if (_identityRegistry == address(0)) revert ZeroAddress();
        if (_aedStablecoin == address(0)) revert ZeroAddress();

        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        identityRegistry = IdentityRegistry(_identityRegistry);
        aedStablecoin = AEDStablecoin(_aedStablecoin);
        useMinting = false; // Default to reserve-based transfers
    }

    // ============================================
    // UUPS Upgrade Authorization
    // ============================================

    /**
     * @notice Authorize contract upgrades - only REGULATOR_ROLE can upgrade
     * @param newImplementation Address of the new implementation
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRegulator {}

    // ============================================
    // External Functions - Message Reception
    // ============================================

    /**
     * @notice Receive and process a Teleporter message from another chain
     * @param sourceChainId The source chain identifier
     * @param originSenderAddress The originating sender address on the source chain
     * @param payload The encoded payment payload
     */
    function receiveTeleporterMessage(
        bytes32 sourceChainId,
        address originSenderAddress,
        bytes calldata payload
    ) external nonReentrant whenNotPaused {
        if (address(teleporterMessenger) == address(0)) {
            revert TeleporterMessengerNotConfigured();
        }

        if (msg.sender != address(teleporterMessenger)) {
            revert UnauthorizedTeleporterMessenger(msg.sender);
        }

        // Validate source chain authorization
        if (!authorizedSourceChains[sourceChainId]) {
            revert UnauthorizedSourceChain(sourceChainId);
        }

        // Validate sender is the authorized payment processor for this chain
        address expectedProcessor = paymentProcessors[sourceChainId];
        if (originSenderAddress != expectedProcessor) {
            revert UnauthorizedSender(originSenderAddress, sourceChainId);
        }

        // Decode the payment payload
        CrossChainPayment memory payment = _decodePayload(payload);

        if (bytes32(payment.sourceChainId) != sourceChainId) {
            revert SourceChainIdMismatch(payment.sourceChainId, sourceChainId);
        }

        if (payment.sourceSender != originSenderAddress) {
            revert PayloadSenderMismatch(payment.sourceSender, originSenderAddress);
        }

        bytes32 messageId = keccak256(abi.encode(sourceChainId, originSenderAddress, payload));

        // Check for replay attack
        if (processedMessages[messageId]) {
            revert MessageAlreadyProcessed(messageId);
        }

        // Mark message as processed (before external calls)
        processedMessages[messageId] = true;

        // Validate recipient compliance
        (bool canReceive, string memory reason) = _canReceive(payment.recipient);
        if (!canReceive) {
            emit CrossChainPaymentFailed(
                messageId,
                payment.recipient,
                reason
            );
            return;
        }

        // Execute the transfer
        bool transferred = _executeTransfer(payment.recipient, payment.aedAmount);
        if (!transferred) {
            emit CrossChainPaymentFailed(
                messageId,
                payment.recipient,
                "Transfer execution failed"
            );
            return;
        }

        // Update statistics
        totalBridgedIn += payment.aedAmount;
        totalBridgeTransactions++;

        emit CrossChainPaymentReceived(
            messageId,
            payment.recipient,
            payment.aedAmount,
            sourceChainId,
            payment.paymentRef
        );
    }

    // ============================================
    // External Functions - Compliance Checks
    // ============================================

    /**
     * @notice Check if a recipient can receive cross-chain payments
     * @param recipient The address to check
     * @return allowed Whether the recipient can receive
     * @return reason The reason if not allowed
     */
    function canReceive(address recipient) external view returns (bool allowed, string memory reason) {
        return _canReceive(recipient);
    }

    // ============================================
    // External Functions - Source Chain Authorization
    // ============================================

    /**
     * @notice Set authorization status for a source chain
     * @param chainId The chain ID to authorize/deauthorize
     * @param authorized Whether the chain is authorized
     */
    function setAuthorizedSourceChain(
        bytes32 chainId,
        bool authorized
    ) external onlyRegulator {
        authorizedSourceChains[chainId] = authorized;
        emit SourceChainAuthorized(chainId, authorized);
    }

    /**
     * @notice Set the payment processor address for a source chain
     * @param chainId The chain ID
     * @param processor The payment processor address on that chain
     */
    function setPaymentProcessor(
        bytes32 chainId,
        address processor
    ) external onlyRegulator {
        if (processor == address(0)) revert ZeroAddress();
        paymentProcessors[chainId] = processor;
        emit PaymentProcessorUpdated(chainId, processor);
    }

    /**
     * @notice Check if a source chain is authorized
     * @param chainId The chain ID to check
     * @return Whether the chain is authorized
     */
    function isAuthorizedSourceChain(bytes32 chainId) external view returns (bool) {
        return authorizedSourceChains[chainId];
    }

    /**
     * @notice Get the payment processor for a source chain
     * @param chainId The chain ID
     * @return The payment processor address
     */
    function getPaymentProcessor(bytes32 chainId) external view returns (address) {
        return paymentProcessors[chainId];
    }

    // ============================================
    // External Functions - Configuration
    // ============================================

    /**
     * @notice Set the bridge reserve address
     * @param reserve The new reserve address
     */
    function setBridgeReserve(address reserve) external onlyRegulator {
        if (reserve == address(0)) revert ZeroAddress();
        address oldReserve = bridgeReserve;
        bridgeReserve = reserve;
        emit BridgeReserveUpdated(oldReserve, reserve);
    }

    /**
     * @notice Set the AED stablecoin contract address
     * @param stablecoin The new AEDStablecoin address
     */
    function setAEDStablecoin(address stablecoin) external onlyRegulator {
        if (stablecoin == address(0)) revert ZeroAddress();
        address oldStablecoin = address(aedStablecoin);
        aedStablecoin = AEDStablecoin(stablecoin);
        emit AEDStablecoinUpdated(oldStablecoin, stablecoin);
    }

    /**
     * @notice Set the Teleporter messenger contract address
     * @param messenger The Teleporter messenger contract address
     */
    function setTeleporterMessenger(address messenger) external onlyRegulator {
        if (messenger == address(0)) revert ZeroAddress();
        address oldMessenger = address(teleporterMessenger);
        teleporterMessenger = ITeleporterMessenger(messenger);
        emit TeleporterMessengerUpdated(oldMessenger, messenger);
    }

    /**
     * @notice Set whether to use minting or reserve transfers
     * @param _useMinting True for minting, false for reserve transfers
     */
    function setMintingMode(bool _useMinting) external onlyRegulator {
        useMinting = _useMinting;
        emit MintingModeUpdated(_useMinting);
    }

    // ============================================
    // External Functions - Admin
    // ============================================

    /**
     * @notice Pause the bridge (emergency only)
     */
    function pause() external onlyRegulator {
        _pause();
    }

    /**
     * @notice Unpause the bridge
     */
    function unpause() external onlyRegulator {
        _unpause();
    }

    /**
     * @notice Rescue tokens stuck in the contract
     * @param token The token address to rescue (address(0) for native)
     * @param amount The amount to rescue
     */
    function rescueTokens(address token, uint256 amount) external onlyRegulator {
        if (amount == 0) revert ZeroAmount();

        if (token == address(0)) {
            // Rescue native tokens
            (bool success, ) = msg.sender.call{value: amount}("");
            if (!success) revert TransferFailed();
        } else {
            // Rescue ERC20 tokens
            IERC20(token).safeTransfer(msg.sender, amount);
        }

        emit TokensRescued(token, msg.sender, amount);
    }

    // ============================================
    // View Functions
    // ============================================

    /**
     * @notice Check if a message has been processed
     * @param messageId The message ID to check
     * @return Whether the message has been processed
     */
    function isMessageProcessed(bytes32 messageId) external view returns (bool) {
        return processedMessages[messageId];
    }

    /**
     * @notice Get bridge statistics
     * @return _totalBridgedIn Total amount bridged in
     * @return _totalTransactions Total number of successful transactions
     */
    function getBridgeStats() external view returns (
        uint256 _totalBridgedIn,
        uint256 _totalTransactions
    ) {
        return (totalBridgedIn, totalBridgeTransactions);
    }

    // ============================================
    // Internal Functions
    // ============================================

    /**
     * @notice Check if a recipient can receive cross-chain payments
     * @param recipient The address to check
     * @return allowed Whether the recipient can receive
     * @return reason The reason if not allowed
     */
    function _canReceive(address recipient) internal view returns (bool allowed, string memory reason) {
        // Check if recipient is whitelisted
        if (!identityRegistry.isWhitelisted(recipient)) {
            return (false, "Recipient not whitelisted");
        }

        // Check if recipient is frozen in IdentityRegistry
        (, , , bool frozen) = identityRegistry.getParticipant(recipient);
        if (frozen) {
            return (false, "Recipient is frozen");
        }

        // Check if recipient is frozen in AEDStablecoin
        if (aedStablecoin.isFrozen(recipient)) {
            return (false, "Recipient is frozen in stablecoin");
        }

        // Check KYC expiry
        (, , uint256 expiry, ) = identityRegistry.getParticipant(recipient);
        if (expiry < block.timestamp) {
            return (false, "Recipient KYC expired");
        }

        return (true, "");
    }

    /**
     * @notice Execute the AED transfer to recipient
     * @param recipient The recipient address
     * @param amount The amount to transfer
     * @return success Whether the transfer succeeded
     */
    function _executeTransfer(address recipient, uint256 amount) internal returns (bool success) {
        if (amount == 0) return false;

        if (useMinting) {
            // Minting mode: Bridge has minting rights
            // Note: This requires the bridge to have ISSUER_STABLECOIN_ROLE
            if (address(aedStablecoin) == address(0)) revert AEDStablecoinNotSet();

            try aedStablecoin.mint(recipient, amount) {
                return true;
            } catch {
                return false;
            }
        } else {
            // Reserve mode: Transfer from bridge reserve
            if (bridgeReserve == address(0)) revert BridgeReserveNotSet();

            uint256 reserveBalance = aedStablecoin.balanceOf(bridgeReserve);
            if (reserveBalance < amount) revert InsufficientReserve();

            // Transfer from reserve to recipient
            // Note: Reserve must have approved this contract
            try aedStablecoin.transferFrom(bridgeReserve, recipient, amount) {
                return true;
            } catch {
                return false;
            }
        }
    }

    /**
     * @notice Decode the Teleporter message payload into a CrossChainPayment
     * @param payload The encoded payload bytes
     * @return payment The decoded payment structure
     */
    function _decodePayload(bytes memory payload) internal pure returns (CrossChainPayment memory payment) {
        (
            address recipient,
            uint256 aedAmount,
            bytes32 paymentRef,
            uint256 sourceChainId,
            uint256 timestamp,
            address sourceSender
        ) = abi.decode(payload, (address, uint256, bytes32, uint256, uint256, address));

        payment = CrossChainPayment({
            recipient: recipient,
            aedAmount: aedAmount,
            paymentRef: paymentRef,
            sourceChainId: sourceChainId,
            timestamp: timestamp,
            sourceSender: sourceSender
        });
    }

    // ============================================
    // Receive Function
    // ============================================

    /// @notice Allow contract to receive native tokens
    receive() external payable {}

    // ============================================
    // Storage Gap for Upgradeable Contracts
    // ============================================

    /**
     * @dev Reserved storage space to allow for layout changes in future upgrades
     * @notice 50 slots reserved for future state variables
     */
    uint256[49] private __gap;
}
