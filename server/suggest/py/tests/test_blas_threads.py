import os
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class BlasThreadsTests(unittest.TestCase):
    def test_numpy_products_run_on_one_thread_unless_told(self):
        """The package caps BLAS threads before NumPy loads (four engine threads oversubscribed a 32-thread OpenBLAS)."""
        code = ("import hydor_suggest, os, numpy; "
                "print(os.environ['OPENBLAS_NUM_THREADS'], os.environ['MKL_NUM_THREADS'], os.environ['OMP_NUM_THREADS'])")
        env = {k: v for k, v in os.environ.items() if k not in ('OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS', 'OMP_NUM_THREADS')}
        out = subprocess.run([sys.executable, '-c', code], cwd=HERE, env=env, capture_output=True, text=True, check=True).stdout
        self.assertEqual(out.split(), ['1', '1', '1'])

    def test_a_count_set_outside_is_kept(self):
        """train.py's runs set OMP_NUM_THREADS to their own threads; the package leaves it."""
        code = "import hydor_suggest, os; print(os.environ['OMP_NUM_THREADS'])"
        env = dict(os.environ, OMP_NUM_THREADS='8')
        out = subprocess.run([sys.executable, '-c', code], cwd=HERE, env=env, capture_output=True, text=True, check=True).stdout
        self.assertEqual(out.strip(), '8')


if __name__ == '__main__':
    unittest.main()
