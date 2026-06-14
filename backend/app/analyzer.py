from __future__ import annotations

import json
import re
import uuid
import os
from typing import Optional

from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate

from .models import ComplianceReport, PolicyReference, Severity, Violation
from .policy_store import PolicyStore


PATTERNS = [
    {
        "id": "customer-data",
        "severity": "high",
        "keywords": ("customer", "account id", "account ids", "contact details", "email", "vendor", "export"),
        "policy_hint": "Customer Data Handling Standard",
        "explanation": "The draft appears to share customer identifiers or personal data through an unapproved external channel.",
        "rewrite": "The customer export has been shared through the approved secure transfer workflow once access is authorized.",
    },
    {
        "id": "legal-commitment",
        "severity": "medium",
        "keywords": ("promise", "guarantee", "refund", "delivery", "commit", "sla"),
        "policy_hint": "Commercial Communications Policy",
        "explanation": "The draft creates a written commitment, guarantee, or refund position that needs legal approval.",
        "rewrite": "Our current target is subject to final confirmation and approved commercial terms.",
    },
    {
        "id": "compensation",
        "severity": "high",
        "keywords": ("salary", "bonus", "compensation", "lpa", "payroll"),
        "policy_hint": "HR Confidentiality Handbook",
        "explanation": "The draft exposes employee compensation details in written communication.",
        "rewrite": "Compensation information is available only through the approved HR system.",
    },
    {
        "id": "forecast",
        "severity": "medium",
        "keywords": ("future revenue", "profit", "market performance", "forecast", "growth target"),
        "policy_hint": "Forward-Looking Statements Guide",
        "explanation": "The draft discusses future financial performance without the approved finance disclaimer.",
        "rewrite": "Forward-looking statements include the approved finance disclaimer before discussing future performance.",
    },
]

POLICY_MATCH_MIN_SCORE = 0.22

# Words that always trigger a high-severity flag when present (sensitive identifiers, secrets)
SENSITIVE_WORDS = (
    "ssn",
    "social security",
    "credit card",
    "card number",
    "password",
    "api key",
    "secret",
)


def rewrite_text_for_compliance(text: str, policy_context: str | None = None) -> str:
    lowered = text.lower().strip()
    context = (policy_context or "").strip()

    if not lowered:
        return ""

    if any(token in lowered for token in SENSITIVE_WORDS):
        return "The sensitive information has been removed and should be shared only through an approved secure channel."

    if any(term in lowered for term in ("customer", "account", "contact details", "email", "vendor", "export")):
        return "The customer information has been moved to the approved secure transfer workflow once the recipient is authorized."

    if any(term in lowered for term in ("salary", "bonus", "compensation", "lpa", "payroll")):
        return "Compensation information is available only through the approved HR system."

    if any(term in lowered for term in ("promise", "guarantee", "refund", "delivery", "commit", "sla")):
        return "Our current target is subject to final confirmation and approved commercial terms."

    if any(term in lowered for term in ("future revenue", "profit", "market performance", "forecast", "growth target")):
        return "Forward-looking statements include the approved finance disclaimer before discussing future performance."

    if context:
        # Prefer producing a concrete, grammatical rewrite rather than echoing policy text.
        # If the original text contains identifiable sensitive fragments, redact them.
        def _redact_sensitive(s: str) -> str:
            # redact emails
            s = re.sub(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", "[redacted]", s)
            # redact long digit sequences (ids, cards, phone numbers)
            s = re.sub(r"\b\d{4,}\b", "[redacted]", s)
            # redact common tokens like ssn, card numbers already handled above but keep safety
            s = re.sub(r"\b(ssn|social security|credit card|card number|api key|secret)\b", "[redacted]", s, flags=re.IGNORECASE)
            # redact urls
            s = re.sub(r"https?://\S+", "[redacted]", s)
            return s

        def _soften_commitments(s: str) -> str:
            # simple hedging replacements to avoid hard promises while keeping grammar
            s = re.sub(r"\bwe will\b", "we expect to", s, flags=re.IGNORECASE)
            s = re.sub(r"\bI will\b", "I plan to", s, flags=re.IGNORECASE)
            s = re.sub(r"\bwill\b", "may", s, flags=re.IGNORECASE)
            s = re.sub(r"\bguarantee(s|d)?\b", "expect", s, flags=re.IGNORECASE)
            return s

        sanitized = _redact_sensitive(text)
        hedged = _soften_commitments(sanitized)
        # If hedged changed the text or redaction applied, return that as the rewrite (preserves sentence grammar)
        if hedged.strip() and hedged.strip() != text.strip():
            return hedged.strip()

        # As a last resort, provide a neutral replacement sentence instead of an instruction.
        return f"This sentence has been revised to comply with the referenced policy ({context[:80]})."

    return f"This message has been revised for compliance: {text.strip()}"


class LLMViolation(BaseModel):
    model_config = {"extra": "ignore"}

    flagged_text: str = Field(
        default="",
        description="Exact text from the user's message that triggered the compliance issue.",
    )
    violated_policy: str | None = Field(
        default=None,
        description=(
            "The exact company policy document and section or clause violated, for example 'IT Security Policy v2, Section 4.1'. "
            "Return null when there is no violation or when the exact policy cannot be named from the provided context."
        ),
    )
    explanation: str = Field(
        default="",
        description="Short, direct explanation of why the text violates the policy.",
    )
    suggested_rewrite: str = Field(
        default="",
        description=(
            "A direct, drop-in replacement for the original text written from the user's first-person perspective. "
            "It must be ready to send immediately and contain no explanations, meta-commentary, or instructions. "
            "Example: if the original text is 'Send me your password', the rewrite should be 'Please share the necessary credentials via our secure enterprise password manager.'"
        ),
    )


class LLMComplianceResult(BaseModel):
    model_config = {"extra": "ignore"}

    is_compliant: bool = False
    violations: list[LLMViolation] = Field(default_factory=list)


def _extract_json(payload: str) -> str | None:
    start = payload.find("{")
    end = payload.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    return payload[start : end + 1]


def _analyze_with_llm(text: str, store: PolicyStore, threshold: float = 0.62, department: str | None = None) -> Optional[ComplianceReport]:
    """Optional LLM-based analysis using Groq when API key is available.
    
    Integrated from legacy backend for enhanced compliance detection.
    Falls back to None if LLM is unavailable, triggering rule-based analysis.
    """
    try:
        from langchain_groq import ChatGroq
        from langchain_core.output_parsers import PydanticOutputParser
    except ImportError:
        return None
    
    llm_api_key = os.getenv("GROQ_API_KEY")
    if not llm_api_key:
        return None
    
    try:
        # Retrieve context from vector store, filtered by the employee's department
        references = store.retrieve(text, top_k=3, department=department)
        contexts = [ref.text for ref in references]
        
        parser = PydanticOutputParser(pydantic_object=LLMComplianceResult)
        format_instructions = parser.get_format_instructions()
        
        policy_context = "\n\n---\n\n".join(contexts) if contexts else "(no policy context available)"
        prompt = ChatPromptTemplate.from_messages([
            (
                "system",
                "You are a strict compliance ghostwriter, not a teacher. "
                "Your job is to detect compliance and policy violations IN THE USER'S TEXT and produce a usable rewrite. "
                "CRITICAL: Do not invent violations for policies that are completely unrelated to the user's text. However, you MUST flag unsafe claims (e.g. 'impossible to hack', '100% guaranteed'), sensitive data sharing, or inappropriate language. "
                "For every violation, populate violated_policy with the exact company policy document and section or clause violated. "
                "If no exact policy can be named from the provided context, set violated_policy to 'General Compliance'. "
                "The suggested_rewrite field must be a direct, drop-in replacement written from the user's first-person perspective. "
                "It must be ready to send immediately and must not contain explanations, meta-commentary, warnings, or instructions about what to do. "
                "Do not flag the policy text itself as a violation, and return only valid JSON that matches the schema."
            ),
            (
                "human",
                "Analyze the following text for compliance violations:\n{text}\n\n"
                "Policy context:\n{policy_context}\n\n"
                "Rules:\n"
                "- ONLY create a violation if the user's text has an issue. If the text is fine, return an empty violations list.\n"
                "- violated_policy must name the policy document and section/clause, or 'General Compliance'.\n"
                "- suggested_rewrite must be a direct, drop-in replacement for the original text.\n"
                "- suggested_rewrite must NOT contain explanations, warnings, or teaching language.\n\n"
                "{format_instructions}"
            ),
        ])
        
        llm = ChatGroq(
            groq_api_key=llm_api_key,
            model_name=os.getenv("GROQ_MODEL_NAME", "llama-3.1-8b-instant"),
            temperature=float(os.getenv("GROQ_TEMPERATURE", "0.1")),
            max_tokens=int(os.getenv("GROQ_MAX_TOKENS", "1024")),
        )
        
        response = llm.invoke(prompt.format_messages(text=text, policy_context=policy_context, format_instructions=format_instructions))
        raw_text = response.content if hasattr(response, "content") else str(response)

        try:
            parsed = parser.parse(raw_text)
        except Exception:
            json_text = _extract_json(raw_text)
            if not json_text:
                raise
            parsed = LLMComplianceResult.model_validate_json(json_text)
        
        # Convert ComplianceResult to ComplianceReport
        violations: list[Violation] = []
        seen_flagged_texts: set[str] = set()
        
        if parsed.violations:
            for v in parsed.violations:
                # Filter out hallucinations using word overlap
                flag_words = set(re.findall(r'\w+', (v.flagged_text or "").lower()))
                text_words = set(re.findall(r'\w+', text.lower()))
                
                # If there are no words, or less than 20% overlap with the original text, it's likely a hallucination
                # unless the flagged text is very short (1-2 words)
                overlap = len(flag_words.intersection(text_words))
                if len(flag_words) > 2 and overlap == 0:
                    continue
                
                # Deduplicate
                normalized_flag = (v.flagged_text or text).lower().strip()
                if normalized_flag in seen_flagged_texts:
                    continue
                seen_flagged_texts.add(normalized_flag)
                
                ref = best_reference(references, v.violated_policy or "")
                
                rewrite = v.suggested_rewrite.strip()
                # Remove common prefixes LLMs like to add despite instructions
                rewrite = re.sub(r"^(Here is the (rewritten text|suggested rewrite|rewrite):?|Suggested rewrite:?|Rewrite:?|Revised text:?)\s*", "", rewrite, flags=re.IGNORECASE)
                # Remove quotes if they wrap the entire string
                if rewrite.startswith('"') and rewrite.endswith('"'):
                    rewrite = rewrite[1:-1].strip()
                v.suggested_rewrite = rewrite
                
                violations.append(
                    Violation(
                        id=f"llm-{uuid.uuid4().hex[:8]}",
                        severity="high", # default for LLM identified
                        confidence=0.85,
                        quote=v.flagged_text or text,
                        policyName=ref.policy,
                        policySection=ref.section,
                        violatedPolicy=v.violated_policy,
                        ruleText=ref.text,
                        explanation=v.explanation,
                        rewrite=v.suggested_rewrite,
                        citation=ref,
                        status="open",
                    )
                )
                
        return ComplianceReport(
            id=f"report-llm-{uuid.uuid4().hex[:10]}",
            score=100 - (len(violations) * 30),
            cleanSections=1 if not violations else 0,
            flaggedSections=len(violations),
            status="blocked" if violations else "ready",
            summary=f"LLM analysis: {len(violations)} issues found." if violations else "Draft is safe.",
            source="backend",
            violations=violations,
            references=references,
        )
    except Exception as e:
        logger.error("LLM analysis failed: %s", e, exc_info=True)
        return None


def split_sentences(text: str) -> list[str]:
    candidates = re.split(r"(?<=[.!?])\s+|\n+", text)
    return [candidate.strip() for candidate in candidates if candidate.strip()]


def best_reference(references: list[PolicyReference], policy_hint: str) -> PolicyReference:
    for reference in references:
        if reference.policy == policy_hint:
            return reference
    if references:
        return references[0]
    return PolicyReference(
        id="unmatched",
        policy=policy_hint,
        section="Policy context",
        owner="Compliance",
        text="No uploaded policy chunk matched. Upload company policies for stronger citations.",
        score=0,
    )


def severity_for_reference(reference: PolicyReference) -> Severity:
    high_markers = ("confidential", "privacy", "security", "customer", "credential", "salary", "compensation")
    marker_text = f"{reference.policy} {reference.section}".lower()
    return "high" if any(marker in marker_text for marker in high_markers) else "medium"


def _generate_safe_rewrite(sentence: str, pattern_keywords: list[str] | tuple[str, ...] | None = None) -> str:
    s = sentence
    # Redact emails
    s = re.sub(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", "[redacted email]", s)
    # Redact digits
    s = re.sub(r"\b\d{4,}\b", "[redacted id]", s)
    # Redact urls
    s = re.sub(r"https?://\S+", "[redacted link]", s)
    
    # Soften language
    s = re.sub(r"\bwe will\b", "we expect to", s, flags=re.IGNORECASE)
    s = re.sub(r"\bI will\b", "I plan to", s, flags=re.IGNORECASE)
    s = re.sub(r"\bwill\b", "may", s, flags=re.IGNORECASE)
    s = re.sub(r"\bguarantees\b", "expects", s, flags=re.IGNORECASE)
    s = re.sub(r"\bguaranteed\b", "expected", s, flags=re.IGNORECASE)
    s = re.sub(r"\bguarantee\b", "expect", s, flags=re.IGNORECASE)
    s = re.sub(r"\bpromises\b", "targets", s, flags=re.IGNORECASE)
    s = re.sub(r"\bpromised\b", "targeted", s, flags=re.IGNORECASE)
    s = re.sub(r"\bpromise\b", "target", s, flags=re.IGNORECASE)
    
    # Redact sensitive words
    for word in SENSITIVE_WORDS:
        s = re.sub(rf"\b{re.escape(word)}\b", "[redacted]", s, flags=re.IGNORECASE)
        
    if pattern_keywords:
        for kw in pattern_keywords:
            replacement = "[redacted]"
            if kw in ("salary", "bonus", "compensation", "lpa", "payroll"):
                replacement = "[confidential]"
            elif kw in ("future revenue", "profit", "market performance", "forecast", "growth target"):
                replacement = "[financials]"
            elif kw in ("customer", "account id", "account ids", "contact details", "email", "vendor", "export"):
                replacement = "[customer data]"
            s = re.sub(rf"\b{re.escape(kw)}\b", replacement, s, flags=re.IGNORECASE)
            
    if s.strip() == sentence.strip():
        return f"[Please revise: {sentence}]"
    return s


def analyze_text(text: str, store: PolicyStore, threshold: float = 0.62, department: str | None = None) -> ComplianceReport:
    sentences = split_sentences(text)
    violations: list[Violation] = []
    references = store.retrieve(text, top_k=8, department=department)
    lowered_text = text.lower()

    # Detect high-sensitivity tokens across entire text and immediately flag.
    for token in SENSITIVE_WORDS:
        if re.search(rf"\b{re.escape(token)}\b", lowered_text):
            # find a sentence containing the token for the quote
            quote = next((s for s in sentences if token in s.lower()), token)
            reference = best_reference(references, "Customer Data Handling Standard")
            violations.append(
                Violation(
                    id=f"sensitive-{uuid.uuid4().hex[:8]}",
                    severity="high",
                    confidence=0.99,
                    quote=quote,
                    policyName=reference.policy,
                    policySection=reference.section,
                    violatedPolicy=f"{reference.policy}, {reference.section}",
                    ruleText=reference.text,
                    explanation=f"Sensitive data or secret token detected: '{token}'. Do not share secrets in messages.",
                    rewrite=_generate_safe_rewrite(quote),
                    citation=reference,
                )
            )
            # Immediately return a blocked report when sensitive data is found
            return ComplianceReport(
                id=f"report-{uuid.uuid4().hex[:10]}",
                score=0,
                cleanSections=0,
                flaggedSections=len(violations),
                status="blocked",
                summary=f"Sensitive token '{token}' detected. Redacted for security.",
                source="backend",
                violations=violations,
                references=references,
            )
    lowered_sentences = [(sentence, sentence.lower()) for sentence in sentences]
    flagged_sentences: set[str] = set()
    
    # Try LLM analysis first if available and not explicitly disabled.
    llm_disabled = os.getenv("ENABLE_LLM_ANALYSIS", "true").lower() in ("false", "0", "no")
    if not llm_disabled:
        llm_report = _analyze_with_llm(text, store, threshold, department=department)
        if llm_report:
            return llm_report

    for pattern in PATTERNS:
        hits: list[str] = []
        for sentence, lowered in lowered_sentences:
            if any(keyword in lowered for keyword in pattern["keywords"]):
                hits.append(sentence)

        if not hits:
            continue

        quote = max(hits, key=len)
        reference = best_reference(references, pattern["policy_hint"])
        keyword_hits = sum(1 for keyword in pattern["keywords"] if keyword in quote.lower())
        retrieval_boost = min(reference.score, 0.22)
        confidence = min(0.98, 0.58 + keyword_hits * 0.08 + retrieval_boost)

        if confidence < threshold:
            continue

        violations.append(
            Violation(
                id=f"{pattern['id']}-{uuid.uuid4().hex[:8]}",
                severity=pattern["severity"],
                confidence=round(confidence, 2),
                quote=quote,
                policyName=reference.policy,
                policySection=reference.section,
                    violatedPolicy=f"{reference.policy}, {reference.section}",
                ruleText=reference.text,
                explanation=pattern["explanation"],
                rewrite=_generate_safe_rewrite(quote, pattern["keywords"]),
                citation=reference,
            )
        )
        flagged_sentences.add(quote)

    # Policy chunk matching: use uploaded policies to flag semantically similar sentences
    for sentence in sentences:
        if sentence in flagged_sentences:
            continue
        sentence_refs = store.retrieve(sentence, top_k=1)
        if not sentence_refs:
            continue
        reference = sentence_refs[0]
        if reference.score < POLICY_MATCH_MIN_SCORE:
            continue

        confidence = min(0.96, 0.5 + reference.score * 1.1)
        violations.append(
            Violation(
                id=f"policy-match-{uuid.uuid4().hex[:8]}",
                severity=severity_for_reference(reference),
                confidence=round(confidence, 2),
                quote=sentence,
                policyName=reference.policy,
                policySection=reference.section,
                    violatedPolicy=f"{reference.policy}, {reference.section}",
                ruleText=reference.text,
                explanation=(
                    f"This sentence appears to overlap with policy guidance in {reference.policy} ({reference.section})."
                ),
                rewrite=_generate_safe_rewrite(sentence),
                citation=reference,
            )
        )
        flagged_sentences.add(sentence)

    flagged = len(violations)
    clean = max(0, len(sentences) - flagged)
    score = max(0, min(100, 100 - flagged * 22 - sum(1 for violation in violations if violation.severity in {"high", "critical"}) * 8))
    status = "blocked" if any(violation.severity in {"high", "critical"} for violation in violations) else "review" if flagged else "ready"

    return ComplianceReport(
        id=f"report-{uuid.uuid4().hex[:10]}",
        score=score,
        cleanSections=clean,
        flaggedSections=flagged,
        status=status,
        summary=(
            f"{flagged} policy issue{'s' if flagged != 1 else ''} detected using {len(references)} retrieved policy references."
            if flagged
            else f"No policy issues detected using {len(references)} retrieved policy references."
        ),
        source="backend",
        violations=violations,
        references=references,
    )
