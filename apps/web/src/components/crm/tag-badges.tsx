"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui";
import type { CrmTag } from "./types";

/** Chips de ActorTag de una persona; opcionalmente con botón de borrado
 * (DELETE /crm/tags/:id — el tag es por persona, no un catálogo). */
export function TagBadges({
  tags,
  onDelete,
  deleting,
}: {
  tags: CrmTag[];
  onDelete?: (tag: CrmTag) => void;
  deleting?: string | null;
}) {
  const t = useTranslations("crm");
  if (tags.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <li key={tag.id}>
          <Badge variant="outline" className="normal-case">
            {tag.tag}
            {onDelete && (
              <button
                type="button"
                aria-label={t("people.deleteTag", { tag: tag.tag })}
                disabled={deleting === tag.id}
                onClick={() => onDelete(tag)}
                className="-mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                ×
              </button>
            )}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
