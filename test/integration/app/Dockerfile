# Tiny image for the integration test — built, pushed to a local registry, then
# deployed by kaupang (so digest resolution has something real to resolve).
FROM node:20-alpine
WORKDIR /app
COPY server.js ./
EXPOSE 3000
CMD ["node", "server.js"]
