-- GLASS-IDEAL_VITRAJ — Supabase jadvallari
-- Supabase → SQL Editor → New query → shu faylning HAMMASINI qo'ying → RUN.
-- Bir necha marta ishga tushirsangiz ham zarari yo'q (mavjud ma'lumot o'chmaydi).

-- 1) Hujjatlar: foydalanuvchilar, mahsulotlar, buyurtmalar, oylik hisobot, sozlamalar
create table if not exists public.kv (
  col        text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (col, id)
);

-- 2) Fayllar: chek rasmlari, avatarlar, qo'shilgan tovar rasmlari (base64 matn ko'rinishida)
create table if not exists public.files (
  id         text        primary key,
  mime       text        not null,
  data       text        not null,
  created_at timestamptz not null default now()
);

-- 3) Xavfsizlik: jadvallarni faqat serverning yashirin kaliti ochadi, ochiq (anon) kalit hech narsa ko'ra olmaydi
alter table public.kv    enable row level security;
alter table public.files enable row level security;
revoke all on public.kv, public.files from anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on public.kv, public.files to service_role;

-- 4) Supabase jadvallarni darrov ko'rsin
notify pgrst, 'reload schema';
