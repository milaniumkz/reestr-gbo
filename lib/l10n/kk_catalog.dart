import 'kk_messages.dart';

final _upper = {
  for (final entry in kazakhMessages.entries)
    entry.key.trim().toUpperCase(): entry.value,
};
String translateKazakh(String source, String language) {
  if (language != 'kk') return source;
  source = source.replaceAll(r'\n', '\n');
  final exact = kazakhMessages[source] ?? _upper[source.trim().toUpperCase()];
  if (exact != null) return exact;
  for (final template in _templates) {
    final translated = template.match(source);
    if (translated != null) return translated;
  }
  // Composite labels keep inserted user values unchanged.
  for (final separator in ['\n', ' · ', ': ', '; ', ', ']) {
    if (source.contains(separator)) {
      final parts = source.split(separator);
      final translated = parts
          .map((part) => translateKazakh(part, language))
          .join(separator);
      if (translated != source) return translated;
    }
  }
  return source;
}

final _templates = kazakhMessages.entries
    .where((entry) => entry.key.contains(r'$'))
    .map((entry) => _MessageTemplate(entry.key, entry.value))
    .toList();

class _MessageTemplate {
  _MessageTemplate(this.source, this.target) {
    final token = RegExp(r'\$\{[^}]+\}|\$[a-zA-Z_]\w*');
    var offset = 0;
    final pattern = StringBuffer('^');
    for (final match in token.allMatches(source)) {
      pattern.write(RegExp.escape(source.substring(offset, match.start)));
      pattern.write('(.*?)');
      tokens.add(match.group(0)!);
      offset = match.end;
    }
    pattern.write(RegExp.escape(source.substring(offset)));
    pattern.write(r'$');
    regex = RegExp(pattern.toString(), dotAll: true, caseSensitive: false);
  }
  final String source, target;
  final tokens = <String>[];
  late final RegExp regex;
  String? match(String text) {
    final found = regex.firstMatch(text);
    if (found == null) return null;
    var result = target;
    for (var i = 0; i < tokens.length; i++) {
      final captured = found.group(i + 1) ?? '';
      final isInterfaceList =
          source.startsWith('Заполните') ||
          source.startsWith('Не хватает') ||
          source.startsWith('Ошибка') ||
          source.contains('must be') ||
          source.contains('should not');
      result = result.replaceAll(
        tokens[i],
        isInterfaceList ? translateKazakh(captured, 'kk') : captured,
      );
    }
    return result;
  }
}
