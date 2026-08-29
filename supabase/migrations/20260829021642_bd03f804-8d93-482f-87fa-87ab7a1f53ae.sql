CREATE TABLE public.app_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_users TO service_role;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.room_messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX room_messages_room_idx ON public.room_messages (room_id, created_at);
GRANT ALL ON public.room_messages TO service_role;
ALTER TABLE public.room_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.dm_messages (
  id TEXT PRIMARY KEY,
  dm_key TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX dm_messages_key_idx ON public.dm_messages (dm_key, created_at);
GRANT ALL ON public.dm_messages TO service_role;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

INSERT INTO public.rooms (id, name) VALUES
  ('lobby', 'Lobby'),
  ('general', 'General'),
  ('tech-talk', 'Tech Talk');