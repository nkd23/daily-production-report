FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --create-home appuser
USER appuser

EXPOSE 8000

# 3 workers suit a 4-core server; --proxy-headers makes request.client the
# real visitor IP (Caddy's X-Forwarded-For) so login throttling works per user.
CMD ["sh", "-c", "python init_schema.py && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 3 --proxy-headers --forwarded-allow-ips='*'"]
