"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getMyProfile, isExpired, Profile } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";

type Workout = { id: string; title: string; notes: string | null; created_at: string };
type Nutrition = { id: string; title: string; notes: string | null; created_at: string };

type AssignedWorkout = { id: string; title: string; notes: string | null };
type AssignedNutrition = { id: string; title: string; notes: string | null };

function fmtDate(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("it-IT");
  } catch {
    return d;
  }
}

export default function CoachPage() {
  const r = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [clients, setClients] = useState<Profile[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [nutritions, setNutritions] = useState<Nutrition[]>([]);
  const [search, setSearch] = useState("");

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const selectedUser = useMemo(
    () => clients.find((u) => u.id === selectedUserId) || null,
    [clients, selectedUserId]
  );

  const [assignedW, setAssignedW] = useState<AssignedWorkout[]>([]);
  const [assignedN, setAssignedN] = useState<AssignedNutrition[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // AI
  const [aiGoal, setAiGoal] = useState("Circuito Full Body");
  const [aiLevel, setAiLevel] = useState("base");

  const filteredClients = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return clients;
    return clients.filter(
      (u) =>
        (u.full_name || "").toLowerCase().includes(s) ||
        (u.email || "").toLowerCase().includes(s)
    );
  }, [clients, search]);

  useEffect(() => {
    (async () => {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return r.replace("/login");

      const p = await getMyProfile();
      if (!p) return setMsg("Account non attivo. Contatta l’admin.");
      if (p.is_blocked) return setMsg("Account bloccato.");
      if (isExpired(p.active_until)) return setMsg("Abbonamento scaduto.");
      if (p.role !== "coach") return setMsg("Non sei coach.");

      setMe(p);
      await refreshAll(p.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r]);

  async function refreshAll(coachId?: string) {
    setMsg(null);
    setToast(null);

    const myId = coachId || me?.id;
    if (!myId) return;

    // 1) clients ids
    const { data: links, error: lErr } = await supabase
      .from("coach_clients")
      .select("client_id")
      .eq("coach_id", myId);
    if (lErr) {
      setMsg(lErr.message);
      return;
    }
    const ids = (links || []).map((x: any) => x.client_id).filter(Boolean);
    if (ids.length === 0) {
      setClients([]);
      setWorkouts([]);
      setNutritions([]);
      setSelectedUserId(null);
      setAssignedW([]);
      setAssignedN([]);
      return;
    }

    const [{ data: u }, { data: w }, { data: n }] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .in("id", ids)
        .order("created_at", { ascending: false }),
      supabase
        .from("workout_plans")
        .select("id,title,notes,created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("nutrition_plans")
        .select("id,title,notes,created_at")
        .order("created_at", { ascending: false }),
    ]);

    setClients((u || []) as any);
    setWorkouts((w || []) as any);
    setNutritions((n || []) as any);

    const first = (u || [])[0];
    if (!selectedUserId && first?.id) {
      setSelectedUserId(first.id);
      await loadAssignments(first.id);
    } else if (selectedUserId) {
      await loadAssignments(selectedUserId);
    }
  }

  async function loadAssignments(userId: string) {
    const [{ data: wData }, { data: nData }] = await Promise.all([
      supabase
        .from("user_workout_plans")
        .select("workout_plans(id,title,notes)")
        .eq("user_id", userId),
      supabase
        .from("user_nutrition_plans")
        .select("nutrition_plans(id,title,notes)")
        .eq("user_id", userId),
    ]);
    setAssignedW((wData || []).map((x: any) => x.workout_plans).filter(Boolean));
    setAssignedN((nData || []).map((x: any) => x.nutrition_plans).filter(Boolean));
  }

  function bannerFor(u: Profile) {
    if (u.is_blocked) return { text: "Bloccato", tone: "danger" as const };
    if (isExpired(u.active_until)) return { text: "Scaduto", tone: "warn" as const };
    return { text: "Attivo", tone: "ok" as const };
  }

  async function updateClient(fields: Partial<Profile>) {
    if (!selectedUser) return;
    setSaving(true);
    setToast(null);
    const { error } = await supabase.from("profiles").update(fields).eq("id", selectedUser.id);
    setSaving(false);
    if (error) return setToast(error.message);
    setToast("Salvato");
    await refreshAll();
  }

  async function assignWorkout(planId: string) {
    if (!selectedUser) return;
    await supabase
      .from("user_workout_plans")
      .upsert({ user_id: selectedUser.id, workout_plan_id: planId });
    await loadAssignments(selectedUser.id);
  }
  async function unassignWorkout(planId: string) {
    if (!selectedUser) return;
    await supabase
      .from("user_workout_plans")
      .delete()
      .eq("user_id", selectedUser.id)
      .eq("workout_plan_id", planId);
    await loadAssignments(selectedUser.id);
  }
  async function assignNutrition(planId: string) {
    if (!selectedUser) return;
    await supabase
      .from("user_nutrition_plans")
      .upsert({ user_id: selectedUser.id, nutrition_plan_id: planId });
    await loadAssignments(selectedUser.id);
  }
  async function unassignNutrition(planId: string) {
    if (!selectedUser) return;
    await supabase
      .from("user_nutrition_plans")
      .delete()
      .eq("user_id", selectedUser.id)
      .eq("nutrition_plan_id", planId);
    await loadAssignments(selectedUser.id);
  }

  async function generateAI() {
    if (!selectedUser || !me) return;
    setSaving(true);
    setToast(null);
    try {
      const res = await fetch("/api/ai/genera-scheda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: aiGoal, level: aiLevel }),
      });
      const json = await res.json();
      if (!json?.workout || !json?.nutrition) throw new Error("AI response non valida");

      // workout
      const wTitle = String(json.workout.title || "Scheda AI").slice(0, 140);
      const { data: wPlan, error: wErr } = await supabase
        .from("workout_plans")
        .insert({ title: wTitle, notes: json.workout.notes || null, created_by: me.id })
        .select("id")
        .single();
      if (wErr) throw new Error(wErr.message);

      const wItems: any[] = [];
      let idx = 1;
      for (const day of json.workout.days || []) {
        for (const ex of day.exercises || []) {
          wItems.push({
            workout_plan_id: wPlan.id,
            day_label: day.label || null,
            exercise_name: ex.name,
            sets: ex.sets ?? null,
            reps: ex.reps ?? null,
            rest: ex.rest ?? null,
            order_index: idx++,
          });
        }
      }
      if (wItems.length) {
        const { error: wiErr } = await supabase.from("workout_plan_items").insert(wItems);
        if (wiErr) throw new Error(wiErr.message);
      }

      // nutrition
      const nTitle = String(json.nutrition.title || "Piano AI").slice(0, 140);
      const { data: nPlan, error: nErr } = await supabase
        .from("nutrition_plans")
        .insert({ title: nTitle, notes: json.nutrition.notes || null, created_by: me.id })
        .select("id")
        .single();
      if (nErr) throw new Error(nErr.message);

      const nItems: any[] = [];
      let nIdx = 1;
      for (const meal of json.nutrition.meals || []) {
        for (const it of meal.items || []) {
          nItems.push({
            nutrition_plan_id: nPlan.id,
            meal_label: meal.label || null,
            item: it.item,
            calories: it.calories ?? null,
            protein_g: it.protein_g ?? null,
            carbs_g: it.carbs_g ?? null,
            fats_g: it.fats_g ?? null,
            order_index: nIdx++,
          });
        }
      }
      if (nItems.length) {
        const { error: niErr } = await supabase.from("nutrition_plan_items").insert(nItems);
        if (niErr) throw new Error(niErr.message);
      }

      await supabase
        .from("user_workout_plans")
        .upsert({ user_id: selectedUser.id, workout_plan_id: wPlan.id });
      await supabase
        .from("user_nutrition_plans")
        .upsert({ user_id: selectedUser.id, nutrition_plan_id: nPlan.id });

      setToast(`AI ok (${json.source || "?"}). Scheda + piano creati e assegnati.`);
      await refreshAll();
    } catch (e: any) {
      setToast(e?.message || "Errore AI");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    r.replace("/");
  }

  if (msg)
    return (
      <AppShell>
        <EmptyState title="Coach" description={msg} actionHref="/dashboard" actionLabel="Torna alla Dashboard" />
      </AppShell>
    );

  if (!me)
    return (
      <AppShell>
        <div className="card">
          <div className="small">Caricamento…</div>
        </div>
      </AppShell>
    );

  return (
    <AppShell>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 850 }}>Coach</div>
            <div className="small" style={{ marginTop: 6 }}>
              Gestisci i tuoi allievi, assegna schede e piani, genera con AI.
            </div>
          </div>
          <div className="row">
            <button className="btn" onClick={() => refreshAll()} disabled={saving}>
              Aggiorna
            </button>
            <Link className="btn" href="/dashboard">
              Dashboard
            </Link>
            <button className="btn" onClick={logout}>
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="row" style={{ alignItems: "stretch" }}>
        <div className="panel" style={{ flex: 1, minWidth: 320 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <div style={{ fontWeight: 850 }}>Allievi</div>
            <span className="badge">{clients.length}</span>
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <input
              className="input"
              placeholder="Cerca per nome/email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ display: "grid", gap: 10, maxHeight: 520, overflow: "auto", paddingRight: 4 }}>
            {filteredClients.map((u) => {
              const tag = bannerFor(u);
              const active = u.id === selectedUserId;
              return (
                <button
                  key={u.id}
                  className="card"
                  style={{
                    textAlign: "left",
                    padding: 12,
                    cursor: "pointer",
                    borderColor: active ? "rgba(59,130,246,.7)" : undefined,
                    background: active ? "rgba(15,19,34,.75)" : undefined,
                  }}
                  onClick={async () => {
                    setSelectedUserId(u.id);
                    await loadAssignments(u.id);
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 850 }}>{u.full_name || u.email || u.id.slice(0, 8)}</div>
                    <span
                      className="badge"
                      style={
                        tag.tone === "danger"
                          ? { borderColor: "rgba(239,68,68,.7)", background: "rgba(127,29,29,.2)" }
                          : tag.tone === "warn"
                            ? { borderColor: "rgba(234,179,8,.7)", background: "rgba(113,63,18,.18)" }
                            : { borderColor: "rgba(34,197,94,.6)", background: "rgba(22,101,52,.14)" }
                      }
                    >
                      {tag.text}
                    </span>
                  </div>
                  <div className="small" style={{ marginTop: 4 }}>{u.email}</div>
                  <div className="small" style={{ marginTop: 6 }}>
                    Scadenza: <b>{fmtDate(u.active_until)}</b>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="panel" style={{ flex: 2, minWidth: 360 }}>
          {!selectedUser ? (
            <EmptyState
              title="Seleziona un allievo"
              description="Clicca un allievo a sinistra per gestire abbonamento, note e assegnazioni."
            />
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{selectedUser.full_name || selectedUser.email}</div>
                  <div className="small">ID: <span className="badge">{selectedUser.id}</span></div>
                </div>
                <div className="row">
                  <button
                    className="btn btnGhost"
                    onClick={() => updateClient({ is_blocked: !selectedUser.is_blocked })}
                    disabled={saving}
                  >
                    {selectedUser.is_blocked ? "Sblocca" : "Blocca"}
                  </button>
                  <button className="btn" onClick={() => loadAssignments(selectedUser.id)} disabled={saving}>
                    Ricarica
                  </button>
                </div>
              </div>

              {toast ? (
                <div className="toast" style={{ marginTop: 12 }}>
                  <div className="small">{toast}</div>
                </div>
              ) : null}

              <div className="row" style={{ marginTop: 14 }}>
                <div className="card" style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ fontWeight: 850 }}>Abbonamento & note</div>
                  <div className="field">
                    <label className="small">Attivo fino al (YYYY-MM-DD)</label>
                    <input
                      className="input"
                      value={selectedUser.active_until || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setClients((prev) =>
                          prev.map((x) => (x.id === selectedUser.id ? ({ ...x, active_until: v || null } as any) : x))
                        );
                      }}
                      placeholder="2026-12-31"
                    />
                  </div>
                  <div className="field">
                    <label className="small">Note (visibili a coach/admin)</label>
                    <textarea
                      className="input"
                      rows={4}
                      value={selectedUser.notes || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setClients((prev) =>
                          prev.map((x) => (x.id === selectedUser.id ? ({ ...x, notes: v } as any) : x))
                        );
                      }}
                      placeholder="Esempio: pagato esternamente, preferenze, infortuni…"
                    />
                  </div>
                  <button
                    className="btn btnPrimary"
                    disabled={saving}
                    onClick={() => updateClient({ active_until: selectedUser.active_until, notes: selectedUser.notes })}
                  >
                    Salva
                  </button>
                </div>

                <div className="card" style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ fontWeight: 850 }}>Genera con AI</div>
                  <div className="field">
                    <label className="small">Obiettivo</label>
                    <input className="input" value={aiGoal} onChange={(e) => setAiGoal(e.target.value)} />
                  </div>
                  <div className="field">
                    <label className="small">Livello</label>
                    <select className="input" value={aiLevel} onChange={(e) => setAiLevel(e.target.value)}>
                      <option value="base">Base</option>
                      <option value="intermediate">Intermedio</option>
                      <option value="advanced">Avanzato</option>
                    </select>
                  </div>
                  <button className="btn btnPrimary" disabled={saving} onClick={generateAI}>
                    Genera & assegna
                  </button>
                  <div className="small" style={{ marginTop: 10 }}>
                    Se manca OPENAI_API_KEY, l’app usa un fallback e NON si rompe.
                  </div>
                </div>
              </div>

              <div className="row" style={{ marginTop: 14, alignItems: "stretch" }}>
                <div className="card" style={{ flex: 1, minWidth: 320 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800 }}>Schede assegnate</div>
                      <div className="small">Puoi aggiungere/rimuovere in 1 click.</div>
                    </div>
                    <span className="badge">{assignedW.length}</span>
                  </div>
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    {assignedW.length ? (
                      assignedW.map((p) => (
                        <div key={p.id} className="card" style={{ padding: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <Link href={`/workout/${p.id}`} style={{ fontWeight: 850 }}>{p.title}</Link>
                            <button className="btn btnDanger" onClick={() => unassignWorkout(p.id)} disabled={saving}>
                              Rimuovi
                            </button>
                          </div>
                          {p.notes ? <div className="small" style={{ marginTop: 6 }}>{p.notes}</div> : null}
                        </div>
                      ))
                    ) : (
                      <div className="small">Nessuna scheda assegnata.</div>
                    )}
                  </div>
                  <div className="divider" />
                  <div className="small" style={{ marginBottom: 8 }}>Libreria schede (le tue / assegnate)</div>
                  <div style={{ display: "grid", gap: 8, maxHeight: 260, overflow: "auto", paddingRight: 4 }}>
                    {workouts.map((p) => (
                      <button key={p.id} className="btn" onClick={() => assignWorkout(p.id)} disabled={saving}>
                        Assegna: {p.title}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="card" style={{ flex: 1, minWidth: 320 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800 }}>Piani assegnati</div>
                      <div className="small">Organizzati per pasti.</div>
                    </div>
                    <span className="badge">{assignedN.length}</span>
                  </div>
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    {assignedN.length ? (
                      assignedN.map((p) => (
                        <div key={p.id} className="card" style={{ padding: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <Link href={`/nutrition/${p.id}`} style={{ fontWeight: 850 }}>{p.title}</Link>
                            <button className="btn btnDanger" onClick={() => unassignNutrition(p.id)} disabled={saving}>
                              Rimuovi
                            </button>
                          </div>
                          {p.notes ? <div className="small" style={{ marginTop: 6 }}>{p.notes}</div> : null}
                        </div>
                      ))
                    ) : (
                      <div className="small">Nessun piano assegnato.</div>
                    )}
                  </div>
                  <div className="divider" />
                  <div className="small" style={{ marginBottom: 8 }}>Libreria piani (i tuoi / assegnati)</div>
                  <div style={{ display: "grid", gap: 8, maxHeight: 260, overflow: "auto", paddingRight: 4 }}>
                    {nutritions.map((p) => (
                      <button key={p.id} className="btn" onClick={() => assignNutrition(p.id)} disabled={saving}>
                        Assegna: {p.title}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
