# The problem

You are given a tree $G$ with $N$ vertices and $N-1$ edges.
The vertices are numbered $1$ to $N$, and the edges are numbered $1$ to $N-1$. Edge $i$ connects vertices $u_i$ and $v_i$.

A tree $H$ is called special if it is possible to delete all edges of $H$ by performing the following operation zero or more times.

- Choose an edge connecting two vertices whose current degrees are equal, and delete it.

Find the number of special subtrees of $G$, modulo $998244353$.

Solve $T$ test cases for each input.

A subtree of a tree $G$ is a connected subgraph of $G$.

## Constraints

- $1 \le T \le 10^5$
- $2 \le N \le 3 \times 10^5$
- The sum of $N$ over all test cases is at most $3 \times 10^5$.
- $1 \le u_i < v_i \le N$
- The given graph $G$ is a tree.
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

Each test case $\mathrm{case}_t$ is given in the following format:

```
N
u_1 v_1
u_2 v_2
...
u_{N-1} v_{N-1}
```

## Output

Print $T$ lines in total.
The $t$-th line should contain the answer for the $t$-th test case.

## Sample 1

Input:

```
3
6
1 3
2 3
3 4
4 5
4 6
10
2 6
4 5
3 9
6 8
3 5
6 10
3 7
1 10
2 5
2
1 2
```

Output:

```
15
35
3
```

In the first test case, the $6$ subtrees consisting of one vertex and the $5$ subtrees consisting of two vertices and one edge are special.
Also, the subtree of $G$ consisting of vertices $1,3,4,6$ and edges $1,3,5$ is special, since the operation can be performed to delete edges $3,5,1$ in this order.
