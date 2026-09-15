-- LAT SCANNER INVENTAIRE V2 - Migration v3: real table names
-- ============================================================================
-- ONE-TIME migration. Replaces the 18 seed tables (A-R) with the 39 real
-- tables, named by their dimension (e.g. "711-1346" = 711 x 1346 mm).
--
-- Applied 2026-09-15 via the Supabase REST API. This file is the reproducible
-- record; running it again in the Supabase SQL editor will REBUILD the table
-- list from scratch (deletes all moulds/seats/positions/tables first).
--
-- DESTRUCTIVE: do NOT re-run on a database that holds real moulds/seats you
-- want to keep. Table history (historique) is preserved either way.
-- Going forward, add/remove tables from the app's Config > Administration page
-- (removing a table there keeps history and sets its pieces to "Rebuté").
-- ============================================================================

-- 1. Remove existing pieces, positions and tables (historique is kept).
DELETE FROM moulds;
DELETE FROM seats;
DELETE FROM table_positions;
DELETE FROM tables;

-- 2. Insert the 39 real tables (name doubles as the dimension).
INSERT INTO tables (nom, dimension_spec, ordre_affichage, active) VALUES
  ('711-1346', '711 x 1346 mm', 1, true),
  ('560-1230', '560 x 1230 mm', 2, true),
  ('445-1346', '445 x 1346 mm', 3, true),
  ('711-1473', '711 x 1473 mm', 4, true),
  ('660-1676', '660 x 1676 mm', 5, true),
  ('660-1384', '660 x 1384 mm', 6, true),
  ('660-1067', '660 x 1067 mm', 7, true),
  ('610-1524', '610 x 1524 mm', 8, true),
  ('762-1613', '762 x 1613 mm', 9, true),
  ('610-2032', '610 x 2032 mm', 10, true),
  ('711-1803', '711 x 1803 mm', 11, true),
  ('660-2032', '660 x 2032 mm', 12, true),
  ('711-1638', '711 x 1638 mm', 13, true),
  ('711-1956', '711 x 1956 mm', 14, true),
  ('742-1689', '742 x 1689 mm', 15, true),
  ('660-1956', '660 x 1956 mm', 16, true),
  ('445-1422', '445 x 1422 mm', 17, true),
  ('500-2130', '500 x 2130 mm', 18, true),
  ('711-1143', '711 x 1143 mm', 19, true),
  ('660-2134', '660 x 2134 mm', 20, true),
  ('610-1900', '610 x 1900 mm', 21, true),
  ('660-1730', '660 x 1730 mm', 22, true),
  ('660-1727', '660 x 1727 mm', 23, true),
  ('610-2235', '610 x 2235 mm', 24, true),
  ('610-1118', '610 x 1118 mm', 25, true),
  ('587-1753', '587 x 1753 mm', 26, true),
  ('660-2133', '660 x 2133 mm', 27, true),
  ('660-1372', '660 x 1372 mm', 28, true),
  ('508-1753', '508 x 1753 mm', 29, true),
  ('610-1727', '610 x 1727 mm', 30, true),
  ('584-2518', '584 x 2518 mm', 31, true),
  ('500-1956', '500 x 1956 mm', 32, true),
  ('660-1880', '660 x 1880 mm', 33, true),
  ('584-2311', '584 x 2311 mm', 34, true),
  ('584-2337', '584 x 2337 mm', 35, true),
  ('508-1626', '508 x 1626 mm', 36, true),
  ('457-1422', '457 x 1422 mm', 37, true),
  ('660-1385', '660 x 1385 mm', 38, true),
  ('660-1346', '660 x 1346 mm', 39, true);

-- 3. Create 5 positions for each table.
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM tables LOOP
    FOR i IN 1..5 LOOP
      INSERT INTO table_positions (table_id, position_number) VALUES (t.id, i);
    END LOOP;
  END LOOP;
END $$;

-- Verify: 39 tables, 195 positions, 0 moulds, 0 seats.
-- SELECT (SELECT COUNT(*) FROM tables) AS tables,
--        (SELECT COUNT(*) FROM table_positions) AS positions,
--        (SELECT COUNT(*) FROM moulds) AS moulds,
--        (SELECT COUNT(*) FROM seats) AS seats;
