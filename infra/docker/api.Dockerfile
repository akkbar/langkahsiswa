FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/website/package.json apps/website/package.json
COPY packages packages
RUN npm ci
COPY tsconfig.base.json ./
COPY apps/api apps/api
RUN npm run build -w @schoolapp/api
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && npm run start -w @schoolapp/api"]
