"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  normalizePhone,
  PHONE_COUNTRIES,
  phoneCountryOf,
} from "@omnidance/shared";

/**
 * PhoneInput (spec multipais-phone P5): campo de teléfono con país.
 *
 * - `showCountrySelector` (default true): selector de país con dial
 *   code + input de número nacional. Perfil/datos, completar perfil y
 *   bienvenida lo usan así.
 * - `showCountrySelector={false}` (modo contexto): sin selector - el
 *   input asume `defaultCountry` (venue del evento en puerta, CL en el
 *   lead form) y tipear "+" cambia a internacional. Un texto de ayuda
 *   muestra el país asumido para no agregar fricción.
 *
 * `onChange` emite `{phone, e164, countryCode}`: `phone` es el texto
 * tal cual (el API re-normaliza), `countryCode` el ISO-2 vigente como
 * hint, y `e164` el E.164 ya validado o null si aún no parsea.
 */
export type PhoneInputChange = {
  phone: string;
  e164: string | null;
  countryCode: string;
};

type Props = {
  /** Texto del input (nacional o "+…"). */
  value: string;
  /** ISO-2 del país por defecto: inicial del selector o país asumido
   * en modo contexto. Un "+" tipeado lo sobreescribe. */
  defaultCountry: string;
  onChange: (next: PhoneInputChange) => void;
  /** false = modo contexto (puerta, lead): sin selector, con hint del
   * país asumido. */
  showCountrySelector?: boolean;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  inputClassName?: string;
  placeholder?: string;
  autoComplete?: string;
  /** A11y del input interno (validación del form padre, p.ej. lead). */
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  /** Enter/Escape en el input (patrón EditField de /perfil/datos). */
  onEnter?: () => void;
  onEscape?: () => void;
};

const inputCls =
  "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink/40 focus:border-neon focus:outline-none";
const selectCls =
  "min-h-11 max-w-[45%] shrink-0 rounded-lg border border-line bg-surface px-2 text-sm text-ink focus:border-neon focus:outline-none";

export function PhoneInput({
  value,
  defaultCountry,
  onChange,
  showCountrySelector = true,
  disabled,
  required,
  id,
  inputClassName,
  placeholder,
  autoComplete = "tel",
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  onEnter,
  onEscape,
}: Props) {
  const t = useTranslations("common");
  const locale = useLocale();
  const contextCountry = defaultCountry.trim().toUpperCase();
  const [country, setCountry] = useState(contextCountry);
  // Prefill tardío: /bienvenida y /perfil/completar cargan el país de
  // /me en un effect DESPUÉS del primer mount - el selector sigue al
  // defaultCountry mientras el usuario no haya interactuado con el
  // campo. Una vez que escribe o elige país, su elección manda.
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) setCountry(contextCountry);
  }, [contextCountry]);

  // Nombres de región en el idioma activo (Intl nativo - sin catálogo
  // propio, igual que los dial codes salen de libphonenumber).
  const regionNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);
  const countryName = (code: string) => regionNames?.of(code) ?? code;

  const options = useMemo(
    () =>
      [...PHONE_COUNTRIES].sort((a, b) =>
        countryName(a.code).localeCompare(countryName(b.code), locale),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [regionNames, locale],
  );

  /** País que manda en este momento: el "+" tipeado declara el suyo;
   * sin "+" rige el selector (o el país de contexto). */
  const resolveCountry = (text: string, base: string) =>
    text.trim().startsWith("+")
      ? (phoneCountryOf(text, null) ?? base)
      : base;

  const baseCountry = showCountrySelector ? country : contextCountry;
  const shownCountry = resolveCountry(value, baseCountry);

  const toE164 = (text: string, cc: string): string | null => {
    try {
      return normalizePhone(text, cc)?.e164 ?? null;
    } catch {
      return null;
    }
  };

  const handleText = (text: string) => {
    touched.current = true;
    const cc = resolveCountry(text, baseCountry);
    // El selector sigue al país que el "+" declaró - si después se borra
    // el "+" queda ese país elegido (el usuario lo corrige del selector).
    setCountry(cc);
    onChange({ phone: text, e164: toE164(text, cc), countryCode: cc });
  };

  const handleSelect = (code: string) => {
    touched.current = true;
    setCountry(code);
    const cc = resolveCountry(value, code);
    onChange({ phone: value, e164: toE164(value, cc), countryCode: cc });
  };

  return (
    <div className="min-w-0">
      <div className="flex items-stretch gap-2">
        {showCountrySelector && (
          <select
            aria-label={t("phone.country")}
            value={shownCountry}
            onChange={(e) => handleSelect(e.target.value)}
            disabled={disabled}
            className={selectCls}
          >
            {options.map((c) => (
              <option key={c.code} value={c.code}>
                {countryName(c.code)} ({c.dialCode})
              </option>
            ))}
          </select>
        )}
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete={autoComplete}
          required={required}
          disabled={disabled}
          value={value}
          onChange={(e) => handleText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEnter?.();
            if (e.key === "Escape") onEscape?.();
          }}
          placeholder={placeholder}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          className={inputClassName ?? inputCls}
        />
      </div>
      {!showCountrySelector && (
        <p className="mt-1 text-[11px] text-ink/40">
          {t("phone.contextHint", { country: countryName(shownCountry) })}
        </p>
      )}
    </div>
  );
}
