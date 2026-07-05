FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY index.js ./
COPY src ./src
COPY migrations ./migrations
COPY scripts ./scripts
RUN mkdir -p uploads/avatars
EXPOSE 5000
CMD ["npm", "start"]
