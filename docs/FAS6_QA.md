# Fas 6 – QA-checklista

## Automatiserat

- [x] Playwright e2e (data gap, override, RLS, import/calc, GDPR)
- [x] Performance scripts (dashboard < 3s query budget, import < 60s)
- [x] Security audit SQL + dokument
- [x] CI workflow (typecheck, build, migrations, e2e)
- [x] Deploy workflow (db push + Vercel)
- [x] Monitoring metrics + Edge Functions

## Manuellt före production go-live

1. Kör `supabase/tests/security_audit.sql` i SQL Editor – spara resultat
2. Verifiera Vault secret `tenant_encryption_key` finns
3. Deploy Edge Functions + sätt `ALERT_WEBHOOK_URL`
4. Aktivera schemaläggning (cron)
5. Kör `bench-dashboard` och `bench-import` mot staging med realistisk volym
6. Bekräfta PITR/backup i Supabase-planen
7. Rotera alla tokens som delats i chat/e-post
