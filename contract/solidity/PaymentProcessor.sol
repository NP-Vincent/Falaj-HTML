// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title IWarpMessenger
 * @notice Interface for Avalanche Warp Messaging precompile
 * @dev Warp Messenger precompile address: 0x0200000000000000000000000000000000000005
 */
interface IWarpMessenger {
    /**
     * @notice Send a cross-chain Warp message
     * @param payload The message payload to send
     * @return messageId The unique identifier for the sent message
     */
    function sendWarpMessage(bytes calldata payload) external returns (bytes32 messageId);

    /**
     * @notice Get the blockchain ID of this chain
     * @return blockchainID The 32-byte blockchain identifier
     */
    function getBlockchainID() external view returns (bytes32 blockchainID);
}

/**
 * @title PaymentProcessor
 * @notice Cross-chain payment processor for GulfStable L1 (UUPS Upgradeable)
 * @dev Accepts deposits on Avalanche C-Chain and sends Warp messages to GulfStable L1
 *
 * Key Features:
 * - Accept AVAX deposits and convert to AED equivalent
 * - Accept stablecoin deposits (USDC, USDT, etc.) and convert to AED
 * - Send cross-chain Warp messages to GulfStable L1 BridgeManager
 * - Admin-configurable exchange rates and destination chains
 * - UUPS upgradeable pattern for future improvements
 */
contract PaymentProcessor is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    // ============================================
    // Constants
    // ============================================

    /// @notice Warp Messenger precompile address
    address public constant WARP_MESSENGER = 0x0200000000000000000000000000000000000005;

    /// @notice Native token identifier for exchange rates
    address public constant NATIVE_TOKEN = address(0);

    /// @notice Rate precision (18 decimals)
    uint256 public constant RATE_DECIMALS = 18;

    /// @notice AED decimals (2 decimals like fiat)
    uint8 public constant AED_DECIMALS = 2;

    /// @notice Admin role for privileged operations
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // ============================================
    // State Variables
    // ============================================

    /// @notice Exchange rates from token to AED (18 decimal precision)
    /// @dev rate = how many AED units (2 decimals) per 1 token unit
    mapping(address => uint256) public exchangeRates;

    /// @notice Destination chain configurations
    mapping(bytes32 => address) public destinationBridgeManagers;

    /// @notice Default destination chain ID
    bytes32 public defaultDestinationChain;

    /// @notice Accumulated protocol fees (in native token)
    uint256 public accumulatedFees;

    /// @notice Protocol fee basis points (100 = 1%)
    uint256 public protocolFeeBps;

    /// @notice Total payments processed
    uint256 public totalPaymentsProcessed;

    /// @notice Total AED value processed
    uint256 public totalAedValueProcessed;

    // ============================================
    // Structs
    // ============================================

    /**
     * @notice Cross-chain payment payload structure
     * @param recipient Recipient address on GulfStable L1
     * @param aedAmount Amount in AED (2 decimals)
     * @param paymentRef Payment reference hash
     * @param sourceChainId Source chain identifier
     * @param timestamp Block timestamp of the payment
     * @param sourceSender Original sender on source chain
     */
    struct CrossChainPayment {
        address recipient;
        uint256 aedAmount;
        bytes32 paymentRef;
        uint256 sourceChainId;
        uint256 timestamp;
        address sourceSender;
    }

    // ============================================
    // Events
    // ============================================

    event PaymentInitiated(
        bytes32 indexed messageId,
        address indexed sender,
        address indexed recipient,
        uint256 sourceAmount,
        uint256 aedAmount,
        string paymentRef
    );

    event ExchangeRateUpdated(
        address indexed token,
        uint256 rate
    );

    event DestinationChainUpdated(
        bytes32 indexed chainId,
        address bridgeManager
    );

    event DefaultDestinationChainUpdated(
        bytes32 indexed chainId
    );

    event ProtocolFeeUpdated(
        uint256 oldFeeBps,
        uint256 newFeeBps
    );

    event FeesWithdrawn(
        address indexed to,
        uint256 amount
    );

    // ============================================
    // Errors
    // ============================================

    error ZeroAddress();
    error ZeroAmount();
    error UnsupportedToken(address token);
    error InvalidExchangeRate();
    error DestinationNotConfigured(bytes32 chainId);
    error TransferFailed();
    error InvalidFeeBps();
    error NoFeesToWithdraw();
    error ReferenceEmpty();

    // ============================================
    // Constructor (Disables Initializers)
    // ============================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ============================================
    // Initializer
    // ============================================

    /**
     * @notice Initialize the PaymentProcessor contract
     * @param admin Admin address with DEFAULT_ADMIN_ROLE and ADMIN_ROLE
     */
    function initialize(address admin) public initializer {
        if (admin == address(0)) revert ZeroAddress();

        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    // ============================================
    // UUPS Upgrade Authorization
    // ============================================

    /**
     * @notice Authorize contract upgrades
     * @dev Only accounts with ADMIN_ROLE can upgrade
     * @param newImplementation Address of new implementation contract
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(ADMIN_ROLE) {}

    // ============================================
    // External Functions - Deposits
    // ============================================

    /**
     * @notice Deposit AVAX and initiate cross-chain payment
     * @param recipient Recipient address on GulfStable L1
     * @param paymentRef Payment reference string
     */
    function depositAVAX(
        address recipient,
        string calldata paymentRef
    ) external payable nonReentrant whenNotPaused {
        if (recipient == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert ZeroAmount();
        if (bytes(paymentRef).length == 0) revert ReferenceEmpty();

        uint256 rate = exchangeRates[NATIVE_TOKEN];
        if (rate == 0) revert UnsupportedToken(NATIVE_TOKEN);

        // Calculate AED amount with proper decimal handling
        // msg.value is in 18 decimals (wei), rate is in 18 decimals
        // Result should be in 2 decimals (AED)
        uint256 aedAmount = _calculateAedAmount(msg.value, rate, 18);

        // Deduct protocol fee from AVAX
        uint256 fee = _calculateFee(msg.value);
        if (fee > 0) {
            accumulatedFees += fee;
        }

        // Send Warp message
        bytes32 messageId = _sendCrossChainPayment(recipient, aedAmount, paymentRef);

        totalPaymentsProcessed++;
        totalAedValueProcessed += aedAmount;

        emit PaymentInitiated(
            messageId,
            msg.sender,
            recipient,
            msg.value,
            aedAmount,
            paymentRef
        );
    }

    /**
     * @notice Deposit stablecoin and initiate cross-chain payment
     * @param token ERC20 token address
     * @param amount Token amount to deposit
     * @param recipient Recipient address on GulfStable L1
     * @param paymentRef Payment reference string
     */
    function depositStablecoin(
        address token,
        uint256 amount,
        address recipient,
        string calldata paymentRef
    ) external nonReentrant whenNotPaused {
        if (token == address(0)) revert ZeroAddress();
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (bytes(paymentRef).length == 0) revert ReferenceEmpty();

        uint256 rate = exchangeRates[token];
        if (rate == 0) revert UnsupportedToken(token);

        // Transfer tokens from sender
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Get token decimals for proper conversion
        uint8 tokenDecimals = _getTokenDecimals(token);

        // Calculate AED amount
        uint256 aedAmount = _calculateAedAmount(amount, rate, tokenDecimals);

        // Send Warp message
        bytes32 messageId = _sendCrossChainPayment(recipient, aedAmount, paymentRef);

        totalPaymentsProcessed++;
        totalAedValueProcessed += aedAmount;

        emit PaymentInitiated(
            messageId,
            msg.sender,
            recipient,
            amount,
            aedAmount,
            paymentRef
        );
    }

    // ============================================
    // External Functions - Admin Only
    // ============================================

    /**
     * @notice Set exchange rate for a token to AED
     * @param token Token address (address(0) for native AVAX)
     * @param rateToAED Exchange rate with 18 decimal precision
     */
    function setExchangeRate(
        address token,
        uint256 rateToAED
    ) external onlyRole(ADMIN_ROLE) {
        if (rateToAED == 0) revert InvalidExchangeRate();

        exchangeRates[token] = rateToAED;

        emit ExchangeRateUpdated(token, rateToAED);
    }

    /**
     * @notice Set destination chain configuration
     * @param chainId Destination chain identifier
     * @param bridgeManager BridgeManager contract address on destination chain
     */
    function setDestinationChain(
        bytes32 chainId,
        address bridgeManager
    ) external onlyRole(ADMIN_ROLE) {
        if (bridgeManager == address(0)) revert ZeroAddress();

        destinationBridgeManagers[chainId] = bridgeManager;

        emit DestinationChainUpdated(chainId, bridgeManager);
    }

    /**
     * @notice Set the default destination chain
     * @param chainId Default destination chain identifier
     */
    function setDefaultDestinationChain(
        bytes32 chainId
    ) external onlyRole(ADMIN_ROLE) {
        if (destinationBridgeManagers[chainId] == address(0)) {
            revert DestinationNotConfigured(chainId);
        }

        defaultDestinationChain = chainId;

        emit DefaultDestinationChainUpdated(chainId);
    }

    /**
     * @notice Set protocol fee in basis points
     * @param feeBps Fee in basis points (100 = 1%, max 500 = 5%)
     */
    function setProtocolFee(
        uint256 feeBps
    ) external onlyRole(ADMIN_ROLE) {
        if (feeBps > 500) revert InvalidFeeBps();

        uint256 oldFeeBps = protocolFeeBps;
        protocolFeeBps = feeBps;

        emit ProtocolFeeUpdated(oldFeeBps, feeBps);
    }

    /**
     * @notice Withdraw accumulated protocol fees
     * @param to Recipient address for fees
     */
    function withdrawFees(
        address to
    ) external onlyRole(ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        if (accumulatedFees == 0) revert NoFeesToWithdraw();

        uint256 amount = accumulatedFees;
        accumulatedFees = 0;

        (bool success, ) = payable(to).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit FeesWithdrawn(to, amount);
    }

    /**
     * @notice Emergency withdraw ERC20 tokens
     * @param token Token address to withdraw
     * @param to Recipient address
     * @param amount Amount to withdraw
     */
    function emergencyWithdrawToken(
        address token,
        address to,
        uint256 amount
    ) external onlyRole(ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        IERC20(token).safeTransfer(to, amount);
    }

    /**
     * @notice Pause the contract
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // ============================================
    // View Functions
    // ============================================

    /**
     * @notice Get exchange rate for a token
     * @param token Token address (address(0) for native AVAX)
     * @return rate Exchange rate with 18 decimal precision
     */
    function getExchangeRate(
        address token
    ) external view returns (uint256 rate) {
        return exchangeRates[token];
    }

    /**
     * @notice Get destination bridge manager for a chain
     * @param chainId Chain identifier
     * @return bridgeManager BridgeManager contract address
     */
    function getDestinationBridgeManager(
        bytes32 chainId
    ) external view returns (address bridgeManager) {
        return destinationBridgeManagers[chainId];
    }

    /**
     * @notice Calculate AED amount for a given token amount
     * @param token Token address (address(0) for native AVAX)
     * @param amount Token amount
     * @return aedAmount Equivalent AED amount (2 decimals)
     */
    function calculateAedAmount(
        address token,
        uint256 amount
    ) external view returns (uint256 aedAmount) {
        uint256 rate = exchangeRates[token];
        if (rate == 0) revert UnsupportedToken(token);

        uint8 decimals = token == NATIVE_TOKEN ? 18 : _getTokenDecimals(token);
        return _calculateAedAmount(amount, rate, decimals);
    }

    /**
     * @notice Check if a token is supported
     * @param token Token address
     * @return supported Whether the token has a configured exchange rate
     */
    function isTokenSupported(
        address token
    ) external view returns (bool supported) {
        return exchangeRates[token] > 0;
    }

    // ============================================
    // Internal Functions
    // ============================================

    /**
     * @notice Calculate AED amount from source amount and rate
     * @param amount Source token amount
     * @param rate Exchange rate (18 decimals)
     * @param sourceDecimals Decimals of source token
     * @return aedAmount AED amount (2 decimals)
     */
    function _calculateAedAmount(
        uint256 amount,
        uint256 rate,
        uint8 sourceDecimals
    ) internal pure returns (uint256 aedAmount) {
        // Formula: aedAmount = (amount * rate) / 10^(sourceDecimals + rateDecimals - aedDecimals)
        // = (amount * rate) / 10^(sourceDecimals + 18 - 2)
        // = (amount * rate) / 10^(sourceDecimals + 16)
        uint256 divisor = 10 ** (uint256(sourceDecimals) + RATE_DECIMALS - AED_DECIMALS);
        return (amount * rate) / divisor;
    }

    /**
     * @notice Calculate protocol fee
     * @param amount Amount to calculate fee on
     * @return fee Fee amount
     */
    function _calculateFee(uint256 amount) internal view returns (uint256 fee) {
        if (protocolFeeBps == 0) return 0;
        return (amount * protocolFeeBps) / 10000;
    }

    /**
     * @notice Get token decimals
     * @param token Token address
     * @return decimals Token decimals
     */
    function _getTokenDecimals(address token) internal view returns (uint8 decimals) {
        // Try to get decimals from token
        // Most ERC20 tokens implement decimals() but it's optional
        try IERC20Metadata(token).decimals() returns (uint8 d) {
            return d;
        } catch {
            // Default to 18 if decimals() is not implemented
            return 18;
        }
    }

    /**
     * @notice Send cross-chain payment via Warp messaging
     * @param recipient Recipient on destination chain
     * @param aedAmount AED amount (2 decimals)
     * @param paymentRef Payment reference
     * @return messageId Warp message ID
     */
    function _sendCrossChainPayment(
        address recipient,
        uint256 aedAmount,
        string calldata paymentRef
    ) internal returns (bytes32 messageId) {
        // Validate destination is configured
        if (defaultDestinationChain == bytes32(0)) {
            revert DestinationNotConfigured(bytes32(0));
        }

        // Create payment payload
        CrossChainPayment memory payment = CrossChainPayment({
            recipient: recipient,
            aedAmount: aedAmount,
            paymentRef: keccak256(bytes(paymentRef)),
            sourceChainId: block.chainid,
            timestamp: block.timestamp,
            sourceSender: msg.sender
        });

        // Encode payload
        bytes memory payload = abi.encode(payment);

        // Send via Warp Messenger precompile
        IWarpMessenger warpMessenger = IWarpMessenger(WARP_MESSENGER);
        messageId = warpMessenger.sendWarpMessage(payload);

        return messageId;
    }

    // ============================================
    // Receive Function
    // ============================================

    /**
     * @notice Receive native token (for fee collection)
     */
    receive() external payable {}

    // ============================================
    // Storage Gap for Future Upgrades
    // ============================================

    /**
     * @dev Reserved storage space for future upgrades
     * This allows adding new state variables without shifting storage layout
     */
    uint256[50] private __gap;
}

/**
 * @title IERC20Metadata
 * @notice Interface for ERC20 metadata extension
 */
interface IERC20Metadata is IERC20 {
    function decimals() external view returns (uint8);
}
