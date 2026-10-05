{{flutter_js}}
{{flutter_build_config}}

const buildVersion = Date.now().toString();
if (_flutter.buildConfig && Array.isArray(_flutter.buildConfig.builds)) {
  _flutter.buildConfig.builds = _flutter.buildConfig.builds.map((build) => {
    if (build && build.mainJsPath === 'main.dart.js') {
      return {...build, mainJsPath: 'main.dart.js?v=' + buildVersion};
    }
    return build;
  });
}

_flutter.loader.load();
