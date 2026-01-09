import { supabase, configError } from "./supabase.js";

const TABLE = "confessions";
const PAGE_SIZE = 3;
let nameColumnCache;
let nameColumnPromise;

export function getConfigError() {
  return configError;
}

export function getPageSize() {
  return PAGE_SIZE;
}

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
    const { error: nameError } = await supabase
      .from(TABLE)
      .select("name", { head: true, count: "exact" })
      .eq("visibility", "public")
      .limit(1);

    if (!nameError) {
      nameColumnCache = "name";
      return { column: "name", error: null };
    }

    if (nameError && !isMissingColumnError(nameError)) {
      return { column: null, error: nameError };
    }

    const { error: displayError } = await supabase
      .from(TABLE)
      .select("display_name", { head: true, count: "exact" })
      .eq("visibility", "public")
      .limit(1);

    if (!displayError) {
      nameColumnCache = "display_name";
      return { column: "display_name", error: null };
    }

    if (displayError && !isMissingColumnError(displayError)) {
      return { column: null, error: displayError };
    }

    nameColumnCache = null;
    return { column: null, error: null };
  })();

  return nameColumnPromise;
}

export async function fetchConfessions({ offset = 0, limit = PAGE_SIZE } = {}) {
  if (!supabase) {
    return { data: [], error: new Error(configError) };
  }

  const { column: nameColumn, error: nameError } = await resolveNameColumn();
  if (nameError) {
    return { data: [], error: nameError };
  }

  const columns = ["id", "content", "created_at", "visibility", "confession_replies(count)"];
  if (nameColumn) {
    columns.push(nameColumn);
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select(columns.join(", "))
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  return { data: data || [], error };
}

export async function createConfession(payload) {
  if (!supabase) {
    return { data: null, error: new Error(configError) };
  }

  if (!payload || !payload.user_id) {
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
      error: new Error("Name column missing. Add a name column to enable public names."),
    };
  }

  if (payload.visibility !== "public" && payload.visibility !== "private") {
    return { data: null, error: new Error("Invalid visibility value.") };
  }

  const insertPayload = {
    content: payload.content,
    visibility: payload.visibility,
    user_id: payload.user_id,
  };
  if (nameColumn) {
    if (hasName) {
      insertPayload[nameColumn] = nameValue ?? null;
    }
  }

  const columns = ["id", "content", "created_at", "visibility", "confession_replies(count)"];
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

export async function fetchLatestConfessionByUser(userId) {
  if (!supabase) {
    return { data: null, error: new Error(configError) };
  }

  if (!userId) {
    return { data: null, error: new Error("Anonymous session not ready.") };
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select("id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    return { data: null, error };
  }

  return { data: data && data.length ? data[0] : null, error: null };
}

export async function deleteConfession(id) {
  if (!supabase) {
    return { error: new Error(configError) };
  }

  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  return { error };
}
