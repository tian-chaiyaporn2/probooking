import Link from "next/link";
import { AppHeader } from "../components/AppHeader";
import { RolePicker } from "../components/RolePicker";
import { ShieldCheckIcon, WalletIcon } from "../components/icons";
import { th } from "../lib/strings";

export default function Home() {
  return (
    <>
      <AppHeader current="/" />
      <main id="main" className="page page--wide">
        <section className="hero">
          <div>
            <p className="hero__brand">{th.brand}</p>
            <span className="hero__eyebrow">
              <ShieldCheckIcon /> {th.home.region}
            </span>
            <h1>{th.home.tagline}</h1>
            <p className="lead muted">{th.home.lead}</p>
            <p className="trust-line trust-line--hero" aria-label={th.home.trust.join(" · ")}>
              {th.home.trust.map((t, i) => (
                <span key={t}>
                  {i > 0 && <span className="trust-line__dot" aria-hidden>·</span>}
                  {t}
                </span>
              ))}
            </p>
            <div className="hero__cta">
              <a href="#start" className="btn btn--primary btn--lg">{th.home.ctaPrimary}</a>
              <a href="#how" className="btn btn--subtle btn--lg">{th.home.ctaSecondary}</a>
            </div>
          </div>

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
              <div className="mockcard__line"><span>เวร · คลินิกสุขุมวิท</span><span>8 ชม.</span></div>
              <div className="mockcard__line"><span>ค่าตอบแทน</span><span>฿10,000.00</span></div>
              <div className="mockcard__line"><span>ค่าบริการ 12%</span><span>฿1,200.00</span></div>
              <div className="mockcard__divide" />
              <div className="mockcard__line mockcard__total"><span>รวม</span><span>฿11,200.00</span></div>
              <span className="mockcard__stamp"><WalletIcon /> คุ้มครองการชำระเงิน</span>
            </div>
          </div>
        </section>

        <section id="start">
          <div className="section-head">
            <h2>{th.home.pickTitle}</h2>
            <p>{th.home.pickSubtitle}</p>
          </div>
          <RolePicker />
        </section>

        <section id="how">
          <div className="section-head">
            <h2>{th.home.howTitle}</h2>
            <p>{th.home.howSubtitle}</p>
          </div>
          <div className="how-dual">
            <div>
              <h3 className="how-dual__title">{th.home.howClinicTitle}</h3>
              <div className="steps">
                {th.home.stepsClinic.map((s, i) => (
                  <div key={s.t} className="step">
                    <div className="step__num">{i + 1}</div>
                    <h3>{s.t}</h3>
                    <p>{s.d}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="how-dual__title">{th.home.howProTitle}</h3>
              <div className="steps">
                {th.home.stepsPro.map((s, i) => (
                  <div key={s.t} className="step">
                    <div className="step__num">{i + 1}</div>
                    <h3>{s.t}</h3>
                    <p>{s.d}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className="footer">
          <span className="footer__brand">
            <span className="brand__mark" aria-hidden>
              P
            </span>
            ProBooking
          </span>
          <span className="footer__meta">
            <span>{th.home.region}</span>
            <Link href="/flow" className="footer__link" data-testid="flow-link">
              {th.home.flowSmokeNote}
            </Link>
          </span>
        </footer>
      </main>
    </>
  );
}
