const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const db = require('./models/initDb');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;

// --- Layout routes unchanged ---
app.get('/api/layouts', (req, res) => {
  const query = `SELECT name FROM layouts`;
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('DB error fetching layout names:', err);
      return res.status(500).json({ error: 'Failed to fetch layouts' });
    }
    const names = rows.map((row) => row.name);
    res.json(names);
  });
});

app.get('/api/layouts/:name', (req, res) => {
  const name = req.params.name;
  const layoutQuery = `SELECT id, data FROM layouts WHERE name = ?`;

  db.get(layoutQuery, [name], (err, row) => {
    if (err || !row) {
      console.error('Error fetching layout:', err);
      return res.status(404).json({ error: 'Layout not found' });
    }

    let elements;
    try {
      elements = JSON.parse(row.data);
    } catch (parseErr) {
      console.error('Error parsing layout data:', parseErr);
      return res.status(500).json({ error: 'Invalid layout data' });
    }

    const layoutId = row.id;

    const assignmentQuery = `SELECT seat_id, guest_name FROM seat_assignments WHERE layout_id = ?`;
    db.all(assignmentQuery, [layoutId], (assignErr, assignments) => {
      if (assignErr) {
        console.error('Error fetching assignments:', assignErr);
        return res.status(500).json({ error: 'Failed to fetch assignments' });
      }

      const guestMap = Object.fromEntries(
        assignments.map((a) => [a.seat_id, a.guest_name])
      );

      // Merge guest names into elements
      const mergedElements = elements.map((el) => ({
        ...el,
        guest: guestMap[el.id] || el.guest || null,
      }));

      res.json({ name, elements: mergedElements });
    });
  });
});

app.post('/api/layouts', (req, res) => {
  const { name, elements } = req.body;

  if (!name || !elements) {
    return res.status(400).json({ error: 'Invalid layout data' });
  }

  const dataStr = JSON.stringify(elements);

  const checkQuery = `SELECT id FROM layouts WHERE name = ?`;
  db.get(checkQuery, [name], (err, row) => {
    if (err) {
      console.error('DB error checking layout existence:', err);
      return res.status(500).json({ error: 'Failed to save layout' });
    }

    if (row) {
      const updateQuery = `UPDATE layouts SET data = ? WHERE id = ?`;
      db.run(updateQuery, [dataStr, row.id], function (updateErr) {
        if (updateErr) {
          console.error('DB error updating layout:', updateErr);
          return res.status(500).json({ error: 'Failed to update layout' });
        }
        res.json({ message: 'Layout updated', name });
      });
    } else {
      const insertQuery = `INSERT INTO layouts (name, data) VALUES (?, ?)`;
      db.run(insertQuery, [name, dataStr], function (insertErr) {
        if (insertErr) {
          console.error('DB error inserting layout:', insertErr);
          return res.status(500).json({ error: 'Failed to save layout' });
        }
        res.json({ message: 'Layout saved', name });
      });
    }
  });
});

app.post('/api/guests', (req, res) => {
  const { name, menu = '', allergies = [], steakCook = '' } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Guest name is required' });
  }

  const id = uuidv4();
  const guestToken = uuidv4();

  const checkQuery = `SELECT * FROM guests WHERE LOWER(name) = LOWER(?)`;
  db.get(checkQuery, [name], (err, row) => {
    if (err) {
      console.error('DB error checking guest existence:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (row) {
      return res.status(409).json({ error: 'Guest already exists' });
    }

    const insertQuery = `INSERT INTO guests (id, guestToken, name, menu, allergies, steakCook) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(
      insertQuery,
      [id, guestToken, name, menu, JSON.stringify(allergies), steakCook],
      function (insertErr) {
        if (insertErr) {
          console.error('DB error inserting guest:', insertErr);
          return res.status(500).json({ error: 'Failed to save guest' });
        }
        res
          .status(201)
          .json({ id, guestToken, name, menu, allergies, steakCook });
      }
    );
  });
});

app.delete('/api/guests/:identifier', (req, res) => {
  const identifier = req.params.identifier.toLowerCase();

  // Delete guest by guestToken OR id OR name (case-insensitive)
  const deleteQueryByToken = `DELETE FROM guests WHERE LOWER(guestToken) = ?`;
  const deleteQueryById = `DELETE FROM guests WHERE id = ?`;
  const deleteQueryByName = `DELETE FROM guests WHERE LOWER(name) = ?`;

  // First try by guestToken
  db.run(deleteQueryByToken, [identifier], function (err) {
    if (err) {
      console.error('DB error deleting guest by token:', err);
      return res.status(500).json({ error: 'Failed to delete guest' });
    }
    if (this.changes > 0) {
      return res.json({ message: 'Guest deleted successfully by token' });
    }
    // Try by id (only if identifier is numeric)
    const numericId = parseInt(identifier, 10);
    if (!isNaN(numericId)) {
      db.run(deleteQueryById, [numericId], function (err2) {
        if (err2) {
          console.error('DB error deleting guest by id:', err2);
          return res.status(500).json({ error: 'Failed to delete guest' });
        }
        if (this.changes > 0) {
          return res.json({ message: 'Guest deleted successfully by id' });
        }
        // Try by name
        db.run(deleteQueryByName, [identifier], function (err3) {
          if (err3) {
            console.error('DB error deleting guest by name:', err3);
            return res.status(500).json({ error: 'Failed to delete guest' });
          }
          if (this.changes > 0) {
            return res.json({ message: 'Guest deleted successfully by name' });
          }
          return res
            .status(404)
            .json({ error: 'Guest not found for deletion' });
        });
      });
    } else {
      // Not numeric id, try name directly
      db.run(deleteQueryByName, [identifier], function (err3) {
        if (err3) {
          console.error('DB error deleting guest by name:', err3);
          return res.status(500).json({ error: 'Failed to delete guest' });
        }
        if (this.changes > 0) {
          return res.json({ message: 'Guest deleted successfully by name' });
        }
        return res.status(404).json({ error: 'Guest not found for deletion' });
      });
    }
  });
});

app.get('/api/guests', (req, res) => {
  const query = `SELECT * FROM guests`;
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('DB error fetching guests:', err);
      return res.status(500).json({ error: 'Failed to fetch guests' });
    }

    const guests = rows.map((row) => ({
      ...row,
      allergies: row.allergies ? JSON.parse(row.allergies) : [],
    }));

    res.json(guests);
  });
});

app.get('/api/guests/id/:id', (req, res) => {
  const id = req.params.id; // id is UUID string here
  const query = `SELECT * FROM guests WHERE id = ?`;

  db.get(query, [id], (err, row) => {
    if (err) {
      console.error('DB error fetching guest by id:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Guest not found' });
    }
    try {
      row.allergies = row.allergies ? JSON.parse(row.allergies) : [];
    } catch {
      row.allergies = [];
    }
    res.json(row);
  });
});

app.get('/api/guests/token/:guestToken', (req, res) => {
  const guestToken = req.params.guestToken;
  const query = `SELECT * FROM guests WHERE guestToken = ?`;

  db.get(query, [guestToken], (err, row) => {
    if (err) {
      console.error('DB error fetching guest by token:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Guest not found' });
    }

    let allergies = [];
    try {
      allergies = JSON.parse(row.allergies || '[]');
    } catch {
      allergies = [];
    }

    res.json({
      id: row.id,
      guestToken: row.guestToken,
      name: row.name,
      menu: row.menu,
      allergies,
      steakCook: row.steakCook,
    });
  });
});

app.put('/api/guests/:guestToken', (req, res) => {
  const guestToken = req.params.guestToken;
  const { menu = '', allergies = [], steakCook = null } = req.body;

  const query = `UPDATE guests SET menu = ?, allergies = ?, steakCook = ? WHERE guestToken = ?`;
  db.run(
    query,
    [menu, JSON.stringify(allergies), steakCook, guestToken],
    function (err) {
      if (err) {
        console.error('DB error updating guest:', err);
        return res.status(500).json({ error: 'Failed to update guest' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Guest not found' });
      }

      db.get(
        `SELECT * FROM guests WHERE guestToken = ?`,
        [guestToken],
        (err2, row) => {
          if (err2) {
            console.error('DB error fetching updated guest:', err2);
            return res.status(500).json({ error: 'Database error' });
          }

          row.allergies = row.allergies ? JSON.parse(row.allergies) : [];
          res.json(row);
        }
      );
    }
  );
});

app.post('/api/layouts/:layoutName/assign-seat', (req, res) => {
  const { layoutName } = req.params;
  const { seatId, guestName } = req.body;

  console.log('Assigning guest:', { layoutName, seatId, guestName }); // Log the request data

  const layoutQuery = `SELECT id FROM layouts WHERE name = ?`;
  db.get(layoutQuery, [layoutName], (err, row) => {
    if (err || !row) {
      console.error('Error fetching layout:', err);
      return res.status(404).json({ error: 'Layout not found' });
    }

    const layoutId = row.id;

    const upsertQuery = `
      INSERT INTO seat_assignments (layout_id, seat_id, guest_name)
      VALUES (?, ?, ?)
      ON CONFLICT(layout_id, seat_id) DO UPDATE SET guest_name = excluded.guest_name
    `;
    db.run(upsertQuery, [layoutId, seatId, guestName || null], (upsertErr) => {
      if (upsertErr) {
        console.error('Error saving seat assignment:', upsertErr); // Log the error
        return res
          .status(500)
          .json({ error: 'Failed to save seat assignment' });
      }

      res.json({ success: true });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
