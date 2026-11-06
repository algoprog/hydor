# Text from pictures

Reads text in pictures and scanned PDFs on this computer with [RapidOCR](https://github.com/RapidAI/RapidOCR):
photos of letters and forms, screenshots, receipts, signs, and PDFs made by a scanner (pages that are
pictures, with no text to select).

- `ocr_image`: the text of one picture, in reading order (and each line's confidence if asked).
- `ocr_pdf`: the text of a scanned PDF, page by page.

Nothing is sent anywhere. Setting it up installs RapidOCR, ONNX Runtime and pypdfium2 (about 150 MB). It reads on
the graphics card when there is one: on a computer with an NVIDIA GPU, its setup also installs ONNX Runtime's GPU
build with NVIDIA's CUDA and cuDNN libraries (about 2 GB); a Mac's runs it through Core ML. Otherwise, and when
the card fails (it then says why, once), it reads on the CPU.
