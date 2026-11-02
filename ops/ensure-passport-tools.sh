#!/usr/bin/env bash
set -euo pipefail
if ! command -v pdfinfo >/dev/null || ! command -v pdftoppm >/dev/null || ! command -v tesseract >/dev/null || ! tesseract --list-langs 2>/dev/null | grep -qx eng || ! tesseract --list-langs 2>/dev/null | grep -qx rus || ! tesseract --list-langs 2>/dev/null | grep -qx kaz; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-eng tesseract-ocr-rus tesseract-ocr-kaz
fi
command -v pdfinfo >/dev/null
command -v pdftoppm >/dev/null
for language in eng rus kaz; do tesseract --list-langs 2>/dev/null | grep -qx "$language"; done
echo 'Passport PDF/OCR tools ready (eng, rus, kaz)'
