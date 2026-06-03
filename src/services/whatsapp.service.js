import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys'
import { useSqliteAuthState } from './sqlite-auth.service.js'
import logger from '../config/logger.js'
import { triggerWebhook } from './webhook.service.js'

// Fetch once per process lifetime to avoid redundant network calls on reconnections
let cachedVersion = null
async function getVersion() {
    if (!cachedVersion) {
        const { version, isLatest } = await fetchLatestBaileysVersion()
        cachedVersion = version
        logger.info(`Baileys version: ${version.join('.')}, isLatest: ${isLatest}`)
    }
    return cachedVersion
}

export async function createConnection(sessionId, { onQR, onStatusChange, onSocket, onLogout }, retryCount = 0) {
    const { state, saveCreds } = await useSqliteAuthState(sessionId)
    const version = await getVersion()

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: logger.child({ session: sessionId, level: 'silent' }),
        browser: ['SendZap', 'Chrome', '2.1'],
        // Memory optimizations — critical for 100+ sessions
        syncFullHistory: false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
        // Connection resilience under high load
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 2000,
        // Reduce in-memory message store size
        getMessage: async () => undefined,
    })

    if (onSocket) onSocket(sock)

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return

        for (const msg of messages) {
            try {
                if (msg.key.fromMe) continue

                const jid = msg.key.remoteJid
                if (jid === 'status@broadcast') continue

                const isGroup = jid.endsWith('@g.us')
                const isNewsletter = jid.endsWith('@newsletter')

                const data = {
                    sessionId,
                    from: jid,
                    message: msg,
                    isGroup,
                    isNewsletter,
                    content: msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        msg.message?.imageMessage?.caption ||
                        msg.message?.videoMessage?.caption ||
                        ''
                }

                if (isNewsletter) {
                    logger.info(`Session ${sessionId}: Newsletter message from ${jid}`)
                    triggerWebhook('newsletter.message', data)
                } else if (isGroup) {
                    logger.info(`Session ${sessionId}: Group message from ${jid}`)
                    triggerWebhook('group.message', data)
                } else {
                    logger.info(`Session ${sessionId}: Private message from ${jid}`)
                    triggerWebhook('message.upsert', data)
                }
            } catch (err) {
                logger.error(`Session ${sessionId}: Error processing message event:`, err)
            }
        }
    })

    sock.ev.on('group-participants.update', (update) => {
        try {
            logger.info(`Session ${sessionId}: Participants update for ${update.id} (${update.action})`)
            triggerWebhook('group-participants.update', { sessionId, ...update })
        } catch (err) {
            logger.error(`Session ${sessionId}: Error processing group-participants event:`, err)
        }
    })

    sock.ev.on('messages.update', (updates) => {
        for (const update of updates) {
            try {
                if (!update.update.status) continue
                logger.info(`Session ${sessionId}: Message status ${update.key.id}: ${update.update.status}`)
                triggerWebhook('message.update', {
                    sessionId,
                    key: update.key,
                    status: update.update.status,
                    timestamp: update.update.messageTimestamp
                })
            } catch (err) {
                logger.error(`Session ${sessionId}: Error processing message.update event:`, err)
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
