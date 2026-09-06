UPDATE organization
SET general_branches_enabled = true
WHERE id = 'seed_org_alma' AND deleted_at IS NULL;
