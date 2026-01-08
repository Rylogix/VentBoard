# Confession Board

A calm, anonymous confession wall with a shared global feed powered by Supabase.

## Features

- Anonymous, text-only confessions
- Required public/private label on every submission
- Replies on each confession
- Global feed shared across all users
- Reverse-chronological ordering with infinite scroll
- No accounts, cookies, or tracking

## Supabase setup free tier

Create a new Supabase project and run the SQL below in the SQL editor:

```sql
create extension if not exists pgcrypto;

create table if not exists public.confessions (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  name text,
  visibility text not null check (visibility in ('public', 'private')),
  created_at timestamptz not null default now()
);

create table if not exists public.confession_replies (
  id uuid primary key default gen_random_uuid(),
  confession_id uuid not null references public.confessions(id) on delete cascade,
  content text not null,
  user_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.confession_replies enable row level security;

alter table public.confessions enable row level security;

create policy "confessions_read_all" on public.confessions
  for select
  using (true);

create policy "confessions_insert_all" on public.confessions
  for insert
  with check (true);

create policy "confession_replies_read_all" on public.confession_replies
  for select
  using (true);

create policy "confession_replies_insert_all" on public.confession_replies
  for insert
  with check (true);
```

If you already created the table without `created_at`, run:

```sql
alter table public.confessions
  add column if not exists created_at timestamptz not null default now();
```

If you already created the table without `name`, run:

```sql
alter table public.confessions
  add column if not exists name text;
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

## GitHub Pages deployment

Set repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The `Deploy GitHub Pages` workflow generates `config.js` from secrets during deploy.

## Notes

- Public submissions show the provided name; anonymous submissions omit it and are not shown in the public feed.
- The Supabase anon key is exposed client-side by design. Do not commit secrets.
