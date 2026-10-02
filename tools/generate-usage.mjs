#!/usr/bin/env node
// Writes one month of usage of « Ma Place » (September 2026, working days) into a SQLite file
// for the data lab. Everything is fictional; people are pseudonymised ids, never names.
// Deterministic: seeded random streams, the same tables on every run.
//
// Usage: node --disable-warning=ExperimentalWarning tools/generate-usage.mjs [--out analytics/ma-place-2026-09.db]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_OUT = path.join(ROOT, 'analytics', 'ma-place-2026-09.db');
const FLOOR_PLAN = path.join(ROOT, 'data', 'floor-plan.json');
const SEED = 20260901;

export const TABLES = ['people', 'desks', 'rooms', 'bookings', 'checkins', 'badge_entries', 'app_events'];

const SCHEMA = `
CREATE TABLE people (
  person_id TEXT PRIMARY KEY,
  team TEXT NOT NULL
);
CREATE TABLE desks (
  desk_id TEXT PRIMARY KEY,
  zone TEXT NOT NULL
);
CREATE TABLE rooms (
  room_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  equipment TEXT NOT NULL
);
CREATE TABLE bookings (
  booking_id INTEGER PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people (person_id),
  kind TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  day TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  attendees INTEGER,
  created_at TEXT NOT NULL,
  channel TEXT NOT NULL
);
CREATE TABLE checkins (
  booking_id INTEGER PRIMARY KEY REFERENCES bookings (booking_id),
  checked_in_at TEXT NOT NULL
);
CREATE TABLE badge_entries (
  person_id TEXT NOT NULL REFERENCES people (person_id),
  day TEXT NOT NULL,
  first_entry TEXT NOT NULL,
  PRIMARY KEY (person_id, day)
);
CREATE TABLE app_events (
  event_id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  person_id TEXT NOT NULL REFERENCES people (person_id),
  event TEXT NOT NULL,
  detail TEXT
);
`;

// --- random streams (mulberry32), one per concern ---------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function stream(label) {
  const next = mulberry32((SEED ^ fnv1a(label)) >>> 0);
  const r = {
    next,
    chance: (p) => next() < p,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    uniform: (lo, hi) => lo + next() * (hi - lo),
    pick: (list) => list[Math.floor(next() * list.length)],
    weighted(pairs) {
      let total = 0;
      for (const [, w] of pairs) total += w;
      let x = next() * total;
      for (const [value, w] of pairs) if ((x -= w) < 0) return value;
      return pairs[pairs.length - 1][0];
    },
    shuffle(list) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    },
    poisson(mean) {
      const limit = Math.exp(-mean);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= next();
      } while (p > limit);
      return k - 1;
    },
  };
  return r;
}

// --- calendar: plain day numbers, independent of the machine's time zone ------------------------
// Every time in the file is local Paris time written without an offset.

const EPOCH = Date.UTC(2026, 7, 1); // day number 0 = 2026-08-01
const DAY = 86400;
const pad = (n, width = 2) => String(n).padStart(width, '0');
const dayKey = (n) => new Date(EPOCH + n * 86400000).toISOString().slice(0, 10);
const weekday = (n) => new Date(EPOCH + n * 86400000).getUTCDay(); // 0 = Sunday
const dayNumber = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000);
};
const hhmm = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const at = (n, minutes, seconds = 0) => n * DAY + minutes * 60 + seconds;
const stamp = (t) => {
  const n = Math.floor(t / DAY);
  const s = t - n * DAY;
  return `${dayKey(n)}T${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};
const isWeekend = (n) => weekday(n) === 0 || weekday(n) === 6;

const MONTH_FIRST = dayNumber('2026-09-01');
const MONTH_END = dayNumber('2026-10-01'); // exclusive

function workingDays() {
  const days = [];
  for (let n = MONTH_FIRST; n < MONTH_END; n++) if (!isWeekend(n)) days.push({ n, key: dayKey(n), dow: weekday(n) });
  return days;
}

function previousWorkingDay(n) {
  let p = n - 1;
  while (isWeekend(p)) p--;
  return p;
}

// --- behaviour of the simulated company ---------------------------------------------------------

const TEAM_SIZES = [['finance', 28], ['rh', 22], ['tech', 45], ['marketing', 25]];
const AWAY = 9; // no activity this month (leave, remote contract)
const VIEWERS = 3; // open the app, never book
const SERVICE_ACCOUNTS = ['p9001', 'p9002', 'p9003'];

// How many people want to come in, by weekday (1 = Monday): [usual, spread]. Who comes is drawn
// at random, weighted by each person's habits and their team's preferred days.
const COME = { 1: [27, 2], 2: [61, 4], 3: [59, 4], 4: [60, 4], 5: [14, 2] };
const TEAM_DAY = {
  finance: { 1: 1.2, 5: 1.1 },
  rh: { 1: 1.1, 4: 1.05 },
  tech: { 3: 1.08, 5: 0.9 },
  marketing: { 2: 1.1, 4: 1.1, 5: 0.85 },
};

// Room meetings: start times on the half-hour grid (minute, weight).
const START_WEIGHTS = [
  [480, 2], [510, 4], [540, 8], [570, 9], [600, 10], [630, 9], [660, 8], [690, 6],
  [720, 3], [750, 3], [780, 4], [810, 6], [840, 9], [870, 9], [900, 9], [930, 8],
  [960, 7], [990, 6], [1020, 4], [1050, 3], [1080, 2], [1110, 1],
];
const OPEN = 8 * 60;
const CLOSE = 19 * 60;

// Share of meetings nobody turned up to, by kind of meeting (drawn exactly, which ones is random).
const NO_SHOW = { mondayLargest: 0.75, monday: 0.52, largest: 0.58, other: 0.265 };
// Share of bookings of the rooms with 8 seats or more made for one or two people.
const SMALL_IN_LARGE = 0.4;
// Share of active people who click the « Ajouter à mon agenda (bientôt) » link when they see it.
const CLICKERS = 0.7;

const SEARCH_EQUIPMENT = [['visio', 30], ['Visio', 10], ['écran', 14], ['ecran', 6], ['visio écran', 5], ['tableau', 5], ['projecteur', 3]];
const SEARCH_ROOMS = [['Garonne', 8], ['garonne', 5], ['grand salon', 6], ['Grand Salon', 3], ['dordogne', 4], ['Loire', 3], ['bulle', 6], ['seine', 3], ['rhone', 2], ['salle libre', 6]];
const SEARCH_TEAMS = [['marketing', 8], ['Marketing', 4], ['tech', 5], ['équipe tech', 2], ['finance', 5], ['compta', 2], ['rh', 4], ['RH', 3], ['mon équipe', 3]];
const SEARCH_OTHER = [['agenda', 6], ['calendrier', 3], ['parking', 2], ['calme', 2], ['export', 1]];

const overlaps = (a, b) => a.start < b.end && b.start < a.end;

// Draws `count` items without replacement, each with a weight.
function draw(r, list, count, weight = () => 1) {
  const pool = list.map((x) => [x, weight(x)]);
  const chosen = [];
  for (let k = Math.min(count, pool.length); k > 0; k--) {
    const x = r.weighted(pool);
    chosen.push(x);
    pool.splice(pool.findIndex(([y]) => y === x), 1);
  }
  return chosen;
}

function roomLoad(capacity, dow) {
  const peak = capacity <= 2 ? 5 : capacity <= 4 ? 4.5 : capacity <= 8 ? 4 : 3.5;
  return peak * { 1: 0.75, 2: 1, 3: 1, 4: 1, 5: 0.4 }[dow];
}

function meetingLength(r, capacity) {
  if (capacity <= 2) return r.weighted([[30, 5], [60, 4], [90, 1]]);
  if (capacity <= 6) return r.weighted([[30, 2], [60, 5], [90, 2], [120, 1]]);
  return r.weighted([[60, 45], [90, 25], [120, 20], [180, 10]]);
}

function headcount(r, capacity, small) {
  if (capacity <= 2) return r.weighted([[1, 45], [2, 55]]);
  if (capacity <= 4) return r.weighted([[1, 15], [2, 35], [3, 30], [4, 20]]);
  if (capacity <= 6) return r.weighted([[1, 4], [2, 24], [3, 25], [4, 24], [5, 14], [6, 9]]);
  if (small) return r.weighted([[1, 30], [2, 70]]);
  const pairs = [];
  for (let k = 3; k <= capacity; k++) pairs.push([k, k <= Math.ceil(capacity * 0.6) ? 10 : 4]);
  return r.weighted(pairs);
}

function aheadMinute(r, n) {
  if (isWeekend(n)) return r.int(600, 1350);
  const u = r.next();
  if (u < 0.35) return r.int(510, 719);
  if (u < 0.55) return r.int(720, 839);
  if (u < 0.85) return r.int(840, 1109);
  return r.int(1110, 1350);
}

function channelFor(r, person, t) {
  const n = Math.floor(t / DAY);
  const minute = Math.floor((t - n * DAY) / 60);
  const offHours = isWeekend(n) || minute >= 1140 || minute < 450;
  if (person.integration && !offHours && r.chance(0.45)) return 'api';
  const mobile = offHours ? Math.min(0.92, person.mobile + 0.35) : person.mobile;
  return r.chance(mobile) ? 'mobile' : 'web';
}

// --- the simulation --------------------------------------------------------------------------

export function simulate(plan) {
  const desks = plan.postes.map((p) => ({ id: p.id, zone: p.zone }));
  const rooms = plan.salles.map((s) => ({ id: s.id, name: s.name, capacity: s.capacite, equipment: s.equipements }));
  const largest = Math.max(...rooms.map((x) => x.capacity));
  const days = workingDays();

  // People: the 120 employees of the directory, pseudonymised and shuffled, plus three service accounts.
  const rp = stream('people');
  const teams = rp.shuffle(TEAM_SIZES.flatMap(([team, size]) => Array(size).fill(team)));
  const people = teams.map((team, i) => ({ id: `p${pad(i + 1, 4)}`, team, status: 'active' }));
  const order = rp.shuffle(people.map((_, i) => i));
  for (const i of order.slice(0, AWAY)) people[i].status = 'away';
  for (const i of order.slice(AWAY, AWAY + VIEWERS)) people[i].status = 'viewer';
  const rt = stream('traits');
  for (const p of people) {
    p.affinity = rt.uniform(0.6, 1.4);
    p.loyalty = rt.uniform(0.05, 0.45);
    p.mobile = rt.uniform(0.1, 0.75);
    p.clicker = false;
    p.organizer = 0.3 + 1.8 * rt.next() ** 2;
    p.arrival = 8 * 60 + 10 + rt.int(0, 80);
    p.planner = rt.next();
  }
  const active = people.filter((p) => p.status === 'active');
  for (const p of rt.shuffle(active.filter((x) => x.team === 'tech')).slice(0, 3)) p.integration = true;
  for (const p of draw(rt, active, Math.round(CLICKERS * active.length))) p.clicker = true;
  const services = SERVICE_ACCOUNTS.map((id) => ({ id, team: 'tech', status: 'service' }));

  const bookings = []; // rows of the bookings table, before duplicates
  const cancelled = []; // bookings deleted by a cancellation (they only leave events)
  const failedSearches = []; // people who found no desk
  const presence = new Map(); // day -> Map(personId -> { person, desk, rooms: [] })
  const present = (n, person) => {
    const day = presence.get(n);
    if (!day.has(person.id)) day.set(person.id, { person, desk: null, rooms: [] });
    return day.get(person.id);
  };

  // 1. Desks, booked first come first served.
  const rd = stream('desks');
  for (const day of days) {
    presence.set(day.n, new Map());
    const requests = [];
    const walkIns = [];
    const [usual, spread] = COME[day.dow];
    const comers = draw(rd, active, usual + rd.int(-spread, spread), (p) => p.affinity * (TEAM_DAY[p.team][day.dow] || 1));
    for (const p of comers) {
      if (!rd.chance(0.95)) {
        walkIns.push(p);
        continue;
      }
      const u = rd.next();
      let lead = u < 0.3 ? 0 : u < 0.65 ? 1 : u < 0.85 ? rd.int(2, 4) : rd.int(5, 13);
      if (p.planner > 0.7 && lead < 2 && rd.chance(0.5)) lead = rd.int(2, 6);
      const made = day.n - lead;
      const t = lead === 0 ? at(made, rd.int(420, 580), rd.int(0, 59)) : at(made, aheadMinute(rd, made), rd.int(0, 59));
      requests.push({ person: p, t });
    }
    const prev = previousWorkingDay(day.n);
    services.forEach((s, i) => requests.push({ person: s, t: at(prev, 180 + 20 * i + rd.int(1, 12), rd.int(0, 59)) }));
    requests.sort((a, b) => a.t - b.t);

    const taken = new Map();
    const releases = [];
    for (const q of requests) {
      for (const rel of releases) {
        if (!rel.done && rel.t <= q.t) {
          taken.delete(rel.booking.resource);
          rel.done = true;
        }
      }
      const channel = q.person.status === 'service' ? 'api' : channelFor(rd, q.person, q.t);
      const free = desks.filter((d) => !taken.has(d.id));
      if (free.length === 0) {
        failedSearches.push({ person: q.person, n: day.n, t: q.t, channel, seen: [...taken.keys()] });
        continue;
      }
      const failed = [];
      if (q.person.status !== 'service' && taken.size >= 0.8 * desks.length && rd.chance(0.25)) {
        failed.push({ resource: rd.pick([...taken.keys()]), reason: 'conflict' });
      } else if (q.person.status !== 'service' && rd.chance(0.015)) {
        failed.push({ resource: rd.pick(desks).id, reason: 'other' });
      }
      let choice = null;
      if (q.person.status === 'active' && rd.chance(q.person.loyalty)) {
        const own = free.filter((d) => d.zone === q.person.team);
        if (own.length) choice = rd.pick(own);
      }
      if (!choice) choice = rd.pick(free);
      const b = { person: q.person, kind: 'desk', resource: choice.id, n: day.n, created: q.t, channel, failed };
      taken.set(choice.id, b);
      if (q.person.status === 'active' && rd.chance(0.06)) {
        // Plans change: some cancel soon after booking, others on the morning itself.
        b.cancelledAt = rd.chance(0.5)
          ? rd.int(q.t + 600, q.t + 6 * 3600)
          : rd.int(Math.max(q.t + 600, at(day.n, 7 * 60 + 30)), Math.max(q.t + 1200, at(day.n, 10 * 60)));
        releases.push({ t: b.cancelledAt, booking: b });
        cancelled.push(b);
      } else {
        bookings.push(b);
      }
    }

    // Who actually came in.
    for (const b of bookings) {
      if (b.n !== day.n || b.kind !== 'desk' || b.person.status !== 'active') continue;
      if (rd.chance(day.dow === 1 || day.dow === 5 ? 0.87 : 0.93)) present(day.n, b.person).desk = b;
    }
    for (const p of walkIns) present(day.n, p);
    for (const f of failedSearches) if (f.n === day.n && f.person.status === 'active' && rd.chance(0.3)) present(day.n, f.person);
  }

  // 2. Meeting rooms: a schedule per room and day, without overlaps except a few pairs across 10:00.
  const rr = stream('rooms');
  const schedules = new Map(); // `${n}|${room}` -> slots
  const slotsOf = (n, room) => {
    const k = `${n}|${room.id}`;
    if (!schedules.has(k)) schedules.set(k, []);
    return schedules.get(k);
  };
  const fits = (slots, s) => s.start >= OPEN && s.end <= CLOSE && !slots.some((x) => overlaps(x, s));

  // 2a. Pairs accepted across 10:00 by the time check.
  const pairDays = rr.shuffle(days.flatMap((d) => (d.dow === 5 ? [] : rooms.map((room) => ({ day: d, room })))));
  for (const { day, room } of pairDays.slice(0, 22)) {
    const aStart = rr.pick([510, 540, 570]);
    const aEnd = rr.pick([630, 660].filter((e) => e - aStart >= 60));
    const bStart = rr.pick([600, 630].filter((s) => s < aEnd));
    const bEnd = Math.min(CLOSE, bStart + rr.pick([30, 60, 90]));
    const slots = slotsOf(day.n, room);
    slots.push({ start: aStart, end: aEnd, kind: 'meeting' });
    slots.push({ start: bStart, end: bEnd, kind: 'meeting' });
  }

  for (const day of days) {
    for (const room of rooms) {
      const slots = slotsOf(day.n, room);
      // 2b. Monday morning team meetings in the large rooms, booked weeks ahead.
      if (day.dow === 1 && room.capacity >= 8 && rr.chance(0.8)) {
        const s = { start: rr.pick([540, 570]), kind: 'weekly' };
        s.end = s.start + rr.pick([60, 90]);
        if (fits(slots, s)) slots.push(s);
      }
    }
    // 2c. Service accounts: one or two short slots each, booked the night before.
    services.forEach((svc, i) => {
      const count = i === 1 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        for (let attempt = 0; attempt < 30; attempt++) {
          const room = rr.pick(rooms);
          const start = rr.pick(START_WEIGHTS)[0];
          const s = { start, end: start + 30, kind: 'service', person: svc };
          const slots = slotsOf(day.n, room);
          if (fits(slots, s)) {
            slots.push(s);
            break;
          }
        }
      }
    });
    // 2d. Everyday meetings.
    for (const room of rooms) {
      const slots = slotsOf(day.n, room);
      const wanted = rr.poisson(roomLoad(room.capacity, day.dow));
      let placed = 0;
      for (let attempt = 0; placed < wanted && attempt < 80; attempt++) {
        const start = rr.weighted(START_WEIGHTS);
        const s = { start, end: Math.min(CLOSE, start + meetingLength(rr, room.capacity)), kind: 'meeting' };
        if (fits(slots, s)) {
          slots.push(s);
          placed++;
        }
      }
    }
  }

  // 2e. Each meeting: how far ahead it was booked, its size, whether anybody came.
  const rm = stream('meetings');
  const meetings = [];
  for (const day of days) {
    for (const room of rooms) {
      for (const s of [...slotsOf(day.n, room)].sort((a, b) => a.start - b.start)) {
        if (s.kind === 'service') {
          const t = at(previousWorkingDay(day.n), 180 + 20 * SERVICE_ACCOUNTS.indexOf(s.person.id) + rm.int(1, 15), rm.int(0, 59));
          const failed = rm.chance(0.12) ? [{ resource: rm.pick(rooms).id, reason: 'conflict' }] : [];
          bookings.push({ person: s.person, kind: 'room', resource: room.id, n: day.n, start: s.start, end: s.end, attendees: 1, created: t, channel: 'api', failed });
          continue;
        }
        const u = rm.next();
        let lead = s.kind === 'weekly' ? rm.int(7, 14) : u < 0.25 ? 0 : u < 0.5 ? 1 : u < 0.8 ? rm.int(2, 6) : rm.int(7, 14);
        if (lead === 0 && s.start < 8 * 60 + 45) lead = 1;
        const monday = day.dow === 1 && s.start < 12 * 60;
        const big = room.capacity === largest;
        const kind = monday ? (big ? 'mondayLargest' : 'monday') : big ? 'largest' : 'other';
        meetings.push({ day, room, s, lead, kind, held: true, small: false });
      }
    }
  }
  const rq = stream('quotas');
  for (const [kind, share] of Object.entries(NO_SHOW)) {
    const list = meetings.filter((m) => m.kind === kind);
    for (const m of draw(rq, list, Math.round(share * list.length), (x) => (x.lead >= 7 ? 1.5 : 1))) m.held = false;
  }
  const inLarge = meetings.filter((m) => m.room.capacity >= 8);
  const sizable = inLarge.filter((m) => m.s.kind !== 'weekly');
  for (const m of draw(rq, sizable, Math.round(SMALL_IN_LARGE * inLarge.length))) m.small = true;
  for (const m of meetings) m.attendees = m.s.kind === 'weekly' ? rm.int(5, m.room.capacity) : headcount(rm, m.room.capacity, m.small);

  // 2f. Who booked each meeting, when, and the check-in of those that took place.
  const rk = stream('organisers');
  const roomPhantoms = [];
  for (const day of days) {
    const here = presence.get(day.n);
    const agendaOf = new Map(); // personId -> slots this person booked that day
    const isBusy = (p, s) => (agendaOf.get(p.id) || []).some((x) => overlaps(x, s));
    const today = meetings.filter((m) => m.day === day).sort((a, b) => a.s.start - b.s.start || a.room.id.localeCompare(b.room.id));
    for (const m of today) {
      const { room, s, lead, held } = m;
      let person = null;
      if (held || rk.chance(0.4)) {
        const candidates = [...here.values()].map((e) => e.person).filter((p) => p.status === 'active' && !isBusy(p, s));
        if (candidates.length) person = rk.weighted(candidates.map((p) => [p, p.organizer]));
      }
      if (!person) {
        const candidates = active.filter((p) => (held || !here.has(p.id)) && !isBusy(p, s));
        person = rk.weighted(candidates.map((p) => [p, p.organizer]));
      }
      if (!agendaOf.has(person.id)) agendaOf.set(person.id, []);
      agendaOf.get(person.id).push({ start: s.start, end: s.end });
      const made = day.n - lead;
      const t = lead === 0 ? at(made, rk.int(450, s.start - 15), rk.int(0, 59)) : at(made, aheadMinute(rk, made), rk.int(0, 59));
      const failed = [];
      if (rk.chance(0.09)) failed.push({ resource: rk.pick(rooms).id, reason: 'conflict' });
      if (rk.chance(0.035)) failed.push({ resource: rk.pick(rooms.filter((x) => x.capacity <= 4)).id, reason: 'capacity' });
      if (rk.chance(0.025)) failed.push({ resource: room.id, reason: 'other' });
      const b = {
        person, kind: 'room', resource: room.id, n: day.n, start: s.start, end: s.end, attendees: m.attendees,
        created: t, channel: channelFor(rk, person, t), failed, oversized: m.small,
      };
      if (held) {
        const late = rk.chance(0.08);
        b.checkin = at(day.n, s.start + (late ? rk.int(11, 25) : rk.int(-5, 9)), rk.int(0, 59));
        present(day.n, person).rooms.push({ checkin: b.checkin });
      }
      bookings.push(b);
      // Some meetings were booked, then cancelled: only events remain.
      if (rk.chance(0.08)) {
        const who = rk.pick(active);
        const pMade = day.n - rk.int(1, 10);
        const pt = at(pMade, aheadMinute(rk, pMade), rk.int(0, 59));
        roomPhantoms.push({
          person: who, kind: 'room', resource: rk.pick(rooms).id, n: day.n, created: pt, channel: channelFor(rk, who, pt),
          failed: [], cancelledAt: Math.min(pt + rk.int(3600, 3 * DAY), at(day.n, 7 * 60)),
        });
      }
    }
  }
  cancelled.push(...roomPhantoms);

  // 3. Badge entries and check-ins.
  const rb = stream('badges');
  const badges = [];
  for (const day of days) {
    for (const entry of [...presence.get(day.n).values()].sort((a, b) => a.person.id.localeCompare(b.person.id))) {
      const p = entry.person;
      let arrival = p.arrival + rb.int(-25, 35) + (day.dow === 1 ? 10 : 0) - (day.dow === 5 ? 10 : 0);
      arrival = Math.max(7 * 60 + 15, Math.min(10 * 60 + 40, arrival));
      let first = at(day.n, arrival, rb.int(0, 59));
      for (const m of entry.rooms) if (m.checkin) first = Math.min(first, m.checkin - rb.int(60, 360));
      const firstMinute = Math.floor((first - day.n * DAY) / 60);
      badges.push({ person: p, n: day.n, first: hhmm(firstMinute) });
      if (entry.desk && rb.chance(0.87)) {
        const b = entry.desk;
        b.checkin = Math.max(at(day.n, firstMinute + rb.int(1, 20), rb.int(0, 59)), b.created + rb.int(30, 300));
      }
    }
  }

  // 4. Requests sent twice (same content, a few seconds apart).
  const rx = stream('resend');
  const copies = [];
  for (const b of bookings) {
    if (b.person.status !== 'active' || b.channel === 'api') continue;
    if (rx.chance(b.channel === 'mobile' ? 0.085 : 0.045)) {
      b.resent = rx.int(1, 3);
      copies.push({ ...b, created: b.created + b.resent, checkin: undefined, copy: true, failed: [] });
    }
  }

  const rows = [...bookings, ...copies].sort((a, b) => a.created - b.created || (a.copy ? 1 : 0) - (b.copy ? 1 : 0));
  rows.forEach((b, i) => {
    b.id = i + 1;
  });

  // 5. The app's event log (September only).
  const events = buildEvents({ people, services, desks, rooms, days, bookings, cancelled, failedSearches });

  return { people, services, desks, rooms, rows, badges, events };
}

function buildEvents({ people, desks, rooms, days, bookings, cancelled, failedSearches }) {
  const re = stream('events');
  const log = [];
  let seq = 0;
  const from = at(MONTH_FIRST, 0);
  const to = at(MONTH_END, 0);
  const add = (t, person, event, detail = null) => {
    if (t >= from && t < to) log.push({ t, person: person.id, event, detail, seq: seq++ });
  };
  const deskIds = desks.map((d) => d.id);
  const roomIds = rooms.map((x) => x.id);
  const searchText = (b) => {
    if (b.kind === 'desk') return re.weighted(SEARCH_TEAMS);
    if (b.oversized && re.chance(0.75)) return re.weighted(SEARCH_EQUIPMENT);
    return re.chance(0.5) ? re.weighted(SEARCH_EQUIPMENT) : re.weighted(SEARCH_ROOMS);
  };
  const agenda = (t, person, probability) => {
    if (!person.clicker || !re.chance(probability)) return t;
    const clicks = re.weighted([[1, 60], [2, 28], [3, 12]]);
    let c = t + re.int(3, 40);
    for (let k = 0; k < clicks; k++) {
      add(c, person, 'agenda_click_disabled');
      c += re.int(1, 4);
    }
    return c;
  };

  const session = (b) => {
    const p = b.person;
    const T = b.created;
    if (b.channel === 'api') {
      for (const f of b.failed) {
        add(T - re.int(1, 3), p, 'booking_attempt', f.resource);
        add(T - 1, p, 'booking_error', f.reason);
      }
      add(T, p, 'booking_attempt', b.resource);
      add(T, p, 'booking_ok', b.resource);
      return;
    }
    const pool = b.kind === 'desk' ? deskIds : roomIds;
    const groups = [];
    const pSearch = b.kind === 'desk' ? 0.07 : b.oversized ? 0.55 : 0.22;
    if (re.chance(pSearch)) groups.push([['search', searchText(b)]]);
    for (let k = re.int(0, 3); k > 0; k--) groups.push([['open_panel', re.pick(pool)]]);
    for (const f of b.failed) groups.push([['open_panel', f.resource], ['booking_attempt', f.resource], ['booking_error', f.reason]]);
    groups.push([['open_panel', b.resource]]);
    const gaps = groups.map(() => re.int(3, 25));
    const S = T - gaps.reduce((x, y) => x + y, 0) - re.int(2, 12);
    add(S, p, 'page_view', 'plan');
    let t = S;
    groups.forEach((g, i) => {
      t += gaps[i];
      for (const [event, detail] of g) add(t, p, event, detail);
    });
    add(T, p, 'booking_attempt', b.resource);
    add(T, p, 'booking_ok', b.resource);
    let end = T;
    if (b.resent) {
      end = T + b.resent;
      add(end, p, 'booking_attempt', b.resource);
      add(end, p, 'booking_ok', b.resource);
    }
    end = agenda(end, p, 0.7);
    if (re.chance(0.25)) add(end + re.int(5, 60), p, 'page_view', 'mes-reservations');
  };

  for (const b of bookings) {
    session(b);
    if (b.checkin) {
      add(b.checkin - re.int(5, 50), b.person, 'page_view', re.chance(0.7) ? 'mes-reservations' : 'plan');
      add(b.checkin, b.person, 'checkin', b.resource);
    }
  }
  for (const b of cancelled) {
    session(b);
    add(b.cancelledAt - re.int(5, 60), b.person, 'page_view', 'mes-reservations');
    add(b.cancelledAt, b.person, 'cancel', b.resource);
  }
  for (const f of failedSearches) {
    if (f.person.status !== 'active' || f.channel === 'api') continue;
    let t = f.t;
    add(t, f.person, 'page_view', 'plan');
    for (let k = re.int(2, 5); k > 0; k--) add((t += re.int(3, 20)), f.person, 'open_panel', re.pick(f.seen));
    if (re.chance(0.5)) {
      const desk = re.pick(f.seen);
      add((t += re.int(3, 15)), f.person, 'booking_attempt', desk);
      add(t, f.person, 'booking_error', 'conflict');
    }
  }
  // Looking at the plan without booking.
  for (const p of people) {
    if (p.status === 'away') continue;
    const visits = re.poisson(p.status === 'viewer' ? 6 : 4.5);
    for (let k = 0; k < visits; k++) {
      const day = re.pick(days);
      const mobile = re.chance(p.mobile);
      let t = at(day.n, mobile ? re.int(450, 1290) : re.int(510, 1110), re.int(0, 59));
      add(t, p, 'page_view', 'plan');
      if (re.chance(0.18)) add((t += re.int(3, 20)), p, 'search', re.weighted(re.chance(0.4) ? SEARCH_OTHER : SEARCH_ROOMS));
      for (let j = re.int(0, 5); j > 0; j--) add((t += re.int(3, 30)), p, 'open_panel', re.pick(re.chance(0.6) ? deskIds : roomIds));
      if (re.chance(0.2)) add((t += re.int(5, 30)), p, 'page_view', 'mes-reservations');
      agenda(t, p, 0.07);
    }
  }

  log.sort((a, b) => a.t - b.t || a.seq - b.seq);
  return log;
}

// --- writing the file ------------------------------------------------------------------------

function write(file, sim) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (const f of [file, `${file}-journal`, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA page_size = 4096; PRAGMA journal_mode = DELETE;');
  db.exec(SCHEMA);
  db.exec('BEGIN');
  const person = db.prepare('INSERT INTO people (person_id, team) VALUES (?, ?)');
  for (const p of [...sim.people, ...sim.services]) person.run(p.id, p.team);
  const desk = db.prepare('INSERT INTO desks (desk_id, zone) VALUES (?, ?)');
  for (const d of sim.desks) desk.run(d.id, d.zone);
  const room = db.prepare('INSERT INTO rooms (room_id, name, capacity, equipment) VALUES (?, ?, ?, ?)');
  for (const x of sim.rooms) room.run(x.id, x.name, x.capacity, x.equipment.join(','));
  const booking = db.prepare(`INSERT INTO bookings
    (booking_id, person_id, kind, resource_id, day, start_time, end_time, attendees, created_at, channel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const checkin = db.prepare('INSERT INTO checkins (booking_id, checked_in_at) VALUES (?, ?)');
  for (const b of sim.rows) {
    const isRoom = b.kind === 'room';
    booking.run(
      b.id, b.person.id, b.kind, b.resource, dayKey(b.n),
      isRoom ? hhmm(b.start) : null, isRoom ? hhmm(b.end) : null, isRoom ? b.attendees : null,
      stamp(b.created), b.channel,
    );
  }
  for (const b of [...sim.rows].filter((x) => x.checkin).sort((a, b) => a.id - b.id)) checkin.run(b.id, stamp(b.checkin));
  const badge = db.prepare('INSERT INTO badge_entries (person_id, day, first_entry) VALUES (?, ?, ?)');
  for (const e of sim.badges) badge.run(e.person.id, dayKey(e.n), e.first);
  const event = db.prepare('INSERT INTO app_events (event_id, ts, person_id, event, detail) VALUES (?, ?, ?, ?, ?)');
  sim.events.forEach((e, i) => event.run(i + 1, stamp(e.t), e.person, e.event, e.detail));
  db.exec('COMMIT');
  db.exec('VACUUM');
  db.close();
}

export function generateUsage({ out = DEFAULT_OUT, floorPlan = FLOOR_PLAN } = {}) {
  const plan = JSON.parse(fs.readFileSync(floorPlan, 'utf8'));
  const sim = simulate(plan);
  write(out, sim);
  return { out, bytes: fs.statSync(out).size, counts: tableCounts(out) };
}

export function tableCounts(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  const counts = Object.fromEntries(TABLES.map((t) => [t, db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n]));
  db.close();
  return counts;
}

// A hash of the schema and of every row in a fixed order: equal for equal contents,
// even when two SQLite versions lay the bytes out differently.
export function canonicalDump(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  const hash = crypto.createHash('sha256');
  for (const { name, sql } of db.prepare("SELECT name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name").all()) {
    hash.update(`${name}\n${sql}\n`);
  }
  for (const t of TABLES) {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
    hash.update(`#${t}\n`);
    for (const row of db.prepare(`SELECT * FROM ${t} ORDER BY ${cols.map((_, i) => i + 1).join(', ')}`).all()) {
      hash.update(`${JSON.stringify(cols.map((c) => row[c]))}\n`);
    }
  }
  db.close();
  return hash.digest('hex');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  let out = DEFAULT_OUT;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) out = path.resolve(args[++i]);
    else {
      console.error('usage: node tools/generate-usage.mjs [--out analytics/ma-place-2026-09.db]');
      process.exit(1);
    }
  }
  const { bytes, counts } = generateUsage({ out });
  const shown = path.relative(process.cwd(), out);
  console.log(`${shown.startsWith('..') ? out : shown}: ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  for (const [t, n] of Object.entries(counts)) console.log(`  ${t.padEnd(14)} ${n}`);
}
