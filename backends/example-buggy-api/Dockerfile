FROM node:22-alpine
WORKDIR /app

# Build context is the repository root (see deployments/docker-compose.yml)
# so we can copy the sibling backend-sdk/ package without it being part of
# this "separate project" at runtime — it is only vendored in at build time.
COPY backend-sdk /backend-sdk
COPY backends/example-buggy-api/package.json ./
RUN npm install
COPY backends/example-buggy-api/. .

EXPOSE 4000
CMD ["npm", "start"]
