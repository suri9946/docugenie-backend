-- docugenie_schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: users
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT UNIQUE NOT NULL,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: documents
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id TEXT UNIQUE NOT NULL,
  title TEXT,
  subject TEXT,
  style TEXT,
  mode TEXT,
  target_pages INTEGER,
  is_locked BOOLEAN DEFAULT true,
  paid BOOLEAN DEFAULT false,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: payments
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id TEXT UNIQUE, -- can be null if not completed
  upi_txn_ref TEXT UNIQUE NOT NULL, -- generated internal ref DOC_XXXX
  document_id TEXT NOT NULL REFERENCES public.documents(document_id) ON DELETE CASCADE,
  user_session_id TEXT, -- tracking user context or session
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'INR',
  status TEXT DEFAULT 'pending', -- pending, success, failed
  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMP WITH TIME ZONE,
  upi_provider TEXT NOT NULL, -- google_pay, phonepe, paytm, generic
  merchant_upi TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: generated_files
CREATE TABLE IF NOT EXISTS public.generated_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id TEXT NOT NULL REFERENCES public.documents(document_id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_files ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service Role Full Access Users" ON public.users USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access Documents" ON public.documents USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access Payments" ON public.payments USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access Files" ON public.generated_files USING (true) WITH CHECK (true);
