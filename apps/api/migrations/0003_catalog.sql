-- Shared, read-only food catalog: CIQUAL (Etalab 2.0) and cached Open Food Facts products (ODbL).
-- search_name is the lowercase, accent-free name used for matching.
CREATE TABLE catalog_foods (
    id uuid PRIMARY KEY,
    source text NOT NULL CHECK (source IN ('ciqual', 'openfoodfacts')),
    source_id text NOT NULL CHECK (char_length(source_id) BETWEEN 1 AND 64),
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
    brand text CHECK (brand IS NULL OR char_length(brand) BETWEEN 1 AND 120),
    search_name text NOT NULL,
    kcal_per_100g numeric(12, 3) NOT NULL CHECK (kcal_per_100g BETWEEN 0 AND 900),
    protein_per_100g numeric(12, 3) NOT NULL CHECK (protein_per_100g BETWEEN 0 AND 100),
    carbs_per_100g numeric(12, 3) NOT NULL CHECK (carbs_per_100g BETWEEN 0 AND 100),
    fat_per_100g numeric(12, 3) NOT NULL CHECK (fat_per_100g BETWEEN 0 AND 100),
    CHECK (protein_per_100g + carbs_per_100g + fat_per_100g <= 100),
    details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source, source_id)
);

-- Bundled dataset versions already loaded (e.g. 'ciqual-2025-11-03').
CREATE TABLE catalog_imports (
    version text PRIMARY KEY,
    row_count integer NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now()
);
