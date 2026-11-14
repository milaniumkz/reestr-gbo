String identityErrorCue(String message) {
  final text = message.toLowerCase();
  if (text.contains('одно лицо') || text.contains('несколько лиц')) {
    return 'error_multiple';
  }
  if (text.contains('слишком мало кадров')) return 'error_frames';
  if (text.contains('прямо в камеру') || text.contains('нейтральн')) {
    return 'error_front';
  }
  if (text.contains('лицо') &&
      (text.contains('кадр') ||
          text.contains('видно') ||
          text.contains('далеко'))) {
    return 'error_position';
  }
  if (text.contains('размыто') || text.contains('чётких')) return 'error_blur';
  if (text.contains('морган')) return 'error_blink';
  if (text.contains('подбородок')) return 'error_chin';
  if (text.contains('открыть рот')) return 'error_mouth';
  if (text.contains('поворот головы') || text.contains('задания')) {
    return 'error_motion';
  }
  if (text.contains('подлинност') || text.contains('живое лицо')) {
    return 'error_light';
  }
  if (text.contains('камера не найдена')) return 'error_camera_missing';
  if (text.contains('камер')) return 'error_camera';
  if (text.contains('повтор ранее') || text.contains('уже использовал')) {
    return 'error_replay';
  }
  if (text.contains('лицо не совпад') ||
      text.contains('восстановить доступ') ||
      text.contains('восстановление не разрешено')) {
    return 'error_match';
  }
  if (text.contains('соединен') ||
      text.contains('соединён') ||
      text.contains('интернет') ||
      text.contains('сеть')) {
    return 'error_network';
  }
  if (text.contains('слишком много')) return 'error_wait';
  return 'retry';
}
