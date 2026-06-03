import * as sessionManager from '../services/session.manager.js'
import { normalizeJid, buildMediaPayload } from '../utils/whatsapp.utils.js'
import logger from '../config/logger.js'

// Strips VCARD-dangerous characters (newlines, semicolons) to prevent injection
function escapeVCard(value) {
    if (!value) return ''
    return String(value).replace(/[\r\n;,\\]/g, '').slice(0, 100)
}

export const sendMessage = async (req, res) => {
    const { sessionId, to, message, mediaUrl, mediaType, fileName, caption } = req.body
    const session = sessionManager.getSession(sessionId)

    if (!session) {
        return res.status(404).json({ error: 'Session not found' })
    }
    if (session.status !== 'connected') {
        return res.status(400).json({ error: `Session is not connected (current status: ${session.status})` })
    }

    const payload = buildMediaPayload({ message, mediaUrl, mediaType, fileName, caption })
    if (!payload) {
        return res.status(400).json({ error: 'Invalid mediaType. Use image, video, audio, or document.' })
    }

    const jid = normalizeJid(to)
    const maxRetries = 2

    for (let i = 0; i <= maxRetries; i++) {
        try {
            const sentMsg = await session.sock.sendMessage(jid, payload)
            return res.json({ status: 'sent', messageId: sentMsg.key.id })
        } catch (error) {
            const isConnectionClose = error.message.includes('Connection Closed') || error.message.includes('Stream Errored')
            if (i < maxRetries && isConnectionClose) {
                logger.warn(`SendMessage retry ${i + 1}/${maxRetries} for session ${sessionId}: ${error.message}`)
                await new Promise(resolve => setTimeout(resolve, 1000))
                continue
            }
            logger.error(`Controller Error (sendMessage) after ${i} retries:`, error)
            return res.status(500).json({
                error: i > 0 ? `Message sending failed after ${i} retries: ${error.message}` : error.message
            })
        }
    }
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

export const sendBulkMessage = async (req, res) => {
    try {
        const { sessionId, receivers, message, mediaUrl, mediaType, fileName, caption, delayMs = 1000 } = req.body

        if (!receivers || !Array.isArray(receivers) || receivers.length === 0) {
            return res.status(400).json({ error: 'To send bulk messages, provide "receivers" array.' })
        }

        const session = sessionManager.getSession(sessionId)
        if (!session) {
            return res.status(404).json({ error: 'Session not found' })
        }
        if (session.status !== 'connected') {
            return res.status(400).json({ error: `Session is not connected (current status: ${session.status})` })
        }

        const payload = buildMediaPayload({ message, mediaUrl, mediaType, fileName, caption })
        if (!payload) {
            return res.status(400).json({ error: 'Invalid mediaType for bulk send.' })
        }

        const results = []
        for (let i = 0; i < receivers.length; i++) {
            const to = receivers[i]
            try {
                const jid = normalizeJid(to)
                const sentMsg = await session.sock.sendMessage(jid, payload)
                results.push({ to, status: 'sent', messageId: sentMsg.key.id })
            } catch (err) {
                logger.error(`Failed to send to ${to}:`, err)
                results.push({ to, status: 'failed', error: err.message })
            }
            if (i < receivers.length - 1) {
                await delay(delayMs)
            }
        }

        res.json({ status: 'bulk_completed', results })
    } catch (error) {
        logger.error('Controller Error (sendBulkMessage):', error)
        res.status(500).json({ error: error.message })
    }
}

export const listGroups = async (req, res) => {
    try {
        const groups = await sessionManager.getGroups(req.params.sessionId)
        res.json(groups)
    } catch (error) {
        logger.error('Controller Error (listGroups):', error)
        res.status(500).json({ error: error.message })
    }
}

export const listContacts = async (req, res) => {
    try {
        const contacts = await sessionManager.getContacts(req.params.sessionId)
        res.json(contacts)
    } catch (error) {
        logger.error('Controller Error (listContacts):', error)
        res.status(500).json({ error: error.message })
    }
}

export const checkNumber = async (req, res) => {
    try {
        const { sessionId, number } = req.body

        let session
        if (sessionId) {
            session = sessionManager.getSession(sessionId)
        } else {
            session = sessionManager.getFirstConnectedSession()
        }

        if (!session || session.status !== 'connected') {
            return res.status(400).json({ error: 'No connected session available' })
        }

        const jid = normalizeJid(number, 'private')
        const [result] = await session.sock.onWhatsApp(jid)

        if (!result || !result.exists) {
            return res.json({ number, exists: false })
        }

        let profilePictureUrl = null
        let status = null

        try {
            profilePictureUrl = await session.sock.profilePictureUrl(result.jid, 'image')
        } catch (e) {
            logger.debug(`Could not fetch profile picture for ${result.jid}: ${e.message}`)
        }

        try {
            const statusResult = await session.sock.fetchStatus(result.jid)
            status = statusResult?.status
        } catch (e) {
            logger.debug(`Could not fetch status for ${result.jid}: ${e.message}`)
        }

        res.json({ number, exists: true, jid: result.jid, profilePictureUrl, status })
    } catch (error) {
        logger.error('Controller Error (checkNumber):', error)
        res.status(500).json({ error: error.message })
    }
}

export const sendContact = async (req, res) => {
    try {
        const { sessionId, to, contactName, contactNumber, organization } = req.body
        const session = sessionManager.getSession(sessionId)

        if (!session || session.status !== 'connected') {
            return res.status(400).json({ error: 'Session not found or not connected' })
        }

        const jid = normalizeJid(to, 'private')
        const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${escapeVCard(contactName)}\nORG:${escapeVCard(organization)};\nTEL;type=CELL;type=VOICE;waid=${escapeVCard(contactNumber)}:${escapeVCard(contactNumber)}\nEND:VCARD`

        const sentMsg = await session.sock.sendMessage(jid, {
            contacts: { displayName: contactName, contacts: [{ vcard }] }
        })

        res.json({ status: 'sent', messageId: sentMsg.key.id })
    } catch (error) {
        logger.error('Controller Error (sendContact):', error)
        res.status(500).json({ error: error.message })
    }
}

export const setTyping = async (req, res) => {
    try {
        const { sessionId, to, presence } = req.body
        const session = sessionManager.getSession(sessionId)

        if (!session || session.status !== 'connected') {
            return res.status(400).json({ error: 'Session not found or not connected' })
        }

        const jid = normalizeJid(to)
        await session.sock.sendPresenceUpdate(presence || 'composing', jid)

        res.json({ status: 'success' })
    } catch (error) {
        logger.error('Controller Error (setTyping):', error)
        res.status(500).json({ error: error.message })
    }
}
