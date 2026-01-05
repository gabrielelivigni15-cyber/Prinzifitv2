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

type UserRow = Profile;

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

export default function AdminPage() {
  const r = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [coaches, setCoaches] = useState<UserRow[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [nutritions, setNutritions] = useState<Nutrition[]>([]);
  const [search, setSearch] = useState("");

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) || null,
    [users, selectedUserId]
  );

  const [assignedW, setAssignedW] = useState<AssignedWorkout[]>([]);
  const [assignedN, setAssignedN] = useState<AssignedNutrition[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // AI generation (minimal inputs)
  const [aiGoal, setAiGoal] = useState("Full Body");
  const [aiLevel, setAiLevel] = useState("base");

  const filteredUsers = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return users;
    return users.filter(
      (u) =>
        (u.full_name || "").toLowerCase().includes(s) ||
        (u.email || "").toLowerCase().includes(s)
    );
  }, [users, search]);

  useEffect(() => {
    (async () => {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return r.replace("/login");
      const p = await getMyProfile();
      if (!p) return setMsg("Account non attivo. Contatta l’admin.");
      if (p.is_blocked) return setMsg("Account bloccato.");
      if (isExpired(p.active_until)) return setMsg("Abbonamento scaduto.");
      if (p.role !== "admin") return setMsg("Non sei admin.");
      setMe(p);
      await refreshAll();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r]);

  async function refreshAll() {
    setMsg(null);
    const [{ data: u }, { data: c }, { data: w }, { data: n }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").eq("role", "coach").order("created_at", { ascending: false }),
      supabase.from("workout_plans").select("id,title,notes,created_at").order("created_at", { ascending: false }),
      supabase.from("nutrition_plans").select("id,title,notes,created_at").order("created_at", { ascending: false }),
    ]);
    setUsers((u || []) as any);
    setCoaches((c || []) as any);
    setWorkouts((w || []) as any);
    setNutritions((n || []) as any);
    // auto-select first
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

    // coach assigned to this client
    const { data: link } = await supabase
      .from("coach_clients")
      .select("coach_id")
      .eq("client_id", userId)
      .maybeSingle();
    setSelectedCoachId((link as any)?.coach_id ?? null);
  }

  async function setCoachForClient(clientId: string, coachId: string | null) {
    setSaving(true);
    setToast(null);
    try {
      // one coach per client: delete old then insert
      await supabase.from("coach_clients").delete().eq("client_id", clientId);
      if (coachId) {
        const { error } = await supabase.from("coach_clients").insert({ coach_id: coachId, client_id: clientId });
        if (error) throw new Error(error.message);
      }
      setSelectedCoachId(coachId);
      setToast("Coach aggiornato");
    } catch (e: any) {
      setToast(e?.message || "Errore coach");
    } finally {
      setSaving(false);
    }
  }

  function bannerFor(u: UserRow) {
    if (u.is_blocked) return { text: "Bloccato", tone: "danger" as const };
    if (isExpired(u.active_until)) return { text: "Scaduto", tone: "warn" as const };
    return { text: "Attivo", tone: "ok" as const };
  }

  async function updateUser(fields: Partial<UserRow>) {
    if (!selectedUser) return;
    setSaving(true);
    setToast(null);
    const { error } = await supabase
      .from("profiles")
      .update(fields)
      .eq("id", selectedUser.id);
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
    if (!selectedUser) return;
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

      // 1) create workout plan + items
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

      // 2) create nutrition plan + items
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

      // 3) assign both to user
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
        <EmptyState title="Admin" description={msg} actionHref="/dashboard" actionLabel="Torna alla Dashboard" />
      </AppShell>
    );

  if (!me)
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
            <div style={{ fontSize: 26, fontWeight: 850 }}>Admin</div>
            <div className="small" style={{ marginTop: 6 }}>
              Qui vedi tutto e puoi assegnare tutto a tutti.
            </div>
          </div>
          <div className="row">
            <button className="btn" onClick={refreshAll} disabled={saving}>Aggiorna</button>
            <Link className="btn" href="/dashboard">Dashboard</Link>
            <button className="btn" onClick={logout}>Logout</button>
          </div>
        </div>
      </div>

      <div className="row" style={{ alignItems: "stretch" }}>
        <div className="panel" style={{ flex: 1, minWidth: 320 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <div style={{ fontWeight: 850 }}>Utenti</div>
            <span className="badge">{users.length}</span>
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
            {filteredUsers.map((u) => {
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
                  <div className="small" style={{ marginTop: 6 }}>Scadenza: <b>{fmtDate(u.active_until)}</b></div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="panel" style={{ flex: 2, minWidth: 360 }}>
          {!selectedUser ? (
            <EmptyState
              title="Seleziona un utente"
              description="Clicca un utente a sinistra per gestire abbonamento, note e assegnazioni."
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
                    onClick={() => updateUser({ is_blocked: !selectedUser.is_blocked })}
                    disabled={saving}
                  >
                    {selectedUser.is_blocked ? "Sblocca" : "Blocca"}
                  </button>
                  <button className="btn" onClick={() => loadAssignments(selectedUser.id)} disabled={saving}>
                    Ricarica assegnazioni
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
                  <div style={{ fontWeight: 850 }}>Abbonamento</div>
                  <div className="field">
                    <label className="small">Attivo fino al (YYYY-MM-DD)</label>
                    <input
                      className="input"
                      value={selectedUser.active_until || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setUsers((prev) => prev.map((x) => (x.id === selectedUser.id ? ({ ...x, active_until: v || null } as any) : x)));
                      }}
                      placeholder="2026-12-31"
                    />
                  </div>
                  <button
                    className="btn btnPrimary"
                    disabled={saving}
                    onClick={() => updateUser({ active_until: selectedUser.active_until })}
                  >
                    Salva scadenza
                  </button>
                  <div className="small" style={{ marginTop: 10 }}>
                    Stato: <span className="badge">{bannerFor(selectedUser).text}</span>
                  </div>
                </div>

                <div className="card" style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ fontWeight: 850 }}>Note interne</div>
                  <div className="field">
                    <textarea
                      className="input"
                      rows={4}
                      value={selectedUser.notes || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setUsers((prev) => prev.map((x) => (x.id === selectedUser.id ? ({ ...x, notes: v || null } as any) : x)));
                      }}
                      placeholder="Pagamento ricevuto via PayPal..."
                    />
                  </div>
                  <button
                    className="btn btnPrimary"
                    disabled={saving}
                    onClick={() => updateUser({ notes: selectedUser.notes })}
                  >
                    Salva note
                  </button>
                </div>

                <div className="card" style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ fontWeight: 850 }}>Ruolo & Coach</div>
                  <div className="field">
                    <label className="small">Ruolo utente</label>
                    <select
                      className="input"
                      value={(selectedUser as any).role || (selectedUser.is_admin ? "admin" : "client")}
                      onChange={(e) => {
                        const v = e.target.value;
                        setUsers((prev) =>
                          prev.map((x) => (x.id === selectedUser.id ? ({ ...x, role: v } as any) : x))
                        );
                      }}
                    >
                      <option value="client">Cliente</option>
                      <option value="coach">Coach</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <button
                    className="btn"
                    disabled={saving}
                    onClick={() => updateUser({ role: (selectedUser as any).role as any })}
                  >
                    Salva ruolo
                  </button>

                  <div className="divider" />

                  <div className="field">
                    <label className="small">Coach assegnato (1 coach per cliente)</label>
                    <select
                      className="input"
                      value={selectedCoachId || ""}
                      onChange={(e) => setSelectedCoachId(e.target.value || null)}
                    >
                      <option value="">Nessuno</option>
                      {coaches.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name || c.email || c.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="btn btnPrimary"
                    disabled={saving}
                    onClick={() => setCoachForClient(selectedUser.id, selectedCoachId)}
                  >
                    Salva coach
                  </button>
                  <div className="small" style={{ marginTop: 10 }}>
                    Coach può gestire solo i suoi clienti, admin vede tutto.
                  </div>
                </div>
              </div>

              <div className="row" style={{ marginTop: 14, alignItems: "stretch" }}>
                <div className="card" style={{ flex: 1, minWidth: 320 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>Schede assegnate</div>
                      <div className="small">Puoi assegnare qualsiasi scheda a qualsiasi utente.</div>
                    </div>
                    <span className="badge">{assignedW.length}</span>
                  </div>

                  <div className="field" style={{ marginTop: 10 }}>
                    <label className="small">Assegna scheda</label>
                    <select
                      className="input"
                      onChange={(e) => {
                        const id = e.target.value;
                        if (id) assignWorkout(id);
                        e.currentTarget.selectedIndex = 0;
                      }}
                    >
                      <option value="">Seleziona…</option>
                      {workouts.map((w) => (
                        <option key={w.id} value={w.id}>{w.title}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    {assignedW.length === 0 ? (
                      <div className="small">Nessuna scheda assegnata.</div>
                    ) : (
                      assignedW.map((w) => (
                        <div key={w.id} className="card" style={{ padding: 12, background: "rgba(15,19,34,.5)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <div>
                              <div style={{ fontWeight: 850 }}>{w.title}</div>
                              {w.notes ? <div className="small" style={{ marginTop: 4 }}>{w.notes}</div> : null}
                            </div>
                            <div className="row">
                              <Link className="btn btnGhost" href={`/workout/${w.id}`}>Apri</Link>
                              <button className="btn btnDanger" onClick={() => unassignWorkout(w.id)}>Rimuovi</button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="card" style={{ flex: 1, minWidth: 320 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>Piani assegnati</div>
                      <div className="small">Gestisci la nutrizione come vuoi.</div>
                    </div>
                    <span className="badge">{assignedN.length}</span>
                  </div>

                  <div className="field" style={{ marginTop: 10 }}>
                    <label className="small">Assegna piano</label>
                    <select
                      className="input"
                      onChange={(e) => {
                        const id = e.target.value;
                        if (id) assignNutrition(id);
                        e.currentTarget.selectedIndex = 0;
                      }}
                    >
                      <option value="">Seleziona…</option>
                      {nutritions.map((n) => (
                        <option key={n.id} value={n.id}>{n.title}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    {assignedN.length === 0 ? (
                      <div className="small">Nessun piano assegnato.</div>
                    ) : (
                      assignedN.map((n) => (
                        <div key={n.id} className="card" style={{ padding: 12, background: "rgba(15,19,34,.5)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <div>
                              <div style={{ fontWeight: 850 }}>{n.title}</div>
                              {n.notes ? <div className="small" style={{ marginTop: 4 }}>{n.notes}</div> : null}
                            </div>
                            <div className="row">
                              <Link className="btn btnGhost" href={`/nutrition/${n.id}`}>Apri</Link>
                              <button className="btn btnDanger" onClick={() => unassignNutrition(n.id)}>Rimuovi</button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>AI: genera e assegna</div>
                    <div className="small">Crea automaticamente una scheda + un piano e li assegna all’utente selezionato.</div>
                  </div>
                  <button className="btn btnPrimary" onClick={generateAI} disabled={saving}>
                    {saving ? "In corso…" : "Genera con AI"}
                  </button>
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div className="field">
                      <label className="small">Obiettivo</label>
                      <input className="input" value={aiGoal} onChange={(e) => setAiGoal(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ width: 220 }}>
                    <div className="field">
                      <label className="small">Livello</label>
                      <select className="input" value={aiLevel} onChange={(e) => setAiLevel(e.target.value)}>
                        <option value="base">Base</option>
                        <option value="intermediate">Intermedio</option>
                        <option value="advanced">Avanzato</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="small" style={{ marginTop: 28 }}>
                      Nota: per l’AI vera serve <span className="badge">OPENAI_API_KEY</span> su Vercel. Senza, usa un fallback (comunque funzionante).
                    </div>
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
