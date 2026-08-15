FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/views ./views
COPY --from=build /app/public ./public
COPY --from=build /app/migrations ./migrations
# dist/provisioning/cli.js is already compiled as part of `npm run build`;
# run provisioning in this image with: node dist/provisioning/cli.js --offering-code ... --roster ...

EXPOSE 3000
CMD ["node", "dist/main.js"]
