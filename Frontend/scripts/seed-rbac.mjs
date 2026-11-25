import pg from "pg";
import bcrypt from "bcrypt";

const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "postgres",
  database: process.env.DB_NAME || "ai_attendance_db",
  password: process.env.DB_PASSWORD || "postgres@123",
  port: Number(process.env.DB_PORT || 5432),
});

const SALT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);

async function ensureLocation(name, city, state) {
  const existing = await pool.query(
    "SELECT id FROM locations WHERE location_name = $1",
    [name]
  );
  if (existing.rows[0]) {
    return existing.rows[0].id;
  }
  const inserted = await pool.query(
    "INSERT INTO locations (location_name, city, state) VALUES ($1, $2, $3) RETURNING id",
    [name, city, state]
  );
  return inserted.rows[0].id;
}

async function ensureEmployee(emp) {
  const fullName = `${emp.first_name} ${emp.last_name}`.trim();
  const existing = await pool.query(
    "SELECT id FROM employees WHERE employee_code = $1",
    [emp.employee_code]
  );
  if (existing.rows[0]) {
    await pool.query(
      `UPDATE employees
       SET first_name=$2, last_name=$3, name=$4, department=$5,
           location_id=$6, location=(SELECT location_name FROM locations WHERE id=$6),
           status='ACTIVE'
       WHERE employee_code=$1`,
      [
        emp.employee_code,
        emp.first_name,
        emp.last_name,
        fullName,
        emp.department,
        emp.location_id,
      ]
    );
    return existing.rows[0].id;
  }
  const inserted = await pool.query(
    `INSERT INTO employees
       (employee_code, first_name, last_name, name, department, location_id, location, status)
     VALUES ($1,$2,$3,$4,$5,$6,(SELECT location_name FROM locations WHERE id=$6),'ACTIVE')
     RETURNING id`,
    [
      emp.employee_code,
      emp.first_name,
      emp.last_name,
      fullName,
      emp.department,
      emp.location_id,
    ]
  );
  return inserted.rows[0].id;
}

async function ensureUser(user) {
  const passwordHash = await bcrypt.hash(
    user.password,
    SALT_ROUNDS
  );
  const existing = await pool.query(
    "SELECT id FROM users WHERE username = $1",
    [user.username]
  );
  if (existing.rows[0]) {
    await pool.query(
      `UPDATE users
       SET password=$2, role=$3, employee_id=$4, location_id=$5,
           status='ACTIVE', updated_at=CURRENT_TIMESTAMP
       WHERE username=$1`,
      [
        user.username,
        passwordHash,
        user.role,
        user.employee_id,
        user.location_id,
      ]
    );
    return existing.rows[0].id;
  }
  const inserted = await pool.query(
    `INSERT INTO users (username, password, role, employee_id, location_id, status)
     VALUES ($1,$2,$3,$4,$5,'ACTIVE') RETURNING id`,
    [
      user.username,
      passwordHash,
      user.role,
      user.employee_id,
      user.location_id,
    ]
  );
  return inserted.rows[0].id;
}

async function main() {
  const loc1 = await ensureLocation(
    "Head Office",
    "Ranchi",
    "Jharkhand"
  );
  const loc2 = await ensureLocation(
    "Branch Office",
    "Delhi",
    "Delhi"
  );

  // Employees across two locations
  await ensureEmployee({
    employee_code: "EMP001",
    first_name: "Rahul",
    last_name: "Kumar",
    department: "HR",
    location_id: loc1,
  });
  const mgrEmpId = await ensureEmployee({
    employee_code: "EMP100",
    first_name: "Manager",
    last_name: "One",
    department: "Operations",
    location_id: loc1,
  });
  const empOneId = await ensureEmployee({
    employee_code: "EMP101",
    first_name: "Employee",
    last_name: "One",
    department: "Engineering",
    location_id: loc1,
  });
  await ensureEmployee({
    employee_code: "EMP200",
    first_name: "Branch",
    last_name: "Worker",
    department: "Sales",
    location_id: loc2,
  });

  // Users for each role
  await ensureUser({
    username: "admin",
    password: "admin123",
    role: "SUPER_ADMIN",
    employee_id: null,
    location_id: null,
  });
  await ensureUser({
    username: "manager1",
    password: "manager123",
    role: "MANAGER",
    employee_id: mgrEmpId,
    location_id: loc1,
  });
  await ensureUser({
    username: "employee1",
    password: "employee123",
    role: "EMPLOYEE",
    employee_id: empOneId,
    location_id: loc1,
  });

  console.log("Seed complete.");
  console.log("Locations:", { loc1, loc2 });
  console.log("Manager employee id:", mgrEmpId);
  console.log("Employee1 employee id:", empOneId);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
