# exceltest

Next.js su tüketimi panosu.

Veri kaynağı: `Veri son.xlsx` (default: `/Users/ase/Downloads/Veri son.xlsx`).
`npm run data` ile Excel'den `data/dashboard.json` üretilir.
İsteğe bağlı olarak `npm run sync:supabase` ile payload Supabase'e yazılır.

```bash
npm install
npm run data   # Excel -> data/dashboard.json
npm run sync:supabase  # data/dashboard.json -> Supabase dashboard_payloads
npm run dev    # http://localhost:3000
```

## Supabase kurulum

1. `supabase/schema.sql` dosyasını SQL Editor'de çalıştırın.
2. `.env.local` dosyasına aşağıdakileri ekleyin:

```bash
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
EXCEL_SOURCE_PATH=/Users/ase/Downloads/Veri son.xlsx
DATA_YEAR=2025
```

Not: `app/page.tsx` önce Supabase'den veri okumayı dener; bağlantı/env yoksa yerel `data/dashboard.json` fallback kullanır.

Kaynak: [Next.js](https://nextjs.org) (`create-next-app`).
