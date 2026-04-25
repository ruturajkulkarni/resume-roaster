import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Returns a Supabase client only when both env vars are present.
// This lets the app run without Supabase — roasting still works,
// history is just hidden.
function makeClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export const supabase = makeClient();

export interface HistoryItem {
  id: number;
  created_at: string;
  roast_response: {
    roast: string;
    score: {
      overall: number;
      breakdown: {
        clarity: number;
        impact: number;
        formatting: number;
        keywords: number;
        ats: number;
      };
    };
    improvements: {
      number: number;
      title: string;
      before: string;
      after: string;
    }[];
    vibe: string;
  };
}
