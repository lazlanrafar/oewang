import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:oewang/data/services/api/owe1/owe1_protocol.dart';
import 'package:oewang/data/services/api/owe1/owe1_session.dart';
import 'package:oewang/data/services/api/owe1/owe1_stream.dart';

/// Seals every request and opens every response (D113, MOB-2).
///
/// The query string never goes on the URL: it travels sealed in
/// `X-Owe-Query`, required even when empty so a stripped filter cannot pass
/// unnoticed. `CRYPTO_SESSION_UNKNOWN` (an API restart, or a session past its
/// 24 hours) and `CRYPTO_CLOCK_SKEW` run one new handshake and one retry.
///
/// Must be added before the auth interceptor: Dio runs error handlers in the
/// order interceptors were added, and the auth interceptor needs the opened
/// envelope to read the error code.
class Owe1Interceptor extends Interceptor {
  Owe1Interceptor({required this.sessions, required this.dio});

  final Owe1SessionStore sessions;

  /// The Dio this interceptor is on, for the single retry.
  final Dio dio;

  static const transportErrorHeader = 'x-owe-transport-error';
  static const _session = 'owe1.session';
  static const _requestId = 'owe1.request_id';
  static const _plainBody = 'owe1.body';
  static const _plainQuery = 'owe1.query';
  static const _retried = 'owe1.retried';

  /// Set in `Options.extra` for a `text/event-stream` answer: the body is
  /// left as bytes and opened event by event by [openEventStream].
  static const streamKey = 'owe1.stream';

  /// The opened frames of a stream response from this interceptor.
  static Stream<SseFrame> openEventStream(Response<dynamic> response) {
    final body = response.data;
    if (body is! ResponseBody) {
      throw const Owe1Exception('TRANSPORT_UNEXPECTED_RESPONSE');
    }
    final options = response.requestOptions;
    final session = options.extra[_session] as Owe1Session;
    return openEvents(
      body.stream,
      key: session.keys.serverToClient,
      sessionId: session.id,
      requestId: options.extra[_requestId] as String,
    );
  }

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    try {
      final session = await sessions.current();

      // The caller's plaintext is kept so a retry seals it again under a new
      // request id; `options.data` is replaced by the sealed form below.
      final body = options.extra.putIfAbsent(_plainBody, () => options.data);
      final query =
          options.extra.putIfAbsent(
                _plainQuery,
                () => encodeQuery(options.queryParameters),
              )
              as String;
      options.queryParameters = {};

      final method = options.method.toUpperCase();
      final path = options.uri.path;
      final requestId = newRequestId();
      final timestamp = session.serverNow();
      final key = session.keys.clientToServer;

      options.headers.addAll({
        'x-owe-session': session.id,
        'x-owe-request-id': requestId,
        'x-owe-timestamp': '$timestamp',
        'x-owe-query': await sealField(
          key,
          aadQuery(session.id, method, path, requestId, timestamp),
          utf8.encode(query),
        ),
      });
      options
        ..data = body == null
            ? null
            : jsonEncode(
                (await seal(
                  key,
                  aadRequest(session.id, method, path, requestId, timestamp),
                  utf8.encode(jsonEncode(body)),
                )).toJson(),
              )
        ..contentType = owe1ContentType
        ..responseType = options.extra[streamKey] == true
            ? ResponseType.stream
            : ResponseType.plain
        ..extra[_session] = session
        ..extra[_requestId] = requestId;
      handler.next(options);
    } on DioException catch (e) {
      handler.reject(e);
    } on Object catch (e, st) {
      handler.reject(
        DioException(requestOptions: options, error: e, stackTrace: st),
      );
    }
  }

  @override
  Future<void> onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) async {
    try {
      final isEventStream =
          response.requestOptions.extra[streamKey] == true &&
          (response.headers.value(Headers.contentTypeHeader) ?? '').contains(
            'text/event-stream',
          );
      if (!isEventStream) response.data = await _open(response);
      handler.next(response);
    } on Object catch (e, st) {
      handler.reject(
        DioException(
          requestOptions: response.requestOptions,
          response: response,
          error: e,
          stackTrace: st,
        ),
        true,
      );
    }
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final response = err.response;
    if (response == null || err.error is Owe1Exception) {
      return handler.next(err);
    }
    try {
      response.data = await _open(response);
    } on Object catch (e, st) {
      return handler.next(err.copyWith(error: e, stackTrace: st));
    }

    final options = err.requestOptions;
    final code = errorCode(response.data);
    if ((code == 'CRYPTO_SESSION_UNKNOWN' || code == 'CRYPTO_CLOCK_SKEW') &&
        options.extra[_retried] != true) {
      final stale = options.extra[_session];
      if (stale is Owe1Session) sessions.reset(stale);
      options.extra[_retried] = true;
      try {
        handler.resolve(await dio.fetch<dynamic>(options));
      } on DioException catch (e) {
        handler.reject(e);
      }
      return;
    }
    handler.next(err);
  }

  /// The envelope as JSON, or null for an empty answer (a `204`).
  Future<Object?> _open(Response<dynamic> response) async {
    var raw = response.data;
    // A stream request answered with an envelope (a refusal before the
    // stream opened): read it whole and open it like any other.
    if (raw is ResponseBody) {
      raw = await utf8.decodeStream(raw.stream.cast<List<int>>());
    }
    if (response.statusCode == 204 || raw == null || raw == '') return null;
    if (raw is! String) throw const Owe1Exception('unexpected body type');

    final Object? parsed;
    try {
      parsed = jsonDecode(raw);
    } on FormatException {
      // An HTML 502 from a proxy, for example.
      throw const Owe1Exception('TRANSPORT_UNEXPECTED_RESPONSE');
    }

    if (parsed is Map<String, dynamic> &&
        parsed['n'] is String &&
        parsed['c'] is String) {
      final session = response.requestOptions.extra[_session] as Owe1Session;
      final requestId = response.requestOptions.extra[_requestId] as String;
      final plain = await open(
        session.keys.serverToClient,
        aadResponse(session.id, requestId, response.statusCode ?? 0),
        SealedBody.fromJson(parsed),
      );
      return jsonDecode(utf8.decode(plain));
    }

    // Only a transport error answers in plaintext: the caller may hold no
    // working key. Anything else unsealed is refused rather than believed.
    if (response.headers.value(transportErrorHeader) != null) return parsed;
    throw const Owe1Exception('refusing an unsealed response');
  }
}

/// `envelope.error.code`, or null.
String? errorCode(Object? envelope) {
  if (envelope is! Map) return null;
  final error = envelope['error'];
  return error is Map ? error['code'] as String? : null;
}

/// A query map to the raw query string the API reads. A list value repeats
/// its key (`wallet_id=a&wallet_id=b`); a null value is dropped.
String encodeQuery(Map<String, dynamic> params) {
  final pairs = <String>[];
  params.forEach((key, value) {
    if (value == null) return;
    final values = value is Iterable ? value : [value];
    for (final v in values) {
      if (v == null) continue;
      pairs.add(
        '${Uri.encodeQueryComponent(key)}=${Uri.encodeQueryComponent('$v')}',
      );
    }
  });
  return pairs.join('&');
}
