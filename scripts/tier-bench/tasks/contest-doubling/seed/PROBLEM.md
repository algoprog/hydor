# The problem

## Problem

You are given a sequence of non-negative integers of length $N+1$, $X=(X_1,X_2,\ldots,X_{N+1})$, where $X_{N+1}=0$.

You can perform the following operation.

- Choose an integer $i$ satisfying $1 \leq i \leq N$ and $X_i \geq 1$, subtract $1$ from $X_i$, and add $2$ to $X_{i+1}$.

You are given an integer $K$. For each $k=1,2,\ldots,K$, find the number, modulo $998244353$, of sequences that can result from performing the operation exactly $k$ times on the given sequence.

## Constraints

- $1 \leq N \leq 20$
- $1 \leq K \leq 250000$
- $0 \leq X_i \leq 250000$ ($1 \leq i \leq N$)
- $X_{N+1}=0$
- All input values are integers.

## Input

The input is given in the following format. $X_{N+1}$ is not included in the input.

```
N K
X_1 X_2 ... X_N
```

## Output

Output the answers for $k=1,2,\ldots,K$ in this order, separated by spaces, on a single line.

## Sample Input 1

```
2 5
1 1
```

## Sample Output 1

```
2 1 1 1 0
```

The sequences that can result from performing the operation once are $(0,3,0)$ and $(1,0,2)$, so there are two of them.

The only sequence that can result from performing the operation twice is $(0,2,2)$, so there is one. Multiple orders of operations yield this sequence, but it is counted as one sequence.

## Sample Input 2

```
2 4
1 0
```

## Sample Output 2

```
1 1 1 0
```

The initial sequence is $(1,0,0)$. With each operation, the sequence changes to $(0,2,0)$, $(0,1,2)$, $(0,0,4)$. The operation cannot be performed four times.

## Sample Input 3

```
1 1
0
```

## Sample Output 3

```
0
```

## Sample Input 4

```
3 4
0 0 2
```

## Sample Output 4

```
1 1 0 0
```

## Sample Input 5

```
4 7
1 0 1 0
```

## Sample Output 5

```
2 3 4 4 5 5 5
```
