# Confession Board

A calm, anonymous confession wall with a shared global feed powered by Supabase.

## Features

- Anonymous, text-only confessions
- Required public/private label on every submission
- Global feed shared across all users
- Reverse-chronological ordering with infinite scroll
- No accounts, cookies, or tracking

## Supabase setup (free tier)

Create a new Supabase project and run the SQL below in the SQL editor:

```sql
create extension if not exists pgcrypto;

create table if not exists public.confessions (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  visibility text not null check (visibility in ('public', 'private')),
  created_at timestamptz not null default now()
);

alter table public.confessions enable row level security;

create policy "confessions_read_all" on public.confessions
  for select
  using (true);

create policy "confessions_insert_all" on public.confessions
  for insert
  with check (true);
```

## Configure environment variables

Copy `.env.example` to `.env`, then set:

- `VITE_SUPABASE_URL=https://jqhjkalemjahlwlvjnvo.supabase.co`
- `VITE_SUPABASE_ANON_KEY=sb_publishable_tlddzYQ2ztJ_p6doUG-wXQ_XQVEyMeP`

Reminder: do not commit `.env`.

## Run locally

```powershell
node server.js
```

Open `http://localhost:5173` in your browser.

## Notes

- The visibility toggle is a label only; every confession appears in the global feed.
- The Supabase anon key is exposed client-side by design. Do not commit secrets.
