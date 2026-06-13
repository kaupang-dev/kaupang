# Image for the kaupang "longhall" example: a tiny, dependency-free Node service
# that runs as the herald (web/API), runecarver (migrate), or huscarl (worker).
# No `npm install` step — there are no dependencies — so it builds fully offline
# once the base image is present.
FROM node:20-alpine
WORKDIR /app
COPY package.json server.js ./
EXPOSE 3000
# Default role is the web/API server; runecarver/huscarl override `command`.
CMD ["npm", "start"]
