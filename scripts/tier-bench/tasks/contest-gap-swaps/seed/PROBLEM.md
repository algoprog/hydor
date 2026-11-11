# The problem

## Problem

There is a permutation $P$ of $(1,2,\ldots,N)$. You can perform the following operation on $P$.

- Choose integers $i$ and $j$ satisfying $1 \le i < j \le N$. Here, $P_k=k$ must hold for every integer $k$ satisfying $i < k < j$. Then, swap $P_i$ and $P_j$.
  This operation incurs a cost of **1**.

Note that if $i+1=j$, there is no integer $k$ satisfying $i<k<j$, so the operation can always be performed. Therefore, there always exists a sequence of operations that sorts $P$ into ascending order.

Find the minimum total cost required to sort $P$ into ascending order.

## Constraints

- $2 \le N \le 5\times 10^5$
- $1 \le P_i \le N$
- $P$ is a permutation of $(1,2,\ldots,N)$.
- All input values are integers.

## Input

The input is given in the following format:

```
N
P_1 P_2 \ldots P_N
```

## Output

Output the answer.

## Sample 1

Input:

```
6
6 2 3 5 4 1
```

Output:

```
2
```

For example, by performing two operations as follows, $P$ can be sorted into ascending order with a total cost of 2.

- First operation: choose $i=4$, $j=5$, and swap $P_4$, $P_5$. This costs 1.
- Second operation: choose $i=1$, $j=6$, and swap $P_1$, $P_6$. This costs 1.

$P$ cannot be sorted into ascending order with a cost less than 2, so the answer is 2.

## Sample 2

Input:

```
3
1 2 3
```

Output:

```
0
```

The required total cost can be 0.
