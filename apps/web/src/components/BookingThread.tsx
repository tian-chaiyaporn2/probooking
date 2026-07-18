"use client";

import { useCallback, useEffect, useState } from "react";
import { containsProhibitedPatientData } from "@probook/domain";
import {
  listMessages,
  postMessage,
  getBookingContact,
  type BookingMessage,
  type BookingContact,
} from "../lib/api";
import { getThaiErrorMessage, th } from "../lib/strings";
import { Button } from "./Button";
import { useToast } from "./Toast";

/**
 * Booking thread (MSG-01/02): plain-text messages + contact reveal after confirm.
 * Soft-warns client-side when §7.3 prohibited patient identifiers appear in draft text.
 */
export function BookingThread({
  bookingId,
  token,
  selfId,
}: {
  bookingId: string;
  token: string;
  /** Caller's party id (workspace or professional) — labels "you" vs counterparty. */
  selfId?: string | null;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<BookingMessage[]>([]);
  const [contact, setContact] = useState<BookingContact | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const softWarn =
    draft.trim().length > 0 && containsProhibitedPatientData(draft);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [m, c] = await Promise.all([
        listMessages(bookingId, token),
        getBookingContact(bookingId, token).catch(() => ({
          clinicPhone: null,
          professionalPhone: null,
        })),
      ]);
      setMessages(m.messages);
      setContact(c);
    } catch (e) {
      toast.error(getThaiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [bookingId, token, toast]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  async function send() {
    const body = draft.trim();
    if (!body || softWarn) return;
    setBusy(true);
    try {
      await postMessage(bookingId, body, token);
      setDraft("");
      await refresh();
    } catch (e) {
      toast.error(getThaiErrorMessage(e, th.party.messageBlocked));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="thread" data-testid={`thread-${bookingId}`}>
      <Button
        variant="subtle"
        data-testid="thread-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? th.party.hideThread : th.party.showThread}
      </Button>
      {open && (
        <div className="thread__panel" style={{ marginTop: "var(--s3)" }}>
          {contact && (contact.clinicPhone || contact.professionalPhone) ? (
            <p
              className="muted"
              style={{ fontSize: "0.82rem", margin: "0 0 var(--s3)" }}
            >
              {th.party.contactReveal}:{" "}
              {contact.clinicPhone
                ? `${th.party.clinicPhone} ${contact.clinicPhone}`
                : null}
              {contact.clinicPhone && contact.professionalPhone ? " · " : null}
              {contact.professionalPhone
                ? `${th.party.proPhone} ${contact.professionalPhone}`
                : null}
            </p>
          ) : null}
          {loading && messages.length === 0 ? (
            <p className="muted">{th.common.loading}</p>
          ) : (
            <ul className="thread__list" data-testid="thread-messages">
              {messages.length === 0 && (
                <li className="empty muted">{th.party.noMessages}</li>
              )}
              {messages.map((m) => {
                const mine = selfId && m.senderId === selfId;
                return (
                  <li
                    key={m.id}
                    className={
                      mine ? "thread__msg thread__msg--mine" : "thread__msg"
                    }
                  >
                    <span className="thread__meta muted">
                      {mine ? th.party.you : m.senderId.slice(0, 8)} ·{" "}
                      {new Date(m.createdAt).toLocaleString("th-TH")}
                    </span>
                    <span className="thread__body">{m.body}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <label
            className="thread__compose"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              marginTop: "var(--s3)",
            }}
          >
            <span className="muted" style={{ fontSize: "0.82rem" }}>
              {th.party.messageHint}
            </span>
            <textarea
              data-testid="thread-draft"
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={th.party.messagePlaceholder}
              style={{
                width: "100%",
                padding: "0.5rem 0.7rem",
                borderRadius: 8,
                border: softWarn
                  ? "1px solid var(--warn, #b45309)"
                  : "1px solid var(--line)",
                background: "var(--bg)",
                color: "var(--text)",
                resize: "vertical",
              }}
            />
          </label>
          {softWarn ? (
            <p
              role="status"
              className="form-error"
              data-testid="thread-soft-warn"
              style={{ marginTop: 6 }}
            >
              {th.party.messageSoftWarn}
            </p>
          ) : null}
          <div className="actions" style={{ marginTop: 8 }}>
            <Button
              data-testid="thread-send"
              variant="primary"
              busy={busy}
              disabled={!draft.trim() || softWarn}
              onClick={() => void send()}
            >
              {th.party.sendMessage}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
