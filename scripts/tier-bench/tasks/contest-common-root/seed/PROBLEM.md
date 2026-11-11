# The problem

## Problem

For a permutation $Q$ of $(1,2,\dots,N)$ and a non-negative integer $k$, define a permutation $Q^k$ of $(1,2,\dots,N)$ as follows.

- Let $Q^k$ be the sequence $R=(1,2,\dots,N)$ obtained after performing the following operation $k$ times.
  - For $i = 1,2,\dots,N$, replace $R_i$ with $Q_{R_i}$.

You are given $M$ permutations of $(1,2,\dots,N)$. The $i$-th permutation is $P_i = (P_{i,1},P_{i,2},\dots,P_{i,N})$.

Determine whether there exists a permutation $Q=(Q_1,Q_2,\dots,Q_N)$ of $(1,2,\dots,N)$ satisfying the following condition, and if it exists, find one such $Q$.

- For every integer $i$ satisfying $1 \le i \le M$, there exists a non-negative integer $k$ such that $P_i = Q^k$.

You are given $T$ test cases; solve each of them.

## Constraints

- $1 \le T \le 250000$
- $1 \le N,M \le 500$
- $P_1,P_2,\dots,P_M$ are permutations of $(1,2,\dots,N)$.
- The sum of $NM$ over all test cases is at most $250000$.
- All input values are integers.

## Input

The input is given in the following format:

```
T
case_1
case_2
...
case_T
```

Each test case is given in the following format:

```
N M
P_{1,1} P_{1,2} ... P_{1,N}
P_{2,1} P_{2,2} ... P_{2,N}
...
P_{M,1} P_{M,2} ... P_{M,N}
```

## Output

Output $T$ lines. The $i$-th line should contain the answer to case $i$ in the following format.

If there is no $Q$ satisfying the condition, output `-1`. If one exists, output it in the following format:

```
Q_1 Q_2 ... Q_N
```

If there are multiple $Q$ satisfying the condition, any of them will be accepted.

## Sample Input 1

```
6
3 2
2 3 1
3 1 2
3 2
2 3 1
1 3 2
5 2
1 5 2 4 3
4 2 3 1 5
5 1
4 2 5 1 3
9 4
2 9 7 5 4 3 8 1 6
3 7 2 5 4 1 9 6 8
3 7 2 4 5 1 9 6 8
7 8 9 4 5 2 6 3 1
10 4
9 2 1 4 5 6 8 3 7 10
7 4 9 5 10 2 3 1 8 6
3 4 8 5 10 2 9 7 1 6
1 10 3 6 2 5 7 8 9 4
```

## Sample Output 1

```
3 1 2
-1
4 5 2 1 3
4 2 5 1 3
7 8 9 5 4 2 6 3 1
-1
```

For the first case, for example, $Q=(3,1,2)$ satisfies the condition. Since $Q^0 = (1,2,3)$, $Q^1 = (3,1,2)$, $Q^2 = (2,3,1)$, we have $P_1 = Q^2$, $P_2 = Q^1$, so the condition is satisfied.

For the second case, there is no $Q$ satisfying the condition.
