# Dino Jump

A small runner in the style of the browser dinosaur game. The page runs the physics. Before each move it writes a short English description, and Laya English picks `jump`, `duck`, or `run`.

The checked option, "Tell Laya which moves are safe", matches the public demos: a planner simulates the three actions and tells the model which ones collide. Laya is choosing among those labels. It does not see the canvas. Turn the option off to send only the distance and obstacle name.

If the model picks a move the planner has marked as a collision, the page keeps Laya's probabilities on screen and executes the safe move instead. That count is the shield.

## Run

The English MLX weights already cached on this Mac are used. No download is required.

```bash
virtualvenv venv
source venv/bin/active
pip install -r requirements.txt
python server.py
```

Open http://127.0.0.1:8876

Space or the up arrow jumps. The down arrow ducks. "Play yourself" ignores the model.

## Check

`GET /health` returns `ready: true` after the weights load. The first load takes a few seconds. Each later decision is one local forward pass.
