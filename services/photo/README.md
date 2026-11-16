# Local photo device evidence — candidate, not deployed

This prototype adds semantic object evidence to the existing local cylinder-label
checks. It returns only phone, screen, laptop and book/page candidates, plus an
advisory white-page-border flag. It does not identify people, read owner data,
contact image APIs, store pictures, or certify a label's authenticity.

The original upload remains unchanged. The backend makes an analysis-only
1280-pixel derivative and sends it to a fixed loopback address. Public model
weights are downloaded at build time and verified against model.json size/hash.
The pinned YOLOX release assets use raw BGR input; older tagged source examples
with ImageNet normalization do not match these exact release assets.

## Decisions

- Refuse only a central device covering at least 18% of the frame, confidence at
  least 0.85, corroborated at 0.75 in a second mirrored view with IoU >= 0.6.
- Weaker/peripheral device evidence is a quality-review reason.
- A book or white page-like border is advisory. A factory label may be white.
- Clean printed reproductions can still evade these signals. Every cylinder
  label still requires human quality review.
- Unavailable/invalid private inference produces an explicit manual-review
  reason; existing unusable-image/screen-band checks still run.

## Local verification

Run download_model.py, install requirements.txt in an isolated environment, then
`python -m unittest discover -s services/photo -p 'test_*.py'`.

The candidate passed 10 Python tests (pinned real-model load, input/decode
contract, mirrored agreement, image bounds/orientation, white-border evidence,
HTTP errors, actual HTTP inference and busy-worker refusal) and 93 targeted
backend tests. A full COCO128 fixture pass took 45.22 seconds on the test host;
it is a small public training sample, not an industrial accuracy benchmark.
A full-image monitor fixture produced 0.928 confidence and 0.878 mirrored
agreement, meeting the refusal rule. Public clear-phone examples produced
weaker 0.48–0.50 scores and therefore review, not refusal. Cropped device
examples were also often missed. Do not describe this as reliable universal
phone/print detection. Deployment needs server-side calibration on representative
original labels and replay examples, keeping all private photos on the server.

Public evaluation sources, kept outside the repository:
- COCO128 public fixture archive from ultralytics/assets (original COCO images).
- Wikimedia Commons: Blackview A60 Smartphone Android mobile phone front face
  logged in screen.jpg (CC BY-SA 4.0).
- Wikimedia Commons: IPhone 6s, iPhone 8 plus and iPhone X.jpg (CC0).
- Wikimedia Commons: IPhone X with packaging and accessories.jpg (CC BY-SA 4.0).

Observed peak RSS was about 325 MiB. Proposed production isolation is a separate
private, read-only, non-root worker limited to 512 MiB RAM and 0.75 CPU, without
published ports or outbound networking; loopback proxy 127.0.0.1:8093. The video
identity worker must remain unchanged. Preparing the Docker/NGINX production
rollout was blocked by automatic approval review pending explicit owner approval.
No production photo service or new blocking policy has been deployed.
