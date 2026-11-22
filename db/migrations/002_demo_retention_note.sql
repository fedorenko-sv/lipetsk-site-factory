-- 002_demo_retention_note.sql — второй прогон миграций для проверки
-- идемпотентности мигратора (BI01): отдельная транзакция, применяется один раз.
-- Комментарий-версия без изменения данных.

COMMENT ON TABLE notification_receipts IS
  'Demo recording receipts. Synthetic data only; removed by cascade on lead retention purge.';
