import 'package:oewang/config/env.dart';

/// Privacy Policy / Terms of Service URLs, built from [EnvConfig.appUrl]
/// (docs/features/mobile.md#configuration) so they follow the web app.
String privacyPolicyUrl(EnvConfig env) => '${env.appUrl}/privacy';

String termsOfServiceUrl(EnvConfig env) => '${env.appUrl}/terms';
