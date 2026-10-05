import { Injectable, Logger } from "@nestjs/common";
import type { Mailer } from "../domain/ports";

@Injectable()
export class ResendMailer implements Mailer {
  private readonly logger = new Logger(ResendMailer.name);
  private readonly apiKey = process.env.RESEND_API_KEY;
  // EMAIL_FROM es el nombre documentado en .env.example; MAIL_FROM se
  // acepta por compatibilidad. Con dominio no verificado en Resend usar
  // "Omnidance <onboarding@resend.dev>" (solo entrega al dueño de la key).
  private readonly from =
    process.env.EMAIL_FROM ??
    process.env.MAIL_FROM ??
    "Omnidance <hola@omnidance.cl>";

  async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.apiKey) {
      this.logger.warn(`RESEND_API_KEY no configurada — email a ${to} solo logueado`);
      this.logger.log(html);
      return;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: this.from, to, subject, html }),
    });
    if (!res.ok) {
      throw new Error(`Resend ${res.status}: ${await res.text()}`);
    }
  }
}
