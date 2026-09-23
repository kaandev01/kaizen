-- Kaizen bulut şeması (v1) — kullanıcı girişi + cihazlar arası senkron.
--
-- Nasıl çalıştırılır: Supabase Dashboard → SQL Editor → New query → bu dosyanın
-- TAMAMINI yapıştır → Run. Tek seferlik kurulumdur; Supabase CLI GEREKMEZ.
--
-- Güvenlik modeli: her tabloda Row Level Security (RLS) açık, her satır yalnızca
-- kendi sahibi (auth.uid() = user_id) tarafından okunabilir/yazılabilir. Bu dosyada
-- hiçbir gizli anahtar yoktur — service_role veya veritabanı şifresi burada
-- kullanılmaz/gerekmez.

create extension if not exists "pgcrypto";

-- Her yazımda server_updated_at'i sunucu saatiyle günceller. Senkron motorunun
-- artımlı çekme (pull) imleci bu alana dayanır — istemci saatine güvenilmez.
create or replace function kaizen_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.server_updated_at := now();
  return new;
end;
$$;

-- =========================================================================
-- user_settings — Ayarlar (tema, haptik, bildirim, sessiz mod, Pomodoro süreleri)
-- =========================================================================
create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system',
  haptics boolean not null default true,
  notifications boolean not null default true,
  silent boolean not null default false,
  keep_awake boolean not null default true,
  pomodoro jsonb not null default '{"focusMin":25,"shortMin":5,"longMin":15,"longEvery":4}'::jsonb,
  server_updated_at timestamptz not null default now()
);
alter table user_settings enable row level security;
create policy "user_settings_select_own" on user_settings for select using (auth.uid() = user_id);
create policy "user_settings_insert_own" on user_settings for insert with check (auth.uid() = user_id);
create policy "user_settings_update_own" on user_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_user_settings_touch before insert or update on user_settings
  for each row execute function kaizen_touch_updated_at();

-- =========================================================================
-- habits — Alışkanlıklar
-- =========================================================================
create table if not exists habits (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null default '',
  color text not null default '',
  reminders text[] not null default '{}',
  revisions jsonb not null default '[]'::jsonb,
  created_at date not null,
  "order" integer not null default 0,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
alter table habits enable row level security;
create policy "habits_select_own" on habits for select using (auth.uid() = user_id);
create policy "habits_insert_own" on habits for insert with check (auth.uid() = user_id);
-- Silme sert DELETE değil, diğer tüm tablolarla aynı desende `deleted_at` güncellemesiyle
-- yapılır (tombstone) — eski bir cihaz senkronlanınca silinen kayıt geri gelmesin diye.
create policy "habits_update_own" on habits for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists habits_user_sync_idx on habits (user_id, server_updated_at);
create trigger trg_habits_touch before insert or update on habits
  for each row execute function kaizen_touch_updated_at();

-- =========================================================================
-- day_logs — Bir alışkanlığın bir gündeki miktarı (id = "habitId|date")
-- Not: silinmez — miktar 0'a döndüğünde satır 0 olarak kalır (okuma tarafında
-- "kayıt yok" ile eşdeğerdir), bu yüzden deleted_at yok, tombstone gerekmez.
-- =========================================================================
create table if not exists day_logs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null,
  date date not null,
  amount integer not null default 0,
  updated_at bigint not null default 0,
  server_updated_at timestamptz not null default now()
);
alter table day_logs enable row level security;
create policy "day_logs_select_own" on day_logs for select using (auth.uid() = user_id);
create policy "day_logs_insert_own" on day_logs for insert with check (auth.uid() = user_id);
create policy "day_logs_update_own" on day_logs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists day_logs_user_sync_idx on day_logs (user_id, server_updated_at);
create trigger trg_day_logs_touch before insert or update on day_logs
  for each row execute function kaizen_touch_updated_at();

-- =========================================================================
-- sync_ops — yalnızca apply_day_log_delta'nın tekrar-denemeye karşı
-- tekilleştirmesi için (bir opId iki kez uygulanmasın).
-- =========================================================================
create table if not exists sync_ops (
  user_id uuid not null references auth.users(id) on delete cascade,
  op_id uuid not null,
  applied_at timestamptz not null default now(),
  primary key (user_id, op_id)
);
alter table sync_ops enable row level security;
create policy "sync_ops_select_own" on sync_ops for select using (auth.uid() = user_id);
create policy "sync_ops_insert_own" on sync_ops for insert with check (auth.uid() = user_id);

-- İki cihazın aynı güne ait +1/-1 dokunuşları asla birbirini silmesin diye miktar
-- değişiklikleri MUTLAK değer olarak değil, DELTA (fark) olarak gönderilir ve burada
-- atomik biçimde uygulanır. `security invoker` bilinçli seçim: fonksiyon çağıranın
-- rolüyle çalışır, yani yukarıdaki RLS politikaları fonksiyon içinde de geçerli kalır
-- (bir "security definer" ile ayrıcalık yükseltme riskini baştan kapatır).
create or replace function apply_day_log_delta(
  p_op_id uuid,
  p_id text,
  p_habit_id uuid,
  p_date date,
  p_delta integer,
  p_client_updated_at bigint
) returns void
language plpgsql
security invoker
as $$
begin
  if auth.uid() is null then
    raise exception 'Oturum yok';
  end if;

  if exists (select 1 from sync_ops where user_id = auth.uid() and op_id = p_op_id) then
    return; -- bu işlem daha önce uygulandı (retry) — sessizce çık
  end if;

  insert into day_logs (id, user_id, habit_id, date, amount, updated_at)
  values (p_id, auth.uid(), p_habit_id, p_date, greatest(0, least(999999, p_delta)), p_client_updated_at)
  on conflict (id) do update
    set amount = greatest(0, least(999999, day_logs.amount + p_delta)),
        updated_at = greatest(day_logs.updated_at, p_client_updated_at)
    where day_logs.user_id = auth.uid();

  insert into sync_ops (user_id, op_id) values (auth.uid(), p_op_id);
end;
$$;

-- =========================================================================
-- pomo_sessions — Tamamlanmış/durdurulmuş Pomodoro seansları (değişmez kayıt;
-- id zaten istemcide runId olarak üretiliyor, id çakışırsa hiçbir şey yapılmaz —
-- aynı seans iki kez kaydedilmez). Yalnızca ekleme/okuma; güncelleme/silme yok.
-- =========================================================================
create table if not exists pomo_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  planned_ms bigint not null,
  started_at bigint not null,
  ended_at bigint not null,
  active_ms bigint not null,
  segments jsonb not null default '[]'::jsonb,
  status text not null,
  server_updated_at timestamptz not null default now()
);
alter table pomo_sessions enable row level security;
create policy "pomo_sessions_select_own" on pomo_sessions for select using (auth.uid() = user_id);
create policy "pomo_sessions_insert_own" on pomo_sessions for insert with check (auth.uid() = user_id);
create index if not exists pomo_sessions_user_sync_idx on pomo_sessions (user_id, server_updated_at);
create trigger trg_pomo_sessions_touch before insert on pomo_sessions
  for each row execute function kaizen_touch_updated_at();

-- =========================================================================
-- journal_entries — Günlük (metin) notları
-- =========================================================================
create table if not exists journal_entries (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  text text not null,
  source text not null default 'typed',
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
alter table journal_entries enable row level security;
create policy "journal_entries_select_own" on journal_entries for select using (auth.uid() = user_id);
create policy "journal_entries_insert_own" on journal_entries for insert with check (auth.uid() = user_id);
create policy "journal_entries_update_own" on journal_entries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists journal_entries_user_sync_idx on journal_entries (user_id, server_updated_at);
create trigger trg_journal_entries_touch before insert or update on journal_entries
  for each row execute function kaizen_touch_updated_at();

-- =========================================================================
-- day_ratings — Gün puanı (1-10). PK (user_id, date) — istemcideki "girilmemiş
-- güne kayıt yok" kuralıyla birebir.
-- =========================================================================
create table if not exists day_ratings (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  score integer not null,
  updated_at bigint not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, date)
);
alter table day_ratings enable row level security;
create policy "day_ratings_select_own" on day_ratings for select using (auth.uid() = user_id);
create policy "day_ratings_insert_own" on day_ratings for insert with check (auth.uid() = user_id);
create policy "day_ratings_update_own" on day_ratings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists day_ratings_user_sync_idx on day_ratings (user_id, server_updated_at);
create trigger trg_day_ratings_touch before insert or update on day_ratings
  for each row execute function kaizen_touch_updated_at();

-- =========================================================================
-- agenda_items — Deadline / etkinlik / yapılacak kayıtları
-- =========================================================================
create table if not exists agenda_items (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  kind text not null,
  date date not null,
  time text,
  description text not null default '',
  importance text not null default 'normal',
  reminders jsonb not null default '[]'::jsonb,
  reminder_anchor_time text,
  done boolean not null default false,
  completed_at bigint,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
alter table agenda_items enable row level security;
create policy "agenda_items_select_own" on agenda_items for select using (auth.uid() = user_id);
create policy "agenda_items_insert_own" on agenda_items for insert with check (auth.uid() = user_id);
create policy "agenda_items_update_own" on agenda_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists agenda_items_user_sync_idx on agenda_items (user_id, server_updated_at);
create trigger trg_agenda_items_touch before insert or update on agenda_items
  for each row execute function kaizen_touch_updated_at();

-- =========================================================================
-- goals — Aylık/yıllık hedefler
-- =========================================================================
create table if not exists goals (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  period jsonb not null,
  status text not null default 'active',
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
alter table goals enable row level security;
create policy "goals_select_own" on goals for select using (auth.uid() = user_id);
create policy "goals_insert_own" on goals for insert with check (auth.uid() = user_id);
create policy "goals_update_own" on goals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists goals_user_sync_idx on goals (user_id, server_updated_at);
create trigger trg_goals_touch before insert or update on goals
  for each row execute function kaizen_touch_updated_at();
