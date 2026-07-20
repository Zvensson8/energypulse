# Edge Functions – monitoring

## Deploy

```bash
npx supabase functions deploy data-freshness-alert --project-ref jbnttxywunvvvivdfzeh
npx supabase functions deploy metrics-snapshot --project-ref jbnttxywunvvvivdfzeh
```

## Secrets

```bash
npx supabase secrets set ALERT_WEBHOOK_URL=https://hooks.slack.com/... FRESHNESS_MAX_DAYS=45
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.

## Cron (Dashboard → Edge Functions → Schedules)

| Function | Cron | Purpose |
|----------|------|---------|
| `metrics-snapshot` | `0 * * * *` | Hourly metrics + calc latency probe |
| `data-freshness-alert` | `0 7 * * *` | Daily stale-building alert + webhook |

## Alternative: pg_cron

```sql
-- Enable extensions: pg_cron, pg_net (Dashboard)
SELECT cron.schedule(
  'energypulse-ops-metrics',
  '0 * * * *',
  $$SELECT public.snapshot_ops_metrics();$$
);
```
