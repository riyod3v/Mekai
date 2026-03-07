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

# Create models directory
RUN mkdir -p /app/models

COPY requirements.txt .

# Install Python deps — CPU only versions
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# Try to pre-download models, but don't fail the build if it doesn't work
RUN python main.py --install-ocr || echo "OCR model download failed - will download on first request"
RUN python main.py --install-translate || echo "Translation model download failed - will download on first request"

# Create a startup script that ensures models are downloaded
RUN echo '#!/bin/bash\n\
echo "Starting Mekai API..."\n\
echo "Checking models..."\n\
python -c "import main; main.get_paddle_ocr()" 2>/dev/null || echo "OCR models will be downloaded on first use"\n\
python -c "import main; main.get_opus_translator()" 2>/dev/null || echo "Translation models will be downloaded on first use"\n\
echo "Starting server..."\n\
exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-5100} --workers 1 --log-level info\n\
' > /app/start.sh && chmod +x /app/start.sh

EXPOSE 5100

# Use the startup script
CMD ["/app/start.sh"]
