import Link from "next/link";
import { AppHeader } from "../components/AppHeader";
import { Badge } from "../components/Badge";
import { ShieldCheckIcon, CalendarIcon, WalletIcon, ArrowRightIcon } from "../components/icons";
import { th } from "../lib/strings";

const SURFACES = [
  { href: "/flow", icon: <CalendarIcon />, title: th.home.flowLink, desc: th.home.flowDesc, testid: "flow-link" },
  { href: "/ops", icon: <ShieldCheckIcon />, title: th.home.opsLink, desc: th.home.opsDesc, testid: "ops-link" },
  { href: "/finance", icon: <WalletIcon />, title: th.home.financeLink, desc: th.home.financeDesc, testid: "finance-link" },
];

export default function Home() {
  return (
    <>
      <AppHeader current="/" />
      <main className="page" style={{ maxWidth: 1080 }}>
        <section className="hero">
          <div>
            <span className="hero__eyebrow">
              <ShieldCheckIcon /> {th.home.phase}
            </span>
            <h1>{th.home.tagline}</h1>
            <p className="lead muted">{th.home.description}</p>
            <div className="trust-row">
              {th.home.trust.map((t) => (
                <Badge key={t} variant="success">
                  ✓ {t}
                </Badge>
              ))}
            </div>
            <div className="hero__actions">
              <Link href="/flow" className="btn btn--primary btn--lg" data-testid="hero-flow-link">
                {th.home.ctaPrimary} <ArrowRightIcon />
              </Link>
              <a href="#how" className="btn btn--ghost btn--lg">
                {th.home.ctaSecondary}
              </a>
            </div>
          </div>

          {/* A stylized "Payment Protected" booking, so the hero shows the product, not just copy. */}
          <div className="hero__visual" aria-hidden>
            <div className="mockcard">
              <div className="mockcard__row">
                <span className="mockcard__avatar">พ</span>
                <div>
                  <div className="mockcard__name">พญ. ธนพร ก.</div>
                  <div className="mockcard__meta">อายุรแพทย์ · ตรวจสอบแล้ว</div>
                </div>
                <span className="mockcard__stamp" style={{ marginInlineStart: "auto" }}>
                  <ShieldCheckIcon /> ยืนยันแล้ว
                </span>
              </div>
              <div className="mockcard__divide" />
              <div className="mockcard__line"><span>เวร · คลินิกสุขุมวิท</span><span>8 ชม.</span></div>
              <div className="mockcard__line"><span>ค่าตอบแทน</span><span>฿10,000.00</span></div>
              <div className="mockcard__line"><span>ค่าบริการ 12%</span><span>฿1,200.00</span></div>
              <div className="mockcard__divide" />
              <div className="mockcard__line mockcard__total"><span>รวม</span><span>฿11,200.00</span></div>
              <span className="mockcard__stamp"><WalletIcon /> คุ้มครองการชำระเงิน</span>
            </div>
          </div>
        </section>

        <section id="how">
          <div className="section-head">
            <h2>{th.home.howTitle}</h2>
            <p>{th.home.howSubtitle}</p>
          </div>
          <div className="steps">
            {th.home.steps.map((s, i) => (
              <div key={s.t} className="step">
                <div className="step__num">{i + 1}</div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="try">
          <div className="section-head">
            <h2>{th.home.tryTitle}</h2>
            <p>{th.home.trySubtitle}</p>
          </div>
          <div className="steps">
            {th.home.trySteps.map((s) => (
              <div key={s.t} className="step">
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="section-head">
            <h2>{th.home.surfacesTitle}</h2>
          </div>
          <div className="cta-grid">
            {SURFACES.map((c) => (
              <Link key={c.href} href={c.href} className="cta-card" data-testid={c.testid}>
                <span className="cta-card__icon">{c.icon}</span>
                <span className="cta-card__title">{c.title}</span>
                <span className="cta-card__desc">{c.desc}</span>
                <span className="cta-card__arrow">
                  {th.home.open} <ArrowRightIcon />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <footer className="footer">ProBooking · เฟส 0 · กรุงเทพฯ และปริมณฑล</footer>
      </main>
    </>
  );
}
