FROM oven/bun:1.4-slim
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY src ./src
COPY public ./public
COPY mcp ./mcp
ENV NODE_ENV=production PORT=4949 TUBESCOPE_DATA_DIR=/data HOME=/tmp TUBESCOPE_NO_AUTOCONNECT=1 TUBESCOPE_NO_PUBLIC=1
RUN mkdir /data && chown bun:bun /data
USER bun
EXPOSE 4949
CMD ["bun", "src/server.js"]
