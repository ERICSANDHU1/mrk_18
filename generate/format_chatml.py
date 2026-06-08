"""Format {input, output} rows into Qwen3 ChatML training text.

Qwen3-32B uses ChatML, NOT the Mistral `<s>[INST]...[/INST]...</s>` format the
reference dataset wrongly used. The skill instruction becomes the system turn,
the brief becomes the user turn, and the JSON output becomes the assistant turn.
"""

import json


def to_chatml(row: dict, system: str) -> dict:
    """Return {"text": "<ChatML training string>"} for one row."""
    user = json.dumps(row["input"], ensure_ascii=False)
    assistant = json.dumps(row["output"], ensure_ascii=False)
    text = (
        f"<|im_start|>system\n{system}<|im_end|>\n"
        f"<|im_start|>user\n{user}<|im_end|>\n"
        f"<|im_start|>assistant\n{assistant}<|im_end|>"
    )
    return {"text": text}


def write_chatml(rows: list[dict], system: str, path: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(to_chatml(row, system), ensure_ascii=False) + "\n")
