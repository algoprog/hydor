# Exports lightonai/mDenseOn to ONNX in float32, with a dynamic batch and length, and checks it against PyTorch.
# pip install torch transformers onnx onnxscript onnxruntime   (made with PyTorch 2.15, Transformers 5.22.2)
# python -I onnx_export.py model.onnx
import sys
import numpy as np
import onnxruntime as ort
import torch
from transformers import AutoModel, AutoTokenizer

MODEL = 'lightonai/mDenseOn'
out = sys.argv[1] if len(sys.argv) > 1 else 'onnx/model.onnx'
tok = AutoTokenizer.from_pretrained(MODEL)
# Eager attention: the sliding-window masks become part of the graph.
model = AutoModel.from_pretrained(MODEL, dtype=torch.float32, attn_implementation='eager').eval()


class Encoder(torch.nn.Module):
    def __init__(self, m):
        super().__init__()
        self.m = m

    def forward(self, input_ids, attention_mask):
        return self.m(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state


example = tok(['query: hello world', 'document: ' + 'a longer text that pads the first one ' * 40], padding=True, truncation=True, max_length=512, return_tensors='pt')
batch, seq = torch.export.Dim('batch', min=1, max=1024), torch.export.Dim('seq', min=2, max=8192)
with torch.inference_mode():
    prog = torch.onnx.export(Encoder(model), (example['input_ids'], example['attention_mask']), dynamo=True, input_names=['input_ids', 'attention_mask'], output_names=['last_hidden_state'],
                             dynamic_shapes={'input_ids': {0: batch, 1: seq}, 'attention_mask': {0: batch, 1: seq}}, opset_version=20, external_data=False, optimize=True)
prog.save(out, external_data=False)

# The same CLS vectors as PyTorch, at lengths below and above the 128-token window, alone and in batches.
texts = ['query: how do I ship to the live server', 'document: ' + ' '.join(['The quick brown fox jumps over the lazy dog.'] * 60), 'query: Πώς φτιάχνω μια παρουσίαση;', 'document: ok']
sess = ort.InferenceSession(out, providers=['CPUExecutionProvider'])
for batch_texts in [texts, texts[:1], texts[1:3]]:
    e = tok(batch_texts, padding=True, truncation=True, max_length=512, return_tensors='pt')
    with torch.inference_mode():
        ref = torch.nn.functional.normalize(model(**e).last_hidden_state[:, 0], dim=-1).numpy()
    h = sess.run(None, {'input_ids': e['input_ids'].numpy(), 'attention_mask': e['attention_mask'].numpy()})[0][:, 0]
    h /= np.linalg.norm(h, axis=1, keepdims=True)
    print('cosine to PyTorch:', np.round((h * ref).sum(1), 6).tolist())
