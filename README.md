# Pot or Fold (POF)

**A real-time multiplayer PLO5 Pot-or-Fold poker table and 1v1 2-Board Side Game built with React, Express, WebSockets, Redis, and Postgres.**

## Gameplay Rules

### 1. Main Game — Pot or Fold (PLO5)
- Every player posts the configured **Ante** and receives **5 hole cards**.
- The **Flop (3 community cards)** is dealt face-up.
- Starting from the **Button (`D`)**, each player decides to either:
  - **POT**: Match the initial pot to stay in for the Main Pot showdown.
  - **FOLD**: Fold out of the Main Pot and enter the 1v1 **Side Game** with their 5 hole cards.
- **Main Pot Resolution**:
  - **2+ Players Pot**: Turn and River are dealt (5 community cards total). The best 5-card poker hand using **exactly 2 hole cards + 3 community cards** wins the Main Pot.
  - **1 Player Pots**: Wins the Main Pot immediately uncontested.
  - **0 Players Pot**: The Main Pot rolls over into the next hand.

### 2. Side Game — 1v1 Two-Board Showdown
- Every player who folds on the flop plays **1v1 against every other folding player**.
- Using 4 of their 5 hole cards, each folding player builds **two 2-card hands** (High Board & Low Board):
  - **Rank `3` is a Wild Joker** and can represent any rank.
  - **2-Card Board Ranking**: `Pairs (AA > KK > ... > 22) > 82 Special > Baccarat (9 down to 0)`.
- **Hand Tiers & Payout Multipliers (Multiples of Ante)**:
  - **Quads (7x)**: Four of a Kind (auto-beats lower tiers; higher Quads wins if both have Quads).
  - **King Kong (5x)**: `10, J, Q, K` (auto-beats Popo & Normal; pushes against King Kong).
  - **Popo (4x)**: Two Pairs (auto-beats Normal; against another Popo, must win both pairs to win 4x, otherwise Push).
  - **Normal (2x)**: Must strictly win **both** 2-card boards against the opponent to win 2x, otherwise Push.

## Local Development
The creator hosts the table. Only the host can change stakes, manage bots, or
deal a hand. Host duties pass to the next connected participant if the host
leaves. Every human must ready up for each hand; changing the ante revokes
everyone's readiness. CLI players use `next` to confirm their own readiness,
then the host uses `next` again once all players are ready.

Players have 30 seconds to choose POT or FOLD. The server automatically folds an
idle player. Side hands automatically lock after 60 seconds. These deadlines are
saved with room state and continue after reconnecting or restarting the server.
Leaving keeps the player's current-hand obligations and sits them out of future
hands; their accumulated result remains at the table.


```bash
npm install
npm run dev
```

Open `http://localhost:5000`.

## Scripts

```bash
npm run dev       # Start development server
npm run check     # TypeScript typecheck
npm test          # Run unit tests
npm run build     # Build client and server into dist/
npm start         # Run production server
```
