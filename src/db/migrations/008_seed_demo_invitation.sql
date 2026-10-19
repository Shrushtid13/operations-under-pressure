-- 008_seed_demo_invitation.sql

INSERT INTO workspace_invitations (workspace_id, team_id, code, role, expires_at)
VALUES (1, NULL, 'DEMO-NEWTONITE', 'member', '2099-01-01')
ON CONFLICT (code) DO NOTHING;
