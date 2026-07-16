import { Injectable, Logger } from "@nestjs/common";

/**
 * OTP login (AUTH-01). Mock provider: the code is generated and "sent" (logged); in
 * production it goes via the SMS partner. Codes expire after 5 minutes and are single-use.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger("Otp");
  private readonly codes = new Map<string, { code: string; exp: number }>();

  request(phone: string): string {
    // Deterministic in dev so the flow is testable; random + SMS in production.
    const code = "123456";
    this.codes.set(phone, { code, exp: Date.now() + 5 * 60 * 1000 });
    this.logger.log(`OTP for ${phone}: ${code}`);
    return code;
  }

  verify(phone: string, code: string): boolean {
    const rec = this.codes.get(phone);
    if (!rec || rec.exp < Date.now() || rec.code !== code) return false;
    this.codes.delete(phone);
    return true;
  }
}
