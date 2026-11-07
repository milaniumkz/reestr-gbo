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
No gallery upload or photo-validation bypass is added. Existing frame cropping,
inspection geolocation, document alignment and upload checks remain in place.

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
