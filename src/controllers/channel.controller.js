import { proto, getBinaryNodeChild, getBinaryNodeChildren, S_WHATSAPP_NET } from '@itsliaaa/baileys'
import * as sessionManager from '../services/session.manager.js'
import { normalizeJid, buildMediaPayload, buildChannelInteractivePayload } from '../utils/whatsapp.utils.js'
import logger from '../config/logger.js'

function getConnectedSession(sessionId, res) {
    const session = sessionManager.getSession(sessionId)
    if (!session || session.status !== 'connected') {
        res.status(400).json({ error: 'Session not found or not connected' })
        return null
    }
    return session
}

export const listChannels = async (req, res) => {
    try {
        const { sessionId } = req.params
        const session = getConnectedSession(sessionId, res)
        if (!session) return

        const raw = await session.sock.newsletterSubscribed()
        const channels = (raw ?? []).map(nl => {
            const meta = nl.thread_metadata ?? nl
            return {
                id: nl.id,
                name: meta.name?.text ?? meta.name ?? null,
                description: meta.description?.text ?? meta.description ?? null,
                invite: meta.invite ?? null,
                verified: meta.verification === 'VERIFIED',
            }
        })

        res.json({ status: 'success', count: channels.length, channels })
    } catch (error) {
        logger.error('Controller Error (listChannels):', error)
        res.status(500).json({ error: error.message })
    }
}

export const createChannel = async (req, res) => {
    try {
        const { sessionId, name, description } = req.body
        const session = getConnectedSession(sessionId, res)
        if (!session) return

        const channel = await session.sock.newsletterCreate(name, description || '')

        res.json({
            status: 'success',
            channel: { id: channel.id, name: channel.name, description: channel.description, invite: channel.invite }
        })
    } catch (error) {
        logger.error('Controller Error (createChannel):', error)
        res.status(500).json({ error: error.message })
    }
}

export const sendChannelMessage = async (req, res) => {
    try {
        const { sessionId, channelId, message, mediaUrl, mediaType, caption, fileName, poll, question } = req.body
        const session = getConnectedSession(sessionId, res)
        if (!session) return

        const payload = buildChannelInteractivePayload({ poll, question, message })
            ?? buildMediaPayload({ message, mediaUrl, mediaType, caption, fileName })
        if (!payload) {
            return res.status(400).json({ error: 'Invalid mediaType. Use image, video, audio, or document.' })
        }

        const jid = normalizeJid(channelId, 'newsletter')

        // Subscribe to live updates before sending media — required by WhatsApp Web protocol
        if (mediaUrl) {
            try {
                await session.sock.subscribeNewsletterUpdates(jid)
            } catch (_) {}
            await new Promise(r => setTimeout(r, 1500))
        }

        const sentMsg = await session.sock.sendMessage(jid, payload)

        res.json({ status: 'sent', messageId: sentMsg.key.id })
    } catch (error) {
        logger.error('Controller Error (sendChannelMessage):', error)
        res.status(500).json({ error: error.message })
    }
}

/**
 * Latest posts of a channel exactly as WhatsApp stores them: the <message>
 * stanza attributes, its child nodes and the decoded content. Baileys'
 * newsletterFetchMessages keeps only the content, but what makes a post a
 * real question (one whose answers reach the admins) may live in the stanza.
 */
const describeNode = (node) => ({
    tag: node.tag,
    attrs: node.attrs,
    children: Array.isArray(node.content) ? node.content.map(describeNode) : undefined
})

export const getChannelMessages = async (req, res) => {
    try {
        const { sessionId, channelId } = req.params
        const session = getConnectedSession(sessionId, res)
        if (!session) return

        const jid = normalizeJid(channelId, 'newsletter')
        const count = Math.min(parseInt(req.query.count, 10) || 10, 50)
        const result = await session.sock.query({
            tag: 'iq',
            attrs: { id: session.sock.generateMessageTag(), type: 'get', xmlns: 'newsletter', to: S_WHATSAPP_NET },
            content: [{ tag: 'messages', attrs: { count: count.toString(), type: 'jid', jid } }]
        })

        const messages = getBinaryNodeChildren(getBinaryNodeChild(result, 'messages'), 'message').map(node => {
            const plaintext = getBinaryNodeChild(node, 'plaintext')
            let message = null
            if (plaintext?.content) {
                try {
                    message = proto.Message.decode(Buffer.from(plaintext.content)).toJSON()
                } catch (e) {
                    message = { decodeError: e.message }
                }
            }
            return { stanza: describeNode({ ...node, content: (node.content || []).filter(c => c.tag !== 'plaintext') }), message }
        })

        res.json({ status: 'success', channelId: jid, messages })
    } catch (error) {
        logger.error('Controller Error (getChannelMessages):', error)
        res.status(500).json({ error: error.message })
    }
}

export const getChannelInfo = async (req, res) => {
    try {
        const { sessionId, channelId } = req.params
        const session = getConnectedSession(sessionId, res)
        if (!session) return

        const jid = normalizeJid(channelId, 'newsletter')
        const metadata = await session.sock.newsletterMetadata('jid', jid)
        const meta = metadata?.thread_metadata ?? metadata ?? {}
        const viewer = metadata?.viewer_metadata ?? {}

        res.json({
            status: 'success',
            channel: {
                id: metadata?.id ?? jid,
                state: metadata?.state?.type ?? null,
                name: meta.name?.text ?? meta.name ?? null,
                description: meta.description?.text ?? meta.description ?? null,
                invite: meta.invite ?? null,
                picture: meta.picture ?? null,
                preview: meta.preview?.direct_path ?? meta.preview ?? null,
                verified: meta.verification === 'VERIFIED',
                mute: viewer.mute === 'ON',
                role: viewer.role ?? null,
                creationTime: meta.creation_time ? parseInt(meta.creation_time) : null
            }
        })
    } catch (error) {
        logger.error('Controller Error (getChannelInfo):', error)
        res.status(500).json({ error: error.message })
    }
}

export const followChannel = async (req, res) => {
    try {
        const { sessionId, channelId } = req.body
        const session = getConnectedSession(sessionId, res)
        if (!session) return

        await session.sock.newsletterFollow(normalizeJid(channelId, 'newsletter'))
        res.json({ status: 'success', message: 'Subscribed to channel' })
    } catch (error) {
        logger.error('Controller Error (followChannel):', error)
        res.status(500).json({ error: error.message })
    }
}

export const unfollowChannel = async (req, res) => {
    try {
        const { sessionId, channelId } = req.body
        const session = getConnectedSession(sessionId, res)
        if (!session) return

        await session.sock.newsletterUnfollow(normalizeJid(channelId, 'newsletter'))
        res.json({ status: 'success', message: 'Unsubscribed from channel' })
    } catch (error) {
        logger.error('Controller Error (unfollowChannel):', error)
        res.status(500).json({ error: error.message })
    }
}

export const muteChannel = async (req, res) => {
    try {
        const { sessionId, channelId, mute } = req.body
        const session = getConnectedSession(sessionId, res)
        if (!session) return

        const jid = normalizeJid(channelId, 'newsletter')
        if (mute !== false) {
            await session.sock.newsletterMute(jid)
        } else {
            await session.sock.newsletterUnmute(jid)
        }
        res.json({ status: 'success', message: mute !== false ? 'Channel muted' : 'Channel unmuted' })
    } catch (error) {
        logger.error('Controller Error (muteChannel):', error)
        res.status(500).json({ error: error.message })
    }
}

export const updateChannel = async (req, res) => {
    try {
        const { sessionId, channelId, type, value } = req.body
        const session = getConnectedSession(sessionId, res)
        if (!session) return

        const jid = normalizeJid(channelId, 'newsletter')

        switch (type) {
            case 'name':        await session.sock.newsletterUpdateName(jid, value); break
            case 'description': await session.sock.newsletterUpdateDescription(jid, value); break
            case 'picture':     await session.sock.newsletterUpdatePicture(jid, { url: value }); break
            default:            return res.status(400).json({ error: 'Invalid type. Use name, description, or picture.' })
        }

        res.json({ status: 'success' })
    } catch (error) {
        logger.error('Controller Error (updateChannel):', error)
        res.status(500).json({ error: error.message })
    }
}

export const deleteChannel = async (req, res) => {
    try {
        const { sessionId, channelId } = req.body
        const session = getConnectedSession(sessionId, res)
        if (!session) return

        await session.sock.newsletterDelete(normalizeJid(channelId, 'newsletter'))
        res.json({ status: 'success', message: 'Channel deleted' })
    } catch (error) {
        logger.error('Controller Error (deleteChannel):', error)
        res.status(500).json({ error: error.message })
    }
}
