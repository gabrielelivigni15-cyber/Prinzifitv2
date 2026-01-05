"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getMyProfile, isExpired } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const r = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const p = await getMyProfile();
        if (!p) return;
        if (p.role === "admin") return r.replace("/admin");
        if (p.role === "coach") return r.replace("/coach");
        return r.replace("/dashboard");
      }
    })();
  }, [r]);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setMsg(error.message);

    const p = await getMyProfile();
    if (!p) {
      await supabase.auth.signOut();
      return setMsg(
        "Ok, login riuscito. Però il tuo profilo non è ancora attivo. Chiedi all’admin di attivarti (scadenza/abilitazione)."
      );
    }
    if (p.is_blocked) {
      await supabase.auth.signOut();
      return setMsg("Account bloccato. Contatta l’admin.");
    }
    if (isExpired(p.active_until)) {
      await supabase.auth.signOut();
      return setMsg("Abbonamento scaduto. Contatta l’admin per il rinnovo.");
    }
    if (p.role === "admin") return r.replace("/admin");
    if (p.role === "coach") return r.replace("/coach");
    r.replace("/dashboard");
  }

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 560, margin: "0 auto", padding: 22 }}>
      <h1 style={{ marginTop: 0 }}>Login</h1>
      <form onSubmit={onLogin}>
        <div className="field"><label>Email</label>
          <input className="input" value={email} onChange={e=>setEmail(e.target.value)} type="email" required />
        </div>
        <div className="field"><label>Password</label>
          <input className="input" value={password} onChange={e=>setPassword(e.target.value)} type="password" required />
        </div>
        <button className="btn btnPrimary" type="submit">Entra</button>
      </form>
      {msg && <div style={{ marginTop: 14 }} className="toast"><div className="small">{msg}</div></div>}
      <p className="small" style={{ marginTop: 12 }}>
        Non hai un account? <Link href="/signup" style={{ textDecoration:"underline" }}>Registrati</Link>
      </p>
      </div>
    </div>
  );
}
