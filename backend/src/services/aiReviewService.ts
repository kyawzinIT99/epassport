import OpenAI from 'openai';

export interface AIReviewResult {
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendation: 'APPROVE' | 'REVIEW' | 'REJECT';
  confidence: number;          // 0–100
  summary: string;             // 1–2 sentence overview
  findings: string[];          // specific issues detected
  dataConsistency: string;     // assessment of info coherence
  reviewedAt: string;
}

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export async function runAIReview(
  application: Record<string, any>,
  duplicateCandidates: Record<string, any>[],
  crossMatches: { samePhone: number; sameEmail: number }
): Promise<AIReviewResult> {
  const prompt = `You are a passport fraud detection AI for a government E-Passport system.
Analyze the following passport application and return a structured JSON risk assessment.

## APPLICATION DATA
- Full Name: ${application.full_name}
- Date of Birth: ${application.date_of_birth}
- Gender: ${application.gender}
- Nationality: ${application.nationality}
- Place of Birth: ${application.place_of_birth}
- Address: ${application.address}
- Phone: ${application.phone}
- Email: ${application.email}
- Passport Type: ${application.passport_type}
- Previous Passport No.: ${application.existing_passport_number || 'NOT PROVIDED'}
- Application No.: ${application.application_number}
- Submitted At: ${application.submitted_at}
- Has Photo: ${application.photo_path ? 'Yes' : 'No'}
- Has ID Document: ${application.id_document_path ? 'Yes' : 'No'}

## CROSS-ACCOUNT MATCHES
- Other accounts sharing same phone number: ${crossMatches.samePhone}
- Other accounts sharing same email: ${crossMatches.sameEmail}

## POTENTIAL DUPLICATE APPLICATIONS (from other user accounts)
${duplicateCandidates.length === 0 ? 'None found.' : duplicateCandidates.map((d, i) =>
  `${i + 1}. App# ${d.application_number} | Name: ${d.full_name} | DOB: ${d.date_of_birth} | Email: ${d.user_email} | Prev Passport: ${d.existing_passport_number || 'N/A'} | Status: ${d.status} | Confidence: ${d.confidence}`
).join('\n')}

## TASK
Analyze for:
1. Data consistency (does nationality match place of birth? Is the DOB plausible? Does the name format look genuine?)
2. Duplicate/fraud risk (same person applying with multiple accounts)
3. Suspicious patterns (shared contact info across accounts, missing documents, implausible data)
4. Overall risk level

Respond ONLY with valid JSON in this exact structure (no markdown, no explanation outside JSON):
{
  "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "recommendation": "APPROVE" | "REVIEW" | "REJECT",
  "confidence": <number 0-100>,
  "summary": "<1-2 sentence overview>",
  "findings": ["<finding 1>", "<finding 2>", ...],
  "dataConsistency": "<brief assessment of data coherence>"
}

Rules:
- CRITICAL + REJECT: confirmed same previous passport number on multiple accounts
- HIGH + REJECT: strong duplicate signals or missing critical documents
- MEDIUM + REVIEW: possible duplicate (name+DOB match) or minor inconsistencies
- LOW + APPROVE: clean application, no red flags`;

  const response = await getClient().chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = (response.choices[0].message.content || '').trim();

  // Strip markdown code fences if present
  const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(jsonStr);

  return {
    riskLevel: parsed.riskLevel,
    recommendation: parsed.recommendation,
    confidence: parsed.confidence,
    summary: parsed.summary,
    findings: parsed.findings || [],
    dataConsistency: parsed.dataConsistency || '',
    reviewedAt: new Date().toISOString(),
  };
}
