-- Pomodoro kategorileri (sınırsız iç içe klasör sistemi) + alışkanlık bağlantısı.
--
-- YALNIZCA daha önce 0001_init.sql'i çalıştırmış olanlar için: bu dosyayı
-- SQL Editor'de bir kez çalıştır (0001'i TEKRAR çalıştırma — "already exists"
-- hatası alırsın; 0001_init.sql artık bu değişiklikleri zaten içeriyor, o
-- yüzden SIFIRDAN kurulan bir proje için tek başına yeterli, bu dosya gerekmez).

-- =========================================================================
-- categories — Pomodoro kategorileri (self-referencing klasör ağacı).
-- id METİN (uuid DEĞİL): yerleşik "general" kategorisi sabit bir id kullanır;
-- diğerleri istemcide üretilen uuid metnini taşır. Ebeveyn ilişkisine bilinçli
-- olarak FK KONULMADI — derinlik/sıra istemcide saf fonksiyonlarla (ancestorIds
-- vb.) yönetiliyor, senkron sırası (push/pull) hiçbir tabloda başka bir tabloya
-- bağımlı olmasın diye basit tutuldu.
-- =========================================================================
create table if not exists categories (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  parent_id text,
  color text not null default '',
  "order" integer not null default 0,
  created_at bigint not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
alter table categories enable row level security;
create policy "categories_select_own" on categories for select using (auth.uid() = user_id);
create policy "categories_insert_own" on categories for insert with check (auth.uid() = user_id);
create policy "categories_update_own" on categories for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists categories_user_sync_idx on categories (user_id, server_updated_at);
create trigger trg_categories_touch before insert or update on categories
  for each row execute function kaizen_touch_updated_at();

-- Bir alışkanlık isteğe bağlı olarak bir kategoriye bağlanabilir (o kategoride
-- veya herhangi bir alt kategorisinde tamamlanan bir seans, alışkanlığı otomatik
-- tikler — bkz. Store.autoTickHabitsForCategory). FK yok (yukarıdaki gerekçeyle aynı).
alter table habits add column if not exists linked_category_id text;

-- Her seans bir kategoriye aittir; kategori seçilmeden başlatılanlar (ve tüm
-- eski kayıtlar) yerleşik "general" kategorisine düşer — hiçbir seans asla
-- kategorisiz kalmaz.
alter table pomo_sessions add column if not exists category_id text not null default 'general';
