FROM python:3.11-slim

WORKDIR /app

# System deps for PaddlePaddle / PaddleOCR / Pillow
# Note: libgl1-mesa-glx was removed in Debian Trixie; libgl1 is the replacement.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    libglib2.0-0 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables for CPU-only PyTorch
ENV TORCH_DISABLE_SHM=1
ENV PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:128
ENV CUDA_VISIBLE_DEVICES=-1

COPY requirements.txt .

# Install Python deps — CPU only versions
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# Pre-download PaddleOCR models so they are baked into the image
# (avoids ~80 MB download on first request).
RUN python main.py --install-ocr

# Pre-download OPUS-MT ja→en model (~300 MB).
RUN python main.py --install-translate

EXPOSE 5100

# Single worker — keeps RSS within 500 MB
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5100", "--workers", "1", "--log-level", "info"]
