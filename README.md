# Headbands 🃏

An online version of the party game Headbands. Everyone sees your card except you, so ask yes/no questions to figure out who or what you are.

**Play:** https://temp-ship-it-89e475894e7985.github.io/headbands/

## How to play
1. One person clicks **Create a game** and sends the invite link (or the 4-letter code) to friends. Get on a voice call (Discord, FaceTime…).
2. The host picks a **theme** and a **time per turn**, then presses **Start**.
3. Each player is secretly given someone else to pick a word for. You get ideas from the theme, or you can type anything.
4. Everyone sees everyone else's word. Your own card shows **?**.
5. On your turn, ask yes/no questions out loud. When you're done, tap **Pass the turn**. If there's a timer, the turn passes on its own.
6. When someone guesses their word, anyone else taps **Got it** on that person's card. First to guess wins!

## Good to know
- No accounts or downloads. It works in any modern browser on phones and computers.
- The person who created the game is the "host". Their page has to stay open, so if possible host from a computer. If the host refreshes, the game comes back.
- Players who refresh or briefly lose connection rejoin automatically.
- Up to 12 players.

## Changing the word lists
Open `words.js` and edit the lists, or copy a theme block to add a new theme.

## How it works (technical)
A static site with no server of its own. The host's browser keeps the game. Everyone exchanges messages through free public MQTT brokers (EMQX, HiveMQ and Mosquitto test servers) over secure WebSockets, using [MQTT.js](https://github.com/mqttjs/MQTT.js) (MIT licence, bundled in `vendor/`). All three are used at once and duplicate messages are ignored, so the game keeps working if one is down. The host sends each player a copy of the game with their own word hidden.

To test locally with your own MQTT-over-WebSocket brokers on ports 9001 and 9002, add `?local=1` to the URL.
