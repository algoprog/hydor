# The problem

You are given positive integers $H$, $W$, and $M$.

Find the number, modulo $998244353$, of $H \times W$ matrices $A$, each of whose elements is an integer between $1$
and $M$ (inclusive), satisfying the following condition.

$$\min_{1\le i\le H}\max_{1\le j\le W}A_{i,j}=\max_{1\le j\le W}\min_{1\le i\le H}A_{i,j}$$

Here, $A_{i,j}$ denotes the element at the $i$-th row and $j$-th column of matrix $A$.

## Constraints

- $1 \le H, W \le 200$
- $1 \le M \le 10^8$
- All input values are integers.

## Input

The input is given in the following format:

```
H W M
```

## Output

Output the answer.

## Sample 1

Input:

```
2 2 3
```

Output:

```
67
```

For example,
$A=\begin{pmatrix} 1 & 2\\ 2 & 3\end{pmatrix}$ satisfies the condition.

- $\min_{1\le i\le H}\max_{1\le j\le W}A_{i,j}=\max_{1\le j\le W}\min_{1\le i\le H}A_{i,j}=2$ holds.

On the other hand, $A=\begin{pmatrix} 1 & 3\\ 3 & 2\end{pmatrix}$ does not satisfy the condition.

- $\min_{1\le i\le H}\max_{1\le j\le W}A_{i,j}=3$, $\max_{1\le j\le W}\min_{1\le i\le H}A_{i,j}=2$.

There are $67$ matrices $A$ satisfying the condition.

## Sample 2

Input:

```
99 82 44353
```

Output:

```
213254234
```
