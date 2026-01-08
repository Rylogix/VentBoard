import { supabase, configError } from "./supabase.js";

const TABLE = "confession_replies";

export async function fetchRepliesByConfession(confessionId, { offset = 0, limit } = {}) {
  if (!supabase) {
    return { data: [], error: new Error(configError) };
  }

  if (!confessionId) {
    return { data: [], error: new Error("Confession id missing.") };
  }

  let query = supabase
    .from(TABLE)
    .select("id, confession_id, content, reply_name, created_at, user_id")
    .eq("confession_id", confessionId)
    .order("created_at", { ascending: false });

  if (typeof limit === "number") {
    query = query.range(offset, offset + limit - 1);
  }

  const { data, error } = await query;

  return { data: data || [], error };
}

export async function createReply(payload) {
  if (!supabase) {
    return { data: null, error: new Error(configError) };
  }

  if (!payload || !payload.confession_id) {
    return { data: null, error: new Error("Confession id missing.") };
  }

  if (!payload.content) {
    return { data: null, error: new Error("Reply content missing.") };
  }

  if (!payload.user_id) {
    return { data: null, error: new Error("Anonymous session not ready.") };
  }

  const insertPayload = {
    confession_id: payload.confession_id,
    content: payload.content,
    user_id: payload.user_id,
  };
  if (payload.reply_name) {
    insertPayload.reply_name = payload.reply_name;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert(insertPayload)
    .select("id, confession_id, content, reply_name, created_at, user_id")
    .single();

  return { data, error };
}
