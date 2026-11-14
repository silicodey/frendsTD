# frendsTD: the game plus the online duel server in one container.
#   docker build -t frendstd . && docker run -p 8787:8787 frendstd
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV PORT=8787
EXPOSE 8787
CMD ["npm", "start"]
