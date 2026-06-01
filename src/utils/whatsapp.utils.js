/**
 * Normalise un identifiant (numéro ou JID) vers un JID WhatsApp complet.
 * @param {string} id - Numéro de téléphone ou JID existant
 * @param {'private'|'group'|'newsletter'} [hint] - Type forcé si connu
 */
export function normalizeJid(id, hint) {
    if (id.includes('@')) return id

    if (hint === 'group') return `${id}@g.us`
    if (hint === 'newsletter') return `${id}@newsletter`

    // Heuristique : numéro avec tiret ou > 15 chars → groupe
    const isGroup = id.includes('-') || id.length > 15
    return isGroup ? `${id}@g.us` : `${id}@s.whatsapp.net`
}

/**
 * Construit le payload Baileys pour un message media ou texte.
 * Retourne null si mediaType est invalide.
 * @param {{ message?: string, mediaUrl?: string, mediaType?: string, fileName?: string, caption?: string }} opts
 */
export function buildMediaPayload({ message, mediaUrl, mediaType, fileName, caption }) {
    if (!mediaUrl) {
        return { text: message || '' }
    }

    const content = { url: mediaUrl }
    switch (mediaType) {
        case 'image':    return { image: content, caption: caption || message || '' }
        case 'video':    return { video: content, caption: caption || message || '' }
        case 'audio':    return { audio: content, ptt: false }
        case 'document': return { document: content, fileName: fileName || 'file', caption: caption || message || '' }
        default:         return null
    }
}
