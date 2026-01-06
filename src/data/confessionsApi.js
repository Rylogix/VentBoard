import { supabase, configError } from "./supabase.js";

const TABLE = "confessions";
const PAGE_SIZE = 12;

export function getConfigError() {
  return configError;
}

export function getPageSize() {
  return PAGE_SIZE;
}

export async function fetchConfessions({ offset = 0, limit = PAGE_SIZE } = {}) {
  if (!supabase) {
    return { data: [], error: new Error(configError) };
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select("id, content, created_at, visibility")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  return { data: data || [], error };
}

export async function createConfession({ content, visibility }) {
  if (!supabase) {
    return { data: null, error: new Error(configError) };
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({ content, visibility })
    .select("id, content, created_at, visibility")
    .single();

  return { data, error };
}
