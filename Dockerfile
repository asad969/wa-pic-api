FROM node:20-alpine

# Install git (needed by some baileys deps)
RUN apk add --no-cache git python3 make g++

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install --production

# Copy app
COPY index.js ./

# Session folder (persistent volume should be mounted here)
RUN mkdir -p /app/auth_session

EXPOSE 3000

CMD ["node", "index.js"]
