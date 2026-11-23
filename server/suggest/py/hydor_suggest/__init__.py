"""Hydor's word suggestions engine: a small model mixed with Qwen3.5-0.8B (through llama-server), run as a worker and a trainer."""
import os as _os

# The engine shares its work out over the threads it is given (ONNX Runtime's own, and the pieces of the output layer, one
# NumPy product each). A BLAS library that starts its own threads for every product on top of that oversubscribes the
# processor: with OpenBLAS's default of one thread per core, four threads made a suggestion three times slower than one.
# Each product runs on one thread unless the environment says otherwise; this has to happen before NumPy is first
# imported, which is why it is here (the worker and train.py import this package first; train.py's PyTorch threads are
# set with its own --threads and OMP_NUM_THREADS).
for _k in ('OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS', 'OMP_NUM_THREADS'):
    _os.environ.setdefault(_k, '1')
