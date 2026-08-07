/**
 * A scripted session between Ada and Craig.
 *
 * The point of the script is the argument, not the copy: Craig earns his keep
 * by finding what *isn't* written down, not by reformatting what is. Ada gives
 * him a stale handbook and a fast brain-dump; every useful thing he says comes
 * from the gap between those two.
 *
 * Voice matters here and it's easy to get wrong in the same direction twice.
 *
 * Ada: lowercase, fast, run-on, mildly self-deprecating about how scrappy it
 * all is. Heads-down building, not managing HR, and not certain of her own
 * headcount.
 *
 * Her *predicted* replies are the exception — those are written for her, not
 * by her, so they're in proper sentences. Someone picking a suggested answer
 * is putting their name to it; it should read like something they'd be happy
 * to have said.
 *
 * Craig: a friendly neighbour who happens to be good at this, and pleased to
 * be helping. Warm, a bit enthusiastic, plain sentences, contractions, says
 * "honestly" and "ah". He notices things and mentions them; he doesn't analyse
 * them at you. He reassures — most of what Ada is worried about is normal —
 * without ever pretending a real gap isn't one.
 *
 * If a line could open a consulting deck — "two risks, and they're different
 * kinds" — it's wrong. No balanced clauses, no "rather than" constructions, no
 * summarising what he just said.
 *
 * Fixture data. Delete it when there's a real model behind the prompt.
 */

export interface SessionTurn {
  /** What Ada says. Offered as a one-click suggestion so the demo can be driven without typing. */
  ada: string;
  /** Shown as an attachment chip on her message. */
  attachment?: string;
  /** The states Craig moves through before answering. */
  steps: string[];
  /** Craig's reply. Blank lines separate paragraphs. */
  craig: string;
  /** Pulled out of the prose and highlighted, so the ask doesn't get lost in it. */
  question?: string;
  /**
   * Predicted replies for that question.
   *
   * They're phrasings of the same answer, not different answers. The script is
   * linear, so an option that changed what Ada actually said would make Craig's
   * next turn incoherent — and a demo that contradicts itself is worse than one
   * with fewer choices.
   */
  replies?: string[];
  /** Offers the draft workflow at the end of the reply. */
  offersWorkflow?: boolean;
}

export const SESSION: SessionTurn[] = [
  {
    ada: "ok so katalis — we're ai infra. model routing, fallback, cost + latency monitoring for teams running a few providers or self-hosted stuff in prod. basically the boring plumbing so nobody has to hand-roll their own inference layer. team is me, jason (cofounder, technical, owns basically all the infra) and matty who does frontend, contract, maybe 2 days a week? attached the handbook but fair warning i wrote it at 11pm before a fundraise call in feb and haven't touched it since. first hire starts in 2 weeks — nils, infra guy, coming from a much bigger place, like 400 people",
    attachment: "Katalis_Handbook_OLD.pdf",
    steps: [
      "Reading Katalis_Handbook_OLD.pdf",
      "Lining it up with what you just told me",
      "Looking for what isn't written down",
    ],
    craig:
      "Ah brilliant, thanks — had a proper read. Genuinely more than enough to work with, don't worry about the state of it.\n\nCouple of things jumped straight out. Your handbook tells the new person to “figure out who owns what — honestly it's just the three of us right now so ask”. That's the bit that'll trip Nils up. It isn't really a step, it's just Jason.\n\nAnd of the four things on your first-week list, three of them land on Jason too — GitHub, the infra tooling, and whoever knows the answer.\n\nThat matters a bit more than usual coming from a 400-person place. He's used to someone handing him a checklist, and here the checklist says “ask”.",
    question:
      "Two quick ones and I'll have plenty. Is Jason still the only one who can hand out GitHub and AWS? And what actually happens if someone pushes to prod in their first week?",
    replies: [
      "Jason owns all of it — GitHub, AWS, the provider keys. And realistically, they could take routing down for a customer.",
      "All Jason. Prod's the real risk — it would be easy to knock routing over without realising.",
      "Jason holds every key. We've broken prod ourselves before; it's recoverable, but not something you want happening on day three.",
    ],
  },
  {
    ada: "yeah jason owns all of it, github aws the provider keys all of it. i could probably do github at a push but i'd have to ask him where things are which kind of proves your point lol. prod — realistically they'd break routing for someone. we've done it, it's recoverable, but i'd rather they didn't do it on day 3 without knowing what's live and what's fallback",
    steps: [
      "Working out what needs doing before day one",
      "Checking what's stuck behind what",
    ],
    craig:
      "Ah that's really useful, thank you. So you've got two things going on, and the good news is they're not the same problem.\n\nAccess is just a queue. It all goes through Jason, there's no backup, and four later things are sat waiting behind it. That one's easy enough to sort.\n\nProd's the more interesting one. Nothing's actually stopping a new person poking at routing, and the only place “what's safe to touch” lives is in Jason's head.",
    question:
      "One more and then I'll put something together — who's the first person Nils talks to who isn't you or Jason?",
    replies: [
      "Nobody, realistically. Matty's part-time and remote — they'd barely overlap.",
      "There isn't one. Matty's around two days a week, and that's it.",
      "No one. Which is a problem, isn't it.",
    ],
  },
  {
    ada: "...nobody lol. matty i guess but he's part time and remote and i don't think they'd overlap much. that's bad isn't it",
    steps: ["Putting a workflow together"],
    craig:
      "Honestly? Completely normal at three people — I wouldn't lose sleep over it. Worth saying out loud though, especially with Nils nine hours ahead of Jason. “Just ask Jason” is really a two-hour window a day, and someone who won't ask twice will just have a guess instead.\n\nRight — here's what I'd put together. One workflow, engineer, twelve steps. Sounds like a lot; most of it is one account each.\n\nBefore he starts — contract and payroll with you, and get the laptop ordered the day he signs. Two weeks to arrive, so it's really the first thing even though it feels like the last.\n\nAccounts — Google, Slack, GitHub, Linear and AWS, all Jason, all a week out. One step each rather than one big “access” step, because they're five different admin panels and they fail one at a time. Then MFA before any of it gets used properly.\n\nDay one — a short quiz instead of “read the handbook”. Five questions, and whatever he gets wrong opens straight into a chat with me. Reading a doc and having read a doc aren't the same thing, and he's the sort who won't ask twice.\n\nThen half an hour with Jason, first week. That's where the stuff that isn't written down actually gets handed over.\n\nI've stopped it there. Prod access, a thirty-day check-in — those depend on how the first week goes, and guessing at week three is how you end up with a draft nobody trusts about week one.\n\nThree bits I've left open rather than guessing at them: which right-to-work check applies in Germany, which Slack channels he actually needs, and what the quiz reads from — which right now is that February handbook. They'll show as unconfigured so you'll spot them before you publish.\n\nHave a look and change whatever you like — it's only a draft, nothing's live until you say so.",
    offersWorkflow: true,
  },
];

/**
 * Demo v2 — the same product, a solo founder.
 *
 * Ada is on her own here. No Jason, no Matty. That isn't a smaller version of
 * the same story, it's a different and harder one: with a cofounder, a step
 * nobody has written down is at least in *somebody's* head. On your own,
 * everything Craig finds is a thing that exists only in yours, and the hire is
 * the first person who has ever needed it out of there.
 *
 * It also removes a distraction. In v1 half the interesting tension is Jason
 * being a single point of failure, which is a good story and a different one
 * to the product's actual argument. Alone, there's nowhere for the argument to
 * hide.
 *
 * Same voice rules as above.
 */
export const SESSION_V2: SessionTurn[] = [
  {
    ada: "ok so katalis — ai infra. model routing, fallback, cost and latency monitoring for teams running a few providers in prod. basically the boring plumbing so nobody has to hand-roll their own inference layer. it's just me right now. attached the handbook, fair warning i wrote it at 11pm before a fundraise call in feb and haven't opened it since. first hire starts in 2 weeks — nils, infra guy, coming from a much bigger place, like 400 people",
    attachment: "Katalis_Handbook_OLD.pdf",
    steps: [
      "Reading the handbook",
      "Comparing it to what you just said",
      "Working out what's missing",
    ],
    craig:
      "Right, got it. Read the handbook — it's four bullets long under “first week”, which honestly is four more than most people have.\n\nHere's the thing I'd flag, and it's not the handbook. You're on your own, so every single thing Nils needs to know is in your head and nowhere else. That's completely fine at one person. It stops being fine the day there are two, because he's coming from somewhere with four hundred people and a wiki — his instinct when he's stuck won't be to ask, it'll be to go and look. And there's nothing to look at.\n\nSo I'd rather write some of it down as we go than pretend the handbook covers it.",
    question:
      "What's the thing you'd be most annoyed to have to explain twice?",
    replies: [
      "How the routing and fallback layer actually works — it's all in my head.",
      "Which parts are live and which are still stubbed. Nobody could guess it.",
      "Honestly, all of it. That's the problem.",
    ],
  },
  {
    ada: "the routing layer. what's actually live vs what's a stub, and why. it's the only genuinely weird part of the codebase and i'd have to draw it on a whiteboard, which i can't do because he's in berlin",
    steps: ["Noting that", "Checking the time difference"],
    craig:
      "Berlin — so you're nine hours apart. That's about a two-hour overlap on a good day, and you'll be at the end of yours when he's starting his.\n\nThat changes what I'd build. If it were the same timezone I'd just book you a call and be done. It isn't, so anything that only exists in your head has to get out of it before day one, or he'll spend his first week guessing and you'll spend yours answering the same question at 7pm.",
    question: "Are you the only person who'd own any of this?",
    replies: [
      "Yes — there's nobody else to assign anything to.",
      "Just me. That's the whole company at the moment.",
      "Me, until Nils starts. Then hopefully some of it becomes his.",
    ],
  },
  {
    ada: "yep just me. everything's mine until he starts",
    steps: ["Putting a workflow together"],
    craig:
      "Fine — that actually makes this simpler. One person to chase, and it's you.\n\nHere's what I'd put together. Everything before he starts is yours: contract, payroll, the laptop, and his accounts — one step each, because they're five different admin panels and they fail one at a time.\n\nThen day one is his. A short quiz instead of “read the handbook”, because reading a doc and having read a doc aren't the same thing. Whatever he gets wrong opens straight into a chat with me, so you're not the only place answers come from at 7pm.\n\nAnd then half an hour with you, first week. That's where the routing layer gets out of your head.\n\nA few bits I've left open rather than guessing: which right-to-work check applies in Germany, and which Slack channels he actually needs. I'd only be making those up.\n\nGive me a second and I'll write it.",
    offersWorkflow: true,
  },
];
