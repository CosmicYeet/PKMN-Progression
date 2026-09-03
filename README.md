# Pokémon TCG Progression League

A homebrew Pokémon Trading Card Game progression league built for a group of friends.

Everyone begins with **Base Set** and opens the same number of simulated packs. Trainers build decks only from the cards they have personally pulled, play their scheduled matches, and then expand their collection as the league advances chronologically through Pokémon TCG history.

## Visit the League Website

### [Open the Pokémon TCG Progression League →](https://cosmicyeet.github.io/PKMN-Progression/index.html)

The website contains the complete rulebook, weekly schedule, live standings, card pools, scoring system, and era tournament bracket.

## How the League Works

1. **Rip the set** — Each trainer opens the assigned packs using the PokémonCard.io pack simulator.
2. **Record the pulls** — Trainers send their pull links to the Commissioner, who adds them to the league spreadsheet.
3. **Build a deck** — Trainers use their complete accumulated card pool to build a legal 60-card deck in [TCG ONE](https://tcg.one/decks/new).
4. **Play the week** — Each trainer plays two scheduled best-of-three matches.
5. **Advance the progression** — The next set is added and every trainer's available card pool grows.

## League Pages

- **[Rulebook](https://cosmicyeet.github.io/PKMN-Progression/index.html)** — Format rules, deckbuilding restrictions, scoring, set progression, and league procedures.
- **[Standings](https://cosmicyeet.github.io/PKMN-Progression/standings.html)** — Live rankings calculated from completed weekly match scores.
- **[Schedule](https://cosmicyeet.github.io/PKMN-Progression/schedule.html)** — The full Wizards Era rotation and dynamically seeded Era Championship bracket.
- **[Card Pools](https://cosmicyeet.github.io/PKMN-Progression/pools.html)** — Every trainer's cumulative collection, generated from their submitted pull links.

## Match Scoring

| Result | Points |
|---|---:|
| 2–0 victory | 3 |
| 2–1 victory | 2 |
| 1–2 loss | 1 |
| 0–2 loss | 0 |
| Bye | 1.5 |

Standings are calculated automatically from the scores recorded in the league spreadsheet. Ties use match wins and then fewer match losses as tiebreakers.

## Era Championships

At the end of each era, all eight trainers enter a **seeded, single-elimination, best-of-three tournament**. Current standings determine the bracket, and the winner becomes the Era Champion.

## Data and Automation

This is a static GitHub Pages site backed by a Google Sheet.

- Standings and weekly match results are read directly from the spreadsheet.
- The schedule is grouped automatically by week.
- The Commissioner manually runs the **Build card pools** GitHub Actions workflow to process submitted PokémonCard.io pull links. It has no scheduled or push-triggered runs.
- Generated card data is cached and published to `data/pools.json`.
- Card Pools and Deck Builder both use that generated data; removing a trainer from the Standings sheet takes effect there after the data is rebuilt and published.
- Tournament seeding updates dynamically with the standings.
- The Standings sheet defines the active roster. Completed results remain credited to active trainers without adding withdrawn opponents back into standings or tournament seeds.

Website publishing is separate from refreshing card-pool data. Changes should be batched, and GitHub Pages should only be built when the Commissioner explicitly authorizes it.

## Tools

- [PokémonCard.io Pack Simulator](https://pokemoncard.io/pack-sim) — Simulated pack openings
- [TCG ONE](https://tcg.one/) — Deckbuilding and automated online play
- [Official Pokémon TCG Rulebook](https://www.pokemon.com/static-assets/content-assets/cms2/pdf/trading-card-game/rulebook/pbl_rulebook_en.pdf) — Gameplay reference

## Disclaimer

This is a fan-made house-rules project for private play. It is not produced by, endorsed by, sponsored by, or affiliated with Nintendo, The Pokémon Company International, GAME FREAK, or Wizards of the Coast. Pokémon names, card images, set names, and related properties belong to their respective owners.
