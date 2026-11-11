# The problem

You are given an integer $N$ that is at least $2$, and $N-1$ integers $C_1, C_2, \dots, C_{N-1}$.

There are $N$ buildings lined up on a number line. The $i$-th building stands at position $i$ and has height $H_i$. It
is known that $(H_1, H_2, \dots, H_N)$ is a permutation of $(1, 2, \dots, N)$, but the specific values of
$H_1, H_2, \dots, H_N$ are not known.

Find the number, modulo $998244353$, of possible sequences $(H_1, H_2, \dots, H_N)$ such that the following condition
holds for all of $x = 1, 2, \dots, N-1$.

- The number of buildings visible from position $x + 0.5$ is $C_x$. Here, the $i$-th building is visible if and only
  if there is no building with height greater than $H_i$ between position $x + 0.5$ and position $i$.

## Constraints

- $2 \le N \le 2 \times 10^5$
- $1 \le C_x \le N$
- All input values are integers.

## Input

The input is given in the following format:

```
N
C_1 C_2 ... C_{N-1}
```

## Output

Output the answer.

## Sample Input 1

```
4
2 2 3
```

## Sample Output 1

```
3
```

For example, $(H_1, H_2, H_3, H_4) = (3, 4, 2, 1)$ satisfies the condition. Indeed,

- For $x = 1$, the buildings visible from position $x + 0.5 = 1.5$ are the first and second buildings; there are
  $2 = C_1$ such buildings.
- For $x = 2$, the buildings visible from position $x + 0.5 = 2.5$ are the second and third buildings; there are
  $2 = C_2$ such buildings.
- For $x = 3$, the buildings visible from position $x + 0.5 = 3.5$ are the second, third, and fourth buildings; there
  are $3 = C_3$ such buildings.

There are three sequences $(H_1, H_2, H_3, H_4)$ satisfying the condition, including this one.

## Sample Input 2

```
3
2 1
```

## Sample Output 2

```
0
```

There may be no sequence $(H_1, H_2, \dots, H_N)$ satisfying the condition.

## Sample Input 3

```
7
3 3 3 3 4 4
```

## Sample Output 3

```
85
```
