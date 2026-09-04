-- LAT SCANNER INVENTAIRE V2 - New Database Schema
-- Major Architecture Change: 18 Tables (A-R), Each with 5 Positions
-- Each position can hold 1 Mould + 1 Seat

-- ============================================
-- TABLES (Work Tables: A, B, C, ..., R)
-- ============================================
CREATE TABLE tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom VARCHAR(10) UNIQUE NOT NULL,  -- A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R
  dimension_spec TEXT,  -- Dimension specification for this table (all moulds/seats must match)
  description TEXT,
  ordre_affichage INTEGER,  -- Display order
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- POSITIONS (5 positions per table: 1-5)
-- ============================================
CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  position_number INTEGER NOT NULL CHECK (position_number BETWEEN 1 AND 5),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(table_id, position_number)
);

-- ============================================
-- MOULDS (Moules - can be more than 5 per table)
-- ============================================
CREATE TABLE moulds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  no_moule VARCHAR(50) UNIQUE NOT NULL,  -- am1, am2, bm1, bm2, etc.
  table_nom VARCHAR(10) NOT NULL,  -- Which table this moule belongs to (A, B, C, etc.)
  dimension_spec TEXT,  -- Dimension specification
  statut VARCHAR(100) NOT NULL DEFAULT 'Remisé',  -- Mise en production, Chez Huot, Inventaire - À entretenir, Remisé
  position_id UUID REFERENCES positions(id) ON DELETE SET NULL,  -- Current position (NULL if not installed)
  condition VARCHAR(50),  -- new, good, fair, poor, etc.
  notes TEXT,
  date_fabrication DATE,
  nb_coulees INTEGER DEFAULT 0,  -- Number of casts (to be populated from Oracle data)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_moule_statut CHECK (
    statut IN ('Mise en production', 'Chez Huot', 'Inventaire - À entretenir', 'Remisé')
  ),
  CONSTRAINT check_moule_position_statut CHECK (
    (statut = 'Mise en production' AND position_id IS NOT NULL) OR
    (statut != 'Mise en production' AND position_id IS NULL)
  )
);

-- ============================================
-- SEATS (Sièges - can be more than 5 per table)
-- ============================================
CREATE TABLE seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  no_seat VARCHAR(50) UNIQUE NOT NULL,  -- as1, as2, bs1, bs2, etc.
  table_nom VARCHAR(10) NOT NULL,  -- Which table this seat belongs to
  dimension_spec TEXT,
  statut VARCHAR(100) NOT NULL DEFAULT 'Remisé',
  position_id UUID REFERENCES positions(id) ON DELETE SET NULL,
  condition VARCHAR(50),
  notes TEXT,
  date_fabrication DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_seat_statut CHECK (
    statut IN ('Mise en production', 'Chez Huot', 'Inventaire - À entretenir', 'Remisé')
  ),
  CONSTRAINT check_seat_position_statut CHECK (
    (statut = 'Mise en production' AND position_id IS NOT NULL) OR
    (statut != 'Mise en production' AND position_id IS NULL)
  )
);

-- ============================================
-- HISTORIQUE (History tracking)
-- ============================================
CREATE TABLE historique (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_piece VARCHAR(10) NOT NULL,  -- 'moule' or 'seat'
  piece_id UUID NOT NULL,  -- ID from moulds or seats table
  no_piece VARCHAR(50) NOT NULL,  -- Snapshot of the piece number
  ancien_statut VARCHAR(100),
  nouveau_statut VARCHAR(100) NOT NULL,
  type_action VARCHAR(100) NOT NULL,  -- installation, retrait, expedition_huot, retour_huot, maintenance, etc.
  position_id UUID REFERENCES positions(id) ON DELETE SET NULL,
  table_nom VARCHAR(10),
  position_number INTEGER,
  debut_statut TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fin_statut TIMESTAMPTZ,  -- NULL means still in this status
  effectue_par VARCHAR(100),  -- Operator name
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_type_piece CHECK (type_piece IN ('moule', 'seat'))
);

-- ============================================
-- AUDIT (Audit log)
-- ============================================
CREATE TABLE audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_entite VARCHAR(50) NOT NULL,  -- 'moule', 'seat', 'table', 'position'
  entite_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,  -- create, update, delete, install, remove, etc.
  effectue_par VARCHAR(100) NOT NULL,
  avant JSONB,  -- State before change
  apres JSONB,  -- State after change
  raison TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PENDING_NOTIFICATION (Email notification queue)
-- ============================================
CREATE TABLE pending_notification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  sent BOOLEAN DEFAULT false,
  sent_snapshot BOOLEAN DEFAULT false,
  sent_history BOOLEAN DEFAULT false,
  notes TEXT
);

-- ============================================
-- INDEXES for Performance
-- ============================================
CREATE INDEX idx_positions_table_id ON positions(table_id);
CREATE INDEX idx_moulds_table_nom ON moulds(table_nom);
CREATE INDEX idx_moulds_statut ON moulds(statut);
CREATE INDEX idx_moulds_position_id ON moulds(position_id);
CREATE INDEX idx_seats_table_nom ON seats(table_nom);
CREATE INDEX idx_seats_statut ON seats(statut);
CREATE INDEX idx_seats_position_id ON seats(position_id);
CREATE INDEX idx_historique_piece ON historique(type_piece, piece_id);
CREATE INDEX idx_historique_debut ON historique(debut_statut DESC);
CREATE INDEX idx_audit_entite ON audit(type_entite, entite_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tables_updated_at BEFORE UPDATE ON tables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON positions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_moulds_updated_at BEFORE UPDATE ON moulds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_seats_updated_at BEFORE UPDATE ON seats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SEED DATA: Create 18 Tables (A-R)
-- ============================================
INSERT INTO tables (nom, ordre_affichage, dimension_spec) VALUES
('A', 1, '1800 x 1400 mm'),
('B', 2, '1800 x 1400 mm'),
('C', 3, '1800 x 1400 mm'),
('D', 4, '1800 x 1400 mm'),
('E', 5, '1800 x 1400 mm'),
('F', 6, '1800 x 1400 mm'),
('G', 7, '1800 x 1400 mm'),
('H', 8, '1800 x 1400 mm'),
('I', 9, '1800 x 1400 mm'),
('J', 10, '1800 x 1400 mm'),
('K', 11, '1800 x 1400 mm'),
('L', 12, '1800 x 1400 mm'),
('M', 13, '1800 x 1400 mm'),
('N', 14, '1800 x 1400 mm'),
('O', 15, '1800 x 1400 mm'),
('P', 16, '1800 x 1400 mm'),
('Q', 17, '1800 x 1400 mm'),
('R', 18, '1800 x 1400 mm');

-- ============================================
-- SEED DATA: Create 5 Positions for Each Table
-- ============================================
DO $$
DECLARE
  table_record RECORD;
BEGIN
  FOR table_record IN SELECT id FROM tables ORDER BY ordre_affichage LOOP
    FOR i IN 1..5 LOOP
      INSERT INTO positions (table_id, position_number)
      VALUES (table_record.id, i);
    END LOOP;
  END LOOP;
END $$;

-- ============================================
-- SEED DATA: Create 5 Moulds and 5 Seats per Table
-- ============================================
DO $$
DECLARE
  table_record RECORD;
  table_letter VARCHAR(10);
BEGIN
  FOR table_record IN SELECT nom FROM tables ORDER BY ordre_affichage LOOP
    table_letter := LOWER(table_record.nom);

    -- Create 5 moulds for this table
    FOR i IN 1..5 LOOP
      INSERT INTO moulds (no_moule, table_nom, dimension_spec, statut, condition)
      VALUES (
        table_letter || 'm' || i,  -- am1, am2, ..., rm5
        table_record.nom,
        '1800 x 1400 mm',
        'Remisé',
        'good'
      );
    END LOOP;

    -- Create 5 seats for this table
    FOR i IN 1..5 LOOP
      INSERT INTO seats (no_seat, table_nom, dimension_spec, statut, condition)
      VALUES (
        table_letter || 's' || i,  -- as1, as2, ..., rs5
        table_record.nom,
        '1800 x 1400 mm',
        'Remisé',
        'good'
      );
    END LOOP;
  END LOOP;
END $$;

-- ============================================
-- RLS (Row Level Security) Policies
-- ============================================
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE moulds ENABLE ROW LEVEL SECURITY;
ALTER TABLE seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE historique ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_notification ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (adjust as needed)
CREATE POLICY "Enable all for anon users" ON tables FOR ALL USING (true);
CREATE POLICY "Enable all for anon users" ON positions FOR ALL USING (true);
CREATE POLICY "Enable all for anon users" ON moulds FOR ALL USING (true);
CREATE POLICY "Enable all for anon users" ON seats FOR ALL USING (true);
CREATE POLICY "Enable all for anon users" ON historique FOR ALL USING (true);
CREATE POLICY "Enable all for anon users" ON audit FOR ALL USING (true);
CREATE POLICY "Enable all for anon users" ON pending_notification FOR ALL USING (true);

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check tables count
-- SELECT COUNT(*) as total_tables FROM tables;

-- Check positions count (should be 90: 18 tables × 5 positions)
-- SELECT COUNT(*) as total_positions FROM positions;

-- Check moulds count (should be 90: 18 tables × 5 moulds)
-- SELECT COUNT(*) as total_moulds FROM moulds;

-- Check seats count (should be 90: 18 tables × 5 seats)
-- SELECT COUNT(*) as total_seats FROM seats;

-- View all tables with their positions
-- SELECT t.nom, COUNT(p.id) as nb_positions
-- FROM tables t
-- LEFT JOIN positions p ON p.table_id = t.id
-- GROUP BY t.nom
-- ORDER BY t.ordre_affichage;

-- View all moulds grouped by table
-- SELECT table_nom, COUNT(*) as nb_moulds,
--        STRING_AGG(no_moule, ', ' ORDER BY no_moule) as moulds
-- FROM moulds
-- GROUP BY table_nom
-- ORDER BY table_nom;

-- View all seats grouped by table
-- SELECT table_nom, COUNT(*) as nb_seats,
--        STRING_AGG(no_seat, ', ' ORDER BY no_seat) as seats
-- FROM seats
-- GROUP BY table_nom
-- ORDER BY table_nom;
