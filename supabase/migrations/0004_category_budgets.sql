-- Kategori başına haftalık Pomodoro zaman bütçesi.
--
-- YALNIZCA daha önce 0001_init.sql'i çalıştırmış olanlar için: bu dosyayı
-- SQL Editor'de bir kez çalıştır (0001'i TEKRAR çalıştırma — "already exists"
-- hatası alırsın; 0001_init.sql artık bu değişikliği zaten içeriyor, o
-- yüzden SIFIRDAN kurulan bir proje için tek başına yeterli, bu dosya gerekmez).

-- =========================================================================
-- category_budgets — kategori başına en fazla bir kayıt (birincil anahtar
-- category_id). Hedef, `revisions` içinde haftalara göre SÜRÜMLENİR (her
-- öğenin `from` alanı o haftanın Pazartesi'sidir) — geçmiş haftaların
-- hedefi asla değişmez, düzenlenmeyen gelecek haftalar son revizyonu miras
-- alır. FK yok — bkz. categories tablosundaki aynı gerekçe (kod'un kendi
-- kategori ağacı yönetimi, senkron sırası tablolar arası bağımsız kalsın diye).
-- =========================================================================
create table if not exists category_budgets (
  category_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  revisions jsonb not null default '[]'::jsonb,
  updated_at bigint not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
alter table category_budgets enable row level security;
create policy "category_budgets_select_own" on category_budgets for select using (auth.uid() = user_id);
create policy "category_budgets_insert_own" on category_budgets for insert with check (auth.uid() = user_id);
create policy "category_budgets_update_own" on category_budgets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists category_budgets_user_sync_idx on category_budgets (user_id, server_updated_at);
create trigger trg_category_budgets_touch before insert or update on category_budgets
  for each row execute function kaizen_touch_updated_at();
