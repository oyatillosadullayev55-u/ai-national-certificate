/// API manzili: `flutter run --dart-define=API_URL=https://api.example.uz/api/v1`
/// Standart qiymat Android emulyatori uchun (10.0.2.2 = kompyuterning localhost'i).
class AppConfig {
  static const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:3000/api/v1');
}
