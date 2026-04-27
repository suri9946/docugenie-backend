-- DocuGenie Payments Table Schema

CREATE TABLE IF NOT EXISTS payments (
  payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id TEXT NOT NULL,
  user_id TEXT,
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'INR',
  upi_txn_ref TEXT UNIQUE NOT NULL,
  upi_provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  verified BOOLEAN DEFAULT false,
  merchant_upi TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP,
  expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
  metadata JSONB,
  
  CONSTRAINT valid_status CHECK (status IN ('pending', 'success', 'failed', 'cancelled'))
);

-- Indexes for fast queries
CREATE INDEX idx_payments_document_id ON payments(document_id);
CREATE INDEX idx_payments_upi_txn_ref ON payments(upi_txn_ref);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);

-- Ensure RLS is enabled
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow read access
CREATE POLICY "Allow read payments" ON payments
  FOR SELECT USING (true);

-- RLS Policy: Allow insert for new payments
CREATE POLICY "Allow insert payments" ON payments
  FOR INSERT WITH CHECK (true);

-- RLS Policy: Allow update for payment verification
CREATE POLICY "Allow update payments" ON payments
  FOR UPDATE USING (true) WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE payments IS 'Stores UPI payment transactions for DocuGenie documents';
COMMENT ON COLUMN payments.upi_txn_ref IS 'UPI transaction reference - used to track and verify payments';
COMMENT ON COLUMN payments.status IS 'Payment status: pending, success, failed, or cancelled';
COMMENT ON COLUMN payments.verified IS 'Whether payment has been verified and document is unlocked';
