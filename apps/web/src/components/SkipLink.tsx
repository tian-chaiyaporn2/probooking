import { th } from "../lib/strings";

/** Keyboard-accessible skip link — visible on focus only. */
export function SkipLink() {
  return (
    <a href="#main-content" className="skip-link">
      {th.a11y.skipToContent}
    </a>
  );
}
