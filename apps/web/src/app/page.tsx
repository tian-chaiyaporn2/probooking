import { AppHeader } from "../lib/AppHeader";
import { Badge } from "../lib/ui";
import { th } from "../lib/strings";

const CTAS = [
  { href: "/flow", title: th.home.flowLink },
  { href: "/ops", title: th.home.opsLink },
  { href: "/finance", title: th.home.financeLink },
];

const TRUST = ["ตรวจสอบแล้ว", "พร้อมทำงาน", "จองได้", "คุ้มครองการชำระเงิน"];

export default function Home() {
  return (
    <>
      <AppHeader current="/" />
      <main className="page" style={{ maxWidth: 960 }}>
        <section className="hero">
          <div className="hero__eyebrow">{th.home.phase}</div>
          <h1>{th.home.tagline}</h1>
          <p className="lead muted" style={{ maxWidth: "48ch" }}>
            {th.home.description}
          </p>
          <div className="trust-row">
            {TRUST.map((t) => (
              <Badge key={t} variant="success">
                ✓ {t}
              </Badge>
            ))}
          </div>
        </section>

        <section className="cta-grid">
          {CTAS.map((c) => (
            <a key={c.href} href={c.href} className="cta-card" data-testid={`${c.href.slice(1) || "flow"}-link`}>
              <div className="cta-card__title">{c.title.replace(/^→\s*/, "")}</div>
              <span className="cta-card__arrow">เปิด →</span>
            </a>
          ))}
        </section>

        <footer className="footer">ProBooking · เฟส 0 · กรุงเทพฯ และปริมณฑล</footer>
      </main>
    </>
  );
}
