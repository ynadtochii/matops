-- The general-branch flag defaults ON (ADR 128).
--
-- ADR 126 §7 held it off for everyone but the pilot until the whole membership
-- and booking path worked. It works, so a gym created from now on may open a
-- general space without anyone flipping a row by hand.
--
-- Structure only. Organizations that already exist keep the false they were
-- created with; moving them is a hand-run fill under packages/db/scripts,
-- because a migration runs everywhere forever and that fill is right once.
ALTER TABLE "organization" ALTER COLUMN "general_branches_enabled" SET DEFAULT true;
