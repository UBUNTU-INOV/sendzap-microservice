import * as sessionManager from '../services/session.manager.js'
import logger from '../config/logger.js'

/**
 * Update participants in a group (add, remove, promote, demote)
 */
export const updateParticipants = async (req, res) => {
    try {
        const { sessionId, groupId, participants, action } = req.body
        const session = sessionManager.getSession(sessionId)

        if (!session || session.status !== 'connected') {
            return res.status(400).json({ error: 'Session not found or not connected' })
        }

        const jid = groupId.includes('@') ? groupId : `${groupId}@g.us`

        // participants should be an array of JIDs
        const participantJids = participants.map(p => p.includes('@') ? p : `${p}@s.whatsapp.net`)

        const response = await session.sock.groupParticipantsUpdate(
            jid,
            participantJids,
            action // 'add' | 'remove' | 'promote' | 'demote'
        )

        res.json({ status: 'success', response })
    } catch (error) {
        logger.error(`Controller Error (updateParticipants):`, error)
        res.status(500).json({ error: error.message })
    }
}

/**
 * Shortcut to add participants
 */
export const addParticipants = (req, res) => {
    req.body.action = 'add'
    return updateParticipants(req, res)
}

/**
 * Shortcut to remove participants
 */
export const removeParticipants = (req, res) => {
    req.body.action = 'remove'
    return updateParticipants(req, res)
}

/**
 * Get or generate group invite code
 */
export const getInviteCode = async (req, res) => {
    try {
        const { sessionId, groupId } = req.params
        const session = sessionManager.getSession(sessionId)

        if (!session || session.status !== 'connected') {
            return res.status(400).json({ error: 'Session not found or not connected' })
        }

        const jid = groupId.includes('@') ? groupId : `${groupId}@g.us`
        const code = await session.sock.groupInviteCode(jid)

        res.json({ status: 'success', code, inviteUrl: `https://chat.whatsapp.com/${code}` })
    } catch (error) {
        logger.error(`Controller Error (getInviteCode):`, error)
        res.status(500).json({ error: error.message })
    }
}

/**
 * Revoke and reset group invite code
 */
export const revokeInviteCode = async (req, res) => {
    try {
        const { sessionId, groupId } = req.body
        const session = sessionManager.getSession(sessionId)

        if (!session || session.status !== 'connected') {
            return res.status(400).json({ error: 'Session not found or not connected' })
        }

        const jid = groupId.includes('@') ? groupId : `${groupId}@g.us`
        const code = await session.sock.groupRevokeInvite(jid)

        res.json({ status: 'success', code, inviteUrl: `https://chat.whatsapp.com/${code}` })
    } catch (error) {
        logger.error(`Controller Error (revokeInviteCode):`, error)
        res.status(500).json({ error: error.message })
    }
}

/**
 * Join group via invite code
 */
export const joinGroupViaInvite = async (req, res) => {
    try {
        const { sessionId, code } = req.body
        const session = sessionManager.getSession(sessionId)

        if (!session || session.status !== 'connected') {
            return res.status(400).json({ error: 'Session not found or not connected' })
        }

        const response = await session.sock.groupAcceptInvite(code)
        res.json({ status: 'success', groupId: response })
    } catch (error) {
        logger.error(`Controller Error (joinGroupViaInvite):`, error)
        res.status(500).json({ error: error.message })
    }
}

/**
 * Update group settings (announcement, locked)
 */
export const updateGroupSettings = async (req, res) => {
    try {
        const { sessionId, groupId, setting } = req.body
        const session = sessionManager.getSession(sessionId)

        if (!session || session.status !== 'connected') {
            return res.status(400).json({ error: 'Session not found or not connected' })
        }

        const jid = groupId.includes('@') ? groupId : `${groupId}@g.us`

        // setting: 'announcement' | 'not-announcement' | 'locked' | 'unlocked'
        await session.sock.groupSettingUpdate(jid, setting)

        res.json({ status: 'success' })
    } catch (error) {
        logger.error(`Controller Error (updateGroupSettings):`, error)
        res.status(500).json({ error: error.message })
    }
}

/**
 * Update group identity (subject, description, picture)
 */
export const updateGroupIdentity = async (req, res) => {
    try {
        const { sessionId, groupId, type, value } = req.body
        const session = sessionManager.getSession(sessionId)

        if (!session || session.status !== 'connected') {
            return res.status(400).json({ error: 'Session not found or not connected' })
        }

        const jid = groupId.includes('@') ? groupId : `${groupId}@g.us`

        switch (type) {
            case 'subject':
                await session.sock.groupUpdateSubject(jid, value)
                break
            case 'description':
                await session.sock.groupUpdateDescription(jid, value)
                break
            case 'picture':
                await session.sock.updateProfilePicture(jid, { url: value })
                break
            default:
                return res.status(400).json({ error: 'Invalid update type' })
        }

        res.json({ status: 'success' })
    } catch (error) {
        logger.error(`Controller Error (updateGroupIdentity):`, error)
        res.status(500).json({ error: error.message })
    }
}

/**
 * Create a new group
 */
export const createGroup = async (req, res) => {
    try {
        const { sessionId, subject, participants } = req.body
        const session = sessionManager.getSession(sessionId)

        if (!session || session.status !== 'connected') {
            return res.status(400).json({ error: 'Session not found or not connected' })
        }

        // Format participants to JID
        const participantJids = (participants || []).map(p => p.includes('@') ? p : `${p}@s.whatsapp.net`)

        const group = await session.sock.groupCreate(subject, participantJids)
        
        res.json({ 
            status: 'success', 
            groupId: group.id,
            participants: group.participants
        })
    } catch (error) {
        logger.error(`Controller Error (createGroup):`, error)
        res.status(500).json({ error: error.message })
    }
}

/**
 * Get group metadata (including participants)
 */
export const getGroupMetadata = async (req, res) => {
    try {
        const { sessionId, groupId } = req.params
        const session = sessionManager.getSession(sessionId)

        if (!session || session.status !== 'connected') {
            return res.status(400).json({ error: 'Session not found or not connected' })
        }

        const jid = groupId.includes('@') ? groupId : `${groupId}@g.us`
        const metadata = await session.sock.groupMetadata(jid)

        res.json(metadata)
    } catch (error) {
        logger.error(`Controller Error (getGroupMetadata):`, error)
        res.status(500).json({ error: error.message })
    }
}

/**
 * Leave a group
 */
export const leaveGroup = async (req, res) => {
    try {
        const { sessionId, groupId } = req.body
        const session = sessionManager.getSession(sessionId)

        if (!session || session.status !== 'connected') {
            return res.status(400).json({ error: 'Session not found or not connected' })
        }

        const jid = groupId.includes('@') ? groupId : `${groupId}@g.us`
        await session.sock.groupLeave(jid)

        res.json({ status: 'success', message: 'Left the group' })
    } catch (error) {
        logger.error(`Controller Error (leaveGroup):`, error)
        res.status(500).json({ error: error.message })
    }
}

/**
 * Get group participants list with roles
 */
export const getGroupParticipants = async (req, res) => {
    try {
        const { sessionId, groupId } = req.params
        const session = sessionManager.getSession(sessionId)

        if (!session || session.status !== 'connected') {
            return res.status(400).json({ error: 'Session not found or not connected' })
        }

        const jid = groupId.includes('@') ? groupId : `${groupId}@g.us`
        const metadata = await session.sock.groupMetadata(jid)

        const participants = metadata.participants.map(p => ({
            id: p.id,
            admin: p.admin || null, // 'admin' | 'superadmin' | null
            isAdmin: p.admin === 'admin' || p.admin === 'superadmin',
            isSuperAdmin: p.admin === 'superadmin'
        }))

        res.json({
            status: 'success',
            groupId: jid,
            groupName: metadata.subject,
            count: participants.length,
            participants
        })
    } catch (error) {
        logger.error(`Controller Error (getGroupParticipants):`, error)
        res.status(500).json({ error: error.message })
    }
}

