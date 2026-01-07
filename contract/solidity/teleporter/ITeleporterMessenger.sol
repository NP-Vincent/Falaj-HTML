// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ITeleporterMessenger
 * @notice Interface for Teleporter cross-chain messaging
 */
interface ITeleporterMessenger {
    struct TeleporterMessageInput {
        bytes32 destinationChainId;
        address destinationAddress;
        bytes message;
        uint256 requiredGasLimit;
        uint256 fee;
        address[] allowedRelayerAddresses;
    }

    /**
     * @notice Send a cross-chain Teleporter message
     * @param messageInput Message input parameters for the Teleporter message
     * @return messageId The unique identifier for the sent message
     */
    function sendCrossChainMessage(
        TeleporterMessageInput calldata messageInput
    ) external payable returns (bytes32 messageId);
}
