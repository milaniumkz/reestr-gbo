import 'dart:typed_data';

/// Reads encoded headers only. Never decodes a full camera photo just to check size.
({int width, int height})? encodedImageDimensions(Uint8List bytes) {
  final b = ByteData.sublistView(bytes);
  int be16(int p) => b.getUint16(p, Endian.big);
  int le16(int p) => b.getUint16(p, Endian.little);
  int le24(int p) => bytes[p] | bytes[p + 1] << 8 | bytes[p + 2] << 16;
  ({int width, int height})? size(int w, int h) =>
      w > 0 && h > 0 ? (width: w, height: h) : null;
  if (bytes.length >= 24 &&
      bytes[0] == 137 &&
      bytes[1] == 80 &&
      bytes[2] == 78 &&
      bytes[3] == 71) {
    return size(b.getUint32(16, Endian.big), b.getUint32(20, Endian.big));
  }
  if (bytes.length >= 10 && String.fromCharCodes(bytes.take(3)) == 'GIF') {
    return size(le16(6), le16(8));
  }
  if (bytes.length >= 30 &&
      String.fromCharCodes(bytes.take(4)) == 'RIFF' &&
      String.fromCharCodes(bytes.sublist(8, 12)) == 'WEBP') {
    final kind = String.fromCharCodes(bytes.sublist(12, 16));
    if (kind == 'VP8X') {
      return size(le24(24) + 1, le24(27) + 1);
    }
    if (kind == 'VP8 ' &&
        bytes[23] == 157 &&
        bytes[24] == 1 &&
        bytes[25] == 42) {
      return size(le16(26) & 16383, le16(28) & 16383);
    }
    if (kind == 'VP8L' && bytes[20] == 47) {
      final bits = b.getUint32(21, Endian.little);
      return size((bits & 16383) + 1, ((bits >> 14) & 16383) + 1);
    }
  }
  if (bytes.length >= 4 && bytes[0] == 255 && bytes[1] == 216) {
    var p = 2;
    while (p + 4 <= bytes.length) {
      if (bytes[p++] != 255) return null;
      while (p < bytes.length && bytes[p] == 255) {
        p++;
      }
      if (p >= bytes.length) return null;
      final marker = bytes[p++];
      if (marker == 217 || marker == 218) return null;
      if (marker == 216 || marker == 1 || (marker >= 208 && marker <= 215)) {
        continue;
      }
      if (p + 2 > bytes.length) return null;
      final length = be16(p);
      if (length < 2 || p + length > bytes.length) return null;
      if ([
            192,
            193,
            194,
            195,
            197,
            198,
            199,
            201,
            202,
            203,
            205,
            206,
            207,
          ].contains(marker) &&
          length >= 7) {
        return size(be16(p + 5), be16(p + 3));
      }
      p += length;
    }
  }
  return null;
}
