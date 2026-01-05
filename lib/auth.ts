import { supabase } from "./supabaseClient";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: "admin" | "coach" | "client";
  is_admin: boolean;
  is_coach: boolean;
  is_blocked: boolean;
  active_until: string | null;
  notes: string | null;
};

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getMyProfile(): Promise<Profile | null> {
  const session = await getSession();
  if (!session?.user?.id) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error || !data) return null;

  // admin status: prefer admin_users table (no recursion, più stabile)
  const { data: a } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", session.user.id)
    .maybeSingle();

  const dbRole = ((data as any).role as string | null) ?? null;
  const isAdmin = !!a || !!(data as any).is_admin || dbRole === "admin";
  const role: "admin" | "coach" | "client" = isAdmin
    ? "admin"
    : dbRole === "coach"
      ? "coach"
      : "client";

  return {
    ...(data as any),
    email: (data as any).email || session.user.email || null,
    role,
    is_admin: isAdmin,
    is_coach: role === "coach",
  } as any;
}

export function isExpired(active_until: string | null): boolean {
  if (!active_until) return true;
  const today = new Date().toISOString().slice(0,10);
  return new Date(active_until + "T00:00:00").getTime() < new Date(today + "T00:00:00").getTime();
}
