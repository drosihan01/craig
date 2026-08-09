import type { SessionTurn } from "@/lib/demo-session";

/**
 * Theo and Craig, working out what Calder actually does.
 *
 * The whole argument of this script is in the first reply. Theo hands over
 * three documents that all describe onboarding, and Craig's first useful act
 * is to notice they don't agree — the SOP requires a signature the checklist
 * has no line for, and the offer letter hedges on a check the SOP makes
 * mandatory. Nobody at Calder is being careless. The documents were written
 * eighteen months apart by the same tired person, and no single human has read
 * all three in one sitting since.
 *
 * That's the work. Not summarising a document — reconciling three, naming
 * which one wins, and getting the answer written down somewhere it will be
 * used. It's also why the demo is more thorough than v2: every question Craig
 * asks here has a wrong answer that costs something real, and he says what.
 *
 * Voice, and it's a different voice to the Katalis script.
 *
 * Theo writes properly. Full sentences, capital letters, numbers in them. He
 * answers the question and then answers the one behind it. When he's wrong he
 * says so plainly and immediately — "That's out of date, I'm sorry" — because
 * being wrong in writing is an occupational hazard he's made peace with. He
 * apologises for length. He never uses "just".
 *
 * Craig is the same Craig. Warm, plain, notices things and says them. But the
 * register shifts to meet Theo: with Ada he was reassuring her that scrappy is
 * normal, and here he's telling a careful person which of his own documents to
 * stop trusting. That needs specificity, not comfort — clause numbers, dates,
 * document names. Vagueness reads as flannel to someone who wrote the thing.
 *
 * He still leads with one sentence, then bullets, then at most one line to
 * close. He still never performs concern. If a line could open a consulting
 * deck, it's wrong.
 *
 * Fixture data. Delete it when there's a real model behind the prompt.
 */

export const V3_SESSION: SessionTurn[] = [
  {
    ada: "Calder Diagnostics — we make a benchtop blood analyser and the cartridges that go in it, sold to GP clinics so the patient gets a result in the same appointment. Nine of us in Melbourne. We're ISO 13485, which is the part that matters here: onboarding isn't just courtesy for us, the training record is an auditable artefact and we get audited in March.\n\nI've attached what we have. The induction checklist is what we actually use. SOP-014 is the controlled procedure that governs training records. The offer letter template is for context. Apologies, it's a lot — I'd rather give you too much.\n\nFirst hire through this is Priya, Quality Systems Associate, starts in 10 days. She's on-site and needs lab access.",
    attachment: "3 documents",
    steps: [
      "Reading SOP-014_Training_and_Competency_Rev_C.pdf",
      "Reading Calder_Induction_Checklist_v3.docx",
      "Reading Offer_Letter_Template_2024.docx",
      "Checking the three against each other",
    ],
    craig:
      "Thanks Theo — that's genuinely a good set of documents, and I've read all three. They don't agree with each other, which I think you might already suspect.\n\nThree places they come apart:\n- SOP-014 §5.2 says a training record is signed by the employee and their approver within 5 working days of start. Your induction checklist has no signature line on it at all.\n- The offer letter says a police check \"may be required\". SOP-014 §4.1 makes it a precondition for unsupervised lab access. Those can't both be true for Priya.\n- SOP-014 is Rev C and cites the QMS manual at Rev B. Your manual is on Rev D.\n\nNone of that is carelessness. They were written eighteen months apart and nobody's read all three in one go since.",
    question:
      "So before I build anything: when the checklist and the SOP disagree, which one is Calder actually doing? And is the police check mandatory for Priya, or genuinely optional?",
    replies: [
      "The SOP wins — it's the controlled document and it's what the auditor reads. The checklist is just what we type into a Slack message. And the police check is mandatory; the offer letter is out of date.",
      "SOP-014 is authoritative, the checklist is informal. Police check is required for anyone with lab access, so yes for Priya. I need to fix that offer letter.",
    ],
  },
  {
    ada: "The SOP wins. It's the controlled document, it's what the auditor reads, and the checklist is honestly just what I paste into Slack on someone's first morning. The police check is mandatory for anyone with lab access — the offer letter is out of date and I'll fix it, thank you for catching that.\n\nOne thing I should flag. Police checks here take 5 to 15 business days and she starts in 10 calendar days. I don't think we've ever started one before someone's first day.",
    steps: [
      "Working out the police check timing against her start date",
      "Reading §4.1 again on supervised access",
      "Checking who can supervise",
    ],
    craig:
      "Right, and that timing doesn't work — 10 calendar days is 6 business days, and the check could take 15.\n\nThe good news is §4.1 only gates *unsupervised* access. So she can be in the lab from day one as long as someone trained is with her, which buys you the window. Two things follow:\n- The check has to be started now, not on her first day. It's the only step with a lead time longer than her notice period.\n- Somebody has to actually be there to supervise, and that's the bit I can't assume.\n\nI can see from the checklist that lab induction is Saoirse's, and your handbook mentions she's part-time.",
    question:
      "Which days is Saoirse in? If she's not there on the 24th then Priya's first day is a laptop and a chair, and I'd rather move the induction than have her sat waiting.",
    replies: [
      "Monday, Tuesday and Thursday. The 24th is a Monday so she'll be in, but she's usually wall-to-wall on Mondays — Tuesday would be safer for the induction.",
      "Mon, Tue and Thu. She's in on the 24th but Mondays are her busiest, so put the induction on the Tuesday.",
    ],
  },
  {
    ada: "Monday, Tuesday and Thursday. The 24th is a Monday so she is technically in, but Mondays are her worst day — put the induction on the Tuesday and she'll actually be present for it.\n\nWhile you're asking about people: SOP-014 says the training record is signed by the \"Quality Manager\". We don't have one. I've been acting in the role since we wrote it, which I'm aware is not ideal given Priya is the quality hire.",
    steps: [
      "Looking at §5.2 on approver independence",
      "Checking what the SOP actually requires",
      "Working out what's defensible in March",
    ],
    craig:
      "That's worth being straight about, because it's the one an auditor will pull on.\n\nWhat §5.2 actually says is the approver must be someone other than the employee — it doesn't name a person, it names independence. So you signing Priya's record is fine. What isn't fine is Priya later signing her own, which is exactly where this ends up once she's doing the job.\n\nSo I'll do this:\n- You approve Priya's training record. That's compliant and it's defensible in March.\n- I'll flag the role gap as an open item rather than quietly writing your name into the procedure.\n\nOne more and I'll leave you alone: immunisation. §4.3 references a health screening requirement and I can't tell from these three whether you actually run one.",
    question:
      "Do you collect immunisation or serology status before lab access, or is that clause inherited from wherever the SOP was copied from?",
    replies: [
      "Inherited, I'm afraid. We copied that SOP from my last employer and they handled human samples — we run controls and reagents, no patient blood on site. That clause shouldn't apply to us.",
      "That's inherited. We don't handle patient samples, only controls and reagents, so the screening requirement isn't relevant. I should have removed it.",
    ],
  },
  {
    ada: "Inherited, I'm afraid. We lifted that SOP from my previous employer, who handled patient samples. We only run controls and manufactured reagents — there's no human material on site — so the screening clause doesn't apply to us and I should have struck it. Please leave it out.\n\nI think that's everything I know. What I want is something Priya can be handed on day one that doesn't need me sitting next to her, and that produces a record I can put in front of an auditor without apologising for it.",
    steps: [
      "Putting the order together",
      "Working out what has to start before her first day",
      "Marking what I don't have an answer for",
    ],
    craig:
      "Then I've got what I need, and I'll leave the immunisation clause alone.\n\nHere's the shape of it:\n- Two steps start before day one — the police check, because of the lead time, and her contract.\n- Day one is paperwork and accounts, none of which needs you in the room.\n- Lab induction goes on the Tuesday with Saoirse, and unsupervised access unlocks when the check clears, not on a date.\n- It ends with the training record: her signature, then yours. That's the artefact for March.\n\nTwo things I'll leave open rather than guess at, and I'll tell you exactly what they are.",
    offersWorkflow: true,
  },
];
