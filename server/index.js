import express from "express";
import mongoose from "mongoose";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
app.use(express.json());

const shows = [
  {
    id: "show-1",
    title: "Dune: Part Two",
    genre: "Sci-Fi / Adventure",
    rating: "PG-13",
    duration: "2h 46m",
    time: "7:30 PM",
    date: "Tonight",
    theatre: "Screen 01",
    poster:
      "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=800&q=85",
    accent: "#c7754d",
    price: 14.5,
    capacity: 48,
  },
  {
    id: "show-2",
    title: "The Wild Robot",
    genre: "Animation / Family",
    rating: "PG",
    duration: "1h 42m",
    time: "5:15 PM",
    date: "Tonight",
    theatre: "Screen 03",
    poster:
      "https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=800&q=85",
    accent: "#668b75",
    price: 12,
    capacity: 48,
  },
  {
    id: "show-3",
    title: "Challengers",
    genre: "Drama / Sport",
    rating: "R",
    duration: "2h 11m",
    time: "9:45 PM",
    date: "Tonight",
    theatre: "Screen 02",
    poster:
      "https://images.unsplash.com/photo-1440404653325-ab127d49abc1?auto=format&fit=crop&w=800&q=85",
    accent: "#ae5061",
    price: 15.5,
    capacity: 48,
  },
];

const duneScreenings = [
  ["show-1-2", "11:00 AM", "Screen 04"],
  ["show-1-3", "2:30 PM", "Screen 01"],
  ["show-1-4", "5:30 PM", "Screen 04"],
  ["show-1-5", "10:15 PM", "Screen 02"],
];
duneScreenings.forEach(([id, time, theatre]) =>
  shows.push({ ...shows[0], id, time, theatre }),
);

const extraScreenings = [
  ["show-2", ["10:30 AM", "1:15 PM", "3:45 PM", "7:00 PM"]],
  ["show-3", ["12:00 PM", "3:00 PM", "6:45 PM", "9:45 PM"]],
];
extraScreenings.forEach(([baseId, times]) => {
  const baseShow = shows.find((show) => show.id === baseId);
  times.forEach((time, index) =>
    shows.push({
      ...baseShow,
      id: `${baseId}-${index + 2}`,
      time,
      theatre: `Screen 0${(index % 4) + 1}`,
    }),
  );
});

const reservations = new Map();
const activeHolds = new Map();
const idempotency = new Map();
const users = new Map();
const sessions = new Map();
let requestLock = Promise.resolve();

const withLock = async (operation) => {
  const previous = requestLock;
  let release;
  requestLock = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
};

const seatsFor = (showId) => {
  if (!reservations.has(showId)) reservations.set(showId, new Map());
  return reservations.get(showId);
};

const cleanupExpired = () => {
  const now = Date.now();
  reservations.forEach((seats) =>
    seats.forEach((reservation, seat) => {
      if (reservation.status === "HELD" && reservation.expiresAt < now)
        seats.delete(seat);
    }),
  );
};

app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    mode: process.env.MONGODB_URI ? "mongo-ready" : "demo-memory",
  }),
);
app.get("/api/shows", (_req, res) => {
  cleanupExpired();
  res.json(shows.map((show) => ({ ...show, sold: seatsFor(show.id).size })));
});
app.get("/api/shows/:id/seats", (req, res) => {
  cleanupExpired();
  const show = shows.find((item) => item.id === req.params.id);
  if (!show) return res.status(404).json({ message: "Show not found" });
  const occupied = [...seatsFor(show.id)].reduce(
    (result, [seat, reservation]) => ({
      ...result,
      [seat]: reservation.status,
    }),
    {},
  );
  res.json({ show, occupied });
});

const adminUser = (req) =>
  sessions.get((req.get("Authorization") || "").replace("Bearer ", ""));

app.post("/api/auth/register", (req, res) => {
  const { name, email } = req.body ?? {};
  if (!name || !email)
    return res.status(400).json({ message: "Name and email are required" });
  const user = {
    id: crypto.randomUUID(),
    name,
    email,
    role: email.includes("admin") ? "ADMIN" : "USER",
  };
  users.set(email, user);
  const token = `demo-token-${user.id}`;
  sessions.set(token, user);
  res.status(201).json({ user, token });
});
app.post("/api/auth/login", (req, res) => {
  const { email } = req.body ?? {};
  if (!email) return res.status(400).json({ message: "Email is required" });
  const user = users.get(email) || {
    id: crypto.randomUUID(),
    name: email?.split("@")[0] || "Guest",
    email,
    role: email?.includes("admin") ? "ADMIN" : "USER",
  };
  users.set(email, user);
  const token = `demo-token-${user.id}`;
  sessions.set(token, user);
  res.json({ user, token });
});

app.post("/api/shows", (req, res) => {
  if (adminUser(req)?.role !== "ADMIN")
    return res.status(403).json({ message: "Admin access is required" });
  const {
    title,
    date,
    time,
    theatre,
    screen,
    price,
    genre,
    rating,
    duration,
    poster,
  } = req.body ?? {};
  if (!title || !date || !time || !screen || !Number(price))
    return res.status(400).json({
      message: "Movie name, date, time, screen and price are required",
    });
  const show = {
    id: `show-${crypto.randomUUID()}`,
    title,
    genre: genre || "Coming soon",
    rating: rating || "NR",
    duration: duration || "TBA",
    time,
    date,
    theatre: theatre || `Screen ${screen}`,
    screen: String(screen),
    poster:
      poster ||
      "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=800&q=85",
    accent: "#8a7867",
    price: Number(price),
    capacity: 48,
  };
  shows.push(show);
  res.status(201).json(show);
});

app.post("/api/holds", async (req, res) => {
  const { showId, seats, clientKey } = req.body ?? {};
  const missing = [
    !showId && "showId",
    !Array.isArray(seats) || !seats.length ? "seats" : null,
    !clientKey && "clientKey",
  ].filter(Boolean);
  if (missing.length)
    return res
      .status(400)
      .json({ message: `Missing hold fields: ${missing.join(", ")}` });
  const result = await withLock(() => {
    cleanupExpired();
    const show = shows.find((item) => item.id === showId);
    if (!show) return { status: 404, body: { message: "Show not found" } };
    const holdKey = `${clientKey}:${showId}:${[...seats].sort().join(",")}`;
    const existingHold = activeHolds.get(holdKey);
    if (existingHold && existingHold.expiresAt > Date.now())
      return { status: 200, body: existingHold };
    activeHolds.delete(holdKey);
    const inventory = seatsFor(showId);
    const conflict = seats.find((seat) => inventory.has(seat));
    if (conflict)
      return {
        status: 409,
        body: { message: `Seat ${conflict} is no longer available.`, conflict },
      };
    const holdId = crypto.randomUUID();
    const expiresAt = Date.now() + 8 * 60 * 1000;
    seats.forEach((seat) =>
      inventory.set(seat, { holdId, clientKey, status: "HELD", expiresAt }),
    );
    const hold = { holdId, expiresAt };
    activeHolds.set(holdKey, hold);
    return { status: 201, body: hold };
  });
  res.status(result.status).json(result.body);
});

app.post("/api/bookings", async (req, res) => {
  const { showId, seats, holdId, clientKey } = req.body ?? {};
  if (!showId || !clientKey || !Array.isArray(seats) || !seats.length)
    return res.status(400).json({
      message: "showId, seats and clientKey are required",
    });
  const requestKey =
    req.get("Idempotency-Key") ||
    `${clientKey}:${showId}:${[...seats].sort().join(",")}`;
  if (idempotency.has(requestKey))
    return res.status(200).json(idempotency.get(requestKey));
  const booking = await withLock(() => {
    cleanupExpired();
    const inventory = seatsFor(showId);
    const show = shows.find((item) => item.id === showId);
    if (!show) return { status: 404, body: { message: "Show not found" } };
    let bookingHoldId = holdId;
    if (!bookingHoldId) {
      const conflict = seats.find((seat) => inventory.has(seat));
      if (conflict)
        return {
          status: 409,
          body: {
            message: `Seat ${conflict} is no longer available.`,
            conflict,
          },
        };
      bookingHoldId = crypto.randomUUID();
      const expiresAt = Date.now() + 8 * 60 * 1000;
      seats.forEach((seat) =>
        inventory.set(seat, {
          holdId: bookingHoldId,
          clientKey,
          status: "HELD",
          expiresAt,
        }),
      );
    }
    const valid = seats.every(
      (seat) =>
        inventory.get(seat)?.holdId === bookingHoldId &&
        inventory.get(seat)?.clientKey === clientKey &&
        inventory.get(seat)?.expiresAt > Date.now(),
    );
    if (!valid)
      return {
        status: 409,
        body: {
          message:
            "Your seat hold expired or is invalid. Please select seats again.",
        },
      };
    const created = {
      id: `RR-${Date.now().toString(36).toUpperCase()}`,
      showId,
      seats,
      status: "CONFIRMED",
      total: seats.length * show.price,
      createdAt: new Date().toISOString(),
    };
    seats.forEach((seat) =>
      inventory.set(seat, {
        holdId: bookingHoldId,
        clientKey,
        status: "BOOKED",
        bookingId: created.id,
      }),
    );
    idempotency.set(requestKey, created);
    return { status: 201, body: created };
  });
  res.status(booking.status).json(booking.body);
});

app.get("/api/admin/summary", (_req, res) => {
  cleanupExpired();
  const bookings = [...idempotency.values()];
  res.json({
    revenue: bookings.reduce((sum, booking) => sum + booking.total, 0),
    bookings: bookings.length,
    holds: [...reservations.values()].reduce(
      (sum, seats) =>
        sum +
        [...seats.values()].filter((item) => item.status === "HELD").length,
      0,
    ),
    shows: shows.length,
    recent: bookings.slice(-5).reverse(),
  });
});

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const clientBuild = path.join(currentDirectory, "..", "dist");
app.use(express.static(clientBuild));
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(clientBuild, "index.html"));
});

const port = process.env.PORT || 4000;
if (process.env.MONGODB_URI)
  mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => console.log("MongoDB connected"))
    .catch(() => console.log("MongoDB unavailable; using demo memory store"));
app.listen(port, () =>
  console.log(`ReelReserve API listening on http://localhost:${port}`),
);
