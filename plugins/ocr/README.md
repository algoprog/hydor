# Text from pictures

Reads text in pictures and scanned PDFs on this computer with [RapidOCR](https://github.com/RapidAI/RapidOCR):
photos of letters and forms, screenshots, receipts, signs, and PDFs made by a scanner (pages that are
pictures, with no text to select).

- `ocr_image`: the text of one picture, in reading order (and each line's confidence if asked).
- `ocr_pdf`: the text of a scanned PDF, page by page.

Nothing is sent anywhere. Setting it up installs RapidOCR, ONNX Runtime and pypdfium2 (about 200 MB).
