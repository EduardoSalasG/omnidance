import type { Person } from "@prisma/client";

export const MAILER = "MAILER";
export const AUTH_REPO = "AUTH_REPO";

export interface Mailer {
  send(to: string, subject: string, html: string): Promise<void>;
}

export interface AuthRepo {
  upsertByEmail(email: string): Promise<Person>;
  findByEmail(email: string): Promise<Person | null>;
  createWithPassword(
    email: string,
    name: string,
    passwordHash: string,
  ): Promise<Person>;
  setPassword(personId: string, passwordHash: string): Promise<void>;
  findById(
    id: string,
  ): Promise<(Person & { roles: { role: string; status: string }[] }) | null>;
}
