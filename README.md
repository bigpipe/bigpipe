## pagelet

Each pagelet is a small piece of sandboxed functionality for your webpage. It
communicates with your pagelets over a real-time `engine.io` connection. Each
pagelet has it's own `javascript`, `css` and `html` in a dedicated folder.
kkk

### Key features

- persistent real-time connection with the backend for each pagelet.
- shared and cached resources (db, api etc) between pagelets.
- automatic asset generation and concatination provided by square.
- sandboxed behaviour.
- seperate header & footer handling so they can be send as soon as possible.
