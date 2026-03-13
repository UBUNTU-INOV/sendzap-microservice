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
    
    // Fusionner les dossiers et les sessions DB (sans doublons)
    const allSessionIds = Array.from(new Set([...folderSessions, ...dbSessions]))

    logger.info(`Found ${allSessionIds.length} sessions (${folderSessions.length} folders, ${dbSessions.length} in DB). Reloading...`)

    for (const sessionId of allSessionIds) {
        await createSession(sessionId)
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
    return sessions.get(sessionId)
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
