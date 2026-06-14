# kaupang studio as a container — the web UI for people without Node.
# Mount a catalog, open the published port, assemble + export a config in the browser.
#
#   docker run --rm -p 8080:8080 \
#     -v "$PWD/catalog.json:/catalog.json" \
#     -e KAUPANG_CATALOG=/catalog.json \
#     ghcr.io/kaupang-dev/kaupang-studio
#
FROM node:20-alpine
WORKDIR /app
# @kaupang/studio pulls in @kaupang/core. Override the version with --build-arg VERSION=x.y.z.
ARG VERSION=latest
RUN npm install --omit=dev "@kaupang/studio@${VERSION}"
ENV HOST=0.0.0.0 PORT=8080
EXPOSE 8080
CMD ["node", "node_modules/@kaupang/studio/dist/serve.js"]
