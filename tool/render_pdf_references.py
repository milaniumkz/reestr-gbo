from pathlib import Path

import fitz
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "ers_gbo_clean_eco_v7_design_pages.pdf"
OUT = ROOT / "tmp" / "pdfs" / "ers_v7"
CROPPED = OUT / "cropped"
PHONE_CROP = (184, 73, 710, 1208)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    CROPPED.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(PDF)
    thumbs = []

    for page_index, page in enumerate(doc, 1):
        pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
        page_path = OUT / f"page-{page_index:02d}.png"
        pix.save(page_path)

        thumb = Image.open(page_path).convert("RGB")
        phone = thumb.crop(PHONE_CROP)
        phone.save(CROPPED / f"page-{page_index:02d}.png")
        thumb.thumbnail((230, 325))
        cell = Image.new("RGB", (250, 360), "white")
        cell.paste(thumb, ((250 - thumb.width) // 2, 8))
        ImageDraw.Draw(cell).text((10, 338), f"{page_index:02d}", fill=(0, 0, 0))
        thumbs.append(cell)

    cols = 5
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 250, rows * 360), (244, 247, 250))
    for index, thumb in enumerate(thumbs):
        sheet.paste(thumb, ((index % cols) * 250, (index // cols) * 360))
    sheet.save(OUT / "contact.jpg", quality=92)

    print(f"Rendered {len(doc)} pages into {OUT}")
    print(f"Cropped phone references into {CROPPED}")


if __name__ == "__main__":
    main()
