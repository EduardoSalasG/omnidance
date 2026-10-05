"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { PartnerAvatar } from "@/components/sessions/PartnerAvatar";

type Instructor = {
  personId: string;
  name: string | null;
  photoUrl: string | null;
};

const VISIBLE_INSTRUCTORS = 2;

/** Sección "Profesores" de la ficha pública — 2 visibles; el resto tras
    "ver más" (misma progressive disclosure de /bailes). `moreLabel`
    llega como string con "{count}" porque las props server→client deben
    ser serializables. */
export function InstructorsSection({
  instructors,
  title,
  moreLabel,
  fewerLabel,
}: {
  instructors: Instructor[];
  title: string;
  /** p.ej. "Ver {count} más". */
  moreLabel: string;
  fewerLabel: string;
}) {
  const [all, setAll] = useState(false);
  const more = Math.max(0, instructors.length - VISIBLE_INSTRUCTORS);
  const visible = all ? instructors : instructors.slice(0, VISIBLE_INSTRUCTORS);

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
        {title}
      </h2>
      <ul className="flex flex-col gap-3">
        {visible.map((i) => (
          <li key={i.personId} className="flex items-center gap-3">
            <PartnerAvatar name={i.name ?? "—"} photoUrl={i.photoUrl} size="md" />
            <p className="font-medium">{i.name ?? "—"}</p>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <div className="mt-3 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={all}
            onClick={() => setAll((v) => !v)}
          >
            {all ? fewerLabel : moreLabel.replace("{count}", String(more))}
          </Button>
        </div>
      )}
    </Card>
  );
}
