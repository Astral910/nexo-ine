# Imagen única: compila el frontend y lo sirve junto con la API (un solo origen, sin CORS).
FROM node:22-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    NEXO_DIRECTORIO_DATOS=/app/data NEXO_DIRECTORIO_VAR=/app/var
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir --require-hashes -r requirements.txt
COPY backend/ ./
COPY data/manifiesto.json /app/data/manifiesto.json
COPY data/procesados /app/data/procesados
COPY --from=frontend /src/frontend/dist /app/frontend/dist
COPY docker/arranque.sh /app/arranque.sh
RUN useradd --create-home --uid 10001 nexo && mkdir -p /app/var && chown -R nexo:nexo /app/var && chmod +x /app/arranque.sh
USER nexo
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/salud')"
CMD ["/app/arranque.sh"]
