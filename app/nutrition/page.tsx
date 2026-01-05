"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getMyProfile, isExpired, Profile } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";

type Nutrition = { id: string; title: string; notes: string | null; created_at?: string };

export default function NutritionList() {
  const r = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<Nutrition[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return r.replace("/login");
      const p = await getMyProfile();
      if (!p) return setMsg("Account non attivo. Contatta l’admin.");
      if (p.is_blocked) return setMsg("Account bloccato. Contatta l’admin.");
      if (isExpired(p.active_until)) return setMsg("Abbonamento scaduto. Contatta l’admin.");
      setProfile(p);

      const q = p.role === "admin" || p.role === "coach"
        ? supabase.from("nutrition_plans").select("id,title,notes,created_at").order("created_at", { ascending: false })
        : supabase
            .from("user_nutrition_plans")
            .select("nutrition_plans(id,title,notes,created_at)")
            .eq("user_id", p.id);

      const { data, error } = await q;
      if (error) return setMsg(error.message);
      const normalized = p.role === "admin" || p.role === "coach"
        ? (data as any as Nutrition[])
        : (data || []).map((x: any) => x.nutrition_plans).filter(Boolean);
      setItems(normalized);
    })();
  }, [r]);

  if (msg)
    return (
      <AppShell>
        <EmptyState title="Piani Alimentazione" description={msg} actionHref="/dashboard" actionLabel="Torna alla Dashboard" />
      </AppShell>
    );

  if (!profile)
    return (
      <AppShell>
        <div className="card"><div className="small">Caricamento…</div></div>
      </AppShell>
    );

  return (
    <AppShell>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 850 }}>Piani Alimentazione</div>
            <div className="small">
              {profile.role === "admin"
                ? "Stai vedendo tutti i piani (modalità admin)."
                : profile.role === "coach"
                  ? "Stai vedendo la tua libreria piani (coach)."
                  : "I tuoi piani assegnati."}
            </div>
          </div>
          <Link className="btn" href="/dashboard">Dashboard</Link>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {items.length === 0 ? (
            <div className="small">Nessun piano presente.</div>
          ) : (
            items.map((n) => (
              <Link key={n.id} href={`/nutrition/${n.id}`} className="card" style={{ padding: 14 }}>
                <div style={{ fontWeight: 850 }}>{n.title}</div>
                {n.notes ? <div className="small" style={{ marginTop: 4 }}>{n.notes}</div> : null}
              </Link>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
