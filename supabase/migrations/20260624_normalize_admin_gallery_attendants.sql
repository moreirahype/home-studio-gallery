update public.projects
set bi_attendant_name = 'Galeria'
where coalesce(bi_attendant_name, '') <> 'Galeria';

update public.zapdata_leads
set bi_attendant_name = 'Galeria'
where coalesce(bi_attendant_name, '') <> 'Galeria';

alter table public.projects
  alter column product_name set default 'Sem produto';

alter table public.zapdata_leads
  alter column product_name set default 'Sem produto';

update public.projects
set product_name = 'Sem produto'
where coalesce(product_name, '') in ('', 'Galeria');

update public.zapdata_leads
set product_name = 'Sem produto'
where coalesce(product_name, '') in ('', 'Galeria');
