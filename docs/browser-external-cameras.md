# External cameras for inspection photos in the browser

The framed camera used for cylinder-tag photos lists all `videoinput` devices
exposed by `navigator.mediaDevices.enumerateDevices()` after camera permission.
Choose a camera by its browser-provided name. Refresh the list after plugging in
an endoscope; browsers supporting `devicechange` also refresh it automatically.
The chosen camera is remembered in memory for subsequent photos in the same tab.
A missing remembered camera falls back to the phone camera when a new dialog opens.

Switching releases the old stream before requesting an exact device ID. Capture
is blocked until the new live preview is ready and after a camera is unplugged.
Errors leave the picker and retry button available. Cancelling while permission
or switching is pending stops streams that arrive after the dialog closes.
Framed capture, inspection geolocation, document alignment and server upload checks remain in place.

## Android with a wired USB endoscope

The phone must support the USB/OTG device, and Android must expose the device to
the browser's camera API. A website cannot install an Android USB/UVC driver or
use WebUSB to bypass protected video-class interfaces. A USB camera working in
an endoscope manufacturer's app does not prove it is available to Chrome.
No physical AIZER H408A unit has been tested; compatibility must be checked on
the actual phone. The same picker supports other browser-visible external
cameras and virtual cameras. It does not discover proprietary USB protocols,
RTSP streams or cameras available only inside another app.

## Browser regression checks

Compile the real camera overlay in a small harness (Flutter/Dart dependencies
must already be installed):

```sh
mkdir -p /tmp/ersi-camera-browser
dart compile js --packages=.dart_tool/package_config.json scripts/browser/camera_harness.dart -o /tmp/ersi-camera-browser/harness.js
printf '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><script defer src="harness.js"></script>' > /tmp/ersi-camera-browser/index.html
python3 -m http.server 8084 --bind 127.0.0.1 --directory /tmp/ersi-camera-browser
```

With Playwright and Chromium installed, run in another terminal:

```sh
node scripts/browser/camera.test.cjs
```

`PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` and `CAMERA_TEST_URL` override their defaults.
Checks use real canvas-backed MediaStreams with distinct phone/endoscope pixels,
synthetic device enumeration, fixed-focus and busy-camera failures, disconnects,
permission retry, delayed stream cleanup, crop output and Russian/Kazakh controls.
They validate browser behavior, not compatibility of a particular physical USB unit.


## Inspection photo review

All inspection camera actions (including automatic document capture, first/second cylinder labels, passports and work records) pass their captured file through `capturePhotoWithPreview` before storing or uploading it. The entire captured image is shown with zoom, confirmation and retake controls. The camera implementation closes its stream before this review. Retake opens capture again, retaining the browser camera preference; closing the review cancels the operation and leaves the previous form photo untouched. No file is returned until explicit confirmation, and undecodable images cannot be confirmed. The preview evicts its full-resolution image cache entry on close. Existing framing/cropping and server checks remain in force. The raw-camera browser harness tests camera operation separately; widget tests cover confirmation, repeated capture, cancellation, undecodable files and narrow-screen controls.


## Photo resolution and phone-camera processing

Framed capture requests a 4096×3072 video stream using ideal constraints, then uses `ImageCapture.takePhoto` on the selected live track where supported. It negotiates maximum still dimensions within the existing 40 MP decoder limit; larger sensors use their normal device-selected mode. Unsupported cameras fall back to the actual negotiated video dimensions. The camera image is never enlarged to invent detail. The frame is mapped through the centred video field of view when still/photo aspect ratios differ. Output is cropped at its source pixel dimensions, without the former 2200-pixel cap, and JPEG quality starts at 0.96 instead of 0.82. JPEG quality is reduced only to satisfy the existing 12 MiB upload limit; oversize files are refused rather than silently downscaled. Temporary full-resolution canvases and Blob URLs are released. Automatic capture is paused during still capture and revalidates the frozen image, avoiding both duplicate captures and stale stability timers.

Mobile browsers additionally offer «Камера телефона — оригинал». This opens an OS camera capture input (`capture=environment`), releases the browser camera first, and returns the original camera file without cropping or recompression through the existing photo preview. The system decides which camera UI and processing are used; the web app cannot reproduce proprietary HDR/night processing itself or attest file provenance. Browser/OS capture-input behavior varies. Size/dimension limits and existing server review still apply. Cancelling native capture resumes the browser preview. No Android package or external image service is involved.

Browser regression checks additionally verify a genuine larger still image rather than an upscaled video frame, device selection, aspect-ratio mapping, JPEG quality, fallback, cancellation during capture, and byte-identical original-file handling for the OS camera path. These use synthetic streams/files; device-specific optical/processing quality needs checking on the actual phone.


### Mobile default

On Android/iPhone/iPad/iPod user agents, the normal inspection camera action now directly requests the OS rear camera via an image input with `capture=environment`. It does not open the browser camera overlay, start a video stream, crop or encode the original. Preview/retake still gates attachment/upload. Geolocation is read after accepting the photo so the initial camera click retains its user activation and opens immediately. Desktop browsers retain framed camera capture. Browser/OS implementations ultimately decide the file-input camera UI. The harness uses the raw framed capture explicitly for its USB tests and `?native=true` for the production mobile picker path.
