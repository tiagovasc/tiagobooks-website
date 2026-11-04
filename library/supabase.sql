-- Server-managed library storage. No browser credentials.
create table if not exists public.book_library_state (
 id text primary key check (id='library'),
 books jsonb not null check (jsonb_typeof(books)='array'),
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.book_library_state enable row level security;
-- Access goes through the Railway backend; no anonymous direct table grants.
revoke all on public.book_library_state from anon, authenticated;
