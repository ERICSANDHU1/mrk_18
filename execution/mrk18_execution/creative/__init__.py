"""Creative rendering — the poster compositor that turns a FLUX base image into a
finished, on-brand social creative (headline + logo + palette baked in).

This is the BRIDGE layer while the DGX-1 GPU is not yet serving Qwen-Image (which
renders legible text natively). FLUX can't render text; this deterministic PIL
layer overlays it in the brand's EXACT colours + real logo, so the free creative
looks designed, not "AI-generated". See [[taste-the-brain-feature]] / [[brain-gpu-plan]].
"""
