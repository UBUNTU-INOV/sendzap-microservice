import * as sessionManager from '../services/session.manager.js'
import logger from '../config/logger.js'

/**
 * Helper to get a connected session or return error
 */
function getConnectedSession(sessionId, res) {
    const session = sessionManager.getSession(sessionId)
    if (!session || session.status !== 'connected') {
        res.status(400).json({ error: 'Session not found or not connected' })
        return null
    }
    return session
}

/**
 * List all subscribed channels/newsletters
 */
export const listChannels = async (req, res) => {
    try {
        const session = getConnectedSession(req.params.sessionId, res)
        if (!session) return

        const newsletters = await session.sock.newsletterGetSubscribed()

        res.json({
            status: 'success',
            count: newsletters.length,
            channels: newsletters.map(n => ({
                id: n.id,
                name: n.name,
                description: n.description,
                subscriberCount: n.subscribers,
                picture: n.picture,
                preview: n.preview,
                verified: n.verified,
                mute: n.mute,
                creationTime: n.creation_time
            }))
        })
    } catch (error) {
        logger.error(`Controller Error (listChannels):`, error)
        res.status(500).json({ error: error.message })
    }
}

/**
 * Create a new WhatsApp Channel
 */
export const createChannel = async (req, res) => {
    try {
        const { sessionId, name, description } = req.body
        const session = getConnectedSession(sessionId, res)
        if (!session) return

        const channel = await session.sock.newsletterCreate(name, description || '')

        res.json({
            status: 'success',
            channel: {
                id: channel.id,
                name: channel.name,
                description: channel.description,
                invite: channel.invite
            }
        })
    } catch (error) {
        logger.error(`Controller Error (createChannel):`, error)
        res.status(500).json({ error: error.message })
    }
}

/**
 * Send a message to a WhatsApp Channel
 */
export const sendChannelMessage = async (req, res) => {
    try {
        const { sessionId, channelId, message, mediaUrl, mediaType, caption } = req.body
        const session = getConnectedSession(sessionId, res)
        if (!session) return

        // Channel JID format: xxx@newsletter
        const jid = channelId.includes('@') ? channelId : `${channelId}@newsletter`

        let payload = {}
        if (mediaUrl) {
            const content = { url: mediaUrl }
            switch (mediaType) {
                case 'image': payload = { image: content, caption: caption || message || '' }; break
                case 'video': payload = { video: content, caption: caption || message || '' }; break
                case 'audio': payload = { audio: content, ptt: false }; break
                case 'document': payload = { document: content, fileName: 'file', caption: caption || message || '' }; break
                default: return res.status(400).json({ error: 'Invalid mediaType. Use image, video, audio, or document.' })
            }
        } else {
            payload = { text: message }
        }

        const sentMsg = await session.sock.sendMessage(jid, payload)

        res.json({ status: 'sent', messageId: sentMsg.key.id })
    } catch (error) {
        logger.error(`Controller Error (sendChannelMessage):`, error)
        res.status(500).json({ error: error.message })
    }
}

/**
 * Get info about a channel
 */
export const getChannelInfo = async (req, res) => {
    try {
        const { sessionId, channelId } = req.params
        const session = getConnectedSession(sessionId, res)
        if (!session) return

        const jid = channelId.includes('@') ? channelId : `${channelId}@newsletter`
        const metadata = await session.sock.newsletterMetadata('jid', jid)

        res.json({
            status: 'success',
            channel: {
                id: metadata.id,
                name: metadata.name,
                description: metadata.description,
                subscriberCount: metadata.subscribers,
                picture: metadata.picture,
                preview: metadata.preview,
                verified: metadata.verified,
                creationTime: metadata.creation_time
            }
        })
    } catch (error) {
        logger.error(`Controller Error (getChannelInfo):`, error)
        res.status(500).json({ error: error.message })
    }
}

/**
 * Follow/subscribe to a channel
 */
export const followChannel = async (req, res) => {
    try {
        const { sessionId, channelId } = req.body
        const session = getConnectedSession(sessionId, res)
        if (!session) return

        const jid = channelId.includes('@') ? channelId : `${channelId}@newsletter`
        await session.sock.newsletterFollow(jid)

        res.json({ status: 'success', message: 'Subscribed to channel' })
    } catch (error) {
        logger.error(`Controller Error (followChannel):`, error)
        res.status(500).json({ error: error.message })
    }
}

/**
 * Unfollow/unsubscribe from a channel
 */
export const unfollowChannel = async (req, res) => {
    try {
        const { sessionId, channelId } = req.body
        const session = getConnectedSession(sessionId, res)
        if (!session) return

        const jid = channelId.includes('@') ? channelId : `${channelId}@newsletter`
        await session.sock.newsletterUnfollow(jid)

        res.json({ status: 'success', message: 'Unsubscribed from channel' })
    } catch (error) {
        logger.error(`Controller Error (unfollowChannel):`, error)
        res.status(500).json({ error: error.message })
    }
}

/**
 * Mute/unmute a channel
 */
export const muteChannel = async (req, res) => {
    try {
        const { sessionId, channelId, mute } = req.body
        const session = getConnectedSession(sessionId, res)
        if (!session) return

        const jid = channelId.includes('@') ? channelId : `${channelId}@newsletter`
        await session.sock.newsletterMute(jid, mute !== false)

        res.json({ status: 'success', message: mute !== false ? 'Channel muted' : 'Channel unmuted' })
    } catch (error) {
        logger.error(`Controller Error (muteChannel):`, error)
        res.status(500).json({ error: error.message })
    }
}

/**
 * Update channel settings (name, description, picture)
 */
export const updateChannel = async (req, res) => {
    try {
        const { sessionId, channelId, type, value } = req.body
        const session = getConnectedSession(sessionId, res)
        if (!session) return

        const jid = channelId.includes('@') ? channelId : `${channelId}@newsletter`

        switch (type) {
            case 'name':
                await session.sock.newsletterUpdateName(jid, value)
                break
            case 'description':
                await session.sock.newsletterUpdateDescription(jid, value)
                break
            case 'picture':
                await session.sock.newsletterUpdatePicture(jid, { url: value })
                break
            default:
                return res.status(400).json({ error: 'Invalid type. Use name, description, or picture.' })
        }

        res.json({ status: 'success' })
    } catch (error) {
        logger.error(`Controller Error (updateChannel):`, error)
        res.status(500).json({ error: error.message })
    }
}

/**
 * Delete a channel (admin only)
 */
export const deleteChannel = async (req, res) => {
    try {
        const { sessionId, channelId } = req.body
        const session = getConnectedSession(sessionId, res)
        if (!session) return

        const jid = channelId.includes('@') ? channelId : `${channelId}@newsletter`
        await session.sock.newsletterDelete(jid)

        res.json({ status: 'success', message: 'Channel deleted' })
    } catch (error) {
        logger.error(`Controller Error (deleteChannel):`, error)
        res.status(500).json({ error: error.message })
    }
}
