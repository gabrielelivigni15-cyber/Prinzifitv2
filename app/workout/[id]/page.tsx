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
  day_label: string | null;
  exercise_name: string;
  sets: number | null;
  reps: string | null;
  rest: string | null;
  order_index: number | null;
};

export default function WorkoutDetail() {
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
        .from("workout_plans")
        .select("id,title,notes")
        .eq("id", id)
        .maybeSingle();
      if (pErr || !plan) return setMsg("Scheda non trovata o non accessibile.");
      setTitle(plan.title);
      setNotes(plan.notes);

      const { data: rows, error } = await supabase
        .from("workout_plan_items")
        .select("*")
        .eq("workout_plan_id", id)
        .order("order_index", { ascending: true });
      if (error) return setMsg(error.message);
      setItems((rows || []) as any);
    })();
  }, [id, r]);

  if (msg)
    return (
      <AppShell>
        <EmptyState title="Scheda Allenamento" description={msg} actionHref="/workout" actionLabel="Torna alle Schede" />
      </AppShell>
    );

  if (!profile)
    return (
      <AppShell>
        <div className="card"><div className="small">Caricamento…</div></div>
      </AppShell>
    );

  const groups = items.reduce<Record<string, Item[]>>((acc, it) => {
    const key = (it.day_label || "Allenamento").trim() || "Allenamento";
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
            <Link className="btn" href="/workout">Indietro</Link>
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
                    <div style={{ fontWeight: 800 }}>{it.exercise_name}</div>
                    <div className="small" style={{ marginTop: 4 }}>
                      {it.sets ? <span className="badge">{it.sets} serie</span> : null}{" "}
                      {it.reps ? <span className="badge">{it.reps} reps</span> : null}{" "}
                      {it.rest ? <span className="badge">rec {it.rest}</span> : null}
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
