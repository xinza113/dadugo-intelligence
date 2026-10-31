create extension if not exists pgcrypto;
create table if not exists public.users (
 id uuid primary key default gen_random_uuid(),
 username varchar(20) unique not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
 password_hash text not null,
 role text not null default 'user' check(role in ('user','admin')),
 points bigint not null default 1000 check(points >= 0),
 created_at timestamptz not null default now()
);
create table if not exists public.rounds (
 id uuid primary key default gen_random_uuid(),
 m1 int not null check(m1 between 1 and 6),
 m2 int not null check(m2 between 1 and 6),
 m3 int not null check(m3 between 1 and 6),
 total int not null check(total between 3 and 18),
 classification char(1) not null check(classification in ('K','B')),
 telegram_message_ids bigint[] default '{}',
 created_at timestamptz not null default now()
);
create table if not exists public.telegram_dice_events (
 id uuid primary key default gen_random_uuid(),
 chat_id text not null,
 message_id bigint not null,
 value int not null check(value between 1 and 6),
 user_label text,
 round_id uuid references public.rounds(id),
 created_at timestamptz not null default now(),
 unique(chat_id,message_id)
);
create table if not exists public.activity_logs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid references public.users(id),
 action text not null,
 detail jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create table if not exists public.point_transactions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id),
 amount bigint not null,
 reason text not null,
 created_at timestamptz not null default now()
);
create table if not exists public.daily_bonuses (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id),
 bonus_date date not null,
 unique(user_id,bonus_date)
);
create table if not exists public.announcements (
 id uuid primary key default gen_random_uuid(),
 message varchar(500) not null,
 created_by uuid references public.users(id),
 created_at timestamptz not null default now()
);
create index if not exists rounds_created_idx on public.rounds(created_at desc);
create index if not exists activity_created_idx on public.activity_logs(created_at desc);
-- Akun admin dibuat setelah server berjalan (lihat README), jangan menyimpan password plaintext.
