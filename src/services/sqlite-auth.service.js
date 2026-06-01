import Database from 'better-sqlite3'
import { BufferJSON, initAuthCreds, proto } from '@whiskeysockets/baileys'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import logger from '../config/logger.js'

const SESSIONS_DIR = './sessions'
if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR)
}

export const db = new Database('sessions/database.sqlite')

db.exec(`
    CREATE TABLE IF NOT EXISTS auth_state (
        session_id TEXT,
        type TEXT,
        id TEXT,
        value TEXT,
        PRIMARY KEY (session_id, type, id)
    );

    CREATE TABLE IF NOT EXISTS webhook_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event TEXT,
        payload TEXT,
        attempts INTEGER DEFAULT 0,
        next_retry_at INTEGER,
        status TEXT DEFAULT 'pending',
        created_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_webhook_queue_status_retry
        ON webhook_queue(status, next_retry_at);
`)

// Prepared statements instanciés une seule fois pour les performances
const stmts = {
    upsert: db.prepare(`INSERT OR REPLACE INTO auth_state (session_id, type, id, value) VALUES (?, ?, ?, ?)`),
    select: db.prepare(`SELECT value FROM auth_state WHERE session_id = ? AND type = ? AND id = ?`),
    delete: db.prepare(`DELETE FROM auth_state WHERE session_id = ? AND type = ? AND id = ?`),
    deleteSession: db.prepare(`DELETE FROM auth_state WHERE session_id = ?`),
    listSessions: db.prepare(`SELECT DISTINCT session_id FROM auth_state`),
}

export const useSqliteAuthState = async (sessionId) => {
    const writeData = (data, type, id) => {
        stmts.upsert.run(sessionId, type, id, JSON.stringify(data, BufferJSON.replacer))
    }

    const readData = (type, id) => {
        const row = stmts.select.get(sessionId, type, id)
        return row ? JSON.parse(row.value, BufferJSON.reviver) : null
    }

    const removeData = (type, id) => {
        stmts.delete.run(sessionId, type, id)
    }

    const creds = readData('creds', 'main') || (() => {
        try {
            const oldCredsPath = `./sessions/${sessionId}/creds.json`
            if (existsSync(oldCredsPath)) {
                const data = JSON.parse(readFileSync(oldCredsPath, 'utf-8'), BufferJSON.reviver)
                writeData(data, 'creds', 'main')
                logger.info(`Session ${sessionId}: Credentials migrés vers SQLite.`)
                return data
            }
        } catch (error) {
            logger.error(`Session ${sessionId}: Erreur migration credentials:`, error)
        }
        return initAuthCreds()
    })()

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {}
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = readData(type, id)
                            if (!value) {
                                try {
                                    const oldKeyPath = `./sessions/${sessionId}/${type}-${id}.json`
                                    if (existsSync(oldKeyPath)) {
                                        value = JSON.parse(readFileSync(oldKeyPath, 'utf-8'), BufferJSON.reviver)
                                        writeData(value, type, id)
                                    }
                                } catch (e) { }
                            }
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value)
                            }
                            data[id] = value
                        })
                    )
                    return data
                },
                set: async (data) => {
                    for (const type in data) {
                        for (const id in data[type]) {
                            const value = data[type][id]
                            if (value) {
                                writeData(value, type, id)
                            } else {
                                removeData(type, id)
                            }
                        }
                    }
                }
            }
        },
        saveCreds: () => {
            writeData(creds, 'creds', 'main')
        }
    }
}

export function getStoredSessionIds() {
    return stmts.listSessions.all().map(row => row.session_id)
}

export function deleteStoredSession(sessionId) {
    stmts.deleteSession.run(sessionId)
}
