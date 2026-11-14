import 'dart:async';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart' hide Text;
import '../widgets/uppercase_text.dart';
import '../data/api_client.dart';
import 'capture_cleanup.dart';
import 'identity_camera_frame.dart';
import 'identity_face_monitor.dart';
import 'identity_face_guide_model.dart';
import 'identity_voice.dart';
import 'identity_error_voice.dart';

const inspectorIdentityConsent = 'ersi-gbo-inspector-face-2026-11-v1';
const _actions = {
  'TURN_LEFT': 'Слегка поверните голову налево',
  'TURN_RIGHT': 'Слегка поверните голову направо',
  'LOOK_UP': 'Посмотрите вверх, слегка подняв голову',
  'OPEN_MOUTH': 'Откройте рот',
  'BLINK': 'Моргните один раз',
};

class InspectorIdentityPage extends StatefulWidget {
  const InspectorIdentityPage({super.key, required this.api});
  final ApiClient api;
  @override
  State<InspectorIdentityPage> createState() => _InspectorIdentityPageState();
}

class _InspectorIdentityPageState extends State<InspectorIdentityPage>
    with WidgetsBindingObserver {
  final _voice = IdentityVoice();
  final _monitor = IdentityFaceMonitor();
  CameraController? _camera;
  IdentityFaceSample _sample = IdentityFaceSample.unavailable;
  Map<String, dynamic>? _challenge;
  Timer? _timer;
  bool _consent = false,
      _busy = false,
      _recording = false,
      _cancelled = false,
      _enrolled = false;
  double _seconds = 0;
  int _countdown = 0;
  String _message = '', _cue = 'front';
  int get _duration => 2 + ((_challenge?['actions'] as List?)?.length ?? 2) * 6;
  String get _instruction {
    if (_countdown > 0) return 'Начинаем через $_countdown';
    if (!_recording) return 'Расположите лицо в овале';
    final phase = ((_seconds - 2) / 6).floor();
    final actions = _challenge?['actions'] as List? ?? [];
    if (_seconds < 2 || (_seconds - 2) % 6 >= 4 || phase >= actions.length) {
      return 'Смотрите прямо в камеру';
    }
    return _actions[actions[phase]] ?? 'Смотрите прямо в камеру';
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    _voice.dispose();
    unawaited(_monitor.dispose());
    unawaited(_camera?.dispose());
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden) {
      if (_recording) {
        _cancelled = true;
        unawaited(_finish(discard: true));
      } else if (_camera != null) {
        unawaited(_closeCamera());
      }
    }
  }

  Future<void> _closeCamera() async {
    final camera = _camera;
    _camera = null;
    await _monitor.stop();
    await camera?.dispose();
    if (mounted) setState(() {});
  }

  void _error(Object error) {
    if (!mounted) return;
    final message = error is ApiException
        ? error.message
        : error is CameraException
        ? 'Не удалось открыть камеру. Разрешите доступ к фронтальной камере и повторите.'
        : error.toString().replaceFirst('Bad state: ', '');
    setState(() => _message = message);
    if (!_cancelled) _voice.play(identityErrorCue(message));
  }

  Future<void> _prepare() async {
    if (!_consent || _busy) return;
    _voice.play('prepare');
    setState(() {
      _busy = true;
      _cancelled = false;
      _countdown = 0;
      _message = '';
    });
    try {
      final status = await widget.api.getJson('/auth/identity/status');
      if (!mounted) return;
      if (status['verified'] == true) {
        Navigator.of(context).pop(true);
        return;
      }
      _enrolled = status['enrolled'] == true;
      try {
        await _voice.warmup().timeout(const Duration(seconds: 10));
      } catch (_) {
        _voice.failed = true;
      }
      _challenge = await widget.api.postJson('/auth/identity/challenge', {
        'consentVersion': inspectorIdentityConsent,
      });
      await _closeCamera();
      if (!mounted || _cancelled) return;
      final devices = await availableCameras();
      if (devices.isEmpty) throw StateError('Камера не найдена');
      final device = devices.firstWhere(
        (v) => v.lensDirection == CameraLensDirection.front,
        orElse: () => devices.first,
      );
      final camera = CameraController(
        device,
        ResolutionPreset.high,
        enableAudio: false,
        fps: 30,
        videoBitrate: 1500000,
        imageFormatGroup: identityCameraFormat,
      );
      _camera = camera;
      await camera.initialize();
      if (!mounted || _cancelled) {
        await camera.dispose();
        return;
      }
      setState(() => _sample = IdentityFaceSample.unavailable);
      unawaited(
        _monitor.start(camera, (sample) {
          if (mounted) setState(() => _sample = sample);
        }),
      );
    } catch (error) {
      _error(error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _record() async {
    final camera = _camera;
    if (camera == null || _busy || _recording) return;
    _voice.play('ready');
    setState(() {
      _busy = true;
      _cancelled = false;
      _message = '';
    });
    try {
      final expires = DateTime.tryParse('${_challenge?['expiresAt']}');
      if (expires == null ||
          expires.difference(DateTime.now()).inSeconds < 45) {
        _challenge = await widget.api.postJson('/auth/identity/challenge', {
          'consentVersion': inspectorIdentityConsent,
        });
      }
      for (var n = 3; n > 0; n--) {
        if (!mounted || _camera != camera || _cancelled) return;
        setState(() => _countdown = n);
        await Future<void>.delayed(const Duration(seconds: 1));
      }
      if (!mounted || _camera != camera || _cancelled) return;
      setState(() => _countdown = 0);
      await _monitor.beforeRecording(camera);
      if (_monitor.usesCameraStream) {
        try {
          await camera.startVideoRecording(onAvailable: _monitor.process);
        } on CameraException {
          _sample = IdentityFaceSample.unavailable;
          if (!camera.value.isRecordingVideo) {
            await camera.startVideoRecording();
          }
        }
      } else {
        await camera.startVideoRecording();
      }
      if (!mounted || _cancelled) {
        await camera.dispose();
        return;
      }
      setState(() {
        _recording = true;
        _seconds = 0;
      });
      _cue = 'front';
      _voice.play('front');
      final clock = Stopwatch()..start();
      _timer = Timer.periodic(const Duration(milliseconds: 100), (_) {
        if (!mounted || !_recording) return;
        setState(() => _seconds = clock.elapsedMilliseconds / 1000);
        final actions = _challenge?['actions'] as List? ?? [];
        final phase = ((_seconds - 2) / 6).floor();
        final cue =
            _seconds < 2 || (_seconds - 2) % 6 >= 4 || phase >= actions.length
            ? 'front'
            : '${actions[phase]}';
        if (cue != _cue && _seconds < _duration) {
          _cue = cue;
          _voice.play(cue);
        }
        if (_seconds >= _duration) {
          _timer?.cancel();
          unawaited(_finish());
        }
      });
    } catch (error) {
      _error(error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _finish({bool discard = false}) async {
    if (!_recording) return;
    _timer?.cancel();
    _voice.stop();
    if (!discard) _voice.play('done');
    setState(() {
      _recording = false;
      _busy = true;
    });
    try {
      final camera = _camera!;
      await _monitor.stop();
      final file = await camera.stopVideoRecording();
      await camera.dispose();
      _camera = null;
      if (discard || _cancelled) {
        await deleteCapturedVideo(file.path);
        throw StateError(
          'Запись прервана. Оставайтесь на экране и повторите проверку.',
        );
      }
      final bytes = await file.readAsBytes();
      await deleteCapturedVideo(file.path);
      if (bytes.length > 16 * 1024 * 1024) {
        throw StateError(
          'Видео слишком большое. Повторите запись в обычном качестве.',
        );
      }
      if (!mounted) return;
      setState(
        () => _message =
            'Проверяем запись и совпадение лица. Это может занять около минуты.',
      );
      final c = _challenge!;
      Map<String, dynamic> result;
      try {
        result = await widget.api
            .postMultipart(
              '/auth/identity/${c['challengeId']}/video',
              fieldName: 'video',
              filename: file.name.isEmpty ? 'camera.mp4' : file.name,
              bytes: bytes,
              fields: {'challengeToken': '${c['challengeToken']}'},
            )
            .timeout(const Duration(seconds: 100));
      } on TimeoutException {
        result = {'status': 'PROCESSING'};
      }
      for (
        var attempt = 0;
        result['status'] == 'PROCESSING' && attempt < 15;
        attempt++
      ) {
        if (!mounted) return;
        await Future<void>.delayed(const Duration(seconds: 3));
        result = await widget.api.postJson('/auth/identity/challenge-status', {
          'challengeId': c['challengeId'],
          'challengeToken': c['challengeToken'],
        });
      }
      if (!mounted) return;
      if (result['status'] == 'VERIFIED') {
        Navigator.of(context).pop(true);
        return;
      }
      throw StateError(
        '${result['message'] ?? 'Не удалось завершить проверку. Повторите запись.'}',
      );
    } catch (error) {
      _error(error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: false,
    child: Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text('Видеопроверка инспектора'),
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    _enrolled
                        ? 'Подтвердите, что в аккаунт входите именно вы'
                        : 'Подтверждение личности инспектора',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Снимите себя на фронтальную камеру и выполните голосовые подсказки. В кадре должно быть одно лицо. Готовые видео и фотографии не принимаются.',
                  ),
                  if (_camera?.value.isInitialized == true) ...[
                    const SizedBox(height: 16),
                    IdentityCameraFrame(
                      camera: _camera!,
                      sample: _sample,
                      recording: _recording,
                      instruction: _instruction,
                    ),
                    if (_recording) ...[
                      const SizedBox(height: 8),
                      LinearProgressIndicator(
                        value: (_seconds / _duration).clamp(0, 1),
                      ),
                      Text('${_seconds.floor()} / $_duration сек.'),
                    ],
                  ],
                  if (!_recording && !_busy)
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      value: _consent,
                      onChanged: (v) => setState(() => _consent = v ?? false),
                      title: const Text(
                        'Согласен на обработку видеозаписи и биометрических данных для проверки владельца аккаунта инспектора.',
                      ),
                      subtitle: const Text(
                        'Первичная запись и зашифрованный эталон хранятся до удаления аккаунта или сброса администратором. Записи неуспешных попыток — до 7 дней. Новые успешные записи входа не сохраняются.',
                      ),
                    ),
                  if (_voice.failed)
                    const Text(
                      'Звуковые подсказки недоступны. Следуйте тексту на экране.',
                    ),
                  if (_voice.failed)
                    const Text(
                      'Звуковые подсказки недоступны. Следуйте тексту на экране.',
                    ),
                  if (_message.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Text(_message, semanticsLabel: _message),
                    ),
                  if (_busy) ...[
                    const LinearProgressIndicator(),
                    const SizedBox(height: 12),
                  ],
                  if (!_recording)
                    FilledButton(
                      onPressed: _busy || !_consent
                          ? null
                          : (_camera == null ? _prepare : _record),
                      child: Text(
                        _camera == null ? 'Открыть камеру' : 'Начать запись',
                      ),
                    ),
                  TextButton(
                    onPressed: _busy || _recording
                        ? null
                        : () {
                            Navigator.of(context).pop(false);
                          },
                    child: const Text('Выйти из аккаунта'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
