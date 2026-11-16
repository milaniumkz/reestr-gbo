Future<T> withSessionRefreshLock<T>(Future<T> Function() action) => action();
