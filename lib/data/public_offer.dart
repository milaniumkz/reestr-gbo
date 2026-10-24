import 'app_environment.dart';

const publicOfferVersion = 'offer-ru-v1';
Uri get publicOfferUri => Uri.parse(
  '${AppEnvironment.apiBaseUrl.replaceFirst(RegExp(r'/api/v1/?$'), '')}/legal/offer-ru-v1.html',
);
