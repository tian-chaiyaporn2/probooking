import { AppHeader } from "../components/AppHeader";
import { ButtonLink } from "../components/Button";
import { th } from "../lib/strings";

/** Branded 404 so a missing route still feels like ProBooking, not Next's default. */
export default function NotFound() {
  return (
    <>
      <AppHeader />
      <main id="main" className="page">
        <div className="not-found">
          <p className="not-found__code" aria-hidden>
            404
          </p>
          <h1>{th.notFound.title}</h1>
          <p className="lead muted">{th.notFound.description}</p>
          <ButtonLink href="/" variant="primary" size="lg">
            {th.notFound.home}
          </ButtonLink>
        </div>
      </main>
    </>
  );
}
