const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/database.sqlite');

db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS layouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    data TEXT
  )`,
    (err) => {
      if (err) console.error('Error creating layouts table:', err);
      else console.log('Layouts table created successfully.');
    }
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS guests (
    id TEXT PRIMARY KEY,
    guestToken TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    menu TEXT,
    allergies TEXT,
    steakCook TEXT
  )`,
    (err) => {
      if (err) console.error('Error creating guests table:', err);
      else console.log('Guests table created successfully.');
    }
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS seat_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    layout_id INTEGER NOT NULL,
    seat_id TEXT NOT NULL,
    guest_name TEXT, -- Removed NOT NULL constraint
    FOREIGN KEY (layout_id) REFERENCES layouts(id),
    UNIQUE (layout_id, seat_id) -- Add UNIQUE constraint
  )`,
    (err) => {
      if (err) console.error('Error creating seat_assignments table:', err);
      else console.log('Seat assignments table created successfully.');
    }
  );
});

module.exports = db;