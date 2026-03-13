import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys'
import { useSqliteAuthState } from './sqlite-auth.service.js'
import logger from '../config/logger.js'

import { triggerWebhook } from './webhook.service.js'

export async function createConnection(sessionId, { onQR, onStatusChange, onSocket, onLogout }, retryCount = 0) {
    const { state, saveCreds } = await useSqliteAuthState(sessionId)
    const { version, isLatest } = await fetchLatestBaileysVersion()

    logger.info(`Session ${sessionId}: Using Baileys v${version.join('.')}, isLatest: ${isLatest}`)

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: logger.child({ session: sessionId, level: 'silent' }),
        // Customize what appears on the phone (Linked Devices)
        browser: ['SendZap', 'Chrome', '2.1'],
        // Optimizations for high-density (low RAM)
        syncFullHistory: false,
        markOnlineOnConnect: false,
        shouldIgnoreJid: (jid) => jid?.includes('newsletter'), // Ignore newsletters to save RAM
    })

    if (onSocket) onSocket(sock)

    sock.ev.on('creds.update', saveCreds)

    // Listen for incoming messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type === 'notify') {
            for (const msg of messages) {
                if (!msg.key.fromMe) {
                    const jid = msg.key.remoteJid
                    const isGroup = jid.endsWith('@g.us')

                    // Filter: Ignore WhatsApp status updates
                    if (jid === 'status@broadcast') {
                        continue
                    }

                    // Filter: Only private messages for the chatbot
                    if (isGroup) {
                        logger.debug(`Session ${sessionId}: Ignoring group message from ${jid}`)
                        continue
                    }

                    // Extract minimal data needed for the webhook
                    const data = {
                        sessionId,
                        from: jid,
                        message: msg,
                        // Helper to get text content easily
                        content: msg.message?.conversation ||
                            msg.message?.extendedTextMessage?.text ||
                            msg.message?.imageMessage?.caption ||
                            msg.message?.videoMessage?.caption ||
                            ''
                    }

                    logger.info(`Session ${sessionId}: Private message received from ${jid}`)
                    triggerWebhook('message.upsert', data)
                }
            }
        }
    })

    // Listen for group participants update (join, leave, etc)
    sock.ev.on('group-participants.update', async (update) => {
        logger.info(`Session ${sessionId}: Participants update for ${update.id} (Action: ${update.action})`)
        triggerWebhook('group-participants.update', {
            sessionId,
            ...update
        })
    })

    // Listen for message updates (delivery receipts, read receipts, etc)
    sock.ev.on('messages.update', async (updates) => {
        for (const update of updates) {
            if (update.update.status) {
                logger.info(`Session ${sessionId}: Message status update for ${update.key.id}: ${update.update.status}`)
                triggerWebhook('message.update', {
                    sessionId,
                    key: update.key,
                    status: update.update.status,
                    timestamp: update.update.messageTimestamp
                })
            }
        }
    })

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr && onQR) onQR(qr)

        if (connection === 'connecting') {
            if (onStatusChange) onStatusChange('connecting')
        }

        if (connection === 'open') {
            logger.info(`Session ${sessionId}: Connected`)
            if (onStatusChange) onStatusChange('connected')
            retryCount = 0
            triggerWebhook('session.status', { sessionId, status: 'connected' })
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.code
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 401

            logger.warn(`Session ${sessionId}: Connection closed (${statusCode}). Reason: ${lastDisconnect?.error?.message}. Reconnecting: ${shouldReconnect}`)

            if (onStatusChange) onStatusChange(shouldReconnect ? 'reconnecting' : 'disconnected')

            triggerWebhook('session.status', {
                sessionId,
                status: shouldReconnect ? 'reconnecting' : 'disconnected',
                reason: lastDisconnect?.error?.message
            })

            if (shouldReconnect) {
                const delay = Math.min(Math.pow(2, retryCount) * 1000, 30000)
                logger.info(`Session ${sessionId}: Reconnecting in ${delay}ms... (Attempt ${retryCount + 1})`)

                setTimeout(() => {
                    createConnection(sessionId, { onQR, onStatusChange, onSocket, onLogout }, retryCount + 1)
                }, delay)
            } else if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                logger.error(`Session ${sessionId}: Logged out or unauthorized. Cleaning up...`)
                if (onLogout) onLogout()
            }
        }
    })

    return sock
}
