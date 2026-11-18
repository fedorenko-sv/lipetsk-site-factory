-- Core B reuses the same atomic lead/outbox transaction.
ALTER TABLE leads DROP CONSTRAINT leads_kind_check;
ALTER TABLE leads ADD CONSTRAINT leads_kind_check CHECK (kind IN ('booking', 'estimate'));
