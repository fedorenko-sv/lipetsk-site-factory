-- 001_core.sql — базовые таблицы Core A (PR3, §10).
-- Выполняется мигратором в одной транзакции, ровно один раз.
-- Runtime-роль получает только DML (см. docs/runbooks/backend.md).

CREATE TABLE leads (
  id uuid PRIMARY KEY,
  site_key text NOT NULL CHECK (char_length(site_key) BETWEEN 1 AND 40),
  config_version text NOT NULL,
  kind text NOT NULL CHECK (kind = 'booking'),
  service_id text NOT NULL,
  resource_id text,
  service_options jsonb NOT NULL,
  preferred_at timestamptz,
  timezone text NOT NULL DEFAULT 'Europe/Moscow',
  customer_phone text NOT NULL,
  customer_name text,
  consent_version text NOT NULL,
  consent_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status = 'new'),
  price_snapshot jsonb NOT NULL,
  attribution jsonb,
  idempotency_key uuid NOT NULL,
  payload_hmac text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leads_site_key_unique UNIQUE (site_key, idempotency_key)
);

CREATE INDEX leads_site_created_idx ON leads (site_key, created_at DESC);

CREATE TABLE notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL UNIQUE REFERENCES leads (id) ON DELETE CASCADE,
  site_key text NOT NULL,
  adapter_id text NOT NULL,
  destination_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'dead')),
  attempts int NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 8),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  claim_token text,
  last_error_code text CHECK (last_error_code IS NULL OR char_length(last_error_code) <= 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Готовая к обработке очередь: claim выбирает по status/next_attempt_at.
CREATE INDEX outbox_ready_idx ON notification_outbox (status, next_attempt_at);
CREATE INDEX outbox_lead_idx ON notification_outbox (lead_id);

CREATE TABLE notification_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL UNIQUE REFERENCES notification_outbox (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  site_key text NOT NULL,
  destination_key text NOT NULL,
  adapter_id text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX receipts_lead_idx ON notification_receipts (lead_id);

-- Персистентные лимиты (фиксированные окна). Исходный IP не хранится:
-- key_hmac = HMAC(site|site+client). scope задан явно.
CREATE TABLE rate_limits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope text NOT NULL CHECK (scope IN ('site', 'site_client')),
  key_hmac text NOT NULL,
  window_start timestamptz NOT NULL,
  count int NOT NULL CHECK (count >= 0),
  expires_at timestamptz NOT NULL,
  CONSTRAINT rate_limits_bucket_unique UNIQUE (scope, key_hmac, window_start)
);

CREATE INDEX rate_limits_expires_idx ON rate_limits (expires_at);
