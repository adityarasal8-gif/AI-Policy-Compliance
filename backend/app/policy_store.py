from __future__ import annotations

import math
import re
import uuid
from collections import Counter
from dataclasses import dataclass

from .models import PolicyReference


TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9'-]{2,}")


SEED_POLICIES = [
    {
        "policy": "HR Confidentiality Handbook",
        "section": "2.4 Compensation Privacy",
        "owner": "HR",
        "text": "Employee salary, bonus, and compensation details must never be shared in public channels or external emails.",
    },
    {
        "policy": "Commercial Communications Policy",
        "section": "4.1 Delivery Commitments",
        "owner": "Legal",
        "text": "Written delivery dates, service guarantees, or refund commitments require legal approval before being sent.",
    },
    {
        "policy": "Customer Data Handling Standard",
        "section": "3.2 External Sharing",
        "owner": "Security",
        "text": "Customer records, credentials, account IDs, and personal data cannot be shared outside approved systems.",
    },
    {
        "policy": "Forward-Looking Statements Guide",
        "section": "1.3 Forecast Disclaimer",
        "owner": "Finance",
        "text": "Any written discussion of future revenue, profit, or market performance must include the approved finance disclaimer.",
    },
]


@dataclass
class PolicyChunk:
    reference: PolicyReference
    vector: Counter[str]


def tokenize(text: str) -> list[str]:
    return [token.lower() for token in TOKEN_RE.findall(text)]


def vectorize(text: str) -> Counter[str]:
    return Counter(tokenize(text))


def cosine(a: Counter[str], b: Counter[str]) -> float:
    if not a or not b:
        return 0
    dot = sum(value * b.get(term, 0) for term, value in a.items())
    norm_a = math.sqrt(sum(value * value for value in a.values()))
    norm_b = math.sqrt(sum(value * value for value in b.values()))
    if not norm_a or not norm_b:
        return 0
    return dot / (norm_a * norm_b)


def chunk_text(text: str, max_words: int = 90) -> list[str]:
    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", text) if part.strip()]
    chunks: list[str] = []
    for paragraph in paragraphs or [text]:
        words = paragraph.split()
        for index in range(0, max(len(words), 1), max_words):
            chunk = " ".join(words[index : index + max_words]).strip()
            if chunk:
                chunks.append(chunk)
    return chunks


class PolicyStore:
    def __init__(self) -> None:
        self._chunks: list[PolicyChunk] = []

    @property
    def chunk_count(self) -> int:
        return len(self._chunks)

    @property
    def references(self) -> list[PolicyReference]:
        return [chunk.reference for chunk in self._chunks]

    def load_seed_policies(self) -> None:
        if self._chunks:
            return
        for policy in SEED_POLICIES:
            self.add_policy_text(
                text=policy["text"],
                policy=policy["policy"],
                section=policy["section"],
                owner=policy["owner"],
            )

    def load_references(self, references: list[PolicyReference]) -> None:
        self._chunks = [PolicyChunk(reference=reference, vector=vectorize(reference.text)) for reference in references]

    def add_policy_text(self, text: str, policy: str, section: str = "Uploaded policy", owner: str = "Compliance", version: int = 1) -> list[PolicyReference]:
        references: list[PolicyReference] = []
        for chunk in chunk_text(text):
            reference = PolicyReference(
                id=f"pol-{uuid.uuid4().hex[:10]}",
                policy=policy,
                section=section,
                owner=owner,
                text=chunk,
                version=version,
            )
            self._chunks.append(PolicyChunk(reference=reference, vector=vectorize(chunk)))
            references.append(reference)
        return references

    def retrieve(self, query: str, top_k: int = 5) -> list[PolicyReference]:
        query_vector = vectorize(query)
        ranked = []
        for chunk in self._chunks:
            if not chunk.reference.enabled:
                continue
            score = cosine(query_vector, chunk.vector)
            if score > 0:
                ranked.append((score, chunk.reference))
        ranked.sort(key=lambda item: item[0], reverse=True)
        return [
            reference.model_copy(update={"score": round(score, 3)})
            for score, reference in ranked[:top_k]
        ]
