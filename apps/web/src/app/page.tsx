import { th } from "../lib/strings";

/**
 * Landing shell. The customer promise (PRD §1.2) is the north-star copy, rendered in
 * Thai (LOC-01). Real marketplace routes are added per Phase 1 scope.
 */
export default function Home() {
  return (
    <main className="page" style={{ maxWidth: 720 }}>
      <h1>{th.brand}</h1>
      <p style={{ fontSize: "1.25rem", color: "#444" }}>{th.home.tagline}</p>
      <p>{th.home.description}</p>
      <p style={{ color: "#888", fontSize: "0.9rem" }}>{th.home.phase}</p>
      <p>
        <a href="/flow" data-testid="flow-link">
          {th.home.flowLink}
        </a>
      </p>
      <p>
        <a href="/ops" data-testid="ops-link">
          {th.home.opsLink}
        </a>
      </p>
      <p>
        <a href="/finance" data-testid="finance-link">
          {th.home.financeLink}
        </a>
      </p>
    </main>
  );
}
