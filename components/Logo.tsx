export function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 12,
          background:
            "linear-gradient(135deg, rgba(59,130,246,.95), rgba(168,85,247,.75))",
          boxShadow: "0 10px 30px rgba(59,130,246,.18)",
        }}
      />
      <div>
        <div className="sidebarTitle">PrinziFit</div>
        <div className="small">Palestra • Schede • AI</div>
      </div>
    </div>
  );
}
