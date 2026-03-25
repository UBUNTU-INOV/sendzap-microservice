import express from 'express'
import * as sessionController from '../controllers/session.controller.js'
import * as messageController from '../controllers/message.controller.js'
import * as groupController from '../controllers/group.controller.js'
import * as statusController from '../controllers/status.controller.js'
import * as channelController from '../controllers/channel.controller.js'
import * as healthController from '../controllers/health.controller.js'

import { messageLimiter, checkNumberLimiter } from '../middleware/rate-limit.middleware.js'

import {
    validateSessionId,
    validateSendMessage,
    validateSendBulk,
    validateCheckNumber,
    validateSendContact,
    validateSetTyping,
    validateListGroupsOrContacts,
    validateGroupParticipants,
    validateGroupInvite,
    validateGroupJoin,
    validateGroupSettings,
    validateGroupIdentity,
    validateSendStatus,
    validateDeleteStatus,
    validateGroupCreate,
    validateGroupMetadata,
    validateGroupLeave,
    validateChannelList,
    validateChannelCreate,
    validateChannelSend,
    validateChannelInfo,
    validateChannelFollow,
    validateChannelMute,
    validateChannelUpdate,
    validateChannelDelete
} from '../middleware/validation.middleware.js'

const router = express.Router()

// Session routes
router.get('/sessions', sessionController.listSessions)
router.post('/session/:id', validateSessionId, sessionController.createOrGetSession)
router.get('/session/:id', validateSessionId, sessionController.getSessionStatus)
router.get('/session/:id/qr', validateSessionId, sessionController.getQRImage)
router.delete('/session/:id', validateSessionId, sessionController.deleteSession)

// Message & Contact routes
router.post('/send', validateSendMessage, messageLimiter, messageController.sendMessage)
router.post('/send-bulk', validateSendBulk, messageLimiter, messageController.sendBulkMessage)
router.get('/groups/:sessionId', validateListGroupsOrContacts, messageController.listGroups)
router.get('/contacts/:sessionId', validateListGroupsOrContacts, messageController.listContacts)
router.post('/check-number', validateCheckNumber, checkNumberLimiter, messageController.checkNumber)
router.post('/send-contact', validateSendContact, messageLimiter, messageController.sendContact)
router.post('/set-typing', validateSetTyping, messageController.setTyping)

// Group management routes
router.post('/groups/participants/update', validateGroupParticipants, groupController.updateParticipants)
router.post('/groups/participants/add', validateGroupParticipants, groupController.addParticipants)
router.post('/groups/participants/remove', validateGroupParticipants, groupController.removeParticipants)
router.get('/groups/invite-code/:sessionId/:groupId', validateGroupInvite, groupController.getInviteCode)
router.post('/groups/revoke-invite', validateGroupInvite, groupController.revokeInviteCode)
router.post('/groups/join-invite', validateGroupJoin, groupController.joinGroupViaInvite)
router.post('/groups/settings', validateGroupSettings, groupController.updateGroupSettings)
router.post('/groups/identity', validateGroupIdentity, groupController.updateGroupIdentity)
router.post('/groups/create', validateGroupCreate, groupController.createGroup)
router.post('/groups/leave', validateGroupLeave, groupController.leaveGroup)
router.get('/groups/participants/:sessionId/:groupId', validateGroupMetadata, groupController.getGroupParticipants)
router.get('/groups/:sessionId/:groupId', validateGroupMetadata, groupController.getGroupMetadata)

// Status/Story routes
router.post('/status/send', validateSendStatus, statusController.sendStatus)
router.post('/status/delete', validateDeleteStatus, statusController.deleteStatus)

// Channel/Newsletter routes
router.get('/channels/:sessionId', validateChannelList, channelController.listChannels)
router.post('/channels/create', validateChannelCreate, channelController.createChannel)
router.post('/channels/send', validateChannelSend, messageLimiter, channelController.sendChannelMessage)
router.get('/channels/info/:sessionId/:channelId', validateChannelInfo, channelController.getChannelInfo)
router.post('/channels/follow', validateChannelFollow, channelController.followChannel)
router.post('/channels/unfollow', validateChannelFollow, channelController.unfollowChannel)
router.post('/channels/mute', validateChannelMute, channelController.muteChannel)
router.post('/channels/update', validateChannelUpdate, channelController.updateChannel)
router.post('/channels/delete', validateChannelDelete, channelController.deleteChannel)

// Health check route
router.get('/health', healthController.getHealth)

export default router
