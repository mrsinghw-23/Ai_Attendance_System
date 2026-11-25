-- Extend employees table for production Employee Management module
-- Safe to re-run (IF NOT EXISTS)

ALTER TABLE employees ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS designation VARCHAR(100);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES locations(id);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS reporting_manager_id INTEGER REFERENCES employees(id);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS joining_date DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS face_registration_status VARCHAR(30) DEFAULT 'NOT_REGISTERED';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Migrate legacy name column into first_name / last_name
UPDATE employees
SET
  first_name = COALESCE(first_name, SPLIT_PART(name, ' ', 1)),
  last_name = COALESCE(
    NULLIF(last_name, ''),
    NULLIF(TRIM(SUBSTRING(name FROM POSITION(' ' IN COALESCE(name, '')) + 1)), ''),
    SPLIT_PART(name, ' ', 1)
  )
WHERE name IS NOT NULL
  AND (first_name IS NULL OR first_name = '');

-- Link location_id from legacy location text where possible
UPDATE employees e
SET location_id = l.id
FROM locations l
WHERE e.location_id IS NULL
  AND e.location IS NOT NULL
  AND LOWER(l.location_name) = LOWER(e.location);

CREATE INDEX IF NOT EXISTS idx_employees_location_id ON employees(location_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_employee_code ON employees(employee_code);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
