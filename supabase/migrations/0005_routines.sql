-- Rutinler — alışkanlıklardan oluşan sıralı kontrol listeleri.
--
-- YALNIZCA daha önce 0001_init.sql'i çalıştırmış olanlar için: bu dosyayı
-- SQL Editor'de bir kez çalıştır (0001'i TEKRAR çalıştırma — "already exists"
-- hatası alırsın; 0001_init.sql artık bu değişikliği zaten içeriyor, o
-- yüzden SIFIRDAN kurulan bir proje için tek başına yeterli, bu dosya gerekmez).
--
-- Not: aktif rutin ÇALIŞTIRMASI (hangi adımda olunduğu vb.) hiç senkronlanmaz
-- (Pomodoro'nun canlı sayaç durumu gibi yalnızca cihazda kalır) — bu tabloda
-- yalnızca rutin TANIMLARI (ad + adımlar) tutulur.

-- =========================================================================
-- routines — rutin tanımları. `steps` jsonb dizisi { id, habit_id, amount }
-- öğelerinden oluşur; alışkanlığın adı/birimi burada tekrarlanmaz (istemci
-- her zaman güncel `habits` tablosundan okur). FK yok — habits ile aynı
-- gerekçe (senkron sırası tablolar arası bağımsız kalsın diye).
-- =========================================================================
create table if not exists routines (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  steps jsonb not null default '[]'::jsonb,
  "order" integer not null default 0,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
alter table routines enable row level security;
create policy "routines_select_own" on routines for select using (auth.uid() = user_id);
create policy "routines_insert_own" on routines for insert with check (auth.uid() = user_id);
create policy "routines_update_own" on routines for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists routines_user_sync_idx on routines (user_id, server_updated_at);
create trigger trg_routines_touch before insert or update on routines
  for each row execute function kaizen_touch_updated_at();
