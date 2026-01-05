import Link from "next/link";

export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ fontSize: 18, fontWeight: 750 }}>{title}</div>
      <div className="small" style={{ marginTop: 8 }}>{description}</div>
      {actionHref && actionLabel ? (
        <div style={{ marginTop: 14 }}>
          <Link className="btn btnPrimary" href={actionHref}>{actionLabel}</Link>
        </div>
      ) : null}
    </div>
  );
}
