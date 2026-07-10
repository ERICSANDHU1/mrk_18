"""Phase-0 verifier for the 4 taster LoRA adapters (TASTER_SETUP.md §0).

Usage:
    python scripts/verify_taster_adapters.py C:\\path\\to\\adapters

Expects <root>/<name>/ for each of usp, differentiation, brand_analysis,
personality — each folder a PEFT export (adapter_config.json +
adapter_model.safetensors). Checks format, base-model agreement, and LoRA
rank, then prints the exact RunPod env values (MAX_LORA_RANK + LORA_MODULES)
ready to paste into the Serverless endpoint.
"""

import json
import sys
from pathlib import Path

ADAPTERS = ("usp", "differentiation", "brand_analysis", "personality")
# HF repo the endpoint will pull each adapter from (upload step, §1)
HF_REPO_TEMPLATE = "<hf-user>/taster-{name}"


def check_adapter(root: Path, name: str) -> tuple[list[str], dict | None]:
    """Returns (problems, parsed adapter_config or None)."""
    problems: list[str] = []
    folder = root / name
    if not folder.is_dir():
        return [f"folder missing: {folder}"], None

    gguf = list(folder.glob("*.gguf"))
    if gguf:
        problems.append(
            f"GGUF file found ({gguf[0].name}) — GGUF does NOT work with vLLM LoRA. "
            "Re-export from the training checkpoint: model.save_pretrained(...)"
        )

    cfg_path = folder / "adapter_config.json"
    if not cfg_path.is_file():
        problems.append(
            "adapter_config.json missing — this is not a PEFT adapter export. If you "
            "only have merged full weights, the adapter is lost; re-save from the "
            "pre-merge training checkpoint."
        )
        return problems, None
    try:
        cfg = json.loads(cfg_path.read_text(encoding="utf-8-sig"))  # tolerate a Windows BOM
    except (json.JSONDecodeError, OSError) as exc:
        problems.append(f"adapter_config.json unreadable: {exc}")
        return problems, None

    peft_type = str(cfg.get("peft_type", "")).upper()
    if peft_type != "LORA":
        problems.append(f"peft_type is {peft_type or 'missing'}, expected LORA")
    if not cfg.get("base_model_name_or_path"):
        problems.append("base_model_name_or_path missing from adapter_config.json")
    if not isinstance(cfg.get("r"), int):
        problems.append("LoRA rank `r` missing from adapter_config.json")

    weights = folder / "adapter_model.safetensors"
    legacy = folder / "adapter_model.bin"
    if weights.is_file():
        mb = weights.stat().st_size / 1_000_000
        if mb > 2000:
            problems.append(
                f"adapter_model.safetensors is {mb:.0f} MB — that looks like MERGED "
                "full weights, not a LoRA adapter (expected ~30-500 MB)"
            )
        elif mb < 1:
            problems.append(f"adapter_model.safetensors is only {mb:.2f} MB — suspicious")
    elif legacy.is_file():
        problems.append(
            "weights are adapter_model.bin (legacy pickle) — works, but re-save as "
            "safetensors: PeftModel.save_pretrained(..., safe_serialization=True)"
        )
    else:
        problems.append("no adapter_model.safetensors (or .bin) found")

    return problems, cfg


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    root = Path(sys.argv[1])
    if not root.is_dir():
        print(f"not a folder: {root}")
        return 2

    all_ok = True
    bases: dict[str, str] = {}
    ranks: dict[str, int] = {}

    for name in ADAPTERS:
        problems, cfg = check_adapter(root, name)
        if problems:
            all_ok = False
            print(f"\n[FAIL] {name}")
            for p in problems:
                print(f"       - {p}")
        else:
            assert cfg is not None
            bases[name] = cfg["base_model_name_or_path"]
            ranks[name] = cfg["r"]
            print(f"\n[ OK ] {name}  (base={bases[name]}, r={ranks[name]}, "
                  f"alpha={cfg.get('lora_alpha')}, targets={cfg.get('target_modules')})")

    if bases and len(set(bases.values())) > 1:
        all_ok = False
        print("\n[FAIL] base-model MISMATCH — all 4 must share one base to share one endpoint:")
        for name, base in bases.items():
            print(f"       {name}: {base}")

    unsloth = {n: b for n, b in bases.items() if b.lower().startswith("unsloth/")}
    if unsloth and len(set(bases.values())) == 1:
        print(
            "\n[NOTE] adapters were trained on an unsloth mirror "
            f"({next(iter(unsloth.values()))}). Serve the official repo instead "
            "(weight-identical), e.g. MODEL_NAME=mistralai/Mistral-7B-Instruct-v0.3."
        )

    print()
    if not all_ok:
        print("=> NOT ready. Fix the items above, then re-run.")
        return 1

    max_rank = max(ranks.values())
    modules = [
        {"name": name, "path": HF_REPO_TEMPLATE.format(name=name.replace("_", "-"))}
        for name in ADAPTERS
    ]
    print("=> ALL 4 ADAPTERS READY. RunPod endpoint env values:")
    print(f"\nMODEL_NAME={next(iter(bases.values()))}")
    print("ENABLE_LORA=true")
    print(f"MAX_LORA_RANK={max_rank}")
    print("MAX_LORAS=4")
    print("MAX_CPU_LORAS=4")
    print(f"LORA_MODULES={json.dumps(modules, separators=(',', ':'))}")
    print("\n(replace <hf-user> after the upload step — TASTER_SETUP.md §1)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
