import Link from "next/link";

export default function HomePage() {
  return (
    <div className="container">
      <div className="card" style={{ padding: 22 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 850, letterSpacing: ".2px" }}>
              PrinziFit
            </div>
            <div className="small" style={{ maxWidth: 720, marginTop: 8 }}>
              App per palestra: account, abbonamenti manuali, schede allenamento e piani alimentari.
              L’admin vede tutto e assegna tutto a tutti. AI opzionale.
            </div>
          </div>
          <div className="row">
            <Link className="btn" href="/signup">Registrati</Link>
            <Link className="btn btnPrimary" href="/login">Login</Link>
          </div>
        </div>

        <div className="kpi" style={{ marginTop: 16 }}>
          <div className="metric">
            <div className="label">Controllo accessi</div>
            <div className="value">Blocca / Scadenza</div>
            <div className="small">Gestione manuale da Admin. Pagamenti esterni.</div>
          </div>
          <div className="metric">
            <div className="label">Schede & Piani</div>
            <div className="value">Assegna a utenti</div>
            <div className="small">Allenamento + Nutrizione con collegamenti DB.</div>
          </div>
          <div className="metric">
            <div className="label">AI (opzionale)</div>
            <div className="value">Genera circuito</div>
            <div className="small">Se imposti OPENAI_API_KEY in Vercel.</div>
          </div>
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <Link className="btn" href="/dashboard">Vai alla Dashboard</Link>
          <Link className="btn" href="/admin">Admin</Link>
        </div>
      </div>
    </div>
  );
}
