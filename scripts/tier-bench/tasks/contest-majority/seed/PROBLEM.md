# The problem

You are given $N$ strings $S_1, S_2, \ldots, S_N$, each of length $M$ and made of the characters `0` and `1`.
Initially $S_1, S_2, \ldots, S_N$ are written on a blackboard.

You can perform the following operation zero or more times.

- Choose three strings from those written on the blackboard, allowing the same string to be chosen more than once, and call them $A$, $B$, $C$. Write on the blackboard a new string $D$ of length $M$ that satisfies the following condition:
  - For each $i = 1, 2, \ldots, M$, let $A_i, B_i, C_i, D_i$ be the $i$-th characters of $A, B, C, D$. Then $D_i$ is equal to at least two of $A_i, B_i, C_i$.

You are also given $Q$ strings $T_1, T_2, \ldots, T_Q$. For each $i = 1, 2, \ldots, Q$, determine whether it is possible to make $T_i$ be written on the blackboard by performing the operation some number of times, starting from the initial state.

## Constraints

- $1 \leq N \leq 500$
- $1 \leq M \leq 500$
- $1 \leq Q \leq 500$
- $S_i$ is a string of length $M$ consisting of `0` and `1` ($1 \leq i \leq N$).
- $T_i$ is a string of length $M$ consisting of `0` and `1` ($1 \leq i \leq Q$).
- All input values are integers.

## Input

The input is given in the following format:

```
N M Q
S_1
S_2
...
S_N
T_1
T_2
...
T_Q
```

## Output

Output $Q$ lines. The $i$-th line should contain `Yes` if $T_i$ can be written on the blackboard, and `No` otherwise.

## Sample Input 1

```
3 3 2
000
011
101
000
001
```

## Sample Output 1

```
Yes
Yes
```

$T_1$ is written on the blackboard from the beginning.
$T_2$ is `001`. If we perform the operation choosing the three strings `000`, `011`, `101`, we can newly write `001` on the blackboard.

## Sample Input 2

```
2 1 2
0
0
0
1
```

## Sample Output 2

```
Yes
No
```

The strings initially written on the blackboard are both `0`, and the string newly written by the operation is also `0`. Therefore, it is impossible to make `1` be written on the blackboard.
