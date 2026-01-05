"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { Logo } from "./Logo";
import { getMyProfile, Profile } from "@/lib/auth";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      className="sidebarLink"
      href={href}
      style={
        active
          ? {
              background: "rgba(15,19,34,.65)",
              borderColor: "rgba(59,130,246,.55)",
            }
          : undefined
      }
    >
      <span style={{ width: 10, height: 10, borderRadius: 99, background: active ? "rgba(59,130,246,.95)" : "rgba(43,51,87,.8)" }} />
      <span>{label}</span>
    </Link>
  );
}

export function AppShell({
  children,
  sidebar,
}: {
  children: ReactNode;
  sidebar?: ReactNode;
}) {
  const [me, setMe] = useState<Profile | null>(null);

  useEffect(() => {
    (async () => {
      const p = await getMyProfile();
      if (p) setMe(p);
    })();
  }, []);

  return (
    <div className="container">
      <div className="shell">
        <aside className="panel">
          <Logo />
          {me ? (
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="badge" style={{ borderColor: "rgba(59,130,246,.55)", background: "rgba(15,19,34,.6)" }}>
                {me.role.toUpperCase()}
              </span>
              {me.active_until ? (
                <span className="badge">Scade: {me.active_until}</span>
              ) : null}
            </div>
          ) : null}
          <div className="divider" />
          {sidebar ?? (
            <>
              <NavLink href="/dashboard" label="Dashboard" />
              <NavLink href="/workout" label="Schede Allenamento" />
              <NavLink href="/nutrition" label="Piani Alimentazione" />
              <div className="divider" />
              {me?.role === "coach" ? <NavLink href="/coach" label="Coach" /> : null}
              {me?.role === "admin" ? <NavLink href="/admin" label="Admin" /> : null}
            </>
          )}
          <div className="divider" />
          <div className="small">
            Consiglio: imposta RLS su Supabase e usa un solo progetto collegato.
          </div>
        </aside>

        <main style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
