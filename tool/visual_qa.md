# Visual QA for ERSI GBO

Source PDF: `ers_gbo_clean_eco_v7_design_pages.pdf`

## Reference render

```sh
python3 tool/render_pdf_references.py
```

Outputs:

- `tmp/pdfs/ers_v7/page-01.png` ... `page-40.png`
- `tmp/pdfs/ers_v7/cropped/page-01.png` ... `page-40.png`
- `tmp/pdfs/ers_v7/contact.jpg`

## Flutter screenshots and diff

```sh
/Volumes/PD1000/job/flutter/bin/flutter test --update-goldens test/golden_screens_test.dart
python3 tool/visual_diff.py
```

Outputs:

- `test/goldens/flutter/page-1.png` ... `page-40.png`
- `tmp/visual_diff/page-01-diff.png` ... `page-40-diff.png`
- `tmp/visual_diff/report.md`

## Flutter viewport

All screens are authored for `430 x 932` logical pixels. In tests, use:

```dart
tester.view.physicalSize = const Size(designWidth, designHeight);
tester.view.devicePixelRatio = 1;
```

## Acceptance checklist per screen

- Header, status bar, body, bottom navigation and action buttons match the PDF position.
- Text content uses the PDF terminology, with "Инспекционный орган" instead of "агент".
- Cards, fields, chips and buttons do not overflow at `430 x 932`.
- Watermark appears on document/registry screens that expose protected data.
- Camera, map and document surfaces are coded widgets, not PNG screenshots.
