import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} from '@itsliaaa/baileys'
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

// Track active WebSocket connections to WhatsApp — prevents resource exhaustion
const MAX_CONNECTIONS = parseInt(process.env.MAX_WA_CONNECTIONS || '100', 10)
let activeConnections = 0

export async function createConnection(sessionId, { onQR, onStatusChange, onSocket, onLogout, onContacts }, retryCount = 0) {
    if (activeConnections >= MAX_CONNECTIONS) {
        throw new Error(`Max concurrent WhatsApp connections reached (${MAX_CONNECTIONS}). Try again later.`)
    }

    activeConnections++
    logger.debug(`Session ${sessionId}: Connection opened (${activeConnections}/${MAX_CONNECTIONS} active)`)

    const { state, saveCreds } = await useSqliteAuthState(sessionId)
    const version = await getVersion()

    // Custom logger that intercepts Baileys' internal 463 warnings.
    // Baileys does NOT emit messages.update for 463 — it only logs them and calls issuePrivacyTokens().
    // We hook into warn() to fire our webhook before Baileys handles the recovery.
    const baileysLogger = Object.create(logger.child({ session: sessionId }))
    baileysLogger.warn = (obj, msg) => {
        const message = typeof obj === 'string' ? obj : (msg || '')
        const isError463 = message.includes('error 463') || (typeof obj === 'object' && String(obj?.msg || '').includes('error 463'))
        if (isError463 && typeof obj === 'object' && obj.msgId) {
            logger.warn(`Session ${sessionId}: Message delivery failed ${obj.msgId} → error 463 (caught via Baileys logger)`)
            triggerWebhook('message.delivery_failed', {
                sessionId,
                key: { id: obj.msgId, remoteJid: obj.from ?? null },
                errorCode: 463,
                reason: 'account_restricted_or_missing_tctoken',
                autoRecovering: true
            })
        } else {
            logger.warn({ session: sessionId, ...( typeof obj === 'object' ? obj : {}) }, message)
        }
    }

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: baileysLogger,
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

    // Patch newsletterCreate — WhatsApp changed the response key from xwa2_newsletter_create
    // to xwa2_notify_newsletter_on_join (null for the old key), causing Baileys to crash.
    sock.newsletterCreate = async (name, description) => {
        const result = await sock.query({
            tag: 'iq',
            attrs: { id: sock.generateMessageTag(), type: 'get', to: 's.whatsapp.net', xmlns: 'w:mex' },
            content: [{
                tag: 'query',
                attrs: { query_id: '8823471724422422' },
                content: Buffer.from(JSON.stringify({ variables: { input: { name, description: description ?? null } } }), 'utf-8')
            }]
        })
        const child = result?.content?.find?.(n => n?.tag === 'result')
        if (!child?.content) throw new Error('newsletterCreate: no result node in response')
        const data = JSON.parse(child.content.toString())
        if (data.errors?.length) throw new Error(data.errors.map(e => e.message).join(', '))
        const nl = data?.data?.xwa2_newsletter_create ?? data?.data?.xwa2_notify_newsletter_on_join
        if (!nl?.id) throw new Error('newsletterCreate: no channel ID in response')
        const meta = nl.thread_metadata ?? nl
        return { id: nl.id, name: meta.name?.text ?? name, description: meta.description?.text ?? (description || ''), invite: meta.invite ?? null }
    }

    if (onSocket) onSocket(sock)

    sock.ev.on('contacts.upsert', (contacts) => {
        const jids = contacts
            .map(c => c.id)
            .filter(id => id && !id.includes('@g.us') && !id.includes('@broadcast'))
        if (jids.length && onContacts) onContacts(jids)
    })

    sock.ev.on('contacts.update', (updates) => {
        const jids = updates
            .map(c => c.id)
            .filter(id => id && !id.includes('@g.us') && !id.includes('@broadcast'))
        if (jids.length && onContacts) onContacts(jids)
    })

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
                // WAMessageStatus.ERROR = 0 is falsy — must check undefined explicitly
                if (update.update.status === undefined && !update.update.messageStubParameters) continue

                const isError = update.update.status === 0
                const errorCode = update.update.messageStubParameters?.[0]

                if (isError) {
                    // 463 is already handled by the baileysLogger.warn() interceptor above — skip to avoid double webhook
                    if (errorCode === '463') continue
                    // 479 = smax-invalid stanza (newsletter media rejected)
                    logger.warn(`Session ${sessionId}: Message delivery failed ${update.key.id} → error ${errorCode}`)
                    triggerWebhook('message.delivery_failed', {
                        sessionId,
                        key: update.key,
                        errorCode: errorCode ? parseInt(errorCode) : null,
                        reason: errorCode === '479' ? 'stanza_rejected' : 'unknown',
                        autoRecovering: false
                    })
                } else {
                    logger.info(`Session ${sessionId}: Message status ${update.key.id}: ${update.update.status}`)
                    triggerWebhook('message.update', {
                        sessionId,
                        key: update.key,
                        status: update.update.status,
                        timestamp: update.update.messageTimestamp
                    })
                }
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
            activeConnections = Math.max(0, activeConnections - 1)
            logger.debug(`Session ${sessionId}: Connection closed (${activeConnections}/${MAX_CONNECTIONS} active)`)

            const MAX_RETRIES = 10
            const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.code
            const reason = lastDisconnect?.error?.message || ''
            const isQRExpired = reason.includes('QR refs attempts ended') || reason.includes('QR timeout')
            const isForbidden = statusCode === 403
            const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401
            const shouldReconnect = !isQRExpired && !isForbidden && !isLoggedOut && retryCount < MAX_RETRIES

            logger.warn(`Session ${sessionId}: Connection closed (${statusCode}). Reason: ${reason}. Reconnecting: ${shouldReconnect}`)

            if (onStatusChange) onStatusChange(shouldReconnect ? 'reconnecting' : 'disconnected')

            triggerWebhook('session.status', {
                sessionId,
                status: shouldReconnect ? 'reconnecting' : 'disconnected',
                reason
            })

            if (shouldReconnect) {
                const delay = Math.min(Math.pow(2, retryCount) * 1000, 30000)
                logger.info(`Session ${sessionId}: Reconnecting in ${delay}ms... (Attempt ${retryCount + 1}/${MAX_RETRIES})`)
                setTimeout(() => {
                    createConnection(sessionId, { onQR, onStatusChange, onSocket, onLogout }, retryCount + 1)
                }, delay)
            } else if (isQRExpired) {
                logger.warn(`Session ${sessionId}: QR never scanned. Deleting session from map and SQLite.`)
                if (onLogout) onLogout()
            } else if (isForbidden) {
                logger.error(`Session ${sessionId}: Forbidden by WhatsApp (403). Stopping reconnection to avoid ban.`)
            } else if (isLoggedOut) {
                logger.error(`Session ${sessionId}: Logged out or unauthorized. Cleaning up...`)
                if (onLogout) onLogout()
            } else {
                logger.error(`Session ${sessionId}: Max reconnection attempts (${MAX_RETRIES}) reached. Stopping.`)
            }
        }
    })

    return sock
}
