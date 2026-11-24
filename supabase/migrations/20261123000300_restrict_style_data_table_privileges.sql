-- Row-level security does not apply to TRUNCATE. Authenticated clients
-- only need normal row-level CRUD access to their own style data.
revoke truncate, references, trigger
on table public.user_style_data
from authenticated;
