// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use
import 'dart:async';
import 'dart:html' as html;

// Remember the chosen camera only in this tab, including subsequent tag photos.
String? _preferredCameraId;

class BrowserCameraDevice {
  const BrowserCameraDevice(this.id, this.label);
  final String id;
  final String label;
}

/// Owns live browser camera streams, including switching and USB hot-plugging.
/// USB devices unavailable to getUserMedia cannot be opened by a website.
class BrowserCameraSession {
  BrowserCameraSession(this.devices, this.video, this.onChanged) {
    _deviceChange = devices.on['devicechange'].listen((_) {
      unawaited(refresh());
    });
  }

  final html.MediaDevices devices;
  final html.VideoElement video;
  final void Function() onChanged;
  List<BrowserCameraDevice> cameras = [];
  String? selectedId;
  String? error;
  bool opening = false;
  bool ready = false;
  bool _disposed = false;
  bool _enumerating = false;
  int _generation = 0;
  html.MediaStream? _stream;
  StreamSubscription<html.Event>? _deviceChange;
  final List<StreamSubscription<html.Event>> _ended = [];

  void _stopStream() {
    ready = false;
    for (final subscription in _ended) {
      unawaited(subscription.cancel());
    }
    _ended.clear();
    final stream = _stream;
    _stream = null;
    video.pause();
    video.srcObject = null;
    for (final track in stream?.getTracks() ?? <html.MediaStreamTrack>[]) {
      track.stop();
    }
  }

  Future<void> refresh({bool openIfIdle = false}) async {
    if (_disposed || _enumerating) return;
    _enumerating = true;
    try {
      final entries = await devices.enumerateDevices();
      if (_disposed) return;
      cameras = entries
          .whereType<html.MediaDeviceInfo>()
          .where(
            (item) =>
                item.kind == 'videoinput' && (item.deviceId ?? '').isNotEmpty,
          )
          .map((item) => BrowserCameraDevice(item.deviceId!, item.label ?? ''))
          .toList();
      if (!opening &&
          ready &&
          selectedId != null &&
          !cameras.any((item) => item.id == selectedId)) {
        _stopStream();
        error =
            'Камера отключена. Подключите её снова или выберите другую камеру.';
      }
    } catch (_) {
      if (!_disposed) {
        error = 'Не удалось обновить список камер. Попробуйте ещё раз.';
      }
    } finally {
      _enumerating = false;
      if (!_disposed) onChanged();
    }
    if (!_disposed && openIfIdle && !ready && !opening) {
      await open();
    }
  }

  Future<html.MediaStream> _request(String? id) => devices.getUserMedia({
    'audio': false,
    'video': {
      if (id == null) 'facingMode': {'ideal': 'environment'},
      if (id != null) 'deviceId': {'exact': id},
      'width': {'ideal': 1800},
    },
  });

  Future<void> open({String? deviceId}) async {
    if (_disposed || opening) return;
    final generation = ++_generation;
    opening = true;
    error = null;
    // Android often cannot open a second camera until the first is released.
    _stopStream();
    onChanged();
    html.MediaStream? candidate;
    try {
      try {
        candidate = await _request(deviceId ?? _preferredCameraId);
      } catch (failure) {
        final name = failure is html.DomException ? failure.name : '';
        if (deviceId == null &&
            _preferredCameraId != null &&
            (name.contains('NotFound') || name.contains('Overconstrained'))) {
          _preferredCameraId = null;
          candidate = await _request(null);
        } else {
          rethrow;
        }
      }
      if (_disposed || generation != _generation) return;
      _stream = candidate;
      final metadata = video.onLoadedMetadata.first.timeout(
        const Duration(seconds: 15),
      );
      video.srcObject = candidate;
      await metadata;
      if (_disposed || generation != _generation) return;
      await video.play();
      if (_disposed || generation != _generation) return;
      final tracks = List<html.MediaStreamTrack>.from(
        candidate.getVideoTracks(),
      );
      if (tracks.isEmpty || tracks.any((track) => track.readyState != 'live')) {
        throw StateError('Camera stream ended');
      }
      selectedId =
          tracks.first.getSettings()['deviceId']?.toString() ?? deviceId;
      _preferredCameraId = selectedId;
      for (final track in tracks) {
        _ended.add(
          track.onEnded.listen((_) {
            if (_disposed || !identical(_stream, candidate)) return;
            _generation++;
            opening = false;
            _stopStream();
            error =
                'Камера отключена. Подключите её снова или выберите другую камеру.';
            onChanged();
            unawaited(refresh());
          }),
        );
        try {
          await track
              .applyConstraints({
                'advanced': [
                  {'focusMode': 'continuous'},
                ],
              })
              .timeout(const Duration(milliseconds: 400));
        } catch (_) {
          // Many USB cameras have fixed focus and no focus controls.
        }
      }
      if (_disposed || generation != _generation) return;
      ready = true;
    } catch (failure) {
      if (!_disposed && generation == _generation) {
        _stopStream();
        error = browserCameraError(failure);
      }
    } finally {
      if (_disposed || generation != _generation) {
        // Permission prompts may resolve after the dialog has been cancelled.
        for (final track
            in candidate?.getTracks() ?? <html.MediaStreamTrack>[]) {
          track.stop();
        }
      } else {
        opening = false;
        onChanged();
        await refresh();
      }
    }
  }

  Future<void> dispose() async {
    _disposed = true;
    _generation++;
    await _deviceChange?.cancel();
    _stopStream();
  }
}

String browserCameraError(Object error) {
  final name = error is html.DomException ? error.name : error.toString();
  if (name.contains('NotAllowed') || name.contains('PermissionDenied')) {
    return 'Разрешите камеру в браузере: нажмите значок слева от адреса сайта, включите доступ к камере и повторите съёмку';
  }
  if (name.contains('NotFound') ||
      name.contains('DevicesNotFound') ||
      name.contains('Overconstrained')) {
    return 'Камера недоступна браузеру. Проверьте подключение и нажмите «Обновить камеры».';
  }
  return 'Не удалось открыть камеру. Закройте другие приложения с камерой, проверьте разрешение браузера и повторите съёмку';
}
