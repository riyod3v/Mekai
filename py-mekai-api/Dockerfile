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
ENV TRANSFORMERS_CACHE=/app/models
ENV HF_HOME=/app/models

# Limit CPU parallelism — Railway containers share CPU cores.
# Without these, PaddlePaddle/OpenMP spawn many threads that fight for
# the scheduler, making OCR 3-5× slower and triggering 60s edge timeout.
ENV OMP_NUM_THREADS=2
ENV MKL_NUM_THREADS=2
ENV OPENBLAS_NUM_THREADS=2
ENV GOTO_NUM_THREADS=2
ENV FLAGS_num_threads=2

# Create models directory
RUN mkdir -p /app/models

# Install CPU-only PyTorch FIRST (saves ~2.3 GB vs full torch with CUDA)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY railwayReq.txt .

# Install remaining Python deps (torch already installed above)
RUN pip install --no-cache-dir -r railwayReq.txt

COPY main.py .

# Pre-download models at build time so they're baked into the image.
# Models load from disk during FastAPI lifespan — no redundant processes.
RUN python main.py --install-ocr || echo "OCR model download failed - will download on first request"
RUN python main.py --install-translate || echo "Translation model download failed - will download on first request"

EXPOSE 5100

# Start uvicorn directly — models are preloaded via FastAPI lifespan events,
# no redundant startup script needed.
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-5100} --workers 1 --log-level info"]
