# Tokyo 4D — design notes

A 4D city is the city's own three spatial dimensions — its real photoreal
buildings on real terrain — plus the fourth, *time*: the actual sun on the
actual Tokyo clock, live bikes moving through the racks, weather changing the
sky, and honestly-labelled simulations of the crowds, cars and trains that give
Shibuya its pulse.

The build follows four principles, adapted from the Helsinki reference to
Tokyo's own character.

## 1 · Clarity over spectacle

Shibuya is visually overwhelming in life — so the interface is not. One quiet
panel names what you are looking at and how alive each feed is; one panel keeps
the time and weather. Everything else is the city. Labels are the city's own:
rail lines read 山手 and 井の頭, not romanised captions. The camera starts on
the crossing that everyone knows and lets you fall toward street level or rise
to the whole skyline without a single menu.

## 2 · A quiet UI, a loud city

Dark charcoal glass panels sit at the corners; the accent is a single
sakura-neon pink — a nod to Shibuya's signage without imitating it. Feed status
is a 5 px dot: green when a real feed is answering, hollow when a layer is an
honest simulation, red when something real has gone down. Nothing blinks for
attention. The busiest crossing on Earth does that for us.

## 3 · A palette from the place

- **Sumi charcoal** (墨) for the panels — Tokyo's ink, its subway maps, its rain.
- **Sakura-neon** (`#ff6b8a`) for the one accent — spring against concrete.
- **Asagi indigo** (浅葱) and **Shibuya cyan** for cool secondary marks.
- The buildings and ground bring their own colour: the real FY2025 aerial
  survey, so the palette of the city floor is literally Tokyo's own rooftops,
  road paint and park green.
- Rail lines keep their official liveries — Yamanote's yellow-green, the
  Inokashira blue, Toyoko red — because those colours *are* how Tokyoites read
  the city.

## 4 · Honesty about data — the load-bearing principle

Everything that claims to be real is real, on the real clock:

- **Buildings & ground** are Project PLATEAU's FY2025 LOD2 survey on GSI
  elevation — the government's own open digital twin, not a stylisation.
- **City bikes** are live Docomo Bike Share dock counts; the number on a rack is
  how many bikes are actually there right now.
- **Weather and the sun** are live and computed for Tokyo's latitude on Tokyo
  time. The city dims at the real Tokyo sunset; the cicadas in the soundscape
  only sing in daytime, and only in summer — because in the demo clock it is July.

Everything simulated says so, in the legend, with a hollow dot:

- **people · sim**, **cars · flow** and **trains · sim** are simulations. The
  crowd at the Scramble follows a real hour-of-day rhythm (near-empty at 4 a.m.,
  flooding for the evening) and is sized at roughly 1:100 of the bounded
  downtown's daytime population — there is no open per-person feed anywhere, by
  design, and there should not be. Cars flow along the real OSM street
  centrelines; trains run the real surface rail alignments, coloured by line.

And where a real feed *exists but can't be used*, we say that too: Tokyo's
live train and bus positions (ODPT) require an API key, so they are not in this
key-free static build. A dead feed shows a red dot; it never quietly hides.
That honesty is what lets the rest of the app say, plainly: this is Tokyo, right
now.
