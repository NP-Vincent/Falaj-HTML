// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ITeleporterReceiver
 * @notice Interface for Teleporter message recipients
 */
interface ITeleporterReceiver {
    /**
     * @notice Receive a Teleporter message from another chain
     * @param sourceChainId The source chain identifier
     * @param originSenderAddress The originating sender address on the source chain
     * @param message The encoded payload
     */
    function receiveTeleporterMessage(
        bytes32 sourceChainId,
        address originSenderAddress,
        bytes calldata message
    ) external;
}
