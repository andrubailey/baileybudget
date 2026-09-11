-- Powers the mobile Accounts screen's reconcile action: "Updated 3 days
-- ago" under each balance, stamped whenever someone confirms or corrects it
-- against their real bank app — a stale balance nobody has checked in
-- months is worse than no timestamp at all, so this needs its own column
-- rather than reusing accounts.created_at.
alter table accounts add column if not exists balance_checked_at timestamptz;
