create table if not exists projects (
  id          text primary key,
  user_id     text not null references users(id),
  name        text not null,
  description text,
  color       text not null,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now()
);
