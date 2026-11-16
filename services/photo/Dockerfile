FROM python:3.12-slim-bookworm
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY model.json detector.py engine.py ./
COPY models ./models
COPY LICENSE-YOLOX ./LICENSE-YOLOX
RUN useradd --uid 10002 --no-create-home photo && chmod -R a+rX /app
USER photo
ENV OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
EXPOSE 8080
CMD ["python","engine.py"]
