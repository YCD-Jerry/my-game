In Between  此间

An open-world exploration game built entirely from scratch with HTML5 / JavaScript / Canvas — no game engine used.

🔗 Play it live: https://ycd-jerry.github.io/my-game/

@ What's this?

In Between is an open-world exploration game set on a 64×64 tile map. Players can wander freely, fish, cook, forage, and hunt for treasure as they explore the world.

This isn't a "30-minute and you're done" kind of game — it's something I want to keep growing. Right now, the map keeps expanding as I develop it, and the gameplay systems are still evolving.

@ Core Gameplay

Open World Exploration — A 64×64 tile map with diverse terrain (grass, water, sand, forests), free movement via WASD

Fishing System — 5 fish species (Grass Carp, Red Carp, Goldfish, Perch, Huso), each with its own difficulty curve and feel. Inspired by Genshin Impact's fishing mechanic, but redesigned: the target zone moves, changes speed, and resizes, turning the act of fishing itself into a real challenge, not just a reaction-time test

Cooking System — Modeled after Genshin Impact's heat-timing mechanic, but reimagined as an arc-shaped progress bar with five-tier judgment (Fail / Undercooked / Normal / Perfect / Burnt). There's also a hidden "Legendary" zone, just 1% of the entire arc, as an easter egg for attentive players (●ˇ∀ˇ●)

Foraging & Inventory — Collectible resources like strawberries and blueberries, paired with an inventory system that supports dropping and organizing items

Treasure Chests — Four rarity tiers (Common / Fancy / Precious / Splendid) scattered across the map, some hidden in spots that require real exploration to find

Achievement System — Themed achievement tracks like "Master Angler," with diamond rewards for completing milestones

Live Map Updates — The game's operator (me) can add or remove trees, chests, and other elements directly through an admin panel, and the changes sync to every player in real time. This means the world keeps getting maintained and expanded rather than going static after launch, so stay tuned!

@ How I Used AI

This project's code was written largely with the help of Claude Code. Here's what I was responsible for:

Every design decision behind each feature, what the fishing system should feel like, how many chest rarity tiers there should be, what the map should look like. These all came from repeated playtesting and iteration on my end (especially the fishing controls)

Breaking down vague ideas into concrete, AI-executable requirements. "Make fishing more challenging" can't be turned into code on its own, I had to first figure out exactly how the target zone should move, how fast, how its width should change, and then hand those specific parameters off to be implemented

Testing, finding bugs, and judging whether a bug actually needed fixing and whether the proposed fix made sense

Overall product judgment, which features were worth building, which to cut, and how to prioritize

What AI handled: Canvas drawing functions for things like the shop, trees, and strawberries, plus animation logic like the tree-shaking effect when chopping wood....

@Tech Stack

Frontend: Vanilla HTML5 / JavaScript / Canvas API (no game engine or frontend framework)

Data Storage: Firebase Firestore (real-time sync for admin map edits) + localStorage (player save data)

Deployment: GitHub Pages

Version Control: Git, with commits tracking every development milestone for easy rollback

@ What's Next?

Keep learning Python and deepen my own skills

Refactor the current codebase from a single file into a modular, multi-file architecture

Add a story/quest system

Replace function-drawn elements with higher-quality tile sets for better visuals（4000+ lines of code for this is crazy)

Improve access stability within China's network environment

If you're curious about the design decisions behind this project, the problems I ran into, or where it's headed next, I'd love to chat, on Slack or in person. \(@^0^@)/
