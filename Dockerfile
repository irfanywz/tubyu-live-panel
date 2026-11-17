# Tubyu Live Panel dalam satu image.
# FFmpeg diambil dari repositori Debian, jadi pasti cocok dengan sistem di dalam
# container ini, apa pun sistem operasi host-nya. Tidak perlu FFMPEG_PATH.
FROM node:24-slim

# ffmpeg: untuk live (rtmps) dan thumbnail. ca-certificates: untuk unduhan HTTPS.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependency dipasang dulu, supaya rebuild image berikutnya cepat (cache layer).
COPY package.json ./
RUN npm install --omit=dev

COPY src/ src/
COPY scripts/ scripts/
COPY public/ public/

# 0.0.0.0 agar panel bisa diakses dari luar container. Di compose sudah diarahkan
# ke 127.0.0.1 di host, jadi tetap aman.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

EXPOSE 3000

CMD ["node", "--no-warnings", "src/server.js"]
