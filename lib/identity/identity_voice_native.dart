import 'dart:async';
import 'package:audioplayers/audioplayers.dart';

class IdentityVoice {
  AudioPlayer? _player;
  int _generation = 0;
  Future<void> warmup() async {}
  bool muted = false;
  bool failed = false;
  void play(String cue) {
    if (muted) return;
    unawaited(_play(cue, ++_generation));
  }

  Future<void> _play(String cue, int generation) async {
    try {
      final player = _player ??= AudioPlayer();
      await player.stop().timeout(const Duration(seconds: 2));
      if (generation != _generation) return;
      await player
          .play(AssetSource('sounds/identity/$cue.wav'))
          .timeout(const Duration(seconds: 2));
      failed = false;
    } catch (_) {
      failed = true;
    }
  }

  void stop() {
    _generation++;
    unawaited(_player?.stop().catchError((_) {}));
  }

  void dispose() {
    _generation++;
    unawaited(_player?.dispose().catchError((_) {}));
  }
}
