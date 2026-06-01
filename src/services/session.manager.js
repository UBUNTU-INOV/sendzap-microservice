import { createConnection } from './whatsapp.service.js'
import { getStoredSessionIds, deleteStoredSession } from './sqlite-auth.service.js'
import { readdirSync, existsSync } from 'fs'
import logger from '../config/logger.js'

const sessions = new Map()
const SESSIONS_DIR = './sessions'

export async function initSessions() {
    if (!existsSync(SESSIONS_DIR)) return

    const folderSessions = readdirSync(SESSIONS_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name.trim())

    const dbSessions = getStoredSessionIds()

    const allSessionIds = Array.from(new Set([...folderSessions, ...dbSessions]))

    if (allSessionIds.length === 0) return

    logger.info(`Found ${allSessionIds.length} session(s). Starting reconnection in background...`)

    // Start all sessions immediately in parallel — don't await, let them reconnect
    // while the HTTP server is already accepting requests
    for (const sessionId of allSessionIds) {
        createSession(sessionId).catch(err => {
            logger.error(`Failed to auto-start session ${sessionId}:`, err)
        })
    }
}

export async function createSession(sessionId) {
    if (sessions.has(sessionId)) {
        return sessions.get(sessionId)
    }

    const session = {
        id: sessionId,
        sock: null,
        qr: null,
        status: 'initializing',
    }

    sessions.set(sessionId, session)

    const setupSocket = async () => {
        try {
            await createConnection(sessionId, {
                onQR: (qr) => {
                    session.qr = qr
                    session.status = 'qr'
                },
                onStatusChange: (status) => {
                    session.status = status
                    if (status === 'connected') {
                        session.qr = null
                    }
                },
                onSocket: (sock) => {
                    session.sock = sock
                },
                onLogout: () => {
                    deleteStoredSession(sessionId)
                    sessions.delete(sessionId)
                    logger.info(`Session ${sessionId}: Logged out from phone. Database cleared.`)
                }
            })
        } catch (error) {
            logger.error(`Error setting up session ${sessionId}:`, error)
            session.status = 'error'
        }
    }

    await setupSocket()
    return session
}

export function getSession(sessionId) {
    return sessions.get(sessionId) || null
}

export function getAllSessions() {
    return Array.from(sessions.values()).map(s => ({
        id: s.id,
        status: s.status,
        hasQR: !!s.qr
    }))
}

export function getFirstConnectedSession() {
    return Array.from(sessions.values()).find(s => s.status === 'connected')
}

// Called on server shutdown — closes socket without logging out WhatsApp
// SQLite credentials are preserved so the session reconnects on next start
export async function closeSession(sessionId) {
    const session = sessions.get(sessionId)
    if (session?.sock) {
        try {
            session.sock.ev.removeAllListeners()
            session.sock.end()
        } catch (_) {}
    }
    sessions.delete(sessionId)
}

// Called on explicit user action — logs out from WhatsApp AND wipes SQLite
export async function deleteSession(sessionId) {
    const session = sessions.get(sessionId)
    if (session) {
        if (session.sock) {
            try {
                session.sock.ev.removeAllListeners()
                await session.sock.logout()
                session.sock.end(new Error('Session Deleted'))
            } catch (err) {
                logger.error(`Error logging out session ${sessionId}:`, err)
            }
        }
        deleteStoredSession(sessionId)
        sessions.delete(sessionId)
        logger.info(`Session ${sessionId}: Deleted and database cleared.`)
    }
}

export async function getGroups(sessionId) {
    const session = sessions.get(sessionId)
    if (!session || !session.sock) return []
    try {
        const groups = await session.sock.groupFetchAllParticipating()
        return Object.values(groups)
    } catch (error) {
        logger.error(`Error fetching groups for ${sessionId}:`, error)
        return []
    }
}

export async function getContacts(sessionId) {
    const session = sessions.get(sessionId)
    if (!session || !session.sock) return []
    // Placeholder for contacts fetching (requires a Store implementation for full details)
    return []
}
