import * as sessionManager from '../services/session.manager.js'
import logger from '../config/logger.js'

/**
 * Send media to status@broadcast
 */
export const sendStatus = async (req, res) => {
    try {
        const { sessionId, mediaUrl, mediaType, message, caption } = req.body
        const session = sessionManager.getSession(sessionId)

        if (!session || session.status !== 'connected') {
            return res.status(400).json({ error: 'Session not found or not connected' })
        }

        const jid = 'status@broadcast'
        let payload = {}

        if (mediaType === 'image' && mediaUrl) {
            payload = { image: { url: mediaUrl }, caption: caption || message }
        } else {
            // Default to text status
            payload = { text: message || caption }
        }

        const sentMsg = await session.sock.sendMessage(jid, payload)

        res.json({ status: 'sent', messageId: sentMsg.key.id })
    } catch (error) {
        logger.error(`Controller Error (sendStatus):`, error)
        res.status(500).json({ error: error.message })
    }
}
