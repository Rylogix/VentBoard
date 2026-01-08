import { supabase, configError } from "./supabase.js";

const TABLE = "confession_replies";
let nameColumnCache;
let nameColumnPromise;

function isMissingColumnError(error) {
  const message = (error && error.message ? error.message : "").toLowerCase();
  return message.includes("column") && message.includes("does not exist");
}

async function resolveNameColumn() {
  if (nameColumnCache !== undefined) {
    return { column: nameColumnCache, error: null };
  }
  if (nameColumnPromise) {
    return nameColumnPromise;
  }

  nameColumnPromise = (async () => {
    const { error: nameError } = await supabase.from(TABLE).select("name", { head: true, count: "exact" }).limit(1);

    if (!nameError) {
      nameColumnCache = "name";
      return { column: "name", error: null };
    }

    if (nameError && !isMissingColumnError(nameError)) {
      return { column: null, error: nameError };
    }

    nameColumnCache = null;
    return { column: null, error: null };
  })();

  return nameColumnPromise;
}

export async function fetchRepliesByConfession(confessionId) {
  if (!supabase) {
    return { data: [], error: new Error(configError) };
  }

  if (!confessionId) {
    return { data: [], error: new Error("Confession id missing.") };
  }

  const { column: nameColumn, error: nameError } = await resolveNameColumn();
  if (nameError) {
    return { data: [], error: nameError };
  }

  const columns = ["id", "confession_id", "content", "created_at", "user_id"];
  if (nameColumn) {
    columns.push(nameColumn);
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select(columns.join(", "))
    .eq("confession_id", confessionId)
    .order("created_at", { ascending: true });

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

  const { column: nameColumn, error: nameError } = await resolveNameColumn();
  if (nameError) {
    return { data: null, error: nameError };
  }

  const hasName = Object.prototype.hasOwnProperty.call(payload, "name");
  const nameValue = hasName ? payload.name : undefined;
  if (nameValue && !nameColumn) {
    return {
      data: null,
      error: new Error("Name column missing. Add a name column to enable reply names."),
    };
  }

  const insertPayload = {
    confession_id: payload.confession_id,
    content: payload.content,
    user_id: payload.user_id,
  };
  if (nameColumn && hasName) {
    insertPayload[nameColumn] = nameValue ?? null;
  }

  const columns = ["id", "confession_id", "content", "created_at", "user_id"];
  if (nameColumn) {
    columns.push(nameColumn);
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert(insertPayload)
    .select(columns.join(", "))
    .single();

  return { data, error };
}
