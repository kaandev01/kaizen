-- Pomodoro seansı sonrası değerlendirme (0-10) + not — pomo_sessions'a eklenir.
--
-- YALNIZCA daha önce 0001_init.sql'i çalıştırmış olanlar için: bu dosyayı
-- SQL Editor'de bir kez çalıştır (0001'i TEKRAR çalıştırma — "already exists"
-- hatası alırsın; 0001_init.sql artık bu değişiklikleri zaten içeriyor, o
-- yüzden SIFIRDAN kurulan bir proje için tek başına yeterli, bu dosya gerekmez).

alter table pomo_sessions add column if not exists rating integer;
alter table pomo_sessions add column if not exists note text not null default '';

-- Seans oluşturulduktan SONRA değerlendirme eklenebildiği için tablo artık
-- güncellenebilir olmalı (0001'de yalnızca insert/select vardı).
drop policy if exists "pomo_sessions_update_own" on pomo_sessions;
create policy "pomo_sessions_update_own" on pomo_sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- server_updated_at (senkron imleci) artık güncellemede de ilerlemeli — yoksa
-- başka bir cihaz rating/not değişikliğini pull-sync ile hiç göremez.
drop trigger if exists trg_pomo_sessions_touch on pomo_sessions;
create trigger trg_pomo_sessions_touch before insert or update on pomo_sessions
  for each row execute function kaizen_touch_updated_at();
