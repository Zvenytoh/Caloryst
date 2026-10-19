-- Detailed nutrients per 100 g as {"fiberG": "3.2", ...}: decimal strings keep exact values;
-- a missing key means unknown (not zero). Entries keep their own snapshot.
ALTER TABLE foods ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object');
ALTER TABLE diary_entries ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object');

CREATE TABLE profiles (
    owner_id text PRIMARY KEY,
    sex text NOT NULL CHECK (sex IN ('female', 'male')),
    birth_year integer NOT NULL CHECK (birth_year BETWEEN 1900 AND 2100),
    height_cm numeric(4, 1) NOT NULL CHECK (height_cm BETWEEN 120 AND 230),
    weight_kg numeric(4, 1) NOT NULL CHECK (weight_kg BETWEEN 30 AND 300),
    activity text NOT NULL CHECK (activity IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
    objective text NOT NULL CHECK (objective IN ('lose_fat', 'maintain', 'gain_muscle')),
    updated_at timestamptz NOT NULL DEFAULT now()
);
