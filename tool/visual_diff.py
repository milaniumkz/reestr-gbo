from pathlib import Path

from PIL import Image, ImageChops, ImageStat


ROOT = Path(__file__).resolve().parents[1]
PDF_REF = ROOT / "tmp" / "pdfs" / "ers_v7" / "cropped"
FLUTTER = ROOT / "test" / "goldens" / "flutter"
OUT = ROOT / "tmp" / "visual_diff"
SIZE = (430, 932)


def diff_score(reference: Image.Image, actual: Image.Image) -> tuple[float, float]:
    diff = ImageChops.difference(reference, actual)
    stat = ImageStat.Stat(diff)
    mae = sum(stat.mean) / len(stat.mean)
    rms = sum(value**2 for value in stat.rms) ** 0.5 / len(stat.rms)
    return mae, rms


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    rows = ["# Visual diff report", "", "| Screen | MAE | RMS | Diff |", "|---:|---:|---:|---|"]

    for index in range(1, 41):
        reference_path = PDF_REF / f"page-{index:02d}.png"
        actual_path = FLUTTER / f"page-{index}.png"
        if not reference_path.exists() or not actual_path.exists():
            rows.append(f"| {index:02d} | missing | missing | - |")
            continue

        reference = Image.open(reference_path).convert("RGB").resize(SIZE)
        actual = Image.open(actual_path).convert("RGB").resize(SIZE)
        diff = ImageChops.difference(reference, actual)
        diff_path = OUT / f"page-{index:02d}-diff.png"
        diff.save(diff_path)
        mae, rms = diff_score(reference, actual)
        rows.append(f"| {index:02d} | {mae:.2f} | {rms:.2f} | `{diff_path}` |")

    report = OUT / "report.md"
    report.write_text("\n".join(rows) + "\n", encoding="utf-8")
    print(f"Wrote {report}")


if __name__ == "__main__":
    main()
