import * as sessionManager from '../services/session.manager.js'
import QRCode from 'qrcode'
import logger from '../config/logger.js'

export const listSessions = (req, res) => {
    res.json(sessionManager.getAllSessions())
}

export const createOrGetSession = async (req, res) => {
    try {
        const sessionId = req.params.id
        const session = await sessionManager.createSession(sessionId)

        const response = {
            id: session.id,
            status: session.status,
        }

        if (session.qr) {
            response.qr = await QRCode.toDataURL(session.qr)
        }

        res.json(response)
    } catch (error) {
        logger.error(`Controller Error (createOrGetSession):`, error)
        res.status(500).json({ error: error.message })
    }
}

export const getSessionStatus = async (req, res) => {
    const sessionId = req.params.id
    const session = sessionManager.getSession(sessionId)

    if (!session) {
        return res.status(404).json({ error: 'Session not found' })
    }

    const response = {
        id: session.id,
        status: session.status,
    }

    if (session.qr) {
        response.qr = await QRCode.toDataURL(session.qr)
    }

    res.json(response)
}

export const getQRImage = async (req, res) => {
    const sessionId = req.params.id
    const session = sessionManager.getSession(sessionId)

    if (!session || !session.qr) {
        return res.status(404).send('QR Code not available or session connected')
    }

    try {
        // Generate QR code as a buffer
        const qrBuffer = await QRCode.toBuffer(session.qr, {
            type: 'png',
            width: 300,
            margin: 2
        })

        res.setHeader('Content-Type', 'image/png')
        res.send(qrBuffer)
    } catch (error) {
        logger.error('Error generating QR image:', error)
        res.status(500).send('Error generating QR image')
    }
}

export const requestPairingCode = async (req, res) => {
    try {
        const sessionId = req.params.id
        const { phoneNumber } = req.body

        const session = sessionManager.getSession(sessionId)
        if (!session || !session.sock) {
            return res.status(404).json({ error: 'Session not found or not initialized' })
        }
        if (session.status !== 'qr') {
            return res.status(400).json({ error: `Session status is "${session.status}". The session must be waiting for QR first.` })
        }

        const cleaned = String(phoneNumber).replace(/\D/g, '')
        if (cleaned.length < 5) {
            return res.status(400).json({ error: 'Invalid phone number' })
        }

        const code = await session.sock.requestPairingCode(cleaned)
        res.json({ code })
    } catch (error) {
        logger.error('Controller Error (requestPairingCode):', error)
        res.status(500).json({ error: error.message })
    }
}

export const serveTestUI = (req, res) => {
    const apiKey = process.env.API_KEY || ''
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SendZap — Test UI</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0A1628;--surface:#1a2535;--border:#2a3a4a;--text:#e8edf3;--muted:#7a8a9a;--green:#25D366;--green2:#128C7E;--red:#e05555;--yellow:#e3b341}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;flex-direction:column}
header{background:var(--surface);border-bottom:1px solid var(--border);padding:.85rem 1.5rem;display:flex;align-items:center;gap:.75rem}
.logo{font-weight:800;font-size:1.15rem;color:var(--green);letter-spacing:-.02em}
.status-badge{margin-left:auto;display:flex;align-items:center;gap:.5rem;font-size:.8rem;padding:.3rem .75rem;border-radius:99px;border:1px solid var(--border);background:var(--bg)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--muted);transition:background .3s}
.dot.connecting{background:var(--yellow);animation:pulse 1.5s infinite}
.dot.qr{background:var(--yellow);animation:pulse 1.5s infinite}
.dot.connected{background:var(--green)}
.dot.error{background:var(--red)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
main{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;padding:1.5rem;max-width:900px;margin:0 auto;width:100%}
@media(max-width:640px){main{grid-template-columns:1fr}}
.card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:1.5rem;display:flex;flex-direction:column;align-items:center;gap:1.25rem}
h2{font-size:.95rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;align-self:flex-start}
.qr-box{background:#fff;border-radius:10px;padding:12px;display:flex;align-items:center;justify-content:center;width:240px;height:240px;position:relative}
.qr-box img{width:216px;height:216px;image-rendering:pixelated;display:block}
.qr-loader{position:absolute;inset:0;background:rgba(255,255,255,.85);display:flex;align-items:center;justify-content:center;border-radius:10px;font-size:.8rem;color:#333;font-weight:600;display:none}
.qr-loader.show{display:flex}
.countdown{font-size:.75rem;color:var(--muted)}
.sep{width:100%;border:none;border-top:1px solid var(--border)}
.input-row{display:flex;gap:.5rem;width:100%}
input[type=tel]{flex:1;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:.6rem .85rem;color:var(--text);font-size:.9rem;outline:none;transition:border .2s}
input[type=tel]:focus{border-color:var(--green)}
button{background:var(--green);color:#fff;border:none;border-radius:8px;padding:.6rem 1rem;font-size:.85rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:opacity .2s}
button:hover{opacity:.85}
button:disabled{opacity:.4;cursor:not-allowed}
.code-display{font-family:monospace;font-size:2.2rem;font-weight:800;letter-spacing:.15em;color:var(--green);background:var(--bg);border-radius:10px;padding:1rem 1.5rem;border:1px solid var(--border);width:100%;text-align:center;word-break:break-all}
.msg{font-size:.82rem;text-align:center;color:var(--muted);line-height:1.5}
.msg a{color:var(--green);text-decoration:none}
.success{text-align:center;display:flex;flex-direction:column;align-items:center;gap:.75rem}
.check{font-size:3rem}
.success h3{color:var(--green);font-size:1.1rem}
.err{color:var(--red);font-size:.82rem;text-align:center}
</style>
</head>
<body>
<header>
  <div class="logo">SendZap</div>
  <div class="status-badge">
    <div class="dot connecting" id="dot"></div>
    <span id="status-text">Connexion...</span>
  </div>
</header>
<main>
  <!-- QR Card -->
  <div class="card" id="qr-card">
    <h2>Scanner le QR</h2>
    <div class="qr-box">
      <img id="qr-img" src="" alt="QR Code" />
      <div class="qr-loader" id="qr-loader">Chargement...</div>
    </div>
    <div class="countdown" id="countdown"></div>
    <hr class="sep">
    <p class="msg">Ouvre WhatsApp → <strong>Appareils liés</strong> → Lier un appareil</p>
    <div id="connected-qr" class="success" style="display:none">
      <div class="check">✅</div>
      <h3>Connecté !</h3>
    </div>
  </div>

  <!-- Pairing Code Card -->
  <div class="card" id="pair-card">
    <h2>Code de couplage</h2>
    <p class="msg">Entre ton numéro WhatsApp (avec indicatif pays) pour recevoir un code à 8 chiffres.</p>
    <div class="input-row">
      <input type="tel" id="phone-input" placeholder="22994831275" value="22994831275" />
      <button id="pair-btn" onclick="getPairingCode()">Obtenir le code</button>
    </div>
    <div id="code-area" style="display:none">
      <div class="code-display" id="code-display"></div>
    </div>
    <div id="pair-err" class="err" style="display:none"></div>
    <hr class="sep">
    <p class="msg">Dans WhatsApp → <strong>Appareils liés</strong> → Lier avec un numéro de téléphone → entre le code ci-dessus</p>
    <div id="connected-pair" class="success" style="display:none">
      <div class="check">✅</div>
      <h3>Connecté !</h3>
    </div>
  </div>
</main>

<script>
const SESSION_ID = 'test-22994831275'
const API_KEY = '${apiKey}'
const BASE = ''

let qrRefreshTimer = null
let countdownTimer = null
let statusInterval = null
let connected = false

function headers(json) {
  const h = { 'X-API-KEY': API_KEY }
  if (json) h['Content-Type'] = 'application/json'
  return h
}

async function loadQR() {
  if (connected) return
  const img = document.getElementById('qr-img')
  const loader = document.getElementById('qr-loader')
  loader.className = 'qr-loader show'
  try {
    const res = await fetch(BASE + '/session/' + SESSION_ID + '/qr', { headers: headers() })
    if (res.ok) {
      const blob = await res.blob()
      img.src = URL.createObjectURL(blob)
    }
  } finally {
    loader.className = 'qr-loader'
  }
  startCountdown(30)
}

function startCountdown(secs) {
  clearInterval(countdownTimer)
  const el = document.getElementById('countdown')
  let remaining = secs
  countdownTimer = setInterval(() => {
    remaining--
    if (remaining <= 0) {
      clearInterval(countdownTimer)
      el.textContent = ''
      loadQR()
    } else {
      el.textContent = 'Rafraîchissement dans ' + remaining + 's'
    }
  }, 1000)
}

async function getPairingCode() {
  const btn = document.getElementById('pair-btn')
  const phone = document.getElementById('phone-input').value.trim()
  const errEl = document.getElementById('pair-err')
  const codeArea = document.getElementById('code-area')
  const codeEl = document.getElementById('code-display')
  errEl.style.display = 'none'
  codeArea.style.display = 'none'
  btn.disabled = true
  btn.textContent = '...'
  try {
    const res = await fetch(BASE + '/session/' + SESSION_ID + '/pairing-code', {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ phoneNumber: phone })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Erreur serveur')
    codeEl.textContent = data.code
    codeArea.style.display = 'block'
  } catch (e) {
    errEl.textContent = e.message
    errEl.style.display = 'block'
  } finally {
    btn.disabled = false
    btn.textContent = 'Obtenir le code'
  }
}

async function pollStatus() {
  try {
    const res = await fetch(BASE + '/session/' + SESSION_ID, { headers: headers() })
    const data = await res.json()
    const dot = document.getElementById('dot')
    const text = document.getElementById('status-text')
    dot.className = 'dot ' + data.status
    const labels = { initializing: 'Initialisation...', qr: 'En attente du scan', connected: 'Connecté', error: 'Erreur' }
    text.textContent = labels[data.status] || data.status
    if (data.status === 'connected' && !connected) {
      connected = true
      clearInterval(countdownTimer)
      clearInterval(statusInterval)
      document.getElementById('connected-qr').style.display = 'flex'
      document.getElementById('connected-pair').style.display = 'flex'
      document.getElementById('countdown').textContent = ''
    }
  } catch (_) {}
}

async function init() {
  // Create session if not exists
  try {
    await fetch(BASE + '/session/' + SESSION_ID, {
      method: 'POST',
      headers: headers()
    })
  } catch (_) {}
  await loadQR()
  statusInterval = setInterval(pollStatus, 3000)
  pollStatus()
}

init()
</script>
</body>
</html>`
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
}

export const deleteSession = async (req, res) => {
    try {
        const sessionId = req.params.id
        await sessionManager.deleteSession(sessionId)
        res.json({ status: 'deleted' })
    } catch (error) {
        logger.error(`Controller Error (deleteSession):`, error)
        res.status(500).json({ error: error.message })
    }
}
