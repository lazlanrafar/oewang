import 'package:oewang/config/env.dart';

/// Privacy Policy / Terms of Service URLs, built from [EnvConfig.websiteUrl]
/// so they follow the marketing site without a code change.
String privacyPolicyUrl(EnvConfig env) => '${env.websiteUrl}/en/policy';

String termsOfServiceUrl(EnvConfig env) => '${env.websiteUrl}/en/terms';
