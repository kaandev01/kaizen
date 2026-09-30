-- Hızlı yakalama / gelen kutusu — tür/tarih/kategori seçmeden bırakılan notlar.
--
-- YALNIZCA daha önce 0001_init.sql'i çalıştırmış olanlar için: bu dosyayı
-- SQL Editor'de bir kez çalıştır (0001'i TEKRAR çalıştırma — "already exists"
-- hatası alırsın; 0001_init.sql artık bu değişikliği zaten içeriyor, o
-- yüzden SIFIRDAN kurulan bir proje için tek başına yeterli, bu dosya gerekmez).

-- =========================================================================
-- inbox_notes — `converted_to` (jsonb, null olabilir) bir notun hangi kayda
-- (ajanda/günlük/hedef, hangi id'yle) dönüştürüldüğünü tutar; dönüşüm SİLMEZ,
-- yalnızca bu alanı doldurur (güvenle geri alınabilsin diye). FK yok — diğer
-- tablolarla aynı gerekçe.
-- =========================================================================
create table if not exists inbox_notes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  converted_to jsonb,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
alter table inbox_notes enable row level security;
create policy "inbox_notes_select_own" on inbox_notes for select using (auth.uid() = user_id);
create policy "inbox_notes_insert_own" on inbox_notes for insert with check (auth.uid() = user_id);
create policy "inbox_notes_update_own" on inbox_notes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists inbox_notes_user_sync_idx on inbox_notes (user_id, server_updated_at);
create trigger trg_inbox_notes_touch before insert or update on inbox_notes
  for each row execute function kaizen_touch_updated_at();
