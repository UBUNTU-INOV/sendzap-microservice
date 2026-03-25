import * as sessionManager from '../services/session.manager.js'
import logger from '../config/logger.js'

/**
 * Send a status/story update (text, image, video)
 */
export const sendStatus = async (req, res) => {
    try {
        const { sessionId, mediaUrl, mediaType, message, caption, backgroundColor, font } = req.body
        const session = sessionManager.getSession(sessionId)

        if (!session || session.status !== 'connected') {
            return res.status(400).json({ error: 'Session not found or not connected' })
        }

        const jid = 'status@broadcast'
        let payload = {}

        switch (mediaType) {
            case 'image':
                if (!mediaUrl) return res.status(400).json({ error: 'mediaUrl is required for image status' })
                payload = { image: { url: mediaUrl }, caption: caption || message || '' }
                break

            case 'video':
                if (!mediaUrl) return res.status(400).json({ error: 'mediaUrl is required for video status' })
                payload = { video: { url: mediaUrl }, caption: caption || message || '' }
                break

            case 'audio':
                if (!mediaUrl) return res.status(400).json({ error: 'mediaUrl is required for audio status' })
                payload = { audio: { url: mediaUrl }, ptt: true }
                break

            case 'text':
            default:
                payload = { text: message || caption || '' }
                // Add background color and font for text stories if provided
                if (backgroundColor) {
                    payload.backgroundColor = backgroundColor
                }
                if (font !== undefined) {
                    payload.font = font
                }
                break
        }

        const sentMsg = await session.sock.sendMessage(jid, payload)

        res.json({ status: 'sent', messageId: sentMsg.key.id })
    } catch (error) {
        logger.error(`Controller Error (sendStatus):`, error)
        res.status(500).json({ error: error.message })
    }
}

/**
 * Delete a status update by message key
 */
export const deleteStatus = async (req, res) => {
    try {
        const { sessionId, messageId } = req.body
        const session = sessionManager.getSession(sessionId)

        if (!session || session.status !== 'connected') {
            return res.status(400).json({ error: 'Session not found or not connected' })
        }

        const key = {
            remoteJid: 'status@broadcast',
            id: messageId,
            fromMe: true
        }

        await session.sock.sendMessage('status@broadcast', { delete: key })

        res.json({ status: 'deleted' })
    } catch (error) {
        logger.error(`Controller Error (deleteStatus):`, error)
        res.status(500).json({ error: error.message })
    }
}
