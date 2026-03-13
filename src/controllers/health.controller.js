import { getAllSessions } from '../services/session.manager.js'
import os from 'os'

export const getHealth = async (req, res) => {
    const uptime = process.uptime()
    const memoryUsage = process.memoryUsage()
    const cpuUsage = process.cpuUsage()
    
    const sessions = getAllSessions()
    const sessionStats = {
        total: sessions.length,
        connected: sessions.filter(s => s.status === 'connected').length,
        qr: sessions.filter(s => s.status === 'qr').length,
        initializing: sessions.filter(s => s.status === 'initializing').length,
        error: sessions.filter(s => s.status === 'error').length,
    }

    const healthData = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: {
            seconds: Math.floor(uptime),
            formatted: formatUptime(uptime)
        },
        system: {
            platform: os.platform(),
            release: os.release(),
            arch: os.arch(),
            cpus: os.cpus().length,
            loadavg: os.loadavg(),
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
        },
        process: {
            memory: {
                rss: formatBytes(memoryUsage.rss),
                heapTotal: formatBytes(memoryUsage.heapTotal),
                heapUsed: formatBytes(memoryUsage.heapUsed),
                external: formatBytes(memoryUsage.external),
            },
            cpu: cpuUsage,
        },
        sessions: sessionStats
    }

    res.json(healthData)
}

function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600 * 24))
    const h = Math.floor((seconds % (3600 * 24)) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)

    const parts = []
    if (d > 0) parts.push(`${d}d`)
    if (h > 0) parts.push(`${h}h`)
    if (m > 0) parts.push(`${m}m`)
    if (s > 0) parts.push(`${s}s`)

    return parts.join(' ')
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
