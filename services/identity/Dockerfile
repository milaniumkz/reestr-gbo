# syntax=docker/dockerfile:1
FROM python:3.12-slim-bookworm
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 tesseract-ocr tesseract-ocr-rus tesseract-ocr-kaz tesseract-ocr-eng && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN --mount=type=secret,id=proxy_ca if [ -f /run/secrets/proxy_ca ]; then PIP_CERT=/run/secrets/proxy_ca pip install --no-cache-dir -r requirements.txt; else pip install --no-cache-dir -r requirements.txt; fi
COPY models ./models
COPY download_models.py .
RUN --mount=type=secret,id=proxy_ca if [ -f /run/secrets/proxy_ca ]; then SSL_CERT_FILE=/run/secrets/proxy_ca python download_models.py; else python download_models.py; fi
COPY engine.py documents.py test_engine.py .
COPY vendor/generate_patches.py ./vendor/generate_patches.py
RUN chmod -R a+rX /app
RUN useradd --uid 10001 --no-create-home identity
USER identity
ENV OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MPLCONFIGDIR=/tmp/matplotlib
EXPOSE 8080
CMD ["python","engine.py"]
