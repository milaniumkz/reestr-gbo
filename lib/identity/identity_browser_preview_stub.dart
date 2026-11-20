class IdentityBrowserPreview {
  IdentityBrowserPreview({
    required void Function() onStart,
    required void Function() onCancel,
  });
  bool get enabled => false;
  void show(Map<String, dynamic> state) {}
  void hide() {}
}
