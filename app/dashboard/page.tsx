"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getMyProfile, isExpired, Profile } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";

type AssignedWorkout = { id: string; title: string; notes: string | null; };
type AssignedNutrition = { id: string; title: string; notes: string | null; };

export default function Dashboard() {
  const r = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [w, setW] = useState<AssignedWorkout[]>([]);
  const [n, setN] = useState<AssignedNutrition[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return r.replace("/login");

      const p = await getMyProfile();
      if (!p) return setMsg("Il tuo account è stato creato, ma non risulta ancora attivo. Contatta l’admin.");
      if (p.is_blocked) return setMsg("Account bloccato. Contatta l’admin.");
      if (isExpired(p.active_until)) return setMsg("Abbonamento scaduto. Contatta l’admin per il rinnovo.");
      setProfile(p);

      const { data: wData } = await supabase.from("user_workout_plans").select("workout_plans(id,title,notes)").eq("user_id", p.id);
      setW((wData || []).map((x:any)=>x.workout_plans));

      const { data: nData } = await supabase.from("user_nutrition_plans").select("nutrition_plans(id,title,notes)").eq("user_id", p.id);
      setN((nData || []).map((x:any)=>x.nutrition_plans));
    })();
  }, [r]);

  async function logout() {
    await supabase.auth.signOut();
    r.replace("/");
  }

  if (msg)
    return (
      <AppShell>
        <EmptyState
          title="Dashboard"
          description={msg}
          actionHref="/login"
          actionLabel="Torna al Login"
        />
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
            <div style={{ fontSize: 26, fontWeight: 850 }}>Dashboard</div>
            <div className="small" style={{ marginTop: 6 }}>
              Ciao <b>{profile.full_name || profile.email}</b>
            </div>
            <div className="small" style={{ marginTop: 6 }}>
              Accesso attivo fino al: <span className="badge">{profile.active_until || "—"}</span>
            </div>
          </div>
          <div className="row">
            {profile.role === "coach" ? (
              <Link className="btn" href="/coach">Coach</Link>
            ) : null}
            {profile.role === "admin" ? (
              <Link className="btn" href="/admin">Admin</Link>
            ) : null}
            <button className="btn" onClick={logout}>
              Logout
            </button>
          </div>
        </div>

        <div className="kpi" style={{ marginTop: 16 }}>
          <div className="metric">
            <div className="label">Schede allenamento</div>
            <div className="value">{w.length}</div>
            <div className="small">Assegnate al tuo account</div>
          </div>
          <div className="metric">
            <div className="label">Piani alimentazione</div>
            <div className="value">{n.length}</div>
            <div className="small">Assegnati al tuo account</div>
          </div>
          <div className="metric">
            <div className="label">Stato</div>
            <div className="value">{profile.is_blocked ? "Bloccato" : isExpired(profile.active_until) ? "Scaduto" : "OK"}</div>
            <div className="small">Gestito dall’admin</div>
          </div>
        </div>
      </div>

      <div className="row">
        <div style={{ flex: 1, minWidth: 320 }} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Schede allenamento</div>
              <div className="small">Apri e consulta i dettagli.</div>
            </div>
            <Link className="btn" href="/workout">Vedi tutto</Link>
          </div>
          <div style={{ marginTop: 12 }}>
            {w.length === 0 ? (
              <div className="small">Nessuna scheda assegnata.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {w.slice(0, 3).map((item) => (
                  <Link key={item.id} href={`/workout/${item.id}`} className="card" style={{ padding: 12 }}>
                    <div style={{ fontWeight: 800 }}>{item.title}</div>
                    {item.notes ? <div className="small" style={{ marginTop: 4 }}>{item.notes}</div> : null}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 320 }} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Piani alimentazione</div>
              <div className="small">Tutto organizzato per pasti.</div>
            </div>
            <Link className="btn" href="/nutrition">Vedi tutto</Link>
          </div>
          <div style={{ marginTop: 12 }}>
            {n.length === 0 ? (
              <div className="small">Nessun piano assegnato.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {n.slice(0, 3).map((item) => (
                  <Link key={item.id} href={`/nutrition/${item.id}`} className="card" style={{ padding: 12 }}>
                    <div style={{ fontWeight: 800 }}>{item.title}</div>
                    {item.notes ? <div className="small" style={{ marginTop: 4 }}>{item.notes}</div> : null}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
