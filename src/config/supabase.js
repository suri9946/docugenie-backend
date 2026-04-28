const { createClient } = require("@supabase/supabase-js");

let supabase = null;

if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
  );
}

module.exports = {
  supabase,
  isSupabaseConfigured: Boolean(supabase),
};

