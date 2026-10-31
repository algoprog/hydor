# Writes server/memory/codebook.ts from the levels quant.py fitted (int4-lloydmax-levels.npy, 768 x 16).
# Usage: python -I make_codebook.py OUT_DIR server/memory/codebook.ts
import base64, sys
import numpy as np

levels = np.load(f'{sys.argv[1]}/int4-lloydmax-levels.npy').astype('<f4')
assert levels.shape == (768, 16) and np.all(np.diff(levels, axis=1) > 0), levels.shape
b64 = base64.b64encode(levels.tobytes()).decode()
lines = [b64[i : i + 120] for i in range(0, len(b64), 120)]
with open(sys.argv[2], 'w') as f:
    f.write('// Made by scripts/memory-embeddings/make_codebook.py: do not edit by hand.\n')
    f.write("// lightonai/mDenseOn's 16 levels per dimension for memory's 4-bit vectors (vectors.ts), fitted by\n")
    f.write("// Lloyd-Max on 32,400 texts in the model's nine languages (SQuAD paragraphs and questions from LightOn's\n")
    f.write('// fine-tuning data, none from the benchmarks); see scripts/memory-embeddings/README.md for how they did.\n')
    f.write('export const CODEBOOK = {\n')
    f.write("  model: 'lightonai/mDenseOn',\n  version: 'int4-lm1',\n  dim: 768,\n  bits: 4,\n")
    f.write('  /** Scores are divided by the stored vector\'s length (it is not quite 1 after quantizing). */\n  renorm: true,\n')
    f.write('  /** 768 x 16 float32, little-endian, base64. */\n  levels:\n')
    f.write('\n'.join(f"    '{l}' +" for l in lines[:-1]) + f"\n    '{lines[-1]}',\n")
    f.write('};\n')
print('levels', levels.shape, 'range', float(levels.min()), float(levels.max()), 'bytes', len(b64))
