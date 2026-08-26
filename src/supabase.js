import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  "https://cyogbvpmezahezorrzhz.supabase.co";

const supabaseKey =
  "sb_publishable_x6xpsjfuKDd26nYxOnU6aA_y3TCss6F";

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
);