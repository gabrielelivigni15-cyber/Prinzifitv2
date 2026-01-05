# PrinziFit Clean V1

## 1) Supabase
Esegui `supabase/SCHEMA.sql` nel SQL Editor.

Poi, dopo esserti registrato, renditi admin:
```sql
update public.profiles set is_admin = true where email = 'TUA_EMAIL@EMAIL.COM';
```

## 2) Vercel
Framework: Next.js  
Root directory: ./  
Env su Vercel:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
