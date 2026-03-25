import Database from 'better-sqlite3'
import { BufferJSON, initAuthCreds, proto } from '@whiskeysockets/baileys'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import logger from '../config/logger.js'

const SESSIONS_DIR = './sessions'
if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR)
}

export const db = new Database('sessions/database.sqlite')

// Initialisation de la table
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
`)

/**
 * Implémentation d'un fournisseur d'état d'authentification SQLite pour Baileys
 */
export const useSqliteAuthState = async (sessionId) => {
    const writeData = (data, type, id) => {
        const value = JSON.stringify(data, BufferJSON.replacer)
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO auth_state (session_id, type, id, value)
            VALUES (?, ?, ?, ?)
        `)
        stmt.run(sessionId, type, id, value)
    }

    const readData = (type, id) => {
        const stmt = db.prepare(`
            SELECT value FROM auth_state WHERE session_id = ? AND type = ? AND id = ?
        `)
        const row = stmt.get(sessionId, type, id)
        if (row) {
            return JSON.parse(row.value, BufferJSON.reviver)
        }
        return null
    }

    const removeData = (type, id) => {
        const stmt = db.prepare(`
            DELETE FROM auth_state WHERE session_id = ? AND type = ? AND id = ?
        `)
        stmt.run(sessionId, type, id)
    }

    const creds = readData('creds', 'main') || (() => {
        // Tentative de migration depuis le système de fichiers (useMultiFileAuthState)
        try {
            const oldCredsPath = `./sessions/${sessionId}/creds.json`
            if (existsSync(oldCredsPath)) {
                const data = JSON.parse(readFileSync(oldCredsPath, 'utf-8'), BufferJSON.reviver)
                writeData(data, 'creds', 'main')
                logger.info(`Session ${sessionId}: Credentials migrés vers SQLite.`)
                return data
            }
        } catch (error) {
            logger.error(`Session ${sessionId}: Erreur lors de la migration des credentials:`, error)
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
                            // Tentative de migration de la clé si absente de la DB
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

/**
 * Récupère tous les IDs de session stockés dans la base de données
 */
export function getStoredSessionIds() {
    const stmt = db.prepare('SELECT DISTINCT session_id FROM auth_state')
    return stmt.all().map(row => row.session_id)
}

/**
 * Supprime toutes les données associées à une session
 */
export function deleteStoredSession(sessionId) {
    const stmt = db.prepare('DELETE FROM auth_state WHERE session_id = ?')
    stmt.run(sessionId)
}
