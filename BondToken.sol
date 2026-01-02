// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./IdentityRegistry.sol";

/**
 * @title BondToken
 * @notice Tokenized government/corporate bonds for GulfStable L1
 * @dev ERC-20 with lifecycle management and investor eligibility (UUPS Upgradeable)
 *
 * Key Features:
 * - Bond lifecycle: ISSUED -> ACTIVE -> MATURED -> REDEEMED (or FROZEN)
 * - Only authorized issuers can create bonds
 * - Transfer restrictions based on investor eligibility
 * - Credit ratings: AAA to BB+ (investment grade only)
 * - UUPS upgradeable pattern for future improvements
 */
contract BondToken is
    Initializable,
    UUPSUpgradeable,
    ERC20Upgradeable,
    PausableUpgradeable,
    AccessControlUpgradeable
{
    // ============================================
    // Enums
    // ============================================

    enum BondState {
        ISSUED,     // Bond created but not active
        ACTIVE,     // Bond is tradeable
        MATURED,    // Bond has reached maturity
        REDEEMED,   // Bond has been redeemed
        FROZEN      // Bond frozen by regulator
    }

    // ============================================
    // State Variables
    // ============================================

    /// @notice Reference to the identity registry (changed from immutable for upgradeability)
    IdentityRegistry public identityRegistry;

    /// @notice ISIN identifier (International Securities Identification Number)
    string public isin;

    /// @notice Bond maturity date (Unix timestamp)
    uint256 public maturityDate;

    /// @notice Annual coupon rate in basis points (e.g., 500 = 5%)
    uint256 public couponRate;

    /// @notice Credit rating (AAA, AA+, AA, AA-, A+, A, A-, BBB+, BBB, BBB-, BB+)
    string public creditRating;

    /// @notice Face value per token unit
    uint256 public faceValue;

    /// @notice Current bond state
    BondState public state;

    /// @notice Issuer address
    address public issuer;

    /// @notice Bond issue date
    uint256 public issueDate;

    // ============================================
    // Events
    // ============================================

    event BondIssued(
        string indexed isin,
        address indexed issuer,
        uint256 totalSupply,
        uint256 maturityDate
    );

    event BondActivated(string indexed isin, uint256 timestamp);
    event BondMatured(string indexed isin, uint256 timestamp);
    event BondRedeemed(string indexed isin, uint256 timestamp, uint256 totalRedeemed);
    event BondFrozen(string indexed isin, address indexed frozenBy, string reason);
    event BondUnfrozen(string indexed isin, address indexed unfrozenBy);
    event CouponPaid(string indexed isin, uint256 amount, uint256 timestamp);

    // ============================================
    // Errors
    // ============================================

    error NotWhitelisted(address account);
    error InvalidBondState(BondState current, BondState required);
    error NotEligibleInvestor(address account);
    error BondNotTradeable();
    error BondAlreadyMatured();
    error InvalidCreditRating(string rating);
    error MaturityInPast();
    error ZeroSupply();

    // ============================================
    // Modifiers
    // ============================================

    modifier onlyBondIssuer() {
        require(
            identityRegistry.hasRole(
                identityRegistry.ISSUER_BOND_ROLE(),
                msg.sender
            ),
            "BondToken: caller is not bond issuer"
        );
        _;
    }

    modifier onlyRegulator() {
        require(
            identityRegistry.hasRole(
                identityRegistry.REGULATOR_ROLE(),
                msg.sender
            ),
            "BondToken: caller is not regulator"
        );
        _;
    }

    modifier inState(BondState _state) {
        if (state != _state) revert InvalidBondState(state, _state);
        _;
    }

    // ============================================
    // Constructor (disabled for UUPS)
    // ============================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ============================================
    // Initializer
    // ============================================

    /**
     * @notice Initialize the bond token contract
     * @param _identityRegistry Address of the identity registry contract
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _isin ISIN identifier
     * @param _maturityDate Bond maturity date (Unix timestamp)
     * @param _couponRate Annual coupon rate in basis points
     * @param _creditRating Credit rating string
     * @param _faceValue Face value per token unit
     * @param _totalSupply Total supply to mint
     * @param _issuer Address of the bond issuer
     */
    function initialize(
        address _identityRegistry,
        string memory _name,
        string memory _symbol,
        string memory _isin,
        uint256 _maturityDate,
        uint256 _couponRate,
        string memory _creditRating,
        uint256 _faceValue,
        uint256 _totalSupply,
        address _issuer
    ) public initializer {
        require(_identityRegistry != address(0), "Invalid registry");
        require(_maturityDate > block.timestamp, "Maturity in past");
        require(_totalSupply > 0, "Zero supply");
        require(_isValidCreditRating(_creditRating), "Invalid credit rating");
        require(_issuer != address(0), "Invalid issuer");

        // Initialize parent contracts
        __ERC20_init(_name, _symbol);
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        // Set bond parameters
        identityRegistry = IdentityRegistry(_identityRegistry);
        isin = _isin;
        maturityDate = _maturityDate;
        couponRate = _couponRate;
        creditRating = _creditRating;
        faceValue = _faceValue;
        issuer = _issuer;
        issueDate = block.timestamp;
        state = BondState.ISSUED;

        // Mint total supply to issuer
        _mint(_issuer, _totalSupply);

        emit BondIssued(_isin, _issuer, _totalSupply, _maturityDate);
    }

    // ============================================
    // UUPS Upgrade Authorization
    // ============================================

    /**
     * @notice Authorize contract upgrades
     * @dev Only accounts with ISSUER_BOND_ROLE can upgrade
     * @param newImplementation Address of the new implementation
     */
    function _authorizeUpgrade(address newImplementation) internal override {
        require(
            identityRegistry.hasRole(
                identityRegistry.ISSUER_BOND_ROLE(),
                msg.sender
            ),
            "BondToken: caller is not authorized to upgrade"
        );
    }

    // ============================================
    // External Functions - Bond Issuer
    // ============================================

    /**
     * @notice Activate the bond for trading
     */
    function activate() external onlyBondIssuer inState(BondState.ISSUED) {
        state = BondState.ACTIVE;
        emit BondActivated(isin, block.timestamp);
    }

    /**
     * @notice Mark the bond as redeemed (after paying out to holders)
     */
    function markRedeemed() external onlyBondIssuer inState(BondState.MATURED) {
        state = BondState.REDEEMED;
        emit BondRedeemed(isin, block.timestamp, totalSupply());
    }

    // ============================================
    // External Functions - Regulator
    // ============================================

    /**
     * @notice Mark the bond as matured (when maturity date reached)
     */
    function markMatured() external onlyRegulator {
        require(block.timestamp >= maturityDate, "Not yet matured");
        require(state == BondState.ACTIVE, "Not active");

        state = BondState.MATURED;
        emit BondMatured(isin, block.timestamp);
    }

    /**
     * @notice Freeze the bond (blocks all transfers)
     * @param reason Reason for freezing
     */
    function freeze(string calldata reason) external onlyRegulator {
        state = BondState.FROZEN;
        emit BondFrozen(isin, msg.sender, reason);
    }

    /**
     * @notice Unfreeze the bond
     * @param newState State to restore to
     */
    function unfreeze(BondState newState) external onlyRegulator inState(BondState.FROZEN) {
        require(
            newState == BondState.ACTIVE || newState == BondState.MATURED,
            "Invalid restore state"
        );
        state = newState;
        emit BondUnfrozen(isin, msg.sender);
    }

    /**
     * @notice Pause token transfers
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

    // ============================================
    // View Functions
    // ============================================

    /**
     * @notice Check if an investor is eligible to hold this bond
     * @param investor Address to check
     * @return eligible Whether the investor can hold this bond
     */
    function isEligibleInvestor(address investor) public view returns (bool eligible) {
        if (!identityRegistry.isWhitelisted(investor)) return false;

        // Check if KYC is valid
        (, , uint256 expiry, bool frozen) = identityRegistry.getParticipant(investor);
        if (frozen || expiry < block.timestamp) return false;

        // In a full implementation, we would check investor classification
        // (Institutional, Qualified, Retail) against bond requirements
        return true;
    }

    /**
     * @notice Get bond details
     */
    function getBondDetails() external view returns (
        string memory _isin,
        uint256 _maturityDate,
        uint256 _couponRate,
        string memory _creditRating,
        uint256 _faceValue,
        BondState _state,
        address _issuer,
        uint256 _totalSupply
    ) {
        return (
            isin,
            maturityDate,
            couponRate,
            creditRating,
            faceValue,
            state,
            issuer,
            totalSupply()
        );
    }

    /**
     * @notice Check if a transfer would be allowed
     * @param from Sender
     * @param to Recipient
     * @return allowed Whether transfer would succeed
     * @return reason Reason if not allowed
     */
    function canTransfer(
        address from,
        address to
    ) external view returns (bool allowed, string memory reason) {
        if (paused()) return (false, "Token paused");
        if (state != BondState.ACTIVE) return (false, "Bond not tradeable");
        if (!identityRegistry.isWhitelisted(from)) return (false, "Sender not whitelisted");
        if (!identityRegistry.isWhitelisted(to)) return (false, "Recipient not whitelisted");
        if (!isEligibleInvestor(to)) return (false, "Recipient not eligible investor");

        return (true, "");
    }

    /**
     * @notice Time until maturity
     * @return seconds Seconds until maturity (0 if matured)
     */
    function timeToMaturity() external view returns (uint256) {
        if (block.timestamp >= maturityDate) return 0;
        return maturityDate - block.timestamp;
    }

    // ============================================
    // Internal Functions
    // ============================================

    /**
     * @notice Hook called before any transfer
     */
    function _update(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        // Skip checks for mint (from = 0) and burn (to = 0)
        if (from != address(0) && to != address(0)) {
            // Bond must be ACTIVE to transfer
            if (state != BondState.ACTIVE) revert BondNotTradeable();

            // Check whitelist status
            if (!identityRegistry.isWhitelisted(from)) revert NotWhitelisted(from);
            if (!identityRegistry.isWhitelisted(to)) revert NotWhitelisted(to);

            // Check investor eligibility
            if (!isEligibleInvestor(to)) revert NotEligibleInvestor(to);
        }

        super._update(from, to, amount);
    }

    /**
     * @notice Validate credit rating
     * @param rating Credit rating string
     * @return valid Whether the rating is valid
     */
    function _isValidCreditRating(string memory rating) internal pure returns (bool valid) {
        bytes32 ratingHash = keccak256(bytes(rating));

        // Investment grade ratings only (AAA to BB+)
        return ratingHash == keccak256("AAA") ||
               ratingHash == keccak256("AA+") ||
               ratingHash == keccak256("AA") ||
               ratingHash == keccak256("AA-") ||
               ratingHash == keccak256("A+") ||
               ratingHash == keccak256("A") ||
               ratingHash == keccak256("A-") ||
               ratingHash == keccak256("BBB+") ||
               ratingHash == keccak256("BBB") ||
               ratingHash == keccak256("BBB-") ||
               ratingHash == keccak256("BB+");
    }

    // ============================================
    // ERC20 Overrides
    // ============================================

    /**
     * @notice Returns the number of decimals (0 for bonds - whole units)
     */
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    // ============================================
    // Storage Gap for Upgrades
    // ============================================

    /**
     * @dev Reserved storage space to allow for layout changes in future upgrades
     */
    uint256[50] private __gap;
}
