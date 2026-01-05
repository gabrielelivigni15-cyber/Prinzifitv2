"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getMyProfile, isExpired, Profile } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";

type Item = {
  id: string;
  meal_label: string | null;
  item: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fats_g: number | null;
  order_index: number | null;
};

export default function NutritionDetail() {
  const { id } = useParams<{ id: string }>();
  const r = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [title, setTitle] = useState<string>("");
  const [notes, setNotes] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
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

      const { data: plan, error: pErr } = await supabase
        .from("nutrition_plans")
        .select("id,title,notes")
        .eq("id", id)
        .maybeSingle();
      if (pErr || !plan) return setMsg("Piano non trovato o non accessibile.");
      setTitle(plan.title);
      setNotes(plan.notes);

      const { data: rows, error } = await supabase
        .from("nutrition_plan_items")
        .select("*")
        .eq("nutrition_plan_id", id)
        .order("order_index", { ascending: true });
      if (error) return setMsg(error.message);
      setItems((rows || []) as any);
    })();
  }, [id, r]);

  if (msg)
    return (
      <AppShell>
        <EmptyState title="Piano Alimentazione" description={msg} actionHref="/nutrition" actionLabel="Torna ai Piani" />
      </AppShell>
    );

  if (!profile)
    return (
      <AppShell>
        <div className="card"><div className="small">Caricamento…</div></div>
      </AppShell>
    );

  const groups = items.reduce<Record<string, Item[]>>((acc, it) => {
    const key = (it.meal_label || "Pasto").trim() || "Pasto";
    acc[key] = acc[key] || [];
    acc[key].push(it);
    return acc;
  }, {});

  return (
    <AppShell>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 850 }}>{title}</div>
            {notes ? <div className="small" style={{ marginTop: 6 }}>{notes}</div> : null}
          </div>
          <div className="row">
            <Link className="btn" href="/nutrition">Indietro</Link>
            <Link className="btn" href="/dashboard">Dashboard</Link>
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
          {Object.keys(groups).map((g) => (
            <div key={g} className="card" style={{ padding: 14 }}>
              <div style={{ fontWeight: 850, marginBottom: 10 }}>{g}</div>
              <div style={{ display: "grid", gap: 8 }}>
                {groups[g].map((it) => (
                  <div key={it.id} className="card" style={{ padding: 12, background: "rgba(15,19,34,.5)" }}>
                    <div style={{ fontWeight: 800 }}>{it.item}</div>
                    <div className="small" style={{ marginTop: 4 }}>
                      {it.calories != null ? <span className="badge">{it.calories} kcal</span> : null} {" "}
                      {it.protein_g != null ? <span className="badge">P {Number(it.protein_g).toFixed(0)}g</span> : null} {" "}
                      {it.carbs_g != null ? <span className="badge">C {Number(it.carbs_g).toFixed(0)}g</span> : null} {" "}
                      {it.fats_g != null ? <span className="badge">F {Number(it.fats_g).toFixed(0)}g</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
