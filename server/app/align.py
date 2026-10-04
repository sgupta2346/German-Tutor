from dataclasses import dataclass

from .phones import substitution_cost

INSERT_COST = 0.8
DELETE_COST = 1.0


@dataclass(frozen=True)
class Op:
    kind: str
    ref: str | None
    hyp: str | None
    ref_index: int | None
    cost: float


def align(ref: list[str], hyp: list[str], delete_costs: list[float] | None = None) -> list[Op]:
    n, m = len(ref), len(hyp)
    dc = delete_costs or [DELETE_COST] * n
    dist = [[0.0] * (m + 1) for _ in range(n + 1)]
    back = [[""] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        dist[i][0] = dist[i - 1][0] + dc[i - 1]
        back[i][0] = "del"
    for j in range(1, m + 1):
        dist[0][j] = j * INSERT_COST
        back[0][j] = "ins"
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            options = [
                (dist[i - 1][j - 1] + substitution_cost(ref[i - 1], hyp[j - 1]), "sub"),
                (dist[i - 1][j] + dc[i - 1], "del"),
                (dist[i][j - 1] + INSERT_COST, "ins"),
            ]
            dist[i][j], back[i][j] = min(options, key=lambda o: o[0])

    ops: list[Op] = []
    i, j = n, m
    while i > 0 or j > 0:
        move = back[i][j]
        if move == "sub":
            cost = substitution_cost(ref[i - 1], hyp[j - 1])
            ops.append(Op("match" if cost == 0 else "sub", ref[i - 1], hyp[j - 1], i - 1, cost))
            i, j = i - 1, j - 1
        elif move == "del":
            ops.append(Op("del", ref[i - 1], None, i - 1, dc[i - 1]))
            i -= 1
        else:
            ops.append(Op("ins", None, hyp[j - 1], i - 1 if i > 0 else None, INSERT_COST))
            j -= 1
    ops.reverse()
    return ops
