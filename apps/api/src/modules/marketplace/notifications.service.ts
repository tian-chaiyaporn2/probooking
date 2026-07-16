import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  MARKETPLACE_REPOSITORY,
  type MarketplaceRepository,
  type NotificationChannel,
  type NotificationInput,
} from "./marketplace.types.js";

interface Ref {
  type: string;
  id: string;
}

/**
 * NOT-01 notifications. Email covers all critical events; SMS covers offers near
 * expiry, payment required, confirmation, cancellation, and reminders. The email/SMS
 * providers (§7.2) are mocked here — sends are logged and recorded for audit. Sends
 * are best-effort: a notification failure must never fail the triggering action
 * (§7.4 "critical actions remain available during partial notification failure").
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger("Notifications");

  constructor(@Inject(MARKETPLACE_REPOSITORY) private readonly repo: MarketplaceRepository) {}

  email(to: string, event: string, ref?: Ref): Promise<void> {
    return this.send("email", to, event, ref);
  }

  sms(to: string, event: string, ref?: Ref): Promise<void> {
    return this.send("sms", to, event, ref);
  }

  private async send(channel: NotificationChannel, to: string, event: string, ref?: Ref): Promise<void> {
    const input: NotificationInput = { channel, to, event };
    if (ref) {
      input.refType = ref.type;
      input.refId = ref.id;
    }
    try {
      await this.repo.recordNotification(input);
      this.logger.log(`${channel} → ${to} : ${event}${ref ? ` (${ref.type}:${ref.id})` : ""}`);
    } catch (e) {
      this.logger.warn(`notify failed (${channel}/${event}): ${(e as Error).message}`);
    }
  }
}
