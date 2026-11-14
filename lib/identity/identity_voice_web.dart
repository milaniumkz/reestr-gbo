import 'dart:convert';
import 'package:flutter/services.dart';
import 'dart:js_interop';
import 'package:web/web.dart' as web;

class IdentityVoice {
  final Map<String, String> _cached = {};
  Future<void> warmup() async {
    for (final cue in [
      'prepare',
      'ready',
      'front',
      'done',
      'TURN_LEFT',
      'TURN_RIGHT',
      'LOOK_UP',
      'OPEN_MOUTH',
      'BLINK',
    ]) {
      final bytes = await rootBundle.load('assets/sounds/identity/$cue.wav');
      _cached[cue] =
          'data:audio/wav;base64,${base64Encode(bytes.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes))}';
    }
  }

  final web.HTMLAudioElement _audio = web.HTMLAudioElement()
    ..src = Uri.base
        .resolve('assets/assets/sounds/identity/prepare.wav')
        .toString()
    ..preload = 'auto';
  bool muted = false;
  bool failed = false;
  void play(String cue) {
    if (muted) return;
    _audio.pause();
    _audio.src =
        _cached[cue] ??
        Uri.base.resolve('assets/assets/sounds/identity/$cue.wav').toString();
    // Called directly from the initial button gesture to unlock iOS audio.
    _audio
        .play()
        .toDart
        .then((_) {
          failed = false;
        })
        .catchError((Object _) {
          failed = true;
        });
  }

  void stop() {
    _audio.pause();
  }

  void dispose() {
    _audio.pause();
    _audio.removeAttribute('src');
    _audio.load();
  }
}
