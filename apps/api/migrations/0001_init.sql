-- Kalo schema. owner_id is the identity provider's user id (Better Auth "user".id).
-- No foreign key to the provider's tables: they belong to the auth service and its migrations.

CREATE TABLE foods (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
    kcal_per_100g numeric(12, 3) NOT NULL CHECK (kcal_per_100g BETWEEN 0 AND 900),
    protein_per_100g numeric(12, 3) NOT NULL CHECK (protein_per_100g BETWEEN 0 AND 100),
    carbs_per_100g numeric(12, 3) NOT NULL CHECK (carbs_per_100g BETWEEN 0 AND 100),
    fat_per_100g numeric(12, 3) NOT NULL CHECK (fat_per_100g BETWEEN 0 AND 100),
    CHECK (protein_per_100g + carbs_per_100g + fat_per_100g <= 100),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX foods_owner_name ON foods (owner_id, lower(name));

-- Entries keep a name and nutrition snapshot: editing or deleting a food never rewrites history.
CREATE TABLE diary_entries (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL,
    diary_date date NOT NULL,
    meal text NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snack')),
    food_name text NOT NULL CHECK (char_length(food_name) BETWEEN 1 AND 120),
    grams numeric(12, 3) NOT NULL CHECK (grams > 0 AND grams <= 5000),
    kcal_per_100g numeric(12, 3) NOT NULL CHECK (kcal_per_100g BETWEEN 0 AND 900),
    protein_per_100g numeric(12, 3) NOT NULL CHECK (protein_per_100g BETWEEN 0 AND 100),
    carbs_per_100g numeric(12, 3) NOT NULL CHECK (carbs_per_100g BETWEEN 0 AND 100),
    fat_per_100g numeric(12, 3) NOT NULL CHECK (fat_per_100g BETWEEN 0 AND 100),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX diary_entries_owner_date ON diary_entries (owner_id, diary_date);

CREATE TABLE goals (
    owner_id text PRIMARY KEY,
    kcal numeric(12, 3) NOT NULL CHECK (kcal BETWEEN 0 AND 10000),
    protein_g numeric(12, 3) NOT NULL CHECK (protein_g BETWEEN 0 AND 1000),
    carbs_g numeric(12, 3) NOT NULL CHECK (carbs_g BETWEEN 0 AND 1000),
    fat_g numeric(12, 3) NOT NULL CHECK (fat_g BETWEEN 0 AND 1000),
    water_ml numeric(12, 3) NOT NULL CHECK (water_ml BETWEEN 0 AND 10000),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE water_intake (
    owner_id text NOT NULL,
    diary_date date NOT NULL,
    ml integer NOT NULL CHECK (ml BETWEEN 0 AND 10000),
    PRIMARY KEY (owner_id, diary_date)
);

CREATE TABLE activities (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL,
    diary_date date NOT NULL,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    kcal numeric(12, 3) NOT NULL CHECK (kcal BETWEEN 0 AND 5000),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activities_owner_date ON activities (owner_id, diary_date);

-- Local development sign-in only (KALO_AUTH=dev); unused with Better Auth.
CREATE TABLE dev_sessions (
    token text PRIMARY KEY,
    user_id text NOT NULL,
    display_name text NOT NULL,
    expires_at timestamptz NOT NULL
);
