"""Receipt and statement extraction (US-033, US-033b, US-035).

The quality ladder and everything it needs: the result types, the pure
scoring function, the merge rules, the prompts, the deterministic PDF text
path and the ladder itself (docs/ai/service.md#extraction-quality-ladder).

Two rules hold across every module in this package:

- **No model call here carries a tool.** `tools=[]` on every call, every
  pass, every path. The input is text somebody else wrote, so the component
  that reads it is given nothing to call (D24, SEC-21). This is the
  strongest control in the product and it is one keyword argument; a test
  asserts it on every call the ladder makes.
- **No amount is ever a float.** `Decimal` in, `Decimal` through, a string
  on the wire (D12). `json.loads` is called with `parse_float=Decimal` so a
  number the model wrote without quotes still never becomes a float.
"""
