export type PartnerAvatarProps = {
  name: string;
  photoUrl: string | null;
  size?: "sm" | "md" | "lg";
};

/** Avatar de la pareja de baile: foto o inicial (mismo patrón que el lineup de eventos). */
export function PartnerAvatar({
  name,
  photoUrl,
  size = "md",
}: PartnerAvatarProps) {
  const dims =
    size === "lg"
      ? "h-16 w-16 text-2xl"
      : size === "sm"
        ? "h-8 w-8 text-xs"
        : "h-12 w-12 text-base";

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URLs externas, dominios no configurados
      <img
        src={photoUrl}
        alt=""
        className={`${dims} shrink-0 rounded-full border border-night-700 object-cover`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${dims} flex shrink-0 items-center justify-center rounded-full border border-night-700 bg-night-800 font-bold text-neon`}
    >
      {name.charAt(0).toUpperCase() || "?"}
    </span>
  );
}
