import 'dart:js_interop';

@JS('ersiSessionRefreshLock')
external JSPromise<JSAny?> _run(JSFunction callback);
Future<T> withSessionRefreshLock<T>(Future<T> Function() action) async {
  var invoked = false;
  late T result;
  Object? failure;
  StackTrace? trace;
  try {
    await _run(
      ((JSAny? _) {
        Future<JSAny?> execute() async {
          invoked = true;
          try {
            result = await action();
          } catch (error, stack) {
            failure = error;
            trace = stack;
          }
          return null;
        }

        return execute().toJS;
      }).toJS,
    ).toDart;
  } catch (_) {
    // Older browsers without Web Locks keep the existing single-client path.
    if (!invoked) return action();
    rethrow;
  }
  final problem = failure;
  if (problem != null) {
    Error.throwWithStackTrace(problem, trace ?? StackTrace.current);
  }
  return result;
}
