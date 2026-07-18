import Link from "next/link";
import { AppHeader } from "../components/AppHeader";
import { ButtonLink, ButtonAnchor } from "../components/Button";
import {
  ShieldCheckIcon,
  CalendarIcon,
  WalletIcon,
  ArrowRightIcon,
  ClinicIcon,
  StethoscopeIcon,
  UsersIcon,
} from "../components/icons";
import { th } from "../lib/strings";

const AUDIENCES = [
  {
    href: "/journey",
    icon: <ClinicIcon />,
    title: th.home.audienceClinic,
    desc: th.home.audienceClinicDesc,
    testid: "audience-clinic",
  },
  {
    href: "/journey",
    icon: <StethoscopeIcon />,
    title: th.home.audiencePro,
    desc: th.home.audienceProDesc,
    testid: "audience-pro",
  },
  {
    href: "/ops",
    icon: <UsersIcon />,
    title: th.home.audienceStaff,
    desc: th.home.audienceStaffDesc,
    testid: "audience-staff",
  },
];

const SURFACES = [
  {
    href: "/journey",
    icon: <CalendarIcon />,
    title: th.home.journeyLink,
    desc: th.home.journeyDesc,
    testid: "journey-link",
  },
  {
    href: "/ops",
    icon: <ShieldCheckIcon />,
    title: th.home.opsLink,
    desc: th.home.opsDesc,
    testid: "ops-link",
  },
  {
    href: "/finance",
    icon: <WalletIcon />,
    title: th.home.financeLink,
    desc: th.home.financeDesc,
    testid: "finance-link",
  },
  {
    href: "/flow",
    icon: <CalendarIcon />,
    title: th.home.flowLink,
    desc: th.home.flowDesc,
    testid: "flow-link",
  },
];

export default function Home() {
  return (
    <>
      <AppHeader current="/" />
      <main id="main" className="page page--wide">
        <section className="hero">
          <div>
            <p className="hero__brand">{th.brand}</p>
            <span className="hero__eyebrow">
              <ShieldCheckIcon /> {th.home.phase}
            </span>
            <h1>{th.home.tagline}</h1>
            <p className="lead muted">{th.home.description}</p>
            <div className="hero__actions">
              <ButtonLink href="/journey" variant="primary" size="lg" data-testid="hero-journey-link">
                {th.home.ctaPrimary} <ArrowRightIcon />
              </ButtonLink>
              <ButtonAnchor href="#how" variant="ghost" size="lg">
                {th.home.ctaSecondary}
              </ButtonAnchor>
            </div>
          </div>

          {/* Product moment: the protected booking checkout the marketplace actually settles. */}
          <div className="hero__visual" aria-hidden>
            <div className="mockcard">
              <div className="mockcard__row">
                <span className="mockcard__avatar">พ</span>
                <div>
                  <div className="mockcard__name">พญ. ธนพร ก.</div>
                  <div className="mockcard__meta">อายุรแพทย์ · ตรวจสอบแล้ว</div>
                </div>
                <span className="mockcard__stamp mockcard__stamp--end">
                  <ShieldCheckIcon /> ยืนยันแล้ว
                </span>
              </div>
              <div className="mockcard__divide" />
              <div className="mockcard__line">
                <span>เวร · คลินิกสุขุมวิท</span>
                <span>8 ชม.</span>
              </div>
              <div className="mockcard__line">
                <span>ค่าตอบแทน</span>
                <span>฿10,000.00</span>
              </div>
              <div className="mockcard__line">
                <span>ค่าบริการ 12%</span>
                <span>฿1,200.00</span>
              </div>
              <div className="mockcard__divide" />
              <div className="mockcard__line mockcard__total">
                <span>รวม</span>
                <span>฿11,200.00</span>
              </div>
              <span className="mockcard__stamp">
                <WalletIcon /> คุ้มครองการชำระเงิน
              </span>
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

        <p className="trust-line" aria-label={th.home.trust.join(" · ")}>
          {th.home.trust.map((t, i) => (
            <span key={t}>
              {i > 0 && <span className="trust-line__dot" aria-hidden>
                ·
              </span>}
              {t}
            </span>
          ))}
        </p>

        <section>
          <div className="section-head">
            <h2>{th.home.audiencesTitle}</h2>
            <p>{th.home.audiencesSubtitle}</p>
          </div>
          <div className="cta-grid cta-grid--3">
            {AUDIENCES.map((c) => (
              <Link key={c.testid} href={c.href} className="cta-card" data-testid={c.testid}>
                <span className="cta-card__icon">{c.icon}</span>
                <span className="cta-card__title">{c.title}</span>
                <span className="cta-card__desc">{c.desc}</span>
                <span className="cta-card__arrow">
                  {th.home.open} <ArrowRightIcon />
                </span>
              </Link>
            ))}
          </div>
          <p className="contact-note muted">{th.home.contactNote}</p>
        </section>

        <section>
          <div className="section-head">
            <h2>{th.home.surfacesTitle}</h2>
            <p>{th.home.surfacesSubtitle}</p>
          </div>
          <div className="cta-grid">
            {SURFACES.map((c) => (
              <Link key={c.href + c.testid} href={c.href} className="cta-card" data-testid={c.testid}>
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

        <footer className="footer">
          <span className="footer__brand">
            <span className="brand__mark" aria-hidden>
              P
            </span>
            ProBooking
          </span>
          <span>เฟส 0 · กรุงเทพฯ และปริมณฑล</span>
        </footer>
      </main>
    </>
  );
}
