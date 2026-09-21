-- Additive demo schema. Existing PoC tables are not modified.
begin;
create table if not exists public.benefit_demo_cases(tenant text not null,id text not null,revision integer not null default 1,payload jsonb not null,primary key(tenant,id));
create table if not exists public.benefit_demo_runs(tenant text not null,id text not null,case_id text not null,revision integer not null,payload jsonb not null,created_at timestamptz not null default now(),primary key(tenant,id));
create table if not exists public.benefit_documents(id text primary key,title text not null,url text not null,storage_path text not null,sha256 text not null,metadata jsonb not null);
create table if not exists public.benefit_document_sections(id text primary key,document_id text not null references public.benefit_documents(id),page integer not null,body text not null,search_text text not null,metadata jsonb not null);
create index if not exists benefit_document_search_idx on public.benefit_document_sections using gin(to_tsvector('simple',search_text));
alter table public.benefit_demo_cases enable row level security;
alter table public.benefit_demo_runs enable row level security;
alter table public.benefit_documents enable row level security;
alter table public.benefit_document_sections enable row level security;
revoke all on public.benefit_demo_cases,public.benefit_demo_runs,public.benefit_documents,public.benefit_document_sections from anon,authenticated;
grant select,insert,update on public.benefit_demo_cases to service_role;
grant select,insert on public.benefit_demo_runs to service_role;
grant select,insert,update on public.benefit_documents,public.benefit_document_sections to service_role;
create or replace function public.benefit_search_docs(query_text text,diagnosis_month text)
returns table(id text,document_id text,page integer,body text,metadata jsonb,rank real)
language sql stable security invoker set search_path=public as $$
 select s.id,s.document_id,s.page,s.body,s.metadata,ts_rank(to_tsvector('simple',s.search_text),websearch_to_tsquery('simple',query_text)) as rank
 from public.benefit_document_sections s
 where to_tsvector('simple',s.search_text) @@ websearch_to_tsquery('simple',query_text)
 and (s.metadata->>'from' is null or s.metadata->>'from'<=diagnosis_month)
 and (s.metadata->>'through' is null or s.metadata->>'through'>=diagnosis_month)
 order by rank desc,s.id limit 6;
$$;
revoke all on function public.benefit_search_docs(text,text) from public,anon,authenticated;
grant execute on function public.benefit_search_docs(text,text) to service_role;
notify pgrst,'reload schema';
commit;
