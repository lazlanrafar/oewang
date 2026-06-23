import 'package:oewang/core/result/app_error.dart';
import 'package:oewang/core/result/result.dart';
import 'package:oewang/domain/models/contact.dart';

abstract class ContactsRepository {
  Future<Result<List<Contact>, AppError>> list({String? search});
  Future<Result<Contact, AppError>> create({required String name});
}
