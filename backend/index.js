const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');

const app = express();
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'https://event-table-management-app.vercel.app', 'https://kevin-and-leticia.vercel.app'],
}));
app.use(express.json());

const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

app.get('/api/test-db', async (req, res) => {
  try {
    const result = await prisma.$queryRaw`SELECT 1`;
    res.json({ message: 'Database connection successful', result });
  } catch (error) {
    console.error('Database connection test failed:', error);
    res.status(500).json({ error: 'Database connection failed', details: error.message });
  }
});

app.get('/api/layouts', async (req, res) => {
  try {
    const layouts = await prisma.layouts.findMany({
      select: { name: true },
    });
    const names = layouts.map((l) => l.name);
    res.json(names);
  } catch (error) {
    console.error('Error fetching layouts:', error);
    res.status(500).json({ error: 'Failed to fetch layouts' });
  }
});

app.get('/api/layouts/:name', async (req, res) => {
  const { name } = req.params;
  try {
    const layout = await prisma.layouts.findFirst({
      where: { name },
      select: { id: true, data: true },
    });
    if (!layout) {
      return res.status(404).json({ error: 'Layout not found' });
    }

    const elements = JSON.parse(layout.data);

    const assignments = await prisma.seat_assignments.findMany({
      where: { layout_id: layout.id },
      select: { seat_id: true, guest_name: true },
    });

    const guestMap = Object.fromEntries(
      assignments.map((a) => [a.seat_id, a.guest_name])
    );

    const mergedElements = elements.map((el) => ({
      ...el,
      guest:
        guestMap[el.id] === ''
          ? null
          : guestMap[el.id] || el.guest || null,
    }));

    res.json({ name, elements: mergedElements });
  } catch (error) {
    console.error('Error fetching layout:', error);
    res.status(500).json({ error: 'Failed to fetch layout' });
  }
});

app.delete('/api/layouts/:name', async (req, res) => {
  const { name } = req.params;

  try {
    const layout = await prisma.layouts.findFirst({
      where: { name },
      select: { id: true },
    });

    if (!layout) {
      return res.status(404).json({ error: 'Layout not found' });
    }

    await prisma.seat_assignments.deleteMany({
      where: { layout_id: layout.id },
    });

    await prisma.layouts.delete({
      where: { id: layout.id }, 
    });

    res.json({ success: true, message: `Layout '${name}' deleted successfully.` });
  } catch (error) {
    console.error('Error deleting layout:', error);
    res.status(500).json({ error: 'Failed to delete layout' });
  }
});

app.post('/api/layouts', async (req, res) => {
  const { name, elements } = req.body;

  if (!name || !elements) {
    return res.status(400).json({ error: 'Invalid layout data' });
  }

  try {
    const dataStr = JSON.stringify(elements);

    const existingLayout = await prisma.layouts.findFirst({
      where: { name },
      select: { id: true },
    });

    if (existingLayout) {
      await prisma.layouts.update({
        where: { id: existingLayout.id },
        data: { data: dataStr },
      });
    } else {
      await prisma.layouts.create({
        data: { name, data: dataStr },
      });
    }

    res.json({ message: 'Layout saved or updated', name });
  } catch (error) {
    console.error('Error saving layout:', error);
    res.status(500).json({ error: 'Failed to save layout' });
  }
});

// --- Guests routes ---
app.post('/api/guests', async (req, res) => {
  const { name, menu = '', appetiser = 'Beef Carpaccio', allergies = [], steakCook = '' } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Guest name is required' });
  }

  const id = uuidv4();
  const guestToken = uuidv4();

  try {
    const existingGuest = await prisma.guests.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (existingGuest) {
      return res.status(409).json({ error: 'Guest already exists' });
    }

    const guest = await prisma.guests.create({
      data: {
        id,
        guestToken,
        name,
        menu,
        appetiser,
        allergies: JSON.stringify(allergies),
        steakCook,
      },
    });

    res.status(201).json({
      id: guest.id,
      guestToken: guest.guestToken,
      name: guest.name,
      menu: guest.menu,
      appetiser: guest.appetiser,
      allergies,
      steakCook: guest.steakCook,
    });
  } catch (error) {
    console.error('Error saving guest:', error);
    res.status(500).json({ error: 'Failed to save guest' });
  }
});

app.delete('/api/guests/:identifier', async (req, res) => {
  const identifier = req.params.identifier.toLowerCase();

  try {
    // Try delete by guestToken
    let deleted = await prisma.guests.deleteMany({
      where: { guestToken: { equals: identifier } },
    });

    if (deleted.count > 0) {
      return res.json({ message: 'Guest deleted successfully by token' });
    }

    // Try delete by id
    deleted = await prisma.guests.deleteMany({
      where: { id: identifier },
    });

    if (deleted.count > 0) {
      return res.json({ message: 'Guest deleted successfully by id' });
    }

    // Try delete by name (case-insensitive)
    deleted = await prisma.guests.deleteMany({
      where: { name: { equals: identifier, mode: 'insensitive' } },
    });

    if (deleted.count > 0) {
      return res.json({ message: 'Guest deleted successfully by name' });
    }

    res.status(404).json({ error: 'Guest not found for deletion' });
  } catch (error) {
    console.error('Error deleting guest:', error);
    res.status(500).json({ error: 'Failed to delete guest' });
  }
});

app.get('/api/guests', async (req, res) => {
  try {
    const guests = await prisma.guests.findMany();
    const result = guests.map((guest) => ({
      ...guest,
      allergies: guest.allergies ? JSON.parse(guest.allergies) : [],
    }));
    res.json(result);
  } catch (error) {
    console.error('Error fetching guests:', error);
    res.status(500).json({ error: 'Failed to fetch guests' });
  }
});

app.get('/api/guests/id/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const guest = await prisma.guests.findUnique({
      where: { id },
    });

    if (!guest) {
      return res.status(404).json({ error: 'Guest not found' });
    }

    guest.allergies = guest.allergies ? JSON.parse(guest.allergies) : [];
    res.json(guest);
  } catch (error) {
    console.error('Error fetching guest:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/guests/token/:guestToken', async (req, res) => {
  const { guestToken } = req.params;

  try {
    const guest = await prisma.guests.findUnique({
      where: { guestToken },
    });

    if (!guest) {
      return res.status(404).json({ error: 'Guest not found' });
    }

    const allergies = guest.allergies ? JSON.parse(guest.allergies) : [];

    res.json({
      id: guest.id,
      guestToken: guest.guestToken,
      name: guest.name,
      menu: guest.menu,
      appetiser: guest.appetiser,
      allergies,
      steakCook: guest.steakCook,
    });
  } catch (error) {
    console.error('Error fetching guest:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/guests/:guestToken', async (req, res) => {
  const { guestToken } = req.params;
  const { menu = '', appetiser = 'Beef Carpaccio', allergies = [], steakCook = null } = req.body;

  try {
    const updated = await prisma.guests.updateMany({
      where: { guestToken },
      data: {
        menu,
        appetiser,
        allergies: JSON.stringify(allergies),
        steakCook,
      },
    });

    if (updated.count === 0) {
      return res.status(404).json({ error: 'Guest not found' });
    }

    const guest = await prisma.guests.findUnique({
      where: { guestToken },
    });

    guest.allergies = guest.allergies ? JSON.parse(guest.allergies) : [];
    res.json(guest);
  } catch (error) {
    console.error('Error updating guest:', error);
    res.status(500).json({ error: 'Failed to update guest' });
  }
});

app.post('/api/layouts/:layoutName/assign-seat', async (req, res) => {
  const { layoutName } = req.params;
  const { seatId, guestName } = req.body;

  console.log('Assigning guest:', { layoutName, seatId, guestName });

  try {
    const layout = await prisma.layouts.findFirst({
      where: { name: layoutName },
      select: { id: true },
    });

    if (!layout) {
      return res.status(404).json({ error: 'Layout not found' });
    }

    const layoutId = layout.id;

    // Save empty string instead of null for "no guest"
    const actualGuestName =
      typeof guestName === 'string' &&
      guestName.trim().toLowerCase() !== 'null'
        ? guestName.trim()
        : '';

    await prisma.seat_assignments.upsert({
      where: {
        layout_id_seat_id: {
          layout_id: layoutId,
          seat_id: seatId,
        },
      },
      update: { guest_name: actualGuestName },
      create: {
        layout_id: layoutId,
        seat_id: seatId,
        guest_name: actualGuestName,
      },
    });

    res.json({ success: true, seatId, guestName: actualGuestName });
  } catch (error) {
    console.error('Error assigning seat:', error);
    res.status(500).json({ error: 'Failed to assign seat' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
