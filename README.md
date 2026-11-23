# Headbands 🃏

An online version of the party game Headbands. Everyone sees your card except you, so ask yes/no questions to figure out who or what you are.

**Play:** https://temp-ship-it-89e475894e7985.github.io/headbands/

## How to play
1. One person clicks **Create a game** and sends the invite link (or the 4-letter code) to friends. Get on a voice call (Discord, FaceTime…).
2. The host picks a **theme** and a **time per turn**, then presses **Start**.
3. Each player is secretly given someone else and **draws a word on their blank face** with the mouse, or a finger on a phone. The theme offers ideas.
4. Everyone sits around a **3D table** as a mannequin. You see the table from your own seat, so you see everyone's face except your own. Drag to look around, scroll or pinch to zoom, and tap a player to see their face up close.
5. On your turn, ask yes/no questions out loud. When you're done, tap **Pass the turn**. If there's a timer, the turn passes on its own.
6. When someone guesses their word, anyone else taps that player and confirms they guessed it. First to guess wins!

The host can change the turn timer, or switch it off, in the lobby or during a game.

## Good to know
- No accounts or downloads. It works in any modern browser on phones and computers.
- The person who created the game is the "host". Their page has to stay open, so if possible host from a computer. If the host refreshes, the game comes back.
- Players who refresh or briefly lose connection rejoin automatically.
- Up to 12 players.

## Files
- `app.js`: game rules, screens and networking
- `scene3d.js`: the 3D table (uses [three.js](https://threejs.org), MIT licence, bundled in `vendor/`)
- `drawing.js`: the face drawing pad
- `words.js`: themes and word ideas

## Changing the word lists
Open `words.js` and edit the lists, or copy a theme block to add a new theme.

## How it works (technical)
A static site with no server of its own. The host's browser keeps the game. Everyone exchanges messages through free public MQTT brokers (EMQX, HiveMQ and Mosquitto test servers) over secure WebSockets, using [MQTT.js](https://github.com/mqttjs/MQTT.js) (MIT licence, bundled in `vendor/`). All three are used at once and duplicate messages are ignored, so the game keeps working if one is down. The host sends each player a copy of the game with their own word hidden.

To test locally with your own MQTT-over-WebSocket brokers on ports 9001 and 9002, add `?local=1` to the URL.
