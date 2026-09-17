# 前端正式映像：node 建置，nginx 送檔。開發時用 `make web` 跑 vite 就好。
FROM node:22-alpine AS builder

WORKDIR /app

# 先只複製依賴宣告，改程式碼時才不會重裝一次 node_modules。
# package-lock.json 後面的 * 是為了「還沒產生 lock 檔」也能建置。
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
    CMD wget --spider -q http://127.0.0.1/ || exit 1
