FROM python:3.11-slim

WORKDIR /app

# Install system deps needed by some Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install CPU-only PyTorch first (much smaller than CUDA build),
# then install all other dependencies.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt

COPY server.py .

# Pre-download the OPUS-MT ja→en model so it's baked into the image.
# This avoids a ~300 MB download on first request.
RUN python server.py --install-translate

EXPOSE 5100

# Use gunicorn for production.  Railway injects $PORT; default to 5100.
# --timeout 120 gives models time to load on the first request.
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-5100} --timeout 120 --workers 1 server:app"]
