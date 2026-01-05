"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (error) return setMsg(error.message);
    setMsg("Registrazione completata. Ora fai login. Se è la prima volta, l’admin dovrà attivarti impostando la scadenza.");
  }

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 560, margin: "0 auto", padding: 22 }}>
      <h1 style={{ marginTop: 0 }}>Registrazione</h1>
      <form onSubmit={onSignup}>
        <div className="field"><label>Nome e Cognome</label>
          <input className="input" value={fullName} onChange={e=>setFullName(e.target.value)} />
        </div>
        <div className="field"><label>Email</label>
          <input className="input" value={email} onChange={e=>setEmail(e.target.value)} type="email" required />
        </div>
        <div className="field"><label>Password</label>
          <input className="input" value={password} onChange={e=>setPassword(e.target.value)} type="password" required />
        </div>
        <button className="btn btnPrimary" type="submit">Crea account</button>
      </form>
      {msg && <div style={{ marginTop: 14 }} className="toast"><div className="small">{msg}</div></div>}
      <p className="small" style={{ marginTop: 10 }}>
        Hai già un account? <Link href="/login" style={{ textDecoration:"underline" }}>Login</Link>
      </p>
      </div>
    </div>
  );
}
