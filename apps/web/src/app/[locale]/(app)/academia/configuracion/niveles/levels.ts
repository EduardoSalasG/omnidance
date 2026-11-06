import { apiFetch } from "@/lib/api";

export type Level = { id: string; name: string; order: number };

export type LevelsResp = {
  custom: Level[];
  global: Level[];
  usingGlobal: boolean;
};

export type LevelsResult =
  | { kind: "ok"; data: LevelsResp }
  | { kind: "forbidden" }
  | { kind: "error" };

// GET /academies/:id/class-levels (cap "schedule"). Discrimina el
// forbidden del error real: 401/403 son "sin acceso" (staff sin cap),
// el resto es fallo de red/servidor con retry.
export async function loadLevels(academyId: string): Promise<LevelsResult> {
  const res = await apiFetch(`/academies/${academyId}/class-levels`).catch(
    () => null,
  );
  if (!res) return { kind: "error" };
  if (res.status === 401 || res.status === 403) return { kind: "forbidden" };
  if (!res.ok) return { kind: "error" };
  return { kind: "ok", data: (await res.json()) as LevelsResp };
}
