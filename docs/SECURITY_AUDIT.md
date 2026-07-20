# EnergyPulse v2.0 – Säkerhetsgranskning (Fas 6)

**Datum:** 2026-07-19  
**Scope:** RLS, GDPR tenant_name, Vault, decrypt-audit

## Sammanfattning

| Kontroll | Status | Kommentar |
|----------|--------|-----------|
| RLS på alla apptabeller | ✅ Design | Aktiverad i Fas 1/2-migreringar |
| tenant_name i klartext i DB | ✅ | Endast `tenant_name_encrypted` (bytea) |
| Maskerad view | ✅ | `spaces_safe` → `***MASKERAD***` |
| Decrypt kräver behörighet | ✅ | `app.decrypt_tenant_name` / `decrypt_tenant_name_audit`; viewer blockeras |
| Decrypt loggas | ✅ | `data_quality_logs.operation = 'DECRYPT'` |
| Vault för nyckel | ⚠️ | `vault.create_secret('tenant_encryption_key')` – verifiera i prod att secret finns |
| Anon utan JWT | ✅ | Tomma resultatmängder (e2e) |
| property_manager scope | ✅ | `user_properties` junction + RLS helpers |

## Tenant_name – hotmodell

| Attack | Mitigation |
|--------|------------|
| SELECT spaces_safe | Alltid maskerat |
| SELECT spaces.tenant_name_encrypted | Ciphertext; kräver pgcrypto-nyckel |
| RPC decrypt utan roll | Exception viewer; access check på building |
| API-lek av raw table i frontend | App använder **endast** `spaces_safe` i hooks/actions |
| Nyckelläcka i klient | Nyckel i Vault / server-only; aldrig `NEXT_PUBLIC_*` |

## Vault

1. Secret-namn: `tenant_encryption_key`
2. Skapas i migrering om `vault` schema finns
3. Fallback (dev): GUC `app.tenant_encryption_key` / dev-nyckel i `app.get_tenant_encryption_key()`
4. **Produktion:** Byt secret, inaktivera dev-fallback (rekommenderas: fail hard om Vault saknas)

## RLS-checklist (manual)

Kör `supabase/tests/security_audit.sql` i SQL Editor.

Förväntat:
- Alla listade tabeller har `rls_enabled = true`
- Inga apptabeller i "WITHOUT RLS"
- Policy count ≥ 1 per tabell
- `spaces` har **inte** kolumn `tenant_name` (text)

## Rekommenderade skärpningar (post-MVP)

1. `FORCE ROW LEVEL SECURITY` på känsliga tabeller
2. Revoke SELECT on `spaces` from `authenticated` – tvinga `spaces_safe`
3. Rate-limit på `decrypt_tenant_name_audit`
4. Alert om DECRYPT-frekvens > N/timme
5. Periodisk pentest av PostgREST OpenAPI

## E2E-täckning

- `e2e/tests/rls-property-manager.spec.ts`
- `e2e/tests/security-tenant.spec.ts`
