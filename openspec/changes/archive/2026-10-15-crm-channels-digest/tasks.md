# Tasks: crm-channels-digest

## 1. Dominio

- [x] `whatsappLinks(campaignId)` → `{items:[{personId,name,phone,url}],
      total, withoutPhone}` sobre `result.audienceIds` (SENT) o la
      audiencia resuelta (DRAFT), con `?text=` URL-encoded.
- [x] `sendDigests()` handler del job `crm.digest` (default `0 9 * * 1`):
      por actor con RelationshipScore, `notifySafe` al owner con
      conteos por segmento. Registro en scheduler.

## 2. Controller

- [x] `GET /crm/campaigns/:id/whatsapp?text=` (actor access check).

## 3. Web

- [x] Ficha de campaña SENT: textarea de mensaje + lista de personas
      con teléfono, cada una con link wa.me (target _blank); conteo de
      sin-teléfono.
- [x] i18n nuevas keys.

## 4. Verificación + docs

- [x] Specs vitest: links solo con teléfono, texto codificado, digest
      notifica al owner con conteos correctos (ACADEMY y PRODUCER).
- [x] tsc, vitest, openspec, docs, archivar.
