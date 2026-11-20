void setWebUpdateBusy(String source, bool busy) {}
void markWebChangesSaved() {}

void configureWebUpdates(
  Future<Map<String, dynamic>> Function(
    String action,
    Map<String, dynamic> payload,
  )?
  handler,
) {}
void setWebPushAvailable(bool available) {}

void checkWebRelease() {}
