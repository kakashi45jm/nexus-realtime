import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type StoredProfile = Record<string, unknown> & {
  id: string;
  name: string;
  handle: string;
};

export function cleanUsername(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
}

export function dmKey(a: string, b: string): string {
  return [a, b].sort().join("__");
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const SALT = "pinkvoid-livecall-v1";

export async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(`${SALT}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function publicProfile(row: {
  id: string;
  username: string;
  profile: Record<string, unknown> | null;
}) {
  return {
    id: row.id,
    username: row.username,
    ...(row.profile ?? {}),
  };
}

export async function findUser(opts: {
  username?: string | null;
  id?: string | null;
}) {
  const admin = supabaseAdmin;
  if (opts.username) {
    const { data } = await admin
      .from("app_users")
      .select("*")
      .eq("username", cleanUsername(opts.username))
      .maybeSingle();
    if (data) return data;
  }
  if (opts.id) {
    const { data } = await admin
      .from("app_users")
      .select("*")
      .eq("id", opts.id)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}
