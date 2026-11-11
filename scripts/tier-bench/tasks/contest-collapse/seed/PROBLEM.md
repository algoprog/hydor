# The problem

You are given integers $N$ and $K$.

For an integer sequence $S$ consisting of integers between $1$ and $K$, inclusive, define its score $f(S)$ as follows.

- Repeat the following operation until all elements of $S$ are equal. The number of times this operation is performed is $f(S)$.
  - Let $|S|$ be the length of $S$ before the operation. For every $i$ satisfying $2 \leq i \leq |S|$ and $S_{i-1} \neq S_i$, simultaneously delete the $i$-th element of $S$. Concatenate the remaining elements in their original order to form the new $S$.

There are $K^N$ integer sequences $S$ of length $N$ consisting of integers between $1$ and $K$, inclusive.

Find the sum of $f(S)$ over all of them, modulo $998244353$.

## Constraints

- $2 \leq N \leq 100$
- $2 \leq K < 998244353$
- All input values are integers.

## Input

The input is given in the following format:

```
N K
```

## Output

Output the answer.

## Sample 1

Input:

```
3 2
```

Output:

```
8
```

The scores of $(1,1,1)$ and $(2,2,2)$ are $0$, and the scores of $(1,2,2)$ and $(2,1,1)$ are $2$. The scores of the other four sequences are $1$, so the sum is $8$.

## Sample 2

Input:

```
6 2
```

Output:

```
126
```

For example, $S=(1,2,2,2,1,2)$ changes as follows, so its score is $3$.

$(1,2,2,2,1,2) \to (1,2,2) \to (1,2) \to (1)$

## Sample 3

Input:

```
2 2
```

Output:

```
2
```

## Sample 4

Input:

```
10 3
```

Output:

```
145002
```

## Sample 5

Input:

```
100 998244352
```

Output:

```
139448523
```
