FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

RUN mkdir -p sessions

EXPOSE 3000

# 6GB heap for 100 active sessions (~50MB each + runtime overhead)
CMD ["node", "--max-old-space-size=6144", "index.js"]
