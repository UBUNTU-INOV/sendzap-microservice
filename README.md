# WhatsApp Noweb Microservice 🚀

A robust, ultra-lightweight WhatsApp API microservice built with Node.js and `@whiskeysockets/baileys`. 
Optimized for high-density SAAS environments (e.g., Laravel backends) to manage hundreds of sessions with minimal RAM.

## 🌟 Key Features
- **SQLite Persistence**: Sessions and webhook queue are stored in SQLite, no data loss on restart/redeploy.
- **Reliable Webhooks**: Built-in queue with exponential backoff retries and HMAC security.
- **Optimized for VPS**: Designed to run 100+ sessions on an 8GB VPS without Puppeteer/Browser overhead.
- **Group Management**: Full control over group creation, participants, and settings.
- **Health Monitoring**: Real-time system stats (CPU, RAM, Uptime) and session health.

---

## 🛠 Quick Start

### 1. Installation
```bash
npm install
cp .env.example .env # Configure your API_KEY and WEBHOOK_URL
```

### 2. Run
```bash
npm start
```

### 3. Access Documentation
Once the server is running, access the interactive Swagger UI at:
**`http://localhost:3000/api-docs`**

---

## 🔐 Security & Monitoring
- **Authentication**: All requests must include the `X-API-KEY` header.
- **Webhook Security**: Verify incoming webhooks using the `X-Webhook-Signature` (HMAC-SHA256).
- **Health Check**: Monitor your instance at `/health`.

---

## 📁 API Categories (Interactive UI)
The API is structured into five main categories available in the [Swagger UI](http://localhost:3000/api-docs):

1. **Health**: Monitoring and system statistics.
2. **Sessions**: Multi-device authentication and QR code management.
3. **Messages**: Sending text, media, bulk, and contact cards.
4. **Groups**: Comprehensive group creation and participant management.
5. **Status**: Post updates to WhatsApp Status (Stories).

---

## 🐳 Docker Deployment
Use the included `Dockerfile` and `docker-compose.yml`. 
**Important**: Mount the `./sessions` directory as a volume to persist your WhatsApp logins.

```bash
docker-compose up -d
```

---
*Note: Incoming private messages and group events are active by default for chatbot integration.*
*Created with ❤️ for high-performance WhatsApp automation.*
