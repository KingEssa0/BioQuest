import base64
import json
import os

import anthropic

MODEL = "claude-opus-5"

_client = None


def get_client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    return _client


VERIFY_SCHEMA = {
    "type": "object",
    "properties": {
        "matches": {
            "type": "boolean",
            "description": "True if the photo genuinely shows the requested target.",
        },
        "confidence": {
            "type": "string",
            "enum": ["low", "medium", "high"],
        },
        "facts": {
            "type": "string",
            "description": (
                "2-3 sentences of interesting, accurate facts about what is shown "
                "in the photo (species, behavior, ecology, etc). If it does not "
                "match the target, briefly explain what the photo actually shows instead."
            ),
        },
    },
    "required": ["matches", "confidence", "facts"],
    "additionalProperties": False,
}


def verify_submission(image_bytes: bytes, media_type: str, target: str) -> dict:
    """Ask Claude whether the photo shows `target`, and get facts about it.

    Raises anthropic errors on failure — callers should catch them and
    respond gracefully (see app.py). A short timeout keeps a slow/hung
    request from stalling a live demo indefinitely.
    """
    image_data = base64.standard_b64encode(image_bytes).decode("utf-8")

    response = get_client().with_options(timeout=20.0, max_retries=1).messages.create(
        model=MODEL,
        max_tokens=1024,
        # Simple yes/no classification + a couple sentences of facts doesn't
        # need extended reasoning, and skipping it keeps latency low and
        # predictable for a live demo.
        thinking={"type": "disabled"},
        output_config={"format": {"type": "json_schema", "schema": VERIFY_SCHEMA}},
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_data,
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            f"This photo was submitted for a nature scavenger hunt quest: "
                            f'"find {target}". Does the photo genuinely show {target}? '
                            "Give a few interesting facts about what's shown."
                        ),
                    },
                ],
            }
        ],
    )

    text = next(b.text for b in response.content if b.type == "text")
    return json.loads(text)
