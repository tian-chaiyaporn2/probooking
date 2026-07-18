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
              <ShieldCheckIcon /> {th.home.phase}
            </span>
            <h1>{th.home.tagline}</h1>
            <p className="lead muted">{th.home.description}</p>
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
              <div className="mockcard__line"><span>เวร · คลินิกสุขุมวิท</span><span>8 ชม.</span></div>
              <div className="mockcard__line"><span>ค่าตอบแทน</span><span>฿10,000.00</span></div>
              <div className="mockcard__line"><span>ค่าบริการ 12%</span><span>฿1,200.00</span></div>
              <div className="mockcard__divide" />
              <div className="mockcard__line mockcard__total"><span>รวม</span><span>฿11,200.00</span></div>
              <span className="mockcard__stamp"><WalletIcon /> คุ้มครองการชำระเงิน</span>
            </div>
          </div>
        </section>

        {/* Primary entry point: pick a role and drive the marketplace by hand. */}
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
              {i > 0 && <span className="trust-line__dot" aria-hidden>·</span>}
              {t}
            </span>
          ))}
        </p>

        <footer className="footer">
          <span className="footer__brand">
            <span className="brand__mark" aria-hidden>
              P
            </span>
            ProBooking
          </span>
          <span className="footer__meta">
            <span>เฟส 0 · กรุงเทพฯ และปริมณฑล</span>
            <Link href="/flow" className="footer__link" data-testid="flow-link">
              {th.home.flowSmokeNote}
            </Link>
          </span>
        </footer>
      </main>
    </>
  );
}
