# GLASS-IDEAL_VITRAJ — Telegram bot + veb-ilova (Ideal-Vit katalogi)

Oltin–qora uslubdagi katalog: mijoz kiradi → tanlaydi → savat → to'lash yoki qarzga olish.
Admin panel shu saytning o'zida (login: `admin`).

## 1. Kompyuteringizda ishga tushirish (VS Code)

```bash
npm install
npm start
```

Brauzerda oching: http://localhost:3000
Admin: `admin` / `admin1414` (kirgach «Sozlama» bo'limidan parolni almashtiring).

> Live Server (5500) ham bo'ladi, lekin API uchun `npm start` ham ishlab turishi kerak.

## 2. Telegram bot

1. Telegramda **@BotFather** → `/newbot` → bot nomi va username tanlang → **token** oling.
2. Loyihaning asosiy papkasida `.env` faylini oching (bo'lmasa, yarating) va `BOT_TOKEN=` qatoriga tokenni yozing. `.env` ni GitHub'ga yuklamang.
3. Bot Mini App ochishi uchun sayt **HTTPS** manzilda turishi kerak (3-bo'limga qarang) va `PUBLIC_URL=` ga shu manzil yoziladi.
4. Botga `/start` yuboring — «🛍 Katalogni ochish» tugmasi chiqadi (pastdagi menyuda ham «Katalog» bo'ladi).
5. Adminga xabarlar (yangi zakaz + chek rasmi + ✅/❌ tugmalari) kelishi uchun:
   - Telegram ichida botni ochib, Mini App'ga `admin` bilan kiring — avtomatik ulanadi, **yoki**
   - Admin panel → Sozlama → «Telegramga ulash» → chiqqan `/admin KOD` ni botga yuboring.

## 3. Internetga chiqarish (Render + Supabase, bepul)

Nega tashqi baza? Render bepul tarifida fayllar har qayta ishga tushganda o'chadi. Zakazlar, mijozlar, chek rasmlari va foyda hisoboti yo'qolmasligi uchun baza Supabase'da turadi.

### 3.1. Supabase loyihasini tayyorlash
1. **supabase.com** saytiga kiring va **New project** orqali loyiha yarating.
2. Supabase loyihasida **SQL Editor → New query** ni oching. Loyihadagi `supabase.sql` faylining hammasini nusxalab qo'ying va **RUN** bosing. Muvaffaqiyatli bajarilganda `kv` va `files` jadvallari yaratiladi.
3. **Project Settings → API Keys** (yoki **Connect**) bo'limidan **Project URL** ni oling. U `https://....supabase.co` ko'rinishida bo'ladi.
4. Shu loyihaning **Secret key** ini oling. U odatda `sb_secret_` bilan boshlanadi. Server uchun **publishable/anon** kalit yaramaydi; `SUPABASE_JWKS_URL` bu loyihada kerak emas.

> **Xavfsizlik:** Secret key'ni hech kimga yubormang, GitHub'ga qo'ymang va brauzer kodiga yozmang. Avval oshkor qilingan yoki repozitoriyga kirib qolgan kalitni Supabase'da bekor qilib, yangisini yarating.

### 3.2. Kompyuterda ulash (VS Code)
1. Loyihaning asosiy papkasidagi `.env` faylini oching. U bo'lmasa, shu papkada `.env` nomli yangi fayl yarating. `.env.example` ichida maxfiy kalitlar bo'lishi mumkin — uni nusxalashdan oldin tekshiring.
2. `.env` fayliga quyidagi ikki qatorni qo'shing yoki mavjudlarini o'z loyihangiz ma'lumotlari bilan yangilang:

   ```env
   SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   SUPABASE_SECRET_KEY=YOUR_SECRET_KEY
   ```

   `YOUR_PROJECT` va `YOUR_SECRET_KEY` o'rniga Supabase'dan olgan qiymatlarni yozing. Haqiqiy kalitni chatga yoki GitHub'ga yubormang.
3. Faylni saqlang. VS Code terminalida `npm start` buyrug'ini ishga tushiring. Server avvaldan ishlayotgan bo'lsa, `Ctrl+C` bilan to'xtatib, qayta `npm start` qiling.
4. Terminalda `Baza: Supabase (...)` yozuvi chiqqanini tekshiring. Sayt `http://localhost:3000` manzilida ochiladi.

### 3.3. Render'da ulash
1. Loyihani GitHub'ga yuklang. `.env` va `node_modules` fayllarini yuklamang.
2. **Render → New → Web Service** orqali GitHub repozitoriysini ulang:
   - Build Command: `npm install`
   - Start Command: `npm start`
3. Render'dagi **Environment** bo'limiga quyidagi qiymatlarni har birini alohida **KEY / VALUE** qilib kiriting:
   - `SUPABASE_URL` — Supabase Project URL
   - `SUPABASE_SECRET_KEY` — shu loyihaning Secret key'i
   - `BOT_TOKEN` — Telegram bot ishlatilsa
   - `PUBLIC_URL` — Render bergan `https://....onrender.com` manzili
   - `ADMIN_PASSWORD` — admin paroli
   - `SECRET` — uzun, tasodifiy maxfiy qiymat
4. **Save, Deploy** bosing. Render **Logs** bo'limida `Baza: Supabase (...)` yozuvi chiqsa, baza ulangan. `Bot: webhook ulandi` faqat Telegram bot holatini bildiradi.

### Ulanmasa nima qilish kerak?
- **401 / invalid api key:** `SUPABASE_URL` va `SUPABASE_SECRET_KEY` bir Supabase loyihasiga tegishli ekanini tekshiring. Secret key'ni boshidan oxirigacha nusxalang; publishable/anon kalit ishlatmang. Oshkor bo'lgan kalitni bekor qilib, yangisini yarating.
- **`kv` yoki `files` jadvali topilmadi:** `supabase.sql` faylini kerakli loyiha ichidagi SQL Editor'da to'liq ishga tushiring.
- **Tarmoq xatosi:** Supabase Dashboard'da loyiha pauza bo'lmaganini tekshiring; pauzada bo'lsa **Restore project** bosing.
- Sozlamalarni o'zgartirgach, lokal serverni qayta ishga tushiring yoki Render'da qayta deploy qiling.

> MongoDB Atlas ham qo'llab-quvvatlanadi: Supabase sozlamalari bo'sh bo'lsa va `MONGODB_URI` berilgan bo'lsa, shu ishlaydi.

## 4. Birinchi marta admin nimalarni to'ldiradi

- **Sozlama → To'lov rekvizitlari**: Payme / Click / Paynet karta raqami va qabul qiluvchi (mijoz to'lov oynasida shuni ko'radi).
- **Sozlama → Dollar kursi**, aloqa (Telegram, Instagram) va qarz shartlari (30%, 14 kun, 2 ta, rozilik matni).
- **Tovarlar**: har bir mahsulotning **qoldig'i** (hozir hammasida 50 qo'yilgan) va **tan narxi** (oylik foyda to'g'ri chiqishi uchun).
- Yangi tovar: nomi `SF…` yoki `мат…` bilan boshlansa — avtomatik «Matovkalar» (metr bilan), `DB/RB/VB/VE/OYR…` — «Bevils», `SO/DECRALED/REGALED` — «Jilkalar», qolgani — «Aksesuvarlar». Qo'lda ham tanlash mumkin.

## Qanday ishlaydi

- **To'lash**: Payme/Click/Paynet tanlanadi → mijoz to'laydi → **chek rasmini yuklaydi (majburiy)** → admin chekni ko'rib ✅ tasdiqlaydi → buyurtma «Qabul qilindi».
- **Qarzga**: shartlar + majburiy rozilik belgisi → 30% to'lov (chek bilan) → tasdiqlangach qarz «Qarzdorlik»ka yoziladi → qolganini mijoz bo'lib-bo'lib to'laydi (har to'lov chek bilan, admin tasdiqlaydi; naqd bo'lsa admin o'zi kiritadi). Bir vaqtda ko'pi bilan 2 ta qarz. Muddat o'tsa admin va mijozga eslatma boradi.
- **Oylik foyda**: har oy avtomatik yangilanadi, siz o'chirmaguningizcha saqlanadi.
- Katalog 157 ta mahsulot (12 sahifa bevils + 9 ta aksesuar), rasmlar katalogdan kesib olingan: `public/img/products/`.

## Fayllar

```
server/index.js   — API, buyurtma/qarz/hisobot mantig'i
server/bot.js     — Telegram bot (webhook yoki polling)
server/store.js   — baza (Supabase / MongoDB / lokal fayl)
supabase.sql      — Supabase jadvallari (bir marta SQL Editor'da ishga tushiriladi)
server/seed/      — katalog ma'lumotlari (nom, o'lcham, narx)
public/           — veb-ilova (index.html, css/, js/, img/)
```
