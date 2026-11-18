# Frog Racing 🐸🏁

Pick a frog cart and race three laps. Line up with the yellow boost pads on the straights, then steer through the bends. Running onto the grass slows you down.

**[Play Frog Racing in your browser](https://coolboy354059.github.io/frog-racing/)**

## Start a race

- **Solo:** Choose a cart and circuit in the garage and select **Start race**. You’ll line up against eight computer-controlled frogs.
- **Host a race:** Pick your cart and circuit, then choose **Race with friends → Create room**. Give the six-character code to your friends. Once someone joins, select **Start multiplayer race**.
- **Join a friend:** Pick your cart, choose **Race with friends**, enter the code, and select **Join room**. The host picks the circuit. Rooms fit 2–9 players, and everyone needs to join before the countdown.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Accelerate | Hold ↑ or W | Hold Gas |
| Steer | ← and → or A and D | Hold ◀ or ▶ |
| Brake | Hold ↓ or S | Hold Brake |
| Pause a solo race | P or the Pause button | Tap Pause |

Cloudflare Turnstile checks each request to create or join a room. If it asks you to confirm, complete the check in the room menu. Solo play opens directly from the garage.

In an online race, **Leave race** takes you back to the garage. The other frogs keep racing.

## Garage and circuits

There are 15 carts. Cherry Rocket is free. Preview any other cart in the garage and select **Buy** to unlock it for solo and multiplayer races. Try **Petal Pilot** for quick steering, **Midnight Meteor** for the highest top speed, or **Cherry Rocket** for a mix of both. The garage shows each cart’s top speed before you start.

### Shared coins

Frog Racing and Frog Jumper 2D use the same coin balance when you play their GitHub Pages versions on the same device and browser profile. Existing Frog Jumper coins are ready to spend in the garage. Each track has 12 gold coins per lap. Steer through one to add it to your shared balance immediately. In multiplayer, each racer can collect their own copy. Finishing a solo or multiplayer race earns 15 coins for first place, 10 for second or third, and 5 for any other finish. Cart unlocks stay in that browser profile.

| New cart | Coins |
| --- | ---: |
| Acorn Buggy | 20 |
| Dragonfly GT | 75 |
| Comet Cab | 60 |
| Glacier Glide | 85 |
| Volcano Viper | 100 |
| Jupiter Express | 125 |

Choose from **Lily Pond Loop**, **Sunset Canyon**, **Pinecone Pass**, **Firefly Marsh**, and **Frostcap Circuit**. Each has its own turns and hills. On the minimap, the large yellow dot is you.

## Run solo on your computer

With Python 3 installed, run these commands in a terminal:

```sh
git clone https://github.com/coolboy354059/frog-racing.git
cd frog-racing
python -m http.server 8000 --bind 127.0.0.1
```

Then open [the local garage](http://127.0.0.1:8000/). For multiplayer with friends, use the hosted game. The production Worker accepts browser connections from the GitHub Pages origin.

## How the game fits together

| File | What it does |
| --- | --- |
| `index.html` | Garage, room menu, race display, and touch controls |
| `race.js` | Canvas rendering, solo opponents, input, and the multiplayer client |
| `shared.mjs` | Cart stats, circuits, steering, braking, and boosts used by the browser and the server |
| `worker.mjs` | Cloudflare WebSocket connections and a Durable Object for each room. The server moves the carts and decides the online finish order. |
| `wrangler.toml` | Worker name, Durable Object binding, and migration |

GitHub Pages serves the browser game from the repository root. The Cloudflare Worker deploys separately. When changing shared driving physics, update both deployments so solo and multiplayer use the same rules.

## Cloudflare settings

The game page uses Cloudflare Web Analytics for visits and page performance. Open **Web Analytics** in the Cloudflare dashboard and filter by the `/frog-racing/` path when viewing the GitHub Pages hostname.

The multiplayer client uses a public Turnstile site key. The Worker validates each room admission with Siteverify using the `TURNSTILE_SECRET` Worker secret. For a separate deployment, configure the widget for your hostname, set its public key in `race.js`, and set the matching secret with `npx wrangler secret put TURNSTILE_SECRET` before enabling rooms.
