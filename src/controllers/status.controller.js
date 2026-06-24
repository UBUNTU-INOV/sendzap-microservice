import * as sessionManager from '../services/session.manager.js'
import logger from '../config/logger.js'

// Baileys/WhatsApp expect backgroundColor as ARGB uint32, not a hex string
function hexToArgb(hex) {
    if (!hex || typeof hex !== 'string') return undefined
    const clean = hex.replace('#', '')
    if (clean.length !== 6) return undefined
    const r = parseInt(clean.slice(0, 2), 16)
    const g = parseInt(clean.slice(2, 4), 16)
    const b = parseInt(clean.slice(4, 6), 16)
    return ((0xFF << 24) | (r << 16) | (g << 8) | b) >>> 0
}

/**
 * Send a status/story update (text, image, video)
 */
export const sendStatus = async (req, res) => {
    try {
        const { sessionId, mediaUrl, mediaType, message, caption, backgroundColor, font, statusJidList: bodyJidList } = req.body
        const session = sessionManager.getSession(sessionId)

        if (!session || session.status !== 'connected') {
            return res.status(400).json({ error: 'Session not found or not connected' })
        }

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
                const argb = hexToArgb(backgroundColor)
                if (argb !== undefined) payload.backgroundColor = argb
                if (font !== undefined && font !== null) payload.font = parseInt(font, 10)
                break
        }

        const rawOwnJid = session.sock.user?.id || ''
        const ownJid = rawOwnJid.replace(/:\d+@/, '@')

        let statusJidList
        if (Array.isArray(bodyJidList) && bodyJidList.length > 0) {
            statusJidList = bodyJidList.map(j => j.includes('@') ? j : `${j}@s.whatsapp.net`)
            if (!statusJidList.includes(ownJid)) statusJidList.unshift(ownJid)
        } else {
            const contacts = Array.from(session.contactJids || [])
            statusJidList = contacts.length > 0 ? contacts : (ownJid ? [ownJid] : [])
        }

        const sentMsg = await session.sock.sendMessage('status@broadcast', payload, { statusJidList })

        res.json({ status: 'sent', messageId: sentMsg.key.id, recipientCount: statusJidList.length })
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
