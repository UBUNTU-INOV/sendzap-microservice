# Tag figé (était node:22-alpine, flottant) — Node 22 LTS, dernier patch au 2026-10-22.
# Reproductibilité totale : après `docker pull`, remplacer par le digest
# FROM node:22.23.4-alpine@sha256:<digest obtenu sur le build host>
FROM node:22.23.4-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev --legacy-peer-deps

COPY . .

RUN mkdir -p sessions

EXPOSE 3000

# 3.5GB heap — 120 sessions x ~30MB + runtime overhead, within 4GB container limit
CMD ["node", "--max-old-space-size=3584", "index.js"]
