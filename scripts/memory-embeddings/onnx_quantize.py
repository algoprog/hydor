# The 8-bit build: the layers' weights through ONNX Runtime's MatMulNBits (8 bits, blocks of 32, symmetric), and the
# 256k-word table as int8 rows with one float32 scale each, looked up and scaled back with Gather -> Cast -> Mul
# (standard operators). Activations and arithmetic stay float32. Needs ONNX Runtime 1.23+ to run.
# pip install onnx onnxruntime
# python -I onnx_quantize.py model.onnx model_q8.onnx
import sys
import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper
from onnxruntime.quantization.matmul_nbits_quantizer import DefaultWeightOnlyQuantConfig, MatMulNBitsQuantizer

src, dst = sys.argv[1], sys.argv[2]
m = onnx.load(src)
q = MatMulNBitsQuantizer(m, algo_config=DefaultWeightOnlyQuantConfig(block_size=32, is_symmetric=True, bits=8, op_types_to_quantize=('MatMul',), quant_axes=(('MatMul', 0),)))
q.process()
m = q.model.model
g = m.graph
inits = {i.name: i for i in g.initializer}
node = next(n for n in g.node if n.op_type == 'Gather' and n.input[0] in inits and len(inits[n.input[0]].dims) == 2 and inits[n.input[0]].dims[0] > 100000)
table = numpy_helper.to_array(inits[node.input[0]]).astype(np.float32)
scale = np.maximum(np.abs(table).max(axis=1, keepdims=True), 1e-12) / 127.0
rows = np.clip(np.rint(table / scale), -127, 127).astype(np.int8)
name, ids, out = node.input[0], node.input[1], node.output[0]
g.initializer.remove(inits[name])
g.initializer.extend([numpy_helper.from_array(rows, name + '_int8'), numpy_helper.from_array(scale.astype(np.float32), name + '_scale')])
at = list(g.node).index(node)
g.node.remove(node)
for i, n in enumerate([
    helper.make_node('Gather', [name + '_int8', ids], [out + '_q'], axis=0, name='table_gather_int8'),
    helper.make_node('Cast', [out + '_q'], [out + '_f'], to=TensorProto.FLOAT, name='table_cast'),
    helper.make_node('Gather', [name + '_scale', ids], [out + '_s'], axis=0, name='table_gather_scale'),
    helper.make_node('Mul', [out + '_f', out + '_s'], [out], name='table_dequantize'),
]):
    g.node.insert(at + i, n)
onnx.checker.check_model(m)
onnx.save(m, dst)
print('saved', dst)
