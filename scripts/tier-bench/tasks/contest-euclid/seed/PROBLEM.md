# The problem

You are given a positive integer $N$ and integers $n, m$ satisfying $0 \leq n < m \leq N$.

The function `f` defined by the following pseudocode computes the greatest common divisor of non-negative integers
$i$ and $j$ by the Euclidean algorithm.

```
function f(i, j)
    if i = 0 then
        return j
    end if
    return f(j mod i, i)
end function
```

Here, $j \bmod i$ denotes the remainder when $j$ is divided by $i$.

Suppose that `f(i, j)` is executed once for every pair of integers $(i, j)$ satisfying $0 \leq i \leq j \leq N$. Find
the number of times `f(n, m)` is called, modulo $998244353$.

More formally, find the integer printed by the following pseudocode, modulo $998244353$.

```
answer ← 0
function f(i, j)
    if (i, j) = (n, m) then
        answer ← answer + 1
    end if
    if i = 0 then
        return j
    end if
    return f(j mod i, i)
end function
for i = 0 to N do
    for j = i to N do
        f(i, j)
    end for
end for
output answer
```

Solve $T$ test cases for each input.

## Constraints

- $1 \leq T \leq 10^5$
- $1 \leq N \leq 10^{18}$
- $0 \leq n < m \leq N$
- The sum of $\left\lfloor \frac{N}{m} \right\rfloor$ over all test cases is at most $10^6$.
- All input values are integers.

## Input

The input is given in the following format:

```
T
case_1
case_2
⋮
case_T
```

Each test case $\mathrm{case}_t$ is given in the following format:

```
N n m
```

## Output

Print $T$ lines in total. The $t$-th line should contain the answer for the $t$-th test case.

## Sample 1

Input:

```
5
5 1 2
233 100 199
1000000 233 234
57306 0 1
57307 0 1
```

Output:

```
4
1
5563182
998216169
25736
```

In the first test case, $(N, n, m) = (5, 1, 2)$.

When `f(2, 3)` is executed, the calls are made in the order `f(2, 3)` → `f(1, 2)` → `f(0, 1)`, so `f(1, 2)` is called
once.

When `f(i, j)` is executed for each of $(i, j) = (1, 2), (2, 3), (2, 5), (3, 5)$, `f(1, 2)` is called once in each case,
so the answer for the first test case is 4.
