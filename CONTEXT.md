# Context

The language of Gal's Arcade. Terms only — no implementation, no plans.

## Arcade

The shelf: one page listing every game, a card each. It is the front door players arrive at. The arcade is not a game and holds no gameplay.

## Game

One browser game. Each game lives in its own repo and has its own deployment. `Cranes Game` and `Rail Yard` are games; the arcade is not.

A game is distinct from a **yard** or a **level** inside it. "Marsden Yard" is a place inside Rail Yard, not a game.

## Player

A person who plays a game. Players are the public: anyone, anywhere, uninvited.

A player has no account. They type a name once and their browser remembers it. That name is the whole of their identity: it carries their requests, their votes and their comments.

Gal is a player when he files a request. He is distinguished only by being the person who decides what gets built and sets a request's state, never by how he asks.

## Request

One player asking for one change to one game.

A request has a **kind**, a **state**, the text the player wrote, and the player's name. Nothing else. Requests about the arcade itself are requests too — the arcade counts as the thing being changed.

A request is not a task or a ticket. It is what a player said, in their words.

### Kind

Either **broken** or **wanted**. These are different things, not one thing with a flag: a broken thing is fixed regardless of how many players noticed, while a wanted thing is judged partly by how many players want it.

"This feels wrong" is **wanted**. Nothing is broken; the player wants it different.

### State

A request runs **new** → **in review** → **develop** → **done in production**. **Declined** is the other ending, and can come at any point. All five are visible to players, and only Gal sets them.

**Declined** means Gal will not do it, said out loud and with a reason. A request nobody will ever act on does not sit at **new**.

## Vote

A player's mark on a request, saying they want it too. One vote per browser, held to that by the store rather than trusted to the browser.

A vote is a signal, not a decision. It carries weight on a **wanted** request and little on a **broken** one.

## Board

The public page showing requests, their votes and their discussion. The board is the record: requests, votes and comments live in the board's own store.

The board is not GitHub Issues. GitHub is a place Gal goes when he has decided to build something, and he goes there by hand.

## Ticket

A question on the wayfinding map that has to be answered before the board can be built. A ticket is a decision to make. It is not a request, and players never see one.
