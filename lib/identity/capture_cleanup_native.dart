import 'dart:io';

Future<void> deleteCapturedVideo(String path) async {
  try {
    await File(path).delete();
  } catch (_) {
    /* Temporary cache is also reclaimed by the OS. */
  }
}
