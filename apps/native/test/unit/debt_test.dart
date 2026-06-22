import 'package:flutter_test/flutter_test.dart';
import 'package:oewang/domain/models/debt.dart';
import 'package:oewang/domain/models/money.dart';

void main() {
  Debt debt({
    required DebtType type,
    num amount = 1000,
    num remaining = 1000,
    DebtStatus status = DebtStatus.unpaid,
    DateTime? due,
  }) => Debt(
    id: 'd',
    contactId: 'c',
    contactName: 'Budi',
    type: type,
    amount: Money(amount: amount),
    remainingAmount: Money(amount: remaining),
    status: status,
    dueDate: due,
  );

  group('wire enums', () {
    test('DebtType round-trips', () {
      expect(DebtType.fromWire('payable'), DebtType.payable);
      expect(DebtType.fromWire('receivable'), DebtType.receivable);
      expect(DebtType.payable.wire, 'payable');
    });

    test('DebtStatus maps known values, defaults to unpaid', () {
      expect(DebtStatus.fromWire('paid'), DebtStatus.paid);
      expect(DebtStatus.fromWire('partial'), DebtStatus.partial);
      expect(DebtStatus.fromWire('garbage'), DebtStatus.unpaid);
    });
  });

  group('DebtTotals.fromDebts', () {
    test('splits remaining by type and nets them', () {
      final totals = DebtTotals.fromDebts([
        debt(type: DebtType.receivable, remaining: 700),
        debt(type: DebtType.receivable, remaining: 300),
        debt(type: DebtType.payable, remaining: 400),
      ]);
      expect(totals.owedToYou.amount, 1000);
      expect(totals.youOwe.amount, 400);
      expect(totals.net.amount, 600);
    });
  });

  group('isOverdue', () {
    final now = DateTime(2026, 6, 22);

    test('true when past due and unpaid', () {
      final d = debt(type: DebtType.payable, due: DateTime(2026, 6, 1));
      expect(d.isOverdue(now), isTrue);
    });

    test('false when paid, even if past due', () {
      final d = debt(
        type: DebtType.payable,
        remaining: 0,
        status: DebtStatus.paid,
        due: DateTime(2026, 6, 1),
      );
      expect(d.isOverdue(now), isFalse);
    });

    test('false when no due date', () {
      expect(debt(type: DebtType.payable).isOverdue(now), isFalse);
    });
  });
}
