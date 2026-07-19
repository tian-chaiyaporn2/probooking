import Link from "next/link";
import { AppHeader } from "../components/AppHeader";
import { ButtonAnchor } from "../components/Button";
import { HowItWorks } from "../components/HowItWorks";
import { RolePicker } from "../components/RolePicker";
import { TrustLine } from "../components/TrustLine";
import { ShieldCheckIcon, WalletIcon } from "../components/icons";
import { th } from "../lib/strings";

/**
 * Landing: hero sells the promise, contact captures real interest, RolePicker is the demo entry.
 * Journey + audience paths sit below as secondary orientation.
 */
export default function Home() {
  return (
    <>
      <AppHeader current="/" />
      <main id="main" className="page page--wide">
        <section className="hero">
          <div className="hero__copy">
            <p className="hero__brand">{th.brand}</p>
            <span className="hero__eyebrow">
              <ShieldCheckIcon /> {th.home.marketSignal}
            </span>
            <h1>{th.home.tagline}</h1>
            <p className="lead muted">{th.home.lead}</p>
            <TrustLine className="trust-line--hero" />
            <div className="hero__actions">
              <ButtonAnchor
                href="#start"
                variant="primary"
                size="lg"
                data-testid="hero-cta-primary"
              >
                {th.home.ctaPrimary}
              </ButtonAnchor>
              <ButtonAnchor
                href="#how"
                variant="ghost"
                size="lg"
                data-testid="hero-cta-secondary"
              >
                {th.home.ctaSecondary}
              </ButtonAnchor>
            </div>
          </div>

          <div className="hero__visual" aria-hidden>
            <p className="hero__visual-caption">
              <WalletIcon /> คุ้มครองการชำระเงิน · ตัวอย่างสรุปค่าใช้จ่าย
            </p>
            <div className="mockcard">
              <div className="mockcard__row">
                <span className="mockcard__avatar">ส</span>
                <div>
                  <div className="mockcard__name">สมชาย ใจดี</div>
                  <div className="mockcard__meta">ผู้ช่วยทันตแพทย์ · ตรวจสอบแล้ว</div>
                </div>
                <span className="mockcard__stamp mockcard__stamp--end">
                  <ShieldCheckIcon /> ยืนยันแล้ว
                </span>
              </div>
              <div className="mockcard__divide" />
              <div className="mockcard__line">
                <span>งาน · คลินิกสุขุมวิท</span>
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

        <section id="contact" className="contact-block" data-testid="contact-block">
          <div className="section-head">
            <h2>{th.home.contactTitle}</h2>
            <p>{th.home.contactNote}</p>
          </div>
          <p className="contact-note">
            <a
              href={`mailto:${th.home.contactEmail}?subject=${encodeURIComponent(th.home.contactMailtoSubject)}`}
              className="btn btn--primary btn--lg"
              data-testid="contact-cta"
            >
              {th.home.contactCta}
            </a>
          </p>
        </section>

        <section id="start">
          <div className="section-head">
            <h2>{th.home.pickTitle}</h2>
            <p>{th.home.pickSubtitle}</p>
            <p className="guided-demo muted" data-testid="guided-demo">
              {th.home.guidedDemo}
            </p>
          </div>
          <RolePicker />
        </section>

        <section id="orient" aria-labelledby="orient-heading">
          <div className="section-head">
            <h2 id="orient-heading">{th.home.audiencesTitle}</h2>
            <p>{th.home.audiencesSubtitle}</p>
          </div>
          <div className="home-surfaces cta-grid--3">
            <Link
              href="/journey"
              className="home-surface cta-card"
              data-testid="home-journey"
            >
              <span className="home-surface__title">{th.home.journeyLink}</span>
              <p className="home-surface__desc">{th.home.journeyDesc}</p>
              <span className="home-surface__cta">{th.home.open} →</span>
            </Link>
            <Link
              href="#contact"
              className="home-surface cta-card"
              data-testid="home-clinic-path"
            >
              <span className="home-surface__title">{th.home.audienceClinic}</span>
              <p className="home-surface__desc">{th.home.audienceClinicDesc}</p>
              <span className="home-surface__cta">{th.home.audienceClinicCta} →</span>
            </Link>
            <Link
              href="#start"
              className="home-surface cta-card"
              data-testid="home-pro-path"
            >
              <span className="home-surface__title">{th.home.audiencePro}</span>
              <p className="home-surface__desc">{th.home.audienceProDesc}</p>
              <span className="home-surface__cta">{th.home.audienceProCta} →</span>
            </Link>
            <Link
              href="/signin#staff"
              className="home-surface cta-card"
              data-testid="home-staff-path"
            >
              <span className="home-surface__title">{th.home.audienceStaff}</span>
              <p className="home-surface__desc">{th.home.audienceStaffDesc}</p>
              <span className="home-surface__cta">{th.home.audienceStaffCta} →</span>
            </Link>
          </div>
        </section>

        <HowItWorks />

        <p className="phase-note muted" data-testid="phase-note">
          {th.home.phaseNote}
        </p>

        <footer className="footer">
          <span className="footer__brand">
            <span className="brand__mark" aria-hidden>
              P
            </span>
            {th.brand}
          </span>
          <span className="footer__meta">
            <span>{th.home.phase}</span>
            <Link
              href="/journey"
              className="footer__link"
              data-testid="journey-link"
            >
              {th.home.journeyLink}
            </Link>
            <Link href="/flow" className="footer__link" data-testid="flow-link">
              {th.home.flowSmokeNote}
            </Link>
          </span>
        </footer>
      </main>
    </>
  );
}
