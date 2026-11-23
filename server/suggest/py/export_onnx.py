# Writes the small model's ONNX graph (hydor_suggest/slm.onnx, which the worker runs through ONNX Runtime): needs the `onnx` package, and
# torch only for --check. Run it again when model.py's architecture changes; a model of another configuration needs a graph of its own
# (a release can carry one as slm.onnx, which the worker prefers).
#
#   python export_onnx.py --config <release>/config.json [--out hydor_suggest/slm.onnx]
#   python export_onnx.py --config <release>/config.json --check <release>/model.safetensors     (compares with model.py on random tokens)
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('CUDA_VISIBLE_DEVICES', '')

HERE = os.path.dirname(os.path.abspath(__file__))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--config', required=True, help="a release's config.json (its \"slm\" part is the configuration)")
    ap.add_argument('--out', default=os.path.join(HERE, 'hydor_suggest', 'slm.onnx'))
    ap.add_argument('--check', metavar='SAFETENSORS', help='compare the graph with model.py on these weights (needs torch)')
    a = ap.parse_args()
    import json
    import onnx
    from hydor_suggest.config import config_from_dict
    from hydor_suggest.graph import build, write
    cfg = config_from_dict(json.load(open(a.config, encoding='utf-8'))['slm'])
    model = build(cfg)
    write(model, a.out)
    print(f'{a.out}: {os.path.getsize(a.out)} bytes, {len(model.graph.node)} nodes')
    if a.check:
        from hydor_suggest.checks import compare_with_torch
        worst = compare_with_torch(a.out, cfg, a.check)
        print(f'largest difference from model.py: {worst:.2e}')
        return 0 if worst < 1e-3 else 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
