"use client";

import { useState } from "react";
import { Button } from "./Button";
import { th } from "../lib/strings";

type Perspective = "clinic" | "pro";

/**
 * Landing how-it-works with clinic/pro perspective toggle — same four beats, different subject.
 */
export function HowItWorks() {
  const [perspective, setPerspective] = useState<Perspective>("clinic");
  const steps =
    perspective === "clinic" ? th.home.stepsClinic : th.home.stepsPro;

  return (
    <section id="how" aria-labelledby="how-heading">
      <div className="section-head">
        <h2 id="how-heading">{th.home.howTitle}</h2>
        <p>{th.home.howSubtitle}</p>
      </div>

      <div
        className="how-toggle"
        role="group"
        aria-label={th.home.howSubtitle}
        data-testid="how-perspective"
      >
        <Button
          variant={perspective === "clinic" ? "primary" : "subtle"}
          aria-pressed={perspective === "clinic"}
          onClick={() => setPerspective("clinic")}
          data-testid="how-clinic"
        >
          {th.home.howPerspectiveClinic}
        </Button>
        <Button
          variant={perspective === "pro" ? "primary" : "subtle"}
          aria-pressed={perspective === "pro"}
          onClick={() => setPerspective("pro")}
          data-testid="how-pro"
        >
          {th.home.howPerspectivePro}
        </Button>
      </div>

      <div className="steps" data-testid="how-steps">
        {steps.map((s, i) => (
          <div key={`${perspective}-${s.t}`} className="step">
            <div className="step__num">{i + 1}</div>
            <h3>{s.t}</h3>
            <p>{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
